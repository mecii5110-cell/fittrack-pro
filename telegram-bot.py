import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

TOKEN = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("TELEGRAM_BOT_TOKEN")
BACKEND_URL = os.environ.get("FITRANK_BACKEND_URL", "http://127.0.0.1:8080").rstrip("/")
DATA_FILE = Path(__file__).with_name("telegram-sessions.json")
RANKS = [
    ("Demir", 0), ("Bronz", 450), ("Gumus", 950), ("Altin", 1600),
    ("Plat", 2450), ("Yucelik", 3500), ("Immortal", 4900), ("Radiant", 6500)
]
FOODS = {
    "tavuk": {"cal": 165, "p": 31, "c": 0, "f": 3.6},
    "yumurta": {"cal": 78, "p": 6, "c": 0.6, "f": 5},
    "pilav": {"cal": 130, "p": 2.7, "c": 28, "f": 0.3},
    "makarna": {"cal": 158, "p": 5.8, "c": 31, "f": 0.9},
    "yulaf": {"cal": 389, "p": 16.9, "c": 66, "f": 6.9},
    "sut": {"cal": 60, "p": 3.2, "c": 4.8, "f": 3.3},
    "muz": {"cal": 105, "p": 1.3, "c": 27, "f": 0.4},
    "yogurt": {"cal": 61, "p": 3.5, "c": 4.7, "f": 3.3},
    "ekmek": {"cal": 265, "p": 9, "c": 49, "f": 3.2},
    "pirinc": {"cal": 130, "p": 2.7, "c": 28, "f": 0.3},
}

if not TOKEN:
    print("Kullanim: python telegram-bot.py BOT_TOKEN")
    sys.exit(1)


def today():
    return time.strftime("%Y-%m-%d")


def read_sessions():
    if not DATA_FILE.exists():
        return {}
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def write_sessions(data):
    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def telegram_api(method, payload=None):
    payload = payload or {}
    body = urllib.parse.urlencode(payload).encode("utf-8")
    url = f"https://api.telegram.org/bot{TOKEN}/{method}"
    with urllib.request.urlopen(url, data=body, timeout=35) as response:
        return json.loads(response.read().decode("utf-8"))


def backend_api(path, payload=None, token=None, method="POST"):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{BACKEND_URL}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def reply(chat_id, text):
    telegram_api("sendMessage", {"chat_id": chat_id, "text": text})


def rank_name(xp):
    current = "Demir"
    for name, need in RANKS:
        if xp >= need:
            current = name
    return current


def estimate_food(text):
    lower = text.lower()
    total = {"cal": 0, "p": 0, "c": 0, "f": 0}
    for name, macro in FOODS.items():
        if name not in lower:
            continue
        before = lower[: lower.index(name)]
        match = re.search(r"(\d+)\s*(g|gr|gram|ml|adet|kase)?\s*$", before)
        multiplier = 1
        if match:
            amount = int(match.group(1))
            unit = match.group(2) or "g"
            multiplier = amount if unit == "adet" else amount * 1.5 if unit == "kase" else amount / 100
        for key in total:
            total[key] += macro[key] * multiplier
    if total["cal"] == 0:
        total = {"cal": 250, "p": 12, "c": 28, "f": 8}
    return {key: round(value) for key, value in total.items()}


def get_state(chat_id):
    sessions = read_sessions()
    token = sessions.get(str(chat_id), {}).get("token")
    if not token:
        return None, None
    return token, backend_api("/api/state", token=token, method="GET")["state"]


def save_state(token, state):
    backend_api("/api/state", {"state": state}, token=token)


def handle_message(message):
    text = message.get("text", "").strip()
    if not text:
        return
    chat_id = str(message["chat"]["id"])
    parts = text.split(maxsplit=1)
    command = parts[0].lower()
    rest = parts[1] if len(parts) > 1 else ""

    if command == "/start":
        reply(chat_id, "FitRank bot hazir. Once /login email sifre yaz. Sonra /kilo, /yemek, /antrenman veya /rank kullan.")
        return

    if command == "/login":
        creds = rest.split(maxsplit=1)
        if len(creds) != 2:
            reply(chat_id, "Ornek: /login sen@example.com sifren")
            return
        try:
            data = backend_api("/api/telegram/login", {"email": creds[0], "password": creds[1]})
        except urllib.error.HTTPError:
            reply(chat_id, "Giris basarisiz. Web uygulamasinda kayit oldugun email ve sifreyi kullan.")
            return
        sessions = read_sessions()
        sessions[chat_id] = {"token": data["token"], "email": data["email"]}
        write_sessions(sessions)
        reply(chat_id, f"Baglandi: {data['email']}")
        return

    token, state = get_state(chat_id)
    if not token:
        reply(chat_id, "Once /login email sifre ile FitRank hesabina baglan.")
        return

    if command == "/rank":
        reply(chat_id, f"XP: {state.get('xp', 0)}. Rank: {rank_name(state.get('xp', 0))}.")
    elif command == "/kilo":
        try:
            weight = float(rest.replace(",", "."))
        except ValueError:
            reply(chat_id, "Ornek: /kilo 82.4")
            return
        state.setdefault("measurements", []).append({"date": today(), "height": 0, "weight": weight, "waist": 0})
        state["xp"] = state.get("xp", 0) + 25
        save_state(token, state)
        reply(chat_id, f"Kilo kaydedildi: {weight} kg. +25 XP")
    elif command == "/yemek":
        if not rest:
            reply(chat_id, "Ornek: /yemek 200g tavuk 1 kase pilav")
            return
        macros = estimate_food(rest)
        state.setdefault("foods", []).append({"id": f"tg-{time.time()}", "date": today(), "meal": "Telegram", "text": rest, **macros})
        state["xp"] = state.get("xp", 0) + 10
        save_state(token, state)
        reply(chat_id, f"Yemek kaydedildi: {rest}. {macros['cal']} kcal, {macros['p']}g protein. +10 XP")
    elif command == "/antrenman":
        if not rest:
            reply(chat_id, "Ornek: /antrenman bench press 60kg 4x10")
            return
        state.setdefault("workouts", []).append({
            "id": f"tg-{time.time()}",
            "date": today(),
            "exerciseId": "telegram",
            "exercise": rest,
            "area": "Telegram",
            "weight": 0,
            "sets": 0,
            "reps": 0,
            "volume": 0,
        })
        state["xp"] = state.get("xp", 0) + 50
        save_state(token, state)
        reply(chat_id, f"Antrenman kaydedildi: {rest}. +50 XP")
    else:
        reply(chat_id, "Komutlar: /login, /rank, /kilo 82.4, /yemek 200g tavuk, /antrenman bench press 60kg 4x10")


def main():
    print(f"FitRank Telegram bot calisiyor. Backend: {BACKEND_URL}")
    offset = 0
    while True:
        try:
            result = telegram_api("getUpdates", {"timeout": 25, "offset": offset}).get("result", [])
            for update in result:
                offset = update["update_id"] + 1
                if "message" in update:
                    handle_message(update["message"])
        except Exception as error:
            print(f"Bot hatasi: {error}")
            time.sleep(3)


if __name__ == "__main__":
    main()
