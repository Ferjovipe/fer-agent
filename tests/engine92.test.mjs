// Version 9.2 · «Internet as you» and permissions per agent. With a real Chrome (the agents' one, through Playwright) and a
// made-up shop on this computer: open a website, type, click, a link that opens a new tab, the free search and the three
// permission modes (ask first, with limits, without asking). The brain is simulated: no OpenRouter.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { Building, cleanPermissions, actionKind } from "../engine.js";
import { createHands } from "../hands.mjs";

process.env.FER_ALLOW_LOCAL = "1";   // the made-up shop lives on this computer (only for the tests)
const PAGES = {
  "/shop": `<!doctype html><html><head><title>Test shop</title></head><body><h1>Test shop</h1>
    <form action="/order" method="get"><label for="q">Quantity</label><input id="q" name="qty" value="1"><button type="submit">Buy now</button></form>
    <a href="/news" target="_blank">News</a>
    <button onclick="document.getElementById('msg').textContent='Hello there'">Say hello</button><p id="msg"></p>
    <form action="/sent"><textarea name="m" aria-label="Message"></textarea><button>Send message</button></form>
    <select aria-label="Colour"><option>Red</option><option>Blue</option></select></body></html>`,
  "/news": `<!doctype html><title>News</title><p>Today's news: the shop is open.</p>`,
  "/ddg": `<!doctype html><title>results</title><div class="result"><a class="result__a" href="https://example.com/a">First result</a><div class="result__snippet">About steel.</div></div>
    <div class="result"><a class="result__a" href="https://example.com/b">Second result</a><div class="result__snippet">More steel.</div></div>`
};
let server, base, hands;
test.before(async () => {
  server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    let body = PAGES[u.pathname];
    if (u.pathname === "/order") body = `<!doctype html><title>Order</title><p>Order placed: ${u.searchParams.get("qty")} units.</p>`;
    if (u.pathname === "/sent") body = `<!doctype html><title>Sent</title><p>Message sent: ${u.searchParams.get("m")}</p>`;
    res.writeHead(body ? 200 : 404, { "Content-Type": "text/html; charset=utf-8" }); res.end(body || "not found");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
  process.env.FER_SEARCH_ENGINE = base + "/ddg";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fa92-"));
  hands = createHands({ agentsFolder: path.join(dir, "agents"), chromeProfile: path.join(dir, "chrome"), skillsFolders: [path.resolve("skills")], channel: "none" });
});
test.after(async () => { await hands.close(); server.close(); });

const MODELS = [{ id: "openai/gpt-6-luna", name: "GPT 6 Luna", pricing: { prompt: "0.0000001", completion: "0.0000005" }, architecture: { input_modalities: ["text"], output_modalities: ["text"] }, context_length: 128000 }];
const reply = (content, tool) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ model: "m", usage: { cost: 0.0001 },
  choices: [{ message: tool ? { content: "", tool_calls: [{ id: "c" + Math.random(), type: "function", function: { name: tool[0], arguments: JSON.stringify(tool[1]) } }] } : { content } }] }) });
// a brain that follows a script: each call, the next step (a tool or the final text)
async function building(script, permissions) {
  let i = 0; const seen = [];
  const fetch = async (url, init) => {
    const b = JSON.parse(init.body); seen.push(b);
    if (!b.messages) return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ answers: { decision: { choice: "go_ahead" } }, usage: { cost: 0 } }) };
    if (!/Rita/.test(String(b.messages[0].content))) return reply("Noted.");
    const step = script[i++];
    return typeof step === "function" ? step(b) : Array.isArray(step) ? reply("", step) : reply(step || "Done.");
  };
  const ed = new Building({ load: async () => null, save: async () => {}, key: () => "sk-or-test", fetch, now: () => Date.now(), hands });
  ed.setModels(MODELS);
  await ed.start("basic", "en");
  const r = await ed.run({ type: "createAgent", profile: { name: "Rita", role: "subagent", floor: "tech", seat: "office", brain: "openai/gpt-6-luna", instructions: "You buy things online.",
    heartbeat: { every: 1, unit: "on_request" }, capabilities: ["write", "internet"] } });
  const a = ed.agent(r.id);
  if (permissions) await ed.run({ type: "editAgent", id: a.id, changes: { permissions } });
  return { ed, a, seen, toolResults: () => seen.filter((b) => b.messages && /Rita/.test(String(b.messages[0].content))).at(-1).messages.filter((m) => m.role === "tool").map((m) => String(m.content)) };   // the conversation as the brain saw it last
}

