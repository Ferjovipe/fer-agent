// =====================================================================
// Fer Agent · The Building — THE SCREEN
// Draws the home page, the building, the profiles, the chat with each agent, the spending, the agent of the month,
// the meeting rooms and the settings. Every text goes through tr() (textos.js) so it can be translated.
// The real work is done by engine.js (here in the browser, or in Fer Home).
// =====================================================================
import { LOCALE, setLanguage, Building, ROLES, CAPABILITIES, SEATS, PER_POOL, MAX_OFFICES, MAX_POOLS, MAX_MEETING_SEATS, VERSION, JEV_MODEL, MODEL_TYPES, LEVELS, LEVEL_NAME,
  seating, cleanLook, heartbeatText, levelKey, modelType, variablePrice, fmt, fmtCap, explainError, PROVIDERS, filterApiModels, MAX_PERSONALITY, MAX_OBJECTIVE_LINES,
  cleanObjectives, unitPrice, hearingPricePerSecond, noPublishedPrice, describedPrice, imageTokens, memoryNotesMd, cleanTopic, modelVersion, chooseModel, brainFolders, readBackupFile } from "./engine.js";
import { CHARACTERS } from "./personajes.js";
import { tr, trAlways, setNames, loadLanguage, translatePage, language, LANGUAGES, saveLanguage, savedLanguage } from "./textos.js";
import { renderLanding } from "./landing.js";

const OR = "https://openrouter.ai/api/v1";
const BROWSER = "browser";
// Open-source voice detector (Silero VAD, ISC licence). It's only downloaded when you touch the mic.
// The two files that run inside the page are «sealed»: if someone changes them, the browser doesn't use them.
const ORT_BASE = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";
const VAD_BASE = "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.31/dist/";
const SEALS = {
  "ort.wasm.min.js": "sha384-epp8GDQUoLKx5qHa6SoDHKv7fSHILsEYk4uEsHdPRBztXEIVWCe/lhhrQJUBMZcf",
  "bundle.min.js": "sha384-BLK6Iw3Zbz9hHmHYBgWHJ8GaGVHf3hfnz95vXOla64ZQHHL/T7r9PeIl6jUx8eer"
};

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d = "") { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  json(k, d) { try { const v = JSON.parse(this.get(k, "")); return v && typeof v === "object" ? v : d; } catch { return d; } }
};
const K = { state: "ferAgent.state", key: "ferAgent.key", look: "ferAgent.look", pin: "ferAgent.pin", speaker: "ferAgent.speaker", backup: "ferAgent.backup", v4: "ferAgent.stateV4", language: "ferAgent.language",
  anthropicKey: "ferAgent.keyAnthropic", openaiKey: "ferAgent.keyOpenAI", xaiKey: "ferAgent.keyXai",
  lastBackup: "ferAgent.lastBackup", device: "ferAgent.device", folder: "ferAgent.folder" };
