const https = require("https");
const fs = require("fs");
const path = require("path");

const token = process.argv[2] || process.env.TELEGRAM_BOT_TOKEN;
const dataFile = path.join(__dirname, "telegram-data.json");
if (!token) {
  console.log("Kullanım: node telegram-bot.js BOT_TOKEN");
  process.exit(1);
}

const readData = () => fs.existsSync(dataFile) ? JSON.parse(fs.readFileSync(dataFile, "utf8")) : {};
const writeData = (data) => fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
const today = () => new Date().toISOString().slice(0, 10);

function api(method, payload) {
  const body = JSON.stringify(payload);
  const req = https.request({
    hostname: "api.telegram.org",
    path: `/bot${token}/${method}`,
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
  });
  req.on("error", console.error);
  req.write(body);
  req.end();
}

function reply(chatId, text) {
  api("sendMessage", { chat_id: chatId, text });
}

function parseCommand(text) {
  const [cmd, ...rest] = text.trim().split(/\s+/);
  return { cmd: cmd.toLowerCase(), rest: rest.join(" ") };
}

let offset = 0;
function poll() {
  https.get(`https://api.telegram.org/bot${token}/getUpdates?timeout=25&offset=${offset}`, (res) => {
    let raw = "";
    res.on("data", (chunk) => raw += chunk);
    res.on("end", () => {
      try {
        const json = JSON.parse(raw);
        (json.result || []).forEach(handleUpdate);
      } catch (error) {
        console.error(error.message);
      }
      poll();
    });
  }).on("error", () => setTimeout(poll, 3000));
}

function handleUpdate(update) {
  offset = update.update_id + 1;
  const message = update.message;
  if (!message || !message.text) return;
  const chatId = String(message.chat.id);
  const data = readData();
  data[chatId] ||= { xp: 0, weights: [], foods: [], workouts: [] };
  const user = data[chatId];
  const { cmd, rest } = parseCommand(message.text);

  if (cmd === "/start") {
    reply(chatId, "FitRank bot hazır. /kilo 82.4, /yemek 200g tavuk, /antrenman bench press 60kg 4x10 veya /rank yazabilirsin.");
  } else if (cmd === "/rank") {
    reply(chatId, `XP: ${user.xp}. Rank: ${rankName(user.xp)}.`);
  } else if (cmd === "/kilo") {
    const weight = Number(rest.replace(",", "."));
    if (!weight) return reply(chatId, "Örnek: /kilo 82.4");
    user.weights.push({ date: today(), weight });
    user.xp += 25;
    reply(chatId, `Kilo kaydedildi: ${weight} kg. +25 XP`);
  } else if (cmd === "/yemek") {
    user.foods.push({ date: today(), text: rest });
    user.xp += 10;
    reply(chatId, `Yemek kaydedildi: ${rest}. +10 XP`);
  } else if (cmd === "/antrenman") {
    user.workouts.push({ date: today(), text: rest });
    user.xp += 50;
    reply(chatId, `Antrenman kaydedildi: ${rest}. +50 XP`);
  } else {
    reply(chatId, "Komutlar: /rank, /kilo 82.4, /yemek 200g tavuk, /antrenman bench press 60kg 4x10");
  }
  writeData(data);
}

function rankName(xp) {
  const ranks = [["Demir",0],["Bronz",450],["Gümüş",950],["Altın",1600],["Plat",2450],["Yücelik",3500],["İmmortal",4900],["Radiant",6500]];
  return ranks.reduce((name, rank) => xp >= rank[1] ? rank[0] : name, "Demir");
}

poll();
console.log("FitRank Telegram bot çalışıyor.");
