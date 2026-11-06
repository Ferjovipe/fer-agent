#!/usr/bin/env node
// =====================================================================
// Fer Home (fer-casa.mjs) — the same building, running 24 hours a day.
// It runs on a computer (Mac, Windows, Linux), on an Android phone with
// Termux or on a rented server. All it needs is Node 18 or newer.
//
//   node fer-casa.mjs
//
// The first time it asks for your OpenRouter key and a PIN, and saves them in the
// «datos» folder. Then open the address it shows you in your browser.
//
// More commands (version 7):
//   node fer-casa.mjs claves        → keys for Claude, OpenAI and Grok (direct brains)
//   node fer-casa.mjs carpeta       → where the brain lives (Library, Long-term memory and the backup)
//   node fer-casa.mjs telegram      → connect Telegram: the inbox and the alerts on your phone
//   node fer-casa.mjs entrar [web]  → open the agents' Chrome so you can sign in once yourself (for example, on X)
// Fer Home speaks its building's language: in the Terminal, on Telegram and in its messages to the website.
// =====================================================================
import http from "node:http";
import fs from "node:fs/promises";
import { readFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { Edificio, VERSION, fmt, notasMemoriaMd, PROVEEDORES, filtrarModelosApi, carpetasCerebro, traducir, rellenar, fijarIdioma, IDIOMA, LOCALE } from "./engine.js";
import { crearManos } from "./manos.mjs";

// Until the building is open (the first-time questions), the computer's language; then, the building's
const IDIOMA_ORDENADOR = /^es/i.test(process.env.FER_IDIOMA || process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || "") ? "es" : "en";
fijarIdioma(IDIOMA_ORDENADOR);
const L = (s, ...v) => rellenar(traducir(IDIOMA, s), v);

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DATOS = process.env.FER_DATOS || path.join(AQUI, "datos");
const API = (process.env.OPENROUTER_BASE || "https://openrouter.ai/api/v1").replace(/\/$/, "");
const PUERTO = Number(process.env.FER_PUERTO || 8787);
const LATIDO_SEG = Math.max(1, Number(process.env.FER_LATIDO_SEG || 20));
const ARCHIVOS = { "/": "index.html", "/index.html": "index.html", "/app.js": "app.js", "/engine.js": "engine.js", "/personajes.js": "personajes.js", "/textos.js": "textos.js", "/landing.js": "landing.js" };
// the building's and the characters' pictures (only these: no other file in the folder is served)
for (const f of ["portada", "cupula", "cupula2x", "piso", "piso2x", "vestibulo", "vestibulo2x", "pj-chico", "pj-chica", "pj-abuelo", "pj-abuela",
  "pj-morado", "pj-verde", "pj-coral", "pj-azul", "pj-turquesa", "pj-camisa"]) ARCHIVOS["/img/" + f + ".webp"] = "img/" + f + ".webp";
for (const f of ["chico", "chica", "abuelo", "abuela"]) ARCHIVOS["/img/pj-" + f + "-zonas.png"] = "img/pj-" + f + "-zonas.png";
// the translations in the textos/ folder (es.js…)
try { for (const f of readdirSync(path.join(AQUI, "textos"))) if (/^[a-z-]{2,8}\.js$/.test(f)) ARCHIVOS["/textos/" + f] = "textos/" + f; } catch {}
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".webp": "image/webp", ".png": "image/png" };
const ORDEN = (process.argv[2] || "").toLowerCase();
// Inside the desktop app (version 9): no Terminal. The app sets the PIN itself, the key is pasted in Settings
// and the server can only be reached from this computer.
const APP = process.env.FER_APP === "1";

mkdirSync(DATOS, { recursive: true });
const ARCHIVO_CONF = path.join(DATOS, "config.json");
// API addresses (only for tests: FER_API_<ID>=…; the usual ones, ANTHROPIC_BASE, OPENAI_BASE and XAI_BASE)
const APIS = Object.assign({ anthropic: process.env.ANTHROPIC_BASE, openai: process.env.OPENAI_BASE, xai: process.env.XAI_BASE },
  Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith("FER_API_")).map(([k, v]) => [k.slice(8).toLowerCase(), v])));
const ARCHIVO_ESTADO = path.join(DATOS, "edificio.json");
const hora = () => new Date().toLocaleTimeString(LOCALE);
const log = (...a) => console.log(`[${hora()}]`, ...a);

