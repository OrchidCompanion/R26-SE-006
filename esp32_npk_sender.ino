#include <WiFi.h>
#include <HTTPClient.h>

#define RX_PIN 18
#define TX_PIN 17

// ---- WiFi + backend settings ----
const char* WIFI_SSID = "SLT_FIBRE";
const char* WIFI_PASSWORD = "0112760972";
// Use the LAN IP of the PC running the FastAPI backend
const char* SERVER_URL = "http://192.168.1.6:8000/npk-reading";

const byte nitro[] = { 0x01, 0x03, 0x00, 0x1e, 0x00, 0x01, 0xe4, 0x0c };
const byte phos[]  = { 0x01, 0x03, 0x00, 0x1f, 0x00, 0x01, 0xb5, 0xcc };
const byte pota[]  = { 0x01, 0x03, 0x00, 0x20, 0x00, 0x01, 0x85, 0xc0 };

byte values[11];

void connectWiFi() {
  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Connected. IP: ");
  Serial.println(WiFi.localIP());
}

void setup() {
  Serial.begin(9600);

  // Native Serial1 object for RS485 Modbus RTU
  Serial1.begin(4800, SERIAL_8N1, RX_PIN, TX_PIN);

  delay(500);
  connectWiFi();

  Serial.println("Starting NPK Sensor Reading...");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  int n = nitrogen();
  delay(250);
  int p = phosphorous();
  delay(250);
  int k = potassium();
  delay(250);

  Serial.print("Nitrogen: ");
  Serial.print(n);
  Serial.println(" mg/kg");

  Serial.print("Phosphorous: ");
  Serial.print(p);
  Serial.println(" mg/kg");

  Serial.print("Potassium: ");
  Serial.print(k);
  Serial.println(" mg/kg");

  Serial.println("----------------");

  sendReading(n, p, k);

  delay(2000);
}

void sendReading(int n, int p, int k) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected, skipping send");
    return;
  }

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  String payload = "{";
  payload += "\"nitrogen\":" + String(n) + ",";
  payload += "\"phosphorous\":" + String(p) + ",";
  payload += "\"potassium\":" + String(k) + ",";
  payload += "\"device_id\":\"esp32-npk-01\"";
  payload += "}";

  int code = http.POST(payload);

  if (code > 0) {
    Serial.print("POST response code: ");
    Serial.println(code);
    Serial.println(http.getString());
  } else {
    Serial.print("POST failed: ");
    Serial.println(http.errorToString(code));
  }

  http.end();
}

int nitrogen() {
  memset(values, 0, sizeof(values));
  while (Serial1.available()) Serial1.read();

  Serial1.write(nitro, sizeof(nitro));
  Serial1.flush();

  unsigned long startTime = millis();
  while (Serial1.available() < 7 && millis() - startTime < 1000) {
    delay(1);
  }

  Serial.print("Raw N Rx: ");
  int i = 0;
  while (Serial1.available() && i < 7) {
    values[i] = Serial1.read();
    if (values[i] < 16) Serial.print("0");
    Serial.print(values[i], HEX);
    Serial.print(" ");
    i++;
  }
  Serial.println();

  return (values[3] << 8) | values[4];
}

int phosphorous() {
  memset(values, 0, sizeof(values));
  while (Serial1.available()) Serial1.read();

  Serial1.write(phos, sizeof(phos));
  Serial1.flush();

  unsigned long startTime = millis();
  while (Serial1.available() < 7 && millis() - startTime < 1000) {
    delay(1);
  }

  Serial.print("Raw P Rx: ");
  int i = 0;
  while (Serial1.available() && i < 7) {
    values[i] = Serial1.read();
    if (values[i] < 16) Serial.print("0");
    Serial.print(values[i], HEX);
    Serial.print(" ");
    i++;
  }
  Serial.println();

  return (values[3] << 8) | values[4];
}

int potassium() {
  memset(values, 0, sizeof(values));
  while (Serial1.available()) Serial1.read();

  Serial1.write(pota, sizeof(pota));
  Serial1.flush();

  unsigned long startTime = millis();
  while (Serial1.available() < 7 && millis() - startTime < 1000) {
    delay(1);
  }

  Serial.print("Raw K Rx: ");
  int i = 0;
  while (Serial1.available() && i < 7) {
    values[i] = Serial1.read();
    if (values[i] < 16) Serial.print("0");
    Serial.print(values[i], HEX);
    Serial.print(" ");
    i++;
  }
  Serial.println();

  return (values[3] << 8) | values[4];
}