test("the hands: a website read as text with what can be used numbered; typing, clicking, a select and a link that opens a new tab", async () => {
  const s = await hands.web("open", { url: base + "/shop" }, { agent: "t1" });
  assert.equal(s.title, "Test shop");
  const by = (label) => s.elements.find((e) => e.label === label);
  assert.ok(by("Quantity") && by("Quantity").role === "field" && by("Quantity").value === "1", "a field with its label and value");
  assert.ok(by("Buy now") && by("Buy now").role === "button");
  assert.ok(by("Colour") && by("Colour").options.includes("Blue"), "a select with its options");
  await hands.web("act", { action: "type", element: by("Quantity").n, text: "3" }, { agent: "t1" });
  const s2 = await hands.web("act", { action: "click", element: by("Say hello").n }, { agent: "t1" });
  assert.match(s2.text, /Hello there/, "the click did what the button does");
  const s3 = await hands.web("act", { action: "click", element: s2.elements.find((e) => e.label === "News").n }, { agent: "t1" });
  assert.match(s3.url, /\/news$/, "the new tab: it carries on there");
  assert.match(s3.text, /the shop is open/);
  const r = await hands.web("search", { query: "steel" }, { agent: "t1" });
  assert.equal(r.results.length, 2, "the free search");
  await assert.rejects(hands.web("act", { action: "click", element: 1 }, { agent: "nobody" }), /web_open/);
});

test("what a step does outside, from its words (and the agent's own word, the most serious of the two counts)", () => {
  assert.equal(actionKind("button «Buy now»"), "pay");
  assert.equal(actionKind("button «Comprar ahora»"), "pay");
  assert.equal(actionKind("button «Send message»"), "send");
  assert.equal(actionKind("button «Eliminar cuenta»"), "delete");
  assert.equal(actionKind("button «Say hello»"), "read");
  assert.equal(actionKind("button «Say hello»", "pay"), "pay", "if the agent says it pays, it pays");
  assert.equal(actionKind("button «Buy now»", "send"), "pay", "it can't make it less serious than it is");
  assert.deepEqual(cleanPermissions(null), { mode: "ask", ask: ["pay", "send", "delete", "other"] }, "by default it asks first");
  assert.deepEqual(cleanPermissions({ mode: "limits", ask: ["pay", "nonsense"] }), { mode: "limits", ask: ["pay"] });
});

