#include <WiFi.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <BH1750.h>
#include <DHT.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// PIN DEFINITIONS
// Onboard WS2812 RGB LED
#define RGB_PIN          48

// I2C Bus
#define LCD_SDA_PIN      1
#define LCD_SCL_PIN      2

// I2C Bus 1
#define BH1750_SDA_PIN   9
#define BH1750_SCL_PIN   8

// DHT11 Temperature & Humidity Sensor
#define DHTPIN           5
#define DHTTYPE          DHT11


// WI-FI CONFIGURATION
const char* WIFI_SSID     = "Dialog 4G 096";
const char* WIFI_PASSWORD = "B6582be1";

// Laptop IPv4 address
const char* WS_HOST       = "192.168.8.181";
const int   WS_PORT       = 8000;

// OBJECTS & GLOBAL INSTANCES

// LCD on address 0x27 (16 cols x 4 rows)
LiquidCrystal_I2C lcd(0x27, 16, 4);

// Second I2C Bus instance for BH1750
TwoWire I2C_BH1750 = TwoWire(1);
BH1750 lightMeter;

DHT dht(DHTPIN, DHTTYPE);
WebSocketsClient webSocket;

String macAddress = "";
String wsPath = "";
bool isWsConnected = false;
bool isBh1750Ready = false;


// RGB LED CONTROLLER
void setRGB(uint8_t r, uint8_t g, uint8_t b) {
  neopixelWrite(RGB_PIN, r, g, b);
}

void setRGB_Red()     { setRGB(255, 0, 0); }     // Power ON / Booting
void setRGB_Yellow()  { setRGB(255, 180, 0); }   // Searching Wi-Fi
void setRGB_Green()   { setRGB(0, 255, 0); }     // Wi-Fi Connected & Idle
void setRGB_Blue()    { setRGB(0, 100, 255); }   // Processing Command
void setRGB_Violet()  { setRGB(180, 0, 255); }   // Submitting / Transmitting


// LCD UI HELPER FUNCTIONS
void showIdleScreen() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("WiFi: ");
  lcd.print(WiFi.SSID().substring(0, 10));

  lcd.setCursor(0, 1);
  lcd.print("IP:");
  lcd.print(WiFi.localIP().toString());

  lcd.setCursor(0, 2);
  lcd.print("MAC: ");
  lcd.print(macAddress);

  lcd.setCursor(0, 3);
  if (isWsConnected) {
    lcd.print("WS: CONNECTED");
  } else {
    lcd.print("WS: DISCONNECTED");
  }
}

String getFormattedMacAddress() {
  String rawMac = WiFi.macAddress();
  rawMac.replace(":", "");
  rawMac.replace("-", "");
  rawMac.toLowerCase();
  return rawMac;
}

// SENSOR READING ROUTINES
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
  if (!isBh1750Ready) return -1.0;
  float lux = lightMeter.readLightLevel();
  if (lux < 0) {
    Serial.println("[BH1750] Read error!");
  }
  return lux;
}