// What this browser saved before version 9 under other names moves to these ones (once)
for (const [now, before] of [[K.state, "ferEdificio.estado"], [K.pin, "ferEdificio.pin"], [K.speaker, "ferEdificio.altavoz"], [K.backup, "ferEdificio.copia"], [K.v4, "ferEdificio.estadoV4"],
  [K.language, "ferAgent.idioma"], [K.lastBackup, "ferAgent.ultimaCopia"], [K.device, "ferAgent.aparato"], [K.folder, "ferAgent.carpeta"]]) {
  let v = null;
  try { v = localStorage.getItem(before); } catch {}
  if (v === null) continue;
  if (before === "ferAgent.carpeta") { try { const c = JSON.parse(v); if (c && c.tipo && !c.type) { c.type = c.tipo; delete c.tipo; v = JSON.stringify(c); } } catch {} }
  try { localStorage.removeItem(before); if (localStorage.getItem(now) === null) localStorage.setItem(now, v); }
  catch { try { localStorage.setItem(before, v); } catch {} }   // if it doesn't fit, it stays where it was
}
try { localStorage.removeItem("ferEdificio.vista"); } catch {}   // no longer used
const KEY_OF = { anthropic: K.anthropicKey, openai: K.openaiKey, xai: K.xaiKey };
// where this browser keeps each API's key (the three earlier ones keep their place)
const apiKey = (id) => KEY_OF[id] || ("ferAgent.keyApi." + id);
const hasApiKey = (id) => { const P = ed && ed.provider(id); if (P && P.noKey) return true; return mode === "home" ? !!(homeInfo.keys || {})[id] : !!store.get(apiKey(id)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Each device (this browser) has its number, to know where the building's backup in the brain folder comes from
const device = (() => { let x = store.get(K.device); if (!x) { x = "ap_" + Math.random().toString(36).slice(2, 10); store.set(K.device, x); } return x; })();

// =====================================================================
// IndexedDB: images, music and whatever doesn't fit in normal storage (not lost on reload)
// =====================================================================
const idb = {
  _db: null,
  open() {
    if (this._db) return this._db;
    this._db = new Promise((res, rej) => {
      try {
        const r = indexedDB.open("fer-agent", 2);
        r.onupgradeneeded = () => {
          const db = r.result, tx = r.transaction;
          for (const n of ["media", "kv", "library"]) if (!db.objectStoreNames.contains(n)) db.createObjectStore(n);
          // before version 9 the stores were «medios» and «biblio», with Spanish field names: what they hold moves here
          const move = (from, to, key, val) => {
            if (!db.objectStoreNames.contains(from)) return;
            const dest = tx.objectStore(to);
            tx.objectStore(from).openCursor().onsuccess = (ev) => { const c = ev.target.result; if (c) { dest.put(val(c.value), key(c.key)); c.continue(); } else db.deleteObjectStore(from); };
          };
          move("medios", "media", (k) => k, (v) => (v && typeof v === "object" ? { id: v.id, url: v.url, type: v.type ?? ({ imagen: "image" }[v.tipo] || v.tipo), text: v.text ?? v.texto, ts: v.ts } : v));
          move("biblio", "library", (k) => String(k).replace(/^navegador:/, "browser:"), (v) => (v && typeof v === "object" ? { modified: v.modified ?? v.modificado, text: v.text ?? v.texto } : v));
          const kv = tx.objectStore("kv");
          kv.get("carpetaLocal").onsuccess = (ev) => { const v = ev.target.result; if (v !== undefined) { kv.put(v, "localFolder"); kv.delete("carpetaLocal"); } };
          kv.get("cerebroSync").onsuccess = (ev) => { const v = ev.target.result; if (v && typeof v === "object") { kv.put({ type: v.type ?? v.tipo, lastSync: v.lastSync ?? v.ultimaSync, myBuilding: v.myBuilding ?? v.miEdificio, seenBuilding: v.seenBuilding ?? v.vistoEdificio }, "brainSync"); kv.delete("cerebroSync"); } };
        };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      } catch (err) { rej(err); }
    });
    return this._db;
  },
  async op(storeName, mode, f) {
    const db = await this.open();
    return new Promise((res, rej) => { const tx = db.transaction(storeName, mode), st = tx.objectStore(storeName); const q = f(st); tx.oncomplete = () => res(q && "result" in q ? q.result : undefined); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
  },
  get(t, k) { return this.op(t, "readonly", (st) => st.get(k)).catch(() => undefined); },
  put(t, k, v) { return this.op(t, "readwrite", (st) => st.put(v, k)).catch(() => undefined); },
  remove(t, k) { return this.op(t, "readwrite", (st) => st.delete(k)).catch(() => undefined); },
  getAll(t) { return this.op(t, "readonly", (st) => st.getAll()).catch(() => []); },
  keys(t) { return this.op(t, "readonly", (st) => st.getAllKeys()).catch(() => []); }
};

// A safe element builder: text always goes as text.
// What people or an agent write (messages, tasks, notes, reasons, titles) goes as it is: it doesn't go through the dictionary
const raw = (t) => document.createTextNode(String(t ?? ""));
// For whoever has never used OpenRouter: how to get the key
const howToGetKey = () => h("div", { class: "como-clave" }, h("b", {}, "No key yet? You can get one in a few minutes:"),
  h("ol", {},
    h("li", {}, "Create an OpenRouter account: with your email, Google or GitHub. ", h("a", { href: "https://openrouter.ai", target: "_blank", rel: "noopener" }, "openrouter.ai")),
    h("li", {}, "In “Credits”, add some balance. You pay in advance and only what your agents use is spent. ", h("a", { href: "https://openrouter.ai/credits", target: "_blank", rel: "noopener" }, "openrouter.ai/credits")),
    h("li", {}, "In “Keys”, press “Create Key”, give it a spending limit and copy the key: it's only shown once. Paste it above and press “Save”. ", h("a", { href: "https://openrouter.ai/keys", target: "_blank", rel: "noopener" }, "openrouter.ai/keys"))));
const inQuotes = (t) => { const [a, b] = tr("“{1}”").split("{1}"); return [a, raw(t), b]; };   // «…» in Spanish, “…” in English
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") { for (const [p, x] of Object.entries(v)) { if (x === null || x === undefined) continue; if (p.startsWith("--")) el.style.setProperty(p, String(x)); else el.style[p] = x; } }
    else if (k === "html") el.innerHTML = v;      // only for drawings generated here, never anyone's text
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, (k === "title" || k === "placeholder" || k === "aria-label" || k === "alt") ? tr(String(v)) : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(tr(String(c))));
  return el;
}

// =====================================================================
// Engine: right here (browser) or in Fer Home (computer, phone or server)
// =====================================================================
let mode = "local", pin = store.get(K.pin);
let ed = null;
let models = [], voices = [], hearings = [], imageModels = [];
let byType = { text: [], image: [], music: [], voice: [], hearing: [], decisions: [], others: [] };
const Motor = {
  async run(acc) {
    if (mode === "local") return ed.run(acc);
    if (!pin || pinRejected) { askPin(); throw Object.assign(new Error("The Fer Home PIN is missing or wrong (Settings)."), { shown: true }); }
    const inParts = acc.type === "speak" && typeof acc.onChunk === "function";
    const r = await fetch("./api/action", { method: "POST", headers: Object.assign({ "Content-Type": "application/json", "X-Fer-Pin": pin }, inParts ? { "X-Fer-Chunks": "1" } : {}), body: JSON.stringify(acc) });
    if (inParts && r.ok && r.body && /ndjson/.test(r.headers.get("content-type") || "")) {
      // the reply arrives in parts from Fer Home: the voice starts while the agent writes
      const rd = r.body.getReader(), dec = new TextDecoder();
      let buf = "", all = "", end = null, error = "";
      const line = (l) => { if (!l.trim()) return; let j; try { j = JSON.parse(l); } catch { return; } if (typeof j.chunk === "string") { all += j.chunk; try { acc.onChunk(j.chunk, all); } catch {} } if (j.end) end = j.end; if (j.error) error = j.error; };
      for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i; while ((i = buf.indexOf("\n")) >= 0) { line(buf.slice(0, i)); buf = buf.slice(i + 1); } }
      line(buf);
      await refreshHome();
      if (error || !end) throw Object.assign(new Error(error || "Fer Home cut the reply short."), { shown: true });
      return end;
    }
    let d = {}; try { d = await r.json(); } catch {}
    if (r.status === 401) { pinRejected = true; askPin(); throw Object.assign(new Error("The Fer Home PIN is missing or wrong (Settings)."), { shown: true }); }
    if (!r.ok) throw Object.assign(new Error(d.error || ("Error " + r.status)), { shown: true });
    await refreshHome();
    return d;
  }
};
let homeApp = false;   // Fer Home inside the desktop app (version 9): the key is pasted here and there's no PIN to type
async function detectHome() {
  try { const r = await fetch("./api/hello", { cache: "no-store" }); if (r.ok) { const d = await r.json(); homeApp = !!(d && d.app); return !!(d && d.ferHome); } } catch {}
  return false;
}
const isApp = () => mode === "home" && (homeApp || !!homeInfo.app);
// In the app: save a key or open the agents' Chrome (the app does it, on this computer)
async function callApp(route, data) {
  const r = await fetch("." + route, { method: "POST", headers: { "Content-Type": "application/json", "X-Fer-Pin": pin }, body: JSON.stringify(data) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || "It couldn't be done."), { shown: true });
  return d;
}
let pinRejected = false;
let homeSkills = [], homeInfo = {};   // in Fer Home: the skills (hands) it has and how it is (Telegram, brain folder)
async function refreshHome() {
  if (!pin || pinRejected) return;          // without a PIN it doesn't ask (so you don't lock yourself out)
  try {
    const r = await fetch("./api/state", { headers: { "X-Fer-Pin": pin }, cache: "no-store" });
    if (r.status === 401) { pinRejected = true; askPin(); return; }
    if (!r.ok) return;
    const d = await r.json();
    ed.e = d.state; ed.busyIds = new Set(d.busyIds || []);
    homeSkills = Array.isArray(d.skills) ? d.skills : []; homeInfo = d.home || {};
    if (Array.isArray(d.library)) ed.library = d.library;
    render();
    if (!refreshHome.language) { refreshHome.language = true; syncLanguage(); }   // the first time: this person's language or the building's
  } catch {}
}
function askPin() { if ($("cajon").hidden) openDrawer("settings"); }
const apiBase = () => (mode === "local" ? OR : "./api/or");
const apiCab = (json) => { const c = mode === "local" ? { Authorization: "Bearer " + store.get(K.key) } : { "X-Fer-Pin": pin }; if (json) c["Content-Type"] = "application/json"; return c; };
const hasAccess = () => (mode === "home" ? !!pin && !(isApp() && homeInfo.key === false) : !!store.get(K.key));

// =====================================================================
// OpenRouter model lists (public, no key)
// =====================================================================
async function loadLists() {
  const get = async (q) => { const r = await fetch(OR + "/models" + q); if (!r.ok) throw new Error("HTTP " + r.status); return (await r.json()).data || []; };
  // All the models at once; each one is classified by what it does (its data says so, not a hand-made list)
  let allModels = null;
  try { allModels = await get("?output_modalities=all"); } catch {}
  if (!allModels || !allModels.length) {   // if that query fails, as before: one per type
    const r = await Promise.allSettled(["", "?output_modalities=speech", "?output_modalities=transcription", "?output_modalities=image", "?output_modalities=audio"].map(get));
    const seen = new Set(); allModels = [];
    for (const x of r) if (x.status === "fulfilled") for (const m of x.value) if (!seen.has(m.id)) { seen.add(m.id); allModels.push(m); }
    if (!allModels.length) return false;
  }
  models = allModels;
  byType = { text: [], image: [], music: [], voice: [], hearing: [], decisions: [], others: [] };
  for (const m of allModels) byType[modelType(m)].push(m);
  voices = byType.voice.map((m) => ({ id: m.id, name: m.name || m.id, pricing: m.pricing || {}, voices: (m.supported_voices || []).map((v) => (typeof v === "string" ? { id: v, name: v } : { id: v.id || v.voice_id || v.name, name: v.name || v.id })).filter((v) => v.id) }));
  hearings = byType.hearing.map((m) => ({ id: m.id, name: m.name || m.id, pricing: m.pricing || {} }));
  imageModels = byType.image.map((m) => ({ id: m.id, name: m.name || m.id, pricing: m.pricing || {} }));
  return true;
}
const n0 = (v) => { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : 0; };
const perMillion = (p) => (p * 1e6).toLocaleString(LOCALE, { maximumFractionDigits: 3 });
const modelData = (m) => ({ id: m.id, name: m.name || m.id, inPrice: n0((m.pricing || {}).prompt), outPrice: n0((m.pricing || {}).completion), sees: ((m.architecture && m.architecture.input_modalities) || []).includes("image"), out: (m.architecture && m.architecture.output_modalities) || ["text"] });
const money = (n, dec = 3) => n.toLocaleString(LOCALE, { maximumFractionDigits: dec });
// The price, said the way each type of model is charged
const PER_TXT = { song: "song", clip: "clip", track: "track", image: "image", minute: "minute", hour: "hour", request: "request", generation: "generation", second: "second" };
function priceTxt(m) {
  const p = m.pricing || {}, a = n0(p.prompt), b = n0(p.completion), t = modelType(m);
  if (variablePrice(m)) return tr("variable price");
  // images: OpenRouter gives the price per image token («image_output»); here, per 1024×1024 image (≈)
  if (t === "image" && unitPrice(m)) return tr(`≈$${money(unitPrice(m))} per image`);
  if (t === "music" && n0(p.request)) return tr(`$${money(n0(p.request))} per song`);
  if (t !== "text" && noPublishedPrice(m)) { const d = describedPrice(m); return tr(d ? `price not published (its description says $${money(d.usd)} per ${PER_TXT[d.per] || d.per})` : "price not published"); }
  if (t === "voice" && (a || b)) return tr(a && !b ? `$${perMillion(a)} per million characters` : !a && b ? `$${money(b * 3600, 2)} per hour of audio` : `≈$${money(b * 32 * 3600, 2)} per hour of audio`);
  if (t === "hearing" && a && !b) return tr(`$${money(hearingPricePerSecond(m) * 3600)} per hour of speech`);
  const others = n0(p.image) + n0(p.request) + n0(p.audio) + n0(p.image_output) + n0(p.audio_output);
  if (!a && !b && !others) return tr("free");
  return tr(`$${perMillion(a)} / $${perMillion(b)}`);
}
function modelLabel(m) {
  const d = modelData(m);
  if (variablePrice(m)) return `${d.name} · ${tr("variable price (depends on the model it chooses)")}`;
  const level = levelKey(Object.assign({}, m, d));
  if (level === "sinprecio") return `${d.name} · ${priceTxt(m)}`;
  return `${d.name} · ${tr(LEVEL_NAME[level])} · ${priceTxt(m)}${d.sees && modelType(m) === "text" ? " · " + tr("sees") : ""}`;
}
// Model picker: the recommended ones per level on top; below, all of that type (and in «Brain», also «Others»).
// v8: in the drop-down, only the recommended ones (15 at most) and the current one; the rest, with the search box next to it
const MAX_RECOMMENDED = 15;
function modelPicker(type, current, { empty, extra, onChange, filter } = {}) {
  const sel = h("select", {});
  const list = (byType[type] || []).filter(filter || (() => true)).sort((a, b) => (n0(a.pricing && a.pricing.prompt) + n0(a.pricing && a.pricing.completion)) - (n0(b.pricing && b.pricing.prompt) + n0(b.pricing && b.pricing.completion)) || a.id.localeCompare(b.id));
  const allModels = type === "text" && !filter ? [...list, ...byType.others] : list;
  const byId = new Map(allModels.map((m) => [m.id, m]));
  const rec = ((ed && ed.e && ed.e.settings.recommended) || {})[type] || {};
  const fillIn = (value) => {
    sel.replaceChildren();
    if (empty) sel.append(h("option", { value: "" }, empty));
    for (const x of extra || []) sel.append(h("option", { value: x[0] }, x[1]));
    const seats = new Set();   // on top, at most 15 recommended per price level
    for (const level of LEVELS) {
      if (seats.size >= MAX_RECOMMENDED) break;
      const ids = (rec[level] || []).filter((id) => byId.has(id) && !seats.has(id)).slice(0, MAX_RECOMMENDED - seats.size);
      if (!ids.length) continue;
      ids.forEach((id) => seats.add(id));
      sel.append(h("optgroup", { label: tr("Recommended") + " · " + tr(LEVEL_NAME[level]) }, ids.map((id) => h("option", { value: id }, modelLabel(byId.get(id))))));
    }
    // below, ALL OpenRouter's of this type (hundreds), as in version 7; and the «Others», just in case
    sel.append(h("optgroup", { label: tr("All") + " · " + tr(MODEL_TYPES[type]) + ` (${list.length})` }, list.map((m) => h("option", { value: m.id }, modelLabel(m)))));
    if (type === "text" && !filter && byType.others.length) sel.append(h("optgroup", { label: tr("Others (may not work here)") }, byType.others.map((m) => h("option", { value: m.id }, modelLabel(m) + " · " + ((m.architecture && m.architecture.output_modalities) || []).join("+")))));
    if (value && ![...sel.options].some((o) => o.value === value)) sel.prepend(h("option", { value: value }, byId.has(value) ? modelLabel(byId.get(value)) : value + (value === JEV_MODEL ? "" : " " + tr("(not in the list)"))));
    sel.value = value || "";
  };
  fillIn(current || "");
  if (onChange) sel.addEventListener("change", () => onChange(sel.value));
  if (allModels.length > MAX_RECOMMENDED) {
    // also, «Search all»: you type part of the name and choose (the same as finding it in the drop-down, but faster)
    const button = h("button", { type: "button", class: "btn mini buscar-modelo" }, tr(`Search all (${allModels.length})`));
    let box = null;
    button.onclick = (ev) => {
      ev.preventDefault();
      if (box && box.isConnected) { box.remove(); box = null; return; }
      const q = h("input", { type: "search", placeholder: tr("Type part of the name: claude, gpt, gemini, flux…"), "aria-label": "Search model" });
      const res = h("div", { class: "busca-modelos" });
      const renderResults = () => {
        const t = withoutAccents(q.value.trim()), hall = allModels.filter((m) => !t || withoutAccents(m.id + " " + (m.name || "")).includes(t)).slice(0, 40);
        res.replaceChildren(...hall.map((m) => h("button", { type: "button", class: "modelo-res", onclick: (e2) => { e2.preventDefault(); fillIn(m.id); box.remove(); box = null; sel.dispatchEvent(new Event("change")); } }, modelLabel(m))),
          hall.length ? h("small", { class: "nota" }, tr(hall.length === 40 ? "There are more: type a bit more of the name." : `${hall.length} found`)) : h("small", { class: "nota" }, tr("None with that name.")));
      };
      q.oninput = renderResults;
      box = h("div", { class: "buscador-modelos" }, q, res);
      button.after(box); renderResults(); q.focus();
    };
    requestAnimationFrame(() => { if (sel.isConnected && sel.nextElementSibling !== button) sel.after(button); });
  }
  return sel;
}
// What Artie proposes for this type of model (you decide)
function proposalsFor(type) {
  return (ed.e.modelProposals || []).filter((x) => x.type === type && x.state === "pending").map((pm) => h("div", { class: "propuesta-modelo" },
    h("span", {}, `${tr("Artie proposes")} ${pm.model} ${tr("for the level")} ${tr(LEVEL_NAME[pm.level] || pm.level)}: ${pm.reason}`),
    h("button", { class: "btn mini primario", onclick: () => Motor.run({ type: "model.accept", proposal: pm.id }).then(() => render(true)).catch(warn) }, "Accept"),
    h("button", { class: "btn mini", onclick: () => Motor.run({ type: "model.discard", proposal: pm.id }).then(() => render(true)).catch(warn) }, "Dismiss")));
}

// =====================================================================
// Safely formatted text and text to read aloud
// =====================================================================
const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inLine = (s) => s.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
  .replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
function markdown(text) {
  const lines = escape(String(text)).split("\n");
  let html = "", list = null, paragraph = [];
  const fp = () => { if (paragraph.length) { html += "<p>" + inLine(paragraph.join("<br>")) + "</p>"; paragraph = []; } };
  const cl = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd(); let m;
    if (!line.trim()) { fp(); cl(); continue; }
    if ((m = line.match(/^\s*#{1,6}\s+(.*)$/))) { fp(); cl(); html += "<h3>" + inLine(m[1]) + "</h3>"; continue; }
    if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) { fp(); if (list !== "ul") { cl(); html += "<ul>"; list = "ul"; } html += "<li>" + inLine(m[1]) + "</li>"; continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { fp(); if (list !== "ol") { cl(); html += "<ol>"; list = "ol"; } html += "<li>" + inLine(m[1]) + "</li>"; continue; }
    cl(); paragraph.push(line);
  }
  fp(); cl(); return html;
}
const forVoice = (t) => String(t).replace(/```[\s\S]*?```/g, " ").replace(/<[^>]*>/g, " ").replace(/`([^`]+)`/g, "$1").replace(/\*\*|__|[*_#>]/g, "")
  .replace(/^\s*[-•]\s+/gm, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/https?:\/\/\S+/g, "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
  .replace(/\n{2,}/g, ". ").replace(/\s+/g, " ").trim();

// =====================================================================
// Characters: boy, girl, grandpa and grandma, with colours to choose
// =====================================================================
const ZONES = { skin: 1, hair: 2, eyes: 3, clothes: 4 };
const CHARACTER_NAME = { boy: "Boy", girl: "Girl", grandpa: "Grandpa", grandma: "Grandma", purple: "Purple suit", green: "Green suit", coral: "Coral", blue: "Blue suit", teal: "Teal suit", shirt: "Blue shirt" };
const ZONE_NAME = { clothes: "Clothes", eyes: "Eyes", hair: "Hair", skin: "Skin" };
const PALETTES = {
  clothes: [["#1F3A93", "navy blue"], ["#3A9FE3", "sky blue"], ["#2E9E5B", "green"], ["#7B3FB5", "purple"], ["#E8C22C", "yellow"], ["#EF6AA6", "pink"], ["#8E1B2C", "maroon"], ["#2A2C36", "black"], ["#E9EDF2", "white"]],
  eyes: [["#6B3E1E", "brown"], ["#9A7434", "hazel"], ["#3F8F4E", "green"], ["#8C99A6", "grey"], ["#2B1D14", "black"], ["#7A4FB8", "violet"]],
  hair: [["#1E1A18", "black"], ["#5A3820", "chestnut"], ["#8B5A2B", "light brown"], ["#E0B85A", "blond"], ["#B8B8B8", "silver"], ["#3D6BE0", "blue"], ["#E85C9A", "pink"]],
  skin: [["#F6D9C6", "very light"], ["#E8B896", "light"], ["#D9A27E", "medium"], ["#B67A52", "tan"], ["#8A5636", "dark"], ["#5C3A24", "very dark"]]
};
const cachePj = {};
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
async function prepare(name) {
  if (cachePj[name]) return cachePj[name];
  const P = CHARACTERS[name];
  const [img, zonesImg] = await Promise.all([loadImg(P.img), loadImg(P.zones)]);
  const c = document.createElement("canvas"); c.width = P.w; c.height = P.h;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(img, 0, 0, P.w, P.h); const base = x.getImageData(0, 0, P.w, P.h);
  x.clearRect(0, 0, P.w, P.h); x.drawImage(zonesImg, 0, 0, P.w, P.h); const z = x.getImageData(0, 0, P.w, P.h).data;
  const n = P.w * P.h, L = new Float32Array(n), lists = { 1: [], 2: [], 3: [], 4: [] }, d = base.data;
  for (let i = 0; i < n; i++) {
    const r = d[i * 4] / 255, g = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255;
    L[i] = (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
    const k = Math.round(z[i * 4] / 50);
    if (k >= 1 && k <= 4 && d[i * 4 + 3] > 0) lists[k].push(i);
  }
  const idx = {}; for (const k of [1, 2, 3, 4]) idx[k] = Int32Array.from(lists[k]);
  return (cachePj[name] = { P, base, L, idx });
}
function hexAHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let hh = 0, s = 0;
  if (mx !== mn) { const dd = mx - mn; s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn); hh = mx === r ? (g - b) / dd + (g < b ? 6 : 0) : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; hh /= 6; }
  return [hh, s, l];
}
function channel(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
function paintZone(data, C, zone, hex) {   // changes the colour keeping lights and shadows
  const [th, ts, tl] = hexAHsl(hex), refL = C.P.regions[zone].refL, list = C.idx[ZONES[zone]], L = C.L;
  for (let j = 0; j < list.length; j++) {
    const i = list[j], Lp = L[i];
    let l = (tl * Lp / refL) * (1 - tl) + (1 - (1 - tl) * (1 - Lp) / (1 - refL)) * tl; l = l < 0 ? 0 : l > 1 ? 1 : l;
    const q = l < 0.5 ? l * (1 + ts) : l + ts - l * ts, p = 2 * l - q, o = i * 4;
    data[o] = channel(p, q, th + 1 / 3) * 255; data[o + 1] = channel(p, q, th) * 255; data[o + 2] = channel(p, q, th - 1 / 3) * 255;
  }
}
const normLook = (x) => cleanLook(x);
const noColours = (a) => !a.clothes && !a.eyes && !a.hair && !a.skin;
async function drawCharacter(look, cv) {
  const A = normLook(look), C = await prepare(A.p);
  cv.width = C.P.w; cv.height = C.P.h;
  const out = new ImageData(new Uint8ClampedArray(C.base.data), C.P.w, C.P.h);
  for (const z of Object.keys(ZONES)) if (A[z]) paintZone(out.data, C, z, A[z]);
  cv.getContext("2d").putImageData(out, 0, 0);
  return cv;
}
// An already painted figure (cached): while it's prepared, the character shows in its original colours.
const cacheFig = new Map(), pendFig = new Map();
const figureKey = (A) => [A.p, A.clothes, A.eyes, A.hair, A.skin].join("|");
function ensureFigure(look) {
  const A = normLook(look), k = figureKey(A);
  if (noColours(A)) return Promise.resolve(CHARACTERS[A.p].img);
  if (cacheFig.has(k)) return Promise.resolve(cacheFig.get(k));
  if (!pendFig.has(k)) pendFig.set(k, drawCharacter(A, document.createElement("canvas")).then(shrink).then((u) => { cacheFig.set(k, u); pendFig.delete(k); return u; }).catch(() => { cacheFig.set(k, CHARACTERS[A.p].img); pendFig.delete(k); return CHARACTERS[A.p].img; }));
  return pendFig.get(k);
}
// The painted figure is saved at half size (plenty for the screen) and as a file in memory, not as text.
function shrink(cv) {
  const t = document.createElement("canvas"); t.height = Math.round(cv.height / 2); t.width = Math.round(cv.width / 2);
  const x = t.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(cv, 0, 0, t.width, t.height);
  return new Promise((res) => t.toBlob((b) => res(b ? URL.createObjectURL(b) : t.toDataURL("image/png")), "image/png"));
}
function figure(look) {
  const A = normLook(look), k = figureKey(A);
  if (noColours(A)) return CHARACTERS[A.p].img;
  if (cacheFig.has(k)) return cacheFig.get(k);
  ensureFigure(A).then(() => render());
  return CHARACTERS[A.p].img;
}
function accentOf(a) { const A = normLook(a && a.look), P = CHARACTERS[A.p]; return A.clothes || (P.regions ? P.regions.clothes.original : P.accent) || "#4A6CF7"; }
function setAccent(hex) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  document.documentElement.style.setProperty("--acento", hex);
  document.documentElement.style.setProperty("--sobre-acento", 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.0637 ? "#FFFFFF" : "#1D2140");
}
let accentSet = "";
function renderAccent() {
  const a = chatId ? chatAgent() : ed.boss(); if (!a) return;
  const ac = accentOf(a); if (ac !== accentSet) { accentSet = ac; setAccent(ac); }
}
// To see it big (chat, podium): the full-size drawing
const bigCache = new Map();
function ensureBigFigure(look) {
  const A = normLook(look), k = figureKey(A);
  if (noColours(A)) return Promise.resolve(CHARACTERS[A.p].img);
  if (!bigCache.has(k)) bigCache.set(k, drawCharacter(A, document.createElement("canvas")).then((cv) => new Promise((res) => cv.toBlob((b) => res(b ? URL.createObjectURL(b) : cv.toDataURL("image/png")), "image/png"))).catch(() => CHARACTERS[A.p].img));
  return bigCache.get(k);
}

// Look picker: character and colours (used by «Create agent» and «Look»)
function lookPicker(current, onChange) {
  let A = normLook(current);
  const box = h("div", { class: "aspecto" });
  const view = h("img", { class: "vista-pj", alt: "Preview" });
  const refreshView = () => { ensureFigure(A).then((u) => { view.src = u; }); };
  const renderSelection = () => {
    box.innerHTML = "";
    const pick = h("div", { class: "pick4", role: "radiogroup", "aria-label": "Character" });
    for (const name of Object.keys(CHARACTERS)) {
      pick.append(h("button", { type: "button", role: "radio", "aria-checked": String(A.p === name), onclick: () => { A = normLook({ p: name }); onChange(A); renderSelection(); } },
        h("img", { src: CHARACTERS[name].img, alt: "" }), h("span", {}, CHARACTER_NAME[name])));
    }
    const colours = h("div", { class: "colores" });
    if (!CHARACTERS[A.p].regions) colours.append(h("small", { class: "nota" }, tr("This character keeps its own colours.")));
    else for (const zone of ["clothes", "eyes", "hair", "skin"]) {
      const original = CHARACTERS[A.p].regions[zone].original;
      const row = h("div", { class: "muestras", role: "radiogroup", "aria-label": ZONE_NAME[zone] });
      for (const [hex, name] of [[null, "original"], ...PALETTES[zone]]) {
        row.append(h("button", { type: "button", class: "sw" + (hex ? "" : " orig"), style: { "--c": hex || original }, title: `${ZONE_NAME[zone]}: ${name}`, role: "radio", "aria-label": `${ZONE_NAME[zone]}: ${name}`, "aria-checked": String((A[zone] || null) === hex),
          onclick: () => { A = normLook(Object.assign({}, A, { [zone]: hex })); onChange(A); renderSelection(); } }));
      }
      const customColour = !!A[zone] && !PALETTES[zone].some(([x]) => x === A[zone]);
      const inp = h("input", { type: "color", value: A[zone] || original, "aria-label": `${ZONE_NAME[zone]}: another colour` });
      inp.oninput = () => { A = normLook(Object.assign({}, A, { [zone]: inp.value.toUpperCase() })); refreshView(); };
      inp.onchange = () => { onChange(A); renderSelection(); };
      row.append(h("label", { class: "libre", title: "Another colour", style: customColour ? { background: A[zone], borderStyle: "solid" } : {} }, inp, h("span", {}, customColour ? "" : "+")));
      colours.append(h("div", { class: "campo" }, h("span", {}, ZONE_NAME[zone]), row));
    }
    box.append(h("div", { class: "aspecto-cab" }, h("div", { class: "marco-vista" }, view), h("div", { class: "campo", style: { flex: 1 } }, h("span", {}, "Character"), pick)), colours);
    refreshView();
  };
  renderSelection();
  return box;
}

// =====================================================================
// The building: pieces of the drawing stacked (dome, floors and lobby)
// =====================================================================
// Measurements in pixels of the original drawing (1438 wide). «suelo» is where they stand; «fig», how tall they are.
const WIDTH = 1438;
const SECTION = {
  // «placa»: where the sign goes, top left of its floor (v8: before, it sat at the bottom edge and looked like it belonged to the floor below)
  dome: { img: "img/cupula.webp", img2: "img/cupula2x.webp", high: 187, ground: 152, fig: 66, sign: 100, mobileSign: 128 },
  storey: { img: "img/piso.webp", img2: "img/piso2x.webp", high: 130, ground: 93, fig: 58, sign: 1, mobileSign: 96 },   // on a phone a floor is 3 fingers high: the signs go on each floor's slab (they don't cover anyone)
  lobby: { img: "img/vestibulo.webp", img2: "img/vestibulo2x.webp", high: 219, ground: 141, fig: 84, sign: 10, mobileSign: 146 }
};
const PLACES = {
  dome: { left: [585], center: [717], right: [850] },
  lobby: { left: [268], reception: [717], right: [1172] },
  storey: { head_office: [176], pool: [425, 487, 548, 662, 726, 790], office: [884, 997, 1109, 1220, 1329] }
};
// In a floor's view, modules taken from the same drawing are put together: head office, pools, offices and the closing piece.
const MODULE = { head_office: [0, 348], pool: [348, 828], office: [828, 941], end: [1382, 1438] };
// Crop shown when going into the dome and the lobby: [x0, x1, y0, y1]
const CUT = { dome: [400, 1040, 22, 187], lobby: [0, 1438, 0, 219] };
const SEAT_NAME = { center: "centre", left: "left", right: "right", head_office: "head office", office: "office", pool: "pool", reception: "reception" };
const SEATS_TXT = { dome: [["left", "To the boss's left"], ["right", "To the boss's right"]], storey: [["head_office", "Head office (section head)"], ["office", "Office"], ["pool", "Pool (several simple agents)"]], lobby: [["reception", "Reception"], ["left", "Left office"], ["right", "Right office"]] };

let selection = "boss", tab = "profile", renderPending = false, openFloorId = "";
let profileTab = "identity", activityView = "all", screen = "", chatId = "";
let searchQuery = "", dirFilter = "";
function render() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => {
    renderPending = false; if (!ed || !ed.e) return;
    namesUpToDate();
    renderTop(); renderCity(); renderAccent();
    if (chatId) { renderChatHeader(); renderChat(); }
    if (tab === "profile") renderProfile(); if (tab === "actividad") renderLog();
    if (screen === "month") renderMonth(); if (screen === "rooms") renderMeetingRooms(); if (screen === "inbox") renderInbox(); if (screen === "builtIn") renderBuiltIn();
    if (!$("cajon").hidden && drawerType === "spending") renderSpendingDrawer(true);
  });
}
function phaseClass() { return { normal: "", freeze1: "c1", freeze2: "c2", cap: "tope" }[ed.e.phase || "normal"] || ""; }
function renderTop() {
  const aj = ed.e.settings, today = ed.buildingSpending("today"), usage = ed.budgetUsage(), j = ed.boss();
  $("nombreEdificio").textContent = ed.e.name || tr("My building");
  // the counter always in view; at zero, «Today, no spending» instead of «$0.0000»
  $("medHoy").textContent = today > 0 ? tr(`Today ${fmt(today)}`) : tr("Today, no spending");
  $("medTope").textContent = n0(aj.dailyCap) ? tr(`cap ${fmtCap(n0(aj.dailyCap))}`) : tr("no cap");
  const b = $("medBarra"); b.style.width = Math.min(100, usage * 100) + "%"; b.className = phaseClass();
  $("modo").textContent = tr(isApp() ? "In this app · works while it's open" : mode === "home" ? "Connected to Fer Home · works 24 h" : "In this browser · works while it's open");
  $("modo").classList.toggle("casa", mode === "home");
  $("hablarJefe").textContent = tr(`Talk to ${j ? j.name : "the boss"}`);
  const pend = (ed.e.coins || []).filter((m) => m.state === "proposed").length;
  $("globoMes").hidden = !pend; $("globoMes").textContent = pend;
  $("globoMes").title = tr(pend === 1 ? "1 proposed coin is waiting for your decision" : `${pend} proposed coins are waiting for your decision`);
  // the inbox: everything waiting for your yes
  const nb = ed.inbox().length;
  $("globoBandeja").hidden = !nb; $("globoBandeja").textContent = nb;
  $("abrirBandeja").title = tr(nb ? (nb === 1 ? "1 thing is waiting for your yes" : `${nb} things are waiting for your yes`) : "Nothing is waiting for your yes");
  // the master switch
  const pause = aj.pause !== false, spenders = ed.whoSpends().filter((x) => x.auto && x.est.spends && !x.a.off);
  $("pausa").setAttribute("aria-pressed", String(pause));
  $("pausaTxt").textContent = tr(pause ? "Paused" : "Automatic");
  $("pausaSub").textContent = tr(pause ? "nothing spends on its own" : (spenders.length === 1 ? "1 agent can spend on its own" : `${spenders.length} agents can spend on their own`));
  $("pausa").title = tr(pause ? "General pause: no agent that spends wakes up on its own. Press to start." : "Running: heartbeats are on. Press to stop everything automatic.");
  renderBackupTop();
}
// «Save backup»: when the last one was made (downloaded or in the brain folder)
function lastBackup() { return Math.max(Number(store.get(K.lastBackup, "0")) || 0, (brain.state && brain.state.lastBackup) || 0); }
function howLongAgo(ts) {
  if (!ts) return tr("never");
  const m = Math.round((Date.now() - ts) / 60e3);
  if (m < 1) return tr("just now"); if (m < 60) return tr(`${m} min ago`);
  const hh = Math.round(m / 60); if (hh < 24) return tr(`${hh} h ago`);
  const d = Math.round(hh / 24); return d === 1 ? tr("1 day ago") : tr(`${d} days ago`);
}
function renderBackupTop() {
  const t = lastBackup(), oldOne = !t || Date.now() - t > 7 * 86400e3;
  $("copiaCuando").textContent = tr(`last: ${howLongAgo(t)}`);
  $("copiaRapida").classList.toggle("vieja", oldOne);
  $("copiaRapida").title = tr(t ? `Last backup: ${new Date(t).toLocaleString(LOCALE)}. Press to save another one now.` : "There's no backup yet. Press to save one now.");
}
function visibleState(a) {
  if (a.state === "working" || ed.busyIds.has(a.id)) return "working";
  if (a.off || a.state === "off") return "off";
  if (a.state === "frozen") return "frozen";
  if (a.tasks.some((t) => t.state === "pending")) return "active";
  return "idle";
}
const STATUS_TXT = { working: "working", off: "off", frozen: "frozen", active: "with pending tasks", idle: "resting" };
const pct = (n) => (n * 100).toFixed(3) + "%";
// Voice and hearing, in the website's language (with the browser's accent if it's the same language: en-GB, es-MX…)
const voiceLanguage = () => ((navigator.language || "").slice(0, 2).toLowerCase() === language ? navigator.language : LOCALE);
const roleTxt = (a) => trAlways((ROLES[a.role] || {}).name || a.role);
// The names of agents, floors and the building are data: they aren't translated (if the boss is called «Jefe», in English you see «Jefe»)
const namesUpToDate = () => { if (ed && ed.e) setNames([ed.e.name, ...ed.e.agents.map((a) => a.name), ...ed.e.floors.map((p) => p.name)]); };
const converses = (a) => !!(a && a.brain && a.role !== "jev" && !["controller", "memory"].includes(a.role));
const spendingTxt = (g) => (g > 0 ? fmt(g) : "");   // spending is only shown when there is some
// The profile (and the activity) go in a panel on the right that only opens when you touch an agent or go into a floor
const panelOpen = () => document.body.classList.contains("con-panel");
function openPanel(tab) { if (window.innerWidth > 900) document.body.classList.add("con-panel"); showTab(tab || "profile"); render(); }
function closePanel() { if (!panelOpen()) return; document.body.classList.remove("con-panel"); render(); }
function choose(a) { selection = a.id; openPanel("profile"); }

// A figure placed on a piece of the drawing. x0 and width: the stretch of drawing the container takes up.
function character(a, T, x, x0, width, withName) {
  const est = visibleState(a);
  return h("button", {
    class: `pj ${est}${selection === a.id && (panelOpen() || window.innerWidth <= 900) ? " sel" : ""}${a.role === "boss" ? " jefe" : ""}`, "data-id": a.id, type: "button",
    style: { left: pct((x - x0) / width), top: pct((T.ground - T.fig) / T.high), height: pct(T.fig / T.high) },
    title: `${a.name} · ${roleTxt(a)} · ${tr(STATUS_TXT[est])}${a.statusReason ? " (" + a.statusReason + ")" : ""}`,
    "aria-label": `${a.name}, ${roleTxt(a)}, ${tr(STATUS_TXT[est])}`,
    onclick: (ev) => { ev.stopPropagation(); choose(a); }
  }, h("img", { src: figure(a.look), alt: "", draggable: "false" }), est === "active" ? h("span", { class: "pendiente", "aria-hidden": "true" }) : null,
    figureCoins(a), h("span", { class: "etiqueta" + (withName ? "" : " al-pasar"), "aria-hidden": "true" }, a.name));
}
// The gold and red coin counter, on the figure
let coinTally = null, coinsSignature = "";
function coinsOf(a) {
  const ms = (ed.e.coins || []), f = ms.length + ":" + ((ms.at(-1) || {}).id || "") + ":" + ms.filter((m) => m.state !== "confirmed").length;
  if (!coinTally || f !== coinsSignature) {
    coinTally = new Map(); coinsSignature = f;
    for (const m of ms) { if (m.state !== "confirmed") continue; const c = coinTally.get(m.agent) || { gold: 0, red: 0 }; c[m.type === "red" ? "red" : "gold"]++; coinTally.set(m.agent, c); }
  }
  return coinTally.get(a.id) || { gold: 0, red: 0 };
}
function figureCoins(a) {
  const c = coinsOf(a);
  if (!c.gold && !c.red) return null;
  return h("span", { class: "monedas-pj", "aria-label": `${c.gold} gold and ${c.red} red` },
    c.gold ? h("span", {}, h("i", { class: "moneda oro" }), String(c.gold)) : null, c.red ? h("span", {}, h("i", { class: "moneda roja" }), String(c.red)) : null);
}
function slot(T, x, x0, width, floor, seat) {
  return h("button", { class: "hueco", type: "button", title: "Put a new agent here", "aria-label": `Create an agent: ${SEAT_NAME[seat]}`,
    style: { left: pct((x - x0) / width), top: pct((T.ground - T.fig * 0.62) / T.high), height: pct(T.fig * 0.5 / T.high) },
    onclick: (ev) => { ev.stopPropagation(); openDrawer("agent", { floor: floor.id, seat }); } }, "+");
}
const floorSpending = (p) => ed.e.agents.filter((a) => a.floor === p.id).reduce((s, a) => s + ed.agentSpending(a, "today"), 0);

// Drawing or strips? «Automatic»: strips when the building is big.
const AUTO_AGENTS = 20, AUTO_STOREYS = 6;
function buildingView() {
  const v = ed.e.settings.buildingView || "auto";
  if (v === "drawing" || v === "strips") return v;
  return ed.e.agents.length > AUTO_AGENTS || ed.e.floors.filter((p) => p.type === "storey").length > AUTO_STOREYS ? "strips" : "drawing";
}
let tower = null, dirCab = null, dirList = null, floorBefore = "";
function renderCity() {
  const cont = $("edificio");
  if (openFloorId && !ed.e.floors.some((p) => p.id === openFloorId)) openFloorId = "";
  if (floorBefore && !openFloorId) document.body.classList.remove("con-panel");   // when leaving a floor, the whole building again
  floorBefore = openFloorId;
  cont.classList.toggle("abierta", !!openFloorId);
  $("ciudadBarra").hidden = !!openFloorId;
  if (openFloorId) return renderFloor(cont, ed.e.floors.find((p) => p.id === openFloorId));
  const v = buildingView();
  $("verDibujo").setAttribute("aria-pressed", String(v === "drawing")); $("verFranjas").setAttribute("aria-pressed", String(v === "strips"));
  if (!tower) { tower = h("div", { class: "torre" }); dirList = h("div", { class: "dir-lista" }); directoryHeader(); }
  // the directory, only in «Strips» (in the drawing you already see everyone)
  const withDir = v === "strips";
  if (cont.children[0] !== tower || (cont.children.length > 1) !== withDir) cont.replaceChildren(...(withDir ? [tower, dirCab, dirList] : [tower]));   // the search box isn't rebuilt: it doesn't lose what was typed
  tower.replaceChildren(...ed.e.floors.map((p) => (v === "strips" && p.type === "storey" ? storeyStrip(p) : buildingSection(p))), h("div", { class: "suelo-calle" }));
  if (withDir) renderDirectory();
}
function buildingSection(p) {
  const T = SECTION[p.type], r = seating(ed.e, p.id), places = PLACES[p.type];
  const el = h("div", { class: "tramo " + p.type, style: { aspectRatio: `${WIDTH} / ${T.high}` } });
  el.append(h("img", { class: "fondo", src: T.img, alt: "", draggable: "false" }));
  if (p.type === "dome") el.append(h("span", { class: "luz", id: "luzAntena", style: { left: pct(717 / WIDTH), top: pct(12 / T.high) }, "aria-hidden": "true" }));
  el.append(h("button", { class: "entrar", type: "button", "aria-label": `Go into ${p.name}`, title: `Go into ${p.name}${p.job ? ": " + p.job : ""}`, onclick: () => openFloor(p.id) }));
  let outside = 0;
  for (const [seat, ags] of Object.entries(r)) {
    const xs = (places[seat] || []).slice(0, p.type === "storey" && seat === "pool" ? Math.min(PER_POOL, (p.pools || 0) * PER_POOL) : undefined);
    ags.forEach((a, i) => { if (i < xs.length) el.append(character(a, T, xs[i], 0, WIDTH)); else outside++; });
  }
  if (outside) el.append(h("button", { class: "mas", type: "button", onclick: () => openFloor(p.id), title: "See all" }, `+${outside}`));
  const g = floorSpending(p);
  el.append(h("button", { class: "placa", type: "button", style: { "--arriba": pct(T.sign / T.high), "--movil": pct((T.mobileSign || T.sign) / T.high) }, onclick: () => openFloor(p.id), title: p.job || "" },
    h("b", {}, p.name), g > 0 ? h("span", {}, fmt(g)) : null));
  return el;
}
// A floor as a strip: name, job, how many agents, how many are working and the spending (if any); one dot per agent.
function storeyStrip(p) {
  const ags = ed.e.agents.filter((a) => a.floor === p.id), est = ags.map(visibleState);
  const workingCount = est.filter((x) => x === "working").length, g = floorSpending(p);
  const data = tr(ags.length === 1 ? "1 agent" : `${ags.length} agents`) + " · " + tr(`${workingCount} working`) + (g > 0 ? " · " + fmt(g) : "");
  return h("div", { class: "tramo piso franja" },
    h("img", { class: "fondo", src: SECTION.storey.img, alt: "", draggable: "false" }),
    h("button", { class: "entrar", type: "button", "aria-label": `Go into ${p.name}`, title: `Go into ${p.name}${p.job ? ": " + p.job : ""}`, onclick: () => openFloor(p.id) }),
    h("div", { class: "franja-txt" },
      h("span", { class: "f-nombre" }, h("b", {}, p.name), p.job ? h("small", {}, p.job) : null),
      h("span", { class: "f-datos" }, data, ags.length ? h("span", { class: "puntos", "aria-hidden": "true" }, ags.map((a, i) => h("i", { class: est[i] }))) : null)));
}

// ---------------- Directory: every agent, with a search box and filters ----------------
const FILTERS = [["", "All"], ["working", "Working"], ["active", "With pending tasks"], ["frozen", "Frozen"], ["off", "Off"]];
const withoutAccents = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
function directoryHeader() {
  const search = h("input", { class: "buscador", type: "search", placeholder: "Search by name, role or floor", "aria-label": "Find an agent", oninput: (ev) => { searchQuery = ev.target.value; renderDirectory(); } });
  dirCab = h("div", { class: "dir-cabecera" }, h("div", { class: "dir-cab" }, h("h3", {}, "Directory"), search), h("div", { class: "filtros", role: "group", "aria-label": "Filter by status" }));
}
function renderDirectory() {
  const filters = dirCab.querySelector(".filtros"), est = new Map(ed.e.agents.map((a) => [a.id, visibleState(a)]));
  filters.replaceChildren(...FILTERS.map(([k, t]) => {
    const n = k ? [...est.values()].filter((x) => x === k).length : est.size;
    return h("button", { type: "button", "aria-pressed": String(dirFilter === k), onclick: () => { dirFilter = dirFilter === k ? "" : k; renderDirectory(); } }, k ? h("i", { class: "est-punto " + k }) : null, `${tr(t)} (${n})`);
  }));
  const q = withoutAccents(searchQuery.trim());
  const groups = [];
  for (const p of ed.e.floors) {
    const allItems = ed.e.agents.filter((a) => a.floor === p.id);
    const ags = allItems.filter((a) => (!dirFilter || est.get(a.id) === dirFilter) && (!q || withoutAccents(`${a.name} ${roleTxt(a)} ${p.name} ${p.job}`).includes(q)));
    if (!ags.length && (q || dirFilter)) continue;
    const g = floorSpending(p);
    groups.push(h("div", { class: "grupo-dir" },
      h("button", { type: "button", onclick: () => openFloor(p.id), title: p.job || "" }, p.name, h("small", {}, `${allItems.length === 1 ? "1 agent" : `${allItems.length} agents`}${g > 0 ? " · " + fmt(g) : ""}`)),
      ags.length ? ags.map((a) => {
        const e = est.get(a.id), ga = ed.agentSpending(a, "today");
        return h("button", { class: "fila-ag" + (selection === a.id ? " sel" : ""), type: "button", onclick: () => choose(a) },
          h("img", { src: figure(a.look), alt: "" }),
          h("span", { class: "fa-txt" }, h("b", {}, a.name), h("small", {}, `${roleTxt(a)} · ${tr(STATUS_TXT[e])}${a.statusReason && e === "frozen" ? " · " + a.statusReason : ""}`)),
          h("span", { class: "fa-der" }, spendingTxt(ga), h("i", { class: "est-punto " + e, "aria-hidden": "true" })));
      }) : h("p", { class: "sin-resultados" }, p.type === "storey" ? "Empty floor." : "Empty.")));
  }
  dirList.replaceChildren(...(groups.length ? groups : [h("p", { class: "sin-resultados" }, "No agent matches the search or the filter.")]));
}
let pendingCentre = false;
function openFloor(id) {
  if (openFloorId !== id) {
    pendingCentre = true;   // when going in, the floor is shown centred on the chosen agent
    // the profile shown beside it is that floor's section head's (or the first one's); if it's empty, no profile is shown
    const r = seating(ed.e, id), who = (r.head_office || [])[0] || (r.center || [])[0] || (r.reception || [])[0] || ed.e.agents.find((a) => a.floor === id);
    if (who) { selection = who.id; if (window.innerWidth > 900) document.body.classList.add("con-panel"); }
  }
  openFloorId = id; showTab(window.innerWidth <= 900 ? "building" : tab === "actividad" ? "actividad" : "profile"); render();
  const c = $("edificio").closest(".ciudad"); if (c) c.scrollTop = 0;
  markNav();
}

// ---------------- A floor's view ----------------
function renderFloor(cont, p) {
  const focus = document.activeElement;
  if (cont.contains(focus) && (focus.tagName === "INPUT" || focus.tagName === "TEXTAREA")) return;
  const scrollStrip = (cont.querySelector(".tira") || {}).scrollLeft || 0;
  cont.innerHTML = "";
  const T = SECTION[p.type], r = seating(ed.e, p.id), ags = ed.e.agents.filter((a) => a.floor === p.id);
  const run = (acc) => Motor.run(acc).then(render).catch(warn);
  // header: back, name and job (changed by typing)
  const name = h("input", { class: "nombre-planta", value: p.name, "aria-label": "Name of the floor", onchange: (ev) => run({ type: "editFloor", id: p.id, name: ev.target.value }) });
  const job = h("textarea", { class: "funcion-planta", rows: "1", maxlength: "300", placeholder: "What is this floor for?", "aria-label": "What the floor does", onchange: (ev) => run({ type: "editFloor", id: p.id, job: ev.target.value.replace(/\s*\n\s*/g, " ") }) });
  job.value = p.job || "";
  cont.append(h("div", { class: "planta-cab" },
    h("button", { class: "volver", type: "button", onclick: goBack }, "← Back to the whole building"),
    name, job,
    h("p", { class: "planta-datos" }, tr(ags.length === 1 ? "1 agent" : `${ags.length} agents`) + (floorSpending(p) > 0 ? " · " + tr(`today ${fmt(floorSpending(p))}`) : "") + (p.type === "storey" ? " · " + tr(p.offices === 1 ? "1 office" : `${p.offices} offices`) + " · " + tr(p.pools === 1 ? "1 pool" : `${p.pools} pools`) : ""))));
  // the drawn floor
  const strip = h("div", { class: "tira " + p.type });
  if (p.type === "storey") {
    for (const m of storeyModules(p, r, T, true)) strip.append(m);
  } else {
    // dome and lobby: a crop of the big drawing, to see them up close
    const [x0, x1, y0, y1] = CUT[p.type], Tc = Object.assign({}, T, { ground: T.ground - y0, high: y1 - y0 });
    const canvas = h("div", { class: "lienzo", style: { "--x0": x0, "--x1": x1, "--y0": y0, "--y1": y1, "--W": WIDTH, "--A": T.high, backgroundImage: `url(${T.img2})` } });
    for (const [seat, xs] of Object.entries(PLACES[p.type])) {
      const a = (r[seat] || [])[0];
      if (a) canvas.append(character(a, Tc, xs[0], x0, x1 - x0, true));
      else if (seat !== "center") canvas.append(slot(Tc, xs[0], x0, x1 - x0, p, seat));
    }
    strip.append(canvas);
  }
  const frame = h("div", { class: "marco-tira" }, strip,
    h("button", { class: "flecha izq", type: "button", "aria-label": "See more to the left", onclick: () => strip.scrollBy({ left: -strip.clientWidth * 0.8, behavior: "smooth" }) }, "‹"),
    h("button", { class: "flecha der", type: "button", "aria-label": "See more to the right", onclick: () => strip.scrollBy({ left: strip.clientWidth * 0.8, behavior: "smooth" }) }, "›"));
  const containerWidth = Math.max(280, cont.clientWidth || 700);
  if (p.type === "dome") frame.style.setProperty("--h", Math.min(270, Math.floor(containerWidth * (CUT.dome[3] - CUT.dome[2]) / (CUT.dome[1] - CUT.dome[0]))) + "px");
  let mapWindow = null, miniMap = null;
  const move = () => {
    const sw = strip.scrollWidth || 1;
    if (miniMap) { const w = miniMap.scrollWidth || 1; mapWindow.style.left = (strip.scrollLeft / sw * w) + "px"; mapWindow.style.width = (strip.clientWidth / sw * w) + "px"; }
    frame.classList.toggle("hay-izq", strip.scrollLeft > 4); frame.classList.toggle("hay-der", strip.scrollLeft + strip.clientWidth < sw - 4);
  };
  strip.addEventListener("scroll", move, { passive: true });
  if (p.type === "storey") {
    // a small map of the whole floor: shows where you are and takes you to each place with a tap
    const total = (MODULE.head_office[1] - MODULE.head_office[0]) * 2 + p.pools * (MODULE.pool[1] - MODULE.pool[0]) * 2 + Math.max(p.offices, r.office.length) * (MODULE.office[1] - MODULE.office[0]) * 2 + (MODULE.end[1] - MODULE.end[0]) * 2;
    const height = Math.min(84, Math.max(34, containerWidth * 260 / total));
    miniMap = h("div", { class: "plano", style: { "--h": height + "px" }, "aria-hidden": "true" }, storeyModules(p, r, T, false));
    mapWindow = h("span", { class: "ventana-plano" });
    miniMap.append(mapWindow);
    miniMap.addEventListener("click", (ev) => { const b = miniMap.getBoundingClientRect(); strip.scrollTo({ left: (ev.clientX - b.left) / b.width * strip.scrollWidth - strip.clientWidth / 2, behavior: "smooth" }); });
    cont.append(miniMap);
  }
  cont.append(frame);
  requestAnimationFrame(() => {
    strip.scrollLeft = scrollStrip;
    if (pendingCentre) {
      pendingCentre = false;
      const focus = strip.querySelector(".pj.sel") || (p.type === "lobby" ? strip.querySelector(".pj") : null);
      if (focus) { const bt = strip.getBoundingClientRect(), bf = focus.getBoundingClientRect(); strip.scrollLeft += bf.left + bf.width / 2 - bt.left - strip.clientWidth / 2; }
    }
    move();
  });
  // the floor's actions
  const acc = h("div", { class: "planta-acciones" },
    p.type === "dome" && r.left.length && r.right.length ? null : h("button", { class: "btn primario mini", onclick: () => openDrawer("agent", { floor: p.id, seat: p.type === "dome" ? (r.left.length ? "right" : "left") : "" }) }, p.type === "dome" ? "+ Sage" : "+ Agent on this floor"));
  if (p.type === "storey") {
    acc.append(...[
      h("button", { class: "btn mini", disabled: p.offices >= MAX_OFFICES, onclick: () => run({ type: "enlargeFloor", id: p.id, what: "office", delta: 1 }) }, "+ Office"),
      h("button", { class: "btn mini", disabled: p.offices <= Math.max(1, r.office.length), onclick: () => run({ type: "enlargeFloor", id: p.id, what: "office", delta: -1 }) }, "− Office"),
      h("button", { class: "btn mini", disabled: p.pools >= MAX_POOLS, onclick: () => run({ type: "enlargeFloor", id: p.id, what: "pool", delta: 1 }) }, "+ Pool"),
      h("button", { class: "btn mini", disabled: !p.pools || (p.pools - 1) * PER_POOL < r.pool.length, onclick: () => run({ type: "enlargeFloor", id: p.id, what: "pool", delta: -1 }) }, "− Pool"),
      h("button", { class: "btn mini", onclick: () => run({ type: "moveFloorUp", id: p.id }) }, "Move up"),
      h("button", { class: "btn mini", onclick: () => run({ type: "moveFloorDown", id: p.id }) }, "Move down"),
      ags.length ? null : h("button", { class: "btn mini peligro", onclick: (ev) => confirm(ev.target, "Delete the floor? Press again", () => Motor.run({ type: "deleteFloor", id: p.id }).then(() => { openFloorId = ""; render(); }).catch(warn)) }, "Delete floor")].filter(Boolean));
  }
  cont.append(acc);
  // who works here
  const list = h("div", { class: "quienes" });
  const order = { center: 0, head_office: 0, reception: 0, left: 1, right: 2, office: 3, pool: 4 };
  for (const a of ags.slice().sort((x, y) => (order[x.seat] ?? 9) - (order[y.seat] ?? 9))) {
    const est = visibleState(a);
    list.append(h("button", { class: "quien " + est + (selection === a.id ? " sel" : ""), type: "button", onclick: () => choose(a) },
      h("img", { src: figure(a.look), alt: "" }),
      h("span", { class: "q-txt" }, h("b", {}, a.name), h("small", {}, `${roleTxt(a)} · ${SEAT_NAME[a.seat] || a.seat}`), h("small", {}, `${tr(STATUS_TXT[est])} · ${["controller", "memory"].includes(a.role) ? tr("doesn't spend") : heartbeatText(a.heartbeat)}${ed.agentSpending(a, "today") > 0 ? " · " + tr(`today ${fmt(ed.agentSpending(a, "today"))}`) : ""}`))));
  }
  cont.append(ags.length ? list : h("p", { class: "planta-vacia" }, p.type === "storey" ? "Empty floor. Put a section head in the head office and their sub-agents in the offices or the pool." : "This floor is empty."));
}
// A floor's modules: head office, one or more pools, the offices and the glass end.
function storeyModules(p, r, T, big) {
  const mod = (type, x0, x1, content) => h("div", { class: "modulo " + type, style: { "--x0": x0 * 2, "--w": (x1 - x0) * 2 } }, content);
  const fig = (a, x, x0, width, seat) => a ? character(a, T, x, x0, width, big) : big ? slot(T, x, x0, width, p, seat) : null;
  const [d0, d1] = MODULE.head_office, [p0, p1] = MODULE.pool, [o0, o1] = MODULE.office, [f0, f1] = MODULE.end;
  const out = [mod("despacho", d0, d1, fig(r.head_office[0], PLACES.storey.head_office[0], d0, d1 - d0, "head_office"))];
  for (let k = 0; k < p.pools; k++) out.push(mod("pool", p0, p1, PLACES.storey.pool.map((x, i) => fig(r.pool[k * PER_POOL + i], x, p0, p1 - p0, "pool"))));
  const nOf = Math.max(p.offices, r.office.length);
  for (let k = 0; k < nOf; k++) out.push(mod("oficina", o0, o1, fig(r.office[k], PLACES.storey.office[0], o0, o1 - o0, "office")));
  out.push(mod("fin", f0, f1));
  return out;
}
function beatAntenna() { const l = $("luzAntena"); if (!l) return; l.classList.remove("late"); void l.offsetWidth; l.classList.add("late"); }
// Errors: in the chat if it's open; if not, a notice at the bottom that goes away by itself.
function warn(err) {
  const t = err && err.shown ? err.message : `Something went wrong: ${(err && err.message) || err}`;
  if (chatId) { pendingErrors.push(t); renderChat(true); return; }
  toast(t);
}
function toast(t) {
  let el = $("avisoFlotante");
  if (!el) { el = h("div", { id: "avisoFlotante", class: "aviso-flotante", role: "status" }); document.body.append(el); el.onclick = () => { el.hidden = true; }; }
  el.textContent = tr(t); el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 8000);
}

// ---------------- The panel's tabs ----------------
function showTab(p) {
  if (p === "building") { document.body.classList.add("ver-edificio"); $("tabEdificio").setAttribute("aria-selected", "true"); for (const id of ["tabFicha", "tabActividad"]) $(id).setAttribute("aria-selected", "false"); return; }
  document.body.classList.remove("ver-edificio"); $("tabEdificio").setAttribute("aria-selected", "false");
  tab = p;
  for (const [id, v, n] of [["tabFicha", "vistaFicha", "profile"], ["tabActividad", "vistaActividad", "actividad"]]) {
    $(id).setAttribute("aria-selected", String(p === n)); $(v).hidden = p !== n;
  }
  if (p === "profile") renderProfile(true);
  if (p === "actividad") renderLog();
}

// ---------------- An agent's profile, in four tabs ----------------
const WHAT_IT_DOES = {
  techie: "Every day it does its round without spending: it checks new agents, every other night it makes sure everyone has worked and left their mark, on Fridays it saves a backup, clears what's been dealt with, removes duplicate memories and makes sure nothing is sent, deleted or paid without your yes. On Mondays it reviews the costs, and only then does it use its brain, to say whether they pay off.",
  improvement: "Follows every day how AI agents are moving forward and suggests improvements for the building to the boss. It uses internet search. When a new model comes out, it proposes it to you as a recommended one; you decide.",
  creator: "Designs new agents from what you tell it in your own words. Use it from “Create agent” or by asking the boss. Nothing is created unless you accept it.",
  controller: "Watches the spending with fixed rules: it freezes the least important agents when spending gets close to the cap. No brain: it doesn't spend. It can propose red coins; you confirm them.",
  jev: "Before an agent does something that costs money (searching the internet, retrying what failed or creating another agent), it decides: go ahead, reuse what's already there, stop or ask the boss. It uses the Jev model. It can propose red coins; you confirm them.",
  memory: "Keeps the building's long-term memory and searches it by keywords when you say “remember…”. No brain: it doesn't spend.",
  sage: "Only speaks when the boss consults it on an important decision. It's expensive: it's capped at one consultation a day."
};
const PROFILE_TABS = [["identity", "Identity"], ["work", "Work"], ["brain", "Brain and spending"], ["capabilities", "Capabilities"]];
const date = (ts, op) => new Date(ts).toLocaleString(LOCALE, op || { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const field = (txt, el, help) => h("label", { class: "campo" }, h("span", {}, txt), el, help ? h("small", {}, help) : null);
function renderProfile(force) {
  const box = $("ficha");
  const focus = document.activeElement;   // it isn't repainted while you type or choose in a drop-down
  if (!force && box.contains(focus) && (focus.tagName === "TEXTAREA" || focus.tagName === "SELECT" || (focus.tagName === "INPUT" && !["checkbox", "radio"].includes(focus.type)))) return;
  const a = ed.exactAgent(selection) || ed.boss();
  if (!a) return;
  selection = a.id;
  const sc = box.scrollTop;
  box.innerHTML = "";
  const change = (changes) => Motor.run({ type: "editAgent", id: a.id, changes }).then(render).catch(warn);
  const est = visibleState(a), brainless = a.role === "controller" || a.role === "memory";
  const pl = ed.e.floors.find((x) => x.id === a.floor);
  // header: figure, name, state and the essentials
  box.append(h("div", { class: "ficha-cab" },
    h("button", { class: "marco-ficha", type: "button", title: "Change their photo and name", onclick: () => openDrawer("look", { id: a.id }) }, h("img", { src: figure(a.look), alt: "" })),
    h("div", { style: { flex: 1, minWidth: 0, display: "grid", gap: "4px" } }, h("h3", { class: "ficha-nombre" }, a.name),
      h("div", { class: "fila-c" }, h("span", { class: "estado-pill " + est }, tr(STATUS_TXT[est]) + (a.statusReason ? " · " + a.statusReason : "")),
        h("span", { class: "nota" }, `${roleTxt(a)} · ${pl ? pl.name : ""}`)))));
  box.append(h("div", { class: "fila-c", style: { marginTop: "12px" } },
    converses(a) ? h("button", { class: "btn primario mini", onclick: () => openChat(a.id) }, `Talk to ${a.name}`) : null,
    brainless || a.role === "jev" ? null : h("button", { class: "btn mini", onclick: () => { Motor.run({ type: "wakeUp", id: a.id }).then(render).catch(warn); render(); } }, "Wake up now"),
    h("button", { class: "btn mini", onclick: () => change({ off: !a.off }) }, a.off ? "Turn on" : "Turn off"),
    pl ? h("button", { class: "btn mini", onclick: () => openFloor(pl.id) }, "See their floor") : null,
    a.role === "boss" ? null : h("button", { class: "btn mini peligro", onclick: (ev) => confirm(ev.target, "Delete? Press again", () => Motor.run({ type: "deleteAgent", id: a.id }).then(() => { selection = "boss"; render(); showTab("profile"); }).catch(warn)) }, "Delete")));
  if (WHAT_IT_DOES[a.role]) box.append(h("p", { class: "que-hace" }, WHAT_IT_DOES[a.role]));
  if (a.missing) box.append(h("div", { class: "aviso-falta" }, h("b", {}, "Says it's missing something and won't move on alone"), h("span", {}, inQuotes(a.missing.text)),
    h("small", { class: "nota" }, "Give it what it asks for (capabilities, skills, data) or change its objective. Changing its profile marks it as handled."),
    h("div", {}, h("button", { class: "btn mini", type: "button", onclick: () => Motor.run({ type: "inbox.decide", kind: "missing", id: a.id, yes: true }).then(render).catch(warn) }, "It has it now"))));
  box.append(h("div", { class: "ficha-pestanas", role: "tablist" }, PROFILE_TABS.map(([k, t]) =>
    h("button", { role: "tab", type: "button", "aria-selected": String(profileTab === k), onclick: () => { profileTab = k; renderProfile(true); $("ficha").scrollTop = 0; } }, t))));
  const paint = { identity: profileIdentity, work: profileWork, brain: profileBrain, capabilities: profileCapabilities }[profileTab] || profileIdentity;
  paint(box, a, change, { brainless, pl });
  box.scrollTop = sc;
}
// Identity: name, look, role, where it is, who it reports to and its coins
function profileIdentity(box, a, change, { pl }) {
  const name = h("input", { value: a.name, maxlength: "40", onchange: (ev) => change({ name: ev.target.value.trim() || a.name }) });
  const validFloors = a.role === "boss" ? [] : ed.e.floors.filter((x) => a.role === "sage" ? x.type === "dome" : x.type !== "dome");
  const selFloor = h("select", { disabled: a.role === "boss" || a.role === "sage", onchange: (ev) => change({ floor: ev.target.value, seat: "" }) }, (a.role === "boss" || a.role === "sage" ? [pl] : validFloors).filter(Boolean).map((x) => h("option", { value: x.id }, x.name)));
  selFloor.value = a.floor;
  const seatOption = pl ? (SEATS_TXT[pl.type] || []) : [];
  const selSeat = h("select", { disabled: a.role === "boss", onchange: (ev) => change({ floor: a.floor, seat: ev.target.value }) }, (a.role === "boss" ? [["center", "Centre of the dome"]] : seatOption).map(([v, t]) => h("option", { value: v }, t)));
  selSeat.value = a.seat;
  // «Reports to»: any agent in the building (with a search box if there are many); the engine doesn't allow loops
  const others = ed.e.agents.filter((x) => x.id !== a.id);
  const selReportsTo = h("select", { onchange: (ev) => change({ reportsTo: ev.target.value }) });
  const fillReportsTo = (q) => {
    const t = withoutAccents(q || "");
    selReportsTo.replaceChildren(h("option", { value: "" }, "Nobody"), ...others.filter((x) => !t || x.id === a.reportsTo || withoutAccents(`${x.name} ${roleTxt(x)}`).includes(t)).map((x) => h("option", { value: x.id }, `${x.name} · ${roleTxt(x)}`)));
    selReportsTo.value = a.reportsTo || "";
  };
  fillReportsTo("");
  const selBoss = others.length > 6 ? h("div", { class: "informa-a" }, h("input", { type: "search", placeholder: "Type their name to find them", "aria-label": "Search who they report to", oninput: (ev) => fillReportsTo(ev.target.value) }), selReportsTo) : selReportsTo;
  const changeable = ["section_head", "subagent"].includes(a.role);
  const selRole = h("select", { onchange: (ev) => change({ role: ev.target.value }) }, [["section_head", "Section head"], ["subagent", "Sub-agent"]].map(([k, v]) => h("option", { value: k }, v)));
  selRole.value = a.role;
  box.append(h("div", { class: "bloque" },
    field("Name", name),
    h("div", { class: "campo" }, h("span", {}, "Appearance"), h("div", { class: "fila-c" }, h("img", { class: "mini-pj", src: figure(a.look), alt: "" }), h("button", { class: "btn mini", onclick: () => openDrawer("look", { id: a.id }) }, "Change their photo and name"))),
    h("div", { class: "dos" }, changeable ? field("Role", selRole) : h("div", { class: "campo" }, h("span", {}, "Role"), h("span", { class: "nota" }, roleTxt(a))),
      a.role === "boss" ? null : field("Reports to", selBoss)),
    h("div", { class: "dos" }, field("Floor", selFloor), field("Spot", selSeat))));
  box.append(coinsBlock(a));
}
// Coins: gold (good work) and red (making things up, wasting money). Each one with its reason in one line.
function coinsBlock(a) {
  const mine = (ed.e.coins || []).filter((m) => m.agent === a.id);
  const gold = mine.filter((m) => m.type === "gold" && m.state === "confirmed").length, reds = mine.filter((m) => m.type === "red" && m.state === "confirmed").length;
  const box = h("div", { class: "bloque" }, h("h4", {}, "Coins"),
    h("div", { class: "fila-c" }, h("span", { class: "moneda oro" }), h("b", {}, gold), h("span", { class: "nota" }, gold === 1 ? "gold coin" : "gold coins"), h("span", { class: "moneda roja" }), h("b", {}, reds), h("span", { class: "nota" }, reds === 1 ? "red coin" : "red coins")),
    h("div", { class: "fila-c" }, coinButton(a, "gold"), coinButton(a, "red")),
    h("small", { class: "nota" }, `A cheap model turns the reason into a concrete rule; when you approve it in the inbox, ${a.name} and everyone with the same role (${roleTxt(a)}) learn it.`));
  for (const m of mine.filter((x) => x.state === "proposed")) box.append(proposedCoinRow(m));
  const latest = mine.filter((m) => m.state === "confirmed").slice(-5).reverse();
  if (latest.length) box.append(h("div", { class: "lista" }, latest.map((m) => h("div", { class: "item" }, h("div", { class: "cab" }, h("span", {}, h("span", { class: "moneda " + m.type }), " ", date(m.ts)), h("span", {}, m.proposedBy === "you" ? "from you" : tr(`proposed by ${whoProposes(m.proposedBy)}, confirmed`))), h("div", { class: "txt" }, raw(m.reason))))));
  return box;
}
// Coin button: when pressed it asks for the reason in one line
function coinButton(a, type, onGive) {
  const b = h("button", { class: "moneda-btn", type: "button", title: type === "gold" ? "Gold coin: it did well" : "Red coin: it made things up or wasted money" }, h("span", { class: "moneda " + type }), type === "gold" ? "Gold coin" : "Red coin");
  b.onclick = () => {
    const inp = h("input", { maxlength: "160", placeholder: type === "gold" ? "What did it do well? (one line)" : "What did it do wrong? (one line)" });
    const give = async () => {
      if (!inp.value.trim()) { inp.focus(); return; }
      try {
        inp.disabled = true;
        const r = await Motor.run({ type: "coin.give", id: a.id, coinType: type, reason: inp.value.trim() });
        const doneMsg = tr(`${type === "gold" ? "Gold coin" : "Red coin"} for ${a.name}.`) + (r.lesson ? " " + tr(`Proposed lesson: “${r.lesson.text}”. Approve it or tweak it in the inbox.`) : "");
        row.replaceWith(h("span", { class: "nota" }, doneMsg)); toast(doneMsg); if (onGive) onGive(); render();
      }
      catch (err) { inp.disabled = false; warn(err); }
    };
    inp.onkeydown = (ev) => { if (ev.key === "Enter") { ev.preventDefault(); give(); } if (ev.key === "Escape") row.replaceWith(b); };
    const row = h("span", { class: "motivo-fila" }, h("span", { class: "moneda " + type }), inp, h("button", { class: "btn mini primario", type: "button", onclick: give }, "Give"), h("button", { class: "btn mini", type: "button", onclick: () => row.replaceWith(b) }, "Cancel"));
    b.replaceWith(row); inp.focus();
  };
  return b;
}
function proposedCoinRow(m) {
  return h("div", { class: "fila-moneda" }, h("span", { class: "moneda " + m.type }),
    h("span", { class: "grow" }, h("b", {}, m.name), " · " + tr(`${whoProposes(m.proposedBy)} proposes:`) + " ", raw(m.reason)),
    h("button", { class: "btn mini primario", onclick: () => Motor.run({ type: "coin.confirm", coin: m.id }).then(render).catch(warn) }, "Confirm"),
    h("button", { class: "btn mini", onclick: () => Motor.run({ type: "coin.discard", coin: m.id }).then(render).catch(warn) }, "Dismiss"));
}
// Work: instructions, objective, lessons, heartbeat, tasks and short memory
function profileWork(box, a, change, { brainless }) {
  if (!brainless) {
    const per = h("textarea", { rows: "2", maxlength: String(MAX_PERSONALITY), placeholder: "Its tone, its humour and whether it gets to the point. For example: “Friendly and funny, but brief and to the point.”", onchange: (ev) => change({ personality: ev.target.value.trim() }) }, a.personality || "");
    const tally = h("span", { class: "contador" }, `${(a.personality || "").length}/${MAX_PERSONALITY}`);
    per.oninput = () => { tally.textContent = `${per.value.length}/${MAX_PERSONALITY}`; };
    box.append(h("div", { class: "bloque" },
      field("Instructions (who it is and how it works)", h("textarea", { rows: "6", onchange: (ev) => change({ instructions: ev.target.value }) }, a.instructions)),
      a.role === "jev" ? null : field("Personality", per, "Sent with every call: that way its character doesn't depend on the brain you give it."), a.role === "jev" ? null : tally,
      a.role === "jev" ? null : field("Objective", h("textarea", { rows: "2", onchange: (ev) => change({ objective: ev.target.value }) }, a.objective))));
  }
  // lessons of its role (they come from the coins); new ones wait for your yes in the inbox
  const pendLecc = (ed.e.lessons || []).filter((l) => l.role === a.role && l.state === "proposed");
  const roleLessons = ed.lessonsOf(a.role).slice().sort((x, y) => (y.fixed - x.fixed) || (y.ts - x.ts));
  const max = ed.e.settings.lessonsPerRole || 5;
  box.append(h("div", { class: "bloque" }, h("h4", {}, `Lessons for its role (${roleTxt(a)})`),
    roleLessons.length ? h("div", { class: "lista" }, roleLessons.map((l) => h("div", { class: "item leccion" + (l.fixed ? " fija" : "") }, h("span", { class: "moneda " + l.type }), h("span", { class: "txt" }, raw(l.text)),
      h("button", { class: "btn mini", title: l.fixed ? "Let it go when new lessons come in" : "Never let it go, even when it's old", onclick: () => Motor.run({ type: "lesson.pin", lesson: l.id, fixed: !l.fixed }).then(render).catch(warn) }, l.fixed ? "Unpin" : "Pin"),
      h("button", { class: "btn mini", onclick: () => Motor.run({ type: "lesson.delete", lesson: l.id }).then(render).catch(warn) }, "Remove"))))
      : h("p", { class: "nota", style: { margin: 0 } }, "None yet. They come from coins: a cheap model turns the reason into a rule and you approve it in the inbox."),
    pendLecc.length ? h("div", { class: "fila-c" }, h("span", { class: "nota" }, pendLecc.length === 1 ? "1 new lesson is waiting for your yes." : `${pendLecc.length} new lessons are waiting for your yes.`), h("button", { class: "btn mini", type: "button", onclick: () => openScreen("inbox") }, "Go to the inbox")) : null,
    h("small", { class: "nota" }, `Everyone with this role learns them. ${max} are kept per role (change it in Settings); when a new one comes in, the oldest goes, except pinned ones.`)));
  // heartbeat
  const num = h("input", { type: "number", min: "1", step: "1", value: a.heartbeat.every, disabled: a.heartbeat.unit === "on_request" });
  const uni = h("select", {}, [["min", "minutes"], ["h", "hours"], ["d", "days"], ["on_request", "on request only"]].map(([v, t]) => h("option", { value: v }, t)));
  uni.value = a.heartbeat.unit;
  const saveHeartbeat = () => change({ heartbeat: { every: Math.max(1, parseInt(num.value, 10) || 1), unit: uni.value } });
  num.onchange = saveHeartbeat; uni.onchange = saveHeartbeat;
  const selOnWake = h("select", { onchange: (ev) => change({ onWake: ev.target.value }) }, h("option", { value: "tasks" }, "Does its pending tasks (if there are none, it doesn't spend)"), h("option", { value: "objective" }, "Does its tasks and, if there are none, works on its objective (spends)"));
  selOnWake.value = a.onWake || "tasks";
  const upcoming = a.next && a.next < 9e14 ? date(a.next, { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "—";
  box.append(h("div", { class: "bloque" }, h("h4", {}, "Heartbeat"),
    h("div", { class: "campo" }, h("span", {}, "Resting, it wakes up"), h("div", { class: "fila-c" }, h("span", {}, "every"), num, uni)),
    brainless || a.role === "sage" || a.role === "jev" ? null : field("When it wakes up", selOnWake),
    h("small", { class: "nota" }, a.heartbeat.unit === "on_request" ? "Only works when someone gives it a job." : `Next heartbeat: ${upcoming}. Last: ${a.last ? date(a.last) : "never"}.`)));
  // tasks
  if (!brainless && a.role !== "jev") {
    const txt = h("input", { placeholder: "Give it a job…" }), now = h("input", { type: "checkbox" });
    const list = h("div", { class: "lista" });
    for (const t of a.tasks.slice().reverse().slice(0, 15)) {
      list.append(h("div", { class: "item" }, h("div", { class: "cab" }, h("span", {}, date(t.created) + " · " + (t.from ? tr(`from ${(ed.exactAgent(t.from) || {}).name || t.from}`) : tr("from you"))), h("span", { class: "est " + t.state }, t.state)),
        h("div", { class: "txt" }, raw(t.text)), t.result ? h("details", {}, h("summary", {}, "Result"), h("div", { class: "txt", html: markdown(t.result) })) : null));
    }
    box.append(h("div", { class: "bloque" }, h("h4", {}, "Tasks"),
      h("div", { class: "fila-c" }, txt, h("label", { class: "fila-c nota" }, now, "now"), h("button", { class: "btn mini", onclick: () => { if (!txt.value.trim()) return; Motor.run({ type: "assignTask", id: a.id, text: txt.value.trim(), now: now.checked }).then(() => { txt.value = ""; render(); }).catch(warn); } }, "Assign")),
      a.tasks.length ? list : h("p", { class: "nota", style: { margin: 0 } }, "No tasks.")));
  }
  // short-term memory
  const mc = h("div", { class: "lista" });
  for (const m of a.shortMemory.slice().reverse().slice(0, 10)) mc.append(h("div", { class: "item" }, h("div", { class: "cab" }, h("span", {}, date(m.ts)), h("span", {}, m.type)), h("div", { class: "txt" }, raw(m.text))));
  box.append(h("div", { class: "bloque" }, h("h4", {}, "Short memory"), a.shortMemory.length ? mc : h("p", { class: "nota", style: { margin: 0 } }, "Still empty.")));
  // Memory: the building's long-term memory
  if (a.role === "memory") {
    const ml = h("div", { class: "lista" });
    for (const n of ed.e.longMemory.slice().reverse()) ml.append(h("div", { class: "item" }, h("div", { class: "cab" }, h("span", {}, new Date(n.ts).toLocaleDateString(LOCALE) + (n.tags && n.tags.length ? " · " + n.tags.join(", ") : "")),
      h("button", { class: "btn mini", onclick: () => Motor.run({ type: "memory.delete", noteId: n.id }).then(render) }, "Delete")), h("div", { class: "txt" }, raw(n.text))));
    const nt = h("textarea", { rows: "2", placeholder: "Something the building should remember…" }), et = h("input", { placeholder: "tags, separated by commas" });
    box.append(h("div", { class: "bloque" }, h("h4", {}, `Building's long-term memory (${ed.e.longMemory.length})`),
      h("p", { class: "nota", style: { margin: 0 } }, "When you say “remember…” to the boss, Memory searches here by keywords and passes it on. It uses no brain: it doesn't spend. Later on it will be able to live in Google Drive."),
      nt, et, h("div", {}, h("button", { class: "btn mini", onclick: () => { if (!nt.value.trim()) return; Motor.run({ type: "memory.save", text: nt.value.trim(), tags: et.value.split(",").map((x) => x.trim()).filter(Boolean) }).then(render).catch(warn); } }, "Save memory")), ml));
  }
}
// Brain and spending: which model thinks for it, its priority, its cap and what it has spent
function profileBrain(box, a, change, { brainless }) {
  if (brainless) box.append(h("div", { class: "bloque" }, h("h4", {}, "Brain"), h("p", { class: "nota", style: { margin: 0 } }, "Works with fixed rules, no brain: it doesn't spend.")));
  else if (a.role === "jev") {
    const sel = modelPicker("decisions", a.brain, { extra: [[JEV_MODEL, "Jev Latest · always the latest version of Jev"]], onChange: (v) => change({ brain: v }) });
    box.append(h("div", { class: "bloque" }, h("h4", {}, "Brain"), field("Decision model", sel, "JEV decides with OpenRouter's decisions API. “Jev Latest” always points to the latest version, without changing it by hand.")));
  } else {
    // What it thinks with: OpenRouter (pay per use) or one of your other APIs (Settings → Other APIs), one from a subscription you already pay for
    const prov = ed.brainOf(a).provider, conx = ed.connections();
    const options = [["openrouter", "OpenRouter (pay per use)"], ...conx.map((c) => [c.id, `${c.name} · your subscription`])];
    if (prov !== "openrouter" && !conx.some((c) => c.id === prov)) options.push([prov, (ed.provider(prov) || {}).name || prov]);
    const selProv = h("select", { onchange: (ev) => {
      const fresh = ev.target.value;
      const brain = fresh === "openrouter" ? ((ed.equivalentModel(prov, a.brain) || {}).id || ed.defaultBrain(Object.assign({}, a, { provider: "openrouter" }))) : (directSuggestions(fresh, a)[0] || "");
      change({ provider: fresh, brain });
    } }, options.map(([k, t]) => h("option", { value: k }, t)));
    selProv.value = prov;
    const block = h("div", { class: "bloque" }, h("h4", {}, "Brain"), field("Thinks with", selProv));
    if (!conx.length) block.append(h("small", { class: "nota" }, "Do you have a subscription that includes API access (for example, Claude or ChatGPT credits, Gemini or a model on your computer)? Add it in Settings → Other APIs and you'll be able to pick it here. Anything paid separately is better through OpenRouter."));
    if (prov === "openrouter") {
      block.append(field("Brain", modelPicker("text", a.brain, { onChange: (v) => change({ brain: v }) }), "At the top, the recommended ones by price level (not quality); below, all of OpenRouter's text models. Or type the name with “Search all”. Prices in dollars per million tokens (input / output). “sees” = can look at images."),
        proposalsFor("text"));
    } else {
      const P = ed.provider(prov) || { short: prov };
      block.append(directPicker(prov, a.brain, (v) => change({ brain: v })),
        h("small", { class: "nota" }, tr(hasApiKey(prov) ? `Comes out of your ${P.short} subscription: it doesn't count towards the spending cap (it's tracked separately, so you can see it).` : `The ${P.short} key is missing: add it in Settings → Other APIs.`) + " " +
          tr("Internet search only works with OpenRouter.")));
      const selExhausted = h("select", { onchange: (ev) => change({ onExhausted: ev.target.value }) }, h("option", { value: "openrouter" }, "Carry on with OpenRouter"), h("option", { value: "stop" }, "Stop working"));
      selExhausted.value = a.onExhausted || "openrouter";
      block.append(field(`If your ${P.short} quota runs out`, selExhausted, "When the company says there are no credits left (for example, at the end of the month), you choose."));
      if ((a.onExhausted || "openrouter") === "openrouter") {
        const eq = ed.equivalentModel(prov, a.brain);
        block.append(field("Its brain on OpenRouter in the meantime", modelPicker("text", a.fallbackBrain, { empty: eq ? `The same model on OpenRouter (${eq.name || eq.id})` : "The one its role would get", onChange: (v) => change({ fallbackBrain: v }) })));
      }
      const subs = Object.entries(a.subscription || {}).sort().at(-1);
      if (subs) block.append(h("small", { class: "nota" }, tr(`From your subscription, on ${subs[0]}: ${subs[1].tokens.toLocaleString(LOCALE)} tokens`) + (subs[1].usd ? " " + tr(`(on OpenRouter it would be ≈${fmt(subs[1].usd)})`) : "") + "."));
    }
    const est = ed.estimateHeartbeat(a);
    // each piece is translated separately (that way each language orders it its own way)
    block.append(h("small", { class: "nota" }, [tr(`When it wakes up: ${est.how}`), est.spends && est.perTime > 0 ? tr(`· ≈${fmt(est.perTime)} per heartbeat`) + (est.perDay ? " " + tr(`(≈${fmt(est.perDay)} a day)`) : "") : est.spends && est.perTask ? tr(`· ≈${fmt(est.perTask)} per task`) : "",
      est.tokens ? tr(`· reads about ${est.tokens.toLocaleString(LOCALE)} tokens each time`) : "", est.subscription ? tr(`· from your ${est.subscription} subscription`) : est.noPrice ? tr("· no known price") : ""].filter(Boolean).join(" ")));
    box.append(block);
  }
  box.append(h("div", { class: "bloque" }, h("h4", {}, "Priority"),
    h("div", { class: "prioridad" }, [1, 2, 3, 4, 5].map((n) => h("button", { "aria-pressed": String(a.priority === n), onclick: () => change({ priority: n }) }, n))),
    h("small", { class: "nota" }, "When spending gets close to the cap, low-priority agents are frozen first: at 80 % those with 1 and 2; at 90 %, everyone except those with 5.")));
  box.append(h("div", { class: "bloque" }, h("h4", {}, "Spending"),
    h("div", { class: "gastos3" }, ["today", "week", "month"].map((p) => h("div", {}, h("b", {}, ed.agentSpending(a, p) > 0 ? fmt(ed.agentSpending(a, p)) : "—"), h("small", {}, { today: "today", week: "7 days", month: "this month" }[p])))),
    brainless ? null : field("Own daily cap (USD)", h("input", { type: "number", min: "0", step: "0.05", value: a.dailyCap || "", placeholder: "no own cap", onchange: (ev) => change({ dailyCap: Math.max(0, parseFloat(ev.target.value) || 0) }) }), "If it goes over, it's frozen until tomorrow. The building's cap applies too (Spending)."),
    a.role === "controller" ? h("div", {}, h("button", { class: "btn mini", onclick: () => openDrawer("spending") }, "Building caps")) : null));
}
// Capabilities: each one, with its own model when it needs one
function profileCapabilities(box, a, change, { brainless }) {
  if (brainless || a.role === "jev") { box.append(h("div", { class: "bloque" }, h("p", { class: "nota", style: { margin: 0 } }, a.role === "jev" ? "JEV only decides: it doesn't use capabilities." : "Works with fixed rules: it doesn't use capabilities."))); return; }
  const aj = ed.e.settings, has = (id) => a.capabilities.includes(id);
  const mark = (id, yes) => Motor.run({ type: "editAgent", id: a.id, changes: { capabilities: yes ? [...new Set([...a.capabilities, id])] : a.capabilities.filter((x) => x !== id) } }).then(() => { render(); renderProfile(true); }).catch(warn);
  const fromBuilding = (id) => (id ? `The building's model (${modelName(id)})` : "The building's model (none chosen in Settings)");
  const extraFor = {
    create_images: () => [modelPicker("image", a.imageModel, { empty: fromBuilding(aj.imageModel), onChange: (v) => change({ imageModel: v }) }), proposalsFor("image")],
    create_music: () => [modelPicker("music", a.musicModel, { empty: fromBuilding(aj.musicModel), onChange: (v) => change({ musicModel: v }) }), h("small", { class: "nota" }, "Music and audio from OpenRouter (for example, Lyria). Paid per song."), proposalsFor("music")],
    speak: () => voicePicker(a, change),
    hear: () => [modelPicker("hearing", a.hearing, { empty: fromBuilding(aj.hearingModel === BROWSER ? "" : aj.hearingModel).replace("none chosen in Settings", "browser hearing"), extra: [[BROWSER, "Browser hearing · free (Chrome, Edge, Safari)"]], onChange: (v) => change({ hearing: v }) }), proposalsFor("hearing")],
    see: () => h("small", { class: "nota" }, aj.visionModel ? `If its brain can't see, ${modelName(aj.visionModel)} describes the images (Settings).` : "If its brain can't see, you need a brain with vision in Settings."),
    skills: () => skillsBlock(a, change)
  };
  const caps = h("div", { class: "caps" });
  for (const c of CAPABILITIES) {
    const avz = c.type === "advanced", marked = has(c.id) && !avz;
    caps.append(h("div", { class: "cap-bloque" + (marked ? " on" : "") },
      h("label", { class: "cap" + (avz ? " avz" : "") },
        h("input", { type: "checkbox", checked: marked || c.id === "write", disabled: avz || c.id === "write", onchange: (ev) => mark(c.id, ev.target.checked) }),
        h("span", {}, c.name, avz ? h("span", { class: "enchufe" }, "plug pending") : null, h("small", {}, avz ? `${tr(c.how)} ${tr("Needs:")} ${tr(c.requires)}` : c.how))),
      marked && extraFor[c.id] ? h("div", { class: "cap-modelo" }, extraFor[c.id]()) : null));
  }
  box.append(h("div", { class: "bloque" }, h("h4", {}, "Capabilities"), caps,
    h("small", { class: "nota" }, "The advanced ones are described but not connected: each needs one more piece and always your authorisation.")));
}
// ---------------- Other APIs: one from a subscription you already pay for, with your own key ----------------
const directModels = {};   // the list each API gives with your key (asked for when you press «Load the list»)
// Suggestions taken from OpenRouter's list (if that API is one of the known ones), the newest first (Claude writes versions with a hyphen: 5.5 → 5-5)
function directSuggestions(prov, a) {
  if (directModels[prov] && directModels[prov].length) return directModels[prov];
  const P = ed.provider(prov);
  if (!P || !P.orPrefix) return [];
  const ids = byType.text.filter((m) => m.id.startsWith(P.orPrefix) && !m.id.includes(":")).map((m) => m.id.slice(P.orPrefix.length));
  const nat = filterApiModels(prov, { data: ids.map((id) => ({ id: prov === "anthropic" ? id.replace(/(\d)\.(\d)/g, "$1-$2") : id })) });
  const cmp = (x, y) => { const p = modelVersion(x), q = modelVersion(y); for (let i = 0; i < Math.max(p.length, q.length); i++) { const d = (q[i] || 0) - (p[i] || 0); if (d) return d; } return 0; };
  const sage = a && a.role === "sage";
  const weight = (id) => (sage ? (/opus/.test(id) ? 0 : /sonnet/.test(id) ? 1 : 2) : 0) + (/(mini|nano|haiku|luna|lite)/.test(id) && sage ? 3 : 0);
  return [...new Set(nat)].sort((x, y) => weight(x) - weight(y) || cmp(x, y)).slice(0, 15);
}
async function loadDirectModels(prov) {
  let list = [];
  const P = ed.provider(prov) || { short: prov };
  if (mode === "home") {
    const r = await fetch("./api/models/" + prov, { headers: { "X-Fer-Pin": pin } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error || "Fer Home couldn't get the list."), { shown: true });
    list = d.models || [];
  } else {
    const key = store.get(apiKey(prov));
    if (!key && !P.noKey) throw Object.assign(new Error(`Your ${P.short} key is missing (Settings → Other APIs).`), { shown: true });
    const header = P.format === "anthropic" ? { "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" } : key ? { Authorization: "Bearer " + key } : {};
    let r; try { r = await fetch(P.api + "/models" + (P.format === "anthropic" ? "?limit=100" : ""), { headers: header }); }
    catch (err) { throw Object.assign(new Error(`Couldn't talk to ${P.short} from the browser (${err.message}). Some APIs don't allow calls from a website: then it works from Fer Home.`), { shown: true }); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(r.status === 401 || r.status === 403 ? `The ${P.short} key isn't valid.` : `${P.short} replied ${r.status}: ${(d.error && d.error.message) || ""}`), { shown: true });
    list = filterApiModels(prov, d);
  }
  directModels[prov] = list;
  return list;
}
function directPicker(prov, current, onChange) {
  const P = ed.provider(prov) || { short: prov };
  const sel = h("select", { onchange: (ev) => { if (ev.target.value === "__other") { other.hidden = false; other.focus(); return; } onChange(ev.target.value); } });
  const list = directSuggestions(prov);
  const fromCompany = !!(directModels[prov] && directModels[prov].length);
  if (list.length) sel.append(h("optgroup", { label: fromCompany ? tr(`${P.short} models (from your account)`) : tr("Suggested (from OpenRouter's list; check them with “Load the list”)") },
    list.map((id) => { const eq = ed.equivalentModel(prov, id); return h("option", { value: id }, id + (eq ? " · " + priceTxt(eq) : "")); })));
  sel.append(h("option", { value: "__other" }, "Other: type the exact name…"));
  if (current && !list.includes(current)) sel.prepend(h("option", { value: current }, current));
  sel.value = current || "";
  const other = h("input", { placeholder: "Exact model name (for example, claude-opus-5-5)", hidden: true, onchange: (ev) => { if (ev.target.value.trim()) onChange(ev.target.value.trim()); } });
  const msg = h("small", { class: "nota" });
  const load = h("button", { class: "btn mini", type: "button", onclick: async () => { load.disabled = true; msg.textContent = tr("Getting the list…"); try { const l = await loadDirectModels(prov); msg.textContent = tr(`${l.length} models in your account.`); renderProfile(true); } catch (err) { msg.textContent = err.shown ? err.message : err.message; load.disabled = false; } } }, `Load the list from ${P.short}`);
  return h("div", { class: "campo" }, h("span", {}, "Model"), sel, other, h("div", { class: "fila-c" }, load, msg));
}
// ---------------- Hands: the Fer Home skills this agent can use ----------------
const catalog = () => (mode === "home" ? homeSkills : ed.skillsCatalog());
function skillsBlock(a, change) {
  const cat = catalog();
  if (!cat.length) return h("small", { class: "nota" }, mode === "home" ? "Fer Home has no skills yet (“skills” folder next to fer-casa.mjs)." :
    "Hands work with Fer Home running on your computer: the agents' Chrome, their folder on the Mac and the skills. On this website, without Fer Home, they do nothing. How to set it up: README in the ZIP.");
  const has = (n) => a.skills.includes(n);
  const list = h("div", { class: "skills-lista" }, cat.map((k) => h("label", { class: "cap" },
    h("input", { type: "checkbox", checked: has(k.name), onchange: (ev) => change({ skills: ev.target.checked ? [...new Set([...a.skills, k.name])] : a.skills.filter((x) => x !== k.name) }) }),
    h("span", {}, k.title || k.name, k.effect === "external" ? h("span", { class: "enchufe" }, "asks for your permission") : null, h("small", {}, k.description)))));
  const fixed = a.fixedSkill && a.fixedSkill.skill;
  const selFixed = h("select", { onchange: (ev) => { const n = ev.target.value; const k = cat.find((x) => x.name === n); change({ fixedSkill: n ? { skill: n, settings: defaultValues(k) } : null, skills: n ? [...new Set([...a.skills, n])] : a.skills }); } },
    h("option", { value: "" }, "None: it works with its brain"), cat.filter((k) => k.fixed !== false).map((k) => h("option", { value: k.name }, k.title || k.name)));
  selFixed.value = fixed || "";
  const out = [list, field("On every heartbeat, without a brain (doesn't spend)", selFixed, "If you pick one, on every heartbeat it runs that skill and leaves what it finds in its chat. Example: the X Watcher every 10 minutes.")];
  const k = fixed && cat.find((x) => x.name === fixed);
  if (k && (k.settings || []).length) out.push(skillSettingsEditor(a, k, change));
  if (fixed && !k) out.push(h("small", { class: "nota" }, `Fer Home doesn't have the “${fixed}” skill right now.`));
  return out;
}
function defaultValues(k) { const o = {}; for (const x of (k && k.settings) || []) o[x.key] = x.default; return o; }
function skillSettingsEditor(a, k, change) {
  const val = Object.assign(defaultValues(k), (a.fixedSkill && a.fixedSkill.settings) || {});
  const save = (key, v) => { val[key] = v; change({ fixedSkill: { skill: k.name, settings: Object.assign({}, val) } }); };
  const box = h("div", { class: "ajustes-skill" }, h("b", {}, `Settings for ${k.title || k.name}`));
  for (const x of k.settings) {
    if (x.type === "list") {
      const ta = h("textarea", { rows: String(Math.min(12, Math.max(4, (val[x.key] || []).length + 1))), onchange: (ev) => save(x.key, ev.target.value.split("\n").map((l) => l.trim()).filter(Boolean)) });
      ta.value = (val[x.key] || []).join("\n");
      box.append(field(x.name, ta, x.help || "One per line."));
    } else if (x.type === "numero") {
      box.append(field(x.name, h("input", { type: "number", min: String(x.min ?? 0), step: "1", value: val[x.key] ?? "", onchange: (ev) => save(x.key, Number(ev.target.value) || x.default) }), x.help));
    } else if (x.type === "yes_no") {
      box.append(h("label", { class: "cap" }, h("input", { type: "checkbox", checked: !!val[x.key], onchange: (ev) => save(x.key, ev.target.checked) }), h("span", {}, x.name, x.help ? h("small", {}, x.help) : null)));
    } else box.append(field(x.name, h("input", { value: val[x.key] ?? "", onchange: (ev) => save(x.key, ev.target.value) }), x.help));
  }
  return box;
}
const modelName = (id) => (id === BROWSER ? "browser" : ((models.find((m) => m.id === id) || {}).name || id));
// An agent's voice: model and particular voice (if you don't choose, each agent has a different one)
function voicePicker(a, change) {
  const aj = ed.e.settings, own = a.voice || { model: "", voice: "" };
  const selM = modelPicker("voice", own.model, { empty: `The building's voice (${modelName(aj.voiceModel || BROWSER)})`, extra: [[BROWSER, "Browser voice · free"]] });
  const selV = h("select", {});
  const fill = () => {
    const model = selM.value || aj.voiceModel || BROWSER;
    const list = model === BROWSER ? browserVoices().map((v) => ({ id: v.voiceURI, name: `${v.name} · ${v.lang}` })) : ((voices.find((m) => m.id === model) || {}).voices || []);
    selV.replaceChildren(h("option", { value: "" }, `Different for each agent (now: ${voiceName(voiceOf(Object.assign({}, a, { voice: { model: selM.value, voice: "" } })))})`), ...list.map((v) => h("option", { value: v.id }, v.name)));
    selV.value = [...selV.options].some((o) => o.value === own.voice) ? own.voice : "";
  };
  fill();
  selM.onchange = () => { own.voice = ""; fill(); change({ voice: { model: selM.value, voice: "" } }); };
  selV.onchange = () => change({ voice: { model: selM.value, voice: selV.value } });
  const meta = h("span", { class: "nota" });
  return [field("Voice model", selM), field("Its voice", selV), proposalsFor("voice"),
    h("div", { class: "fila-c" }, h("button", { class: "btn mini", type: "button", onclick: () => { unlockAudio(); speakText(tr(`Hi, I'm ${a.name}. This is how I sound.`), meta, a); } }, "Try its voice"), meta)];
}
function confirm(button, text, action) {
  if (button.dataset.armed) { action(); return; }
  const before = button.textContent; button.dataset.armed = "1"; button.textContent = tr(text);
  setTimeout(() => { if (button.isConnected) { delete button.dataset.armed; button.textContent = before; } }, 4000);
}

