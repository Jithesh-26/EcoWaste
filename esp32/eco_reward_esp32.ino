/*
 ============================================================================
  EcoReward Smart Bin — ESP32 Firmware (Continuous Live Scale & On-Demand Dispenser)
 ============================================================================
  Description:
    Continuously streams live load cell weight (HX711) and IR proximity sensor
    to the EcoReward server over Wi-Fi without any blocking delays, and rotates
    the servo motor to dispense a paper reward slip when requested by the user.

  Required Arduino Libraries:
    - HX711 Arduino Library by Bogdan Necula (or Rob Tillaart)
    - ESP32Servo by Kevin Harrington
    - ArduinoJson by Benoit Blanchon (v6 or v7)

  Pin Plan (ESP32):
    - HX711 VCC    -> ESP32 3.3V
    - HX711 GND    -> ESP32 GND
    - HX711 DT     -> GPIO 25 (D25)
    - HX711 SCK    -> GPIO 26 (D26)
    
    - IR VCC       -> ESP32 3.3V
    - IR GND       -> ESP32 GND
    - IR OUT       -> GPIO 27 (D27)
    
    - Servo Signal -> GPIO 18 (D18) *** POWER FROM EXTERNAL 5V PSU, NOT 3.3V! ***

  CRITICAL POWER NOTE:
    The servo motor MUST be powered by an external 5V power supply (or USB 5V rail).
    Connect the external 5V power supply GND to the ESP32 GND (common ground).
    Do NOT power the servo from the ESP32 3.3V pin.
 ============================================================================
*/

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include "HX711.h"

// ============================================================================
// 1. NETWORK CONFIGURATION
// ============================================================================
const char* WIFI_SSID     = "Jithu's";
const char* WIFI_PASSWORD = "jithu12345";

// Your laptop's Wi-Fi IP address
const char* SERVER_HOST   = "10.251.76.170";
const int   SERVER_PORT   = 5000;

// API Endpoints
String URL_STATUS  = String("http://") + SERVER_HOST + ":" + SERVER_PORT + "/api/hardware/status";

// ============================================================================
// 2. PIN DEFINITIONS
// ============================================================================
const int PIN_HX711_DT  = 25; // GPIO 25 (D25) -> HX711 DT / DOUT
const int PIN_HX711_SCK = 26; // GPIO 26 (D26) -> HX711 SCK / CLK
const int PIN_IR_SENSOR = 27; // GPIO 27 (D27) -> IR Sensor OUT / DO
const int PIN_SERVO     = 18; // GPIO 18 (D18) -> Servo Signal (Orange/Yellow)

// ============================================================================
// 3. HARDWARE OBJECTS & CALIBRATION
// ============================================================================
HX711 scale;
Servo dispenserServo;

// Calibration factor for load cell
float CALIBRATION_FACTOR = 420.0f;

// Continuous streaming interval
unsigned long lastHeartbeatTime = 0;
const unsigned long HEARTBEAT_INTERVAL_MS = 500; // Continuous live stream every 500ms

// Function prototypes
void connectWiFi();
void sendHeartbeat(bool irState, long weight);
void dispenseRewardSlip();

// ============================================================================
// 4. SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=============================================");
  Serial.println("  EcoReward Smart Bin - Continuous Live Scale");
  Serial.println("=============================================");

  // Pin Modes
  pinMode(PIN_IR_SENSOR, INPUT);

  // Initialize Servo
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  dispenserServo.setPeriodHertz(50);
  dispenserServo.attach(PIN_SERVO, 500, 2400);
  dispenserServo.write(0); // Home position
  delay(500);

  // Initialize HX711 Load Cell
  Serial.print("[HX711] Initializing scale on DT=");
  Serial.print(PIN_HX711_DT);
  Serial.print(", SCK=");
  Serial.println(PIN_HX711_SCK);
  
  scale.begin(PIN_HX711_DT, PIN_HX711_SCK);
  scale.set_scale(CALIBRATION_FACTOR);
  scale.tare(); // Zero the scale
  Serial.println("[HX711] Scale zeroed and ready!");

  // Connect to Wi-Fi
  connectWiFi();

  Serial.println("[SYSTEM] Ready! Continuous weight streaming active.");
}

// ============================================================================
// 5. MAIN LOOP — Continuous, non-blocking live measurement
// ============================================================================
void loop() {
  // 1. Maintain Wi-Fi connection
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  // 2. Read Sensors (Zero delay)
  bool irDetected = (digitalRead(PIN_IR_SENSOR) == LOW);
  long weightGrams = 0;

  if (scale.is_ready()) {
    weightGrams = (long)scale.get_units(1); // Fast single-read
    if (weightGrams < 0) weightGrams = 0;   // Clamp negative noise
  }

  // 3. Unconditionally stream live status & weight to server every 500ms
  if (millis() - lastHeartbeatTime >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatTime = millis();
    sendHeartbeat(irDetected, weightGrams);
  }

  delay(20); // Small CPU yield
}

// ============================================================================
// 6. HELPER FUNCTIONS
// ============================================================================

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.print("[WiFi] Connecting to: ");
  Serial.println(WIFI_SSID);
  
  WiFi.disconnect(true);
  delay(200);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("\n[WiFi] Connected! IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n[WiFi] Connection failed. Check 2.4 GHz AP band on hotspot.");
  }
}

// Send periodic heartbeat to keep the web UI live scale updated
void sendHeartbeat(bool irState, long weight) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(URL_STATUS);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<200> reqDoc;
  reqDoc["ir_detected"] = irState;
  reqDoc["current_weight_g"] = weight;

  String reqBody;
  serializeJson(reqDoc, reqBody);

  int httpCode = http.POST(reqBody);
  if (httpCode == 200) {
    String response = http.getString();
    StaticJsonDocument<256> resDoc;
    if (!deserializeJson(resDoc, response)) {
      if (resDoc["tare_requested"] == true) {
        Serial.println("[TARE] Tare signal received from web dashboard. Zeroing scale...");
        scale.tare();
      }
      if (resDoc["dispense_requested"] == true) {
        Serial.println("[SERVO] 'Collect Reward' pressed on web! Dispensing physical receipt slip...");
        dispenseRewardSlip();
      }
    }
  }
  http.end();
}

// Physical servo dispenser routine (Rotates ONLY after user clicks Collect Reward Slip on web)
void dispenseRewardSlip() {
  dispenserServo.write(90); // Rotate to push paper slip out
  delay(1200);              // Allow slip to push out
  dispenserServo.write(0);  // Return to home position
  delay(500);
}
