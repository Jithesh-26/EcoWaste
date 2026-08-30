"""EcoReward Phase 2: local accounts and a SQLite waste-reward database."""
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs
import hashlib
import html
import re
import json
import secrets
import sqlite3

ROOT = Path(__file__).parent
DATABASE = ROOT / "ecoreward.db"
SESSIONS = {}
RATES = {"Plastic": 5, "Paper": 3, "Metal": 8, "Other": 1}
REWARDS = {"Coffee coupon": 50, "Reusable tote bag": 100, "Eco water bottle": 200}


def connection():
    database = sqlite3.connect(DATABASE)
    database.row_factory = sqlite3.Row
    return database


def initialise_database():
    with connection() as database:
        database.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS deposits (
                id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, category TEXT NOT NULL,
                weight_g INTEGER NOT NULL, points INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS redemptions (
                id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, reward_name TEXT NOT NULL,
                points_spent INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY, user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
        """)
        user_count = database.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if user_count == 0:
            database.execute(
                "INSERT INTO users (name, email, password_hash, points) VALUES (?, ?, ?, ?)",
                ("Eco User", "demo@ecoreward.local", hash_password("demo123"), 100)
            )


def hash_password(password):
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=salt.encode(), n=2**14, r=8, p=1).hex()
    return f"{salt}${digest}"


def password_matches(password, saved_hash):
    salt, digest = saved_hash.split("$", 1)
    candidate = hashlib.scrypt(password.encode(), salt=salt.encode(), n=2**14, r=8, p=1).hex()
    return secrets.compare_digest(candidate, digest)


def render_page(filename, values=None):
    values = values or {}
    layout = (ROOT / "templates" / "base.html").read_text(encoding="utf-8")
    page = (ROOT / "templates" / filename).read_text(encoding="utf-8")
    title = re.search(r'{% block title %}(.*?){% endblock %}', page, re.S).group(1).strip()
    content = re.search(r'{% block content %}(.*?){% endblock %}', page, re.S).group(1).strip()
    layout = re.sub(r'{% block title %}.*?{% endblock %}', title, layout, flags=re.S)
    layout = re.sub(r'{% block content %}.*?{% endblock %}', content, layout, flags=re.S)
    layout = layout.replace("{{ url_for('static', filename='css/style.css') }}", "/static/css/style.css")
    layout = layout.replace("{{ url_for('static', filename='js/main.js') }}", "/static/js/main.js")
    for key, value in values.items():
        layout = layout.replace(f"[[{key}]]", str(value))
    return layout


class EcoRewardHandler(BaseHTTPRequestHandler):
    def send_html(self, body, status=200, cookie=None):
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def redirect(self, location, cookie=None):
        self.send_response(303)
        self.send_header("Location", location)
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()

    def form_data(self):
        length = int(self.headers.get("Content-Length", 0))
        return {key: value[0].strip() for key, value in parse_qs(self.rfile.read(length).decode()).items()}

    def json_data(self):
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except Exception:
            return {}

    def current_user(self):
        cookie = cookies.SimpleCookie(self.headers.get("Cookie")).get("ecoreward_session")
        token = cookie.value if cookie else None
        if token:
            with connection() as database:
                row = database.execute("SELECT u.* FROM users u JOIN sessions s ON u.id = s.user_id WHERE s.token = ?", (token,)).fetchone()
                if row:
                    return row
            if token in SESSIONS:
                user_id = SESSIONS[token]
                with connection() as database:
                    return database.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

        with connection() as database:
            return database.execute("SELECT * FROM users ORDER BY id ASC LIMIT 1").fetchone()

    def require_user(self):
        user = self.current_user()
        if not user:
            self.redirect("/")
        return user

    def do_GET(self):
        try:
            path = self.path.split("?", 1)[0]
            if path == "/":
                self.send_html(render_page("login.html", {"MESSAGE": ""})); return
            if path == "/register":
                self.send_html(render_page("register.html", {"MESSAGE": ""})); return
            if path == "/logout":
                session = cookies.SimpleCookie(self.headers.get("Cookie")).get("ecoreward_session")
                if session:
                    SESSIONS.pop(session.value, None)
                    with connection() as database:
                        database.execute("DELETE FROM sessions WHERE token = ?", (session.value,))
                self.redirect("/", "ecoreward_session=; Max-Age=0; Path=/"); return
            if path == "/dashboard":
                self.dashboard(); return
            if path == "/deposit":
                self.deposit_page(); return
            if path == "/activity":
                self.activity_page(); return
            if path == "/rewards":
                self.rewards_page(); return
            if path.startswith("/static/"):
                asset = ROOT / path.lstrip("/")
                if asset.is_file() and ROOT in asset.resolve().parents:
                    types = {".css": "text/css", ".js": "application/javascript"}
                    self.send_response(200); self.send_header("Content-Type", types.get(asset.suffix, "application/octet-stream")); self.end_headers(); self.wfile.write(asset.read_bytes())
                else:
                    self.send_error(404)
                return
            self.send_error(404)
        except Exception as e:
            import traceback
            traceback.print_exc()
            self.send_html(f"<h1>500 Internal Error</h1><pre>{html.escape(str(e))}\n{html.escape(traceback.format_exc())}</pre>", status=500)

    def do_POST(self):
        try:
            if self.path == "/register":
                self.register(); return
            if self.path == "/login":
                self.login(); return
            if self.path == "/deposit":
                self.save_deposit(); return
            if self.path == "/redeem":
                self.redeem_reward(); return
            if self.path == "/api/deposit":
                self.api_deposit(); return
            if self.path == "/api/classify":
                self.api_classify(); return
            self.send_error(404)
        except Exception as e:
            import traceback
            traceback.print_exc()
            self.send_html(f"<h1>500 Internal Error</h1><pre>{html.escape(str(e))}\n{html.escape(traceback.format_exc())}</pre>", status=500)

    def api_classify(self):
        payload = self.json_data()
        raw_label = payload.get("label", "").lower()
        category = "Other"
        if any(w in raw_label for w in ["bottle", "plastic", "container", "bucket", "cup"]):
            category = "Plastic"
        elif any(w in raw_label for w in ["can", "tin", "beer", "metal", "aluminum"]):
            category = "Metal"
        elif any(w in raw_label for w in ["paper", "carton", "cardboard", "box", "envelope"]):
            category = "Paper"

        rate = RATES.get(category, 1)
        self.send_json({
            "success": True,
            "detected_label": raw_label,
            "category": category,
            "rate_per_100g": rate,
            "message": f"Classified item as {category} ({rate} pts / 100g)."
        })

    def api_deposit(self):
        user = self.current_user()
        if not user:
            self.send_json({"success": False, "message": "No user found in database."}, status=401)
            return

        payload = self.json_data()
        category = payload.get("category", "")
        try:
            weight = int(payload.get("weight", 0))
        except (ValueError, TypeError):
            weight = 0

        if category not in RATES or not 1 <= weight <= 10000:
            self.send_json({"success": False, "message": "Choose a waste type and weight between 1 and 10,000g."}, status=400)
            return

        points = max(1, round(weight * RATES[category] / 100))
        with connection() as database:
            database.execute("INSERT INTO deposits (user_id, category, weight_g, points) VALUES (?, ?, ?, ?)", (user["id"], category, weight, points))
            database.execute("UPDATE users SET points = points + ? WHERE id = ?", (points, user["id"]))

        self.send_json({
            "success": True,
            "points": points,
            "weight_g": weight,
            "category": category,
            "message": f"Deposited {weight}g of {category.lower()} successfully."
        })

    def register(self):
        form = self.form_data(); name = form.get("name", ""); email = form.get("email", "").lower(); password = form.get("password", "")
        if len(name) < 2 or "@" not in email or len(password) < 4:
            self.send_html(render_page("register.html", {"MESSAGE": "Please enter a name, valid email, and password of at least 4 characters."})); return
        try:
            with connection() as database:
                user_id = database.execute("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)", (name, email, hash_password(password))).lastrowid
        except sqlite3.IntegrityError:
            self.send_html(render_page("register.html", {"MESSAGE": "That email already has an account. Please log in."})); return
        token = secrets.token_urlsafe(24); SESSIONS[token] = user_id
        with connection() as database:
            database.execute("INSERT OR REPLACE INTO sessions (token, user_id) VALUES (?, ?)", (token, user_id))
        self.redirect("/dashboard", f"ecoreward_session={token}; HttpOnly; Path=/; SameSite=Lax")

    def login(self):
        form = self.form_data(); email = form.get("email", "").lower(); password = form.get("password", "")
        with connection() as database:
            user = database.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if not user or not password_matches(password, user["password_hash"]):
            self.send_html(render_page("login.html", {"MESSAGE": "Email or password is not correct."})); return
        token = secrets.token_urlsafe(24); SESSIONS[token] = user["id"]
        with connection() as database:
            database.execute("INSERT OR REPLACE INTO sessions (token, user_id) VALUES (?, ?)", (token, user["id"]))
        self.redirect("/dashboard", f"ecoreward_session={token}; HttpOnly; Path=/; SameSite=Lax")

    def dashboard(self):
        user = self.require_user()
        if not user:
            return
        with connection() as database:
            deposits = database.execute("SELECT * FROM deposits WHERE user_id = ? ORDER BY id DESC LIMIT 4", (user["id"],)).fetchall()
            total_grams = database.execute("SELECT COALESCE(SUM(weight_g), 0) FROM deposits WHERE user_id = ?", (user["id"],)).fetchone()[0]
        activity = "".join(f'<div class="activity-row"><span class="circle blue-bg">♻</span><div><strong>{html.escape(item["category"])}</strong><p>{item["weight_g"]} g · {item["created_at"][:10]}</p></div><b>+{item["points"]} pts</b></div>' for item in deposits) or '<p class="empty-state">No deposits yet. Your first reward is waiting!</p>'
        self.send_html(render_page("dashboard.html", {"NAME": html.escape(user["name"].split()[0]), "INITIAL": html.escape(user["name"][0].upper()), "POINTS": user["points"], "WEIGHT": f"{total_grams / 1000:.2f}", "COUNT": len(deposits), "ACTIVITY": activity}))

    def deposit_page(self, message=""):
        user = self.require_user()
        if not user:
            return
        self.send_html(render_page("deposit.html", {"INITIAL": html.escape(user["name"][0].upper()), "MESSAGE": message}))

    def activity_page(self):
        user = self.require_user()
        if not user:
            return
        with connection() as database:
            deposits = database.execute("SELECT * FROM deposits WHERE user_id = ? ORDER BY id DESC", (user["id"],)).fetchall()
            redemptions = database.execute("SELECT * FROM redemptions WHERE user_id = ? ORDER BY id DESC", (user["id"],)).fetchall()
        
        rows = "".join(f'<tr><td>{html.escape(item["category"])}</td><td>{item["weight_g"]} g</td><td>+{item["points"]} pts</td><td>{item["created_at"][:10]}</td></tr>' for item in deposits) or '<tr><td colspan="4">No deposits saved yet.</td></tr>'
        redemption_rows = "".join(f'<tr><td>🎁 {html.escape(item["reward_name"])}</td><td>-{item["points_spent"]} pts</td><td>{item["created_at"][:10]}</td></tr>' for item in redemptions) or '<tr><td colspan="3">No rewards claimed yet.</td></tr>'

        self.send_html(render_page("activity.html", {
            "INITIAL": html.escape(user["name"][0].upper()),
            "ROWS": rows,
            "REDEMPTIONS_ROWS": redemption_rows
        }))

    def rewards_page(self, message=""):
        user = self.require_user()
        if not user:
            return
        with connection() as database:
            # Refresh user point balance from database
            user = database.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
            redemptions = database.execute("SELECT * FROM redemptions WHERE user_id = ? ORDER BY id DESC", (user["id"],)).fetchall()

        cards = "".join(f'<article class="reward-card"><div class="reward-icon">{icon}</div><h2>{name}</h2><p>{cost} points</p><form action="/redeem" method="post"><input type="hidden" name="reward" value="{name}"><button class="button full" type="submit" {"" if user["points"] >= cost else "disabled"}>Redeem</button></form></article>' for (name, cost), icon in zip(REWARDS.items(), ["☕", "👜", "💧"]))
        claimed = "".join(f'<tr><td>🎁 {html.escape(item["reward_name"])}</td><td>-{item["points_spent"]} pts</td><td>{item["created_at"][:10]}</td></tr>' for item in redemptions) or '<tr><td colspan="3">No rewards claimed yet.</td></tr>'

        self.send_html(render_page("rewards.html", {
            "INITIAL": html.escape(user["name"][0].upper()),
            "POINTS": user["points"],
            "MESSAGE": message,
            "CARDS": cards,
            "MY_CLAIMED_REWARDS": claimed
        }))

    def redeem_reward(self):
        user = self.require_user()
        if not user:
            return
        reward = self.form_data().get("reward", "")
        cost = REWARDS.get(reward)
        if not cost or user["points"] < cost:
            self.rewards_page("You do not have enough points for that reward."); return
        with connection() as database:
            database.execute("INSERT INTO redemptions (user_id, reward_name, points_spent) VALUES (?, ?, ?)", (user["id"], reward, cost))
            database.execute("UPDATE users SET points = points - ? WHERE id = ?", (cost, user["id"]))
        self.rewards_page(f"Success! You redeemed: {html.escape(reward)}.")

    def save_deposit(self):
        user = self.require_user()
        if not user:
            return
        form = self.form_data(); category = form.get("category", "")
        try:
            weight = int(form.get("weight", "0"))
        except ValueError:
            weight = 0
        if category not in RATES or not 1 <= weight <= 10000:
            self.deposit_page("Choose a waste type and enter a weight from 1 to 10,000 grams."); return
        points = max(1, round(weight * RATES[category] / 100))
        with connection() as database:
            database.execute("INSERT INTO deposits (user_id, category, weight_g, points) VALUES (?, ?, ?, ?)", (user["id"], category, weight, points))
            database.execute("UPDATE users SET points = points + ? WHERE id = ?", (points, user["id"]))
        self.deposit_page(f"Success! {weight} g of {category.lower()} saved. You earned {points} points.")


if __name__ == "__main__":
    initialise_database()
    ThreadingHTTPServer(("127.0.0.1", 5000), EcoRewardHandler).serve_forever()

