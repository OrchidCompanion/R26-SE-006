#include <WiFi.h>
#include <WiFiMulti.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// PIN DEFINITIONS
#define RGB_PIN 48
#define RX_PIN 18
#define TX_PIN 17

// =============================================================================
// MQTT & NETWORK CONFIGURATION
// Contabo VPS public IP: 169.58.119.186
// =============================================================================
const char* MQTT_SERVER = "169.58.119.186";
const int   MQTT_PORT   = 1883;
const char* MQTT_USER   = ""; // Leave empty if anonymous
const char* MQTT_PASS   = "";

// TELEMETRY INTERVAL (Milliseconds)
const unsigned long TELEMETRY_INTERVAL = 60000; // Publish every 60 seconds
unsigned long lastPublishTime = 0;

// OBJECTS & GLOBAL INSTANCES
WiFiClient espClient;
PubSubClient mqttClient(espClient);
WiFiMulti wifiMulti;

String macAddress = "";
String telemetryTopic = "";
String statusTopic = "";
String commandTopic = "";

// RS485 MODBUS RTU COMMAND ARRAYS
const byte nitro[] = { 0x01, 0x03, 0x00, 0x1e, 0x00, 0x01, 0xe4, 0x0c };
const byte phos[]  = { 0x01, 0x03, 0x00, 0x1f, 0x00, 0x01, 0xb5, 0xcc };
const byte pota[]  = { 0x01, 0x03, 0x00, 0x20, 0x00, 0x01, 0x85, 0xc0 };
byte values[11];

// RGB STATUS LED CONTROLLER
void setRGB(uint8_t r, uint8_t g, uint8_t b) { neopixelWrite(RGB_PIN, r, g, b); }
void setRGB_Red()     { setRGB(255, 0, 0); }      // Disconnected
void setRGB_Yellow()  { setRGB(255, 200, 0); }    // Searching WiFi/MQTT
void setRGB_Blue()    { setRGB(0, 0, 255); }      // Connected to WiFi
void setRGB_Green()   { setRGB(0, 255, 0); }      // MQTT connected standby
void setRGB_Magenta() { setRGB(255, 0, 255); }    // Reading Modbus
void setRGB_White()   { setRGB(255, 255, 255); }  // Publishing MQTT
void setRGB_Orange()  { setRGB(255, 80, 0); }     // Error

// UTILITY FUNCTIONS
String getFormattedMacAddress() {
  uint8_t baseMac[6];
  esp_read_mac(baseMac, ESP_MAC_WIFI_STA);
  char baseMacChr[13] = {0};
  snprintf(baseMacChr, 13, "%02x%02x%02x%02x%02x%02x",
           baseMac[0], baseMac[1], baseMac[2], baseMac[3], baseMac[4], baseMac[5]);
  return String(baseMacChr);
}

// RS485 MODBUS COMMUNICATION
int readModbusRegister(const byte* cmd) {
  Serial2.write(cmd, 8);
  Serial2.flush();
  delay(100);

  int available = Serial2.available();
  if (available < 7) {
    return -1;
  }

  for (int i = 0; i < available && i < 11; i++) {
    values[i] = Serial2.read();
  }

  if (values[0] != 0x01 || values[1] != 0x03) {
    return -1;
  }

  return (values[3] << 8) | values[4];
}

// COLLECT & PUBLISH NPK TELEMETRY
void collectAndPublishNPK() {
  setRGB_Magenta(); // Reading RS485
  Serial.println("[NPK] Reading Modbus sensor...");

  int n = readModbusRegister(nitro);
  delay(100);
  int p = readModbusRegister(phos);
  delay(100);
  int k = readModbusRegister(pota);

  Serial.printf("[NPK] Nitrogen: %d | Phosphorus: %d | Potassium: %d mg/kg\n", n, p, k);

  StaticJsonDocument<256> doc;
  bool readSuccess = (n >= 0 && p >= 0 && k >= 0);

  doc["device_id"]  = "esp32-npk-" + macAddress;
  doc["nitrogen"]   = readSuccess ? n : 45; // Fallback simulation if sensor disconnected
  doc["phosphorus"] = readSuccess ? p : 30;
  doc["potassium"]  = readSuccess ? k : 55;
  doc["sensor_ok"]  = readSuccess;

  char jsonBuffer[256];
  serializeJson(doc, jsonBuffer);

  setRGB_White(); // Publishing
  mqttClient.publish(telemetryTopic.c_str(), jsonBuffer);
  mqttClient.publish("orchid/sensors/npk", jsonBuffer);

  Serial.print("[MQTT] Published NPK telemetry: ");
  Serial.println(jsonBuffer);

  delay(500);
  setRGB_Green();
}

// MQTT INCOMING COMMAND CALLBACK
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.print("[MQTT] Received command on: ");
  Serial.println(topic);

  StaticJsonDocument<256> doc;
  deserializeJson(doc, payload, length);

  const char* action = doc["action"];
  if (action && (strcmp(action, "read_npk") == 0 || strcmp(action, "read_sensors") == 0)) {
    collectAndPublishNPK();
  }
}

// RECONNECT MQTT
void reconnectMQTT() {
  while (!mqttClient.connected()) {
    setRGB_Yellow();
    Serial.print("[MQTT] Connecting to broker...");
    String clientId = "ESP32-NPK-" + macAddress;

    bool connected = false;
    if (strlen(MQTT_USER) > 0) {
      connected = mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS);
    } else {
      connected = mqttClient.connect(clientId.c_str());
    }

    if (connected) {
      Serial.println(" CONNECTED!");
      setRGB_Green();

      mqttClient.subscribe(commandTopic.c_str());
      mqttClient.subscribe("orchid/commands/npk");

      StaticJsonDocument<128> statusDoc;
      statusDoc["device_id"] = "esp32-npk-" + macAddress;
      statusDoc["status"] = "online";
      char statusBuf[128];
      serializeJson(statusDoc, statusBuf);
      mqttClient.publish(statusTopic.c_str(), statusBuf);
    } else {
      setRGB_Red();
      Serial.print(" FAILED, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" Retrying in 5 seconds...");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  Serial2.begin(9600, SERIAL_8N1, RX_PIN, TX_PIN);
  delay(1000);
  setRGB_Red();

  macAddress = getFormattedMacAddress();
  telemetryTopic = "orchid/npk/" + macAddress + "/telemetry";
  statusTopic    = "orchid/npk/" + macAddress + "/status";
  commandTopic   = "orchid/npk/" + macAddress + "/command";

  wifiMulti.addAP("Dialog_4G_WiFi", "12345678");
  wifiMulti.addAP("SLT_FIBRE", "password");
  wifiMulti.addAP("Mobile_Hotspot", "hotspotpass");

  setRGB_Yellow();
  while (wifiMulti.run() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi Connected! IP: " + WiFi.localIP().toString());
  setRGB_Blue();

  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);

  reconnectMQTT();
}

void loop() {
  if (wifiMulti.run() != WL_CONNECTED) {
    setRGB_Yellow();
    delay(1000);
    return;
  }

  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();

  // Periodic NPK reading
  unsigned long now = millis();
  if (now - lastPublishTime > TELEMETRY_INTERVAL) {
    lastPublishTime = now;
    collectAndPublishNPK();
  }
}
