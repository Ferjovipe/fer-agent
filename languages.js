// =====================================================================
// Fer Agent · TEXTS AND TRANSLATION
// The website is written in English. To translate it you don't need to touch the rest of the code:
//   1. Copy languages/es.js as languages/xx.js (xx = the language code).
//   2. Translate the values (the right-hand side). Texts with data use {1}, {2}…
//   3. Add the language to LANGUAGES (here) and to ENGINE_LANGUAGES (engine.js).
// Every text shown on screen goes through tr(): if there's a translation, it's used; if not, it stays in English.
// The engine uses the same dictionary for what it tells the agents in a building in that language.
// In English, tr() also turns into English what buildings made before version 9 saved in Spanish (activity, states…).
// =====================================================================
let exact = null, patterns = [], byStart = new Map(), general = [];
export let language = "en";
// Languages that can be chosen (on the home page and in Settings)
export const LANGUAGES = { en: "English", es: "Español" };
const SAVED_KEY = "ferAgent.language";

const squeezeSpaces = (s) => s.replace(/\s+/g, " ").trim();

// Sentences with data (numbers, names) are written in the dictionary with {1}, {2}…
// and here they become patterns: «Today {1}» matches «Today $0.0123».
function compile(dict) {
  exact = new Map(); patterns = []; byStart = new Map(); general = [];
  for (const [spanish, other] of Object.entries(dict || {})) {
    if (typeof other !== "string" || !other) continue;
    if (/\{\d+\}/.test(spanish) && spanish !== "#{1}") {   // «#{1}» (a place in a ranking) only as it is: as a pattern it would catch any text that starts with #
      const k = squeezeSpaces(spanish);
      const parts = k.split(/(\{\d+\})/);
      const order = [];
      const re = new RegExp("^" + parts.map((p) => { const m = p.match(/^\{(\d+)\}$/); if (m) { order.push(m[1]); return "(.+?)"; } return p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("") + "$", "s");
      const fixedPart = parts.filter((p) => !/^\{\d+\}$/.test(p)).join("");
      const p = { re, order, other: squeezeSpaces(other), fixedPart: fixedPart.length };
      patterns.push(p);
      // index by the first two letters: that way each text is only tried against the patterns that can match
      const beginning = parts[0].length >= 2 ? parts[0].slice(0, 2) : "";
      if (beginning) { if (!byStart.has(beginning)) byStart.set(beginning, []); byStart.get(beginning).push(p); } else general.push(p);
    } else exact.set(squeezeSpaces(spanish), other);
  }
  general.sort((a, b) => b.fixedPart - a.fixedPart);   // the most specific first
  for (const l of byStart.values()) l.sort((a, b) => b.fixedPart - a.fixedPart);   // also within each group: «from your {1} subscription» before «from {1}»
}

// A piece of data inside a sentence (a role, a state…) is also translated if it's a dictionary text
// (the building's names —agents, floors and the building itself— are data: they stay as they are)
const datum = (x) => {
  const k = squeezeSpaces(x);
  if (names.has(k)) return x;
  const edges = (t) => x.match(/^\s*/)[0] + t + x.match(/\s*$/)[0];
  const e = exact.get(k);
  if (e !== undefined) return edges(e);
  for (const p of [...(byStart.get(k.slice(0, 2)) || []), ...general.filter((g) => g.order.length === 1)]) { const m = k.match(p.re); if (m) { const v = {}; p.order.forEach((n, i) => { v[n] = m[i + 1]; }); return edges(p.other.replace(/\{(\d+)\}/g, (y, n) => (v[n] !== undefined ? v[n] : y))); } }
  return x;
};
// The names each person set (or that the building came with) aren't translated: if the boss is called «Jefe», you see «Jefe».
let names = new Set();
export function setNames(list) { names = new Set((list || []).filter((x) => typeof x === "string" && x.trim()).map(squeezeSpaces)); }
export function tr(s) {
  if (!exact || typeof s !== "string" || !s.trim()) return s;
  const k = squeezeSpaces(s);
  if (names.has(k)) return s;
  return translateText(s, k);
}
// For the website's texts that match a name (the role «Boss», for example): they're always translated.
export function trAlways(s) {
  if (!exact || typeof s !== "string" || !s.trim()) return s;
  return translateText(s, squeezeSpaces(s));
}
function translateText(s, k) {
  const e = exact.get(k);
  if (e !== undefined) return s.match(/^\s*/)[0] + e + s.match(/\s*$/)[0];   // the spaces at the edges are kept
  for (const p of [...(byStart.get(k.slice(0, 2)) || []), ...general]) {
    const m = k.match(p.re);
    if (m) { const v = {}; p.order.forEach((n, i) => { v[n] = datum(m[i + 1]); }); return s.match(/^\s*/)[0] + p.other.replace(/\{(\d+)\}/g, (x, n) => (v[n] !== undefined ? v[n] : x)) + s.match(/\s*$/)[0]; }   // names and figures aren't touched; nor are the spaces at the edges
  }
  return s;
}

// Which language is used: the address's (?lang=xx), the one this person chose, their building's or their browser's
// (Spanish if the browser is in Spanish; if not, English).
export function savedLanguage() { try { return localStorage.getItem(SAVED_KEY) || localStorage.getItem("ferAgent.idioma") || ""; } catch { return ""; } }   // «ferAgent.idioma»: before version 9
export function saveLanguage(id) { try { localStorage.setItem(SAVED_KEY, id); } catch {} }
export function browserLanguage() { return /^es\b/i.test(navigator.language || "") ? "es" : "en"; }
export async function loadLanguage(fromBuilding) {
  let requested = "";
  try { requested = new URLSearchParams(location.search).get("lang") || ""; } catch {}
  requested = requested || savedLanguage() || fromBuilding || browserLanguage();
  requested = String(requested).toLowerCase().replace(/[^a-z-]/g, "").slice(0, 8) || "en";
  language = "en"; exact = null; patterns = []; byStart = new Map(); general = [];
  document.documentElement.lang = "en";
  const spanish = await dictionary("es");
  // English: the program's own texts stay as they are; what earlier versions saved in Spanish is turned into English
  if (spanish) compile(Object.fromEntries(Object.entries(spanish).filter(([, v]) => typeof v === "string" && v).map(([k, v]) => [v, k])));
  if (requested === "en") return "en";
  const dict = requested === "es" ? spanish : await dictionary(requested);
  if (!dict) return language;
  compile(dict);
  language = requested;
  document.documentElement.lang = requested;
  return language;
}
async function dictionary(id) { try { return (await import("./languages/" + id + ".js")).default || {}; } catch { return null; } }

// Translates what is written in the page (index.html): texts and the attributes that are read out.
export function translatePage(root) {
  if (!exact) return;
  const w = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (w.nextNode()) nodes.push(w.currentNode);
  for (const n of nodes) { if (n.parentElement && /^(SCRIPT|STYLE)$/.test(n.parentElement.tagName)) continue; const t = tr(n.nodeValue); if (t !== n.nodeValue) n.nodeValue = t; }
  for (const el of (root || document.body).querySelectorAll("[title],[placeholder],[aria-label],[alt]")) {
    for (const a of ["title", "placeholder", "aria-label", "alt"]) if (el.hasAttribute(a)) el.setAttribute(a, tr(el.getAttribute(a)));
  }
  document.title = tr(document.title);
}
