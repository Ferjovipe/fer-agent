// =====================================================================
// Fer Home · THE AGENTS' HANDS
// The same as Hermes and OpenClaw do, inside Fer Home, on your computer:
//   · the agents' own Chrome (with its profile: you sign in once to X, to your new email…, and it stays saved);
//   · a folder of their own for their files (they can't leave it);
//   · skills: folders with a SKILL.md (the agentskills.io format used by Hermes and OpenClaw) and, if needed, its program.
// Anything with an effect outside the website («effect: external» in its SKILL.md) isn't done without your yes: it goes through the inbox.
// The Chrome is driven by Playwright (open source, by Microsoft). It's installed once: npm install playwright-core
// =====================================================================
import fs from "node:fs/promises";
import { existsSync, readdirSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import dns from "node:dns/promises";
import net from "node:net";
import { translate, fillIn, LANGUAGE, OLD_SKILL_NAMES } from "./engine.js";
const requireCjs = createRequire(import.meta.url);
const L = (s, ...v) => fillIn(translate(LANGUAGE, s), v);   // in the building's language (Fer Home sets it when it opens the building)

// ---------------- Only the internet: nothing on your home network, this computer or a server's internal addresses ----------------
function privateIp(ip) {
  const x = String(ip).toLowerCase();
  if (x.startsWith("::ffff:")) return privateIp(x.slice(7));
  if (net.isIPv4(x)) {
    const [a, b] = x.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return x === "::" || x === "::1" || /^f[cd]/.test(x) || /^fe[89ab]/.test(x);
}
const cacheDns = new Map();
export async function isPublicAddress(url) {
  let u; try { u = new URL(url); } catch { return false; }
  if (["data:", "blob:", "about:"].includes(u.protocol)) return true;   // pieces of the page itself
  if (!/^https?:$/.test(u.protocol)) return false;
  if (process.env.FER_ALLOW_LOCAL === "1") return true;           // only for the tests
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || /\.(localhost|local|internal|lan|home\.arpa)$/.test(host)) return false;
  if (net.isIP(host)) return !privateIp(host);
  const c = cacheDns.get(host);
  if (c && Date.now() - c.ts < 60000) return c.ok;
  let ok = false;
  try { const ips = await dns.lookup(host, { all: true }); ok = ips.length > 0 && ips.every((x) => !privateIp(x.address)); } catch { ok = false; }
  cacheDns.set(host, { ok, ts: Date.now() }); if (cacheDns.size > 500) cacheDns.delete(cacheDns.keys().next().value);
  return ok;
}
async function internetOnly(page) {   // also for whatever the page asks for on its own and for redirects
  await page.route("**/*", async (r) => { if (await isPublicAddress(r.request().url())) await r.continue().catch(() => {}); else await r.abort("blockedbyclient").catch(() => {}); });
}

// ---------------- SKILL.md: header (name, description, …) and body ----------------
// SKILL.md files written before version 9 used Spanish names; they are still read
const OLD_HEADER = { nombre: "name", titulo: "title", descripcion: "description", efecto: "effect", fija: "fixed", datos: "data", tiempo: "timeout", ajustes: "settings" };
const OLD_SETTING = { clave: "key", tipo: "type", nombre: "name", ayuda: "help", defecto: "default" };
const OLD_VALUE = { lee: "read", externo: "external", lista: "list", numero: "number", si_no: "yes_no", texto: "text" };
export function readSkillMd(text) {
  const t = String(text || "").replace(/\r/g, "");
  const m = t.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const header = {};
  if (m) for (const l of m[1].split("\n")) {
    const x = l.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!x) continue;
    let v = x[2].trim();
    if (/^[[{]/.test(v)) { try { v = JSON.parse(v); } catch {} }
    else if (/^(true|false)$/.test(v)) v = v === "true";
    else v = v.replace(/^["']|["']$/g, "");
    header[x[1]] = v;
  }
  for (const [before, now] of Object.entries(OLD_HEADER)) if (header[now] === undefined && header[before] !== undefined) { header[now] = header[before]; delete header[before]; }
  if (OLD_VALUE[header.effect]) header.effect = OLD_VALUE[header.effect];
  if (Array.isArray(header.settings)) header.settings = header.settings.map((x) => {
    if (!x || typeof x !== "object") return x;
    const y = {}; for (const [k, v] of Object.entries(x)) y[OLD_SETTING[k] || k] = v;
    if (OLD_VALUE[y.type]) y.type = OLD_VALUE[y.type];
    return y;
  });
  return { header, instructions: m ? m[2].trim() : t.trim() };
}

// A path inside the agents' folder (never outside it)
export function insideOf(base, relPath) {
  const target = path.resolve(base, String(relPath || ".").replace(/^[/\\]+/, ""));
  const root = path.resolve(base);
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error(L("That path leaves the agents' folder: not allowed."));
  return target;
}

export function createHands(op) {
  const o = Object.assign({ visible: false, log: () => {} }, op);
  mkdirSync(o.agentsFolder, { recursive: true });
  mkdirSync(o.chromeProfile, { recursive: true });
  let skills = new Map(), context = null, opening = null, queue = Promise.resolve();

  // ---------------- Loading the skills (the ones that come with Fer Agent and yours in data/skills) ----------------
  function load() {
    const newOnes = new Map();
    for (const dir of o.skillsFolders) {
      let names = [];
      try { names = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { continue; }
      for (const n of names) {
        const f = path.join(dir, n, "SKILL.md");
        if (!existsSync(f)) continue;
        try {
          const { header, instructions: body } = readSkillMd(readFileSync(f, "utf8"));
          const name = String(header.name || n).toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
          if (!/^[a-z0-9-]{2,40}$/.test(name)) continue;
          newOnes.set(name, { name, title: String(header.title || header.title || name), description: String(header.description || "").slice(0, 400),
            effect: header.effect === "external" ? "external" : "read", fixed: header.fixed === true, data: header.data ? (typeof header.data === "string" ? header.data : JSON.stringify(header.data)) : "",   // «fija» only if its SKILL.md says so
            timeout: Math.min(3600, Math.max(10, Number(header.timeout) || 300)),   // seconds it can take at most (5 minutes by default)
            settings: Array.isArray(header.settings) ? header.settings : [], script: header.script ? path.join(dir, n, String(header.script)) : "", instructions: body.slice(0, 4000), folder: path.join(dir, n) });
        } catch (err) { o.log(L("I couldn't read the skill {1}: {2}", n, err.message)); }
      }
    }
    skills = newOnes;
    return skills;
  }
  load();

  // ---------------- The agents' Chrome ----------------
  async function browser() {
    if (context) return context;
    if (opening) return opening;
    opening = (async () => {
      let pw = null;
      for (const n of ["playwright-core", "playwright"]) { try { pw = await import(n); break; } catch {} try { pw = requireCjs(n); break; } catch {} }
      if (!pw) throw Object.assign(new Error(L("Playwright isn't installed. In the Fer Home folder, type: npm install playwright-core")), { shown: true });
      const chromium = pw.chromium || (pw.default && pw.default.chromium);
      const base = { headless: !o.visible, viewport: { width: 1280, height: 900 }, locale: (typeof o.locale === "function" ? o.locale() : o.locale) || "es-ES", args: ["--disable-blink-features=AutomationControlled"] };
      try { context = await chromium.launchPersistentContext(o.chromeProfile, Object.assign({ channel: o.channel || "chrome" }, base)); }
      catch (err) {
        try { context = await chromium.launchPersistentContext(o.chromeProfile, base); }   // if there's no Google Chrome, Playwright's Chromium (if it's there)
        catch { throw Object.assign(new Error(L("I couldn't open the agents' Chrome. Do you have Google Chrome installed? ({1})", err.message.split("\n")[0])), { shown: true }); }
      }
      const current = context;
      current.on("close", () => { if (context === current) context = null; });
      o.log(L("The agents' Chrome is open (profile: {1}).", o.chromeProfile));
      return context;
    })();
    try { return await opening; } finally { opening = null; }
  }
  async function closeChrome() {
    const c = context; context = null;
    if (c) await Promise.race([c.close().catch(() => {}), new Promise((r) => setTimeout(r, 10000))]);   // if not even closing answers, it's left behind
  }
  async function withPage(f) {
    const ctx = await browser();
    const page = await ctx.newPage();
    try { return await f(page); } finally { try { await page.close(); } catch {} }
  }

  // What the skills' programs receive
  const toolDefs = {
    withPage, browser, isPublicAddress, internetOnly,
    folder: o.agentsFolder,
    path: (r) => insideOf(o.agentsFolder, r),
    log: (...a) => o.log(...a),
    now: () => Date.now(),
    // the names from before version 9, for skills written then
    conPagina: withPage, navegador: browser, esDireccionPublica: isPublicAddress, soloInternet: internetOnly, carpeta: o.agentsFolder, ruta: (r) => insideOf(o.agentsFolder, r), ahora: () => Date.now(),
    L   // their messages, in the building's language: h.L("English text {1}", value) (the translation goes in languages/es.js)
  };

  return {
    catalog() { return [...skills.values()].map(({ name, title, description, effect, fixed, data, settings }) => ({ name, title, description, effect, fixed, data, settings })); },
    reload: load,
    // They are done one at a time (a single Chrome): that way two skills don't step on each other
    run(name, data, ctx) {
      if (!skills.has(name) && OLD_SKILL_NAMES[name]) name = OLD_SKILL_NAMES[name];   // its name before version 9
      const task = queue.then(async () => {
        const sk = skills.get(name);
        if (!sk) throw new Error(L("The skill “{1}” doesn't exist.", name));
        if (sk.effect === "external" && !(ctx && ctx.authorized)) throw new Error(L("The skill “{1}” has an effect outside the website: it needs your permission (inbox).", name));
        if (!sk.script) return { text: sk.instructions };   // a skill that is only instructions
        const mod = await import(pathToFileURL(sk.script).href + "?v=" + Date.now());
        const f = mod.default || mod.run;
        if (typeof f !== "function") throw new Error(L("The skill “{1}” has no program to run.", name));
        // With a clock: if a page hangs, the skill stops, its Chrome is closed and the queue goes on with the next one
        const running = Promise.resolve().then(() => f(data || {}, toolDefs, ctx || {}));
        running.catch(() => {});
        let timer;
        const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(L("The skill “{1}” took more than {2} s: I stopped it and closed its Chrome.", name, sk.timeout)), { shown: true, timeout: true })), sk.timeout * 1000); });
        let r;
        try { r = await Promise.race([running, limit]); }
        catch (err) { if (err.timeout) { o.log(err.message); await closeChrome(); } throw err; }
        finally { clearTimeout(timer); }
        return typeof r === "string" ? { text: r } : (r || { text: "" });
      });
      queue = task.catch(() => {});
      return task;
    },
    async openVisible(url) {   // so you can sign in once yourself (for example, to X) in the agents' Chrome
      o.visible = true;
      await closeChrome();
      const ctx = await browser();
      const page = ctx.pages()[0] || await ctx.newPage();
      await page.goto(url || "about:blank").catch(() => {});
      return ctx;
    },
    close: closeChrome
  };
}