// ---------------- Configuration (key and PIN) ----------------
async function configuracion() {
  let conf = {};
  try { conf = JSON.parse(readFileSync(ARCHIVO_CONF, "utf8")); } catch {}
  if (process.env.OPENROUTER_API_KEY) conf.clave = process.env.OPENROUTER_API_KEY;
  if (process.env.FER_PIN) conf.pin = process.env.FER_PIN;
  if (APP) {   // in the app nothing is asked: the PIN is created on its own (the window carries it) and the key is pasted in Settings
    if (!conf.pin || String(conf.pin).length < 24) { conf.pin = crypto.randomBytes(18).toString("base64url"); await guardarConf(Object.assign({ claves: {} }, conf)); }
    conf.clave = conf.clave || "";
    conf.claves = Object.assign({}, conf.claves || {});
    return conf;
  }
  if (conf.pin && String(conf.pin).length < 8) {
    if (process.stdin.isTTY) { console.log(L("The saved PIN is too short (8 at least). Choose another one.")); conf.pin = ""; }
    else { console.error(L("The PIN must have at least 8 digits or letters. Run “node fer-casa.mjs” by hand to change it.")); process.exit(1); }
  }
  if (!conf.clave || !conf.pin) {
    if (!process.stdin.isTTY) { console.error(L("The key or the PIN is missing. Run “node fer-casa.mjs” once by hand to set it up.")); process.exit(1); }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log("\n" + L("Fer Home · first time") + "\n");
    while (!conf.clave || !conf.clave.startsWith("sk-")) conf.clave = (await rl.question(L("Paste your OpenRouter key (it starts with sk-or-): "))).trim();
    while (!conf.pin || conf.pin.length < 8) conf.pin = (await rl.question(L("Choose a PIN of at least 8 digits or letters (the website will ask you for it): "))).trim();
    rl.close();
    await guardarConf(conf);
    console.log(L("Saved in {1} (only your user can read it).", ARCHIVO_CONF) + "\n");
  }
  conf.claves = Object.assign({}, conf.claves || {});
  if (process.env.ANTHROPIC_API_KEY) conf.claves.anthropic = process.env.ANTHROPIC_API_KEY;
  if (process.env.OPENAI_API_KEY) conf.claves.openai = process.env.OPENAI_API_KEY;
  if (process.env.XAI_API_KEY) conf.claves.xai = process.env.XAI_API_KEY;
  return conf;
}
async function guardarConf(conf) {
  const limpio = { clave: conf.clave, pin: conf.pin, claves: conf.claves || {}, carpetaCerebro: conf.carpetaCerebro || "", carpetaAgentes: conf.carpetaAgentes || "", telegram: conf.telegram || null, manosVisibles: !!conf.manosVisibles };
  await fs.writeFile(ARCHIVO_CONF, JSON.stringify(limpio, null, 1), { mode: 0o600 });
}
// Questions in the Terminal (keys, folder, Telegram)
async function preguntar(texto, rl) { return (await rl.question(texto)).trim(); }
const BORRAR = ["delete", "borrar"];   // either language works
async function ordenClaves(conf) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log("\n" + L("Other APIs (the ones from your subscriptions). Paste each key (or press Enter to leave it as it is; type “delete” to remove it)."));
  console.log(L("They are only saved in {1} and only travel to each API's address.", ARCHIVO_CONF) + "\n");
  // the known ones and the ones you added on the website (Settings → Other APIs)
  let propias = [];
  try { propias = ((JSON.parse(readFileSync(ARCHIVO_ESTADO, "utf8")).ajustes || {}).conexiones || []).filter((c) => c && c.api && c.id && !PROVEEDORES[c.id]); } catch {}
  const lista = [...Object.entries(PROVEEDORES).filter(([k, P]) => k !== "openrouter" && !P.sinClave).map(([k, P]) => [k, `${P.nombre}${P.web ? " (" + P.web + ")" : ""}`]),
    ...propias.map((c) => [c.id, `${c.nombre || c.id} (${c.api})`])];
  for (const [prov, nombre] of lista) {
    const v = await preguntar(`${nombre} [${conf.claves[prov] ? L("set") : L("no key")}]: `, rl);
    if (BORRAR.includes(v)) delete conf.claves[prov]; else if (v) conf.claves[prov] = v;
  }
  rl.close(); await guardarConf(conf); console.log(L("Saved.") + "\n");
}
async function ordenCarpeta(conf) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const n = carpetasCerebro(edificioGuardado());
  console.log("\n" + L("Brain folder: inside there will be “{1}”, “{2}” and “{3}”.", n.biblioteca, n.memoria, n.copia));
  console.log(L("If you also want it in Google Drive and in Obsidian, choose a folder inside Google Drive for desktop"));
  console.log(L("(on a Mac it's usually in /Users/YOUR_USER/Library/CloudStorage/GoogleDrive-…/My Drive/Fer Agent)."));
  const v = await preguntar(L("Full path [now: {1}]: ", conf.carpetaCerebro || path.join(DATOS, "cerebro")), rl);
  const v2 = await preguntar(L("The agents' folder, where they read and write their files [now: {1}]: ", conf.carpetaAgentes || path.join(DATOS, "carpeta-agentes")), rl);
  rl.close();
  if (v) { mkdirSync(v, { recursive: true }); conf.carpetaCerebro = path.resolve(v); }
  if (v2) { mkdirSync(v2, { recursive: true }); conf.carpetaAgentes = path.resolve(v2); }
  await guardarConf(conf); console.log(L("Saved.") + "\n");
}
// the saved building, to know its brain folder names before opening it
function edificioGuardado() { try { return JSON.parse(readFileSync(ARCHIVO_ESTADO, "utf8")); } catch { return null; } }
async function ordenTelegram(conf) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log("\n" + L("Telegram: the inbox and the alerts on your phone, with buttons to approve or reject."));
  console.log(L("1. In Telegram, talk to @BotFather, type /newbot and follow the steps. It gives you a “token”."));
  const token = await preguntar(L("2. Paste the token here (or “delete” to disconnect): "), rl);
  if (BORRAR.includes(token)) { conf.telegram = null; rl.close(); await guardarConf(conf); console.log(L("Telegram disconnected.") + "\n"); return; }
  if (!token) { rl.close(); return; }
  console.log(L("3. Now open your new bot in Telegram and send it /start. I'll wait up to 2 minutes…"));
  rl.close();
  const api = (m) => `${TELEGRAM}/bot${token}/${m}`;
  let chat = null;
  for (let i = 0; i < 24 && !chat; i++) {
    try { const d = await (await fetch(api("getUpdates?timeout=5"))).json(); const u = (d.result || []).reverse().find((x) => x.message && x.message.chat); if (u) chat = u.message.chat.id; } catch {}
    if (!chat) await new Promise((r) => setTimeout(r, 5000));
  }
  if (!chat) { console.log(L("Your /start didn't arrive. Try again: node fer-casa.mjs telegram") + "\n"); return; }
  conf.telegram = { token, chat };
  await guardarConf(conf);
  await fetch(api("sendMessage"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: L("Fer Home connected. The inbox and the alerts will reach you here. Commands: /inbox, /pause, /resume.") }) }).catch(() => {});
  console.log(L("Connected. It will only listen to this chat.") + "\n");
}

