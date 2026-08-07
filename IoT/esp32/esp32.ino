#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>


const char* WIFI_SSID = "Dialog 4G 096";
const char* WIFI_PASS = "";
const char* SUPABASE_URL = "https://bsgqdrxvmiqochooxlhp.supabase.co/rest/v1/dht11_sensor_data";
const char* SUPABASE_KEY = "";
const char* DEVICE_ID = "ESP32_DevKit_V1";

// PIN MAPPINGS
#define POWER_LED_PIN   27  // Red LED: Power Indicator
#define WIFI_LED_PIN    26  // Yellow LED: WiFi Indicator
#define SENSOR_LED_PIN  25  // Green LED: DHT11 Indicator

#define BUTTON_PIN      23  // Active-LOW Push Button (Pin 1 -> GPIO 23, Pin 2 -> GND)

#define RGB_RED_PIN     14  // Common Cathode RGB Red Pin
#define RGB_GREEN_PIN   12  // Common Cathode RGB Green Pin
#define RGB_BLUE_PIN    13  // Common Cathode RGB Blue Pin

#define DHTPIN          5   // DHT11 Data Pin
#define DHTTYPE         DHT11

DHT dht(DHTPIN, DHTTYPE);

// RGB Helper
void setRGBColor(bool red, bool green, bool blue) {
  digitalWrite(RGB_RED_PIN, red ? HIGH : LOW);
  digitalWrite(RGB_GREEN_PIN, green ? HIGH : LOW);
  digitalWrite(RGB_BLUE_PIN, blue ? HIGH : LOW);
}

void setRGBOff()    { setRGBColor(false, false, false); }
void setRGBYellow() { setRGBColor(true, true, false); }   // Reading Data
void setRGBBlue()   { setRGBColor(false, false, true); }  // Submitting Data
void setRGBGreen()  { setRGBColor(false, true, false); }  // Request Success
void setRGBRed()    { setRGBColor(true, false, false); }  // Request Failure


void setup() {
  Serial.begin(115200);

  // Initialize Indicator LEDs
  pinMode(POWER_LED_PIN, OUTPUT);
  pinMode(WIFI_LED_PIN, OUTPUT);
  pinMode(SENSOR_LED_PIN, OUTPUT);

  // Initialize RGB Pins
  pinMode(RGB_RED_PIN, OUTPUT);
  pinMode(RGB_GREEN_PIN, OUTPUT);
  pinMode(RGB_BLUE_PIN, OUTPUT);
  setRGBOff();

  // Power LED
  digitalWrite(POWER_LED_PIN, HIGH);

  // Configure Push Button with Internal Pull-Up
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  // Connect to WiFi
  Serial.print("Connecting to WiFi...");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected!");
  digitalWrite(WIFI_LED_PIN, HIGH);

  // Check DHT11 Sensor
  dht.begin();
  delay(2000);

  float testTemp = dht.readTemperature();
  float testHum  = dht.readHumidity();

  if (!isnan(testTemp) && !isnan(testHum)) {
    Serial.println("DHT11 Sensor connected successfully.");
    digitalWrite(SENSOR_LED_PIN, HIGH); // Turn ON Green LED
  } else {
    Serial.println("Warning: Failed to read from DHT11 sensor. Check wiring!");
    digitalWrite(SENSOR_LED_PIN, LOW);
  }
}


void loop() {
  // Check button is pressed
  if (digitalRead(BUTTON_PIN) == LOW) {
    delay(50);
    if (digitalRead(BUTTON_PIN) == LOW) {
      Serial.println("\nButton pressed! Processing request...");

      // Reading Data
      setRGBYellow();
      delay(500); 

      float temperature = dht.readTemperature();
      float humidity    = dht.readHumidity();

      if (isnan(temperature) || isnan(humidity)) {
        Serial.println("Error: Failed to read sensor data.");
        setRGBRed();
        delay(3000);
        setRGBOff();
        return;
      }

      Serial.printf("Temperature: %.2f °C | Humidity: %.2f %%\n", temperature, humidity);

      // Submitting to Supabase
      setRGBBlue();

      if (WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        http.begin(SUPABASE_URL);

        // Headers for Supabase
        http.addHeader("Content-Type", "application/json");
        http.addHeader("apikey", SUPABASE_KEY);
        http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
        http.addHeader("Prefer", "return=minimal");

        // Construct JSON Payload
        String jsonPayload = "{";
        jsonPayload += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
        jsonPayload += "\"temperature\":" + String(temperature, 2) + ",";
        jsonPayload += "\"humidity\":" + String(humidity, 2);
        jsonPayload += "}";

        int httpResponseCode = http.POST(jsonPayload);

        // Handle API Response Status
        if (httpResponseCode == 201 || httpResponseCode == 200) {
          Serial.printf("Data uploaded successfully! HTTP Code: %d\n", httpResponseCode);
          setRGBGreen();
        } else {
          Serial.printf("HTTP Upload Failed! Code: %d\n", httpResponseCode);
          Serial.println("Server Response: " + http.getString());
          setRGBRed();
        }
        http.end();
      } else {
        Serial.println("WiFi Disconnected. Cannot transmit payload.");
        setRGBRed();
      }

      // Display status color
      delay(3000);
      setRGBOff();

      // Wait until button released
      while (digitalRead(BUTTON_PIN) == LOW) {
        delay(10);
      }
    }
  }
}