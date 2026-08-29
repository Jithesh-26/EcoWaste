# EcoReward — Phase 2

A beginner-friendly starter web application for a smart waste-reward project.

## Included in this phase

- Local registration, login, logout, and user sessions
- SQLite database that saves accounts, deposits, and reward points
- Dashboard that shows each user's real saved totals and recent deposits
- Manual waste category and weight entry for the prototype
- Python backend serving HTML, CSS, and JavaScript (no installs required)

## Not included yet

- QR scanning and webcam access
- ML waste classification
- ESP32/load-cell integration

## Run locally

1. Install Python 3.10 or newer.
2. In this folder, create a virtual environment:
   ```powershell
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```
3. Install the dependency:
   ```powershell
   pip install -r requirements.txt
   ```
4. Start the app:
   ```powershell
   python app.py
   ```
5. Open `http://127.0.0.1:5000` in your browser.

## Project structure

```text
app.py                 Python backend and page routes
templates/             HTML pages
static/css/style.css   Shared styling
static/js/main.js      Small demo interactions
ecoreward.db           Created automatically; local account and deposit data
```
