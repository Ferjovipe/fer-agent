#!/usr/bin/env node
// =====================================================================
// Fer Casa — el mismo edificio, encendido las 24 horas.
// Funciona en un ordenador (Mac, Windows, Linux), en un móvil Android con
// Termux o en un servidor alquilado. Solo necesita Node 18 o más nuevo.
//
//   node fer-casa.mjs
//
// La primera vez te pide la clave de OpenRouter y un PIN, y los guarda en la
// carpeta «datos». Después abre la dirección que te enseña en el navegador.
//
// Más órdenes (versión 7):
//   node fer-casa.mjs claves        → claves de Claude, OpenAI y Grok (cerebros directos)
//   node fer-casa.mjs carpeta       → dónde vive el cerebro (Biblioteca, Memoria larga y la copia)
//   node fer-casa.mjs telegram      → conectar Telegram: la bandeja y los avisos en el móvil
//   node fer-casa.mjs entrar [web]  → abrir el Chrome de los agentes para que entres tú una vez (por ejemplo, en X)
// =====================================================================
import http from "node:http";
import fs from "node:fs/promises";
import { readFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { Edificio, VERSION, fmt, notasMemoriaMd, PROVEEDORES, filtrarModelosApi } from "./engine.js";
import { crearManos } from "./manos.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DATOS = process.env.FER_DATOS || path.join(AQUI, "datos");
const API = (process.env.OPENROUTER_BASE || "https://openrouter.ai/api/v1").replace(/\/$/, "");
const PUERTO = Number(process.env.FER_PUERTO || 8787);
const LATIDO_SEG = Math.max(1, Number(process.env.FER_LATIDO_SEG || 20));
const ARCHIVOS = { "/": "index.html", "/index.html": "index.html", "/app.js": "app.js", "/engine.js": "engine.js", "/personajes.js": "personajes.js", "/textos.js": "textos.js", "/landing.js": "landing.js" };
// las imágenes del edificio y de los personajes (solo estas: no se sirve ningún otro archivo de la carpeta)
for (const f of ["portada", "cupula", "cupula2x", "piso", "piso2x", "vestibulo", "vestibulo2x", "pj-chico", "pj-chica", "pj-abuelo", "pj-abuela",
  "pj-morado", "pj-verde", "pj-coral", "pj-azul", "pj-turquesa", "pj-camisa"]) ARCHIVOS["/img/" + f + ".webp"] = "img/" + f + ".webp";
for (const f of ["chico", "chica", "abuelo", "abuela"]) ARCHIVOS["/img/pj-" + f + "-zonas.png"] = "img/pj-" + f + "-zonas.png";
// las traducciones que haya en la carpeta textos/ (es.js, en.js…)
try { for (const f of readdirSync(path.join(AQUI, "textos"))) if (/^[a-z-]{2,8}\.js$/.test(f)) ARCHIVOS["/textos/" + f] = "textos/" + f; } catch {}
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".webp": "image/webp", ".png": "image/png" };
const ORDEN = (process.argv[2] || "").toLowerCase();

mkdirSync(DATOS, { recursive: true });
const ARCHIVO_CONF = path.join(DATOS, "config.json");
// Direcciones de las API (solo para pruebas: FER_API_<ID>=…; las de siempre, ANTHROPIC_BASE, OPENAI_BASE y XAI_BASE)
const APIS = Object.assign({ anthropic: process.env.ANTHROPIC_BASE, openai: process.env.OPENAI_BASE, xai: process.env.XAI_BASE },
  Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith("FER_API_")).map(([k, v]) => [k.slice(8).toLowerCase(), v])));
const ARCHIVO_ESTADO = path.join(DATOS, "edificio.json");
const hora = () => new Date().toLocaleTimeString("es-ES");
const log = (...a) => console.log(`[${hora()}]`, ...a);

