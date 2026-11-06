// Engine tests in ENGLISH (version 8.2): an English building is born in English, each agent is spoken to in English
// and nothing the engine says or records is left untranslated. Run: node --test tests/engine82.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { Building, UNTRANSLATED, fmt, heartbeatText, LANGUAGE, setLanguage, memoryNotesMd } from "../engine.js";

const M = (id, prompt, completion) => ({ id, name: id, pricing: { prompt: String(prompt), completion: String(completion) }, architecture: { input_modalities: ["text"], output_modalities: ["text"] }, context_length: 200000 });
const MODELS = [M("anthropic/claude-opus-5.5", 0.000004, 0.00002), M("anthropic/claude-sonnet-5.5", 0.000002, 0.00001), M("openai/gpt-6.1-sol", 0.000002, 0.00001), M("openai/gpt-6-luna", 0.0000001, 0.0000005), M("deepseek/deepseek-v4.1-flash", 0.00000015, 0.0000006)];
const resp = (content, extra = {}) => ({ json: { model: "m", choices: [{ message: Object.assign({ content }, extra) }], usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.001 } } });
const SPANISH = /\b(Eres|Tu nombre|Te llamas|Regla:|Fecha y hora|Organigrama|Objetivos del edificio|Puedes usar|Responde|Estás|Lección|Moneda|Reunión|jefe|sabio|edificio|planta|tarea)\b/;

function create(hyphen) {
  const calls = [];
  let saved = null;
  const nowRef = { t: Date.parse("2026-11-09T10:00:00") };   // a Monday
  const fetch = async (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : {};
    calls.push({ url, body });
    const r = hyphen(url, body, calls);
    const text = typeof r.text === "string" ? r.text : JSON.stringify(r.json);
    return { ok: (r.status || 200) < 400, status: r.status || 200, headers: { get: () => null }, json: async () => r.json, text: async () => text };
  };
  const ed = new Building({ load: async () => saved, save: async (j) => { saved = j; }, key: () => "sk-or-test", keys: () => ({}), fetch, now: () => nowRef.t });
  ed.setModels(MODELS);
  return { ed, calls, nowRef };
}
const systems = (ll) => ll.filter((x) => x.body && x.body.messages).map((x) => String(x.body.messages[0].content));

test("a new building in English: names, floors and instructions in English", async () => {
  const { ed } = create(() => resp("ok"));
  await ed.start("basic", "en");
  assert.equal(ed.e.language, "en");
  assert.deepEqual(ed.e.floors.map((p) => p.name), ["Dome", "Tech floor", "Lobby"]);
  assert.deepEqual(ed.e.agents.map((a) => a.name), ["Boss", "Sage 1", "Sage 2", "Techie", "Artie", "Agent Creator", "JEV", "Controller", "Memory"]);
  for (const a of ed.e.agents) assert.doesNotMatch(a.instructions || "", /\b(Eres|Vigilas|Guardas)\b/, a.name);
  assert.equal(LANGUAGE, "en");
  assert.equal(fmt(0.0123), "$0.0123");
  assert.equal(heartbeatText({ every: 3, unit: "d" }), "every 3 days");
  setLanguage("es"); assert.equal(fmt(0.0123), "0,0123 $"); assert.equal(heartbeatText({ every: 3, unit: "d" }), "cada 3 días"); setLanguage("en");
});

