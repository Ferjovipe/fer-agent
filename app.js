// =====================================================================
// Fer Agent · El Edificio — LA PANTALLA
// Dibuja la portada, el edificio, las fichas, el chat con cada agente, el gasto, el agente del mes,
// las salas de reuniones y los ajustes. Todos los textos pasan por tr() (textos.js) para poder traducirse.
// El trabajo de verdad lo hace engine.js (aquí en el navegador, o en Fer Casa).
// =====================================================================
import { LOCALE, fijarIdioma, Edificio, ROLES, CAPACIDADES, PUESTOS, POR_POOL, MAX_OFICINAS, MAX_POOLS, MAX_REUNION, VERSION, MODELO_JEV, TIPOS_MODELO, NIVELES, NOMBRE_NIVEL,
  reparto, limpiarAspecto, textoLatido, nivelClave, tipoModelo, precioVariable, fmt, fmtTope, explicarError, PROVEEDORES, filtrarModelosApi, MAX_PERSONALIDAD, MAX_LINEAS_OBJETIVOS,
  limpiarObjetivos, precioUnidad, precioOidoSegundo, sinPrecioPublicado, precioDescrito, tokensImagen, notasMemoriaMd, limpiarTema, versionModelo, elegirModelo, carpetasCerebro } from "./engine.js";
import { PERSONAJES } from "./personajes.js";
import { tr, trSiempre, fijarNombres, cargarIdioma, traducirPagina, idioma, IDIOMAS, guardarIdioma, idiomaGuardado } from "./textos.js";
import { pintarLanding } from "./landing.js";

const OR = "https://openrouter.ai/api/v1";
const BROWSER = "browser";
// Detector de voz de código abierto (Silero VAD, licencia ISC). Se descarga solo al tocar el micro.
// Los dos archivos que corren dentro de la página van «sellados»: si alguien los cambia, el navegador no los usa.
const ORT_BASE = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";
const VAD_BASE = "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.31/dist/";
const SELLOS = {
  "ort.wasm.min.js": "sha384-epp8GDQUoLKx5qHa6SoDHKv7fSHILsEYk4uEsHdPRBztXEIVWCe/lhhrQJUBMZcf",
  "bundle.min.js": "sha384-BLK6Iw3Zbz9hHmHYBgWHJ8GaGVHf3hfnz95vXOla64ZQHHL/T7r9PeIl6jUx8eer"
};

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d = "") { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  json(k, d) { try { const v = JSON.parse(this.get(k, "")); return v && typeof v === "object" ? v : d; } catch { return d; } }
};
const K = { estado: "ferEdificio.estado", clave: "ferAgent.key", look: "ferAgent.look", pin: "ferEdificio.pin", altavoz: "ferEdificio.altavoz", copia: "ferEdificio.copia", v4: "ferEdificio.estadoV4", vista: "ferEdificio.vista", idioma: "ferAgent.idioma",
  claveAnthropic: "ferAgent.keyAnthropic", claveOpenai: "ferAgent.keyOpenAI", claveXai: "ferAgent.keyXai",
  ultimaCopia: "ferAgent.ultimaCopia", aparato: "ferAgent.aparato", carpeta: "ferAgent.carpeta" };
