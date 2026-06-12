import { blankState, createSession, hashPassword, json, now, readJson } from "../../_lib.js";

export async function onRequestPost({ request, env }) {
  const payload = await readJson(request);
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");
  if (!email.includes("@") || password.length < 4) {
    return json({ error: "E-posta veya sifre gecersiz." }, 400);
  }

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) return json({ error: "Bu e-posta zaten kayitli." }, 409);

  const { hash, salt } = await hashPassword(password);
  const state = blankState(email);
  const created = await env.DB.prepare(
    "INSERT INTO users(email, password_hash, salt, state_json, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(email, hash, salt, JSON.stringify(state), now()).run();
  const userId = created.meta.last_row_id;
  const token = await createSession(env, userId);
  return json({ token, state });
}