// WEBSOCKET COMMAND HANDLER
void handleIncomingCommand(uint8_t * payload) {
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, payload);

  if (error) {
    Serial.print("[WS] JSON Parse Error: ");
    Serial.println(error.c_str());
    return;
  }

  const char* action = doc["action"];
  if (!action) return;

  StaticJsonDocument<256> responseDoc;

  // Health Check
  if (strcmp(action, "health_check") == 0) {
    setRGB_Blue();

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("--- DIAGNOSTICS ---");
    lcd.setCursor(0, 1);
    lcd.print("Testing Sensors...");

    float t, h;
    bool dht_status = readDHT11(t, h);
    float l = readBH1750();
    bool bh_status = (l >= 0.0);

    lcd.setCursor(0, 2);
    lcd.printf("DHT11 : %s", dht_status ? "READY" : "ERROR");
    lcd.setCursor(0, 3);
    lcd.printf("BH1750: %s", bh_status ? "READY" : "ERROR");

    delay(1000);

    responseDoc["status"] = "ok";
    responseDoc["dht11_ok"] = dht_status;
    responseDoc["bh1750_ok"] = bh_status;

    String responseString;
    serializeJson(responseDoc, responseString);
    
    setRGB_Violet();
    webSocket.sendTXT(responseString);
    Serial.println("[WS] Sent health_check response: " + responseString);

    delay(1500);
    setRGB_Green();
    showIdleScreen();
  }

  //Read Live Sensors (On Demand)
  else if (strcmp(action, "read_sensors") == 0) {
    setRGB_Blue();

    // Notify on LCD
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("CMD: READ SENSORS");
    lcd.setCursor(0, 1);
    lcd.print("Reading DHT11...");

    float temp = 0.0;
    float hum = 0.0;
    bool dht_status = readDHT11(temp, hum);
    delay(500);

    // Read BH1750
    lcd.setCursor(0, 2);
    lcd.print("Reading BH1750...");
    float lux = readBH1750();
    if (lux < 0.0) lux = 0.0;
    delay(500);

    // Show Captured Values
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.printf("T:%.1fC H:%.1f%%", temp, hum);
    lcd.setCursor(0, 1);
    lcd.printf("Lux: %.1f lx", lux);
    lcd.setCursor(0, 2);
    lcd.print("Submitting Data...");

    setRGB_Violet();

    if (!dht_status) {
      responseDoc["status"] = "error";
      responseDoc["error"] = "DHT11 sensor failed on GPIO 5";
      lcd.setCursor(0, 3);
      lcd.print("Status: FAILED!");
    } else {
      responseDoc["status"] = "ok";
      responseDoc["temperature"] = round(temp * 10.0) / 10.0;
      responseDoc["humidity"] = round(hum * 10.0) / 10.0;
      responseDoc["lux"] = round(lux * 10.0) / 10.0;
      lcd.setCursor(0, 3);
      lcd.print("Submit SUCCESS!");
    }

    String responseString;
    serializeJson(responseDoc, responseString);
    webSocket.sendTXT(responseString);
    Serial.println("[WS] Sent sensor payload: " + responseString);

    delay(2500);
    setRGB_Green();
    showIdleScreen();
  }
}

// WEBSOCKET EVENT CALLBACK
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      isWsConnected = false;
      Serial.println("[WS] Disconnected from FastAPI.");
      showIdleScreen();
      break;

    case WStype_CONNECTED:
      isWsConnected = true;
      Serial.println("[WS] Connected to FastAPI successfully!");
      showIdleScreen();
      break;

    case WStype_TEXT:
      Serial.printf("[WS] Received: %s\n", payload);
      handleIncomingCommand(payload);
      break;

    case WStype_ERROR:
      Serial.printf("[WS] Socket Error.\n");
      break;

    default:
      break;
  }
}



// SETUP & LOOP
void setup() {
  Serial.begin(115200);
  delay(500);

  // Power ON State -> RGB RED
  setRGB_Red();

  // Initialize LCD on Wire (GPIO 1 SDA, GPIO 2 SCL)
  Wire.begin(LCD_SDA_PIN, LCD_SCL_PIN);
  lcd.init();
  lcd.backlight();

  lcd.setCursor(0, 0);
  lcd.print("================");
  lcd.setCursor(0, 1);
  lcd.print(" ESP32-S3 NODE  ");
  lcd.setCursor(0, 2);
  lcd.print(" POWERING ON... ");
  lcd.setCursor(0, 3);
  lcd.print("================");
  delay(1500);

  // Initialize BH1750
  I2C_BH1750.begin(BH1750_SDA_PIN, BH1750_SCL_PIN);
  
  // Try default address 0x23 first, then alternate address 0x5C
  if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x23, &I2C_BH1750)) {
    isBh1750Ready = true;
    Serial.println("[BH1750] Sensor Ready on 0x23!");
  } else if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x5C, &I2C_BH1750)) {
    isBh1750Ready = true;
    Serial.println("[BH1750] Sensor Ready on 0x5C!");
  } else {
    isBh1750Ready = false;
    Serial.println("[BH1750] Sensor not found on I2C bus (Fallback active).");
  }

  // Initialize DHT11
  dht.begin();

  // Wi-Fi Connecting State -> RGB YELLOW
  setRGB_Yellow();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("CONNECTING WIFI:");
  lcd.setCursor(0, 1);
  lcd.print(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int dots = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    lcd.setCursor(dots % 16, 2);
    lcd.print(".");
    dots++;
  }

  // Wi-Fi Connected -> RGB GREEN
  setRGB_Green();
  macAddress = getFormattedMacAddress();

  Serial.println("\n[Wi-Fi] Connected!");
  Serial.print("[Wi-Fi] IP: ");
  Serial.println(WiFi.localIP());
  Serial.print("[Hardware] MAC: ");
  Serial.println(macAddress);

  // Setup WebSocket Route: /api/sensors/ws/<macAddress>
  wsPath = "/api/sensors/ws/" + macAddress;
  webSocket.begin(WS_HOST, WS_PORT, wsPath.c_str());
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);

  showIdleScreen();
}

void loop() {
  webSocket.loop();
}