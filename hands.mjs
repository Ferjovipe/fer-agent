// =====================================================================
// Fer Home · THE AGENTS' HANDS
// The same as Hermes and OpenClaw do, inside Fer Home, on your computer:
//   · the agents' own Chrome (with its profile: you sign in once to X, to your new email…, and it stays saved);
//   · a folder of their own for their files (they can't leave it);
//   · skills: folders with a SKILL.md (the agentskills.io format used by Hermes and OpenClaw) and, if needed, its program.
//   · the mailbox you connect in Settings (for the email skills: read what comes in and send, each email with your yes).
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
            effect: header.effect === "external" ? "external" : "read", kind: ["pay", "send", "delete", "other"].includes(header.kind) ? header.kind : "other", fixed: header.fixed === true, data: header.data ? (typeof header.data === "string" ? header.data : JSON.stringify(header.data)) : "",   // «fija» only if its SKILL.md says so
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
      // 9.2: only the internet for every tab of the agents' Chrome, also the ones a website opens by itself
      await current.route("**/*", async (r) => { if (await isPublicAddress(r.request().url())) await r.continue().catch(() => {}); else await r.abort("blockedbyclient").catch(() => {}); }).catch(() => {});
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

  // ---------------- The mailbox (Settings → Email, in the app or in Fer Home) ----------------
  // IMAP to read what comes in and SMTP to send, with the address and password saved only on this computer (config.json).
  // 9.2: as many mailboxes as you like (o.mailboxes); «id» picks one, without it the first. Before 9.2 there was only one (o.email).
  function mailboxSettings(id) {
    const list = typeof o.mailboxes === "function" ? (o.mailboxes() || []) : [];
    const one = typeof o.email === "function" ? o.email() : o.email;
    const c = (id && list.find((x) => x.id === id || x.address === id)) || (!id && list[0]) || (!id || id === "main" ? one : null) || (id && !list.length ? one : null);
    if (!c || !c.address || !c.password || !c.imapHost) throw Object.assign(new Error(id ? L("That mailbox isn't connected (Settings → Email).") : L("No mailbox is connected. Connect one in Settings → Email (in the app or in Fer Home).")), { shown: true });
    return c;
  }
  async function mailParts() {
    try { return { ImapFlow: (await import("imapflow")).ImapFlow, simpleParser: (await import("mailparser")).simpleParser, nodemailer: (await import("nodemailer")).default }; }
    catch { throw Object.assign(new Error(L("The email parts aren't installed. In the Fer Agent folder, type: npm install")), { shown: true }); }
  }
  // what went wrong, said plainly (the libraries' messages are technical)
  function mailError(e, c, what) {
    if (e && e.shown) return e;
    const code = String((e && (e.code || e.responseCode)) || ""), host = what === "smtp" ? c.smtpHost || c.imapHost : c.imapHost;
    const msg = e && (e.authenticationFailed || code === "EAUTH" || code === "535" || /AUTHENTICATIONFAILED|Invalid credentials|authentication failed/i.test(e.message || e.responseText || ""))
      ? L("The mailbox didn't accept the address or the password. Many providers (Gmail, iCloud, Yahoo…) ask for an “app password” instead of your usual one.")
      : code === "ENOTFOUND" || code === "EDNS" ? L("The server {1} doesn't exist. Check its name in Settings → Email.", host)
      : code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "ECONNECTION" || code === "ESOCKET" ? L("I couldn't connect to {1}. Check the server and its port in Settings → Email.", host)
      : L("The mailbox answered with an error: {1}", (e && (e.responseText || e.message)) || String(e));
    return Object.assign(new Error(msg), { shown: true });
  }
  async function withMailbox(f, id) {
    const c = mailboxSettings(id), { ImapFlow } = await mailParts();
    const port = Number(c.imapPort) || 993;
    const client = new ImapFlow({ host: c.imapHost, port, secure: port === 993, auth: { user: c.user || c.address, pass: c.password }, logger: false });
    client.on("error", () => {});
    try { await client.connect(); } catch (e) { throw mailError(e, c, "imap"); }
    try { return await f(client); } finally { try { await client.logout(); } catch { try { client.close(); } catch {} } }
  }
  async function sendMail(m, id) {
    const c = mailboxSettings(id), { nodemailer } = await mailParts();
    const port = Number(c.smtpPort) || 465;
    const t = nodemailer.createTransport({ host: c.smtpHost || c.imapHost, port, secure: port === 465, requireTLS: port === 587, auth: { user: c.user || c.address, pass: c.password } });
    try { return await t.sendMail(Object.assign({ from: c.name ? { name: c.name, address: c.address } : c.address }, m)); } catch (e) { throw mailError(e, c, "smtp"); }
  }
  async function testMailbox(id) {   // Settings → Email → «Check»: it signs in to read and to send, and changes nothing
    const n = await withMailbox(async (c) => { const lock = await c.getMailboxLock("INBOX"); try { return c.mailbox.exists || 0; } finally { lock.release(); } }, id);
    const c = mailboxSettings(id), { nodemailer } = await mailParts(), port = Number(c.smtpPort) || 465;
    try { await nodemailer.createTransport({ host: c.smtpHost || c.imapHost, port, secure: port === 465, requireTLS: port === 587, auth: { user: c.user || c.address, pass: c.password } }).verify(); }
    catch (e) { throw mailError(e, c, "smtp"); }
    return { emails: n };
  }

  // 9.2 · Email for the agents' tools: the latest emails of a mailbox (or the ones that match a search) and one email whole. Nothing is marked as read.
  const stripHtml = (html) => String(html || "").replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ").replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
  async function emailList(id, d) {
    const max = Math.min(50, Math.max(1, Number(d.max) || 15)), q = String(d.search || "").trim();
    return await withMailbox(async (c) => {
      const lock = await c.getMailboxLock(String(d.folder || "INBOX"));
      try {
        const total = c.mailbox.exists || 0;
        if (!total) return { text: L("The mailbox is empty.") };
        let range;
        if (q) { const found = await c.search({ or: [{ subject: q }, { from: q }, { body: q }] }, { uid: true }); range = (found || []).sort((a, b) => a - b).slice(-max); if (!range.length) return { text: L("No email matches “{1}”.", q) }; }
        const rows = [];
        for await (const m of c.fetch(range || `${Math.max(1, total - max + 1)}:*`, { uid: true, envelope: true, flags: true }, range ? { uid: true } : {})) {
          const e = m.envelope || {}, from = (e.from || [])[0] || {};
          rows.push({ uid: m.uid, date: e.date ? new Date(e.date).toISOString().slice(0, 16).replace("T", " ") : "", from: from.name ? `${from.name} <${from.address}>` : (from.address || ""), subject: e.subject || "", unread: !(m.flags && m.flags.has("\\Seen")) });
        }
        rows.sort((a, b) => b.uid - a.uid);
        return { text: rows.map((r) => `uid ${r.uid} · ${r.date} · ${r.from} · ${r.subject}${r.unread ? " · " + L("unread") : ""}`).join("\n") };
      } finally { lock.release(); }
    }, id);
  }
  async function emailRead(id, d) {
    const uid = Number(d.uid);
    if (!uid) throw Object.assign(new Error(L("Tell me which email (its uid, from the list).")), { shown: true });
    return await withMailbox(async (c) => {
      const lock = await c.getMailboxLock(String(d.folder || "INBOX"));
      try {
        const parse = (await mailParts()).simpleParser;
        for await (const m of c.fetch([uid], { uid: true, source: true }, { uid: true })) {
          const p = await parse(m.source);
          const text = String(p.text || stripHtml(p.html)).trim();
          return { text: [L("From: {1}", (p.from && p.from.text) || ""), p.replyTo ? L("Reply to: {1}", p.replyTo.text) : "", L("To: {1}", (p.to && p.to.text) || ""), p.cc ? L("Copy: {1}", p.cc.text) : "",
            L("Date: {1}", p.date ? p.date.toISOString().slice(0, 16).replace("T", " ") : ""), L("Subject: {1}", p.subject || ""), p.messageId ? "Message-ID: " + p.messageId : "",
            (p.attachments || []).length ? L("Attachments: {1}", p.attachments.map((x) => x.filename).filter(Boolean).join(", ")) : "", "", text.slice(0, 20000)].filter((x, k) => x || k === 8).join("\n") };
        }
        throw Object.assign(new Error(L("There's no email with uid {1}.", uid)), { shown: true });
      } finally { lock.release(); }
    }, id);
  }

  // What the skills' programs receive
  const toolDefs = {
    withPage, browser, isPublicAddress, internetOnly,
    mailbox: withMailbox, sendMail, mailParser: async () => (await mailParts()).simpleParser,
    folder: o.agentsFolder,
    path: (r) => insideOf(o.agentsFolder, r),
    log: (...a) => o.log(...a),
    now: () => Date.now(),
    // the names from before version 9, for skills written then
    conPagina: withPage, navegador: browser, esDireccionPublica: isPublicAddress, soloInternet: internetOnly, carpeta: o.agentsFolder, ruta: (r) => insideOf(o.agentsFolder, r), ahora: () => Date.now(),
    L   // their messages, in the building's language: h.L("English text {1}", value) (the translation goes in languages/es.js)
  };

  // One thing at a time (a single Chrome): skills and web steps queue up. With a clock: if something hangs, it's stopped and its Chrome closed.
  function enqueue(label, seconds, f) {
    const task = queue.then(async () => {
      const running = Promise.resolve().then(f);
      running.catch(() => {});
      let timer;
      const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(L("The skill “{1}” took more than {2} s: I stopped it and closed its Chrome.", label, seconds)), { shown: true, timeout: true })), seconds * 1000); });
      try { return await Promise.race([running, limit]); }
      catch (err) { if (err.timeout) { o.log(err.message); await closeChrome(); } throw err; }
      finally { clearTimeout(timer); }
    });
    queue = task.catch(() => {});
    return task;
  }

  // ---------------- 9.2 · Internet as you: each agent has its own tab, the page is read as text and what can be used comes numbered ----------------
  const tabs = new Map();   // agent → { page, last }
  async function tabOf(agent, fresh) {
    const t = tabs.get(agent);
    if (t && !t.page.isClosed() && !fresh) { t.last = Date.now(); return t.page; }
    const ctx = await browser();
    const page = await ctx.newPage();
    await internetOnly(page);
    tabs.set(agent, { page, last: Date.now() });
    return page;
  }
  const sweep = setInterval(() => { for (const [k, t] of tabs) if (Date.now() - t.last > 15 * 60e3) { tabs.delete(k); t.page.close().catch(() => {}); } }, 60e3);   // tabs unused for 15 minutes
  if (sweep.unref) sweep.unref();
  // What there is on the page: its text (the beginning) and everything that can be clicked or filled in, with a number
  const COLLECT = () => {
    const sel = "a[href], button, input:not([type=hidden]), textarea, select, summary, [role=button], [role=link], [role=checkbox], [role=radio], [role=tab], [role=menuitem], [role=option], [role=switch], [role=combobox], [role=textbox], [contenteditable=''], [contenteditable=true], [onclick]";
    const seen = (el) => { const r = el.getBoundingClientRect(), st = getComputedStyle(el); return r.width > 1 && r.height > 1 && st.visibility !== "hidden" && st.display !== "none" && Number(st.opacity) > 0.05; };
    document.querySelectorAll("[data-fa]").forEach((e) => e.removeAttribute("data-fa"));
    const out = []; let n = 0;
    for (const el of document.querySelectorAll(sel)) {
      if (!seen(el)) continue;
      const tag = el.tagName.toLowerCase(), type = (el.getAttribute("type") || "").toLowerCase();
      const role = el.getAttribute("role") || (tag === "a" ? "link" : tag === "select" ? "select" : tag === "textarea" || el.isContentEditable ? "field"
        : tag === "input" ? (["button", "submit", "reset", "image"].includes(type) ? "button" : ["checkbox", "radio"].includes(type) ? type : "field") : "button");
      let label = el.getAttribute("aria-label") || (tag === "input" || tag === "select" || tag === "textarea" ? "" : el.innerText) || "";
      if (!label && el.id) { const l = document.querySelector("label[for='" + CSS.escape(el.id) + "']"); if (l) label = l.innerText; }
      if (!label) { const l = el.closest("label"); if (l) label = l.innerText; }
      label = (label || el.getAttribute("placeholder") || el.getAttribute("title") || el.getAttribute("name") || (type === "submit" || type === "button" ? el.value : "") || (el.querySelector("img[alt]") || {}).alt || "").trim().replace(/\s+/g, " ").slice(0, 90);
      n++; el.setAttribute("data-fa", String(n));
      const it = { n, role, label };
      if (role === "field" || role === "select" || role === "combobox" || role === "textbox") { if (type) it.type = type; if (el.value && type !== "password") it.value = String(el.value).slice(0, 80); }
      if (role === "checkbox" || role === "radio" || role === "switch") it.checked = !!el.checked || el.getAttribute("aria-checked") === "true";
      if (tag === "a") it.href = (el.getAttribute("href") || "").slice(0, 120);
      if (tag === "select") it.options = [...el.options].slice(0, 20).map((x) => x.text.trim()).filter(Boolean);
      out.push(it);
      if (n >= 160) break;
    }
    const text = (document.body ? document.body.innerText : "").replace(/\n{3,}/g, "\n\n").trim();
    return { url: location.href, title: document.title, text: text.slice(0, 7000), more: text.length > 7000, elements: out };
  };
  async function snapshot(page) {
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(700);
    return await page.evaluate(COLLECT).catch(async () => { await page.waitForTimeout(1500); return await page.evaluate(COLLECT); });
  }
  async function webSearch(query) {
    const q = String(query || "").trim();
    if (!q) throw new Error(L("Tell me what to search for (data: {query})."));
    const base = process.env.FER_SEARCH_ENGINE || "https://html.duckduckgo.com/html/";
    return await withPage(async (p) => {
      await internetOnly(p);
      await p.goto(base + "?q=" + encodeURIComponent(q), { waitUntil: "domcontentloaded", timeout: 45000 });
      const res = await p.evaluate(() => [...document.querySelectorAll(".result")].map((r) => {
        const a = r.querySelector(".result__a"); let url = a ? a.getAttribute("href") || "" : "";
        try { const u = new URL(url, location.href); if (u.searchParams.get("uddg")) url = decodeURIComponent(u.searchParams.get("uddg")); else url = u.href; } catch {}
        return { title: a ? a.innerText.trim() : "", url, summary: ((r.querySelector(".result__snippet") || {}).innerText || "").trim() };
      }).filter((x) => x.title && /^https?:/.test(x.url)).slice(0, 8));
      return { results: res, text: res.length ? L("Results for “{1}”:", q) + "\n\n" + res.map((x, i) => `${i + 1}. ${x.title}\n${x.url}\n${x.summary}`).join("\n\n")
        : L("No results for “{1}” (or the search engine asked to check you're not a robot).", q) };
    });
  }
  async function webOpen(agent, url) {
    const u = String(url || "").trim();
    if (!/^https?:\/\//i.test(u)) throw Object.assign(new Error(L("Give me a web address that starts with http:// or https://")), { shown: true });
    if (!(await isPublicAddress(u))) throw Object.assign(new Error(L("That address is on your home network, this computer or internal: the agents only use websites on the internet.")), { shown: true });
    const page = await tabOf(agent);
    await page.goto(u, { waitUntil: "domcontentloaded", timeout: 45000 });
    return await snapshot(page);
  }
  // A step on the page: «click», «type», «select», «check», «press» (a key, Enter by default), «scroll» («down»/«up»), «back».
  // The element goes by its number; if the page was reloaded meanwhile (for example, while it waited for your permission), it's found by its words.
  async function webAct(agent, d) {
    const t = tabs.get(agent);
    if (!t || t.page.isClosed() || t.page.url() === "about:blank") throw Object.assign(new Error(L("First open a page (web_open).")), { shown: true });
    let page = t.page; t.last = Date.now();
    const action = String(d.action || "click").toLowerCase(), n = Number(d.element);
    const find = async () => {
      if (n > 0) { const l = page.locator(`[data-fa="${n}"]`); if (await l.count()) return l.first(); }
      if (d.label) { await page.evaluate(COLLECT).catch(() => {}); const l = page.getByText(String(d.label), { exact: false }); if (await l.count()) return l.first(); }
      return null;
    };
    const el = ["scroll", "back"].includes(action) || (action === "press" && !n) ? null : await find();
    if (!el && !["scroll", "back", "press"].includes(action)) throw Object.assign(new Error(L("I can't find element {1} on the page: open it again or look at the list again.", n || d.label || "?")), { shown: true });
    const popup = page.context().waitForEvent("page", { timeout: 2500 }).catch(() => null);
    if (action === "click" || action === "check") await el.click({ timeout: 12000 });
    else if (action === "type") { try { await el.fill(String(d.text ?? ""), { timeout: 12000 }); } catch { await el.click({ timeout: 8000 }); await page.keyboard.type(String(d.text ?? "")); } }
    else if (action === "select") { try { await el.selectOption({ label: String(d.text ?? "") }, { timeout: 12000 }); } catch { await el.selectOption(String(d.text ?? ""), { timeout: 12000 }); } }
    else if (action === "press") { if (el) await el.focus().catch(() => {}); await page.keyboard.press(String(d.text || "Enter")); }
    else if (action === "scroll") await page.mouse.wheel(0, /up|arriba/i.test(String(d.text || "")) ? -900 : 900);
    else if (action === "back") await page.goBack({ timeout: 20000 }).catch(() => {});
    else throw Object.assign(new Error(L("I don't know the step “{1}”.", action)), { shown: true });
    const np = action === "click" ? await popup : null;   // a link that opens in a new tab: the agent carries on there
    if (np) { await np.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {}); tabs.set(agent, { page: np, last: Date.now() }); page = np; }
    return await snapshot(page);
  }
  async function webLook(agent) {
    const t = tabs.get(agent);
    if (!t || t.page.isClosed()) throw Object.assign(new Error(L("First open a page (web_open).")), { shown: true });
    const buf = await t.page.screenshot({ type: "jpeg", quality: 60 });
    return { image: "data:image/jpeg;base64," + buf.toString("base64"), url: t.page.url() };
  }

  return {
    // 9.2: email for the tools: «list» (the latest, or the ones matching a search) and «read» (one whole). «ctx.mailbox»: which one.
    email(op, data, ctx) {
      const id = (ctx && ctx.mailbox) || undefined, d = data || {};
      const f = op === "list" ? () => emailList(id, d) : op === "read" ? () => emailRead(id, d) : null;
      if (!f) return Promise.reject(new Error(L("I don't know the step “{1}”.", op)));
      return enqueue("email", 120, f);
    },
    // 9.2: «search» (free, DuckDuckGo), «open» (a website in its tab), «act» (a step on the page), «look» (a picture of its tab)
    web(op, data, ctx) {
      const agent = String((ctx && ctx.agent) || "_"), d = data || {};
      const f = op === "search" ? () => webSearch(d.query) : op === "open" ? () => webOpen(agent, d.url) : op === "act" ? () => webAct(agent, d) : op === "look" ? () => webLook(agent) : null;
      if (!f) return Promise.reject(new Error(L("I don't know the step “{1}”.", op)));
      return enqueue("web", 120, f);
    },
    catalog() { return [...skills.values()].map(({ name, title, description, effect, kind, fixed, data, settings }) => ({ name, title, description, effect, kind, fixed, data, settings })); },
    reload: load,
    // They are done one at a time (a single Chrome): that way two skills don't step on each other
    run(name, data, ctx) {
      if (!skills.has(name) && OLD_SKILL_NAMES[name]) name = OLD_SKILL_NAMES[name];   // its name before version 9
      const sk = skills.get(name);
      if (!sk) return Promise.reject(new Error(L("The skill “{1}” doesn't exist.", name)));
      return enqueue(name, sk.timeout, async () => {
        if (sk.effect === "external" && !(ctx && ctx.authorized)) throw new Error(L("The skill “{1}” has an effect outside the website: it needs your permission (inbox).", name));
        if (!sk.script) return { text: sk.instructions };   // a skill that is only instructions
        const mod = await import(pathToFileURL(sk.script).href + "?v=" + Date.now());
        const f = mod.default || mod.run;
        if (typeof f !== "function") throw new Error(L("The skill “{1}” has no program to run.", name));
        const r = await f(data || {}, toolDefs, ctx || {});
        return typeof r === "string" ? { text: r } : (r || { text: "" });
      });
    },
    async openVisible(url) {   // so you can sign in once yourself (for example, to X) in the agents' Chrome
      o.visible = true;
      await closeChrome();
      const ctx = await browser();
      const page = ctx.pages()[0] || await ctx.newPage();
      await page.goto(url || "about:blank").catch(() => {});
      return ctx;
    },
    testMailbox,
    close: closeChrome
  };
}
