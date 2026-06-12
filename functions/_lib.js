const encoder = new TextEncoder();

export function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function blankState(email) {
  return {
    email,
    xp: 0,
    program: [],
    workouts: [],
    measurements: [],
    foods: [],
    assistant: [
      {
        role: "ai",
        text: "Hazirim. Programini, olculerini ve besinlerini girdikce sana daha net oneri verecegim."
      }
    ]
  };
}

export function now() {
  return Math.floor(Date.now() / 1000);
}

export function makeToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function hashPassword(password, salt = makeToken()) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: encoder.encode(salt), iterations: 120000, hash: "SHA-256" },
    key,
    256
  );
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)));
  return { hash, salt };
}

export async function verifyPassword(password, salt, expectedHash) {
  const { hash } = await hashPassword(password, salt);
  return hash === expectedHash;
}

export async function createSession(env, userId) {
  const token = makeToken();
  await env.DB.prepare("INSERT INTO sessions(token, user_id, created_at) VALUES (?, ?, ?)")
    .bind(token, userId, now())
    .run();
  return token;
}

export async function userFromRequest(env, request) {
  const header = request.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  return env.DB.prepare(
    `SELECT users.id, users.email
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token = ?`
  ).bind(token).first();
}

export async function getState(env, userId) {
  const row = await env.DB.prepare("SELECT state_json FROM users WHERE id = ?").bind(userId).first();
  return row ? JSON.parse(row.state_json) : null;
}

export async function saveState(env, userId, email, state) {
  state.email = email;
  await env.DB.prepare("UPDATE users SET state_json = ? WHERE id = ?")
    .bind(JSON.stringify(state), userId)
    .run();
  return state;
}

export function rankName(xp) {
  const ranks = [
    ["Demir", 0], ["Bronz", 450], ["Gumus", 950], ["Altin", 1600],
    ["Plat", 2450], ["Yucelik", 3500], ["Immortal", 4900], ["Radiant", 6500]
  ];
  return ranks.reduce((current, rank) => xp >= rank[1] ? rank[0] : current, "Demir");
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function estimateFood(text) {
  const foods = {
    tavuk: { cal: 165, p: 31, c: 0, f: 3.6 },
    yumurta: { cal: 78, p: 6, c: 0.6, f: 5 },
    pilav: { cal: 130, p: 2.7, c: 28, f: 0.3 },
    makarna: { cal: 158, p: 5.8, c: 31, f: 0.9 },
    yulaf: { cal: 389, p: 16.9, c: 66, f: 6.9 },
    sut: { cal: 60, p: 3.2, c: 4.8, f: 3.3 },
    muz: { cal: 105, p: 1.3, c: 27, f: 0.4 },
    yogurt: { cal: 61, p: 3.5, c: 4.7, f: 3.3 },
    ekmek: { cal: 265, p: 9, c: 49, f: 3.2 },
    pirinc: { cal: 130, p: 2.7, c: 28, f: 0.3 }
  };
  const lower = text.toLocaleLowerCase("tr-TR");
  let total = { cal: 0, p: 0, c: 0, f: 0 };
  for (const [name, macro] of Object.entries(foods)) {
    if (!lower.includes(name)) continue;
    const before = lower.slice(0, lower.indexOf(name));
    const match = before.match(/(\d+)\s*(g|gr|gram|ml|adet|kase)?\s*$/);
    let multiplier = 1;
    if (match) {
      const amount = Number(match[1]);
      const unit = match[2] || "g";
      multiplier = unit === "adet" ? amount : unit === "kase" ? amount * 1.5 : amount / 100;
    }
    total.cal += macro.cal * multiplier;
    total.p += macro.p * multiplier;
    total.c += macro.c * multiplier;
    total.f += macro.f * multiplier;
  }
  if (total.cal === 0) total = { cal: 250, p: 12, c: 28, f: 8 };
  return Object.fromEntries(Object.entries(total).map(([key, value]) => [key, Math.round(value)]));
}
