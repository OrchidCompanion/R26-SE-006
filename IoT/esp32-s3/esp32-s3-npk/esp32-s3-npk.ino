#include <WiFi.h>
#include <WiFiMulti.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <esp_mac.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// =============================================================================
// HARDWARE PIN DEFINITIONS (ESP32-S3)
// =============================================================================
#define RGB_PIN     48   // Onboard NeoPixel RGB LED
#define LCD_SDA_PIN 1    // I2C Display SDA
#define LCD_SCL_PIN 2    // I2C Display SCL
#define RX_PIN      18   // RS485 MAX485 RO -> ESP32-S3 GPIO 18
#define TX_PIN      17   // RS485 MAX485 DI -> ESP32-S3 GPIO 17

// Physical LED indicator bulbs
#define LED_SYS_PIN 6    // Port 6: System Status (Blinking=Connecting, Solid=Online)
#define LED_ACT_PIN 7    // Port 7: Activity (Turns ON during Modbus read & MQTT publish)

// =============================================================================
// MQTT & NETWORK CONFIGURATION
// Contabo VPS Public IP: 169.58.119.186
// =============================================================================
const char* MQTT_SERVER = "169.58.119.186";
const int   MQTT_PORT   = 1883;
const char* MQTT_USER   = ""; // Leave empty if anonymous
const char* MQTT_PASS   = "";

// TELEMETRY SETTINGS
const unsigned long TELEMETRY_INTERVAL_MS = 60000; // Auto-publish every 60 seconds
unsigned long lastPublishTime = 0;
unsigned long lastBlinkTime   = 0;
bool sysLedState              = false;

// =============================================================================
// GLOBAL OBJECTS & BUFFERS
// =============================================================================
LiquidCrystal_I2C lcd(0x27, 16, 4);
WiFiClient   espClient;
PubSubClient mqttClient(espClient);
WiFiMulti    wifiMulti;

String macAddress     = "";
String telemetryTopic = "";
String statusTopic    = "";
String commandTopic   = "";

// RS485 Modbus RTU Command Arrays (Standard 3-in-1 Soil NPK Sensor, 4800 Baud)
const byte nitroCmd[] = { 0x01, 0x03, 0x00, 0x1e, 0x00, 0x01, 0xe4, 0x0c };
const byte phosCmd[]  = { 0x01, 0x03, 0x00, 0x1f, 0x00, 0x01, 0xb5, 0xcc };
const byte potaCmd[]  = { 0x01, 0x03, 0x00, 0x20, 0x00, 0x01, 0x85, 0xc0 };
byte modbusBuf[11];

// Store-and-Forward Offline Buffer
struct BufferedNPK {
  int nitrogen;
  int phosphorus;
  int potassium;
  bool sensor_ok;
  unsigned long timestamp_offset_ms;
};
#define MAX_BUFFERED_READINGS 10
BufferedNPK offlineBuffer[MAX_BUFFERED_READINGS];
int bufferCount = 0;

// =============================================================================
// RGB LED CONTROLLER (WS2812 NeoPixel on GPIO 48)
// Matches esp32-s3-env.ino unconfusing color scheme
// =============================================================================
void setRGB(uint8_t r, uint8_t g, uint8_t b) {
#ifdef RGB_PIN
  neopixelWrite(RGB_PIN, r, g, b);
#endif
}
void setRGB_Red()        { setRGB(255, 0, 0); }     // Hardware probe fault / Modbus error
void setRGB_Orange()     { setRGB(255, 80, 0); }    // Wi-Fi or MQTT disconnected / retrying
void setRGB_Cyan()       { setRGB(0, 180, 255); }   // Wi-Fi & Network connecting / pairing
void setRGB_Blue()       { setRGB(0, 50, 255); }    // Reading RS485 Modbus sensors
void setRGB_Violet()     { setRGB(180, 0, 255); }   // Packet transmitted to cloud
void setRGB_LimeGreen()  { setRGB(40, 255, 10); }   // Measurement successful
void setRGB_SoftGreen()  { setRGB(0, 80, 0); }      // Normal standby / online idle
void setRGB_Green()      { setRGB_SoftGreen(); }    // Backward-compatible alias
void setRGB_Yellow()     { setRGB_Orange(); }       // Backward-compatible alias
void setRGB_Off()        { setRGB(0, 0, 0); }       // Off

