#include <WiFi.h>
#include <WiFiMulti.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <esp_mac.h>

// =============================================================================
// HARDWARE PIN DEFINITIONS (ESP32-S3)
// =============================================================================
#define RGB_PIN     48   // Onboard NeoPixel RGB LED (if present)
#define RX_PIN      18   // RS485 MAX485 RO -> ESP32-S3 GPIO 18
#define TX_PIN      17   // RS485 MAX485 DI -> ESP32-S3 GPIO 17

// Physical LED indicator bulbs (No display on this NPK module)
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

// Store-and-Forward Offline Buffer (like esp32-s3-env.ino)
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
// LED STATUS INDICATORS
// =============================================================================
void setRGB(uint8_t r, uint8_t g, uint8_t b) {
#ifdef RGB_PIN
  neopixelWrite(RGB_PIN, r, g, b);
#endif
}
void setRGB_Red()     { setRGB(255, 0, 0); }      // Disconnected / Fault
void setRGB_Yellow()  { setRGB(255, 180, 0); }    // Searching WiFi / MQTT
void setRGB_Blue()    { setRGB(0, 100, 255); }    // WiFi Connected
void setRGB_Green()   { setRGB(0, 255, 0); }      // Online / Ready
void setRGB_Magenta() { setRGB(255, 0, 255); }    // Modbus Reading Active
void setRGB_White()   { setRGB(255, 255, 255); }  // MQTT Transmitting
void setRGB_Orange()  { setRGB(255, 80, 0); }     // Read Error Warning

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
    doc["device_id"]   = "esp32-npk-" + macAddress;
    doc["module_id"]   = macAddress;
    doc["nitrogen"]    = offlineBuffer[i].nitrogen;
    doc["phosphorus"]  = offlineBuffer[i].phosphorus;
    doc["potassium"]   = offlineBuffer[i].potassium;
    doc["nitrogen_n"]  = offlineBuffer[i].nitrogen;
    doc["phosphorus_p"]= offlineBuffer[i].phosphorus;
    doc["potassium_k"] = offlineBuffer[i].potassium;
    doc["status"]      = offlineBuffer[i].sensor_ok ? "ok" : "fallback";
    doc["sensor_ok"]   = offlineBuffer[i].sensor_ok;
    doc["buffered"]    = true;

    char jsonBuf[256];
    serializeJson(doc, jsonBuf);

    mqttClient.publish(telemetryTopic.c_str(), jsonBuf);
    mqttClient.publish("orchid/sensors/npk", jsonBuf);
    mqttClient.publish("orchid/telemetry/npk", jsonBuf);

    delay(100);
  }

  bufferCount = 0;
  Serial.println("[BUFFER] Flush complete.");
}