// ---------------- Activity: everything, and the questions to JEV ----------------
const DECISION_NAME = { go_ahead: "go ahead", reuse: "reuse what's already there", stop: "stop", ask_boss: "ask the boss" };
function renderLog() {
  $("actTodo").setAttribute("aria-selected", String(activityView === "all")); $("actJev").setAttribute("aria-selected", String(activityView === "jev"));
  const r = $("registro"); r.innerHTML = "";
  if (activityView === "jev") {
    const rows = (ed.e.jevQueries || []).slice().reverse().slice(0, 150);
    if (!rows.length) { r.append(h("p", { class: "nota" }, "Every question to JEV shows up here: the time, the agent, what it was going to do, what JEV said, what it did in the end, what it cost and whether it helped.")); return; }
    for (const c of rows) {
      const prob = c.probabilities ? Object.entries(c.probabilities).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${tr(DECISION_NAME[k] || k)} ${Math.round(v * 100)} %`).join(" · ") : "";
      const helped = (v, t) => h("button", { class: "btn mini", "aria-pressed": String(c.helped === v), onclick: () => Motor.run({ type: "jev.helped", query: c.id, helped: c.helped === v ? null : v }).then(renderLog).catch(warn) }, t);
      r.append(h("div", { class: "item jev-consulta" },
        h("div", { class: "jev-fila" }, h("span", { class: "hora" }, date(c.ts)), h("span", {}, h("b", {}, c.name), ": ", c.action), h("span", { class: "coste" }, (c.jevCost || 0) + (c.cost || 0) > 0 ? fmt((c.jevCost || 0) + (c.cost || 0)) : "")),
        h("div", { class: "jev-fila" }, h("span", {}, "JEV:"), h("span", {}, h("span", { class: "dec " + (c.decision || "") }, c.decision ? tr(DECISION_NAME[c.decision] || c.decision) : "no answer"), prob ? h("small", { class: "nota" }, " · " + prob) : null, c.text && !c.decision ? h("small", { class: "nota" }, " · " + c.text) : null), h("span", {})),
        h("div", { class: "jev-fila" }, h("span", {}, "Did:"), h("span", {}, c.did || tr(DECISION_NAME[c.final] || c.final || "—")), h("span", { class: "fila-c" }, h("small", { class: "nota" }, "Did it help?"), helped(true, "Yes"), helped(false, "No")))));
    }
    return;
  }
  const rows = ed.e.log.slice().reverse().slice(0, 150);
  if (!rows.length) { r.append(h("p", { class: "nota" }, "Everything the agents do will show up here: heartbeats, tasks, questions to JEV, coins, meetings, Memory searches and spending.")); return; }
  for (const x of rows) r.append(h("div", { class: "item" }, h("span", { class: "hora" }, date(x.ts)),
    h("span", {}, h("b", {}, x.name + " "), x.text), h("span", { class: "coste" }, x.cost ? fmt(x.cost) : "")));
}

// =====================================================================
// Chat with each agent, full screen
// =====================================================================
let fullNotice = false;
let pendingErrors = [], thinking = false, sessionImages = new Map(), sessionAudios = new Map(), attachment = null, lastChat = "";
const chatAgent = () => (chatId && ed.exactAgent(chatId)) || ed.boss();
function openChat(id) {
  const a = ed.exactAgent(id) || ed.boss(); if (!a) return;
  if (chatId && chatId !== a.id) { if (conv.on) hangUp(); stopAudio(); pendingErrors = []; removeAttachment(); $("texto").value = ""; grow(); }
  chatId = a.id; screen = "";
  $("vistaMes").hidden = true; $("vistaSalas").hidden = true; $("vistaChat").hidden = false;
  document.body.classList.add("con-pantalla");
  renderAccent(); renderChatHeader(); renderChat(true); microUI();
  setTimeout(() => { if (!$("texto").disabled) $("texto").focus(); }, 30);
  markNav();
}
function closeChat() {
  if (conv.on) hangUp(); stopAudio();
  chatId = ""; pendingErrors = []; $("vistaChat").hidden = true; if (!screen) document.body.classList.remove("con-pantalla");
  renderAccent(); render(); replaceNav();
}
// The first message is a greeting from the agent (not saved or paid for); if the key is missing, it comes afterwards, calmly.
function greetingOf(a) {
  const pl = ed.e.floors.find((p) => p.id === a.floor), bldg = ed.e.name || "your building";
  if (a.role === "boss") {
    const who = /^(jefe|boss)$/i.test(withoutAccents(a.name.trim())) ? tr(`the boss of ${bldg}`) : tr(`${a.name}, the boss of ${bldg}`);
    if (ed.e.agents.length === 1) return `Hi, I'm ${who}. Tell me what you need. Right now I work alone: if you want a team, have a look at “Built-in agents” or ask me for a new agent.`;
    return `Hi, I'm ${who}. Tell me what you need and I'll share it out among the team. If you want a new agent or to bring several together in the meeting room, just ask.`;
  }
  if (!converses(a)) return a.role === "jev" ? `I'm ${a.name}. I only decide before spending: go ahead, reuse what's already there, stop or ask the boss. I don't chat; my decisions are in Activity → Questions to JEV.`
    : `I'm ${a.name}. I work with fixed rules, without a brain, so I don't chat. My profile shows what I do.`;
  const what = WHAT_IT_DOES[a.role] ? tr(WHAT_IT_DOES[a.role]) : a.objective ? tr("My objective:") + " " + a.objective : tr("Ask me about my work or give me a job.");
  return tr(`Hi, I'm ${a.name}, ${roleTxt(a).toLowerCase()} (${pl ? pl.name : tr(bldg)}).`) + " " + what;
}
const whoProposes = (x) => (x === "jev" ? "JEV" : x === "controller" ? tr("the Controller") : x === "boss" ? tr("the boss") : x);
function renderChat(force) {
  if (!chatId) return;
  namesUpToDate();
  const a = chatAgent(); if (!a) return;
  const conv = ed.chatOf(a);
  const signature = [a.id, conv.length, (conv.at(-1) || {}).ts, thinking, pendingErrors.length, hasAccess(), (ed.e.proposals || []).map((y) => y.state[0]).join(""), (ed.e.meetings || []).map((r) => r.state[0]).join(""), a.name, a.capabilities.join()].join("|");
  if (!force && signature === lastChat) return;
  lastChat = signature;
  const m = $("mensajes"); m.innerHTML = "";
  m.append(h("div", { class: "msg bot saludo" }, h("div", { class: "burbuja" }, greetingOf(a))));
  if (converses(a) && !hasAccess()) m.append(h("div", { class: "msg bot saludo" }, h("div", { class: "burbuja" },
    h("p", {}, isApp() ? "So I can answer you, paste your OpenRouter key in Settings. It stays only on this computer." : mode === "home" ? "So I can reply, enter in Settings the PIN you set when you started Fer Home." : "So I can reply, paste your OpenRouter key in Settings. It stays only in this browser."),
    h("button", { class: "btn mini", onclick: () => openDrawer("settings") }, "Open Settings"))));
  const speaks = a.capabilities.includes("speak");
  for (const x of conv) {
    if (x.role === "user") m.append(h("div", { class: "msg me" }, h("div", { class: "burbuja" }, raw(x.content)), x.voice ? h("div", { class: "meta" }, x.voice) : null));
    else if (x.role === "assistant") {
      const meta = h("div", { class: "meta" }, h("span", {}, x.provider ? tr(`${x.model || ""} · ${((ed.provider(x.provider) || {}).short) || x.provider}: your subscription`) + (x.subscription ? ` (≈${fmt(x.subscription)})` : "") : `${x.model || ""} · ${fmt(x.cost || 0)}`),
        speaks ? h("button", { onclick: (ev) => { unlockAudio(); speakText(x.content, ev.target.parentElement, a); } }, "▶ Listen") : null,
        h("span", { class: "monedas-msg" }, coinButton(a, "gold"), coinButton(a, "red")));
      m.append(h("div", { class: "msg bot" }, h("div", { class: "burbuja", html: markdown(x.content) }, media(x)),
        (x.events || []).length ? h("div", { class: "chips" }, x.events.map((e) => h("span", { class: "chip" }, e))) : null,
        x.meeting ? meetingCard(x.meeting) : null, meta));
    } else if (x.role === "report") {
      const author = ed.exactAgent(x.agent);
      const pr = x.proposal && (ed.e.proposals || []).find((y) => y.id === x.proposal);
      const buttons = pr ? (pr.state === "pending" ? h("div", { class: "fila-c propuesta" },
        h("button", { class: "btn primario mini", onclick: () => Motor.run({ type: "acceptProposal", proposal: pr.id }).then((r) => { const n = ed.exactAgent(r.id); if (n) { selection = n.id; profileTab = "identity"; } render(); renderChat(true); }).catch(warn) }, tr(`Create ${pr.profile.name || tr("this agent")}`)),
        h("button", { class: "btn mini", onclick: () => openDrawer("agent", { profile: Object.assign({}, pr.profile, { floor: pr.profile.floor || "new", newFloor: pr.profile.newFloor || { name: "", job: "" } }), proposal: pr.id }) }, "See it and tweak it"),
        h("button", { class: "btn mini", onclick: () => Motor.run({ type: "discardProposal", proposal: pr.id }).then(() => renderChat(true)).catch(warn) }, "Dismiss"))
        : h("div", { class: "meta" }, pr.state === "created" ? "Created." : "Dismissed.")) : null;
      m.append(h("div", { class: "msg informe" }, h("span", { class: "quien" }, tr(`Report from ${x.name}`)), h("div", { class: "burbuja", html: markdown(x.content) }, media(x)), buttons,
        x.meeting ? h("div", { class: "meta" }, h("button", { onclick: () => openMeetingRooms(x.meeting) }, "See the meeting")) : null,
        author && author.role !== "boss" && !x.meeting ? h("div", { class: "meta" }, h("span", { class: "monedas-msg" }, coinButton(author, "gold"), coinButton(author, "red"))) : null));
    }
  }
  for (const e of pendingErrors) m.append(h("div", { class: "msg error" }, h("div", { class: "burbuja" }, e)));
  if (thinking) m.append(h("div", { class: "msg bot escribiendo" }, writing ? h("div", { class: "burbuja", html: markdown(writing) }) : h("div", { class: "burbuja" }, h("span", { class: "pensando", "aria-label": "Thinking" }, h("i"), h("i"), h("i")))));
  $("chat").scrollTop = $("chat").scrollHeight;
}
// Images and music: saved apart (in this browser, IndexedDB; in Fer Home, its «datos/medios» folder), so they aren't lost on reload
const mediaCache = new Map();
async function mediaUrl(m) {
  if (mediaCache.has(m.id)) return mediaCache.get(m.id);
  let url = "";
  if (mode === "local") { const x = await idb.get("media", m.id); url = (x && x.url) || ""; }
  else if (pin) { try { const r = await fetch("./api/media/" + encodeURIComponent(m.id), { headers: { "X-Fer-Pin": pin } }); if (r.ok) url = URL.createObjectURL(await r.blob()); } catch {} }
  if (url) mediaCache.set(m.id, url);
  return url;
}
function media(x) {
  if ((x.media || []).length) return x.media.map((m) => {
    const el = m.type === "audio" ? h("audio", { controls: true, preload: "none" }) : h("img", { alt: m.text || "Image created" });
    const already = mediaCache.get(m.id) || (m.type === "audio" ? sessionAudios : sessionImages).get(m.text);
    if (already) el.src = already;
    else mediaUrl(m).then((u) => { if (u) el.src = u; else if (el.isConnected) el.replaceWith(h("small", { class: "nota" }, m.type === "audio" ? "(the music isn't on this device)" : "(the image isn't on this device)")); });
    return el;
  });
  // from version 6: only this session's
  return [...(x.images || []).map((t) => sessionImages.get(t)).filter(Boolean).map((u) => h("img", { src: u, alt: "Image created" })),
    ...(x.audios || []).map((t) => sessionAudios.get(t)).filter(Boolean).map((u) => h("audio", { src: u, controls: true, preload: "none" }))];
}
// A meeting the boss proposes: it doesn't start until you confirm the rounds
function meetingCard(id) {
  const r = (ed.e.meetings || []).find((x) => x.id === id); if (!r) return null;
  const names = r.participants.map((pid) => (ed.exactAgent(pid) || {}).name).filter(Boolean).join(", ");
  if (r.state !== "proposed") return h("div", { class: "tarjeta-reunion" }, h("b", {}, `Meeting “${r.title}”`), h("span", { class: "nota" }, `${MEETING_STATUS[r.state] || r.state} · ${names}`), h("div", {}, h("button", { class: "btn mini", onclick: () => openMeetingRooms(r.id) }, "See it in the room")));
  const rounds = h("input", { type: "number", min: "1", step: "1", value: r.rounds });
  const est = h("span", { class: "nota" });
  const calc = () => { const e = ed.estimateMeeting(Object.assign({}, r, { rounds: Math.max(1, parseInt(rounds.value, 10) || 1) })); est.textContent = tr(`Estimated cost: ≈${fmt(e.cost)} (${e.calls} calls)`); };
  rounds.oninput = calc; calc();
  return h("div", { class: "tarjeta-reunion" }, h("b", {}, `The boss proposes the meeting “${r.title}”`), h("span", { class: "nota" }, `At the table: ${names}`),
    h("div", { class: "orden" }, raw(r.agenda)),
    h("div", { class: "fila-c" }, h("span", {}, "Rounds"), rounds, est),
    h("div", { class: "fila-c" }, h("button", { class: "btn primario mini", onclick: () => startMeeting(r.id, parseInt(rounds.value, 10) || r.rounds) }, "Start the meeting"),
      h("button", { class: "btn mini", onclick: () => Motor.run({ type: "meeting.cancel", meeting: r.id }).then(() => { render(); renderChat(true); }).catch(warn) }, "Don't hold it")));
}
const CHAT_STATES = { idle: "Ready to talk", loading: "Getting the hearing ready…", listening: "I'm listening. Speak whenever you like", hearing: "I can hear you…", transcribing: "Understanding what you said…", thinking: "Thinking…", speaking: "Talking. Press “Stop” or speak to cut it off" };
let bossState = "idle";
function setBossState(s) { bossState = s; renderChatHeader(); }
function renderChatHeader() {
  if (!chatId) return;
  const a = chatAgent(); if (!a) return;
  const pl = ed.e.floors.find((p) => p.id === a.floor), est = visibleState(a);
  $("jefeNombre").textContent = a.name;
  $("jefeRol").textContent = `${roleTxt(a)}${pl ? " · " + pl.name : ""}`;
  $("jefeEstado").textContent = tr(est === "frozen" || est === "off" ? `${STATUS_TXT[est]}${a.statusReason ? " · " + a.statusReason : ""}`
    : bossState === "thinking" && a.role === "boss" ? "Thinking and sharing out the work…" : CHAT_STATES[bossState]);
  $("jefeCab").classList.toggle("hablando", bossState === "speaking");
  $("pararVoz").hidden = bossState !== "speaking";
  const avatar = $("avatar");
  if (avatar.dataset.who !== a.id) { avatar.dataset.who = a.id; avatar.src = figure(a.look); }   // the small figure at once; right after, the big one
  ensureBigFigure(a.look).then((u) => { if (avatar.dataset.who === a.id && avatar.getAttribute("src") !== u) avatar.src = u; });
  // what can be done in this chat
  const speaks = converses(a), hears = speaks && a.capabilities.includes("hear"), talks = speaks && a.capabilities.includes("speak"), sees = speaks && a.capabilities.includes("see");
  $("texto").disabled = !speaks; $("enviar").disabled = !speaks;
  $("texto").placeholder = tr(speaks ? `Write to ${a.name}…` : `${a.name} doesn't chat`);
  $("micro").disabled = !hears; $("clip").disabled = !sees; $("altavoz").disabled = !talks;
  if (!hears) $("micro").title = tr(speaks ? `${a.name} doesn't have the “Hear” capability. Turn it on in its profile.` : "Doesn't chat");
  if (!sees) $("clip").title = tr(speaks ? `${a.name} doesn't have the “See images” capability.` : "Doesn't chat"); else $("clip").title = tr("Attach an image for it to see");
  $("altavoz").title = tr(talks ? "Read the replies out loud" : `${a.name} doesn't have the “Speak” capability.`);
  $("verFichaChat").hidden = false;
}
async function send(voiceText, voice) {
  const text = typeof voiceText === "string" ? voiceText : $("texto").value.trim();
  const a = chatAgent();
  if ((!text && !attachment) || thinking || !converses(a)) return;
  if (!hasAccess()) { openDrawer("settings"); return; }
  const own = conv.on && !conv.processing;
  if (own) { conv.processing = true; await pauseHearing(); }
  pendingErrors = [];
  thinking = true; stopAudio(); setBossState("thinking");
  const image = attachment; if (!voice) { $("texto").value = ""; grow(); } removeAttachment();
  writing = ""; renderChat(true);
  // Does it answer out loud? Then short answers and the voice sentence by sentence while it writes
  const inVoice = a.capabilities.includes("speak") && (voice ? (ed.e.settings.answerByVoiceIfMic !== false) || speakerOn() : speakerOn());
  let voiceEnd = null, inParts = false;
  const onChunk = (t, all) => {
    inParts = true;
    if (inVoice && chatId === a.id) {
      if (!voiceEnd) { voiceEnd = voiceStart(null, a); if (conv.on) resumeHearing(); }   // it's speaking now: the mic listens again, so you can interrupt by talking
      voiceChunk(t);
    }
    writing = all; renderDraft();
  };
  try {
    const voiceTxt = voice ? (voice.seconds ? `by voice · ${voice.seconds.toLocaleString(LOCALE, { maximumFractionDigits: 1 })} s · ${voice.model} · ${voice.estimated ? "≈" : ""}${fmt(voice.cost)}` : `by voice · ${voice.model} · free`) : "";
    const r = await Motor.run({ type: "speak", agent: a.id, text, image, voice: voiceTxt, inVoice: inVoice || !!voice, onChunk });
    for (const im of r.images || []) { sessionImages.set(im.text, im.url); if (im.id) mediaCache.set(im.id, im.url); }
    for (const au of r.audios || []) { sessionAudios.set(au.text, au.url); if (au.id) mediaCache.set(au.id, au.url); }
    thinking = false; writing = ""; setBossState(conv.on ? "listening" : "idle"); render(); renderChat(true);
    const goals = $("mensajes").querySelectorAll(".msg.bot .meta"), meta = goals[goals.length - 1];
    if (inVoice && r.reply && chatId === a.id) {
      if (voiceEnd && inParts) { queue.meta = meta; voiceEndNow(); }   // it was already speaking while writing
      else voiceEnd = speakText(r.reply, meta, a);           // if it arrived whole (for example, with an image), it's read sentence by sentence
    } else if (voiceEnd) stopAudio();
  } catch (err) {
    thinking = false; writing = ""; if (voiceEnd) stopAudio(); setBossState(conv.on ? "listening" : "idle");
    pendingErrors.push(err.shown ? err.message : `No connection: ${err.message}`); renderChat(true);
  }
  // hearing comes back at once (even if it's still speaking): if you talk, it goes quiet
  if (own) { conv.processing = false; await resumeHearing(); if (bossState !== "speaking" && conv.on) setBossState("listening"); }
  if (!voice && chatId) $("texto").focus();
}
// What the agent is writing, live (only in this browser; Fer Home sends the whole reply)
let writing = "";
function renderDraft() {
  const el = $("mensajes").querySelector(".msg.bot.escribiendo .burbuja");
  if (el) { el.innerHTML = markdown(writing); $("chat").scrollTop = $("chat").scrollHeight; }
}
function grow() { const t = $("texto"); t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 160) + "px"; }
function removeAttachment() { attachment = null; $("adjunto").hidden = true; }
const speakerOn = () => $("altavoz").getAttribute("aria-pressed") === "true";

