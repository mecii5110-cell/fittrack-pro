import { getState, json, readJson, saveState, userFromRequest } from "../_lib.js";

export async function onRequestGet({ request, env }) {
  const user = await userFromRequest(env, request);
  if (!user) return json({ error: "Unauthorized" }, 401);
  return json({ state: await getState(env, user.id) });
}

export async function onRequestPost({ request, env }) {
  const user = await userFromRequest(env, request);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const payload = await readJson(request);
  if (!payload.state || typeof payload.state !== "object") {
    return json({ error: "State eksik." }, 400);
  }
  const state = await saveState(env, user.id, user.email, payload.state);
  return json({ ok: true, state });
}
