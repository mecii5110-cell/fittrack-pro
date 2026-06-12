const days = ["Pazartesi", "Sali", "Carsamba", "Persembe", "Cuma", "Cumartesi", "Pazar"];
const ranks = [
  ["Demir", 0], ["Bronz", 450], ["Gumus", 950], ["Altin", 1600],
  ["Plat", 2450], ["Yucelik", 3500], ["Immortal", 4900], ["Radiant", 6500]
];
const foodDb = {
  tavuk: { cal: 165, p: 31, c: 0, f: 3.6 },
  yumurta: { cal: 78, p: 6, c: .6, f: 5 },
  pilav: { cal: 130, p: 2.7, c: 28, f: .3 },
  makarna: { cal: 158, p: 5.8, c: 31, f: .9 },
  yulaf: { cal: 389, p: 16.9, c: 66, f: 6.9 },
  sut: { cal: 60, p: 3.2, c: 4.8, f: 3.3 },
  muz: { cal: 105, p: 1.3, c: 27, f: .4 },
  yogurt: { cal: 61, p: 3.5, c: 4.7, f: 3.3 },
  ekmek: { cal: 265, p: 9, c: 49, f: 3.2 },
  pirinc: { cal: 130, p: 2.7, c: 28, f: .3 }
};

const $ = (id) => document.getElementById(id);
const todayIso = () => new Date().toISOString().slice(0, 10);
const trDate = (date = new Date()) => date.toLocaleDateString("tr-TR", { weekday: "long", day: "2-digit", month: "long" });
const currentDay = () => days[(new Date().getDay() + 6) % 7];

let authMode = "login";
let state = null;
let token = localStorage.getItem("fitrank.token");

function blankState(email) {
  return {
    email,
    xp: 0,
    program: [],
    workouts: [],
    measurements: [],
    foods: [],
    assistant: [{ role: "ai", text: "Hazirim. Programini, olculerini ve besinlerini girdikce sana daha net oneri verecegim." }]
  };
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Sunucu hatasi");
  return data;
}

function save() {
  if (!state || !token) return;
  localStorage.setItem("fitrank.lastState", JSON.stringify(state));
  api("/api/state", { method: "POST", body: JSON.stringify({ state }) }).catch((error) => {
    console.warn("Kayit sunucuya yazilamadi:", error.message);
  });
}

async function loadSession() {
  if (!token) return false;
  try {
    const data = await api("/api/state");
    state = data.state;
    showApp();
    return true;
  } catch {
    token = null;
    localStorage.removeItem("fitrank.token");
    return false;
  }
}

function init() {
  $("todayLabel").textContent = trDate();
  $("measureDate").value = todayIso();
  $("programDay").innerHTML = days.map((d) => `<option>${d}</option>`).join("");
  $("programDay").value = currentDay();
  bindEvents();
  loadSession();
}

function bindEvents() {
  document.querySelectorAll("[data-auth-mode]").forEach((btn) => btn.addEventListener("click", () => {
    authMode = btn.dataset.authMode;
    document.querySelectorAll("[data-auth-mode]").forEach((b) => b.classList.toggle("active", b === btn));
    $("authMessage").textContent = "";
  }));
  $("authForm").addEventListener("submit", handleAuth);
  $("logoutBtn").addEventListener("click", () => {
    token = null;
    state = null;
    localStorage.removeItem("fitrank.token");
    $("appShell").classList.add("hidden");
    $("authScreen").classList.remove("hidden");
  });
  document.querySelectorAll(".nav-item").forEach((btn) => btn.addEventListener("click", () => setView(btn.dataset.view)));
  document.querySelectorAll("[data-jump]").forEach((btn) => btn.addEventListener("click", () => setView(btn.dataset.jump)));
  $("programForm").addEventListener("submit", addProgram);
  $("measurementForm").addEventListener("submit", addMeasurement);
  $("foodForm").addEventListener("submit", addFood);
  $("assistantForm").addEventListener("submit", askAssistant);
  $("seedBtn").addEventListener("click", seedData);
  $("exportBtn").addEventListener("click", exportJson);
}

