#include <WiFi.h>
#include <WiFiMulti.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <BH1750.h>
#include <DHT.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <esp_mac.h>

// PIN DEFINITIONS & HARDWARE CONFIG
#define RGB_PIN 48
#define LCD_SDA_PIN 1
#define LCD_SCL_PIN 2
#define BH1750_SDA_PIN 9
#define BH1750_SCL_PIN 8
#define DHTPIN 5
#define DHTTYPE DHT11

// =============================================================================
// MQTT & NETWORK CONFIGURATION
// Contabo VPS public IP: 169.58.119.186
// =============================================================================
const char* MQTT_SERVER = "169.58.119.186";
const int   MQTT_PORT   = 1883;
const char* MQTT_USER   = ""; // Leave empty if anonymous
const char* MQTT_PASS   = "";

// OBJECTS & GLOBAL INSTANCES
LiquidCrystal_I2C lcd(0x27, 16, 4);
TwoWire I2C_BH1750 = TwoWire(1);
BH1750 lightMeter;
DHT dht(DHTPIN, DHTTYPE);

WiFiClient espClient;
PubSubClient mqttClient(espClient);
WiFiMulti wifiMulti;

String macAddress = "";
String telemetryTopic = "";
String statusTopic = "";
String commandTopic = "";

bool isBh1750Ready = false;

// RGB LED CONTROLLER (WS2812 NeoPixel on GPIO 48)
void setRGB(uint8_t r, uint8_t g, uint8_t b) { neopixelWrite(RGB_PIN, r, g, b); }
void setRGB_Red()        { setRGB(255, 0, 0); }     // Hardware sensor fault
void setRGB_Orange()     { setRGB(255, 80, 0); }    // Wi-Fi or MQTT disconnected / retrying
void setRGB_Cyan()       { setRGB(0, 180, 255); }   // Wi-Fi & Network connecting / pairing
void setRGB_Blue()       { setRGB(0, 50, 255); }    // Reading sensors (active measurement)
void setRGB_Violet()     { setRGB(180, 0, 255); }   // Packet transmitted to cloud
void setRGB_LimeGreen()  { setRGB(40, 255, 10); }   // Measurement successful
void setRGB_SoftGreen()  { setRGB(0, 80, 0); }      // Normal standby / online idle
void setRGB_Green()      { setRGB_SoftGreen(); }    // Backward-compatible alias
void setRGB_Yellow()     { setRGB_Orange(); }       // Backward-compatible alias
void setRGB_Off()        { setRGB(0, 0, 0); }       // Off

// FORMAT MAC ADDRESS FROM HARDWARE SILICON
String getFormattedMacAddress() {
  uint8_t baseMac[6];
  esp_read_mac(baseMac, ESP_MAC_WIFI_STA);
  char cleanMac[13];
  snprintf(cleanMac, sizeof(cleanMac), "%02x%02x%02x%02x%02x%02x",
           baseMac[0], baseMac[1], baseMac[2], baseMac[3], baseMac[4], baseMac[5]);
  String result = String(cleanMac);
  if (result == "000000000000" || result.length() < 12) {
    String mac = WiFi.macAddress();
    mac.replace(":", "");
    mac.toLowerCase();
    if (mac.length() >= 12 && mac != "000000000000") {
      result = mac;
    }
  }
  return result;
}

// LCD UI HELPER FUNCTIONS
// Correct HD44780 DDRAM offsets for 16x4 LCD: row 0=0x00, row 1=0x40, row 2=0x10, row 3=0x50.
void setLcdCursor(uint8_t col, uint8_t row) {
  const uint8_t row_offsets[] = { 0x00, 0x40, 0x10, 0x50 };
  if (row >= 4) row = 3;
  if (col >= 16) col = 15;
  lcd.command(0x80 | (col + row_offsets[row]));
}