void ledSysOn()       { digitalWrite(LED_SYS_PIN, HIGH); }
void ledSysOff()      { digitalWrite(LED_SYS_PIN, LOW); }
void ledActOn()       { digitalWrite(LED_ACT_PIN, HIGH); }
void ledActOff()      { digitalWrite(LED_ACT_PIN, LOW); }

void flashErrorAct() {
  for (int i = 0; i < 4; i++) {
    ledActOn();  delay(75);
    ledActOff(); delay(75);
  }
}

// LCD UI HELPER FUNCTIONS
void showIdleScreen() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("ORCHID COMPANION");
  lcd.setCursor(0, 1);
  lcd.print("Status: MQTT ONLINE");
  lcd.setCursor(0, 2);
  lcd.print("Node  : " + macAddress.substring(0, 8) + "...");
  lcd.setCursor(0, 3);
  lcd.print("Mode  : SOIL NPK");
}

// =============================================================================
// FORMAT MAC ADDRESS FROM HARDWARE SILICON
// =============================================================================
String getFormattedMacAddress() {
  uint8_t baseMac[6];
  esp_read_mac(baseMac, ESP_MAC_WIFI_STA);
  char cleanMac[13];
  snprintf(cleanMac, sizeof(cleanMac), "%02x%02x%02x%02x%02x%02x",
           baseMac[0], baseMac[1], baseMac[2], baseMac[3], baseMac[4], baseMac[5]);
  return String(cleanMac);
}

// =============================================================================
// RS485 MODBUS RTU SENSOR READING
// =============================================================================
int readModbusRegister(const byte* cmd, size_t cmdSize) {
  memset(modbusBuf, 0, sizeof(modbusBuf));
  while (Serial1.available()) Serial1.read(); // Flush RX buffer

  Serial1.write(cmd, cmdSize);
  Serial1.flush();

  unsigned long startTime = millis();
  while (Serial1.available() < 7 && millis() - startTime < 800) {
    delay(1);
  }

  int bytesRead = 0;
  while (Serial1.available() && bytesRead < 7) {
    modbusBuf[bytesRead] = Serial1.read();
    bytesRead++;
  }

  if (bytesRead < 7) {
    Serial.println("[RS485] Timeout or incomplete response.");
    return -1;
  }

  if (modbusBuf[0] != 0x01 || modbusBuf[1] != 0x03) {
    Serial.println("[RS485] Invalid slave/function code.");
    return -1;
  }

  return (modbusBuf[3] << 8) | modbusBuf[4];
}

int readNitrogen()    { return readModbusRegister(nitroCmd, sizeof(nitroCmd)); }
int readPhosphorus()  { return readModbusRegister(phosCmd, sizeof(phosCmd)); }
int readPotassium()   { return readModbusRegister(potaCmd, sizeof(potaCmd)); }

// =============================================================================
// STORE-AND-FORWARD OFFLINE BUFFER FLUSH
// =============================================================================
void flushOfflineBuffer() {
  if (bufferCount == 0 || !mqttClient.connected()) return;

  Serial.printf("[BUFFER] Flushing %d offline NPK readings to MQTT broker...\n", bufferCount);

  for (int i = 0; i < bufferCount; i++) {
    StaticJsonDocument<256> doc;
    doc["device_id"]    = macAddress;
    doc["module_id"]    = macAddress;
    doc["device_name"]  = "NPK Sensor";
    doc["nitrogen"]     = offlineBuffer[i].nitrogen;
    doc["phosphorus"]   = offlineBuffer[i].phosphorus;
    doc["potassium"]    = offlineBuffer[i].potassium;
    doc["nitrogen_n"]   = offlineBuffer[i].nitrogen;
    doc["phosphorus_p"] = offlineBuffer[i].phosphorus;
    doc["potassium_k"]  = offlineBuffer[i].potassium;
    doc["status"]       = "online";
    doc["online"]       = true;
    doc["sensor_ok"]    = offlineBuffer[i].sensor_ok;
    doc["npk_probe"]    = offlineBuffer[i].sensor_ok;
    doc["buffered"]     = true;

    char jsonBuf[256];
    serializeJson(doc, jsonBuf);

    mqttClient.publish(telemetryTopic.c_str(), jsonBuf);
    mqttClient.publish("orchid/sensors/npk", jsonBuf);
    mqttClient.publish("orchid/telemetry/npk", jsonBuf);
    mqttClient.publish(("orchid/" + macAddress + "/npk").c_str(), jsonBuf);

    delay(100);
  }

  bufferCount = 0;
  Serial.println("[BUFFER] Flush complete.");
  setRGB_Violet();
  delay(300);
  setRGB_SoftGreen();
}