// =====================================================================
// Voice (mouth) — each agent with its model and its voice; OpenRouter or the browser
// =====================================================================
const player = new Audio(); player.preload = "auto";
let audioReady = false, endSpeaking = null, voiceTurn = 0;
const SILENCE = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
function unlockAudio() { if (audioReady) return; audioReady = true; try { player.src = SILENCE; const p = player.play(); if (p && p.catch) p.catch(() => {}); } catch {} }
let voiceEndTs = 0;   // when the agent stopped speaking (for the echo filter)
function endVoice() { const f = endSpeaking; endSpeaking = null; voiceEndTs = Date.now(); if (bossState === "speaking") setBossState(conv.on ? "listening" : "idle"); if (f) f(); }
function stopAudio() { voiceTurn++; queue.sentences = []; queue.playing = false; queue.closed = true; try { player.pause(); } catch {} try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch {} endVoice(); }
// (each sentence signals when it ends; the voice ends when there are no sentences left)
function note(metaEl, t) { if (!metaEl) return; let n = metaEl.querySelector(".nota-voz"); if (!n) { n = h("span", { class: "nota-voz" }); metaEl.append(n); } n.textContent = tr(t); }
function pcmAWav(buf, rate = 24000) {
  const pcm = new Uint8Array(buf), head = new ArrayBuffer(44), v = new DataView(head);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + pcm.length, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, pcm.length, true);
  return new Blob([head, pcm], { type: "audio/wav" });
}
function estimateVoice(pr, chars, secs) { const a = n0(pr.prompt), b = n0(pr.completion); if (a && !b) return a * chars; if (!a && b) return b * secs; if (a && b) return a * Math.ceil(chars / 4) + b * secs * 32; return 0; }
async function voiceCost(model, chars, secs, genId, metaEl, who) {
  let real = null;
  if (genId) for (const w of [1500, 3000, 6000]) {
    await sleep(w);
    try { const r = await fetch(apiBase() + "/generation?id=" + encodeURIComponent(genId), { headers: apiCab() }); if (r.ok) { const d = (await r.json()).data || {}; if (typeof d.total_cost === "number") { real = d.total_cost; break; } } } catch {}
  }
  const m = voices.find((x) => x.id === model);
  const cost = real !== null ? real : (m ? estimateVoice(m.pricing, chars, secs) : 0);
  try { await Motor.run({ type: "externalSpending", id: who || "boss", cost, estimated: real === null, concept: "voz " + model }); } catch {}
  if (queue.meta === metaEl) { queue.chars += chars; queue.cost += cost; queue.estimated = queue.estimated || real === null; chars = queue.chars; }
  const total = queue.meta === metaEl ? queue.cost : cost, est = queue.meta === metaEl ? queue.estimated : real === null;
  note(metaEl, tr("voice:") + " " + model + " · " + tr(`${chars} characters`) + " · " + (est ? "≈" : "") + fmt(total) + (est ? " " + tr("(estimated)") : ""));
  render();
}
function browserVoices() { try { return window.speechSynthesis ? speechSynthesis.getVoices() : []; } catch { return []; } }
// If an agent has no voice chosen, it's given a different one from the model's (always the same for that agent).
const hashTxt = (t) => { let x = 0; for (const c of String(t)) x = (x * 31 + c.charCodeAt(0)) >>> 0; return x; };
function voiceOf(a) {
  const aj = ed.e.settings, ownOne = (a && a.voice) || {};
  const model = ownOne.model || aj.voiceModel || BROWSER;
  if (ownOne.voice) return { model, voice: ownOne.voice };
  if (a && a.role === "boss" && !ownOne.model) return { model, voice: aj.specificVoice || "" };   // the boss keeps the voice from Settings
  const language = voiceLanguage().slice(0, 2);
  const list = model === BROWSER ? browserVoices().filter((v) => (v.lang || "").slice(0, 2) === language).map((v) => v.voiceURI) : ((voices.find((m) => m.id === model) || {}).voices || []).map((v) => v.id);
  if (!list.length) return { model, voice: "" };
  const fromBoss = model === (aj.voiceModel || BROWSER) ? aj.specificVoice : "";
  let i = hashTxt(a ? a.id : "") % list.length;
  if (list.length > 1 && list[i] === fromBoss) i = (i + 1) % list.length;   // so it doesn't sound the same as the boss
  return { model, voice: list[i] };
}
function voiceName(v) {
  if (!v.voice) return v.model === BROWSER ? "automatic" : "the model's";
  if (v.model === BROWSER) { const x = browserVoices().find((y) => y.voiceURI === v.voice); return x ? x.name : v.voice; }
  const x = ((voices.find((m) => m.id === v.model) || {}).voices || []).find((y) => y.id === v.voice); return x ? x.name : v.voice;
}
// ---------------- Voice, sentence by sentence ----------------
// While the agent writes, each finished sentence becomes voice; while one plays, the next is prepared.
const queue = { turn: -1, sentences: [], rest: "", closed: true, playing: false, meta: null, a: null, model: "", voice: "", chars: 0, cost: 0, estimated: false, said: "", prep: null };
function splitSentences(t, final) {
  const out = []; let r = String(t || "");
  const cut = () => { const m = r.match(/^[\s\S]*?(?:[.!?…]+["»”')\]]*\s+|\n+)/); if (!m) return null; r = r.slice(m[0].length); return m[0]; };
  for (;;) {
    let f = cut(); if (f === null) break;
    while (forVoice(f).length < 40) { const g = cut(); if (g === null) break; f += g; }   // very short sentences go with the next one
    if (forVoice(f).length < 40 && !final && !out.length) { r = f + r; break; }
    if (forVoice(f)) out.push(f);
  }
  if (final && forVoice(r)) { out.push(r); r = ""; }
  return [out, r];
}
function voiceStart(metaEl, agent) {
  stopAudio();
  const a = agent || chatAgent(), v = voiceOf(a);
  Object.assign(queue, { turn: ++voiceTurn, sentences: [], rest: "", closed: false, playing: false, meta: metaEl, a, model: v.model, voice: v.voice, chars: 0, cost: 0, estimated: false, said: "", prep: null });
  return new Promise((r) => { endSpeaking = r; });
}
function voiceChunk(t) { if (queue.turn !== voiceTurn || queue.closed) return; const [fs, r] = splitSentences(queue.rest + t, false); queue.rest = r; queue.sentences.push(...fs); nextSentence(); }
function voiceEndNow() { if (queue.turn !== voiceTurn || queue.closed) return; const [fs] = splitSentences(queue.rest, true); queue.rest = ""; queue.sentences.push(...fs); queue.closed = true; nextSentence(); }
function speakText(text, metaEl, agent) { const end = voiceStart(metaEl, agent); voiceChunk(text); voiceEndNow(); return end; }
async function askVoice(clean, model, voice) {   // OpenRouter: text → audio (mp3; if the model doesn't give it, pcm)
  const ask = (format) => { const b = { model: model, input: clean, response_format: format }; if (voice) b.voice = voice; return fetch(apiBase() + "/audio/speech", { method: "POST", headers: Object.assign(apiCab(true), { "X-Title": "Fer Agent" }), body: JSON.stringify(b) }); };
  let format = "mp3", r = await ask(format);
  if (r.status === 400) { const r2 = await ask("pcm"); if (r2.ok) { r = r2; format = "pcm"; } }
  if (!r.ok) { let det = ""; try { det = ((await r.json()).error || {}).message || ""; } catch {} throw new Error(`The voice failed (${r.status}${det ? ": " + det : ""}). Try another one in its profile → Capabilities.`); }
  const genId = r.headers.get("X-Generation-Id"), buf = await r.arrayBuffer();
  return { url: URL.createObjectURL(format === "pcm" ? pcmAWav(buf) : new Blob([buf], { type: "audio/mpeg" })), format, genId, secs: format === "pcm" ? buf.byteLength / 48000 : clean.length / 15, chars: clean.length };
}
function nextSentence() {
  const turn = queue.turn;
  if (turn !== voiceTurn || queue.playing) return;
  if (!queue.sentences.length) { if (queue.closed) endVoice(); return; }
  if (queue.model !== BROWSER && ed.budgetUsage() >= 1) { note(queue.meta, "Spending cap reached: I won't read out loud."); queue.sentences = []; endVoice(); return; }
  const sentence = queue.sentences.shift(), clean = forVoice(sentence);
  queue.playing = true; queue.said += " " + clean;
  const go_ahead = () => { if (turn !== voiceTurn) return; queue.playing = false; nextSentence(); };
  if (queue.model === BROWSER) {
    if (!window.speechSynthesis) { note(queue.meta, "This browser has no voice."); queue.sentences = []; endVoice(); return; }
    const u = new SpeechSynthesisUtterance(clean), v = browserVoices().find((x) => x.voiceURI === queue.voice);
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = voiceLanguage();
    u.onend = u.onerror = go_ahead;
    setBossState("speaking"); speechSynthesis.speak(u); note(queue.meta, "browser voice · free");
    return;
  }
  (async () => {
    try {
      const prep = queue.prep && queue.prep.text === sentence ? queue.prep.p : askVoice(clean, queue.model, queue.voice);
      queue.prep = null;
      if (queue.chars === 0) note(queue.meta, "getting the voice ready…");
      const x = await prep;
      if (turn !== voiceTurn) return;
      if (queue.sentences.length) { const sig = queue.sentences[0]; queue.prep = { text: sig, p: askVoice(forVoice(sig), queue.model, queue.voice) }; queue.prep.p.catch(() => {}); }   // the next one, while this one plays
      player.src = x.url;
      setBossState("speaking");
      await player.play();
      let secs = x.secs;
      if (x.format !== "pcm") { await Promise.race([new Promise((res) => (player.readyState >= 1 ? res() : player.addEventListener("loadedmetadata", res, { once: true }))), sleep(2500)]); if (isFinite(player.duration) && player.duration > 0) secs = player.duration; }
      voiceCost(queue.model, x.chars, secs, x.genId, queue.meta, queue.a && queue.a.id);
      await new Promise((res) => { const end = () => { player.removeEventListener("ended", end); player.removeEventListener("error", end); res(); }; player.addEventListener("ended", end); player.addEventListener("error", end); });
      go_ahead();
    } catch (err) { if (turn !== voiceTurn) return; note(queue.meta, err.message || "The voice couldn't be played."); queue.sentences = []; endVoice(); }
  })();
}
// Is what the mic heard its own voice coming out of the speaker? (echo): then it isn't sent
// Was what the mic heard the agent's own voice through the speaker? It can only be if it started while the agent was speaking
// (or right at the end). If it's short, it has to be a continuous piece of what it said; if it's long, almost everything it said.
function isEcho(text, beginning) {
  if (!endSpeaking && beginning > voiceEndTs + 800) return false;   // you started talking when it had already gone quiet: it's you
  const w = (t) => withoutAccents(t).replace(/[^a-z0-9ñ ]/g, " ").split(/\s+/).filter((x) => x.length > 2);
  const heard = w(text), spokenL = w(queue.said), spoken = new Set(spokenL);
  if (heard.length < 2 || !spoken.size) return false;
  if (heard.length < 4) return (" " + spokenL.join(" ") + " ").includes(" " + heard.join(" ") + " ");
  return heard.filter((x) => spoken.has(x)).length / heard.length >= 0.7;
}

// =====================================================================
// Hearing: conversation mode (Silero detector + Whisper, or the browser's hearing). Each agent, with its own hearing.
// =====================================================================
const conv = { on: false, vad: null, rec: null, processing: false };
function loadScript(src, seal) {
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.async = true; if (seal) { s.integrity = seal; s.crossOrigin = "anonymous"; } s.onload = res; s.onerror = () => rej(new Error(`couldn't download ${src.split("/npm/")[1]}`)); document.head.append(s); });
}
async function ensureVAD() {
  if (window.vad && window.vad.MicVAD) return;
  if (!window.ort) await loadScript(ORT_BASE + "ort.wasm.min.js", SEALS["ort.wasm.min.js"]);
  await loadScript(VAD_BASE + "bundle.min.js", SEALS["bundle.min.js"]);
  if (!window.vad || !window.vad.MicVAD) throw new Error("the voice detector didn't start");
}
function aWav(m, rate = 16000) {
  const buf = new ArrayBuffer(44 + m.length * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + m.length * 2, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, m.length * 2, true);
  for (let i = 0; i < m.length; i++) { const s = Math.max(-1, Math.min(1, m[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Blob([buf], { type: "audio/wav" });
}
const hearingOf = (a) => (a && a.hearing) || ed.e.settings.hearingModel || BROWSER;
async function transcribe(swatches) {
  if (ed.budgetUsage() >= 1) throw Object.assign(new Error("Spending cap reached: the paid hearing is stopped. Raise the cap in Spending or use the browser's hearing."), { shown: true });
  const a = chatAgent(), model = hearingOf(a), secs = swatches.length / 16000;
  const fd = new FormData(); fd.append("model", model); fd.append("file", aWav(swatches), "voz.wav");
  const r = await fetch(apiBase() + "/audio/transcriptions", { method: "POST", headers: Object.assign(apiCab(), { "X-Title": "Fer Agent" }), body: fd });
  let d = null; try { d = await r.json(); } catch {}
  if (!r.ok) throw Object.assign(new Error(explainError(r.status, (d && d.error && d.error.message) || "")), { shown: true });
  const u = (d && d.usage) || {};
  let cost = typeof u.cost === "number" ? u.cost : null, estimated = false;
  if (cost === null) { const m = hearings.find((x) => x.id === model); cost = m ? hearingPricePerSecond(m) * secs : 0; estimated = true; }
  try { await Motor.run({ type: "externalSpending", id: a.id, cost: cost, estimated: estimated, concept: tr("hearing") + " " + model }); } catch {}
  return { text: ((d && d.text) || "").trim(), cost, estimated, seconds: u.seconds || secs, model: model };
}
function microUI() {
  const a = chatId ? chatAgent() : null;
  $("micro").setAttribute("aria-pressed", String(conv.on));
  if (!$("micro").disabled) $("micro").title = tr(conv.on ? "Hang up (end the voice conversation)" : `Talk to ${a ? a.name : "the agent"} through the mic (conversation mode)`);
  $("pista").textContent = conv.on ? tr("Voice conversation: speak and pause; it sends on its own. Tap the mic to hang up.") : "";
}
async function pauseHearing() { try { if (conv.vad) await conv.vad.pause(); } catch {} try { if (conv.rec) conv.rec.abort(); } catch {} }
async function resumeHearing() { if (!conv.on) return; try { if (conv.vad) await conv.vad.start(); } catch {} try { if (conv.rec) conv.rec.start(); } catch {} if (bossState !== "speaking") setBossState("listening"); }
async function hearing(input, givenStart) {
  if (!conv.on) return;
  // when what was heard started sounding (the detector gives the audio at 16 kHz; the browser's hearing, only the text: 1.5 s is assumed)
  const beginning = givenStart || Date.now() - (typeof input === "string" ? 1500 : (input.length / 16000) * 1000);
  if (conv.processing) { conv.nextOne = { input, beginning }; return; }   // you talked to it while it was answering: it goes right after
  conv.processing = true;
  await pauseHearing();
  try {
    let text = input, voice = { model: "browser hearing", cost: 0, estimated: false, seconds: null };
    if (typeof input !== "string") { setBossState("transcribing"); voice = await transcribe(input); text = voice.text; }
    if (text && isEcho(text, beginning)) { text = ""; }   // it was its own voice through the speaker: it isn't sent
    if (text && conv.on) await send(text, voice);
  } catch (err) { pendingErrors.push(err.shown ? err.message : `Couldn't understand the audio: ${err.message}`); renderChat(true); }
  finally {
    conv.processing = false; await resumeHearing();
    if (conv.nextOne && conv.on) { const s = conv.nextOne; conv.nextOne = null; hearing(s.input, s.beginning); }
  }
}
function errorMicro(err) {
  const n = (err && err.name) || "", raw = String((err && (err.message || err.error)) || err || "");
  const det = " (" + tr("technical detail:") + " " + [n, raw].filter(Boolean).join(": ") + ")";
  let inside = false; try { inside = window.top !== window.self; } catch { inside = true; }
  if (inside) return tr("You're using Fer Agent inside another window (a preview). There the browser doesn't allow the microphone. Open it in a normal tab.") + det;
  if (!window.isSecureContext || !navigator.mediaDevices) return tr("The microphone only works with a secure address (https://… or localhost). If you open Fer Home from another device on your home network, the mic isn't allowed: use the keyboard.") + det;
  if (n === "NotAllowedError" && /system/i.test(raw)) return tr("Your computer doesn't let the browser use the microphone. On a Mac: System Settings → Privacy & Security → Microphone → turn on your browser and open it again.") + det;
  if (n === "NotAllowedError" || n === "SecurityError" || /not-allowed|permission|denied/i.test(raw)) return tr("The microphone is blocked for this website. Press the icon to the left of the address → Microphone → Allow, and reload.") + det;
  if (n === "NotFoundError") return tr("I can't find any microphone on this device.") + det;
  if (n === "NotReadableError") return tr("Another program is using the microphone (Zoom, Meet…). Close it and try again.") + det;
  return tr("The hearing couldn't be turned on.") + det;
}
async function startConversation() {
  const e = hearingOf(chatAgent());
  if (!hasAccess() && e !== BROWSER) { openDrawer("settings"); return; }
  conv.on = true; microUI(); setBossState("loading");
  try {
    if (e === BROWSER) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) throw new Error("this browser has no hearing of its own. Choose Whisper in its profile → Capabilities → Hear");
      const rec = new SR(); rec.lang = voiceLanguage(); rec.interimResults = false; rec.continuous = false;
      rec.onspeechstart = () => { if (bossState === "speaking" && ed.e.settings.cutOnSpeech !== false) stopAudio(); if (conv.on && !conv.processing) setBossState("hearing"); };
      rec.onresult = (ev) => { const t = ev.results[0][0].transcript; if (t && t.trim()) hearing(t.trim()); };
      rec.onerror = (ev) => { if (ev.error === "not-allowed" || ev.error === "service-not-allowed") { pendingErrors.push(errorMicro(ev)); renderChat(true); hangUp(); } };
      rec.onend = () => { if (conv.on && !conv.processing && conv.rec === rec) { try { rec.start(); } catch {} } };
      conv.rec = rec; rec.start();
    } else {
      await ensureVAD();
      if (!conv.on) return;
      conv.vad = await window.vad.MicVAD.new({
        baseAssetPath: VAD_BASE, onnxWASMBasePath: ORT_BASE, redemptionMs: 1200, minSpeechMs: 500, preSpeechPadMs: 300,
        onSpeechStart: () => { if (conv.on && !conv.processing && bossState !== "speaking") setBossState("hearing"); },
        // if you talk while it's speaking, it goes quiet (after half a second of real voice, so a noise doesn't cut it off)
        onSpeechRealStart: () => { if (bossState === "speaking" && ed.e.settings.cutOnSpeech !== false) stopAudio(); if (conv.on && !conv.processing) setBossState("hearing"); },
        onVADMisfire: () => { if (conv.on && !conv.processing) setBossState("listening"); },
        onSpeechEnd: (audio) => hearing(audio)
      });
      if (!conv.on) { try { await conv.vad.destroy(); } catch {} conv.vad = null; return; }
      await conv.vad.start();
    }
    setBossState("listening");
  } catch (err) { pendingErrors.push(errorMicro(err)); renderChat(true); hangUp(); }
}
async function hangUp() {
  conv.on = false; conv.nextOne = null; microUI();
  const v = conv.vad, r = conv.rec; conv.vad = null; conv.rec = null;
  try { if (v) await v.destroy(); } catch {} try { if (r) r.abort(); } catch {}
  stopAudio(); if (!thinking) setBossState("idle");
}

// =====================================================================
// Approval inbox: everything waiting for your yes (who, what and how much it costs)
// =====================================================================
const KIND_TXT = { action: "Action outside the website", agent: "New agent", meeting: "Meeting", coin: "Coin", lesson: "New lesson", model: "Recommended model", missing: "Missing something" };
let inboxSignature = "";
function renderInbox(force) {
  const v = $("vistaBandeja");
  if (screen !== "inbox") return;
  if (!force && inUse(v)) return;
  const items = ed.inbox();
  const signature = items.map((x) => x.kind + x.id + String(x.detail || "").length + x.cost).join("|");
  if (!force && signature === inboxSignature) return;
  inboxSignature = signature;
  const sc = v.scrollTop;
  v.replaceChildren(screenHeader("What's waiting for your yes"), h("div", { class: "bandeja" },
    h("h1", {}, "Approval inbox"),
    h("p", { class: "nota-osc" }, "Everything waiting for your yes arrives here: who asks for it, what it is and what it costs. None of this happens without you."),
    h("p", { class: "nota-osc" }, mode === "home" ? (homeInfo.telegram ? "With Fer Home and Telegram, it also reaches your phone with buttons to approve or reject." : "From your phone: open the Fer Home address on your home network, or connect Telegram (README) to approve from anywhere.")
      : "From your phone: with the brain folder in Google Drive connected on both devices, the phone sees the same inbox."),
    items.length ? items.map(requestCard) : h("p", { class: "bandeja-vacia" }, "Nothing pending. When an agent wants to do something involving money or outside the website, or there's something to approve, it will show up here.")));
  v.scrollTop = sc;
}
function requestCard(x) {
  const decide = (yes, extra, button) => {
    if (button) button.disabled = true;
    return Motor.run(Object.assign({ type: "inbox.decide", kind: x.kind, id: x.id, yes }, extra || {}))
      .then((r) => { if (r && r.state) toast(r.state === "done" ? `Done: ${String(r.result || "").slice(0, 160)}` : `It couldn't be done: ${String(r.result || "").slice(0, 160)}`); render(); renderInbox(true); })
      .catch((err) => { if (button) button.disabled = false; warn(err); });
  };
  const b = (txt, f, primary) => { const el = h("button", { class: "btn mini" + (primary ? " primario" : ""), type: "button" }, txt); el.onclick = () => f(el); return el; };
  const noCost = ["missing", "coin", "lesson", "model"].includes(x.kind);
  const cost = noCost ? "" : x.cost > 0 ? (x.perDay ? `≈${fmt(x.cost)} a day` : `≈${fmt(x.cost)}`) : x.kind === "action" ? "no cost" : "≈0 $";
  const parts = [h("div", { class: "p-cab" }, h("span", { class: "clase-pet" }, KIND_TXT[x.kind] || x.kind), h("span", { class: "p-quien" }, x.who), h("span", { class: "nota-osc" }, date(x.ts)), cost ? h("span", { class: "p-coste" }, cost) : null),
    h("div", { class: "p-que" }, x.what)];
  let acc = [];
  if (x.kind === "lesson") {
    const ta = h("textarea", { rows: "2", maxlength: "300", "aria-label": "Lesson text" }); ta.value = x.detail;
    parts.push(h("p", { class: "p-det" }, tr(`Reason for the coin: “${x.reason}”.`) + " " + tr(x.writtenUp ? "A cheap model has turned it into a rule; tweak it if you like." : "The cheap model couldn't write it: tweak it yourself.")), ta);
    acc = [b("Approve", (el) => decide(true, { text: ta.value }, el), true),
      b("Write it again", (el) => { el.disabled = true; Motor.run({ type: "lesson.draft", lesson: x.id }).then(() => renderInbox(true)).catch(warn); }),
      b("Dismiss", (el) => decide(false, null, el))];
  } else if (x.kind === "meeting") {
    const rounds = h("input", { type: "number", min: "1", step: "1", value: x.rounds, "aria-label": "Rounds" });
    const est = h("span", { class: "nota-osc" });
    const calc = () => { const r = ed.e.meetings.find((y) => y.id === x.id); if (!r) return; const e = ed.estimateMeeting(Object.assign({}, r, { rounds: Math.max(1, parseInt(rounds.value, 10) || 1) })); est.textContent = tr(`≈${fmt(e.cost)} (${e.calls} calls)`); };
    rounds.oninput = calc; calc();
    parts.push(h("p", { class: "p-det" }, x.detail), h("div", { class: "p-acc" }, h("span", {}, "Rounds"), rounds, est));
    acc = [b("Start the meeting", (el) => decide(true, { rounds: parseInt(rounds.value, 10) || x.rounds }, el).then(() => openMeetingRooms(x.id)), true), b("Don't hold it", (el) => decide(false, null, el)), b("See it in the room", () => openMeetingRooms(x.id))];
  } else if (x.kind === "agent") {
    parts.push(h("p", { class: "p-det" }, x.detail));
    const pr = (ed.e.proposals || []).find((y) => y.id === x.id);
    acc = [b("Create", (el) => decide(true, null, el), true),
      pr ? b("See it and tweak it", () => openDrawer("agent", { profile: Object.assign({}, pr.profile, { floor: pr.profile.floor || "new", newFloor: pr.profile.newFloor || { name: "", job: "" } }), proposal: pr.id })) : null,
      b("Dismiss", (el) => decide(false, null, el))];
  } else if (x.kind === "missing") {
    parts.push(h("p", { class: "p-det" }, inQuotes(x.detail)), h("p", { class: "nota-osc", style: { margin: 0 } }, "Meanwhile it won't move on alone towards its objective (it doesn't spend). Give it what it asks for in its profile, or change its objective."));
    const a = ed.exactAgent(x.id);
    acc = [b("It has it now", (el) => decide(true, null, el), true), a ? b("See their profile", () => { closeScreen(); profileTab = "capabilities"; choose(a); }) : null];
  } else {
    if (x.detail) parts.push(h("p", { class: "p-det" }, x.detail));
    acc = [b(x.kind === "action" ? "Approve and do it" : x.kind === "coin" ? "Confirm" : "Accept", (el) => decide(true, null, el), true), b(x.kind === "action" ? "Reject" : "Dismiss", (el) => decide(false, null, el))];
  }
  parts.push(h("div", { class: "p-acc" }, acc.filter(Boolean)));
  return h("article", { class: "peticion" + (x.external ? " externo" : "") }, parts);
}

// =====================================================================
// Built-in agents: the ones Fer Agent comes with, to install whenever you want
// =====================================================================
let builtInSignature = "";
function renderBuiltIn(force) {
  const v = $("vistaSerie");
  if (screen !== "builtIn") return;
  const list = ed.builtInCatalog(), missingOnes = list.filter((x) => !x.installed);
  const signature = list.map((x) => x.id + (x.installed ? 1 : 0) + x.currentName).join("|");
  if (!force && signature === builtInSignature) return;
  builtInSignature = signature;
  const sc = v.scrollTop;
  const onDone = (r) => { const n = (r.returned || []).length, without = r.noRoom || []; toast((n ? tr(n === 1 ? `Installed ${r.returned.join(", ")}.` : `Installed: ${r.returned.join(", ")}.`) : tr("None was missing.")) + (without.length ? " " + tr(`No room for: ${without.join("; ")}.`) : "")); render(); renderBuiltIn(true); };
  const card = (x) => h("article", { class: "serie-ag" + (x.installed ? " instalado" : "") },
    (() => { const im = h("img", { src: figure(x.look), alt: "", class: "serie-pj" }); ensureFigure(x.look).then((u) => { im.src = u; }); return im; })(),
    h("div", { class: "serie-txt" },
      h("div", { class: "p-cab" }, h("b", { class: "serie-nombre" }, x.installed && x.currentName ? x.currentName : x.name), h("span", { class: "clase-pet" }, x.roleLabel),
        x.installed ? h("span", { class: "serie-estado" }, x.id === "boss" ? "Always there" : "In your building") : null),
      h("p", { class: "p-det" }, x.description),
      h("div", { class: "p-acc" },
        x.installed
          ? (x.id === "boss" ? null : [h("button", { class: "btn mini", type: "button", onclick: () => { closeScreen(); const a = ed.exactAgent(x.id); if (a) choose(a); } }, "See their profile"),
              h("button", { class: "btn mini peligro", type: "button", onclick: (ev) => confirm(ev.target, "Remove it? It's deleted along with its short memory. Press again", () => Motor.run({ type: "deleteAgent", id: x.id }).then(() => { render(); renderBuiltIn(true); }).catch(warn)) }, "Remove from the building")])
          : h("button", { class: "btn mini primario", type: "button", onclick: (ev) => { ev.target.disabled = true; Motor.run({ type: "installBuiltIn", id: x.id }).then(onDone).catch((err) => { ev.target.disabled = false; warn(err); }); } }, "Install"))));
  v.replaceChildren(screenHeader("Built-in agents"), h("div", { class: "bandeja catalogo-serie" },
    h("h1", {}, "Built-in agents"),
    h("p", { class: "nota-osc" }, "The agents that come with Fer Agent. A new building starts with just the boss: if you only want one agent, you already have it. Install the ones you want, whenever you want; if you remove one, it's back here."),
    missingOnes.length ? h("div", { class: "fila-c" }, h("button", { class: "btn primario", type: "button", onclick: (ev) => { ev.target.disabled = true; Motor.run({ type: "installBuiltIn" }).then(onDone).catch((err) => { ev.target.disabled = false; warn(err); }); } },
      tr(`Install the recommended team (${missingOnes.length === 1 ? tr("1 missing") : tr(`${missingOnes.length} missing`)})`)),
      h("span", { class: "nota-osc" }, "Dome: the boss and the two sages. Tech floor: Techie, Artie, the Creator, JEV and the Controller. Lobby: Memory.")) : h("p", { class: "nota-osc" }, "You have the whole recommended team installed."),
    h("div", { class: "serie-lista" }, list.map(card))));
  v.scrollTop = sc;
}

// =====================================================================
// Agent of the month: ranking by coins and spending
// =====================================================================
const VIEWS = { month: "vistaMes", rooms: "vistaSalas", inbox: "vistaBandeja", builtIn: "vistaSerie" };
function openScreen(which) {
  if (chatId) { if (conv.on) hangUp(); stopAudio(); chatId = ""; $("vistaChat").hidden = true; renderAccent(); }
  screen = which;
  for (const [k, id] of Object.entries(VIEWS)) $(id).hidden = k !== which;
  document.body.classList.add("con-pantalla");
  if (which === "month") renderMonth(true); else if (which === "rooms") renderMeetingRooms(true); else if (which === "builtIn") renderBuiltIn(true); else renderInbox(true);
  $(VIEWS[which]).scrollTop = 0;
  markNav();
}
function closeScreen() { screen = ""; for (const id of Object.values(VIEWS)) $(id).hidden = true; document.body.classList.remove("con-pantalla"); render(); replaceNav(); }
const screenHeader = (title) => h("header", { class: "pantalla-cab" }, h("button", { class: "volver-btn", type: "button", onclick: goBack }, "← Back to the building"), h("span", { class: "grow" }), title ? h("span", { class: "nota-osc" }, title) : null);
const inUse = (el) => el.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
function renderMonth(force) {
  const v = $("vistaMes");
  if (!force && inUse(v)) return;
  const sc = v.scrollTop;
  const ini = new Date(); ini.setDate(1); ini.setHours(0, 0, 0, 0);
  const ofMonth = (ed.e.coins || []).filter((m) => m.state === "confirmed" && m.ts >= ini.getTime());
  const rows = ed.e.agents.map((a) => {
    const mine = ofMonth.filter((m) => m.agent === a.id), gold = mine.filter((m) => m.type === "gold").length, reds = mine.filter((m) => m.type === "red").length;
    return { a, gold, reds, balance: gold - reds, spending: ed.agentSpending(a, "month") };
  }).sort((x, y) => y.balance - x.balance || y.gold - x.gold || x.spending - y.spending || x.a.name.localeCompare(y.a.name));
  const month = new Date().toLocaleDateString(LOCALE, { month: "long", year: "numeric" });
  const podium = rows.filter((f) => f.gold > 0 && f.balance > 0).slice(0, 3);
  const box = h("div", { class: "mes" }, h("h1", {}, "Agent of the month"), h("p", { class: "nota-osc" }, `${month[0].toUpperCase() + month.slice(1)}. Sorted by coins (gold minus red); on a tie, whoever has spent least wins.`));
  if (podium.length) {
    const order = podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium.length === 2 ? [podium[1], podium[0]] : [podium[0]];
    box.append(h("div", { class: "podio", style: podium.length < 3 ? { gridTemplateColumns: `repeat(${podium.length}, minmax(0, 260px))`, justifyContent: "center" } : {} }, order.map((f) => {
      const im = h("img", { alt: "", src: figure(f.a.look) }); ensureBigFigure(f.a.look).then((u) => { im.src = u; });
      const seat = podium.indexOf(f) + 1;
      return h("div", { class: seat === 1 ? "primero" : "" }, h("span", { class: "puesto" }, seat === 1 ? "Agent of the month" : raw(tr("#{1}").replace("{1}", seat))), im, h("b", {}, f.a.name),
        h("small", {}, `${f.gold} ${tr(f.gold === 1 ? "gold coin" : "gold coins")} · ${f.reds} ${tr(f.reds === 1 ? "red coin" : "red coins")}${f.spending > 0 ? " · " + fmt(f.spending) : ""}`));
    })));
  } else box.append(h("p", { class: "nota-osc" }, "No coins yet this month. Give them from each agent's chat (below each reply) or from their profile."));
  const pend = (ed.e.coins || []).filter((m) => m.state === "proposed");
  if (pend.length) box.append(h("div", { class: "seccion-osc" }, h("h2", {}, "Proposals waiting for your decision"),
    h("p", { class: "nota-osc", style: { margin: 0 } }, "JEV and the Controller propose red coins when they see someone failing or overspending. They only count if you confirm them."), pend.map(proposedCoinRow)));
  box.append(h("div", { class: "seccion-osc" }, h("h2", {}, "Ranking"),
    h("table", { class: "ranking" }, h("thead", {}, h("tr", {}, h("th", {}, "#"), h("th", {}, "Agent"), h("th", {}, "Gold"), h("th", {}, "Red"), h("th", {}, "Balance"), h("th", {}, "Spending this month"), h("th", {}, "Give a coin"))),
      h("tbody", {}, rows.map((f, i) => h("tr", {}, h("td", {}, i + 1), h("td", {}, h("img", { src: figure(f.a.look), alt: "" }), h("b", {}, f.a.name), " ", h("small", { class: "nota-osc" }, roleTxt(f.a))),
        h("td", {}, f.gold || "—"), h("td", {}, f.reds || "—"), h("td", {}, f.balance > 0 ? "+" + f.balance : f.balance || "—"), h("td", {}, f.spending > 0 ? fmt(f.spending) : "—"),
        h("td", { class: "dar" }, coinButton(f.a, "gold"), coinButton(f.a, "red"))))))));
  const recent = (ed.e.coins || []).filter((m) => m.state === "confirmed").slice(-12).reverse();
  if (recent.length) box.append(h("div", { class: "seccion-osc" }, h("h2", {}, "Latest coins"),
    recent.map((m) => h("div", { class: "fila-moneda" }, h("span", { class: "moneda " + m.type }), h("span", { class: "grow" }, h("b", {}, m.name), " · ", raw(m.reason)), h("small", { class: "nota-osc" }, `${date(m.ts)} · ${m.proposedBy === "you" ? tr("from you") : tr(`proposed by ${whoProposes(m.proposedBy)}`)}`)))));
  v.replaceChildren(screenHeader("Gold coins: good work · red: making things up or wasting money"), box);
  v.scrollTop = sc;
}

// =====================================================================
// Meeting rooms: up to 10 at the table, with an agenda; the boss chairs and, at the end, the minutes
// =====================================================================
const MEETING_STATUS = { proposal: "proposed by the boss: waiting for your yes", list: "called: ready to start", "in_progress": "in progress", finished: "finished", interrupted: "interrupted", cancelled: "cancelled" };
let selectedRoom = "", roomDraft = null;
function openMeetingRooms(id) { selectedRoom = id || selectedRoom; openScreen("rooms"); }
function startMeeting(id, rounds) {
  Motor.run({ type: "meeting.start", meeting: id, rounds }).then(() => { openMeetingRooms(id); setTimeout(render, 300); }).catch(warn);
}
function renderMeetingRooms(force) {
  const v = $("vistaSalas");
  if (!force && inUse(v)) return;
  const sc = v.scrollTop;
  const meetingList = (ed.e.meetings || []).slice().sort((x, y) => y.created - x.created);
  if (selectedRoom !== "new" && !meetingList.some((r) => r.id === selectedRoom)) selectedRoom = meetingList.length ? meetingList[0].id : "new";
  const list = h("div", { class: "salas-lista" }, h("h1", {}, "Meeting rooms"),
    h("button", { class: "btn primario", onclick: () => { selectedRoom = "new"; renderMeetingRooms(true); } }, "New meeting"),
    meetingList.map((r) => h("button", { class: "item-sala" + (r.id === selectedRoom ? " sel" : ""), type: "button", onclick: () => { selectedRoom = r.id; renderMeetingRooms(true); } },
      h("b", {}, raw(r.title)), h("small", {}, `${tr(MEETING_STATUS[r.state] || r.state)} · ${date(r.created)} · ${r.participants.length} at the table`))));
  const r = meetingList.find((x) => x.id === selectedRoom);
  v.replaceChildren(screenHeader("Called by you or the boss · the boss chairs · at the end, the minutes"), h("div", { class: "salas" }, list, r ? meetingView(r) : meetingForm()));
  v.scrollTop = sc;
}
// The table: the boss at the centre of the far end and the rest around; whoever is speaking glows
function table(r) {
  const ags = r.participants.map((id) => ed.exactAgent(id)).filter(Boolean);
  const j = ags.find((a) => a.role === "boss"), rest = ags.filter((a) => a !== j);
  const order = []; rest.forEach((a, i) => (i % 2 ? order.push(a) : order.unshift(a)));   // shares them out left and right
  const spot = [...order.slice(0, Math.ceil(order.length / 2)), ...(j ? [j] : []), ...order.slice(Math.ceil(order.length / 2))];
  const n = spot.length, cont = h("div", { class: "mesa" });
  const speaks = new Set(r.state === "in_progress" ? [...ed.busyIds].filter((id) => r.participants.includes(id)) : []);
  spot.forEach((a, i) => {
    const t = Math.PI + 0.3 + (Math.PI - 0.6) * (n === 1 ? 0.5 : i / (n - 1));
    const x = 50 + 41 * Math.cos(t), y = 63 + 25 * Math.sin(t) + 13;
    const im = h("img", { alt: "", src: figure(a.look) });
    cont.append(h("div", { class: "asiento" + (speaks.has(a.id) ? " habla" : ""), style: { left: x + "%", top: y + "%" }, title: a.name }, im));
    cont.append(h("span", { class: "etq-asiento" + (a.role === "boss" ? " chairs" : ""), style: { left: x + "%", top: (y + 1.5) + "%" } }, a.name));
  });
  const svg = new DOMParser().parseFromString(`<svg class="tablero" viewBox="0 0 160 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <ellipse cx="80" cy="86" rx="66" ry="10" fill="rgba(0,0,0,.28)"/>
    <ellipse cx="80" cy="69" rx="56" ry="17" fill="#5B3A1E"/>
    <ellipse cx="80" cy="65" rx="56" ry="17" fill="#9A6A3C"/>
    <ellipse cx="80" cy="65" rx="49" ry="13" fill="none" stroke="#B9854F" stroke-width=".8"/>
    <ellipse cx="80" cy="64" rx="18" ry="5" fill="#FFC56B" opacity=".18"/></svg>`, "image/svg+xml").documentElement;
  cont.append(svg);
  return cont;
}
function meetingView(r) {
  const box = h("div", { class: "sala" }, h("h2", {}, raw(r.title)),
    h("p", { class: "nota-osc", style: { margin: 0 } }, `${tr(MEETING_STATUS[r.state] || r.state)} · ${tr(r.calledBy === "you" ? "called by you" : "called by the boss")} · ${date(r.created)}${r.cost > 0 ? " · " + tr(`cost ${fmt(r.cost)}`) : ""}${r.state === "in_progress" && r.currentRound ? " · " + tr(`round ${r.currentRound} of ${r.rounds}`) : ""}`),
    table(r), h("div", { class: "orden" }, h("b", {}, "Agenda"), "\n", raw(String(r.agenda || "").replace(/^\s*\**\s*(orden del d[ií]a|agenda)\s*\**\s*[:.\-–]?\s*/i, ""))));   // if the boss already wrote it with its title, it isn't repeated
  if (r.state === "proposed" || r.state === "ready") {
    const rounds = h("input", { type: "number", min: "1", step: "1", value: r.rounds, style: { width: "70px" } });
    const est = h("span", { class: "nota-osc" });
    const calc = () => { const e = ed.estimateMeeting(Object.assign({}, r, { rounds: Math.max(1, parseInt(rounds.value, 10) || 1) })); est.textContent = tr(`Estimated cost: ≈${fmt(e.cost)} (${e.calls} calls, about 1,500 input tokens and 250 output tokens each)`); };
    rounds.oninput = calc; calc();
    box.append(h("div", { class: "form-osc" },
      h("div", { class: "fila-c" }, h("span", {}, "Rounds"), rounds, est),
      h("div", { class: "fila-c" }, h("button", { class: "btn primario", disabled: !hasAccess(), onclick: () => startMeeting(r.id, parseInt(rounds.value, 10) || r.rounds) }, r.state === "proposed" ? "Yes, start the meeting" : "Start the meeting"),
        h("button", { class: "btn", onclick: () => Motor.run({ type: "meeting.cancel", meeting: r.id }).then(() => renderMeetingRooms(true)).catch(warn) }, "Don't hold it")),
      hasAccess() ? null : h("small", { class: "nota-osc" }, "Your OpenRouter key is missing (Settings).")));
  }
  if (r.contributions.length) box.append(h("div", { class: "transcripcion" }, h("h3", {}, "What was said"), r.contributions.map((x) => h("div", { class: "intervencion" + (x.chairs ? " chairs" : "") },
    h("div", {}, h("b", {}, x.name), h("small", {}, " · " + tr(`round ${x.round || "—"}`) + (x.chairs ? " · " + tr("chairs") : "") + (x.cost > 0 ? " · " + fmt(x.cost) : ""))), h("div", { html: markdown(x.text) })))));
  if (r.state === "in_progress") box.append(h("p", { class: "nota-osc" }, "The meeting is going on: each contribution appears here when it's finished."));
  if (r.minutes) box.append(h("div", { class: "acta" }, h("h2", {}, "Minutes"), h("div", { html: markdown(r.minutes) })));
  if (r.reason && r.state === "interrupted") box.append(h("p", { class: "nota-osc" }, tr("It was interrupted:") + " ", raw(r.reason)));
  if (r.state !== "in_progress") box.append(h("div", {}, h("button", { class: "btn mini", onclick: (ev) => confirm(ev.target, "Delete it? Press again", () => Motor.run({ type: "meeting.delete", meeting: r.id }).then(() => { selectedRoom = ""; renderMeetingRooms(true); }).catch(warn)) }, "Delete the meeting")));
  return box;
}
function meetingForm() {
  const j = ed.boss();
  if (!roomDraft) roomDraft = { title: "", order: "", participants: new Set(j ? [j.id] : []), rounds: 2 };
  const b = roomDraft;
  const title = h("input", { value: b.title, maxlength: "80", placeholder: "For example: Plan for the week", oninput: (ev) => { b.title = ev.target.value; } });
  const agendaBox = h("textarea", { rows: "4", placeholder: "What needs discussing and what needs deciding", oninput: (ev) => { b.order = ev.target.value; } }); agendaBox.value = b.order;
  const rounds = h("input", { type: "number", min: "1", step: "1", value: b.rounds, style: { width: "70px" } });
  const est = h("span", { class: "nota-osc" }), tally = h("span", { class: "nota-osc" });
  const calc = () => {
    b.rounds = Math.max(1, parseInt(rounds.value, 10) || 1);
    tally.textContent = tr(`${b.participants.size} of ${MAX_MEETING_SEATS} at the table, counting the boss`);
    const e = ed.estimateMeeting({ participants: [...b.participants], rounds: b.rounds });
    est.textContent = b.participants.size > 1 ? tr(`Estimated cost: ≈${fmt(e.cost)} (${e.calls} calls)`) : "";
  };
  rounds.oninput = calc;
  const possible = ed.e.agents.filter((a) => converses(a));
  const choose = h("div", { class: "elegir-asistentes" }, possible.map((a) => {
    const chk = h("input", { type: "checkbox", checked: b.participants.has(a.id), disabled: a.role === "boss" });
    chk.onchange = () => {
      if (chk.checked && b.participants.size >= MAX_MEETING_SEATS) { chk.checked = false; toast(`The table seats ${MAX_MEETING_SEATS}, counting the boss.`); return; }
      if (chk.checked) b.participants.add(a.id); else b.participants.delete(a.id); calc();
    };
    return h("label", {}, chk, h("img", { src: figure(a.look), alt: "" }), a.name);
  }));
  calc();
  const convene = async () => {
    if (!b.title.trim()) { title.focus(); return; }
    if (!b.order.trim()) { agendaBox.focus(); return; }
    try {
      const r = await Motor.run({ type: "meeting.call", title: b.title.trim(), agenda: b.order.trim(), participants: [...b.participants], rounds: b.rounds });
      roomDraft = null; selectedRoom = r.id; renderMeetingRooms(true);
    } catch (err) { warn(err); }
  };
  return h("div", { class: "sala" }, h("h2", {}, "New meeting"),
    h("div", { class: "form-osc" },
      h("label", {}, "Title", title), h("label", {}, "Agenda", agendaBox),
      h("div", { class: "campo-osc" }, h("b", {}, "Who sits at the table"), tally, choose, h("small", { class: "nota-osc" }, "The boss chairs and is always there. Those who don't chat (Controller, Memory, JEV) can't sit down.")),
      h("div", { class: "fila-c" }, h("span", {}, "Rounds"), rounds, est),
      h("div", { class: "fila-c" }, h("button", { class: "btn primario", onclick: convene }, "Call"), h("small", { class: "nota-osc" }, "It doesn't start yet: first you'll see the table and the estimated cost."))));
}

// =====================================================================
// Drawer: Settings, Spending, Look
// =====================================================================
let drawerType = "", drawerData = {}, focusBefore = null;
const TITLES = { settings: "Settings", spending: "Spending", look: "Appearance", agent: "Create agent", storey: "Create floor" };
function openDrawer(type, data) {
  if ($("cajon").hidden) focusBefore = document.activeElement;
  drawerType = type; drawerData = data || {};
  $("cajonTitulo").textContent = tr(TITLES[type]);
  $("velo").classList.toggle("claro", type === "look"); $("cajon").classList.toggle("bajo", type === "look");
  if (type === "settings") renderSettings(); if (type === "spending") renderSpendingDrawer(); if (type === "look") renderLook();
  if (type === "agent") renderCreateAgent(true); if (type === "storey") renderCreateStorey();
  $("cajon").hidden = false; $("velo").hidden = false; $("cajonCuerpo").scrollTop = 0; $("cerrarCajon").focus();
  markNav();
}
function closeDrawer() { $("cajon").hidden = true; $("velo").hidden = true; drawerType = ""; if (focusBefore && focusBefore.focus && focusBefore.isConnected) focusBefore.focus(); replaceNav(); }

// =====================================================================
// Navigation: the logo takes you to the home page, the browser's back arrow works and each screen has «Back»
// =====================================================================
let applyingNav = false;
const navStack = [{ v: "landing" }];   // what was shown at each step of the history (to know where «back» goes)
const homeVisible = () => !$("portada").hidden && !$("portada").classList.contains("fuera");
function navState() {
  if (homeVisible()) return { v: "landing" };
  if (!$("cajon").hidden && ["settings", "spending"].includes(drawerType)) return { v: "cajon", id: drawerType };
  if (!$("cajon").hidden && drawerType) return { v: "cajon", id: drawerType, temporary: true };
  return stateWithoutDrawer();
}
function stateWithoutDrawer() {
  if (chatId) return { v: "chat", id: chatId };
  if (screen) return { v: "screen", id: screen };
  if (openFloorId) return { v: "floor", id: openFloorId };
  return { v: "building" };
}
const sameNav = (a, b) => !!(a && b && a.v === b.v && (a.id || "") === (b.id || ""));
const navStep = () => (history.state && Number.isInteger(history.state.n) ? history.state.n : 0);
function markNav() {
  if (applyingNav) return;
  const st = navState();
  if (sameNav(st, history.state)) return;
  const n = navStep() + 1;
  navStack.length = n; navStack[n] = st; seenStep = n;
  try { history.pushState(Object.assign({}, st, { n }), ""); } catch {}
}
function replaceNav() {   // closing something from the program (not with «Back»): where you are is noted without adding a step
  if (applyingNav) return;
  const st = navState(), n = navStep();
  navStack[n] = st;
  try { history.replaceState(Object.assign({}, st, { n }), ""); } catch {}
}
// «Back»: closes what's on top. If the previous step of the history is exactly that, it's the browser's back arrow.
function goBack() {
  let objective, close;
  if (!$("cajon").hidden) { objective = stateWithoutDrawer(); close = closeDrawer; }
  else if (chatId) { objective = screen ? { v: "screen", id: screen } : openFloorId ? { v: "floor", id: openFloorId } : { v: "building" }; close = closeChat; }
  else if (screen) { objective = openFloorId ? { v: "floor", id: openFloorId } : { v: "building" }; close = closeScreen; }
  else if (openFloorId) { objective = { v: "building" }; close = () => { openFloorId = ""; render(); }; }
  else if (panelOpen()) { closePanel(); return; }   // the profile open beside: it closes and the whole building stays
  else { showHome(); return; }
  const n = navStep();
  if (n > 0 && sameNav(navStack[n - 1], objective)) { history.back(); return; }
  close(); replaceNav();
}
function showHome() {
  if (chatId) { if (conv.on) hangUp(); stopAudio(); }
  const p = $("portada"); p.hidden = false; void p.offsetWidth; p.classList.remove("fuera"); p.scrollTop = 0;
  markNav();
}
function hideHome() { const p = $("portada"); if (p.hidden) return; p.classList.add("fuera"); setTimeout(() => { if (p.classList.contains("fuera")) p.hidden = true; }, 450); }
function applyNav(st) {
  st = st || { v: "landing" };
  applyingNav = true;
  try {
    if (st.v === "landing") { showHome(); return; }
    hideHome();
    if (!(st.v === "cajon" && !st.temporary) && !$("cajon").hidden) closeDrawer();
    if (st.v !== "chat" && chatId) closeChat();
    if (st.v !== "screen" && screen) closeScreen();
    if (st.v === "chat") openChat(st.id);
    else if (st.v === "screen" && VIEWS[st.id]) { if (screen !== st.id) openScreen(st.id); }
    else if (st.v === "cajon" && !st.temporary) { if (drawerType !== st.id) openDrawer(st.id); }
    else if (st.v === "floor") { if (openFloorId !== st.id) { openFloorId = st.id; render(); } }
    else if (openFloorId && st.v === "building") { openFloorId = ""; render(); }
  } finally { applyingNav = false; }
}
let seenStep = 0;   // the step of the history we were on (to know whether it was «back» or «forward»)
window.addEventListener("popstate", (ev) => {
  if (!ed || !ed.e) return;
  const n = ev.state && Number.isInteger(ev.state.n) ? ev.state.n : 0, back = n < seenStep;
  seenStep = n;
  // a step that leaves the screen the same (happens when closing something from the program) is skipped: «back» always changes something
  if (ev.state && sameNav(ev.state, navState())) { if (back && n > 0) history.back(); else if (!back) history.forward(); return; }
  applyNav(ev.state);
});

// ---------------- Create floor ----------------
function renderCreateStorey() {
  const c = $("cajonCuerpo"); c.innerHTML = "";
  const nom = h("input", { placeholder: "For example: Sales, Home, Studies…", maxlength: "40" });
  const fun = h("textarea", { rows: "3", placeholder: "For example: find customers and prepare quotes", maxlength: "300" });
  const create = async () => {
    if (!nom.value.trim()) { nom.focus(); return; }
    try { const r = await Motor.run({ type: "createFloor", name: nom.value.trim(), job: fun.value.trim() }); closeDrawer(); openFloor(r.id); showTab(window.innerWidth <= 900 ? "building" : tab); }
    catch (err) { warn(err); }
  };
  c.append(h("p", { class: "nota", style: { margin: 0 } }, "Each floor is a team with a job. On the left, its section head's office; on the right, its sub-agents' offices; and if there are many simple ones, the pool. The new floor is built at the top, under the dome."),
    h("label", { class: "campo" }, h("span", {}, "Floor name"), nom),
    h("label", { class: "campo" }, h("span", {}, "What it does"), fun),
    h("div", { class: "fila-c" }, h("button", { class: "btn primario", onclick: create }, "Create floor"), h("button", { class: "btn", onclick: closeDrawer }, "Cancel")));
  setTimeout(() => nom.focus(), 50);
}

// ---------------- Create agent (blank, or designed by the Creator) ----------------
let draft = null;
function newDraft(d) {
  const storeys = ed.e.floors.filter((x) => x.type === "storey");
  const pl = ed.e.floors.find((x) => x.id === d.floor) || storeys[0] || null;
  const role = pl && pl.type === "dome" ? "sage" : d.seat === "head_office" ? "section_head" : "subagent";
  const freeLobbySeat = pl && pl.type === "lobby" ? (SEATS.lobby.find((k) => !ed.e.agents.some((x) => x.floor === pl.id && x.seat === k)) || "left") : "";
  return { name: "", role, floor: pl ? pl.id : "new", newFloor: { name: "", job: "" }, seat: d.seat || freeLobbySeat || (role === "section_head" ? "head_office" : role === "sage" ? "left" : "office"),
    instructions: "", objective: "", personality: "", brain: "", heartbeat: { every: 1, unit: role === "sage" ? "on_request" : "d" }, onWake: "tasks", capabilities: ["write", "speak", "hear"], look: { p: role === "sage" ? "grandpa" : "boy" }, proposal: "", why: "", requested: "", requestedPersonalityText: "" };
}
function renderCreateAgent(fresh) {
  if (fresh || !draft) draft = drawerData.profile ? Object.assign(newDraft({}), drawerData.profile, { proposal: drawerData.proposal || "" }) : newDraft(drawerData);
  const b = draft, c = $("cajonCuerpo"), sc = c.scrollTop;
  c.innerHTML = "";
  // 1. the Creator
  const creator = ed.e.agents.find((x) => x.role === "creator");
  const requested = h("textarea", { rows: "3", placeholder: "For example: I want one that every Monday prepares the week's menu and the shopping list for me", value: b.requested });
  requested.value = b.requested || "";
  requested.oninput = () => { b.requested = requested.value; };
  const who = creator ? (["Agent Creator", "Creador de agentes"].includes(creator.name) || !creator.name.trim() ? "the Creator" : creator.name) : "";
  const requestedPersonality = h("input", { maxlength: String(MAX_PERSONALITY), placeholder: "For example: friendly, funny and to the point", value: b.requestedPersonalityText || "" });
  requestedPersonality.oninput = () => { b.requestedPersonalityText = requestedPersonality.value; };
  const button = h("button", { class: "btn primario mini" }, `Let ${who} design it`);
  button.onclick = async () => {
    if (!requested.value.trim()) { requested.focus(); return; }
    if (!hasAccess()) { openDrawer("settings"); return; }
    button.disabled = true; button.textContent = tr("Designing…");
    try {
      const r = await Motor.run({ type: "proposeAgent", text: requested.value.trim(), personality: requestedPersonality.value.trim() });
      const f = r.proposal.profile;
      draft = Object.assign(newDraft({}), f, { floor: f.floor || "new", newFloor: f.newFloor || { name: "", job: "" }, proposal: r.proposal.id, why: f.why, requested: requested.value, requestedPersonalityText: requestedPersonality.value, cost: r.cost });
      renderCreateAgent(false);
    } catch (err) { button.disabled = false; button.textContent = tr("Try again"); c.querySelector(".error-creador")?.remove(); button.after(h("p", { class: "error-creador" }, err.shown ? err.message : `It couldn't be done: ${err.message}`)); }
  };
  c.append(h("div", { class: "bloque creador" }, h("h4", {}, "Tell it in your own words"),
    creator ? h("p", { class: "nota", style: { margin: 0 } }, `${who[0].toUpperCase() + who.slice(1)} fills in the profile for you. Then you review it and change it if you like. It costs one call to its brain (a few cents).`)
      : h("p", { class: "nota", style: { margin: 0 } }, "You don't have an Agent Creator. Fill in the profile by hand or install it from “Built-in agents”."),
    creator ? requested : null,
    creator ? h("label", { class: "campo" }, h("span", {}, "What personality do you want it to have? (its tone, its humour and whether it gets to the point)"), requestedPersonality, h("small", {}, "If you leave it blank, the Creator proposes one and you can change it below.")) : null,
    creator ? h("div", {}, button) : null,
    b.proposal ? h("p", { class: "porque" }, tr(b.why || "Profile filled in by the Creator.") + (b.cost ? " " + tr(`Designing it cost ${fmt(b.cost)}.`) : "")) : null));
  // 2. the profile
  const name = h("input", { value: b.name, placeholder: "What it's called", maxlength: "40", oninput: (ev) => { b.name = ev.target.value; } });
  const selRole = h("select", { onchange: (ev) => { b.role = ev.target.value; if (b.role === "sage") { b.floor = ed.e.floors[0].id; b.seat = "left"; b.heartbeat = { every: 1, unit: "on_request" }; if (!["grandpa", "grandma"].includes(b.look.p)) b.look = { p: "grandpa" }; } else { if (b.floor === ed.e.floors[0].id) b.floor = (ed.e.floors.find((x) => x.type === "storey") || { id: "new" }).id; b.seat = b.role === "section_head" ? "head_office" : "office"; } renderCreateAgent(false); } },
    [["section_head", "Section head"], ["subagent", "Sub-agent"], ["sage", "Sage"]].map(([v, t]) => h("option", { value: v }, t)));
  selRole.value = b.role;
  const floorsOk = b.role === "sage" ? ed.e.floors.filter((x) => x.type === "dome") : ed.e.floors.filter((x) => x.type !== "dome");
  const selFloor = h("select", { disabled: b.role === "sage", onchange: (ev) => { b.floor = ev.target.value; const t = (ed.e.floors.find((x) => x.id === b.floor) || { type: "storey" }).type; b.seat = t === "lobby" ? "left" : (b.role === "section_head" ? "head_office" : "office"); renderCreateAgent(false); } },
    floorsOk.map((x) => h("option", { value: x.id }, x.name)), b.role === "sage" ? null : h("option", { value: "new" }, "A new floor…"));
  selFloor.value = b.floor;
  const floorType = b.floor === "new" ? "storey" : (ed.e.floors.find((x) => x.id === b.floor) || { type: "storey" }).type;
  const selSeat = h("select", { onchange: (ev) => { b.seat = ev.target.value; } }, (SEATS_TXT[floorType] || []).map(([v, t]) => h("option", { value: v }, t)));
  selSeat.value = b.seat;
  const pName = h("input", { value: b.newFloor.name, placeholder: "Name of the new floor", oninput: (ev) => { b.newFloor.name = ev.target.value; } });
  const pJob = h("input", { value: b.newFloor.job, placeholder: "What it does", oninput: (ev) => { b.newFloor.job = ev.target.value; } });
  const instructions = h("textarea", { rows: "5", placeholder: "Who it is and how it works. For example: “You're in charge of…; every time you wake up, …; deliver…”", oninput: (ev) => { b.instructions = ev.target.value; } }); instructions.value = b.instructions;
  const objective = h("textarea", { rows: "2", placeholder: "What it should achieve (optional)", oninput: (ev) => { b.objective = ev.target.value; } }); objective.value = b.objective;
  const personality = h("textarea", { rows: "2", maxlength: String(MAX_PERSONALITY), placeholder: "Its tone, its humour and whether it gets to the point", oninput: (ev) => { b.personality = ev.target.value; } }); personality.value = b.personality || "";
  const selBrain = modelPicker("text", b.brain, { empty: "The cheapest that will do (the building picks it)", onChange: (v) => { b.brain = v; } });
  const num = h("input", { type: "number", min: "1", step: "1", value: b.heartbeat.every, disabled: b.heartbeat.unit === "on_request", onchange: (ev) => { b.heartbeat.every = Math.max(1, parseInt(ev.target.value, 10) || 1); } });
  const uni = h("select", { onchange: (ev) => { b.heartbeat.unit = ev.target.value; num.disabled = b.heartbeat.unit === "on_request"; } }, [["min", "minutes"], ["h", "hours"], ["d", "days"], ["on_request", "on request only"]].map(([v, t]) => h("option", { value: v }, t)));
  uni.value = b.heartbeat.unit;
  const selOnWake = h("select", { onchange: (ev) => { b.onWake = ev.target.value; } }, h("option", { value: "tasks" }, "Does its pending tasks (if there are none, it doesn't spend)"), h("option", { value: "objective" }, "Does its tasks and, if there are none, works on its objective (spends)"));
  selOnWake.value = b.onWake;
  const caps = h("div", { class: "caps" }, CAPABILITIES.filter((x) => x.type === "basic").map((x) => h("label", { class: "cap" },
    h("input", { type: "checkbox", checked: b.capabilities.includes(x.id), disabled: x.id === "write", onchange: (ev) => { b.capabilities = ev.target.checked ? [...new Set([...b.capabilities, x.id])] : b.capabilities.filter((y) => y !== x.id); } }),
    h("span", {}, x.name, h("small", {}, x.how)))));
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Its profile"),
    field("Name", name),
    h("div", { class: "dos" }, field("Role", selRole), field("Floor", selFloor)),
    h("small", { class: "nota", style: { marginTop: "-6px" } }, { section_head: "The section head runs a floor from the office on the left and shares out the work among its sub-agents.", subagent: "The sub-agent does the work, in an office or, if it's simple and cheap, in the pool.", sage: "The sage sits in the dome and only advises the boss on important decisions. It's expensive." }[b.role]),
    b.floor === "new" ? h("div", { class: "dos" }, pName, pJob) : null,
    field("Spot", selSeat),
    field("Instructions", instructions), field("Personality", personality, "Sent with every call: its character doesn't depend on the brain."), field("Objective", objective),
    field("Brain", selBrain, "At the top, the recommended ones by level; below, all of them. Prices in dollars per million tokens (input / output), according to OpenRouter."),
    h("div", { class: "campo" }, h("span", {}, "Resting, it wakes up"), h("div", { class: "fila-c" }, h("span", {}, "every"), num, uni)),
    b.role === "sage" ? null : field("When it wakes up", selOnWake),
    h("div", { class: "campo" }, h("span", {}, "Capabilities"), caps)));
  // 3. its look
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Its appearance"), lookPicker(b.look, (A) => { b.look = A; })));
  // 4. create
  const create = h("button", { class: "btn primario" }, "Create agent");
  create.onclick = async () => {
    if (b.floor === "new" && !b.newFloor.name.trim()) { pName.focus(); return; }
    const profile = Object.assign({}, b, { floor: b.floor === "new" ? "" : b.floor, newFloor: b.floor === "new" ? b.newFloor : null, level: b.brain ? "" : (b.level || "budget") });
    create.disabled = true;
    try {
      const r = await Motor.run({ type: "createAgent", profile, proposal: b.proposal || undefined });
      draft = null; closeDrawer();
      const fresh = ed.agent(r.id);
      if (fresh) { openFloor(fresh.floor); choose(fresh); }
    } catch (err) { create.disabled = false; c.querySelector(".error-creador.final")?.remove(); create.parentElement.after(h("p", { class: "error-creador final" }, err.shown ? err.message : `It couldn't be done: ${err.message}`)); }
  };
  c.append(h("div", { class: "fila-c pie-crear" }, create, h("button", { class: "btn", onclick: () => { draft = null; closeDrawer(); } }, "Cancel")));
  c.scrollTop = fresh ? 0 : sc;
}

// ---------------- An agent's look ----------------
function renderLook() {
  const c = $("cajonCuerpo"); c.innerHTML = "";
  const a = ed.agent(drawerData.id) || ed.boss();
  if (!a) return;
  $("cajonTitulo").textContent = tr("Photo and name of ") + a.name;
  // the name, right here, next to the photo
  const nom = h("input", { value: a.name, maxlength: "40", "aria-label": "Name" });
  nom.onchange = () => { const v = nom.value.trim(); if (!v || v === a.name) { nom.value = a.name; return; } Motor.run({ type: "editAgent", id: a.id, changes: { name: v } }).then(() => { $("cajonTitulo").textContent = tr("Photo and name of ") + v; render(); }).catch(warn); };
  c.append(h("div", { class: "bloque" }, field("Name", nom, "Give it any name you like.")));
  let wait = null;
  c.append(lookPicker(a.look, (A) => {
    clearTimeout(wait);
    wait = setTimeout(() => Motor.run({ type: "editAgent", id: a.id, changes: { look: A } }).then(() => { ensureFigure(A).then(() => render()); }).catch(warn), 120);
  }));
  c.append(h("p", { class: "nota" }, a.role === "boss" ? "The website's colour follows the boss's clothes (and in each chat, the clothes of the agent you're talking to)." : "It's saved with the building. In its chat, the website's colour follows its clothes."));
}

function renderSpendingDrawer(dataOnly) {
  const c = $("cajonCuerpo");
  if (dataOnly && c.contains(document.activeElement) && document.activeElement.tagName === "INPUT") return;
  c.innerHTML = "";
  const aj = ed.e.settings, usage = ed.budgetUsage();
  const saveSetting = (changes) => Motor.run({ type: "settings", changes }).then(() => { render(); renderSpendingDrawer(); }).catch(warn);
  c.append(h("div", { class: "bloque" }, h("h4", {}, "The whole building"),
    h("div", { class: "gastos3" }, ["today", "week", "month"].map((p) => h("div", {}, h("b", {}, fmt(ed.buildingSpending(p))), h("small", {}, { today: "today", week: "7 days", month: "this month" }[p])))),
    h("div", { class: "barra" }, h("i", { class: phaseClass(), style: { width: Math.min(100, usage * 100) + "%" } })),
    h("p", { class: "nota", style: { margin: 0 } }, tr(`Cap used: ${Math.round(usage * 100)} %.`) + " " + tr({ normal: "Everyone works.", freeze1: "Priority 1 and 2 are frozen.", freeze2: "Only priority 5 works.", cap: "Cap reached: everything frozen until tomorrow or until you raise the cap." }[ed.e.phase || "normal"]))));
  // the master switch and who spends when waking up
  const pause = aj.pause !== false;
  const list = ed.whoSpends().filter((x) => !["memory"].includes(x.a.role));
  const withHeartbeat = list.filter((x) => x.auto && !x.a.off);
  const dayTotal = withHeartbeat.reduce((s, x) => s + (x.est.perDay || 0), 0);
  const addRequest = (a) => Motor.run({ type: "editAgent", id: a.id, changes: { heartbeat: { every: 1, unit: "on_request" } } }).then(() => { render(); renderSpendingDrawer(); }).catch(warn);
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Automatic work"),
    h("div", { class: "fila-c" }, h("button", { class: "pausa-btn", type: "button", "aria-pressed": String(pause), onclick: () => Motor.run({ type: "pause", pause: !pause }).then(() => { render(); renderSpendingDrawer(); }).catch(warn) },
      h("span", { class: "pausa-ico", "aria-hidden": "true" }), h("span", { class: "pausa-txt" }, h("b", {}, pause ? "Paused" : "Automatic work running"), h("small", {}, pause ? "press to start it" : "press to stop everything automatic")))),
    h("p", { class: "nota", style: { margin: 0 } }, pause ? "General pause: no agent that spends wakes up on its own, and the tasks the boss shares out wait. You can still talk to them and wake them up by hand. Whatever costs nothing (the Controller and the skills without a brain, like the X Watcher) keeps working."
      : `Running. If nobody had tasks, the automatic work would cost about ${fmt(dayTotal)} a day (estimated).`),
    h("h4", { style: { marginTop: "6px" } }, "Who spends when they wake up"),
    h("div", { class: "quien-gasta" }, list.map(({ a, auto, est }) => h("div", { class: "fila-qg" + (est.spends && auto && est.perTime > 0 ? " gasta" : "") },
      h("img", { src: figure(a.look), alt: "" }),
      h("span", { class: "qg-txt" }, h("b", {}, a.name), h("small", {}, `${a.off ? "off" : auto ? heartbeatText(a.heartbeat) : "on request only"} · ${est.how}`)),
      h("span", { class: "qg-der" }, est.spends && est.perTime > 0 ? h("b", {}, `≈${fmt(est.perTime)} per heartbeat`) : h("small", {}, est.subscription ? `from your ${est.subscription} subscription` : est.spends ? (est.perTask ? `≈${fmt(est.perTask)} per task` : "—") : "doesn't spend"),
        est.spends && auto && est.perDay > 0 ? h("small", {}, `≈${fmt(est.perDay)} a day`) : null,
        est.spends && auto && !a.off && a.role !== "boss" ? h("button", { class: "btn mini", type: "button", onclick: () => addRequest(a) }, "On request only") : null)))),
    h("small", { class: "nota" }, "Estimate (ASSUMPTION): what it reads when it wakes up, about 3.5 letters per token, plus about 400 tokens of reply, at its brain's price. Internet search adds about $0.006. You can see the real spending above.")));
  const td = h("input", { type: "number", min: "0", step: "0.5", value: aj.dailyCap }), tm = h("input", { type: "number", min: "0", step: "1", value: aj.monthlyCap }), cd = h("input", { type: "number", min: "10", max: "99", step: "5", value: Math.round((aj.freezeFrom || 0.8) * 100) });
  td.onchange = () => saveSetting({ dailyCap: Math.max(0, parseFloat(td.value) || 0) });
  tm.onchange = () => saveSetting({ monthlyCap: Math.max(0, parseFloat(tm.value) || 0) });
  cd.onchange = () => saveSetting({ freezeFrom: Math.min(0.99, Math.max(0.1, (parseFloat(cd.value) || 80) / 100)) });
  const mid = Math.round(((aj.freezeFrom || 0.8) + 1) / 2 * 100);
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Caps"),
    h("div", { class: "dos" }, h("label", { class: "campo" }, h("span", {}, "Daily cap (USD)"), td), h("label", { class: "campo" }, h("span", {}, "Monthly cap (USD)"), tm)),
    h("label", { class: "campo" }, h("span", {}, "Start freezing at (%)"), cd),
    h("div", { class: "tramos" },
      h("div", {}, h("b", {}, `< ${Math.round((aj.freezeFrom || 0.8) * 100)} %`), h("span", {}, "everyone works")),
      h("div", {}, h("b", {}, `≥ ${Math.round((aj.freezeFrom || 0.8) * 100)} %`), h("span", {}, "priority 1 and 2 are frozen")),
      h("div", {}, h("b", {}, `≥ ${mid} %`), h("span", {}, "only priority 5 works (the boss and the controls)")),
      h("div", {}, h("b", {}, "100 %"), h("span", {}, "everything frozen, the boss too; it comes back the next day or when you raise the cap"))),
    h("small", { class: "nota" }, "Also put a limit on the key on the OpenRouter website: it's the safety net if something goes wrong here.")));
  const rows = ed.e.agents.map((a) => ({ a, today: ed.agentSpending(a, "today"), sem: ed.agentSpending(a, "week"), month: ed.agentSpending(a, "month") })).sort((x, y) => y.month - x.month || y.today - x.today);
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Per agent"),
    h("table", { class: "gasto" }, h("thead", {}, h("tr", {}, h("th", {}, "Agent"), h("th", {}, "Prio."), h("th", {}, "Today"), h("th", {}, "7 days"), h("th", {}, "Month"))),
      h("tbody", {}, rows.map((f) => h("tr", {}, h("td", {}, f.a.name, " ", h("small", { class: "nota" }, STATUS_TXT[visibleState(f.a)])), h("td", {}, f.a.priority), h("td", {}, f.today > 0 ? (f.a.estimatedSpending ? "≈" : "") + fmt(f.today) : "—"), h("td", {}, f.sem > 0 ? fmt(f.sem) : "—"), h("td", {}, f.month > 0 ? fmt(f.month) : "—")))),
      h("tfoot", {}, h("tr", {}, h("td", {}, "Total"), h("td", {}, ""), h("td", {}, fmt(ed.buildingSpending("today"))), h("td", {}, fmt(ed.buildingSpending("week"))), h("td", {}, fmt(ed.buildingSpending("month")))))),
    h("small", { class: "nota" }, "In dollars. Brains, images and mic: what OpenRouter charges for each call. Voice: what was charged if OpenRouter reports it; if not, estimated at the model's price (“≈”).")));
}

