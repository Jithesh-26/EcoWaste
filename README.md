# EcoReward — AI-Powered Smart Waste Bin & Recycling Reward System

**EcoReward** is an end-to-end smart waste-segregation and gamified recycling platform. It combines an in-browser **AI Computer Vision Classifier**, an **ESP32 IoT Smart Bin** (with load cell weighing, IR drop sensing, and a physical servo receipt dispenser), and a **Python + SQLite Web Dashboard** with real-time digital scale streaming and on-demand reward slip collection.

---

## 📑 Table of Contents

- [System Architecture](#-system-architecture)
- [End-to-End User Flow](#-end-to-end-user-flow)
- [Key Features](#-key-features)
- [Reward Calculation & Point Rates](#-reward-calculation--point-rates)
- [Hardware Setup & Circuit Wiring](#-hardware-setup--circuit-wiring)
- [Quick Start Guide](#-quick-start-guide)
  - [1-Click Launch (Windows)](#1-1-click-launch-windows)
  - [Manual Command-Line Launch](#2-manual-command-line-launch)
  - [Flashing the ESP32 Firmware](#3-flashing-the-esp32-firmware)
- [Testing Without Physical Hardware (Demo Mode)](#-testing-without-physical-hardware-demo-mode)
- [REST API Reference](#-rest-api-reference)
- [Database Schema](#-database-schema)
- [Project Directory Structure](#-project-directory-structure)

---

## 🏛️ System Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           WEB FRONTEND & CLIENT                             │
│  - Webcam AI Inference (TensorFlow.js + MobileNet)                          │
│  - Real-time Digital LCD Weigh Scale (400ms low-latency polling)            │
│  - On-Demand "Collect Reward Slip" Action Button                            │
│  - Animated ATM Receipt Slip & Web Audio Chime                              │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTP / REST (JSON)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PYTHON BACKEND (app.py)                           │
│  - ThreadingHTTPServer listening on 0.0.0.0:5000                            │
│  - Hardware Synchronization & State Machine Engine                          │
│  - Session Management & Scrypt-hashed Authentication                        │
│  - SQLite Database (ecoreward.db) Ledger & Balance Engine                   │
└──────────────────────────────────────▲──────────────────────────────────────┘
                                       │ HTTP / Wi-Fi Heartbeat (400ms)
                                       │
┌──────────────────────────────────────┴──────────────────────────────────────┐
│                        ESP32 IOT SMART BIN CONTROLLER                       │
│  - HX711 24-bit ADC + Strain-Gauge 1kg Load Cell                            │
│  - Active-LOW Infrared (IR) Proximity Intake Sensor                         │
│  - Micro Servo Motor Receipt Dispenser (Rotates on user demand)             │
│  - Automatic Scale Tare Zeroing & Anti-Duplicate Protection                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 End-to-End User Flow

1. **Step 1: AI Camera Scan & Classification**
   - User holds a waste item up to the laptop/device camera.
   - TensorFlow.js with MobileNet identifies the item into: **Plastic**, **Metal**, **Paper**, or **Other**.
   - The UI automatically locks in the category and smoothly scrolls to the live weigh scale.

2. **Step 2: Live Weigh Scale & Bin Deposit**
   - User places the item on the bin intake platform.
   - The load cell continuously streams live weight readings (e.g. `250 g`) every 400ms to the LCD scale.
   - Estimated reward points calculate dynamically on-screen (e.g. `+13 pts`).
   - The bin IR sensor verifies the item insertion and saves the transaction in SQLite.
   - *Note: The servo motor and receipt do **NOT** dispense automatically.*

3. **Step 3: On-Demand Reward Slip Collection**
   - A celebration card appears on screen: **"🎉 Deposit Verified! +13 PTS"**.
   - User clicks the prominent **`[ 🎟️ Collect Reward Slip ➔ ]`** button.
   - **Both actions trigger synchronously:**
     1. The digital **EcoReward ATM receipt slip** slides down with an audible double-beep chime.
     2. A Wi-Fi dispense command is sent to the ESP32, which **rotates the servo motor** to push out the physical printed receipt!
   - When the user takes their receipt and clears the scale, the bin auto-tares for the next user.

---

## 🌟 Key Features

- **Client-Side AI Vision:** Zero cloud GPU cost. Runs directly inside the web browser using WebGL acceleration via TensorFlow.js.
- **Continuous Live Scale Streaming:** Real-time feedback showing grams and progress bar, reflecting physical bin status instantly.
- **On-Demand Dispensing:** User must click "Collect Reward", preventing slips from dispensing when users aren't ready to grab them.
- **Duplicate Deposit Prevention:** Hardware state machine locks deposits until the previous item is cleared and the load cell returns to zero baseline.
- **Remote Scale Tare:** Single-click "Tare Zero" button on the web dashboard to recalibrate the physical scale remotely.
- **Built-in Demo Simulator:** Complete virtual hardware simulator to test deposits, scale animations, points calculation, and receipt printing without physical electronics.
- **Gamified Rewards Catalog:** Users can redeem accumulated points for items like coffee coupons, reusable tote bags, and eco-friendly water bottles.

---

## 📋 Reward Calculation & Point Rates

Points are calculated on deposit using the formula:
$$\text{Points} = \max\left(1, \left\lfloor\frac{\text{Weight (g)} \times \text{Rate} + 50}{100}\right\rfloor\right)$$

| Waste Category | Rate per 100g | Example Weight | Example Reward |
|---|---|---|---|
| **Plastic** | **5 points** | 250 g | **+13 points** |
| **Metal** | **8 points** | 150 g | **+12 points** |
| **Paper** | **3 points** | 300 g | **+9 points** |
| **Other** | **1 point** | 500 g | **+5 points** |

---

## 🔌 Hardware Setup & Circuit Wiring

### ESP32 Pin Assignment

| Component | Pin / Signal | ESP32 GPIO | Power / Voltage |
|---|---|---|---|
| **HX711 Module** | VCC | 3.3V | 3.3V |
| **HX711 Module** | GND | GND | Ground |
| **HX711 Module** | DT (Data) | **GPIO 25 (D25)** | — |
| **HX711 Module** | SCK (Clock) | **GPIO 26 (D26)** | — |
| **IR Proximity Sensor** | VCC | 3.3V | 3.3V |
| **IR Proximity Sensor** | GND | GND | Ground |
| **IR Proximity Sensor** | OUT / DO | **GPIO 27 (D27)** | Active LOW |
| **Dispenser Servo** | Signal (Yellow/Orange) | **GPIO 18 (D18)** | PWM Signal |
| **Dispenser Servo** | VCC (Red) | **External +5V** | ⚠️ External 5V rail |
| **Dispenser Servo** | GND (Brown/Black) | **ESP32 GND** | **Common Ground** |

### Load Cell to HX711 Module Wiring
- **Red wire:** `E+` (Excitation +)
- **Black wire:** `E-` (Excitation -)
- **Green wire:** `A+` (Signal +)
- **White wire:** `A-` (Signal -)

> ⚠️ **CRITICAL SERVO POWER WARNING:**  
> Servo motors create high transient current spikes that will cause brownout resets if powered from the ESP32's onboard 3.3V pin.  
> Always power the servo from an **external 5V supply** (e.g. 5V battery or USB power breakout), and connect the **external power supply ground to the ESP32 GND (common ground)**.

---

## 🚀 Quick Start Guide

### 1. 1-Click Launch (Windows)
Simply **double-click** the included [`run.bat`](run.bat) file in the project folder:
- It automatically detects your local Python environment.
- Prints your laptop's current local Wi-Fi IP address in the terminal.
- Opens your default web browser directly to the Deposit page: **`http://127.0.0.1:5000/deposit`**.

### 2. Manual Command-Line Launch
```powershell
# 1. Activate environment / Ensure Python 3.10+
python --version

# 2. Start the backend
python app.py
```
Open **[http://127.0.0.1:5000](http://127.0.0.1:5000)** in your browser.

**Default Demo Account:**
- **Email:** `demo@ecoreward.local`
- **Password:** `demo123`

---

### 3. Flashing the ESP32 Firmware

1. Install the **Arduino IDE** (v2.x recommended).
2. Install the required libraries via **Tools → Manage Libraries...**:
   - `HX711` by *Bogdan Necula*
   - `ESP32Servo` by *Kevin Harrington*
   - `ArduinoJson` by *Benoit Blanchon* (v6 or v7)
3. Open `esp32/eco_reward_esp32/eco_reward_esp32.ino`.
4. Update your Wi-Fi credentials and laptop IP address at the top:
   ```cpp
   const char* WIFI_SSID     = "YOUR_WIFI_OR_HOTSPOT_NAME";
   const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
   const char* SERVER_HOST   = "10.251.76.170"; // Your laptop's Wi-Fi IPv4 address
   const int   SERVER_PORT   = 5000;
   ```
5. Select your board (e.g., **DOIT ESP32 DEVKIT V1**) and Port (e.g. **COM9**).
6. Click **Upload (➔)**.

---

## 🧪 Testing Without Physical Hardware (Demo Mode)

You can demonstrate the complete system without any physical electronics connected:
1. Log in to [http://127.0.0.1:5000/deposit](http://127.0.0.1:5000/deposit).
2. Allow webcam permissions and scan an item (or hold up a plastic bottle).
3. Click the **📡 Demo Simulator** tab.
4. Click **🧴 250g Plastic (+13 pts)** (or enter a custom weight).
5. Watch the digital scale climb to 250g in real time.
6. The celebratory card appears with **`[ 🎟️ Collect Reward Slip ]`**.
7. Click the button — the ATM paper receipt slides down with sound effects!

---

## 📡 REST API Reference

| Method | Endpoint | Description | Payload / Response |
|---|---|---|---|
| `GET` | `/api/hardware/status` | Polled by web UI to retrieve current scale reading & state | Returns JSON with `current_weight_g`, `step`, `esp32_connected`, `pending_category` |
| `POST` | `/api/hardware/status` | ESP32 heartbeat stream (runs every 400ms) | Body: `{"current_weight_g": 250, "ir_detected": true}`<br>Returns tare and dispense commands |
| `POST` | `/api/hardware/pending` | Locks the category detected by AI camera | Body: `{"category": "Plastic", "confidence": 92}` |
| `POST` | `/api/hardware/deposit` | Records a waste deposit into SQLite database | Body: `{"weight": 250, "ir_detected": true}`<br>Returns `ready_to_collect: true` |
| `POST` | `/api/hardware/collect` | Triggers receipt dispensing & servo rotation | Returns `{"success": true, "deposit": {...}}` |
| `POST` | `/api/hardware/tare` | Queues a tare zero signal to the ESP32 load cell | Returns confirmation message |
| `POST` | `/api/hardware/reset` | Resets state machine back to Camera Standby | Returns reset confirmation |

---

## 🗄️ Database Schema

The SQLite database (`ecoreward.db`) consists of 4 relational tables:

```sql
-- Registered user profiles and point balances
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 0
);

-- Item deposit history ledger
CREATE TABLE deposits (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    weight_g INTEGER NOT NULL,
    points INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Reward redemptions history
CREATE TABLE redemptions (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    reward_name TEXT NOT NULL,
    points_spent INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Active authenticated web sessions
CREATE TABLE sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
);
```

---

## 📁 Project Directory Structure

```text
├── app.py                                   # Python ThreadingHTTPServer backend & SQLite REST API
├── run.bat                                  # 1-click Windows launcher (starts server & browser)
├── requirements.txt                         # Python dependencies specification
├── ecoreward.db                             # SQLite database storing accounts and transactions
├── README.md                                # Comprehensive project documentation
├── esp32/
│   ├── eco_reward_esp32.ino                 # Complete Arduino ESP32 firmware
│   └── eco_reward_esp32/
│       └── eco_reward_esp32.ino             # Arduino IDE sketch package copy
├── templates/
│   ├── base.html                            # Master HTML layout and typography
│   ├── login.html                           # User login page
│   ├── register.html                        # User registration page
│   ├── dashboard.html                       # Points dashboard & sustainability impact metrics
│   ├── deposit.html                         # AI classification, live scale & reward claim UI
│   ├── activity.html                        # Transaction deposit history ledger
│   └── rewards.html                         # Reward coupon redemption store
└── static/
    ├── css/
    │   └── style.css                        # Design system, responsive layout & slip animations
    └── js/
        └── main.js                          # TensorFlow.js MobileNet classifier & hardware engine
```

---

## 👥 Contributors & License

Developed as part of the **EcoReward Smart Bin Project**.  
Licensed under the [MIT License](LICENSE).
