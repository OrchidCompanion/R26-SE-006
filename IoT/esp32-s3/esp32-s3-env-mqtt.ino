#include <WiFi.h>
#include <WiFiMulti.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <BH1750.h>
#include <DHT.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

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

// RGB LED CONTROLLER
void setRGB(uint8_t r, uint8_t g, uint8_t b) { neopixelWrite(RGB_PIN, r, g, b); }
void setRGB_Red()    { setRGB(255, 0, 0); }
void setRGB_Yellow() { setRGB(255, 180, 0); }
void setRGB_Green()  { setRGB(0, 255, 0); }
void setRGB_Blue()   { setRGB(0, 100, 255); }
void setRGB_Violet() { setRGB(180, 0, 255); }

// FORMAT MAC ADDRESS
String getFormattedMacAddress() {
  String mac = WiFi.macAddress();
  mac.replace(":", "");
  mac.toLowerCase();
  return mac;
}

// LCD UI HELPER FUNCTIONS
void showIdleScreen() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("ORCHID COMPANION");
  lcd.setCursor(0, 1);
  lcd.print("Status: MQTT ONLINE");
  lcd.setCursor(0, 2);
  lcd.print("Device: " + macAddress.substring(0, 8) + "...");
  lcd.setCursor(0, 3);
  lcd.print("Mode  : AUTO SENS");
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

// PUBLISH SENSOR TELEMETRY OVER MQTT
void publishSensorData() {
  setRGB_Blue();

  float temp = 0.0;
  float hum = 0.0;
  bool dht_ok = readDHT11(temp, hum);
  float lux = readBH1750();

  StaticJsonDocument<256> doc;
  doc["device_id"] = macAddress;
  doc["module_id"] = macAddress;
  doc["temperature"] = dht_ok ? round(temp * 10.0) / 10.0 : 0.0;
  doc["humidity"]    = dht_ok ? round(hum * 10.0) / 10.0 : 0.0;
  doc["lux"]         = round(lux * 10.0) / 10.0;
  doc["dht_ok"]      = dht_ok;

  char jsonBuffer[256];
  serializeJson(doc, jsonBuffer);

  // Publish to specific topic and general topic for microservices
  mqttClient.publish(telemetryTopic.c_str(), jsonBuffer);
  mqttClient.publish("orchid/sensors/env", jsonBuffer);

  Serial.print("[MQTT] Published env telemetry: ");
  Serial.println(jsonBuffer);

  // Update LCD
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.printf("T:%.1fC H:%.1f%%", temp, hum);
  lcd.setCursor(0, 1);
  lcd.printf("Lux: %.1f lx", lux);
  lcd.setCursor(0, 2);
  lcd.print("MQTT: SENT OK");
  lcd.setCursor(0, 3);
  lcd.print("ID: " + macAddress);

  setRGB_Violet();
  delay(1200);
  setRGB_Green();
}

// MQTT INCOMING MESSAGE CALLBACK
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.print("[MQTT] Message arrived on topic: ");
  Serial.println(topic);

  StaticJsonDocument<256> doc;
  deserializeJson(doc, payload, length);

  const char* action = doc["action"];
  if (action && (strcmp(action, "read_now") == 0 || 
                 strcmp(action, "read_sensors") == 0 || 
                 strcmp(action, "read_ambient") == 0)) {
    publishSensorData();
  }
}

// RECONNECT TO MQTT BROKER
void reconnectMQTT() {
  while (!mqttClient.connected()) {
    setRGB_Yellow();
    Serial.print("[MQTT] Connecting to broker...");
    String clientId = "ESP32-ENV-" + macAddress;

    bool connected = false;
    if (strlen(MQTT_USER) > 0) {
      connected = mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS);
    } else {
      connected = mqttClient.connect(clientId.c_str());
    }

    if (connected) {
      Serial.println(" CONNECTED!");
      setRGB_Green();
      showIdleScreen();

      // Subscribe to command topic
      mqttClient.subscribe(commandTopic.c_str());
      mqttClient.subscribe("orchid/commands/env");

      // Publish status online
      StaticJsonDocument<128> statusDoc;
      statusDoc["device_id"] = macAddress;
      statusDoc["status"] = "online";
      char statusBuf[128];
      serializeJson(statusDoc, statusBuf);
      mqttClient.publish(statusTopic.c_str(), statusBuf);

      // Publish initial boot reading so backend immediately sees module is live
      publishSensorData();
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
  delay(1000);
  setRGB_Red();

  // LCD Setup
  Wire.begin(LCD_SDA_PIN, LCD_SCL_PIN);
  delay(100);

  Serial.println("\n[I2C] Scanning I2C bus on GPIO 1 (SDA) & GPIO 2 (SCL)...");
  int nDevices = 0;
  for (byte address = 1; address < 127; ++address) {
    Wire.beginTransmission(address);
    byte error = Wire.endTransmission();
    if (error == 0) {
      Serial.printf("[I2C] Device FOUND at address 0x%02X!\n", address);
      nDevices++;
    }
  }
  if (nDevices == 0) {
    Serial.println("[I2C] WARNING: No devices found on GPIO 1 & GPIO 2!");
  }

  lcd.init();
  Wire.begin(LCD_SDA_PIN, LCD_SCL_PIN); // Re-assert custom pins
  lcd.backlight();
  lcd.clear();
  delay(50);
  lcd.setCursor(0, 0);
  lcd.print("ORCHID COMPANION");
  lcd.setCursor(0, 1);
  lcd.print("BOOTING SYSTEM...");


  // BH1750 Setup
  I2C_BH1750.begin(BH1750_SDA_PIN, BH1750_SCL_PIN);
  if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x23, &I2C_BH1750)) {
    isBh1750Ready = true;
    Serial.println("[BH1750] Initialized successfully");
  } else {
    Serial.println("[BH1750] Initialization failed");
  }

  // DHT Setup
  dht.begin();

  // WiFi Setup
  WiFi.mode(WIFI_STA);
  wifiMulti.addAP("Dialog_4G_WiFi", "12345678");
  wifiMulti.addAP("SLT_FIBRE", "password");
  wifiMulti.addAP("Mobile_Hotspot", "hotspotpass");

  lcd.setCursor(0, 2);
  lcd.print("Connecting WiFi...");
  setRGB_Yellow();

  while (wifiMulti.run() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi Connected! IP: " + WiFi.localIP().toString());

  // Format MAC Address AFTER WiFi radio is initialized!
  macAddress = getFormattedMacAddress();
  telemetryTopic = "orchid/" + macAddress + "/env";
  statusTopic    = "orchid/" + macAddress + "/status";
  commandTopic   = "orchid/" + macAddress + "/command";
  Serial.println("Device MAC Address: " + macAddress);

  setRGB_Blue();

  // MQTT Client Setup
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
  mqttClient.loop(); // Listens for on-demand trigger commands from mobile app
}