const CLAVE_DE = { anthropic: K.claveAnthropic, openai: K.claveOpenai, xai: K.claveXai };
// dónde guarda este navegador la clave de cada API (las tres de antes conservan su sitio)
const claveApi = (id) => CLAVE_DE[id] || ("ferAgent.keyApi." + id);
const tieneClaveApi = (id) => { const P = ed && ed.proveedor(id); if (P && P.sinClave) return true; return modo === "casa" ? !!(casaInfo.claves || {})[id] : !!store.get(claveApi(id)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Cada aparato (este navegador) tiene su número, para saber de dónde viene la copia del edificio de la carpeta del cerebro
const aparato = (() => { let x = store.get(K.aparato); if (!x) { x = "ap_" + Math.random().toString(36).slice(2, 10); store.set(K.aparato, x); } return x; })();

// =====================================================================
// IndexedDB: imágenes, música y lo que no cabe en el almacenamiento normal (no se pierde al recargar)
// =====================================================================
const idb = {
  _db: null,
  abrir() {
    if (this._db) return this._db;
    this._db = new Promise((res, rej) => {
      try {
        const r = indexedDB.open("fer-agent", 1);
        r.onupgradeneeded = () => { const db = r.result; for (const n of ["medios", "kv", "biblio"]) if (!db.objectStoreNames.contains(n)) db.createObjectStore(n); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      } catch (err) { rej(err); }
    });
    return this._db;
  },
  async op(tienda, modo, f) {
    const db = await this.abrir();
    return new Promise((res, rej) => { const tx = db.transaction(tienda, modo), st = tx.objectStore(tienda); const q = f(st); tx.oncomplete = () => res(q && "result" in q ? q.result : undefined); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
  },
  get(t, k) { return this.op(t, "readonly", (st) => st.get(k)).catch(() => undefined); },
  put(t, k, v) { return this.op(t, "readwrite", (st) => st.put(v, k)).catch(() => undefined); },
  del(t, k) { return this.op(t, "readwrite", (st) => st.delete(k)).catch(() => undefined); },
  todos(t) { return this.op(t, "readonly", (st) => st.getAll()).catch(() => []); },
  claves(t) { return this.op(t, "readonly", (st) => st.getAllKeys()).catch(() => []); }
};

// Constructor de elementos sin riesgo: el texto siempre va como texto.
// Lo que escribe la gente o un agente (mensajes, tareas, notas, motivos, títulos) va tal cual: no pasa por el diccionario
const crudo = (t) => document.createTextNode(String(t ?? ""));
// Para quien no ha usado nunca OpenRouter: cómo sacar la clave
const comoSacarClave = () => h("div", { class: "como-clave" }, h("b", {}, "No key yet? You can get one in a few minutes:"),
  h("ol", {},
    h("li", {}, "Create an OpenRouter account: with your email, Google or GitHub. ", h("a", { href: "https://openrouter.ai", target: "_blank", rel: "noopener" }, "openrouter.ai")),
    h("li", {}, "In “Credits”, add some balance. You pay in advance and only what your agents use is spent. ", h("a", { href: "https://openrouter.ai/credits", target: "_blank", rel: "noopener" }, "openrouter.ai/credits")),
    h("li", {}, "In “Keys”, press “Create Key”, give it a spending limit and copy the key: it's only shown once. Paste it above and press “Save”. ", h("a", { href: "https://openrouter.ai/keys", target: "_blank", rel: "noopener" }, "openrouter.ai/keys"))));
const entreComillas = (t) => { const [a, b] = tr("“{1}”").split("{1}"); return [a, crudo(t), b]; };   // «…» en español, “…” en inglés
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") { for (const [p, x] of Object.entries(v)) { if (x === null || x === undefined) continue; if (p.startsWith("--")) el.style.setProperty(p, String(x)); else el.style[p] = x; } }
    else if (k === "html") el.innerHTML = v;      // solo para dibujos generados aquí, nunca texto de nadie
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, (k === "title" || k === "placeholder" || k === "aria-label" || k === "alt") ? tr(String(v)) : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(tr(String(c))));
  return el;
}

// =====================================================================
// Motor: aquí mismo (navegador) o en Fer Casa (ordenador, teléfono o servidor)
// =====================================================================
let modo = "local", pin = store.get(K.pin);
let ed = null;
let modelos = [], voces = [], oidos = [], imagenesModelos = [];
let porTipo = { texto: [], imagen: [], musica: [], voz: [], oido: [], decisiones: [], otros: [] };
const Motor = {
  async ejecutar(acc) {
    if (modo === "local") return ed.ejecutar(acc);
    if (!pin || pinRechazado) { pedirPin(); throw Object.assign(new Error("The Fer Home PIN is missing or wrong (Settings)."), { mostrado: true }); }
    const porPartes = acc.tipo === "hablar" && typeof acc.alTrozo === "function";
    const r = await fetch("./api/accion", { method: "POST", headers: Object.assign({ "Content-Type": "application/json", "X-Fer-Pin": pin }, porPartes ? { "X-Fer-Trozos": "1" } : {}), body: JSON.stringify(acc) });
    if (porPartes && r.ok && r.body && /ndjson/.test(r.headers.get("content-type") || "")) {
      // la respuesta llega por partes desde Fer Casa: la voz empieza mientras el agente escribe
      const rd = r.body.getReader(), dec = new TextDecoder();
      let buf = "", todo = "", fin = null, error = "";
      const linea = (l) => { if (!l.trim()) return; let j; try { j = JSON.parse(l); } catch { return; } if (typeof j.trozo === "string") { todo += j.trozo; try { acc.alTrozo(j.trozo, todo); } catch {} } if (j.fin) fin = j.fin; if (j.error) error = j.error; };
      for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i; while ((i = buf.indexOf("\n")) >= 0) { linea(buf.slice(0, i)); buf = buf.slice(i + 1); } }
      linea(buf);
      await refrescarCasa();
      if (error || !fin) throw Object.assign(new Error(error || "Fer Home cut the reply short."), { mostrado: true });
      return fin;
    }
    let d = {}; try { d = await r.json(); } catch {}
    if (r.status === 401) { pinRechazado = true; pedirPin(); throw Object.assign(new Error("The Fer Home PIN is missing or wrong (Settings)."), { mostrado: true }); }
    if (!r.ok) throw Object.assign(new Error(d.error || ("Error " + r.status)), { mostrado: true });
    await refrescarCasa();
    return d;
  }
};
let casaApp = false;   // Fer Home dentro de la aplicación de escritorio (versión 9): la clave se pega aquí y no hay PIN que escribir
async function detectarCasa() {
  try { const r = await fetch("./api/hola", { cache: "no-store" }); if (r.ok) { const d = await r.json(); casaApp = !!(d && d.app); return !!(d && d.ferCasa); } } catch {}
  return false;
}
const esApp = () => modo === "casa" && (casaApp || !!casaInfo.app);
// En la aplicación: guardar una clave o abrir el Chrome de los agentes (lo hace la aplicación, en este ordenador)
async function llamarApp(ruta, datos) {
  const r = await fetch("." + ruta, { method: "POST", headers: { "Content-Type": "application/json", "X-Fer-Pin": pin }, body: JSON.stringify(datos) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || "It couldn't be done."), { mostrado: true });
  return d;
}
let pinRechazado = false;
let skillsCasa = [], casaInfo = {};   // en Fer Casa: las skills (manos) que tiene y cómo está (Telegram, carpeta del cerebro)
async function refrescarCasa() {
  if (!pin || pinRechazado) return;          // sin PIN no se pregunta (así no te bloquea a ti mismo)
  try {
    const r = await fetch("./api/estado", { headers: { "X-Fer-Pin": pin }, cache: "no-store" });
    if (r.status === 401) { pinRechazado = true; pedirPin(); return; }
    if (!r.ok) return;
    const d = await r.json();
    ed.e = d.estado; ed.ocupados = new Set(d.ocupados || []);
    skillsCasa = Array.isArray(d.skills) ? d.skills : []; casaInfo = d.casa || {};
    if (Array.isArray(d.biblioteca)) ed.biblioteca = d.biblioteca;
    pintar();
    if (!refrescarCasa.idioma) { refrescarCasa.idioma = true; sincronizarIdioma(); }   // la primera vez: el idioma de esta persona o el del edificio
  } catch {}
}
function pedirPin() { if ($("cajon").hidden) abrirCajon("ajustes"); }
const apiBase = () => (modo === "local" ? OR : "./api/or");
const apiCab = (json) => { const c = modo === "local" ? { Authorization: "Bearer " + store.get(K.clave) } : { "X-Fer-Pin": pin }; if (json) c["Content-Type"] = "application/json"; return c; };
const hayAcceso = () => (modo === "casa" ? !!pin && !(esApp() && casaInfo.clave === false) : !!store.get(K.clave));

// =====================================================================
// Listas de modelos de OpenRouter (públicas, sin clave)
// =====================================================================
async function cargarListas() {
  const get = async (q) => { const r = await fetch(OR + "/models" + q); if (!r.ok) throw new Error("HTTP " + r.status); return (await r.json()).data || []; };
  // Todos los modelos de una vez; cada uno se clasifica por lo que hace (lo dicen sus datos, no una lista a mano)
  let todos = null;
  try { todos = await get("?output_modalities=all"); } catch {}
  if (!todos || !todos.length) {   // si esa consulta falla, como antes: una por tipo
    const r = await Promise.allSettled(["", "?output_modalities=speech", "?output_modalities=transcription", "?output_modalities=image", "?output_modalities=audio"].map(get));
    const vistos = new Set(); todos = [];
    for (const x of r) if (x.status === "fulfilled") for (const m of x.value) if (!vistos.has(m.id)) { vistos.add(m.id); todos.push(m); }
    if (!todos.length) return false;
  }
  modelos = todos;
  porTipo = { texto: [], imagen: [], musica: [], voz: [], oido: [], decisiones: [], otros: [] };
  for (const m of todos) porTipo[tipoModelo(m)].push(m);
  voces = porTipo.voz.map((m) => ({ id: m.id, name: m.name || m.id, pricing: m.pricing || {}, voices: (m.supported_voices || []).map((v) => (typeof v === "string" ? { id: v, name: v } : { id: v.id || v.voice_id || v.name, name: v.name || v.id })).filter((v) => v.id) }));
  oidos = porTipo.oido.map((m) => ({ id: m.id, name: m.name || m.id, pricing: m.pricing || {} }));
  imagenesModelos = porTipo.imagen.map((m) => ({ id: m.id, name: m.name || m.id, pricing: m.pricing || {} }));
  return true;
}
const n0 = (v) => { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : 0; };
const porMillon = (p) => (p * 1e6).toLocaleString(LOCALE, { maximumFractionDigits: 3 });
const datosModelo = (m) => ({ id: m.id, name: m.name || m.id, inPrice: n0((m.pricing || {}).prompt), outPrice: n0((m.pricing || {}).completion), ve: ((m.architecture && m.architecture.input_modalities) || []).includes("image"), out: (m.architecture && m.architecture.output_modalities) || ["text"] });
const dinero = (n, dec = 3) => n.toLocaleString(LOCALE, { maximumFractionDigits: dec });
// El precio, dicho como se cobra cada tipo de modelo
const POR_TXT = { song: "song", clip: "clip", track: "track", image: "image", minute: "minute", hour: "hour", request: "request", generation: "generation", second: "second" };
function precioTxt(m) {
  const p = m.pricing || {}, a = n0(p.prompt), b = n0(p.completion), t = tipoModelo(m);
  if (precioVariable(m)) return tr("variable price");
  // imágenes: OpenRouter da el precio por token de imagen («image_output»); aquí, por imagen de 1024×1024 (≈)
  if (t === "imagen" && precioUnidad(m)) return tr(`≈$${dinero(precioUnidad(m))} per image`);
  if (t === "musica" && n0(p.request)) return tr(`$${dinero(n0(p.request))} per song`);
  if (t !== "texto" && sinPrecioPublicado(m)) { const d = precioDescrito(m); return tr(d ? `price not published (its description says $${dinero(d.usd)} per ${POR_TXT[d.por] || d.por})` : "price not published"); }
  if (t === "voz" && (a || b)) return tr(a && !b ? `$${porMillon(a)} per million characters` : !a && b ? `$${dinero(b * 3600, 2)} per hour of audio` : `≈$${dinero(b * 32 * 3600, 2)} per hour of audio`);
  if (t === "oido" && a && !b) return tr(`$${dinero(precioOidoSegundo(m) * 3600)} per hour of speech`);
  const otros = n0(p.image) + n0(p.request) + n0(p.audio) + n0(p.image_output) + n0(p.audio_output);
  if (!a && !b && !otros) return tr("free");
  return tr(`$${porMillon(a)} / $${porMillon(b)}`);
}
function etiquetaModelo(m) {
  const d = datosModelo(m);
  if (precioVariable(m)) return `${d.name} · ${tr("variable price (depends on the model it chooses)")}`;
  const nivel = nivelClave(Object.assign({}, m, d));
  if (nivel === "sinprecio") return `${d.name} · ${precioTxt(m)}`;
  return `${d.name} · ${tr(NOMBRE_NIVEL[nivel])} · ${precioTxt(m)}${d.ve && tipoModelo(m) === "texto" ? " · " + tr("sees") : ""}`;
}
// Selector de modelos: arriba los recomendados por nivel; debajo, todos los de ese tipo (y en «Cerebro», también «Otros»).
// v8: en el desplegable, solo los recomendados (15 como mucho) y el que tiene ahora; el resto, con el buscador de al lado
const MAX_RECOMENDADOS = 15;
function selectorModelo(tipo, actual, { vacio, extra, alCambiar, filtro } = {}) {
  const sel = h("select", {});
  const lista = (porTipo[tipo] || []).filter(filtro || (() => true)).sort((a, b) => (n0(a.pricing && a.pricing.prompt) + n0(a.pricing && a.pricing.completion)) - (n0(b.pricing && b.pricing.prompt) + n0(b.pricing && b.pricing.completion)) || a.id.localeCompare(b.id));
  const todos = tipo === "texto" && !filtro ? [...lista, ...porTipo.otros] : lista;
  const porId = new Map(todos.map((m) => [m.id, m]));
  const rec = ((ed && ed.e && ed.e.ajustes.recomendados) || {})[tipo] || {};
  const rellenar = (valor) => {
    sel.replaceChildren();
    if (vacio) sel.append(h("option", { value: "" }, vacio));
    for (const x of extra || []) sel.append(h("option", { value: x[0] }, x[1]));
    const puestos = new Set();   // arriba, como mucho 15 recomendados por nivel de precio
    for (const nivel of NIVELES) {
      if (puestos.size >= MAX_RECOMENDADOS) break;
      const ids = (rec[nivel] || []).filter((id) => porId.has(id) && !puestos.has(id)).slice(0, MAX_RECOMENDADOS - puestos.size);
      if (!ids.length) continue;
      ids.forEach((id) => puestos.add(id));
      sel.append(h("optgroup", { label: tr("Recommended") + " · " + tr(NOMBRE_NIVEL[nivel]) }, ids.map((id) => h("option", { value: id }, etiquetaModelo(porId.get(id))))));
    }
    // debajo, TODOS los de OpenRouter de este tipo (cientos), como en la versión 7; y los «Otros», por si acaso
    sel.append(h("optgroup", { label: tr("All") + " · " + tr(TIPOS_MODELO[tipo]) + ` (${lista.length})` }, lista.map((m) => h("option", { value: m.id }, etiquetaModelo(m)))));
    if (tipo === "texto" && !filtro && porTipo.otros.length) sel.append(h("optgroup", { label: tr("Others (may not work here)") }, porTipo.otros.map((m) => h("option", { value: m.id }, etiquetaModelo(m) + " · " + ((m.architecture && m.architecture.output_modalities) || []).join("+")))));
    if (valor && ![...sel.options].some((o) => o.value === valor)) sel.prepend(h("option", { value: valor }, porId.has(valor) ? etiquetaModelo(porId.get(valor)) : valor + (valor === MODELO_JEV ? "" : " " + tr("(not in the list)"))));
    sel.value = valor || "";
  };
  rellenar(actual || "");
  if (alCambiar) sel.addEventListener("change", () => alCambiar(sel.value));
  if (todos.length > MAX_RECOMENDADOS) {
    // además, «Buscar entre todos»: escribes parte del nombre y eliges (es lo mismo que buscarlo en el desplegable, más rápido)
    const boton = h("button", { type: "button", class: "btn mini buscar-modelo" }, tr(`Search all (${todos.length})`));
    let caja = null;
    boton.onclick = (ev) => {
      ev.preventDefault();
      if (caja && caja.isConnected) { caja.remove(); caja = null; return; }
      const q = h("input", { type: "search", placeholder: tr("Type part of the name: claude, gpt, gemini, flux…"), "aria-label": "Search model" });
      const res = h("div", { class: "busca-modelos" });
      const pintarRes = () => {
        const t = sinAcentos(q.value.trim()), hall = todos.filter((m) => !t || sinAcentos(m.id + " " + (m.name || "")).includes(t)).slice(0, 40);
        res.replaceChildren(...hall.map((m) => h("button", { type: "button", class: "modelo-res", onclick: (e2) => { e2.preventDefault(); rellenar(m.id); caja.remove(); caja = null; sel.dispatchEvent(new Event("change")); } }, etiquetaModelo(m))),
          hall.length ? h("small", { class: "nota" }, tr(hall.length === 40 ? "There are more: type a bit more of the name." : `${hall.length} found`)) : h("small", { class: "nota" }, tr("None with that name.")));
      };
      q.oninput = pintarRes;
      caja = h("div", { class: "buscador-modelos" }, q, res);
      boton.after(caja); pintarRes(); q.focus();
    };
    requestAnimationFrame(() => { if (sel.isConnected && sel.nextElementSibling !== boton) sel.after(boton); });
  }
  return sel;
}
// Lo que propone Arturito para este tipo de modelo (tú decides)
function propuestasDe(tipo) {
  return (ed.e.propuestasModelos || []).filter((x) => x.tipo === tipo && x.estado === "pendiente").map((pm) => h("div", { class: "propuesta-modelo" },
    h("span", {}, `${tr("Artie proposes")} ${pm.modelo} ${tr("for the level")} ${tr(NOMBRE_NIVEL[pm.nivel] || pm.nivel)}: ${pm.motivo}`),
    h("button", { class: "btn mini primario", onclick: () => Motor.ejecutar({ tipo: "modelo.aceptar", propuesta: pm.id }).then(() => pintar(true)).catch(avisar) }, "Accept"),
    h("button", { class: "btn mini", onclick: () => Motor.ejecutar({ tipo: "modelo.descartar", propuesta: pm.id }).then(() => pintar(true)).catch(avisar) }, "Dismiss")));
}

// =====================================================================
// Texto con formato seguro y texto para leer en voz alta
// =====================================================================
const escapar = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const enLinea = (s) => s.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
  .replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
function markdown(text) {
  const lines = escapar(String(text)).split("\n");
  let html = "", list = null, para = [];
  const fp = () => { if (para.length) { html += "<p>" + enLinea(para.join("<br>")) + "</p>"; para = []; } };
  const cl = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd(); let m;
    if (!line.trim()) { fp(); cl(); continue; }
    if ((m = line.match(/^\s*#{1,6}\s+(.*)$/))) { fp(); cl(); html += "<h3>" + enLinea(m[1]) + "</h3>"; continue; }
    if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) { fp(); if (list !== "ul") { cl(); html += "<ul>"; list = "ul"; } html += "<li>" + enLinea(m[1]) + "</li>"; continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { fp(); if (list !== "ol") { cl(); html += "<ol>"; list = "ol"; } html += "<li>" + enLinea(m[1]) + "</li>"; continue; }
    cl(); para.push(line);
  }
  fp(); cl(); return html;
}
const paraVoz = (t) => String(t).replace(/```[\s\S]*?```/g, " ").replace(/<[^>]*>/g, " ").replace(/`([^`]+)`/g, "$1").replace(/\*\*|__|[*_#>]/g, "")
  .replace(/^\s*[-•]\s+/gm, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/https?:\/\/\S+/g, "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
  .replace(/\n{2,}/g, ". ").replace(/\s+/g, " ").trim();

// =====================================================================
// Personajes: chico, chica, abuelo y abuela, con colores a elegir
// =====================================================================
const ZONAS = { piel: 1, pelo: 2, ojos: 3, ropa: 4 };
const NOMBRE_PJ = { chico: "Boy", chica: "Girl", abuelo: "Grandpa", abuela: "Grandma", morado: "Purple suit", verde: "Green suit", coral: "Coral", azul: "Blue suit", turquesa: "Teal suit", camisa: "Blue shirt" };
const NOMBRE_ZONA = { ropa: "Clothes", ojos: "Eyes", pelo: "Hair", piel: "Skin" };
const PALETAS = {
  ropa: [["#1F3A93", "navy blue"], ["#3A9FE3", "sky blue"], ["#2E9E5B", "green"], ["#7B3FB5", "purple"], ["#E8C22C", "yellow"], ["#EF6AA6", "pink"], ["#8E1B2C", "maroon"], ["#2A2C36", "black"], ["#E9EDF2", "white"]],
  ojos: [["#6B3E1E", "brown"], ["#9A7434", "hazel"], ["#3F8F4E", "green"], ["#8C99A6", "grey"], ["#2B1D14", "black"], ["#7A4FB8", "violet"]],
  pelo: [["#1E1A18", "black"], ["#5A3820", "chestnut"], ["#8B5A2B", "light brown"], ["#E0B85A", "blond"], ["#B8B8B8", "silver"], ["#3D6BE0", "blue"], ["#E85C9A", "pink"]],
  piel: [["#F6D9C6", "very light"], ["#E8B896", "light"], ["#D9A27E", "medium"], ["#B67A52", "tan"], ["#8A5636", "dark"], ["#5C3A24", "very dark"]]
};
const cachePj = {};
const cargarImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
async function preparar(nombre) {
  if (cachePj[nombre]) return cachePj[nombre];
  const P = PERSONAJES[nombre];
  const [img, zon] = await Promise.all([cargarImg(P.img), cargarImg(P.zonas)]);
  const c = document.createElement("canvas"); c.width = P.w; c.height = P.h;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.drawImage(img, 0, 0, P.w, P.h); const base = x.getImageData(0, 0, P.w, P.h);
  x.clearRect(0, 0, P.w, P.h); x.drawImage(zon, 0, 0, P.w, P.h); const z = x.getImageData(0, 0, P.w, P.h).data;
  const n = P.w * P.h, L = new Float32Array(n), listas = { 1: [], 2: [], 3: [], 4: [] }, d = base.data;
  for (let i = 0; i < n; i++) {
    const r = d[i * 4] / 255, g = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255;
    L[i] = (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
    const k = Math.round(z[i * 4] / 50);
    if (k >= 1 && k <= 4 && d[i * 4 + 3] > 0) listas[k].push(i);
  }
  const idx = {}; for (const k of [1, 2, 3, 4]) idx[k] = Int32Array.from(listas[k]);
  return (cachePj[nombre] = { P, base, L, idx });
}
function hexAHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let hh = 0, s = 0;
  if (mx !== mn) { const dd = mx - mn; s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn); hh = mx === r ? (g - b) / dd + (g < b ? 6 : 0) : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; hh /= 6; }
  return [hh, s, l];
}
function canal(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
function pintarZona(data, C, zona, hex) {   // cambia el color conservando luces y sombras
  const [th, ts, tl] = hexAHsl(hex), refL = C.P.regiones[zona].refL, lista = C.idx[ZONAS[zona]], L = C.L;
  for (let j = 0; j < lista.length; j++) {
    const i = lista[j], Lp = L[i];
    let l = (tl * Lp / refL) * (1 - tl) + (1 - (1 - tl) * (1 - Lp) / (1 - refL)) * tl; l = l < 0 ? 0 : l > 1 ? 1 : l;
    const q = l < 0.5 ? l * (1 + ts) : l + ts - l * ts, p = 2 * l - q, o = i * 4;
    data[o] = canal(p, q, th + 1 / 3) * 255; data[o + 1] = canal(p, q, th) * 255; data[o + 2] = canal(p, q, th - 1 / 3) * 255;
  }
}
const asp = (x) => limpiarAspecto(x);
const sinColores = (a) => !a.ropa && !a.ojos && !a.pelo && !a.piel;
async function dibujarPersonaje(aspecto, cv) {
  const A = asp(aspecto), C = await preparar(A.p);
  cv.width = C.P.w; cv.height = C.P.h;
  const out = new ImageData(new Uint8ClampedArray(C.base.data), C.P.w, C.P.h);
  for (const z of Object.keys(ZONAS)) if (A[z]) pintarZona(out.data, C, z, A[z]);
  cv.getContext("2d").putImageData(out, 0, 0);
  return cv;
}
// Figura ya pintada (en caché): mientras se prepara, se ve el personaje con sus colores originales.
const cacheFig = new Map(), pendFig = new Map();
const claveFig = (A) => [A.p, A.ropa, A.ojos, A.pelo, A.piel].join("|");
function asegurarFigura(aspecto) {
  const A = asp(aspecto), k = claveFig(A);
  if (sinColores(A)) return Promise.resolve(PERSONAJES[A.p].img);
  if (cacheFig.has(k)) return Promise.resolve(cacheFig.get(k));
  if (!pendFig.has(k)) pendFig.set(k, dibujarPersonaje(A, document.createElement("canvas")).then(reducir).then((u) => { cacheFig.set(k, u); pendFig.delete(k); return u; }).catch(() => { cacheFig.set(k, PERSONAJES[A.p].img); pendFig.delete(k); return PERSONAJES[A.p].img; }));
  return pendFig.get(k);
}
// La figura pintada se guarda a la mitad de tamaño (de sobra para la pantalla) y como archivo en memoria, no como texto.
function reducir(cv) {
  const t = document.createElement("canvas"); t.height = Math.round(cv.height / 2); t.width = Math.round(cv.width / 2);
  const x = t.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(cv, 0, 0, t.width, t.height);
  return new Promise((res) => t.toBlob((b) => res(b ? URL.createObjectURL(b) : t.toDataURL("image/png")), "image/png"));
}
function figura(aspecto) {
  const A = asp(aspecto), k = claveFig(A);
  if (sinColores(A)) return PERSONAJES[A.p].img;
  if (cacheFig.has(k)) return cacheFig.get(k);
  asegurarFigura(A).then(() => pintar());
  return PERSONAJES[A.p].img;
}
function acentoDe(a) { const A = asp(a && a.aspecto), P = PERSONAJES[A.p]; return A.ropa || (P.regiones ? P.regiones.ropa.original : P.acento) || "#4A6CF7"; }
function ponerAcento(hex) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  document.documentElement.style.setProperty("--acento", hex);
  document.documentElement.style.setProperty("--sobre-acento", 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.0637 ? "#FFFFFF" : "#1D2140");
}
let acentoPuesto = "";
function pintarAcento() {
  const a = chatId ? agenteChat() : ed.jefe(); if (!a) return;
  const ac = acentoDe(a); if (ac !== acentoPuesto) { acentoPuesto = ac; ponerAcento(ac); }
}
// Para verlo en grande (chat, podio): el dibujo a tamaño completo
const cacheGrande = new Map();
function asegurarFiguraGrande(aspecto) {
  const A = asp(aspecto), k = claveFig(A);
  if (sinColores(A)) return Promise.resolve(PERSONAJES[A.p].img);
  if (!cacheGrande.has(k)) cacheGrande.set(k, dibujarPersonaje(A, document.createElement("canvas")).then((cv) => new Promise((res) => cv.toBlob((b) => res(b ? URL.createObjectURL(b) : cv.toDataURL("image/png")), "image/png"))).catch(() => PERSONAJES[A.p].img));
  return cacheGrande.get(k);
}

// Selector de aspecto: personaje y colores (lo usan «Crear agente» y «Aspecto»)
function selectorAspecto(actual, alCambiar) {
  let A = asp(actual);
  const caja = h("div", { class: "aspecto" });
  const vista = h("img", { class: "vista-pj", alt: "Preview" });
  const refrescarVista = () => { asegurarFigura(A).then((u) => { vista.src = u; }); };
  const pintarSel = () => {
    caja.innerHTML = "";
    const pick = h("div", { class: "pick4", role: "radiogroup", "aria-label": "Character" });
    for (const nombre of Object.keys(PERSONAJES)) {
      pick.append(h("button", { type: "button", role: "radio", "aria-checked": String(A.p === nombre), onclick: () => { A = asp({ p: nombre }); alCambiar(A); pintarSel(); } },
        h("img", { src: PERSONAJES[nombre].img, alt: "" }), h("span", {}, NOMBRE_PJ[nombre])));
    }
    const colores = h("div", { class: "colores" });
    if (!PERSONAJES[A.p].regiones) colores.append(h("small", { class: "nota" }, tr("This character keeps its own colours.")));
    else for (const zona of ["ropa", "ojos", "pelo", "piel"]) {
      const original = PERSONAJES[A.p].regiones[zona].original;
      const fila = h("div", { class: "muestras", role: "radiogroup", "aria-label": NOMBRE_ZONA[zona] });
      for (const [hex, nombre] of [[null, "original"], ...PALETAS[zona]]) {
        fila.append(h("button", { type: "button", class: "sw" + (hex ? "" : " orig"), style: { "--c": hex || original }, title: `${NOMBRE_ZONA[zona]}: ${nombre}`, role: "radio", "aria-label": `${NOMBRE_ZONA[zona]}: ${nombre}`, "aria-checked": String((A[zona] || null) === hex),
          onclick: () => { A = asp(Object.assign({}, A, { [zona]: hex })); alCambiar(A); pintarSel(); } }));
      }
      const libre = !!A[zona] && !PALETAS[zona].some(([x]) => x === A[zona]);
      const inp = h("input", { type: "color", value: A[zona] || original, "aria-label": `${NOMBRE_ZONA[zona]}: another colour` });
      inp.oninput = () => { A = asp(Object.assign({}, A, { [zona]: inp.value.toUpperCase() })); refrescarVista(); };
      inp.onchange = () => { alCambiar(A); pintarSel(); };
      fila.append(h("label", { class: "libre", title: "Another colour", style: libre ? { background: A[zona], borderStyle: "solid" } : {} }, inp, h("span", {}, libre ? "" : "+")));
      colores.append(h("div", { class: "campo" }, h("span", {}, NOMBRE_ZONA[zona]), fila));
    }
    caja.append(h("div", { class: "aspecto-cab" }, h("div", { class: "marco-vista" }, vista), h("div", { class: "campo", style: { flex: 1 } }, h("span", {}, "Character"), pick)), colores);
    refrescarVista();
  };
  pintarSel();
  return caja;
}

// =====================================================================
// El edificio: trozos del dibujo apilados (cúpula, pisos y vestíbulo)
// =====================================================================
// Medidas en píxeles del dibujo original (1438 de ancho). «suelo» es donde pisan; «fig», lo que miden.
const ANCHO = 1438;
const TRAMO = {
  // «placa»: dónde va el letrero, arriba a la izquierda de su planta (v8: antes quedaba en el borde de abajo y parecía de la de debajo)
  cupula: { img: "img/cupula.webp", img2: "img/cupula2x.webp", alto: 187, suelo: 152, fig: 66, placa: 100, placaMovil: 128 },
  piso: { img: "img/piso.webp", img2: "img/piso2x.webp", alto: 130, suelo: 93, fig: 58, placa: 1, placaMovil: 96 },   // en un teléfono el piso mide 3 dedos: los letreros, en la losa de cada planta (no tapan a nadie)
  vestibulo: { img: "img/vestibulo.webp", img2: "img/vestibulo2x.webp", alto: 219, suelo: 141, fig: 84, placa: 10, placaMovil: 146 }
};
const SITIOS = {
  cupula: { izquierda: [585], centro: [717], derecha: [850] },
  vestibulo: { izquierda: [268], recepcion: [717], derecha: [1172] },
  piso: { despacho: [176], pool: [425, 487, 548, 662, 726, 790], oficina: [884, 997, 1109, 1220, 1329] }
};
// En la vista de un piso se juntan módulos sacados del mismo dibujo: despacho, pools, oficinas y el cierre.
const MODULO = { despacho: [0, 348], pool: [348, 828], oficina: [828, 941], fin: [1382, 1438] };
// Recorte que se ve al entrar en la cúpula y en el vestíbulo: [x0, x1, y0, y1]
const CORTE = { cupula: [400, 1040, 22, 187], vestibulo: [0, 1438, 0, 219] };
const NOMBRE_PUESTO = { centro: "centre", izquierda: "left", derecha: "right", despacho: "head office", oficina: "office", pool: "pool", recepcion: "reception" };
const PUESTOS_TXT = { cupula: [["izquierda", "To the boss's left"], ["derecha", "To the boss's right"]], piso: [["despacho", "Head office (section head)"], ["oficina", "Office"], ["pool", "Pool (several simple agents)"]], vestibulo: [["recepcion", "Reception"], ["izquierda", "Left office"], ["derecha", "Right office"]] };

let seleccion = "jefe", pestana = "ficha", pintarPend = false, plantaAbierta = "";
let fichaTab = "identidad", vistaAct = "todo", pantalla = "", chatId = "";
let busqueda = "", filtroDir = "";
function pintar() {
  if (pintarPend) return;
  pintarPend = true;
  requestAnimationFrame(() => {
    pintarPend = false; if (!ed || !ed.e) return;
    nombresAlDia();
    pintarTop(); pintarCiudad(); pintarAcento();
    if (chatId) { pintarChatCab(); pintarChat(); }
    if (pestana === "ficha") pintarFicha(); if (pestana === "actividad") pintarRegistro();
    if (pantalla === "mes") pintarMes(); if (pantalla === "salas") pintarSalas(); if (pantalla === "bandeja") pintarBandeja(); if (pantalla === "serie") pintarSerie();
    if (!$("cajon").hidden && cajonTipo === "gasto") pintarGastoCajon(true);
  });
}
function faseClase() { return { normal: "", congelacion1: "c1", congelacion2: "c2", tope: "tope" }[ed.e.fase || "normal"] || ""; }
function pintarTop() {
  const aj = ed.e.ajustes, hoy = ed.gastoEdificio("hoy"), uso = ed.usoPresupuesto(), j = ed.jefe();
  $("nombreEdificio").textContent = ed.e.nombre || tr("My building");
  // el contador siempre a la vista; con cero, «Hoy, sin gasto» en vez de «0,0000 $»
  $("medHoy").textContent = hoy > 0 ? tr(`Today ${fmt(hoy)}`) : tr("Today, no spending");
  $("medTope").textContent = n0(aj.topeDiario) ? tr(`cap ${fmtTope(n0(aj.topeDiario))}`) : tr("no cap");
  const b = $("medBarra"); b.style.width = Math.min(100, uso * 100) + "%"; b.className = faseClase();
  $("modo").textContent = tr(esApp() ? "In this app · works while it's open" : modo === "casa" ? "Connected to Fer Home · works 24 h" : "In this browser · works while it's open");
  $("modo").classList.toggle("casa", modo === "casa");
  $("hablarJefe").textContent = tr(`Talk to ${j ? j.nombre : "the boss"}`);
  const pend = (ed.e.monedas || []).filter((m) => m.estado === "propuesta").length;
  $("globoMes").hidden = !pend; $("globoMes").textContent = pend;
  $("globoMes").title = tr(pend === 1 ? "1 proposed coin is waiting for your decision" : `${pend} proposed coins are waiting for your decision`);
  // la bandeja: todo lo que espera tu sí
  const nb = ed.bandeja().length;
  $("globoBandeja").hidden = !nb; $("globoBandeja").textContent = nb;
  $("abrirBandeja").title = tr(nb ? (nb === 1 ? "1 thing is waiting for your yes" : `${nb} things are waiting for your yes`) : "Nothing is waiting for your yes");
  // el interruptor general
  const pausa = aj.pausa !== false, gastan = ed.quienesGastan().filter((x) => x.auto && x.est.gasta && !x.a.apagado);
  $("pausa").setAttribute("aria-pressed", String(pausa));
  $("pausaTxt").textContent = tr(pausa ? "Paused" : "Automatic");
  $("pausaSub").textContent = tr(pausa ? "nothing spends on its own" : (gastan.length === 1 ? "1 agent can spend on its own" : `${gastan.length} agents can spend on their own`));
  $("pausa").title = tr(pausa ? "General pause: no agent that spends wakes up on its own. Press to start." : "Running: heartbeats are on. Press to stop everything automatic.");
  pintarCopiaTop();
}
// «Guardar copia»: cuándo se hizo la última (descargada o en la carpeta del cerebro)
function ultimaCopia() { return Math.max(Number(store.get(K.ultimaCopia, "0")) || 0, (cerebro.estado && cerebro.estado.ultimaCopia) || 0); }
function haceCuanto(ts) {
  if (!ts) return tr("never");
  const m = Math.round((Date.now() - ts) / 60e3);
  if (m < 1) return tr("just now"); if (m < 60) return tr(`${m} min ago`);
  const hh = Math.round(m / 60); if (hh < 24) return tr(`${hh} h ago`);
  const d = Math.round(hh / 24); return d === 1 ? tr("1 day ago") : tr(`${d} days ago`);
}
function pintarCopiaTop() {
  const t = ultimaCopia(), vieja = !t || Date.now() - t > 7 * 86400e3;
  $("copiaCuando").textContent = tr(`last: ${haceCuanto(t)}`);
  $("copiaRapida").classList.toggle("vieja", vieja);
  $("copiaRapida").title = tr(t ? `Last backup: ${new Date(t).toLocaleString(LOCALE)}. Press to save another one now.` : "There's no backup yet. Press to save one now.");
}
function estadoVisible(a) {
  if (a.estado === "trabajando" || ed.ocupados.has(a.id)) return "trabajando";
  if (a.apagado || a.estado === "apagado") return "apagado";
  if (a.estado === "congelado") return "congelado";
  if (a.tareas.some((t) => t.estado === "pendiente")) return "activo";
  return "reposo";
}
const ESTADO_TXT = { trabajando: "working", apagado: "off", congelado: "frozen", activo: "with pending tasks", reposo: "resting" };
const pct = (n) => (n * 100).toFixed(3) + "%";
// La voz y el oído, en el idioma de la web (con el acento del navegador si es el mismo idioma: en-GB, es-MX…)
const idiomaVoz = () => ((navigator.language || "").slice(0, 2).toLowerCase() === idioma ? navigator.language : LOCALE);
const rolTxt = (a) => trSiempre((ROLES[a.rol] || {}).nombre || a.rol);
// Los nombres de agentes, plantas y del edificio son datos: no se traducen (si el jefe se llama «Jefe», en inglés se ve «Jefe»)
const nombresAlDia = () => { if (ed && ed.e) fijarNombres([ed.e.nombre, ...ed.e.agentes.map((a) => a.nombre), ...ed.e.plantas.map((p) => p.nombre)]); };
const conversa = (a) => !!(a && a.cerebro && a.rol !== "jev" && !["interventor", "memory"].includes(a.rol));
const gastoTxt = (g) => (g > 0 ? fmt(g) : "");   // el gasto solo se enseña cuando lo hay
// La ficha (y la actividad) van en un panel a la derecha que solo se abre al tocar un agente o al entrar en un piso
const panelAbierto = () => document.body.classList.contains("con-panel");
function abrirPanel(tab) { if (window.innerWidth > 900) document.body.classList.add("con-panel"); verPestana(tab || "ficha"); pintar(); }
function cerrarPanel() { if (!panelAbierto()) return; document.body.classList.remove("con-panel"); pintar(); }
function elegir(a) { seleccion = a.id; abrirPanel("ficha"); }

// Una figura colocada sobre un trozo del dibujo. x0 y ancho: el tramo de dibujo que ocupa el contenedor.
function personaje(a, T, x, x0, ancho, conNombre) {
  const est = estadoVisible(a);
  return h("button", {
    class: `pj ${est}${seleccion === a.id && (panelAbierto() || window.innerWidth <= 900) ? " sel" : ""}${a.rol === "jefe" ? " jefe" : ""}`, "data-id": a.id, type: "button",
    style: { left: pct((x - x0) / ancho), top: pct((T.suelo - T.fig) / T.alto), height: pct(T.fig / T.alto) },
    title: `${a.nombre} · ${rolTxt(a)} · ${tr(ESTADO_TXT[est])}${a.motivoEstado ? " (" + a.motivoEstado + ")" : ""}`,
    "aria-label": `${a.nombre}, ${rolTxt(a)}, ${tr(ESTADO_TXT[est])}`,
    onclick: (ev) => { ev.stopPropagation(); elegir(a); }
  }, h("img", { src: figura(a.aspecto), alt: "", draggable: "false" }), est === "activo" ? h("span", { class: "pendiente", "aria-hidden": "true" }) : null,
    monedasFigura(a), h("span", { class: "etiqueta" + (conNombre ? "" : " al-pasar"), "aria-hidden": "true" }, a.nombre));
}
// El contador de monedas doradas y rojas, en el muñeco
let cuentaMonedas = null, firmaMonedas = "";
function monedasDe(a) {
  const ms = (ed.e.monedas || []), f = ms.length + ":" + ((ms.at(-1) || {}).id || "") + ":" + ms.filter((m) => m.estado !== "confirmada").length;
  if (!cuentaMonedas || f !== firmaMonedas) {
    cuentaMonedas = new Map(); firmaMonedas = f;
    for (const m of ms) { if (m.estado !== "confirmada") continue; const c = cuentaMonedas.get(m.agente) || { oro: 0, roja: 0 }; c[m.tipo === "roja" ? "roja" : "oro"]++; cuentaMonedas.set(m.agente, c); }
  }
  return cuentaMonedas.get(a.id) || { oro: 0, roja: 0 };
}
function monedasFigura(a) {
  const c = monedasDe(a);
  if (!c.oro && !c.roja) return null;
  return h("span", { class: "monedas-pj", "aria-label": `${c.oro} gold and ${c.roja} red` },
    c.oro ? h("span", {}, h("i", { class: "moneda oro" }), String(c.oro)) : null, c.roja ? h("span", {}, h("i", { class: "moneda roja" }), String(c.roja)) : null);
}
function hueco(T, x, x0, ancho, planta, puesto) {
  return h("button", { class: "hueco", type: "button", title: "Put a new agent here", "aria-label": `Create an agent: ${NOMBRE_PUESTO[puesto]}`,
    style: { left: pct((x - x0) / ancho), top: pct((T.suelo - T.fig * 0.62) / T.alto), height: pct(T.fig * 0.5 / T.alto) },
    onclick: (ev) => { ev.stopPropagation(); abrirCajon("agente", { planta: planta.id, puesto }); } }, "+");
}
const gastoPlanta = (p) => ed.e.agentes.filter((a) => a.planta === p.id).reduce((s, a) => s + ed.gastoAgente(a, "hoy"), 0);

// ¿Dibujo o franjas? «Automática»: franjas cuando el edificio es grande.
const AUTO_AGENTES = 20, AUTO_PISOS = 6;
function vistaEdificio() {
  const v = ed.e.ajustes.vistaEdificio || "auto";
  if (v === "dibujo" || v === "franjas") return v;
  return ed.e.agentes.length > AUTO_AGENTES || ed.e.plantas.filter((p) => p.tipo === "piso").length > AUTO_PISOS ? "franjas" : "dibujo";
}
let torre = null, dirCab = null, dirLista = null, plantaAntes = "";
function pintarCiudad() {
  const cont = $("edificio");
  if (plantaAbierta && !ed.e.plantas.some((p) => p.id === plantaAbierta)) plantaAbierta = "";
  if (plantaAntes && !plantaAbierta) document.body.classList.remove("con-panel");   // al salir de un piso, el edificio entero otra vez
  plantaAntes = plantaAbierta;
  cont.classList.toggle("abierta", !!plantaAbierta);
  $("ciudadBarra").hidden = !!plantaAbierta;
  if (plantaAbierta) return pintarPlanta(cont, ed.e.plantas.find((p) => p.id === plantaAbierta));
  const v = vistaEdificio();
  $("verDibujo").setAttribute("aria-pressed", String(v === "dibujo")); $("verFranjas").setAttribute("aria-pressed", String(v === "franjas"));
  if (!torre) { torre = h("div", { class: "torre" }); dirLista = h("div", { class: "dir-lista" }); cabDirectorio(); }
  // el directorio, solo en «Franjas» (en el dibujo ya ves a todos)
  const conDir = v === "franjas";
  if (cont.children[0] !== torre || (cont.children.length > 1) !== conDir) cont.replaceChildren(...(conDir ? [torre, dirCab, dirLista] : [torre]));   // el buscador no se rehace: no pierde lo escrito
  torre.replaceChildren(...ed.e.plantas.map((p) => (v === "franjas" && p.tipo === "piso" ? franjaPiso(p) : tramoEdificio(p))), h("div", { class: "suelo-calle" }));
  if (conDir) pintarDirectorio();
}
function tramoEdificio(p) {
  const T = TRAMO[p.tipo], r = reparto(ed.e, p.id), sitios = SITIOS[p.tipo];
  const el = h("div", { class: "tramo " + p.tipo, style: { aspectRatio: `${ANCHO} / ${T.alto}` } });
  el.append(h("img", { class: "fondo", src: T.img, alt: "", draggable: "false" }));
  if (p.tipo === "cupula") el.append(h("span", { class: "luz", id: "luzAntena", style: { left: pct(717 / ANCHO), top: pct(12 / T.alto) }, "aria-hidden": "true" }));
  el.append(h("button", { class: "entrar", type: "button", "aria-label": `Go into ${p.nombre}`, title: `Go into ${p.nombre}${p.funcion ? ": " + p.funcion : ""}`, onclick: () => abrirPlanta(p.id) }));
  let fuera = 0;
  for (const [puesto, ags] of Object.entries(r)) {
    const xs = (sitios[puesto] || []).slice(0, p.tipo === "piso" && puesto === "pool" ? Math.min(POR_POOL, (p.pools || 0) * POR_POOL) : undefined);
    ags.forEach((a, i) => { if (i < xs.length) el.append(personaje(a, T, xs[i], 0, ANCHO)); else fuera++; });
  }
  if (fuera) el.append(h("button", { class: "mas", type: "button", onclick: () => abrirPlanta(p.id), title: "See all" }, `+${fuera}`));
  const g = gastoPlanta(p);
  el.append(h("button", { class: "placa", type: "button", style: { "--arriba": pct(T.placa / T.alto), "--movil": pct((T.placaMovil || T.placa) / T.alto) }, onclick: () => abrirPlanta(p.id), title: p.funcion || "" },
    h("b", {}, p.nombre), g > 0 ? h("span", {}, fmt(g)) : null));
  return el;
}
// Un piso como franja: nombre, función, cuántos agentes, cuántos trabajan y el gasto (si lo hay); un punto por agente.
function franjaPiso(p) {
  const ags = ed.e.agentes.filter((a) => a.planta === p.id), est = ags.map(estadoVisible);
  const trab = est.filter((x) => x === "trabajando").length, g = gastoPlanta(p);
  const datos = tr(ags.length === 1 ? "1 agent" : `${ags.length} agents`) + " · " + tr(`${trab} working`) + (g > 0 ? " · " + fmt(g) : "");
  return h("div", { class: "tramo piso franja" },
    h("img", { class: "fondo", src: TRAMO.piso.img, alt: "", draggable: "false" }),
    h("button", { class: "entrar", type: "button", "aria-label": `Go into ${p.nombre}`, title: `Go into ${p.nombre}${p.funcion ? ": " + p.funcion : ""}`, onclick: () => abrirPlanta(p.id) }),
    h("div", { class: "franja-txt" },
      h("span", { class: "f-nombre" }, h("b", {}, p.nombre), p.funcion ? h("small", {}, p.funcion) : null),
      h("span", { class: "f-datos" }, datos, ags.length ? h("span", { class: "puntos", "aria-hidden": "true" }, ags.map((a, i) => h("i", { class: est[i] }))) : null)));
}

// ---------------- Directorio: todos los agentes, con buscador y filtros ----------------
const FILTROS = [["", "All"], ["trabajando", "Working"], ["activo", "With pending tasks"], ["congelado", "Frozen"], ["apagado", "Off"]];
const sinAcentos = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
function cabDirectorio() {
  const buscar = h("input", { class: "buscador", type: "search", placeholder: "Search by name, role or floor", "aria-label": "Find an agent", oninput: (ev) => { busqueda = ev.target.value; pintarDirectorio(); } });
  dirCab = h("div", { class: "dir-cabecera" }, h("div", { class: "dir-cab" }, h("h3", {}, "Directory"), buscar), h("div", { class: "filtros", role: "group", "aria-label": "Filter by status" }));
}
function pintarDirectorio() {
  const filtros = dirCab.querySelector(".filtros"), est = new Map(ed.e.agentes.map((a) => [a.id, estadoVisible(a)]));
  filtros.replaceChildren(...FILTROS.map(([k, t]) => {
    const n = k ? [...est.values()].filter((x) => x === k).length : est.size;
    return h("button", { type: "button", "aria-pressed": String(filtroDir === k), onclick: () => { filtroDir = filtroDir === k ? "" : k; pintarDirectorio(); } }, k ? h("i", { class: "est-punto " + k }) : null, `${tr(t)} (${n})`);
  }));
  const q = sinAcentos(busqueda.trim());
  const grupos = [];
  for (const p of ed.e.plantas) {
    const todos = ed.e.agentes.filter((a) => a.planta === p.id);
    const ags = todos.filter((a) => (!filtroDir || est.get(a.id) === filtroDir) && (!q || sinAcentos(`${a.nombre} ${rolTxt(a)} ${p.nombre} ${p.funcion}`).includes(q)));
    if (!ags.length && (q || filtroDir)) continue;
    const g = gastoPlanta(p);
    grupos.push(h("div", { class: "grupo-dir" },
      h("button", { type: "button", onclick: () => abrirPlanta(p.id), title: p.funcion || "" }, p.nombre, h("small", {}, `${todos.length === 1 ? "1 agent" : `${todos.length} agents`}${g > 0 ? " · " + fmt(g) : ""}`)),
      ags.length ? ags.map((a) => {
        const e = est.get(a.id), ga = ed.gastoAgente(a, "hoy");
        return h("button", { class: "fila-ag" + (seleccion === a.id ? " sel" : ""), type: "button", onclick: () => elegir(a) },
          h("img", { src: figura(a.aspecto), alt: "" }),
          h("span", { class: "fa-txt" }, h("b", {}, a.nombre), h("small", {}, `${rolTxt(a)} · ${tr(ESTADO_TXT[e])}${a.motivoEstado && e === "congelado" ? " · " + a.motivoEstado : ""}`)),
          h("span", { class: "fa-der" }, gastoTxt(ga), h("i", { class: "est-punto " + e, "aria-hidden": "true" })));
      }) : h("p", { class: "sin-resultados" }, p.tipo === "piso" ? "Empty floor." : "Empty.")));
  }
  dirLista.replaceChildren(...(grupos.length ? grupos : [h("p", { class: "sin-resultados" }, "No agent matches the search or the filter.")]));
}
let centrarPendiente = false;
function abrirPlanta(id) {
  if (plantaAbierta !== id) {
    centrarPendiente = true;   // al entrar, la planta se enseña centrada en el agente elegido
    // la ficha que sale al lado es la del jefe de ese piso (o la del primero que haya); si está vacío, no sale ficha
    const r = reparto(ed.e, id), quien = (r.despacho || [])[0] || (r.centro || [])[0] || (r.recepcion || [])[0] || ed.e.agentes.find((a) => a.planta === id);
    if (quien) { seleccion = quien.id; if (window.innerWidth > 900) document.body.classList.add("con-panel"); }
  }
  plantaAbierta = id; verPestana(window.innerWidth <= 900 ? "edificio" : pestana === "actividad" ? "actividad" : "ficha"); pintar();
  const c = $("edificio").closest(".ciudad"); if (c) c.scrollTop = 0;
  marcarNav();
}

// ---------------- Vista de una planta ----------------
function pintarPlanta(cont, p) {
  const foco = document.activeElement;
  if (cont.contains(foco) && (foco.tagName === "INPUT" || foco.tagName === "TEXTAREA")) return;
  const scrollTira = (cont.querySelector(".tira") || {}).scrollLeft || 0;
  cont.innerHTML = "";
  const T = TRAMO[p.tipo], r = reparto(ed.e, p.id), ags = ed.e.agentes.filter((a) => a.planta === p.id);
  const ejecutar = (acc) => Motor.ejecutar(acc).then(pintar).catch(avisar);
  // cabecera: volver, nombre y función (se cambian escribiendo)
  const nombre = h("input", { class: "nombre-planta", value: p.nombre, "aria-label": "Name of the floor", onchange: (ev) => ejecutar({ tipo: "editarPlanta", id: p.id, nombre: ev.target.value }) });
  const funcion = h("textarea", { class: "funcion-planta", rows: "1", maxlength: "300", placeholder: "What is this floor for?", "aria-label": "What the floor does", onchange: (ev) => ejecutar({ tipo: "editarPlanta", id: p.id, funcion: ev.target.value.replace(/\s*\n\s*/g, " ") }) });
  funcion.value = p.funcion || "";
  cont.append(h("div", { class: "planta-cab" },
    h("button", { class: "volver", type: "button", onclick: volverAtras }, "← Back to the whole building"),
    nombre, funcion,
    h("p", { class: "planta-datos" }, tr(ags.length === 1 ? "1 agent" : `${ags.length} agents`) + (gastoPlanta(p) > 0 ? " · " + tr(`today ${fmt(gastoPlanta(p))}`) : "") + (p.tipo === "piso" ? " · " + tr(p.oficinas === 1 ? "1 office" : `${p.oficinas} offices`) + " · " + tr(p.pools === 1 ? "1 pool" : `${p.pools} pools`) : ""))));
  // la planta dibujada
  const tira = h("div", { class: "tira " + p.tipo });
  if (p.tipo === "piso") {
    for (const m of modulosPiso(p, r, T, true)) tira.append(m);
  } else {
    // cúpula y vestíbulo: un recorte del dibujo grande, para verlos de cerca
    const [x0, x1, y0, y1] = CORTE[p.tipo], Tc = Object.assign({}, T, { suelo: T.suelo - y0, alto: y1 - y0 });
    const lienzo = h("div", { class: "lienzo", style: { "--x0": x0, "--x1": x1, "--y0": y0, "--y1": y1, "--W": ANCHO, "--A": T.alto, backgroundImage: `url(${T.img2})` } });
    for (const [puesto, xs] of Object.entries(SITIOS[p.tipo])) {
      const a = (r[puesto] || [])[0];
      if (a) lienzo.append(personaje(a, Tc, xs[0], x0, x1 - x0, true));
      else if (puesto !== "centro") lienzo.append(hueco(Tc, xs[0], x0, x1 - x0, p, puesto));
    }
    tira.append(lienzo);
  }
  const marco = h("div", { class: "marco-tira" }, tira,
    h("button", { class: "flecha izq", type: "button", "aria-label": "See more to the left", onclick: () => tira.scrollBy({ left: -tira.clientWidth * 0.8, behavior: "smooth" }) }, "‹"),
    h("button", { class: "flecha der", type: "button", "aria-label": "See more to the right", onclick: () => tira.scrollBy({ left: tira.clientWidth * 0.8, behavior: "smooth" }) }, "›"));
  const anchoCont = Math.max(280, cont.clientWidth || 700);
  if (p.tipo === "cupula") marco.style.setProperty("--h", Math.min(270, Math.floor(anchoCont * (CORTE.cupula[3] - CORTE.cupula[2]) / (CORTE.cupula[1] - CORTE.cupula[0]))) + "px");
  let ventanaPlano = null, plano = null;
  const mover = () => {
    const sw = tira.scrollWidth || 1;
    if (plano) { const w = plano.scrollWidth || 1; ventanaPlano.style.left = (tira.scrollLeft / sw * w) + "px"; ventanaPlano.style.width = (tira.clientWidth / sw * w) + "px"; }
    marco.classList.toggle("hay-izq", tira.scrollLeft > 4); marco.classList.toggle("hay-der", tira.scrollLeft + tira.clientWidth < sw - 4);
  };
  tira.addEventListener("scroll", mover, { passive: true });
  if (p.tipo === "piso") {
    // plano pequeño de todo el piso: enseña dónde estás y lleva a cada sitio con un toque
    const total = (MODULO.despacho[1] - MODULO.despacho[0]) * 2 + p.pools * (MODULO.pool[1] - MODULO.pool[0]) * 2 + Math.max(p.oficinas, r.oficina.length) * (MODULO.oficina[1] - MODULO.oficina[0]) * 2 + (MODULO.fin[1] - MODULO.fin[0]) * 2;
    const alto = Math.min(84, Math.max(34, anchoCont * 260 / total));
    plano = h("div", { class: "plano", style: { "--h": alto + "px" }, "aria-hidden": "true" }, modulosPiso(p, r, T, false));
    ventanaPlano = h("span", { class: "ventana-plano" });
    plano.append(ventanaPlano);
    plano.addEventListener("click", (ev) => { const b = plano.getBoundingClientRect(); tira.scrollTo({ left: (ev.clientX - b.left) / b.width * tira.scrollWidth - tira.clientWidth / 2, behavior: "smooth" }); });
    cont.append(plano);
  }
  cont.append(marco);
  requestAnimationFrame(() => {
    tira.scrollLeft = scrollTira;
    if (centrarPendiente) {
      centrarPendiente = false;
      const foco = tira.querySelector(".pj.sel") || (p.tipo === "vestibulo" ? tira.querySelector(".pj") : null);
      if (foco) { const bt = tira.getBoundingClientRect(), bf = foco.getBoundingClientRect(); tira.scrollLeft += bf.left + bf.width / 2 - bt.left - tira.clientWidth / 2; }
    }
    mover();
  });
  // acciones de la planta
  const acc = h("div", { class: "planta-acciones" },
    p.tipo === "cupula" && r.izquierda.length && r.derecha.length ? null : h("button", { class: "btn primario mini", onclick: () => abrirCajon("agente", { planta: p.id, puesto: p.tipo === "cupula" ? (r.izquierda.length ? "derecha" : "izquierda") : "" }) }, p.tipo === "cupula" ? "+ Sage" : "+ Agent on this floor"));
  if (p.tipo === "piso") {
    acc.append(...[
      h("button", { class: "btn mini", disabled: p.oficinas >= MAX_OFICINAS, onclick: () => ejecutar({ tipo: "ampliarPlanta", id: p.id, que: "oficina", cambio: 1 }) }, "+ Office"),
      h("button", { class: "btn mini", disabled: p.oficinas <= Math.max(1, r.oficina.length), onclick: () => ejecutar({ tipo: "ampliarPlanta", id: p.id, que: "oficina", cambio: -1 }) }, "− Office"),
      h("button", { class: "btn mini", disabled: p.pools >= MAX_POOLS, onclick: () => ejecutar({ tipo: "ampliarPlanta", id: p.id, que: "pool", cambio: 1 }) }, "+ Pool"),
      h("button", { class: "btn mini", disabled: !p.pools || (p.pools - 1) * POR_POOL < r.pool.length, onclick: () => ejecutar({ tipo: "ampliarPlanta", id: p.id, que: "pool", cambio: -1 }) }, "− Pool"),
      h("button", { class: "btn mini", onclick: () => ejecutar({ tipo: "subirPlanta", id: p.id }) }, "Move up"),
      h("button", { class: "btn mini", onclick: () => ejecutar({ tipo: "bajarPlanta", id: p.id }) }, "Move down"),
      ags.length ? null : h("button", { class: "btn mini peligro", onclick: (ev) => confirmar(ev.target, "Delete the floor? Press again", () => Motor.ejecutar({ tipo: "borrarPlanta", id: p.id }).then(() => { plantaAbierta = ""; pintar(); }).catch(avisar)) }, "Delete floor")].filter(Boolean));
  }
  cont.append(acc);
  // quién trabaja aquí
  const lista = h("div", { class: "quienes" });
  const orden = { centro: 0, despacho: 0, recepcion: 0, izquierda: 1, derecha: 2, oficina: 3, pool: 4 };
  for (const a of ags.slice().sort((x, y) => (orden[x.puesto] ?? 9) - (orden[y.puesto] ?? 9))) {
    const est = estadoVisible(a);
    lista.append(h("button", { class: "quien " + est + (seleccion === a.id ? " sel" : ""), type: "button", onclick: () => elegir(a) },
      h("img", { src: figura(a.aspecto), alt: "" }),
      h("span", { class: "q-txt" }, h("b", {}, a.nombre), h("small", {}, `${rolTxt(a)} · ${NOMBRE_PUESTO[a.puesto] || a.puesto}`), h("small", {}, `${tr(ESTADO_TXT[est])} · ${["interventor", "memory"].includes(a.rol) ? tr("doesn't spend") : textoLatido(a.latido)}${ed.gastoAgente(a, "hoy") > 0 ? " · " + tr(`today ${fmt(ed.gastoAgente(a, "hoy"))}`) : ""}`))));
  }
  cont.append(ags.length ? lista : h("p", { class: "planta-vacia" }, p.tipo === "piso" ? "Empty floor. Put a section head in the head office and their sub-agents in the offices or the pool." : "This floor is empty."));
}
// Los módulos de un piso: despacho, uno o más pools, las oficinas y el cierre de cristal.
function modulosPiso(p, r, T, grande) {
  const mod = (tipo, x0, x1, contenido) => h("div", { class: "modulo " + tipo, style: { "--x0": x0 * 2, "--w": (x1 - x0) * 2 } }, contenido);
  const fig = (a, x, x0, ancho, puesto) => a ? personaje(a, T, x, x0, ancho, grande) : grande ? hueco(T, x, x0, ancho, p, puesto) : null;
  const [d0, d1] = MODULO.despacho, [p0, p1] = MODULO.pool, [o0, o1] = MODULO.oficina, [f0, f1] = MODULO.fin;
  const out = [mod("despacho", d0, d1, fig(r.despacho[0], SITIOS.piso.despacho[0], d0, d1 - d0, "despacho"))];
  for (let k = 0; k < p.pools; k++) out.push(mod("pool", p0, p1, SITIOS.piso.pool.map((x, i) => fig(r.pool[k * POR_POOL + i], x, p0, p1 - p0, "pool"))));
  const nOf = Math.max(p.oficinas, r.oficina.length);
  for (let k = 0; k < nOf; k++) out.push(mod("oficina", o0, o1, fig(r.oficina[k], SITIOS.piso.oficina[0], o0, o1 - o0, "oficina")));
  out.push(mod("fin", f0, f1));
  return out;
}
function latirAntena() { const l = $("luzAntena"); if (!l) return; l.classList.remove("late"); void l.offsetWidth; l.classList.add("late"); }
// Errores: en el chat si está abierto; si no, un aviso abajo que se va solo.
function avisar(err) {
  const t = err && err.mostrado ? err.message : `Something went wrong: ${(err && err.message) || err}`;
  if (chatId) { pendientesError.push(t); pintarChat(true); return; }
  avisoFlotante(t);
}
function avisoFlotante(t) {
  let el = $("avisoFlotante");
  if (!el) { el = h("div", { id: "avisoFlotante", class: "aviso-flotante", role: "status" }); document.body.append(el); el.onclick = () => { el.hidden = true; }; }
  el.textContent = tr(t); el.hidden = false; clearTimeout(avisoFlotante.t); avisoFlotante.t = setTimeout(() => { el.hidden = true; }, 8000);
}

// ---------------- Pestañas del panel ----------------
function verPestana(p) {
  if (p === "edificio") { document.body.classList.add("ver-edificio"); $("tabEdificio").setAttribute("aria-selected", "true"); for (const id of ["tabFicha", "tabActividad"]) $(id).setAttribute("aria-selected", "false"); return; }
  document.body.classList.remove("ver-edificio"); $("tabEdificio").setAttribute("aria-selected", "false");
  pestana = p;
  for (const [id, v, n] of [["tabFicha", "vistaFicha", "ficha"], ["tabActividad", "vistaActividad", "actividad"]]) {
    $(id).setAttribute("aria-selected", String(p === n)); $(v).hidden = p !== n;
  }
  if (p === "ficha") pintarFicha(true);
  if (p === "actividad") pintarRegistro();
}

// ---------------- Ficha de un agente, en cuatro pestañas ----------------
const QUE_HACE = {
  tecno: "Every day it does its round without spending: it checks new agents, every other night it makes sure everyone has worked and left their mark, on Fridays it saves a backup, clears what's been dealt with, removes duplicate memories and makes sure nothing is sent, deleted or paid without your yes. On Mondays it reviews the costs, and only then does it use its brain, to say whether they pay off.",
  mejora: "Follows every day how AI agents are moving forward and suggests improvements for the building to the boss. It uses internet search. When a new model comes out, it proposes it to you as a recommended one; you decide.",
  creador: "Designs new agents from what you tell it in your own words. Use it from “Create agent” or by asking the boss. Nothing is created unless you accept it.",
  interventor: "Watches the spending with fixed rules: it freezes the least important agents when spending gets close to the cap. No brain: it doesn't spend. It can propose red coins; you confirm them.",
  jev: "Before an agent does something that costs money (searching the internet, retrying what failed or creating another agent), it decides: go ahead, reuse what's already there, stop or ask the boss. It uses the Jev model. It can propose red coins; you confirm them.",
  memory: "Keeps the building's long-term memory and searches it by keywords when you say “remember…”. No brain: it doesn't spend.",
  sabio: "Only speaks when the boss consults it on an important decision. It's expensive: it's capped at one consultation a day."
};
const PESTANAS_FICHA = [["identidad", "Identity"], ["trabajo", "Work"], ["cerebro", "Brain and spending"], ["capacidades", "Capabilities"]];
const fecha = (ts, op) => new Date(ts).toLocaleString(LOCALE, op || { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const campo = (txt, el, ayuda) => h("label", { class: "campo" }, h("span", {}, txt), el, ayuda ? h("small", {}, ayuda) : null);
function pintarFicha(forzar) {
  const caja = $("ficha");
  const foco = document.activeElement;   // no se repinta mientras escribes o eliges en un desplegable
  if (!forzar && caja.contains(foco) && (foco.tagName === "TEXTAREA" || foco.tagName === "SELECT" || (foco.tagName === "INPUT" && !["checkbox", "radio"].includes(foco.type)))) return;
  const a = ed.agenteExacto(seleccion) || ed.jefe();
  if (!a) return;
  seleccion = a.id;
  const sc = caja.scrollTop;
  caja.innerHTML = "";
  const cambiar = (cambios) => Motor.ejecutar({ tipo: "editarAgente", id: a.id, cambios }).then(pintar).catch(avisar);
  const est = estadoVisible(a), sinCerebro = a.rol === "interventor" || a.rol === "memory";
  const pl = ed.e.plantas.find((x) => x.id === a.planta);
  // cabecera: figura, nombre, estado y lo esencial
  caja.append(h("div", { class: "ficha-cab" },
    h("button", { class: "marco-ficha", type: "button", title: "Change their photo and name", onclick: () => abrirCajon("aspecto", { id: a.id }) }, h("img", { src: figura(a.aspecto), alt: "" })),
    h("div", { style: { flex: 1, minWidth: 0, display: "grid", gap: "4px" } }, h("h3", { class: "ficha-nombre" }, a.nombre),
      h("div", { class: "fila-c" }, h("span", { class: "estado-pill " + est }, tr(ESTADO_TXT[est]) + (a.motivoEstado ? " · " + a.motivoEstado : "")),
        h("span", { class: "nota" }, `${rolTxt(a)} · ${pl ? pl.nombre : ""}`)))));
  caja.append(h("div", { class: "fila-c", style: { marginTop: "12px" } },
    conversa(a) ? h("button", { class: "btn primario mini", onclick: () => abrirChat(a.id) }, `Talk to ${a.nombre}`) : null,
    sinCerebro || a.rol === "jev" ? null : h("button", { class: "btn mini", onclick: () => { Motor.ejecutar({ tipo: "despertar", id: a.id }).then(pintar).catch(avisar); pintar(); } }, "Wake up now"),
    h("button", { class: "btn mini", onclick: () => cambiar({ apagado: !a.apagado }) }, a.apagado ? "Turn on" : "Turn off"),
    pl ? h("button", { class: "btn mini", onclick: () => abrirPlanta(pl.id) }, "See their floor") : null,
    a.rol === "jefe" ? null : h("button", { class: "btn mini peligro", onclick: (ev) => confirmar(ev.target, "Delete? Press again", () => Motor.ejecutar({ tipo: "borrarAgente", id: a.id }).then(() => { seleccion = "jefe"; pintar(); verPestana("ficha"); }).catch(avisar)) }, "Delete")));
  if (QUE_HACE[a.rol]) caja.append(h("p", { class: "que-hace" }, QUE_HACE[a.rol]));
  if (a.falta) caja.append(h("div", { class: "aviso-falta" }, h("b", {}, "Says it's missing something and won't move on alone"), h("span", {}, entreComillas(a.falta.texto)),
    h("small", { class: "nota" }, "Give it what it asks for (capabilities, skills, data) or change its objective. Changing its profile marks it as handled."),
    h("div", {}, h("button", { class: "btn mini", type: "button", onclick: () => Motor.ejecutar({ tipo: "bandeja.decidir", clase: "falta", id: a.id, si: true }).then(pintar).catch(avisar) }, "It has it now"))));
  caja.append(h("div", { class: "ficha-pestanas", role: "tablist" }, PESTANAS_FICHA.map(([k, t]) =>
    h("button", { role: "tab", type: "button", "aria-selected": String(fichaTab === k), onclick: () => { fichaTab = k; pintarFicha(true); $("ficha").scrollTop = 0; } }, t))));
  const pinta = { identidad: fichaIdentidad, trabajo: fichaTrabajo, cerebro: fichaCerebro, capacidades: fichaCapacidades }[fichaTab] || fichaIdentidad;
  pinta(caja, a, cambiar, { sinCerebro, pl });
  caja.scrollTop = sc;
}
// Identidad: nombre, aspecto, papel, dónde está, a quién informa y sus monedas
function fichaIdentidad(caja, a, cambiar, { pl }) {
  const nombre = h("input", { value: a.nombre, maxlength: "40", onchange: (ev) => cambiar({ nombre: ev.target.value.trim() || a.nombre }) });
  const plantasValidas = a.rol === "jefe" ? [] : ed.e.plantas.filter((x) => a.rol === "sabio" ? x.tipo === "cupula" : x.tipo !== "cupula");
  const selPlanta = h("select", { disabled: a.rol === "jefe" || a.rol === "sabio", onchange: (ev) => cambiar({ planta: ev.target.value, puesto: "" }) }, (a.rol === "jefe" || a.rol === "sabio" ? [pl] : plantasValidas).filter(Boolean).map((x) => h("option", { value: x.id }, x.nombre)));
  selPlanta.value = a.planta;
  const opPuesto = pl ? (PUESTOS_TXT[pl.tipo] || []) : [];
  const selPuesto = h("select", { disabled: a.rol === "jefe", onchange: (ev) => cambiar({ planta: a.planta, puesto: ev.target.value }) }, (a.rol === "jefe" ? [["centro", "Centre of the dome"]] : opPuesto).map(([v, t]) => h("option", { value: v }, t)));
  selPuesto.value = a.puesto;
  // «Informa a»: cualquier agente del edificio (con buscador si hay muchos); el motor no deja hacer círculos
  const otros = ed.e.agentes.filter((x) => x.id !== a.id);
  const selInforma = h("select", { onchange: (ev) => cambiar({ reportaA: ev.target.value }) });
  const llenarInforma = (q) => {
    const t = sinAcentos(q || "");
    selInforma.replaceChildren(h("option", { value: "" }, "Nobody"), ...otros.filter((x) => !t || x.id === a.reportaA || sinAcentos(`${x.nombre} ${rolTxt(x)}`).includes(t)).map((x) => h("option", { value: x.id }, `${x.nombre} · ${rolTxt(x)}`)));
    selInforma.value = a.reportaA || "";
  };
  llenarInforma("");
  const selJefe = otros.length > 6 ? h("div", { class: "informa-a" }, h("input", { type: "search", placeholder: "Type their name to find them", "aria-label": "Search who they report to", oninput: (ev) => llenarInforma(ev.target.value) }), selInforma) : selInforma;
  const cambiable = ["jefe_seccion", "subagente"].includes(a.rol);
  const selRol = h("select", { onchange: (ev) => cambiar({ rol: ev.target.value }) }, [["jefe_seccion", "Section head"], ["subagente", "Sub-agent"]].map(([k, v]) => h("option", { value: k }, v)));
  selRol.value = a.rol;
  caja.append(h("div", { class: "bloque" },
    campo("Name", nombre),
    h("div", { class: "campo" }, h("span", {}, "Appearance"), h("div", { class: "fila-c" }, h("img", { class: "mini-pj", src: figura(a.aspecto), alt: "" }), h("button", { class: "btn mini", onclick: () => abrirCajon("aspecto", { id: a.id }) }, "Change their photo and name"))),
    h("div", { class: "dos" }, cambiable ? campo("Role", selRol) : h("div", { class: "campo" }, h("span", {}, "Role"), h("span", { class: "nota" }, rolTxt(a))),
      a.rol === "jefe" ? null : campo("Reports to", selJefe)),
    h("div", { class: "dos" }, campo("Floor", selPlanta), campo("Spot", selPuesto))));
  caja.append(bloqueMonedas(a));
}
// Monedas: doradas (buen trabajo) y rojas (alucinar, gastar en balde). Cada una, con su motivo en una línea.
function bloqueMonedas(a) {
  const mias = (ed.e.monedas || []).filter((m) => m.agente === a.id);
  const oro = mias.filter((m) => m.tipo === "oro" && m.estado === "confirmada").length, rojas = mias.filter((m) => m.tipo === "roja" && m.estado === "confirmada").length;
  const caja = h("div", { class: "bloque" }, h("h4", {}, "Coins"),
    h("div", { class: "fila-c" }, h("span", { class: "moneda oro" }), h("b", {}, oro), h("span", { class: "nota" }, oro === 1 ? "gold coin" : "gold coins"), h("span", { class: "moneda roja" }), h("b", {}, rojas), h("span", { class: "nota" }, rojas === 1 ? "red coin" : "red coins")),
    h("div", { class: "fila-c" }, botonMoneda(a, "oro"), botonMoneda(a, "roja")),
    h("small", { class: "nota" }, `A cheap model turns the reason into a concrete rule; when you approve it in the inbox, ${a.nombre} and everyone with the same role (${rolTxt(a)}) learn it.`));
  for (const m of mias.filter((x) => x.estado === "propuesta")) caja.append(filaMonedaPropuesta(m));
  const ultimas = mias.filter((m) => m.estado === "confirmada").slice(-5).reverse();
  if (ultimas.length) caja.append(h("div", { class: "lista" }, ultimas.map((m) => h("div", { class: "item" }, h("div", { class: "cab" }, h("span", {}, h("span", { class: "moneda " + m.tipo }), " ", fecha(m.ts)), h("span", {}, m.propone === "tú" ? "from you" : tr(`proposed by ${quienPropone(m.propone)}, confirmed`))), h("div", { class: "txt" }, crudo(m.motivo))))));
  return caja;
}
// Botón de moneda: al pulsarlo pide el motivo en una línea
function botonMoneda(a, tipo, alDar) {
  const b = h("button", { class: "moneda-btn", type: "button", title: tipo === "oro" ? "Gold coin: it did well" : "Red coin: it made things up or wasted money" }, h("span", { class: "moneda " + tipo }), tipo === "oro" ? "Gold coin" : "Red coin");
  b.onclick = () => {
    const inp = h("input", { maxlength: "160", placeholder: tipo === "oro" ? "What did it do well? (one line)" : "What did it do wrong? (one line)" });
    const dar = async () => {
      if (!inp.value.trim()) { inp.focus(); return; }
      try {
        inp.disabled = true;
        const r = await Motor.ejecutar({ tipo: "moneda.dar", id: a.id, tipoMoneda: tipo, motivo: inp.value.trim() });
        const hecho = tr(`${tipo === "oro" ? "Gold coin" : "Red coin"} for ${a.nombre}.`) + (r.leccion ? " " + tr(`Proposed lesson: “${r.leccion.texto}”. Approve it or tweak it in the inbox.`) : "");
        fila.replaceWith(h("span", { class: "nota" }, hecho)); avisoFlotante(hecho); if (alDar) alDar(); pintar();
      }
      catch (err) { inp.disabled = false; avisar(err); }
    };
    inp.onkeydown = (ev) => { if (ev.key === "Enter") { ev.preventDefault(); dar(); } if (ev.key === "Escape") fila.replaceWith(b); };
    const fila = h("span", { class: "motivo-fila" }, h("span", { class: "moneda " + tipo }), inp, h("button", { class: "btn mini primario", type: "button", onclick: dar }, "Give"), h("button", { class: "btn mini", type: "button", onclick: () => fila.replaceWith(b) }, "Cancel"));
    b.replaceWith(fila); inp.focus();
  };
  return b;
}
function filaMonedaPropuesta(m) {
  return h("div", { class: "fila-moneda" }, h("span", { class: "moneda " + m.tipo }),
    h("span", { class: "grow" }, h("b", {}, m.nombre), " · " + tr(`${quienPropone(m.propone)} proposes:`) + " ", crudo(m.motivo)),
    h("button", { class: "btn mini primario", onclick: () => Motor.ejecutar({ tipo: "moneda.confirmar", moneda: m.id }).then(pintar).catch(avisar) }, "Confirm"),
    h("button", { class: "btn mini", onclick: () => Motor.ejecutar({ tipo: "moneda.descartar", moneda: m.id }).then(pintar).catch(avisar) }, "Dismiss"));
}
// Trabajo: instrucciones, objetivo, lecciones, latido, tareas y memoria corta
function fichaTrabajo(caja, a, cambiar, { sinCerebro }) {
  if (!sinCerebro) {
    const per = h("textarea", { rows: "2", maxlength: String(MAX_PERSONALIDAD), placeholder: "Its tone, its humour and whether it gets to the point. For example: “Friendly and funny, but brief and to the point.”", onchange: (ev) => cambiar({ personalidad: ev.target.value.trim() }) }, a.personalidad || "");
    const cuenta = h("span", { class: "contador" }, `${(a.personalidad || "").length}/${MAX_PERSONALIDAD}`);
    per.oninput = () => { cuenta.textContent = `${per.value.length}/${MAX_PERSONALIDAD}`; };
    caja.append(h("div", { class: "bloque" },
      campo("Instructions (who it is and how it works)", h("textarea", { rows: "6", onchange: (ev) => cambiar({ cuerpo: ev.target.value }) }, a.cuerpo)),
      a.rol === "jev" ? null : campo("Personality", per, "Sent with every call: that way its character doesn't depend on the brain you give it."), a.rol === "jev" ? null : cuenta,
      a.rol === "jev" ? null : campo("Objective", h("textarea", { rows: "2", onchange: (ev) => cambiar({ objetivo: ev.target.value }) }, a.objetivo))));
  }
  // lecciones de su papel (salen de las monedas); las nuevas esperan tu sí en la bandeja
  const pendLecc = (ed.e.lecciones || []).filter((l) => l.papel === a.rol && l.estado === "propuesta");
  const lecc = ed.leccionesDe(a.rol).slice().sort((x, y) => (y.fija - x.fija) || (y.ts - x.ts));
  const max = ed.e.ajustes.leccionesPorPapel || 5;
  caja.append(h("div", { class: "bloque" }, h("h4", {}, `Lessons for its role (${rolTxt(a)})`),
    lecc.length ? h("div", { class: "lista" }, lecc.map((l) => h("div", { class: "item leccion" + (l.fija ? " fija" : "") }, h("span", { class: "moneda " + l.tipo }), h("span", { class: "txt" }, crudo(l.texto)),
      h("button", { class: "btn mini", title: l.fija ? "Let it go when new lessons come in" : "Never let it go, even when it's old", onclick: () => Motor.ejecutar({ tipo: "leccion.fijar", leccion: l.id, fija: !l.fija }).then(pintar).catch(avisar) }, l.fija ? "Unpin" : "Pin"),
      h("button", { class: "btn mini", onclick: () => Motor.ejecutar({ tipo: "leccion.borrar", leccion: l.id }).then(pintar).catch(avisar) }, "Remove"))))
      : h("p", { class: "nota", style: { margin: 0 } }, "None yet. They come from coins: a cheap model turns the reason into a rule and you approve it in the inbox."),
    pendLecc.length ? h("div", { class: "fila-c" }, h("span", { class: "nota" }, pendLecc.length === 1 ? "1 new lesson is waiting for your yes." : `${pendLecc.length} new lessons are waiting for your yes.`), h("button", { class: "btn mini", type: "button", onclick: () => abrirPantalla("bandeja") }, "Go to the inbox")) : null,
    h("small", { class: "nota" }, `Everyone with this role learns them. ${max} are kept per role (change it in Settings); when a new one comes in, the oldest goes, except pinned ones.`)));
  // latido
  const num = h("input", { type: "number", min: "1", step: "1", value: a.latido.cada, disabled: a.latido.unidad === "peticion" });
  const uni = h("select", {}, [["min", "minutes"], ["h", "hours"], ["d", "days"], ["peticion", "on request only"]].map(([v, t]) => h("option", { value: v }, t)));
  uni.value = a.latido.unidad;
  const guardarLatido = () => cambiar({ latido: { cada: Math.max(1, parseInt(num.value, 10) || 1), unidad: uni.value } });
  num.onchange = guardarLatido; uni.onchange = guardarLatido;
  const alD = h("select", { onchange: (ev) => cambiar({ alDespertar: ev.target.value }) }, h("option", { value: "tareas" }, "Does its pending tasks (if there are none, it doesn't spend)"), h("option", { value: "objetivo" }, "Does its tasks and, if there are none, works on its objective (spends)"));
  alD.value = a.alDespertar || "tareas";
  const prox = a.proximo && a.proximo < 9e14 ? fecha(a.proximo, { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "—";
  caja.append(h("div", { class: "bloque" }, h("h4", {}, "Heartbeat"),
    h("div", { class: "campo" }, h("span", {}, "Resting, it wakes up"), h("div", { class: "fila-c" }, h("span", {}, "every"), num, uni)),
    sinCerebro || a.rol === "sabio" || a.rol === "jev" ? null : campo("When it wakes up", alD),
    h("small", { class: "nota" }, a.latido.unidad === "peticion" ? "Only works when someone gives it a job." : `Next heartbeat: ${prox}. Last: ${a.ultimo ? fecha(a.ultimo) : "never"}.`)));
  // tareas
  if (!sinCerebro && a.rol !== "jev") {
    const txt = h("input", { placeholder: "Give it a job…" }), ahora = h("input", { type: "checkbox" });
    const lista = h("div", { class: "lista" });
    for (const t of a.tareas.slice().reverse().slice(0, 15)) {
      lista.append(h("div", { class: "item" }, h("div", { class: "cab" }, h("span", {}, fecha(t.creada) + " · " + (t.de ? tr(`from ${(ed.agenteExacto(t.de) || {}).nombre || t.de}`) : tr("from you"))), h("span", { class: "est " + t.estado }, t.estado)),
        h("div", { class: "txt" }, crudo(t.texto)), t.resultado ? h("details", {}, h("summary", {}, "Result"), h("div", { class: "txt", html: markdown(t.resultado) })) : null));
    }
    caja.append(h("div", { class: "bloque" }, h("h4", {}, "Tasks"),
      h("div", { class: "fila-c" }, txt, h("label", { class: "fila-c nota" }, ahora, "now"), h("button", { class: "btn mini", onclick: () => { if (!txt.value.trim()) return; Motor.ejecutar({ tipo: "asignarTarea", id: a.id, texto: txt.value.trim(), ahora: ahora.checked }).then(() => { txt.value = ""; pintar(); }).catch(avisar); } }, "Assign")),
      a.tareas.length ? lista : h("p", { class: "nota", style: { margin: 0 } }, "No tasks.")));
  }
  // memoria corta
  const mc = h("div", { class: "lista" });
  for (const m of a.memoriaCorta.slice().reverse().slice(0, 10)) mc.append(h("div", { class: "item" }, h("div", { class: "cab" }, h("span", {}, fecha(m.ts)), h("span", {}, m.tipo)), h("div", { class: "txt" }, crudo(m.texto))));
  caja.append(h("div", { class: "bloque" }, h("h4", {}, "Short memory"), a.memoriaCorta.length ? mc : h("p", { class: "nota", style: { margin: 0 } }, "Still empty.")));
  // Memory: la memoria larga del edificio
  if (a.rol === "memory") {
    const ml = h("div", { class: "lista" });
    for (const n of ed.e.memoriaLarga.slice().reverse()) ml.append(h("div", { class: "item" }, h("div", { class: "cab" }, h("span", {}, new Date(n.ts).toLocaleDateString(LOCALE) + (n.etiquetas && n.etiquetas.length ? " · " + n.etiquetas.join(", ") : "")),
      h("button", { class: "btn mini", onclick: () => Motor.ejecutar({ tipo: "memoria.borrar", idNota: n.id }).then(pintar) }, "Delete")), h("div", { class: "txt" }, crudo(n.texto))));
    const nt = h("textarea", { rows: "2", placeholder: "Something the building should remember…" }), et = h("input", { placeholder: "tags, separated by commas" });
    caja.append(h("div", { class: "bloque" }, h("h4", {}, `Building's long-term memory (${ed.e.memoriaLarga.length})`),
      h("p", { class: "nota", style: { margin: 0 } }, "When you say “remember…” to the boss, Memory searches here by keywords and passes it on. It uses no brain: it doesn't spend. Later on it will be able to live in Google Drive."),
      nt, et, h("div", {}, h("button", { class: "btn mini", onclick: () => { if (!nt.value.trim()) return; Motor.ejecutar({ tipo: "memoria.guardar", texto: nt.value.trim(), etiquetas: et.value.split(",").map((x) => x.trim()).filter(Boolean) }).then(pintar).catch(avisar); } }, "Save memory")), ml));
  }
}
// Cerebro y gasto: qué modelo piensa por él, su prioridad, su tope y lo que lleva gastado
function fichaCerebro(caja, a, cambiar, { sinCerebro }) {
  if (sinCerebro) caja.append(h("div", { class: "bloque" }, h("h4", {}, "Brain"), h("p", { class: "nota", style: { margin: 0 } }, "Works with fixed rules, no brain: it doesn't spend.")));
  else if (a.rol === "jev") {
    const sel = selectorModelo("decisiones", a.cerebro, { extra: [[MODELO_JEV, "Jev Latest · always the latest version of Jev"]], alCambiar: (v) => cambiar({ cerebro: v }) });
    caja.append(h("div", { class: "bloque" }, h("h4", {}, "Brain"), campo("Decision model", sel, "JEV decides with OpenRouter's decisions API. “Jev Latest” always points to the latest version, without changing it by hand.")));
  } else {
    // Con qué piensa: OpenRouter (se paga por uso) o una de tus otras API (Ajustes → Otras API), la de una suscripción que ya pagas
    const prov = ed.cerebroDe(a).proveedor, conx = ed.conexiones();
    const opciones = [["openrouter", "OpenRouter (pay per use)"], ...conx.map((c) => [c.id, `${c.nombre} · your subscription`])];
    if (prov !== "openrouter" && !conx.some((c) => c.id === prov)) opciones.push([prov, (ed.proveedor(prov) || {}).nombre || prov]);
    const selProv = h("select", { onchange: (ev) => {
      const nuevo = ev.target.value;
      const cerebro = nuevo === "openrouter" ? ((ed.modeloEquivalente(prov, a.cerebro) || {}).id || ed.cerebroPorDefecto(Object.assign({}, a, { proveedor: "openrouter" }))) : (sugerenciasDirectas(nuevo, a)[0] || "");
      cambiar({ proveedor: nuevo, cerebro });
    } }, opciones.map(([k, t]) => h("option", { value: k }, t)));
    selProv.value = prov;
    const bloque = h("div", { class: "bloque" }, h("h4", {}, "Brain"), campo("Thinks with", selProv));
    if (!conx.length) bloque.append(h("small", { class: "nota" }, "Do you have a subscription that includes API access (for example, Claude or ChatGPT credits, Gemini or a model on your computer)? Add it in Settings → Other APIs and you'll be able to pick it here. Anything paid separately is better through OpenRouter."));
    if (prov === "openrouter") {
      bloque.append(campo("Brain", selectorModelo("texto", a.cerebro, { alCambiar: (v) => cambiar({ cerebro: v }) }), "At the top, the recommended ones by price level (not quality); below, all of OpenRouter's text models. Or type the name with “Search all”. Prices in dollars per million tokens (input / output). “sees” = can look at images."),
        propuestasDe("texto"));
    } else {
      const P = ed.proveedor(prov) || { corto: prov };
      bloque.append(selectorDirecto(prov, a.cerebro, (v) => cambiar({ cerebro: v })),
        h("small", { class: "nota" }, tr(tieneClaveApi(prov) ? `Comes out of your ${P.corto} subscription: it doesn't count towards the spending cap (it's tracked separately, so you can see it).` : `The ${P.corto} key is missing: add it in Settings → Other APIs.`) + " " +
          tr("Internet search only works with OpenRouter.")));
      const selAgota = h("select", { onchange: (ev) => cambiar({ siAgota: ev.target.value }) }, h("option", { value: "openrouter" }, "Carry on with OpenRouter"), h("option", { value: "parar" }, "Stop working"));
      selAgota.value = a.siAgota || "openrouter";
      bloque.append(campo(`If your ${P.corto} quota runs out`, selAgota, "When the company says there are no credits left (for example, at the end of the month), you choose."));
      if ((a.siAgota || "openrouter") === "openrouter") {
        const eq = ed.modeloEquivalente(prov, a.cerebro);
        bloque.append(campo("Its brain on OpenRouter in the meantime", selectorModelo("texto", a.cerebroReserva, { vacio: eq ? `The same model on OpenRouter (${eq.name || eq.id})` : "The one its role would get", alCambiar: (v) => cambiar({ cerebroReserva: v }) })));
      }
      const sus = Object.entries(a.suscripcion || {}).sort().at(-1);
      if (sus) bloque.append(h("small", { class: "nota" }, tr(`From your subscription, on ${sus[0]}: ${sus[1].tokens.toLocaleString(LOCALE)} tokens`) + (sus[1].usd ? " " + tr(`(on OpenRouter it would be ≈${fmt(sus[1].usd)})`) : "") + "."));
    }
    const est = ed.estimarLatido(a);
    // cada trozo se traduce por separado (así cada idioma lo ordena a su manera)
    bloque.append(h("small", { class: "nota" }, [tr(`When it wakes up: ${est.como}`), est.gasta && est.porVez > 0 ? tr(`· ≈${fmt(est.porVez)} per heartbeat`) + (est.porDia ? " " + tr(`(≈${fmt(est.porDia)} a day)`) : "") : est.gasta && est.porTarea ? tr(`· ≈${fmt(est.porTarea)} per task`) : "",
      est.tokens ? tr(`· reads about ${est.tokens.toLocaleString(LOCALE)} tokens each time`) : "", est.suscripcion ? tr(`· from your ${est.suscripcion} subscription`) : est.sinPrecio ? tr("· no known price") : ""].filter(Boolean).join(" ")));
    caja.append(bloque);
  }
  caja.append(h("div", { class: "bloque" }, h("h4", {}, "Priority"),
    h("div", { class: "prioridad" }, [1, 2, 3, 4, 5].map((n) => h("button", { "aria-pressed": String(a.prioridad === n), onclick: () => cambiar({ prioridad: n }) }, n))),
    h("small", { class: "nota" }, "When spending gets close to the cap, low-priority agents are frozen first: at 80 % those with 1 and 2; at 90 %, everyone except those with 5.")));
  caja.append(h("div", { class: "bloque" }, h("h4", {}, "Spending"),
    h("div", { class: "gastos3" }, ["hoy", "semana", "mes"].map((p) => h("div", {}, h("b", {}, ed.gastoAgente(a, p) > 0 ? fmt(ed.gastoAgente(a, p)) : "—"), h("small", {}, { hoy: "today", semana: "7 days", mes: "this month" }[p])))),
    sinCerebro ? null : campo("Own daily cap (USD)", h("input", { type: "number", min: "0", step: "0.05", value: a.topeDiario || "", placeholder: "no own cap", onchange: (ev) => cambiar({ topeDiario: Math.max(0, parseFloat(ev.target.value) || 0) }) }), "If it goes over, it's frozen until tomorrow. The building's cap applies too (Spending)."),
    a.rol === "interventor" ? h("div", {}, h("button", { class: "btn mini", onclick: () => abrirCajon("gasto") }, "Building caps")) : null));
}
// Capacidades: cada una, con su propio modelo cuando lo necesita
function fichaCapacidades(caja, a, cambiar, { sinCerebro }) {
  if (sinCerebro || a.rol === "jev") { caja.append(h("div", { class: "bloque" }, h("p", { class: "nota", style: { margin: 0 } }, a.rol === "jev" ? "JEV only decides: it doesn't use capabilities." : "Works with fixed rules: it doesn't use capabilities."))); return; }
  const aj = ed.e.ajustes, tiene = (id) => a.capacidades.includes(id);
  const marcar = (id, si) => Motor.ejecutar({ tipo: "editarAgente", id: a.id, cambios: { capacidades: si ? [...new Set([...a.capacidades, id])] : a.capacidades.filter((x) => x !== id) } }).then(() => { pintar(); pintarFicha(true); }).catch(avisar);
  const delEdificio = (id) => (id ? `The building's model (${nombreModelo(id)})` : "The building's model (none chosen in Settings)");
  const extraDe = {
    crear_imagenes: () => [selectorModelo("imagen", a.modeloImagen, { vacio: delEdificio(aj.modeloImagen), alCambiar: (v) => cambiar({ modeloImagen: v }) }), propuestasDe("imagen")],
    crear_musica: () => [selectorModelo("musica", a.modeloMusica, { vacio: delEdificio(aj.modeloMusica), alCambiar: (v) => cambiar({ modeloMusica: v }) }), h("small", { class: "nota" }, "Music and audio from OpenRouter (for example, Lyria). Paid per song."), propuestasDe("musica")],
    hablar: () => selectorVoz(a, cambiar),
    oir: () => [selectorModelo("oido", a.oido, { vacio: delEdificio(aj.modeloOido === BROWSER ? "" : aj.modeloOido).replace("none chosen in Settings", "browser hearing"), extra: [[BROWSER, "Browser hearing · free (Chrome, Edge, Safari)"]], alCambiar: (v) => cambiar({ oido: v }) }), propuestasDe("oido")],
    ver: () => h("small", { class: "nota" }, aj.modeloVista ? `If its brain can't see, ${nombreModelo(aj.modeloVista)} describes the images (Settings).` : "If its brain can't see, you need a brain with vision in Settings."),
    skills: () => bloqueSkills(a, cambiar)
  };
  const caps = h("div", { class: "caps" });
  for (const c of CAPACIDADES) {
    const avz = c.tipo === "avanzada", marcada = tiene(c.id) && !avz;
    caps.append(h("div", { class: "cap-bloque" + (marcada ? " on" : "") },
      h("label", { class: "cap" + (avz ? " avz" : "") },
        h("input", { type: "checkbox", checked: marcada || c.id === "escribir", disabled: avz || c.id === "escribir", onchange: (ev) => marcar(c.id, ev.target.checked) }),
        h("span", {}, c.nombre, avz ? h("span", { class: "enchufe" }, "plug pending") : null, h("small", {}, avz ? `${tr(c.como)} ${tr("Needs:")} ${tr(c.requiere)}` : c.como))),
      marcada && extraDe[c.id] ? h("div", { class: "cap-modelo" }, extraDe[c.id]()) : null));
  }
  caja.append(h("div", { class: "bloque" }, h("h4", {}, "Capabilities"), caps,
    h("small", { class: "nota" }, "The advanced ones are described but not connected: each needs one more piece and always your authorisation.")));
}
// ---------------- Otras API: la de una suscripción que ya pagas, con tu propia clave ----------------
const modelosDirectos = {};   // la lista que da cada API con tu clave (se pide al pulsar «Cargar la lista»)
// Sugerencias sacadas de la lista de OpenRouter (si esa API es una de las conocidas), las más nuevas primero (Claude escribe las versiones con guion: 5.5 → 5-5)
function sugerenciasDirectas(prov, a) {
  if (modelosDirectos[prov] && modelosDirectos[prov].length) return modelosDirectos[prov];
  const P = ed.proveedor(prov);
  if (!P || !P.prefijoOR) return [];
  const ids = porTipo.texto.filter((m) => m.id.startsWith(P.prefijoOR) && !m.id.includes(":")).map((m) => m.id.slice(P.prefijoOR.length));
  const nat = filtrarModelosApi(prov, { data: ids.map((id) => ({ id: prov === "anthropic" ? id.replace(/(\d)\.(\d)/g, "$1-$2") : id })) });
  const cmp = (x, y) => { const p = versionModelo(x), q = versionModelo(y); for (let i = 0; i < Math.max(p.length, q.length); i++) { const d = (q[i] || 0) - (p[i] || 0); if (d) return d; } return 0; };
  const sabio = a && a.rol === "sabio";
  const peso = (id) => (sabio ? (/opus/.test(id) ? 0 : /sonnet/.test(id) ? 1 : 2) : 0) + (/(mini|nano|haiku|luna|lite)/.test(id) && sabio ? 3 : 0);
  return [...new Set(nat)].sort((x, y) => peso(x) - peso(y) || cmp(x, y)).slice(0, 15);
}
async function cargarModelosDirectos(prov) {
  let lista = [];
  const P = ed.proveedor(prov) || { corto: prov };
  if (modo === "casa") {
    const r = await fetch("./api/modelos/" + prov, { headers: { "X-Fer-Pin": pin } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.error || "Fer Home couldn't get the list."), { mostrado: true });
    lista = d.modelos || [];
  } else {
    const clave = store.get(claveApi(prov));
    if (!clave && !P.sinClave) throw Object.assign(new Error(`Your ${P.corto} key is missing (Settings → Other APIs).`), { mostrado: true });
    const cab = P.formato === "anthropic" ? { "x-api-key": clave, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" } : clave ? { Authorization: "Bearer " + clave } : {};
    let r; try { r = await fetch(P.api + "/models" + (P.formato === "anthropic" ? "?limit=100" : ""), { headers: cab }); }
    catch (err) { throw Object.assign(new Error(`Couldn't talk to ${P.corto} from the browser (${err.message}). Some APIs don't allow calls from a website: then it works from Fer Home.`), { mostrado: true }); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(r.status === 401 || r.status === 403 ? `The ${P.corto} key isn't valid.` : `${P.corto} replied ${r.status}: ${(d.error && d.error.message) || ""}`), { mostrado: true });
    lista = filtrarModelosApi(prov, d);
  }
  modelosDirectos[prov] = lista;
  return lista;
}
function selectorDirecto(prov, actual, alCambiar) {
  const P = ed.proveedor(prov) || { corto: prov };
  const sel = h("select", { onchange: (ev) => { if (ev.target.value === "__otro") { otro.hidden = false; otro.focus(); return; } alCambiar(ev.target.value); } });
  const lista = sugerenciasDirectas(prov);
  const deLaEmpresa = !!(modelosDirectos[prov] && modelosDirectos[prov].length);
  if (lista.length) sel.append(h("optgroup", { label: deLaEmpresa ? tr(`${P.corto} models (from your account)`) : tr("Suggested (from OpenRouter's list; check them with “Load the list”)") },
    lista.map((id) => { const eq = ed.modeloEquivalente(prov, id); return h("option", { value: id }, id + (eq ? " · " + precioTxt(eq) : "")); })));
  sel.append(h("option", { value: "__otro" }, "Other: type the exact name…"));
  if (actual && !lista.includes(actual)) sel.prepend(h("option", { value: actual }, actual));
  sel.value = actual || "";
  const otro = h("input", { placeholder: "Exact model name (for example, claude-opus-5-5)", hidden: true, onchange: (ev) => { if (ev.target.value.trim()) alCambiar(ev.target.value.trim()); } });
  const msg = h("small", { class: "nota" });
  const cargar = h("button", { class: "btn mini", type: "button", onclick: async () => { cargar.disabled = true; msg.textContent = tr("Getting the list…"); try { const l = await cargarModelosDirectos(prov); msg.textContent = tr(`${l.length} models in your account.`); pintarFicha(true); } catch (err) { msg.textContent = err.mostrado ? err.message : err.message; cargar.disabled = false; } } }, `Load the list from ${P.corto}`);
  return h("div", { class: "campo" }, h("span", {}, "Model"), sel, otro, h("div", { class: "fila-c" }, cargar, msg));
}
// ---------------- Manos: las skills de Fer Casa que puede usar este agente ----------------
const catalogo = () => (modo === "casa" ? skillsCasa : ed.catalogoSkills());
function bloqueSkills(a, cambiar) {
  const cat = catalogo();
  if (!cat.length) return h("small", { class: "nota" }, modo === "casa" ? "Fer Home has no skills yet (“skills” folder next to fer-casa.mjs)." :
    "Hands work with Fer Home running on your computer: the agents' Chrome, their folder on the Mac and the skills. On this website, without Fer Home, they do nothing. How to set it up: README in the ZIP.");
  const tiene = (n) => a.habilidades.includes(n);
  const lista = h("div", { class: "skills-lista" }, cat.map((k) => h("label", { class: "cap" },
    h("input", { type: "checkbox", checked: tiene(k.nombre), onchange: (ev) => cambiar({ habilidades: ev.target.checked ? [...new Set([...a.habilidades, k.nombre])] : a.habilidades.filter((x) => x !== k.nombre) }) }),
    h("span", {}, k.titulo || k.nombre, k.efecto === "externo" ? h("span", { class: "enchufe" }, "asks for your permission") : null, h("small", {}, k.descripcion)))));
  const fija = a.skillFija && a.skillFija.skill;
  const selFija = h("select", { onchange: (ev) => { const n = ev.target.value; const k = cat.find((x) => x.nombre === n); cambiar({ skillFija: n ? { skill: n, ajustes: valoresDefecto(k) } : null, habilidades: n ? [...new Set([...a.habilidades, n])] : a.habilidades }); } },
    h("option", { value: "" }, "None: it works with its brain"), cat.filter((k) => k.fija !== false).map((k) => h("option", { value: k.nombre }, k.titulo || k.nombre)));
  selFija.value = fija || "";
  const out = [lista, campo("On every heartbeat, without a brain (doesn't spend)", selFija, "If you pick one, on every heartbeat it runs that skill and leaves what it finds in its chat. Example: the X Watcher every 10 minutes.")];
  const k = fija && cat.find((x) => x.nombre === fija);
  if (k && (k.ajustes || []).length) out.push(editorAjustesSkill(a, k, cambiar));
  if (fija && !k) out.push(h("small", { class: "nota" }, `Fer Home doesn't have the “${fija}” skill right now.`));
  return out;
}
function valoresDefecto(k) { const o = {}; for (const x of (k && k.ajustes) || []) o[x.clave] = x.defecto; return o; }
function editorAjustesSkill(a, k, cambiar) {
  const val = Object.assign(valoresDefecto(k), (a.skillFija && a.skillFija.ajustes) || {});
  const guardar = (clave, v) => { val[clave] = v; cambiar({ skillFija: { skill: k.nombre, ajustes: Object.assign({}, val) } }); };
  const caja = h("div", { class: "ajustes-skill" }, h("b", {}, `Settings for ${k.titulo || k.nombre}`));
  for (const x of k.ajustes) {
    if (x.tipo === "lista") {
      const ta = h("textarea", { rows: String(Math.min(12, Math.max(4, (val[x.clave] || []).length + 1))), onchange: (ev) => guardar(x.clave, ev.target.value.split("\n").map((l) => l.trim()).filter(Boolean)) });
      ta.value = (val[x.clave] || []).join("\n");
      caja.append(campo(x.nombre, ta, x.ayuda || "One per line."));
    } else if (x.tipo === "numero") {
      caja.append(campo(x.nombre, h("input", { type: "number", min: String(x.min ?? 0), step: "1", value: val[x.clave] ?? "", onchange: (ev) => guardar(x.clave, Number(ev.target.value) || x.defecto) }), x.ayuda));
    } else if (x.tipo === "si_no") {
      caja.append(h("label", { class: "cap" }, h("input", { type: "checkbox", checked: !!val[x.clave], onchange: (ev) => guardar(x.clave, ev.target.checked) }), h("span", {}, x.nombre, x.ayuda ? h("small", {}, x.ayuda) : null)));
    } else caja.append(campo(x.nombre, h("input", { value: val[x.clave] ?? "", onchange: (ev) => guardar(x.clave, ev.target.value) }), x.ayuda));
  }
  return caja;
}
const nombreModelo = (id) => (id === BROWSER ? "browser" : ((modelos.find((m) => m.id === id) || {}).name || id));
// Voz de un agente: modelo y voz concreta (si no eliges, cada agente tiene una distinta)
function selectorVoz(a, cambiar) {
  const aj = ed.e.ajustes, propio = a.voz || { modelo: "", voz: "" };
  const selM = selectorModelo("voz", propio.modelo, { vacio: `The building's voice (${nombreModelo(aj.modeloVoz || BROWSER)})`, extra: [[BROWSER, "Browser voice · free"]] });
  const selV = h("select", {});
  const llenar = () => {
    const modelo = selM.value || aj.modeloVoz || BROWSER;
    const lista = modelo === BROWSER ? vocesNavegador().map((v) => ({ id: v.voiceURI, name: `${v.name} · ${v.lang}` })) : ((voces.find((m) => m.id === modelo) || {}).voices || []);
    selV.replaceChildren(h("option", { value: "" }, `Different for each agent (now: ${nombreVoz(vozDe(Object.assign({}, a, { voz: { modelo: selM.value, voz: "" } })))})`), ...lista.map((v) => h("option", { value: v.id }, v.name)));
    selV.value = [...selV.options].some((o) => o.value === propio.voz) ? propio.voz : "";
  };
  llenar();
  selM.onchange = () => { propio.voz = ""; llenar(); cambiar({ voz: { modelo: selM.value, voz: "" } }); };
  selV.onchange = () => cambiar({ voz: { modelo: selM.value, voz: selV.value } });
  const meta = h("span", { class: "nota" });
  return [campo("Voice model", selM), campo("Its voice", selV), propuestasDe("voz"),
    h("div", { class: "fila-c" }, h("button", { class: "btn mini", type: "button", onclick: () => { desbloquearAudio(); hablarTexto(tr(`Hi, I'm ${a.nombre}. This is how I sound.`), meta, a); } }, "Try its voice"), meta)];
}
function confirmar(boton, texto, accion) {
  if (boton.dataset.armado) { accion(); return; }
  const antes = boton.textContent; boton.dataset.armado = "1"; boton.textContent = tr(texto);
  setTimeout(() => { if (boton.isConnected) { delete boton.dataset.armado; boton.textContent = antes; } }, 4000);
}

// ---------------- Actividad: todo, y las consultas a JEV ----------------
const NOMBRE_DEC = { seguir: "go ahead", aprovechar: "reuse what's already there", parar: "stop", preguntar_jefe: "ask the boss" };
function pintarRegistro() {
  $("actTodo").setAttribute("aria-selected", String(vistaAct === "todo")); $("actJev").setAttribute("aria-selected", String(vistaAct === "jev"));
  const r = $("registro"); r.innerHTML = "";
  if (vistaAct === "jev") {
    const filas = (ed.e.consultasJev || []).slice().reverse().slice(0, 150);
    if (!filas.length) { r.append(h("p", { class: "nota" }, "Every question to JEV shows up here: the time, the agent, what it was going to do, what JEV said, what it did in the end, what it cost and whether it helped.")); return; }
    for (const c of filas) {
      const prob = c.probabilidades ? Object.entries(c.probabilidades).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${tr(NOMBRE_DEC[k] || k)} ${Math.round(v * 100)} %`).join(" · ") : "";
      const sirvio = (v, t) => h("button", { class: "btn mini", "aria-pressed": String(c.sirvio === v), onclick: () => Motor.ejecutar({ tipo: "jev.sirvio", consulta: c.id, sirvio: c.sirvio === v ? null : v }).then(pintarRegistro).catch(avisar) }, t);
      r.append(h("div", { class: "item jev-consulta" },
        h("div", { class: "jev-fila" }, h("span", { class: "hora" }, fecha(c.ts)), h("span", {}, h("b", {}, c.nombre), ": ", c.accion), h("span", { class: "coste" }, (c.costeJev || 0) + (c.coste || 0) > 0 ? fmt((c.costeJev || 0) + (c.coste || 0)) : "")),
        h("div", { class: "jev-fila" }, h("span", {}, "JEV:"), h("span", {}, h("span", { class: "dec " + (c.decision || "") }, c.decision ? tr(NOMBRE_DEC[c.decision] || c.decision) : "no answer"), prob ? h("small", { class: "nota" }, " · " + prob) : null, c.texto && !c.decision ? h("small", { class: "nota" }, " · " + c.texto) : null), h("span", {})),
        h("div", { class: "jev-fila" }, h("span", {}, "Did:"), h("span", {}, c.hizo || tr(NOMBRE_DEC[c.final] || c.final || "—")), h("span", { class: "fila-c" }, h("small", { class: "nota" }, "Did it help?"), sirvio(true, "Yes"), sirvio(false, "No")))));
    }
    return;
  }
  const filas = ed.e.registro.slice().reverse().slice(0, 150);
  if (!filas.length) { r.append(h("p", { class: "nota" }, "Everything the agents do will show up here: heartbeats, tasks, questions to JEV, coins, meetings, Memory searches and spending.")); return; }
  for (const x of filas) r.append(h("div", { class: "item" }, h("span", { class: "hora" }, fecha(x.ts)),
    h("span", {}, h("b", {}, x.nombre + " "), x.texto), h("span", { class: "coste" }, x.coste ? fmt(x.coste) : "")));
}

// =====================================================================
// Chat con cada agente, a pantalla completa
// =====================================================================
let avisoLleno = false;
let pendientesError = [], pensando = false, imgsSesion = new Map(), audiosSesion = new Map(), adjunto = null, ultimoChat = "";
const agenteChat = () => (chatId && ed.agenteExacto(chatId)) || ed.jefe();
function abrirChat(id) {
  const a = ed.agenteExacto(id) || ed.jefe(); if (!a) return;
  if (chatId && chatId !== a.id) { if (conv.on) colgar(); pararAudio(); pendientesError = []; quitarAdjunto(); $("texto").value = ""; crecer(); }
  chatId = a.id; pantalla = "";
  $("vistaMes").hidden = true; $("vistaSalas").hidden = true; $("vistaChat").hidden = false;
  document.body.classList.add("con-pantalla");
  pintarAcento(); pintarChatCab(); pintarChat(true); microUI();
  setTimeout(() => { if (!$("texto").disabled) $("texto").focus(); }, 30);
  marcarNav();
}
function cerrarChat() {
  if (conv.on) colgar(); pararAudio();
  chatId = ""; pendientesError = []; $("vistaChat").hidden = true; if (!pantalla) document.body.classList.remove("con-pantalla");
  pintarAcento(); pintar(); reemplazarNav();
}
// El primer mensaje es un saludo del agente (no se guarda ni se paga); si falta la clave, va después y con calma.
function saludoDe(a) {
  const pl = ed.e.plantas.find((p) => p.id === a.planta), edif = ed.e.nombre || "your building";
  if (a.rol === "jefe") {
    const quien = /^(jefe|boss)$/i.test(sinAcentos(a.nombre.trim())) ? tr(`the boss of ${edif}`) : tr(`${a.nombre}, the boss of ${edif}`);
    if (ed.e.agentes.length === 1) return `Hi, I'm ${quien}. Tell me what you need. Right now I work alone: if you want a team, have a look at “Built-in agents” or ask me for a new agent.`;
    return `Hi, I'm ${quien}. Tell me what you need and I'll share it out among the team. If you want a new agent or to bring several together in the meeting room, just ask.`;
  }
  if (!conversa(a)) return a.rol === "jev" ? `I'm ${a.nombre}. I only decide before spending: go ahead, reuse what's already there, stop or ask the boss. I don't chat; my decisions are in Activity → Questions to JEV.`
    : `I'm ${a.nombre}. I work with fixed rules, without a brain, so I don't chat. My profile shows what I do.`;
  const que = QUE_HACE[a.rol] ? tr(QUE_HACE[a.rol]) : a.objetivo ? tr("My objective:") + " " + a.objetivo : tr("Ask me about my work or give me a job.");
  return tr(`Hi, I'm ${a.nombre}, ${rolTxt(a).toLowerCase()} (${pl ? pl.nombre : tr(edif)}).`) + " " + que;
}
const quienPropone = (x) => (x === "jev" ? "JEV" : x === "interventor" ? tr("the Controller") : x === "jefe" ? tr("the boss") : x);
function pintarChat(forzar) {
  if (!chatId) return;
  nombresAlDia();
  const a = agenteChat(); if (!a) return;
  const conv = ed.chatDe(a);
  const firma = [a.id, conv.length, (conv.at(-1) || {}).ts, pensando, pendientesError.length, hayAcceso(), (ed.e.propuestas || []).map((y) => y.estado[0]).join(""), (ed.e.reuniones || []).map((r) => r.estado[0]).join(""), a.nombre, a.capacidades.join()].join("|");
  if (!forzar && firma === ultimoChat) return;
  ultimoChat = firma;
  const m = $("mensajes"); m.innerHTML = "";
  m.append(h("div", { class: "msg bot saludo" }, h("div", { class: "burbuja" }, saludoDe(a))));
  if (conversa(a) && !hayAcceso()) m.append(h("div", { class: "msg bot saludo" }, h("div", { class: "burbuja" },
    h("p", {}, esApp() ? "So I can answer you, paste your OpenRouter key in Settings. It stays only on this computer." : modo === "casa" ? "So I can reply, enter in Settings the PIN you set when you started Fer Home." : "So I can reply, paste your OpenRouter key in Settings. It stays only in this browser."),
    h("button", { class: "btn mini", onclick: () => abrirCajon("ajustes") }, "Open Settings"))));
  const habla = a.capacidades.includes("hablar");
  for (const x of conv) {
    if (x.role === "user") m.append(h("div", { class: "msg me" }, h("div", { class: "burbuja" }, crudo(x.content)), x.voz ? h("div", { class: "meta" }, x.voz) : null));
    else if (x.role === "assistant") {
      const meta = h("div", { class: "meta" }, h("span", {}, x.proveedor ? tr(`${x.modelo || ""} · ${((ed.proveedor(x.proveedor) || {}).corto) || x.proveedor}: your subscription`) + (x.suscripcion ? ` (≈${fmt(x.suscripcion)})` : "") : `${x.modelo || ""} · ${fmt(x.coste || 0)}`),
        habla ? h("button", { onclick: (ev) => { desbloquearAudio(); hablarTexto(x.content, ev.target.parentElement, a); } }, "▶ Listen") : null,
        h("span", { class: "monedas-msg" }, botonMoneda(a, "oro"), botonMoneda(a, "roja")));
      m.append(h("div", { class: "msg bot" }, h("div", { class: "burbuja", html: markdown(x.content) }, medios(x)),
        (x.eventos || []).length ? h("div", { class: "chips" }, x.eventos.map((e) => h("span", { class: "chip" }, e))) : null,
        x.reunion ? tarjetaReunion(x.reunion) : null, meta));
    } else if (x.role === "informe") {
      const autor = ed.agenteExacto(x.agente);
      const pr = x.propuesta && (ed.e.propuestas || []).find((y) => y.id === x.propuesta);
      const botones = pr ? (pr.estado === "pendiente" ? h("div", { class: "fila-c propuesta" },
        h("button", { class: "btn primario mini", onclick: () => Motor.ejecutar({ tipo: "aceptarPropuesta", propuesta: pr.id }).then((r) => { const n = ed.agenteExacto(r.id); if (n) { seleccion = n.id; fichaTab = "identidad"; } pintar(); pintarChat(true); }).catch(avisar) }, tr(`Create ${pr.ficha.nombre || tr("this agent")}`)),
        h("button", { class: "btn mini", onclick: () => abrirCajon("agente", { ficha: Object.assign({}, pr.ficha, { planta: pr.ficha.planta || "nuevo", plantaNueva: pr.ficha.plantaNueva || { nombre: "", funcion: "" } }), propuesta: pr.id }) }, "See it and tweak it"),
        h("button", { class: "btn mini", onclick: () => Motor.ejecutar({ tipo: "descartarPropuesta", propuesta: pr.id }).then(() => pintarChat(true)).catch(avisar) }, "Dismiss"))
        : h("div", { class: "meta" }, pr.estado === "creada" ? "Created." : "Dismissed.")) : null;
      m.append(h("div", { class: "msg informe" }, h("span", { class: "quien" }, tr(`Report from ${x.nombre}`)), h("div", { class: "burbuja", html: markdown(x.content) }, medios(x)), botones,
        x.reunion ? h("div", { class: "meta" }, h("button", { onclick: () => abrirSalas(x.reunion) }, "See the meeting")) : null,
        autor && autor.rol !== "jefe" && !x.reunion ? h("div", { class: "meta" }, h("span", { class: "monedas-msg" }, botonMoneda(autor, "oro"), botonMoneda(autor, "roja"))) : null));
    }
  }
  for (const e of pendientesError) m.append(h("div", { class: "msg error" }, h("div", { class: "burbuja" }, e)));
  if (pensando) m.append(h("div", { class: "msg bot escribiendo" }, escribiendo ? h("div", { class: "burbuja", html: markdown(escribiendo) }) : h("div", { class: "burbuja" }, h("span", { class: "pensando", "aria-label": "Thinking" }, h("i"), h("i"), h("i")))));
  $("chat").scrollTop = $("chat").scrollHeight;
}
// Imágenes y música: se guardan aparte (en este navegador, IndexedDB; en Fer Casa, su carpeta «datos/medios»), así no se pierden al recargar
const mediosCache = new Map();
async function urlMedio(m) {
  if (mediosCache.has(m.id)) return mediosCache.get(m.id);
  let url = "";
  if (modo === "local") { const x = await idb.get("medios", m.id); url = (x && x.url) || ""; }
  else if (pin) { try { const r = await fetch("./api/medio/" + encodeURIComponent(m.id), { headers: { "X-Fer-Pin": pin } }); if (r.ok) url = URL.createObjectURL(await r.blob()); } catch {} }
  if (url) mediosCache.set(m.id, url);
  return url;
}
function medios(x) {
  if ((x.medios || []).length) return x.medios.map((m) => {
    const el = m.tipo === "audio" ? h("audio", { controls: true, preload: "none" }) : h("img", { alt: m.texto || "Image created" });
    const ya = mediosCache.get(m.id) || (m.tipo === "audio" ? audiosSesion : imgsSesion).get(m.texto);
    if (ya) el.src = ya;
    else urlMedio(m).then((u) => { if (u) el.src = u; else if (el.isConnected) el.replaceWith(h("small", { class: "nota" }, m.tipo === "audio" ? "(the music isn't on this device)" : "(the image isn't on this device)")); });
    return el;
  });
  // de la versión 6: solo las de esta sesión
  return [...(x.imagenes || []).map((t) => imgsSesion.get(t)).filter(Boolean).map((u) => h("img", { src: u, alt: "Image created" })),
    ...(x.audios || []).map((t) => audiosSesion.get(t)).filter(Boolean).map((u) => h("audio", { src: u, controls: true, preload: "none" }))];
}
// Una reunión que propone el jefe: no empieza hasta que confirmas las rondas
function tarjetaReunion(id) {
  const r = (ed.e.reuniones || []).find((x) => x.id === id); if (!r) return null;
  const nombres = r.participantes.map((pid) => (ed.agenteExacto(pid) || {}).nombre).filter(Boolean).join(", ");
  if (r.estado !== "propuesta") return h("div", { class: "tarjeta-reunion" }, h("b", {}, `Meeting “${r.titulo}”`), h("span", { class: "nota" }, `${ESTADO_REUNION[r.estado] || r.estado} · ${nombres}`), h("div", {}, h("button", { class: "btn mini", onclick: () => abrirSalas(r.id) }, "See it in the room")));
  const rondas = h("input", { type: "number", min: "1", step: "1", value: r.rondas });
  const est = h("span", { class: "nota" });
  const calc = () => { const e = ed.estimarReunion(Object.assign({}, r, { rondas: Math.max(1, parseInt(rondas.value, 10) || 1) })); est.textContent = tr(`Estimated cost: ≈${fmt(e.coste)} (${e.llamadas} calls)`); };
  rondas.oninput = calc; calc();
  return h("div", { class: "tarjeta-reunion" }, h("b", {}, `The boss proposes the meeting “${r.titulo}”`), h("span", { class: "nota" }, `At the table: ${nombres}`),
    h("div", { class: "orden" }, crudo(r.ordenDelDia)),
    h("div", { class: "fila-c" }, h("span", {}, "Rounds"), rondas, est),
    h("div", { class: "fila-c" }, h("button", { class: "btn primario mini", onclick: () => empezarReunion(r.id, parseInt(rondas.value, 10) || r.rondas) }, "Start the meeting"),
      h("button", { class: "btn mini", onclick: () => Motor.ejecutar({ tipo: "reunion.cancelar", reunion: r.id }).then(() => { pintar(); pintarChat(true); }).catch(avisar) }, "Don't hold it")));
}
const ESTADOS_CHAT = { idle: "Ready to talk", loading: "Getting the hearing ready…", listening: "I'm listening. Speak whenever you like", hearing: "I can hear you…", transcribing: "Understanding what you said…", thinking: "Thinking…", speaking: "Talking. Press “Stop” or speak to cut it off" };
let estadoJefe = "idle";
function ponerEstadoJefe(s) { estadoJefe = s; pintarChatCab(); }
function pintarChatCab() {
  if (!chatId) return;
  const a = agenteChat(); if (!a) return;
  const pl = ed.e.plantas.find((p) => p.id === a.planta), est = estadoVisible(a);
  $("jefeNombre").textContent = a.nombre;
  $("jefeRol").textContent = `${rolTxt(a)}${pl ? " · " + pl.nombre : ""}`;
  $("jefeEstado").textContent = tr(est === "congelado" || est === "apagado" ? `${ESTADO_TXT[est]}${a.motivoEstado ? " · " + a.motivoEstado : ""}`
    : estadoJefe === "thinking" && a.rol === "jefe" ? "Thinking and sharing out the work…" : ESTADOS_CHAT[estadoJefe]);
  $("jefeCab").classList.toggle("hablando", estadoJefe === "speaking");
  $("pararVoz").hidden = estadoJefe !== "speaking";
  const av = $("avatar");
  if (av.dataset.quien !== a.id) { av.dataset.quien = a.id; av.src = figura(a.aspecto); }   // al momento la figura pequeña; enseguida, la grande
  asegurarFiguraGrande(a.aspecto).then((u) => { if (av.dataset.quien === a.id && av.getAttribute("src") !== u) av.src = u; });
  // qué se puede hacer en este chat
  const habla = conversa(a), oye = habla && a.capacidades.includes("oir"), dice = habla && a.capacidades.includes("hablar"), ve = habla && a.capacidades.includes("ver");
  $("texto").disabled = !habla; $("enviar").disabled = !habla;
  $("texto").placeholder = tr(habla ? `Write to ${a.nombre}…` : `${a.nombre} doesn't chat`);
  $("micro").disabled = !oye; $("clip").disabled = !ve; $("altavoz").disabled = !dice;
  if (!oye) $("micro").title = tr(habla ? `${a.nombre} doesn't have the “Hear” capability. Turn it on in its profile.` : "Doesn't chat");
  if (!ve) $("clip").title = tr(habla ? `${a.nombre} doesn't have the “See images” capability.` : "Doesn't chat"); else $("clip").title = tr("Attach an image for it to see");
  $("altavoz").title = tr(dice ? "Read the replies out loud" : `${a.nombre} doesn't have the “Speak” capability.`);
  $("verFichaChat").hidden = false;
}
async function enviar(textoVoz, voz) {
  const texto = typeof textoVoz === "string" ? textoVoz : $("texto").value.trim();
  const a = agenteChat();
  if ((!texto && !adjunto) || pensando || !conversa(a)) return;
  if (!hayAcceso()) { abrirCajon("ajustes"); return; }
  const propio = conv.on && !conv.procesando;
  if (propio) { conv.procesando = true; await pausarOido(); }
  pendientesError = [];
  pensando = true; pararAudio(); ponerEstadoJefe("thinking");
  const imagen = adjunto; if (!voz) { $("texto").value = ""; crecer(); } quitarAdjunto();
  escribiendo = ""; pintarChat(true);
  // ¿Contesta en voz alta? Entonces, respuestas cortas y voz frase a frase mientras escribe
  const enVoz = a.capacidades.includes("hablar") && (voz ? (ed.e.ajustes.responderEnVozSiMicro !== false) || altavozOn() : altavozOn());
  let finVoz = null, porPartes = false;
  const alTrozo = (t, todo) => {
    porPartes = true;
    if (enVoz && chatId === a.id) {
      if (!finVoz) { finVoz = vozEmpezar(null, a); if (conv.on) reanudarOido(); }   // ya habla: el micro vuelve a escuchar, para poder cortarle hablando
      vozTrozo(t);
    }
    escribiendo = todo; pintarBorrador();
  };
  try {
    const vozTxt = voz ? (voz.seconds ? `by voice · ${voz.seconds.toLocaleString(LOCALE, { maximumFractionDigits: 1 })} s · ${voz.model} · ${voz.estimated ? "≈" : ""}${fmt(voz.cost)}` : `by voice · ${voz.model} · free`) : "";
    const r = await Motor.ejecutar({ tipo: "hablar", agente: a.id, texto, imagen, voz: vozTxt, enVoz: enVoz || !!voz, alTrozo });
    for (const im of r.imagenes || []) { imgsSesion.set(im.texto, im.url); if (im.id) mediosCache.set(im.id, im.url); }
    for (const au of r.audios || []) { audiosSesion.set(au.texto, au.url); if (au.id) mediosCache.set(au.id, au.url); }
    pensando = false; escribiendo = ""; ponerEstadoJefe(conv.on ? "listening" : "idle"); pintar(); pintarChat(true);
    const metas = $("mensajes").querySelectorAll(".msg.bot .meta"), meta = metas[metas.length - 1];
    if (enVoz && r.respuesta && chatId === a.id) {
      if (finVoz && porPartes) { cola.meta = meta; vozFin(); }   // ya iba hablando mientras escribía
      else finVoz = hablarTexto(r.respuesta, meta, a);           // si llegó entera (por ejemplo, con una imagen), se lee frase a frase
    } else if (finVoz) pararAudio();
  } catch (err) {
    pensando = false; escribiendo = ""; if (finVoz) pararAudio(); ponerEstadoJefe(conv.on ? "listening" : "idle");
    pendientesError.push(err.mostrado ? err.message : `No connection: ${err.message}`); pintarChat(true);
  }
  // el oído vuelve enseguida (aunque siga hablando): si hablas tú, se calla
  if (propio) { conv.procesando = false; await reanudarOido(); if (estadoJefe !== "speaking" && conv.on) ponerEstadoJefe("listening"); }
  if (!voz && chatId) $("texto").focus();
}
// Lo que va escribiendo el agente, en directo (solo en este navegador; Fer Casa manda la respuesta entera)
let escribiendo = "";
function pintarBorrador() {
  const el = $("mensajes").querySelector(".msg.bot.escribiendo .burbuja");
  if (el) { el.innerHTML = markdown(escribiendo); $("chat").scrollTop = $("chat").scrollHeight; }
}
function crecer() { const t = $("texto"); t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 160) + "px"; }
function quitarAdjunto() { adjunto = null; $("adjunto").hidden = true; }
const altavozOn = () => $("altavoz").getAttribute("aria-pressed") === "true";

// =====================================================================
// Voz (boca) — cada agente con su modelo y su voz; OpenRouter o navegador
// =====================================================================
const reproductor = new Audio(); reproductor.preload = "auto";
let audioListo = false, finHablar = null, turnoVoz = 0;
const SILENCIO = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
function desbloquearAudio() { if (audioListo) return; audioListo = true; try { reproductor.src = SILENCIO; const p = reproductor.play(); if (p && p.catch) p.catch(() => {}); } catch {} }
let finVozTs = 0;   // cuándo dejó de hablar el agente (para el filtro de eco)
function terminarVoz() { const f = finHablar; finHablar = null; finVozTs = Date.now(); if (estadoJefe === "speaking") ponerEstadoJefe(conv.on ? "listening" : "idle"); if (f) f(); }
function pararAudio() { turnoVoz++; cola.frases = []; cola.sonando = false; cola.cerrada = true; try { reproductor.pause(); } catch {} try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch {} terminarVoz(); }
// (cada frase avisa al terminar; la voz termina cuando no quedan frases)
function nota(metaEl, t) { if (!metaEl) return; let n = metaEl.querySelector(".nota-voz"); if (!n) { n = h("span", { class: "nota-voz" }); metaEl.append(n); } n.textContent = tr(t); }
function pcmAWav(buf, rate = 24000) {
  const pcm = new Uint8Array(buf), head = new ArrayBuffer(44), v = new DataView(head);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + pcm.length, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, pcm.length, true);
  return new Blob([head, pcm], { type: "audio/wav" });
}
function estimarVoz(pr, chars, secs) { const a = n0(pr.prompt), b = n0(pr.completion); if (a && !b) return a * chars; if (!a && b) return b * secs; if (a && b) return a * Math.ceil(chars / 4) + b * secs * 32; return 0; }
async function costeVoz(modelo, chars, secs, genId, metaEl, quien) {
  let real = null;
  if (genId) for (const w of [1500, 3000, 6000]) {
    await sleep(w);
    try { const r = await fetch(apiBase() + "/generation?id=" + encodeURIComponent(genId), { headers: apiCab() }); if (r.ok) { const d = (await r.json()).data || {}; if (typeof d.total_cost === "number") { real = d.total_cost; break; } } } catch {}
  }
  const m = voces.find((x) => x.id === modelo);
  const coste = real !== null ? real : (m ? estimarVoz(m.pricing, chars, secs) : 0);
  try { await Motor.ejecutar({ tipo: "gastoExterno", id: quien || "jefe", coste, estimado: real === null, concepto: "voz " + modelo }); } catch {}
  if (cola.meta === metaEl) { cola.chars += chars; cola.coste += coste; cola.estimado = cola.estimado || real === null; chars = cola.chars; }
  const total = cola.meta === metaEl ? cola.coste : coste, est = cola.meta === metaEl ? cola.estimado : real === null;
  nota(metaEl, tr("voice:") + " " + modelo + " · " + tr(`${chars} characters`) + " · " + (est ? "≈" : "") + fmt(total) + (est ? " " + tr("(estimated)") : ""));
  pintar();
}
function vocesNavegador() { try { return window.speechSynthesis ? speechSynthesis.getVoices() : []; } catch { return []; } }
// Si un agente no tiene voz elegida, se le da una distinta de las del modelo (siempre la misma para ese agente).
const hashTxt = (t) => { let x = 0; for (const c of String(t)) x = (x * 31 + c.charCodeAt(0)) >>> 0; return x; };
function vozDe(a) {
  const aj = ed.e.ajustes, propia = (a && a.voz) || {};
  const modelo = propia.modelo || aj.modeloVoz || BROWSER;
  if (propia.voz) return { modelo, voz: propia.voz };
  if (a && a.rol === "jefe" && !propia.modelo) return { modelo, voz: aj.vozConcreta || "" };   // el jefe conserva la voz de Ajustes
  const idioma = idiomaVoz().slice(0, 2);
  const lista = modelo === BROWSER ? vocesNavegador().filter((v) => (v.lang || "").slice(0, 2) === idioma).map((v) => v.voiceURI) : ((voces.find((m) => m.id === modelo) || {}).voices || []).map((v) => v.id);
  if (!lista.length) return { modelo, voz: "" };
  const delJefe = modelo === (aj.modeloVoz || BROWSER) ? aj.vozConcreta : "";
  let i = hashTxt(a ? a.id : "") % lista.length;
  if (lista.length > 1 && lista[i] === delJefe) i = (i + 1) % lista.length;   // que no suene igual que el jefe
  return { modelo, voz: lista[i] };
}
function nombreVoz(v) {
  if (!v.voz) return v.modelo === BROWSER ? "automatic" : "the model's";
  if (v.modelo === BROWSER) { const x = vocesNavegador().find((y) => y.voiceURI === v.voz); return x ? x.name : v.voz; }
  const x = ((voces.find((m) => m.id === v.modelo) || {}).voices || []).find((y) => y.id === v.voz); return x ? x.name : v.voz;
}
// ---------------- Voz frase a frase ----------------
// Mientras el agente escribe, cada frase terminada se convierte en voz; mientras suena una, se prepara la siguiente.
const cola = { turno: -1, frases: [], resto: "", cerrada: true, sonando: false, meta: null, a: null, modelo: "", voz: "", chars: 0, coste: 0, estimado: false, dicho: "", prep: null };
function trocearFrases(t, final) {
  const out = []; let r = String(t || "");
  const corte = () => { const m = r.match(/^[\s\S]*?(?:[.!?…]+["»”')\]]*\s+|\n+)/); if (!m) return null; r = r.slice(m[0].length); return m[0]; };
  for (;;) {
    let f = corte(); if (f === null) break;
    while (paraVoz(f).length < 40) { const g = corte(); if (g === null) break; f += g; }   // las frases muy cortas van con la siguiente
    if (paraVoz(f).length < 40 && !final && !out.length) { r = f + r; break; }
    if (paraVoz(f)) out.push(f);
  }
  if (final && paraVoz(r)) { out.push(r); r = ""; }
  return [out, r];
}
function vozEmpezar(metaEl, agente) {
  pararAudio();
  const a = agente || agenteChat(), v = vozDe(a);
  Object.assign(cola, { turno: ++turnoVoz, frases: [], resto: "", cerrada: false, sonando: false, meta: metaEl, a, modelo: v.modelo, voz: v.voz, chars: 0, coste: 0, estimado: false, dicho: "", prep: null });
  return new Promise((r) => { finHablar = r; });
}
function vozTrozo(t) { if (cola.turno !== turnoVoz || cola.cerrada) return; const [fs, r] = trocearFrases(cola.resto + t, false); cola.resto = r; cola.frases.push(...fs); siguienteFrase(); }
function vozFin() { if (cola.turno !== turnoVoz || cola.cerrada) return; const [fs] = trocearFrases(cola.resto, true); cola.resto = ""; cola.frases.push(...fs); cola.cerrada = true; siguienteFrase(); }
function hablarTexto(texto, metaEl, agente) { const fin = vozEmpezar(metaEl, agente); vozTrozo(texto); vozFin(); return fin; }
async function pedirVoz(limpio, modelo, voz) {   // OpenRouter: texto → audio (mp3; si el modelo no lo da, pcm)
  const pedir = (formato) => { const b = { model: modelo, input: limpio, response_format: formato }; if (voz) b.voice = voz; return fetch(apiBase() + "/audio/speech", { method: "POST", headers: Object.assign(apiCab(true), { "X-Title": "Fer Agent" }), body: JSON.stringify(b) }); };
  let formato = "mp3", r = await pedir(formato);
  if (r.status === 400) { const r2 = await pedir("pcm"); if (r2.ok) { r = r2; formato = "pcm"; } }
  if (!r.ok) { let det = ""; try { det = ((await r.json()).error || {}).message || ""; } catch {} throw new Error(`The voice failed (${r.status}${det ? ": " + det : ""}). Try another one in its profile → Capabilities.`); }
  const genId = r.headers.get("X-Generation-Id"), buf = await r.arrayBuffer();
  return { url: URL.createObjectURL(formato === "pcm" ? pcmAWav(buf) : new Blob([buf], { type: "audio/mpeg" })), formato, genId, secs: formato === "pcm" ? buf.byteLength / 48000 : limpio.length / 15, chars: limpio.length };
}
function siguienteFrase() {
  const turno = cola.turno;
  if (turno !== turnoVoz || cola.sonando) return;
  if (!cola.frases.length) { if (cola.cerrada) terminarVoz(); return; }
  if (cola.modelo !== BROWSER && ed.usoPresupuesto() >= 1) { nota(cola.meta, "Spending cap reached: I won't read out loud."); cola.frases = []; terminarVoz(); return; }
  const frase = cola.frases.shift(), limpio = paraVoz(frase);
  cola.sonando = true; cola.dicho += " " + limpio;
  const seguir = () => { if (turno !== turnoVoz) return; cola.sonando = false; siguienteFrase(); };
  if (cola.modelo === BROWSER) {
    if (!window.speechSynthesis) { nota(cola.meta, "This browser has no voice."); cola.frases = []; terminarVoz(); return; }
    const u = new SpeechSynthesisUtterance(limpio), v = vocesNavegador().find((x) => x.voiceURI === cola.voz);
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = idiomaVoz();
    u.onend = u.onerror = seguir;
    ponerEstadoJefe("speaking"); speechSynthesis.speak(u); nota(cola.meta, "browser voice · free");
    return;
  }
  (async () => {
    try {
      const prep = cola.prep && cola.prep.texto === frase ? cola.prep.p : pedirVoz(limpio, cola.modelo, cola.voz);
      cola.prep = null;
      if (cola.chars === 0) nota(cola.meta, "getting the voice ready…");
      const x = await prep;
      if (turno !== turnoVoz) return;
      if (cola.frases.length) { const sig = cola.frases[0]; cola.prep = { texto: sig, p: pedirVoz(paraVoz(sig), cola.modelo, cola.voz) }; cola.prep.p.catch(() => {}); }   // la siguiente, mientras suena esta
      reproductor.src = x.url;
      ponerEstadoJefe("speaking");
      await reproductor.play();
      let secs = x.secs;
      if (x.formato !== "pcm") { await Promise.race([new Promise((res) => (reproductor.readyState >= 1 ? res() : reproductor.addEventListener("loadedmetadata", res, { once: true }))), sleep(2500)]); if (isFinite(reproductor.duration) && reproductor.duration > 0) secs = reproductor.duration; }
      costeVoz(cola.modelo, x.chars, secs, x.genId, cola.meta, cola.a && cola.a.id);
      await new Promise((res) => { const fin = () => { reproductor.removeEventListener("ended", fin); reproductor.removeEventListener("error", fin); res(); }; reproductor.addEventListener("ended", fin); reproductor.addEventListener("error", fin); });
      seguir();
    } catch (err) { if (turno !== turnoVoz) return; nota(cola.meta, err.message || "The voice couldn't be played."); cola.frases = []; terminarVoz(); }
  })();
}
// ¿Lo que ha oído el micro es su propia voz saliendo por el altavoz? (eco): entonces no se envía
// ¿Lo que oyó el micro era la voz del propio agente por el altavoz? Solo puede serlo si empezó mientras él hablaba
// (o justo al acabar). Si es corto, tiene que ser un trozo seguido de lo que dijo; si es largo, casi todo lo que dijo.
function esEco(texto, inicio) {
  if (!finHablar && inicio > finVozTs + 800) return false;   // empezaste a hablar cuando él ya había callado: eres tú
  const w = (t) => sinAcentos(t).replace(/[^a-z0-9ñ ]/g, " ").split(/\s+/).filter((x) => x.length > 2);
  const oidas = w(texto), dichasL = w(cola.dicho), dichas = new Set(dichasL);
  if (oidas.length < 2 || !dichas.size) return false;
  if (oidas.length < 4) return (" " + dichasL.join(" ") + " ").includes(" " + oidas.join(" ") + " ");
  return oidas.filter((x) => dichas.has(x)).length / oidas.length >= 0.7;
}

// =====================================================================
// Oído: modo conversación (detector Silero + Whisper, o el oído del navegador). Cada agente, con su oído.
// =====================================================================
const conv = { on: false, vad: null, rec: null, procesando: false };
function cargarScript(src, sello) {
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.async = true; if (sello) { s.integrity = sello; s.crossOrigin = "anonymous"; } s.onload = res; s.onerror = () => rej(new Error(`couldn't download ${src.split("/npm/")[1]}`)); document.head.append(s); });
}
async function asegurarVAD() {
  if (window.vad && window.vad.MicVAD) return;
  if (!window.ort) await cargarScript(ORT_BASE + "ort.wasm.min.js", SELLOS["ort.wasm.min.js"]);
  await cargarScript(VAD_BASE + "bundle.min.js", SELLOS["bundle.min.js"]);
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
const oidoDe = (a) => (a && a.oido) || ed.e.ajustes.modeloOido || BROWSER;
async function transcribir(muestras) {
  if (ed.usoPresupuesto() >= 1) throw Object.assign(new Error("Spending cap reached: the paid hearing is stopped. Raise the cap in Spending or use the browser's hearing."), { mostrado: true });
  const a = agenteChat(), modelo = oidoDe(a), secs = muestras.length / 16000;
  const fd = new FormData(); fd.append("model", modelo); fd.append("file", aWav(muestras), "voz.wav");
  const r = await fetch(apiBase() + "/audio/transcriptions", { method: "POST", headers: Object.assign(apiCab(), { "X-Title": "Fer Agent" }), body: fd });
  let d = null; try { d = await r.json(); } catch {}
  if (!r.ok) throw Object.assign(new Error(explicarError(r.status, (d && d.error && d.error.message) || "")), { mostrado: true });
  const u = (d && d.usage) || {};
  let cost = typeof u.cost === "number" ? u.cost : null, estimated = false;
  if (cost === null) { const m = oidos.find((x) => x.id === modelo); cost = m ? precioOidoSegundo(m) * secs : 0; estimated = true; }
  try { await Motor.ejecutar({ tipo: "gastoExterno", id: a.id, coste: cost, estimado: estimated, concepto: tr("hearing") + " " + modelo }); } catch {}
  return { text: ((d && d.text) || "").trim(), cost, estimated, seconds: u.seconds || secs, model: modelo };
}
function microUI() {
  const a = chatId ? agenteChat() : null;
  $("micro").setAttribute("aria-pressed", String(conv.on));
  if (!$("micro").disabled) $("micro").title = tr(conv.on ? "Hang up (end the voice conversation)" : `Talk to ${a ? a.nombre : "the agent"} through the mic (conversation mode)`);
  $("pista").textContent = conv.on ? tr("Voice conversation: speak and pause; it sends on its own. Tap the mic to hang up.") : "";
}
async function pausarOido() { try { if (conv.vad) await conv.vad.pause(); } catch {} try { if (conv.rec) conv.rec.abort(); } catch {} }
async function reanudarOido() { if (!conv.on) return; try { if (conv.vad) await conv.vad.start(); } catch {} try { if (conv.rec) conv.rec.start(); } catch {} if (estadoJefe !== "speaking") ponerEstadoJefe("listening"); }
async function oido(entrada, inicioDado) {
  if (!conv.on) return;
  // cuándo empezó a sonar lo que se oyó (el detector da el audio a 16 kHz; el oído del navegador, solo el texto: se suponen 1,5 s)
  const inicio = inicioDado || Date.now() - (typeof entrada === "string" ? 1500 : (entrada.length / 16000) * 1000);
  if (conv.procesando) { conv.siguiente = { entrada, inicio }; return; }   // le has hablado mientras contestaba: va justo después
  conv.procesando = true;
  await pausarOido();
  try {
    let texto = entrada, voz = { model: "browser hearing", cost: 0, estimated: false, seconds: null };
    if (typeof entrada !== "string") { ponerEstadoJefe("transcribing"); voz = await transcribir(entrada); texto = voz.text; }
    if (texto && esEco(texto, inicio)) { texto = ""; }   // era su propia voz por el altavoz: no se envía
    if (texto && conv.on) await enviar(texto, voz);
  } catch (err) { pendientesError.push(err.mostrado ? err.message : `Couldn't understand the audio: ${err.message}`); pintarChat(true); }
  finally {
    conv.procesando = false; await reanudarOido();
    if (conv.siguiente && conv.on) { const s = conv.siguiente; conv.siguiente = null; oido(s.entrada, s.inicio); }
  }
}
function errorMicro(err) {
  const n = (err && err.name) || "", raw = String((err && (err.message || err.error)) || err || "");
  const det = " (" + tr("technical detail:") + " " + [n, raw].filter(Boolean).join(": ") + ")";
  let dentro = false; try { dentro = window.top !== window.self; } catch { dentro = true; }
  if (dentro) return tr("You're using Fer Agent inside another window (a preview). There the browser doesn't allow the microphone. Open it in a normal tab.") + det;
  if (!window.isSecureContext || !navigator.mediaDevices) return tr("The microphone only works with a secure address (https://… or localhost). If you open Fer Home from another device on your home network, the mic isn't allowed: use the keyboard.") + det;
  if (n === "NotAllowedError" && /system/i.test(raw)) return tr("Your computer doesn't let the browser use the microphone. On a Mac: System Settings → Privacy & Security → Microphone → turn on your browser and open it again.") + det;
  if (n === "NotAllowedError" || n === "SecurityError" || /not-allowed|permission|denied/i.test(raw)) return tr("The microphone is blocked for this website. Press the icon to the left of the address → Microphone → Allow, and reload.") + det;
  if (n === "NotFoundError") return tr("I can't find any microphone on this device.") + det;
  if (n === "NotReadableError") return tr("Another program is using the microphone (Zoom, Meet…). Close it and try again.") + det;
  return tr("The hearing couldn't be turned on.") + det;
}
async function empezarConversacion() {
  const e = oidoDe(agenteChat());
  if (!hayAcceso() && e !== BROWSER) { abrirCajon("ajustes"); return; }
  conv.on = true; microUI(); ponerEstadoJefe("loading");
  try {
    if (e === BROWSER) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) throw new Error("this browser has no hearing of its own. Choose Whisper in its profile → Capabilities → Hear");
      const rec = new SR(); rec.lang = idiomaVoz(); rec.interimResults = false; rec.continuous = false;
      rec.onspeechstart = () => { if (estadoJefe === "speaking" && ed.e.ajustes.cortarAlHablar !== false) pararAudio(); if (conv.on && !conv.procesando) ponerEstadoJefe("hearing"); };
      rec.onresult = (ev) => { const t = ev.results[0][0].transcript; if (t && t.trim()) oido(t.trim()); };
      rec.onerror = (ev) => { if (ev.error === "not-allowed" || ev.error === "service-not-allowed") { pendientesError.push(errorMicro(ev)); pintarChat(true); colgar(); } };
      rec.onend = () => { if (conv.on && !conv.procesando && conv.rec === rec) { try { rec.start(); } catch {} } };
      conv.rec = rec; rec.start();
    } else {
      await asegurarVAD();
      if (!conv.on) return;
      conv.vad = await window.vad.MicVAD.new({
        baseAssetPath: VAD_BASE, onnxWASMBasePath: ORT_BASE, redemptionMs: 1200, minSpeechMs: 500, preSpeechPadMs: 300,
        onSpeechStart: () => { if (conv.on && !conv.procesando && estadoJefe !== "speaking") ponerEstadoJefe("hearing"); },
        // si hablas mientras él habla, se calla (tras medio segundo de voz de verdad, para no cortarse con un ruido)
        onSpeechRealStart: () => { if (estadoJefe === "speaking" && ed.e.ajustes.cortarAlHablar !== false) pararAudio(); if (conv.on && !conv.procesando) ponerEstadoJefe("hearing"); },
        onVADMisfire: () => { if (conv.on && !conv.procesando) ponerEstadoJefe("listening"); },
        onSpeechEnd: (audio) => oido(audio)
      });
      if (!conv.on) { try { await conv.vad.destroy(); } catch {} conv.vad = null; return; }
      await conv.vad.start();
    }
    ponerEstadoJefe("listening");
  } catch (err) { pendientesError.push(errorMicro(err)); pintarChat(true); colgar(); }
}
async function colgar() {
  conv.on = false; conv.siguiente = null; microUI();
  const v = conv.vad, r = conv.rec; conv.vad = null; conv.rec = null;
  try { if (v) await v.destroy(); } catch {} try { if (r) r.abort(); } catch {}
  pararAudio(); if (!pensando) ponerEstadoJefe("idle");
}

// =====================================================================
// Bandeja de autorizaciones: todo lo que espera tu sí (quién, qué y cuánto cuesta)
// =====================================================================
const CLASE_TXT = { accion: "Action outside the website", agente: "New agent", reunion: "Meeting", moneda: "Coin", leccion: "New lesson", modelo: "Recommended model", falta: "Missing something" };
let firmaBandeja = "";
function pintarBandeja(forzar) {
  const v = $("vistaBandeja");
  if (pantalla !== "bandeja") return;
  if (!forzar && enUso(v)) return;
  const items = ed.bandeja();
  const firma = items.map((x) => x.clase + x.id + String(x.detalle || "").length + x.coste).join("|");
  if (!forzar && firma === firmaBandeja) return;
  firmaBandeja = firma;
  const sc = v.scrollTop;
  v.replaceChildren(cabPantalla("What's waiting for your yes"), h("div", { class: "bandeja" },
    h("h1", {}, "Approval inbox"),
    h("p", { class: "nota-osc" }, "Everything waiting for your yes arrives here: who asks for it, what it is and what it costs. None of this happens without you."),
    h("p", { class: "nota-osc" }, modo === "casa" ? (casaInfo.telegram ? "With Fer Home and Telegram, it also reaches your phone with buttons to approve or reject." : "From your phone: open the Fer Home address on your home network, or connect Telegram (README) to approve from anywhere.")
      : "From your phone: with the brain folder in Google Drive connected on both devices, the phone sees the same inbox."),
    items.length ? items.map(tarjetaPeticion) : h("p", { class: "bandeja-vacia" }, "Nothing pending. When an agent wants to do something involving money or outside the website, or there's something to approve, it will show up here.")));
  v.scrollTop = sc;
}
function tarjetaPeticion(x) {
  const decidir = (si, extra, boton) => {
    if (boton) boton.disabled = true;
    return Motor.ejecutar(Object.assign({ tipo: "bandeja.decidir", clase: x.clase, id: x.id, si }, extra || {}))
      .then((r) => { if (r && r.estado) avisoFlotante(r.estado === "hecha" ? `Done: ${String(r.resultado || "").slice(0, 160)}` : `It couldn't be done: ${String(r.resultado || "").slice(0, 160)}`); pintar(); pintarBandeja(true); })
      .catch((err) => { if (boton) boton.disabled = false; avisar(err); });
  };
  const b = (txt, f, primario) => { const el = h("button", { class: "btn mini" + (primario ? " primario" : ""), type: "button" }, txt); el.onclick = () => f(el); return el; };
  const sinCoste = ["falta", "moneda", "leccion", "modelo"].includes(x.clase);
  const coste = sinCoste ? "" : x.coste > 0 ? (x.porDia ? `≈${fmt(x.coste)} a day` : `≈${fmt(x.coste)}`) : x.clase === "accion" ? "no cost" : "≈0 $";
  const partes = [h("div", { class: "p-cab" }, h("span", { class: "clase-pet" }, CLASE_TXT[x.clase] || x.clase), h("span", { class: "p-quien" }, x.quien), h("span", { class: "nota-osc" }, fecha(x.ts)), coste ? h("span", { class: "p-coste" }, coste) : null),
    h("div", { class: "p-que" }, x.que)];
  let acc = [];
  if (x.clase === "leccion") {
    const ta = h("textarea", { rows: "2", maxlength: "300", "aria-label": "Lesson text" }); ta.value = x.detalle;
    partes.push(h("p", { class: "p-det" }, tr(`Reason for the coin: “${x.motivo}”.`) + " " + tr(x.redactada ? "A cheap model has turned it into a rule; tweak it if you like." : "The cheap model couldn't write it: tweak it yourself.")), ta);
    acc = [b("Approve", (el) => decidir(true, { texto: ta.value }, el), true),
      b("Write it again", (el) => { el.disabled = true; Motor.ejecutar({ tipo: "leccion.redactar", leccion: x.id }).then(() => pintarBandeja(true)).catch(avisar); }),
      b("Dismiss", (el) => decidir(false, null, el))];
  } else if (x.clase === "reunion") {
    const rondas = h("input", { type: "number", min: "1", step: "1", value: x.rondas, "aria-label": "Rounds" });
    const est = h("span", { class: "nota-osc" });
    const calc = () => { const r = ed.e.reuniones.find((y) => y.id === x.id); if (!r) return; const e = ed.estimarReunion(Object.assign({}, r, { rondas: Math.max(1, parseInt(rondas.value, 10) || 1) })); est.textContent = tr(`≈${fmt(e.coste)} (${e.llamadas} calls)`); };
    rondas.oninput = calc; calc();
    partes.push(h("p", { class: "p-det" }, x.detalle), h("div", { class: "p-acc" }, h("span", {}, "Rounds"), rondas, est));
    acc = [b("Start the meeting", (el) => decidir(true, { rondas: parseInt(rondas.value, 10) || x.rondas }, el).then(() => abrirSalas(x.id)), true), b("Don't hold it", (el) => decidir(false, null, el)), b("See it in the room", () => abrirSalas(x.id))];
  } else if (x.clase === "agente") {
    partes.push(h("p", { class: "p-det" }, x.detalle));
    const pr = (ed.e.propuestas || []).find((y) => y.id === x.id);
    acc = [b("Create", (el) => decidir(true, null, el), true),
      pr ? b("See it and tweak it", () => abrirCajon("agente", { ficha: Object.assign({}, pr.ficha, { planta: pr.ficha.planta || "nuevo", plantaNueva: pr.ficha.plantaNueva || { nombre: "", funcion: "" } }), propuesta: pr.id })) : null,
      b("Dismiss", (el) => decidir(false, null, el))];
  } else if (x.clase === "falta") {
    partes.push(h("p", { class: "p-det" }, entreComillas(x.detalle)), h("p", { class: "nota-osc", style: { margin: 0 } }, "Meanwhile it won't move on alone towards its objective (it doesn't spend). Give it what it asks for in its profile, or change its objective."));
    const a = ed.agenteExacto(x.id);
    acc = [b("It has it now", (el) => decidir(true, null, el), true), a ? b("See their profile", () => { cerrarPantalla(); fichaTab = "capacidades"; elegir(a); }) : null];
  } else {
    if (x.detalle) partes.push(h("p", { class: "p-det" }, x.detalle));
    acc = [b(x.clase === "accion" ? "Approve and do it" : x.clase === "moneda" ? "Confirm" : "Accept", (el) => decidir(true, null, el), true), b(x.clase === "accion" ? "Reject" : "Dismiss", (el) => decidir(false, null, el))];
  }
  partes.push(h("div", { class: "p-acc" }, acc.filter(Boolean)));
  return h("article", { class: "peticion" + (x.externo ? " externo" : "") }, partes);
}

// =====================================================================
// Agentes de serie: los que trae Fer Agent, para instalarlos cuando quieras
// =====================================================================
let firmaSerie = "";
function pintarSerie(forzar) {
  const v = $("vistaSerie");
  if (pantalla !== "serie") return;
  const lista = ed.catalogoSerie(), faltan = lista.filter((x) => !x.instalado);
  const firma = lista.map((x) => x.id + (x.instalado ? 1 : 0) + x.nombreAhora).join("|");
  if (!forzar && firma === firmaSerie) return;
  firmaSerie = firma;
  const sc = v.scrollTop;
  const hecho = (r) => { const n = (r.vueltos || []).length, sin = r.sinSitio || []; avisoFlotante((n ? tr(n === 1 ? `Installed ${r.vueltos.join(", ")}.` : `Installed: ${r.vueltos.join(", ")}.`) : tr("None was missing.")) + (sin.length ? " " + tr(`No room for: ${sin.join("; ")}.`) : "")); pintar(); pintarSerie(true); };
  const tarjeta = (x) => h("article", { class: "serie-ag" + (x.instalado ? " instalado" : "") },
    (() => { const im = h("img", { src: figura(x.aspecto), alt: "", class: "serie-pj" }); asegurarFigura(x.aspecto).then((u) => { im.src = u; }); return im; })(),
    h("div", { class: "serie-txt" },
      h("div", { class: "p-cab" }, h("b", { class: "serie-nombre" }, x.instalado && x.nombreAhora ? x.nombreAhora : x.nombre), h("span", { class: "clase-pet" }, x.papel),
        x.instalado ? h("span", { class: "serie-estado" }, x.id === "jefe" ? "Always there" : "In your building") : null),
      h("p", { class: "p-det" }, x.descripcion),
      h("div", { class: "p-acc" },
        x.instalado
          ? (x.id === "jefe" ? null : [h("button", { class: "btn mini", type: "button", onclick: () => { cerrarPantalla(); const a = ed.agenteExacto(x.id); if (a) elegir(a); } }, "See their profile"),
              h("button", { class: "btn mini peligro", type: "button", onclick: (ev) => confirmar(ev.target, "Remove it? It's deleted along with its short memory. Press again", () => Motor.ejecutar({ tipo: "borrarAgente", id: x.id }).then(() => { pintar(); pintarSerie(true); }).catch(avisar)) }, "Remove from the building")])
          : h("button", { class: "btn mini primario", type: "button", onclick: (ev) => { ev.target.disabled = true; Motor.ejecutar({ tipo: "instalarSerie", id: x.id }).then(hecho).catch((err) => { ev.target.disabled = false; avisar(err); }); } }, "Install"))));
  v.replaceChildren(cabPantalla("Built-in agents"), h("div", { class: "bandeja catalogo-serie" },
    h("h1", {}, "Built-in agents"),
    h("p", { class: "nota-osc" }, "The agents that come with Fer Agent. A new building starts with just the boss: if you only want one agent, you already have it. Install the ones you want, whenever you want; if you remove one, it's back here."),
    faltan.length ? h("div", { class: "fila-c" }, h("button", { class: "btn primario", type: "button", onclick: (ev) => { ev.target.disabled = true; Motor.ejecutar({ tipo: "instalarSerie" }).then(hecho).catch((err) => { ev.target.disabled = false; avisar(err); }); } },
      tr(`Install the recommended team (${faltan.length === 1 ? tr("1 missing") : tr(`${faltan.length} missing`)})`)),
      h("span", { class: "nota-osc" }, "Dome: the boss and the two sages. Tech floor: Techie, Artie, the Creator, JEV and the Controller. Lobby: Memory.")) : h("p", { class: "nota-osc" }, "You have the whole recommended team installed."),
    h("div", { class: "serie-lista" }, lista.map(tarjeta))));
  v.scrollTop = sc;
}

// =====================================================================
// Agente del mes: clasificación por monedas y gasto
// =====================================================================
const VISTAS = { mes: "vistaMes", salas: "vistaSalas", bandeja: "vistaBandeja", serie: "vistaSerie" };
function abrirPantalla(cual) {
  if (chatId) { if (conv.on) colgar(); pararAudio(); chatId = ""; $("vistaChat").hidden = true; pintarAcento(); }
  pantalla = cual;
  for (const [k, id] of Object.entries(VISTAS)) $(id).hidden = k !== cual;
  document.body.classList.add("con-pantalla");
  if (cual === "mes") pintarMes(true); else if (cual === "salas") pintarSalas(true); else if (cual === "serie") pintarSerie(true); else pintarBandeja(true);
  $(VISTAS[cual]).scrollTop = 0;
  marcarNav();
}
function cerrarPantalla() { pantalla = ""; for (const id of Object.values(VISTAS)) $(id).hidden = true; document.body.classList.remove("con-pantalla"); pintar(); reemplazarNav(); }
const cabPantalla = (titulo) => h("header", { class: "pantalla-cab" }, h("button", { class: "volver-btn", type: "button", onclick: volverAtras }, "← Back to the building"), h("span", { class: "grow" }), titulo ? h("span", { class: "nota-osc" }, titulo) : null);
const enUso = (el) => el.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
function pintarMes(forzar) {
  const v = $("vistaMes");
  if (!forzar && enUso(v)) return;
  const sc = v.scrollTop;
  const ini = new Date(); ini.setDate(1); ini.setHours(0, 0, 0, 0);
  const delMes = (ed.e.monedas || []).filter((m) => m.estado === "confirmada" && m.ts >= ini.getTime());
  const filas = ed.e.agentes.map((a) => {
    const mias = delMes.filter((m) => m.agente === a.id), oro = mias.filter((m) => m.tipo === "oro").length, rojas = mias.filter((m) => m.tipo === "roja").length;
    return { a, oro, rojas, saldo: oro - rojas, gasto: ed.gastoAgente(a, "mes") };
  }).sort((x, y) => y.saldo - x.saldo || y.oro - x.oro || x.gasto - y.gasto || x.a.nombre.localeCompare(y.a.nombre));
  const mes = new Date().toLocaleDateString(LOCALE, { month: "long", year: "numeric" });
  const podio = filas.filter((f) => f.oro > 0 && f.saldo > 0).slice(0, 3);
  const caja = h("div", { class: "mes" }, h("h1", {}, "Agent of the month"), h("p", { class: "nota-osc" }, `${mes[0].toUpperCase() + mes.slice(1)}. Sorted by coins (gold minus red); on a tie, whoever has spent least wins.`));
  if (podio.length) {
    const orden = podio.length === 3 ? [podio[1], podio[0], podio[2]] : podio.length === 2 ? [podio[1], podio[0]] : [podio[0]];
    caja.append(h("div", { class: "podio", style: podio.length < 3 ? { gridTemplateColumns: `repeat(${podio.length}, minmax(0, 260px))`, justifyContent: "center" } : {} }, orden.map((f) => {
      const im = h("img", { alt: "", src: figura(f.a.aspecto) }); asegurarFiguraGrande(f.a.aspecto).then((u) => { im.src = u; });
      const puesto = podio.indexOf(f) + 1;
      return h("div", { class: puesto === 1 ? "primero" : "" }, h("span", { class: "puesto" }, puesto === 1 ? "Agent of the month" : crudo(tr("#{1}").replace("{1}", puesto))), im, h("b", {}, f.a.nombre),
        h("small", {}, `${f.oro} ${tr(f.oro === 1 ? "gold coin" : "gold coins")} · ${f.rojas} ${tr(f.rojas === 1 ? "red coin" : "red coins")}${f.gasto > 0 ? " · " + fmt(f.gasto) : ""}`));
    })));
  } else caja.append(h("p", { class: "nota-osc" }, "No coins yet this month. Give them from each agent's chat (below each reply) or from their profile."));
  const pend = (ed.e.monedas || []).filter((m) => m.estado === "propuesta");
  if (pend.length) caja.append(h("div", { class: "seccion-osc" }, h("h2", {}, "Proposals waiting for your decision"),
    h("p", { class: "nota-osc", style: { margin: 0 } }, "JEV and the Controller propose red coins when they see someone failing or overspending. They only count if you confirm them."), pend.map(filaMonedaPropuesta)));
  caja.append(h("div", { class: "seccion-osc" }, h("h2", {}, "Ranking"),
    h("table", { class: "ranking" }, h("thead", {}, h("tr", {}, h("th", {}, "#"), h("th", {}, "Agent"), h("th", {}, "Gold"), h("th", {}, "Red"), h("th", {}, "Balance"), h("th", {}, "Spending this month"), h("th", {}, "Give a coin"))),
      h("tbody", {}, filas.map((f, i) => h("tr", {}, h("td", {}, i + 1), h("td", {}, h("img", { src: figura(f.a.aspecto), alt: "" }), h("b", {}, f.a.nombre), " ", h("small", { class: "nota-osc" }, rolTxt(f.a))),
        h("td", {}, f.oro || "—"), h("td", {}, f.rojas || "—"), h("td", {}, f.saldo > 0 ? "+" + f.saldo : f.saldo || "—"), h("td", {}, f.gasto > 0 ? fmt(f.gasto) : "—"),
        h("td", { class: "dar" }, botonMoneda(f.a, "oro"), botonMoneda(f.a, "roja"))))))));
  const recientes = (ed.e.monedas || []).filter((m) => m.estado === "confirmada").slice(-12).reverse();
  if (recientes.length) caja.append(h("div", { class: "seccion-osc" }, h("h2", {}, "Latest coins"),
    recientes.map((m) => h("div", { class: "fila-moneda" }, h("span", { class: "moneda " + m.tipo }), h("span", { class: "grow" }, h("b", {}, m.nombre), " · ", crudo(m.motivo)), h("small", { class: "nota-osc" }, `${fecha(m.ts)} · ${m.propone === "tú" ? tr("from you") : tr(`proposed by ${quienPropone(m.propone)}`)}`)))));
  v.replaceChildren(cabPantalla("Gold coins: good work · red: making things up or wasting money"), caja);
  v.scrollTop = sc;
}

// =====================================================================
// Salas de reuniones: hasta 10 en la mesa, con orden del día; modera el jefe y al final, el acta
// =====================================================================
const ESTADO_REUNION = { propuesta: "proposed by the boss: waiting for your yes", lista: "called: ready to start", "en curso": "in progress", terminada: "finished", interrumpida: "interrupted", cancelada: "cancelled" };
let salaSel = "", borradorSala = null;
function abrirSalas(id) { salaSel = id || salaSel; abrirPantalla("salas"); }
function empezarReunion(id, rondas) {
  Motor.ejecutar({ tipo: "reunion.empezar", reunion: id, rondas }).then(() => { abrirSalas(id); setTimeout(pintar, 300); }).catch(avisar);
}
function pintarSalas(forzar) {
  const v = $("vistaSalas");
  if (!forzar && enUso(v)) return;
  const sc = v.scrollTop;
  const reus = (ed.e.reuniones || []).slice().sort((x, y) => y.creada - x.creada);
  if (salaSel !== "nueva" && !reus.some((r) => r.id === salaSel)) salaSel = reus.length ? reus[0].id : "nueva";
  const lista = h("div", { class: "salas-lista" }, h("h1", {}, "Meeting rooms"),
    h("button", { class: "btn primario", onclick: () => { salaSel = "nueva"; pintarSalas(true); } }, "New meeting"),
    reus.map((r) => h("button", { class: "item-sala" + (r.id === salaSel ? " sel" : ""), type: "button", onclick: () => { salaSel = r.id; pintarSalas(true); } },
      h("b", {}, crudo(r.titulo)), h("small", {}, `${tr(ESTADO_REUNION[r.estado] || r.estado)} · ${fecha(r.creada)} · ${r.participantes.length} at the table`))));
  const r = reus.find((x) => x.id === salaSel);
  v.replaceChildren(cabPantalla("Called by you or the boss · the boss chairs · at the end, the minutes"), h("div", { class: "salas" }, lista, r ? vistaReunion(r) : formularioReunion()));
  v.scrollTop = sc;
}
// La mesa: el jefe en el centro del fondo y los demás alrededor; brilla quien está hablando
function mesa(r) {
  const ags = r.participantes.map((id) => ed.agenteExacto(id)).filter(Boolean);
  const j = ags.find((a) => a.rol === "jefe"), resto = ags.filter((a) => a !== j);
  const orden = []; resto.forEach((a, i) => (i % 2 ? orden.push(a) : orden.unshift(a)));   // reparte a izquierda y derecha
  const sitio = [...orden.slice(0, Math.ceil(orden.length / 2)), ...(j ? [j] : []), ...orden.slice(Math.ceil(orden.length / 2))];
  const n = sitio.length, cont = h("div", { class: "mesa" });
  const habla = new Set(r.estado === "en curso" ? [...ed.ocupados].filter((id) => r.participantes.includes(id)) : []);
  sitio.forEach((a, i) => {
    const t = Math.PI + 0.3 + (Math.PI - 0.6) * (n === 1 ? 0.5 : i / (n - 1));
    const x = 50 + 41 * Math.cos(t), y = 63 + 25 * Math.sin(t) + 13;
    const im = h("img", { alt: "", src: figura(a.aspecto) });
    cont.append(h("div", { class: "asiento" + (habla.has(a.id) ? " habla" : ""), style: { left: x + "%", top: y + "%" }, title: a.nombre }, im));
    cont.append(h("span", { class: "etq-asiento" + (a.rol === "jefe" ? " chairs" : ""), style: { left: x + "%", top: (y + 1.5) + "%" } }, a.nombre));
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
function vistaReunion(r) {
  const caja = h("div", { class: "sala" }, h("h2", {}, crudo(r.titulo)),
    h("p", { class: "nota-osc", style: { margin: 0 } }, `${tr(ESTADO_REUNION[r.estado] || r.estado)} · ${tr(r.convoca === "tú" ? "called by you" : "called by the boss")} · ${fecha(r.creada)}${r.coste > 0 ? " · " + tr(`cost ${fmt(r.coste)}`) : ""}${r.estado === "en curso" && r.rondaActual ? " · " + tr(`round ${r.rondaActual} of ${r.rondas}`) : ""}`),
    mesa(r), h("div", { class: "orden" }, h("b", {}, "Agenda"), "\n", crudo(String(r.ordenDelDia || "").replace(/^\s*\**\s*(orden del d[ií]a|agenda)\s*\**\s*[:.\-–]?\s*/i, ""))));   // si el jefe ya lo escribió con su título, no se repite
  if (r.estado === "propuesta" || r.estado === "lista") {
    const rondas = h("input", { type: "number", min: "1", step: "1", value: r.rondas, style: { width: "70px" } });
    const est = h("span", { class: "nota-osc" });
    const calc = () => { const e = ed.estimarReunion(Object.assign({}, r, { rondas: Math.max(1, parseInt(rondas.value, 10) || 1) })); est.textContent = tr(`Estimated cost: ≈${fmt(e.coste)} (${e.llamadas} calls, about 1,500 input tokens and 250 output tokens each)`); };
    rondas.oninput = calc; calc();
    caja.append(h("div", { class: "form-osc" },
      h("div", { class: "fila-c" }, h("span", {}, "Rounds"), rondas, est),
      h("div", { class: "fila-c" }, h("button", { class: "btn primario", disabled: !hayAcceso(), onclick: () => empezarReunion(r.id, parseInt(rondas.value, 10) || r.rondas) }, r.estado === "propuesta" ? "Yes, start the meeting" : "Start the meeting"),
        h("button", { class: "btn", onclick: () => Motor.ejecutar({ tipo: "reunion.cancelar", reunion: r.id }).then(() => pintarSalas(true)).catch(avisar) }, "Don't hold it")),
      hayAcceso() ? null : h("small", { class: "nota-osc" }, "Your OpenRouter key is missing (Settings).")));
  }
  if (r.intervenciones.length) caja.append(h("div", { class: "transcripcion" }, h("h3", {}, "What was said"), r.intervenciones.map((x) => h("div", { class: "intervencion" + (x.modera ? " chairs" : "") },
    h("div", {}, h("b", {}, x.nombre), h("small", {}, " · " + tr(`round ${x.ronda || "—"}`) + (x.modera ? " · " + tr("chairs") : "") + (x.coste > 0 ? " · " + fmt(x.coste) : ""))), h("div", { html: markdown(x.texto) })))));
  if (r.estado === "en curso") caja.append(h("p", { class: "nota-osc" }, "The meeting is going on: each contribution appears here when it's finished."));
  if (r.acta) caja.append(h("div", { class: "acta" }, h("h2", {}, "Minutes"), h("div", { html: markdown(r.acta) })));
  if (r.motivo && r.estado === "interrumpida") caja.append(h("p", { class: "nota-osc" }, tr("It was interrupted:") + " ", crudo(r.motivo)));
  if (r.estado !== "en curso") caja.append(h("div", {}, h("button", { class: "btn mini", onclick: (ev) => confirmar(ev.target, "Delete it? Press again", () => Motor.ejecutar({ tipo: "reunion.borrar", reunion: r.id }).then(() => { salaSel = ""; pintarSalas(true); }).catch(avisar)) }, "Delete the meeting")));
  return caja;
}
function formularioReunion() {
  const j = ed.jefe();
  if (!borradorSala) borradorSala = { titulo: "", orden: "", participantes: new Set(j ? [j.id] : []), rondas: 2 };
  const b = borradorSala;
  const titulo = h("input", { value: b.titulo, maxlength: "80", placeholder: "For example: Plan for the week", oninput: (ev) => { b.titulo = ev.target.value; } });
  const orden = h("textarea", { rows: "4", placeholder: "What needs discussing and what needs deciding", oninput: (ev) => { b.orden = ev.target.value; } }); orden.value = b.orden;
  const rondas = h("input", { type: "number", min: "1", step: "1", value: b.rondas, style: { width: "70px" } });
  const est = h("span", { class: "nota-osc" }), cuenta = h("span", { class: "nota-osc" });
  const calc = () => {
    b.rondas = Math.max(1, parseInt(rondas.value, 10) || 1);
    cuenta.textContent = tr(`${b.participantes.size} of ${MAX_REUNION} at the table, counting the boss`);
    const e = ed.estimarReunion({ participantes: [...b.participantes], rondas: b.rondas });
    est.textContent = b.participantes.size > 1 ? tr(`Estimated cost: ≈${fmt(e.coste)} (${e.llamadas} calls)`) : "";
  };
  rondas.oninput = calc;
  const posibles = ed.e.agentes.filter((a) => conversa(a));
  const elegir = h("div", { class: "elegir-asistentes" }, posibles.map((a) => {
    const chk = h("input", { type: "checkbox", checked: b.participantes.has(a.id), disabled: a.rol === "jefe" });
    chk.onchange = () => {
      if (chk.checked && b.participantes.size >= MAX_REUNION) { chk.checked = false; avisoFlotante(`The table seats ${MAX_REUNION}, counting the boss.`); return; }
      if (chk.checked) b.participantes.add(a.id); else b.participantes.delete(a.id); calc();
    };
    return h("label", {}, chk, h("img", { src: figura(a.aspecto), alt: "" }), a.nombre);
  }));
  calc();
  const convocar = async () => {
    if (!b.titulo.trim()) { titulo.focus(); return; }
    if (!b.orden.trim()) { orden.focus(); return; }
    try {
      const r = await Motor.ejecutar({ tipo: "reunion.convocar", titulo: b.titulo.trim(), ordenDelDia: b.orden.trim(), participantes: [...b.participantes], rondas: b.rondas });
      borradorSala = null; salaSel = r.id; pintarSalas(true);
    } catch (err) { avisar(err); }
  };
  return h("div", { class: "sala" }, h("h2", {}, "New meeting"),
    h("div", { class: "form-osc" },
      h("label", {}, "Title", titulo), h("label", {}, "Agenda", orden),
      h("div", { class: "campo-osc" }, h("b", {}, "Who sits at the table"), cuenta, elegir, h("small", { class: "nota-osc" }, "The boss chairs and is always there. Those who don't chat (Controller, Memory, JEV) can't sit down.")),
      h("div", { class: "fila-c" }, h("span", {}, "Rounds"), rondas, est),
      h("div", { class: "fila-c" }, h("button", { class: "btn primario", onclick: convocar }, "Call"), h("small", { class: "nota-osc" }, "It doesn't start yet: first you'll see the table and the estimated cost."))));
}

// =====================================================================
// Cajón: Ajustes, Gasto, Vestir
// =====================================================================
let cajonTipo = "", cajonDatos = {}, focoAntes = null;
const TITULOS = { ajustes: "Settings", gasto: "Spending", aspecto: "Appearance", agente: "Create agent", piso: "Create floor" };
function abrirCajon(tipo, datos) {
  if ($("cajon").hidden) focoAntes = document.activeElement;
  cajonTipo = tipo; cajonDatos = datos || {};
  $("cajonTitulo").textContent = tr(TITULOS[tipo]);
  $("velo").classList.toggle("claro", tipo === "aspecto"); $("cajon").classList.toggle("bajo", tipo === "aspecto");
  if (tipo === "ajustes") pintarAjustes(); if (tipo === "gasto") pintarGastoCajon(); if (tipo === "aspecto") pintarAspecto();
  if (tipo === "agente") pintarCrearAgente(true); if (tipo === "piso") pintarCrearPiso();
  $("cajon").hidden = false; $("velo").hidden = false; $("cajonCuerpo").scrollTop = 0; $("cerrarCajon").focus();
  marcarNav();
}
function cerrarCajon() { $("cajon").hidden = true; $("velo").hidden = true; cajonTipo = ""; if (focoAntes && focoAntes.focus && focoAntes.isConnected) focoAntes.focus(); reemplazarNav(); }

// =====================================================================
// Navegación: el logo lleva a la portada, la flecha de atrás del navegador funciona y cada pantalla tiene «Volver»
// =====================================================================
let aplicandoNav = false;
const pilaNav = [{ v: "portada" }];   // lo que se veía en cada paso del historial (para saber adónde lleva «atrás»)
const portadaVisible = () => !$("portada").hidden && !$("portada").classList.contains("fuera");
function estadoNav() {
  if (portadaVisible()) return { v: "portada" };
  if (!$("cajon").hidden && ["ajustes", "gasto"].includes(cajonTipo)) return { v: "cajon", id: cajonTipo };
  if (!$("cajon").hidden && cajonTipo) return { v: "cajon", id: cajonTipo, temporal: true };
  return estadoSinCajon();
}
function estadoSinCajon() {
  if (chatId) return { v: "chat", id: chatId };
  if (pantalla) return { v: "pantalla", id: pantalla };
  if (plantaAbierta) return { v: "planta", id: plantaAbierta };
  return { v: "edificio" };
}
const mismoNav = (a, b) => !!(a && b && a.v === b.v && (a.id || "") === (b.id || ""));
const pasoNav = () => (history.state && Number.isInteger(history.state.n) ? history.state.n : 0);
function marcarNav() {
  if (aplicandoNav) return;
  const st = estadoNav();
  if (mismoNav(st, history.state)) return;
  const n = pasoNav() + 1;
  pilaNav.length = n; pilaNav[n] = st; pasoVisto = n;
  try { history.pushState(Object.assign({}, st, { n }), ""); } catch {}
}
function reemplazarNav() {   // cerrar algo desde el programa (no con «Volver»): se apunta dónde estás sin añadir un paso
  if (aplicandoNav) return;
  const st = estadoNav(), n = pasoNav();
  pilaNav[n] = st;
  try { history.replaceState(Object.assign({}, st, { n }), ""); } catch {}
}
// «Volver»: cierra lo de arriba. Si el paso anterior del historial es justo eso, es la flecha de atrás del navegador.
function volverAtras() {
  let objetivo, cerrar;
  if (!$("cajon").hidden) { objetivo = estadoSinCajon(); cerrar = cerrarCajon; }
  else if (chatId) { objetivo = pantalla ? { v: "pantalla", id: pantalla } : plantaAbierta ? { v: "planta", id: plantaAbierta } : { v: "edificio" }; cerrar = cerrarChat; }
  else if (pantalla) { objetivo = plantaAbierta ? { v: "planta", id: plantaAbierta } : { v: "edificio" }; cerrar = cerrarPantalla; }
  else if (plantaAbierta) { objetivo = { v: "edificio" }; cerrar = () => { plantaAbierta = ""; pintar(); }; }
  else if (panelAbierto()) { cerrarPanel(); return; }   // la ficha abierta al lado: se cierra y queda el edificio entero
  else { mostrarPortada(); return; }
  const n = pasoNav();
  if (n > 0 && mismoNav(pilaNav[n - 1], objetivo)) { history.back(); return; }
  cerrar(); reemplazarNav();
}
function mostrarPortada() {
  if (chatId) { if (conv.on) colgar(); pararAudio(); }
  const p = $("portada"); p.hidden = false; void p.offsetWidth; p.classList.remove("fuera"); p.scrollTop = 0;
  marcarNav();
}
function ocultarPortada() { const p = $("portada"); if (p.hidden) return; p.classList.add("fuera"); setTimeout(() => { if (p.classList.contains("fuera")) p.hidden = true; }, 450); }
function aplicarNav(st) {
  st = st || { v: "portada" };
  aplicandoNav = true;
  try {
    if (st.v === "portada") { mostrarPortada(); return; }
    ocultarPortada();
    if (!(st.v === "cajon" && !st.temporal) && !$("cajon").hidden) cerrarCajon();
    if (st.v !== "chat" && chatId) cerrarChat();
    if (st.v !== "pantalla" && pantalla) cerrarPantalla();
    if (st.v === "chat") abrirChat(st.id);
    else if (st.v === "pantalla" && VISTAS[st.id]) { if (pantalla !== st.id) abrirPantalla(st.id); }
    else if (st.v === "cajon" && !st.temporal) { if (cajonTipo !== st.id) abrirCajon(st.id); }
    else if (st.v === "planta") { if (plantaAbierta !== st.id) { plantaAbierta = st.id; pintar(); } }
    else if (plantaAbierta && st.v === "edificio") { plantaAbierta = ""; pintar(); }
  } finally { aplicandoNav = false; }
}
let pasoVisto = 0;   // el paso del historial en el que estábamos (para saber si fue «atrás» o «adelante»)
window.addEventListener("popstate", (ev) => {
  if (!ed || !ed.e) return;
  const n = ev.state && Number.isInteger(ev.state.n) ? ev.state.n : 0, atras = n < pasoVisto;
  pasoVisto = n;
  // un paso que deja la pantalla igual (pasa al cerrar algo desde el programa) se salta: «atrás» siempre cambia algo
  if (ev.state && mismoNav(ev.state, estadoNav())) { if (atras && n > 0) history.back(); else if (!atras) history.forward(); return; }
  aplicarNav(ev.state);
});

// ---------------- Crear piso ----------------
function pintarCrearPiso() {
  const c = $("cajonCuerpo"); c.innerHTML = "";
  const nom = h("input", { placeholder: "For example: Sales, Home, Studies…", maxlength: "40" });
  const fun = h("textarea", { rows: "3", placeholder: "For example: find customers and prepare quotes", maxlength: "300" });
  const crear = async () => {
    if (!nom.value.trim()) { nom.focus(); return; }
    try { const r = await Motor.ejecutar({ tipo: "crearPlanta", nombre: nom.value.trim(), funcion: fun.value.trim() }); cerrarCajon(); abrirPlanta(r.id); verPestana(window.innerWidth <= 900 ? "edificio" : pestana); }
    catch (err) { avisar(err); }
  };
  c.append(h("p", { class: "nota", style: { margin: 0 } }, "Each floor is a team with a job. On the left, its section head's office; on the right, its sub-agents' offices; and if there are many simple ones, the pool. The new floor is built at the top, under the dome."),
    h("label", { class: "campo" }, h("span", {}, "Floor name"), nom),
    h("label", { class: "campo" }, h("span", {}, "What it does"), fun),
    h("div", { class: "fila-c" }, h("button", { class: "btn primario", onclick: crear }, "Create floor"), h("button", { class: "btn", onclick: cerrarCajon }, "Cancel")));
  setTimeout(() => nom.focus(), 50);
}

// ---------------- Crear agente (en blanco, o diseñado por el Creador) ----------------
let borrador = null;
function borradorNuevo(d) {
  const pisos = ed.e.plantas.filter((x) => x.tipo === "piso");
  const pl = ed.e.plantas.find((x) => x.id === d.planta) || pisos[0] || null;
  const rol = pl && pl.tipo === "cupula" ? "sabio" : d.puesto === "despacho" ? "jefe_seccion" : "subagente";
  const libreVes = pl && pl.tipo === "vestibulo" ? (PUESTOS.vestibulo.find((k) => !ed.e.agentes.some((x) => x.planta === pl.id && x.puesto === k)) || "izquierda") : "";
  return { nombre: "", rol, planta: pl ? pl.id : "nuevo", plantaNueva: { nombre: "", funcion: "" }, puesto: d.puesto || libreVes || (rol === "jefe_seccion" ? "despacho" : rol === "sabio" ? "izquierda" : "oficina"),
    cuerpo: "", objetivo: "", personalidad: "", cerebro: "", latido: { cada: 1, unidad: rol === "sabio" ? "peticion" : "d" }, alDespertar: "tareas", capacidades: ["escribir", "hablar", "oir"], aspecto: { p: rol === "sabio" ? "abuelo" : "chico" }, propuesta: "", porque: "", pedido: "", personalidadPedida: "" };
}
function pintarCrearAgente(nuevo) {
  if (nuevo || !borrador) borrador = cajonDatos.ficha ? Object.assign(borradorNuevo({}), cajonDatos.ficha, { propuesta: cajonDatos.propuesta || "" }) : borradorNuevo(cajonDatos);
  const b = borrador, c = $("cajonCuerpo"), sc = c.scrollTop;
  c.innerHTML = "";
  // 1. el Creador
  const creador = ed.e.agentes.find((x) => x.rol === "creador");
  const pedido = h("textarea", { rows: "3", placeholder: "For example: I want one that every Monday prepares the week's menu and the shopping list for me", value: b.pedido });
  pedido.value = b.pedido || "";
  pedido.oninput = () => { b.pedido = pedido.value; };
  const quien = creador ? (["Agent Creator", "Creador de agentes"].includes(creador.nombre) || !creador.nombre.trim() ? "the Creator" : creador.nombre) : "";
  const perPedida = h("input", { maxlength: String(MAX_PERSONALIDAD), placeholder: "For example: friendly, funny and to the point", value: b.personalidadPedida || "" });
  perPedida.oninput = () => { b.personalidadPedida = perPedida.value; };
  const boton = h("button", { class: "btn primario mini" }, `Let ${quien} design it`);
  boton.onclick = async () => {
    if (!pedido.value.trim()) { pedido.focus(); return; }
    if (!hayAcceso()) { abrirCajon("ajustes"); return; }
    boton.disabled = true; boton.textContent = tr("Designing…");
    try {
      const r = await Motor.ejecutar({ tipo: "proponerAgente", texto: pedido.value.trim(), personalidad: perPedida.value.trim() });
      const f = r.propuesta.ficha;
      borrador = Object.assign(borradorNuevo({}), f, { planta: f.planta || "nuevo", plantaNueva: f.plantaNueva || { nombre: "", funcion: "" }, propuesta: r.propuesta.id, porque: f.porque, pedido: pedido.value, personalidadPedida: perPedida.value, coste: r.coste });
      pintarCrearAgente(false);
    } catch (err) { boton.disabled = false; boton.textContent = tr("Try again"); c.querySelector(".error-creador")?.remove(); boton.after(h("p", { class: "error-creador" }, err.mostrado ? err.message : `It couldn't be done: ${err.message}`)); }
  };
  c.append(h("div", { class: "bloque creador" }, h("h4", {}, "Tell it in your own words"),
    creador ? h("p", { class: "nota", style: { margin: 0 } }, `${quien[0].toUpperCase() + quien.slice(1)} fills in the profile for you. Then you review it and change it if you like. It costs one call to its brain (a few cents).`)
      : h("p", { class: "nota", style: { margin: 0 } }, "You don't have an Agent Creator. Fill in the profile by hand or install it from “Built-in agents”."),
    creador ? pedido : null,
    creador ? h("label", { class: "campo" }, h("span", {}, "What personality do you want it to have? (its tone, its humour and whether it gets to the point)"), perPedida, h("small", {}, "If you leave it blank, the Creator proposes one and you can change it below.")) : null,
    creador ? h("div", {}, boton) : null,
    b.propuesta ? h("p", { class: "porque" }, tr(b.porque || "Profile filled in by the Creator.") + (b.coste ? " " + tr(`Designing it cost ${fmt(b.coste)}.`) : "")) : null));
  // 2. la ficha
  const nombre = h("input", { value: b.nombre, placeholder: "What it's called", maxlength: "40", oninput: (ev) => { b.nombre = ev.target.value; } });
  const selRol = h("select", { onchange: (ev) => { b.rol = ev.target.value; if (b.rol === "sabio") { b.planta = ed.e.plantas[0].id; b.puesto = "izquierda"; b.latido = { cada: 1, unidad: "peticion" }; if (!["abuelo", "abuela"].includes(b.aspecto.p)) b.aspecto = { p: "abuelo" }; } else { if (b.planta === ed.e.plantas[0].id) b.planta = (ed.e.plantas.find((x) => x.tipo === "piso") || { id: "nuevo" }).id; b.puesto = b.rol === "jefe_seccion" ? "despacho" : "oficina"; } pintarCrearAgente(false); } },
    [["jefe_seccion", "Section head"], ["subagente", "Sub-agent"], ["sabio", "Sage"]].map(([v, t]) => h("option", { value: v }, t)));
  selRol.value = b.rol;
  const plantasOk = b.rol === "sabio" ? ed.e.plantas.filter((x) => x.tipo === "cupula") : ed.e.plantas.filter((x) => x.tipo !== "cupula");
  const selPlanta = h("select", { disabled: b.rol === "sabio", onchange: (ev) => { b.planta = ev.target.value; const t = (ed.e.plantas.find((x) => x.id === b.planta) || { tipo: "piso" }).tipo; b.puesto = t === "vestibulo" ? "izquierda" : (b.rol === "jefe_seccion" ? "despacho" : "oficina"); pintarCrearAgente(false); } },
    plantasOk.map((x) => h("option", { value: x.id }, x.nombre)), b.rol === "sabio" ? null : h("option", { value: "nuevo" }, "A new floor…"));
  selPlanta.value = b.planta;
  const tipoPl = b.planta === "nuevo" ? "piso" : (ed.e.plantas.find((x) => x.id === b.planta) || { tipo: "piso" }).tipo;
  const selPuesto = h("select", { onchange: (ev) => { b.puesto = ev.target.value; } }, (PUESTOS_TXT[tipoPl] || []).map(([v, t]) => h("option", { value: v }, t)));
  selPuesto.value = b.puesto;
  const pNombre = h("input", { value: b.plantaNueva.nombre, placeholder: "Name of the new floor", oninput: (ev) => { b.plantaNueva.nombre = ev.target.value; } });
  const pFuncion = h("input", { value: b.plantaNueva.funcion, placeholder: "What it does", oninput: (ev) => { b.plantaNueva.funcion = ev.target.value; } });
  const cuerpo = h("textarea", { rows: "5", placeholder: "Who it is and how it works. For example: “You're in charge of…; every time you wake up, …; deliver…”", oninput: (ev) => { b.cuerpo = ev.target.value; } }); cuerpo.value = b.cuerpo;
  const objetivo = h("textarea", { rows: "2", placeholder: "What it should achieve (optional)", oninput: (ev) => { b.objetivo = ev.target.value; } }); objetivo.value = b.objetivo;
  const personalidad = h("textarea", { rows: "2", maxlength: String(MAX_PERSONALIDAD), placeholder: "Its tone, its humour and whether it gets to the point", oninput: (ev) => { b.personalidad = ev.target.value; } }); personalidad.value = b.personalidad || "";
  const selCerebro = selectorModelo("texto", b.cerebro, { vacio: "The cheapest that will do (the building picks it)", alCambiar: (v) => { b.cerebro = v; } });
  const num = h("input", { type: "number", min: "1", step: "1", value: b.latido.cada, disabled: b.latido.unidad === "peticion", onchange: (ev) => { b.latido.cada = Math.max(1, parseInt(ev.target.value, 10) || 1); } });
  const uni = h("select", { onchange: (ev) => { b.latido.unidad = ev.target.value; num.disabled = b.latido.unidad === "peticion"; } }, [["min", "minutes"], ["h", "hours"], ["d", "days"], ["peticion", "on request only"]].map(([v, t]) => h("option", { value: v }, t)));
  uni.value = b.latido.unidad;
  const alD = h("select", { onchange: (ev) => { b.alDespertar = ev.target.value; } }, h("option", { value: "tareas" }, "Does its pending tasks (if there are none, it doesn't spend)"), h("option", { value: "objetivo" }, "Does its tasks and, if there are none, works on its objective (spends)"));
  alD.value = b.alDespertar;
  const caps = h("div", { class: "caps" }, CAPACIDADES.filter((x) => x.tipo === "basica").map((x) => h("label", { class: "cap" },
    h("input", { type: "checkbox", checked: b.capacidades.includes(x.id), disabled: x.id === "escribir", onchange: (ev) => { b.capacidades = ev.target.checked ? [...new Set([...b.capacidades, x.id])] : b.capacidades.filter((y) => y !== x.id); } }),
    h("span", {}, x.nombre, h("small", {}, x.como)))));
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Its profile"),
    campo("Name", nombre),
    h("div", { class: "dos" }, campo("Role", selRol), campo("Floor", selPlanta)),
    h("small", { class: "nota", style: { marginTop: "-6px" } }, { jefe_seccion: "The section head runs a floor from the office on the left and shares out the work among its sub-agents.", subagente: "The sub-agent does the work, in an office or, if it's simple and cheap, in the pool.", sabio: "The sage sits in the dome and only advises the boss on important decisions. It's expensive." }[b.rol]),
    b.planta === "nuevo" ? h("div", { class: "dos" }, pNombre, pFuncion) : null,
    campo("Spot", selPuesto),
    campo("Instructions", cuerpo), campo("Personality", personalidad, "Sent with every call: its character doesn't depend on the brain."), campo("Objective", objetivo),
    campo("Brain", selCerebro, "At the top, the recommended ones by level; below, all of them. Prices in dollars per million tokens (input / output), according to OpenRouter."),
    h("div", { class: "campo" }, h("span", {}, "Resting, it wakes up"), h("div", { class: "fila-c" }, h("span", {}, "every"), num, uni)),
    b.rol === "sabio" ? null : campo("When it wakes up", alD),
    h("div", { class: "campo" }, h("span", {}, "Capabilities"), caps)));
  // 3. su aspecto
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Its appearance"), selectorAspecto(b.aspecto, (A) => { b.aspecto = A; })));
  // 4. crear
  const crear = h("button", { class: "btn primario" }, "Create agent");
  crear.onclick = async () => {
    if (b.planta === "nuevo" && !b.plantaNueva.nombre.trim()) { pNombre.focus(); return; }
    const ficha = Object.assign({}, b, { planta: b.planta === "nuevo" ? "" : b.planta, plantaNueva: b.planta === "nuevo" ? b.plantaNueva : null, nivel: b.cerebro ? "" : (b.nivel || "economico") });
    crear.disabled = true;
    try {
      const r = await Motor.ejecutar({ tipo: "crearAgente", ficha, propuesta: b.propuesta || undefined });
      borrador = null; cerrarCajon();
      const nuevo = ed.agente(r.id);
      if (nuevo) { abrirPlanta(nuevo.planta); elegir(nuevo); }
    } catch (err) { crear.disabled = false; c.querySelector(".error-creador.final")?.remove(); crear.parentElement.after(h("p", { class: "error-creador final" }, err.mostrado ? err.message : `It couldn't be done: ${err.message}`)); }
  };
  c.append(h("div", { class: "fila-c pie-crear" }, crear, h("button", { class: "btn", onclick: () => { borrador = null; cerrarCajon(); } }, "Cancel")));
  c.scrollTop = nuevo ? 0 : sc;
}

// ---------------- Aspecto de un agente ----------------
function pintarAspecto() {
  const c = $("cajonCuerpo"); c.innerHTML = "";
  const a = ed.agente(cajonDatos.id) || ed.jefe();
  if (!a) return;
  $("cajonTitulo").textContent = tr("Photo and name of ") + a.nombre;
  // el nombre, aquí mismo, junto a la foto
  const nom = h("input", { value: a.nombre, maxlength: "40", "aria-label": "Name" });
  nom.onchange = () => { const v = nom.value.trim(); if (!v || v === a.nombre) { nom.value = a.nombre; return; } Motor.ejecutar({ tipo: "editarAgente", id: a.id, cambios: { nombre: v } }).then(() => { $("cajonTitulo").textContent = tr("Photo and name of ") + v; pintar(); }).catch(avisar); };
  c.append(h("div", { class: "bloque" }, campo("Name", nom, "Give it any name you like.")));
  let espera = null;
  c.append(selectorAspecto(a.aspecto, (A) => {
    clearTimeout(espera);
    espera = setTimeout(() => Motor.ejecutar({ tipo: "editarAgente", id: a.id, cambios: { aspecto: A } }).then(() => { asegurarFigura(A).then(() => pintar()); }).catch(avisar), 120);
  }));
  c.append(h("p", { class: "nota" }, a.rol === "jefe" ? "The website's colour follows the boss's clothes (and in each chat, the clothes of the agent you're talking to)." : "It's saved with the building. In its chat, the website's colour follows its clothes."));
}

function pintarGastoCajon(soloDatos) {
  const c = $("cajonCuerpo");
  if (soloDatos && c.contains(document.activeElement) && document.activeElement.tagName === "INPUT") return;
  c.innerHTML = "";
  const aj = ed.e.ajustes, uso = ed.usoPresupuesto();
  const guardarAj = (cambios) => Motor.ejecutar({ tipo: "ajustes", cambios }).then(() => { pintar(); pintarGastoCajon(); }).catch(avisar);
  c.append(h("div", { class: "bloque" }, h("h4", {}, "The whole building"),
    h("div", { class: "gastos3" }, ["hoy", "semana", "mes"].map((p) => h("div", {}, h("b", {}, fmt(ed.gastoEdificio(p))), h("small", {}, { hoy: "today", semana: "7 days", mes: "this month" }[p])))),
    h("div", { class: "barra" }, h("i", { class: faseClase(), style: { width: Math.min(100, uso * 100) + "%" } })),
    h("p", { class: "nota", style: { margin: 0 } }, tr(`Cap used: ${Math.round(uso * 100)} %.`) + " " + tr({ normal: "Everyone works.", congelacion1: "Priority 1 and 2 are frozen.", congelacion2: "Only priority 5 works.", tope: "Cap reached: everything frozen until tomorrow or until you raise the cap." }[ed.e.fase || "normal"]))));
  // el interruptor general y quién gasta al despertar
  const pausa = aj.pausa !== false;
  const lista = ed.quienesGastan().filter((x) => !["memory"].includes(x.a.rol));
  const conLatido = lista.filter((x) => x.auto && !x.a.apagado);
  const totalDia = conLatido.reduce((s, x) => s + (x.est.porDia || 0), 0);
  const ponerPeticion = (a) => Motor.ejecutar({ tipo: "editarAgente", id: a.id, cambios: { latido: { cada: 1, unidad: "peticion" } } }).then(() => { pintar(); pintarGastoCajon(); }).catch(avisar);
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Automatic work"),
    h("div", { class: "fila-c" }, h("button", { class: "pausa-btn", type: "button", "aria-pressed": String(pausa), onclick: () => Motor.ejecutar({ tipo: "pausa", pausa: !pausa }).then(() => { pintar(); pintarGastoCajon(); }).catch(avisar) },
      h("span", { class: "pausa-ico", "aria-hidden": "true" }), h("span", { class: "pausa-txt" }, h("b", {}, pausa ? "Paused" : "Automatic work running"), h("small", {}, pausa ? "press to start it" : "press to stop everything automatic")))),
    h("p", { class: "nota", style: { margin: 0 } }, pausa ? "General pause: no agent that spends wakes up on its own, and the tasks the boss shares out wait. You can still talk to them and wake them up by hand. Whatever costs nothing (the Controller and the skills without a brain, like the X Watcher) keeps working."
      : `Running. If nobody had tasks, the automatic work would cost about ${fmt(totalDia)} a day (estimated).`),
    h("h4", { style: { marginTop: "6px" } }, "Who spends when they wake up"),
    h("div", { class: "quien-gasta" }, lista.map(({ a, auto, est }) => h("div", { class: "fila-qg" + (est.gasta && auto && est.porVez > 0 ? " gasta" : "") },
      h("img", { src: figura(a.aspecto), alt: "" }),
      h("span", { class: "qg-txt" }, h("b", {}, a.nombre), h("small", {}, `${a.apagado ? "off" : auto ? textoLatido(a.latido) : "on request only"} · ${est.como}`)),
      h("span", { class: "qg-der" }, est.gasta && est.porVez > 0 ? h("b", {}, `≈${fmt(est.porVez)} per heartbeat`) : h("small", {}, est.suscripcion ? `from your ${est.suscripcion} subscription` : est.gasta ? (est.porTarea ? `≈${fmt(est.porTarea)} per task` : "—") : "doesn't spend"),
        est.gasta && auto && est.porDia > 0 ? h("small", {}, `≈${fmt(est.porDia)} a day`) : null,
        est.gasta && auto && !a.apagado && a.rol !== "jefe" ? h("button", { class: "btn mini", type: "button", onclick: () => ponerPeticion(a) }, "On request only") : null)))),
    h("small", { class: "nota" }, "Estimate (ASSUMPTION): what it reads when it wakes up, about 3.5 letters per token, plus about 400 tokens of reply, at its brain's price. Internet search adds about $0.006. You can see the real spending above.")));
  const td = h("input", { type: "number", min: "0", step: "0.5", value: aj.topeDiario }), tm = h("input", { type: "number", min: "0", step: "1", value: aj.topeMensual }), cd = h("input", { type: "number", min: "10", max: "99", step: "5", value: Math.round((aj.congelarDesde || 0.8) * 100) });
  td.onchange = () => guardarAj({ topeDiario: Math.max(0, parseFloat(td.value) || 0) });
  tm.onchange = () => guardarAj({ topeMensual: Math.max(0, parseFloat(tm.value) || 0) });
  cd.onchange = () => guardarAj({ congelarDesde: Math.min(0.99, Math.max(0.1, (parseFloat(cd.value) || 80) / 100)) });
  const medio = Math.round(((aj.congelarDesde || 0.8) + 1) / 2 * 100);
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Caps"),
    h("div", { class: "dos" }, h("label", { class: "campo" }, h("span", {}, "Daily cap (USD)"), td), h("label", { class: "campo" }, h("span", {}, "Monthly cap (USD)"), tm)),
    h("label", { class: "campo" }, h("span", {}, "Start freezing at (%)"), cd),
    h("div", { class: "tramos" },
      h("div", {}, h("b", {}, `< ${Math.round((aj.congelarDesde || 0.8) * 100)} %`), h("span", {}, "everyone works")),
      h("div", {}, h("b", {}, `≥ ${Math.round((aj.congelarDesde || 0.8) * 100)} %`), h("span", {}, "priority 1 and 2 are frozen")),
      h("div", {}, h("b", {}, `≥ ${medio} %`), h("span", {}, "only priority 5 works (the boss and the controls)")),
      h("div", {}, h("b", {}, "100 %"), h("span", {}, "everything frozen, the boss too; it comes back the next day or when you raise the cap"))),
    h("small", { class: "nota" }, "Also put a limit on the key on the OpenRouter website: it's the safety net if something goes wrong here.")));
  const filas = ed.e.agentes.map((a) => ({ a, hoy: ed.gastoAgente(a, "hoy"), sem: ed.gastoAgente(a, "semana"), mes: ed.gastoAgente(a, "mes") })).sort((x, y) => y.mes - x.mes || y.hoy - x.hoy);
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Per agent"),
    h("table", { class: "gasto" }, h("thead", {}, h("tr", {}, h("th", {}, "Agent"), h("th", {}, "Prio."), h("th", {}, "Today"), h("th", {}, "7 days"), h("th", {}, "Month"))),
      h("tbody", {}, filas.map((f) => h("tr", {}, h("td", {}, f.a.nombre, " ", h("small", { class: "nota" }, ESTADO_TXT[estadoVisible(f.a)])), h("td", {}, f.a.prioridad), h("td", {}, f.hoy > 0 ? (f.a.gastoEstimado ? "≈" : "") + fmt(f.hoy) : "—"), h("td", {}, f.sem > 0 ? fmt(f.sem) : "—"), h("td", {}, f.mes > 0 ? fmt(f.mes) : "—")))),
      h("tfoot", {}, h("tr", {}, h("td", {}, "Total"), h("td", {}, ""), h("td", {}, fmt(ed.gastoEdificio("hoy"))), h("td", {}, fmt(ed.gastoEdificio("semana"))), h("td", {}, fmt(ed.gastoEdificio("mes")))))),
    h("small", { class: "nota" }, "In dollars. Brains, images and mic: what OpenRouter charges for each call. Voice: what was charged if OpenRouter reports it; if not, estimated at the model's price (“≈”).")));
}