async function handleAuth(event) {
  event.preventDefault();
  const email = $("authEmail").value.trim().toLowerCase();
  const password = $("authPassword").value;
  $("authMessage").textContent = "Sunucuya baglaniyor...";
  try {
    const data = await api(authMode === "register" ? "/api/auth/register" : "/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    token = data.token;
    state = data.state || blankState(email);
    localStorage.setItem("fitrank.token", token);
    $("authMessage").textContent = "";
    showApp();
  } catch (error) {
    $("authMessage").textContent = error.message;
  }
}

function showApp() {
  $("authScreen").classList.add("hidden");
  $("appShell").classList.remove("hidden");
  $("userEmail").textContent = state.email;
  renderAll();
}

function setView(view) {
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === view));
  document.querySelectorAll(".nav-item").forEach((el) => el.classList.toggle("active", el.dataset.view === view));
  $("viewTitle").textContent = {
    dashboard: "Dashboard", program: "Programim", measurements: "Olcumler",
    nutrition: "Besin Takip", rank: "Rank Sistemi", assistant: "AI Asistan", telegram: "Telegram"
  }[view] || "Dashboard";
}

function addProgram(event) {
  event.preventDefault();
  state.program.push({
    id: crypto.randomUUID(),
    day: $("programDay").value,
    area: $("programArea").value.trim(),
    exercise: $("programExercise").value.trim(),
    sets: Number($("programSets").value),
    reps: Number($("programReps").value)
  });
  event.target.reset();
  $("programDay").value = currentDay();
  save();
  renderAll();
}

function addMeasurement(event) {
  event.preventDefault();
  state.measurements.push({
    date: $("measureDate").value,
    height: Number($("measureHeight").value),
    weight: Number($("measureWeight").value),
    waist: Number($("measureWaist").value || 0)
  });
  state.measurements.sort((a, b) => a.date.localeCompare(b.date));
  state.xp += 25;
  save();
  renderAll();
}

function addFood(event) {
  event.preventDefault();
  const text = $("foodText").value.trim();
  const macros = estimateFood(text);
  state.foods.push({ id: crypto.randomUUID(), date: todayIso(), meal: $("foodMeal").value, text, ...macros });
  state.xp += 10;
  $("foodText").value = "";
  save();
  renderAll();
}

function logWorkout(exerciseId, form) {
  const weight = Number(form.querySelector("[name=weight]").value);
  const sets = Number(form.querySelector("[name=sets]").value);
  const reps = Number(form.querySelector("[name=reps]").value);
  if (!weight || !sets || !reps) return;
  const exercise = state.program.find((x) => x.id === exerciseId);
  const volume = weight * sets * reps;
  state.workouts.push({ id: crypto.randomUUID(), date: todayIso(), exerciseId, exercise: exercise.exercise, area: exercise.area, weight, sets, reps, volume });
  state.xp += 35 + Math.round(volume / 80);
  save();
  renderAll();
}