test("«Ask me first»: clicking «Buy now» goes to the inbox; with the owner's yes it's done and the agent is woken up with the page", async () => {
  const { ed, a, toolResults } = await building([
    ["web_open", { url: base + "/shop" }],
    (b) => { const t = String(b.messages.at(-1).content); const n = Number(t.match(/\[(\d+)\] field «Quantity»/)[1]); return reply("", ["web_act", { action: "type", element: n, text: "3" }]); },
    (b) => { const t = String(b.messages.at(-1).content); const n = Number(t.match(/\[(\d+)\] button «Buy now»/)[1]); return reply("", ["web_act", { action: "click", element: n }]); },
    "I've asked my owner for permission to buy."
  ]);
  await ed.run({ type: "speak", text: "Buy 3 units in the test shop.", agent: a.id });
  assert.match(toolResults()[2], /Permission requested from your owner \(inbox, au_/, "it doesn't buy on its own");
  const pending = ed.inbox().filter((x) => x.kind === "action");
  assert.equal(pending.length, 1);
  assert.match(pending[0].what, /«Buy now» \(pay or buy\)/);
  const before = a.tasks.length;
  const r = await ed.run({ type: "inbox.decide", kind: "action", id: pending[0].id, yes: true });
  assert.equal(r.state, "done");
  assert.match(r.result, /Order placed: 3 units/, "done on its tab, with the quantity it had typed");
  assert.equal(a.tasks.length, before + 1, "woken up to carry on");
  assert.match(a.tasks.at(-1).text, /Your owner approved .*Order placed: 3 units/s);
});

test("«Without asking»: it buys straight away, under its owner's responsibility", async () => {
  const { ed, a, toolResults } = await building([
    ["web_open", { url: base + "/shop" }],
    (b) => reply("", ["web_act", { action: "click", element: Number(String(b.messages.at(-1).content).match(/\[(\d+)\] button «Buy now»/)[1]) }]),
    "Bought."
  ], { mode: "free" });
  await ed.run({ type: "speak", text: "Buy one.", agent: a.id });
  assert.match(toolResults()[1], /Order placed: 1 units/);
  assert.equal(ed.inbox().filter((x) => x.kind === "action").length, 0);
  assert.match(ed.e.log.find((x) => x.agent === a.id && /permissions now/.test(x.text)).text, /acts without asking/);
});

test("«With limits» (only paying asks): sending a message goes ahead, buying waits for its owner", async () => {
  const { ed, a, toolResults } = await building([
    ["web_open", { url: base + "/shop" }],
    (b) => reply("", ["web_act", { action: "type", element: Number(String(b.messages.at(-1).content).match(/\[(\d+)\] field «Message»/)[1]), text: "hi" }]),
    (b) => reply("", ["web_act", { action: "click", element: Number(String(b.messages.at(-1).content).match(/\[(\d+)\] button «Send message»/)[1]) }]),
    ["web_open", { url: base + "/shop" }],
    (b) => reply("", ["web_act", { action: "click", element: Number(String(b.messages.at(-1).content).match(/\[(\d+)\] button «Buy now»/)[1]) }]),
    "Message sent; the purchase is waiting for you."
  ], { mode: "limits", ask: ["pay"] });
  await ed.run({ type: "speak", text: "Send hi and buy one.", agent: a.id });
  const t = toolResults();
  assert.match(t[2], /Message sent: hi/, "sending: without asking");
  assert.match(t[4], /Permission requested/, "paying: it asks");
});

test("the firewall: an address carrying data from the building's notes isn't opened", async () => {
  const { ed, a, toolResults } = await building([["web_open", { url: base + "/shop?account=ES9121000418450200051332" }], "Blocked."], { mode: "free" });
  ed.saveMemory("My account number is ES9121000418450200051332", [], a.id);
  await ed.run({ type: "speak", text: "Open that.", agent: a.id });
  assert.match(toolResults()[0], /Blocked by the firewall/);
});

test("9.2 change: the paid search and the skills that came with Fer Agent become capabilities, only once", async () => {
  const { ed } = await building([]);
  const old = ed.e.agents.find((x) => x.name === "Rita");
  old.capabilities = ["write", "search", "skills"]; old.skills = ["read-web", "send-email"];
  delete ed.e.capabilitiesV92;
  ed.repair && ed.repair();
  const a = ed.e.agents.find((x) => x.name === "Rita");
  assert.deepEqual(a.capabilities.filter((c) => ["internet", "email", "search"].includes(c)).sort(), ["email", "internet"]);
  a.capabilities = a.capabilities.filter((c) => c !== "internet");
  ed.repair && ed.repair();
  assert.ok(!ed.e.agents.find((x) => x.name === "Rita").capabilities.includes("internet"), "once you turn it off, it stays off");
});