// ---------------- Configuración (clave y PIN) ----------------
async function configuracion() {
  let conf = {};
  try { conf = JSON.parse(readFileSync(ARCHIVO_CONF, "utf8")); } catch {}
  if (process.env.OPENROUTER_API_KEY) conf.clave = process.env.OPENROUTER_API_KEY;
  if (process.env.FER_PIN) conf.pin = process.env.FER_PIN;
  if (conf.pin && String(conf.pin).length < 8) {
    if (process.stdin.isTTY) { console.log("El PIN guardado es demasiado corto (mínimo 8). Elige otro."); conf.pin = ""; }
    else { console.error("El PIN debe tener al menos 8 cifras o letras. Ejecuta «node fer-casa.mjs» a mano para cambiarlo."); process.exit(1); }
  }
  if (!conf.clave || !conf.pin) {
    if (!process.stdin.isTTY) { console.error("Falta la clave o el PIN. Ejecuta una vez «node fer-casa.mjs» a mano para configurarlo."); process.exit(1); }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log("\nFer Casa · primera vez\n");
    while (!conf.clave || !conf.clave.startsWith("sk-")) conf.clave = (await rl.question("Pega tu clave de OpenRouter (empieza por sk-or-): ")).trim();
    while (!conf.pin || conf.pin.length < 8) conf.pin = (await rl.question("Elige un PIN de al menos 8 cifras o letras (te lo pedirá la web): ")).trim();
    rl.close();
    await guardarConf(conf);
    console.log("Guardado en " + ARCHIVO_CONF + " (solo lo lee tu usuario).\n");
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
// Preguntas en la terminal (claves, carpeta, Telegram)
async function preguntar(texto, rl) { return (await rl.question(texto)).trim(); }
async function ordenClaves(conf) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log("\nOtras API (las de tus suscripciones). Pega cada clave (o pulsa Intro para dejarla como está; escribe «borrar» para quitarla).");
  console.log("Se guardan solo en " + ARCHIVO_CONF + " y solo viajan a la dirección de cada API.\n");
  // las conocidas y las que hayas añadido en la web (Ajustes → Otras API)
  let propias = [];
  try { propias = ((JSON.parse(readFileSync(ARCHIVO_ESTADO, "utf8")).ajustes || {}).conexiones || []).filter((c) => c && c.api && c.id && !PROVEEDORES[c.id]); } catch {}
  const lista = [...Object.entries(PROVEEDORES).filter(([k, P]) => k !== "openrouter" && !P.sinClave).map(([k, P]) => [k, `${P.nombre}${P.web ? " (" + P.web + ")" : ""}`]),
    ...propias.map((c) => [c.id, `${c.nombre || c.id} (${c.api})`])];
  for (const [prov, nombre] of lista) {
    const v = await preguntar(`${nombre} [${conf.claves[prov] ? "puesta" : "sin clave"}]: `, rl);
    if (v === "borrar") delete conf.claves[prov]; else if (v) conf.claves[prov] = v;
  }
  rl.close(); await guardarConf(conf); console.log("Guardado.\n");
}
async function ordenCarpeta(conf) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log("\nCarpeta del cerebro: dentro habrá «Biblioteca», «Memoria larga» y «edificio.json».");
  console.log("Si quieres tenerla también en Google Drive y en Obsidian, elige una carpeta dentro de Google Drive para ordenador");
  console.log("(en un Mac suele estar en /Users/TU_USUARIO/Library/CloudStorage/GoogleDrive-…/Mi unidad/Fer Agent).");
  const v = await preguntar(`Ruta completa [ahora: ${conf.carpetaCerebro || path.join(DATOS, "cerebro")}]: `, rl);
  const v2 = await preguntar(`Carpeta de los agentes, donde leen y escriben sus archivos [ahora: ${conf.carpetaAgentes || path.join(DATOS, "carpeta-agentes")}]: `, rl);
  rl.close();
  if (v) { mkdirSync(v, { recursive: true }); conf.carpetaCerebro = path.resolve(v); }
  if (v2) { mkdirSync(v2, { recursive: true }); conf.carpetaAgentes = path.resolve(v2); }
  await guardarConf(conf); console.log("Guardado.\n");
}
async function ordenTelegram(conf) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log("\nTelegram: la bandeja y los avisos en el móvil, con botones para aprobar o rechazar.");
  console.log("1. En Telegram, habla con @BotFather, escribe /newbot y sigue los pasos. Te da un «token».");
  const token = await preguntar("2. Pega aquí el token (o «borrar» para desconectar): ", rl);
  if (token === "borrar") { conf.telegram = null; rl.close(); await guardarConf(conf); console.log("Telegram desconectado.\n"); return; }
  if (!token) { rl.close(); return; }
  console.log("3. Ahora abre tu bot nuevo en Telegram y escríbele /start. Espero hasta 2 minutos…");
  rl.close();
  const api = (m) => `${TELEGRAM}/bot${token}/${m}`;
  let chat = null;
  for (let i = 0; i < 24 && !chat; i++) {
    try { const d = await (await fetch(api("getUpdates?timeout=5"))).json(); const u = (d.result || []).reverse().find((x) => x.message && x.message.chat); if (u) chat = u.message.chat.id; } catch {}
    if (!chat) await new Promise((r) => setTimeout(r, 5000));
  }
  if (!chat) { console.log("No llegó tu /start. Vuelve a probar: node fer-casa.mjs telegram\n"); return; }
  conf.telegram = { token, chat };
  await guardarConf(conf);
  await fetch(api("sendMessage"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: "Fer Casa conectado. Aquí te llegarán la bandeja y los avisos. Órdenes: /bandeja, /pausa, /marcha." }) }).catch(() => {});
  console.log("Conectado. Solo hará caso a este chat.\n");
}