// Idle Screen showing Header, Module ID, Connected Wi-Fi Name, and Status
void showIdleScreen() {
  lcd.clear();
  setLcdCursor(0, 0);
  lcd.print("ORCHID COMPANION");

  setLcdCursor(0, 1);
  String idStr = "ID: " + macAddress;
  if (idStr.length() > 16) idStr = idStr.substring(0, 16);
  lcd.print(idStr);

  String ssid = WiFi.SSID();
  if (ssid.length() == 0) ssid = "No Wi-Fi";
  if (ssid.length() > 16) ssid = ssid.substring(0, 16);
  int pad = (16 - (int)ssid.length()) / 2;
  setLcdCursor(pad > 0 ? pad : 0, 2);
  lcd.print(ssid);

  setLcdCursor(1, 3);
  lcd.print("Status: ONLINE");
}

// Submitting to Server screen
void showSubmittingScreen() {
  lcd.clear();
  setLcdCursor(3, 1);
  lcd.print("Submitting");
  setLcdCursor(2, 2);
  lcd.print("to Server...");
}

// Sensor Readings Screen (4 rows: Header + Temp + Humd + LUX)
void showSensorReadingsScreen(float temp, float hum, float lux, bool dht_ok, bool bh_ok) {
  lcd.clear();
  setLcdCursor(0, 0);
  lcd.print("Reading Sensors");

  char line1[17];
  if (dht_ok) {
    snprintf(line1, sizeof(line1), "Temp: %.1f C", temp);
  } else {
    snprintf(line1, sizeof(line1), "Temp: ERROR");
  }
  setLcdCursor(0, 1);
  lcd.print(line1);

  char line2[17];
  if (dht_ok) {
    snprintf(line2, sizeof(line2), "Humd: %.1f %%", hum);
  } else {
    snprintf(line2, sizeof(line2), "Humd: ERROR");
  }
  setLcdCursor(0, 2);
  lcd.print(line2);

  char line3[17];
  if (bh_ok) {
    snprintf(line3, sizeof(line3), "LUX : %.0f lx", lux);
  } else {
    snprintf(line3, sizeof(line3), "LUX : ERROR");
  }
  setLcdCursor(0, 3);
  lcd.print(line3);
}

bool readDHT11(float &temp, float &hum) {
  hum = dht.readHumidity();
  temp = dht.readTemperature();
  if (isnan(hum) || isnan(temp)) {
    Serial.println("[DHT11] Read error!");
    return false;
  }
  return true;
}

float readBH1750() {
  if (!isBh1750Ready) return 280.0;
  float lux = lightMeter.readLightLevel();
  if (lux < 0) {
    Serial.println("[BH1750] Read error, fallback used!");
    return 280.0;
  }
  return lux;
}

// STRUCT FOR OFFLINE STORE-AND-FORWARD BUFFER
struct BufferedReading {
  int sample_index;
  int total_samples;
  float temperature;
  float humidity;
  float lux;
  bool dht_ok;
};

#define MAX_BUFFERED_READINGS 10
BufferedReading readingBuffer[MAX_BUFFERED_READINGS];
int bufferCount = 0;

// AUTONOMOUS SESSION STATE
bool isSessionActive = false;
int sessionSampleIndex = 0;
int sessionTotalSamples = 3;
unsigned long sessionIntervalMs = 14000;
unsigned long sessionStartTime = 0;
unsigned long lastSessionSampleTime = 0;

// FORWARD DECLARATIONS
void flushOfflineBuffer();
void executeSample(int sampleIndex, int totalSamples);
void sendHealthStatus(bool showLcd = false);

// FLUSH OFFLINE BUFFER OVER MQTT
void flushOfflineBuffer() {
  if (bufferCount == 0 || !mqttClient.connected()) return;

  Serial.printf("[BUFFER] Flushing %d stored offline readings to MQTT...\n", bufferCount);

  for (int i = 0; i < bufferCount; i++) {
    StaticJsonDocument<256> doc;
    doc["device_id"] = macAddress;
    doc["module_id"] = macAddress;
    doc["sample_index"] = readingBuffer[i].sample_index;
    doc["total_samples"] = readingBuffer[i].total_samples;
    doc["temperature"] = readingBuffer[i].dht_ok ? round(readingBuffer[i].temperature * 10.0) / 10.0 : 0.0;
    doc["humidity"]    = readingBuffer[i].dht_ok ? round(readingBuffer[i].humidity * 10.0) / 10.0 : 0.0;
    doc["lux"]         = round(readingBuffer[i].lux * 10.0) / 10.0;
    doc["dht_ok"]      = readingBuffer[i].dht_ok;
    doc["buffered"]    = true;

    char jsonBuffer[256];
    serializeJson(doc, jsonBuffer);

    mqttClient.publish(telemetryTopic.c_str(), jsonBuffer);
    mqttClient.publish("orchid/sensors/env", jsonBuffer);

    Serial.printf("[BUFFER] Sent buffered sample %d/%d: %s\n", 
      readingBuffer[i].sample_index, readingBuffer[i].total_samples, jsonBuffer);
    delay(150);
  }

  bufferCount = 0;
  setRGB_Violet();
  delay(600);
  setRGB_SoftGreen();
}