// ---------------- Settings → Other APIs (your subscriptions') ----------------
function otherApisBlock() {
  const conx = ed.connections();
  const saveList = (list) => Motor.run({ type: "connections", connections: list }).then(() => { render(); renderSettings(); }).catch(warn);
  const currentList = () => (ed.e.settings.connections || []).map((x) => Object.assign({}, x));
  const b = h("div", { class: "bloque" }, h("h4", {}, "Other APIs (your subscriptions)"),
    h("p", { class: "nota", style: { margin: 0 } }, "Each agent thinks with OpenRouter (pay per use) or with the API of a subscription you already pay for. Add yours here and, in each agent's profile → Brain, choose which one it thinks with. What comes out of your subscription doesn't count towards the spending cap: it's tracked separately, so you can see it."),
    h("small", { class: "nota" }, "Some subscriptions include API access or API credits (for example, some Claude and ChatGPT plans, or the Google Cloud credits in Google AI Pro and Ultra). Others only let you use your allowance in their own apps: don't use those here. Anything paid separately is better through OpenRouter."));
  for (const P of conx) {
    const msg = h("small", { class: "nota" });
    const test = h("button", { class: "btn mini", type: "button", onclick: async () => { test.disabled = true; msg.textContent = tr("Testing…"); try { const l = await loadDirectModels(P.id); msg.textContent = tr(`It works: ${l.length} models. The first one: ${l[0] || "—"}.`); } catch (err) { msg.textContent = err.message; } test.disabled = false; } }, "Test");
    const outside = h("button", { class: "btn mini peligro", type: "button", onclick: (ev) => confirm(ev.target, "Remove this API? Its agents go back to OpenRouter. Press again", () => { try { localStorage.removeItem(apiKey(P.id)); } catch {} saveList(currentList().filter((x) => x.id !== P.id)); }) }, "Remove this API");
    const row = h("div", { class: "campo api-fila" }, h("span", {}, P.name + (hasApiKey(P.id) && !P.noKey ? " · " + tr("key set") : "")), h("small", { class: "nota" }, P.api + (P.format === "anthropic" ? " · Claude's format" : "")));
    if (P.noKey) row.append(h("small", { class: "nota" }, "A model on your own computer: no key needed. It has to be running (and, to use it from this website, allow calls from the browser)."));
    else if (isApp()) {
      const kk = h("input", { type: "password", autocomplete: "off", placeholder: hasApiKey(P.id) ? "••••••••••" : P.web ? `Your key (from ${P.web})` : "Your key" });
      row.append(h("div", { class: "clave-fila" }, kk,
        h("button", { class: "btn mini primario", type: "button", onclick: async () => { try { await callApp("/api/conf/key", { prov: P.id, key: kk.value.trim() }); await refreshHome(); renderSettings(); toast(kk.value.trim() ? "Key saved on this computer." : "Key removed."); } catch (e) { warn(e); } } }, "Save")),
        h("small", { class: "nota" }, "It's stored only on this computer and only travels to this API's address. To remove it, leave it empty and press “Save”."));
    }
    else if (mode === "home") row.append(h("small", { class: "nota" }, hasApiKey(P.id) ? "Key set in Fer Home." : "No key in Fer Home. On the Fer Home computer: node fer-casa.mjs keys"));
    else {
      const has = !!store.get(apiKey(P.id));
      const inp = h("input", { type: "password", autocomplete: "off", placeholder: P.web ? `Your key (from ${P.web})` : "Your key", value: has ? "••••••••••" : "" });
      inp.onfocus = () => { if (inp.value.startsWith("•")) inp.value = ""; };
      const save = h("button", { class: "btn mini primario", type: "button", onclick: () => { const v = inp.value.trim(); if (v && !v.startsWith("•")) store.set(apiKey(P.id), v); render(); renderSettings(); } }, "Save");
      const removeKey = has ? h("button", { class: "btn mini", type: "button", onclick: (ev) => confirm(ev.target, "Remove the key? Press again", () => { try { localStorage.removeItem(apiKey(P.id)); } catch {} renderSettings(); }) }, "Remove the key") : null;
      row.append(h("div", { class: "clave-fila" }, inp, save, removeKey));
    }
    row.append(h("div", { class: "fila-c" }, test, outside, msg));
    b.append(row);
  }
  // adding: the known ones (they only fill in the address) or any other
  const known = Object.entries(PROVIDERS).filter(([k]) => k !== "openrouter" && !conx.some((c) => c.id === k));
  if (known.length) b.append(h("div", { class: "campo" }, h("span", {}, "Add a known one"), h("div", { class: "fila-c" }, known.map(([k, P]) => h("button", { class: "btn mini", type: "button", onclick: () => saveList([...currentList(), { id: k }]) }, "+ " + P.name)))));
  const nom = h("input", { placeholder: "Name (for example, My API)" }), dir = h("input", { placeholder: "Address (for example, https://api.company.com/v1)" });
  const fmtSel = h("select", {}, h("option", { value: "openai" }, "Speaks like OpenAI (most of them)"), h("option", { value: "anthropic" }, "Speaks like Claude"));
  const err = h("small", { class: "nota" });
  b.append(h("div", { class: "campo" }, h("span", {}, "Or any other"), nom, dir, fmtSel,
    h("div", { class: "fila-c" }, h("button", { class: "btn mini", type: "button", onclick: () => {
      const name = nom.value.trim(), api = dir.value.trim();
      if (!/^https?:\/\/\S+$/i.test(api)) { err.textContent = tr("The address has to start with https:// (or http:// if it's on your computer)."); return; }
      let id = "api-" + (withoutAccents(name || api.replace(/^https?:\/\//, "")).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 22) || "new");
      while (conx.some((c) => c.id === id) || PROVIDERS[id]) id += "-2";
      saveList([...currentList(), { id, name: name || api.replace(/^https?:\/\//, "").split("/")[0], api, format: fmtSel.value }]);
    } }, "Add"), err)));
  b.append(h("small", { class: "nota" }, mode === "local" ? "The keys stay only in this browser and only travel to their API's address. They never go into backups or moves." : "With Fer Home, the keys live on its computer (datos/config.json): node fer-casa.mjs keys."));
  return b;
}
function renderSettings() {
  const c = $("cajonCuerpo"), sc = c.scrollTop; c.innerHTML = "";
  const aj = ed.e.settings;
  const saveSetting = (changes, extra) => Motor.run(Object.assign({ type: "settings", changes }, extra || {})).then(render).catch(warn);
  // where it lives
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Where your building lives"),
    h("div", { class: "donde" },
      isApp() ? h("div", { class: "aqui" }, h("b", {}, "In this app"), h("br"), h("span", { class: "nota" }, "On your computer, with no Terminal. The agents work while the app is open, with hands: their Chrome, their folder and their skills."), homeInfo.data ? h("br") : null, homeInfo.data ? h("small", { class: "nota" }, tr("Your data:") + " ", raw(homeInfo.data)) : null) : null,
      h("div", { class: mode === "local" ? "aqui" : "" }, h("b", {}, "In this browser"), h("br"), h("span", { class: "nota" }, "Works right away, nothing to install. The agents work while this website is open on some device.")),
      h("div", { class: mode === "home" && !isApp() ? "aqui" : "" }, h("b", {}, "Fer Home: a computer or phone that stays on"), h("br"), h("span", { class: "nota" }, "The fer-casa.mjs program runs this same building around the clock and gives the agents hands (their Chrome, their folder, their skills). You open the website from the address it gives you.")),
      h("div", {}, h("b", {}, "Fer Home in the cloud"), h("br"), h("span", { class: "nota" }, "The same program on a rented server. It works even when everything at home is off."))),
    h("small", { class: "nota" }, "How to install Fer Home: the README in the ZIP and the “Fer Agent · The Building” document.")));
  // access: your key and your money
  if (mode === "local") {
    const k = h("input", { type: "password", autocomplete: "off", placeholder: "sk-or-...", value: store.get(K.key) ? "••••••••••" : "" });
    k.onfocus = () => { if (k.value.startsWith("•")) k.value = ""; };
    c.append(h("div", { class: "bloque" }, h("h4", {}, "Your OpenRouter key"),
      h("div", { class: "fila-c" }, k, h("button", { class: "btn primario mini", onclick: () => { if (!k.value.startsWith("•")) store.set(K.key, k.value.trim()); k.value = store.get(K.key) ? "••••••••••" : ""; render(); renderChat(true); closeDrawer(); } }, "Save")),
      h("p", { class: "nota", style: { margin: 0 } }, "Where it is and where it goes: it's stored only in this browser, on this device. It doesn't go through any Fer Agent server: when an agent thinks, speaks or listens, this browser sends it straight to OpenRouter, and to nobody else. Anyone using this same browser could use it."),
      h("small", { class: "nota" }, "Safety net: put a spending limit on the key on the OpenRouter website."),
      howToGetKey()));
  } else if (isApp()) {
    // in the app: the key is pasted here and saved on this computer; and you sign in to your websites once with the agents' Chrome
    const k = h("input", { type: "password", autocomplete: "off", placeholder: "sk-or-...", value: homeInfo.key ? "••••••••••" : "" });
    k.onfocus = () => { if (k.value.startsWith("•")) k.value = ""; };
    c.append(h("div", { class: "bloque" }, h("h4", {}, "Your OpenRouter key"),
      h("div", { class: "fila-c" }, k, h("button", { class: "btn primario mini", onclick: async () => {
        if (!k.value.trim() || k.value.startsWith("•")) return;
        try { await callApp("/api/conf/key", { prov: "openrouter", key: k.value.trim() }); await refreshHome(); toast("Key saved on this computer."); render(); renderChat(true); closeDrawer(); } catch (e) { warn(e); }
      } }, "Save")),
      h("p", { class: "nota", style: { margin: 0 } }, "Where it is and where it goes: it's stored only on this computer, in the app's data folder. It only travels to OpenRouter when an agent thinks, speaks or listens."),
      h("small", { class: "nota" }, "Safety net: put a spending limit on the key on the OpenRouter website."),
      howToGetKey()));
    const u = h("input", { type: "url", placeholder: "https://mail.google.com" });
    c.append(h("div", { class: "bloque" }, h("h4", {}, "Your websites, in the agents' Chrome"),
      h("p", { class: "nota", style: { margin: 0 } }, "For an agent to use a website with your account (your email, a social network…), sign in once yourself: the agents' Chrome opens, you sign in and close that window. The session stays on this computer."),
      h("div", { class: "fila-c" }, u, h("button", { class: "btn mini", onclick: async () => {
        try { await callApp("/api/conf/login", { url: u.value.trim() }); toast("The agents' Chrome is open. Sign in with your account and, when you're done, close that window."); } catch (e) { warn(e); }
      } }, "Open")),
      h("small", { class: "nota" }, "It needs Google Chrome installed on this computer.")));
  } else {
    const p = h("input", { type: "password", placeholder: "Fer Home PIN", value: pin });
    c.append(h("div", { class: "bloque" }, h("h4", {}, "Fer Home PIN"),
      h("div", { class: "fila-c" }, p, h("button", { class: "btn primario mini", onclick: async () => { pin = p.value.trim(); pinRejected = false; store.set(K.pin, pin); await refreshHome(); renderChat(true); if (!pinRejected) closeDrawer(); else renderSettings(); } }, "Enter")),
      pinRejected ? h("small", { class: "nota", style: { color: "var(--peligro)" } }, "That PIN isn't right (or there were too many attempts: wait a minute).") : null,
      h("small", { class: "nota" }, "The keys live in Fer Home (datos/config.json), not on this device. The PIN stops anyone else on your network using your credit.")));
  }
  c.append(otherApisBlock());
  // the building's name and objectives
  const nom = h("input", { value: ed.e.name || "" });
  nom.onchange = () => saveSetting({}, { name: nom.value.trim() || "My building" });
  const obj = h("textarea", { rows: "5", placeholder: "For example:\nHelp my shop sell more online\nSave me two hours a day of email and paperwork\n…" }); obj.value = ed.e.objectives || "";
  const tally = h("span", { class: "contador" });
  const count = () => {
    const lines = obj.value.split("\n").filter((l) => l.trim()).length, letters = obj.value.trim().length;
    tally.textContent = tr(`${lines}/${MAX_OBJECTIVE_LINES} lines · ${letters} letters · about ${Math.ceil(letters / 3.5)} tokens in every heartbeat of every agent`);
    tally.classList.toggle("mal", lines > MAX_OBJECTIVE_LINES);
  };
  obj.oninput = count; count();
  obj.onchange = () => Motor.run({ type: "objectives", text: obj.value }).then((r) => { obj.value = r.objectives; count(); render(); }).catch(warn);
  c.append(h("div", { class: "bloque" }, field("Building name", nom),
    field("Building objectives (yours or your company's)", obj, "Five lines at most. Every agent reads them when it wakes up, together with its own and its role's lessons. Keep it short: every letter is paid for in every heartbeat."), tally));
  // the brain: library and long-term memory in a folder
  c.append(brainBlock());
  // the building's default models (each agent can choose its own in its profile → Capabilities)
  const selView = modelPicker("text", aj.visionModel, { empty: "None", filter: (m) => modelData(m).sees, onChange: (v) => saveSetting({ visionModel: v }) });
  const selImg = modelPicker("image", aj.imageModel, { empty: "None", onChange: (v) => saveSetting({ imageModel: v }) });
  const selMus = modelPicker("music", aj.musicModel, { empty: "None", onChange: (v) => saveSetting({ musicModel: v }) });
  const withMusic = ed.e.agents.filter((a) => a.capabilities.includes("create_music")).map((a) => a.name);
  const selVoice = modelPicker("voice", aj.voiceModel || BROWSER, { extra: [[BROWSER, "Browser voice · free"]] });
  const selVc = h("select", { onchange: (ev) => saveSetting({ specificVoice: ev.target.value }) });
  const fillVc = () => {
    selVc.innerHTML = "";
    const list = selVoice.value === BROWSER ? [{ id: "", name: "Automatic (the website's language)" }, ...browserVoices().map((v) => ({ id: v.voiceURI, name: `${v.name} · ${v.lang}` }))]
      : ((voices.find((m) => m.id === selVoice.value) || {}).voices || []);
    for (const v of (list.length ? list : [{ id: "", name: "The default model's" }])) selVc.append(h("option", { value: v.id }, v.name));
    selVc.value = [...selVc.options].some((o) => o.value === aj.specificVoice) ? aj.specificVoice : selVc.options[0].value;
  };
  fillVc();
  selVoice.onchange = () => { fillVc(); saveSetting({ voiceModel: selVoice.value, specificVoice: selVc.value }); };
  const selHearing = modelPicker("hearing", aj.hearingModel || BROWSER, { extra: [[BROWSER, "Browser hearing · free (Chrome, Edge, Safari)"]], onChange: (v) => saveSetting({ hearingModel: v }) });
  const chk = h("input", { type: "checkbox", checked: aj.answerByVoiceIfMic !== false, onchange: (ev) => saveSetting({ answerByVoiceIfMic: ev.target.checked }) });
  const chkShort = h("input", { type: "checkbox", checked: aj.shortVoice !== false, onchange: (ev) => saveSetting({ shortVoice: ev.target.checked }) });
  const chkCut = h("input", { type: "checkbox", checked: aj.cutOnSpeech !== false, onchange: (ev) => saveSetting({ cutOnSpeech: ev.target.checked }) });
  const selLec = modelPicker("text", aj.lessonsModel, { empty: `The cheapest that will do (${modelName(chooseModel("budget", ed.models)) || "none"})`, onChange: (v) => saveSetting({ lessonsModel: v }) });
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Building's default models"),
    h("p", { class: "nota", style: { margin: 0 } }, "Used by every agent that doesn't have its own. Each one picks its own in its profile → Capabilities."),
    field("See: brain with vision", selView, "Describes images to the agents whose brain can't see."),
    field("Create images", selImg), field("Create music", selMus, tr("Where it's turned on: in each agent's profile → Capabilities → “Create music”.") + " " + (withMusic.length ? tr("These have it now:") + " " + withMusic.join(", ") + "." : tr("No agent has it now."))),
    field("Speak: voice model", selVoice), field("The boss's voice", selVc, "The other agents, if they don't choose their own, each get a different voice from that model."),
    field("Hear: your voice to text", selHearing),
    h("label", { class: "cap" }, chk, h("span", {}, "If you talk to it through the mic, it answers out loud even if the speaker is off")),
    h("label", { class: "cap" }, chkShort, h("span", {}, "Short answers when you talk by voice", h("small", {}, "One to three sentences; if you want more, ask for the details."))),
    h("label", { class: "cap" }, chkCut, h("span", {}, "Stops talking when you speak", h("small", {}, "The mic stays open while it talks. With very loud speakers, if it cuts itself off, use headphones or turn this off."))),
    field("Model that turns coins into lessons", selLec, "A cheap one: it writes the rule and you approve it in the inbox.")));
  // recommended models: at the top of each picker. Artie proposes the new ones; you decide.
  const pendingModels = (ed.e.modelProposals || []).filter((x) => x.state === "pending");
  const recSummary = h("div", { class: "lista" }, Object.keys(MODEL_TYPES).filter((t) => t !== "others").map((t) => {
    const rec = ((aj.recommended || {})[t]) || {};
    const lines = LEVELS.filter((n) => (rec[n] || []).length).map((n) => h("div", {}, h("b", {}, tr(LEVEL_NAME[n]) + ": "), rec[n].map(modelName).join(", ")));
    return lines.length ? h("div", { class: "item" }, h("div", { class: "cab" }, h("span", {}, tr(MODEL_TYPES[t]))), lines) : null;
  }).filter(Boolean));
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Recommended models"),
    h("p", { class: "nota", style: { margin: 0 } }, "Every selector first shows the recommended ones by PRICE level (free, cheap, mid, high and cutting-edge), not by quality: each level has the newest version from each maker. Below, all of OpenRouter's, sorted by what they do according to their data. When a new model comes out, Artie proposes it; nothing changes without your yes."),
    pendingModels.length ? Object.keys(MODEL_TYPES).map((t) => proposalsFor(t)).flat() : h("p", { class: "nota", style: { margin: 0 } }, "Artie has no pending proposals."),
    h("details", {}, h("summary", {}, "See the current recommended ones"), recSummary),
    h("div", {}, h("button", { class: "btn mini", onclick: (ev) => confirm(ev.target, "Go back to the original ones? Press again", () => Motor.run({ type: "recommended.reset" }).then(() => { render(); renderSettings(); }).catch(warn)) }, "Go back to the original recommended ones"))));
  // lessons and view
  const nLec = h("input", { type: "number", min: "1", max: "50", step: "1", value: aj.lessonsPerRole || 5, onchange: (ev) => saveSetting({ lessonsPerRole: Math.max(1, Math.min(50, parseInt(ev.target.value, 10) || 5)) }) });
  const selBuildingView = h("select", { onchange: (ev) => saveSetting({ buildingView: ev.target.value }) }, [["auto", `Automatic: strips from ${AUTO_AGENTS + 1} agents or ${AUTO_STOREYS + 1} floors`], ["drawing", "Always the drawing"], ["strips", "Always in strips"]].map(([v, t]) => h("option", { value: v }, t)));
  selBuildingView.value = aj.buildingView || "auto";
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Coins, lessons and view"),
    field("Lessons kept per role", nLec, "When a new one comes in, the oldest goes. The ones you pin in the profile never go."),
    field("How the building is shown", selBuildingView)));
  if (Object.keys(LANGUAGES).length > 1) {
    const selLanguage = h("select", { onchange: (ev) => changeLanguage(ev.target.value) }, Object.entries(LANGUAGES).map(([k, t]) => h("option", { value: k }, t)));
    selLanguage.value = language;
    c.append(h("label", { class: "bloque campo" }, h("span", {}, "Language (the website and what the agents are told)"), selLanguage));
  }
  // the built-in agents you renamed, back to their official name (in the building's language)
  c.append(h("div", { class: "bloque" },
    h("button", { class: "btn mini", onclick: () => Motor.run({ type: "builtInNames" }).then((r) => { render(); renderSettings(); toast(r && r.changed ? tr(`Built-in names restored: ${r.changed}.`) : tr("They already have their built-in names.")); }).catch(warn) }, "Restore the built-in names"),
    h("small", { class: "nota" }, "The built-in agents get back their official name in this language. The ones you created don't change.")));
  // backups, moving and starting again
  const template = (name, txt) => h("button", { class: "btn mini", onclick: (ev) => confirm(ev.target, "Sure? The current building will be deleted", () => Motor.run({ type: "template", name }).then(() => { selection = "boss"; openFloorId = ""; render(); renderChat(true); closeDrawer(); }).catch(warn)) }, txt);
  const fi = h("input", { type: "file", accept: "application/json,.json", hidden: true, onchange: async (ev) => { const f = ev.target.files[0]; if (!f) return; try { const r = await loadBackup(await f.text()); render(); renderChat(true); closeDrawer(); toast(r.relocation ? "Move received: agents, settings, images and music. Paste your keys again in Settings (they don't travel in the file)." : (r.media ? tr(`Backup loaded with ${r.media} images and music tracks.`) : tr("Backup loaded."))); } catch (err) { warn(err); } } });
  const t = lastBackup();
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Backups and moving"),
    h("p", { class: "nota", style: { margin: 0 } }, `Last backup: ${t ? new Date(t).toLocaleString(LOCALE) + " (" + howLongAgo(t) + ")" : "none yet"}. The backup includes agents, memories, settings, spending, images and music. It doesn't include your keys.`),
    h("div", { class: "fila-c" }, h("button", { class: "btn mini primario", onclick: () => saveBackup({ withMedia: true }).then(() => renderSettings()).catch(warn) }, "Save a backup now"), h("button", { class: "btn mini", onclick: () => fi.click() }, "Load a backup or a move"), fi),
    h("p", { class: "nota", style: { margin: 0 } }, "Moving (when the website moves to your own domain): here press “Prepare the move”; on the new website, “Load a backup or a move” with that file. Agents, settings, images and music go across; you paste the keys again. If you use Google Drive, add the new address in Google Cloud (step 6 of connecting Drive)."),
    h("div", { class: "fila-c" }, h("button", { class: "btn mini", onclick: () => saveBackup({ withMedia: true, relocation: true }).catch(warn) }, "Prepare the move")),
    mode === "local" && store.get(K.v4) ? h("div", { class: "fila-c" }, h("span", { class: "nota" }, "Your version 4 building, exactly as it was."), h("button", { class: "btn mini", onclick: () => download(store.get(K.v4), "fer-agent-version-4.json") }, "Download it")) : null,
    beforeV9 ? h("div", { class: "fila-c" }, h("span", { class: "nota" }, "Your building from before version 9, exactly as it was."), h("button", { class: "btn mini", onclick: () => download(beforeV9, "fer-agent-before-version-9.json") }, "Download it")) : null,
    techieBackup() ? h("div", { class: "fila-c" }, h("span", { class: "nota" }, `Techie's last backup: ${techieBackup().day}.`), h("button", { class: "btn mini", onclick: () => download(techieBackup().json, `fer-agent-techie-backup-${techieBackup().day}.json`) }, "Download the copy")) : null));
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Start again"),
    h("p", { class: "nota", style: { margin: 0 } }, "Built-in agents: the ones that come with Fer Agent (the sages, Techie, Artie, the Creator, JEV, the Controller and Memory). They're installed and removed from their page."),
    h("div", { class: "fila-c" }, h("button", { class: "btn mini", onclick: () => { closeDrawer(); openScreen("builtIn"); } }, "Open “Built-in agents”")),
    lastSetting ? h("p", { class: "nota", style: { margin: 0 } }, lastSetting) : null,
    h("p", { class: "nota", style: { margin: 0 } }, "Start from scratch: “Just the boss” or “With the recommended team” (dome, tech floor and lobby with their agents). Settings and spending are kept."),
    h("div", { class: "fila-c" }, template("empty", "Just the boss"), template("basic", "With the recommended team"))));
  c.append(h("p", { class: "nota" }, `Fer Agent Building · version ${VERSION} · open source · prices and models come live from OpenRouter.`));
  c.scrollTop = sc;
}
// The brain in Settings: where it lives, how to connect it and what the website sees
function brainBlock() {
  const st = brain.state, box = h("div", { class: "bloque" }, h("h4", {}, "Brain: Library and Long-term memory"));
  if (isApp()) {
    const cc = Object.assign({ n: brainFolders(ed.e) }, homeInfo.folder || {});
    box.append(h("p", { class: "nota", style: { margin: 0 } }, `In the app, the brain lives in a folder on this computer: “${cc.n.library}” (your notes), “${cc.n.memory}” (one note per topic) and “${cc.n.backup}”. If you choose a folder inside Google Drive for desktop, you also have it in Drive and in Obsidian.`),
      h("div", { class: "estado-carpeta" }, h("i", { class: "punto " + (cc.path ? "ok" : "") }), h("span", {}, tr("Folder:") + " ", raw(cc.path || "")),
        cc.notes !== undefined ? h("span", { class: "nota" }, " · " + tr(`${cc.notes} topics`) + " · " + tr(`${cc.library || 0} notes in the Library`)) : null),
      window.ferApp && window.ferApp.chooseFolder ? h("button", { class: "btn mini", type: "button", onclick: async () => {
        try {
          const relPath = await window.ferApp.chooseFolder(); if (!relPath) return;
          await callApp("/api/conf/folder", { path: relPath });
          toast("Folder saved. The app reopens to use it.");
          setTimeout(() => window.ferApp.restart(), 1500);
        } catch (e) { warn(e); }
      } }, "Change the folder") : null);
    return box;
  }
  if (mode === "home") {
    const cc = Object.assign({ n: brainFolders(ed.e) }, homeInfo.folder || {});
    box.append(h("p", { class: "nota", style: { margin: 0 } }, `With Fer Home, the brain lives in a folder on that computer: “${cc.n.library}” (your notes), “${cc.n.memory}” (one note per topic) and “${cc.n.backup}”. If that folder is inside Google Drive for desktop, you also have it in Drive and in Obsidian.`),
      h("div", { class: "estado-carpeta" }, h("i", { class: "punto " + (cc.path ? "ok" : "") }), h("span", {}, cc.path ? `Folder: ${cc.path}` : "Folder: Fer Home's data folder (datos/cerebro)"),
        cc.notes !== undefined ? h("span", { class: "nota" }, `· ${cc.notes} topics · ${cc.library || 0} notes in the Library`) : null),
      h("small", { class: "nota" }, "To change it: on the Fer Home computer, node fer-casa.mjs folder"));
    return box;
  }
  const conf = store.json(K.folder, null) || {};
  box.append(h("div", { class: "estado-carpeta" }, h("i", { class: "punto " + (st.connected ? "ok" : st.error ? "mal" : "") }),
    h("span", {}, st.connected ? tr("Connected:") + " " + st.name : st.error ? `${st.name || tr("Folder")}: ${st.error}` : "No folder: the brain lives only in this browser."),
    st.connected ? h("span", { class: "nota" }, "· " + tr(`${st.notes} topics in the long-term memory`) + " · " + tr(`${st.library} notes in the Library`) + (st.lastSync ? " · " + tr(`synced ${howLongAgo(st.lastSync)}`) : "")) : null));
  if (st.needsPermission && brain.state.type === "local") box.append(h("div", {}, h("button", { class: "btn mini primario", onclick: async () => { const hnd = await idb.get("kv", "localFolder"); if (hnd) connectBrain(localAdapter(hnd), true).catch(warn); } }, "Give permission to the folder again")));
  // Google Drive
  const cid = h("input", { placeholder: "Google client ID (ends in .apps.googleusercontent.com)", value: conf.clientId || "" });
  const connectDrive = h("button", { class: "btn mini primario", type: "button", onclick: async () => {
    const id = cid.value.trim();
    if (!/\.apps\.googleusercontent\.com$/.test(id)) { warn(Object.assign(new Error("That doesn't look like a Google client ID (it must end in .apps.googleusercontent.com). Check the steps."), { shown: true })); return; }
    store.set(K.folder, JSON.stringify({ type: "drive", clientId: id }));
    connectDrive.disabled = true;
    try { await connectBrain(driveAdapter(id), true); toast("Drive connected: the website only sees its “Fer Agent” folder."); } catch (err) { warn(Object.assign(new Error(`Couldn't connect Drive: ${err.message}`), { shown: true })); }
    connectDrive.disabled = false;
  } }, st.connected && st.type === "drive" ? "Connect again" : "Connect Google Drive");
  box.append(h("div", { class: "campo" }, h("span", {}, "Google Drive (recommended: phone and computer see the same building)"), cid, h("div", {}, connectDrive)),
    h("details", {}, h("summary", {}, "Steps to connect Drive (once, about 10 minutes)"), h("ol", { class: "nota pasos-drive" },
      h("li", {}, "Go to console.cloud.google.com with your Google account and create a project (at the top: “Select a project” → “New project”). Name: Fer Agent."),
      h("li", {}, "Menu → “APIs & Services” → “Library” → search for “Google Drive API” → “Enable”."),
      h("li", {}, "“APIs & Services” → “OAuth consent screen” (or “Google Auth Platform”): type “External”, app name Fer Agent, your support and contact email. Save."),
      h("li", {}, "Under “Audience” (or “Test users”), add your Google email as a test user. Leave the app “in testing”: there's no need to publish it."),
      h("li", {}, "Under “Data access” (or “Scopes”), add the …/auth/drive.file scope. It's the one that only lets the website see the files it creates itself."),
      h("li", {}, tr("“Credentials” (or “Clients”) → “Create credentials” → “OAuth client ID” → type “Web application”. Under “Authorised JavaScript origins” put") + " " + location.origin + " " + tr("(and, when you move, the new address too). There's no need to put anything under “Redirect URIs”.")),
      h("li", {}, "Copy the “Client ID” (it ends in .apps.googleusercontent.com), paste it above and press “Connect Google Drive”. Choose your account and grant permission. If Google warns that the app isn't verified, that's because it's yours and in testing: press “Continue”."),
      h("li", {}, "Repeat step 7 on your phone (same ID). The website will create the “Fer Agent” folder in your Drive. Don't create it by hand."))));
  // a folder on this computer
  if (window.showDirectoryPicker) box.append(h("div", { class: "campo" }, h("span", {}, "Or a folder on this computer (Chrome or Edge)"),
    h("div", {}, h("button", { class: "btn mini", type: "button", onclick: async () => {
      let hnd; try { hnd = await window.showDirectoryPicker({ mode: "readwrite", id: "fer-agent-brain" }); } catch { return; }
      await idb.put("kv", "localFolder", hnd); store.set(K.folder, JSON.stringify({ type: "local" }));
      try { await connectBrain(localAdapter(hnd), true); toast("Folder connected."); } catch (err) { warn(err); }
    } }, st.connected && st.type === "local" ? "Choose another folder" : "Choose folder")),
    h("small", { class: "nota" }, "For people who don't use Drive. Careful: what another device saves to Drive through the website won't be seen by this folder, or the other way round; use just one way on all your devices.")));
  const fb = h("input", { type: "file", multiple: true, accept: ".md,.txt,text/markdown,text/plain", hidden: true, onchange: async (ev) => { try { const n = await uploadLibrary([...ev.target.files]); toast(n === 1 ? tr("1 note added to the Library.") : tr(`${n} notes added to the Library.`)); renderSettings(); } catch (err) { warn(err); } ev.target.value = ""; } });
  box.append(h("div", { class: "fila-c" },
    st.connected ? h("button", { class: "btn mini", onclick: () => syncBrain().then(() => toast("Synced.")) }, "Sync now") : null,
    h("button", { class: "btn mini", onclick: () => fb.click() }, "Add notes to the Library"), fb,
    st.connected || conf.type ? h("button", { class: "btn mini", onclick: (ev) => confirm(ev.target, "Disconnect? Press again", () => { clearInterval(brain.timerId); brain.ad = null; Object.assign(brain.state, { connected: false, error: "", name: "" }); try { localStorage.removeItem(K.folder); } catch {} loadLocalLibrary(); renderSettings(); }) }, "Disconnect") : null),
    h("small", { class: "nota" }, "What the website sees: with Drive, only the files it creates itself in “Fer Agent” (drive.file permission); nothing else in your Drive. Whatever you correct in Obsidian in those notes, it reads again. A NEW note you write by hand in Obsidian isn't seen, because the website didn't create it: upload it with “Add notes to the Library” (it stays inside its folder and you edit it from there). For it to see any new note it would need permission to read your whole Drive, which Google treats as restricted and which would let it see everything, not just its folder: that's why it isn't requested."));
  return box;
}
let lastSetting = "";
function download(text, name) {
  const blob = new Blob([text], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
}
function exportBuilding() { download(JSON.stringify(ed.e, null, 1), `fer-edificio-${new Date().toLocaleDateString("sv-SE")}.json`); }
const techieBackup = () => (mode === "local" ? store.json(K.backup, null) : null);
let beforeV9 = null;   // the building from before version 9, as it was (only in this browser, if it was moved here)

// =====================================================================
// The brain in a folder: Google Drive, a folder on this computer (Chrome) or Fer Home's.
// Inside: the Library (your notes), the Long-term memory (one note per topic, written by Memory) and the building's backup (the names, per building: carpetasCerebro).
// The website only sees its folder. The notes are Obsidian's (.md): you can open and correct them; the website reads what you change.
// =====================================================================
const brain = { ad: null, busy: false, changes: 0, written: new Map(), seen: new Map(), seenBuilding: 0, myBuilding: 0, timerId: null,
  state: { connected: false, type: "", name: "", lastSync: 0, lastBackup: 0, error: "", notes: 0, library: 0, needsPermission: false } };
const GOOGLE_FOLDER = "application/vnd.google-apps.folder";
function driveAdapter(clientId) {
  let token = null, expires = 0, root = null;
  const ids = new Map();
  const D = "https://www.googleapis.com/drive/v3/files", U = "https://www.googleapis.com/upload/drive/v3/files";
  async function askToken(interactive) {
    if (!(window.google && google.accounts && google.accounts.oauth2)) await loadScript("https://accounts.google.com/gsi/client");
    const r = await new Promise((res, rej) => {
      const tc = google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: "https://www.googleapis.com/auth/drive.file",
        callback: (x) => (x && x.error ? rej(new Error(x.error_description || x.error)) : res(x)),
        error_callback: (e) => rej(new Error((e && (e.message || e.type)) || "Google didn't grant permission")) });
      tc.requestAccessToken({ prompt: interactive ? "consent" : "" });
    });
    token = r.access_token; expires = Date.now() + ((Number(r.expires_in) || 3600) - 120) * 1000;
  }
  async function api(url, init = {}, another = true) {
    if (!token || Date.now() > expires) await askToken(false);
    const r = await fetch(url, Object.assign({}, init, { headers: Object.assign({ Authorization: "Bearer " + token }, init.headers || {}) }));
    if (r.status === 401 && another) { token = null; return api(url, init, false); }
    if (!r.ok) { let det = ""; try { det = ((await r.json()).error || {}).message || ""; } catch {} throw new Error(`Google Drive replied ${r.status}${det ? ": " + det : ""}`); }
    return r;
  }
  const quoted = (t) => String(t).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  async function search(name, parent, folder) {
    const q = `name = '${quoted(name)}' and '${parent}' in parents and trashed = false` + (folder ? ` and mimeType = '${GOOGLE_FOLDER}'` : ` and mimeType != '${GOOGLE_FOLDER}'`);
    const d = await (await api(`${D}?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)&pageSize=10`)).json();
    return ((d.files || [])[0] || {}).id || "";
  }
  async function folder(name, parent) {
    let id = await search(name, parent, true);
    if (!id) id = (await (await api(D + "?fields=id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name, mimeType: GOOGLE_FOLDER, parents: [parent] }) })).json()).id;
    return id;
  }
  async function folderId(relPath) {
    if (!root) { root = await folder("Fer Agent", "root"); ids.set("", root); }
    let parent = root, soFar = "";
    for (const segment of String(relPath).split("/").filter(Boolean)) { soFar = soFar ? soFar + "/" + segment : segment; if (!ids.has(soFar)) ids.set(soFar, await folder(segment, parent)); parent = ids.get(soFar); }
    return parent;
  }
  return {
    type: "drive", name: "Google Drive · “Fer Agent” folder",
    async connect(interactive) { await askToken(interactive); const n = brainFolders(ed.e); await folderId(n.library); await folderId(n.memory); },
    async listFiles(sub, recursive) {
      const out = [];
      const walk = async (relPath, id, level) => {
        let pt = "";
        do {
          const d = await (await api(`${D}?q=${encodeURIComponent(`'${id}' in parents and trashed = false`)}&fields=nextPageToken,files(id,name,mimeType,modifiedTime)&pageSize=1000${pt ? "&pageToken=" + pt : ""}`)).json();
          for (const f of d.files || []) {
            const rr = relPath ? relPath + "/" + f.name : f.name;
            ids.set(rr, f.id);
            if (f.mimeType === GOOGLE_FOLDER) { if (recursive && level < 4) await walk(rr, f.id, level + 1); }
            else out.push({ path: rr, id: f.id, modified: Date.parse(f.modifiedTime) || 0 });
          }
          pt = d.nextPageToken || "";
        } while (pt);
      };
      await walk(sub, await folderId(sub), 0);
      return out;
    },
    async read(x) { return await (await api(`${D}/${x.id}?alt=media`)).text(); },
    async write(relPath, text, type = "text/markdown") {
      const parts = String(relPath).split("/"), name = parts.pop(), parent = await folderId(parts.join("/"));
      let id = ids.get(relPath) || await search(name, parent, false);
      if (id) await api(`${U}/${id}?uploadType=media`, { method: "PATCH", headers: { "Content-Type": type + "; charset=UTF-8" }, body: text });
      else {
        const b = "fer" + Math.random().toString(36).slice(2);
        const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: name, parents: [parent], mimeType: type })}\r\n--${b}\r\nContent-Type: ${type}; charset=UTF-8\r\n\r\n${text}\r\n--${b}--`;
        id = (await (await api(`${U}?uploadType=multipart&fields=id`, { method: "POST", headers: { "Content-Type": "multipart/related; boundary=" + b }, body: body })).json()).id;
        ids.set(relPath, id);
      }
    }
  };
}
function localAdapter(handle) {
  async function dir(relPath, create) { let d = handle; for (const p of String(relPath).split("/").filter(Boolean)) d = await d.getDirectoryHandle(p, { create: create }); return d; }
  return {
    type: "local", name: `Folder on this computer “${handle.name}”`,
    async connect(interactive) {
      let p = await handle.queryPermission({ mode: "readwrite" });
      if (p !== "granted" && interactive) p = await handle.requestPermission({ mode: "readwrite" });
      if (p !== "granted") throw Object.assign(new Error("Chrome needs you to grant permission to the folder again (Settings → Brain)."), { permission: true });
      const n = brainFolders(ed.e); await dir(n.library, true); await dir(n.memory, true);
    },
    async listFiles(sub, recursive) {
      const out = [];
      const rec = async (relPath, d, level) => {
        for await (const [name, hh] of d.entries()) {
          const rr = relPath ? relPath + "/" + name : name;
          if (hh.kind === "directory") { if (recursive && level < 4 && !name.startsWith(".")) await rec(rr, hh, level + 1); }
          else { const f = await hh.getFile(); out.push({ path: rr, h: hh, modified: f.lastModified }); }
        }
      };
      await rec(sub, await dir(sub, true), 0);
      return out;
    },
    async read(x) { return await (await x.h.getFile()).text(); },
    async write(relPath, text) {
      const parts = String(relPath).split("/"), name = parts.pop();
      const fh = await (await dir(parts.join("/"), true)).getFileHandle(name, { create: true });
      const w = await fh.createWritable(); await w.write(text); await w.close();
    }
  };
}
const agentNames = () => Object.fromEntries(ed.e.agents.map((a) => [a.id, a.name]));
async function connectBrain(ad, interactive) {
  try {
    await ad.connect(interactive);
    if (brain.ad !== ad) { brain.written.clear(); brain.seen.clear(); brain.myBuilding = 0; brain.seenBuilding = 0; brain.conflict = null; brain.state.lastSync = 0; clearInterval(brain.timerId); }   // another folder: it starts from scratch
    brain.ad = ad;
    Object.assign(brain.state, { connected: true, type: ad.type, name: ad.name, error: "", needsPermission: false });
    const saved = (await idb.get("kv", "brainSync")) || {};
    if (saved.type === ad.type) { brain.state.lastSync = saved.lastSync || 0; brain.myBuilding = saved.myBuilding || 0; brain.seenBuilding = saved.seenBuilding || 0; }
    await syncBrain();
    clearInterval(brain.timerId);
    brain.timerId = setInterval(() => { if (document.visibilityState === "visible") syncBrain(); }, 120e3);
  } catch (err) {
    Object.assign(brain.state, { connected: false, error: err.message, needsPermission: !!err.permission, type: ad.type, name: ad.name });
    if (interactive) throw err;
  } finally { render(); if (drawerType === "settings") renderSettings(); }
}
let brainWait = null, brainWhen = 0;
function brainChange(type) {   // the engine said something changed → it's written to the folder a little later (all together)
  if (type === "state") brain.changes++;
  if (!brain.ad) return;
  const when = Date.now() + (type === "memory" ? 4000 : 30000);
  if (brainWait && brainWhen <= when) return;   // there's already a write pending: that one takes everything
  clearTimeout(brainWait); brainWhen = when;
  brainWait = setTimeout(() => { brainWait = null; syncBrain({ writeOnly: true }); }, when - Date.now());
}
async function syncBrain(op = {}) {
  const ad = brain.ad;
  if (!ad || !ed || !ed.e) return;
  if (brain.busy) { brain.again = true; return; }   // when the one in progress finishes, another one is done
  brain.busy = true;
  try {
    const since = brain.state.lastSync || 0, now = Date.now();
    // Before writing anything the folder is checked, so as not to overwrite your other device's work or what you corrected by hand
    if (await fetchBuilding(ad)) return;   // there was a newer building from your other device: it's already loaded
    // Long-term memory: what you corrected by hand comes in (without losing what was noted here after the last time)
    const cc = brainFolders(ed.e);
    for (const x of await ad.listFiles(cc.memory, false)) {
      const name = x.path.split("/").pop();
      if (!/\.md$/i.test(name) || name === cc.index + ".md") continue;
      if ((brain.seen.get(x.path) || 0) >= x.modified) continue;
      const text = await ad.read(x);
      brain.seen.set(x.path, x.modified);
      if (brain.written.get(x.path) === text) continue;
      await Motor.run({ type: "memory.import", topic: name.replace(/\.md$/i, ""), text, keepFrom: since });
    }
    if (!op.writeOnly) {
      // Library: your notes, so Memory can search in them (read only)
      const docs = [];
      for (const x of (await ad.listFiles(cc.library, true)).filter((y) => /\.(md|txt)$/i.test(y.path))) {
        let c = await idb.get("biblio", ad.type + ":" + x.path);
        if (!c || c.modified < x.modified) { c = { modified: x.modified, text: (await ad.read(x)).slice(0, 300000) }; await idb.put("biblio", ad.type + ":" + x.path, c); }
        docs.push({ path: x.path, title: x.path.split("/").pop().replace(/\.(md|txt)$/i, ""), text: c.text });
      }
      ed.setLibrary(docs);
      brain.state.library = docs.length;
    }
    // what changed here goes out to the folder: the Long-term memory notes and the building's backup
    const notes = memoryNotesMd(ed.e.longMemory, agentNames(), cc);
    for (const n of notes) {
      if (brain.written.get(n.path) === n.text) continue;
      await ad.write(n.path, n.text);
      brain.written.set(n.path, n.text); brain.seen.delete(n.path);   // next time it's checked (if it's the same as what we wrote, it isn't touched)
    }
    brain.state.notes = notes.length - 1;
    if (!brain.conflict && (brain.changes || !brain.myBuilding)) await writeBuilding(ad);   // with an undecided conflict, nothing is written over it
    brain.state.lastSync = now; brain.state.error = "";
    await idb.put("kv", "brainSync", { type: ad.type, lastSync: now, myBuilding: brain.myBuilding, seenBuilding: brain.seenBuilding });
  } catch (err) {
    brain.state.error = err.message;
  } finally {
    brain.busy = false; renderBackupTop(); if (drawerType === "settings" && !inUse($("cajonCuerpo"))) renderSettings();
    if (brain.again) { brain.again = false; setTimeout(() => syncBrain({ writeOnly: true }), 500); }
  }
}
async function writeBuilding(ad) {
  const ts = Date.now();
  await ad.write(brainFolders(ed.e).backup, JSON.stringify({ type: "fer-agent-building", version: VERSION, device, ts, building: ed.e }), "application/json");
  brain.myBuilding = ts; brain.seenBuilding = Math.max(brain.seenBuilding, ts); brain.changes = 0;
  brain.state.lastBackup = ts;
}
// Did your other device (the phone or the Mac) save the building later? If you haven't changed anything here, it's loaded; if you have, you choose.
async function fetchBuilding(ad) {
  const x = (await ad.listFiles("", false)).find((y) => y.path === brainFolders(ed.e).backup);
  if (!x || x.modified <= brain.seenBuilding) return false;
  let d = null; try { d = readBackupFile(JSON.parse(await ad.read(x))); } catch { return false; }
  if (!d || d.kind !== "building" || !d.building || d.device === device || (d.ts || 0) <= brain.myBuilding) { brain.seenBuilding = x.modified; return false; }
  // both devices have changed things: you choose (and until then it isn't marked as seen or written over)
  if (brain.changes && brain.myBuilding) { brain.conflict = { d, modified: x.modified }; conflictNotice(d); return false; }
  brain.seenBuilding = x.modified;
  await Motor.run({ type: "import", state: d.building });
  brain.myBuilding = d.ts; brain.changes = 0;
  toast(`Loaded the building your other device saved (${new Date(d.ts).toLocaleString(LOCALE)}).`);
  render(); if (chatId) renderChat(true);
  return true;
}
function conflictNotice(d) {
  if ($("conflicto")) return;
  const box = h("div", { id: "conflicto", class: "aviso-flotante conflicto", role: "alertdialog" },
    h("b", {}, "Your other device saved changes to the building"), h("span", {}, `Its changes are from ${new Date(d.ts).toLocaleString(LOCALE)}. You've changed things here too. Which ones do you keep?`),
    h("div", { class: "fila-c" },
      h("button", { class: "btn mini primario", onclick: async () => { box.remove(); const c = brain.conflict; brain.conflict = null; await Motor.run({ type: "import", state: d.building }).catch(warn); brain.myBuilding = d.ts; brain.changes = 0; if (c) brain.seenBuilding = Math.max(brain.seenBuilding, c.modified); render(); if (chatId) renderChat(true); } }, "Load the other device's"),
      h("button", { class: "btn mini", onclick: async () => { box.remove(); const c = brain.conflict; brain.conflict = null; if (c) brain.seenBuilding = Math.max(brain.seenBuilding, c.modified); if (brain.ad) await writeBuilding(brain.ad).catch(warn); } }, "Keep the ones here")));
  document.body.append(box);
}
// The Library without a folder (only in this browser) or uploading notes to the folder
async function uploadLibrary(files) {
  let n = 0;
  for (const f of files) {
    if (!/\.(md|txt)$/i.test(f.name)) continue;
    const text = await f.text();
    const bib = brainFolders(ed.e).library;
    if (brain.ad) await brain.ad.write(bib + "/" + f.name, text);
    else await idb.put("library", "browser:" + bib + "/" + f.name, { modified: Date.now(), text: text.slice(0, 300000) });
    n++;
  }
  if (brain.ad) await syncBrain(); else await loadLocalLibrary();
  return n;
}
async function loadLocalLibrary() {
  if (brain.ad) return;
  const keys = (await idb.keys("library")).filter((k) => String(k).startsWith("browser:"));
  const docs = [];
  for (const k of keys) { const c = await idb.get("library", k); if (c) docs.push({ path: String(k).slice("browser:".length), title: String(k).split("/").pop().replace(/\.(md|txt)$/i, ""), text: c.text }); }
  ed.setLibrary(docs); brain.state.library = docs.length;
}
async function startBrain() {
  const conf = store.json(K.folder, null);
  if (!conf || mode !== "local") { await loadLocalLibrary().catch(() => {}); return; }
  if (conf.type === "drive" && conf.clientId) await connectBrain(driveAdapter(conf.clientId), false);
  else if (conf.type === "local") {
    const hnd = await idb.get("kv", "localFolder");
    if (hnd) await connectBrain(localAdapter(hnd), false);
  }
  if (!brain.ad) await loadLocalLibrary().catch(() => {});
}

// =====================================================================
// The building's backups (with images and music) and moving to another address
// =====================================================================
async function pkg({ withMedia, relocation }) {
  const e = ed.e;
  const p = { type: "fer-agent-backup", version: VERSION, date: new Date().toISOString(), device, building: e };
  if (withMedia) {
    p.media = {};
    const used = new Set();
    for (const m of [...e.conversation, ...e.agents.flatMap((a) => a.chat || [])]) for (const x of m.media || []) used.add(x.id);
    for (const id of used) {
      if (mode === "local") { const x = await idb.get("media", id); if (x) p.media[id] = x; }
      else { const url = await mediaUrl({ id }); if (url) { try { const b = await (await fetch(url)).blob(); p.media[id] = { id, url: await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); }) }; } catch {} } }
    }
  }
  if (relocation) { p.relocation = true; p.preferences = { speaker: store.get(K.speaker), language: store.get(K.language), folder: store.json(K.folder, null) }; }
  return p;
}
async function saveBackup({ withMedia = true, relocation = false } = {}) {
  const p = await pkg({ withMedia, relocation });
  const day = new Date().toLocaleDateString("sv-SE");
  download(JSON.stringify(p), relocation ? `fer-agent-move-${day}.json` : `fer-agent-backup-${day}.json`);
  store.set(K.lastBackup, String(Date.now()));
  if (brain.ad) await writeBuilding(brain.ad).catch(() => {});
  renderBackupTop();
  toast(relocation ? "Move prepared: open the new website and in Settings → Moving load this file." : (Object.keys(p.media || {}).length ? tr(`Backup saved in your downloads with ${Object.keys(p.media).length} images and music tracks.`) : tr("Backup saved in your downloads.")));
}
async function loadBackup(text) {
  let d; try { d = readBackupFile(JSON.parse(text)); } catch { d = null; }
  if (!d || !d.building) throw Object.assign(new Error("That file isn't a Fer Agent backup."), { shown: true });
  await Motor.run({ type: "import", state: d.building });
  let n = 0;
  if (d && d.media && mode === "local") for (const [id, x] of Object.entries(d.media)) { await idb.put("media", id, x); mediaCache.set(id, x.url); n++; }
  if (d && d.relocation && d.preferences) {
    const pr = d.preferences;
    if (pr.speaker) store.set(K.speaker, pr.speaker);
    if (pr.language) store.set(K.language, pr.language);
    if (pr.folder && !store.get(K.folder)) store.set(K.folder, JSON.stringify(pr.folder));
  }
  return { media: n, relocation: !!(d && d.relocation) };
}

