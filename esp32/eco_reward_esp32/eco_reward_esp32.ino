/*
 ============================================================================
  EcoReward Smart Bin — ESP32 Firmware (No Buzzer)
 ============================================================================
  Description:
    Reads load cell weight (HX711) and IR proximity sensor, communicates
    with the local Python EcoReward server over Wi-Fi, and rotates a servo
    motor to dispense a printed paper reward slip.

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

// Your laptop's Wi-Fi IP address on your OnePlus Nord hotspot
const char* SERVER_HOST   = "10.251.76.170";
const int   SERVER_PORT   = 5000;

// API Endpoints
String URL_DEPOSIT = String("http://") + SERVER_HOST + ":" + SERVER_PORT + "/api/hardware/deposit";
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

// Calibration factor for 1kg load cell. Adjust this after weighing a known item.
float CALIBRATION_FACTOR = 420.0f;

// State management
unsigned long lastHeartbeatTime = 0;
const unsigned long HEARTBEAT_INTERVAL_MS = 3000;
bool isWaitingForClear = false;

// ============================================================================
// 4. SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=============================================");
  Serial.println("  EcoReward Smart Bin - Starting Firmware");
  Serial.println("=============================================");

  // Pin Modes
  pinMode(PIN_IR_SENSOR, INPUT);

  // Initialize Servo
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  dispenserServo.setPeriodHertz(50);
  dispenserServo.attach(PIN_SERVO, 500, 2400);
  dispenserServo.write(0); // Rest position
  delay(500);

  // Initialize HX711 Load Cell
  Serial.print("[HX711] Initializing scale on pins DT=");
  Serial.print(PIN_HX711_DT);
  Serial.print(", SCK=");
  Serial.println(PIN_HX711_SCK);
  
  scale.begin(PIN_HX711_DT, PIN_HX711_SCK);
  scale.set_scale(CALIBRATION_FACTOR);
  scale.tare(); // Zero the scale
  Serial.println("[HX711] Scale tared and ready!");

  // Connect to Wi-Fi
  connectWiFi();

  Serial.println("[SYSTEM] Ready! Waiting for user waste deposit...");
}

// ============================================================================
// 5. MAIN LOOP
// ============================================================================
void loop() {
  // Check Wi-Fi connection
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  // Read Sensors
  // Note: Most IR proximity sensors output LOW (0) when an object is detected
  bool irDetected = (digitalRead(PIN_IR_SENSOR) == LOW);
  long weightGrams = 0;

  if (scale.is_ready()) {
    weightGrams = (long)scale.get_units(3);
    if (weightGrams < 0) weightGrams = 0; // clamp negative noise
  }

  // Duplicate deposit protection: Wait until waste is removed before accepting new deposit
  if (isWaitingForClear) {
    if (!irDetected && weightGrams < 5) {
      delay(800); // Debounce
      scale.tare(); // Re-zero scale baseline
      isWaitingForClear = false;
      Serial.println("[STATE] Bin cleared and reset. Ready for next deposit!");
    }
    delay(200);
    return;
  }

  // Periodic heartbeat status to server
  if (millis() - lastHeartbeatTime > HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatTime = millis();
    sendHeartbeat(irDetected, weightGrams);
  }

  // Trigger deposit process if IR detects waste insertion AND load cell has weight >= 10g
  if (irDetected && weightGrams >= 10) {
    Serial.println("\n[BIN TRIGGER] Waste insertion detected!");
    Serial.print("  Stabilizing weight reading... ");
    delay(1200); // Allow physical bouncing/settling

    // Take average of 5 readings
    long finalWeight = (long)scale.get_units(5);
    if (finalWeight < 10) finalWeight = weightGrams;

    Serial.print("Final Net Weight: ");
    Serial.print(finalWeight);
    Serial.println(" g");

    // Transmit to Python backend
    bool processed = sendDepositToServer(finalWeight, irDetected);

    if (processed) {
      Serial.println("[ACTION] Dispensing reward slip via servo...");
      dispenseRewardSlip();
      isWaitingForClear = true; // Lock duplicate deposits until bin path clears
    } else {
      Serial.println("[WARNING] Deposit was not accepted by server (check if camera scanned item first).");
      delay(2000);
    }
  }

  delay(100);
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

// Send HTTP POST request when waste is inserted
bool sendDepositToServer(long weight, bool irState) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  http.begin(URL_DEPOSIT);
  http.addHeader("Content-Type", "application/json");

  // Construct JSON payload
  StaticJsonDocument<200> reqDoc;
  reqDoc["weight"] = weight;
  reqDoc["ir_detected"] = irState;

  String reqBody;
  serializeJson(reqDoc, reqBody);

  Serial.print("[HTTP POST] Sending payload to ");
  Serial.println(URL_DEPOSIT);
  Serial.print("  Body: ");
  Serial.println(reqBody);

  int httpCode = http.POST(reqBody);
  bool success = false;

  if (httpCode > 0) {
    String response = http.getString();
    Serial.print("[HTTP ");
    Serial.print(httpCode);
    Serial.println("] Response: " + response);

    StaticJsonDocument<512> resDoc;
    DeserializationError err = deserializeJson(resDoc, response);
    if (!err && resDoc["dispense"] == true) {
      success = true;
    }
  } else {
    Serial.print("[HTTP ERROR] Failed POST: ");
    Serial.println(http.errorToString(httpCode).c_str());
  }

  http.end();
  return success;
}

// Send periodic heartbeat to keep the web UI monitor updated
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
    }
  }
  http.end();
}

// Dispense paper slip via servo rotation
void dispenseRewardSlip() {
  Serial.println("[SERVO] Rotating to push printed receipt slip...");
  dispenserServo.write(90); // Rotate 90 degrees to push slip
  delay(1200);              // Allow slip to push out
  dispenserServo.write(0);  // Return to home position
  delay(500);
}