// =============================================================================
// COLLECT AND TRANSMIT NPK SENSOR TELEMETRY
// =============================================================================
void collectAndSendNPK() {
  ledActOn();       // Turn Activity LED ON
  setRGB_Blue();    // Blue: Reading Modbus
  Serial.println("[NPK] Triggering RS485 Modbus read...");

  // Update LCD to indicate reading
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("ORCHID COMPANION");
  lcd.setCursor(0, 1);
  lcd.print("Reading RS485...");
  lcd.setCursor(0, 2);
  lcd.print("Soil NPK Probe");
  lcd.setCursor(0, 3);
  lcd.print("ID: " + macAddress.substring(0, 8) + "...");

  int n = readNitrogen();
  delay(150);
  int p = readPhosphorus();
  delay(150);
  int k = readPotassium();

  bool sensor_ok = (n >= 0 && p >= 0 && k >= 0);

  if (!sensor_ok) {
    Serial.println("[NPK] Probe disconnected or RS485 communication error! Using calibrated fallback.");
    flashErrorAct(); // Fast double-flash to indicate probe communication issue
    setRGB_Red();    // Red: Hardware sensor error
    // Calibrated nominal defaults for Dendrobium
    n = 45;
    p = 25;
    k = 80;
  } else {
    Serial.printf("[NPK] Read Success -> N: %d mg/kg | P: %d mg/kg | K: %d mg/kg\n", n, p, k);
  }

  // Update LCD with latest reading
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.printf("N:%d P:%d K:%d", n, p, k);
  lcd.setCursor(0, 1);
  lcd.print(sensor_ok ? "Probe: OK (mg/kg)" : "Probe: NO SIGNAL");
  lcd.setCursor(0, 2);
  lcd.print("ID: " + macAddress.substring(0, 8) + "...");
  lcd.setCursor(0, 3);
  lcd.print(WiFi.status() == WL_CONNECTED && mqttClient.connected() ? "Status: ONLINE" : "Status: BUFFERED");

  // Publish to MQTT if connected
  if (WiFi.status() == WL_CONNECTED && mqttClient.connected()) {
    flushOfflineBuffer(); // Flush any stored offline measurements first

    ledActOn();
    setRGB_Violet(); // Violet: Transmitting MQTT

    StaticJsonDocument<256> doc;
    doc["device_id"]    = macAddress;
    doc["module_id"]    = macAddress;
    doc["device_name"]  = "NPK Sensor";
    doc["status"]       = "online";
    doc["online"]       = true;
    doc["nitrogen"]     = n;
    doc["phosphorus"]   = p;
    doc["potassium"]    = k;
    doc["nitrogen_n"]   = n;
    doc["phosphorus_p"] = p;
    doc["potassium_k"]  = k;
    doc["sensor_ok"]    = sensor_ok;
    doc["npk_probe"]    = sensor_ok;
    doc["buffered"]     = false;

    char jsonBuffer[256];
    serializeJson(doc, jsonBuffer);

    mqttClient.publish(telemetryTopic.c_str(), jsonBuffer);
    mqttClient.publish("orchid/sensors/npk", jsonBuffer);
    mqttClient.publish("orchid/telemetry/npk", jsonBuffer);
    mqttClient.publish(("orchid/" + macAddress + "/npk").c_str(), jsonBuffer);
    mqttClient.publish(statusTopic.c_str(), jsonBuffer);
    mqttClient.publish(("orchid/" + macAddress + "/status").c_str(), jsonBuffer);

    Serial.print("[MQTT] Telemetry published: ");
    Serial.println(jsonBuffer);

    delay(400);
    ledActOff();

    if (sensor_ok) {
      setRGB_LimeGreen();
      delay(800);
      setRGB_SoftGreen();
    } else {
      setRGB_Red();
      delay(1000);
      setRGB_SoftGreen();
    }
  } else {
    // Save to Offline Store-and-Forward Buffer
    if (bufferCount < MAX_BUFFERED_READINGS) {
      offlineBuffer[bufferCount].nitrogen = n;
      offlineBuffer[bufferCount].phosphorus = p;
      offlineBuffer[bufferCount].potassium = k;
      offlineBuffer[bufferCount].sensor_ok = sensor_ok;
      offlineBuffer[bufferCount].timestamp_offset_ms = millis();
      bufferCount++;
      Serial.printf("[BUFFER] Offline: Buffered NPK reading (%d/%d stored)\n", bufferCount, MAX_BUFFERED_READINGS);
    }
    ledActOff();
    setRGB_Orange();
    delay(800);
  }
}

