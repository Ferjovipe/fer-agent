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
import os from "node:os";
import { execFile } from "node:child_process";
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
  o.docsFolder = o.docsFolder || path.join(path.dirname(o.agentsFolder), "agent-documents");   // 9.3: the documents you add to each agent in the app
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
            settings: Array.isArray(header.settings) ? header.settings : [], script: header.script ? path.join(dir, n, String(header.script)) : "", instructions: body.slice(0, 30000), folder: path.join(dir, n),
            own: dir === o.skillsFolders[o.skillsFolders.length - 1] && o.skillsFolders.length > 1 });   // 9.4: yours (added in the app) or built-in
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

  // ---------------- 9.2 · Files: its folder always; with «Your computer as you», any path ----------------
  function filePath(p, anywhere) {
    const raw = String(p || ".").trim().replace(/^~(?=$|[\\/])/, os.homedir());
    if (anywhere && (path.isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw))) return path.resolve(raw);
    return insideOf(o.agentsFolder, raw);
  }
  async function files(op, d, ctx) {
    const anywhere = !!(ctx && ctx.anywhere), target = filePath(d.path, anywhere);
    if (op === "list") {
      const items = await fs.readdir(target, { withFileTypes: true });
      return { text: items.slice(0, 300).map((x) => (x.isDirectory() ? "📁 " : "📄 ") + x.name).join("\n") || L("(empty)"), path: target };
    }
    if (op === "read") {
      const st = await fs.stat(target);
      if (st.isDirectory()) return files("list", d, ctx);
      const buf = await fs.readFile(target);
      if (buf.includes(0)) return { text: L("It's not a text file ({1} bytes). Use «Your computer as you» to open it with its app.", buf.length), path: target };
      const t = buf.toString("utf8"), max = Math.min(60000, Math.max(1000, Number(d.max) || 20000));
      return { text: t.slice(0, max) + (t.length > max ? "\n" + L("[…cut]") : ""), path: target };
    }
    if (op === "write") {
      mkdirSync(path.dirname(target), { recursive: true });
      if (d.append) await fs.appendFile(target, String(d.text ?? "")); else await fs.writeFile(target, String(d.text ?? ""));
      return { text: L("Saved: {1}", target), path: target };
    }
    throw new Error(L("I don't know the step “{1}”.", op));
  }

  // ---------------- 9.2 · Your computer as you: orders to the system, the apps' buttons as text and, last, the screen ----------------
  const MAC = process.platform === "darwin", WIN = process.platform === "win32";
  function runProgram(file, args, seconds, input) {
    return new Promise((resolve) => {
      const child = execFile(file, args, { timeout: seconds * 1000, maxBuffer: 8e6, cwd: o.agentsFolder, windowsHide: true }, (err, out, errOut) =>
        resolve({ code: err ? (err.code ?? 1) : 0, out: String(out || ""), err: String(errOut || "") + (err && err.killed ? "\n" + L("(stopped: it took more than {1} s)", seconds) : "") }));
      if (input && child.stdin) { child.stdin.end(input); }
    });
  }
  // An order to the system, as you'd type it: zsh/bash on the Mac and Linux, PowerShell on Windows
  async function command(d) {
    const cmd = String(d.command || "").trim();
    if (!cmd) throw Object.assign(new Error(L("Which order?")), { shown: true });
    const seconds = Math.min(600, Math.max(5, Number(d.timeout) || 120));
    const r = WIN ? await runProgram("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", cmd], seconds) : await runProgram(process.env.SHELL || "/bin/bash", ["-lc", cmd], seconds);
    const out = (r.out + (r.err ? "\n" + r.err : "")).trim();
    return { text: L("Result (code {1}):", r.code) + "\n" + (out.length > 20000 ? out.slice(0, 20000) + "\n" + L("[…cut]") : out || L("(nothing)")) };
  }
  // macOS: JavaScript for Automation (it comes with the Mac). It needs Accessibility (and, for pictures, Screen Recording) once.
  const jxa = (code, seconds = 25) => runProgram("/usr/bin/osascript", ["-l", "JavaScript", "-e", code], seconds);
  const PS = (code, seconds = 25) => runProgram("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", code], seconds);
  let lastElements = [];   // the numbered list of the last «look at the app» (to click by number)
  // The buttons and fields of the app in front, as text (cheap). Each one with its number and where it is.
  async function appElements() {
    if (MAC) {
      const r = await jxa(`
        const se = Application("System Events"); const p = se.processes.whose({ frontmost: true })[0];
        const out = { app: p.name(), items: [] };
        const ws = p.windows(); const w = ws.length ? ws[0] : null;
        if (w) { out.window = w.name ? w.name() : "";
          const all = w.entireContents(); let n = 0;
          for (const e of all) { if (n >= 220) break; let role = "", label = "", pos = null, size = null;
            try { role = e.role(); } catch (x) {}
            if (!/AXButton|AXTextField|AXTextArea|AXCheckBox|AXRadioButton|AXPopUpButton|AXMenuButton|AXLink|AXTab|AXComboBox|AXCell|AXRow|AXStaticText|AXMenuItem|AXSlider|AXIncrementor/.test(role)) continue;
            try { label = e.description() || e.name() || e.title() || e.value() || ""; } catch (x) {}
            try { pos = e.position(); size = e.size(); } catch (x) {}
            if (!pos || !size || size[0] < 2 || size[1] < 2) continue;
            n++; out.items.push({ n, role: String(role).replace(/^AX/, "").toLowerCase(), label: String(label).replace(/\s+/g, " ").slice(0, 80), x: Math.round(pos[0] + size[0] / 2), y: Math.round(pos[1] + size[1] / 2) }); } }
        JSON.stringify(out);`, 40);
      if (r.code !== 0) throw Object.assign(new Error(L("The Mac didn't let me read the app. Give Fer Agent permission in System Settings → Privacy and Security → Accessibility. ({1})", r.err.trim().slice(0, 160))), { shown: true });
      return JSON.parse(r.out);
    }
    if (WIN) {
      const r = await PS(`Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
        Add-Type @"
using System; using System.Runtime.InteropServices; public class FW { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); }
"@
        $root = [System.Windows.Automation.AutomationElement]::FromHandle([FW]::GetForegroundWindow())
        $all = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
        $n = 0; $items = @()
        foreach ($e in $all) { if ($n -ge 220) { break }
          $c = $e.Current; $t = $c.ControlType.ProgrammaticName -replace 'ControlType.', ''
          if ($t -notmatch 'Button|Edit|CheckBox|RadioButton|ComboBox|Hyperlink|TabItem|ListItem|MenuItem|Text|DataItem|TreeItem') { continue }
          $r = $c.BoundingRectangle; if ($r.Width -lt 2 -or $r.Height -lt 2 -or [double]::IsInfinity($r.X)) { continue }
          $n++; $items += [pscustomobject]@{ n = $n; role = $t.ToLower(); label = ($c.Name -replace '\s+', ' '); x = [int]($r.X + $r.Width / 2); y = [int]($r.Y + $r.Height / 2) } }
        [pscustomobject]@{ app = $root.Current.Name; items = $items } | ConvertTo-Json -Depth 4 -Compress`, 40);
      if (r.code !== 0) throw Object.assign(new Error(L("Windows didn't let me read the app. ({1})", r.err.trim().slice(0, 160))), { shown: true });
      const j = JSON.parse(r.out || "{}"); j.items = Array.isArray(j.items) ? j.items : j.items ? [j.items] : [];
      return j;
    }
    throw Object.assign(new Error(L("Using the screen works on a Mac or on Windows.")), { shown: true });
  }
  // A picture of the whole screen (the expensive way), at the size of the screen's points, so clicking on it lands where it should
  async function screenshot() {
    const file = path.join(os.tmpdir(), "fa-screen-" + Date.now() + ".jpg");
    try {
      if (MAC) {
        const r = await runProgram("/usr/sbin/screencapture", ["-x", "-t", "jpg", file], 20);
        if (r.code !== 0 || !existsSync(file)) throw Object.assign(new Error(L("The Mac didn't let me take a picture of the screen. Give Fer Agent permission in System Settings → Privacy and Security → Screen Recording.")), { shown: true });
        const w = await jxa(`ObjC.import("AppKit"); JSON.stringify([$.NSScreen.mainScreen.frame.size.width, $.NSScreen.mainScreen.frame.size.height])`, 10);
        const [pw, ph] = JSON.parse(w.out || "[0,0]");
        if (pw) await runProgram("/usr/bin/sips", ["--resampleWidth", String(Math.round(pw)), file], 20);
        return { image: "data:image/jpeg;base64," + (await fs.readFile(file)).toString("base64"), width: Math.round(pw), height: Math.round(ph) };
      }
      if (WIN) {
        const r = await PS(`Add-Type -AssemblyName System.Windows.Forms,System.Drawing
          $b = [System.Windows.Forms.SystemInformation]::VirtualScreen; $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
          $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size)
          $bmp.Save('${file.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Jpeg); "$($b.Width) $($b.Height)"`, 20);
        if (r.code !== 0 || !existsSync(file)) throw Object.assign(new Error(L("Windows didn't let me take a picture of the screen. ({1})", r.err.trim().slice(0, 160))), { shown: true });
        const [w, hh] = r.out.trim().split(/\s+/).map(Number);
        return { image: "data:image/jpeg;base64," + (await fs.readFile(file)).toString("base64"), width: w, height: hh };
      }
      throw Object.assign(new Error(L("Using the screen works on a Mac or on Windows.")), { shown: true });
    } finally { fs.unlink(file).catch(() => {}); }
  }
  const KEYS_MAC = { enter: 36, return: 36, tab: 48, space: 49, delete: 51, backspace: 51, escape: 53, esc: 53, left: 123, right: 124, down: 125, up: 126, home: 115, end: 119, pageup: 116, pagedown: 121 };
  // A step with mouse or keyboard: «click», «double_click», «right_click» (an element of the list or x,y), «type» (text), «key» (enter, tab, cmd+c…),
  // «scroll» (up/down), «open_app» (its name). On the Mac with JavaScript for Automation; on Windows with PowerShell.
  async function act(d) {
    const action = String(d.action || "click").toLowerCase();
    let x = Number(d.x), y = Number(d.y);
    if (Number(d.element) > 0) { const it = lastElements.find((e) => e.n === Number(d.element)); if (!it) throw Object.assign(new Error(L("I don't have element {1}: look at the app again (pc_look).", d.element)), { shown: true }); x = it.x; y = it.y; }
    const text = String(d.text ?? "");
    if (MAC) {
      let code;
      if (action === "open_app") { const r = await runProgram("/usr/bin/open", ["-a", text], 20); if (r.code) throw Object.assign(new Error(r.err.trim() || L("I couldn't open {1}.", text)), { shown: true }); return { text: L("Opened {1}.", text) }; }
      if (/click/.test(action)) {
        if (!(x >= 0 && y >= 0)) throw Object.assign(new Error(L("Say where: an element of the list or x and y.")), { shown: true });
        const btn = action === "right_click" ? ["kCGEventRightMouseDown", "kCGEventRightMouseUp", "kCGMouseButtonRight"] : ["kCGEventLeftMouseDown", "kCGEventLeftMouseUp", "kCGMouseButtonLeft"];
        const times = action === "double_click" ? 2 : 1;
        code = `ObjC.import("CoreGraphics"); const p = $.CGPointMake(${x}, ${y});
          $.CGEventPost($.kCGHIDEventTap, $.CGEventCreateMouseEvent(null, $.kCGEventMouseMoved, p, $.${btn[2]})); delay(0.05);
          for (let i = 1; i <= ${times}; i++) { const dn = $.CGEventCreateMouseEvent(null, $.${btn[0]}, p, $.${btn[2]}); const up = $.CGEventCreateMouseEvent(null, $.${btn[1]}, p, $.${btn[2]});
            $.CGEventSetIntegerValueField(dn, $.kCGMouseEventClickState, i); $.CGEventSetIntegerValueField(up, $.kCGMouseEventClickState, i);
            $.CGEventPost($.kCGHIDEventTap, dn); $.CGEventPost($.kCGHIDEventTap, up); delay(0.05); } "ok"`;
      } else if (action === "type") code = `Application("System Events").keystroke(${JSON.stringify(text)}); "ok"`;
      else if (action === "key") {
        const parts = text.toLowerCase().split("+").map((t) => t.trim()), key = parts.pop(), mods = parts.map((m) => ({ cmd: "command down", command: "command down", ctrl: "control down", control: "control down", alt: "option down", option: "option down", shift: "shift down" })[m]).filter(Boolean);
        code = KEYS_MAC[key] !== undefined ? `Application("System Events").keyCode(${KEYS_MAC[key]}, { using: ${JSON.stringify(mods)} }); "ok"` : `Application("System Events").keystroke(${JSON.stringify(key)}, { using: ${JSON.stringify(mods)} }); "ok"`;
      } else if (action === "scroll") code = `ObjC.import("CoreGraphics"); $.CGEventPost($.kCGHIDEventTap, $.CGEventCreateScrollWheelEvent(null, $.kCGScrollEventUnitLine, 1, ${/up|arriba/i.test(text) ? 8 : -8})); "ok"`;
      else throw Object.assign(new Error(L("I don't know the step “{1}”.", action)), { shown: true });
      const r = await jxa(code, 20);
      if (r.code !== 0) throw Object.assign(new Error(L("The Mac didn't let me use the mouse or the keyboard. Give Fer Agent permission in System Settings → Privacy and Security → Accessibility. ({1})", r.err.trim().slice(0, 160))), { shown: true });
      return { text: L("Done: {1}.", action) };
    }
    if (WIN) {
      let code;
      const mouse = `Add-Type @"
using System; using System.Runtime.InteropServices; public class M { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, int d, UIntPtr e); }
"@
`;
      if (action === "open_app") code = `Start-Process ${JSON.stringify(text)}`;
      else if (/click/.test(action)) {
        if (!(x >= 0 && y >= 0)) throw Object.assign(new Error(L("Say where: an element of the list or x and y.")), { shown: true });
        const [dn, up] = action === "right_click" ? [8, 16] : [2, 4], times = action === "double_click" ? 2 : 1;
        code = mouse + `[M]::SetCursorPos(${x}, ${y}); Start-Sleep -Milliseconds 50; for ($i = 0; $i -lt ${times}; $i++) { [M]::mouse_event(${dn}, 0, 0, 0, [UIntPtr]::Zero); [M]::mouse_event(${up}, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 60 }`;
      } else if (action === "type" || action === "key") {
        const esc = (t) => t.replace(/[+^%~(){}[\]]/g, "{$&}");
        const k = action === "type" ? esc(text) : text.toLowerCase().split("+").map((t) => t.trim()).reduce((acc, t, i, arr) => i < arr.length - 1 ? acc + ({ ctrl: "^", control: "^", alt: "%", shift: "+", cmd: "^" })[t] : acc + ({ enter: "{ENTER}", return: "{ENTER}", tab: "{TAB}", escape: "{ESC}", esc: "{ESC}", backspace: "{BACKSPACE}", delete: "{DELETE}", up: "{UP}", down: "{DOWN}", left: "{LEFT}", right: "{RIGHT}", home: "{HOME}", end: "{END}" }[t] || t), "");
        code = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(${JSON.stringify(k)})`;
      } else if (action === "scroll") code = mouse + `[M]::mouse_event(0x0800, 0, 0, ${/up|arriba/i.test(text) ? 600 : -600}, [UIntPtr]::Zero)`;
      else throw Object.assign(new Error(L("I don't know the step “{1}”.", action)), { shown: true });
      const r = await PS(code, 20);
      if (r.code !== 0) throw Object.assign(new Error(L("Windows didn't let me do it. ({1})", r.err.trim().slice(0, 160))), { shown: true });
      return { text: L("Done: {1}.", action) };
    }
    throw Object.assign(new Error(L("Using the screen works on a Mac or on Windows.")), { shown: true });
  }
  async function look(d) {
    if (d.screen) { const s = await screenshot(); return Object.assign(s, { text: "" }); }
    const r = await appElements();
    lastElements = r.items || [];
    return { app: r.app, window: r.window || "", elements: lastElements, text: L("App in front: {1}{2}", r.app || "?", r.window ? " — " + r.window : "") };
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
  // 9.2: separate lanes: the Chrome ones (skills and the web), the screen (mouse and keyboard) and the rest (orders, files, email) don't wait for each other
  const lanes = new Map();
  function enqueue(label, seconds, f, lane = "chrome") {
    const prev = lane === "chrome" ? queue : (lanes.get(lane) || Promise.resolve());
    const task = prev.then(async () => {
      const running = Promise.resolve().then(f);
      running.catch(() => {});
      let timer;
      const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error(L("The skill “{1}” took more than {2} s: I stopped it and closed its Chrome.", label, seconds)), { shown: true, timeout: true })), seconds * 1000); });
      try { return await Promise.race([running, limit]); }
      catch (err) { if (err.timeout) { o.log(err.message); await closeChrome(); } throw err; }
      finally { clearTimeout(timer); }
    });
    if (lane === "chrome") queue = task.catch(() => {}); else if (!lane.includes(":")) lanes.set(lane, task.catch(() => {}));   // «x:…» lanes: each one on its own
    return task;
  }

  // ---------------- 9.2 · Internet as you: each agent has its own tab, the page is read as text and what can be used comes numbered ----------------
  // agent → { page, last, from (where the piece of text it reads starts), len, url, hold (waiting for its owner's yes) }
  const tabs = new Map();
  async function tabOf(agent, fresh) {
    const t = tabs.get(agent);
    if (t && !t.page.isClosed() && !fresh) { t.last = Date.now(); return t.page; }
    const ctx = await browser();
    const page = await ctx.newPage();
    await internetOnly(page);
    tabs.set(agent, { page, last: Date.now(), from: 0, len: 0, url: "", hold: 0 });
    return page;
  }
  // tabs unused for 15 minutes are closed (your sessions stay in the agents' Chrome); one waiting for your yes, not for 24 hours
  const sweep = setInterval(() => {
    for (const [k, t] of tabs) if (Date.now() - t.last > 15 * 60e3 && !(t.hold && Date.now() - t.hold < 24 * 3600e3)) { tabs.delete(k); t.page.close().catch(() => {}); }
  }, 60e3);
  if (sweep.unref) sweep.unref();
  // What there is on the page: its text (the beginning) and everything that can be clicked or filled in, with a number
  const COLLECT = () => {
    const sel = "a[href], button, input:not([type=hidden]), textarea, select, summary, [role=button], [role=link], [role=checkbox], [role=radio], [role=tab], [role=menuitem], [role=option], [role=switch], [role=combobox], [role=textbox], [contenteditable=''], [contenteditable=true], [onclick]";
    const seen = (el) => { const r = el.getBoundingClientRect(), st = getComputedStyle(el); return r.width > 1 && r.height > 1 && st.visibility !== "hidden" && st.display !== "none" && Number(st.opacity) > 0.05; };
    document.querySelectorAll("[data-fa]").forEach((e) => e.removeAttribute("data-fa"));
    // 9.2.1: what you're working on comes first (before, in a big page like Gmail, the new message window came after the first 160 and the agent didn't see it):
    // open dialogs, and the box around each place to write in (the message window with its «Send» button)
    const all = [...document.querySelectorAll(sel)].filter(seen);
    const zones = [...document.querySelectorAll("[role=dialog], [aria-modal=true], dialog[open]")].filter(seen);
    for (const el of all) if (el.isContentEditable || el.tagName === "TEXTAREA") {
      let z = el.parentElement, best = null;
      for (let i = 0; z && z !== document.body && i < 30; i++, z = z.parentElement) { if (z.querySelectorAll(sel).length > 150) break; best = z; }
      if (best) zones.push(best);
    }
    const hot = (el) => zones.some((z) => z.contains(el));
    const out = []; let n = 0;
    for (const el of [...all.filter(hot), ...all.filter((el) => !hot(el))]) {
      const tag = el.tagName.toLowerCase(), type = (el.getAttribute("type") || "").toLowerCase();
      const role = el.getAttribute("role") || (tag === "a" ? "link" : tag === "select" ? "select" : tag === "textarea" || el.isContentEditable ? "field"
        : tag === "input" ? (["button", "submit", "reset", "image"].includes(type) ? "button" : ["checkbox", "radio"].includes(type) ? type : "field") : "button");
      let label = el.getAttribute("aria-label") || (tag === "input" || tag === "select" || tag === "textarea" ? "" : el.innerText) || "";
      if (!label && el.id) { const l = document.querySelector("label[for='" + CSS.escape(el.id) + "']"); if (l) label = l.innerText; }
      if (!label) { const l = el.closest("label"); if (l) label = l.innerText; }
      label = (label || el.getAttribute("placeholder") || el.getAttribute("title") || el.getAttribute("name") || (type === "submit" || type === "button" ? el.value : "") || (el.querySelector("img[alt]") || {}).alt || "").trim().replace(/\s+/g, " ").slice(0, 90);
      n++; el.setAttribute("data-fa", String(n));
      const it = { n, role, label };
      if (role === "field" || role === "select" || role === "combobox" || role === "textbox") {
        if (type) it.type = type;
        // what's written in it (the whole text of a message box, so that your owner sees what goes out before saying yes)
        const v = el.isContentEditable ? el.innerText : el.value;
        if (v && type !== "password") it.value = String(v).trim().slice(0, tag === "input" ? 300 : 4000);
      }
      if (role === "checkbox" || role === "radio" || role === "switch") it.checked = !!el.checked || el.getAttribute("aria-checked") === "true";
      if (tag === "a") it.href = (el.getAttribute("href") || "").slice(0, 120);
      if (tag === "select") it.options = [...el.options].slice(0, 20).map((x) => x.text.trim()).filter(Boolean);
      out.push(it);
      if (n >= 220) break;
    }
    // everything that is written in the page's fields (all of them, not only the first ones): what goes out, for your owner to read
    const filled = [];
    for (const el of all) {
      const tag = el.tagName.toLowerCase(), type = (el.getAttribute("type") || "").toLowerCase();
      if (!(el.isContentEditable || tag === "textarea" || (tag === "input" && !["button", "submit", "reset", "image", "checkbox", "radio", "password", "hidden", "file"].includes(type)))) continue;
      if (el.isContentEditable && el.parentElement && el.parentElement.isContentEditable) continue;   // the box, not each piece inside it
      const v = String((el.isContentEditable ? el.innerText : el.value) || "").trim();
      if (!v) continue;
      const label = (el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.getAttribute("name") || el.getAttribute("title") || "").trim().slice(0, 60);
      filled.push({ label, value: v.slice(0, 6000) });
      if (filled.length >= 30) break;
    }
    const text = (document.body ? document.body.innerText : "").replace(/\n{3,}/g, "\n\n").trim();
    // a link to a part of the same page (#services): where that part starts in the text
    let at = -1;
    try { const id = decodeURIComponent(location.hash.slice(1)), target = id && document.getElementById(id); const start = target ? (target.innerText || "").trim().slice(0, 60) : ""; if (start) at = text.indexOf(start); } catch {}
    return { url: location.href, title: document.title, text: text.slice(0, 400000), at, elements: out, filled };
  };
  // The page's text goes in pieces: «scroll down» gives the next piece (before 9.2.1 it gave the same beginning again and the agent went round in circles)
  const PIECE = 9000, STEP = PIECE - 400;   // the pieces overlap a little, so that no sentence is cut in two
  async function snapshot(page, agent) {
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(700);
    const r = await page.evaluate(COLLECT).catch(async () => { await page.waitForTimeout(1500); return await page.evaluate(COLLECT); });
    const t = agent ? tabs.get(agent) : null, all = String(r.text || "");
    let from = 0;
    if (t) {
      const base = (u) => String(u || "").split("#")[0];
      if (base(t.url) !== base(r.url)) t.from = 0;                        // another page: from its beginning
      else if (t.url !== r.url && r.at >= 0) t.from = Math.max(0, r.at - 200);   // the same page, another part of it (#…): from there
      t.url = r.url;
      t.from = Math.max(0, Math.min(t.from, Math.max(0, all.length - 1))); t.len = all.length; from = t.from;
    }
    r.text = all.slice(from, from + PIECE);
    r.more = from + PIECE < all.length;
    r.part = Math.floor(from / STEP) + 1;
    r.parts = all.length <= PIECE ? 1 : 1 + Math.ceil((all.length - PIECE) / STEP);
    return r;
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
    const t = tabs.get(agent); t.from = 0; t.url = ""; t.hold = 0;   // a page opened again is read from its beginning
    await page.goto(u, { waitUntil: "domcontentloaded", timeout: 45000 });
    return await snapshot(page, agent);
  }
  // A step on the page: «click», «type», «select», «check», «press» (a key, Enter by default), «scroll» («down»/«up»), «back».
  // The element goes by its number; if the page was reloaded meanwhile (for example, while it waited for your permission), it's found by its words.
  async function webAct(agent, d, ctx) {
    const t = tabs.get(agent);
    if (!t || t.page.isClosed() || t.page.url() === "about:blank") {
      // with your yes, but the tab is gone (for example, the app was closed meanwhile): it has to be done again
      if (ctx && ctx.authorized) throw Object.assign(new Error(L("The page had closed before your yes (for example, because the app was closed): it has to be done again.")), { shown: true, closed: true });
      throw Object.assign(new Error(L("First open a page (web_open).")), { shown: true });
    }
    let page = t.page; t.last = Date.now(); t.hold = 0;
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
    else if (action === "scroll") {   // the next (or the previous) piece of the text; the page also moves, for the ones that load more as you go down
      const up = /up|arriba/i.test(String(d.text || ""));
      t.from = Math.max(0, Math.min(t.from + (up ? -STEP : STEP), Math.max(0, (t.len || 0) - 1)));
      await page.mouse.wheel(0, up ? -900 : 900);
    }
    else if (action === "back") await page.goBack({ timeout: 20000 }).catch(() => {});
    else throw Object.assign(new Error(L("I don't know the step “{1}”.", action)), { shown: true });
    const np = action === "click" ? await popup : null;   // a link that opens in a new tab: the agent carries on there
    if (np) { await np.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {}); tabs.set(agent, { page: np, last: Date.now(), from: 0, len: 0, url: "", hold: 0 }); page = np; }
    return await snapshot(page, agent);
  }
  async function webLook(agent) {
    const t = tabs.get(agent);
    if (!t || t.page.isClosed()) throw Object.assign(new Error(L("First open a page (web_open).")), { shown: true });
    const buf = await t.page.screenshot({ type: "jpeg", quality: 60 });
    return { image: "data:image/jpeg;base64," + buf.toString("base64"), url: t.page.url() };
  }


  // ---------------- 9.3 · Its documents (each agent's RAG): read on this computer and searched by words ----------------
  // Each agent consults two places: the documents you add to it in the app (o.docsFolder/<agent>) and, if you chose one,
  // a folder of yours on this computer. It reads PDF, Word (.docx; .doc and .rtf on the Mac) and text. What has been read
  // is kept (o.docsFolder/.index) so that it isn't read again unless the file changes.
  const DOC_EXT = /\.(pdf|docx|doc|rtf|txt|md|markdown|csv|tsv|json|html?|xml|ya?ml|log)$/i;
  const docsIndex = new Map();   // agent → { key, at, files: [{ path, name, mtime, size, chunks, error }] }
  const safeName = (s) => String(s || "").replace(/[^\w.\- áéíóúñüÁÉÍÓÚÑÜ()]/g, "_").replace(/^\.+/, "").slice(0, 120) || "document";
  function ownDocs(agent) { const f = path.join(o.docsFolder, safeName(agent)); mkdirSync(f, { recursive: true }); return f; }
  function docChunks(text) {
    const t = String(text || "").replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(), out = [];
    for (let i = 0; i < t.length && out.length < 4000; i += 1100) out.push(t.slice(Math.max(0, i - 100), i + 1100));   // pieces of ~1,200 characters that overlap a little
    return out;
  }
  async function readDocument(p) {
    const ext = path.extname(p).toLowerCase();
    if (ext === ".pdf") {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await fs.readFile(p)), isEvalSupported: false, useSystemFonts: true, verbosity: 0 }).promise;
      let text = "";
      for (let i = 1; i <= Math.min(doc.numPages, 1500); i++) {
        const c = await (await doc.getPage(i)).getTextContent();
        text += c.items.map((it) => (it.str || "") + (it.hasEOL ? "\n" : " ")).join("") + "\n\n";
      }
      await doc.destroy().catch(() => {});
      if (!text.trim()) throw new Error(L("it has no text (a scanned PDF: it would need reading the image)"));
      return text;
    }
    if (ext === ".docx") { const mammoth = (await import("mammoth")).default; return (await mammoth.extractRawText({ path: p })).value; }
    if (ext === ".doc" || ext === ".rtf") {
      if (process.platform !== "darwin") throw new Error(L("old Word format: save it as .docx"));
      return await new Promise((ok, ko) => execFile("textutil", ["-convert", "txt", "-stdout", p], { maxBuffer: 64e6, timeout: 60000 }, (e, out) => e ? ko(e) : ok(String(out))));
    }
    const raw = await fs.readFile(p, "utf8");
    return /\.html?$/i.test(ext) ? raw.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&") : raw;
  }
  async function walkDocs(folder, out, depth = 0) {
    if (depth > 6 || out.length >= 3000) return;
    let items = []; try { items = await fs.readdir(folder, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      if (it.name.startsWith(".") || it.name === "node_modules") continue;
      const p = path.join(folder, it.name);
      if (it.isDirectory()) await walkDocs(p, out, depth + 1);
      else if (DOC_EXT.test(it.name)) out.push(p);
      if (out.length >= 3000) return;
    }
  }
  // 9.4: the Fer Agent manual (manual/es, manual/en), in the building's language: the Helper reads it as its documents
  const manualOf = () => o.manualFolder ? path.join(o.manualFolder, /^en/i.test(String((o.locale && o.locale()) || "")) ? "en" : "es") : "";
  async function docsOf(agent, folder, manual) {
    const folders = [ownDocs(agent), folder && path.isAbsolute(String(folder)) ? path.resolve(String(folder)) : "", manual ? manualOf() : ""].filter(Boolean), key = folders.join("|");
    let ix = docsIndex.get(agent);
    if (!ix) { try { ix = JSON.parse(readFileSync(path.join(o.docsFolder, ".index", safeName(agent) + ".json"), "utf8")); ix.at = 0; } catch { ix = { key, at: 0, files: [] }; } docsIndex.set(agent, ix); }
    if (ix.key === key && Date.now() - ix.at < 30e3) return ix;   // looked at less than 30 seconds ago
    const paths = []; for (const f of folders) await walkDocs(f, paths);
    const before = new Map(ix.files.map((f) => [f.path, f])), files = [];
    let changed = ix.key !== key;
    for (const p of paths) {
      let st; try { st = await fs.stat(p); } catch { continue; }
      const old = before.get(p);
      if (old && old.mtime === st.mtimeMs && old.size === st.size) { files.push(old); continue; }
      changed = true;
      const f = { path: p, name: path.basename(p), mtime: st.mtimeMs, size: st.size, chunks: [], error: "" };
      if (st.size > 40e6) f.error = L("too big (more than 40 MB)");
      else try { f.chunks = docChunks(await readDocument(p)); } catch (e) { f.error = String(e.message || e).slice(0, 160); }
      files.push(f);
    }
    if (files.length !== ix.files.length) changed = true;
    Object.assign(ix, { key, at: Date.now(), files });
    if (changed) { try { mkdirSync(path.join(o.docsFolder, ".index"), { recursive: true }); await fs.writeFile(path.join(o.docsFolder, ".index", safeName(agent) + ".json"), JSON.stringify({ key, files })); } catch {} }
    return ix;
  }
  const STOP = new Set("de la el en los las del que con por para una uno unos unas como mas pero sus les este esta esto ese esa son ser fue han hay sin sobre entre cuando donde muy tambien the and for with that this from are was were have has not you your its our their what which who how about into than then them they will would can could".split(" "));
  const words = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 3 && !STOP.has(w));
  async function docsSearch(agent, d) {
    const ix = await docsOf(agent, d.folder, d.manual), q = [...new Set(words(d.query))];
    if (!q.length) return { found: [], files: ix.files.length };
    const pieces = ix.files.flatMap((f) => f.chunks.map((text) => ({ file: f.name, text, w: words(text) })));
    const df = new Map(q.map((t) => [t, pieces.filter((p) => p.w.includes(t)).length]));
    const found = pieces.map((p) => {
      let s = 0;
      for (const t of q) { const tf = p.w.filter((w) => w === t).length; if (tf) s += (1 + Math.log(tf)) * Math.log(1 + pieces.length / (df.get(t) || 1)); }
      if (s && q.some((t) => words(p.file).includes(t))) s *= 1.3;   // its name says it too
      return { file: p.file, text: p.text, score: s };
    }).filter((p) => p.score > 0).sort((a, b) => b.score - a.score).slice(0, Math.min(12, Number(d.k) || 6));
    return { found: found.map(({ file, text }) => ({ file, text })), files: ix.files.length };
  }
  function docsList(agent, d) {
    const man = d.manual ? manualOf() : "";
    return docsOf(agent, d.folder, d.manual).then((ix) => ({ own: ownDocs(agent), files: ix.files.map((f) => ({ name: f.name, path: f.path, size: f.size, pieces: f.chunks.length, error: f.error, own: f.path.startsWith(ownDocs(agent) + path.sep), manual: !!man && f.path.startsWith(man + path.sep) })) }));
  }

  return {
    // 9.3: its documents («search» the pieces that fit a question, «list» what it has, «add» and «remove» the ones added in the app)
    docs(op, d, ctx) {
      const agent = (ctx && ctx.agent) || "", x = d || {};
      if (!agent) return Promise.reject(new Error("no agent"));
      if (op === "search") return docsSearch(agent, x);
      if (op === "list") return docsList(agent, x);
      if (op === "add") { const name = safeName(path.basename(String(x.name || ""))); return fs.writeFile(path.join(ownDocs(agent), name), x.bytes).then(() => { const ix = docsIndex.get(agent); if (ix) ix.at = 0; return { ok: true, name }; }); }
      if (op === "remove") { const name = safeName(path.basename(String(x.name || ""))); return fs.unlink(path.join(ownDocs(agent), name)).catch(() => {}).then(() => { const ix = docsIndex.get(agent); if (ix) ix.at = 0; return { ok: true }; }); }
      if (op === "folder") return Promise.resolve({ path: ownDocs(agent) });
      return Promise.reject(new Error("docs: " + op));
    },
    // 9.2: files («list», «read», «write»): its folder; with ctx.anywhere (Your computer as you), any path
    files(op, data, ctx) { return enqueue("files", 60, () => files(op, data || {}, ctx || {}), "files:" + Math.random()); },   // they don't wait for anything
    // 9.2: the computer: «command» (an order to the system), «look» (the app in front as text; {screen: true}: a picture), «act» (mouse and keyboard)
    computer(op, data, ctx) {
      const d = data || {};
      const f = op === "command" ? () => command(d) : op === "look" ? () => look(d) : op === "act" ? () => act(d) : null;
      if (!f) return Promise.reject(new Error(L("I don't know the step “{1}”.", op)));
      return enqueue("computer", op === "command" ? 620 : 60, f, op === "command" ? "cmd:" + Math.random() : "screen");   // orders: each on its own; the screen: one at a time
    },
    // 9.2: email for the tools: «list» (the latest, or the ones matching a search) and «read» (one whole). «ctx.mailbox»: which one.
    email(op, data, ctx) {
      const id = (ctx && ctx.mailbox) || undefined, d = data || {};
      const f = op === "list" ? () => emailList(id, d) : op === "read" ? () => emailRead(id, d) : null;
      if (!f) return Promise.reject(new Error(L("I don't know the step “{1}”.", op)));
      return enqueue("email", 120, f, "email");
    },
    // 9.2: «search» (free, DuckDuckGo), «open» (a website in its tab), «act» (a step on the page), «look» (a picture of its tab)
    web(op, data, ctx) {
      const agent = String((ctx && ctx.agent) || "_"), d = data || {};
      // «hold»: its tab is waiting for your yes: it isn't closed for being unused (up to 24 hours)
      if (op === "hold") { const t = tabs.get(agent); if (t) t.hold = Date.now(); return Promise.resolve({ ok: !!t }); }
      const f = op === "search" ? () => webSearch(d.query) : op === "open" ? () => webOpen(agent, d.url) : op === "act" ? () => webAct(agent, d, ctx) : op === "look" ? () => webLook(agent) : null;
      if (!f) return Promise.reject(new Error(L("I don't know the step “{1}”.", op)));
      return enqueue("web", 120, f);
    },
    catalog() { return [...skills.values()].map(({ name, title, description, effect, kind, fixed, data, settings, own, script, folder }) => ({ name, title, description, effect, kind, fixed, data, settings, own: !!own, program: !!script, folder })); },
    reload: load,
    // They are done one at a time (a single Chrome): that way two skills don't step on each other
    run(name, data, ctx) {
      if (!skills.has(name) && OLD_SKILL_NAMES[name]) name = OLD_SKILL_NAMES[name];   // its name before version 9
      const sk = skills.get(name);
      if (!sk) return Promise.reject(new Error(L("The skill “{1}” doesn't exist.", name)));
      return enqueue(name, sk.timeout, async () => {
        if (sk.effect === "external" && !(ctx && ctx.authorized)) throw new Error(L("The skill “{1}” has an effect outside the website: it needs your permission (inbox).", name));
        if (!sk.script) return { text: sk.instructions, instructions: true, folder: sk.folder };   // a skill that is only instructions (like Claude's and OpenClaw's): its folder too, for its files
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
