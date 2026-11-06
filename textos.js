// =====================================================================
// Fer Agent · TEXTOS Y TRADUCCIÓN
// La web está escrita en español. Para traducirla no hay que tocar el resto del código:
//   1. Copia textos/es.js como textos/xx.js (xx = el idioma).
//   2. Traduce los valores (lo de la derecha). Las frases con datos usan {1}, {2}…
//   3. Añade el idioma a IDIOMAS (aquí) y a IDIOMAS_MOTOR (engine.js).
// Cada texto que se ve en pantalla pasa por tr(): si hay traducción, se usa; si no, se queda en español.
// El mismo diccionario lo usa el motor para lo que se dice a los agentes en un edificio en ese idioma.
// =====================================================================
let exactos = null, patrones = [], porInicio = new Map(), generales = [];
export let idioma = "es";
// Idiomas que se pueden elegir (en la portada y en Ajustes)
export const IDIOMAS = { en: "English", es: "Español" };
const GUARDADO = "ferAgent.idioma";

const quitarEspacios = (s) => s.replace(/\s+/g, " ").trim();

// Las frases con datos (números, nombres) se escriben en el diccionario con {1}, {2}…
// y aquí se convierten en patrones: «Hoy {1}» casa con «Hoy 0,0123 $».
function compilar(dic) {
  exactos = new Map(); patrones = []; porInicio = new Map(); generales = [];
  for (const [es, otro] of Object.entries(dic || {})) {
    if (typeof otro !== "string" || !otro) continue;
    if (/\{\d+\}/.test(es)) {
      const k = quitarEspacios(es);
      const partes = k.split(/(\{\d+\})/);
      const orden = [];
      const re = new RegExp("^" + partes.map((p) => { const m = p.match(/^\{(\d+)\}$/); if (m) { orden.push(m[1]); return "(.+?)"; } return p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("") + "$", "s");
      const fijo = partes.filter((p) => !/^\{\d+\}$/.test(p)).join("");
      const p = { re, orden, otro: quitarEspacios(otro), fijo: fijo.length };
      patrones.push(p);
      // índice por las dos primeras letras: así cada texto solo se prueba contra los patrones que pueden casar
      const inicio = partes[0].length >= 2 ? partes[0].slice(0, 2) : "";
      if (inicio) { if (!porInicio.has(inicio)) porInicio.set(inicio, []); porInicio.get(inicio).push(p); } else generales.push(p);
    } else exactos.set(quitarEspacios(es), otro);
  }
  generales.sort((a, b) => b.fijo - a.fijo);   // primero los más concretos
  for (const l of porInicio.values()) l.sort((a, b) => b.fijo - a.fijo);   // también en cada grupo: «de tu suscripción de {1}» antes que «de {1}»
}

// Un dato dentro de una frase (un papel, un estado…) también se traduce si es un texto del diccionario
// (los nombres del edificio —agentes, plantas y el propio edificio— son datos: se quedan como están)
const dato = (x) => {
  const k = quitarEspacios(x);
  if (nombres.has(k)) return x;
  const bordes = (t) => x.match(/^\s*/)[0] + t + x.match(/\s*$/)[0];
  const e = exactos.get(k);
  if (e !== undefined) return bordes(e);
  for (const p of [...(porInicio.get(k.slice(0, 2)) || []), ...generales.filter((g) => g.orden.length === 1)]) { const m = k.match(p.re); if (m) { const v = {}; p.orden.forEach((n, i) => { v[n] = m[i + 1]; }); return bordes(p.otro.replace(/\{(\d+)\}/g, (y, n) => (v[n] !== undefined ? v[n] : y))); } }
  return x;
};
// Los nombres que ha puesto cada uno (o que traía el edificio) no se traducen: si el jefe se llama «Jefe», se ve «Jefe».
let nombres = new Set();
export function fijarNombres(lista) { nombres = new Set((lista || []).filter((x) => typeof x === "string" && x.trim()).map(quitarEspacios)); }
export function tr(s) {
  if (!exactos || typeof s !== "string" || !s.trim()) return s;
  const k = quitarEspacios(s);
  if (nombres.has(k)) return s;
  return traducirTexto(s, k);
}
// Para los textos de la web que coinciden con un nombre (el papel «Jefe», por ejemplo): se traducen siempre.
export function trSiempre(s) {
  if (!exactos || typeof s !== "string" || !s.trim()) return s;
  return traducirTexto(s, quitarEspacios(s));
}
function traducirTexto(s, k) {
  const e = exactos.get(k);
  if (e !== undefined) return s.match(/^\s*/)[0] + e + s.match(/\s*$/)[0];   // se conservan los espacios de los bordes
  for (const p of [...(porInicio.get(k.slice(0, 2)) || []), ...generales]) {
    const m = k.match(p.re);
    if (m) { const v = {}; p.orden.forEach((n, i) => { v[n] = dato(m[i + 1]); }); return s.match(/^\s*/)[0] + p.otro.replace(/\{(\d+)\}/g, (x, n) => (v[n] !== undefined ? v[n] : x)) + s.match(/\s*$/)[0]; }   // los nombres y cifras no se tocan; los espacios de los bordes, tampoco
  }
  return s;
}

// Qué idioma se usa: el de la dirección (?lang=xx), el que eligió esta persona, el de su edificio o el de su navegador
// (español si el navegador está en español; si no, inglés).
export function idiomaGuardado() { try { return localStorage.getItem(GUARDADO) || ""; } catch { return ""; } }
export function guardarIdioma(id) { try { localStorage.setItem(GUARDADO, id); } catch {} }
export function idiomaDelNavegador() { return /^es\b/i.test(navigator.language || "") ? "es" : "en"; }
export async function cargarIdioma(delEdificio) {
  let pedido = "";
  try { pedido = new URLSearchParams(location.search).get("lang") || ""; } catch {}
  pedido = pedido || idiomaGuardado() || delEdificio || idiomaDelNavegador();
  pedido = String(pedido).toLowerCase().replace(/[^a-z-]/g, "").slice(0, 8) || "es";
  idioma = "es"; exactos = null; patrones = []; porInicio = new Map(); generales = [];
  document.documentElement.lang = "es";
  if (pedido === "es") return "es";
  try {
    const mod = await import("./textos/" + pedido + ".js");
    compilar(mod.default || {});
    idioma = pedido;
    document.documentElement.lang = pedido;
  } catch { exactos = null; patrones = []; }
  return idioma;
}

// Traduce lo que viene escrito en la página (index.html): textos y los atributos que se leen.
export function traducirPagina(raiz) {
  if (!exactos) return;
  const w = document.createTreeWalker(raiz || document.body, NodeFilter.SHOW_TEXT);
  const nodos = [];
  while (w.nextNode()) nodos.push(w.currentNode);
  for (const n of nodos) { if (n.parentElement && /^(SCRIPT|STYLE)$/.test(n.parentElement.tagName)) continue; const t = tr(n.nodeValue); if (t !== n.nodeValue) n.nodeValue = t; }
  for (const el of (raiz || document.body).querySelectorAll("[title],[placeholder],[aria-label],[alt]")) {
    for (const a of ["title", "placeholder", "aria-label", "alt"]) if (el.hasAttribute(a)) el.setAttribute(a, tr(el.getAttribute(a)));
  }
  document.title = tr(document.title);
}
