#include <WiFi.h>
#include <WiFiMulti.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// PIN DEFINITIONS
#define RGB_PIN 48
#define RX_PIN 18
#define TX_PIN 17

// FASTAPI HOSTED BACKEND CONFIGURATION
const char* WS_HOST = "r26-se-006.onrender.com";
const int WS_PORT = 443;

// OBJECTS & GLOBAL INSTANCES
WebSocketsClient webSocket;
WiFiMulti wifiMulti;

String macAddress = "";
String wsPath = "";
bool isWsConnected = false;

// RS485 MODBUS RTU COMMAND ARRAYS
const byte nitro[] = { 0x01, 0x03, 0x00, 0x1e, 0x00, 0x01, 0xe4, 0x0c };
const byte phos[]  = { 0x01, 0x03, 0x00, 0x1f, 0x00, 0x01, 0xb5, 0xcc };
const byte pota[]  = { 0x01, 0x03, 0x00, 0x20, 0x00, 0x01, 0x85, 0xc0 };
byte values[11];

// RGB STATUS LED CONTROLLER
void setRGB(uint8_t r, uint8_t g, uint8_t b) { neopixelWrite(RGB_PIN, r, g, b); }
void setRGB_Red()     { setRGB(255, 0, 0); }      // Power ON / Disconnected
void setRGB_Yellow()  { setRGB(255, 200, 0); }    // Searching for WiFi
void setRGB_Blue()    { setRGB(0, 0, 255); }      // Connected to WiFi
void setRGB_Green()   { setRGB(0, 255, 0); }      // Socket connected
void setRGB_Magenta() { setRGB(255, 0, 255); }    // NPK Reading
void setRGB_White()   { setRGB(255, 255, 255); }  // Sending data to backend
void setRGB_Orange()  { setRGB(255, 80, 0); }     // Backend submit failed

// UTILITY FUNCTIONS
String getFormattedMacAddress() {
  String rawMac = WiFi.macAddress();
  rawMac.replace(":", "");
  rawMac.replace("-", "");
  rawMac.toLowerCase();
  return rawMac;
}

// NPK SENSOR MODBUS READING FUNCTIONS
int readModbusRegister(const byte* cmd, size_t cmdSize) {
  memset(values, 0, sizeof(values));
  while (Serial1.available()) Serial1.read();

  Serial1.write(cmd, cmdSize);
  Serial1.flush();

  unsigned long startTime = millis();
  while (Serial1.available() < 7 && millis() - startTime < 1000) {
    delay(1);
  }

  int i = 0;
  while (Serial1.available() && i < 7) {
    values[i] = Serial1.read();
    i++;
  }

  if (i < 7) {
    Serial.println("[RS485] Incomplete or timed out response.");
    return -1;
  }

  return (values[3] << 8) | values[4];
}

int readNitrogen()    { return readModbusRegister(nitro, sizeof(nitro)); }
int readPhosphorous() { return readModbusRegister(phos, sizeof(phos)); }
int readPotassium()   { return readModbusRegister(pota, sizeof(pota)); }

// SENSOR DISPATCH ROUTINE
void collectAndSendNPK() {
  setRGB_Magenta(); // NPK Reading
  Serial.println("[NPK] Gathering sensor readings...");

  int n = readNitrogen();
  delay(250);
  int p = readPhosphorous();
  delay(250);
  int k = readPotassium();

  Serial.printf("[NPK] N: %d mg/kg | P: %d mg/kg | K: %d mg/kg\n", n, p, k);

  StaticJsonDocument<256> doc;
  bool readSuccess = true;

  if (n < 0 || p < 0 || k < 0) {
    readSuccess = false;
    doc["status"] = "error";
    doc["error"] = "Failed to communicate with NPK sensor via RS485";
  } else {
    doc["status"] = "ok";
    doc["nitrogen"] = n;
    doc["phosphorus"] = p;
    doc["potassium"] = k;
    doc["device_id"] = "esp32-npk-" + macAddress;
  }

  String responsePayload;
  serializeJson(doc, responsePayload);

  setRGB_White(); // Sending data to backend
  bool sent = webSocket.sendTXT(responsePayload);
  Serial.println("[WS] Sent payload: " + responsePayload);

  if (!sent || !readSuccess) {
    setRGB_Orange(); // Backend submit failed
    Serial.println("[WS] Submission failed or sensor error encountered.");
    delay(2000);
  } else {
    delay(1000);
  }

  if (isWsConnected) {
    setRGB_Green(); // Back to Socket connected standby
  } else {
    setRGB_Blue();
  }
}

