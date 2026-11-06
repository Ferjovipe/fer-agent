// =====================================================================
// Fer Casa · LAS MANOS DE LOS AGENTES
// Lo mismo que hacen Hermes y OpenClaw, dentro de Fer Casa, en tu ordenador:
//   · un Chrome propio de los agentes (con su perfil: entras una vez en X, en tu correo nuevo…, y se queda guardado);
//   · una carpeta propia para sus archivos (no pueden salir de ella);
//   · skills: carpetas con un SKILL.md (el formato de agentskills.io que usan Hermes y OpenClaw) y, si hace falta, su programa.
// Lo que tiene efecto fuera de la web («efecto: externo» en su SKILL.md) no se hace sin tu sí: pasa por la bandeja.
// El Chrome lo mueve Playwright (código abierto, de Microsoft). Se instala una vez: npm install playwright-core
// =====================================================================
import fs from "node:fs/promises";
import { existsSync, readdirSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import dns from "node:dns/promises";
import net from "node:net";
const requerir = createRequire(import.meta.url);

// ---------------- Solo internet: nada de tu red de casa, de este ordenador ni de las direcciones internas de un servidor ----------------
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
  if (["data:", "blob:", "about:"].includes(u.protocol)) return true;   // trozos de la propia página
  if (!/^https?:$/.test(u.protocol)) return false;
  if (process.env.FER_PERMITIR_LOCAL === "1") return true;           // solo para las pruebas
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
async function soloInternet(page) {   // también para lo que la página pida por su cuenta y para las redirecciones
  await page.route("**/*", async (r) => { if (await esDireccionPublica(r.request().url())) await r.continue().catch(() => {}); else await r.abort("blockedbyclient").catch(() => {}); });
}

// ---------------- SKILL.md: cabecera (name, description, …) y cuerpo ----------------
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

// Una ruta dentro de la carpeta de los agentes (nunca fuera de ella)
export function dentroDe(base, ruta) {
  const destino = path.resolve(base, String(ruta || ".").replace(/^[/\\]+/, ""));
  const raiz = path.resolve(base);
  if (destino !== raiz && !destino.startsWith(raiz + path.sep)) throw new Error("Esa ruta sale de la carpeta de los agentes: no se permite.");
  return destino;
}

export function crearManos(op) {
  const o = Object.assign({ visible: false, log: () => {} }, op);
  mkdirSync(o.carpetaAgentes, { recursive: true });
  mkdirSync(o.perfilChrome, { recursive: true });
  let skills = new Map(), contexto = null, abriendo = null, cola = Promise.resolve();

  // ---------------- Cargar las skills (las que vienen con Fer Agent y las tuyas en datos/skills) ----------------
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
            efecto: cab.efecto === "externo" ? "externo" : "lee", fija: cab.fija === true, datos: cab.datos ? String(cab.datos) : "",   // «fija» solo si su SKILL.md lo dice
            tiempo: Math.min(3600, Math.max(10, Number(cab.tiempo) || 300)),   // segundos que puede tardar como mucho (por defecto 5 minutos)
            ajustes: Array.isArray(cab.ajustes) ? cab.ajustes : [], script: cab.script ? path.join(dir, n, String(cab.script)) : "", instrucciones: cuerpo.slice(0, 4000), carpeta: path.join(dir, n) });
        } catch (err) { o.log(`No pude leer la skill ${n}: ${err.message}`); }
      }
    }
    skills = nuevas;
    return skills;
  }
  cargar();

  // ---------------- El Chrome de los agentes ----------------
  async function navegador() {
    if (contexto) return contexto;
    if (abriendo) return abriendo;
    abriendo = (async () => {
      let pw = null;
      for (const n of ["playwright-core", "playwright"]) { try { pw = await import(n); break; } catch {} try { pw = requerir(n); break; } catch {} }
      if (!pw) throw Object.assign(new Error("Falta instalar Playwright. En la carpeta de Fer Casa, escribe: npm install playwright-core"), { mostrado: true });
      const chromium = pw.chromium || (pw.default && pw.default.chromium);
      const base = { headless: !o.visible, viewport: { width: 1280, height: 900 }, locale: "es-ES", args: ["--disable-blink-features=AutomationControlled"] };
      try { contexto = await chromium.launchPersistentContext(o.perfilChrome, Object.assign({ channel: o.canal || "chrome" }, base)); }
      catch (err) {
        try { contexto = await chromium.launchPersistentContext(o.perfilChrome, base); }   // si no hay Google Chrome, el Chromium de Playwright (si está)
        catch { throw Object.assign(new Error("No pude abrir el Chrome de los agentes. ¿Tienes Google Chrome instalado? (" + err.message.split("\n")[0] + ")"), { mostrado: true }); }
      }
      const este = contexto;
      este.on("close", () => { if (contexto === este) contexto = null; });
      o.log(`Chrome de los agentes abierto (perfil: ${o.perfilChrome}).`);
      return contexto;
    })();
    try { return await abriendo; } finally { abriendo = null; }
  }
  async function cerrarChrome() {
    const c = contexto; contexto = null;
    if (c) await Promise.race([c.close().catch(() => {}), new Promise((r) => setTimeout(r, 10000))]);   // si ni cerrar responde, se deja atrás
  }
  async function conPagina(f) {
    const ctx = await navegador();
    const page = await ctx.newPage();
    try { return await f(page); } finally { try { await page.close(); } catch {} }
  }

  // Lo que reciben los programas de las skills
  const herramientas = {
    conPagina, navegador, esDireccionPublica, soloInternet,
    carpeta: o.carpetaAgentes,
    ruta: (r) => dentroDe(o.carpetaAgentes, r),
    log: (...a) => o.log(...a),
    ahora: () => Date.now()
  };

  return {
    catalogo() { return [...skills.values()].map(({ nombre, titulo, descripcion, efecto, fija, datos, ajustes }) => ({ nombre, titulo, descripcion, efecto, fija, datos, ajustes })); },
    recargar: cargar,
    // Se hacen de una en una (un solo Chrome): así dos skills no se pisan
    ejecutar(nombre, datos, ctx) {
      const tarea = cola.then(async () => {
        const sk = skills.get(nombre);
        if (!sk) throw new Error(`No existe la skill «${nombre}».`);
        if (sk.efecto === "externo" && !(ctx && ctx.autorizado)) throw new Error(`La skill «${nombre}» tiene efecto fuera de la web: necesita tu permiso (bandeja).`);
        if (!sk.script) return { texto: sk.instrucciones };   // una skill solo de instrucciones
        const mod = await import(pathToFileURL(sk.script).href + "?v=" + Date.now());
        const f = mod.default || mod.ejecutar;
        if (typeof f !== "function") throw new Error(`La skill «${nombre}» no tiene programa que ejecutar.`);
        // Con reloj: si una página se cuelga, la skill se para, se cierra su Chrome y la cola sigue con la siguiente
        const corre = Promise.resolve().then(() => f(datos || {}, herramientas, ctx || {}));
        corre.catch(() => {});
        let reloj;
        const limite = new Promise((_, mal) => { reloj = setTimeout(() => mal(Object.assign(new Error(`La skill «${nombre}» tardó más de ${sk.tiempo} s: la he parado y he cerrado su Chrome.`), { mostrado: true, tiempo: true })), sk.tiempo * 1000); });
        let r;
        try { r = await Promise.race([corre, limite]); }
        catch (err) { if (err.tiempo) { o.log(err.message); await cerrarChrome(); } throw err; }
        finally { clearTimeout(reloj); }
        return typeof r === "string" ? { texto: r } : (r || { texto: "" });
      });
      cola = tarea.catch(() => {});
      return tarea;
    },
    async abrirVisible(url) {   // para entrar tú una vez (por ejemplo, en X) en el Chrome de los agentes
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
