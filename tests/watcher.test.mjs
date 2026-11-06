// Tests of the X Watcher without X: the rule, the searches and the reader, with a page that imitates X.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { buildSearches, applyRule, formatTweets, readTweetsInPage } from "../skills/x-watcher/watcher.mjs";
import watcher from "../skills/x-watcher/watcher.mjs";
import { readSkillMd, insideOf } from "../hands.mjs";
import { translate, fillIn } from "../engine.js";
const inSpanish = (s, ...v) => fillIn(translate("es", s), v);
import { readFileSync } from "node:fs";
import { xPage } from "./x-imitation.mjs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

test("the terms are grouped into a few “A OR B” searches and without reposts", () => {
  const md = readSkillMd(readFileSync(new URL("../skills/x-watcher/SKILL.md", import.meta.url), "utf8"));
  const terms = md.header.settings.find((x) => x.key === "terms").default;
  assert.ok(terms.length >= 30, "the proposed list");
  const b = buildSearches(terms);
  assert.ok(b.length >= 2 && b.length <= 8, `${b.length} searches`);
  assert.ok(b.every((q) => q.startsWith("(") && q.endsWith(") -filter:retweets") && q.length < 420));
  assert.equal(b.join(" ").split(" OR ").length + b.length - 1 >= terms.length, true, "no term is lost");
  assert.ok(b.some((q) => q.includes('"inteligencia artificial"')) && b.some((q) => q.includes('"人工智能"')));
});

test("the rule: new ones in the window with 3 or more; old ones that have gained 3 since the previous round; each one only once", () => {
  const now = Date.parse("2026-11-05T12:00:00Z"), min = 60e3;
  const t = (id, minutesAgo, mg, resp = 0, rep = 0, extra = {}) => Object.assign({ id, author: "a" + id, url: "u" + id, ts: now - minutesAgo * min, text: "IA " + id, likes: mg, replies: resp, reposts: rep }, extra);
  let r = applyRule([t("1", 3, 2, 1, 0), t("2", 5, 1, 0, 0), t("3", 30, 50, 5, 5), t("4", 2, 0, 0, 3, { repost: true }), t("5", 9, 1, 1, 1)], {}, now, 10, 3);
  assert.deepEqual(r.out.map((x) => x.id), ["1", "5"], "1 (2+1) and 5 (1+1+1) are new and add up to 3; 3 is old and we hadn't seen it; the repost doesn't count");
  // ten minutes later: 2 is no longer new but has gained 3; 3 has gained 2; 1 keeps rising but was already passed on
  const after = now + 10 * min;
  r = applyRule([t("1", 3, 10, 1, 0), t("2", 5, 3, 1, 0), t("3", 30, 52, 5, 5)], r.state, after, 10, 3);   // the same tweets (same publication time)
  assert.deepEqual(r.out.map((x) => x.id), ["2"]);
  assert.equal(r.out[0].gain, 3);
  const txt = formatTweets(r.out, after, 10, 3, inSpanish);   // v9: written in English, here in a Spanish building
  assert.match(txt, /^1 tweet ha sumado 3 o más interacciones en los últimos 10 minutos:/);
  assert.match(txt, /@a2 · hace 15 min · 3 me gusta · 1 respuestas · 0 reposts \(\+3\)/);
  assert.match(formatTweets(r.out, after, 10, 3), /^1 tweet has gained 3 or more interactions in the last 10 minutes:\n\n1\. @a2 · 15 min ago · 3 likes · 1 replies · 0 reposts \(\+3\)\n“IA 2”/);
  assert.equal(formatTweets([], after, 10, 3), "NOTHING");
  // what wasn't passed on is soon forgotten (it doesn't fill the memory)
  r = applyRule([], r.state, after + 60 * min, 10, 3);
  assert.deepEqual(Object.keys(r.state.seen).sort(), ["1", "2", "5"], "only the ones already passed on stay (for a day)");
});