// ---------------- Arranque del motor ----------------
const TELEGRAM = (process.env.TELEGRAM_API || "https://api.telegram.org").replace(/\/$/, "");
const conf = await configuracion();
if (ORDEN === "claves") { await ordenClaves(conf); process.exit(0); }
if (ORDEN === "carpeta") { await ordenCarpeta(conf); process.exit(0); }
if (ORDEN === "telegram") { await ordenTelegram(conf); process.exit(0); }
const CARPETA_CEREBRO = conf.carpetaCerebro || path.join(DATOS, "cerebro");
const CARPETA_AGENTES = conf.carpetaAgentes || path.join(DATOS, "carpeta-agentes");
const MEDIOS = path.join(DATOS, "medios");
mkdirSync(MEDIOS, { recursive: true });
// Las manos: el Chrome de los agentes, su carpeta y las skills (las de Fer Agent y las tuyas en datos/skills)
const manos = crearManos({ carpetaAgentes: CARPETA_AGENTES, perfilChrome: path.join(DATOS, "chrome-agentes"), carpetasSkills: [path.join(AQUI, "skills"), path.join(DATOS, "skills")],
  visible: !!conf.manosVisibles || process.env.FER_MANOS_VISIBLES === "1", canal: process.env.FER_CHROME_CANAL || "chrome", log: (...a) => log(...a) });
if (ORDEN === "entrar") {
  const url = process.argv[3] || "https://x.com/login";
  console.log(`\nAbro el Chrome de los agentes en ${url}. Entra con tu cuenta y, cuando acabes, cierra esa ventana de Chrome.\n`);
  const ctx = await manos.abrirVisible(url);
  await new Promise((r) => ctx.on("close", r));
  console.log("Listo: la sesión queda guardada en el perfil de los agentes.\n");
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
  // las imágenes y la música se guardan en datos/medios (no se pierden)
  guardarMedio: async (id, url, tipo) => {
    const m = String(url).match(/^data:([^;]+);base64,(.*)$/s);
    if (!m || !/^med_[a-z0-9]+$/i.test(id)) return;
    const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg", "audio/flac": "flac" }[m[1]] || "bin";
    await fs.writeFile(path.join(MEDIOS, `${id}.${ext}`), Buffer.from(m[2], "base64"));
  },
  alCambiar: (ev) => avisoMotor(ev),
  // Tecno guarda los viernes una copia del edificio en datos/copias (se quedan las 8 últimas)
  copia: async (json, dia) => {
    await fs.mkdir(COPIAS, { recursive: true });
    await fs.writeFile(path.join(COPIAS, `edificio-${dia}.json`), json, { mode: 0o600 });
    const viejas = (await fs.readdir(COPIAS)).filter((f) => /^edificio-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(0, -8);
    for (const f of viejas) await fs.unlink(path.join(COPIAS, f)).catch(() => {});
    log(`Tecno guardó una copia: datos/copias/edificio-${dia}.json`);
  },
  cargar: async () => (existsSync(ARCHIVO_ESTADO) ? fs.readFile(ARCHIVO_ESTADO, "utf8") : null),
  guardar: async (json) => {   // escritura segura: primero a un archivo temporal y luego se cambia el nombre
    guardando = guardando.then(async () => { const tmp = ARCHIVO_ESTADO + ".tmp"; await fs.writeFile(tmp, json); await fs.rename(tmp, ARCHIVO_ESTADO); }).catch((e) => log("No pude guardar:", e.message));
    await guardando;
  }
});
async function cargarModelos() {
  try {
    // todos los modelos (texto, imagen, música, voz, oído…); si esa consulta falla, solo los de texto
    let lista = [];
    try { const r = await fetch(API + "/models?output_modalities=all"); if (r.ok) lista = (await r.json()).data || []; } catch {}
    if (!lista.length) { const r = await fetch(API + "/models"); if (r.ok) lista = (await r.json()).data || []; }
    if (lista.length) { ed.setModelos(lista); log(`Lista de modelos de OpenRouter: ${ed.modelos.length}.`); }
  }
  catch (e) { log("No pude leer la lista de modelos:", e.message); }
}
await cargarModelos();
await ed.iniciar(process.env.FER_PLANTILLA || "vacio", process.env.FER_IDIOMA || "es");   // un edificio nuevo empieza solo con el jefe (FER_IDIOMA=en: en inglés)
log(`Edificio «${ed.e.nombre}» con ${ed.e.agentes.length} agentes. Gasto de hoy: ${fmt(ed.gastoEdificio("hoy"))}.`);
log(ed.e.ajustes.pausa ? "Pausa general puesta: nada que gaste se despierta solo (se quita en la web, junto al contador, o con /marcha en Telegram)." : "Automático en marcha.");
log(`Manos: ${manos.catalogo().map((k) => k.nombre).join(", ") || "ninguna skill"}. Carpeta de los agentes: ${CARPETA_AGENTES}`);
setInterval(cargarModelos, 6 * 3600e3).unref();