// =============================================================================
// MQTT INCOMING COMMAND CALLBACK (From Placement / Fertilizer Services)
// =============================================================================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.print("[MQTT] Command received on topic: ");
  Serial.println(topic);

  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) {
    Serial.print("[MQTT] JSON parse error: ");
    Serial.println(err.c_str());
    return;
  }

  const char* action = doc["action"];
  if (!action) return;

  if (strcmp(action, "read_npk") == 0 || 
      strcmp(action, "read_sensors") == 0 || 
      strcmp(action, "read_now") == 0 ||
      strcmp(action, "health_check") == 0 || 
      strcmp(action, "ping") == 0 ||
      strcmp(action, "status") == 0 ||
      strcmp(action, "check_status") == 0) {
    collectAndSendNPK();
  }
}

// =============================================================================
// RECONNECT MQTT CLIENT
// =============================================================================
void reconnectMQTT() {
  while (!mqttClient.connected()) {
    // Blink System LED while attempting to connect
    ledSysOn();
    setRGB_Cyan(); // Cyan: Network connecting
    Serial.print("[MQTT] Connecting to broker at ");
    Serial.print(MQTT_SERVER);
    Serial.print("...");

    String clientId = "ESP32-NPK-" + macAddress;
    bool connected = false;

    if (strlen(MQTT_USER) > 0) {
      connected = mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS);
    } else {
      connected = mqttClient.connect(clientId.c_str());
    }

    if (connected) {
      Serial.println(" CONNECTED!");
      ledSysOn();     // Port 6: Solid ON indicates operational connection
      setRGB_SoftGreen();
      showIdleScreen();

      // Subscribe to module-specific and broadcast command topics
      mqttClient.subscribe(commandTopic.c_str());
      mqttClient.subscribe(("orchid/" + macAddress + "/command").c_str());
      mqttClient.subscribe("orchid/commands/npk");

      // Publish fresh live NPK reading immediately on connect
      collectAndSendNPK();

      // Flush offline readings if any accumulated
      flushOfflineBuffer();
      break;
    } else {
      ledSysOff();
      setRGB_Orange(); // Orange: Network retry
      Serial.printf(" FAILED (rc=%d). Retrying in 4s...\n", mqttClient.state());
      delay(4000);
    }
  }
}