// ---------------- Starting the engine ----------------
const TELEGRAM = (process.env.TELEGRAM_API || "https://api.telegram.org").replace(/\/$/, "");
const conf = await configuracion();
if (ORDEN === "claves") { await ordenClaves(conf); process.exit(0); }
if (ORDEN === "carpeta") { await ordenCarpeta(conf); process.exit(0); }
if (ORDEN === "telegram") { await ordenTelegram(conf); process.exit(0); }
const CARPETA_CEREBRO = conf.carpetaCerebro || path.join(DATOS, "cerebro");
const CARPETA_AGENTES = conf.carpetaAgentes || path.join(DATOS, "carpeta-agentes");
const MEDIOS = path.join(DATOS, "medios");
mkdirSync(MEDIOS, { recursive: true });
// The hands: the agents' Chrome, their folder and the skills (Fer Agent's and yours in datos/skills)
const manos = crearManos({ carpetaAgentes: CARPETA_AGENTES, perfilChrome: path.join(DATOS, "chrome-agentes"), carpetasSkills: [path.join(AQUI, "skills"), path.join(DATOS, "skills")],
  visible: !!conf.manosVisibles || process.env.FER_MANOS_VISIBLES === "1", canal: process.env.FER_CHROME_CANAL || "chrome", log: (...a) => log(...a),
  locale: () => (typeof ed !== "undefined" && ed.e && ed.e.idioma === "en" ? "en-US" : "es-ES") });   // websites, in the building's language
