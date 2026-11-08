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
  // 9.2.1: a long page (its end is far beyond the first piece) with a menu that jumps to a part of it
  "/long": `<!doctype html><title>Long page</title><nav><a href="#services">Services</a></nav><p>START OF THE PAGE</p>` + "<p>Filler about gardening and nothing else. </p>".repeat(700)
    + `<section id="services"><h2>Our services: diagnosis, automation and training</h2><p>Contact: hello@example.com</p></section><p>END OF THE PAGE</p>`,
  "/bigmail": `<!doctype html><title>Inbox</title>` + Array.from({ length: 300 }, (_, i) => `<a href="/m${i}">Email number ${i}</a>`).join("<br>")
    + `<div role="dialog" aria-label="New message"><input aria-label="To" value="coco@example.com"><input aria-label="Subject" value="Hello Coco">
    <div contenteditable="true" role="textbox" aria-label="Message body">Hello Coco,<br>tell Fer a joke.</div><div role="button" aria-label="Send">Send</div></div>`,
  "/mail": `<!doctype html><title>Compose</title><input aria-label="To" value="coco@example.com"><input aria-label="Subject" value="Hello Coco">
    <div contenteditable="true" role="textbox" aria-label="Message body">Hello Coco, tell Fer a joke.</div><button onclick="document.title='SENT'">Send</button>`,
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

test("9.2.1 · a long page is read in pieces: «scroll down» gives the next piece (not the same one), and a menu link jumps to its part", async () => {
  const s = await hands.web("open", { url: base + "/long" }, { agent: "long1" });
  assert.match(s.text, /START OF THE PAGE/);
  assert.ok(s.more && s.part === 1 && s.parts > 3, `in pieces: ${s.part}/${s.parts}`);
  assert.doesNotMatch(s.text, /END OF THE PAGE/);
  const s2 = await hands.web("act", { action: "scroll" }, { agent: "long1" });
  assert.equal(s2.part, 2, "the next piece");
  assert.doesNotMatch(s2.text, /START OF THE PAGE/, "not the beginning again");
  const s3 = await hands.web("act", { action: "click", element: s.elements.find((e) => e.label === "Services").n }, { agent: "long1" });
  assert.match(s3.text, /Our services: diagnosis, automation and training/, "the menu link: from its part of the page");
  assert.match(s3.text, /END OF THE PAGE/);
  assert.ok(!s3.more, "and it says it's the end");
  let last = s3; for (let i = 0; i < 3; i++) last = await hands.web("act", { action: "scroll", text: "up" }, { agent: "long1" });
  assert.ok(last.part < s3.part, "and it can go back up");
});

test("9.2.1 · in a big page (300 emails, like Gmail) the new message window comes first, and everything written in it is read", async () => {
  const s = await hands.web("open", { url: base + "/bigmail" }, { agent: "big1" });
  const labels = s.elements.slice(0, 4).map((e) => e.label);
  assert.deepEqual(labels, ["To", "Subject", "Message body", "Send"], `first, the window you're writing in: ${labels}`);
  assert.deepEqual(s.filled.map((f) => f.label), ["To", "Subject", "Message body"]);
  assert.equal(s.filled[2].value, "Hello Coco,\ntell Fer a joke.", "the whole message, with its line breaks");
});

test("9.2.1 · before sending, your owner reads what goes out (the agent's preview and what is written on the page); «Correct» sends it back to the agent", async () => {
  const { ed, a } = await building([
    ["web_open", { url: base + "/mail" }],
    (b) => reply("", ["web_act", { action: "click", element: Number(String(b.messages.at(-1).content).match(/\[(\d+)\] button «Send»/)[1]), effect: "send", preview: "To: coco@example.com\nSubject: Hello Coco\n\nHello Coco, tell Fer a joke." }]),
    "Waiting for your yes.",
    "I'll make it shorter and ask again."
  ]);
  await ed.run({ type: "speak", text: "Write to Coco.", agent: a.id });
  const it = ed.inbox().find((x) => x.kind === "action");
  assert.equal(it.effect, "send", "it's a sending: the button says «Send»");
  assert.equal(it.agent, a.id, "and it shows in the agent's own chat");
  assert.match(it.detail, /^To: coco@example\.com\nSubject: Hello Coco\n\nHello Coco, tell Fer a joke\./, "first, what the agent says goes out");
  assert.match(it.detail, /Written on the page:\n(.|\n)*Subject: Hello Coco(.|\n)*Message body: Hello Coco, tell Fer a joke\./, "and what is really written on the page (also the message box)");
  assert.deepEqual({ to: it.mail.to, subject: it.mail.subject, text: it.mail.text, fromPage: it.mail.fromPage }, { to: "coco@example.com", subject: "Hello Coco", text: "Hello Coco, tell Fer a joke.", fromPage: true },
    "9.2.2: the email as an email (To, Subject, the text), taken from what is written on the page");
  const before = a.tasks.length;
  const r = await ed.run({ type: "inbox.decide", kind: "action", id: it.id, yes: false, fix: "Shorter, please" });
  assert.equal(r.state, "corrected");
  assert.equal(ed.inbox().filter((x) => x.kind === "action").length, 0, "nothing goes out");
  assert.equal(a.tasks.length, before + 1, "the agent gets the correction");
  assert.match(a.tasks.at(-1).text, /wants a change before it goes out: «Shorter, please»(.|\n)*Hello Coco, tell Fer a joke/);
});

