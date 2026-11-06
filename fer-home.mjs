#!/usr/bin/env node
// =====================================================================
// Fer Home (fer-home.mjs) — the same building, running 24 hours a day.
// It runs on a computer (Mac, Windows, Linux), on an Android phone with
// Termux or on a rented server. All it needs is Node 18 or newer.
//
//   node fer-home.mjs
//
// The first time it asks for your OpenRouter key and a PIN, and saves them in the
// «data» folder. Then open the address it shows you in your browser.
//
// More commands (version 7):
//   node fer-home.mjs keys          → keys for Claude, OpenAI and Grok (direct brains)
//   node fer-home.mjs folder        → where the brain lives (Library, Long-term memory and the backup)
//   node fer-home.mjs telegram      → connect Telegram: the inbox and the alerts on your phone
//   node fer-home.mjs login [web]   → open the agents' Chrome so you can sign in once yourself (for example, on X)
//   node fer-home.mjs email         → connect a mailbox (for the Email agent: it reads what comes in and you approve each reply)
// Fer Home speaks its building's language: in the Terminal, on Telegram and in its messages to the website.
// =====================================================================
import http from "node:http";
import fs from "node:fs/promises";
import { readFileSync, existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { Building, VERSION, fmt, memoryNotesMd, PROVIDERS, filterApiModels, brainFolders, translate, fillIn, setLanguage, LANGUAGE, LOCALE, migrateFromV8, emailServers } from "./engine.js";
import { createHands } from "./hands.mjs";

// Environment variables: the names from before version 9 still work
for (const [now, before] of [["FER_LANGUAGE", "FER_IDIOMA"], ["FER_DATA", "FER_DATOS"], ["FER_PORT", "FER_PUERTO"], ["FER_HEARTBEAT_SEC", "FER_LATIDO_SEG"], ["FER_BRAIN_SEC", "FER_CEREBRO_SEG"],
  ["FER_TEMPLATE", "FER_PLANTILLA"], ["FER_HANDS_VISIBLE", "FER_MANOS_VISIBLES"], ["FER_CHROME_CHANNEL", "FER_CHROME_CANAL"], ["FER_ALLOW_LOCAL", "FER_PERMITIR_LOCAL"], ["FER_SEARCH_ENGINE", "FER_BUSCADOR"]])
  if (process.env[now] === undefined && process.env[before] !== undefined) process.env[now] = process.env[before];
// Until the building is open (the first-time questions), the computer's language; then, the building's
const COMPUTER_LANGUAGE = /^es/i.test(process.env.FER_LANGUAGE || process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || "") ? "es" : "en";
setLanguage(COMPUTER_LANGUAGE);
const L = (s, ...v) => fillIn(translate(LANGUAGE, s), v);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.FER_DATA || path.join(HERE, "data");
// Before version 9 the data folder and what's in it had Spanish names (datos/, edificio.json, copias/…). They move once, the first
// time this version starts; nothing is deleted. MOVED says where each one went, for the paths saved in config.json and brain-sync.json.
const OLD_DATA = path.basename(DATA) === "data" ? path.join(path.dirname(DATA), "datos") : "";
const MOVED = [...(OLD_DATA ? [[OLD_DATA, DATA]] : []), ...[["edificio.json", "building.json"], ["copias", "backups"], ["medios", "media"], ["cerebro", "brain"],
  ["carpeta-agentes", "agent-files"], ["chrome-agentes", "agents-chrome"], ["cerebro-sync.json", "brain-sync.json"]].map(([a, b]) => [path.join(DATA, a), path.join(DATA, b)])];
const movedNow = [];
for (const [a, b] of MOVED) if (existsSync(a) && !existsSync(b)) { try { renameSync(a, b); movedNow.push(path.basename(a) + " → " + path.basename(b)); } catch {} }
try { for (const f of readdirSync(path.join(DATA, "backups"))) if (/^edificio-.+\.json$/.test(f)) { const n = f.replace(/^edificio-/, "building-"); if (!existsSync(path.join(DATA, "backups", n))) renameSync(path.join(DATA, "backups", f), path.join(DATA, "backups", n)); } } catch {}
// a path saved before the move (for example, the brain folder inside datos/cerebro): where it is now
const movedPath = (p) => { if (!p || existsSync(p)) return p; for (const [a, b] of MOVED) if (p === a || p.startsWith(a + path.sep)) p = b + p.slice(a.length); return p; };
const API = (process.env.OPENROUTER_BASE || "https://openrouter.ai/api/v1").replace(/\/$/, "");
const PORT = Number(process.env.FER_PORT || 8787);
const HEARTBEAT_SEC = Math.max(1, Number(process.env.FER_HEARTBEAT_SEC || 20));
const FILES = { "/": "index.html", "/index.html": "index.html", "/app.js": "app.js", "/engine.js": "engine.js", "/characters.js": "characters.js", "/languages.js": "languages.js", "/landing.js": "landing.js" };
// the building's and the characters' pictures (only these: no other file in the folder is served)
for (const f of ["landing", "dome", "dome2x", "storey", "storey2x", "lobby", "lobby2x", "character-boy", "character-girl", "character-grandpa", "character-grandma",
  "character-purple", "character-green", "character-coral", "character-blue", "character-teal", "character-shirt"]) FILES["/img/" + f + ".webp"] = "img/" + f + ".webp";
for (const f of ["boy", "girl", "grandpa", "grandma"]) FILES["/img/character-" + f + "-zones.png"] = "img/character-" + f + "-zones.png";
// the translations in the languages/ folder (es.js…)
try { for (const f of readdirSync(path.join(HERE, "languages"))) if (/^[a-z-]{2,8}\.js$/.test(f)) FILES["/languages/" + f] = "languages/" + f; } catch {}
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".webp": "image/webp", ".png": "image/png" };
const COMMAND = ((c) => ({ claves: "keys", carpeta: "folder", entrar: "login", correo: "email" })[c] || c)((process.argv[2] || "").toLowerCase());   // the Spanish names work too
// Inside the desktop app (version 9): no Terminal. The app sets the PIN itself, the key is pasted in Settings
// and the server can only be reached from this computer.
const APP = process.env.FER_APP === "1";

