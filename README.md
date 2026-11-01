# EcoReward — Smart Waste Bin System

A complete smart waste-reward prototype combining an AI computer-vision web interface, a local Python SQLite backend, and an ESP32 IoT smart bin with load cell scale, IR proximity sensing, and automatic receipt slip dispenser.

---

## 🌟 Key Features

1. **AI Vision Classifier (TensorFlow.js + MobileNet):**
   - Classifies waste into **Plastic**, **Paper**, **Metal**, or **Other**.
   - Requires at least **70% confidence** to lock in the category; otherwise prompts the user to re-show the item.
2. **Smart Bin Hardware Integration (ESP32):**
   - **IR Sensor:** Detects when waste is dropped into the bin intake.
   - **HX711 + 1kg Load Cell:** Measures the stable weight in grams.
   - **Buzzer:** Sounds an audible double-beep confirmation.
   - **Servo Motor:** Rotates to dispense a printed EcoReward paper receipt slip from a slot.
3. **Duplicate Prevention:**
   - Locks the state machine so the same waste item cannot be awarded points twice.
   - Requires the IR beam to clear and the scale to return to tare zero before unlocking the next deposit.
4. **Live Hardware Monitor & Tare Control:**
   - Real-time indicator on the web dashboard showing ESP32 status, IR beam state, and current live scale weight.
   - Remote "Tare Zero" button to calibrate scale on demand.
5. **Interactive Demo Mode:**
   - Built-in simulator to test the complete 17-step flow (camera lock, bin insert, points award, and slip output) without physical hardware.
6. **Manual Backup Mode:**
   - Fallback option to record deposits manually.

---

## 📋 Reward Rates

| Waste Type | Rate | Example |
|---|---|---|
| **Plastic** | **5 points** per 100 g | 250 g = **13 pts** |
| **Metal** | **8 points** per 100 g | 150 g = **12 pts** |
| **Paper** | **3 points** per 100 g | 300 g = **9 pts** |
| **Other** | **1 point** per 100 g | 500 g = **5 pts** |

---

## 🔌 Hardware Wiring & ESP32 Pin Plan

```text
HX711 VCC    → ESP32 3.3V
HX711 GND    → ESP32 GND
HX711 DT     → GPIO 25 (D25)
HX711 SCK    → GPIO 26 (D26)

IR Sensor VCC → ESP32 3.3V
IR Sensor GND → ESP32 GND
IR Sensor OUT → GPIO 27 (D27)

Servo Signal → GPIO 18 (D18)  ⚠️ MUST USE EXTERNAL 5V POWER SUPPLY!
Buzzer       → Disconnected for now (can use GPIO 4 or 19 later)

Load Cell to HX711:
Red   → E+
Black → E-
Green → A+
White → A-
```

> ⚠️ **CRITICAL SERVO POWER NOTE:**  
> The servo motor must be powered by an **external 5V power supply** (e.g. 5V battery pack or 5V USB breakout).  
> **Connect the external power supply GND to the ESP32 GND (common ground).**  
> Do **NOT** power the servo motor directly from the ESP32 3.3V pin, as this will trigger CPU brownout resets.

---

## 🚀 Running the Web Application

### 1. Start the Python Backend
Ensure Python 3.10+ is installed:
```powershell
python app.py
```
Open **[http://127.0.0.1:5000](http://127.0.0.1:5000)** in your browser.

### 2. Find Your Laptop's Local IP Address
Your ESP32 is on Wi-Fi and **cannot** use `127.0.0.1`. It needs your laptop's local IPv4 address on your Wi-Fi network:
```powershell
ipconfig
```
Look for `IPv4 Address` under your active Wi-Fi adapter (for example: `10.0.11.140` or `192.168.1.50`).

---

## ⚡ Flashing the ESP32

1. Open the Arduino IDE.
2. Install the required libraries via **Sketch → Include Library → Manage Libraries...**:
   - `HX711` by *Bogde*
   - `ESP32Servo` by *Kevin Harrington*
   - `ArduinoJson` by *Benoit Blanchon* (v6 or v7)
3. Open `esp32/eco_reward_esp32.ino`.
4. Update the Wi-Fi and server settings at the top:
   ```cpp
   const char* WIFI_SSID     = "YOUR_WIFI_NAME";
   const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
   const char* SERVER_HOST   = "10.0.11.140"; // Your laptop's Wi-Fi IP
   const int   SERVER_PORT   = 5000;
   ```
5. Select your ESP32 board and COM port, then click **Upload**.

---

## 🧪 Testing with Demo Mode (No Hardware Needed)

1. Log in at [http://127.0.0.1:5000](http://127.0.0.1:5000) (Demo account: `demo@ecoreward.local` / `demo123`).
2. Go to **Deposit Waste**.
3. Allow camera access. Click **Scan & Classify Waste Item**.
   - If confidence is $\ge 70\%$, the category locks in.
4. Click the **📡 Demo Simulator** tab.
5. Click **🧴 250g Plastic (+13 pts)** or enter a custom weight.
6. Watch:
   - Points get awarded immediately.
   - The double-beep chime plays.
   - The animated **EcoReward ATM Receipt Slip** slides out displaying category, weight, and new balance.

---

## 📁 Project Structure

```text
app.py                    Python backend (ThreadingHTTPServer + SQLite REST API)
templates/                HTML templates (login, register, dashboard, deposit, activity, rewards)
static/css/style.css      Design and receipt slip animation styles
static/js/main.js         TensorFlow.js AI classifier, hardware monitor, & demo simulator
esp32/eco_reward_esp32.ino Complete Arduino ESP32 firmware
ecoreward.db              SQLite database storing accounts, deposits, and rewards
```
