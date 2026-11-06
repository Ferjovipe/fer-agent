// =====================================================================
// Fer Agent · El Edificio — LA PANTALLA
// Dibuja la portada, el edificio, las fichas, el chat con cada agente, el gasto, el agente del mes,
// las salas de reuniones y los ajustes. Todos los textos pasan por tr() (textos.js) para poder traducirse.
// El trabajo de verdad lo hace engine.js (aquí en el navegador, o en Fer Casa).
// =====================================================================
import { LOCALE, fijarIdioma, Edificio, ROLES, CAPACIDADES, PUESTOS, POR_POOL, MAX_OFICINAS, MAX_POOLS, MAX_REUNION, VERSION, MODELO_JEV, TIPOS_MODELO, NIVELES, NOMBRE_NIVEL,
  reparto, limpiarAspecto, textoLatido, nivelClave, tipoModelo, precioVariable, fmt, fmtTope, explicarError, PROVEEDORES, filtrarModelosApi, MAX_PERSONALIDAD, MAX_LINEAS_OBJETIVOS,
  limpiarObjetivos, precioUnidad, precioOidoSegundo, sinPrecioPublicado, precioDescrito, tokensImagen, notasMemoriaMd, limpiarTema, versionModelo, elegirModelo } from "./engine.js";
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
const comoSacarClave = () => h("div", { class: "como-clave" }, h("b", {}, "¿Aún no tienes clave? Se saca en unos minutos:"),
  h("ol", {},
    h("li", {}, "Crea una cuenta en OpenRouter: con tu correo, con Google o con GitHub. ", h("a", { href: "https://openrouter.ai", target: "_blank", rel: "noopener" }, "openrouter.ai")),
    h("li", {}, "En «Credits», añade saldo. Se paga por adelantado y solo se gasta lo que usen tus agentes. ", h("a", { href: "https://openrouter.ai/credits", target: "_blank", rel: "noopener" }, "openrouter.ai/credits")),
    h("li", {}, "En «Keys», pulsa «Create Key», ponle un límite de gasto y copia la clave: solo se ve una vez. Pégala aquí arriba y pulsa «Guardar». ", h("a", { href: "https://openrouter.ai/keys", target: "_blank", rel: "noopener" }, "openrouter.ai/keys"))));