function estimateFood(text) {
  const lower = text.toLocaleLowerCase("tr-TR");
  let total = { cal: 0, p: 0, c: 0, f: 0 };
  for (const [name, macro] of Object.entries(foodDb)) {
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
  return Object.fromEntries(Object.entries(total).map(([k, v]) => [k, Math.round(v)]));
}

function rankInfo() {
  let current = ranks[0], next = ranks[1];
  for (let i = 0; i < ranks.length; i++) {
    if (state.xp >= ranks[i][1]) {
      current = ranks[i];
      next = ranks[i + 1] || ranks[i];
    }
  }
  const span = Math.max(1, next[1] - current[1]);
  const progress = next === current ? 100 : Math.round(((state.xp - current[1]) / span) * 100);
  return { current: current[0], next: next[0], progress };
}

function renderAll() {
  renderProgram();
  renderMeasurements();
  renderNutrition();
  renderWorkouts();
  renderDashboard();
  renderAssistant();
}

function renderDashboard() {
  const rank = rankInfo();
  const todayProgram = state.program.filter((x) => x.day === currentDay());
  const completed = new Set(state.workouts.filter((x) => x.date === todayIso()).map((x) => x.exerciseId)).size;
  const latest = state.measurements.at(-1);
  const macros = todaysMacros();
  $("metricRank").textContent = rank.current;
  $("metricRankScore").textContent = `${state.xp} XP`;
  $("metricWorkouts").textContent = `${completed}/${todayProgram.length}`;
  $("metricWeight").textContent = latest ? `${latest.weight} kg` : "-";
  $("metricCalories").textContent = macros.cal;
  $("metricMacros").textContent = `${macros.p}P / ${macros.c}K / ${macros.f}Y`;
  $("todayPlan").innerHTML = todayProgram.length ? todayProgram.map(workoutCard).join("") : empty("Bugun icin program yok.");
  $("progressTimeline").innerHTML = state.workouts.slice(-6).reverse().map((w) => `<div class="timeline-item"><strong>${w.exercise}</strong><br><small>${w.date} - ${w.weight}kg - ${w.sets}x${w.reps}</small></div>`).join("") || empty("Ilk antrenman kaydini bekliyor.");
}

function renderProgram() {
  $("programList").innerHTML = days.map((day) => {
    const items = state.program.filter((x) => x.day === day);
    return `<article class="day-card"><h3>${day}</h3>${items.length ? items.map((x) => `<div class="row"><span>${x.exercise}<br><small>${x.area} - ${x.sets}x${x.reps}</small></span><button class="tiny" onclick="removeProgram('${x.id}')">Sil</button></div>`).join("") : "<small>Bos</small>"}</article>`;
  }).join("");
}

function renderMeasurements() {
  $("measurementList").innerHTML = state.measurements.slice().reverse().map((m) => `<div class="row"><span>${m.date}<br><small>${m.height} cm - bel ${m.waist || "-"} cm</small></span><strong>${m.weight} kg</strong></div>`).join("") || empty("Henuz olcum yok.");
  const weights = state.measurements.slice(-8);
  const min = Math.min(...weights.map((x) => x.weight), 0);
  const max = Math.max(...weights.map((x) => x.weight), 1);
  $("measurementChart").innerHTML = weights.map((m) => {
    const h = 40 + ((m.weight - min) / Math.max(1, max - min)) * 150;
    return `<div class="bar" style="height:${h}px" title="${m.date}">${m.weight}</div>`;
  }).join("") || empty("Grafik icin olcum ekle.");
}

function renderNutrition() {
  const macros = todaysMacros();
  const targets = { cal: 2600, p: 160, c: 280, f: 80 };
  $("macroBars").innerHTML = [
    ["Kalori", "cal", "kcal"], ["Protein", "p", "g"], ["Karbonhidrat", "c", "g"], ["Yag", "f", "g"]
  ].map(([label, key, unit]) => `<div class="macro-line"><span>${label}: ${macros[key]} ${unit}</span><div class="macro-track"><i style="width:${Math.min(100, macros[key] / targets[key] * 100)}%"></i></div></div>`).join("");
  $("foodList").innerHTML = state.foods.filter((x) => x.date === todayIso()).reverse().map((f) => `<div class="row"><span>${f.meal}: ${f.text}<br><small>${f.p}P - ${f.c}K - ${f.f}Y</small></span><strong>${f.cal} kcal</strong></div>`).join("") || empty("Bugun besin girisi yok.");
}

function renderWorkouts() {
  const rank = rankInfo();
  const todayProgram = state.program.filter((x) => x.day === currentDay());
  $("rankName").textContent = rank.current;
  $("rankFill").style.width = `${rank.progress}%`;
  $("rankNote").textContent = rank.current === "Radiant" ? "Zirvedesin. Simdi istikrari koruma zamani." : `Sonraki rank: ${rank.next}. Ilerleme: %${rank.progress}.`;
  $("rankDayTitle").textContent = `${currentDay()} Programi`;
  $("rankWorkoutList").innerHTML = todayProgram.length ? todayProgram.map(workoutCard).join("") : empty("Bugun icin program yok. Programim bolumunden ekleyebilirsin.");
}

function workoutCard(x) {
  const done = state.workouts.some((w) => w.date === todayIso() && w.exerciseId === x.id);
  return `<article class="workout-card">
    <h3>${x.exercise}</h3>
    <div class="workout-meta"><span>${x.area}</span><span>Hedef ${x.sets}x${x.reps}</span><span>${done ? "Bugun tamamlandi" : "Bekliyor"}</span></div>
    <form class="inline-form" onsubmit="event.preventDefault(); logWorkout('${x.id}', this)">
      <input name="weight" type="number" min="1" step="0.5" placeholder="kg" required>
      <input name="sets" type="number" min="1" placeholder="set" value="${x.sets}" required>
      <input name="reps" type="number" min="1" placeholder="tekrar" value="${x.reps}" required>
      <button class="primary" type="submit">Kaydet</button>
    </form>
  </article>`;
}

function todaysMacros() {
  return state.foods.filter((x) => x.date === todayIso()).reduce((a, f) => ({
    cal: a.cal + f.cal, p: a.p + f.p, c: a.c + f.c, f: a.f + f.f
  }), { cal: 0, p: 0, c: 0, f: 0 });
}

function askAssistant(event) {
  event.preventDefault();
  const text = $("assistantText").value.trim();
  if (!text) return;
  state.assistant.push({ role: "user", text });
  state.assistant.push({ role: "ai", text: coachReply(text) });
  $("assistantText").value = "";
  save();
  renderAssistant();
}

function coachReply(text) {
  const macros = todaysMacros();
  const rank = rankInfo();
  const lastWorkout = state.workouts.at(-1);
  if (/besin|kalori|protein|yemek/i.test(text)) {
    return `Bugun ${macros.cal} kcal ve ${macros.p}g protein gorunuyorsun. Hedef kas gelisimiyse proteini gun icine yay ve antrenman gunlerinde karbonhidrati cok kismamaya calis.`;
  }
  if (/rank|xp|seviye/i.test(text)) {
    return `${rank.current} rankindasin. Ranki en hizli antrenman kayitlari, haftalik olcum ve duzenli besin girisi artiriyor.`;
  }
  if (lastWorkout) {
    return `Son kaydin ${lastWorkout.exercise}: ${lastWorkout.weight}kg ${lastWorkout.sets}x${lastWorkout.reps}. Bir sonraki ayni harekette ya 1 tekrar ya da 2.5kg artis denemesi iyi bir hedef olur.`;
  }
  return "Once programina haftalik hareketlerini ekle. Sonra Rank ekraninda kg, set ve tekrar girdikce sana performans uzerinden oneri verecegim.";
}

function renderAssistant() {
  $("assistantLog").innerHTML = state.assistant.map((m) => `<div class="bubble ${m.role === "user" ? "user" : ""}">${m.text}</div>`).join("");
  $("assistantLog").scrollTop = $("assistantLog").scrollHeight;
}

function removeProgram(id) {
  state.program = state.program.filter((x) => x.id !== id);
  save();
  renderAll();
}

function seedData() {
  state.program = [
    { id: crypto.randomUUID(), day: "Pazartesi", area: "Gogus, triceps, karin", exercise: "Bench press", sets: 4, reps: 10 },
    { id: crypto.randomUUID(), day: "Pazartesi", area: "Gogus", exercise: "Incline dumbbell press", sets: 3, reps: 12 },
    { id: crypto.randomUUID(), day: "Carsamba", area: "Sirt, biceps", exercise: "Lat pulldown", sets: 4, reps: 10 },
    { id: crypto.randomUUID(), day: "Cuma", area: "Bacak, omuz", exercise: "Squat", sets: 4, reps: 8 }
  ];
  state.measurements = [
    { date: "2026-05-22", height: 178, weight: 84.2, waist: 91 },
    { date: "2026-05-29", height: 178, weight: 83.5, waist: 90 },
    { date: "2026-06-05", height: 178, weight: 82.9, waist: 89 }
  ];
  state.xp = Math.max(state.xp, 780);
  save();
  renderAll();
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "fitrank-data.json";
  a.click();
  URL.revokeObjectURL(url);
}

function empty(text) { return `<div class="row"><small>${text}</small></div>`; }
window.removeProgram = removeProgram;
window.logWorkout = logWorkout;
init();
