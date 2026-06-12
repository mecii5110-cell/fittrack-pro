import { createSession, json, readJson, verifyPassword } from "../../_lib.js";

export async function onRequestPost({ request, env }) {
  const payload = await readJson(request);
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");
  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  if (!user || !(await verifyPassword(password, user.salt, user.password_hash))) {
    return json({ error: "E-posta veya sifre hatali." }, 401);
  }
  const token = await createSession(env, user.id);
  return json({ token, state: JSON.parse(user.state_json) });
}