// ---------------- El cerebro en una carpeta (Biblioteca, Memoria larga y la copia del edificio) ----------------
// Si la carpeta está dentro de Google Drive para ordenador, también está en Drive y la abres con Obsidian.
const cerebro = { escritos: new Map(), vistos: new Map(), ultimaSync: 0, notas: 0, biblioteca: 0, ocupado: false, cambios: 0, error: "", primera: true };
// cuándo fue la última vez que se juntó con la carpeta (se guarda: al reiniciar Fer Casa, lo que borraste en Obsidian no vuelve)
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
    const memDir = path.join(CARPETA_CEREBRO, "Memoria larga"), bibDir = path.join(CARPETA_CEREBRO, "Biblioteca");
    await fs.mkdir(memDir, { recursive: true }); await fs.mkdir(bibDir, { recursive: true });
    // Antes de escribir nada, lo que corregiste a mano en Obsidian entra (sin perder lo apuntado aquí desde la última vez)
    for (const x of await listarMd(memDir, false)) {
      if (x.ruta === "Índice.md" || (cerebro.vistos.get(x.f) || 0) >= x.modificado) continue;
      const texto = await fs.readFile(x.f, "utf8");
      cerebro.vistos.set(x.f, x.modificado);
      if (cerebro.escritos.get(x.f) === texto) continue;
      await ed.ejecutar({ tipo: "memoria.importar", tema: x.ruta.replace(/\.md$/i, ""), texto, conservarDesde: cerebro.ultimaSync });
      log(`Memoria larga: leído lo que cambiaste en «${x.ruta}».`);
    }
    if (!soloEscribir) {
      const docs = [];
      for (const x of await listarMd(bibDir, true)) docs.push({ ruta: "Biblioteca/" + x.ruta, titulo: x.ruta.split("/").pop().replace(/\.(md|txt)$/i, ""), texto: (await fs.readFile(x.f, "utf8")).slice(0, 300000) });
      ed.setBiblioteca(docs); cerebro.biblioteca = docs.length;
    }
    const nombres = Object.fromEntries(ed.e.agentes.map((a) => [a.id, a.nombre]));
    const notas = notasMemoriaMd(ed.e.memoriaLarga, nombres);
    for (const n of notas) {
      const f = path.join(CARPETA_CEREBRO, ...n.ruta.split("/"));
      if (cerebro.escritos.get(f) === n.texto) continue;
      await fs.writeFile(f, n.texto);
      cerebro.escritos.set(f, n.texto);
      const st = await fs.stat(f).catch(() => null); if (st) cerebro.vistos.set(f, st.mtimeMs);
    }
    cerebro.notas = notas.length - 1;
    if (cerebro.cambios || cerebro.primera) {
      const tmp = path.join(CARPETA_CEREBRO, "edificio.json.tmp");
      await fs.writeFile(tmp, JSON.stringify({ tipo: "fer-agent-edificio", version: VERSION, aparato: "fer-casa", ts: Date.now(), edificio: ed.e }));
      await fs.rename(tmp, path.join(CARPETA_CEREBRO, "edificio.json"));
      cerebro.cambios = 0; cerebro.primera = false;
    }
    cerebro.ultimaSync = Date.now(); cerebro.error = "";
    await fs.writeFile(ARCHIVO_SYNC, JSON.stringify({ carpeta: CARPETA_CEREBRO, ultimaSync: cerebro.ultimaSync })).catch(() => {});
  } catch (e) { cerebro.error = e.message; log("Cerebro: " + e.message); }
  finally { cerebro.ocupado = false; if (cerebro.otraVez) { cerebro.otraVez = false; setTimeout(() => sincronizarCerebro(true), 500); } }
}
await sincronizarCerebro();
setInterval(() => sincronizarCerebro(), Math.max(2, Number(process.env.FER_CEREBRO_SEG || 120)) * 1000).unref();
let esperaCerebro = null, cuandoCerebro = 0, esperaBandeja = null;