// WEBSOCKET COMMAND HANDLER
void handleIncomingCommand(uint8_t* payload) {
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, payload);

  if (error) {
    Serial.print("[WS] JSON Parse Error: ");
    Serial.println(error.c_str());
    return;
  }

  const char* action = doc["action"];
  if (!action) return;

  if (strcmp(action, "read_sensors") == 0 || strcmp(action, "read_npk") == 0) {
    collectAndSendNPK();
  } else if (strcmp(action, "health_check") == 0) {
    setRGB_Magenta();
    StaticJsonDocument<128> responseDoc;
    responseDoc["status"] = "ok";
    responseDoc["device"] = "NPK_Node";

    String responseString;
    serializeJson(responseDoc, responseString);
    
    setRGB_White();
    bool sent = webSocket.sendTXT(responseString);
    
    if (!sent) {
      setRGB_Orange();
      delay(2000);
    } else {
      delay(500);
    }
    
    if (isWsConnected) {
      setRGB_Green();
    }
  }
}

// WEBSOCKET CALLBACK
void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      isWsConnected = false;
      if (WiFi.status() == WL_CONNECTED) {
        setRGB_Blue(); // WiFi is fine, but socket is down
      } else {
        setRGB_Red();
      }
      Serial.println("[WS] Disconnected from backend.");
      break;

    case WStype_CONNECTED:
      isWsConnected = true;
      setRGB_Green(); // Socket connected
      Serial.println("[WS] Connected to backend successfully!");
      break;

    case WStype_TEXT:
      Serial.printf("[WS] Received: %s\n", payload);
      handleIncomingCommand(payload);
      break;

    case WStype_ERROR:
      setRGB_Orange();
      Serial.println("[WS] Socket Error encountered.");
      break;

    default:
      break;
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);

  setRGB_Red(); // Red: Power ON
  delay(1000);

  // Modbus RTU RS485 UART
  Serial1.begin(4800, SERIAL_8N1, RX_PIN, TX_PIN);

  // Multi-AP Wi-Fi Setup
  setRGB_Yellow(); // Yellow: Searching for Wifi
  WiFi.mode(WIFI_STA);
  wifiMulti.addAP("Galaxy A20", "azdxxx339");
  wifiMulti.addAP("SLT_", "011xxx0972");
  wifiMulti.addAP("Dialog", "B65xxxe1");

  Serial.print("Connecting to Wi-Fi");
  while (wifiMulti.run() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  setRGB_Blue(); // Blue: Connected to Wifi
  delay(1000);

  macAddress = getFormattedMacAddress();
  Serial.println("\n[Wi-Fi] Connected to: " + WiFi.SSID());
  Serial.print("[Wi-Fi] IP: ");
  Serial.println(WiFi.localIP());
  Serial.print("[Hardware] MAC: ");
  Serial.println(macAddress);

  // Setup Secure WebSocket (WSS)
  wsPath = "/api/sensors/ws/" + macAddress;
  webSocket.beginSSL(WS_HOST, WS_PORT, wsPath.c_str());
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
}

void loop() {
  if (wifiMulti.run() == WL_CONNECTED) {
    webSocket.loop();
  } else {
    isWsConnected = false;
    setRGB_Yellow(); // Reconnecting/Searching for WiFi
  }
}