if (ORDEN === "entrar") {
  const url = process.argv[3] || "https://x.com/login";
  console.log("\n" + L("Opening the agents' Chrome at {1}. Sign in with your account and, when you're done, close that Chrome window.", url) + "\n");
  const ctx = await manos.abrirVisible(url);
  await new Promise((r) => ctx.on("close", r));
  console.log(L("Done: the session stays saved in the agents' profile.") + "\n");
  process.exit(0);
}
let guardando = Promise.resolve();
const COPIAS = path.join(DATOS, "copias");
const ed = new Edificio({
  api: API,
  clave: () => conf.clave,
  claves: () => conf.claves || {},
  apis: APIS,
  manos,
  // images and music are saved in datos/medios (they are not lost)
  guardarMedio: async (id, url, tipo) => {
    const m = String(url).match(/^data:([^;]+);base64,(.*)$/s);
    if (!m || !/^med_[a-z0-9]+$/i.test(id)) return;
    const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg", "audio/flac": "flac" }[m[1]] || "bin";
    await fs.writeFile(path.join(MEDIOS, `${id}.${ext}`), Buffer.from(m[2], "base64"));
  },
  alCambiar: (ev) => avisoMotor(ev),
  // Techie saves a backup of the building in datos/copias on Fridays (the last 8 are kept)
  copia: async (json, dia) => {
    await fs.mkdir(COPIAS, { recursive: true });
    await fs.writeFile(path.join(COPIAS, `edificio-${dia}.json`), json, { mode: 0o600 });
    const viejas = (await fs.readdir(COPIAS)).filter((f) => /^edificio-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(0, -8);
    for (const f of viejas) await fs.unlink(path.join(COPIAS, f)).catch(() => {});
    log(L("Techie saved a backup: {1}", `datos/copias/edificio-${dia}.json`));
  },
  cargar: async () => (existsSync(ARCHIVO_ESTADO) ? fs.readFile(ARCHIVO_ESTADO, "utf8") : null),
  guardar: async (json) => {   // safe writing: first to a temporary file, then it is renamed
    guardando = guardando.then(async () => { const tmp = ARCHIVO_ESTADO + ".tmp"; await fs.writeFile(tmp, json); await fs.rename(tmp, ARCHIVO_ESTADO); }).catch((e) => log(L("I couldn't save: {1}", e.message)));
    await guardando;
  }
});
async function cargarModelos() {
  try {
    // all the models (text, image, music, voice, hearing…); if that query fails, only the text ones
    let lista = [];
    try { const r = await fetch(API + "/models?output_modalities=all"); if (r.ok) lista = (await r.json()).data || []; } catch {}
    if (!lista.length) { const r = await fetch(API + "/models"); if (r.ok) lista = (await r.json()).data || []; }
    if (lista.length) { ed.setModelos(lista); log(L("OpenRouter model list: {1}.", ed.modelos.length)); }
  }
  catch (e) { log(L("I couldn't read the model list: {1}", e.message)); }
}
await cargarModelos();
await ed.iniciar(process.env.FER_PLANTILLA || "vacio", IDIOMA_ORDENADOR);   // a new building starts with only the boss, in the computer's language (FER_IDIOMA=en|es chooses)
log(L("Building “{1}” with {2} agents. Spending today: {3}.", ed.e.nombre, ed.e.agentes.length, fmt(ed.gastoEdificio("hoy"))));
log(ed.e.ajustes.pausa ? L("General pause on: nothing that spends wakes up on its own (turn it off on the website, next to the counter, or with /resume on Telegram).") : L("Automatic work running."));
log(L("Hands: {1}. The agents' folder: {2}", manos.catalogo().map((k) => k.nombre).join(", ") || L("no skills"), CARPETA_AGENTES));
setInterval(cargarModelos, 6 * 3600e3).unref();

// ---------------- The brain in a folder (Library, Long-term memory and the building's backup) ----------------
// If the folder is inside Google Drive for desktop, it is also in Drive and you open it with Obsidian.
const cerebro = { escritos: new Map(), vistos: new Map(), ultimaSync: 0, notas: 0, biblioteca: 0, ocupado: false, cambios: 0, error: "", primera: true };
// when it last synced with the folder (it's saved: when Fer Home restarts, what you deleted in Obsidian doesn't come back)
const ARCHIVO_SYNC = path.join(DATOS, "cerebro-sync.json");
try { const g = JSON.parse(readFileSync(ARCHIVO_SYNC, "utf8")); if (g.carpeta === CARPETA_CEREBRO) cerebro.ultimaSync = Number(g.ultimaSync) || 0; } catch {}
async function listarMd(dir, recursivo, base = dir, nivel = 0) {
  const out = [];
  let items = []; try { items = await fs.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const d of items) {
    if (d.name.startsWith(".")) continue;
    const f = path.join(dir, d.name);
    if (d.isDirectory()) { if (recursivo && nivel < 4) out.push(...await listarMd(f, true, base, nivel + 1)); }
    else if (/\.(md|txt)$/i.test(d.name)) { const st = await fs.stat(f).catch(() => null); if (st) out.push({ f, ruta: path.relative(base, f).split(path.sep).join("/"), modificado: st.mtimeMs }); }
  }
  return out;
}
async function sincronizarCerebro(soloEscribir) {
  if (cerebro.ocupado) { cerebro.otraVez = true; return; }
  cerebro.ocupado = true;
  try {
    const n = carpetasCerebro(ed.e);
    const memDir = path.join(CARPETA_CEREBRO, n.memoria), bibDir = path.join(CARPETA_CEREBRO, n.biblioteca);
    await fs.mkdir(memDir, { recursive: true }); await fs.mkdir(bibDir, { recursive: true });
    // Before writing anything, what you corrected by hand in Obsidian comes in (without losing what was noted here since last time)
    for (const x of await listarMd(memDir, false)) {
      if (x.ruta === n.indice + ".md" || (cerebro.vistos.get(x.f) || 0) >= x.modificado) continue;
      const texto = await fs.readFile(x.f, "utf8");
      cerebro.vistos.set(x.f, x.modificado);
      if (cerebro.escritos.get(x.f) === texto) continue;
      await ed.ejecutar({ tipo: "memoria.importar", tema: x.ruta.replace(/\.md$/i, ""), texto, conservarDesde: cerebro.ultimaSync });
      log(L("Long-term memory: read what you changed in “{1}”.", x.ruta));
    }
    if (!soloEscribir) {
      const docs = [];
      for (const x of await listarMd(bibDir, true)) docs.push({ ruta: n.biblioteca + "/" + x.ruta, titulo: x.ruta.split("/").pop().replace(/\.(md|txt)$/i, ""), texto: (await fs.readFile(x.f, "utf8")).slice(0, 300000) });
      ed.setBiblioteca(docs); cerebro.biblioteca = docs.length;
    }
    const nombres = Object.fromEntries(ed.e.agentes.map((a) => [a.id, a.nombre]));
    const notas = notasMemoriaMd(ed.e.memoriaLarga, nombres, n);
    for (const n of notas) {
      const f = path.join(CARPETA_CEREBRO, ...n.ruta.split("/"));
      if (cerebro.escritos.get(f) === n.texto) continue;
      await fs.writeFile(f, n.texto);
      cerebro.escritos.set(f, n.texto);
      const st = await fs.stat(f).catch(() => null); if (st) cerebro.vistos.set(f, st.mtimeMs);
    }
    cerebro.notas = notas.length - 1;
    if (cerebro.cambios || cerebro.primera) {
      const tmp = path.join(CARPETA_CEREBRO, n.copia + ".tmp");
      await fs.writeFile(tmp, JSON.stringify({ tipo: "fer-agent-edificio", version: VERSION, aparato: "fer-casa", ts: Date.now(), edificio: ed.e }));
      await fs.rename(tmp, path.join(CARPETA_CEREBRO, n.copia));
      cerebro.cambios = 0; cerebro.primera = false;
    }
    cerebro.ultimaSync = Date.now(); cerebro.error = "";
    await fs.writeFile(ARCHIVO_SYNC, JSON.stringify({ carpeta: CARPETA_CEREBRO, ultimaSync: cerebro.ultimaSync })).catch(() => {});
  } catch (e) { cerebro.error = e.message; log(L("Brain: {1}", e.message)); }
  finally { cerebro.ocupado = false; if (cerebro.otraVez) { cerebro.otraVez = false; setTimeout(() => sincronizarCerebro(true), 500); } }
}
await sincronizarCerebro();
setInterval(() => sincronizarCerebro(), Math.max(2, Number(process.env.FER_CEREBRO_SEG || 120)) * 1000).unref();
let esperaCerebro = null, cuandoCerebro = 0, esperaBandeja = null;

// ---------------- The engine's notices: the brain folder and Telegram ----------------
function avisoMotor(ev) {
  if (ev.tipo === "estado") cerebro.cambios++;
  if (ev.tipo === "memoria" || ev.tipo === "estado") {
    const cuando = Date.now() + (ev.tipo === "memoria" ? 4000 : 30000);
    if (!esperaCerebro || cuando < cuandoCerebro) { clearTimeout(esperaCerebro); cuandoCerebro = cuando; esperaCerebro = setTimeout(() => { esperaCerebro = null; sincronizarCerebro(true); }, cuando - Date.now()); }
  }
  // any change may bring something new to the inbox (the Creator's agents, coins, lessons, meetings, models…): it's all looked at together
  if (ev.tipo === "bandeja" || ev.tipo === "estado") { clearTimeout(esperaBandeja); esperaBandeja = setTimeout(() => avisarBandeja().catch(() => {}), ev.tipo === "bandeja" ? 300 : 1000); }
  if (ev.tipo === "skill") telegramMandar(`${ev.nombre} (${ev.skill}):\n\n${String(ev.texto).slice(0, 3800)}`);
}

// ---------------- Telegram: the inbox on your phone (it only listens to your chat) ----------------
const tg = conf.telegram && conf.telegram.token && conf.telegram.chat ? conf.telegram : null;
const avisados = new Set();
async function telegram(metodo, cuerpo) {
  if (!tg) return null;
  try {
    const r = await fetch(`${TELEGRAM}/bot${tg.token}/${metodo}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo || {}) });
    return await r.json();
  } catch (e) { log("Telegram: " + e.message); return null; }
}
function telegramMandar(texto, botones) {
  if (!tg) return;
  const b = { chat_id: tg.chat, text: String(texto).slice(0, 4000), disable_web_page_preview: true };
  if (botones) b.reply_markup = { inline_keyboard: botones };
  return telegram("sendMessage", b);
}
const CLASE = { accion: "Action outside the website", agente: "New agent", reunion: "Meeting", moneda: "Coin", leccion: "New lesson", modelo: "Recommended model", falta: "Missing something" };
function textoPeticion(x) {
  const coste = ["falta", "moneda", "leccion", "modelo"].includes(x.clase) ? "" : x.coste > 0 ? " · " + (x.porDia ? L("≈{1} a day", fmt(x.coste)) : `≈${fmt(x.coste)}`) : "";
  return `${L(CLASE[x.clase] || x.clase)} · ${x.quien}${coste}\n${x.que}${x.detalle ? "\n\n" + String(x.detalle).slice(0, 1200) : ""}`;
}
// the keys of the Telegram buttons (short: 64 characters at most)
const clavesBotones = new Map();
function botonesDe(x, soloNo) {
  const k = Math.random().toString(36).slice(2, 10);
  clavesBotones.set(k, { clase: x.clase, id: x.id, rondas: x.rondas });
  if (clavesBotones.size > 500) clavesBotones.delete(clavesBotones.keys().next().value);
  const si = L({ accion: "Approve and do it", reunion: "Start the meeting", falta: "It has it now", moneda: "Confirm", agente: "Create" }[x.clase] || "Approve");
  const no = { text: "✖️ " + L(x.clase === "falta" ? "Later" : "Reject"), callback_data: "no:" + k };
  return [soloNo ? [no] : [{ text: "✅ " + si, callback_data: "si:" + k }, no]];
}
// A request to the phone. If it's a long action, what is going to be done goes in several messages before the buttons
// (up to 6; if there's more, it says how much is missing, and it's all in the website's inbox).
async function mandarPeticion(x) {
  const det = String(x.detalle || "");
  if (x.clase !== "accion" || det.length <= 1200) return telegramMandar(textoPeticion(x), botonesDe(x));
  const cab = `${L(CLASE[x.clase])} · ${x.quien}\n${x.que}`;
  const n = Math.min(6, Math.ceil(det.length / 3500)), resto = det.length - n * 3500;
  for (let i = 0; i < n; i++) await telegramMandar(`(${i + 1}/${n}) ${det.slice(i * 3500, (i + 1) * 3500)}`);
  return telegramMandar(`${cab}\n\n(${resto > 0 ? L("what it will do, in the {1} messages above; {2} characters are missing, all of it is in the website's inbox", n, resto.toLocaleString(LOCALE)) : L("what it will do, in the {1} messages above", n)})`, botonesDe(x));
}
const claveAviso = (x) => x.clase + ":" + x.id + ":" + (x.ts || 0);   // with the time: if an agent says again that it's missing something, it's notified again
async function avisarBandeja() {
  if (!tg) return;
  const ahora = ed.bandeja(), siguen = new Set(ahora.map(claveAviso));
  for (const k of [...avisados]) if (!siguen.has(k)) avisados.delete(k);   // what has been decided is forgotten
  for (const x of ahora) {
    const k = claveAviso(x);
    if (avisados.has(k)) continue;
    avisados.add(k);
    await mandarPeticion(x);
  }
}
async function escucharTelegram() {
  if (!tg) return;
  let desde = 0;
  log(L("Telegram connected: the inbox and the alerts reach your phone."));
  for (const x of ed.bandeja()) avisados.add(claveAviso(x));   // what was already pending isn't repeated on start
  let espera = 0, ultimoFallo = "";
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  for (;;) {
    let d = null;
    const t0 = Date.now();
    try { d = await (await fetch(`${TELEGRAM}/bot${tg.token}/getUpdates?timeout=50&offset=${desde}`)).json(); } catch { d = null; }
    if (!d || d.ok === false) {
      // If Telegram says no (bad token, another program reading the same bot…) or there's no network: it waits longer each time (up to 5 min), without hammering
      const motivo = d ? `${d.error_code || ""} ${d.description || ""}`.trim() : L("no connection");
      if (motivo !== ultimoFallo) log(`Telegram: ${motivo}. ` + (d && d.error_code === 401 ? L("The token isn't valid: run node fer-casa.mjs telegram again.") : d && d.error_code === 409 ? L("Another program is reading this same bot.") : L("I'll retry on my own.")));
      ultimoFallo = motivo; espera = Math.min(300000, espera ? espera * 2 : 5000);
      await dormir(espera); continue;
    }
    if (ultimoFallo) log(L("Telegram is answering again."));
    espera = 0; ultimoFallo = "";
    if (!(d.result || []).length && Date.now() - t0 < 1000) await dormir(1000);   // never more than one request per second
    for (const u of d.result || []) {
      desde = u.update_id + 1;
      const cb = u.callback_query, msg = u.message;
      const chat = cb ? cb.message && cb.message.chat && cb.message.chat.id : msg && msg.chat && msg.chat.id;
      if (String(chat) !== String(tg.chat)) continue;   // only your chat
      try {
        if (cb) {
          const [r, k] = String(cb.data || "").split(":");
          const x = clavesBotones.get(k);
          let res = L("That's no longer pending (or Fer Home restarted: look at the inbox on the website).");
          if (x) {
            clavesBotones.delete(k);
            if (x.clase === "falta" && r === "no") res = L("It stays in the inbox.");
            else {
              const out = await ed.ejecutar({ tipo: "bandeja.decidir", clase: x.clase, id: x.id, si: r === "si", rondas: x.rondas });
              res = r === "si" ? (out && out.estado === "error" ? L("It couldn't be done: {1}", out.resultado) : L("Done.") + (out && out.resultado ? "\n" + String(out.resultado).slice(0, 1500) : "")) : L("Rejected.");
            }
          }
          await telegram("answerCallbackQuery", { callback_query_id: cb.id, text: res.slice(0, 180) });
          await telegram("editMessageText", { chat_id: chat, message_id: cb.message.message_id, text: (cb.message.text || "") + "\n\n→ " + res });
        } else if (msg && msg.text) {
          const t = msg.text.trim().toLowerCase();
          // the commands, in English or in Spanish
          if (t.startsWith("/inbox") || t.startsWith("/bandeja") || t === "/start") {
            const b = ed.bandeja();
            if (!b.length) await telegramMandar(L("The inbox is empty.") + " " + L(ed.e.ajustes.pausa ? "The building is on general pause." : "Automatic work is running."));
            for (const x of b) await mandarPeticion(x);
          } else if (t.startsWith("/pause") || t.startsWith("/pausa")) { await ed.ejecutar({ tipo: "pausa", pausa: true }); await telegramMandar(L("General pause on: nothing that spends wakes up on its own.")); }
          else if (t.startsWith("/resume") || t.startsWith("/marcha")) { await ed.ejecutar({ tipo: "pausa", pausa: false }); await telegramMandar(L("Automatic work running: heartbeats are working again.")); }
          else await telegramMandar(L("Commands: /inbox (what's waiting for your yes), /pause (stops everything automatic), /resume (starts it again)."));
        }
      } catch (e) { log("Telegram: " + e.message); await telegramMandar(L("It couldn't be done: {1}", e.message)); }
    }
  }
}
escucharTelegram();

// ---------------- The heartbeat ----------------
let ultimoVisto = Math.max(0, ...ed.e.registro.map((x) => x.ts)), latiendo = false;
function contarNovedades() {   // writes on screen what the agents have done
  const nuevos = ed.e.registro.filter((x) => x.ts > ultimoVisto);
  for (const x of nuevos.slice(-20)) log(`${x.nombre}: ${x.texto}${x.coste ? " · " + fmt(x.coste) : ""}`);
  if (nuevos.length) ultimoVisto = Math.max(...nuevos.map((x) => x.ts));
}
setInterval(async () => {
  if (latiendo) return;
  latiendo = true;
  try { await ed.tick(); } catch (e) { log(L("Error in the heartbeat: {1}", e.message)); }
  finally { latiendo = false; }
  contarNovedades();
}, LATIDO_SEG * 1000);

// ---------------- The server (website + API with PIN) ----------------
const fallos = new Map();   // failed PIN attempts per address
let fallosGlobales = [], cerradoHasta = 0;   // a general brake in case they try from many addresses
function pinValido(req) {
  const ip = req.socket.remoteAddress || "";
  const f = fallos.get(ip) || { n: 0, hasta: 0 };
  if (f.hasta > Date.now() || cerradoHasta > Date.now()) return false;
  if (!req.headers["x-fer-pin"]) return false;            // without a PIN it doesn't count as an attempt (you don't lock yourself out)
  const dado = Buffer.from(String(req.headers["x-fer-pin"] || ""));
  const bueno = Buffer.from(String(conf.pin));
  const ok = dado.length === bueno.length && crypto.timingSafeEqual(dado, bueno);
  if (!ok) {
    f.n++; if (f.n >= 5) { f.hasta = Date.now() + 60e3; f.n = 0; log(L("Too many wrong PINs from {1}: blocked for 1 minute.", ip)); } fallos.set(ip, f);
    fallosGlobales = fallosGlobales.filter((t) => t > Date.now() - 600e3); fallosGlobales.push(Date.now());
    if (fallosGlobales.length >= 30) { cerradoHasta = Date.now() + 300e3; fallosGlobales = []; log(L("30 wrong PINs in 10 minutes: the API closes for 5 minutes.")); }
  }
  else fallos.delete(ip);
  return ok;
}
function leerCuerpo(req, max = 26e6) {
  return new Promise((res, rej) => {
    const partes = []; let n = 0;
    req.on("data", (c) => { n += c.length; if (n > max) { rej(new Error(L("too big"))); req.destroy(); } else partes.push(c); });
    req.on("end", () => res(Buffer.concat(partes)));
    req.on("error", rej);
  });
}
const json = (res, codigo, datos) => { res.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(datos)); };

const servidor = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    const ruta = url.pathname;
    if (req.method === "GET" && ARCHIVOS[ruta]) {
      const f = ARCHIVOS[ruta];
      const cuerpo = await fs.readFile(path.join(AQUI, f));
      res.writeHead(200, { "Content-Type": TIPOS[path.extname(f)], "Cache-Control": f.startsWith("img/") ? "max-age=86400" : "no-cache" });
      return res.end(cuerpo);
    }
    if (ruta === "/api/hola") return json(res, 200, { ferCasa: true, app: APP, version: VERSION, nombre: ed.e.nombre });
    // the app's window comes in with its PIN without you having to type it
    if (APP && ruta === "/app/entrar" && req.method === "GET") {
      const t = String(url.searchParams.get("t") || "");
      const ok = t.length === String(conf.pin).length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(String(conf.pin)));
      if (!ok) { res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("No."); }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
      return res.end(`<!doctype html><meta charset="utf-8"><script>try{localStorage.setItem("ferEdificio.pin",${JSON.stringify(String(conf.pin))})}catch(e){}location.replace("/")</script>`);
    }
    if (ruta.startsWith("/api/")) {
      if (!pinValido(req)) { await new Promise((r) => setTimeout(r, 400)); return json(res, 401, { error: L("Wrong PIN") }); }
      if (ruta === "/api/estado" && req.method === "GET") return json(res, 200, { estado: ed.e, ocupados: [...ed.ocupados], skills: manos.catalogo(),
        casa: { app: APP, clave: !!conf.clave, datos: APP ? DATOS : "", telegram: !!tg, claves: Object.fromEntries([...new Set([...Object.keys(PROVEEDORES), ...ed.conexiones().map((c) => c.id)])].filter((k) => k !== "openrouter").map((k) => [k, !!(conf.claves || {})[k]])),
          carpeta: { ruta: CARPETA_CEREBRO, notas: cerebro.notas, biblioteca: cerebro.biblioteca, ultimaSync: cerebro.ultimaSync, error: cerebro.error }, carpetaAgentes: CARPETA_AGENTES } });
      // saved images and music
      if (ruta.startsWith("/api/medio/") && req.method === "GET") {
        const id = decodeURIComponent(ruta.slice("/api/medio/".length));
        if (!/^med_[a-z0-9]+$/i.test(id)) return json(res, 400, { error: L("Not valid.") });
        const f = (await fs.readdir(MEDIOS)).find((x) => x.startsWith(id + "."));
        if (!f) return json(res, 404, { error: L("It isn't there.") });
        const tipo = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac" }[f.split(".").pop()] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": tipo, "Cache-Control": "private, max-age=86400" });
        return res.end(await fs.readFile(path.join(MEDIOS, f)));
      }
      // In the app, keys are set from Settings (there's no Terminal). They are saved in datos/config.json, only on this computer.
      if (APP && ruta === "/api/conf/clave" && req.method === "POST") {
        let d; try { d = JSON.parse((await leerCuerpo(req, 4096)).toString("utf8")); } catch { return json(res, 400, { error: L("Unreadable request.") }); }
        const prov = String(d.prov || "openrouter"), clave = String(d.clave || "").trim();
        if (prov === "openrouter") {
          if (!/^sk-or-[A-Za-z0-9_-]{10,}$/.test(clave)) return json(res, 400, { error: L("That doesn't look like an OpenRouter key (it starts with sk-or-).") });
          conf.clave = clave;
        } else {
          if (!ed.proveedor(prov)) return json(res, 400, { error: L("That API doesn't exist.") });
          if (clave) conf.claves[prov] = clave; else delete conf.claves[prov];
        }
        await guardarConf(conf);
        if (prov === "openrouter") cargarModelos().catch(() => {});
        return json(res, 200, { ok: true });
      }
      // In the app: where the brain lives (the window chooses the folder; it is used when the app opens again)
      if (APP && ruta === "/api/conf/carpeta" && req.method === "POST") {
        let d; try { d = JSON.parse((await leerCuerpo(req, 8192)).toString("utf8")); } catch { return json(res, 400, { error: L("Unreadable request.") }); }
        const r = path.resolve(String(d.ruta || ""));
        try { if (!(await fs.stat(r)).isDirectory()) throw 0; } catch { return json(res, 400, { error: L("That folder doesn't exist.") }); }
        conf.carpetaCerebro = r; await guardarConf(conf);
        return json(res, 200, { ok: true, reiniciar: true });
      }
      // In the app: open the agents' Chrome so you can sign in to your websites once (the session stays on this computer)
      if (APP && ruta === "/api/conf/entrar" && req.method === "POST") {
        let d; try { d = JSON.parse((await leerCuerpo(req, 4096)).toString("utf8")); } catch { return json(res, 400, { error: L("Unreadable request.") }); }
        let u; try { u = new URL(String(d.url || "").trim()); } catch { return json(res, 400, { error: L("Write the full address, for example https://mail.google.com") }); }
        if (!/^https?:$/.test(u.protocol)) return json(res, 400, { error: L("Write the full address, for example https://mail.google.com") });
        try { await manos.abrirVisible(u.href); } catch (e) { return json(res, 400, { error: e.message }); }
        return json(res, 200, { ok: true });
      }
      // the list of Claude's, OpenAI's or Grok's models with your key (the key doesn't leave Fer Home)
      if (ruta.startsWith("/api/modelos/") && req.method === "GET") {
        const prov = ruta.slice("/api/modelos/".length), P = ed.proveedor(prov), clave = (conf.claves || {})[prov];
        if (!P || prov === "openrouter") return json(res, 404, { error: L("It doesn't exist.") });
        if (!clave && !P.sinClave) return json(res, 400, { error: L("Fer Home has no {1} key. On this computer: node fer-casa.mjs claves", P.corto) });
        const base = (APIS[prov]) || P.api;
        const cab = P.formato === "anthropic" ? { "x-api-key": clave, "anthropic-version": "2023-06-01" } : clave ? { Authorization: "Bearer " + clave } : {};
        let r; try { r = await fetch(base + "/models" + (P.formato === "anthropic" ? "?limit=100" : ""), { headers: cab }); }
        catch (e) { return json(res, 400, { error: L("Couldn't talk to {1} ({2}).", P.corto, e.message) }); }
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return json(res, 400, { error: r.status === 401 || r.status === 403 ? L("The {1} key isn't valid.", P.corto) : L("{1} answered {2}", P.corto, r.status) });
        return json(res, 200, { modelos: filtrarModelosApi(prov, d) });
      }
      if (ruta === "/api/accion" && req.method === "POST") {
        let acc; try { acc = JSON.parse((await leerCuerpo(req, 12e6)).toString("utf8")); } catch { return json(res, 400, { error: L("Unreadable request.") }); }
        if (acc && acc.tipo === "hablar" && req.headers["x-fer-trozos"] === "1") {
          // in parts: each chunk of the reply goes out as soon as the brain writes it (one JSON line per chunk), and at the end, the result
          res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
          acc.alTrozo = (t) => { try { res.write(JSON.stringify({ trozo: t }) + "\n"); } catch {} };
          try { res.end(JSON.stringify({ fin: await ed.ejecutar(acc) }) + "\n"); }
          catch (e) { res.end(JSON.stringify({ error: e.message }) + "\n"); }
          return;
        }
        try { return json(res, 200, await ed.ejecutar(acc)); }
        catch (e) { return json(res, 400, { error: e.message }); }
      }
      // Gateway to OpenRouter for voice and hearing: the key never leaves Fer Home.
      if (ruta.startsWith("/api/or/")) {
        const destino = API + "/" + ruta.slice("/api/or/".length) + url.search;
        if (!/^\/api\/or\/(audio\/speech|audio\/transcriptions|generation)$/.test(ruta)) return json(res, 403, { error: L("Path not allowed.") });
        if (!ruta.endsWith("/generation") && ed.usoPresupuesto() >= 1) return json(res, 402, { error: { message: L("The building's spending cap has been reached.") } });
        const cuerpo = req.method === "GET" ? undefined : await leerCuerpo(req);
        const r = await fetch(destino, { method: req.method, headers: { "Authorization": "Bearer " + conf.clave, "Content-Type": req.headers["content-type"] || "application/json", "X-Title": "Fer Agent" }, body: cuerpo });
        const cab = { "Content-Type": r.headers.get("content-type") || "application/octet-stream", "Cache-Control": "no-store" };
        if (r.headers.get("x-generation-id")) cab["X-Generation-Id"] = r.headers.get("x-generation-id");
        res.writeHead(r.status, cab);
        return res.end(Buffer.from(await r.arrayBuffer()));
      }
      return json(res, 404, { error: L("It doesn't exist.") });
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); res.end(L("It doesn't exist."));
  } catch (e) {
    log(L("Error: {1}", e.message));
    if (!res.headersSent) json(res, 500, { error: e.message });
  }
});
servidor.listen(PUERTO, APP ? "127.0.0.1" : "0.0.0.0", () => {
  if (APP) { log(L("Fer Agent {1} (app) at {2}. Data: {3}", VERSION, `http://127.0.0.1:${PUERTO}`, DATOS)); if (process.send) process.send({ listo: true }); return; }
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
  const n = carpetasCerebro(ed.e);
  console.log("\n" + L("Fer Home {1} is on. The building beats every {2} seconds.", VERSION, LATIDO_SEG));
  console.log("  " + L("Brain ({1}, {2}, backup): {3}", n.biblioteca, n.memoria, CARPETA_CEREBRO));
  console.log("  " + L("On this device:         {1}", `http://localhost:${PUERTO}`));
  for (const ip of ips) console.log("  " + L("From your home network: {1}", `http://${ip}:${PUERTO}`));
  console.log(L("To stop it: Ctrl+C. The data stays in {1}", DATOS) + "\n");
});
const salir = async () => { log(L("Saving and quitting…")); try { await ed.guardar(); } catch {} try { await sincronizarCerebro(true); } catch {} try { await manos.cerrar(); } catch {} process.exit(0); };
process.on("SIGINT", salir);
process.on("unhandledRejection", (e) => log(L("Notice: {1}", (e && e.message) || e)));   // a stray failure doesn't switch Fer Home off
process.on("SIGTERM", salir);