// ---------------- Avisos del motor: la carpeta del cerebro y Telegram ----------------
function avisoMotor(ev) {
  if (ev.tipo === "estado") cerebro.cambios++;
  if (ev.tipo === "memoria" || ev.tipo === "estado") {
    const cuando = Date.now() + (ev.tipo === "memoria" ? 4000 : 30000);
    if (!esperaCerebro || cuando < cuandoCerebro) { clearTimeout(esperaCerebro); cuandoCerebro = cuando; esperaCerebro = setTimeout(() => { esperaCerebro = null; sincronizarCerebro(true); }, cuando - Date.now()); }
  }
  // cualquier cambio puede traer algo nuevo a la bandeja (agentes del Creador, monedas, lecciones, reuniones, modelos…): se mira todo junto
  if (ev.tipo === "bandeja" || ev.tipo === "estado") { clearTimeout(esperaBandeja); esperaBandeja = setTimeout(() => avisarBandeja().catch(() => {}), ev.tipo === "bandeja" ? 300 : 1000); }
  if (ev.tipo === "skill") telegramMandar(`${ev.nombre} (${ev.skill}):\n\n${String(ev.texto).slice(0, 3800)}`);
}

// ---------------- Telegram: la bandeja en el móvil (solo hace caso a tu chat) ----------------
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
const CLASE = { accion: "Acción fuera de la web", agente: "Agente nuevo", reunion: "Reunión", moneda: "Moneda", leccion: "Lección nueva", modelo: "Modelo recomendado", falta: "Le falta algo" };
function textoPeticion(x) {
  const coste = ["falta", "moneda", "leccion", "modelo"].includes(x.clase) ? "" : x.coste > 0 ? ` · ≈${fmt(x.coste)}${x.porDia ? " al día" : ""}` : "";
  return `${CLASE[x.clase] || x.clase} · ${x.quien}${coste}\n${x.que}${x.detalle ? "\n\n" + String(x.detalle).slice(0, 1200) : ""}`;
}
// las claves de los botones de Telegram (cortas: máximo 64 letras)
const clavesBotones = new Map();
function botonesDe(x, soloNo) {
  const k = Math.random().toString(36).slice(2, 10);
  clavesBotones.set(k, { clase: x.clase, id: x.id, rondas: x.rondas });
  if (clavesBotones.size > 500) clavesBotones.delete(clavesBotones.keys().next().value);
  const si = { accion: "Aprobar y hacerlo", reunion: "Empezar la reunión", falta: "Ya lo tiene", moneda: "Confirmar", agente: "Crear" }[x.clase] || "Aprobar";
  const no = { text: "✖️ " + (x.clase === "falta" ? "Luego" : "Rechazar"), callback_data: "no:" + k };
  return [soloNo ? [no] : [{ text: "✅ " + si, callback_data: "si:" + k }, no]];
}
// Una petición al móvil. Si es una acción larga, lo que se va a hacer va en varios mensajes antes de los botones
// (hasta 6; si hay más, se dice cuánto falta y está entero en la bandeja de la web).
async function mandarPeticion(x) {
  const det = String(x.detalle || "");
  if (x.clase !== "accion" || det.length <= 1200) return telegramMandar(textoPeticion(x), botonesDe(x));
  const cab = `${CLASE[x.clase]} · ${x.quien}\n${x.que}`;
  const n = Math.min(6, Math.ceil(det.length / 3500)), resto = det.length - n * 3500;
  for (let i = 0; i < n; i++) await telegramMandar(`(${i + 1}/${n}) ${det.slice(i * 3500, (i + 1) * 3500)}`);
  return telegramMandar(`${cab}\n\n(lo que hará, en los ${n} mensajes de arriba${resto > 0 ? `; faltan ${resto.toLocaleString("es-ES")} letras, enteras en la bandeja de la web` : ""})`, botonesDe(x));
}
const claveAviso = (x) => x.clase + ":" + x.id + ":" + (x.ts || 0);   // con la hora: si un agente vuelve a decir que le falta algo, se avisa otra vez
async function avisarBandeja() {
  if (!tg) return;
  const ahora = ed.bandeja(), siguen = new Set(ahora.map(claveAviso));
  for (const k of [...avisados]) if (!siguen.has(k)) avisados.delete(k);   // lo ya decidido se olvida
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
  log("Telegram conectado: la bandeja y los avisos llegan a tu móvil.");
  for (const x of ed.bandeja()) avisados.add(claveAviso(x));   // lo que ya estaba pendiente no se repite al arrancar
  let espera = 0, ultimoFallo = "";
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  for (;;) {
    let d = null;
    const t0 = Date.now();
    try { d = await (await fetch(`${TELEGRAM}/bot${tg.token}/getUpdates?timeout=50&offset=${desde}`)).json(); } catch { d = null; }
    if (!d || d.ok === false) {
      // Si Telegram dice que no (token malo, otro programa leyendo el mismo bot…) o no hay red: se espera cada vez más (hasta 5 min), sin martillear
      const motivo = d ? `${d.error_code || ""} ${d.description || ""}`.trim() : "sin conexión";
      if (motivo !== ultimoFallo) log(`Telegram: ${motivo}. ` + (d && d.error_code === 401 ? "El token no vale: vuelve a escribir node fer-casa.mjs telegram." : d && d.error_code === 409 ? "Otro programa está leyendo este mismo bot." : "Lo reintento solo."));
      ultimoFallo = motivo; espera = Math.min(300000, espera ? espera * 2 : 5000);
      await dormir(espera); continue;
    }
    if (ultimoFallo) log("Telegram vuelve a responder.");
    espera = 0; ultimoFallo = "";
    if (!(d.result || []).length && Date.now() - t0 < 1000) await dormir(1000);   // nunca más de una pregunta por segundo
    for (const u of d.result || []) {
      desde = u.update_id + 1;
      const cb = u.callback_query, msg = u.message;
      const chat = cb ? cb.message && cb.message.chat && cb.message.chat.id : msg && msg.chat && msg.chat.id;
      if (String(chat) !== String(tg.chat)) continue;   // solo tu chat
      try {
        if (cb) {
          const [r, k] = String(cb.data || "").split(":");
          const x = clavesBotones.get(k);
          let res = "Eso ya no está pendiente (o Fer Casa se reinició: mira la bandeja en la web).";
          if (x) {
            clavesBotones.delete(k);
            if (x.clase === "falta" && r === "no") res = "Queda en la bandeja.";
            else {
              const out = await ed.ejecutar({ tipo: "bandeja.decidir", clase: x.clase, id: x.id, si: r === "si", rondas: x.rondas });
              res = r === "si" ? (out && out.estado === "error" ? "No se pudo: " + out.resultado : "Hecho." + (out && out.resultado ? "\n" + String(out.resultado).slice(0, 1500) : "")) : "Rechazado.";
            }
          }
          await telegram("answerCallbackQuery", { callback_query_id: cb.id, text: res.slice(0, 180) });
          await telegram("editMessageText", { chat_id: chat, message_id: cb.message.message_id, text: (cb.message.text || "") + "\n\n→ " + res });
        } else if (msg && msg.text) {
          const t = msg.text.trim().toLowerCase();
          if (t.startsWith("/bandeja") || t === "/start") {
            const b = ed.bandeja();
            if (!b.length) await telegramMandar("La bandeja está vacía. " + (ed.e.ajustes.pausa ? "El edificio está en pausa general." : "El automático está en marcha."));
            for (const x of b) await mandarPeticion(x);
          } else if (t.startsWith("/pausa")) { await ed.ejecutar({ tipo: "pausa", pausa: true }); await telegramMandar("Pausa general puesta: nada que gaste se despierta solo."); }
          else if (t.startsWith("/marcha")) { await ed.ejecutar({ tipo: "pausa", pausa: false }); await telegramMandar("Automático en marcha: los latidos vuelven a funcionar."); }
          else await telegramMandar("Órdenes: /bandeja (lo que espera tu sí), /pausa (para lo automático), /marcha (lo pone en marcha).");
        }
      } catch (e) { log("Telegram: " + e.message); await telegramMandar("No se pudo: " + e.message); }
    }
  }
}
escucharTelegram();