test("what is said to the agents, in English: chat, a task with MISSING, Techie's round, sages, meeting, Creator and lesson", async () => {
  const { ed, calls, nowRef } = create((url, body) => {
    const s = body.messages ? String(body.messages[0].content) : "";
    const u = body.messages ? String(body.messages[body.messages.length - 1].content) : "";
    if (/alpha\/decisions/.test(url)) return { json: { answers: { decision: { choice: "go_ahead", probabilities: { go_ahead: 0.9 } } }, usage: { cost: 0.00002 } } };
    if (s.startsWith("You are the Agent Creator")) return resp(JSON.stringify({ name: "Chef", role: "subagent", floor: "new", newFloor: { name: "Kitchen", job: "Menus" }, seat: "pool", instructions: "You cook.", objective: "A menu", level: "budget", heartbeat: { every: 7, unit: "d" }, onWake: "tasks", capabilities: ["write"], look: { p: "girl" }, why: "Cheap." }));
    if (s.startsWith("You turn the reason for a coin")) return resp("Check the facts before answering.");
    if (u.startsWith("Task:") && s.includes("Your name is Artie")) return resp("MISSING: a list of AI newsletters.");
    if (s.startsWith("You are the building's boss") && /sages/i.test(u) && !body.messages.some((m) => m.role === "tool")) return resp("", { tool_calls: [{ id: "t1", type: "function", function: { name: "consult_sages", arguments: JSON.stringify({ question: "Should we open a new office?" }) } }] });
    if (s.startsWith("You are the building's boss") && /meeting/i.test(u) && !body.messages.some((m) => m.role === "tool")) return resp("", { tool_calls: [{ id: "t2", type: "function", function: { name: "call_meeting", arguments: JSON.stringify({ title: "Weekly plan", agenda: "Agenda: decide the week.", participants: ["Techie"], rounds: 1 }) } }] });
    return resp("Done. NOTHING else.".startsWith("x") ? "" : "Here is my answer.");
  });
  await ed.start("basic", "en");
  await ed.run({ type: "pause", pause: false });
  // chat with the boss and with an agent
  await ed.run({ type: "speak", text: "Hello" });
  await ed.run({ type: "speak", agent: "techie", text: "How is everything?" });
  // the boss consults the sages and calls a meeting
  await ed.run({ type: "speak", text: "Ask the sages whether we should open an office" });
  await ed.run({ type: "speak", text: "Call a meeting with Tecno" });
  const reu = ed.e.meetings.at(-1);
  assert.ok(reu, "the boss proposes the meeting");
  await ed.run({ type: "meeting.start", meeting: reu.id, rounds: 1 });
  for (let i = 0; i < 40 && ed.e.meetings.at(-1).state !== "finished"; i++) await new Promise((r) => setTimeout(r, 25));
  assert.equal(ed.e.meetings.at(-1).agenda, "decide the week.", "without repeating “Agenda:”");
  // a task it can't do: MISSING
  await ed.run({ type: "assignTask", id: "artie", text: "Send me the AI news" });
  await ed.run({ type: "wakeUp", id: "artie" });
  const art = ed.agent("artie");
  assert.ok(art.missing && /newsletters/.test(art.missing.text), "MISSING: is understood");
  assert.match(art.tasks.at(-1).result, /^Missing: /);
  // Techie does its Monday round (with a cost review)
  await ed.run({ type: "wakeUp", id: "techie" });
  // the Creator designs an agent
  const p = await ed.run({ type: "proposeAgent", text: "One that plans the weekly menu" });
  assert.equal(p.proposal.profile.name, "Chef");
  // a coin with its lesson
  await ed.run({ type: "coin.give", id: "techie", coinType: "gold", reason: "Clear and short" });
  // the next day: the Controller's report
  nowRef.t += 86400e3; await ed.tick();
  // the inbox, the memory notes and the warnings
  ed.saveMemory("The owner prefers one-page reports", ["reports"], "you");
  const notes = memoryNotesMd(ed.e.longMemory, {});
  assert.match(notes.find((n) => /reports/.test(n.path)).text, /What the agents have learned about “reports”/);
  const inbox = ed.inbox();
  assert.ok(inbox.length >= 2);
  // everything sent to the brains, in English
  const s = systems(calls);
  mkdirSync(new URL("./screenshots/", import.meta.url), { recursive: true });   // in a copy just downloaded from GitHub it doesn't exist
  writeFileSync(new URL("./screenshots/motor82-prompts.txt", import.meta.url), s.join("\n\n==========\n\n"));
  assert.ok(s.length >= 8, "hubo llamadas");
  // (the Creator is given the JSON keys as they are: «nombre», «planta»… are field names, not text)
  for (const x of s) if (!x.startsWith("You are the Agent Creator")) assert.doesNotMatch(x, SPANISH, x.slice(0, 200));
  assert.ok(s.some((x) => x.startsWith("You are the Agent Creator") && x.includes("Reply ONLY with a JSON object") && x.includes("Floors of the building:")));
  for (const x of calls.filter((y) => y.body && y.body.messages)) for (const m of x.body.messages) if (m.role === "user" || m.role === "system") assert.doesNotMatch(String(m.content), /\b(Tarea:|Lo dicho|Transcripción|Escribe el acta|Orden del día|ME FALTA)\b/, String(m.content).slice(0, 160));
  // what the engine records (activity) and the inbox, in English
  for (const r of ed.e.log) assert.doesNotMatch(r.text, /\b(latido|tarea|ronda|gasto|moneda|reunión|lección|cerebro|despierta|guardado)\b/, r.text);
  for (const b of inbox) assert.doesNotMatch(`${b.what} ${b.detail || ""}`, /\b(Lección|Moneda|Reunión|llamadas|Dice que)\b/, b.what);
  // and nothing was asked for that isn't in the dictionary
  assert.deepEqual([...UNTRANSLATED].filter((x) => !["min", "h"].includes(x)), []);
});

