// =====================================================================
// Fer Home · THE AGENTS' HANDS
// The same as Hermes and OpenClaw do, inside Fer Home, on your computer:
//   · the agents' own Chrome (with its profile: you sign in once to X, to your new email…, and it stays saved);
//   · a folder of their own for their files (they can't leave it);
//   · skills: folders with a SKILL.md (the agentskills.io format used by Hermes and OpenClaw) and, if needed, its program.
// Anything with an effect outside the website («efecto: externo» in its SKILL.md) isn't done without your yes: it goes through the inbox.
// The Chrome is driven by Playwright (open source, by Microsoft). It's installed once: npm install playwright-core
// =====================================================================
import fs from "node:fs/promises";
import { existsSync, readdirSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import dns from "node:dns/promises";
import net from "node:net";
import { traducir, rellenar, IDIOMA } from "./engine.js";
const requerir = createRequire(import.meta.url);
const L = (s, ...v) => rellenar(traducir(IDIOMA, s), v);   // in the building's language (Fer Home sets it when it opens the building)

// ---------------- Only the internet: nothing on your home network, this computer or a server's internal addresses ----------------
function ipPrivada(ip) {
  const x = String(ip).toLowerCase();
  if (x.startsWith("::ffff:")) return ipPrivada(x.slice(7));
  if (net.isIPv4(x)) {
    const [a, b] = x.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return x === "::" || x === "::1" || /^f[cd]/.test(x) || /^fe[89ab]/.test(x);
}
const cacheDns = new Map();
export async function esDireccionPublica(url) {
  let u; try { u = new URL(url); } catch { return false; }
  if (["data:", "blob:", "about:"].includes(u.protocol)) return true;   // pieces of the page itself
  if (!/^https?:$/.test(u.protocol)) return false;
  if (process.env.FER_PERMITIR_LOCAL === "1") return true;           // only for the tests
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || /\.(localhost|local|internal|lan|home\.arpa)$/.test(host)) return false;
  if (net.isIP(host)) return !ipPrivada(host);
  const c = cacheDns.get(host);
  if (c && Date.now() - c.ts < 60000) return c.ok;
  let ok = false;
  try { const ips = await dns.lookup(host, { all: true }); ok = ips.length > 0 && ips.every((x) => !ipPrivada(x.address)); } catch { ok = false; }
  cacheDns.set(host, { ok, ts: Date.now() }); if (cacheDns.size > 500) cacheDns.delete(cacheDns.keys().next().value);
  return ok;
}
async function soloInternet(page) {   // also for whatever the page asks for on its own and for redirects
  await page.route("**/*", async (r) => { if (await esDireccionPublica(r.request().url())) await r.continue().catch(() => {}); else await r.abort("blockedbyclient").catch(() => {}); });
}

// ---------------- SKILL.md: header (name, description, …) and body ----------------
export function leerSkillMd(texto) {
  const t = String(texto || "").replace(/\r/g, "");
  const m = t.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const cab = {};
  if (m) for (const l of m[1].split("\n")) {
    const x = l.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!x) continue;
    let v = x[2].trim();
    if (/^[[{]/.test(v)) { try { v = JSON.parse(v); } catch {} }
    else if (/^(true|false)$/.test(v)) v = v === "true";
    else v = v.replace(/^["']|["']$/g, "");
    cab[x[1]] = v;
  }
  return { cab, cuerpo: m ? m[2].trim() : t.trim() };
}

// A path inside the agents' folder (never outside it)
export function dentroDe(base, ruta) {
  const destino = path.resolve(base, String(ruta || ".").replace(/^[/\\]+/, ""));
  const raiz = path.resolve(base);
  if (destino !== raiz && !destino.startsWith(raiz + path.sep)) throw new Error(L("That path leaves the agents' folder: not allowed."));
  return destino;
}

export function crearManos(op) {
  const o = Object.assign({ visible: false, log: () => {} }, op);
  mkdirSync(o.carpetaAgentes, { recursive: true });
  mkdirSync(o.perfilChrome, { recursive: true });
  let skills = new Map(), contexto = null, abriendo = null, cola = Promise.resolve();

  // ---------------- Loading the skills (the ones that come with Fer Agent and yours in datos/skills) ----------------
  function cargar() {
    const nuevas = new Map();
    for (const dir of o.carpetasSkills) {
      let nombres = [];
      try { nombres = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { continue; }
      for (const n of nombres) {
        const f = path.join(dir, n, "SKILL.md");
        if (!existsSync(f)) continue;
        try {
          const { cab, cuerpo } = leerSkillMd(readFileSync(f, "utf8"));
          const nombre = String(cab.name || n).toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
          if (!/^[a-z0-9-]{2,40}$/.test(nombre)) continue;
          nuevas.set(nombre, { nombre, titulo: String(cab.title || cab.titulo || nombre), descripcion: String(cab.description || "").slice(0, 400),
            efecto: cab.efecto === "externo" ? "externo" : "lee", fija: cab.fija === true, datos: cab.datos ? String(cab.datos) : "",   // «fija» only if its SKILL.md says so
            tiempo: Math.min(3600, Math.max(10, Number(cab.tiempo) || 300)),   // seconds it can take at most (5 minutes by default)
            ajustes: Array.isArray(cab.ajustes) ? cab.ajustes : [], script: cab.script ? path.join(dir, n, String(cab.script)) : "", instrucciones: cuerpo.slice(0, 4000), carpeta: path.join(dir, n) });
        } catch (err) { o.log(L("I couldn't read the skill {1}: {2}", n, err.message)); }
      }
    }
    skills = nuevas;
    return skills;
  }
  cargar();

  // ---------------- The agents' Chrome ----------------
  async function navegador() {
    if (contexto) return contexto;
    if (abriendo) return abriendo;
    abriendo = (async () => {
      let pw = null;
      for (const n of ["playwright-core", "playwright"]) { try { pw = await import(n); break; } catch {} try { pw = requerir(n); break; } catch {} }
      if (!pw) throw Object.assign(new Error(L("Playwright isn't installed. In the Fer Home folder, type: npm install playwright-core")), { mostrado: true });
      const chromium = pw.chromium || (pw.default && pw.default.chromium);
      const base = { headless: !o.visible, viewport: { width: 1280, height: 900 }, locale: (typeof o.locale === "function" ? o.locale() : o.locale) || "es-ES", args: ["--disable-blink-features=AutomationControlled"] };
      try { contexto = await chromium.launchPersistentContext(o.perfilChrome, Object.assign({ channel: o.canal || "chrome" }, base)); }
      catch (err) {
        try { contexto = await chromium.launchPersistentContext(o.perfilChrome, base); }   // if there's no Google Chrome, Playwright's Chromium (if it's there)
        catch { throw Object.assign(new Error(L("I couldn't open the agents' Chrome. Do you have Google Chrome installed? ({1})", err.message.split("\n")[0])), { mostrado: true }); }
      }
      const este = contexto;
      este.on("close", () => { if (contexto === este) contexto = null; });
      o.log(L("The agents' Chrome is open (profile: {1}).", o.perfilChrome));
      return contexto;
    })();
    try { return await abriendo; } finally { abriendo = null; }
  }
  async function cerrarChrome() {
    const c = contexto; contexto = null;
    if (c) await Promise.race([c.close().catch(() => {}), new Promise((r) => setTimeout(r, 10000))]);   // if not even closing answers, it's left behind
  }
  async function conPagina(f) {
    const ctx = await navegador();
    const page = await ctx.newPage();
    try { return await f(page); } finally { try { await page.close(); } catch {} }
  }

  // What the skills' programs receive
  const herramientas = {
    conPagina, navegador, esDireccionPublica, soloInternet,
    carpeta: o.carpetaAgentes,
    ruta: (r) => dentroDe(o.carpetaAgentes, r),
    log: (...a) => o.log(...a),
    ahora: () => Date.now(),
    L   // their messages, in the building's language: h.L("English text {1}", value) (the translation goes in textos/es.js)
  };

  return {
    catalogo() { return [...skills.values()].map(({ nombre, titulo, descripcion, efecto, fija, datos, ajustes }) => ({ nombre, titulo, descripcion, efecto, fija, datos, ajustes })); },
    recargar: cargar,
    // They are done one at a time (a single Chrome): that way two skills don't step on each other
    ejecutar(nombre, datos, ctx) {
      const tarea = cola.then(async () => {
        const sk = skills.get(nombre);
        if (!sk) throw new Error(L("The skill “{1}” doesn't exist.", nombre));
        if (sk.efecto === "externo" && !(ctx && ctx.autorizado)) throw new Error(L("The skill “{1}” has an effect outside the website: it needs your permission (inbox).", nombre));
        if (!sk.script) return { texto: sk.instrucciones };   // a skill that is only instructions
        const mod = await import(pathToFileURL(sk.script).href + "?v=" + Date.now());
        const f = mod.default || mod.ejecutar;
        if (typeof f !== "function") throw new Error(L("The skill “{1}” has no program to run.", nombre));
        // With a clock: if a page hangs, the skill stops, its Chrome is closed and the queue goes on with the next one
        const corre = Promise.resolve().then(() => f(datos || {}, herramientas, ctx || {}));
        corre.catch(() => {});
        let reloj;
        const limite = new Promise((_, mal) => { reloj = setTimeout(() => mal(Object.assign(new Error(L("The skill “{1}” took more than {2} s: I stopped it and closed its Chrome.", nombre, sk.tiempo)), { mostrado: true, tiempo: true })), sk.tiempo * 1000); });
        let r;
        try { r = await Promise.race([corre, limite]); }
        catch (err) { if (err.tiempo) { o.log(err.message); await cerrarChrome(); } throw err; }
        finally { clearTimeout(reloj); }
        return typeof r === "string" ? { texto: r } : (r || { texto: "" });
      });
      cola = tarea.catch(() => {});
      return tarea;
    },
    async abrirVisible(url) {   // so you can sign in once yourself (for example, to X) in the agents' Chrome
      o.visible = true;
      await cerrarChrome();
      const ctx = await navegador();
      const page = ctx.pages()[0] || await ctx.newPage();
      await page.goto(url || "about:blank").catch(() => {});
      return ctx;
    },
    cerrar: cerrarChrome
  };
}