// EXECUTE SENSOR READING (ONLINE OR OFFLINE BUFFERED)
void executeSample(int sampleIndex, int totalSamples) {
  setRGB_Blue();

  float temp = 0.0;
  float hum = 0.0;
  bool dht_ok = readDHT11(temp, hum);
  float lux = readBH1750();
  bool bh_ok = isBh1750Ready;

  Serial.printf("[SAMPLE] Sample %d/%d captured: T=%.1fC, H=%.1f%%, Lux=%.1f\n",
    sampleIndex, totalSamples, temp, hum, lux);

  // Show reading values on 4-row LCD
  showSensorReadingsScreen(temp, hum, lux, dht_ok, bh_ok);
  delay(1800);

  // If online, publish live
  if (WiFi.status() == WL_CONNECTED && mqttClient.connected()) {
    showSubmittingScreen();
    setRGB_Violet();

    flushOfflineBuffer(); // Flush any previously queued readings first

    StaticJsonDocument<256> doc;
    doc["device_id"] = macAddress;
    doc["module_id"] = macAddress;
    doc["sample_index"] = sampleIndex;
    doc["total_samples"] = totalSamples;
    doc["temperature"] = dht_ok ? round(temp * 10.0) / 10.0 : 0.0;
    doc["humidity"]    = dht_ok ? round(hum * 10.0) / 10.0 : 0.0;
    doc["lux"]         = round(lux * 10.0) / 10.0;
    doc["dht_ok"]      = dht_ok;
    doc["dht11"]       = dht_ok;
    doc["bh1750"]      = isBh1750Ready;
    doc["buffered"]    = false;

    char jsonBuffer[256];
    serializeJson(doc, jsonBuffer);

    mqttClient.publish(telemetryTopic.c_str(), jsonBuffer);
    mqttClient.publish("orchid/sensors/env", jsonBuffer);

    Serial.print("[MQTT] Published live sample: ");
    Serial.println(jsonBuffer);

    // Lime Green (success confirmation) -> Soft Green (idle)
    setRGB_LimeGreen();
    delay(800);
    setRGB_SoftGreen();
    showIdleScreen();
  } else {
    // OFFLINE: Store in RAM buffer so data is never lost
    if (bufferCount < MAX_BUFFERED_READINGS) {
      readingBuffer[bufferCount].sample_index = sampleIndex;
      readingBuffer[bufferCount].total_samples = totalSamples;
      readingBuffer[bufferCount].temperature = temp;
      readingBuffer[bufferCount].humidity = hum;
      readingBuffer[bufferCount].lux = lux;
      readingBuffer[bufferCount].dht_ok = dht_ok;
      bufferCount++;
      Serial.printf("[BUFFER] OFFLINE: Queued sample %d/%d to memory (%d buffered)\n",
        sampleIndex, totalSamples, bufferCount);
    }

    lcd.clear();
    setLcdCursor(0, 1);
    lcd.print("OFFLINE:BUFFERED");

    setRGB_Orange();
    delay(1500);
    showIdleScreen();
  }
}