mkdirSync(DATA, { recursive: true });
const CONFIG_FILE = path.join(DATA, "config.json");
// API addresses (only for tests: FER_API_<ID>=…; the usual ones, ANTHROPIC_BASE, OPENAI_BASE and XAI_BASE)
const APIS = Object.assign({ anthropic: process.env.ANTHROPIC_BASE, openai: process.env.OPENAI_BASE, xai: process.env.XAI_BASE },
  Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith("FER_API_")).map(([k, v]) => [k.slice(8).toLowerCase(), v])));
const STATE_FILE = path.join(DATA, "building.json");
const clockTime = () => new Date().toLocaleTimeString(LOCALE);
const log = (...a) => console.log(`[${clockTime()}]`, ...a);

// ---------------- Configuration (key and PIN) ----------------
async function configuration() {
  let conf = {};
  try { conf = JSON.parse(readFileSync(CONFIG_FILE, "utf8")); } catch {}
  // a configuration saved before version 9 (Spanish names): it's read with the new ones (and saved that way next time)
  for (const [now, before] of [["key", "clave"], ["keys", "claves"], ["brainFolder", "carpetaCerebro"], ["agentsFolder", "carpetaAgentes"], ["handsVisible", "manosVisibles"]])
    if (conf[now] === undefined && conf[before] !== undefined) { conf[now] = conf[before]; delete conf[before]; }
  conf.brainFolder = movedPath(conf.brainFolder); conf.agentsFolder = movedPath(conf.agentsFolder);   // folders chosen inside datos/ before version 9
  if (process.env.OPENROUTER_API_KEY) conf.key = process.env.OPENROUTER_API_KEY;
  if (process.env.FER_PIN) conf.pin = process.env.FER_PIN;
  if (APP) {   // in the app nothing is asked: the PIN is created on its own (the window carries it) and the key is pasted in Settings
    if (!conf.pin || String(conf.pin).length < 24) { conf.pin = crypto.randomBytes(18).toString("base64url"); await saveConfig(Object.assign({ keys: {} }, conf)); }
    conf.key = conf.key || "";
    conf.keys = Object.assign({}, conf.keys || {});
    return conf;
  }
  if (conf.pin && String(conf.pin).length < 8) {
    if (process.stdin.isTTY) { console.log(L("The saved PIN is too short (8 at least). Choose another one.")); conf.pin = ""; }
    else { console.error(L("The PIN must have at least 8 digits or letters. Run “node fer-home.mjs” by hand to change it.")); process.exit(1); }
  }
  if (!conf.key || !conf.pin) {
    if (!process.stdin.isTTY) { console.error(L("The key or the PIN is missing. Run “node fer-home.mjs” once by hand to set it up.")); process.exit(1); }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log("\n" + L("Fer Home · first time") + "\n");
    while (!conf.key || !conf.key.startsWith("sk-")) conf.key = (await rl.question(L("Paste your OpenRouter key (it starts with sk-or-): "))).trim();
    while (!conf.pin || conf.pin.length < 8) conf.pin = (await rl.question(L("Choose a PIN of at least 8 digits or letters (the website will ask you for it): "))).trim();
    rl.close();
    await saveConfig(conf);
    console.log(L("Saved in {1} (only your user can read it).", CONFIG_FILE) + "\n");
  }
  conf.keys = Object.assign({}, conf.keys || {});
  if (process.env.ANTHROPIC_API_KEY) conf.keys.anthropic = process.env.ANTHROPIC_API_KEY;
  if (process.env.OPENAI_API_KEY) conf.keys.openai = process.env.OPENAI_API_KEY;
  if (process.env.XAI_API_KEY) conf.keys.xai = process.env.XAI_API_KEY;
  return conf;
}
async function saveConfig(conf) {
  const clean = { key: conf.key, pin: conf.pin, keys: conf.keys || {}, brainFolder: conf.brainFolder || "", agentsFolder: conf.agentsFolder || "", telegram: conf.telegram || null, handsVisible: !!conf.handsVisible, email: conf.email || null };
  await fs.writeFile(CONFIG_FILE, JSON.stringify(clean, null, 1), { mode: 0o600 });
}
// Questions in the Terminal (keys, folder, Telegram)
async function askQuestion(text, rl) { return (await rl.question(text)).trim(); }
const DELETE_WORDS = ["delete", "borrar"];   // either language works
async function keysCommand(conf) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log("\n" + L("Other APIs (the ones from your subscriptions). Paste each key (or press Enter to leave it as it is; type “delete” to remove it)."));
  console.log(L("They are only saved in {1} and only travel to each API's address.", CONFIG_FILE) + "\n");
  // the known ones and the ones you added on the website (Settings → Other APIs)
  let ownOnes = [];
  try { ownOnes = ((savedBuilding() || {}).settings || {}).connections || []; ownOnes = ownOnes.filter((c) => c && c.api && c.id && !PROVIDERS[c.id]); } catch {}
  const list = [...Object.entries(PROVIDERS).filter(([k, P]) => k !== "openrouter" && !P.noKey).map(([k, P]) => [k, `${P.name}${P.web ? " (" + P.web + ")" : ""}`]),
    ...ownOnes.map((c) => [c.id, `${c.name || c.id} (${c.api})`])];
  for (const [prov, name] of list) {
    const v = await askQuestion(`${name} [${conf.keys[prov] ? L("set") : L("no key")}]: `, rl);
    if (DELETE_WORDS.includes(v)) delete conf.keys[prov]; else if (v) conf.keys[prov] = v;
  }
  rl.close(); await saveConfig(conf); console.log(L("Saved.") + "\n");
}
async function folderCommand(conf) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const n = brainFolders(savedBuilding());
  console.log("\n" + L("Brain folder: inside there will be “{1}”, “{2}” and “{3}”.", n.library, n.memory, n.backup));
  console.log(L("If you also want it in Google Drive and in Obsidian, choose a folder inside Google Drive for desktop"));
  console.log(L("(on a Mac it's usually in /Users/YOUR_USER/Library/CloudStorage/GoogleDrive-…/My Drive/Fer Agent)."));
  const v = await askQuestion(L("Full path [now: {1}]: ", conf.brainFolder || path.join(DATA, "brain")), rl);
  const v2 = await askQuestion(L("The agents' folder, where they read and write their files [now: {1}]: ", conf.agentsFolder || path.join(DATA, "agent-files")), rl);
  rl.close();
  if (v) { mkdirSync(v, { recursive: true }); conf.brainFolder = path.resolve(v); }
  if (v2) { mkdirSync(v2, { recursive: true }); conf.agentsFolder = path.resolve(v2); }
  await saveConfig(conf); console.log(L("Saved.") + "\n");
}
// The mailbox (for the Email agent): address, password and servers, saved only here (config.json)
async function emailCommand(conf) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const now = conf.email || {};
  console.log("\n" + L("The mailbox the Email agent reads (and sends from, each email with your yes). It's only saved in {1}.", CONFIG_FILE));
  console.log(L("Many providers (Gmail, iCloud, Yahoo…) ask for an “app password”, created in your account's security settings, instead of your usual one."));
  const address = await askQuestion(L("Address [now: {1}] (or “delete” to disconnect): ", now.address || L("none")), rl);
  if (DELETE_WORDS.includes(address)) { conf.email = null; rl.close(); await saveConfig(conf); console.log(L("Mailbox disconnected.") + "\n"); return; }
  const a = address || now.address;
  if (!a || !a.includes("@")) { rl.close(); console.log(L("No address: nothing changed.") + "\n"); return; }
  const g = (a === now.address ? now : null) || emailServers(a);
  const password = await askQuestion(L("Password{1}: ", now.password && a === now.address ? L(" [Enter leaves it as it is]") : ""), rl) || (a === now.address ? now.password : "");
  const imapHost = await askQuestion(L("Server to read (IMAP) [{1}]: ", g.imapHost), rl) || g.imapHost;
  const imapPort = Number(await askQuestion(L("Its port [{1}]: ", g.imapPort), rl)) || g.imapPort;
  const smtpHost = await askQuestion(L("Server to send (SMTP) [{1}]: ", g.smtpHost), rl) || g.smtpHost;
  const smtpPort = Number(await askQuestion(L("Its port [{1}]: ", g.smtpPort), rl)) || g.smtpPort;
  rl.close();
  conf.email = { address: a, password, imapHost, imapPort, smtpHost, smtpPort, name: now.name || "" };
  await saveConfig(conf); console.log(L("Saved. Open Fer Home and, in Settings → Email, press “Check”.") + "\n");
}
// the saved building, to know its brain folder names before opening it
function savedBuilding() { try { return migrateFromV8(JSON.parse(readFileSync(STATE_FILE, "utf8"))); } catch { return null; } }
async function telegramCommand(conf) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log("\n" + L("Telegram: the inbox and the alerts on your phone, with buttons to approve or reject."));
  console.log(L("1. In Telegram, talk to @BotFather, type /newbot and follow the steps. It gives you a “token”."));
  const token = await askQuestion(L("2. Paste the token here (or “delete” to disconnect): "), rl);
  if (DELETE_WORDS.includes(token)) { conf.telegram = null; rl.close(); await saveConfig(conf); console.log(L("Telegram disconnected.") + "\n"); return; }
  if (!token) { rl.close(); return; }
  console.log(L("3. Now open your new bot in Telegram and send it /start. I'll wait up to 2 minutes…"));
  rl.close();
  const api = (m) => `${TELEGRAM}/bot${token}/${m}`;
  let chat = null;
  for (let i = 0; i < 24 && !chat; i++) {
    try { const d = await (await fetch(api("getUpdates?timeout=5"))).json(); const u = (d.result || []).reverse().find((x) => x.message && x.message.chat); if (u) chat = u.message.chat.id; } catch {}
    if (!chat) await new Promise((r) => setTimeout(r, 5000));
  }
  if (!chat) { console.log(L("Your /start didn't arrive. Try again: node fer-home.mjs telegram") + "\n"); return; }
  conf.telegram = { token, chat };
  await saveConfig(conf);
  await fetch(api("sendMessage"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: L("Fer Home connected. The inbox and the alerts will reach you here. Commands: /inbox, /pause, /resume.") }) }).catch(() => {});
  console.log(L("Connected. It will only listen to this chat.") + "\n");
}

