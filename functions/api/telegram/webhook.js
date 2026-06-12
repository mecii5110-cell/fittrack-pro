import {
  createSession,
  estimateFood,
  getState,
  json,
  rankName,
  readJson,
  saveState,
  today,
  verifyPassword
} from "../../_lib.js";

async function telegramReply(env, chatId, text) {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

async function sessionForChat(env, chatId) {
  const row = await env.DB.prepare(
    `SELECT telegram_sessions.token, users.id, users.email
     FROM telegram_sessions
     JOIN sessions ON sessions.token = telegram_sessions.token
     JOIN users ON users.id = sessions.user_id
     WHERE telegram_sessions.chat_id = ?`
  ).bind(String(chatId)).first();
  return row || null;
}

export async function onRequestPost({ request, env }) {
  const update = await readJson(request);
  const message = update.message;
  if (!message || !message.text || !message.chat) return json({ ok: true });

  const chatId = String(message.chat.id);
  const text = message.text.trim();
  const [commandRaw, ...restParts] = text.split(/\s+/);
  const command = commandRaw.toLowerCase();
  const rest = restParts.join(" ");

  if (command === "/start") {
    await telegramReply(env, chatId, "FitRank bot hazir. Once /login email sifre yaz. Sonra /kilo, /yemek, /antrenman veya /rank kullan.");
    return json({ ok: true });
  }

  if (command === "/login") {
    const [emailRaw, ...passwordParts] = restParts;
    const email = String(emailRaw || "").trim().toLowerCase();
    const password = passwordParts.join(" ");
    const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
    if (!user || !(await verifyPassword(password, user.salt, user.password_hash))) {
      await telegramReply(env, chatId, "Giris basarisiz. Web uygulamasinda kayit oldugun email ve sifreyi kullan.");
      return json({ ok: true });
    }
    const token = await createSession(env, user.id);
    await env.DB.prepare(
      "INSERT OR REPLACE INTO telegram_sessions(chat_id, token, email, created_at) VALUES (?, ?, ?, ?)"
    ).bind(chatId, token, email, Math.floor(Date.now() / 1000)).run();
    await telegramReply(env, chatId, `Baglandi: ${email}`);
    return json({ ok: true });
  }

  const session = await sessionForChat(env, chatId);
  if (!session) {
    await telegramReply(env, chatId, "Once /login email sifre ile FitRank hesabina baglan.");
    return json({ ok: true });
  }

  const state = await getState(env, session.id);
  if (command === "/rank") {
    await telegramReply(env, chatId, `XP: ${state.xp || 0}. Rank: ${rankName(state.xp || 0)}.`);
  } else if (command === "/kilo") {
    const weight = Number(rest.replace(",", "."));
    if (!weight) {
      await telegramReply(env, chatId, "Ornek: /kilo 82.4");
      return json({ ok: true });
    }
    state.measurements = state.measurements || [];
    state.measurements.push({ date: today(), height: 0, weight, waist: 0 });
    state.xp = (state.xp || 0) + 25;
    await saveState(env, session.id, session.email, state);
    await telegramReply(env, chatId, `Kilo kaydedildi: ${weight} kg. +25 XP`);
  } else if (command === "/yemek") {
    if (!rest) {
      await telegramReply(env, chatId, "Ornek: /yemek 200g tavuk 1 kase pilav");
      return json({ ok: true });
    }
    const macros = estimateFood(rest);
    state.foods = state.foods || [];
    state.foods.push({ id: crypto.randomUUID(), date: today(), meal: "Telegram", text: rest, ...macros });
    state.xp = (state.xp || 0) + 10;
    await saveState(env, session.id, session.email, state);
    await telegramReply(env, chatId, `Yemek kaydedildi: ${rest}. ${macros.cal} kcal, ${macros.p}g protein. +10 XP`);
  } else if (command === "/antrenman") {
    if (!rest) {
      await telegramReply(env, chatId, "Ornek: /antrenman bench press 60kg 4x10");
      return json({ ok: true });
    }
    state.workouts = state.workouts || [];
    state.workouts.push({
      id: crypto.randomUUID(),
      date: today(),
      exerciseId: "telegram",
      exercise: rest,
      area: "Telegram",
      weight: 0,
      sets: 0,
      reps: 0,
      volume: 0
    });
    state.xp = (state.xp || 0) + 50;
    await saveState(env, session.id, session.email, state);
    await telegramReply(env, chatId, `Antrenman kaydedildi: ${rest}. +50 XP`);
  } else {
    await telegramReply(env, chatId, "Komutlar: /login, /rank, /kilo 82.4, /yemek 200g tavuk, /antrenman bench press 60kg 4x10");
  }

  return json({ ok: true });
}