// ---------------- Ajustes → Otras API (las de tus suscripciones) ----------------
function bloqueOtrasApi() {
  const conx = ed.conexiones();
  const guardarLista = (lista) => Motor.ejecutar({ tipo: "conexiones", conexiones: lista }).then(() => { pintar(); pintarAjustes(); }).catch(avisar);
  const listaActual = () => (ed.e.ajustes.conexiones || []).map((x) => Object.assign({}, x));
  const b = h("div", { class: "bloque" }, h("h4", {}, "Other APIs (your subscriptions)"),
    h("p", { class: "nota", style: { margin: 0 } }, "Each agent thinks with OpenRouter (pay per use) or with the API of a subscription you already pay for. Add yours here and, in each agent's profile → Brain, choose which one it thinks with. What comes out of your subscription doesn't count towards the spending cap: it's tracked separately, so you can see it."),
    h("small", { class: "nota" }, "Some subscriptions include API access or API credits (for example, some Claude and ChatGPT plans, or the Google Cloud credits in Google AI Pro and Ultra). Others only let you use your allowance in their own apps: don't use those here. Anything paid separately is better through OpenRouter."));
  for (const P of conx) {
    const msg = h("small", { class: "nota" });
    const probar = h("button", { class: "btn mini", type: "button", onclick: async () => { probar.disabled = true; msg.textContent = tr("Testing…"); try { const l = await cargarModelosDirectos(P.id); msg.textContent = tr(`It works: ${l.length} models. The first one: ${l[0] || "—"}.`); } catch (err) { msg.textContent = err.message; } probar.disabled = false; } }, "Test");
    const fuera = h("button", { class: "btn mini peligro", type: "button", onclick: (ev) => confirmar(ev.target, "Remove this API? Its agents go back to OpenRouter. Press again", () => { try { localStorage.removeItem(claveApi(P.id)); } catch {} guardarLista(listaActual().filter((x) => x.id !== P.id)); }) }, "Remove this API");
    const fila = h("div", { class: "campo api-fila" }, h("span", {}, P.nombre + (tieneClaveApi(P.id) && !P.sinClave ? " · " + tr("key set") : "")), h("small", { class: "nota" }, P.api + (P.formato === "anthropic" ? " · Claude's format" : "")));
    if (P.sinClave) fila.append(h("small", { class: "nota" }, "A model on your own computer: no key needed. It has to be running (and, to use it from this website, allow calls from the browser)."));
    else if (esApp()) {
      const kk = h("input", { type: "password", autocomplete: "off", placeholder: tieneClaveApi(P.id) ? "••••••••••" : P.web ? `Your key (from ${P.web})` : "Your key" });
      fila.append(h("div", { class: "clave-fila" }, kk,
        h("button", { class: "btn mini primario", type: "button", onclick: async () => { try { await llamarApp("/api/conf/clave", { prov: P.id, clave: kk.value.trim() }); await refrescarCasa(); pintarAjustes(); avisoFlotante(kk.value.trim() ? "Key saved on this computer." : "Key removed."); } catch (e) { avisar(e); } } }, "Save")),
        h("small", { class: "nota" }, "It's stored only on this computer and only travels to this API's address. To remove it, leave it empty and press “Save”."));
    }
    else if (modo === "casa") fila.append(h("small", { class: "nota" }, tieneClaveApi(P.id) ? "Key set in Fer Home." : "No key in Fer Home. On the Fer Home computer: node fer-casa.mjs claves"));
    else {
      const tiene = !!store.get(claveApi(P.id));
      const inp = h("input", { type: "password", autocomplete: "off", placeholder: P.web ? `Your key (from ${P.web})` : "Your key", value: tiene ? "••••••••••" : "" });
      inp.onfocus = () => { if (inp.value.startsWith("•")) inp.value = ""; };
      const guardar = h("button", { class: "btn mini primario", type: "button", onclick: () => { const v = inp.value.trim(); if (v && !v.startsWith("•")) store.set(claveApi(P.id), v); pintar(); pintarAjustes(); } }, "Save");
      const quitarClave = tiene ? h("button", { class: "btn mini", type: "button", onclick: (ev) => confirmar(ev.target, "Remove the key? Press again", () => { try { localStorage.removeItem(claveApi(P.id)); } catch {} pintarAjustes(); }) }, "Remove the key") : null;
      fila.append(h("div", { class: "clave-fila" }, inp, guardar, quitarClave));
    }
    fila.append(h("div", { class: "fila-c" }, probar, fuera, msg));
    b.append(fila);
  }
  // añadir: las conocidas (solo rellenan la dirección) u otra cualquiera
  const conocidas = Object.entries(PROVEEDORES).filter(([k]) => k !== "openrouter" && !conx.some((c) => c.id === k));
  if (conocidas.length) b.append(h("div", { class: "campo" }, h("span", {}, "Add a known one"), h("div", { class: "fila-c" }, conocidas.map(([k, P]) => h("button", { class: "btn mini", type: "button", onclick: () => guardarLista([...listaActual(), { id: k }]) }, "+ " + P.nombre)))));
  const nom = h("input", { placeholder: "Name (for example, My API)" }), dir = h("input", { placeholder: "Address (for example, https://api.company.com/v1)" });
  const fmtSel = h("select", {}, h("option", { value: "openai" }, "Speaks like OpenAI (most of them)"), h("option", { value: "anthropic" }, "Speaks like Claude"));
  const err = h("small", { class: "nota" });
  b.append(h("div", { class: "campo" }, h("span", {}, "Or any other"), nom, dir, fmtSel,
    h("div", { class: "fila-c" }, h("button", { class: "btn mini", type: "button", onclick: () => {
      const nombre = nom.value.trim(), api = dir.value.trim();
      if (!/^https?:\/\/\S+$/i.test(api)) { err.textContent = tr("The address has to start with https:// (or http:// if it's on your computer)."); return; }
      let id = "api-" + (sinAcentos(nombre || api.replace(/^https?:\/\//, "")).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 22) || "nueva");
      while (conx.some((c) => c.id === id) || PROVEEDORES[id]) id += "-2";
      guardarLista([...listaActual(), { id, nombre: nombre || api.replace(/^https?:\/\//, "").split("/")[0], api, formato: fmtSel.value }]);
    } }, "Add"), err)));
  b.append(h("small", { class: "nota" }, modo === "local" ? "The keys stay only in this browser and only travel to their API's address. They never go into backups or moves." : "With Fer Home, the keys live on its computer (datos/config.json): node fer-casa.mjs claves."));
  return b;
}
function pintarAjustes() {
  const c = $("cajonCuerpo"), sc = c.scrollTop; c.innerHTML = "";
  const aj = ed.e.ajustes;
  const guardarAj = (cambios, extra) => Motor.ejecutar(Object.assign({ tipo: "ajustes", cambios }, extra || {})).then(pintar).catch(avisar);
  // dónde vive
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Where your building lives"),
    h("div", { class: "donde" },
      esApp() ? h("div", { class: "aqui" }, h("b", {}, "In this app"), h("br"), h("span", { class: "nota" }, "On your computer, with no Terminal. The agents work while the app is open, with hands: their Chrome, their folder and their skills."), casaInfo.datos ? h("br") : null, casaInfo.datos ? h("small", { class: "nota" }, tr("Your data:") + " ", crudo(casaInfo.datos)) : null) : null,
      h("div", { class: modo === "local" ? "aqui" : "" }, h("b", {}, "In this browser"), h("br"), h("span", { class: "nota" }, "Works right away, nothing to install. The agents work while this website is open on some device.")),
      h("div", { class: modo === "casa" && !esApp() ? "aqui" : "" }, h("b", {}, "Fer Home: a computer or phone that stays on"), h("br"), h("span", { class: "nota" }, "The fer-casa.mjs program runs this same building around the clock and gives the agents hands (their Chrome, their folder, their skills). You open the website from the address it gives you.")),
      h("div", {}, h("b", {}, "Fer Home in the cloud"), h("br"), h("span", { class: "nota" }, "The same program on a rented server. It works even when everything at home is off."))),
    h("small", { class: "nota" }, "How to install Fer Home: the README in the ZIP and the “Fer Agent · The Building” document.")));
  // acceso: tu clave y tu dinero
  if (modo === "local") {
    const k = h("input", { type: "password", autocomplete: "off", placeholder: "sk-or-...", value: store.get(K.clave) ? "••••••••••" : "" });
    k.onfocus = () => { if (k.value.startsWith("•")) k.value = ""; };
    c.append(h("div", { class: "bloque" }, h("h4", {}, "Your OpenRouter key"),
      h("div", { class: "fila-c" }, k, h("button", { class: "btn primario mini", onclick: () => { if (!k.value.startsWith("•")) store.set(K.clave, k.value.trim()); k.value = store.get(K.clave) ? "••••••••••" : ""; pintar(); pintarChat(true); cerrarCajon(); } }, "Save")),
      h("p", { class: "nota", style: { margin: 0 } }, "Where it is and where it goes: it's stored only in this browser, on this device. It doesn't go through any Fer Agent server: when an agent thinks, speaks or listens, this browser sends it straight to OpenRouter, and to nobody else. Anyone using this same browser could use it."),
      h("small", { class: "nota" }, "Safety net: put a spending limit on the key on the OpenRouter website."),
      comoSacarClave()));
  } else if (esApp()) {
    // en la aplicación: la clave se pega aquí y se guarda en este ordenador; y se entra una vez en tus webs con el Chrome de los agentes
    const k = h("input", { type: "password", autocomplete: "off", placeholder: "sk-or-...", value: casaInfo.clave ? "••••••••••" : "" });
    k.onfocus = () => { if (k.value.startsWith("•")) k.value = ""; };
    c.append(h("div", { class: "bloque" }, h("h4", {}, "Your OpenRouter key"),
      h("div", { class: "fila-c" }, k, h("button", { class: "btn primario mini", onclick: async () => {
        if (!k.value.trim() || k.value.startsWith("•")) return;
        try { await llamarApp("/api/conf/clave", { prov: "openrouter", clave: k.value.trim() }); await refrescarCasa(); avisoFlotante("Key saved on this computer."); pintar(); pintarChat(true); cerrarCajon(); } catch (e) { avisar(e); }
      } }, "Save")),
      h("p", { class: "nota", style: { margin: 0 } }, "Where it is and where it goes: it's stored only on this computer, in the app's data folder. It only travels to OpenRouter when an agent thinks, speaks or listens."),
      h("small", { class: "nota" }, "Safety net: put a spending limit on the key on the OpenRouter website."),
      comoSacarClave()));
    const u = h("input", { type: "url", placeholder: "https://mail.google.com" });
    c.append(h("div", { class: "bloque" }, h("h4", {}, "Your websites, in the agents' Chrome"),
      h("p", { class: "nota", style: { margin: 0 } }, "For an agent to use a website with your account (your email, a social network…), sign in once yourself: the agents' Chrome opens, you sign in and close that window. The session stays on this computer."),
      h("div", { class: "fila-c" }, u, h("button", { class: "btn mini", onclick: async () => {
        try { await llamarApp("/api/conf/entrar", { url: u.value.trim() }); avisoFlotante("The agents' Chrome is open. Sign in with your account and, when you're done, close that window."); } catch (e) { avisar(e); }
      } }, "Open")),
      h("small", { class: "nota" }, "It needs Google Chrome installed on this computer.")));
  } else {
    const p = h("input", { type: "password", placeholder: "Fer Home PIN", value: pin });
    c.append(h("div", { class: "bloque" }, h("h4", {}, "Fer Home PIN"),
      h("div", { class: "fila-c" }, p, h("button", { class: "btn primario mini", onclick: async () => { pin = p.value.trim(); pinRechazado = false; store.set(K.pin, pin); await refrescarCasa(); pintarChat(true); if (!pinRechazado) cerrarCajon(); else pintarAjustes(); } }, "Enter")),
      pinRechazado ? h("small", { class: "nota", style: { color: "var(--peligro)" } }, "That PIN isn't right (or there were too many attempts: wait a minute).") : null,
      h("small", { class: "nota" }, "The keys live in Fer Home (datos/config.json), not on this device. The PIN stops anyone else on your network using your credit.")));
  }
  c.append(bloqueOtrasApi());
  // nombre y objetivos del edificio
  const nom = h("input", { value: ed.e.nombre || "" });
  nom.onchange = () => guardarAj({}, { nombre: nom.value.trim() || "My building" });
  const obj = h("textarea", { rows: "5", placeholder: "For example:\nHelp my shop sell more online\nSave me two hours a day of email and paperwork\n…" }); obj.value = ed.e.objetivos || "";
  const cuenta = h("span", { class: "contador" });
  const contar = () => {
    const lineas = obj.value.split("\n").filter((l) => l.trim()).length, letras = obj.value.trim().length;
    cuenta.textContent = tr(`${lineas}/${MAX_LINEAS_OBJETIVOS} lines · ${letras} letters · about ${Math.ceil(letras / 3.5)} tokens in every heartbeat of every agent`);
    cuenta.classList.toggle("mal", lineas > MAX_LINEAS_OBJETIVOS);
  };
  obj.oninput = contar; contar();
  obj.onchange = () => Motor.ejecutar({ tipo: "objetivos", texto: obj.value }).then((r) => { obj.value = r.objetivos; contar(); pintar(); }).catch(avisar);
  c.append(h("div", { class: "bloque" }, campo("Building name", nom),
    campo("Building objectives (yours or your company's)", obj, "Five lines at most. Every agent reads them when it wakes up, together with its own and its role's lessons. Keep it short: every letter is paid for in every heartbeat."), cuenta));
  // el cerebro: biblioteca y memoria larga en una carpeta
  c.append(bloqueCerebro());
  // modelos por defecto del edificio (cada agente puede elegir el suyo en su ficha → Capacidades)
  const selVista = selectorModelo("texto", aj.modeloVista, { vacio: "None", filtro: (m) => datosModelo(m).ve, alCambiar: (v) => guardarAj({ modeloVista: v }) });
  const selImg = selectorModelo("imagen", aj.modeloImagen, { vacio: "None", alCambiar: (v) => guardarAj({ modeloImagen: v }) });
  const selMus = selectorModelo("musica", aj.modeloMusica, { vacio: "None", alCambiar: (v) => guardarAj({ modeloMusica: v }) });
  const conMusica = ed.e.agentes.filter((a) => a.capacidades.includes("crear_musica")).map((a) => a.nombre);
  const selVoz = selectorModelo("voz", aj.modeloVoz || BROWSER, { extra: [[BROWSER, "Browser voice · free"]] });
  const selVc = h("select", { onchange: (ev) => guardarAj({ vozConcreta: ev.target.value }) });
  const llenarVc = () => {
    selVc.innerHTML = "";
    const lista = selVoz.value === BROWSER ? [{ id: "", name: "Automatic (the website's language)" }, ...vocesNavegador().map((v) => ({ id: v.voiceURI, name: `${v.name} · ${v.lang}` }))]
      : ((voces.find((m) => m.id === selVoz.value) || {}).voices || []);
    for (const v of (lista.length ? lista : [{ id: "", name: "The default model's" }])) selVc.append(h("option", { value: v.id }, v.name));
    selVc.value = [...selVc.options].some((o) => o.value === aj.vozConcreta) ? aj.vozConcreta : selVc.options[0].value;
  };
  llenarVc();
  selVoz.onchange = () => { llenarVc(); guardarAj({ modeloVoz: selVoz.value, vozConcreta: selVc.value }); };
  const selOido = selectorModelo("oido", aj.modeloOido || BROWSER, { extra: [[BROWSER, "Browser hearing · free (Chrome, Edge, Safari)"]], alCambiar: (v) => guardarAj({ modeloOido: v }) });
  const chk = h("input", { type: "checkbox", checked: aj.responderEnVozSiMicro !== false, onchange: (ev) => guardarAj({ responderEnVozSiMicro: ev.target.checked }) });
  const chkCorta = h("input", { type: "checkbox", checked: aj.vozCorta !== false, onchange: (ev) => guardarAj({ vozCorta: ev.target.checked }) });
  const chkCortar = h("input", { type: "checkbox", checked: aj.cortarAlHablar !== false, onchange: (ev) => guardarAj({ cortarAlHablar: ev.target.checked }) });
  const selLec = selectorModelo("texto", aj.modeloLecciones, { vacio: `The cheapest that will do (${nombreModelo(elegirModelo("economico", ed.modelos)) || "none"})`, alCambiar: (v) => guardarAj({ modeloLecciones: v }) });
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Building's default models"),
    h("p", { class: "nota", style: { margin: 0 } }, "Used by every agent that doesn't have its own. Each one picks its own in its profile → Capabilities."),
    campo("See: brain with vision", selVista, "Describes images to the agents whose brain can't see."),
    campo("Create images", selImg), campo("Create music", selMus, tr("Where it's turned on: in each agent's profile → Capabilities → “Create music”.") + " " + (conMusica.length ? tr("These have it now:") + " " + conMusica.join(", ") + "." : tr("No agent has it now."))),
    campo("Speak: voice model", selVoz), campo("The boss's voice", selVc, "The other agents, if they don't choose their own, each get a different voice from that model."),
    campo("Hear: your voice to text", selOido),
    h("label", { class: "cap" }, chk, h("span", {}, "If you talk to it through the mic, it answers out loud even if the speaker is off")),
    h("label", { class: "cap" }, chkCorta, h("span", {}, "Short answers when you talk by voice", h("small", {}, "One to three sentences; if you want more, ask for the details."))),
    h("label", { class: "cap" }, chkCortar, h("span", {}, "Stops talking when you speak", h("small", {}, "The mic stays open while it talks. With very loud speakers, if it cuts itself off, use headphones or turn this off."))),
    campo("Model that turns coins into lessons", selLec, "A cheap one: it writes the rule and you approve it in the inbox.")));
  // modelos recomendados: arriba de cada selector. Arturito propone los nuevos; tú decides.
  const pendModelos = (ed.e.propuestasModelos || []).filter((x) => x.estado === "pendiente");
  const resumenRec = h("div", { class: "lista" }, Object.keys(TIPOS_MODELO).filter((t) => t !== "otros").map((t) => {
    const rec = ((aj.recomendados || {})[t]) || {};
    const lineas = NIVELES.filter((n) => (rec[n] || []).length).map((n) => h("div", {}, h("b", {}, tr(NOMBRE_NIVEL[n]) + ": "), rec[n].map(nombreModelo).join(", ")));
    return lineas.length ? h("div", { class: "item" }, h("div", { class: "cab" }, h("span", {}, tr(TIPOS_MODELO[t]))), lineas) : null;
  }).filter(Boolean));
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Recommended models"),
    h("p", { class: "nota", style: { margin: 0 } }, "Every selector first shows the recommended ones by PRICE level (free, cheap, mid, high and cutting-edge), not by quality: each level has the newest version from each maker. Below, all of OpenRouter's, sorted by what they do according to their data. When a new model comes out, Artie proposes it; nothing changes without your yes."),
    pendModelos.length ? Object.keys(TIPOS_MODELO).map((t) => propuestasDe(t)).flat() : h("p", { class: "nota", style: { margin: 0 } }, "Artie has no pending proposals."),
    h("details", {}, h("summary", {}, "See the current recommended ones"), resumenRec),
    h("div", {}, h("button", { class: "btn mini", onclick: (ev) => confirmar(ev.target, "Go back to the original ones? Press again", () => Motor.ejecutar({ tipo: "recomendados.restablecer" }).then(() => { pintar(); pintarAjustes(); }).catch(avisar)) }, "Go back to the original recommended ones"))));
  // lecciones y vista
  const nLec = h("input", { type: "number", min: "1", max: "50", step: "1", value: aj.leccionesPorPapel || 5, onchange: (ev) => guardarAj({ leccionesPorPapel: Math.max(1, Math.min(50, parseInt(ev.target.value, 10) || 5)) }) });
  const selVistaEd = h("select", { onchange: (ev) => guardarAj({ vistaEdificio: ev.target.value }) }, [["auto", `Automatic: strips from ${AUTO_AGENTES + 1} agents or ${AUTO_PISOS + 1} floors`], ["dibujo", "Always the drawing"], ["franjas", "Always in strips"]].map(([v, t]) => h("option", { value: v }, t)));
  selVistaEd.value = aj.vistaEdificio || "auto";
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Coins, lessons and view"),
    campo("Lessons kept per role", nLec, "When a new one comes in, the oldest goes. The ones you pin in the profile never go."),
    campo("How the building is shown", selVistaEd)));
  if (Object.keys(IDIOMAS).length > 1) {
    const selIdioma = h("select", { onchange: (ev) => cambiarIdioma(ev.target.value) }, Object.entries(IDIOMAS).map(([k, t]) => h("option", { value: k }, t)));
    selIdioma.value = idioma;
    c.append(h("label", { class: "bloque campo" }, h("span", {}, "Language (the website and what the agents are told)"), selIdioma));
  }
  // los agentes de serie que renombraste, otra vez con su nombre oficial (en el idioma del edificio)
  c.append(h("div", { class: "bloque" },
    h("button", { class: "btn mini", onclick: () => Motor.ejecutar({ tipo: "nombresDeSerie" }).then((r) => { pintar(); pintarAjustes(); avisoFlotante(r && r.cambiados ? tr(`Built-in names restored: ${r.cambiados}.`) : tr("They already have their built-in names.")); }).catch(avisar) }, "Restore the built-in names"),
    h("small", { class: "nota" }, "The built-in agents get back their official name in this language. The ones you created don't change.")));
  // copias, mudanza y empezar de nuevo
  const plantilla = (nombre, txt) => h("button", { class: "btn mini", onclick: (ev) => confirmar(ev.target, "Sure? The current building will be deleted", () => Motor.ejecutar({ tipo: "plantilla", nombre }).then(() => { seleccion = "jefe"; plantaAbierta = ""; pintar(); pintarChat(true); cerrarCajon(); }).catch(avisar)) }, txt);
  const fi = h("input", { type: "file", accept: "application/json,.json", hidden: true, onchange: async (ev) => { const f = ev.target.files[0]; if (!f) return; try { const r = await cargarCopia(await f.text()); pintar(); pintarChat(true); cerrarCajon(); avisoFlotante(r.mudanza ? "Move received: agents, settings, images and music. Paste your keys again in Settings (they don't travel in the file)." : (r.medios ? tr(`Backup loaded with ${r.medios} images and music tracks.`) : tr("Backup loaded."))); } catch (err) { avisar(err); } } });
  const t = ultimaCopia();
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Backups and moving"),
    h("p", { class: "nota", style: { margin: 0 } }, `Last backup: ${t ? new Date(t).toLocaleString(LOCALE) + " (" + haceCuanto(t) + ")" : "none yet"}. The backup includes agents, memories, settings, spending, images and music. It doesn't include your keys.`),
    h("div", { class: "fila-c" }, h("button", { class: "btn mini primario", onclick: () => guardarCopia({ conMedios: true }).then(() => pintarAjustes()).catch(avisar) }, "Save a backup now"), h("button", { class: "btn mini", onclick: () => fi.click() }, "Load a backup or a move"), fi),
    h("p", { class: "nota", style: { margin: 0 } }, "Moving (when the website moves to your own domain): here press “Prepare the move”; on the new website, “Load a backup or a move” with that file. Agents, settings, images and music go across; you paste the keys again. If you use Google Drive, add the new address in Google Cloud (step 6 of connecting Drive)."),
    h("div", { class: "fila-c" }, h("button", { class: "btn mini", onclick: () => guardarCopia({ conMedios: true, mudanza: true }).catch(avisar) }, "Prepare the move")),
    modo === "local" && store.get(K.v4) ? h("div", { class: "fila-c" }, h("span", { class: "nota" }, "Your version 4 building, exactly as it was."), h("button", { class: "btn mini", onclick: () => descargar(store.get(K.v4), "fer-edificio-version-4.json") }, "Download it")) : null,
    copiaTecno() ? h("div", { class: "fila-c" }, h("span", { class: "nota" }, `Techie's last backup: ${copiaTecno().dia}.`), h("button", { class: "btn mini", onclick: () => descargar(copiaTecno().json, `fer-edificio-copia-${copiaTecno().dia}.json`) }, "Download the copy")) : null));
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Start again"),
    h("p", { class: "nota", style: { margin: 0 } }, "Built-in agents: the ones that come with Fer Agent (the sages, Techie, Artie, the Creator, JEV, the Controller and Memory). They're installed and removed from their page."),
    h("div", { class: "fila-c" }, h("button", { class: "btn mini", onclick: () => { cerrarCajon(); abrirPantalla("serie"); } }, "Open “Built-in agents”")),
    ultimoAjuste ? h("p", { class: "nota", style: { margin: 0 } }, ultimoAjuste) : null,
    h("p", { class: "nota", style: { margin: 0 } }, "Start from scratch: “Just the boss” or “With the recommended team” (dome, tech floor and lobby with their agents). Settings and spending are kept."),
    h("div", { class: "fila-c" }, plantilla("vacio", "Just the boss"), plantilla("basico", "With the recommended team"))));
  c.append(h("p", { class: "nota" }, `Fer Agent Building · version ${VERSION} · open source · prices and models come live from OpenRouter.`));
  c.scrollTop = sc;
}
// El cerebro en Ajustes: dónde vive, cómo conectarlo y qué ve la web
function bloqueCerebro() {
  const st = cerebro.estado, caja = h("div", { class: "bloque" }, h("h4", {}, "Brain: Library and Long-term memory"));
  if (esApp()) {
    const cc = Object.assign({ n: carpetasCerebro(ed.e) }, casaInfo.carpeta || {});
    caja.append(h("p", { class: "nota", style: { margin: 0 } }, `In the app, the brain lives in a folder on this computer: “${cc.n.biblioteca}” (your notes), “${cc.n.memoria}” (one note per topic) and “${cc.n.copia}”. If you choose a folder inside Google Drive for desktop, you also have it in Drive and in Obsidian.`),
      h("div", { class: "estado-carpeta" }, h("i", { class: "punto " + (cc.ruta ? "ok" : "") }), h("span", {}, tr("Folder:") + " ", crudo(cc.ruta || "")),
        cc.notas !== undefined ? h("span", { class: "nota" }, " · " + tr(`${cc.notas} topics`) + " · " + tr(`${cc.biblioteca || 0} notes in the Library`)) : null),
      window.ferApp && window.ferApp.elegirCarpeta ? h("button", { class: "btn mini", type: "button", onclick: async () => {
        try {
          const ruta = await window.ferApp.elegirCarpeta(); if (!ruta) return;
          await llamarApp("/api/conf/carpeta", { ruta });
          avisoFlotante("Folder saved. The app reopens to use it.");
          setTimeout(() => window.ferApp.reiniciar(), 1500);
        } catch (e) { avisar(e); }
      } }, "Change the folder") : null);
    return caja;
  }
  if (modo === "casa") {
    const cc = Object.assign({ n: carpetasCerebro(ed.e) }, casaInfo.carpeta || {});
    caja.append(h("p", { class: "nota", style: { margin: 0 } }, `With Fer Home, the brain lives in a folder on that computer: “${cc.n.biblioteca}” (your notes), “${cc.n.memoria}” (one note per topic) and “${cc.n.copia}”. If that folder is inside Google Drive for desktop, you also have it in Drive and in Obsidian.`),
      h("div", { class: "estado-carpeta" }, h("i", { class: "punto " + (cc.ruta ? "ok" : "") }), h("span", {}, cc.ruta ? `Folder: ${cc.ruta}` : "Folder: Fer Home's data folder (datos/cerebro)"),
        cc.notas !== undefined ? h("span", { class: "nota" }, `· ${cc.notas} topics · ${cc.biblioteca || 0} notes in the Library`) : null),
      h("small", { class: "nota" }, "To change it: on the Fer Home computer, node fer-casa.mjs carpeta"));
    return caja;
  }
  const conf = store.json(K.carpeta, null) || {};
  caja.append(h("div", { class: "estado-carpeta" }, h("i", { class: "punto " + (st.conectado ? "ok" : st.error ? "mal" : "") }),
    h("span", {}, st.conectado ? tr("Connected:") + " " + st.nombre : st.error ? `${st.nombre || tr("Folder")}: ${st.error}` : "No folder: the brain lives only in this browser."),
    st.conectado ? h("span", { class: "nota" }, "· " + tr(`${st.notas} topics in the long-term memory`) + " · " + tr(`${st.biblioteca} notes in the Library`) + (st.ultimaSync ? " · " + tr(`synced ${haceCuanto(st.ultimaSync)}`) : "")) : null));
  if (st.necesitaPermiso && cerebro.estado.tipo === "local") caja.append(h("div", {}, h("button", { class: "btn mini primario", onclick: async () => { const hnd = await idb.get("kv", "carpetaLocal"); if (hnd) conectarCerebro(adaptadorLocal(hnd), true).catch(avisar); } }, "Give permission to the folder again")));
  // Google Drive
  const cid = h("input", { placeholder: "Google client ID (ends in .apps.googleusercontent.com)", value: conf.clientId || "" });
  const conectarDrive = h("button", { class: "btn mini primario", type: "button", onclick: async () => {
    const id = cid.value.trim();
    if (!/\.apps\.googleusercontent\.com$/.test(id)) { avisar(Object.assign(new Error("That doesn't look like a Google client ID (it must end in .apps.googleusercontent.com). Check the steps."), { mostrado: true })); return; }
    store.set(K.carpeta, JSON.stringify({ tipo: "drive", clientId: id }));
    conectarDrive.disabled = true;
    try { await conectarCerebro(adaptadorDrive(id), true); avisoFlotante("Drive connected: the website only sees its “Fer Agent” folder."); } catch (err) { avisar(Object.assign(new Error(`Couldn't connect Drive: ${err.message}`), { mostrado: true })); }
    conectarDrive.disabled = false;
  } }, st.conectado && st.tipo === "drive" ? "Connect again" : "Connect Google Drive");
  caja.append(h("div", { class: "campo" }, h("span", {}, "Google Drive (recommended: phone and computer see the same building)"), cid, h("div", {}, conectarDrive)),
    h("details", {}, h("summary", {}, "Steps to connect Drive (once, about 10 minutes)"), h("ol", { class: "nota pasos-drive" },
      h("li", {}, "Go to console.cloud.google.com with your Google account and create a project (at the top: “Select a project” → “New project”). Name: Fer Agent."),
      h("li", {}, "Menu → “APIs & Services” → “Library” → search for “Google Drive API” → “Enable”."),
      h("li", {}, "“APIs & Services” → “OAuth consent screen” (or “Google Auth Platform”): type “External”, app name Fer Agent, your support and contact email. Save."),
      h("li", {}, "Under “Audience” (or “Test users”), add your Google email as a test user. Leave the app “in testing”: there's no need to publish it."),
      h("li", {}, "Under “Data access” (or “Scopes”), add the …/auth/drive.file scope. It's the one that only lets the website see the files it creates itself."),
      h("li", {}, tr("“Credentials” (or “Clients”) → “Create credentials” → “OAuth client ID” → type “Web application”. Under “Authorised JavaScript origins” put") + " " + location.origin + " " + tr("(and, when you move, the new address too). There's no need to put anything under “Redirect URIs”.")),
      h("li", {}, "Copy the “Client ID” (it ends in .apps.googleusercontent.com), paste it above and press “Connect Google Drive”. Choose your account and grant permission. If Google warns that the app isn't verified, that's because it's yours and in testing: press “Continue”."),
      h("li", {}, "Repeat step 7 on your phone (same ID). The website will create the “Fer Agent” folder in your Drive. Don't create it by hand."))));
  // carpeta de este ordenador
  if (window.showDirectoryPicker) caja.append(h("div", { class: "campo" }, h("span", {}, "Or a folder on this computer (Chrome or Edge)"),
    h("div", {}, h("button", { class: "btn mini", type: "button", onclick: async () => {
      let hnd; try { hnd = await window.showDirectoryPicker({ mode: "readwrite", id: "fer-agent-cerebro" }); } catch { return; }
      await idb.put("kv", "carpetaLocal", hnd); store.set(K.carpeta, JSON.stringify({ tipo: "local" }));
      try { await conectarCerebro(adaptadorLocal(hnd), true); avisoFlotante("Folder connected."); } catch (err) { avisar(err); }
    } }, st.conectado && st.tipo === "local" ? "Choose another folder" : "Choose folder")),
    h("small", { class: "nota" }, "For people who don't use Drive. Careful: what another device saves to Drive through the website won't be seen by this folder, or the other way round; use just one way on all your devices.")));
  const fb = h("input", { type: "file", multiple: true, accept: ".md,.txt,text/markdown,text/plain", hidden: true, onchange: async (ev) => { try { const n = await subirBiblioteca([...ev.target.files]); avisoFlotante(n === 1 ? tr("1 note added to the Library.") : tr(`${n} notes added to the Library.`)); pintarAjustes(); } catch (err) { avisar(err); } ev.target.value = ""; } });
  caja.append(h("div", { class: "fila-c" },
    st.conectado ? h("button", { class: "btn mini", onclick: () => sincronizarCerebro().then(() => avisoFlotante("Synced.")) }, "Sync now") : null,
    h("button", { class: "btn mini", onclick: () => fb.click() }, "Add notes to the Library"), fb,
    st.conectado || conf.tipo ? h("button", { class: "btn mini", onclick: (ev) => confirmar(ev.target, "Disconnect? Press again", () => { clearInterval(cerebro.temporizador); cerebro.ad = null; Object.assign(cerebro.estado, { conectado: false, error: "", nombre: "" }); try { localStorage.removeItem(K.carpeta); } catch {} cargarBibliotecaLocal(); pintarAjustes(); }) }, "Disconnect") : null),
    h("small", { class: "nota" }, "What the website sees: with Drive, only the files it creates itself in “Fer Agent” (drive.file permission); nothing else in your Drive. Whatever you correct in Obsidian in those notes, it reads again. A NEW note you write by hand in Obsidian isn't seen, because the website didn't create it: upload it with “Add notes to the Library” (it stays inside its folder and you edit it from there). For it to see any new note it would need permission to read your whole Drive, which Google treats as restricted and which would let it see everything, not just its folder: that's why it isn't requested."));
  return caja;
}
let ultimoAjuste = "";
function descargar(texto, nombre) {
  const blob = new Blob([texto], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: nombre });
  document.body.append(a); a.click(); a.remove();
}
function exportar() { descargar(JSON.stringify(ed.e, null, 1), `fer-edificio-${new Date().toLocaleDateString("sv-SE")}.json`); }
const copiaTecno = () => (modo === "local" ? store.json(K.copia, null) : null);

