import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from http import HTTPStatus
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "fitrank.db"


def blank_state(email):
    return {
        "email": email,
        "xp": 0,
        "program": [],
        "workouts": [],
        "measurements": [],
        "foods": [],
        "assistant": [
            {
                "role": "ai",
                "text": "Hazirim. Programini, olculerini ve besinlerini girdikce sana daha net oneri verecegim.",
            }
        ],
    }


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                state_json TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
            """
        )


def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120000)
    return base64.b64encode(digest).decode("ascii"), salt


def verify_password(password, salt, expected_hash):
    actual_hash, _ = hash_password(password, salt)
    return hmac.compare_digest(actual_hash, expected_hash)


def json_response(handler, payload, status=HTTPStatus.OK):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def parse_json(handler):
    length = int(handler.headers.get("Content-Length") or 0)
    if length == 0:
        return {}
    raw = handler.rfile.read(length).decode("utf-8")
    return json.loads(raw)


def state_for_user(user_id):
    with db() as conn:
        row = conn.execute("SELECT state_json FROM users WHERE id = ?", (user_id,)).fetchone()
    return json.loads(row["state_json"]) if row else None


def save_state(user_id, state):
    with db() as conn:
        conn.execute("UPDATE users SET state_json = ? WHERE id = ?", (json.dumps(state, ensure_ascii=False), user_id))


def user_from_token(token):
    if not token:
        return None
    with db() as conn:
        return conn.execute(
            """
            SELECT users.id, users.email
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token = ?
            """,
            (token,),
        ).fetchone()


def auth_user(handler):
    header = handler.headers.get("Authorization", "")
    token = header.removeprefix("Bearer ").strip()
    return user_from_token(token)


class FitRankHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    def do_POST(self):
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/auth/register":
                return self.register()
            if parsed.path == "/api/auth/login":
                return self.login()
            if parsed.path == "/api/state":
                return self.update_state()
            if parsed.path == "/api/telegram/login":
                return self.telegram_login()
            return json_response(self, {"error": "Not found"}, HTTPStatus.NOT_FOUND)
        except json.JSONDecodeError:
            return json_response(self, {"error": "Invalid JSON"}, HTTPStatus.BAD_REQUEST)
        except Exception as error:
            return json_response(self, {"error": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/state":
            user = auth_user(self)
            if not user:
                return json_response(self, {"error": "Unauthorized"}, HTTPStatus.UNAUTHORIZED)
            return json_response(self, {"state": state_for_user(user["id"])})
        return super().do_GET()

    def register(self):
        payload = parse_json(self)
        email = (payload.get("email") or "").strip().lower()
        password = payload.get("password") or ""
        if "@" not in email or len(password) < 4:
            return json_response(self, {"error": "E-posta veya sifre gecersiz."}, HTTPStatus.BAD_REQUEST)
        password_hash, salt = hash_password(password)
        state = blank_state(email)
        try:
            with db() as conn:
                cur = conn.execute(
                    "INSERT INTO users(email, password_hash, salt, state_json, created_at) VALUES (?, ?, ?, ?, ?)",
                    (email, password_hash, salt, json.dumps(state, ensure_ascii=False), int(time.time())),
                )
                user_id = cur.lastrowid
        except sqlite3.IntegrityError:
            return json_response(self, {"error": "Bu e-posta zaten kayitli."}, HTTPStatus.CONFLICT)
        token = self.create_session(user_id)
        return json_response(self, {"token": token, "state": state})

    def login(self):
        payload = parse_json(self)
        email = (payload.get("email") or "").strip().lower()
        password = payload.get("password") or ""
        with db() as conn:
            user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if not user or not verify_password(password, user["salt"], user["password_hash"]):
            return json_response(self, {"error": "E-posta veya sifre hatali."}, HTTPStatus.UNAUTHORIZED)
        token = self.create_session(user["id"])
        return json_response(self, {"token": token, "state": json.loads(user["state_json"])})

    def update_state(self):
        user = auth_user(self)
        if not user:
            return json_response(self, {"error": "Unauthorized"}, HTTPStatus.UNAUTHORIZED)
        payload = parse_json(self)
        state = payload.get("state")
        if not isinstance(state, dict):
            return json_response(self, {"error": "State eksik."}, HTTPStatus.BAD_REQUEST)
        state["email"] = user["email"]
        save_state(user["id"], state)
        return json_response(self, {"ok": True, "state": state})

    def telegram_login(self):
        payload = parse_json(self)
        email = (payload.get("email") or "").strip().lower()
        password = payload.get("password") or ""
        with db() as conn:
            user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if not user or not verify_password(password, user["salt"], user["password_hash"]):
            return json_response(self, {"error": "E-posta veya sifre hatali."}, HTTPStatus.UNAUTHORIZED)
        token = self.create_session(user["id"])
        return json_response(self, {"token": token, "email": email})

    def create_session(self, user_id):
        token = secrets.token_urlsafe(32)
        with db() as conn:
            conn.execute(
                "INSERT INTO sessions(token, user_id, created_at) VALUES (?, ?, ?)",
                (token, user_id, int(time.time())),
            )
        return token


def main():
    init_db()
    host = os.environ.get("FITRANK_HOST", "0.0.0.0")
    port = int(os.environ.get("FITRANK_PORT", "8080"))
    print(f"FitRank backend calisiyor: http://{host}:{port}")
    print(f"Veritabani: {DB_PATH}")
    ThreadingHTTPServer((host, port), FitRankHandler).serve_forever()


if __name__ == "__main__":
    main()