// ---------------- El latido ----------------
let ultimoVisto = Math.max(0, ...ed.e.registro.map((x) => x.ts)), latiendo = false;
function contarNovedades() {   // escribe en la pantalla lo que han hecho los agentes
  const nuevos = ed.e.registro.filter((x) => x.ts > ultimoVisto);
  for (const x of nuevos.slice(-20)) log(`${x.nombre}: ${x.texto}${x.coste ? " · " + fmt(x.coste) : ""}`);
  if (nuevos.length) ultimoVisto = Math.max(...nuevos.map((x) => x.ts));
}
setInterval(async () => {
  if (latiendo) return;
  latiendo = true;
  try { await ed.tick(); } catch (e) { log("Error en el latido:", e.message); }
  finally { latiendo = false; }
  contarNovedades();
}, LATIDO_SEG * 1000);

// ---------------- El servidor (web + API con PIN) ----------------
const fallos = new Map();   // intentos de PIN fallidos por dirección
let fallosGlobales = [], cerradoHasta = 0;   // freno general por si prueban desde muchas direcciones
function pinValido(req) {
  const ip = req.socket.remoteAddress || "";
  const f = fallos.get(ip) || { n: 0, hasta: 0 };
  if (f.hasta > Date.now() || cerradoHasta > Date.now()) return false;
  if (!req.headers["x-fer-pin"]) return false;            // sin PIN no cuenta como intento (no te bloqueas a ti mismo)
  const dado = Buffer.from(String(req.headers["x-fer-pin"] || ""));
  const bueno = Buffer.from(String(conf.pin));
  const ok = dado.length === bueno.length && crypto.timingSafeEqual(dado, bueno);
  if (!ok) {
    f.n++; if (f.n >= 5) { f.hasta = Date.now() + 60e3; f.n = 0; log(`Demasiados PIN fallidos desde ${ip}: bloqueado 1 minuto.`); } fallos.set(ip, f);
    fallosGlobales = fallosGlobales.filter((t) => t > Date.now() - 600e3); fallosGlobales.push(Date.now());
    if (fallosGlobales.length >= 30) { cerradoHasta = Date.now() + 300e3; fallosGlobales = []; log("30 PIN fallidos en 10 minutos: la API se cierra 5 minutos."); }
  }
  else fallos.delete(ip);
  return ok;
}
function leerCuerpo(req, max = 26e6) {
  return new Promise((res, rej) => {
    const partes = []; let n = 0;
    req.on("data", (c) => { n += c.length; if (n > max) { rej(new Error("demasiado grande")); req.destroy(); } else partes.push(c); });
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
    if (ruta === "/api/hola") return json(res, 200, { ferCasa: true, version: VERSION, nombre: ed.e.nombre });
    if (ruta.startsWith("/api/")) {
      if (!pinValido(req)) { await new Promise((r) => setTimeout(r, 400)); return json(res, 401, { error: "PIN incorrecto" }); }
      if (ruta === "/api/estado" && req.method === "GET") return json(res, 200, { estado: ed.e, ocupados: [...ed.ocupados], skills: manos.catalogo(),
        casa: { telegram: !!tg, claves: Object.fromEntries([...new Set([...Object.keys(PROVEEDORES), ...ed.conexiones().map((c) => c.id)])].filter((k) => k !== "openrouter").map((k) => [k, !!(conf.claves || {})[k]])),
          carpeta: { ruta: CARPETA_CEREBRO, notas: cerebro.notas, biblioteca: cerebro.biblioteca, ultimaSync: cerebro.ultimaSync, error: cerebro.error }, carpetaAgentes: CARPETA_AGENTES } });
      // imágenes y música guardadas
      if (ruta.startsWith("/api/medio/") && req.method === "GET") {
        const id = decodeURIComponent(ruta.slice("/api/medio/".length));
        if (!/^med_[a-z0-9]+$/i.test(id)) return json(res, 400, { error: "No válido." });
        const f = (await fs.readdir(MEDIOS)).find((x) => x.startsWith(id + "."));
        if (!f) return json(res, 404, { error: "No está." });
        const tipo = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac" }[f.split(".").pop()] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": tipo, "Cache-Control": "private, max-age=86400" });
        return res.end(await fs.readFile(path.join(MEDIOS, f)));
      }
      // la lista de modelos de Claude, OpenAI o Grok con tu clave (la clave no sale de Fer Casa)
      if (ruta.startsWith("/api/modelos/") && req.method === "GET") {
        const prov = ruta.slice("/api/modelos/".length), P = ed.proveedor(prov), clave = (conf.claves || {})[prov];
        if (!P || prov === "openrouter") return json(res, 404, { error: "No existe." });
        if (!clave && !P.sinClave) return json(res, 400, { error: `Fer Casa no tiene clave de ${P.corto}. En este ordenador: node fer-casa.mjs claves` });
        const base = (APIS[prov]) || P.api;
        const cab = P.formato === "anthropic" ? { "x-api-key": clave, "anthropic-version": "2023-06-01" } : clave ? { Authorization: "Bearer " + clave } : {};
        let r; try { r = await fetch(base + "/models" + (P.formato === "anthropic" ? "?limit=100" : ""), { headers: cab }); }
        catch (e) { return json(res, 400, { error: `No se pudo hablar con ${P.corto} (${e.message}).` }); }
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return json(res, 400, { error: r.status === 401 || r.status === 403 ? `La clave de ${P.corto} no es válida.` : `${P.corto} respondió ${r.status}` });
        return json(res, 200, { modelos: filtrarModelosApi(prov, d) });
      }
      if (ruta === "/api/accion" && req.method === "POST") {
        let acc; try { acc = JSON.parse((await leerCuerpo(req, 12e6)).toString("utf8")); } catch { return json(res, 400, { error: "Petición ilegible." }); }
        if (acc && acc.tipo === "hablar" && req.headers["x-fer-trozos"] === "1") {
          // por partes: cada trozo de la respuesta sale en cuanto el cerebro lo escribe (una línea JSON por trozo), y al final, el resultado
          res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
          acc.alTrozo = (t) => { try { res.write(JSON.stringify({ trozo: t }) + "\n"); } catch {} };
          try { res.end(JSON.stringify({ fin: await ed.ejecutar(acc) }) + "\n"); }
          catch (e) { res.end(JSON.stringify({ error: e.message }) + "\n"); }
          return;
        }
        try { return json(res, 200, await ed.ejecutar(acc)); }
        catch (e) { return json(res, 400, { error: e.message }); }
      }
      // Pasarela hacia OpenRouter para la voz y el oído: la clave nunca sale de Fer Casa.
      if (ruta.startsWith("/api/or/")) {
        const destino = API + "/" + ruta.slice("/api/or/".length) + url.search;
        if (!/^\/api\/or\/(audio\/speech|audio\/transcriptions|generation)$/.test(ruta)) return json(res, 403, { error: "Ruta no permitida." });
        if (!ruta.endsWith("/generation") && ed.usoPresupuesto() >= 1) return json(res, 402, { error: { message: "Tope de gasto del edificio alcanzado." } });
        const cuerpo = req.method === "GET" ? undefined : await leerCuerpo(req);
        const r = await fetch(destino, { method: req.method, headers: { "Authorization": "Bearer " + conf.clave, "Content-Type": req.headers["content-type"] || "application/json", "X-Title": "Fer Agent Casa" }, body: cuerpo });
        const cab = { "Content-Type": r.headers.get("content-type") || "application/octet-stream", "Cache-Control": "no-store" };
        if (r.headers.get("x-generation-id")) cab["X-Generation-Id"] = r.headers.get("x-generation-id");
        res.writeHead(r.status, cab);
        return res.end(Buffer.from(await r.arrayBuffer()));
      }
      return json(res, 404, { error: "No existe." });
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); res.end("No existe.");
  } catch (e) {
    log("Error:", e.message);
    if (!res.headersSent) json(res, 500, { error: e.message });
  }
});
servidor.listen(PUERTO, "0.0.0.0", () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
  console.log(`\nFer Casa ${VERSION} encendido. El edificio late cada ${LATIDO_SEG} segundos.`);
  console.log(`  Cerebro (Biblioteca, Memoria larga, copia): ${CARPETA_CEREBRO}`);
  console.log(`  En este aparato:     http://localhost:${PUERTO}`);
  for (const ip of ips) console.log(`  Desde tu red de casa: http://${ip}:${PUERTO}`);
  console.log("Para pararlo: Ctrl+C. Los datos quedan en " + DATOS + "\n");
});
const salir = async () => { log("Guardando y saliendo…"); try { await ed.guardar(); } catch {} try { await sincronizarCerebro(true); } catch {} try { await manos.cerrar(); } catch {} process.exit(0); };
process.on("SIGINT", salir);
process.on("unhandledRejection", (e) => log("Aviso:", (e && e.message) || e));   // un fallo suelto no apaga Fer Casa
process.on("SIGTERM", salir);