// REPORT COMPREHENSIVE SENSOR HEALTH STATUS & TELEMETRY
void sendHealthStatus(bool showLcd) {
  if (showLcd) {
    setRGB_Blue();
  }

  float temp = 0.0;
  float hum = 0.0;
  bool dht_ok = readDHT11(temp, hum);
  float lux = readBH1750();
  bool bh_ok = isBh1750Ready;

  if (showLcd) {
    showSensorReadingsScreen(temp, hum, lux, dht_ok, bh_ok);
    delay(1800);
    showSubmittingScreen();
    setRGB_Violet();
  }

  StaticJsonDocument<256> statusDoc;
  statusDoc["device_id"]   = macAddress;
  statusDoc["module_id"]   = macAddress;
  statusDoc["device_name"] = "ENV Sensor";
  statusDoc["status"]      = "online";
  statusDoc["online"]      = true;
  statusDoc["dht11"]       = dht_ok;
  statusDoc["dht_ok"]      = dht_ok;
  statusDoc["bh1750"]      = bh_ok;
  statusDoc["temperature"] = dht_ok ? round(temp * 10.0) / 10.0 : 0.0;
  statusDoc["humidity"]    = dht_ok ? round(hum * 10.0) / 10.0 : 0.0;
  statusDoc["lux"]         = round(lux * 10.0) / 10.0;

  char statusBuf[256];
  serializeJson(statusDoc, statusBuf);

  mqttClient.publish(statusTopic.c_str(), statusBuf);
  mqttClient.publish(telemetryTopic.c_str(), statusBuf);
  mqttClient.publish("orchid/sensors/env", statusBuf);

  Serial.printf("[STATUS] Responded: DHT11=%s (T=%.1fC, H=%.1f%%), BH1750=%s (Lux=%.1f)\n",
    dht_ok ? "OPERATIONAL" : "NO_SIGNAL", temp, hum,
    bh_ok ? "OPERATIONAL" : "NO_SIGNAL", lux);

  if (showLcd) {
    setRGB_LimeGreen();
    delay(800);
    setRGB_SoftGreen();
    showIdleScreen();
  } else {
    setRGB_Violet();
    delay(400);
    setRGB_SoftGreen();
  }
}

// PUBLISH SENSOR TELEMETRY OVER MQTT (Single Trigger)
void publishSensorData() {
  executeSample(1, 1);
}

// START AUTONOMOUS MULTI-SAMPLE SESSION
void startSession(int samples, int intervalSec) {
  isSessionActive = true;
  sessionTotalSamples = samples > 0 ? samples : 3;
  sessionIntervalMs = (intervalSec > 0 ? intervalSec : 14) * 1000UL;
  sessionSampleIndex = 1;
  sessionStartTime = millis();
  lastSessionSampleTime = sessionStartTime;

  Serial.printf("[SESSION] Starting 30-sec session (%d samples): Sample 1 (1s), Sample 2 (20s), Sample 3 (28s)...\n",
    sessionTotalSamples);

  // Sample 1: Immediate read at 1st second
  executeSample(sessionSampleIndex, sessionTotalSamples);
}

// MQTT INCOMING MESSAGE CALLBACK
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.print("[MQTT] Message arrived on topic: ");
  Serial.println(topic);

  StaticJsonDocument<256> doc;
  deserializeJson(doc, payload, length);

  const char* action = doc["action"];
  if (action) {
    if (strcmp(action, "health_check") == 0 || 
        strcmp(action, "ping") == 0 || 
        strcmp(action, "status") == 0 ||
        strcmp(action, "check_status") == 0) {
      setRGB_Violet();
      lcd.clear();
      setLcdCursor(0, 0);
      lcd.print("ORCHID COMPANION");
      setLcdCursor(1, 1);
      lcd.print("Ping Received");
      setLcdCursor(1, 2);
      lcd.print("Status: ONLINE");
      setLcdCursor(2, 3);
      lcd.print("Sensors: READY");

      sendHealthStatus(false);

      delay(1500);
      setRGB_SoftGreen();
      showIdleScreen();
    } else if (strcmp(action, "start_session") == 0) {
      int samples = doc["samples"] | 3;
      int interval = doc["interval_sec"] | 14;
      startSession(samples, interval);
    } else if (strcmp(action, "read_now") == 0 || 
               strcmp(action, "read_sensors") == 0 || 
               strcmp(action, "read_ambient") == 0) {
      sendHealthStatus(true);
    }
  }
}