// =====================================================================
// El cerebro en una carpeta: Google Drive, una carpeta de este ordenador (Chrome) o la de Fer Casa.
// Dentro: «Biblioteca» (tus notas), «Memoria larga» (una nota por tema, la escribe Memory) y «edificio.json» (la copia del edificio).
// La web solo ve su carpeta. Las notas son de Obsidian (.md): las puedes abrir y corregir; la web lee lo que cambies.
// =====================================================================
const cerebro = { ad: null, ocupado: false, cambios: 0, escritos: new Map(), vistos: new Map(), vistoEdificio: 0, miEdificio: 0, temporizador: null,
  estado: { conectado: false, tipo: "", nombre: "", ultimaSync: 0, ultimaCopia: 0, error: "", notas: 0, biblioteca: 0, necesitaPermiso: false } };
const CARPETA_GOOGLE = "application/vnd.google-apps.folder";
function adaptadorDrive(clientId) {
  let token = null, caduca = 0, raiz = null;
  const ids = new Map();
  const D = "https://www.googleapis.com/drive/v3/files", U = "https://www.googleapis.com/upload/drive/v3/files";
  async function pedirToken(interactivo) {
    if (!(window.google && google.accounts && google.accounts.oauth2)) await cargarScript("https://accounts.google.com/gsi/client");
    const r = await new Promise((res, rej) => {
      const tc = google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: "https://www.googleapis.com/auth/drive.file",
        callback: (x) => (x && x.error ? rej(new Error(x.error_description || x.error)) : res(x)),
        error_callback: (e) => rej(new Error((e && (e.message || e.type)) || "Google didn't grant permission")) });
      tc.requestAccessToken({ prompt: interactivo ? "consent" : "" });
    });
    token = r.access_token; caduca = Date.now() + ((Number(r.expires_in) || 3600) - 120) * 1000;
  }
  async function api(url, init = {}, otra = true) {
    if (!token || Date.now() > caduca) await pedirToken(false);
    const r = await fetch(url, Object.assign({}, init, { headers: Object.assign({ Authorization: "Bearer " + token }, init.headers || {}) }));
    if (r.status === 401 && otra) { token = null; return api(url, init, false); }
    if (!r.ok) { let det = ""; try { det = ((await r.json()).error || {}).message || ""; } catch {} throw new Error(`Google Drive replied ${r.status}${det ? ": " + det : ""}`); }
    return r;
  }
  const comillas = (t) => String(t).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  async function buscar(nombre, padre, carpeta) {
    const q = `name = '${comillas(nombre)}' and '${padre}' in parents and trashed = false` + (carpeta ? ` and mimeType = '${CARPETA_GOOGLE}'` : ` and mimeType != '${CARPETA_GOOGLE}'`);
    const d = await (await api(`${D}?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)&pageSize=10`)).json();
    return ((d.files || [])[0] || {}).id || "";
  }
  async function carpeta(nombre, padre) {
    let id = await buscar(nombre, padre, true);
    if (!id) id = (await (await api(D + "?fields=id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nombre, mimeType: CARPETA_GOOGLE, parents: [padre] }) })).json()).id;
    return id;
  }
  async function idCarpeta(ruta) {
    if (!raiz) { raiz = await carpeta("Fer Agent", "root"); ids.set("", raiz); }
    let padre = raiz, acum = "";
    for (const parte of String(ruta).split("/").filter(Boolean)) { acum = acum ? acum + "/" + parte : parte; if (!ids.has(acum)) ids.set(acum, await carpeta(parte, padre)); padre = ids.get(acum); }
    return padre;
  }
  return {
    tipo: "drive", nombre: "Google Drive · “Fer Agent” folder",
    async conectar(interactivo) { await pedirToken(interactivo); const n = carpetasCerebro(ed.e); await idCarpeta(n.biblioteca); await idCarpeta(n.memoria); },
    async listar(sub, recursivo) {
      const out = [];
      const recorrer = async (ruta, id, nivel) => {
        let pt = "";
        do {
          const d = await (await api(`${D}?q=${encodeURIComponent(`'${id}' in parents and trashed = false`)}&fields=nextPageToken,files(id,name,mimeType,modifiedTime)&pageSize=1000${pt ? "&pageToken=" + pt : ""}`)).json();
          for (const f of d.files || []) {
            const rr = ruta ? ruta + "/" + f.name : f.name;
            ids.set(rr, f.id);
            if (f.mimeType === CARPETA_GOOGLE) { if (recursivo && nivel < 4) await recorrer(rr, f.id, nivel + 1); }
            else out.push({ ruta: rr, id: f.id, modificado: Date.parse(f.modifiedTime) || 0 });
          }
          pt = d.nextPageToken || "";
        } while (pt);
      };
      await recorrer(sub, await idCarpeta(sub), 0);
      return out;
    },
    async leer(x) { return await (await api(`${D}/${x.id}?alt=media`)).text(); },
    async escribir(ruta, texto, tipo = "text/markdown") {
      const partes = String(ruta).split("/"), nombre = partes.pop(), padre = await idCarpeta(partes.join("/"));
      let id = ids.get(ruta) || await buscar(nombre, padre, false);
      if (id) await api(`${U}/${id}?uploadType=media`, { method: "PATCH", headers: { "Content-Type": tipo + "; charset=UTF-8" }, body: texto });
      else {
        const b = "fer" + Math.random().toString(36).slice(2);
        const cuerpo = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: nombre, parents: [padre], mimeType: tipo })}\r\n--${b}\r\nContent-Type: ${tipo}; charset=UTF-8\r\n\r\n${texto}\r\n--${b}--`;
        id = (await (await api(`${U}?uploadType=multipart&fields=id`, { method: "POST", headers: { "Content-Type": "multipart/related; boundary=" + b }, body: cuerpo })).json()).id;
        ids.set(ruta, id);
      }
    }
  };
}
function adaptadorLocal(handle) {
  async function dir(ruta, crear) { let d = handle; for (const p of String(ruta).split("/").filter(Boolean)) d = await d.getDirectoryHandle(p, { create: crear }); return d; }
  return {
    tipo: "local", nombre: `Folder on this computer “${handle.name}”`,
    async conectar(interactivo) {
      let p = await handle.queryPermission({ mode: "readwrite" });
      if (p !== "granted" && interactivo) p = await handle.requestPermission({ mode: "readwrite" });
      if (p !== "granted") throw Object.assign(new Error("Chrome needs you to grant permission to the folder again (Settings → Brain)."), { permiso: true });
      const n = carpetasCerebro(ed.e); await dir(n.biblioteca, true); await dir(n.memoria, true);
    },
    async listar(sub, recursivo) {
      const out = [];
      const rec = async (ruta, d, nivel) => {
        for await (const [nombre, hh] of d.entries()) {
          const rr = ruta ? ruta + "/" + nombre : nombre;
          if (hh.kind === "directory") { if (recursivo && nivel < 4 && !nombre.startsWith(".")) await rec(rr, hh, nivel + 1); }
          else { const f = await hh.getFile(); out.push({ ruta: rr, h: hh, modificado: f.lastModified }); }
        }
      };
      await rec(sub, await dir(sub, true), 0);
      return out;
    },
    async leer(x) { return await (await x.h.getFile()).text(); },
    async escribir(ruta, texto) {
      const partes = String(ruta).split("/"), nombre = partes.pop();
      const fh = await (await dir(partes.join("/"), true)).getFileHandle(nombre, { create: true });
      const w = await fh.createWritable(); await w.write(texto); await w.close();
    }
  };
}
const nombresAgentes = () => Object.fromEntries(ed.e.agentes.map((a) => [a.id, a.nombre]));
async function conectarCerebro(ad, interactivo) {
  try {
    await ad.conectar(interactivo);
    if (cerebro.ad !== ad) { cerebro.escritos.clear(); cerebro.vistos.clear(); cerebro.miEdificio = 0; cerebro.vistoEdificio = 0; cerebro.conflicto = null; cerebro.estado.ultimaSync = 0; clearInterval(cerebro.temporizador); }   // otra carpeta: se empieza de cero
    cerebro.ad = ad;
    Object.assign(cerebro.estado, { conectado: true, tipo: ad.tipo, nombre: ad.nombre, error: "", necesitaPermiso: false });
    const guardado = (await idb.get("kv", "cerebroSync")) || {};
    if (guardado.tipo === ad.tipo) { cerebro.estado.ultimaSync = guardado.ultimaSync || 0; cerebro.miEdificio = guardado.miEdificio || 0; cerebro.vistoEdificio = guardado.vistoEdificio || 0; }
    await sincronizarCerebro();
    clearInterval(cerebro.temporizador);
    cerebro.temporizador = setInterval(() => { if (document.visibilityState === "visible") sincronizarCerebro(); }, 120e3);
  } catch (err) {
    Object.assign(cerebro.estado, { conectado: false, error: err.message, necesitaPermiso: !!err.permiso, tipo: ad.tipo, nombre: ad.nombre });
    if (interactivo) throw err;
  } finally { pintar(); if (cajonTipo === "ajustes") pintarAjustes(); }
}
let esperaCerebro = null, cuandoCerebro = 0;
function cerebroCambio(tipo) {   // el motor avisó: algo cambió → se escribe en la carpeta un poco después (todo junto)
  if (tipo === "estado") cerebro.cambios++;
  if (!cerebro.ad) return;
  const cuando = Date.now() + (tipo === "memoria" ? 4000 : 30000);
  if (esperaCerebro && cuandoCerebro <= cuando) return;   // ya hay una escritura antes: esa lo lleva todo
  clearTimeout(esperaCerebro); cuandoCerebro = cuando;
  esperaCerebro = setTimeout(() => { esperaCerebro = null; sincronizarCerebro({ soloEscribir: true }); }, cuando - Date.now());
}
async function sincronizarCerebro(op = {}) {
  const ad = cerebro.ad;
  if (!ad || !ed || !ed.e) return;
  if (cerebro.ocupado) { cerebro.otraVez = true; return; }   // al acabar la que está en marcha, se hace otra
  cerebro.ocupado = true;
  try {
    const desde = cerebro.estado.ultimaSync || 0, ahora = Date.now();
    // Antes de escribir nada se mira la carpeta, para no pisar lo de tu otro aparato ni lo que corregiste a mano
    if (await traerEdificio(ad)) return;   // había un edificio más nuevo de tu otro aparato: ya está cargado
    // Memoria larga: lo que corregiste a mano entra (sin perder lo apuntado aquí después de la última vez)
    const cc = carpetasCerebro(ed.e);
    for (const x of await ad.listar(cc.memoria, false)) {
      const nombre = x.ruta.split("/").pop();
      if (!/\.md$/i.test(nombre) || nombre === cc.indice + ".md") continue;
      if ((cerebro.vistos.get(x.ruta) || 0) >= x.modificado) continue;
      const texto = await ad.leer(x);
      cerebro.vistos.set(x.ruta, x.modificado);
      if (cerebro.escritos.get(x.ruta) === texto) continue;
      await Motor.ejecutar({ tipo: "memoria.importar", tema: nombre.replace(/\.md$/i, ""), texto, conservarDesde: desde });
    }
    if (!op.soloEscribir) {
      // Biblioteca: tus notas, para que Memory busque en ellas (solo lectura)
      const docs = [];
      for (const x of (await ad.listar(cc.biblioteca, true)).filter((y) => /\.(md|txt)$/i.test(y.ruta))) {
        let c = await idb.get("biblio", ad.tipo + ":" + x.ruta);
        if (!c || c.modificado < x.modificado) { c = { modificado: x.modificado, texto: (await ad.leer(x)).slice(0, 300000) }; await idb.put("biblio", ad.tipo + ":" + x.ruta, c); }
        docs.push({ ruta: x.ruta, titulo: x.ruta.split("/").pop().replace(/\.(md|txt)$/i, ""), texto: c.texto });
      }
      ed.setBiblioteca(docs);
      cerebro.estado.biblioteca = docs.length;
    }
    // lo que cambió aquí sale a la carpeta: las notas de la Memoria larga y la copia del edificio
    const notas = notasMemoriaMd(ed.e.memoriaLarga, nombresAgentes(), cc);
    for (const n of notas) {
      if (cerebro.escritos.get(n.ruta) === n.texto) continue;
      await ad.escribir(n.ruta, n.texto);
      cerebro.escritos.set(n.ruta, n.texto); cerebro.vistos.delete(n.ruta);   // la próxima vez se mira (si es lo mismo que escribimos, no se toca)
    }
    cerebro.estado.notas = notas.length - 1;
    if (!cerebro.conflicto && (cerebro.cambios || !cerebro.miEdificio)) await escribirEdificio(ad);   // con un conflicto sin decidir, no se escribe encima
    cerebro.estado.ultimaSync = ahora; cerebro.estado.error = "";
    await idb.put("kv", "cerebroSync", { tipo: ad.tipo, ultimaSync: ahora, miEdificio: cerebro.miEdificio, vistoEdificio: cerebro.vistoEdificio });
  } catch (err) {
    cerebro.estado.error = err.message;
  } finally {
    cerebro.ocupado = false; pintarCopiaTop(); if (cajonTipo === "ajustes" && !enUso($("cajonCuerpo"))) pintarAjustes();
    if (cerebro.otraVez) { cerebro.otraVez = false; setTimeout(() => sincronizarCerebro({ soloEscribir: true }), 500); }
  }
}
async function escribirEdificio(ad) {
  const ts = Date.now();
  await ad.escribir(carpetasCerebro(ed.e).copia, JSON.stringify({ tipo: "fer-agent-edificio", version: VERSION, aparato, ts, edificio: ed.e }), "application/json");
  cerebro.miEdificio = ts; cerebro.vistoEdificio = Math.max(cerebro.vistoEdificio, ts); cerebro.cambios = 0;
  cerebro.estado.ultimaCopia = ts;
}
// ¿Tu otro aparato (el móvil o el Mac) guardó el edificio después? Si aquí no has cambiado nada, se carga; si sí, eliges.
async function traerEdificio(ad) {
  const x = (await ad.listar("", false)).find((y) => y.ruta === carpetasCerebro(ed.e).copia);
  if (!x || x.modificado <= cerebro.vistoEdificio) return false;
  let d = null; try { d = JSON.parse(await ad.leer(x)); } catch { return false; }
  if (!d || d.tipo !== "fer-agent-edificio" || !d.edificio || d.aparato === aparato || (d.ts || 0) <= cerebro.miEdificio) { cerebro.vistoEdificio = x.modificado; return false; }
  // los dos aparatos han cambiado cosas: eliges tú (y hasta entonces no se marca como visto ni se escribe encima)
  if (cerebro.cambios && cerebro.miEdificio) { cerebro.conflicto = { d, modificado: x.modificado }; avisoConflicto(d); return false; }
  cerebro.vistoEdificio = x.modificado;
  await Motor.ejecutar({ tipo: "importar", estado: d.edificio });
  cerebro.miEdificio = d.ts; cerebro.cambios = 0;
  avisoFlotante(`Loaded the building your other device saved (${new Date(d.ts).toLocaleString(LOCALE)}).`);
  pintar(); if (chatId) pintarChat(true);
  return true;
}
function avisoConflicto(d) {
  if ($("conflicto")) return;
  const caja = h("div", { id: "conflicto", class: "aviso-flotante conflicto", role: "alertdialog" },
    h("b", {}, "Your other device saved changes to the building"), h("span", {}, `Its changes are from ${new Date(d.ts).toLocaleString(LOCALE)}. You've changed things here too. Which ones do you keep?`),
    h("div", { class: "fila-c" },
      h("button", { class: "btn mini primario", onclick: async () => { caja.remove(); const c = cerebro.conflicto; cerebro.conflicto = null; await Motor.ejecutar({ tipo: "importar", estado: d.edificio }).catch(avisar); cerebro.miEdificio = d.ts; cerebro.cambios = 0; if (c) cerebro.vistoEdificio = Math.max(cerebro.vistoEdificio, c.modificado); pintar(); if (chatId) pintarChat(true); } }, "Load the other device's"),
      h("button", { class: "btn mini", onclick: async () => { caja.remove(); const c = cerebro.conflicto; cerebro.conflicto = null; if (c) cerebro.vistoEdificio = Math.max(cerebro.vistoEdificio, c.modificado); if (cerebro.ad) await escribirEdificio(cerebro.ad).catch(avisar); } }, "Keep the ones here")));
  document.body.append(caja);
}
// La Biblioteca sin carpeta (solo en este navegador) o subir notas a la carpeta
async function subirBiblioteca(archivos) {
  let n = 0;
  for (const f of archivos) {
    if (!/\.(md|txt)$/i.test(f.name)) continue;
    const texto = await f.text();
    const bib = carpetasCerebro(ed.e).biblioteca;
    if (cerebro.ad) await cerebro.ad.escribir(bib + "/" + f.name, texto);
    else await idb.put("biblio", "navegador:" + bib + "/" + f.name, { modificado: Date.now(), texto: texto.slice(0, 300000) });
    n++;
  }
  if (cerebro.ad) await sincronizarCerebro(); else await cargarBibliotecaLocal();
  return n;
}
async function cargarBibliotecaLocal() {
  if (cerebro.ad) return;
  const claves = (await idb.claves("biblio")).filter((k) => String(k).startsWith("navegador:"));
  const docs = [];
  for (const k of claves) { const c = await idb.get("biblio", k); if (c) docs.push({ ruta: String(k).slice(10), titulo: String(k).split("/").pop().replace(/\.(md|txt)$/i, ""), texto: c.texto }); }
  ed.setBiblioteca(docs); cerebro.estado.biblioteca = docs.length;
}
async function arrancarCerebro() {
  const conf = store.json(K.carpeta, null);
  if (!conf || modo !== "local") { await cargarBibliotecaLocal().catch(() => {}); return; }
  if (conf.tipo === "drive" && conf.clientId) await conectarCerebro(adaptadorDrive(conf.clientId), false);
  else if (conf.tipo === "local") {
    const hnd = await idb.get("kv", "carpetaLocal");
    if (hnd) await conectarCerebro(adaptadorLocal(hnd), false);
  }
  if (!cerebro.ad) await cargarBibliotecaLocal().catch(() => {});
}

// =====================================================================
// Copias del edificio (con imágenes y música) y mudanza a otra dirección
// =====================================================================
async function paquete({ conMedios, mudanza }) {
  const e = ed.e;
  const p = { tipo: "fer-agent-copia", version: VERSION, fecha: new Date().toISOString(), aparato, edificio: e };
  if (conMedios) {
    p.medios = {};
    const usados = new Set();
    for (const m of [...e.conversacion, ...e.agentes.flatMap((a) => a.chat || [])]) for (const x of m.medios || []) usados.add(x.id);
    for (const id of usados) {
      if (modo === "local") { const x = await idb.get("medios", id); if (x) p.medios[id] = x; }
      else { const url = await urlMedio({ id }); if (url) { try { const b = await (await fetch(url)).blob(); p.medios[id] = { id, url: await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); }) }; } catch {} } }
    }
  }
  if (mudanza) { p.mudanza = true; p.preferencias = { altavoz: store.get(K.altavoz), idioma: store.get(K.idioma), carpeta: store.json(K.carpeta, null) }; }
  return p;
}
async function guardarCopia({ conMedios = true, mudanza = false } = {}) {
  const p = await paquete({ conMedios, mudanza });
  const dia = new Date().toLocaleDateString("sv-SE");
  descargar(JSON.stringify(p), mudanza ? `fer-agent-mudanza-${dia}.json` : `fer-edificio-${dia}.json`);
  store.set(K.ultimaCopia, String(Date.now()));
  if (cerebro.ad) await escribirEdificio(cerebro.ad).catch(() => {});
  pintarCopiaTop();
  avisoFlotante(mudanza ? "Move prepared: open the new website and in Settings → Moving load this file." : (Object.keys(p.medios || {}).length ? tr(`Backup saved in your downloads with ${Object.keys(p.medios).length} images and music tracks.`) : tr("Backup saved in your downloads.")));
}
async function cargarCopia(texto) {
  let d; try { d = JSON.parse(texto); } catch { throw Object.assign(new Error("That file isn't a Fer Agent backup."), { mostrado: true }); }
  const edif = d && d.tipo === "fer-agent-copia" ? d.edificio : d && d.tipo === "fer-agent-edificio" ? d.edificio : d;
  await Motor.ejecutar({ tipo: "importar", estado: edif });
  let n = 0;
  if (d && d.medios && modo === "local") for (const [id, x] of Object.entries(d.medios)) { await idb.put("medios", id, x); mediosCache.set(id, x.url); n++; }
  if (d && d.mudanza && d.preferencias) {
    const pr = d.preferencias;
    if (pr.altavoz) store.set(K.altavoz, pr.altavoz);
    if (pr.idioma) store.set(K.idioma, pr.idioma);
    if (pr.carpeta && !store.get(K.carpeta)) store.set(K.carpeta, JSON.stringify(pr.carpeta));
  }
  return { medios: n, mudanza: !!(d && d.mudanza) };
}