test("changing the building's language: the built-in parts change language; what the owner wrote, doesn't", async () => {
  const { ed, calls } = create(() => resp("ok"));
  await ed.start("basic", "en");
  // what the owner writes: renames to Sage 2, creates a floor and changes Techie's instructions
  await ed.run({ type: "editAgent", id: "sage2", changes: { name: "Consejera ChatGPT Pro" } });
  const pl = await ed.run({ type: "createFloor", name: "Redes Sociales", job: "Publicar" });
  await ed.run({ type: "editAgent", id: "techie", changes: { instructions: "Mis instrucciones." } });
  const r = await ed.run({ type: "language", language: "es" });
  assert.equal(ed.e.language, "es");
  assert.ok(r.changed > 10, "the built-in parts changed");
  assert.deepEqual(ed.e.agents.map((a) => a.name), ["Jefe", "Sabio 1", "Consejera ChatGPT Pro", "Tecno", "Arturito", "Creador de agentes", "JEV", "Interventor", "Memory"]);
  assert.deepEqual(ed.e.floors.filter((p) => p.id !== pl.id).map((p) => p.name), ["Cúpula", "Planta técnica", "Vestíbulo"]);
  assert.equal(ed.floor(pl.id).name, "Redes Sociales");
  assert.equal(ed.e.name, "Mi edificio");
  assert.match(ed.agent("boss").instructions, /^Eres el jefe del edificio/);
  assert.match(ed.agent("artie").instructions, /^Eres Arturito/);
  assert.match(ed.agent("artie").objective, /^Un informe diario/);
  assert.equal(ed.agent("techie").instructions, "Mis instrucciones.", "the instructions the owner changed stay");
  await ed.run({ type: "speak", text: "Hola" });
  assert.match(systems(calls).at(-1), /^Eres el jefe del edificio/);
  assert.match(systems(calls).at(-1), /Te llamas Jefe\. Tu papel: Jefe\./);
  // the «Back to the built-in names» button
  const b = await ed.run({ type: "builtInNames" });
  assert.equal(b.changed, 1);
  assert.equal(ed.agent("sage2").name, "Sabio 2");
  assert.equal(ed.floor(pl.id).name, "Redes Sociales", "what the owner created doesn't change");
  // and back to English again
  await ed.run({ type: "language", language: "en" });
  assert.deepEqual(ed.e.agents.map((a) => a.name), ["Boss", "Sage 1", "Sage 2", "Techie", "Artie", "Agent Creator", "JEV", "Controller", "Memory"]);
  assert.deepEqual(ed.e.floors.map((p) => p.name).sort(), ["Dome", "Lobby", "Redes Sociales", "Tech floor"]);
  assert.equal(ed.e.name, "My building");
  assert.match(ed.agent("boss").instructions, /^You are the building's boss/);
  assert.equal(ed.agent("techie").instructions, "Mis instrucciones.");
  // buildings from before 8.2 (in Spanish), and the built-in texts of earlier versions
  const v = create(() => resp("ok"));
  await v.ed.start("basic");
  assert.equal(v.ed.e.language, "es");
  assert.equal(v.ed.e.agents[0].name, "Jefe");
  v.ed.agent("artie").instructions = "Eres Arturito, el de la mejora continua. Conoces cómo está montado este edificio, sigues cada día cómo avanzan los agentes de IA fuera " +
    "y propones al jefe mejoras concretas: funciones nuevas, cambios de estructura, agentes que faltan o sobran. Tu trabajo es mejorar el edificio, no ganar dinero: " +
    "si ves una idea de negocio, se la pasas al jefe. Cada propuesta, con su porqué y lo que costaría.";   // the version 5 one
  await v.ed.run({ type: "language", language: "en" });
  assert.equal(v.ed.agent("artie").name, "Artie");
  assert.match(v.ed.agent("artie").instructions, /^You are Artie/);
});

test("buildings with a history: already marked as English with Spanish names, or with old ids; they always move to English", async () => {
  // 1) the building already says «en» but keeps the names in Spanish (what 8.2 left): when you press English, they're fixed
  const a = create(() => resp("ok"));
  await a.ed.start("basic");
  a.ed.e.language = "en";
  const r = await a.ed.run({ type: "language", language: "en" });
  assert.ok(r.changed > 10);
  assert.deepEqual(a.ed.e.agents.map((x) => x.name), ["Boss", "Sage 1", "Sage 2", "Techie", "Artie", "Agent Creator", "JEV", "Controller", "Memory"]);
  assert.deepEqual(a.ed.e.floors.map((x) => x.name), ["Dome", "Tech floor", "Lobby"]);
  // 2) ids that aren't the built-in ones (very old buildings): they're recognised by their role, their type or their built-in name
  const b = create(() => resp("ok"));
  await b.ed.start("basic");
  const j = b.ed.agent("boss"); const s2 = b.ed.agent("sage2");
  for (const x of b.ed.e.agents) { if (x.reportsTo) x.reportsTo = x.reportsTo === "boss" ? "ag_viejo1" : x.reportsTo; }
  j.id = "ag_viejo1"; s2.id = "ag_viejo2";
  b.ed.e.floors.find((p) => p.id === "dome").id = "management";
  b.ed.e.floors.find((p) => p.id === "tech").id = "pl_viejo";
  for (const x of b.ed.e.agents) { if (x.floor === "dome") x.floor = "management"; if (x.floor === "tech") x.floor = "pl_viejo"; }
  await b.ed.run({ type: "language", language: "en" });
  assert.equal(b.ed.agent("ag_viejo1").name, "Boss");
  assert.equal(b.ed.agent("ag_viejo2").name, "Sage 2");
  assert.equal(b.ed.floor("management").name, "Dome");
  assert.equal(b.ed.floor("pl_viejo").name, "Tech floor");
  // and the button recognises them too
  b.ed.agent("ag_viejo2").name = "Consejera ChatGPT Pro";
  const n = await b.ed.run({ type: "builtInNames" });
  assert.equal(n.changed, 1);
  assert.equal(b.ed.agent("ag_viejo2").name, "Sage 2");
});