// RECONNECT TO MQTT BROKER
void reconnectMQTT() {
  while (!mqttClient.connected()) {
    setRGB_Cyan();
    Serial.print("[MQTT] Connecting to broker...");

    // 6. "Connecting to Server"
    lcd.clear();
    setLcdCursor(1, 1);
    lcd.print("Connecting to");
    setLcdCursor(3, 2);
    lcd.print("Server...");

    String clientId = "ESP32-ENV-" + macAddress;

    bool connected = false;
    if (strlen(MQTT_USER) > 0) {
      connected = mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS);
    } else {
      connected = mqttClient.connect(clientId.c_str());
    }

    if (connected) {
      Serial.println(" CONNECTED!");
      setRGB_SoftGreen();

      // 7. "Connection Successful"
      lcd.clear();
      setLcdCursor(3, 1);
      lcd.print("Connection");
      setLcdCursor(3, 2);
      lcd.print("Successful");
      delay(1500);

      // 8. Idle Screen
      showIdleScreen();

      // Subscribe to command topics
      mqttClient.subscribe(commandTopic.c_str());
      mqttClient.subscribe("orchid/commands/env");

      // Immediately publish comprehensive health status and sensor diagnostics
      sendHealthStatus(false);

      // Flush any offline buffered readings from RAM
      flushOfflineBuffer();
      break;
    } else {
      setRGB_Orange();
      Serial.print(" FAILED, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" Retrying in 4 seconds...");
      delay(4000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);
  setRGB_Cyan(); // System booting

  Serial.println("\n==========================================");
  Serial.println("   ORCHID COMPANION - ESP32-S3 ENV NODE   ");
  Serial.println("==========================================");

  // LCD Setup & I2C Bus Check
  Wire.begin(LCD_SDA_PIN, LCD_SCL_PIN);
  delay(100);

  Serial.println("\n[I2C] Scanning I2C bus on GPIO 1 (SDA) & GPIO 2 (SCL)...");
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
  delay(50);

  // 1. "Powering ON..."
  lcd.clear();
  setLcdCursor(1, 1);
  lcd.print("Powering ON...");
  delay(1200);

  // 2. "Welcome to Orchid Companion"
  lcd.clear();
  setLcdCursor(3, 1);
  lcd.print("Welcome to");
  setLcdCursor(0, 2);
  lcd.print("Orchid Companion");
  delay(1800);

  // BH1750 Setup & Self-Test
  I2C_BH1750.begin(BH1750_SDA_PIN, BH1750_SCL_PIN);
  if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x23, &I2C_BH1750)) {
    isBh1750Ready = true;
    Serial.println("[BH1750] Initialized successfully");
  } else {
    isBh1750Ready = false;
    Serial.println("[BH1750] ERROR: Initialization failed!");
  }

  // DHT11 Setup & Self-Test
  dht.begin();
  delay(1000); // Allow DHT11 sensor to power-stabilize
  float testTemp = 0.0, testHum = 0.0;
  bool isDhtReady = readDHT11(testTemp, testHum);
  if (isDhtReady) {
    Serial.printf("[DHT11] Initialized successfully (T=%.1fC, H=%.1f%%)\n", testTemp, testHum);
  } else {
    Serial.println("[DHT11] ERROR: Initialization read failed on GPIO 5!");
  }

  // Check hardware health: Red LED indicates hardware fault
  if (!isBh1750Ready || !isDhtReady) {
    setRGB_Red();
    Serial.println("[HARDWARE] WARNING: Environmental sensor fault detected! Check wiring.");
    delay(1500);
  }

  // WiFi mode & MAC address
  WiFi.mode(WIFI_STA);
  macAddress = getFormattedMacAddress();
  telemetryTopic = "orchid/" + macAddress + "/env";
  statusTopic    = "orchid/" + macAddress + "/status";
  commandTopic   = "orchid/" + macAddress + "/command";
  Serial.println("Device MAC Address: " + macAddress);

  // 3. "MAC Address : "
  lcd.clear();
  setLcdCursor(1, 1);
  lcd.print("MAC Address :");
  setLcdCursor(2, 2);
  lcd.print(macAddress);
  delay(2000);

  // WiFi Setup
  wifiMulti.addAP("Galaxy A20s5650", "azdrea7339");
  wifiMulti.addAP("Dialog 4G 096", "B6582be1");
  wifiMulti.addAP("SLT_FIBRE", "0112760972");
  wifiMulti.addAP("Galaxy M31B79A", "yaluwek@23");

  // 4. "Connecting to Wifi"
  lcd.clear();
  setLcdCursor(1, 1);
  lcd.print("Connecting to");
  setLcdCursor(4, 2);
  lcd.print("Wifi...");
  setRGB_Cyan(); // Cyan indicates wireless connecting/pairing
  Serial.print("[Wi-Fi] Connecting to Wi-Fi");

  while (wifiMulti.run() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }

  Serial.println("\nWiFi Connected! IP: " + WiFi.localIP().toString());

  // Ensure true MAC is captured after Wi-Fi connects if not previously set
  if (macAddress == "000000000000" || macAddress.length() < 12) {
    macAddress = getFormattedMacAddress();
    telemetryTopic = "orchid/" + macAddress + "/env";
    statusTopic    = "orchid/" + macAddress + "/status";
    commandTopic   = "orchid/" + macAddress + "/command";
    Serial.println("Updated Device MAC Address: " + macAddress);
  }

  // 5. "Wifi Connected"
  lcd.clear();
  setLcdCursor(1, 1);
  lcd.print("Wifi Connected");
  String connectedSSID = WiFi.SSID();
  if (connectedSSID.length() > 16) connectedSSID = connectedSSID.substring(0, 16);
  int ssidPad = (16 - (int)connectedSSID.length()) / 2;
  setLcdCursor(ssidPad > 0 ? ssidPad : 0, 2);
  lcd.print(connectedSSID);
  delay(1500);

  setRGB_Cyan();

  // MQTT Client Setup
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(512);
  mqttClient.setKeepAlive(60);
  mqttClient.setSocketTimeout(15);

  reconnectMQTT();

  // 8. Idle screen
  showIdleScreen();
}