// =====================================================================
// Eventos
// =====================================================================
$("tabEdificio").onclick = () => verPestana("edificio");
$("cerrarPanel").onclick = () => cerrarPanel();
$("abrirActividad").onclick = () => abrirPanel("actividad");
$("abrirSerie").onclick = () => abrirPantalla("serie");
$("tabFicha").onclick = () => verPestana("ficha");
$("tabActividad").onclick = () => verPestana("actividad");
$("actTodo").onclick = () => { vistaAct = "todo"; pintarRegistro(); };
$("actJev").onclick = () => { vistaAct = "jev"; pintarRegistro(); };
$("abrirAjustes").onclick = () => abrirCajon("ajustes");
$("medidor").onclick = () => abrirCajon("gasto");
$("hablarJefe").onclick = () => { const j = ed.jefe(); if (j) abrirChat(j.id); };
$("abrirMes").onclick = () => abrirPantalla("mes");
$("abrirSalas").onclick = () => abrirSalas();
$("verDibujo").onclick = () => Motor.ejecutar({ tipo: "ajustes", cambios: { vistaEdificio: "dibujo" } }).then(pintar).catch(avisar);
$("verFranjas").onclick = () => Motor.ejecutar({ tipo: "ajustes", cambios: { vistaEdificio: "franjas" } }).then(pintar).catch(avisar);
$("crearPiso").onclick = () => abrirCajon("piso");
$("crearAgente").onclick = () => abrirCajon("agente", {});
$("cerrarCajon").onclick = volverAtras;
$("velo").onclick = volverAtras;
$("cerrarChat").onclick = volverAtras;
$("irPortada").onclick = mostrarPortada;
$("volverPortada").onclick = mostrarPortada;
$("abrirBandeja").onclick = () => abrirPantalla("bandeja");
$("pausa").onclick = () => { const p = !ed.e.ajustes.pausa; Motor.ejecutar({ tipo: "pausa", pausa: p }).then(() => { pintar(); avisoFlotante(p ? "General pause on: nothing that spends wakes up on its own." : "Automatic work running: heartbeats are working again."); }).catch(avisar); };
$("copiaRapida").onclick = () => guardarCopia({ conMedios: true }).catch(avisar);
$("pararVoz").onclick = () => pararAudio();
$("verFichaChat").onclick = () => { const a = agenteChat(); cerrarChat(); if (a) { fichaTab = "identidad"; elegir(a); } };
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || portadaVisible()) return;
  if (!$("cajon").hidden || chatId || pantalla || plantaAbierta) volverAtras();
});
$("nuevaConv").onclick = () => { pararAudio(); pendientesError = []; const a = agenteChat(); Motor.ejecutar({ tipo: "conversacion.nueva", id: a ? a.id : undefined }).then(() => pintarChat(true)); };
$("enviar").onclick = () => { desbloquearAudio(); enviar(); };
$("texto").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); desbloquearAudio(); enviar(); } });
$("texto").addEventListener("input", crecer);
$("micro").onclick = () => { desbloquearAudio(); if (conv.on) colgar(); else empezarConversacion(); };
$("altavoz").onclick = () => { const on = !altavozOn(); $("altavoz").setAttribute("aria-pressed", String(on)); store.set(K.altavoz, on ? "1" : "0"); if (on) desbloquearAudio(); else pararAudio(); };
$("marcoJefe").onclick = () => { if (estadoJefe === "speaking") pararAudio(); };
$("clip").onclick = () => $("fichero").click();
$("fichero").onchange = (ev) => {
  const f = ev.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {   // se reduce a 1280 px para que sea barato de mirar
    const img = new Image();
    img.onload = () => { const s = Math.min(1, 1280 / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); adjunto = c.toDataURL("image/jpeg", 0.85); $("adjuntoImg").src = adjunto; $("adjunto").hidden = false; };
    img.src = r.result;
  };
  r.readAsDataURL(f); ev.target.value = "";
};
$("quitarAdjunto").onclick = quitarAdjunto;
try { if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => { if (cajonTipo === "ajustes") pintarAjustes(); }; } catch {}