test("the paths of the agents' folder can't leave it", () => {
  assert.equal(insideOf("/tmp/agentes", "notas/a.md"), "/tmp/agentes/notas/a.md");
  assert.throws(() => insideOf("/tmp/agentes", "../etc/passwd"), /leaves the agents|sale de la carpeta/);
  assert.throws(() => insideOf("/tmp/agentes", "notas/../../x"), /leaves the agents|sale de la carpeta/);
  assert.equal(insideOf("/tmp/agentes", "/abs/ruta.md"), "/tmp/agentes/abs/ruta.md", "an absolute path is taken inside the folder");
});

test("the reader understands the numbers X shows when the label doesn't carry the figure (“1,2 mil” is 1,200)", async () => {
  const cases = [["1,2 mil", 1200], ["12 mil", 12000], ["1.234", 1234], ["1,2 K", 1200], ["3 mill.", 3000000], ["1.5M", 1500000], ["7", 7], ["", 0]];
  const b = await chromium.launch();
  try {
    const p = await b.newPage();
    await p.setContent(cases.map(([v], i) => `<article data-testid="tweet"><a href="/u/status/${i + 1}"><time datetime="2026-11-05T12:00:00Z">x</time></a>
      <button data-testid="like" aria-label="Me gusta"><span>${v}</span></button></article>`).join(""));
    const readOnes = await p.evaluate(readTweetsInPage);
    assert.deepEqual(readOnes.map((t) => t.likes), cases.map((c) => c[1]));
  } finally { await b.close(); }
});

test("a skill that hangs is stopped on time, its Chrome is closed and the next one in the queue carries on", { timeout: 60000 }, async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
  const os = await import("node:os"), path = await import("node:path");
  const { createHands } = await import("../hands.mjs");
  const dir = mkdtempSync(path.join(os.tmpdir(), "manos-"));
  mkdirSync(path.join(dir, "skills", "colgada"), { recursive: true });
  writeFileSync(path.join(dir, "skills", "colgada", "SKILL.md"), "---\nname: colgada\ntitle: Colgada\ndescription: prueba\nefecto: lee\ntiempo: 10\nscript: colgada.mjs\n---\nNada");
  // opens a page that blocks its own engine (like a bad website) and keeps waiting
  writeFileSync(path.join(dir, "skills", "colgada", "colgada.mjs"), "export default async (d, h) => h.conPagina(async (p) => { await p.setContent('<p>hola</p>'); await p.evaluate(() => { for (;;) {} }); return 'nunca'; });");
  const warnings = [];
  const hands = createHands({ agentsFolder: path.join(dir, "agentes"), chromeProfile: path.join(dir, "perfil"), skillsFolders: [path.join(dir, "skills"), new URL("../skills", import.meta.url).pathname], channel: "no-hay-tal-canal", log: (t) => warnings.push(t) });
  try {
    const t0 = Date.now();
    const hung = hands.run("colgada", {}, {});
    const nextOne = hands.run("read-file", { path: "." }, {});
    await assert.rejects(hung, /tardó más de 10 s/);
    const r = await nextOne;
    assert.ok(Date.now() - t0 < 30000, `the queue carried on in time (${Date.now() - t0} ms)`);
    assert.equal(typeof r.text, "string");
    assert.equal((await hands.run("leer-archivo", { path: "." }, {})).text, r.text, "a skill asked for by its name before version 9 (an approval or a conversation from then)");
    assert.ok(warnings.some((t) => /tardó más de 10 s/.test(t)));
  } finally { await hands.close(); }
});