// =====================================================================
// Events
// =====================================================================
$("tabEdificio").onclick = () => showTab("building");
$("cerrarPanel").onclick = () => closePanel();
$("abrirActividad").onclick = () => openPanel("actividad");
$("abrirSerie").onclick = () => openScreen("builtIn");
$("tabFicha").onclick = () => showTab("profile");
$("tabActividad").onclick = () => showTab("actividad");
$("actTodo").onclick = () => { activityView = "all"; renderLog(); };
$("actJev").onclick = () => { activityView = "jev"; renderLog(); };
$("abrirAjustes").onclick = () => openDrawer("settings");
$("medidor").onclick = () => openDrawer("spending");
$("hablarJefe").onclick = () => { const j = ed.boss(); if (j) openChat(j.id); };
$("abrirMes").onclick = () => openScreen("month");
$("abrirSalas").onclick = () => openMeetingRooms();
$("verDibujo").onclick = () => Motor.run({ type: "settings", changes: { buildingView: "drawing" } }).then(render).catch(warn);
$("verFranjas").onclick = () => Motor.run({ type: "settings", changes: { buildingView: "strips" } }).then(render).catch(warn);
$("crearPiso").onclick = () => openDrawer("storey");
$("crearAgente").onclick = () => openDrawer("agent", {});
$("cerrarCajon").onclick = goBack;
$("velo").onclick = goBack;
$("cerrarChat").onclick = goBack;
$("irPortada").onclick = showHome;
$("volverPortada").onclick = showHome;
$("abrirBandeja").onclick = () => openScreen("inbox");
$("pausa").onclick = () => { const p = !ed.e.settings.pause; Motor.run({ type: "pause", pause: p }).then(() => { render(); toast(p ? "General pause on: nothing that spends wakes up on its own." : "Automatic work running: heartbeats are working again."); }).catch(warn); };
$("copiaRapida").onclick = () => saveBackup({ withMedia: true }).catch(warn);
$("pararVoz").onclick = () => stopAudio();
$("verFichaChat").onclick = () => { const a = chatAgent(); closeChat(); if (a) { profileTab = "identity"; choose(a); } };
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || homeVisible()) return;
  if (!$("cajon").hidden || chatId || screen || openFloorId) goBack();
});
$("nuevaConv").onclick = () => { stopAudio(); pendingErrors = []; const a = chatAgent(); Motor.run({ type: "conversation.new", id: a ? a.id : undefined }).then(() => renderChat(true)); };
$("enviar").onclick = () => { unlockAudio(); send(); };
$("texto").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); unlockAudio(); send(); } });
$("texto").addEventListener("input", grow);
$("micro").onclick = () => { unlockAudio(); if (conv.on) hangUp(); else startConversation(); };
$("altavoz").onclick = () => { const on = !speakerOn(); $("altavoz").setAttribute("aria-pressed", String(on)); store.set(K.speaker, on ? "1" : "0"); if (on) unlockAudio(); else stopAudio(); };
$("marcoJefe").onclick = () => { if (bossState === "speaking") stopAudio(); };
$("clip").onclick = () => $("fichero").click();
$("fichero").onchange = (ev) => {
  const f = ev.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {   // it's reduced to 1280 px so it's cheap to look at
    const img = new Image();
    img.onload = () => { const s = Math.min(1, 1280 / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); attachment = c.toDataURL("image/jpeg", 0.85); $("adjuntoImg").src = attachment; $("adjunto").hidden = false; };
    img.src = r.result;
  };
  r.readAsDataURL(f); ev.target.value = "";
};
$("quitarAdjunto").onclick = removeAttachment;
try { if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => { if (drawerType === "settings") renderSettings(); }; } catch {}