// =====================================================================
// Arranque
// =====================================================================
async function unaSolaPestana() {
  if (!navigator.locks) return true;
  // la primera pestaña se queda el «candado» mientras esté abierta
  const mia = await new Promise((res) => {
    navigator.locks.request("fer-edificio-pestana", { ifAvailable: true }, (l) => { res(!!l); if (l) return new Promise(() => {}); }).catch(() => res(true));
  });
  if (mia) return true;
  document.body.append(h("div", { class: "otra-pestana", role: "alertdialog", "aria-labelledby": "otraT" },
    h("div", {}, h("h2", { id: "otraT" }, "The building is already open in another tab"),
      h("p", {}, "Use it there. If you open it in two tabs at once, one can undo what the other does and some work would be paid for twice."),
      h("p", { class: "nota" }, "If you close the other one, this one opens by itself."))));
  navigator.locks.request("fer-edificio-pestana", () => { location.reload(); return new Promise(() => {}); });
  return false;
}
// Cambiar de idioma: lo elige esta persona, el edificio pasa a ese idioma y la web se vuelve a abrir
async function cambiarIdioma(id) {
  guardarIdioma(id);
  if (ed && ed.e && Array.isArray(ed.e.agentes) && ed.e.agentes.length) { try { await Motor.ejecutar({ tipo: "idioma", idioma: id }); } catch {} }
  location.reload();
}
// Al abrir: si esta persona eligió un idioma, su edificio pasa a ese; si no eligió, manda el del edificio
async function sincronizarIdioma() {
  if (!ed || !ed.e || !Array.isArray(ed.e.agentes) || !ed.e.agentes.length) return;
  let porDireccion = false; try { porDireccion = !!new URLSearchParams(location.search).get("lang"); } catch {}
  const delEdificio = ed.e.idioma || "es";
  if (porDireccion || delEdificio === idioma || !IDIOMAS[idioma]) return;
  if (idiomaGuardado()) { try { await Motor.ejecutar({ tipo: "idioma", idioma }); } catch {} return; }
  try { if (sessionStorage.getItem("ferAgent.idiomaRecarga")) return; sessionStorage.setItem("ferAgent.idiomaRecarga", "1"); } catch { return; }
  guardarIdioma(delEdificio); location.reload();
}
(async function arrancar() {
  let delEdificio = "";
  try { const t = localStorage.getItem(K.estado); if (t) delEdificio = JSON.parse(t).idioma || "es"; } catch {}
  await cargarIdioma(delEdificio);
  fijarIdioma(idioma);
  traducirPagina(document.body);
  $("version").textContent = VERSION;
  try { history.replaceState({ v: "portada", n: 0 }, ""); } catch {}
  const entrar = () => { ocultarPortada(); marcarNav(); };
  pintarLanding($("landing"), { h, entrar, figura: (aspecto, img) => { asegurarFigura(aspecto).then((u) => { img.src = u; }); }, idiomas: IDIOMAS, idioma, cambiarIdioma });
  $("altavoz").setAttribute("aria-pressed", String(store.get(K.altavoz, "0") === "1"));
  const casa = await detectarCasa();
  const listas = cargarListas();
  if (casa) {
    modo = "casa";
    ed = new Edificio({ cargar: async () => null, guardar: async () => {}, clave: () => "" });
    ed.e = null;
    await listas; ed.setModelos(modelos);
    await refrescarCasa();
    if (!ed.e) { ed.e = { nombre: "Fer Home", ajustes: { pausa: true }, plantas: [], agentes: [], memoriaLarga: [], conversacion: [], registro: [], propuestas: [], monedas: [], lecciones: [], reuniones: [], consultasJev: [], propuestasModelos: [], autorizaciones: [] }; abrirCajon("ajustes"); }
    setInterval(async () => { await refrescarCasa(); latirAntena(); }, 5000);
  } else {
    if (!(await unaSolaPestana())) return;
    ed = new Edificio({
      cargar: async () => store.get(K.estado, null),
      guardar: async (json) => {
        try { localStorage.setItem(K.estado, json); avisoLleno = false; }
        catch {
          // si no cabe, primero se sacrifica la copia de Tecno (se puede descargar otra en Ajustes) y se reintenta
          try { if (localStorage.getItem(K.copia)) { localStorage.removeItem(K.copia); localStorage.setItem(K.estado, json); avisoLleno = false; return; } } catch {}
          if (!avisoLleno) { avisoLleno = true; pendientesError.push("The building couldn't be saved: this browser's storage is full. Download a backup in Settings and delete old tasks or memories."); pintarChat(true); } }
      },
      clave: () => store.get(K.clave),
      claves: () => Object.fromEntries((ed ? ed.conexiones() : []).map((c) => [c.id, store.get(claveApi(c.id))]).filter((x) => x[1])),
      guardarMedio: async (id, url, tipo, texto) => { mediosCache.set(id, url); await idb.put("medios", id, { id, url, tipo, texto: String(texto || "").slice(0, 300), ts: Date.now() }); },
      // Tecno guarda los viernes una copia en este navegador (si cabe); también puedes descargarla en Ajustes.
      copia: async (json, dia) => {
        if (dia === "antes-de-v5") { localStorage.setItem(K.v4, json); return; }   // el edificio de la versión 4, tal cual
        const e = JSON.parse(json);   // la configuración de todos (sin conversación, registro ni memoria corta)
        delete e.conversacion; delete e.registro; for (const a of e.agentes || []) { a.memoriaCorta = []; a.tareas = (a.tareas || []).filter((t) => t.estado === "pendiente"); }
        const txt = JSON.stringify(e);
        if (txt.length > 1e6) throw new Error("the building is too big to store in the browser; download the backup in Settings");
        localStorage.setItem(K.copia, JSON.stringify({ dia, json: txt }));
      },
      alCambiar: (ev) => {
        if (ev.tipo === "medios" || ev.tipo === "imagenes") { for (const im of ev.imagenes || []) { imgsSesion.set(im.texto, im.url); if (im.id) mediosCache.set(im.id, im.url); } for (const au of ev.audios || []) { audiosSesion.set(au.texto, au.url); if (au.id) mediosCache.set(au.id, au.url); } if (chatId) pintarChat(true); }
        if (ev.tipo === "memoria" || ev.tipo === "estado") cerebroCambio(ev.tipo);
        pintar();
      }
    });
    await Promise.race([listas, sleep(6000)]);
    ed.setModelos(modelos);
    await ed.iniciar("vacio", idioma);   // un edificio nuevo empieza solo con el jefe (los demás, en «Agentes de serie»), en el idioma de esta persona
    // El aspecto del jefe de la versión anterior (guardado en este navegador) pasa a su ficha una vez.
    const look = store.json(K.look, null), j = ed.jefe();
    if (look && j && !look.pasado && look.p && sinColores(asp(j.aspecto)) && asp(j.aspecto).p === "chico") {
      await ed.ejecutar({ tipo: "editarAgente", id: j.id, cambios: { aspecto: Object.assign({ p: look.p }, look[look.p] || {}) } }).catch(() => {});
      look.pasado = true; store.set(K.look, JSON.stringify(look));
    }
    listas.then(() => { ed.setModelos(modelos); pintar(); });
    // el latido del edificio: cada 20 segundos mira a quién le toca despertarse
    // Si la web está abierta en varias pestañas, solo una hace latir el edificio (así no se gasta dos veces).
    const latir = async () => {
      latirAntena(); if (!hayAcceso()) return;
      const trabajo = async () => { try { await ed.tick(); } catch {} };
      try { if (navigator.locks) await navigator.locks.request("fer-edificio-latido", { ifAvailable: true }, async (l) => { if (l) await trabajo(); }); else await trabajo(); } catch { await trabajo(); }
      pintar();
    };
    window.addEventListener("storage", (ev) => {   // otra pestaña cambió el edificio: se carga su versión
      if (ev.key !== K.estado || !ev.newValue || pensando || ed.ocupados.size) return;
      try { ed.e = JSON.parse(ev.newValue); ed.reparar(); pintar(); if (chatId) pintarChat(true); } catch {}
    });
    setTimeout(latir, 2500); setInterval(latir, 20000);
  }
  await sincronizarIdioma();
  if (!ed.e.ajustes.modeloImagen && imagenesModelos.length) {
    const barata = imagenesModelos.slice().sort((x, y) => (n0(x.pricing.image) + n0(x.pricing.prompt)) - (n0(y.pricing.image) + n0(y.pricing.prompt)))[0];
    await Motor.ejecutar({ tipo: "ajustes", cambios: { modeloImagen: barata.id } }).catch(() => {});
  }
  if (!ed.e.ajustes.modeloMusica && porTipo.musica.length) {   // música: Lyria si está; si no, el más barato
    const lyria = porTipo.musica.find((m) => /lyria/i.test(m.id) && /clip/i.test(m.id)) || porTipo.musica.find((m) => /lyria/i.test(m.id));
    const barato = porTipo.musica.slice().sort((x, y) => (n0(x.pricing && x.pricing.request) + n0(x.pricing && x.pricing.prompt)) - (n0(y.pricing && y.pricing.request) + n0(y.pricing && y.pricing.prompt)))[0];
    await Motor.ejecutar({ tipo: "ajustes", cambios: { modeloMusica: (lyria || barato).id } }).catch(() => {});
  }
  if (!ed.e.ajustes.modeloVoz && voces.length) {
    const pref = ["google/gemini-3.8-flash-lite-tts", "microsoft/mai-voice-2.1-flash", "hexgrad/kokoro-82m"].find((id) => voces.some((v) => v.id === id));
    if (pref) Motor.ejecutar({ tipo: "ajustes", cambios: { modeloVoz: pref, vozConcreta: ((voces.find((v) => v.id === pref) || {}).voices || [])[0]?.id || "" } }).catch(() => {});
  }
  microUI();
  await Promise.all(ed.e.agentes.map((a) => asegurarFigura(a.aspecto))).catch(() => {});
  if (modo === "local") arrancarCerebro().catch(() => {});   // la carpeta del cerebro (Drive o la de este ordenador), si la conectaste
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && cerebro.ad) sincronizarCerebro(); });
  verPestana(window.innerWidth <= 900 ? "edificio" : "ficha");
  pintar();
  if (!hayAcceso()) abrirCajon("ajustes");
})();