void loop() {
  bool isWifiConnected = (WiFi.status() == WL_CONNECTED);
  if (!isWifiConnected) {
    isWifiConnected = (wifiMulti.run() == WL_CONNECTED);
  }

  if (isWifiConnected) {
    if (!mqttClient.connected()) {
      reconnectMQTT();
    }
    mqttClient.loop(); // Listen for MQTT commands
  } else {
    // If not actively taking a sample, indicate WiFi loss
    if (!isSessionActive) {
      setRGB_Orange();
    }
  }

  // AUTONOMOUS SAMPLING SESSION (Continues running even if Wi-Fi drops)
  if (isSessionActive) {
    unsigned long now = millis();
    unsigned long elapsed = now - sessionStartTime;

    if (sessionTotalSamples == 3) {
      // 30-second schedule: Sample 1 (1s, already taken), Sample 2 (15s), Sample 3 (28s)
      if (sessionSampleIndex == 1 && elapsed >= 15000UL) {
        sessionSampleIndex = 2;
        executeSample(sessionSampleIndex, sessionTotalSamples);
      }
      else if (sessionSampleIndex == 2 && elapsed >= 28000UL) {
        sessionSampleIndex = 3;
        executeSample(sessionSampleIndex, sessionTotalSamples);
      }
      else if (sessionSampleIndex >= 3 && elapsed >= 30000UL) {
        isSessionActive = false;
        Serial.println("[SESSION] All 3 samples in autonomous 30s session completed!");

        if (WiFi.status() == WL_CONNECTED && mqttClient.connected()) {
          setRGB_SoftGreen();
          showIdleScreen();
        }
      }
    } else {
      // General interval fallback if custom number of samples requested
      if (now - lastSessionSampleTime >= sessionIntervalMs) {
        lastSessionSampleTime = now;
        sessionSampleIndex++;
        executeSample(sessionSampleIndex, sessionTotalSamples);

        if (sessionSampleIndex >= sessionTotalSamples) {
          isSessionActive = false;
          Serial.println("[SESSION] All samples in autonomous session completed!");

          if (WiFi.status() == WL_CONNECTED && mqttClient.connected()) {
            setRGB_SoftGreen();
            showIdleScreen();
          }
        }
      }
    }
  }

  delay(20); // Small yield for RTOS watchdog
}