// =====================================================================
// Start-up
// =====================================================================
async function singleTab() {
  if (!navigator.locks) return true;
  // the first tab keeps the «lock» while it's open
  const isMine = await new Promise((res) => {
    navigator.locks.request("fer-edificio-pestana", { ifAvailable: true }, (l) => { res(!!l); if (l) return new Promise(() => {}); }).catch(() => res(true));
  });
  if (isMine) return true;
  document.body.append(h("div", { class: "otra-pestana", role: "alertdialog", "aria-labelledby": "otraT" },
    h("div", {}, h("h2", { id: "otraT" }, "The building is already open in another tab"),
      h("p", {}, "Use it there. If you open it in two tabs at once, one can undo what the other does and some work would be paid for twice."),
      h("p", { class: "nota" }, "If you close the other one, this one opens by itself."))));
  navigator.locks.request("fer-edificio-pestana", () => { location.reload(); return new Promise(() => {}); });
  return false;
}
// Changing language: this person chooses it, the building moves to that language and the website reopens
async function changeLanguage(id) {
  saveLanguage(id);
  if (ed && ed.e && Array.isArray(ed.e.agents) && ed.e.agents.length) { try { await Motor.run({ type: "language", language: id }); } catch {} }
  location.reload();
}
// On opening: if this person chose a language, their building moves to it; if they didn't, the building's rules
async function syncLanguage() {
  if (!ed || !ed.e || !Array.isArray(ed.e.agents) || !ed.e.agents.length) return;
  let byAddress = false; try { byAddress = !!new URLSearchParams(location.search).get("lang"); } catch {}
  const fromBuilding = ed.e.language || "es";
  if (byAddress || fromBuilding === language || !LANGUAGES[language]) return;
  if (savedLanguage()) { try { await Motor.run({ type: "language", language }); } catch {} return; }
  try { if (sessionStorage.getItem("ferAgent.languageReload")) return; sessionStorage.setItem("ferAgent.languageReload", "1"); } catch { return; }
  saveLanguage(fromBuilding); location.reload();
}
(async function boot() {
  let fromBuilding = "";
  try { const t = localStorage.getItem(K.state); if (t) { const s = JSON.parse(t); fromBuilding = s.language || s.idioma || "es"; } } catch {}
  await loadLanguage(fromBuilding);
  setLanguage(language);
  translatePage(document.body);
  $("version").textContent = VERSION;
  try { history.replaceState({ v: "landing", n: 0 }, ""); } catch {}
  const enter = () => { hideHome(); markNav(); };
  renderLanding($("landing"), { h, enter, figure: (look, img) => { ensureFigure(look).then((u) => { img.src = u; }); }, languages: LANGUAGES, language, changeLanguage });
  $("altavoz").setAttribute("aria-pressed", String(store.get(K.speaker, "0") === "1"));
  const home = await detectHome();
  const lists = loadLists();
  if (home) {
    mode = "home";
    ed = new Building({ load: async () => null, save: async () => {}, key: () => "" });
    ed.e = null;
    await lists; ed.setModels(models);
    await refreshHome();
    if (!ed.e) { ed.e = { name: "Fer Home", settings: { pause: true }, floors: [], agents: [], longMemory: [], conversation: [], log: [], proposals: [], coins: [], lessons: [], meetings: [], jevQueries: [], modelProposals: [], approvals: [] }; openDrawer("settings"); }
    setInterval(async () => { await refreshHome(); beatAntenna(); }, 5000);
  } else {
    if (!(await singleTab())) return;
    ed = new Building({
      load: async () => store.get(K.state, null),
      save: async (json) => {
        try { localStorage.setItem(K.state, json); fullNotice = false; }
        catch {
          // if it doesn't fit, Techie's backup is sacrificed first (another can be downloaded in Settings) and it's retried
          try { if (localStorage.getItem(K.backup)) { localStorage.removeItem(K.backup); localStorage.setItem(K.state, json); fullNotice = false; return; } } catch {}
          if (!fullNotice) { fullNotice = true; pendingErrors.push("The building couldn't be saved: this browser's storage is full. Download a backup in Settings and delete old tasks or memories."); renderChat(true); } }
      },
      key: () => store.get(K.key),
      keys: () => Object.fromEntries((ed ? ed.connections() : []).map((c) => [c.id, store.get(apiKey(c.id))]).filter((x) => x[1])),
      saveMedia: async (id, url, type, text) => { mediaCache.set(id, url); await idb.put("media", id, { id, url, type, text: String(text || "").slice(0, 300), ts: Date.now() }); },
      // Techie saves a backup in this browser on Fridays (if it fits); you can also download it in Settings.
      backup: async (json, day) => {
        if (day === "before-v5") { localStorage.setItem(K.v4, json); return; }   // the version 4 building, as it was
        if (day === "before-v9") { await idb.put("kv", "beforeV9", json); return; }   // the building from before version 9, as it was
        const e = JSON.parse(json);   // everyone's configuration (without conversation, log or short memory)
        delete e.conversation; delete e.log; for (const a of e.agents || []) { a.shortMemory = []; a.tasks = (a.tasks || []).filter((t) => t.state === "pending"); }
        const txt = JSON.stringify(e);
        if (txt.length > 1e6) throw new Error("the building is too big to store in the browser; download the backup in Settings");
        localStorage.setItem(K.backup, JSON.stringify({ day, json: txt }));
      },
      onChange: (ev) => {
        if (ev.type === "media" || ev.type === "images") { for (const im of ev.images || []) { sessionImages.set(im.text, im.url); if (im.id) mediaCache.set(im.id, im.url); } for (const au of ev.audios || []) { sessionAudios.set(au.text, au.url); if (au.id) mediaCache.set(au.id, au.url); } if (chatId) renderChat(true); }
        if (ev.type === "memory" || ev.type === "state") brainChange(ev.type);
        render();
      }
    });
    await Promise.race([lists, sleep(6000)]);
    ed.setModels(models);
    await ed.start("empty", language);   // a new building starts with only the boss (the rest, in «Built-in agents»), in this person's language
    if (mode === "local") beforeV9 = (await idb.get("kv", "beforeV9")) || null;
    // The previous version's boss look (saved in this browser) goes to its profile once.
    const look = store.json(K.look, null), j = ed.boss();
    if (look) {   // saved before version 9 (Spanish names)
      if (look.pasado !== undefined) look.moved = look.pasado;
      const p = { chico: "boy", chica: "girl", abuelo: "grandpa", abuela: "grandma" }[look.p];
      if (p) { const c = look[look.p] || {}; look[p] = { clothes: c.ropa, eyes: c.ojos, hair: c.pelo, skin: c.piel }; look.p = p; }
    }
    if (look && j && !look.moved && look.p && noColours(normLook(j.look)) && normLook(j.look).p === "boy") {
      await ed.run({ type: "editAgent", id: j.id, changes: { look: Object.assign({ p: look.p }, look[look.p] || {}) } }).catch(() => {});
      look.moved = true; store.set(K.look, JSON.stringify(look));
    }
    lists.then(() => { ed.setModels(models); render(); });
    // the building's heartbeat: every 20 seconds it checks whose turn it is to wake up
    // If the website is open in several tabs, only one makes the building beat (so nothing is spent twice).
    const beat = async () => {
      beatAntenna(); if (!hasAccess()) return;
      const work = async () => { try { await ed.tick(); } catch {} };
      try { if (navigator.locks) await navigator.locks.request("fer-edificio-latido", { ifAvailable: true }, async (l) => { if (l) await work(); }); else await work(); } catch { await work(); }
      render();
    };
    window.addEventListener("storage", (ev) => {   // another tab changed the building: its version is loaded
      if (ev.key !== K.state || !ev.newValue || thinking || ed.busyIds.size) return;
      try { ed.e = JSON.parse(ev.newValue); ed.repair(); render(); if (chatId) renderChat(true); } catch {}
    });
    setTimeout(beat, 2500); setInterval(beat, 20000);
  }
  await syncLanguage();
  if (!ed.e.settings.imageModel && imageModels.length) {
    const cheap = imageModels.slice().sort((x, y) => (n0(x.pricing.image) + n0(x.pricing.prompt)) - (n0(y.pricing.image) + n0(y.pricing.prompt)))[0];
    await Motor.run({ type: "settings", changes: { imageModel: cheap.id } }).catch(() => {});
  }
  if (!ed.e.settings.musicModel && byType.music.length) {   // music: Lyria if it's there; if not, the cheapest
    const lyria = byType.music.find((m) => /lyria/i.test(m.id) && /clip/i.test(m.id)) || byType.music.find((m) => /lyria/i.test(m.id));
    const cheapest = byType.music.slice().sort((x, y) => (n0(x.pricing && x.pricing.request) + n0(x.pricing && x.pricing.prompt)) - (n0(y.pricing && y.pricing.request) + n0(y.pricing && y.pricing.prompt)))[0];
    await Motor.run({ type: "settings", changes: { musicModel: (lyria || cheapest).id } }).catch(() => {});
  }
  if (!ed.e.settings.voiceModel && voices.length) {
    const pref = ["google/gemini-3.8-flash-lite-tts", "microsoft/mai-voice-2.1-flash", "hexgrad/kokoro-82m"].find((id) => voices.some((v) => v.id === id));
    if (pref) Motor.run({ type: "settings", changes: { voiceModel: pref, specificVoice: ((voices.find((v) => v.id === pref) || {}).voices || [])[0]?.id || "" } }).catch(() => {});
  }
  microUI();
  await Promise.all(ed.e.agents.map((a) => ensureFigure(a.look))).catch(() => {});
  if (mode === "local") startBrain().catch(() => {});   // the brain folder (Drive or the one on this computer), if you connected it
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && brain.ad) syncBrain(); });
  showTab(window.innerWidth <= 900 ? "building" : "profile");
  render();
  if (!hasAccess()) openDrawer("settings");
})();