const entreComillas = (t) => { const [a, b] = tr("«{1}»").split("{1}"); return [a, crudo(t), b]; };   // «…» en español, “…” en inglés
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
    if (!pin || pinRechazado) { pedirPin(); throw Object.assign(new Error("Falta el PIN de Fer Casa o no es correcto (Ajustes)."), { mostrado: true }); }
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
      if (error || !fin) throw Object.assign(new Error(error || "Fer Casa cortó la respuesta."), { mostrado: true });
      return fin;
    }
    let d = {}; try { d = await r.json(); } catch {}
    if (r.status === 401) { pinRechazado = true; pedirPin(); throw Object.assign(new Error("Falta el PIN de Fer Casa o no es correcto (Ajustes)."), { mostrado: true }); }
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
  if (!r.ok) throw Object.assign(new Error(d.error || "No se pudo."), { mostrado: true });
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
const POR_TXT = { song: "canción", clip: "clip", track: "pista", image: "imagen", minute: "minuto", hour: "hora", request: "petición", generation: "generación", second: "segundo" };
function precioTxt(m) {
  const p = m.pricing || {}, a = n0(p.prompt), b = n0(p.completion), t = tipoModelo(m);
  if (precioVariable(m)) return tr("precio variable");
  // imágenes: OpenRouter da el precio por token de imagen («image_output»); aquí, por imagen de 1024×1024 (≈)
  if (t === "imagen" && precioUnidad(m)) return tr(`≈${dinero(precioUnidad(m))} $ por imagen`);
  if (t === "musica" && n0(p.request)) return tr(`${dinero(n0(p.request))} $ por canción`);
  if (t !== "texto" && sinPrecioPublicado(m)) { const d = precioDescrito(m); return tr(d ? `precio no publicado (su descripción dice ${dinero(d.usd)} $ por ${POR_TXT[d.por] || d.por})` : "precio no publicado"); }
  if (t === "voz" && (a || b)) return tr(a && !b ? `${porMillon(a)} $ por millón de caracteres` : !a && b ? `${dinero(b * 3600, 2)} $ por hora de audio` : `≈${dinero(b * 32 * 3600, 2)} $ por hora de audio`);
  if (t === "oido" && a && !b) return tr(`${dinero(precioOidoSegundo(m) * 3600)} $ por hora de voz`);
  const otros = n0(p.image) + n0(p.request) + n0(p.audio) + n0(p.image_output) + n0(p.audio_output);
  if (!a && !b && !otros) return tr("gratis");
  return tr(`${porMillon(a)} / ${porMillon(b)} $`);
}
function etiquetaModelo(m) {
  const d = datosModelo(m);
  if (precioVariable(m)) return `${d.name} · ${tr("precio variable (depende del modelo que elija)")}`;
  const nivel = nivelClave(Object.assign({}, m, d));
  if (nivel === "sinprecio") return `${d.name} · ${precioTxt(m)}`;
  return `${d.name} · ${tr(NOMBRE_NIVEL[nivel])} · ${precioTxt(m)}${d.ve && tipoModelo(m) === "texto" ? " · " + tr("ve") : ""}`;
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
      sel.append(h("optgroup", { label: tr("Recomendados") + " · " + tr(NOMBRE_NIVEL[nivel]) }, ids.map((id) => h("option", { value: id }, etiquetaModelo(porId.get(id))))));
    }
    // debajo, TODOS los de OpenRouter de este tipo (cientos), como en la versión 7; y los «Otros», por si acaso
    sel.append(h("optgroup", { label: tr("Todos") + " · " + tr(TIPOS_MODELO[tipo]) + ` (${lista.length})` }, lista.map((m) => h("option", { value: m.id }, etiquetaModelo(m)))));
    if (tipo === "texto" && !filtro && porTipo.otros.length) sel.append(h("optgroup", { label: tr("Otros (puede que no sirvan aquí)") }, porTipo.otros.map((m) => h("option", { value: m.id }, etiquetaModelo(m) + " · " + ((m.architecture && m.architecture.output_modalities) || []).join("+")))));
    if (valor && ![...sel.options].some((o) => o.value === valor)) sel.prepend(h("option", { value: valor }, porId.has(valor) ? etiquetaModelo(porId.get(valor)) : valor + (valor === MODELO_JEV ? "" : " " + tr("(no está en la lista)"))));
    sel.value = valor || "";
  };
  rellenar(actual || "");
  if (alCambiar) sel.addEventListener("change", () => alCambiar(sel.value));
  if (todos.length > MAX_RECOMENDADOS) {
    // además, «Buscar entre todos»: escribes parte del nombre y eliges (es lo mismo que buscarlo en el desplegable, más rápido)
    const boton = h("button", { type: "button", class: "btn mini buscar-modelo" }, tr(`Buscar entre todos (${todos.length})`));
    let caja = null;
    boton.onclick = (ev) => {
      ev.preventDefault();
      if (caja && caja.isConnected) { caja.remove(); caja = null; return; }
      const q = h("input", { type: "search", placeholder: tr("Escribe parte del nombre: claude, gpt, gemini, flux…"), "aria-label": "Buscar modelo" });
      const res = h("div", { class: "busca-modelos" });
      const pintarRes = () => {
        const t = sinAcentos(q.value.trim()), hall = todos.filter((m) => !t || sinAcentos(m.id + " " + (m.name || "")).includes(t)).slice(0, 40);
        res.replaceChildren(...hall.map((m) => h("button", { type: "button", class: "modelo-res", onclick: (e2) => { e2.preventDefault(); rellenar(m.id); caja.remove(); caja = null; sel.dispatchEvent(new Event("change")); } }, etiquetaModelo(m))),
          hall.length ? h("small", { class: "nota" }, tr(hall.length === 40 ? "Hay más: escribe un poco más del nombre." : `${hall.length} encontrados`)) : h("small", { class: "nota" }, tr("Ninguno con ese nombre.")));
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
    h("span", {}, `${tr("Arturito propone")} ${pm.modelo} ${tr("para el nivel")} ${tr(NOMBRE_NIVEL[pm.nivel] || pm.nivel)}: ${pm.motivo}`),
    h("button", { class: "btn mini primario", onclick: () => Motor.ejecutar({ tipo: "modelo.aceptar", propuesta: pm.id }).then(() => pintar(true)).catch(avisar) }, "Aceptar"),
    h("button", { class: "btn mini", onclick: () => Motor.ejecutar({ tipo: "modelo.descartar", propuesta: pm.id }).then(() => pintar(true)).catch(avisar) }, "Descartar")));
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
const NOMBRE_PJ = { chico: "Chico", chica: "Chica", abuelo: "Abuelo", abuela: "Abuela", morado: "Traje morado", verde: "Traje verde", coral: "Coral", azul: "Traje azul", turquesa: "Traje turquesa", camisa: "Camisa azul" };
const NOMBRE_ZONA = { ropa: "Ropa", ojos: "Ojos", pelo: "Pelo", piel: "Piel" };
const PALETAS = {
  ropa: [["#1F3A93", "azul marino"], ["#3A9FE3", "azul cielo"], ["#2E9E5B", "verde"], ["#7B3FB5", "morado"], ["#E8C22C", "amarillo"], ["#EF6AA6", "rosa"], ["#8E1B2C", "granate"], ["#2A2C36", "negro"], ["#E9EDF2", "blanco"]],
  ojos: [["#6B3E1E", "marrones"], ["#9A7434", "avellana"], ["#3F8F4E", "verdes"], ["#8C99A6", "grises"], ["#2B1D14", "negros"], ["#7A4FB8", "violeta"]],
  pelo: [["#1E1A18", "negro"], ["#5A3820", "castaño"], ["#8B5A2B", "castaño claro"], ["#E0B85A", "rubio"], ["#B8B8B8", "canoso"], ["#3D6BE0", "azul"], ["#E85C9A", "rosa"]],
  piel: [["#F6D9C6", "muy clara"], ["#E8B896", "clara"], ["#D9A27E", "media"], ["#B67A52", "morena"], ["#8A5636", "oscura"], ["#5C3A24", "muy oscura"]]
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
  const vista = h("img", { class: "vista-pj", alt: "Cómo queda" });
  const refrescarVista = () => { asegurarFigura(A).then((u) => { vista.src = u; }); };
  const pintarSel = () => {
    caja.innerHTML = "";
    const pick = h("div", { class: "pick4", role: "radiogroup", "aria-label": "Personaje" });
    for (const nombre of Object.keys(PERSONAJES)) {
      pick.append(h("button", { type: "button", role: "radio", "aria-checked": String(A.p === nombre), onclick: () => { A = asp({ p: nombre }); alCambiar(A); pintarSel(); } },
        h("img", { src: PERSONAJES[nombre].img, alt: "" }), h("span", {}, NOMBRE_PJ[nombre])));
    }
    const colores = h("div", { class: "colores" });
    if (!PERSONAJES[A.p].regiones) colores.append(h("small", { class: "nota" }, tr("Este personaje va con sus colores tal cual.")));
    else for (const zona of ["ropa", "ojos", "pelo", "piel"]) {
      const original = PERSONAJES[A.p].regiones[zona].original;
      const fila = h("div", { class: "muestras", role: "radiogroup", "aria-label": NOMBRE_ZONA[zona] });
      for (const [hex, nombre] of [[null, "original"], ...PALETAS[zona]]) {
        fila.append(h("button", { type: "button", class: "sw" + (hex ? "" : " orig"), style: { "--c": hex || original }, title: nombre[0].toUpperCase() + nombre.slice(1), role: "radio", "aria-label": `${NOMBRE_ZONA[zona]}: ${nombre}`, "aria-checked": String((A[zona] || null) === hex),
          onclick: () => { A = asp(Object.assign({}, A, { [zona]: hex })); alCambiar(A); pintarSel(); } }));
      }
      const libre = !!A[zona] && !PALETAS[zona].some(([x]) => x === A[zona]);
      const inp = h("input", { type: "color", value: A[zona] || original, "aria-label": `${NOMBRE_ZONA[zona]}: otro color` });
      inp.oninput = () => { A = asp(Object.assign({}, A, { [zona]: inp.value.toUpperCase() })); refrescarVista(); };
      inp.onchange = () => { alCambiar(A); pintarSel(); };
      fila.append(h("label", { class: "libre", title: "Otro color", style: libre ? { background: A[zona], borderStyle: "solid" } : {} }, inp, h("span", {}, libre ? "" : "+")));
      colores.append(h("div", { class: "campo" }, h("span", {}, NOMBRE_ZONA[zona]), fila));
    }
    caja.append(h("div", { class: "aspecto-cab" }, h("div", { class: "marco-vista" }, vista), h("div", { class: "campo", style: { flex: 1 } }, h("span", {}, "Personaje"), pick)), colores);
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
const NOMBRE_PUESTO = { centro: "centro", izquierda: "izquierda", derecha: "derecha", despacho: "despacho", oficina: "oficina", pool: "pool", recepcion: "recepción" };
const PUESTOS_TXT = { cupula: [["izquierda", "A la izquierda del jefe"], ["derecha", "A la derecha del jefe"]], piso: [["despacho", "Despacho (jefe de sección)"], ["oficina", "Oficina"], ["pool", "Pool (varios agentes sencillos)"]], vestibulo: [["recepcion", "Recepción"], ["izquierda", "Despacho de la izquierda"], ["derecha", "Despacho de la derecha"]] };

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
  $("nombreEdificio").textContent = ed.e.nombre || tr("Mi edificio");
  // el contador siempre a la vista; con cero, «Hoy, sin gasto» en vez de «0,0000 $»
  $("medHoy").textContent = hoy > 0 ? tr("Hoy " + fmt(hoy)) : tr("Hoy, sin gasto");
  $("medTope").textContent = n0(aj.topeDiario) ? tr("tope " + fmtTope(n0(aj.topeDiario))) : tr("sin tope");
  const b = $("medBarra"); b.style.width = Math.min(100, uso * 100) + "%"; b.className = faseClase();
  $("modo").textContent = tr(esApp() ? "En esta aplicación · trabaja mientras esté abierta" : modo === "casa" ? "Conectado a Fer Casa · trabaja 24 h" : "En este navegador · trabaja mientras esté abierto");
  $("modo").classList.toggle("casa", modo === "casa");
  $("hablarJefe").textContent = tr("Hablar con " + (j ? j.nombre : "el jefe"));
  const pend = (ed.e.monedas || []).filter((m) => m.estado === "propuesta").length;
  $("globoMes").hidden = !pend; $("globoMes").textContent = pend;
  $("globoMes").title = tr(pend === 1 ? "1 moneda propuesta espera tu decisión" : `${pend} monedas propuestas esperan tu decisión`);
  // la bandeja: todo lo que espera tu sí
  const nb = ed.bandeja().length;
  $("globoBandeja").hidden = !nb; $("globoBandeja").textContent = nb;
  $("abrirBandeja").title = tr(nb ? (nb === 1 ? "1 cosa espera tu sí" : `${nb} cosas esperan tu sí`) : "Nada espera tu sí");
  // el interruptor general
  const pausa = aj.pausa !== false, gastan = ed.quienesGastan().filter((x) => x.auto && x.est.gasta && !x.a.apagado);
  $("pausa").setAttribute("aria-pressed", String(pausa));
  $("pausaTxt").textContent = tr(pausa ? "En pausa" : "Automático");
  $("pausaSub").textContent = tr(pausa ? "nada gasta solo" : (gastan.length === 1 ? "1 agente puede gastar solo" : `${gastan.length} agentes pueden gastar solos`));
  $("pausa").title = tr(pausa ? "Pausa general: ningún agente que gaste se despierta solo. Pulsa para ponerlo en marcha." : "En marcha: los latidos funcionan. Pulsa para parar todo lo automático.");
  pintarCopiaTop();
}
// «Guardar copia»: cuándo se hizo la última (descargada o en la carpeta del cerebro)
function ultimaCopia() { return Math.max(Number(store.get(K.ultimaCopia, "0")) || 0, (cerebro.estado && cerebro.estado.ultimaCopia) || 0); }
function haceCuanto(ts) {
  if (!ts) return tr("nunca");
  const m = Math.round((Date.now() - ts) / 60e3);
  if (m < 1) return tr("ahora mismo"); if (m < 60) return tr(`hace ${m} min`);
  const hh = Math.round(m / 60); if (hh < 24) return tr(`hace ${hh} h`);
  const d = Math.round(hh / 24); return d === 1 ? tr("hace 1 día") : tr(`hace ${d} días`);
}
function pintarCopiaTop() {
  const t = ultimaCopia(), vieja = !t || Date.now() - t > 7 * 86400e3;
  $("copiaCuando").textContent = tr("última: " + haceCuanto(t));
  $("copiaRapida").classList.toggle("vieja", vieja);
  $("copiaRapida").title = tr(t ? `Última copia: ${new Date(t).toLocaleString(LOCALE)}. Pulsa para guardar otra ahora.` : "Todavía no hay ninguna copia. Pulsa para guardar una ahora.");
}
function estadoVisible(a) {
  if (a.estado === "trabajando" || ed.ocupados.has(a.id)) return "trabajando";
  if (a.apagado || a.estado === "apagado") return "apagado";
  if (a.estado === "congelado") return "congelado";
  if (a.tareas.some((t) => t.estado === "pendiente")) return "activo";
  return "reposo";
}
const ESTADO_TXT = { trabajando: "trabajando", apagado: "apagado", congelado: "congelado", activo: "con tareas pendientes", reposo: "en reposo" };
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
  return h("span", { class: "monedas-pj", "aria-label": `${c.oro} doradas y ${c.roja} rojas` },
    c.oro ? h("span", {}, h("i", { class: "moneda oro" }), String(c.oro)) : null, c.roja ? h("span", {}, h("i", { class: "moneda roja" }), String(c.roja)) : null);
}
function hueco(T, x, x0, ancho, planta, puesto) {
  return h("button", { class: "hueco", type: "button", title: "Poner aquí un agente nuevo", "aria-label": `Crear un agente en ${NOMBRE_PUESTO[puesto]}`,
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
  el.append(h("button", { class: "entrar", type: "button", "aria-label": `Entrar en ${p.nombre}`, title: `Entrar en ${p.nombre}${p.funcion ? ": " + p.funcion : ""}`, onclick: () => abrirPlanta(p.id) }));
  let fuera = 0;
  for (const [puesto, ags] of Object.entries(r)) {
    const xs = (sitios[puesto] || []).slice(0, p.tipo === "piso" && puesto === "pool" ? Math.min(POR_POOL, (p.pools || 0) * POR_POOL) : undefined);
    ags.forEach((a, i) => { if (i < xs.length) el.append(personaje(a, T, xs[i], 0, ANCHO)); else fuera++; });
  }
  if (fuera) el.append(h("button", { class: "mas", type: "button", onclick: () => abrirPlanta(p.id), title: "Ver todos" }, `+${fuera}`));
  const g = gastoPlanta(p);
  el.append(h("button", { class: "placa", type: "button", style: { "--arriba": pct(T.placa / T.alto), "--movil": pct((T.placaMovil || T.placa) / T.alto) }, onclick: () => abrirPlanta(p.id), title: p.funcion || "" },
    h("b", {}, p.nombre), g > 0 ? h("span", {}, fmt(g)) : null));
  return el;
}
// Un piso como franja: nombre, función, cuántos agentes, cuántos trabajan y el gasto (si lo hay); un punto por agente.
function franjaPiso(p) {
  const ags = ed.e.agentes.filter((a) => a.planta === p.id), est = ags.map(estadoVisible);
  const trab = est.filter((x) => x === "trabajando").length, g = gastoPlanta(p);
  const datos = tr(ags.length === 1 ? "1 agente" : `${ags.length} agentes`) + " · " + tr(`${trab} trabajando`) + (g > 0 ? " · " + fmt(g) : "");
  return h("div", { class: "tramo piso franja" },
    h("img", { class: "fondo", src: TRAMO.piso.img, alt: "", draggable: "false" }),
    h("button", { class: "entrar", type: "button", "aria-label": `Entrar en ${p.nombre}`, title: `Entrar en ${p.nombre}${p.funcion ? ": " + p.funcion : ""}`, onclick: () => abrirPlanta(p.id) }),
    h("div", { class: "franja-txt" },
      h("span", { class: "f-nombre" }, h("b", {}, p.nombre), p.funcion ? h("small", {}, p.funcion) : null),
      h("span", { class: "f-datos" }, datos, ags.length ? h("span", { class: "puntos", "aria-hidden": "true" }, ags.map((a, i) => h("i", { class: est[i] }))) : null)));
}

// ---------------- Directorio: todos los agentes, con buscador y filtros ----------------
const FILTROS = [["", "Todos"], ["trabajando", "Trabajando"], ["activo", "Con tareas pendientes"], ["congelado", "Congelados"], ["apagado", "Apagados"]];
const sinAcentos = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
function cabDirectorio() {
  const buscar = h("input", { class: "buscador", type: "search", placeholder: "Buscar por nombre, papel o planta", "aria-label": "Buscar un agente", oninput: (ev) => { busqueda = ev.target.value; pintarDirectorio(); } });
  dirCab = h("div", { class: "dir-cabecera" }, h("div", { class: "dir-cab" }, h("h3", {}, "Directorio"), buscar), h("div", { class: "filtros", role: "group", "aria-label": "Filtrar por estado" }));
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
      h("button", { type: "button", onclick: () => abrirPlanta(p.id), title: p.funcion || "" }, p.nombre, h("small", {}, `${todos.length === 1 ? "1 agente" : todos.length + " agentes"}${g > 0 ? " · " + fmt(g) : ""}`)),
      ags.length ? ags.map((a) => {
        const e = est.get(a.id), ga = ed.gastoAgente(a, "hoy");
        return h("button", { class: "fila-ag" + (seleccion === a.id ? " sel" : ""), type: "button", onclick: () => elegir(a) },
          h("img", { src: figura(a.aspecto), alt: "" }),
          h("span", { class: "fa-txt" }, h("b", {}, a.nombre), h("small", {}, `${rolTxt(a)} · ${tr(ESTADO_TXT[e])}${a.motivoEstado && e === "congelado" ? " · " + a.motivoEstado : ""}`)),
          h("span", { class: "fa-der" }, gastoTxt(ga), h("i", { class: "est-punto " + e, "aria-hidden": "true" })));
      }) : h("p", { class: "sin-resultados" }, p.tipo === "piso" ? "Piso vacío." : "Vacío.")));
  }
  dirLista.replaceChildren(...(grupos.length ? grupos : [h("p", { class: "sin-resultados" }, "Ningún agente coincide con la búsqueda o el filtro.")]));
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
  const nombre = h("input", { class: "nombre-planta", value: p.nombre, "aria-label": "Nombre de la planta", onchange: (ev) => ejecutar({ tipo: "editarPlanta", id: p.id, nombre: ev.target.value }) });
  const funcion = h("textarea", { class: "funcion-planta", rows: "1", maxlength: "300", placeholder: "¿Para qué sirve esta planta?", "aria-label": "Función de la planta", onchange: (ev) => ejecutar({ tipo: "editarPlanta", id: p.id, funcion: ev.target.value.replace(/\s*\n\s*/g, " ") }) });
  funcion.value = p.funcion || "";
  cont.append(h("div", { class: "planta-cab" },
    h("button", { class: "volver", type: "button", onclick: volverAtras }, "← Volver a todo el edificio"),
    nombre, funcion,
    h("p", { class: "planta-datos" }, tr(ags.length === 1 ? "1 agente" : `${ags.length} agentes`) + (gastoPlanta(p) > 0 ? " · " + tr(`hoy ${fmt(gastoPlanta(p))}`) : "") + (p.tipo === "piso" ? " · " + tr(p.oficinas === 1 ? "1 oficina" : `${p.oficinas} oficinas`) + " · " + tr(p.pools === 1 ? "1 pool" : `${p.pools} pools`) : ""))));
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
    h("button", { class: "flecha izq", type: "button", "aria-label": "Ver más a la izquierda", onclick: () => tira.scrollBy({ left: -tira.clientWidth * 0.8, behavior: "smooth" }) }, "‹"),
    h("button", { class: "flecha der", type: "button", "aria-label": "Ver más a la derecha", onclick: () => tira.scrollBy({ left: tira.clientWidth * 0.8, behavior: "smooth" }) }, "›"));
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
    p.tipo === "cupula" && r.izquierda.length && r.derecha.length ? null : h("button", { class: "btn primario mini", onclick: () => abrirCajon("agente", { planta: p.id, puesto: p.tipo === "cupula" ? (r.izquierda.length ? "derecha" : "izquierda") : "" }) }, p.tipo === "cupula" ? "+ Sabio" : "+ Agente en esta planta"));
  if (p.tipo === "piso") {
    acc.append(...[
      h("button", { class: "btn mini", disabled: p.oficinas >= MAX_OFICINAS, onclick: () => ejecutar({ tipo: "ampliarPlanta", id: p.id, que: "oficina", cambio: 1 }) }, "+ Oficina"),
      h("button", { class: "btn mini", disabled: p.oficinas <= Math.max(1, r.oficina.length), onclick: () => ejecutar({ tipo: "ampliarPlanta", id: p.id, que: "oficina", cambio: -1 }) }, "− Oficina"),
      h("button", { class: "btn mini", disabled: p.pools >= MAX_POOLS, onclick: () => ejecutar({ tipo: "ampliarPlanta", id: p.id, que: "pool", cambio: 1 }) }, "+ Pool"),
      h("button", { class: "btn mini", disabled: !p.pools || (p.pools - 1) * POR_POOL < r.pool.length, onclick: () => ejecutar({ tipo: "ampliarPlanta", id: p.id, que: "pool", cambio: -1 }) }, "− Pool"),
      h("button", { class: "btn mini", onclick: () => ejecutar({ tipo: "subirPlanta", id: p.id }) }, "Subir"),
      h("button", { class: "btn mini", onclick: () => ejecutar({ tipo: "bajarPlanta", id: p.id }) }, "Bajar"),
      ags.length ? null : h("button", { class: "btn mini peligro", onclick: (ev) => confirmar(ev.target, "¿Borrar el piso? Pulsa otra vez", () => Motor.ejecutar({ tipo: "borrarPlanta", id: p.id }).then(() => { plantaAbierta = ""; pintar(); }).catch(avisar)) }, "Borrar piso")].filter(Boolean));
  }
  cont.append(acc);
  // quién trabaja aquí
  const lista = h("div", { class: "quienes" });
  const orden = { centro: 0, despacho: 0, recepcion: 0, izquierda: 1, derecha: 2, oficina: 3, pool: 4 };
  for (const a of ags.slice().sort((x, y) => (orden[x.puesto] ?? 9) - (orden[y.puesto] ?? 9))) {
    const est = estadoVisible(a);
    lista.append(h("button", { class: "quien " + est + (seleccion === a.id ? " sel" : ""), type: "button", onclick: () => elegir(a) },
      h("img", { src: figura(a.aspecto), alt: "" }),
      h("span", { class: "q-txt" }, h("b", {}, a.nombre), h("small", {}, `${rolTxt(a)} · ${NOMBRE_PUESTO[a.puesto] || a.puesto}`), h("small", {}, `${tr(ESTADO_TXT[est])} · ${["interventor", "memory"].includes(a.rol) ? tr("no gasta") : textoLatido(a.latido)}${ed.gastoAgente(a, "hoy") > 0 ? " · " + tr(`hoy ${fmt(ed.gastoAgente(a, "hoy"))}`) : ""}`))));
  }
  cont.append(ags.length ? lista : h("p", { class: "planta-vacia" }, p.tipo === "piso" ? "Planta vacía. Pon un jefe de sección en el despacho y sus subagentes en las oficinas o en el pool." : "Planta vacía."));
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
  const t = err && err.mostrado ? err.message : "Algo falló: " + ((err && err.message) || err);
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
  tecno: "Cada día hace su ronda sin gastar: revisa las altas, cada dos noches mira que todos hayan trabajado y dejado su señal, los viernes guarda una copia, recoge lo ya atendido, quita recuerdos repetidos y vigila que nada se envíe, se borre o se pague sin tu sí. Los lunes revisa los costes y solo entonces usa su cerebro, para decir si compensan.",
  mejora: "Sigue cada día cómo avanzan los agentes de IA y propone al jefe mejoras para el edificio. Usa la búsqueda en internet. Cuando sale un modelo nuevo, te lo propone como recomendado; tú decides.",
  creador: "Diseña agentes nuevos a partir de lo que le cuentas con tus palabras. Úsalo desde «Crear agente» o pidiéndoselo al jefe. Nada se crea sin que lo aceptes.",
  interventor: "Vigila el gasto con reglas fijas: congela a los menos importantes cuando el gasto se acerca al tope. Sin cerebro: no gasta. Puede proponerte monedas rojas; tú las confirmas.",
  jev: "Antes de que un agente haga algo que cuesta (buscar en internet, reintentar lo que falló o crear otro agente), decide: seguir, aprovechar lo que ya hay, parar o preguntar al jefe. Usa el modelo Jev. Puede proponerte monedas rojas; tú las confirmas.",
  memory: "Guarda la memoria larga del edificio y la busca por palabras cuando dices «recuerdas…». Sin cerebro: no gasta.",
  sabio: "Solo habla cuando el jefe le consulta una decisión importante. Es caro: tiene tope de una consulta al día."
};
const PESTANAS_FICHA = [["identidad", "Identidad"], ["trabajo", "Trabajo"], ["cerebro", "Cerebro y gasto"], ["capacidades", "Capacidades"]];
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
    h("button", { class: "marco-ficha", type: "button", title: "Cambiar su foto y su nombre", onclick: () => abrirCajon("aspecto", { id: a.id }) }, h("img", { src: figura(a.aspecto), alt: "" })),
    h("div", { style: { flex: 1, minWidth: 0, display: "grid", gap: "4px" } }, h("h3", { class: "ficha-nombre" }, a.nombre),
      h("div", { class: "fila-c" }, h("span", { class: "estado-pill " + est }, tr(ESTADO_TXT[est]) + (a.motivoEstado ? " · " + a.motivoEstado : "")),
        h("span", { class: "nota" }, `${rolTxt(a)} · ${pl ? pl.nombre : ""}`)))));
  caja.append(h("div", { class: "fila-c", style: { marginTop: "12px" } },
    conversa(a) ? h("button", { class: "btn primario mini", onclick: () => abrirChat(a.id) }, "Hablar con " + a.nombre) : null,
    sinCerebro || a.rol === "jev" ? null : h("button", { class: "btn mini", onclick: () => { Motor.ejecutar({ tipo: "despertar", id: a.id }).then(pintar).catch(avisar); pintar(); } }, "Despertar ahora"),
    h("button", { class: "btn mini", onclick: () => cambiar({ apagado: !a.apagado }) }, a.apagado ? "Encender" : "Apagar"),
    pl ? h("button", { class: "btn mini", onclick: () => abrirPlanta(pl.id) }, "Ver su planta") : null,
    a.rol === "jefe" ? null : h("button", { class: "btn mini peligro", onclick: (ev) => confirmar(ev.target, "¿Borrar? Pulsa otra vez", () => Motor.ejecutar({ tipo: "borrarAgente", id: a.id }).then(() => { seleccion = "jefe"; pintar(); verPestana("ficha"); }).catch(avisar)) }, "Borrar")));
  if (QUE_HACE[a.rol]) caja.append(h("p", { class: "que-hace" }, QUE_HACE[a.rol]));
  if (a.falta) caja.append(h("div", { class: "aviso-falta" }, h("b", {}, "Dice que le falta algo y no avanza solo"), h("span", {}, entreComillas(a.falta.texto)),
    h("small", { class: "nota" }, "Dale lo que pide (capacidades, skills, datos) o cámbiale el objetivo. Al cambiar su ficha se da por atendido."),
    h("div", {}, h("button", { class: "btn mini", type: "button", onclick: () => Motor.ejecutar({ tipo: "bandeja.decidir", clase: "falta", id: a.id, si: true }).then(pintar).catch(avisar) }, "Ya lo tiene"))));
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
  const selPuesto = h("select", { disabled: a.rol === "jefe", onchange: (ev) => cambiar({ planta: a.planta, puesto: ev.target.value }) }, (a.rol === "jefe" ? [["centro", "Centro de la cúpula"]] : opPuesto).map(([v, t]) => h("option", { value: v }, t)));
  selPuesto.value = a.puesto;
  // «Informa a»: cualquier agente del edificio (con buscador si hay muchos); el motor no deja hacer círculos
  const otros = ed.e.agentes.filter((x) => x.id !== a.id);
  const selInforma = h("select", { onchange: (ev) => cambiar({ reportaA: ev.target.value }) });
  const llenarInforma = (q) => {
    const t = sinAcentos(q || "");
    selInforma.replaceChildren(h("option", { value: "" }, "Nadie"), ...otros.filter((x) => !t || x.id === a.reportaA || sinAcentos(`${x.nombre} ${rolTxt(x)}`).includes(t)).map((x) => h("option", { value: x.id }, `${x.nombre} · ${rolTxt(x)}`)));
    selInforma.value = a.reportaA || "";
  };
  llenarInforma("");
  const selJefe = otros.length > 6 ? h("div", { class: "informa-a" }, h("input", { type: "search", placeholder: "Escribe su nombre para buscarlo", "aria-label": "Buscar a quién informa", oninput: (ev) => llenarInforma(ev.target.value) }), selInforma) : selInforma;
  const cambiable = ["jefe_seccion", "subagente"].includes(a.rol);
  const selRol = h("select", { onchange: (ev) => cambiar({ rol: ev.target.value }) }, [["jefe_seccion", "Jefe de sección"], ["subagente", "Subagente"]].map(([k, v]) => h("option", { value: k }, v)));
  selRol.value = a.rol;
  caja.append(h("div", { class: "bloque" },
    campo("Nombre", nombre),
    h("div", { class: "campo" }, h("span", {}, "Aspecto"), h("div", { class: "fila-c" }, h("img", { class: "mini-pj", src: figura(a.aspecto), alt: "" }), h("button", { class: "btn mini", onclick: () => abrirCajon("aspecto", { id: a.id }) }, "Cambiar su foto y su nombre"))),
    h("div", { class: "dos" }, cambiable ? campo("Papel", selRol) : h("div", { class: "campo" }, h("span", {}, "Papel"), h("span", { class: "nota" }, rolTxt(a))),
      a.rol === "jefe" ? null : campo("Informa a", selJefe)),
    h("div", { class: "dos" }, campo("Planta", selPlanta), campo("Sitio", selPuesto))));
  caja.append(bloqueMonedas(a));
}
// Monedas: doradas (buen trabajo) y rojas (alucinar, gastar en balde). Cada una, con su motivo en una línea.
function bloqueMonedas(a) {
  const mias = (ed.e.monedas || []).filter((m) => m.agente === a.id);
  const oro = mias.filter((m) => m.tipo === "oro" && m.estado === "confirmada").length, rojas = mias.filter((m) => m.tipo === "roja" && m.estado === "confirmada").length;
  const caja = h("div", { class: "bloque" }, h("h4", {}, "Monedas"),
    h("div", { class: "fila-c" }, h("span", { class: "moneda oro" }), h("b", {}, oro), h("span", { class: "nota" }, oro === 1 ? "dorada" : "doradas"), h("span", { class: "moneda roja" }), h("b", {}, rojas), h("span", { class: "nota" }, rojas === 1 ? "roja" : "rojas")),
    h("div", { class: "fila-c" }, botonMoneda(a, "oro"), botonMoneda(a, "roja")),
    h("small", { class: "nota" }, `Un modelo barato convierte el motivo en una regla concreta; cuando la apruebas en la bandeja, la aprenden ${a.nombre} y todos los de su papel (${rolTxt(a)}).`));
  for (const m of mias.filter((x) => x.estado === "propuesta")) caja.append(filaMonedaPropuesta(m));
  const ultimas = mias.filter((m) => m.estado === "confirmada").slice(-5).reverse();
  if (ultimas.length) caja.append(h("div", { class: "lista" }, ultimas.map((m) => h("div", { class: "item" }, h("div", { class: "cab" }, h("span", {}, h("span", { class: "moneda " + m.tipo }), " ", fecha(m.ts)), h("span", {}, m.propone === "tú" ? "de ti" : tr(`propuesta de ${quienPropone(m.propone)}, confirmada`))), h("div", { class: "txt" }, crudo(m.motivo))))));
  return caja;
}
// Botón de moneda: al pulsarlo pide el motivo en una línea
function botonMoneda(a, tipo, alDar) {
  const b = h("button", { class: "moneda-btn", type: "button", title: tipo === "oro" ? "Moneda dorada: lo hizo bien" : "Moneda roja: alucinó o gastó en balde" }, h("span", { class: "moneda " + tipo }), tipo === "oro" ? "Moneda dorada" : "Moneda roja");
  b.onclick = () => {
    const inp = h("input", { maxlength: "160", placeholder: tipo === "oro" ? "¿Qué hizo bien? (una línea)" : "¿Qué hizo mal? (una línea)" });
    const dar = async () => {
      if (!inp.value.trim()) { inp.focus(); return; }
      try {
        inp.disabled = true;
        const r = await Motor.ejecutar({ tipo: "moneda.dar", id: a.id, tipoMoneda: tipo, motivo: inp.value.trim() });
        const hecho = tr(`${tipo === "oro" ? "Moneda dorada" : "Moneda roja"} para ${a.nombre}.`) + (r.leccion ? " " + tr(`Lección propuesta: «${r.leccion.texto}». Apruébala o retócala en la bandeja.`) : "");
        fila.replaceWith(h("span", { class: "nota" }, hecho)); avisoFlotante(hecho); if (alDar) alDar(); pintar();
      }
      catch (err) { inp.disabled = false; avisar(err); }
    };
    inp.onkeydown = (ev) => { if (ev.key === "Enter") { ev.preventDefault(); dar(); } if (ev.key === "Escape") fila.replaceWith(b); };
    const fila = h("span", { class: "motivo-fila" }, h("span", { class: "moneda " + tipo }), inp, h("button", { class: "btn mini primario", type: "button", onclick: dar }, "Dar"), h("button", { class: "btn mini", type: "button", onclick: () => fila.replaceWith(b) }, "Cancelar"));
    b.replaceWith(fila); inp.focus();
  };
  return b;
}
function filaMonedaPropuesta(m) {
  return h("div", { class: "fila-moneda" }, h("span", { class: "moneda " + m.tipo }),
    h("span", { class: "grow" }, h("b", {}, m.nombre), " · " + tr(`${quienPropone(m.propone)} propone:`) + " ", crudo(m.motivo)),
    h("button", { class: "btn mini primario", onclick: () => Motor.ejecutar({ tipo: "moneda.confirmar", moneda: m.id }).then(pintar).catch(avisar) }, "Confirmar"),
    h("button", { class: "btn mini", onclick: () => Motor.ejecutar({ tipo: "moneda.descartar", moneda: m.id }).then(pintar).catch(avisar) }, "Descartar"));
}
// Trabajo: instrucciones, objetivo, lecciones, latido, tareas y memoria corta
function fichaTrabajo(caja, a, cambiar, { sinCerebro }) {
  if (!sinCerebro) {
    const per = h("textarea", { rows: "2", maxlength: String(MAX_PERSONALIDAD), placeholder: "Su tono, su humor y si va al grano. Por ejemplo: «Cercano y con humor, pero breve y al grano.»", onchange: (ev) => cambiar({ personalidad: ev.target.value.trim() }) }, a.personalidad || "");
    const cuenta = h("span", { class: "contador" }, `${(a.personalidad || "").length}/${MAX_PERSONALIDAD}`);
    per.oninput = () => { cuenta.textContent = `${per.value.length}/${MAX_PERSONALIDAD}`; };
    caja.append(h("div", { class: "bloque" },
      campo("Instrucciones (quién es y cómo trabaja)", h("textarea", { rows: "6", onchange: (ev) => cambiar({ cuerpo: ev.target.value }) }, a.cuerpo)),
      a.rol === "jev" ? null : campo("Personalidad", per, "Va en cada llamada: así su carácter no depende del cerebro que le pongas."), a.rol === "jev" ? null : cuenta,
      a.rol === "jev" ? null : campo("Objetivo", h("textarea", { rows: "2", onchange: (ev) => cambiar({ objetivo: ev.target.value }) }, a.objetivo))));
  }
  // lecciones de su papel (salen de las monedas); las nuevas esperan tu sí en la bandeja
  const pendLecc = (ed.e.lecciones || []).filter((l) => l.papel === a.rol && l.estado === "propuesta");
  const lecc = ed.leccionesDe(a.rol).slice().sort((x, y) => (y.fija - x.fija) || (y.ts - x.ts));
  const max = ed.e.ajustes.leccionesPorPapel || 5;
  caja.append(h("div", { class: "bloque" }, h("h4", {}, `Lecciones de su papel (${rolTxt(a)})`),
    lecc.length ? h("div", { class: "lista" }, lecc.map((l) => h("div", { class: "item leccion" + (l.fija ? " fija" : "") }, h("span", { class: "moneda " + l.tipo }), h("span", { class: "txt" }, crudo(l.texto)),
      h("button", { class: "btn mini", title: l.fija ? "Que pueda salir cuando entren lecciones nuevas" : "Que no salga nunca, aunque sea antigua", onclick: () => Motor.ejecutar({ tipo: "leccion.fijar", leccion: l.id, fija: !l.fija }).then(pintar).catch(avisar) }, l.fija ? "Soltar" : "Fijar"),
      h("button", { class: "btn mini", onclick: () => Motor.ejecutar({ tipo: "leccion.borrar", leccion: l.id }).then(pintar).catch(avisar) }, "Quitar"))))
      : h("p", { class: "nota", style: { margin: 0 } }, "Todavía ninguna. Salen de las monedas: un modelo barato convierte el motivo en una regla y tú la apruebas en la bandeja."),
    pendLecc.length ? h("div", { class: "fila-c" }, h("span", { class: "nota" }, pendLecc.length === 1 ? "1 lección nueva espera tu sí." : `${pendLecc.length} lecciones nuevas esperan tu sí.`), h("button", { class: "btn mini", type: "button", onclick: () => abrirPantalla("bandeja") }, "Ir a la bandeja")) : null,
    h("small", { class: "nota" }, `Las aprenden todos los de este papel. Se guardan ${max} por papel (cámbialo en Ajustes); al entrar una nueva sale la más antigua, salvo las fijadas.`)));
  // latido
  const num = h("input", { type: "number", min: "1", step: "1", value: a.latido.cada, disabled: a.latido.unidad === "peticion" });
  const uni = h("select", {}, [["min", "minutos"], ["h", "horas"], ["d", "días"], ["peticion", "solo a petición"]].map(([v, t]) => h("option", { value: v }, t)));
  uni.value = a.latido.unidad;
  const guardarLatido = () => cambiar({ latido: { cada: Math.max(1, parseInt(num.value, 10) || 1), unidad: uni.value } });
  num.onchange = guardarLatido; uni.onchange = guardarLatido;
  const alD = h("select", { onchange: (ev) => cambiar({ alDespertar: ev.target.value }) }, h("option", { value: "tareas" }, "Hace sus tareas pendientes (si no hay, no gasta)"), h("option", { value: "objetivo" }, "Hace sus tareas y, si no hay, avanza en su objetivo (gasta)"));
  alD.value = a.alDespertar || "tareas";
  const prox = a.proximo && a.proximo < 9e14 ? fecha(a.proximo, { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "—";
  caja.append(h("div", { class: "bloque" }, h("h4", {}, "Latido"),
    h("div", { class: "campo" }, h("span", {}, "En reposo, se despierta"), h("div", { class: "fila-c" }, h("span", {}, "cada"), num, uni)),
    sinCerebro || a.rol === "sabio" || a.rol === "jev" ? null : campo("Al despertar", alD),
    h("small", { class: "nota" }, a.latido.unidad === "peticion" ? "Solo trabaja cuando alguien le encarga algo." : `Próximo latido: ${prox}. Último: ${a.ultimo ? fecha(a.ultimo) : "nunca"}.`)));
  // tareas
  if (!sinCerebro && a.rol !== "jev") {
    const txt = h("input", { placeholder: "Encárgale algo…" }), ahora = h("input", { type: "checkbox" });
    const lista = h("div", { class: "lista" });
    for (const t of a.tareas.slice().reverse().slice(0, 15)) {
      lista.append(h("div", { class: "item" }, h("div", { class: "cab" }, h("span", {}, fecha(t.creada) + " · " + (t.de ? tr(`de ${(ed.agenteExacto(t.de) || {}).nombre || t.de}`) : tr("de ti"))), h("span", { class: "est " + t.estado }, t.estado)),
        h("div", { class: "txt" }, crudo(t.texto)), t.resultado ? h("details", {}, h("summary", {}, "Resultado"), h("div", { class: "txt", html: markdown(t.resultado) })) : null));
    }
    caja.append(h("div", { class: "bloque" }, h("h4", {}, "Tareas"),
      h("div", { class: "fila-c" }, txt, h("label", { class: "fila-c nota" }, ahora, "ahora"), h("button", { class: "btn mini", onclick: () => { if (!txt.value.trim()) return; Motor.ejecutar({ tipo: "asignarTarea", id: a.id, texto: txt.value.trim(), ahora: ahora.checked }).then(() => { txt.value = ""; pintar(); }).catch(avisar); } }, "Encargar")),
      a.tareas.length ? lista : h("p", { class: "nota", style: { margin: 0 } }, "Sin tareas.")));
  }
  // memoria corta
  const mc = h("div", { class: "lista" });
  for (const m of a.memoriaCorta.slice().reverse().slice(0, 10)) mc.append(h("div", { class: "item" }, h("div", { class: "cab" }, h("span", {}, fecha(m.ts)), h("span", {}, m.tipo)), h("div", { class: "txt" }, crudo(m.texto))));
  caja.append(h("div", { class: "bloque" }, h("h4", {}, "Memoria corta"), a.memoriaCorta.length ? mc : h("p", { class: "nota", style: { margin: 0 } }, "Todavía vacía.")));
  // Memory: la memoria larga del edificio
  if (a.rol === "memory") {
    const ml = h("div", { class: "lista" });
    for (const n of ed.e.memoriaLarga.slice().reverse()) ml.append(h("div", { class: "item" }, h("div", { class: "cab" }, h("span", {}, new Date(n.ts).toLocaleDateString(LOCALE) + (n.etiquetas && n.etiquetas.length ? " · " + n.etiquetas.join(", ") : "")),
      h("button", { class: "btn mini", onclick: () => Motor.ejecutar({ tipo: "memoria.borrar", idNota: n.id }).then(pintar) }, "Borrar")), h("div", { class: "txt" }, crudo(n.texto))));
    const nt = h("textarea", { rows: "2", placeholder: "Un dato que el edificio debe recordar…" }), et = h("input", { placeholder: "etiquetas, separadas por comas" });
    caja.append(h("div", { class: "bloque" }, h("h4", {}, `Memoria larga del edificio (${ed.e.memoriaLarga.length})`),
      h("p", { class: "nota", style: { margin: 0 } }, "Cuando dices «recuerdas…» al jefe, Memory busca aquí por palabras y se lo pasa. No usa cerebro: no gasta. Más adelante podrá vivir en Google Drive."),
      nt, et, h("div", {}, h("button", { class: "btn mini", onclick: () => { if (!nt.value.trim()) return; Motor.ejecutar({ tipo: "memoria.guardar", texto: nt.value.trim(), etiquetas: et.value.split(",").map((x) => x.trim()).filter(Boolean) }).then(pintar).catch(avisar); } }, "Guardar recuerdo")), ml));
  }
}
// Cerebro y gasto: qué modelo piensa por él, su prioridad, su tope y lo que lleva gastado
function fichaCerebro(caja, a, cambiar, { sinCerebro }) {
  if (sinCerebro) caja.append(h("div", { class: "bloque" }, h("h4", {}, "Cerebro"), h("p", { class: "nota", style: { margin: 0 } }, "Trabaja con reglas fijas, sin cerebro: no gasta.")));
  else if (a.rol === "jev") {
    const sel = selectorModelo("decisiones", a.cerebro, { extra: [[MODELO_JEV, "Jev Latest · siempre la última versión de Jev"]], alCambiar: (v) => cambiar({ cerebro: v }) });
    caja.append(h("div", { class: "bloque" }, h("h4", {}, "Cerebro"), campo("Modelo de decisiones", sel, "JEV decide con la API de decisiones de OpenRouter. «Jev Latest» apunta siempre a la última versión, sin tener que cambiarlo a mano.")));
  } else {
    // Con qué piensa: OpenRouter (se paga por uso) o una de tus otras API (Ajustes → Otras API), la de una suscripción que ya pagas
    const prov = ed.cerebroDe(a).proveedor, conx = ed.conexiones();
    const opciones = [["openrouter", "OpenRouter (se paga por uso)"], ...conx.map((c) => [c.id, `${c.nombre} · tu suscripción`])];
    if (prov !== "openrouter" && !conx.some((c) => c.id === prov)) opciones.push([prov, (ed.proveedor(prov) || {}).nombre || prov]);
    const selProv = h("select", { onchange: (ev) => {
      const nuevo = ev.target.value;
      const cerebro = nuevo === "openrouter" ? ((ed.modeloEquivalente(prov, a.cerebro) || {}).id || ed.cerebroPorDefecto(Object.assign({}, a, { proveedor: "openrouter" }))) : (sugerenciasDirectas(nuevo, a)[0] || "");
      cambiar({ proveedor: nuevo, cerebro });
    } }, opciones.map(([k, t]) => h("option", { value: k }, t)));
    selProv.value = prov;
    const bloque = h("div", { class: "bloque" }, h("h4", {}, "Cerebro"), campo("Con qué piensa", selProv));
    if (!conx.length) bloque.append(h("small", { class: "nota" }, "¿Tienes una suscripción que incluye API (por ejemplo, créditos de Claude o de ChatGPT, Gemini o un modelo en tu ordenador)? Añádela en Ajustes → Otras API y podrás elegirla aquí. Lo que se paga aparte, mejor por OpenRouter."));
    if (prov === "openrouter") {
      bloque.append(campo("Cerebro", selectorModelo("texto", a.cerebro, { alCambiar: (v) => cambiar({ cerebro: v }) }), "Arriba, los recomendados por nivel de precio (no de calidad); debajo, todos los modelos de texto de OpenRouter. O escribe el nombre con «Buscar entre todos». Precio en dólares por millón de tokens (entrada / salida). «ve» = puede mirar imágenes."),
        propuestasDe("texto"));
    } else {
      const P = ed.proveedor(prov) || { corto: prov };
      bloque.append(selectorDirecto(prov, a.cerebro, (v) => cambiar({ cerebro: v })),
        h("small", { class: "nota" }, tr(tieneClaveApi(prov) ? `Sale de tu suscripción de ${P.corto}: no cuenta para el tope de gasto (se apunta aparte, para que lo veas).` : `Falta la clave de ${P.corto}: ponla en Ajustes → Otras API.`) + " " +
          tr("Buscar en internet solo funciona con OpenRouter.")));
      const selAgota = h("select", { onchange: (ev) => cambiar({ siAgota: ev.target.value }) }, h("option", { value: "openrouter" }, "Que siga con OpenRouter"), h("option", { value: "parar" }, "Que se pare"));
      selAgota.value = a.siAgota || "openrouter";
      bloque.append(campo(`Si se acaba tu cupo de ${P.corto}`, selAgota, "Cuando la empresa dice que no quedan créditos (por ejemplo, a final de mes), tú eliges."));
      if ((a.siAgota || "openrouter") === "openrouter") {
        const eq = ed.modeloEquivalente(prov, a.cerebro);
        bloque.append(campo("Su cerebro en OpenRouter mientras tanto", selectorModelo("texto", a.cerebroReserva, { vacio: eq ? `El mismo modelo en OpenRouter (${eq.name || eq.id})` : "El que le tocaría por su papel", alCambiar: (v) => cambiar({ cerebroReserva: v }) })));
      }
      const sus = Object.entries(a.suscripcion || {}).sort().at(-1);
      if (sus) bloque.append(h("small", { class: "nota" }, tr(`De tu suscripción, el ${sus[0]}: ${sus[1].tokens.toLocaleString(LOCALE)} tokens`) + (sus[1].usd ? " " + tr(`(en OpenRouter serían ≈${fmt(sus[1].usd)})`) : "") + "."));
    }
    const est = ed.estimarLatido(a);
    // cada trozo se traduce por separado (así cada idioma lo ordena a su manera)
    bloque.append(h("small", { class: "nota" }, [tr(`Al despertar: ${est.como}`), est.gasta && est.porVez > 0 ? tr(`· ≈${fmt(est.porVez)} por latido`) + (est.porDia ? " " + tr(`(≈${fmt(est.porDia)} al día)`) : "") : est.gasta && est.porTarea ? tr(`· ≈${fmt(est.porTarea)} por tarea`) : "",
      est.tokens ? tr(`· lee unos ${est.tokens.toLocaleString(LOCALE)} tokens cada vez`) : "", est.suscripcion ? tr(`· de tu suscripción de ${est.suscripcion}`) : est.sinPrecio ? tr("· sin tarifa conocida") : ""].filter(Boolean).join(" ")));
    caja.append(bloque);
  }
  caja.append(h("div", { class: "bloque" }, h("h4", {}, "Prioridad"),
    h("div", { class: "prioridad" }, [1, 2, 3, 4, 5].map((n) => h("button", { "aria-pressed": String(a.prioridad === n), onclick: () => cambiar({ prioridad: n }) }, n))),
    h("small", { class: "nota" }, "Cuando el gasto se acerca al tope, se congelan primero los de prioridad baja: al 80 % los de 1 y 2; al 90 %, todos menos los de 5.")));
  caja.append(h("div", { class: "bloque" }, h("h4", {}, "Gasto"),
    h("div", { class: "gastos3" }, ["hoy", "semana", "mes"].map((p) => h("div", {}, h("b", {}, ed.gastoAgente(a, p) > 0 ? fmt(ed.gastoAgente(a, p)) : "—"), h("small", {}, { hoy: "hoy", semana: "7 días", mes: "este mes" }[p])))),
    sinCerebro ? null : campo("Tope diario propio (USD)", h("input", { type: "number", min: "0", step: "0.05", value: a.topeDiario || "", placeholder: "sin tope propio", onchange: (ev) => cambiar({ topeDiario: Math.max(0, parseFloat(ev.target.value) || 0) }) }), "Si lo pasa, se congela hasta mañana. Además manda el tope del edificio (Gasto)."),
    a.rol === "interventor" ? h("div", {}, h("button", { class: "btn mini", onclick: () => abrirCajon("gasto") }, "Topes del edificio")) : null));
}
// Capacidades: cada una, con su propio modelo cuando lo necesita
function fichaCapacidades(caja, a, cambiar, { sinCerebro }) {
  if (sinCerebro || a.rol === "jev") { caja.append(h("div", { class: "bloque" }, h("p", { class: "nota", style: { margin: 0 } }, a.rol === "jev" ? "JEV solo decide: no usa capacidades." : "Trabaja con reglas fijas: no usa capacidades."))); return; }
  const aj = ed.e.ajustes, tiene = (id) => a.capacidades.includes(id);
  const marcar = (id, si) => Motor.ejecutar({ tipo: "editarAgente", id: a.id, cambios: { capacidades: si ? [...new Set([...a.capacidades, id])] : a.capacidades.filter((x) => x !== id) } }).then(() => { pintar(); pintarFicha(true); }).catch(avisar);
  const delEdificio = (id) => (id ? `El del edificio (${nombreModelo(id)})` : "El del edificio (ninguno elegido en Ajustes)");
  const extraDe = {
    crear_imagenes: () => [selectorModelo("imagen", a.modeloImagen, { vacio: delEdificio(aj.modeloImagen), alCambiar: (v) => cambiar({ modeloImagen: v }) }), propuestasDe("imagen")],
    crear_musica: () => [selectorModelo("musica", a.modeloMusica, { vacio: delEdificio(aj.modeloMusica), alCambiar: (v) => cambiar({ modeloMusica: v }) }), h("small", { class: "nota" }, "Música y audio de OpenRouter (por ejemplo, Lyria). Se paga por canción."), propuestasDe("musica")],
    hablar: () => selectorVoz(a, cambiar),
    oir: () => [selectorModelo("oido", a.oido, { vacio: delEdificio(aj.modeloOido === BROWSER ? "" : aj.modeloOido).replace("ninguno elegido en Ajustes", "oído del navegador"), extra: [[BROWSER, "Oído del navegador · gratis (Chrome, Edge, Safari)"]], alCambiar: (v) => cambiar({ oido: v }) }), propuestasDe("oido")],
    ver: () => h("small", { class: "nota" }, aj.modeloVista ? `Si su cerebro no ve, describe las imágenes ${nombreModelo(aj.modeloVista)} (Ajustes).` : "Si su cerebro no ve, hace falta un cerebro con vista en Ajustes."),
    skills: () => bloqueSkills(a, cambiar)
  };
  const caps = h("div", { class: "caps" });
  for (const c of CAPACIDADES) {
    const avz = c.tipo === "avanzada", marcada = tiene(c.id) && !avz;
    caps.append(h("div", { class: "cap-bloque" + (marcada ? " on" : "") },
      h("label", { class: "cap" + (avz ? " avz" : "") },
        h("input", { type: "checkbox", checked: marcada || c.id === "escribir", disabled: avz || c.id === "escribir", onchange: (ev) => marcar(c.id, ev.target.checked) }),
        h("span", {}, c.nombre, avz ? h("span", { class: "enchufe" }, "enchufe pendiente") : null, h("small", {}, avz ? `${tr(c.como)} ${tr("Hace falta:")} ${tr(c.requiere)}` : c.como))),
      marcada && extraDe[c.id] ? h("div", { class: "cap-modelo" }, extraDe[c.id]()) : null));
  }
  caja.append(h("div", { class: "bloque" }, h("h4", {}, "Capacidades"), caps,
    h("small", { class: "nota" }, "Las avanzadas están descritas pero no conectadas: cada una necesita una pieza más y siempre tu autorización.")));
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
    if (!r.ok) throw Object.assign(new Error(d.error || "Fer Casa no pudo pedir la lista."), { mostrado: true });
    lista = d.modelos || [];
  } else {
    const clave = store.get(claveApi(prov));
    if (!clave && !P.sinClave) throw Object.assign(new Error(`Falta tu clave de ${P.corto} (Ajustes → Otras API).`), { mostrado: true });
    const cab = P.formato === "anthropic" ? { "x-api-key": clave, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" } : clave ? { Authorization: "Bearer " + clave } : {};
    let r; try { r = await fetch(P.api + "/models" + (P.formato === "anthropic" ? "?limit=100" : ""), { headers: cab }); }
    catch (err) { throw Object.assign(new Error(`No se pudo hablar con ${P.corto} desde el navegador (${err.message}). Algunas API no dejan llamar desde una web: entonces, desde Fer Casa sí.`), { mostrado: true }); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(r.status === 401 || r.status === 403 ? `La clave de ${P.corto} no es válida.` : `${P.corto} respondió ${r.status}: ${(d.error && d.error.message) || ""}`), { mostrado: true });
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
  if (lista.length) sel.append(h("optgroup", { label: deLaEmpresa ? tr(`Modelos de ${P.corto} (de tu cuenta)`) : tr("Sugeridos (de la lista de OpenRouter; compruébalos con «Cargar la lista»)") },
    lista.map((id) => { const eq = ed.modeloEquivalente(prov, id); return h("option", { value: id }, id + (eq ? " · " + precioTxt(eq) : "")); })));
  sel.append(h("option", { value: "__otro" }, "Otro: escribir el nombre exacto…"));
  if (actual && !lista.includes(actual)) sel.prepend(h("option", { value: actual }, actual));
  sel.value = actual || "";
  const otro = h("input", { placeholder: "Nombre exacto del modelo (por ejemplo, claude-opus-5-5)", hidden: true, onchange: (ev) => { if (ev.target.value.trim()) alCambiar(ev.target.value.trim()); } });
  const msg = h("small", { class: "nota" });
  const cargar = h("button", { class: "btn mini", type: "button", onclick: async () => { cargar.disabled = true; msg.textContent = tr("Pidiendo la lista…"); try { const l = await cargarModelosDirectos(prov); msg.textContent = tr(`${l.length} modelos de tu cuenta.`); pintarFicha(true); } catch (err) { msg.textContent = err.mostrado ? err.message : err.message; cargar.disabled = false; } } }, "Cargar la lista de " + P.corto);
  return h("div", { class: "campo" }, h("span", {}, "Modelo"), sel, otro, h("div", { class: "fila-c" }, cargar, msg));
}
// ---------------- Manos: las skills de Fer Casa que puede usar este agente ----------------
const catalogo = () => (modo === "casa" ? skillsCasa : ed.catalogoSkills());
function bloqueSkills(a, cambiar) {
  const cat = catalogo();
  if (!cat.length) return h("small", { class: "nota" }, modo === "casa" ? "Fer Casa no tiene skills todavía (carpeta «skills» junto a fer-casa.mjs)." :
    "Las manos funcionan con Fer Casa encendido en tu ordenador: el Chrome de los agentes, su carpeta del Mac y las skills. En esta web, sin Fer Casa, no hacen nada. Cómo ponerlo: LEEME.txt del ZIP.");
  const tiene = (n) => a.habilidades.includes(n);
  const lista = h("div", { class: "skills-lista" }, cat.map((k) => h("label", { class: "cap" },
    h("input", { type: "checkbox", checked: tiene(k.nombre), onchange: (ev) => cambiar({ habilidades: ev.target.checked ? [...new Set([...a.habilidades, k.nombre])] : a.habilidades.filter((x) => x !== k.nombre) }) }),
    h("span", {}, k.titulo || k.nombre, k.efecto === "externo" ? h("span", { class: "enchufe" }, "pide tu permiso") : null, h("small", {}, k.descripcion)))));
  const fija = a.skillFija && a.skillFija.skill;
  const selFija = h("select", { onchange: (ev) => { const n = ev.target.value; const k = cat.find((x) => x.nombre === n); cambiar({ skillFija: n ? { skill: n, ajustes: valoresDefecto(k) } : null, habilidades: n ? [...new Set([...a.habilidades, n])] : a.habilidades }); } },
    h("option", { value: "" }, "Ninguna: trabaja con su cerebro"), cat.filter((k) => k.fija !== false).map((k) => h("option", { value: k.nombre }, k.titulo || k.nombre)));
  selFija.value = fija || "";
  const out = [lista, campo("En cada latido, sin cerebro (no gasta)", selFija, "Si eliges una, en cada latido hace esa skill y te deja lo que encuentre en su chat. Ejemplo: el Vigía de X cada 10 minutos.")];
  const k = fija && cat.find((x) => x.nombre === fija);
  if (k && (k.ajustes || []).length) out.push(editorAjustesSkill(a, k, cambiar));
  if (fija && !k) out.push(h("small", { class: "nota" }, `Fer Casa no tiene ahora la skill «${fija}».`));
  return out;
}
function valoresDefecto(k) { const o = {}; for (const x of (k && k.ajustes) || []) o[x.clave] = x.defecto; return o; }
function editorAjustesSkill(a, k, cambiar) {
  const val = Object.assign(valoresDefecto(k), (a.skillFija && a.skillFija.ajustes) || {});
  const guardar = (clave, v) => { val[clave] = v; cambiar({ skillFija: { skill: k.nombre, ajustes: Object.assign({}, val) } }); };
  const caja = h("div", { class: "ajustes-skill" }, h("b", {}, `Ajustes de ${k.titulo || k.nombre}`));
  for (const x of k.ajustes) {
    if (x.tipo === "lista") {
      const ta = h("textarea", { rows: String(Math.min(12, Math.max(4, (val[x.clave] || []).length + 1))), onchange: (ev) => guardar(x.clave, ev.target.value.split("\n").map((l) => l.trim()).filter(Boolean)) });
      ta.value = (val[x.clave] || []).join("\n");
      caja.append(campo(x.nombre, ta, x.ayuda || "Uno por línea."));
    } else if (x.tipo === "numero") {
      caja.append(campo(x.nombre, h("input", { type: "number", min: String(x.min ?? 0), step: "1", value: val[x.clave] ?? "", onchange: (ev) => guardar(x.clave, Number(ev.target.value) || x.defecto) }), x.ayuda));
    } else if (x.tipo === "si_no") {
      caja.append(h("label", { class: "cap" }, h("input", { type: "checkbox", checked: !!val[x.clave], onchange: (ev) => guardar(x.clave, ev.target.checked) }), h("span", {}, x.nombre, x.ayuda ? h("small", {}, x.ayuda) : null)));
    } else caja.append(campo(x.nombre, h("input", { value: val[x.clave] ?? "", onchange: (ev) => guardar(x.clave, ev.target.value) }), x.ayuda));
  }
  return caja;
}
const nombreModelo = (id) => (id === BROWSER ? "navegador" : ((modelos.find((m) => m.id === id) || {}).name || id));
// Voz de un agente: modelo y voz concreta (si no eliges, cada agente tiene una distinta)
function selectorVoz(a, cambiar) {
  const aj = ed.e.ajustes, propio = a.voz || { modelo: "", voz: "" };
  const selM = selectorModelo("voz", propio.modelo, { vacio: `La del edificio (${nombreModelo(aj.modeloVoz || BROWSER)})`, extra: [[BROWSER, "Voz del navegador · gratis"]] });
  const selV = h("select", {});
  const llenar = () => {
    const modelo = selM.value || aj.modeloVoz || BROWSER;
    const lista = modelo === BROWSER ? vocesNavegador().map((v) => ({ id: v.voiceURI, name: `${v.name} · ${v.lang}` })) : ((voces.find((m) => m.id === modelo) || {}).voices || []);
    selV.replaceChildren(h("option", { value: "" }, `Distinta para cada agente (ahora: ${nombreVoz(vozDe(Object.assign({}, a, { voz: { modelo: selM.value, voz: "" } })))})`), ...lista.map((v) => h("option", { value: v.id }, v.name)));
    selV.value = [...selV.options].some((o) => o.value === propio.voz) ? propio.voz : "";
  };
  llenar();
  selM.onchange = () => { propio.voz = ""; llenar(); cambiar({ voz: { modelo: selM.value, voz: "" } }); };
  selV.onchange = () => cambiar({ voz: { modelo: selM.value, voz: selV.value } });
  const meta = h("span", { class: "nota" });
  return [campo("Modelo de voz", selM), campo("Su voz", selV), propuestasDe("voz"),
    h("div", { class: "fila-c" }, h("button", { class: "btn mini", type: "button", onclick: () => { desbloquearAudio(); hablarTexto(tr(`Hola, soy ${a.nombre}. Así sueno.`), meta, a); } }, "Probar su voz"), meta)];
}
function confirmar(boton, texto, accion) {
  if (boton.dataset.armado) { accion(); return; }
  const antes = boton.textContent; boton.dataset.armado = "1"; boton.textContent = tr(texto);
  setTimeout(() => { if (boton.isConnected) { delete boton.dataset.armado; boton.textContent = antes; } }, 4000);
}

// ---------------- Actividad: todo, y las consultas a JEV ----------------
const NOMBRE_DEC = { seguir: "seguir", aprovechar: "aprovechar lo que ya hay", parar: "parar", preguntar_jefe: "preguntar al jefe" };
function pintarRegistro() {
  $("actTodo").setAttribute("aria-selected", String(vistaAct === "todo")); $("actJev").setAttribute("aria-selected", String(vistaAct === "jev"));
  const r = $("registro"); r.innerHTML = "";
  if (vistaAct === "jev") {
    const filas = (ed.e.consultasJev || []).slice().reverse().slice(0, 150);
    if (!filas.length) { r.append(h("p", { class: "nota" }, "Aquí aparece cada consulta a JEV: la hora, el agente, lo que iba a hacer, lo que dijo JEV, lo que hizo al final, lo que costó y si sirvió.")); return; }
    for (const c of filas) {
      const prob = c.probabilidades ? Object.entries(c.probabilidades).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${tr(NOMBRE_DEC[k] || k)} ${Math.round(v * 100)} %`).join(" · ") : "";
      const sirvio = (v, t) => h("button", { class: "btn mini", "aria-pressed": String(c.sirvio === v), onclick: () => Motor.ejecutar({ tipo: "jev.sirvio", consulta: c.id, sirvio: c.sirvio === v ? null : v }).then(pintarRegistro).catch(avisar) }, t);
      r.append(h("div", { class: "item jev-consulta" },
        h("div", { class: "jev-fila" }, h("span", { class: "hora" }, fecha(c.ts)), h("span", {}, h("b", {}, c.nombre), ": ", c.accion), h("span", { class: "coste" }, (c.costeJev || 0) + (c.coste || 0) > 0 ? fmt((c.costeJev || 0) + (c.coste || 0)) : "")),
        h("div", { class: "jev-fila" }, h("span", {}, "JEV:"), h("span", {}, h("span", { class: "dec " + (c.decision || "") }, c.decision ? tr(NOMBRE_DEC[c.decision] || c.decision) : "sin respuesta"), prob ? h("small", { class: "nota" }, " · " + prob) : null, c.texto && !c.decision ? h("small", { class: "nota" }, " · " + c.texto) : null), h("span", {})),
        h("div", { class: "jev-fila" }, h("span", {}, "Hizo:"), h("span", {}, c.hizo || tr(NOMBRE_DEC[c.final] || c.final || "—")), h("span", { class: "fila-c" }, h("small", { class: "nota" }, "¿Sirvió?"), sirvio(true, "Sí"), sirvio(false, "No")))));
    }
    return;
  }
  const filas = ed.e.registro.slice().reverse().slice(0, 150);
  if (!filas.length) { r.append(h("p", { class: "nota" }, "Aquí aparecerá todo lo que hacen los agentes: latidos, tareas, consultas a JEV, monedas, reuniones, búsquedas de Memory y el gasto.")); return; }
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
  const pl = ed.e.plantas.find((p) => p.id === a.planta), edif = ed.e.nombre || "tu edificio";
  if (a.rol === "jefe") {
    const quien = /^(jefe|boss)$/i.test(sinAcentos(a.nombre.trim())) ? tr(`el jefe de ${edif}`) : tr(`${a.nombre}, el jefe de ${edif}`);
    if (ed.e.agentes.length === 1) return `Hola, soy ${quien}. Cuéntame qué necesitas. Ahora trabajo solo: si quieres un equipo, mira «Agentes de serie» o pídeme un agente nuevo.`;
    return `Hola, soy ${quien}. Cuéntame qué necesitas y lo reparto entre el equipo. Si quieres un agente nuevo o reunir a varios en la sala de reuniones, pídemelo.`;
  }
  if (!conversa(a)) return a.rol === "jev" ? `Soy ${a.nombre}. Solo decido antes de gastar: seguir, aprovechar lo que ya hay, parar o preguntar al jefe. No converso; mis decisiones están en Actividad → Consultas a JEV.`
    : `Soy ${a.nombre}. Trabajo con reglas fijas, sin cerebro, así que no converso. En mi ficha ves lo que hago.`;
  const que = QUE_HACE[a.rol] ? tr(QUE_HACE[a.rol]) : a.objetivo ? tr("Mi objetivo:") + " " + a.objetivo : tr("Pregúntame por mi trabajo o encárgame algo.");
  return tr(`Hola, soy ${a.nombre}, ${rolTxt(a).toLowerCase()} en ${pl ? pl.nombre : tr(edif)}.`) + " " + que;
}
const quienPropone = (x) => (x === "jev" ? "JEV" : x === "interventor" ? tr("el Interventor") : x === "jefe" ? tr("el jefe") : x);
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
    h("p", {}, esApp() ? "Para que pueda contestarte, pega tu clave de OpenRouter en Ajustes. Se queda solo en este ordenador." : modo === "casa" ? "Para que pueda contestarte, escribe en Ajustes el PIN que pusiste al arrancar Fer Casa." : "Para que pueda contestarte, pega tu clave de OpenRouter en Ajustes. Se queda solo en este navegador."),
    h("button", { class: "btn mini", onclick: () => abrirCajon("ajustes") }, "Abrir Ajustes"))));
  const habla = a.capacidades.includes("hablar");
  for (const x of conv) {
    if (x.role === "user") m.append(h("div", { class: "msg me" }, h("div", { class: "burbuja" }, crudo(x.content)), x.voz ? h("div", { class: "meta" }, x.voz) : null));
    else if (x.role === "assistant") {
      const meta = h("div", { class: "meta" }, h("span", {}, x.proveedor ? tr(`${x.modelo || ""} · ${((ed.proveedor(x.proveedor) || {}).corto) || x.proveedor}: tu suscripción`) + (x.suscripcion ? ` (≈${fmt(x.suscripcion)})` : "") : `${x.modelo || ""} · ${fmt(x.coste || 0)}`),
        habla ? h("button", { onclick: (ev) => { desbloquearAudio(); hablarTexto(x.content, ev.target.parentElement, a); } }, "▶ Escuchar") : null,
        h("span", { class: "monedas-msg" }, botonMoneda(a, "oro"), botonMoneda(a, "roja")));
      m.append(h("div", { class: "msg bot" }, h("div", { class: "burbuja", html: markdown(x.content) }, medios(x)),
        (x.eventos || []).length ? h("div", { class: "chips" }, x.eventos.map((e) => h("span", { class: "chip" }, e))) : null,
        x.reunion ? tarjetaReunion(x.reunion) : null, meta));
    } else if (x.role === "informe") {
      const autor = ed.agenteExacto(x.agente);
      const pr = x.propuesta && (ed.e.propuestas || []).find((y) => y.id === x.propuesta);
      const botones = pr ? (pr.estado === "pendiente" ? h("div", { class: "fila-c propuesta" },
        h("button", { class: "btn primario mini", onclick: () => Motor.ejecutar({ tipo: "aceptarPropuesta", propuesta: pr.id }).then((r) => { const n = ed.agenteExacto(r.id); if (n) { seleccion = n.id; fichaTab = "identidad"; } pintar(); pintarChat(true); }).catch(avisar) }, tr(`Crear a ${pr.ficha.nombre || tr("este agente")}`)),
        h("button", { class: "btn mini", onclick: () => abrirCajon("agente", { ficha: Object.assign({}, pr.ficha, { planta: pr.ficha.planta || "nuevo", plantaNueva: pr.ficha.plantaNueva || { nombre: "", funcion: "" } }), propuesta: pr.id }) }, "Verla y retocarla"),
        h("button", { class: "btn mini", onclick: () => Motor.ejecutar({ tipo: "descartarPropuesta", propuesta: pr.id }).then(() => pintarChat(true)).catch(avisar) }, "Descartar"))
        : h("div", { class: "meta" }, pr.estado === "creada" ? "Creado." : "Descartado.")) : null;
      m.append(h("div", { class: "msg informe" }, h("span", { class: "quien" }, tr(`Informe de ${x.nombre}`)), h("div", { class: "burbuja", html: markdown(x.content) }, medios(x)), botones,
        x.reunion ? h("div", { class: "meta" }, h("button", { onclick: () => abrirSalas(x.reunion) }, "Ver la reunión")) : null,
        autor && autor.rol !== "jefe" && !x.reunion ? h("div", { class: "meta" }, h("span", { class: "monedas-msg" }, botonMoneda(autor, "oro"), botonMoneda(autor, "roja"))) : null));
    }
  }
  for (const e of pendientesError) m.append(h("div", { class: "msg error" }, h("div", { class: "burbuja" }, e)));
  if (pensando) m.append(h("div", { class: "msg bot escribiendo" }, escribiendo ? h("div", { class: "burbuja", html: markdown(escribiendo) }) : h("div", { class: "burbuja" }, h("span", { class: "pensando", "aria-label": "Pensando" }, h("i"), h("i"), h("i")))));
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
    const el = m.tipo === "audio" ? h("audio", { controls: true, preload: "none" }) : h("img", { alt: m.texto || "Imagen creada" });
    const ya = mediosCache.get(m.id) || (m.tipo === "audio" ? audiosSesion : imgsSesion).get(m.texto);
    if (ya) el.src = ya;
    else urlMedio(m).then((u) => { if (u) el.src = u; else if (el.isConnected) el.replaceWith(h("small", { class: "nota" }, m.tipo === "audio" ? "(la música no está en este aparato)" : "(la imagen no está en este aparato)")); });
    return el;
  });
  // de la versión 6: solo las de esta sesión
  return [...(x.imagenes || []).map((t) => imgsSesion.get(t)).filter(Boolean).map((u) => h("img", { src: u, alt: "Imagen creada" })),
    ...(x.audios || []).map((t) => audiosSesion.get(t)).filter(Boolean).map((u) => h("audio", { src: u, controls: true, preload: "none" }))];
}
// Una reunión que propone el jefe: no empieza hasta que confirmas las rondas
function tarjetaReunion(id) {
  const r = (ed.e.reuniones || []).find((x) => x.id === id); if (!r) return null;
  const nombres = r.participantes.map((pid) => (ed.agenteExacto(pid) || {}).nombre).filter(Boolean).join(", ");
  if (r.estado !== "propuesta") return h("div", { class: "tarjeta-reunion" }, h("b", {}, `Reunión «${r.titulo}»`), h("span", { class: "nota" }, `${ESTADO_REUNION[r.estado] || r.estado} · ${nombres}`), h("div", {}, h("button", { class: "btn mini", onclick: () => abrirSalas(r.id) }, "Ver en la sala")));
  const rondas = h("input", { type: "number", min: "1", step: "1", value: r.rondas });
  const est = h("span", { class: "nota" });
  const calc = () => { const e = ed.estimarReunion(Object.assign({}, r, { rondas: Math.max(1, parseInt(rondas.value, 10) || 1) })); est.textContent = tr(`Coste estimado: ≈${fmt(e.coste)} (${e.llamadas} llamadas)`); };
  rondas.oninput = calc; calc();
  return h("div", { class: "tarjeta-reunion" }, h("b", {}, `El jefe propone la reunión «${r.titulo}»`), h("span", { class: "nota" }, `En la mesa: ${nombres}`),
    h("div", { class: "orden" }, crudo(r.ordenDelDia)),
    h("div", { class: "fila-c" }, h("span", {}, "Rondas"), rondas, est),
    h("div", { class: "fila-c" }, h("button", { class: "btn primario mini", onclick: () => empezarReunion(r.id, parseInt(rondas.value, 10) || r.rondas) }, "Empezar la reunión"),
      h("button", { class: "btn mini", onclick: () => Motor.ejecutar({ tipo: "reunion.cancelar", reunion: r.id }).then(() => { pintar(); pintarChat(true); }).catch(avisar) }, "No hacerla")));
}
const ESTADOS_CHAT = { idle: "Listo para hablar", loading: "Preparando el oído…", listening: "Te escucho. Habla cuando quieras", hearing: "Te estoy oyendo…", transcribing: "Entendiendo lo que has dicho…", thinking: "Pensando…", speaking: "Hablando. Pulsa «Parar» o habla tú para cortarle" };
let estadoJefe = "idle";
function ponerEstadoJefe(s) { estadoJefe = s; pintarChatCab(); }
function pintarChatCab() {
  if (!chatId) return;
  const a = agenteChat(); if (!a) return;
  const pl = ed.e.plantas.find((p) => p.id === a.planta), est = estadoVisible(a);
  $("jefeNombre").textContent = a.nombre;
  $("jefeRol").textContent = `${rolTxt(a)}${pl ? " · " + pl.nombre : ""}`;
  $("jefeEstado").textContent = tr(est === "congelado" || est === "apagado" ? `${ESTADO_TXT[est]}${a.motivoEstado ? " · " + a.motivoEstado : ""}`
    : estadoJefe === "thinking" && a.rol === "jefe" ? "Pensando y repartiendo…" : ESTADOS_CHAT[estadoJefe]);
  $("jefeCab").classList.toggle("hablando", estadoJefe === "speaking");
  $("pararVoz").hidden = estadoJefe !== "speaking";
  const av = $("avatar");
  if (av.dataset.quien !== a.id) { av.dataset.quien = a.id; av.src = figura(a.aspecto); }   // al momento la figura pequeña; enseguida, la grande
  asegurarFiguraGrande(a.aspecto).then((u) => { if (av.dataset.quien === a.id && av.getAttribute("src") !== u) av.src = u; });
  // qué se puede hacer en este chat
  const habla = conversa(a), oye = habla && a.capacidades.includes("oir"), dice = habla && a.capacidades.includes("hablar"), ve = habla && a.capacidades.includes("ver");
  $("texto").disabled = !habla; $("enviar").disabled = !habla;
  $("texto").placeholder = tr(habla ? `Escribe a ${a.nombre}…` : `${a.nombre} no conversa`);
  $("micro").disabled = !oye; $("clip").disabled = !ve; $("altavoz").disabled = !dice;
  if (!oye) $("micro").title = tr(habla ? `${a.nombre} no tiene la capacidad «Oír». Actívala en su ficha.` : "No conversa");
  if (!ve) $("clip").title = tr(habla ? `${a.nombre} no tiene la capacidad «Ver imágenes».` : "No conversa"); else $("clip").title = tr("Adjuntar una imagen para que la vea");
  $("altavoz").title = tr(dice ? "Leer sus respuestas en voz alta" : `${a.nombre} no tiene la capacidad «Hablar».`);
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
    const vozTxt = voz ? (voz.seconds ? `por voz · ${voz.seconds.toLocaleString(LOCALE, { maximumFractionDigits: 1 })} s · ${voz.model} · ${voz.estimated ? "≈" : ""}${fmt(voz.cost)}` : `por voz · ${voz.model} · gratis`) : "";
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
    pendientesError.push(err.mostrado ? err.message : "No hay conexión: " + err.message); pintarChat(true);
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
  nota(metaEl, tr("voz:") + " " + modelo + " · " + tr(`${chars} caracteres`) + " · " + (est ? "≈" : "") + fmt(total) + (est ? " " + tr("(estimado)") : ""));
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
  if (!v.voz) return v.modelo === BROWSER ? "automática" : "la del modelo";
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
  if (!r.ok) { let det = ""; try { det = ((await r.json()).error || {}).message || ""; } catch {} throw new Error(`La voz falló (${r.status}${det ? ": " + det : ""}). Prueba otra en su ficha → Capacidades.`); }
  const genId = r.headers.get("X-Generation-Id"), buf = await r.arrayBuffer();
  return { url: URL.createObjectURL(formato === "pcm" ? pcmAWav(buf) : new Blob([buf], { type: "audio/mpeg" })), formato, genId, secs: formato === "pcm" ? buf.byteLength / 48000 : limpio.length / 15, chars: limpio.length };
}
function siguienteFrase() {
  const turno = cola.turno;
  if (turno !== turnoVoz || cola.sonando) return;
  if (!cola.frases.length) { if (cola.cerrada) terminarVoz(); return; }
  if (cola.modelo !== BROWSER && ed.usoPresupuesto() >= 1) { nota(cola.meta, "Tope de gasto alcanzado: no leo en voz alta."); cola.frases = []; terminarVoz(); return; }
  const frase = cola.frases.shift(), limpio = paraVoz(frase);
  cola.sonando = true; cola.dicho += " " + limpio;
  const seguir = () => { if (turno !== turnoVoz) return; cola.sonando = false; siguienteFrase(); };
  if (cola.modelo === BROWSER) {
    if (!window.speechSynthesis) { nota(cola.meta, "Este navegador no tiene voz."); cola.frases = []; terminarVoz(); return; }
    const u = new SpeechSynthesisUtterance(limpio), v = vocesNavegador().find((x) => x.voiceURI === cola.voz);
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = idiomaVoz();
    u.onend = u.onerror = seguir;
    ponerEstadoJefe("speaking"); speechSynthesis.speak(u); nota(cola.meta, "voz del navegador · gratis");
    return;
  }
  (async () => {
    try {
      const prep = cola.prep && cola.prep.texto === frase ? cola.prep.p : pedirVoz(limpio, cola.modelo, cola.voz);
      cola.prep = null;
      if (cola.chars === 0) nota(cola.meta, "preparando voz…");
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
    } catch (err) { if (turno !== turnoVoz) return; nota(cola.meta, err.message || "No se pudo reproducir la voz."); cola.frases = []; terminarVoz(); }
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
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.async = true; if (sello) { s.integrity = sello; s.crossOrigin = "anonymous"; } s.onload = res; s.onerror = () => rej(new Error("no se pudo descargar " + src.split("/npm/")[1])); document.head.append(s); });
}
async function asegurarVAD() {
  if (window.vad && window.vad.MicVAD) return;
  if (!window.ort) await cargarScript(ORT_BASE + "ort.wasm.min.js", SELLOS["ort.wasm.min.js"]);
  await cargarScript(VAD_BASE + "bundle.min.js", SELLOS["bundle.min.js"]);
  if (!window.vad || !window.vad.MicVAD) throw new Error("el detector de voz no arrancó");
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
  if (ed.usoPresupuesto() >= 1) throw Object.assign(new Error("Tope de gasto alcanzado: el oído de pago está parado. Sube el tope en Gasto o usa el oído del navegador."), { mostrado: true });
  const a = agenteChat(), modelo = oidoDe(a), secs = muestras.length / 16000;
  const fd = new FormData(); fd.append("model", modelo); fd.append("file", aWav(muestras), "voz.wav");
  const r = await fetch(apiBase() + "/audio/transcriptions", { method: "POST", headers: Object.assign(apiCab(), { "X-Title": "Fer Agent" }), body: fd });
  let d = null; try { d = await r.json(); } catch {}
  if (!r.ok) throw Object.assign(new Error(explicarError(r.status, (d && d.error && d.error.message) || "")), { mostrado: true });
  const u = (d && d.usage) || {};
  let cost = typeof u.cost === "number" ? u.cost : null, estimated = false;
  if (cost === null) { const m = oidos.find((x) => x.id === modelo); cost = m ? precioOidoSegundo(m) * secs : 0; estimated = true; }
  try { await Motor.ejecutar({ tipo: "gastoExterno", id: a.id, coste: cost, estimado: estimated, concepto: "oído " + modelo }); } catch {}
  return { text: ((d && d.text) || "").trim(), cost, estimated, seconds: u.seconds || secs, model: modelo };
}
function microUI() {
  const a = chatId ? agenteChat() : null;
  $("micro").setAttribute("aria-pressed", String(conv.on));
  if (!$("micro").disabled) $("micro").title = tr(conv.on ? "Colgar (terminar la conversación por voz)" : `Hablar con ${a ? a.nombre : "el agente"} por el micro (modo conversación)`);
  $("pista").textContent = conv.on ? tr("Conversación por voz: habla y calla; envío solo. Toca el micro para colgar.") : "";
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
    let texto = entrada, voz = { model: "oído del navegador", cost: 0, estimated: false, seconds: null };
    if (typeof entrada !== "string") { ponerEstadoJefe("transcribing"); voz = await transcribir(entrada); texto = voz.text; }
    if (texto && esEco(texto, inicio)) { texto = ""; }   // era su propia voz por el altavoz: no se envía
    if (texto && conv.on) await enviar(texto, voz);
  } catch (err) { pendientesError.push(err.mostrado ? err.message : "No se pudo entender el audio: " + err.message); pintarChat(true); }
  finally {
    conv.procesando = false; await reanudarOido();
    if (conv.siguiente && conv.on) { const s = conv.siguiente; conv.siguiente = null; oido(s.entrada, s.inicio); }
  }
}
function errorMicro(err) {
  const n = (err && err.name) || "", raw = String((err && (err.message || err.error)) || err || "");
  const det = " (" + tr("detalle técnico:") + " " + [n, raw].filter(Boolean).join(": ") + ")";
  let dentro = false; try { dentro = window.top !== window.self; } catch { dentro = true; }
  if (dentro) return tr("Estás usando Fer Agent dentro de otra ventana (una vista previa). Ahí el navegador no deja usar el micrófono. Ábrela en una pestaña normal.") + det;
  if (!window.isSecureContext || !navigator.mediaDevices) return tr("El micrófono solo funciona con una dirección segura (https://… o localhost). Si entras a Fer Casa desde otro aparato por la red de casa, el micro no está permitido: usa el teclado.") + det;
  if (n === "NotAllowedError" && /system/i.test(raw)) return tr("Tu ordenador no deja al navegador usar el micrófono. En un Mac: Ajustes del Sistema → Privacidad y seguridad → Micrófono → activa tu navegador y vuelve a abrirlo.") + det;
  if (n === "NotAllowedError" || n === "SecurityError" || /not-allowed|permission|denied/i.test(raw)) return tr("El micrófono está bloqueado para esta web. Pulsa el icono a la izquierda de la dirección → Micrófono → Permitir, y recarga.") + det;
  if (n === "NotFoundError") return tr("No encuentro ningún micrófono en este aparato.") + det;
  if (n === "NotReadableError") return tr("Otro programa está usando el micrófono (Zoom, Meet…). Ciérralo y vuelve a probar.") + det;
  return tr("No se pudo encender el oído.") + det;
}
async function empezarConversacion() {
  const e = oidoDe(agenteChat());
  if (!hayAcceso() && e !== BROWSER) { abrirCajon("ajustes"); return; }
  conv.on = true; microUI(); ponerEstadoJefe("loading");
  try {
    if (e === BROWSER) {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) throw new Error("este navegador no tiene oído propio. Elige Whisper en su ficha → Capacidades → Oír");
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
const CLASE_TXT = { accion: "Acción fuera de la web", agente: "Agente nuevo", reunion: "Reunión", moneda: "Moneda", leccion: "Lección nueva", modelo: "Modelo recomendado", falta: "Le falta algo" };
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
  v.replaceChildren(cabPantalla("Lo que espera tu sí"), h("div", { class: "bandeja" },
    h("h1", {}, "Bandeja de autorizaciones"),
    h("p", { class: "nota-osc" }, "Aquí llega todo lo que espera tu sí: quién lo pide, qué es y cuánto cuesta. Nada de esto se hace sin ti."),
    h("p", { class: "nota-osc" }, modo === "casa" ? (casaInfo.telegram ? "Con Fer Casa y Telegram, también te llega al móvil con botones para aprobar o rechazar." : "Desde el móvil: abre la dirección de Fer Casa en tu red de casa, o conecta Telegram (LEEME) para aprobar desde cualquier sitio.")
      : "Desde el móvil: con la carpeta del cerebro en Google Drive conectada en los dos aparatos, el móvil ve la misma bandeja."),
    items.length ? items.map(tarjetaPeticion) : h("p", { class: "bandeja-vacia" }, "Nada pendiente. Cuando un agente quiera hacer algo con dinero o fuera de la web, o haya algo que aprobar, aparecerá aquí.")));
  v.scrollTop = sc;
}
function tarjetaPeticion(x) {
  const decidir = (si, extra, boton) => {
    if (boton) boton.disabled = true;
    return Motor.ejecutar(Object.assign({ tipo: "bandeja.decidir", clase: x.clase, id: x.id, si }, extra || {}))
      .then((r) => { if (r && r.estado) avisoFlotante(r.estado === "hecha" ? "Hecho: " + String(r.resultado || "").slice(0, 160) : "No se pudo: " + String(r.resultado || "").slice(0, 160)); pintar(); pintarBandeja(true); })
      .catch((err) => { if (boton) boton.disabled = false; avisar(err); });
  };
  const b = (txt, f, primario) => { const el = h("button", { class: "btn mini" + (primario ? " primario" : ""), type: "button" }, txt); el.onclick = () => f(el); return el; };
  const sinCoste = ["falta", "moneda", "leccion", "modelo"].includes(x.clase);
  const coste = sinCoste ? "" : x.coste > 0 ? (x.porDia ? `≈${fmt(x.coste)} al día` : `≈${fmt(x.coste)}`) : x.clase === "accion" ? "sin coste" : "≈0 $";
  const partes = [h("div", { class: "p-cab" }, h("span", { class: "clase-pet" }, CLASE_TXT[x.clase] || x.clase), h("span", { class: "p-quien" }, x.quien), h("span", { class: "nota-osc" }, fecha(x.ts)), coste ? h("span", { class: "p-coste" }, coste) : null),
    h("div", { class: "p-que" }, x.que)];
  let acc = [];
  if (x.clase === "leccion") {
    const ta = h("textarea", { rows: "2", maxlength: "300", "aria-label": "Texto de la lección" }); ta.value = x.detalle;
    partes.push(h("p", { class: "p-det" }, tr(`Motivo de la moneda: «${x.motivo}».`) + " " + tr(x.redactada ? "Un modelo barato la ha convertido en regla; retócala si quieres." : "No se pudo redactar con el modelo barato: retócala tú.")), ta);
    acc = [b("Aprobar", (el) => decidir(true, { texto: ta.value }, el), true),
      b("Redactar otra vez", (el) => { el.disabled = true; Motor.ejecutar({ tipo: "leccion.redactar", leccion: x.id }).then(() => pintarBandeja(true)).catch(avisar); }),
      b("Descartar", (el) => decidir(false, null, el))];
  } else if (x.clase === "reunion") {
    const rondas = h("input", { type: "number", min: "1", step: "1", value: x.rondas, "aria-label": "Rondas" });
    const est = h("span", { class: "nota-osc" });
    const calc = () => { const r = ed.e.reuniones.find((y) => y.id === x.id); if (!r) return; const e = ed.estimarReunion(Object.assign({}, r, { rondas: Math.max(1, parseInt(rondas.value, 10) || 1) })); est.textContent = tr(`≈${fmt(e.coste)} (${e.llamadas} llamadas)`); };
    rondas.oninput = calc; calc();
    partes.push(h("p", { class: "p-det" }, x.detalle), h("div", { class: "p-acc" }, h("span", {}, "Rondas"), rondas, est));
    acc = [b("Empezar la reunión", (el) => decidir(true, { rondas: parseInt(rondas.value, 10) || x.rondas }, el).then(() => abrirSalas(x.id)), true), b("No hacerla", (el) => decidir(false, null, el)), b("Ver en la sala", () => abrirSalas(x.id))];
  } else if (x.clase === "agente") {
    partes.push(h("p", { class: "p-det" }, x.detalle));
    const pr = (ed.e.propuestas || []).find((y) => y.id === x.id);
    acc = [b("Crear", (el) => decidir(true, null, el), true),
      pr ? b("Verla y retocarla", () => abrirCajon("agente", { ficha: Object.assign({}, pr.ficha, { planta: pr.ficha.planta || "nuevo", plantaNueva: pr.ficha.plantaNueva || { nombre: "", funcion: "" } }), propuesta: pr.id })) : null,
      b("Descartar", (el) => decidir(false, null, el))];
  } else if (x.clase === "falta") {
    partes.push(h("p", { class: "p-det" }, entreComillas(x.detalle)), h("p", { class: "nota-osc", style: { margin: 0 } }, "Mientras tanto no avanza solo en su objetivo (no gasta). Dale lo que pide en su ficha, o cámbiale el objetivo."));
    const a = ed.agenteExacto(x.id);
    acc = [b("Ya lo tiene", (el) => decidir(true, null, el), true), a ? b("Ver su ficha", () => { cerrarPantalla(); fichaTab = "capacidades"; elegir(a); }) : null];
  } else {
    if (x.detalle) partes.push(h("p", { class: "p-det" }, x.detalle));
    acc = [b(x.clase === "accion" ? "Aprobar y hacerlo" : x.clase === "moneda" ? "Confirmar" : "Aceptar", (el) => decidir(true, null, el), true), b(x.clase === "accion" ? "Rechazar" : "Descartar", (el) => decidir(false, null, el))];
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
  const hecho = (r) => { const n = (r.vueltos || []).length, sin = r.sinSitio || []; avisoFlotante((n ? tr(n === 1 ? `Instalado: ${r.vueltos.join(", ")}.` : `Instalados: ${r.vueltos.join(", ")}.`) : tr("No faltaba ninguno.")) + (sin.length ? " " + tr(`No caben: ${sin.join("; ")}.`) : "")); pintar(); pintarSerie(true); };
  const tarjeta = (x) => h("article", { class: "serie-ag" + (x.instalado ? " instalado" : "") },
    (() => { const im = h("img", { src: figura(x.aspecto), alt: "", class: "serie-pj" }); asegurarFigura(x.aspecto).then((u) => { im.src = u; }); return im; })(),
    h("div", { class: "serie-txt" },
      h("div", { class: "p-cab" }, h("b", { class: "serie-nombre" }, x.instalado && x.nombreAhora ? x.nombreAhora : x.nombre), h("span", { class: "clase-pet" }, x.papel),
        x.instalado ? h("span", { class: "serie-estado" }, x.id === "jefe" ? "Siempre está" : "En tu edificio") : null),
      h("p", { class: "p-det" }, x.descripcion),
      h("div", { class: "p-acc" },
        x.instalado
          ? (x.id === "jefe" ? null : [h("button", { class: "btn mini", type: "button", onclick: () => { cerrarPantalla(); const a = ed.agenteExacto(x.id); if (a) elegir(a); } }, "Ver su ficha"),
              h("button", { class: "btn mini peligro", type: "button", onclick: (ev) => confirmar(ev.target, "¿Quitarlo? Se borra con su memoria corta. Pulsa otra vez", () => Motor.ejecutar({ tipo: "borrarAgente", id: x.id }).then(() => { pintar(); pintarSerie(true); }).catch(avisar)) }, "Quitar del edificio")])
          : h("button", { class: "btn mini primario", type: "button", onclick: (ev) => { ev.target.disabled = true; Motor.ejecutar({ tipo: "instalarSerie", id: x.id }).then(hecho).catch((err) => { ev.target.disabled = false; avisar(err); }); } }, "Instalar"))));
  v.replaceChildren(cabPantalla("Agentes de serie"), h("div", { class: "bandeja catalogo-serie" },
    h("h1", {}, "Agentes de serie"),
    h("p", { class: "nota-osc" }, "Los agentes que trae Fer Agent. Un edificio nuevo empieza solo con el jefe: si quieres un solo agente, ya lo tienes. Instala los que quieras, cuando quieras; si quitas uno, aquí vuelve a estar."),
    faltan.length ? h("div", { class: "fila-c" }, h("button", { class: "btn primario", type: "button", onclick: (ev) => { ev.target.disabled = true; Motor.ejecutar({ tipo: "instalarSerie" }).then(hecho).catch((err) => { ev.target.disabled = false; avisar(err); }); } },
      tr(`Instalar el equipo recomendado (${faltan.length === 1 ? tr("falta 1") : tr(`faltan ${faltan.length}`)})`)),
      h("span", { class: "nota-osc" }, "Cúpula: el jefe y los dos sabios. Planta técnica: Tecno, Arturito, el Creador, JEV y el Interventor. Vestíbulo: Memory.")) : h("p", { class: "nota-osc" }, "Tienes instalado todo el equipo recomendado."),
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
const cabPantalla = (titulo) => h("header", { class: "pantalla-cab" }, h("button", { class: "volver-btn", type: "button", onclick: volverAtras }, "← Volver al edificio"), h("span", { class: "grow" }), titulo ? h("span", { class: "nota-osc" }, titulo) : null);
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
  const caja = h("div", { class: "mes" }, h("h1", {}, "Agente del mes"), h("p", { class: "nota-osc" }, `${mes[0].toUpperCase() + mes.slice(1)}. Ordenados por monedas (doradas menos rojas); a igualdad, gana el que menos ha gastado.`));
  if (podio.length) {
    const orden = podio.length === 3 ? [podio[1], podio[0], podio[2]] : podio.length === 2 ? [podio[1], podio[0]] : [podio[0]];
    caja.append(h("div", { class: "podio", style: podio.length < 3 ? { gridTemplateColumns: `repeat(${podio.length}, minmax(0, 260px))`, justifyContent: "center" } : {} }, orden.map((f) => {
      const im = h("img", { alt: "", src: figura(f.a.aspecto) }); asegurarFiguraGrande(f.a.aspecto).then((u) => { im.src = u; });
      const puesto = podio.indexOf(f) + 1;
      return h("div", { class: puesto === 1 ? "primero" : "" }, h("span", { class: "puesto" }, puesto === 1 ? "Agente del mes" : `${puesto}.º`), im, h("b", {}, f.a.nombre),
        h("small", {}, `${f.oro} ${tr(f.oro === 1 ? "dorada" : "doradas")} · ${f.rojas} ${tr(f.rojas === 1 ? "roja" : "rojas")}${f.gasto > 0 ? " · " + fmt(f.gasto) : ""}`));
    })));
  } else caja.append(h("p", { class: "nota-osc" }, "Todavía no hay monedas este mes. Dalas desde el chat de cada agente (debajo de cada respuesta) o desde su ficha."));
  const pend = (ed.e.monedas || []).filter((m) => m.estado === "propuesta");
  if (pend.length) caja.append(h("div", { class: "seccion-osc" }, h("h2", {}, "Propuestas que esperan tu decisión"),
    h("p", { class: "nota-osc", style: { margin: 0 } }, "JEV y el Interventor proponen monedas rojas cuando ven que alguien falla o gasta de más. Solo cuentan si las confirmas."), pend.map(filaMonedaPropuesta)));
  caja.append(h("div", { class: "seccion-osc" }, h("h2", {}, "Clasificación"),
    h("table", { class: "ranking" }, h("thead", {}, h("tr", {}, h("th", {}, "#"), h("th", {}, "Agente"), h("th", {}, "Doradas"), h("th", {}, "Rojas"), h("th", {}, "Saldo"), h("th", {}, "Gasto del mes"), h("th", {}, "Dar moneda"))),
      h("tbody", {}, filas.map((f, i) => h("tr", {}, h("td", {}, i + 1), h("td", {}, h("img", { src: figura(f.a.aspecto), alt: "" }), h("b", {}, f.a.nombre), " ", h("small", { class: "nota-osc" }, rolTxt(f.a))),
        h("td", {}, f.oro || "—"), h("td", {}, f.rojas || "—"), h("td", {}, f.saldo > 0 ? "+" + f.saldo : f.saldo || "—"), h("td", {}, f.gasto > 0 ? fmt(f.gasto) : "—"),
        h("td", { class: "dar" }, botonMoneda(f.a, "oro"), botonMoneda(f.a, "roja"))))))));
  const recientes = (ed.e.monedas || []).filter((m) => m.estado === "confirmada").slice(-12).reverse();
  if (recientes.length) caja.append(h("div", { class: "seccion-osc" }, h("h2", {}, "Últimas monedas"),
    recientes.map((m) => h("div", { class: "fila-moneda" }, h("span", { class: "moneda " + m.tipo }), h("span", { class: "grow" }, h("b", {}, m.nombre), " · ", crudo(m.motivo)), h("small", { class: "nota-osc" }, `${fecha(m.ts)} · ${m.propone === "tú" ? tr("de ti") : tr(`propuesta de ${quienPropone(m.propone)}`)}`)))));
  v.replaceChildren(cabPantalla("Monedas doradas: buen trabajo · rojas: alucinar o gastar en balde"), caja);
  v.scrollTop = sc;
}

// =====================================================================
// Salas de reuniones: hasta 10 en la mesa, con orden del día; modera el jefe y al final, el acta
// =====================================================================
const ESTADO_REUNION = { propuesta: "propuesta por el jefe: falta tu sí", lista: "convocada: lista para empezar", "en curso": "en curso", terminada: "terminada", interrumpida: "interrumpida", cancelada: "cancelada" };
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
  const lista = h("div", { class: "salas-lista" }, h("h1", {}, "Salas de reuniones"),
    h("button", { class: "btn primario", onclick: () => { salaSel = "nueva"; pintarSalas(true); } }, "Nueva reunión"),
    reus.map((r) => h("button", { class: "item-sala" + (r.id === salaSel ? " sel" : ""), type: "button", onclick: () => { salaSel = r.id; pintarSalas(true); } },
      h("b", {}, crudo(r.titulo)), h("small", {}, `${tr(ESTADO_REUNION[r.estado] || r.estado)} · ${fecha(r.creada)} · ${r.participantes.length} en la mesa`))));
  const r = reus.find((x) => x.id === salaSel);
  v.replaceChildren(cabPantalla("Convoca tú o el jefe · modera el jefe · al final, el acta"), h("div", { class: "salas" }, lista, r ? vistaReunion(r) : formularioReunion()));
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
    cont.append(h("span", { class: "etq-asiento" + (a.rol === "jefe" ? " modera" : ""), style: { left: x + "%", top: (y + 1.5) + "%" } }, a.nombre));
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
    h("p", { class: "nota-osc", style: { margin: 0 } }, `${tr(ESTADO_REUNION[r.estado] || r.estado)} · ${tr(r.convoca === "tú" ? "convocas tú" : "convoca el jefe")} · ${fecha(r.creada)}${r.coste > 0 ? " · " + tr(`costó ${fmt(r.coste)}`) : ""}${r.estado === "en curso" && r.rondaActual ? " · " + tr(`ronda ${r.rondaActual} de ${r.rondas}`) : ""}`),
    mesa(r), h("div", { class: "orden" }, h("b", {}, "Orden del día"), "\n", crudo(String(r.ordenDelDia || "").replace(/^\s*\**\s*(orden del d[ií]a|agenda)\s*\**\s*[:.\-–]?\s*/i, ""))));   // si el jefe ya lo escribió con su título, no se repite
  if (r.estado === "propuesta" || r.estado === "lista") {
    const rondas = h("input", { type: "number", min: "1", step: "1", value: r.rondas, style: { width: "70px" } });
    const est = h("span", { class: "nota-osc" });
    const calc = () => { const e = ed.estimarReunion(Object.assign({}, r, { rondas: Math.max(1, parseInt(rondas.value, 10) || 1) })); est.textContent = tr(`Coste estimado: ≈${fmt(e.coste)} (${e.llamadas} llamadas, unos 1.500 tokens de entrada y 250 de salida cada una)`); };
    rondas.oninput = calc; calc();
    caja.append(h("div", { class: "form-osc" },
      h("div", { class: "fila-c" }, h("span", {}, "Rondas"), rondas, est),
      h("div", { class: "fila-c" }, h("button", { class: "btn primario", disabled: !hayAcceso(), onclick: () => empezarReunion(r.id, parseInt(rondas.value, 10) || r.rondas) }, r.estado === "propuesta" ? "Sí, empezar la reunión" : "Empezar la reunión"),
        h("button", { class: "btn", onclick: () => Motor.ejecutar({ tipo: "reunion.cancelar", reunion: r.id }).then(() => pintarSalas(true)).catch(avisar) }, "No hacerla")),
      hayAcceso() ? null : h("small", { class: "nota-osc" }, "Falta tu clave de OpenRouter (Ajustes).")));
  }
  if (r.intervenciones.length) caja.append(h("div", { class: "transcripcion" }, h("h3", {}, "Lo que se dijo"), r.intervenciones.map((x) => h("div", { class: "intervencion" + (x.modera ? " modera" : "") },
    h("div", {}, h("b", {}, x.nombre), h("small", {}, " · " + tr(`ronda ${x.ronda || "—"}`) + (x.modera ? " · " + tr("modera") : "") + (x.coste > 0 ? " · " + fmt(x.coste) : ""))), h("div", { html: markdown(x.texto) })))));
  if (r.estado === "en curso") caja.append(h("p", { class: "nota-osc" }, "La reunión sigue: cada intervención aparece aquí cuando termina."));
  if (r.acta) caja.append(h("div", { class: "acta" }, h("h2", {}, "Acta"), h("div", { html: markdown(r.acta) })));
  if (r.motivo && r.estado === "interrumpida") caja.append(h("p", { class: "nota-osc" }, tr("Se interrumpió:") + " ", crudo(r.motivo)));
  if (r.estado !== "en curso") caja.append(h("div", {}, h("button", { class: "btn mini", onclick: (ev) => confirmar(ev.target, "¿Borrarla? Pulsa otra vez", () => Motor.ejecutar({ tipo: "reunion.borrar", reunion: r.id }).then(() => { salaSel = ""; pintarSalas(true); }).catch(avisar)) }, "Borrar la reunión")));
  return caja;
}
function formularioReunion() {
  const j = ed.jefe();
  if (!borradorSala) borradorSala = { titulo: "", orden: "", participantes: new Set(j ? [j.id] : []), rondas: 2 };
  const b = borradorSala;
  const titulo = h("input", { value: b.titulo, maxlength: "80", placeholder: "Por ejemplo: Plan de la semana", oninput: (ev) => { b.titulo = ev.target.value; } });
  const orden = h("textarea", { rows: "4", placeholder: "Qué hay que tratar y qué hay que decidir", oninput: (ev) => { b.orden = ev.target.value; } }); orden.value = b.orden;
  const rondas = h("input", { type: "number", min: "1", step: "1", value: b.rondas, style: { width: "70px" } });
  const est = h("span", { class: "nota-osc" }), cuenta = h("span", { class: "nota-osc" });
  const calc = () => {
    b.rondas = Math.max(1, parseInt(rondas.value, 10) || 1);
    cuenta.textContent = tr(`${b.participantes.size} de ${MAX_REUNION} en la mesa, contando al jefe`);
    const e = ed.estimarReunion({ participantes: [...b.participantes], rondas: b.rondas });
    est.textContent = b.participantes.size > 1 ? tr(`Coste estimado: ≈${fmt(e.coste)} (${e.llamadas} llamadas)`) : "";
  };
  rondas.oninput = calc;
  const posibles = ed.e.agentes.filter((a) => conversa(a));
  const elegir = h("div", { class: "elegir-asistentes" }, posibles.map((a) => {
    const chk = h("input", { type: "checkbox", checked: b.participantes.has(a.id), disabled: a.rol === "jefe" });
    chk.onchange = () => {
      if (chk.checked && b.participantes.size >= MAX_REUNION) { chk.checked = false; avisoFlotante(`En la mesa caben ${MAX_REUNION}, contando al jefe.`); return; }
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
  return h("div", { class: "sala" }, h("h2", {}, "Nueva reunión"),
    h("div", { class: "form-osc" },
      h("label", {}, "Título", titulo), h("label", {}, "Orden del día", orden),
      h("div", { class: "campo-osc" }, h("b", {}, "Quién se sienta a la mesa"), cuenta, elegir, h("small", { class: "nota-osc" }, "El jefe modera y siempre está. Los que no conversan (Interventor, Memory, JEV) no se pueden sentar.")),
      h("div", { class: "fila-c" }, h("span", {}, "Rondas"), rondas, est),
      h("div", { class: "fila-c" }, h("button", { class: "btn primario", onclick: convocar }, "Convocar"), h("small", { class: "nota-osc" }, "No empieza todavía: antes verás la mesa y el coste estimado."))));
}

// =====================================================================
// Cajón: Ajustes, Gasto, Vestir
// =====================================================================
let cajonTipo = "", cajonDatos = {}, focoAntes = null;
const TITULOS = { ajustes: "Ajustes", gasto: "Gasto", aspecto: "Aspecto", agente: "Crear agente", piso: "Crear piso" };
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
  const nom = h("input", { placeholder: "Por ejemplo: Ventas, Casa, Estudios…", maxlength: "40" });
  const fun = h("textarea", { rows: "3", placeholder: "Por ejemplo: buscar clientes y preparar presupuestos", maxlength: "300" });
  const crear = async () => {
    if (!nom.value.trim()) { nom.focus(); return; }
    try { const r = await Motor.ejecutar({ tipo: "crearPlanta", nombre: nom.value.trim(), funcion: fun.value.trim() }); cerrarCajon(); abrirPlanta(r.id); verPestana(window.innerWidth <= 900 ? "edificio" : pestana); }
    catch (err) { avisar(err); }
  };
  c.append(h("p", { class: "nota", style: { margin: 0 } }, "Cada piso es un equipo con una función. A la izquierda, el despacho de su jefe de sección; a la derecha, las oficinas de sus subagentes; y si son muchos y sencillos, el pool. El piso nuevo se construye arriba, bajo la cúpula."),
    h("label", { class: "campo" }, h("span", {}, "Nombre del piso"), nom),
    h("label", { class: "campo" }, h("span", {}, "Su función"), fun),
    h("div", { class: "fila-c" }, h("button", { class: "btn primario", onclick: crear }, "Crear piso"), h("button", { class: "btn", onclick: cerrarCajon }, "Cancelar")));
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
  const pedido = h("textarea", { rows: "3", placeholder: "Por ejemplo: quiero uno que cada lunes me prepare el menú de la semana y la lista de la compra", value: b.pedido });
  pedido.value = b.pedido || "";
  pedido.oninput = () => { b.pedido = pedido.value; };
  const quien = creador ? (creador.nombre === "Creador de agentes" || !creador.nombre.trim() ? "el Creador" : creador.nombre) : "";
  const perPedida = h("input", { maxlength: String(MAX_PERSONALIDAD), placeholder: "Por ejemplo: cercano, con humor y al grano", value: b.personalidadPedida || "" });
  perPedida.oninput = () => { b.personalidadPedida = perPedida.value; };
  const boton = h("button", { class: "btn primario mini" }, "Que lo diseñe " + quien);
  boton.onclick = async () => {
    if (!pedido.value.trim()) { pedido.focus(); return; }
    if (!hayAcceso()) { abrirCajon("ajustes"); return; }
    boton.disabled = true; boton.textContent = tr("Diseñando…");
    try {
      const r = await Motor.ejecutar({ tipo: "proponerAgente", texto: pedido.value.trim(), personalidad: perPedida.value.trim() });
      const f = r.propuesta.ficha;
      borrador = Object.assign(borradorNuevo({}), f, { planta: f.planta || "nuevo", plantaNueva: f.plantaNueva || { nombre: "", funcion: "" }, propuesta: r.propuesta.id, porque: f.porque, pedido: pedido.value, personalidadPedida: perPedida.value, coste: r.coste });
      pintarCrearAgente(false);
    } catch (err) { boton.disabled = false; boton.textContent = tr("Probar otra vez"); c.querySelector(".error-creador")?.remove(); boton.after(h("p", { class: "error-creador" }, err.mostrado ? err.message : "No se pudo: " + err.message)); }
  };
  c.append(h("div", { class: "bloque creador" }, h("h4", {}, "Cuéntaselo con tus palabras"),
    creador ? h("p", { class: "nota", style: { margin: 0 } }, `${quien[0].toUpperCase() + quien.slice(1)} rellena la ficha por ti. Después la revisas y la cambias si quieres. Cuesta una llamada a su cerebro (unos céntimos).`)
      : h("p", { class: "nota", style: { margin: 0 } }, "No tienes Creador de agentes. Rellena la ficha a mano o instálalo desde «Agentes de serie»."),
    creador ? pedido : null,
    creador ? h("label", { class: "campo" }, h("span", {}, "¿Qué personalidad quieres que tenga? (su tono, su humor y si va al grano)"), perPedida, h("small", {}, "Si la dejas en blanco, el Creador te propone una y la puedes cambiar abajo.")) : null,
    creador ? h("div", {}, boton) : null,
    b.propuesta ? h("p", { class: "porque" }, tr(b.porque || "Ficha rellenada por el Creador.") + (b.coste ? " " + tr(`Diseñarla costó ${fmt(b.coste)}.`) : "")) : null));
  // 2. la ficha
  const nombre = h("input", { value: b.nombre, placeholder: "Cómo se llama", maxlength: "40", oninput: (ev) => { b.nombre = ev.target.value; } });
  const selRol = h("select", { onchange: (ev) => { b.rol = ev.target.value; if (b.rol === "sabio") { b.planta = ed.e.plantas[0].id; b.puesto = "izquierda"; b.latido = { cada: 1, unidad: "peticion" }; if (!["abuelo", "abuela"].includes(b.aspecto.p)) b.aspecto = { p: "abuelo" }; } else { if (b.planta === ed.e.plantas[0].id) b.planta = (ed.e.plantas.find((x) => x.tipo === "piso") || { id: "nuevo" }).id; b.puesto = b.rol === "jefe_seccion" ? "despacho" : "oficina"; } pintarCrearAgente(false); } },
    [["jefe_seccion", "Jefe de sección"], ["subagente", "Subagente"], ["sabio", "Sabio"]].map(([v, t]) => h("option", { value: v }, t)));
  selRol.value = b.rol;
  const plantasOk = b.rol === "sabio" ? ed.e.plantas.filter((x) => x.tipo === "cupula") : ed.e.plantas.filter((x) => x.tipo !== "cupula");
  const selPlanta = h("select", { disabled: b.rol === "sabio", onchange: (ev) => { b.planta = ev.target.value; const t = (ed.e.plantas.find((x) => x.id === b.planta) || { tipo: "piso" }).tipo; b.puesto = t === "vestibulo" ? "izquierda" : (b.rol === "jefe_seccion" ? "despacho" : "oficina"); pintarCrearAgente(false); } },
    plantasOk.map((x) => h("option", { value: x.id }, x.nombre)), b.rol === "sabio" ? null : h("option", { value: "nuevo" }, "Un piso nuevo…"));
  selPlanta.value = b.planta;
  const tipoPl = b.planta === "nuevo" ? "piso" : (ed.e.plantas.find((x) => x.id === b.planta) || { tipo: "piso" }).tipo;
  const selPuesto = h("select", { onchange: (ev) => { b.puesto = ev.target.value; } }, (PUESTOS_TXT[tipoPl] || []).map(([v, t]) => h("option", { value: v }, t)));
  selPuesto.value = b.puesto;
  const pNombre = h("input", { value: b.plantaNueva.nombre, placeholder: "Nombre del piso nuevo", oninput: (ev) => { b.plantaNueva.nombre = ev.target.value; } });
  const pFuncion = h("input", { value: b.plantaNueva.funcion, placeholder: "Su función", oninput: (ev) => { b.plantaNueva.funcion = ev.target.value; } });
  const cuerpo = h("textarea", { rows: "5", placeholder: "Quién es y cómo trabaja. Por ejemplo: «Eres el encargado de…; cada vez que despiertes, …; entrega…»", oninput: (ev) => { b.cuerpo = ev.target.value; } }); cuerpo.value = b.cuerpo;
  const objetivo = h("textarea", { rows: "2", placeholder: "Lo que debe conseguir (opcional)", oninput: (ev) => { b.objetivo = ev.target.value; } }); objetivo.value = b.objetivo;
  const personalidad = h("textarea", { rows: "2", maxlength: String(MAX_PERSONALIDAD), placeholder: "Su tono, su humor y si va al grano", oninput: (ev) => { b.personalidad = ev.target.value; } }); personalidad.value = b.personalidad || "";
  const selCerebro = selectorModelo("texto", b.cerebro, { vacio: "El más barato que sirva (lo elige el edificio)", alCambiar: (v) => { b.cerebro = v; } });
  const num = h("input", { type: "number", min: "1", step: "1", value: b.latido.cada, disabled: b.latido.unidad === "peticion", onchange: (ev) => { b.latido.cada = Math.max(1, parseInt(ev.target.value, 10) || 1); } });
  const uni = h("select", { onchange: (ev) => { b.latido.unidad = ev.target.value; num.disabled = b.latido.unidad === "peticion"; } }, [["min", "minutos"], ["h", "horas"], ["d", "días"], ["peticion", "solo a petición"]].map(([v, t]) => h("option", { value: v }, t)));
  uni.value = b.latido.unidad;
  const alD = h("select", { onchange: (ev) => { b.alDespertar = ev.target.value; } }, h("option", { value: "tareas" }, "Hace sus tareas pendientes (si no hay, no gasta)"), h("option", { value: "objetivo" }, "Hace sus tareas y, si no hay, avanza en su objetivo (gasta)"));
  alD.value = b.alDespertar;
  const caps = h("div", { class: "caps" }, CAPACIDADES.filter((x) => x.tipo === "basica").map((x) => h("label", { class: "cap" },
    h("input", { type: "checkbox", checked: b.capacidades.includes(x.id), disabled: x.id === "escribir", onchange: (ev) => { b.capacidades = ev.target.checked ? [...new Set([...b.capacidades, x.id])] : b.capacidades.filter((y) => y !== x.id); } }),
    h("span", {}, x.nombre, h("small", {}, x.como)))));
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Su ficha"),
    campo("Nombre", nombre),
    h("div", { class: "dos" }, campo("Papel", selRol), campo("Planta", selPlanta)),
    h("small", { class: "nota", style: { marginTop: "-6px" } }, { jefe_seccion: "El jefe de sección dirige un piso desde el despacho de la izquierda y reparte el trabajo a sus subagentes.", subagente: "El subagente hace el trabajo, en una oficina o, si es sencillo y barato, en el pool.", sabio: "El sabio está en la cúpula y solo aconseja al jefe en decisiones importantes. Es caro." }[b.rol]),
    b.planta === "nuevo" ? h("div", { class: "dos" }, pNombre, pFuncion) : null,
    campo("Sitio", selPuesto),
    campo("Instrucciones", cuerpo), campo("Personalidad", personalidad, "Va en cada llamada: su carácter no depende del cerebro."), campo("Objetivo", objetivo),
    campo("Cerebro", selCerebro, "Arriba, los recomendados por nivel; debajo, todos. Precio en dólares por millón de tokens (entrada / salida), según OpenRouter."),
    h("div", { class: "campo" }, h("span", {}, "En reposo, se despierta"), h("div", { class: "fila-c" }, h("span", {}, "cada"), num, uni)),
    b.rol === "sabio" ? null : campo("Al despertar", alD),
    h("div", { class: "campo" }, h("span", {}, "Capacidades"), caps)));
  // 3. su aspecto
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Su aspecto"), selectorAspecto(b.aspecto, (A) => { b.aspecto = A; })));
  // 4. crear
  const crear = h("button", { class: "btn primario" }, "Crear agente");
  crear.onclick = async () => {
    if (b.planta === "nuevo" && !b.plantaNueva.nombre.trim()) { pNombre.focus(); return; }
    const ficha = Object.assign({}, b, { planta: b.planta === "nuevo" ? "" : b.planta, plantaNueva: b.planta === "nuevo" ? b.plantaNueva : null, nivel: b.cerebro ? "" : (b.nivel || "economico") });
    crear.disabled = true;
    try {
      const r = await Motor.ejecutar({ tipo: "crearAgente", ficha, propuesta: b.propuesta || undefined });
      borrador = null; cerrarCajon();
      const nuevo = ed.agente(r.id);
      if (nuevo) { abrirPlanta(nuevo.planta); elegir(nuevo); }
    } catch (err) { crear.disabled = false; c.querySelector(".error-creador.final")?.remove(); crear.parentElement.after(h("p", { class: "error-creador final" }, err.mostrado ? err.message : "No se pudo: " + err.message)); }
  };
  c.append(h("div", { class: "fila-c pie-crear" }, crear, h("button", { class: "btn", onclick: () => { borrador = null; cerrarCajon(); } }, "Cancelar")));
  c.scrollTop = nuevo ? 0 : sc;
}

// ---------------- Aspecto de un agente ----------------
function pintarAspecto() {
  const c = $("cajonCuerpo"); c.innerHTML = "";
  const a = ed.agente(cajonDatos.id) || ed.jefe();
  if (!a) return;
  $("cajonTitulo").textContent = tr("Foto y nombre de ") + a.nombre;
  // el nombre, aquí mismo, junto a la foto
  const nom = h("input", { value: a.nombre, maxlength: "40", "aria-label": "Nombre" });
  nom.onchange = () => { const v = nom.value.trim(); if (!v || v === a.nombre) { nom.value = a.nombre; return; } Motor.ejecutar({ tipo: "editarAgente", id: a.id, cambios: { nombre: v } }).then(() => { $("cajonTitulo").textContent = tr("Foto y nombre de ") + v; pintar(); }).catch(avisar); };
  c.append(h("div", { class: "bloque" }, campo("Nombre", nom, "Ponle el nombre que quieras.")));
  let espera = null;
  c.append(selectorAspecto(a.aspecto, (A) => {
    clearTimeout(espera);
    espera = setTimeout(() => Motor.ejecutar({ tipo: "editarAgente", id: a.id, cambios: { aspecto: A } }).then(() => { asegurarFigura(A).then(() => pintar()); }).catch(avisar), 120);
  }));
  c.append(h("p", { class: "nota" }, a.rol === "jefe" ? "El color de la web sigue al de la ropa del jefe (y en cada chat, al del agente con quien hablas)." : "Se guarda con el edificio. En su chat, el color de la web sigue al de su ropa."));
}

function pintarGastoCajon(soloDatos) {
  const c = $("cajonCuerpo");
  if (soloDatos && c.contains(document.activeElement) && document.activeElement.tagName === "INPUT") return;
  c.innerHTML = "";
  const aj = ed.e.ajustes, uso = ed.usoPresupuesto();
  const guardarAj = (cambios) => Motor.ejecutar({ tipo: "ajustes", cambios }).then(() => { pintar(); pintarGastoCajon(); }).catch(avisar);
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Todo el edificio"),
    h("div", { class: "gastos3" }, ["hoy", "semana", "mes"].map((p) => h("div", {}, h("b", {}, fmt(ed.gastoEdificio(p))), h("small", {}, { hoy: "hoy", semana: "7 días", mes: "este mes" }[p])))),
    h("div", { class: "barra" }, h("i", { class: faseClase(), style: { width: Math.min(100, uso * 100) + "%" } })),
    h("p", { class: "nota", style: { margin: 0 } }, tr(`Uso del tope: ${Math.round(uso * 100)} %.`) + " " + tr({ normal: "Todos trabajan.", congelacion1: "Congelados los de prioridad 1 y 2.", congelacion2: "Solo trabajan los de prioridad 5.", tope: "Tope alcanzado: todo congelado hasta mañana o hasta que subas el tope." }[ed.e.fase || "normal"]))));
  // el interruptor general y quién gasta al despertar
  const pausa = aj.pausa !== false;
  const lista = ed.quienesGastan().filter((x) => !["memory"].includes(x.a.rol));
  const conLatido = lista.filter((x) => x.auto && !x.a.apagado);
  const totalDia = conLatido.reduce((s, x) => s + (x.est.porDia || 0), 0);
  const ponerPeticion = (a) => Motor.ejecutar({ tipo: "editarAgente", id: a.id, cambios: { latido: { cada: 1, unidad: "peticion" } } }).then(() => { pintar(); pintarGastoCajon(); }).catch(avisar);
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Lo automático"),
    h("div", { class: "fila-c" }, h("button", { class: "pausa-btn", type: "button", "aria-pressed": String(pausa), onclick: () => Motor.ejecutar({ tipo: "pausa", pausa: !pausa }).then(() => { pintar(); pintarGastoCajon(); }).catch(avisar) },
      h("span", { class: "pausa-ico", "aria-hidden": "true" }), h("span", { class: "pausa-txt" }, h("b", {}, pausa ? "En pausa" : "Automático en marcha"), h("small", {}, pausa ? "pulsa para ponerlo en marcha" : "pulsa para parar todo lo automático")))),
    h("p", { class: "nota", style: { margin: 0 } }, pausa ? "Pausa general: ningún agente que gaste se despierta solo, y las tareas que reparte el jefe esperan. Tú sí puedes hablar con ellos y despertarlos a mano. Lo que no gasta nada (el Interventor y las skills sin cerebro, como el Vigía de X) sigue funcionando."
      : `En marcha. Si nadie tuviera tareas, lo automático costaría unos ${fmt(totalDia)} al día (estimado).`),
    h("h4", { style: { marginTop: "6px" } }, "Quién gasta al despertar"),
    h("div", { class: "quien-gasta" }, lista.map(({ a, auto, est }) => h("div", { class: "fila-qg" + (est.gasta && auto && est.porVez > 0 ? " gasta" : "") },
      h("img", { src: figura(a.aspecto), alt: "" }),
      h("span", { class: "qg-txt" }, h("b", {}, a.nombre), h("small", {}, `${a.apagado ? "apagado" : auto ? textoLatido(a.latido) : "solo a petición"} · ${est.como}`)),
      h("span", { class: "qg-der" }, est.gasta && est.porVez > 0 ? h("b", {}, `≈${fmt(est.porVez)} por latido`) : h("small", {}, est.suscripcion ? `de tu suscripción de ${est.suscripcion}` : est.gasta ? (est.porTarea ? `≈${fmt(est.porTarea)} por tarea` : "—") : "no gasta"),
        est.gasta && auto && est.porDia > 0 ? h("small", {}, `≈${fmt(est.porDia)} al día`) : null,
        est.gasta && auto && !a.apagado && a.rol !== "jefe" ? h("button", { class: "btn mini", type: "button", onclick: () => ponerPeticion(a) }, "Solo a petición") : null)))),
    h("small", { class: "nota" }, "Estimado (SUPUESTO): lo que lee al despertar, unas 3,5 letras por token, más unos 400 tokens de respuesta, con la tarifa de su cerebro. Buscar en internet suma unos 0,006 $. El gasto real lo ves arriba.")));
  const td = h("input", { type: "number", min: "0", step: "0.5", value: aj.topeDiario }), tm = h("input", { type: "number", min: "0", step: "1", value: aj.topeMensual }), cd = h("input", { type: "number", min: "10", max: "99", step: "5", value: Math.round((aj.congelarDesde || 0.8) * 100) });
  td.onchange = () => guardarAj({ topeDiario: Math.max(0, parseFloat(td.value) || 0) });
  tm.onchange = () => guardarAj({ topeMensual: Math.max(0, parseFloat(tm.value) || 0) });
  cd.onchange = () => guardarAj({ congelarDesde: Math.min(0.99, Math.max(0.1, (parseFloat(cd.value) || 80) / 100)) });
  const medio = Math.round(((aj.congelarDesde || 0.8) + 1) / 2 * 100);
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Topes"),
    h("div", { class: "dos" }, h("label", { class: "campo" }, h("span", {}, "Tope diario (USD)"), td), h("label", { class: "campo" }, h("span", {}, "Tope mensual (USD)"), tm)),
    h("label", { class: "campo" }, h("span", {}, "Empezar a congelar al (%)"), cd),
    h("div", { class: "tramos" },
      h("div", {}, h("b", {}, `< ${Math.round((aj.congelarDesde || 0.8) * 100)} %`), h("span", {}, "todos trabajan")),
      h("div", {}, h("b", {}, `≥ ${Math.round((aj.congelarDesde || 0.8) * 100)} %`), h("span", {}, "se congelan los de prioridad 1 y 2")),
      h("div", {}, h("b", {}, `≥ ${medio} %`), h("span", {}, "solo trabajan los de prioridad 5 (el jefe y el control)")),
      h("div", {}, h("b", {}, "100 %"), h("span", {}, "todo congelado, también el jefe; vuelve al día siguiente o al subir el tope"))),
    h("small", { class: "nota" }, "Pon también un límite a la clave en la web de OpenRouter: es la red de seguridad si algo falla aquí.")));
  const filas = ed.e.agentes.map((a) => ({ a, hoy: ed.gastoAgente(a, "hoy"), sem: ed.gastoAgente(a, "semana"), mes: ed.gastoAgente(a, "mes") })).sort((x, y) => y.mes - x.mes || y.hoy - x.hoy);
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Por agente"),
    h("table", { class: "gasto" }, h("thead", {}, h("tr", {}, h("th", {}, "Agente"), h("th", {}, "Prior."), h("th", {}, "Hoy"), h("th", {}, "7 días"), h("th", {}, "Mes"))),
      h("tbody", {}, filas.map((f) => h("tr", {}, h("td", {}, f.a.nombre, " ", h("small", { class: "nota" }, ESTADO_TXT[estadoVisible(f.a)])), h("td", {}, f.a.prioridad), h("td", {}, f.hoy > 0 ? (f.a.gastoEstimado ? "≈" : "") + fmt(f.hoy) : "—"), h("td", {}, f.sem > 0 ? fmt(f.sem) : "—"), h("td", {}, f.mes > 0 ? fmt(f.mes) : "—")))),
      h("tfoot", {}, h("tr", {}, h("td", {}, "Total"), h("td", {}, ""), h("td", {}, fmt(ed.gastoEdificio("hoy"))), h("td", {}, fmt(ed.gastoEdificio("semana"))), h("td", {}, fmt(ed.gastoEdificio("mes")))))),
    h("small", { class: "nota" }, "En dólares. Cerebros, imágenes y micro: lo que cobra OpenRouter en cada llamada. Voz: lo cobrado si OpenRouter lo informa; si no, estimado con la tarifa del modelo («≈»).")));
}

// ---------------- Ajustes → Otras API (las de tus suscripciones) ----------------
function bloqueOtrasApi() {
  const conx = ed.conexiones();
  const guardarLista = (lista) => Motor.ejecutar({ tipo: "conexiones", conexiones: lista }).then(() => { pintar(); pintarAjustes(); }).catch(avisar);
  const listaActual = () => (ed.e.ajustes.conexiones || []).map((x) => Object.assign({}, x));
  const b = h("div", { class: "bloque" }, h("h4", {}, "Otras API (tus suscripciones)"),
    h("p", { class: "nota", style: { margin: 0 } }, "Cada agente piensa con OpenRouter (se paga por uso) o con la API de una suscripción que ya pagas. Añade aquí las tuyas y, en la ficha de cada agente → Cerebro, eliges con cuál piensa. Lo que sale de tu suscripción no cuenta para el tope de gasto: se apunta aparte, para que lo veas."),
    h("small", { class: "nota" }, "Algunas suscripciones incluyen API o créditos de API (por ejemplo, algunos planes de Claude y de ChatGPT, o los créditos de Google Cloud de Google AI Pro y Ultra). Otras solo dejan usar su cupo en sus propias aplicaciones: no las uses aquí. Lo que se paga aparte, mejor por OpenRouter."));
  for (const P of conx) {
    const msg = h("small", { class: "nota" });
    const probar = h("button", { class: "btn mini", type: "button", onclick: async () => { probar.disabled = true; msg.textContent = tr("Probando…"); try { const l = await cargarModelosDirectos(P.id); msg.textContent = tr(`Funciona: ${l.length} modelos. El primero: ${l[0] || "—"}.`); } catch (err) { msg.textContent = err.message; } probar.disabled = false; } }, "Probar");
    const fuera = h("button", { class: "btn mini peligro", type: "button", onclick: (ev) => confirmar(ev.target, "¿Quitar esta API? Sus agentes vuelven a OpenRouter. Pulsa otra vez", () => { try { localStorage.removeItem(claveApi(P.id)); } catch {} guardarLista(listaActual().filter((x) => x.id !== P.id)); }) }, "Quitar esta API");
    const fila = h("div", { class: "campo api-fila" }, h("span", {}, P.nombre + (tieneClaveApi(P.id) && !P.sinClave ? " · " + tr("clave puesta") : "")), h("small", { class: "nota" }, P.api + (P.formato === "anthropic" ? " · idioma de Claude" : "")));
    if (P.sinClave) fila.append(h("small", { class: "nota" }, "Un modelo en tu propio ordenador: no lleva clave. Tiene que estar encendido (y, para usarlo desde esta web, permitir llamadas desde el navegador)."));
    else if (esApp()) {
      const kk = h("input", { type: "password", autocomplete: "off", placeholder: tieneClaveApi(P.id) ? "••••••••••" : P.web ? `Tu clave (de ${P.web})` : "Tu clave" });
      fila.append(h("div", { class: "clave-fila" }, kk,
        h("button", { class: "btn mini primario", type: "button", onclick: async () => { try { await llamarApp("/api/conf/clave", { prov: P.id, clave: kk.value.trim() }); await refrescarCasa(); pintarAjustes(); avisoFlotante(kk.value.trim() ? "Clave guardada en este ordenador." : "Clave quitada."); } catch (e) { avisar(e); } } }, "Guardar")),
        h("small", { class: "nota" }, "Se guarda solo en este ordenador y solo viaja a la dirección de esta API. Para quitarla, déjala vacía y pulsa «Guardar»."));
    }
    else if (modo === "casa") fila.append(h("small", { class: "nota" }, tieneClaveApi(P.id) ? "Clave puesta en Fer Casa." : "Sin clave en Fer Casa. En el ordenador de Fer Casa: node fer-casa.mjs claves"));
    else {
      const tiene = !!store.get(claveApi(P.id));
      const inp = h("input", { type: "password", autocomplete: "off", placeholder: P.web ? `Tu clave (de ${P.web})` : "Tu clave", value: tiene ? "••••••••••" : "" });
      inp.onfocus = () => { if (inp.value.startsWith("•")) inp.value = ""; };
      const guardar = h("button", { class: "btn mini primario", type: "button", onclick: () => { const v = inp.value.trim(); if (v && !v.startsWith("•")) store.set(claveApi(P.id), v); pintar(); pintarAjustes(); } }, "Guardar");
      const quitarClave = tiene ? h("button", { class: "btn mini", type: "button", onclick: (ev) => confirmar(ev.target, "¿Quitar la clave? Pulsa otra vez", () => { try { localStorage.removeItem(claveApi(P.id)); } catch {} pintarAjustes(); }) }, "Quitar la clave") : null;
      fila.append(h("div", { class: "clave-fila" }, inp, guardar, quitarClave));
    }
    fila.append(h("div", { class: "fila-c" }, probar, fuera, msg));
    b.append(fila);
  }
  // añadir: las conocidas (solo rellenan la dirección) u otra cualquiera
  const conocidas = Object.entries(PROVEEDORES).filter(([k]) => k !== "openrouter" && !conx.some((c) => c.id === k));
  if (conocidas.length) b.append(h("div", { class: "campo" }, h("span", {}, "Añadir una conocida"), h("div", { class: "fila-c" }, conocidas.map(([k, P]) => h("button", { class: "btn mini", type: "button", onclick: () => guardarLista([...listaActual(), { id: k }]) }, "+ " + P.nombre)))));
  const nom = h("input", { placeholder: "Nombre (por ejemplo, Mi API)" }), dir = h("input", { placeholder: "Dirección (por ejemplo, https://api.empresa.com/v1)" });
  const fmtSel = h("select", {}, h("option", { value: "openai" }, "Habla como OpenAI (la mayoría)"), h("option", { value: "anthropic" }, "Habla como Claude"));
  const err = h("small", { class: "nota" });
  b.append(h("div", { class: "campo" }, h("span", {}, "O cualquier otra"), nom, dir, fmtSel,
    h("div", { class: "fila-c" }, h("button", { class: "btn mini", type: "button", onclick: () => {
      const nombre = nom.value.trim(), api = dir.value.trim();
      if (!/^https?:\/\/\S+$/i.test(api)) { err.textContent = tr("La dirección tiene que empezar por https:// (o http:// si es de tu ordenador)."); return; }
      let id = "api-" + (sinAcentos(nombre || api.replace(/^https?:\/\//, "")).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 22) || "nueva");
      while (conx.some((c) => c.id === id) || PROVEEDORES[id]) id += "-2";
      guardarLista([...listaActual(), { id, nombre: nombre || api.replace(/^https?:\/\//, "").split("/")[0], api, formato: fmtSel.value }]);
    } }, "Añadir"), err)));
  b.append(h("small", { class: "nota" }, modo === "local" ? "Las claves se quedan solo en este navegador y solo viajan a la dirección de su API. Nunca van en las copias ni en la mudanza." : "Con Fer Casa, las claves viven en su ordenador (datos/config.json): node fer-casa.mjs claves."));
  return b;
}
function pintarAjustes() {
  const c = $("cajonCuerpo"), sc = c.scrollTop; c.innerHTML = "";
  const aj = ed.e.ajustes;
  const guardarAj = (cambios, extra) => Motor.ejecutar(Object.assign({ tipo: "ajustes", cambios }, extra || {})).then(pintar).catch(avisar);
  // dónde vive
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Dónde vive tu edificio"),
    h("div", { class: "donde" },
      esApp() ? h("div", { class: "aqui" }, h("b", {}, "En esta aplicación"), h("br"), h("span", { class: "nota" }, "En tu ordenador, sin Terminal. Los agentes trabajan mientras la aplicación esté abierta, con manos: su Chrome, su carpeta y sus skills."), casaInfo.datos ? h("br") : null, casaInfo.datos ? h("small", { class: "nota" }, tr("Tus datos:") + " ", crudo(casaInfo.datos)) : null) : null,
      h("div", { class: modo === "local" ? "aqui" : "" }, h("b", {}, "En este navegador"), h("br"), h("span", { class: "nota" }, "Funciona ya, sin instalar nada. Los agentes trabajan mientras esta web esté abierta en algún aparato.")),
      h("div", { class: modo === "casa" && !esApp() ? "aqui" : "" }, h("b", {}, "Fer Casa: ordenador o teléfono encendido"), h("br"), h("span", { class: "nota" }, "El programa fer-casa.mjs mueve este mismo edificio las 24 horas y da manos a los agentes (su Chrome, su carpeta, sus skills). Abres la web desde la dirección que te da.")),
      h("div", {}, h("b", {}, "Fer Casa en la nube"), h("br"), h("span", { class: "nota" }, "El mismo programa en un servidor alquilado. Trabaja aunque en casa esté todo apagado."))),
    h("small", { class: "nota" }, "Cómo instalar Fer Casa: archivo LEEME.txt del ZIP y documento «Fer Agent · El Edificio».")));
  // acceso: tu clave y tu dinero
  if (modo === "local") {
    const k = h("input", { type: "password", autocomplete: "off", placeholder: "sk-or-...", value: store.get(K.clave) ? "••••••••••" : "" });
    k.onfocus = () => { if (k.value.startsWith("•")) k.value = ""; };
    c.append(h("div", { class: "bloque" }, h("h4", {}, "Tu clave de OpenRouter"),
      h("div", { class: "fila-c" }, k, h("button", { class: "btn primario mini", onclick: () => { if (!k.value.startsWith("•")) store.set(K.clave, k.value.trim()); k.value = store.get(K.clave) ? "••••••••••" : ""; pintar(); pintarChat(true); cerrarCajon(); } }, "Guardar")),
      h("p", { class: "nota", style: { margin: 0 } }, "Dónde está y a dónde va: se guarda solo en este navegador, en este aparato. No pasa por ningún servidor de Fer Agent: cuando un agente piensa, habla u oye, este navegador la manda directamente a OpenRouter, y a nadie más. Quien use este mismo navegador sí podría usarla."),
      h("small", { class: "nota" }, "Red de seguridad: ponle un límite de gasto a la clave en la web de OpenRouter."),
      comoSacarClave()));
  } else if (esApp()) {
    // en la aplicación: la clave se pega aquí y se guarda en este ordenador; y se entra una vez en tus webs con el Chrome de los agentes
    const k = h("input", { type: "password", autocomplete: "off", placeholder: "sk-or-...", value: casaInfo.clave ? "••••••••••" : "" });
    k.onfocus = () => { if (k.value.startsWith("•")) k.value = ""; };
    c.append(h("div", { class: "bloque" }, h("h4", {}, "Tu clave de OpenRouter"),
      h("div", { class: "fila-c" }, k, h("button", { class: "btn primario mini", onclick: async () => {
        if (!k.value.trim() || k.value.startsWith("•")) return;
        try { await llamarApp("/api/conf/clave", { prov: "openrouter", clave: k.value.trim() }); await refrescarCasa(); avisoFlotante("Clave guardada en este ordenador."); pintar(); pintarChat(true); cerrarCajon(); } catch (e) { avisar(e); }
      } }, "Guardar")),
      h("p", { class: "nota", style: { margin: 0 } }, "Dónde está y a dónde va: se guarda solo en este ordenador, en la carpeta de datos de la aplicación. Solo viaja a OpenRouter cuando un agente piensa, habla u oye."),
      h("small", { class: "nota" }, "Red de seguridad: ponle un límite de gasto a la clave en la web de OpenRouter."),
      comoSacarClave()));
    const u = h("input", { type: "url", placeholder: "https://mail.google.com" });
    c.append(h("div", { class: "bloque" }, h("h4", {}, "Tus webs, en el Chrome de los agentes"),
      h("p", { class: "nota", style: { margin: 0 } }, "Para que un agente use una web con tu cuenta (tu correo, una red social…), entra tú una vez: se abre el Chrome de los agentes, inicias sesión y cierras esa ventana. La sesión se queda en este ordenador."),
      h("div", { class: "fila-c" }, u, h("button", { class: "btn mini", onclick: async () => {
        try { await llamarApp("/api/conf/entrar", { url: u.value.trim() }); avisoFlotante("Se ha abierto el Chrome de los agentes. Entra con tu cuenta y, cuando acabes, cierra esa ventana."); } catch (e) { avisar(e); }
      } }, "Abrir")),
      h("small", { class: "nota" }, "Necesita Google Chrome instalado en este ordenador.")));
  } else {
    const p = h("input", { type: "password", placeholder: "PIN de Fer Casa", value: pin });
    c.append(h("div", { class: "bloque" }, h("h4", {}, "PIN de Fer Casa"),
      h("div", { class: "fila-c" }, p, h("button", { class: "btn primario mini", onclick: async () => { pin = p.value.trim(); pinRechazado = false; store.set(K.pin, pin); await refrescarCasa(); pintarChat(true); if (!pinRechazado) cerrarCajon(); else pintarAjustes(); } }, "Entrar")),
      pinRechazado ? h("small", { class: "nota", style: { color: "var(--peligro)" } }, "Ese PIN no es correcto (o hubo demasiados intentos: espera un minuto).") : null,
      h("small", { class: "nota" }, "Las claves viven en Fer Casa (datos/config.json), no en este aparato. El PIN evita que otro en tu red use tu crédito.")));
  }
  c.append(bloqueOtrasApi());
  // nombre y objetivos del edificio
  const nom = h("input", { value: ed.e.nombre || "" });
  nom.onchange = () => guardarAj({}, { nombre: nom.value.trim() || "Mi edificio" });
  const obj = h("textarea", { rows: "5", placeholder: "Por ejemplo:\nQue mi tienda venda más por internet\nAhorrarme dos horas al día de correos y papeleo\n…" }); obj.value = ed.e.objetivos || "";
  const cuenta = h("span", { class: "contador" });
  const contar = () => {
    const lineas = obj.value.split("\n").filter((l) => l.trim()).length, letras = obj.value.trim().length;
    cuenta.textContent = tr(`${lineas}/${MAX_LINEAS_OBJETIVOS} líneas · ${letras} letras · unos ${Math.ceil(letras / 3.5)} tokens en cada latido de cada agente`);
    cuenta.classList.toggle("mal", lineas > MAX_LINEAS_OBJETIVOS);
  };
  obj.oninput = contar; contar();
  obj.onchange = () => Motor.ejecutar({ tipo: "objetivos", texto: obj.value }).then((r) => { obj.value = r.objetivos; contar(); pintar(); }).catch(avisar);
  c.append(h("div", { class: "bloque" }, campo("Nombre del edificio", nom),
    campo("Objetivos del edificio (tuyos o de tu empresa)", obj, "Cinco líneas como máximo. Cada agente los lee al despertar, junto a los suyos y a las lecciones de su papel. Corto: cada letra se paga en cada latido."), cuenta));
  // el cerebro: biblioteca y memoria larga en una carpeta
  c.append(bloqueCerebro());
  // modelos por defecto del edificio (cada agente puede elegir el suyo en su ficha → Capacidades)
  const selVista = selectorModelo("texto", aj.modeloVista, { vacio: "Ninguno", filtro: (m) => datosModelo(m).ve, alCambiar: (v) => guardarAj({ modeloVista: v }) });
  const selImg = selectorModelo("imagen", aj.modeloImagen, { vacio: "Ninguno", alCambiar: (v) => guardarAj({ modeloImagen: v }) });
  const selMus = selectorModelo("musica", aj.modeloMusica, { vacio: "Ninguno", alCambiar: (v) => guardarAj({ modeloMusica: v }) });
  const conMusica = ed.e.agentes.filter((a) => a.capacidades.includes("crear_musica")).map((a) => a.nombre);
  const selVoz = selectorModelo("voz", aj.modeloVoz || BROWSER, { extra: [[BROWSER, "Voz del navegador · gratis"]] });
  const selVc = h("select", { onchange: (ev) => guardarAj({ vozConcreta: ev.target.value }) });
  const llenarVc = () => {
    selVc.innerHTML = "";
    const lista = selVoz.value === BROWSER ? [{ id: "", name: "Automática (idioma de la web)" }, ...vocesNavegador().map((v) => ({ id: v.voiceURI, name: `${v.name} · ${v.lang}` }))]
      : ((voces.find((m) => m.id === selVoz.value) || {}).voices || []);
    for (const v of (lista.length ? lista : [{ id: "", name: "La del modelo por defecto" }])) selVc.append(h("option", { value: v.id }, v.name));
    selVc.value = [...selVc.options].some((o) => o.value === aj.vozConcreta) ? aj.vozConcreta : selVc.options[0].value;
  };
  llenarVc();
  selVoz.onchange = () => { llenarVc(); guardarAj({ modeloVoz: selVoz.value, vozConcreta: selVc.value }); };
  const selOido = selectorModelo("oido", aj.modeloOido || BROWSER, { extra: [[BROWSER, "Oído del navegador · gratis (Chrome, Edge, Safari)"]], alCambiar: (v) => guardarAj({ modeloOido: v }) });
  const chk = h("input", { type: "checkbox", checked: aj.responderEnVozSiMicro !== false, onchange: (ev) => guardarAj({ responderEnVozSiMicro: ev.target.checked }) });
  const chkCorta = h("input", { type: "checkbox", checked: aj.vozCorta !== false, onchange: (ev) => guardarAj({ vozCorta: ev.target.checked }) });
  const chkCortar = h("input", { type: "checkbox", checked: aj.cortarAlHablar !== false, onchange: (ev) => guardarAj({ cortarAlHablar: ev.target.checked }) });
  const selLec = selectorModelo("texto", aj.modeloLecciones, { vacio: `El más barato que sirva (${nombreModelo(elegirModelo("economico", ed.modelos)) || "ninguno"})`, alCambiar: (v) => guardarAj({ modeloLecciones: v }) });
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Modelos por defecto del edificio"),
    h("p", { class: "nota", style: { margin: 0 } }, "Los usa cada agente que no tenga uno propio. Cada uno elige el suyo en su ficha → Capacidades."),
    campo("Ver: cerebro con vista", selVista, "Describe las imágenes a los agentes cuyo cerebro no ve."),
    campo("Crear imágenes", selImg), campo("Crear música", selMus, tr("Dónde se activa: en la ficha de cada agente → Capacidades → «Crear música».") + " " + (conMusica.length ? tr("Ahora la tienen:") + " " + conMusica.join(", ") + "." : tr("Ahora no la tiene ningún agente."))),
    campo("Hablar: modelo de voz", selVoz), campo("Voz del jefe", selVc, "Los demás agentes, si no eligen la suya, reciben cada uno una voz distinta de ese modelo."),
    campo("Oír: tu voz a texto", selOido),
    h("label", { class: "cap" }, chk, h("span", {}, "Si le hablas por el micro, te contesta en voz alta aunque el altavoz esté apagado")),
    h("label", { class: "cap" }, chkCorta, h("span", {}, "Respuestas cortas cuando habláis por voz", h("small", {}, "De una a tres frases; si quieres más, pídele el detalle."))),
    h("label", { class: "cap" }, chkCortar, h("span", {}, "Se calla cuando le hablas", h("small", {}, "El micro sigue abierto mientras habla. Con altavoces muy altos, si se corta solo, usa auriculares o apaga esto."))),
    campo("Modelo que convierte las monedas en lecciones", selLec, "Uno barato: redacta la regla y tú la apruebas en la bandeja.")));
  // modelos recomendados: arriba de cada selector. Arturito propone los nuevos; tú decides.
  const pendModelos = (ed.e.propuestasModelos || []).filter((x) => x.estado === "pendiente");
  const resumenRec = h("div", { class: "lista" }, Object.keys(TIPOS_MODELO).filter((t) => t !== "otros").map((t) => {
    const rec = ((aj.recomendados || {})[t]) || {};
    const lineas = NIVELES.filter((n) => (rec[n] || []).length).map((n) => h("div", {}, h("b", {}, tr(NOMBRE_NIVEL[n]) + ": "), rec[n].map(nombreModelo).join(", ")));
    return lineas.length ? h("div", { class: "item" }, h("div", { class: "cab" }, h("span", {}, tr(TIPOS_MODELO[t]))), lineas) : null;
  }).filter(Boolean));
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Modelos recomendados"),
    h("p", { class: "nota", style: { margin: 0 } }, "En cada selector salen primero los recomendados por nivel de PRECIO (gratis, económico, medio, alto y vanguardia), no de calidad: en cada nivel va la versión más nueva de cada casa. Debajo, todos los de OpenRouter, clasificados por lo que hacen según sus datos. Cuando sale un modelo nuevo, Arturito lo propone; nada cambia sin tu sí."),
    pendModelos.length ? Object.keys(TIPOS_MODELO).map((t) => propuestasDe(t)).flat() : h("p", { class: "nota", style: { margin: 0 } }, "Arturito no tiene propuestas pendientes."),
    h("details", {}, h("summary", {}, "Ver los recomendados de ahora"), resumenRec),
    h("div", {}, h("button", { class: "btn mini", onclick: (ev) => confirmar(ev.target, "¿Volver a los iniciales? Pulsa otra vez", () => Motor.ejecutar({ tipo: "recomendados.restablecer" }).then(() => { pintar(); pintarAjustes(); }).catch(avisar)) }, "Volver a los recomendados iniciales"))));
  // lecciones y vista
  const nLec = h("input", { type: "number", min: "1", max: "50", step: "1", value: aj.leccionesPorPapel || 5, onchange: (ev) => guardarAj({ leccionesPorPapel: Math.max(1, Math.min(50, parseInt(ev.target.value, 10) || 5)) }) });
  const selVistaEd = h("select", { onchange: (ev) => guardarAj({ vistaEdificio: ev.target.value }) }, [["auto", `Automática: franjas a partir de ${AUTO_AGENTES + 1} agentes o ${AUTO_PISOS + 1} pisos`], ["dibujo", "Siempre el dibujo"], ["franjas", "Siempre en franjas"]].map(([v, t]) => h("option", { value: v }, t)));
  selVistaEd.value = aj.vistaEdificio || "auto";
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Monedas, lecciones y vista"),
    campo("Lecciones que se guardan por papel", nLec, "Al entrar una nueva sale la más antigua. Las que fijes en la ficha no salen nunca."),
    campo("Cómo se ve el edificio", selVistaEd)));
  if (Object.keys(IDIOMAS).length > 1) {
    const selIdioma = h("select", { onchange: (ev) => cambiarIdioma(ev.target.value) }, Object.entries(IDIOMAS).map(([k, t]) => h("option", { value: k }, t)));
    selIdioma.value = idioma;
    c.append(h("label", { class: "bloque campo" }, h("span", {}, "Idioma (la web y lo que se dice a los agentes)"), selIdioma));
  }
  // los agentes de serie que renombraste, otra vez con su nombre oficial (en el idioma del edificio)
  c.append(h("div", { class: "bloque" },
    h("button", { class: "btn mini", onclick: () => Motor.ejecutar({ tipo: "nombresDeSerie" }).then((r) => { pintar(); pintarAjustes(); avisoFlotante(r && r.cambiados ? tr(`Nombres de serie recuperados: ${r.cambiados}.`) : tr("Ya tienen su nombre de serie.")); }).catch(avisar) }, "Volver a los nombres de serie"),
    h("small", { class: "nota" }, "Los agentes de serie recuperan su nombre oficial en este idioma. Los que has creado tú no cambian.")));
  // copias, mudanza y empezar de nuevo
  const plantilla = (nombre, txt) => h("button", { class: "btn mini", onclick: (ev) => confirmar(ev.target, "¿Seguro? Se borra el edificio actual", () => Motor.ejecutar({ tipo: "plantilla", nombre }).then(() => { seleccion = "jefe"; plantaAbierta = ""; pintar(); pintarChat(true); cerrarCajon(); }).catch(avisar)) }, txt);
  const fi = h("input", { type: "file", accept: "application/json,.json", hidden: true, onchange: async (ev) => { const f = ev.target.files[0]; if (!f) return; try { const r = await cargarCopia(await f.text()); pintar(); pintarChat(true); cerrarCajon(); avisoFlotante(r.mudanza ? "Mudanza recibida: agentes, ajustes, imágenes y música. Pega otra vez tus claves en Ajustes (no viajan en el archivo)." : (r.medios ? tr(`Copia cargada con ${r.medios} imágenes y músicas.`) : tr("Copia cargada."))); } catch (err) { avisar(err); } } });
  const t = ultimaCopia();
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Copias y mudanza"),
    h("p", { class: "nota", style: { margin: 0 } }, `Última copia: ${t ? new Date(t).toLocaleString(LOCALE) + " (" + haceCuanto(t) + ")" : "ninguna todavía"}. La copia lleva agentes, memorias, ajustes, gasto, imágenes y música. No lleva tus claves.`),
    h("div", { class: "fila-c" }, h("button", { class: "btn mini primario", onclick: () => guardarCopia({ conMedios: true }).then(() => pintarAjustes()).catch(avisar) }, "Guardar copia ahora"), h("button", { class: "btn mini", onclick: () => fi.click() }, "Cargar una copia o una mudanza"), fi),
    h("p", { class: "nota", style: { margin: 0 } }, "Mudanza (cuando la web pase a tu dominio): aquí pulsa «Preparar la mudanza»; en la web nueva, «Cargar una copia o una mudanza» con ese archivo. Pasan agentes, ajustes, imágenes y música; las claves las pegas otra vez. Si usas Google Drive, añade la dirección nueva en Google Cloud (paso 6 de conectar Drive)."),
    h("div", { class: "fila-c" }, h("button", { class: "btn mini", onclick: () => guardarCopia({ conMedios: true, mudanza: true }).catch(avisar) }, "Preparar la mudanza")),
    modo === "local" && store.get(K.v4) ? h("div", { class: "fila-c" }, h("span", { class: "nota" }, "Tu edificio de la versión 4, tal cual estaba."), h("button", { class: "btn mini", onclick: () => descargar(store.get(K.v4), "fer-edificio-version-4.json") }, "Descargarlo")) : null,
    copiaTecno() ? h("div", { class: "fila-c" }, h("span", { class: "nota" }, `Última copia de Tecno: ${copiaTecno().dia}.`), h("button", { class: "btn mini", onclick: () => descargar(copiaTecno().json, `fer-edificio-copia-${copiaTecno().dia}.json`) }, "Descargarla")) : null));
  c.append(h("div", { class: "bloque" }, h("h4", {}, "Empezar de nuevo"),
    h("p", { class: "nota", style: { margin: 0 } }, "Agentes de serie: los que trae Fer Agent (los sabios, Tecno, Arturito, el Creador, JEV, el Interventor y Memory). Se instalan y se quitan desde su página."),
    h("div", { class: "fila-c" }, h("button", { class: "btn mini", onclick: () => { cerrarCajon(); abrirPantalla("serie"); } }, "Abrir «Agentes de serie»")),
    ultimoAjuste ? h("p", { class: "nota", style: { margin: 0 } }, ultimoAjuste) : null,
    h("p", { class: "nota", style: { margin: 0 } }, "Empezar de cero: «Solo el jefe» o «Con el equipo recomendado» (cúpula, planta técnica y vestíbulo con sus agentes). Se conservan los ajustes y el gasto."),
    h("div", { class: "fila-c" }, plantilla("vacio", "Solo el jefe"), plantilla("basico", "Con el equipo recomendado"))));
  c.append(h("p", { class: "nota" }, `Fer Agent Edificio · versión ${VERSION} · código abierto · los precios y modelos vienen en directo de OpenRouter.`));
  c.scrollTop = sc;
}
// El cerebro en Ajustes: dónde vive, cómo conectarlo y qué ve la web
function bloqueCerebro() {
  const st = cerebro.estado, caja = h("div", { class: "bloque" }, h("h4", {}, "Cerebro: Biblioteca y Memoria larga"));
  if (esApp()) {
    const cc = casaInfo.carpeta || {};
    caja.append(h("p", { class: "nota", style: { margin: 0 } }, "En la aplicación, el cerebro vive en una carpeta de este ordenador: «Biblioteca» (tus notas), «Memoria larga» (una nota por tema) y «edificio.json». Si eliges una carpeta dentro de Google Drive para ordenador, también la tienes en Drive y en Obsidian."),
      h("div", { class: "estado-carpeta" }, h("i", { class: "punto " + (cc.ruta ? "ok" : "") }), h("span", {}, tr("Carpeta:") + " ", crudo(cc.ruta || "")),
        cc.notas !== undefined ? h("span", { class: "nota" }, " · " + tr(`${cc.notas} temas`) + " · " + tr(`${cc.biblioteca || 0} notas en la Biblioteca`)) : null),
      window.ferApp && window.ferApp.elegirCarpeta ? h("button", { class: "btn mini", type: "button", onclick: async () => {
        try {
          const ruta = await window.ferApp.elegirCarpeta(); if (!ruta) return;
          await llamarApp("/api/conf/carpeta", { ruta });
          avisoFlotante("Carpeta guardada. La aplicación se vuelve a abrir para usarla.");
          setTimeout(() => window.ferApp.reiniciar(), 1500);
        } catch (e) { avisar(e); }
      } }, "Cambiar la carpeta") : null);
    return caja;
  }
  if (modo === "casa") {
    const cc = casaInfo.carpeta || {};
    caja.append(h("p", { class: "nota", style: { margin: 0 } }, "Con Fer Casa, el cerebro vive en una carpeta de ese ordenador: «Biblioteca» (tus notas), «Memoria larga» (una nota por tema) y «edificio.json». Si esa carpeta está dentro de Google Drive para ordenador, también la tienes en Drive y en Obsidian."),
      h("div", { class: "estado-carpeta" }, h("i", { class: "punto " + (cc.ruta ? "ok" : "") }), h("span", {}, cc.ruta ? `Carpeta: ${cc.ruta}` : "Carpeta: la de datos de Fer Casa (datos/cerebro)"),
        cc.notas !== undefined ? h("span", { class: "nota" }, `· ${cc.notas} temas · ${cc.biblioteca || 0} notas en la Biblioteca`) : null),
      h("small", { class: "nota" }, "Para cambiarla: en el ordenador de Fer Casa, node fer-casa.mjs carpeta"));
    return caja;
  }
  const conf = store.json(K.carpeta, null) || {};
  caja.append(h("div", { class: "estado-carpeta" }, h("i", { class: "punto " + (st.conectado ? "ok" : st.error ? "mal" : "") }),
    h("span", {}, st.conectado ? tr("Conectado:") + " " + st.nombre : st.error ? `${st.nombre || tr("Carpeta")}: ${st.error}` : "Sin carpeta: el cerebro vive solo en este navegador."),
    st.conectado ? h("span", { class: "nota" }, "· " + tr(`${st.notas} temas en la memoria larga`) + " · " + tr(`${st.biblioteca} notas en la Biblioteca`) + (st.ultimaSync ? " · " + tr(`sincronizado ${haceCuanto(st.ultimaSync)}`) : "")) : null));
  if (st.necesitaPermiso && cerebro.estado.tipo === "local") caja.append(h("div", {}, h("button", { class: "btn mini primario", onclick: async () => { const hnd = await idb.get("kv", "carpetaLocal"); if (hnd) conectarCerebro(adaptadorLocal(hnd), true).catch(avisar); } }, "Dar permiso otra vez a la carpeta")));
  // Google Drive
  const cid = h("input", { placeholder: "ID de cliente de Google (termina en .apps.googleusercontent.com)", value: conf.clientId || "" });
  const conectarDrive = h("button", { class: "btn mini primario", type: "button", onclick: async () => {
    const id = cid.value.trim();
    if (!/\.apps\.googleusercontent\.com$/.test(id)) { avisar(Object.assign(new Error("Ese no parece un ID de cliente de Google (debe terminar en .apps.googleusercontent.com). Mira los pasos."), { mostrado: true })); return; }
    store.set(K.carpeta, JSON.stringify({ tipo: "drive", clientId: id }));
    conectarDrive.disabled = true;
    try { await conectarCerebro(adaptadorDrive(id), true); avisoFlotante("Drive conectado: la web ve solo su carpeta «Fer Agent»."); } catch (err) { avisar(Object.assign(new Error("No se pudo conectar Drive: " + err.message), { mostrado: true })); }
    conectarDrive.disabled = false;
  } }, st.conectado && st.tipo === "drive" ? "Volver a conectar" : "Conectar Google Drive");
  caja.append(h("div", { class: "campo" }, h("span", {}, "Google Drive (recomendado: el móvil y el Mac ven el mismo edificio)"), cid, h("div", {}, conectarDrive)),
    h("details", {}, h("summary", {}, "Pasos para conectar Drive (una vez, unos 10 minutos)"), h("ol", { class: "nota pasos-drive" },
      h("li", {}, "Entra en console.cloud.google.com con tu cuenta de Google y crea un proyecto (arriba: «Seleccionar proyecto» → «Proyecto nuevo»). Nombre: Fer Agent."),
      h("li", {}, "Menú → «APIs y servicios» → «Biblioteca» → busca «Google Drive API» → «Habilitar»."),
      h("li", {}, "«APIs y servicios» → «Pantalla de consentimiento de OAuth» (o «Google Auth Platform»): tipo «Externo», nombre de la app Fer Agent, tu correo de soporte y de contacto. Guarda."),
      h("li", {}, "En «Público» (o «Usuarios de prueba»), añade tu correo de Google como usuario de prueba. Deja la app «en pruebas»: no hace falta publicarla."),
      h("li", {}, "En «Acceso a datos» (o «Permisos»), añade el permiso …/auth/drive.file. Es el que solo deja ver los archivos que crea la propia web."),
      h("li", {}, tr("«Credenciales» (o «Clientes») → «Crear credenciales» → «ID de cliente de OAuth» → tipo «Aplicación web». En «Orígenes de JavaScript autorizados» pon") + " " + location.origin + " " + tr("(y, cuando te mudes, también la dirección nueva). No hace falta poner nada en «URIs de redirección».")),
      h("li", {}, "Copia el «ID de cliente» (termina en .apps.googleusercontent.com), pégalo arriba y pulsa «Conectar Google Drive». Elige tu cuenta y da permiso. Si Google avisa de que la app no está verificada, es porque es la tuya y está en pruebas: pulsa «Continuar»."),
      h("li", {}, "Repite el paso 7 en el móvil (mismo ID). La web creará en tu Drive la carpeta «Fer Agent». No la crees tú a mano."))));
  // carpeta de este ordenador
  if (window.showDirectoryPicker) caja.append(h("div", { class: "campo" }, h("span", {}, "O una carpeta de este ordenador (Chrome o Edge)"),
    h("div", {}, h("button", { class: "btn mini", type: "button", onclick: async () => {
      let hnd; try { hnd = await window.showDirectoryPicker({ mode: "readwrite", id: "fer-agent-cerebro" }); } catch { return; }
      await idb.put("kv", "carpetaLocal", hnd); store.set(K.carpeta, JSON.stringify({ tipo: "local" }));
      try { await conectarCerebro(adaptadorLocal(hnd), true); avisoFlotante("Carpeta conectada."); } catch (err) { avisar(err); }
    } }, st.conectado && st.tipo === "local" ? "Elegir otra carpeta" : "Elegir carpeta")),
    h("small", { class: "nota" }, "Sirve para quien no use Drive. Ojo: lo que guarde otro aparato en Drive con la web no lo verá esta carpeta, ni al revés; usa una sola forma en todos tus aparatos.")));
  const fb = h("input", { type: "file", multiple: true, accept: ".md,.txt,text/markdown,text/plain", hidden: true, onchange: async (ev) => { try { const n = await subirBiblioteca([...ev.target.files]); avisoFlotante(n === 1 ? tr("1 nota añadida a la Biblioteca.") : tr(`${n} notas añadidas a la Biblioteca.`)); pintarAjustes(); } catch (err) { avisar(err); } ev.target.value = ""; } });
  caja.append(h("div", { class: "fila-c" },
    st.conectado ? h("button", { class: "btn mini", onclick: () => sincronizarCerebro().then(() => avisoFlotante("Sincronizado.")) }, "Sincronizar ahora") : null,
    h("button", { class: "btn mini", onclick: () => fb.click() }, "Añadir notas a la Biblioteca"), fb,
    st.conectado || conf.tipo ? h("button", { class: "btn mini", onclick: (ev) => confirmar(ev.target, "¿Desconectar? Pulsa otra vez", () => { clearInterval(cerebro.temporizador); cerebro.ad = null; Object.assign(cerebro.estado, { conectado: false, error: "", nombre: "" }); try { localStorage.removeItem(K.carpeta); } catch {} cargarBibliotecaLocal(); pintarAjustes(); }) }, "Desconectar") : null),
    h("small", { class: "nota" }, "Qué ve la web: con Drive, solo los archivos que ella misma crea en «Fer Agent» (permiso drive.file); nada más de tu Drive. Lo que corrijas en Obsidian en esas notas lo vuelve a leer. Una nota NUEVA que escribas a mano en Obsidian no la ve, porque no la creó ella: súbela con «Añadir notas a la Biblioteca» (queda dentro de su carpeta y desde ahí la editas). Para que viera cualquier nota nueva haría falta el permiso de leer todo tu Drive, que Google trata como restringido y que dejaría ver todo, no solo su carpeta: por eso no se pide."));
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
        error_callback: (e) => rej(new Error((e && (e.message || e.type)) || "Google no dio permiso")) });
      tc.requestAccessToken({ prompt: interactivo ? "consent" : "" });
    });
    token = r.access_token; caduca = Date.now() + ((Number(r.expires_in) || 3600) - 120) * 1000;
  }
  async function api(url, init = {}, otra = true) {
    if (!token || Date.now() > caduca) await pedirToken(false);
    const r = await fetch(url, Object.assign({}, init, { headers: Object.assign({ Authorization: "Bearer " + token }, init.headers || {}) }));
    if (r.status === 401 && otra) { token = null; return api(url, init, false); }
    if (!r.ok) { let det = ""; try { det = ((await r.json()).error || {}).message || ""; } catch {} throw new Error(`Google Drive respondió ${r.status}${det ? ": " + det : ""}`); }
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
    tipo: "drive", nombre: "Google Drive · carpeta «Fer Agent»",
    async conectar(interactivo) { await pedirToken(interactivo); await idCarpeta("Biblioteca"); await idCarpeta("Memoria larga"); },
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
    tipo: "local", nombre: `Carpeta de este ordenador «${handle.name}»`,
    async conectar(interactivo) {
      let p = await handle.queryPermission({ mode: "readwrite" });
      if (p !== "granted" && interactivo) p = await handle.requestPermission({ mode: "readwrite" });
      if (p !== "granted") throw Object.assign(new Error("Chrome necesita que vuelvas a dar permiso a la carpeta (Ajustes → Cerebro)."), { permiso: true });
      await dir("Biblioteca", true); await dir("Memoria larga", true);
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
    for (const x of await ad.listar("Memoria larga", false)) {
      const nombre = x.ruta.split("/").pop();
      if (!/\.md$/i.test(nombre) || nombre === "Índice.md") continue;
      if ((cerebro.vistos.get(x.ruta) || 0) >= x.modificado) continue;
      const texto = await ad.leer(x);
      cerebro.vistos.set(x.ruta, x.modificado);
      if (cerebro.escritos.get(x.ruta) === texto) continue;
      await Motor.ejecutar({ tipo: "memoria.importar", tema: nombre.replace(/\.md$/i, ""), texto, conservarDesde: desde });
    }
    if (!op.soloEscribir) {
      // Biblioteca: tus notas, para que Memory busque en ellas (solo lectura)
      const docs = [];
      for (const x of (await ad.listar("Biblioteca", true)).filter((y) => /\.(md|txt)$/i.test(y.ruta))) {
        let c = await idb.get("biblio", ad.tipo + ":" + x.ruta);
        if (!c || c.modificado < x.modificado) { c = { modificado: x.modificado, texto: (await ad.leer(x)).slice(0, 300000) }; await idb.put("biblio", ad.tipo + ":" + x.ruta, c); }
        docs.push({ ruta: x.ruta, titulo: x.ruta.split("/").pop().replace(/\.(md|txt)$/i, ""), texto: c.texto });
      }
      ed.setBiblioteca(docs);
      cerebro.estado.biblioteca = docs.length;
    }
    // lo que cambió aquí sale a la carpeta: las notas de la Memoria larga y la copia del edificio
    const notas = notasMemoriaMd(ed.e.memoriaLarga, nombresAgentes());
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
  await ad.escribir("edificio.json", JSON.stringify({ tipo: "fer-agent-edificio", version: VERSION, aparato, ts, edificio: ed.e }), "application/json");
  cerebro.miEdificio = ts; cerebro.vistoEdificio = Math.max(cerebro.vistoEdificio, ts); cerebro.cambios = 0;
  cerebro.estado.ultimaCopia = ts;
}
// ¿Tu otro aparato (el móvil o el Mac) guardó el edificio después? Si aquí no has cambiado nada, se carga; si sí, eliges.
async function traerEdificio(ad) {
  const x = (await ad.listar("", false)).find((y) => y.ruta === "edificio.json");
  if (!x || x.modificado <= cerebro.vistoEdificio) return false;
  let d = null; try { d = JSON.parse(await ad.leer(x)); } catch { return false; }
  if (!d || d.tipo !== "fer-agent-edificio" || !d.edificio || d.aparato === aparato || (d.ts || 0) <= cerebro.miEdificio) { cerebro.vistoEdificio = x.modificado; return false; }
  // los dos aparatos han cambiado cosas: eliges tú (y hasta entonces no se marca como visto ni se escribe encima)
  if (cerebro.cambios && cerebro.miEdificio) { cerebro.conflicto = { d, modificado: x.modificado }; avisoConflicto(d); return false; }
  cerebro.vistoEdificio = x.modificado;
  await Motor.ejecutar({ tipo: "importar", estado: d.edificio });
  cerebro.miEdificio = d.ts; cerebro.cambios = 0;
  avisoFlotante(`Cargado el edificio que guardó tu otro aparato (${new Date(d.ts).toLocaleString(LOCALE)}).`);
  pintar(); if (chatId) pintarChat(true);
  return true;
}
function avisoConflicto(d) {
  if ($("conflicto")) return;
  const caja = h("div", { id: "conflicto", class: "aviso-flotante conflicto", role: "alertdialog" },
    h("b", {}, "Tu otro aparato guardó cambios en el edificio"), h("span", {}, `Los suyos son de ${new Date(d.ts).toLocaleString(LOCALE)}. Aquí también has cambiado cosas. ¿Con cuáles te quedas?`),
    h("div", { class: "fila-c" },
      h("button", { class: "btn mini primario", onclick: async () => { caja.remove(); const c = cerebro.conflicto; cerebro.conflicto = null; await Motor.ejecutar({ tipo: "importar", estado: d.edificio }).catch(avisar); cerebro.miEdificio = d.ts; cerebro.cambios = 0; if (c) cerebro.vistoEdificio = Math.max(cerebro.vistoEdificio, c.modificado); pintar(); if (chatId) pintarChat(true); } }, "Cargar los del otro aparato"),
      h("button", { class: "btn mini", onclick: async () => { caja.remove(); const c = cerebro.conflicto; cerebro.conflicto = null; if (c) cerebro.vistoEdificio = Math.max(cerebro.vistoEdificio, c.modificado); if (cerebro.ad) await escribirEdificio(cerebro.ad).catch(avisar); } }, "Quedarme con los de aquí")));
  document.body.append(caja);
}
// La Biblioteca sin carpeta (solo en este navegador) o subir notas a la carpeta
async function subirBiblioteca(archivos) {
  let n = 0;
  for (const f of archivos) {
    if (!/\.(md|txt)$/i.test(f.name)) continue;
    const texto = await f.text();
    if (cerebro.ad) await cerebro.ad.escribir("Biblioteca/" + f.name, texto);
    else await idb.put("biblio", "navegador:Biblioteca/" + f.name, { modificado: Date.now(), texto: texto.slice(0, 300000) });
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
  avisoFlotante(mudanza ? "Mudanza preparada: abre la web nueva y en Ajustes → Mudanza carga este archivo." : (Object.keys(p.medios || {}).length ? tr(`Copia guardada en tus descargas con ${Object.keys(p.medios).length} imágenes y músicas.`) : tr("Copia guardada en tus descargas.")));
}
async function cargarCopia(texto) {
  let d; try { d = JSON.parse(texto); } catch { throw Object.assign(new Error("Ese archivo no es una copia de Fer Agent."), { mostrado: true }); }
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
$("pausa").onclick = () => { const p = !ed.e.ajustes.pausa; Motor.ejecutar({ tipo: "pausa", pausa: p }).then(() => { pintar(); avisoFlotante(p ? "Pausa general puesta: nada que gaste se despierta solo." : "Automático en marcha: los latidos vuelven a funcionar."); }).catch(avisar); };
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
    h("div", {}, h("h2", { id: "otraT" }, "El edificio ya está abierto en otra pestaña"),
      h("p", {}, "Úsalo allí. Si lo abres en dos pestañas a la vez, una puede deshacer lo que hace la otra y algún trabajo se pagaría dos veces."),
      h("p", { class: "nota" }, "Si cierras la otra, esta se abre sola."))));
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
    if (!ed.e) { ed.e = { nombre: "Fer Casa", ajustes: { pausa: true }, plantas: [], agentes: [], memoriaLarga: [], conversacion: [], registro: [], propuestas: [], monedas: [], lecciones: [], reuniones: [], consultasJev: [], propuestasModelos: [], autorizaciones: [] }; abrirCajon("ajustes"); }
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
          if (!avisoLleno) { avisoLleno = true; pendientesError.push("No se pudo guardar el edificio: el almacenamiento de este navegador está lleno. Descarga una copia en Ajustes y borra tareas o recuerdos antiguos."); pintarChat(true); } }
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
        if (txt.length > 1e6) throw new Error("el edificio es demasiado grande para guardarlo en el navegador; descarga la copia en Ajustes");
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