test("reading a website: only the internet, never your home network, this computer or a server's internal addresses", async () => {
  const { isPublicAddress, createHands } = await import("../hands.mjs");
  for (const u of ["http://127.0.0.1:8080/", "http://169.254.169.254/latest/meta-data", "http://192.168.1.1/", "http://10.0.0.5/", "http://172.20.1.1/", "http://[::1]/", "http://localhost:3000/", "http://router.local/", "file:///etc/passwd", "http://100.100.1.1/"])
    assert.equal(await isPublicAddress(u), false, u);
  for (const u of ["https://8.8.8.8/", "https://93.184.215.14/x?y=1"]) assert.equal(await isPublicAddress(u), true, u);
  const os = await import("node:os"), path = await import("node:path"), { mkdtempSync } = await import("node:fs");
  const dir = mkdtempSync(path.join(os.tmpdir(), "manos-"));
  const hands = createHands({ agentsFolder: path.join(dir, "a"), chromeProfile: path.join(dir, "p"), skillsFolders: [new URL("../skills", import.meta.url).pathname] });
  await assert.rejects(hands.run("read-web", { url: "http://169.254.169.254/latest/meta-data" }, {}), /solo leen webs de internet/);
  await hands.close();
});

test("the reader and the whole Watcher, against a page that imitates X (real Chrome, no X)", async () => {
  const now = Date.now();
  let visits = 0, askLogin = false;
  const base = [
    { id: "101", author: "ana", minutesAgo: 2, text: "La inteligencia artificial ya…", mg: 2, resp: 1 },
    { id: "102", author: "bob", minutesAgo: 4, text: "AI agents are…", mg: 1 },
    { id: "103", author: "chen", minutesAgo: 6, text: "人工智能 新闻", mg: 1234, visible: "1,2 mil", rep: 10 },
    { id: "104", author: "dan", minutesAgo: 3, text: "Repost sin texto", mg: 9, repost: "Eva" },
    { id: "105", author: "eli", minutesAgo: 25, text: "Viejo", mg: 0 }];
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/search") {
      visits++;
      const tweets = base.map((t) => Object.assign({}, t, visits > 1 && t.id === "102" ? { mg: 4 } : {}));   // on the second round, 102 gains 3
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(xPage({ now, tweets, login: askLogin }));
    }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => srv.listen(0, r));
  const url = `http://127.0.0.1:${srv.address().port}`;
  const b = await chromium.launch();
  try {
    const page = await b.newPage();
    await page.goto(url + "/search?q=x");
    const readOnes = await page.evaluate(readTweetsInPage);
    assert.deepEqual(readOnes.map((t) => [t.id, t.author, t.likes, t.replies, t.reposts, t.repost]), [["101", "ana", 2, 1, 0, false], ["102", "bob", 1, 0, 0, false], ["103", "chen", 1234, 0, 10, false], ["104", "dan", 9, 0, 0, true], ["105", "eli", 0, 0, 0, false]]);
    assert.ok(Math.abs(readOnes[0].ts - (now - 2 * 60e3)) < 1000, "the tweet's time");
    await page.close();
    visits = 0;
    const h = { withPage: async (f) => { const p = await b.newPage(); try { return await f(p); } finally { await p.close(); } }, now: () => now + 1000, log: () => {}, L: inSpanish };   // a Spanish building
    const settings = { terms: ['"inteligencia artificial"', '"AI agents"'], windowMinutes: 10, minimum: 3, scrolls: 2, base: url };
    const r1 = await watcher(settings, h, { state: {} });
    assert.match(r1.text, /2 tweets han sumado 3 o más/);
    assert.match(r1.text, /@chen/); assert.match(r1.text, /@ana/);
    assert.doesNotMatch(r1.text, /@dan|@eli|@bob/);
    assert.match(r1.summary, /tweets leídos en 1 búsquedas; 2 cumplen la regla/);
    const r2 = await watcher(settings, { ...h, now: () => now + 10 * 60e3 }, { state: r1.state });
    assert.match(r2.text, /@bob .*\(\+3\)/, "102 has gained 3 since the previous round");
    assert.doesNotMatch(r2.text, /@chen|@ana/, "the ones already passed on aren't repeated");
    askLogin = true;
    await assert.rejects(() => watcher(settings, h, { state: {} }), /X pide entrar/);
  } finally { await b.close(); srv.close(); }
});