// ---------------- Starting the engine ----------------
const TELEGRAM = (process.env.TELEGRAM_API || "https://api.telegram.org").replace(/\/$/, "");
const conf = await configuration();
if (COMMAND === "keys") { await keysCommand(conf); process.exit(0); }
if (COMMAND === "folder") { await folderCommand(conf); process.exit(0); }
if (COMMAND === "telegram") { await telegramCommand(conf); process.exit(0); }
if (COMMAND === "email") { await emailCommand(conf); process.exit(0); }
const BRAIN_FOLDER = conf.brainFolder || path.join(DATA, "brain");
const AGENTS_FOLDER = conf.agentsFolder || path.join(DATA, "agent-files");
const MEDIA = path.join(DATA, "media");
mkdirSync(MEDIA, { recursive: true });
// The hands: the agents' Chrome, their folder and the skills (Fer Agent's and yours in data/skills)
const hands = createHands({ agentsFolder: AGENTS_FOLDER, chromeProfile: path.join(DATA, "agents-chrome"), skillsFolders: [path.join(HERE, "skills"), path.join(DATA, "skills")], email: () => conf.email,
  visible: !!conf.handsVisible || process.env.FER_HANDS_VISIBLE === "1", channel: process.env.FER_CHROME_CHANNEL || "chrome", log: (...a) => log(...a),
  locale: () => (typeof ed !== "undefined" && ed.e && ed.e.language === "en" ? "en-US" : "es-ES") });   // websites, in the building's language