test("9.2.1 · your yes after the tab closed (for example, the app was closed): it isn't lost; the agent does it again and asks you again", async () => {
  const { ed, a } = await building([
    ["web_open", { url: base + "/mail" }],
    (b) => reply("", ["web_act", { action: "click", element: Number(String(b.messages.at(-1).content).match(/\[(\d+)\] button «Send»/)[1]), effect: "send", preview: "To Coco: hello" }]),
    "Waiting."
  ]);
  await ed.run({ type: "speak", text: "Write to Coco.", agent: a.id });
  const it = ed.inbox().find((x) => x.kind === "action");
  const fresh = createHands({ agentsFolder: fs.mkdtempSync(path.join(os.tmpdir(), "fa92b-")), chromeProfile: fs.mkdtempSync(path.join(os.tmpdir(), "fa92c-")), skillsFolders: [], channel: "none" });
  ed.o.hands = fresh;   // like reopening the app: a new Chrome, without that tab
  try {
    const before = a.tasks.length;
    const r = await ed.run({ type: "inbox.decide", kind: "action", id: it.id, yes: true });
    assert.equal(r.state, "error");
    assert.match(r.result, /closed before your yes/);
    assert.equal(a.tasks.length, before + 1);
    assert.match(a.tasks.at(-1).text, /Open the page again, redo the steps and ask for permission again/);
  } finally { ed.o.hands = hands; await fresh.close(); }
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
    (b) => { assert.match(String(b.messages.at(-1).content), /Before asking your owner/, "9.2.1: without saying what goes out, it can't ask"); const t = b.messages.map((m) => String(m.content)).join("\n"); const n = Number([...t.matchAll(/\[(\d+)\] button «Buy now»/g)].at(-1)[1]); return reply("", ["web_act", { action: "click", element: n, preview: "3 units, test shop" }]); },
    "I've asked my owner for permission to buy."
  ]);
  await ed.run({ type: "speak", text: "Buy 3 units in the test shop.", agent: a.id });
  assert.match(toolResults()[3], /Permission requested from your owner \(inbox, au_/, "it doesn't buy on its own");
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
    (b) => reply("", ["web_act", { action: "click", element: Number(String(b.messages.at(-1).content).match(/\[(\d+)\] button «Buy now»/)[1]), preview: "1 unit" }]),
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

// ---------------- Files and «Your computer as you» (the orders run here; mouse and screen only on a Mac or Windows) ----------------
async function withComputer(script, permissions) {
  const b = await building(script, permissions);
  await b.ed.run({ type: "editAgent", id: b.a.id, changes: { capabilities: ["write", "files", "computer"] } });
  return b;
}
test("files: in its own folder it writes and reads without asking; outside it, it goes by its permissions", async () => {
  const outsidePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fa92out-")), "note.txt");
  const { ed, a, toolResults } = await withComputer([
    ["file_write", { path: "reports/today.md", text: "All fine." }],
    ["file_read", { path: "reports/today.md" }],
    ["file_write", { path: outsidePath, text: "outside" }],
    "Done."
  ]);
  await ed.run({ type: "speak", text: "Write the report.", agent: a.id });
  const t = toolResults();
  assert.match(t[0], /Saved: .*reports\/today\.md/);
  assert.match(t[1], /All fine\./);
  assert.match(t[2], /Permission requested/, "outside its folder, with «ask me first», it asks");
  assert.ok(!fs.existsSync(outsidePath));
  const it = ed.inbox().find((x) => x.kind === "action");
  const r = await ed.run({ type: "inbox.decide", kind: "action", id: it.id, yes: true });
  assert.equal(r.state, "done");
  assert.equal(fs.readFileSync(outsidePath, "utf8"), "outside", "written with your yes");
});

test("orders to the computer: reading goes ahead, deleting asks first; «without asking», it does it", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fa92cmd-")), victim = path.join(dir, "old.txt");
  fs.writeFileSync(victim, "x");
  const ask = await withComputer([["pc_run", { command: `ls ${dir}` }], ["pc_run", { command: `rm ${victim}` }], "Asked."]);
  await ask.ed.run({ type: "speak", text: "Tidy up.", agent: ask.a.id });
  let t = ask.toolResults();
  assert.match(t[0], /old\.txt/, "listing: straight away");
  assert.match(t[1], /Permission requested/, "deleting: it asks");
  assert.ok(fs.existsSync(victim));
  assert.match(ask.ed.inbox().find((x) => x.kind === "action").what, /\(delete\)/);
  const free = await withComputer([["pc_run", { command: `rm ${victim}` }], "Deleted."], { mode: "free" });
  await free.ed.run({ type: "speak", text: "Delete it.", agent: free.a.id });
  t = free.toolResults();
  assert.match(t[0], /Result \(code 0\)|Resultado \(código 0\)/);
  assert.ok(!fs.existsSync(victim), "without asking: done");
});

test("the screen: here (Linux, no screen) it says so instead of breaking", async () => {
  const { ed, a, toolResults } = await withComputer([["pc_look", {}], "No screen."], { mode: "free" });
  await ed.run({ type: "speak", text: "Look.", agent: a.id });
  assert.match(toolResults()[0], /It didn't work|No ha funcionado/);
});