// =============================================================================
// COLLECT AND TRANSMIT NPK SENSOR TELEMETRY
// =============================================================================
void collectAndSendNPK() {
  ledActOn();       // Turn Activity LED ON
  setRGB_Magenta(); // Magenta: Reading Modbus
  Serial.println("[NPK] Triggering RS485 Modbus read...");

  int n = readNitrogen();
  delay(150);
  int p = readPhosphorus();
  delay(150);
  int k = readPotassium();

  bool sensor_ok = (n >= 0 && p >= 0 && k >= 0);

  if (!sensor_ok) {
    Serial.println("[NPK] Probe disconnected or RS485 communication error! Using calibrated fallback.");
    flashErrorAct(); // Fast double-flash to indicate probe communication issue
    setRGB_Orange();
    // Calibrated nominal defaults for Dendrobium
    n = 45;
    p = 25;
    k = 80;
  } else {
    Serial.printf("[NPK] Read Success -> N: %d mg/kg | P: %d mg/kg | K: %d mg/kg\n", n, p, k);
  }

  // Publish to MQTT if connected
  if (WiFi.status() == WL_CONNECTED && mqttClient.connected()) {
    flushOfflineBuffer(); // Flush any stored offline measurements first

    ledActOn();
    setRGB_White(); // White: Transmitting MQTT

    StaticJsonDocument<256> doc;
    doc["device_id"]    = "esp32-npk-" + macAddress;
    doc["module_id"]    = macAddress;
    doc["device_name"]  = "NPK Sensor";
    doc["nitrogen"]     = n;
    doc["phosphorus"]   = p;
    doc["potassium"]    = k;
    doc["nitrogen_n"]   = n;
    doc["phosphorus_p"] = p;
    doc["potassium_k"]  = k;
    doc["status"]       = sensor_ok ? "ok" : "fallback";
    doc["sensor_ok"]    = sensor_ok;
    doc["buffered"]     = false;

    char jsonBuffer[256];
    serializeJson(doc, jsonBuffer);

    mqttClient.publish(telemetryTopic.c_str(), jsonBuffer);
    mqttClient.publish("orchid/sensors/npk", jsonBuffer);
    mqttClient.publish("orchid/telemetry/npk", jsonBuffer);

    Serial.print("[MQTT] Telemetry published: ");
    Serial.println(jsonBuffer);

    delay(200);
    ledActOff();
    setRGB_Green();
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

  if (strcmp(action, "read_npk") == 0 || strcmp(action, "read_sensors") == 0 || strcmp(action, "read_now") == 0) {
    collectAndSendNPK();
  } else if (strcmp(action, "health_check") == 0 || strcmp(action, "ping") == 0) {
    ledActOn();
    StaticJsonDocument<128> statusDoc;
    statusDoc["device_id"]   = "esp32-npk-" + macAddress;
    statusDoc["module_id"]   = macAddress;
    statusDoc["device_name"] = "NPK Sensor";
    statusDoc["status"]      = "online";
    statusDoc["online"]      = true;

    char statusBuf[128];
    serializeJson(statusDoc, statusBuf);

    mqttClient.publish(statusTopic.c_str(), statusBuf);
    mqttClient.publish(("orchid/" + macAddress + "/status").c_str(), statusBuf);
    mqttClient.publish("orchid/sensors/npk/status", statusBuf);

    Serial.println("[MQTT] Health check responded: online");
    delay(200);
    ledActOff();
  }
}

// =============================================================================
// RECONNECT MQTT CLIENT
// =============================================================================
void reconnectMQTT() {
  while (!mqttClient.connected()) {
    // Blink System LED while attempting to connect
    ledSysOn();
    setRGB_Yellow();
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
      setRGB_Green();

      // Subscribe to module-specific and broadcast command topics
      mqttClient.subscribe(commandTopic.c_str());
      mqttClient.subscribe(("orchid/" + macAddress + "/command").c_str());
      mqttClient.subscribe("orchid/commands/npk");

      // Publish initial Online Status
      StaticJsonDocument<128> statusDoc;
      statusDoc["device_id"]   = "esp32-npk-" + macAddress;
      statusDoc["module_id"]   = macAddress;
      statusDoc["device_name"] = "NPK Sensor";
      statusDoc["status"]      = "online";
      statusDoc["online"]      = true;

      char statusBuf[128];
      serializeJson(statusDoc, statusBuf);
      mqttClient.publish(statusTopic.c_str(), statusBuf);
      mqttClient.publish(("orchid/" + macAddress + "/status").c_str(), statusBuf);

      // Publish fresh live NPK reading immediately on connect
      collectAndSendNPK();

      // Flush offline readings if any accumulated
      flushOfflineBuffer();
      break;
    } else {
      ledSysOff();
      setRGB_Red();
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

  // Initialize physical indicator LED pins
  pinMode(LED_SYS_PIN, OUTPUT);
  pinMode(LED_ACT_PIN, OUTPUT);
  ledSysOff();
  ledActOff();

  setRGB_Red();
  Serial.println("\n==========================================");
  Serial.println("   ORCHID COMPANION - ESP32-S3 NPK NODE   ");
  Serial.println("==========================================");

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

  setRGB_Yellow();
  Serial.print("[Wi-Fi] Connecting to Wi-Fi");

  while (wifiMulti.run() != WL_CONNECTED) {
    // Toggle System LED while connecting
    sysLedState = !sysLedState;
    digitalWrite(LED_SYS_PIN, sysLedState ? HIGH : LOW);
    delay(400);
    Serial.print(".");
  }

  Serial.println("\n[Wi-Fi] Connected! IP: " + WiFi.localIP().toString());
  setRGB_Blue();

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
    setRGB_Yellow();
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