// =============================================================================
// SETUP
// =============================================================================
void setup() {
  Serial.begin(115200);
  delay(500);
  setRGB_Cyan(); // System booting

  // Initialize physical indicator LED pins
  pinMode(LED_SYS_PIN, OUTPUT);
  pinMode(LED_ACT_PIN, OUTPUT);
  ledSysOff();
  ledActOff();

  Serial.println("\n==========================================");
  Serial.println("   ORCHID COMPANION - ESP32-S3 NPK NODE   ");
  Serial.println("==========================================");

  // LCD Setup & I2C Bus Check on GPIO 1 & 2
  Wire.begin(LCD_SDA_PIN, LCD_SCL_PIN);
  delay(100);

  Serial.println("[I2C] Scanning I2C bus on GPIO 1 (SDA) & GPIO 2 (SCL)...");
  int nDevices = 0;
  bool isLcdReady = false;
  for (byte address = 1; address < 127; ++address) {
    Wire.beginTransmission(address);
    byte error = Wire.endTransmission();
    if (error == 0) {
      Serial.printf("[I2C] Device FOUND at address 0x%02X!\n", address);
      nDevices++;
      if (address == 0x27 || address == 0x3F) {
        isLcdReady = true;
      }
    }
  }

  if (isLcdReady) {
    Serial.println("[LCD] Initialized successfully");
  } else {
    Serial.println("[LCD] WARNING: No display detected on GPIO 1 & GPIO 2!");
  }

  lcd.init();
  Wire.begin(LCD_SDA_PIN, LCD_SCL_PIN); // Re-assert custom pins
  lcd.backlight();
  lcd.clear();
  delay(50);
  lcd.setCursor(0, 0);
  lcd.print("ORCHID COMPANION");
  lcd.setCursor(0, 1);
  lcd.print("BOOTING NPK NODE");

  // Initialize RS485 Modbus UART (Serial1 at 4800 baud)
  Serial1.begin(4800, SERIAL_8N1, RX_PIN, TX_PIN);
  Serial.printf("[UART] RS485 initialized on RX=%d, TX=%d @ 4800 baud\n", RX_PIN, TX_PIN);

  // Get true hardware MAC address
  WiFi.mode(WIFI_STA);
  macAddress = getFormattedMacAddress();

  telemetryTopic = "orchid/npk/" + macAddress + "/telemetry";
  statusTopic    = "orchid/npk/" + macAddress + "/status";
  commandTopic   = "orchid/npk/" + macAddress + "/command";

  Serial.println("[SYSTEM] Module ID: " + macAddress);
  Serial.println("[MQTT] Telemetry Topic: " + telemetryTopic);
  Serial.println("[MQTT] Command Topic:   " + commandTopic);

  // Configure Wi-Fi Multi-AP
  wifiMulti.addAP("Galaxy A20s5650", "azdrea7339");
  wifiMulti.addAP("SLT_FIBRE", "0112760972");
  wifiMulti.addAP("Dialog 4G 096", "B6582be1");

  lcd.setCursor(0, 2);
  lcd.print("Connecting WiFi...");
  setRGB_Cyan();
  Serial.print("[Wi-Fi] Connecting to Wi-Fi");

  while (wifiMulti.run() != WL_CONNECTED) {
    // Toggle System LED while connecting
    sysLedState = !sysLedState;
    digitalWrite(LED_SYS_PIN, sysLedState ? HIGH : LOW);
    delay(400);
    Serial.print(".");
  }

  Serial.println("\n[Wi-Fi] Connected! IP: " + WiFi.localIP().toString());
  lcd.setCursor(0, 2);
  lcd.print("WiFi Connected!   ");
  lcd.setCursor(0, 3);
  lcd.print("IP:" + WiFi.localIP().toString().substring(0, 13));

  setRGB_Cyan();

  // Configure MQTT
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(512); // Ensure JSON payloads fit comfortably
  mqttClient.setKeepAlive(60);
  mqttClient.setSocketTimeout(15);

  reconnectMQTT();

  // Execute initial boot telemetry reading
  collectAndSendNPK();
  lastPublishTime = millis();
}

// =============================================================================
// MAIN LOOP
// =============================================================================
void loop() {
  // Check Wi-Fi Connection
  bool isWifiConnected = (WiFi.status() == WL_CONNECTED);
  if (!isWifiConnected) {
    isWifiConnected = (wifiMulti.run() == WL_CONNECTED);
  }

  if (!isWifiConnected) {
    // Blink System LED to indicate Wi-Fi reconnecting
    if (millis() - lastBlinkTime > 500) {
      lastBlinkTime = millis();
      sysLedState = !sysLedState;
      digitalWrite(LED_SYS_PIN, sysLedState ? HIGH : LOW);
    }
    setRGB_Orange();
    delay(50);
    return;
  }

  // Check MQTT Connection
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();

  // Solid System LED when online
  ledSysOn();

  // Scheduled periodic NPK telemetry
  unsigned long now = millis();
  if (now - lastPublishTime >= TELEMETRY_INTERVAL_MS) {
    lastPublishTime = now;
    collectAndSendNPK();
  }
}