if (COMMAND === "login") {
  const url = process.argv[3] || "https://x.com/login";
  console.log("\n" + L("Opening the agents' Chrome at {1}. Sign in with your account and, when you're done, close that Chrome window.", url) + "\n");
  const ctx = await hands.openVisible(url);
  await new Promise((r) => ctx.on("close", r));
  console.log(L("Done: the session stays saved in the agents' profile.") + "\n");
  process.exit(0);
}
let saving = Promise.resolve();
const BACKUPS = path.join(DATA, "backups");
const ed = new Building({
  api: API,
  key: () => conf.key,
  keys: () => conf.keys || {},
  apis: APIS,
  hands,
  // images and music are saved in data/media (they are not lost)
  saveMedia: async (id, url, type) => {
    const m = String(url).match(/^data:([^;]+);base64,(.*)$/s);
    if (!m || !/^med_[a-z0-9]+$/i.test(id)) return;
    const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg", "audio/flac": "flac" }[m[1]] || "bin";
    await fs.writeFile(path.join(MEDIA, `${id}.${ext}`), Buffer.from(m[2], "base64"));
  },
  onChange: (ev) => engineNotice(ev),
  // Techie saves a backup of the building in data/backups on Fridays (the last 8 are kept)
  backup: async (json, day) => {
    await fs.mkdir(BACKUPS, { recursive: true });
    await fs.writeFile(path.join(BACKUPS, `building-${day}.json`), json, { mode: 0o600 });
    const oldOnes = (await fs.readdir(BACKUPS)).filter((f) => /^building-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(0, -8);
    for (const f of oldOnes) await fs.unlink(path.join(BACKUPS, f)).catch(() => {});
    log(/^\d{4}-/.test(day) ? L("Techie saved a backup: {1}", `data/backups/building-${day}.json`) : L("The building as it was before moving to this version: {1}", `data/backups/building-${day}.json`));
  },
  load: async () => (existsSync(STATE_FILE) ? fs.readFile(STATE_FILE, "utf8") : null),
  save: async (json) => {   // safe writing: first to a temporary file, then it is renamed
    saving = saving.then(async () => { const tmp = STATE_FILE + ".tmp"; await fs.writeFile(tmp, json); await fs.rename(tmp, STATE_FILE); }).catch((e) => log(L("I couldn't save: {1}", e.message)));
    await saving;
  }
});
async function loadModels() {
  try {
    // all the models (text, image, music, voice, hearing…); if that query fails, only the text ones
    let list = [];
    try { const r = await fetch(API + "/models?output_modalities=all"); if (r.ok) list = (await r.json()).data || []; } catch {}
    if (!list.length) { const r = await fetch(API + "/models"); if (r.ok) list = (await r.json()).data || []; }
    if (list.length) { ed.setModels(list); log(L("OpenRouter model list: {1}.", ed.models.length)); }
  }
  catch (e) { log(L("I couldn't read the model list: {1}", e.message)); }
}
await loadModels();
await ed.start(({ vacio: "empty", basico: "basic" })[process.env.FER_TEMPLATE] || process.env.FER_TEMPLATE || "empty", COMPUTER_LANGUAGE);   // a new building starts with only the boss, in the computer's language (FER_LANGUAGE=en|es chooses)
if (movedNow.length) log(L("The data folder and what is in it now have English names: {1}.", movedNow.join(", ")));
log(L("Building “{1}” with {2} agents. Spending today: {3}.", ed.e.name, ed.e.agents.length, fmt(ed.buildingSpending("today"))));
log(ed.e.settings.pause ? L("General pause on: nothing that spends wakes up on its own (turn it off on the website, next to the counter, or with /resume on Telegram).") : L("Automatic work running."));
log(L("Hands: {1}. The agents' folder: {2}", hands.catalog().map((k) => k.name).join(", ") || L("no skills"), AGENTS_FOLDER));
setInterval(loadModels, 6 * 3600e3).unref();

// ---------------- The brain in a folder (Library, Long-term memory and the building's backup) ----------------
// If the folder is inside Google Drive for desktop, it is also in Drive and you open it with Obsidian.
const brain = { written: new Map(), seen: new Map(), lastSync: 0, notes: 0, library: 0, busy: false, changes: 0, error: "", first: true };
// when it last synced with the folder (it's saved: when Fer Home restarts, what you deleted in Obsidian doesn't come back)
const SYNC_FILE = path.join(DATA, "brain-sync.json");
try { const g = JSON.parse(readFileSync(SYNC_FILE, "utf8")); if (movedPath(g.folder ?? g.carpeta) === BRAIN_FOLDER) brain.lastSync = Number(g.lastSync ?? g.ultimaSync) || 0; } catch {}   // «carpeta», «ultimaSync»: before version 9
async function listMd(dir, recursive, base = dir, level = 0) {
  const out = [];
  let items = []; try { items = await fs.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const d of items) {
    if (d.name.startsWith(".")) continue;
    const f = path.join(dir, d.name);
    if (d.isDirectory()) { if (recursive && level < 4) out.push(...await listMd(f, true, base, level + 1)); }
    else if (/\.(md|txt)$/i.test(d.name)) { const st = await fs.stat(f).catch(() => null); if (st) out.push({ f, path: path.relative(base, f).split(path.sep).join("/"), modified: st.mtimeMs }); }
  }
  return out;
}
async function syncBrain(writeOnly) {
  if (brain.busy) { brain.again = true; return; }
  brain.busy = true;
  try {
    const n = brainFolders(ed.e);
    const memDir = path.join(BRAIN_FOLDER, n.memory), bibDir = path.join(BRAIN_FOLDER, n.library);
    await fs.mkdir(memDir, { recursive: true }); await fs.mkdir(bibDir, { recursive: true });
    // Before writing anything, what you corrected by hand in Obsidian comes in (without losing what was noted here since last time)
    for (const x of await listMd(memDir, false)) {
      if (x.path === n.index + ".md" || (brain.seen.get(x.f) || 0) >= x.modified) continue;
      const text = await fs.readFile(x.f, "utf8");
      brain.seen.set(x.f, x.modified);
      if (brain.written.get(x.f) === text) continue;
      await ed.run({ type: "memory.import", topic: x.path.replace(/\.md$/i, ""), text, keepFrom: brain.lastSync });
      log(L("Long-term memory: read what you changed in “{1}”.", x.path));
    }
    if (!writeOnly) {
      const docs = [];
      for (const x of await listMd(bibDir, true)) docs.push({ path: n.library + "/" + x.path, title: x.path.split("/").pop().replace(/\.(md|txt)$/i, ""), text: (await fs.readFile(x.f, "utf8")).slice(0, 300000) });
      ed.setLibrary(docs); brain.library = docs.length;
    }
    const names = Object.fromEntries(ed.e.agents.map((a) => [a.id, a.name]));
    const notes = memoryNotesMd(ed.e.longMemory, names, n);
    for (const n of notes) {
      const f = path.join(BRAIN_FOLDER, ...n.path.split("/"));
      if (brain.written.get(f) === n.text) continue;
      await fs.writeFile(f, n.text);
      brain.written.set(f, n.text);
      const st = await fs.stat(f).catch(() => null); if (st) brain.seen.set(f, st.mtimeMs);
    }
    brain.notes = notes.length - 1;
    if (brain.changes || brain.first) {
      const tmp = path.join(BRAIN_FOLDER, n.backup + ".tmp");
      await fs.writeFile(tmp, JSON.stringify({ type: "fer-agent-building", version: VERSION, device: "fer-home", ts: Date.now(), building: ed.e }));
      await fs.rename(tmp, path.join(BRAIN_FOLDER, n.backup));
      brain.changes = 0; brain.first = false;
    }
    brain.lastSync = Date.now(); brain.error = "";
    await fs.writeFile(SYNC_FILE, JSON.stringify({ folder: BRAIN_FOLDER, lastSync: brain.lastSync })).catch(() => {});
  } catch (e) { brain.error = e.message; log(L("Brain: {1}", e.message)); }
  finally { brain.busy = false; if (brain.again) { brain.again = false; setTimeout(() => syncBrain(true), 500); } }
}
await syncBrain();
setInterval(() => syncBrain(), Math.max(2, Number(process.env.FER_BRAIN_SEC || 120)) * 1000).unref();
let brainWait = null, brainWhen = 0, inboxWait = null;

// ---------------- The engine's notices: the brain folder and Telegram ----------------
function engineNotice(ev) {
  if (ev.type === "state") brain.changes++;
  if (ev.type === "memory" || ev.type === "state") {
    const when = Date.now() + (ev.type === "memory" ? 4000 : 30000);
    if (!brainWait || when < brainWhen) { clearTimeout(brainWait); brainWhen = when; brainWait = setTimeout(() => { brainWait = null; syncBrain(true); }, when - Date.now()); }
  }
  // any change may bring something new to the inbox (the Creator's agents, coins, lessons, meetings, models…): it's all looked at together
  if (ev.type === "inbox" || ev.type === "state") { clearTimeout(inboxWait); inboxWait = setTimeout(() => notifyInbox().catch(() => {}), ev.type === "inbox" ? 300 : 1000); }
  if (ev.type === "skill") telegramSend(`${ev.name} (${ev.skill}):\n\n${String(ev.text).slice(0, 3800)}`);
}

// ---------------- Telegram: the inbox on your phone (it only listens to your chat) ----------------
const tg = conf.telegram && conf.telegram.token && conf.telegram.chat ? conf.telegram : null;
const notified = new Set();
async function telegram(method, body) {
  if (!tg) return null;
  try {
    const r = await fetch(`${TELEGRAM}/bot${tg.token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    return await r.json();
  } catch (e) { log("Telegram: " + e.message); return null; }
}
function telegramSend(text, buttons) {
  if (!tg) return;
  const b = { chat_id: tg.chat, text: String(text).slice(0, 4000), disable_web_page_preview: true };
  if (buttons) b.reply_markup = { inline_keyboard: buttons };
  return telegram("sendMessage", b);
}
const KIND = { action: "Action outside the website", agent: "New agent", meeting: "Meeting", coin: "Coin", lesson: "New lesson", model: "Recommended model", missing: "Missing something" };
function requestText(x) {
  const cost = ["missing", "coin", "lesson", "model"].includes(x.kind) ? "" : x.cost > 0 ? " · " + (x.perDay ? L("≈{1} a day", fmt(x.cost)) : `≈${fmt(x.cost)}`) : "";
  return `${L(KIND[x.kind] || x.kind)} · ${x.who}${cost}\n${x.what}${x.detail ? "\n\n" + String(x.detail).slice(0, 1200) : ""}`;
}
// the keys of the Telegram buttons (short: 64 characters at most)
const buttonKeys = new Map();
function buttonsFor(x, noOnly) {
  const k = Math.random().toString(36).slice(2, 10);
  buttonKeys.set(k, { kind: x.kind, id: x.id, rounds: x.rounds });
  if (buttonKeys.size > 500) buttonKeys.delete(buttonKeys.keys().next().value);
  const yes = L({ action: "Approve and do it", meeting: "Start the meeting", missing: "It has it now", coin: "Confirm", agent: "Create" }[x.kind] || "Approve");
  const no = { text: "✖️ " + L(x.kind === "missing" ? "Later" : "Reject"), callback_data: "no:" + k };
  return [noOnly ? [no] : [{ text: "✅ " + yes, callback_data: "yes:" + k }, no]];
}
// A request to the phone. If it's a long action, what is going to be done goes in several messages before the buttons
// (up to 6; if there's more, it says how much is missing, and it's all in the website's inbox).
async function sendRequest(x) {
  const det = String(x.detail || "");
  if (x.kind !== "action" || det.length <= 1200) return telegramSend(requestText(x), buttonsFor(x));
  const header = `${L(KIND[x.kind])} · ${x.who}\n${x.what}`;
  const n = Math.min(6, Math.ceil(det.length / 3500)), rest = det.length - n * 3500;
  for (let i = 0; i < n; i++) await telegramSend(`(${i + 1}/${n}) ${det.slice(i * 3500, (i + 1) * 3500)}`);
  return telegramSend(`${header}\n\n(${rest > 0 ? L("what it will do, in the {1} messages above; {2} characters are missing, all of it is in the website's inbox", n, rest.toLocaleString(LOCALE)) : L("what it will do, in the {1} messages above", n)})`, buttonsFor(x));
}
const noticeKey = (x) => x.kind + ":" + x.id + ":" + (x.ts || 0);   // with the time: if an agent says again that it's missing something, it's notified again
async function notifyInbox() {
  if (!tg) return;
  const now = ed.inbox(), stillThere = new Set(now.map(noticeKey));
  for (const k of [...notified]) if (!stillThere.has(k)) notified.delete(k);   // what has been decided is forgotten
  for (const x of now) {
    const k = noticeKey(x);
    if (notified.has(k)) continue;
    notified.add(k);
    await sendRequest(x);
  }
}
async function listenTelegram() {
  if (!tg) return;
  let since = 0;
  log(L("Telegram connected: the inbox and the alerts reach your phone."));
  for (const x of ed.inbox()) notified.add(noticeKey(x));   // what was already pending isn't repeated on start
  let wait = 0, lastFailure = "";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (;;) {
    let d = null;
    const t0 = Date.now();
    try { d = await (await fetch(`${TELEGRAM}/bot${tg.token}/getUpdates?timeout=50&offset=${since}`)).json(); } catch { d = null; }
    if (!d || d.ok === false) {
      // If Telegram says no (bad token, another program reading the same bot…) or there's no network: it waits longer each time (up to 5 min), without hammering
      const reason = d ? `${d.error_code || ""} ${d.description || ""}`.trim() : L("no connection");
      if (reason !== lastFailure) log(`Telegram: ${reason}. ` + (d && d.error_code === 401 ? L("The token isn't valid: run node fer-home.mjs telegram again.") : d && d.error_code === 409 ? L("Another program is reading this same bot.") : L("I'll retry on my own.")));
      lastFailure = reason; wait = Math.min(300000, wait ? wait * 2 : 5000);
      await sleep(wait); continue;
    }
    if (lastFailure) log(L("Telegram is answering again."));
    wait = 0; lastFailure = "";
    if (!(d.result || []).length && Date.now() - t0 < 1000) await sleep(1000);   // never more than one request per second
    for (const u of d.result || []) {
      since = u.update_id + 1;
      const cb = u.callback_query, msg = u.message;
      const chat = cb ? cb.message && cb.message.chat && cb.message.chat.id : msg && msg.chat && msg.chat.id;
      if (String(chat) !== String(tg.chat)) continue;   // only your chat
      try {
        if (cb) {
          const [r, k] = String(cb.data || "").split(":");
          const x = buttonKeys.get(k);
          let res = L("That's no longer pending (or Fer Home restarted: look at the inbox on the website).");
          if (x) {
            buttonKeys.delete(k);
            if (x.kind === "missing" && r === "no") res = L("It stays in the inbox.");
            else {
              const out = await ed.run({ type: "inbox.decide", kind: x.kind, id: x.id, yes: r === "yes", rounds: x.rounds });
              res = r === "yes" ? (out && out.state === "error" ? L("It couldn't be done: {1}", out.result) : L("Done.") + (out && out.result ? "\n" + String(out.result).slice(0, 1500) : "")) : L("Rejected.");
            }
          }
          await telegram("answerCallbackQuery", { callback_query_id: cb.id, text: res.slice(0, 180) });
          await telegram("editMessageText", { chat_id: chat, message_id: cb.message.message_id, text: (cb.message.text || "") + "\n\n→ " + res });
        } else if (msg && msg.text) {
          const t = msg.text.trim().toLowerCase();
          // the commands, in English or in Spanish
          if (t.startsWith("/inbox") || t.startsWith("/bandeja") || t === "/start") {
            const b = ed.inbox();
            if (!b.length) await telegramSend(L("The inbox is empty.") + " " + L(ed.e.settings.pause ? "The building is on general pause." : "Automatic work is running."));
            for (const x of b) await sendRequest(x);
          } else if (t.startsWith("/pause") || t.startsWith("/pausa")) { await ed.run({ type: "pause", pause: true }); await telegramSend(L("General pause on: nothing that spends wakes up on its own.")); }
          else if (t.startsWith("/resume") || t.startsWith("/marcha")) { await ed.run({ type: "pause", pause: false }); await telegramSend(L("Automatic work running: heartbeats are working again.")); }
          else await telegramSend(L("Commands: /inbox (what's waiting for your yes), /pause (stops everything automatic), /resume (starts it again)."));
        }
      } catch (e) { log("Telegram: " + e.message); await telegramSend(L("It couldn't be done: {1}", e.message)); }
    }
  }
}
listenTelegram();

// ---------------- The heartbeat ----------------
let lastSeen = Math.max(0, ...ed.e.log.map((x) => x.ts)), beating = false;
function printNews() {   // writes on screen what the agents have done
  const newItems = ed.e.log.filter((x) => x.ts > lastSeen);
  for (const x of newItems.slice(-20)) log(`${x.name}: ${x.text}${x.cost ? " · " + fmt(x.cost) : ""}`);
  if (newItems.length) lastSeen = Math.max(...newItems.map((x) => x.ts));
}
setInterval(async () => {
  if (beating) return;
  beating = true;
  try { await ed.tick(); } catch (e) { log(L("Error in the heartbeat: {1}", e.message)); }
  finally { beating = false; }
  printNews();
}, HEARTBEAT_SEC * 1000);

// ---------------- The server (website + API with PIN) ----------------
const failures = new Map();   // failed PIN attempts per address
let globalFailures = [], closedUntil = 0;   // a general brake in case they try from many addresses
function validPin(req) {
  const ip = req.socket.remoteAddress || "";
  const f = failures.get(ip) || { n: 0, until: 0 };
  if (f.until > Date.now() || closedUntil > Date.now()) return false;
  if (!req.headers["x-fer-pin"]) return false;            // without a PIN it doesn't count as an attempt (you don't lock yourself out)
  const given = Buffer.from(String(req.headers["x-fer-pin"] || ""));
  const good = Buffer.from(String(conf.pin));
  const ok = given.length === good.length && crypto.timingSafeEqual(given, good);
  if (!ok) {
    f.n++; if (f.n >= 5) { f.until = Date.now() + 60e3; f.n = 0; log(L("Too many wrong PINs from {1}: blocked for 1 minute.", ip)); } failures.set(ip, f);
    globalFailures = globalFailures.filter((t) => t > Date.now() - 600e3); globalFailures.push(Date.now());
    if (globalFailures.length >= 30) { closedUntil = Date.now() + 300e3; globalFailures = []; log(L("30 wrong PINs in 10 minutes: the API closes for 5 minutes.")); }
  }
  else failures.delete(ip);
  return ok;
}
function readBody(req, max = 26e6) {
  return new Promise((res, rej) => {
    const parts = []; let n = 0;
    req.on("data", (c) => { n += c.length; if (n > max) { rej(new Error(L("too big"))); req.destroy(); } else parts.push(c); });
    req.on("end", () => res(Buffer.concat(parts)));
    req.on("error", rej);
  });
}
const json = (res, code, data) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(data)); };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    const route = url.pathname;
    if (req.method === "GET" && FILES[route]) {
      const f = FILES[route];
      const body = await fs.readFile(path.join(HERE, f));
      res.writeHead(200, { "Content-Type": TYPES[path.extname(f)], "Cache-Control": f.startsWith("img/") ? "max-age=86400" : "no-cache" });
      return res.end(body);
    }
    if (route === "/api/hello") return json(res, 200, { ferHome: true, app: APP, version: VERSION, name: ed.e.name });
    // the app's window comes in with its PIN without you having to type it
    if (APP && route === "/app/signin" && req.method === "GET") {
      const t = String(url.searchParams.get("t") || "");
      const ok = t.length === String(conf.pin).length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(String(conf.pin)));
      if (!ok) { res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("No."); }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
      return res.end(`<!doctype html><meta charset="utf-8"><script>try{localStorage.setItem("ferAgent.pin",${JSON.stringify(String(conf.pin))})}catch(e){}location.replace("/")</script>`);
    }
    if (route.startsWith("/api/")) {
      if (!validPin(req)) { await new Promise((r) => setTimeout(r, 400)); return json(res, 401, { error: L("Wrong PIN") }); }
      if (route === "/api/state" && req.method === "GET") return json(res, 200, { state: ed.e, busyIds: [...ed.busyIds], skills: hands.catalog(),
        home: { app: APP, key: !!conf.key, data: APP ? DATA : "", telegram: !!tg, keys: Object.fromEntries([...new Set([...Object.keys(PROVIDERS), ...ed.connections().map((c) => c.id)])].filter((k) => k !== "openrouter").map((k) => [k, !!(conf.keys || {})[k]])),
          folder: { path: BRAIN_FOLDER, notes: brain.notes, library: brain.library, lastSync: brain.lastSync, error: brain.error }, agentsFolder: AGENTS_FOLDER,
          email: conf.email && conf.email.address ? { address: conf.email.address, imapHost: conf.email.imapHost, imapPort: conf.email.imapPort, smtpHost: conf.email.smtpHost, smtpPort: conf.email.smtpPort, name: conf.email.name || "" } : null } });
      // saved images and music
      if (route.startsWith("/api/media/") && req.method === "GET") {
        const id = decodeURIComponent(route.slice("/api/media/".length));
        if (!/^med_[a-z0-9]+$/i.test(id)) return json(res, 400, { error: L("Not valid.") });
        const f = (await fs.readdir(MEDIA)).find((x) => x.startsWith(id + "."));
        if (!f) return json(res, 404, { error: L("It isn't there.") });
        const type = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac" }[f.split(".").pop()] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": type, "Cache-Control": "private, max-age=86400" });
        return res.end(await fs.readFile(path.join(MEDIA, f)));
      }
      // In the app, keys are set from Settings (there's no Terminal). They are saved in data/config.json, only on this computer.
      if (APP && route === "/api/conf/key" && req.method === "POST") {
        let d; try { d = JSON.parse((await readBody(req, 4096)).toString("utf8")); } catch { return json(res, 400, { error: L("Unreadable request.") }); }
        const prov = String(d.prov || "openrouter"), key = String(d.key || "").trim();
        if (prov === "openrouter") {
          if (!/^sk-or-[A-Za-z0-9_-]{10,}$/.test(key)) return json(res, 400, { error: L("That doesn't look like an OpenRouter key (it starts with sk-or-).") });
          conf.key = key;
        } else {
          if (!ed.provider(prov)) return json(res, 400, { error: L("That API doesn't exist.") });
          if (key) conf.keys[prov] = key; else delete conf.keys[prov];
        }
        await saveConfig(conf);
        if (prov === "openrouter") loadModels().catch(() => {});
        return json(res, 200, { ok: true });
      }
      // In the app: where the brain lives (the window chooses the folder; it is used when the app opens again)
      if (APP && route === "/api/conf/folder" && req.method === "POST") {
        let d; try { d = JSON.parse((await readBody(req, 8192)).toString("utf8")); } catch { return json(res, 400, { error: L("Unreadable request.") }); }
        const r = path.resolve(String(d.path || ""));
        try { if (!(await fs.stat(r)).isDirectory()) throw 0; } catch { return json(res, 400, { error: L("That folder doesn't exist.") }); }
        conf.brainFolder = r; await saveConfig(conf);
        return json(res, 200, { ok: true, restart: true });
      }
      // In the app: open the agents' Chrome so you can sign in to your websites once (the session stays on this computer)
      if (APP && route === "/api/conf/login" && req.method === "POST") {
        let d; try { d = JSON.parse((await readBody(req, 4096)).toString("utf8")); } catch { return json(res, 400, { error: L("Unreadable request.") }); }
        let u; try { u = new URL(String(d.url || "").trim()); } catch { return json(res, 400, { error: L("Write the full address, for example https://mail.google.com") }); }
        if (!/^https?:$/.test(u.protocol)) return json(res, 400, { error: L("Write the full address, for example https://mail.google.com") });
        try { await hands.openVisible(u.href); } catch (e) { return json(res, 400, { error: e.message }); }
        return json(res, 200, { ok: true });
      }
      // In the app: the mailbox for the Email agent (the password is only saved on this computer). In Fer Home: node fer-home.mjs email
      if (APP && route === "/api/conf/email" && req.method === "POST") {
        let d; try { d = JSON.parse((await readBody(req, 8192)).toString("utf8")); } catch { return json(res, 400, { error: L("Unreadable request.") }); }
        if (d.remove) { conf.email = null; await saveConfig(conf); return json(res, 200, { ok: true }); }
        const address = String(d.address || "").trim(), now = conf.email || {};
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) return json(res, 400, { error: L("That doesn't look like an email address.") });
        const password = String(d.password || "") || (now.address === address ? now.password : "");
        if (!password) return json(res, 400, { error: L("The mailbox's password is missing.") });
        const g = emailServers(address), host = (x) => String(x || "").trim().replace(/^[a-z]+:\/\//i, "").replace(/[/:].*$/, "");
        conf.email = { address, password, name: String(d.name || "").trim().slice(0, 80), imapHost: host(d.imapHost) || g.imapHost, imapPort: Number(d.imapPort) || g.imapPort,
          smtpHost: host(d.smtpHost) || g.smtpHost, smtpPort: Number(d.smtpPort) || g.smtpPort };
        await saveConfig(conf);
        return json(res, 200, { ok: true });
      }
      // Settings → Email → «Check»: it signs in to read and to send, and changes nothing in the mailbox
      if (route === "/api/email/test" && req.method === "POST") {
        try { const r = await hands.testMailbox(); return json(res, 200, { ok: true, emails: r.emails }); }
        catch (e) { return json(res, 400, { error: e.message || String(e) }); }
      }
      // the list of Claude's, OpenAI's or Grok's models with your key (the key doesn't leave Fer Home)
      if (route.startsWith("/api/models/") && req.method === "GET") {
        const prov = route.slice("/api/models/".length), P = ed.provider(prov), key = (conf.keys || {})[prov];
        if (!P || prov === "openrouter") return json(res, 404, { error: L("It doesn't exist.") });
        if (!key && !P.noKey) return json(res, 400, { error: L("Fer Home has no {1} key. On this computer: node fer-home.mjs keys", P.short) });
        const base = (APIS[prov]) || P.api;
        const header = P.format === "anthropic" ? { "x-api-key": key, "anthropic-version": "2023-06-01" } : key ? { Authorization: "Bearer " + key } : {};
        let r; try { r = await fetch(base + "/models" + (P.format === "anthropic" ? "?limit=100" : ""), { headers: header }); }
        catch (e) { return json(res, 400, { error: L("Couldn't talk to {1} ({2}).", P.short, e.message) }); }
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return json(res, 400, { error: r.status === 401 || r.status === 403 ? L("The {1} key isn't valid.", P.short) : L("{1} answered {2}", P.short, r.status) });
        return json(res, 200, { models: filterApiModels(prov, d) });
      }
      if (route === "/api/action" && req.method === "POST") {
        let acc; try { acc = JSON.parse((await readBody(req, 12e6)).toString("utf8")); } catch { return json(res, 400, { error: L("Unreadable request.") }); }
        if (acc && acc.type === "speak" && req.headers["x-fer-chunks"] === "1") {
          // in parts: each chunk of the reply goes out as soon as the brain writes it (one JSON line per chunk), and at the end, the result
          res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
          acc.onChunk = (t) => { try { res.write(JSON.stringify({ chunk: t }) + "\n"); } catch {} };
          try { res.end(JSON.stringify({ end: await ed.run(acc) }) + "\n"); }
          catch (e) { res.end(JSON.stringify({ error: e.message }) + "\n"); }
          return;
        }
        try { return json(res, 200, await ed.run(acc)); }
        catch (e) { return json(res, 400, { error: e.message }); }
      }
      // Gateway to OpenRouter for voice and hearing: the key never leaves Fer Home.
      if (route.startsWith("/api/or/")) {
        const target = API + "/" + route.slice("/api/or/".length) + url.search;
        if (!/^\/api\/or\/(audio\/speech|audio\/transcriptions|generation)$/.test(route)) return json(res, 403, { error: L("Path not allowed.") });
        if (!route.endsWith("/generation") && ed.budgetUsage() >= 1) return json(res, 402, { error: { message: L("The building's spending cap has been reached.") } });
        const body = req.method === "GET" ? undefined : await readBody(req);
        const r = await fetch(target, { method: req.method, headers: { "Authorization": "Bearer " + conf.key, "Content-Type": req.headers["content-type"] || "application/json", "X-Title": "Fer Agent" }, body: body });
        const header = { "Content-Type": r.headers.get("content-type") || "application/octet-stream", "Cache-Control": "no-store" };
        if (r.headers.get("x-generation-id")) header["X-Generation-Id"] = r.headers.get("x-generation-id");
        res.writeHead(r.status, header);
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
server.listen(PORT, APP ? "127.0.0.1" : "0.0.0.0", () => {
  if (APP) { log(L("Fer Agent {1} (app) at {2}. Data: {3}", VERSION, `http://127.0.0.1:${PORT}`, DATA)); if (process.send) process.send({ ready: true }); return; }
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
  const n = brainFolders(ed.e);
  console.log("\n" + L("Fer Home {1} is on. The building beats every {2} seconds.", VERSION, HEARTBEAT_SEC));
  console.log("  " + L("Brain ({1}, {2}, backup): {3}", n.library, n.memory, BRAIN_FOLDER));
  console.log("  " + L("On this device:         {1}", `http://localhost:${PORT}`));
  for (const ip of ips) console.log("  " + L("From your home network: {1}", `http://${ip}:${PORT}`));
  console.log(L("To stop it: Ctrl+C. The data stays in {1}", DATA) + "\n");
});
const quit = async () => { log(L("Saving and quitting…")); try { await ed.save(); } catch {} try { await syncBrain(true); } catch {} try { await hands.close(); } catch {} process.exit(0); };
process.on("SIGINT", quit);
process.on("unhandledRejection", (e) => log(L("Notice: {1}", (e && e.message) || e)));   // a stray failure doesn't switch Fer Home off
process.on("SIGTERM", quit);
