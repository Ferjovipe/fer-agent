// Engine tests with no network: simulated OpenRouter. Run: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { Building, createTemplate, chooseModel, intervalMs, seating, modelType, initialRecommended, priceLevel, JEV_MODEL, VERSION , UNTRANSLATED } from "../engine.js";
// v7: lessons are born as proposals and wait for your yes (inbox); in the v6 tests they are all approved
const approveLessons = async (ed) => { for (const l of ed.e.lessons.filter((x) => x.state === "proposed")) await ed.run({ type: "lesson.approve", lesson: l.id }); };

const MODELS = [
  { id: "anthropic/claude-opus-5.5", name: "Claude Opus 5.5", pricing: { prompt: "0.000015", completion: "0.000075" }, architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] }, context_length: 200000 },
  { id: "anthropic/claude-sonnet-5.5", name: "Claude Sonnet 5.5", pricing: { prompt: "0.000002", completion: "0.00001" }, architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] }, context_length: 200000 },
  { id: "anthropic/claude-haiku-5.5", name: "Claude Haiku 5.5", pricing: { prompt: "0.0000001", completion: "0.0000005" }, architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] }, context_length: 200000 },
  { id: "openai/gpt-6.1-sol-pro", name: "GPT 6.1 Sol Pro", pricing: { prompt: "0.00002", completion: "0.00008" }, architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] }, context_length: 200000 },
  { id: "openai/gpt-6-luna", name: "GPT 6 Luna", pricing: { prompt: "0.0000001", completion: "0.0000005" }, architecture: { input_modalities: ["text"], output_modalities: ["text"] }, context_length: 128000 },
  { id: "deepseek/deepseek-v4.1-flash", name: "DeepSeek Flash", pricing: { prompt: "0.00000015", completion: "0.0000006" }, architecture: { input_modalities: ["text"], output_modalities: ["text"] }, context_length: 128000 },
  { id: "x/free:free", name: "free", pricing: { prompt: "0", completion: "0" }, architecture: { input_modalities: ["text"], output_modalities: ["text"] }, context_length: 32000 }
];

function create(hyphen, nowRef = { t: Date.parse("2026-11-04T10:00:00") }) {
  const calls = [];
  let saved = null;
  const fetch = async (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : {};
    calls.push({ url, body });
    const r = hyphen(url, body, calls);
    return { ok: (r.status || 200) < 400, status: r.status || 200, headers: { get: () => null }, json: async () => r.json, text: async () => (typeof r.text === "string" ? r.text : JSON.stringify(r.json)) };
  };
  const ed = new Building({ load: async () => saved, save: async (j) => { saved = j; }, key: () => "sk-or-test", fetch, now: () => nowRef.t });
  ed.setModels(MODELS);
  // v7: the building starts on general pause; these tests (from v6) are about heartbeats, so they lift it when starting
  const start = ed.start.bind(ed);
  ed.start = async (p) => { const r = await start(p); ed.e.settings.pause = false; return r; };
  return { ed, calls, nowRef, saved: () => saved };
}
// In v5 the built-in building doesn't come with invented teams: the tests create their own.
async function withTeam(ed) {
  await ed.start("basic");
  const { id } = await ed.run({ type: "createFloor", name: "Contenidos", job: "Escribir y buscar" });
  await ed.run({ type: "createAgent", profile: { name: "Redactor", role: "subagent", floor: id, instructions: "Escribes textos claros y cortos para el equipo.", level: "budget" } });
  await ed.run({ type: "createAgent", profile: { name: "Buscador", role: "subagent", floor: id, seat: "pool", instructions: "Buscas información en internet y la resumes.", capabilities: ["search"] } });
  return id;
}
// JEV answers through the decisions API; the tests choose what it decides
const DECISIONS = "https://openrouter.ai/api/alpha/decisions";
const jevSays = (choice) => ({ json: { model: "typesafe/jev-1.14", answers: { decision: { type: "choice", choice, confidence: 0.8, probabilities: { go_ahead: 0.1, reuse: 0.1, stop: 0.1, ask_boss: 0.1, [choice]: 0.7 } } }, usage: { input_tokens: 500, output_tokens: 20, cost: 0.000021 } } });
const resp = (content, extra = {}) => ({ json: Object.assign({ model: "m", choices: [{ message: Object.assign({ content }, extra) }], usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.001 } }) });

test("it chooses brains by level with the real list", () => {
  const L = MODELS.map((m) => ({ id: m.id, inPrice: +m.pricing.prompt, outPrice: +m.pricing.completion, out: ["text"], inp: m.architecture.input_modalities, context: m.context_length }));
  assert.equal(chooseModel("frontier_anthropic", L), "anthropic/claude-opus-5.5");
  assert.equal(chooseModel("frontier_openai", L), "openai/gpt-6.1-sol-pro");
  assert.equal(chooseModel("high", L), "anthropic/claude-sonnet-5.5");
  assert.ok(["anthropic/claude-haiku-5.5", "openai/gpt-6-luna"].includes(chooseModel("budget", L)));
  assert.notEqual(chooseModel("budget", L, "anthropic").split("/")[0], "anthropic", "JEV uses another provider");
  assert.equal(intervalMs({ every: 10, unit: "min" }), 600000);
  assert.equal(intervalMs({ every: 1, unit: "on_request" }), null);
});

test("built-in building: dome with boss and sages, tech floor, lobby with Memory; no invented teams", async () => {
  const { ed } = create(() => resp("ok"));
  await ed.start("basic");
  const e = ed.e;
  assert.deepEqual(e.floors.map((p) => p.type), ["dome", "storey", "lobby"]);
  assert.deepEqual(e.agents.map((a) => a.name).sort(), ["Arturito", "Creador de agentes", "Interventor", "JEV", "Jefe", "Memory", "Sabio 1", "Sabio 2", "Tecno"]);
  assert.ok(!e.agents.some((a) => /Investigaci|Escritura|Redactor/.test(a.name + a.floor)));
  const cup = seating(e, "dome");
  assert.equal(cup.center[0].role, "boss");
  assert.deepEqual([cup.left[0].look.p, cup.right[0].look.p], ["grandpa", "grandma"]);
  const tec = seating(e, "tech");
  assert.equal(tec.head_office[0].name, "Tecno", "Techie, head of its floor, in the head office on the left");
  assert.deepEqual(tec.office.map((a) => a.name), ["Arturito", "Creador de agentes", "JEV", "Interventor"]);
  assert.equal(seating(e, "lobby").reception[0].name, "Memory");
  assert.equal(ed.boss().brain, "anthropic/claude-sonnet-5.5");
  const sages = ed.byRoleList("sage");
  assert.equal(sages.length, 2);
  assert.deepEqual(sages.map((s) => s.brain), ["anthropic/claude-opus-5.5", "openai/gpt-6.1-sol-pro"]);
  assert.ok(sages.every((s) => s.heartbeat.unit === "on_request"));
});

test("the boss hands out an urgent task; the worker does it and the report arrives (with no review afterwards)", async () => {
  const { ed, calls } = create((url, b) => {
    if (url === DECISIONS) return jevSays("go_ahead");
    const sys = (b.messages || [])[0] ? String(b.messages[0].content) : "";
    if (sys.startsWith("Eres el jefe del edificio")) {
      if (!b.messages.some((m) => m.role === "tool")) return resp("", { tool_calls: [{ id: "c1", type: "function", function: { name: "assign_task", arguments: JSON.stringify({ agent: "redactor", task: "Escribe un saludo", now: true }) } }] });
      return resp("Se lo he encargado al Redactor.");
    }
    return resp("¡Hola a todos!");
  });
  await withTeam(ed);
  const r = await ed.speak("Que el redactor escriba un saludo ya");
  assert.equal(r.reply, "Se lo he encargado al Redactor.");
  const red = ed.agent("Redactor");
  await new Promise((res) => setTimeout(res, 30));
  assert.equal(red.tasks.at(-1).state, "done");
  assert.equal(red.tasks.at(-1).result, "¡Hola a todos!");
  assert.ok(ed.e.conversation.some((m) => m.role === "report" && m.name === "Redactor"));
  assert.ok(!calls.some((l) => l.url === DECISIONS), "no search, no repetition, no retry: no need to ask JEV");
  assert.ok(!ed.e.agents.some((a) => "higherBrain" in a), "the higher brain no longer exists");
});

test("JEV before searching: with “Jev Latest”, it gets who the agent is, what it's about to do and its short memory", async () => {
  let decide = "go_ahead";
  const { ed, calls } = create((url, b) => (url === DECISIONS ? jevSays(decide) : resp("Resultado con datos.")));
  await withTeam(ed);
  const bus = ed.agent("Buscador");
  assert.equal(ed.agent("JEV").brain, JEV_MODEL);
  assert.equal(JEV_MODEL, "~typesafe/jev-latest");
  bus.shortMemory.push({ ts: 1, type: "note", text: "Ayer resumí los precios de la luz" });
  ed.assignTask(bus, "Precios de la luz hoy", "", true);
  let r = await ed.wakeUp(bus.id);
  const q = calls.find((l) => l.url === DECISIONS).body;
  assert.equal(q.model, "~typesafe/jev-latest");
  assert.match(q.state.join("\n"), /Quién es: Buscador/);
  assert.match(q.state.join("\n"), /Buscar en internet para la tarea «Precios de la luz hoy»/);
  assert.match(q.state.join("\n"), /Ayer resumí los precios de la luz/);
  assert.deepEqual(Object.keys(q.questions.decision.criteria), ["go_ahead", "reuse", "stop", "ask_boss"]);
  assert.equal(r.outcome, "done");
  assert.ok(calls.at(-1).body.plugins, "go ahead: it searches the internet");
  const c = ed.e.jevQueries.at(-1);
  assert.equal(c.decision, "go_ahead"); assert.equal(c.agent, bus.id); assert.ok(c.jevCost > 0); assert.equal(c.helped, null, "“did it help?” is marked by you"); assert.match(c.did, /buscó/);
  assert.ok(ed.agentSpending(ed.agent("JEV"), "today") > 0, "the query is charged to JEV's spending");
  // reuse: it works without paying for the search
  decide = "reuse";
  ed.assignTask(bus, "Precios del gas", "", true);
  r = await ed.wakeUp(bus.id);
  assert.equal(r.outcome, "done");
  assert.ok(!calls.at(-1).body.plugins, "reuse: no search");
  // stop: it doesn't do the task or spend
  decide = "stop";
  const n = calls.length;
  ed.assignTask(bus, "Precios del agua", "", true);
  r = await ed.wakeUp(bus.id);
  assert.equal(r.outcome, "stopped");
  assert.equal(calls.length, n + 1, "only the query to JEV");
  assert.equal(bus.tasks.at(-1).state, "stopped");
});

test("JEV: “ask the boss” is decided by the boss; if JEV doesn't answer, the agent goes ahead and it's noted", async () => {
  let bossSays = "SI, adelante", jevFails = false;
  const { ed, calls } = create((url, b) => {
    if (url === DECISIONS) return jevFails ? { status: 500, json: { error: { message: "caído" } } } : jevSays("ask_boss");
    if (String(b.messages[0].content).includes("JEV te pasa una duda")) return resp(bossSays);
    return resp("hecho");
  });
  await withTeam(ed);
  const bus = ed.agent("Buscador");
  ed.assignTask(bus, "Busca A", "", true);
  assert.equal((await ed.wakeUp(bus.id)).outcome, "done");
  assert.match(ed.e.jevQueries.at(-1).text, /el jefe: SI/);
  bossSays = "NO, no compensa";
  ed.assignTask(bus, "Busca B", "", true);
  assert.equal((await ed.wakeUp(bus.id)).outcome, "stopped");
  jevFails = true;
  ed.assignTask(bus, "Busca C", "", true);
  assert.equal((await ed.wakeUp(bus.id)).outcome, "done");
  assert.equal(ed.e.jevQueries.at(-1).decision, "no_answer");
  assert.ok(calls.length > 0);
});

test("a repeated task is no longer forbidden: JEV decides (“reuse” reuses without spending); the objective's heartbeat is never blocked", async () => {
  let decide = "reuse";
  const { ed, calls } = create((url) => (url === DECISIONS ? jevSays(decide) : resp("result")));
  await withTeam(ed);
  const red = ed.agent("Redactor");
  ed.assignTask(red, "Resume la semana", "", true);
  await ed.wakeUp(red.id);
  assert.ok(!calls.some((l) => l.url === DECISIONS), "the first time nothing is repeated");
  const n = calls.length;
  ed.assignTask(red, "resume la semana ", "", true);
  let r = await ed.wakeUp(red.id);
  assert.equal(r.outcome, "reused");
  assert.equal(calls.length, n + 1, "it only asks JEV; it doesn't pay for the work again");
  assert.equal(ed.e.jevQueries.at(-1).type, "repeated");
  decide = "go_ahead";
  ed.assignTask(red, "Resume la semana", "", true);
  r = await ed.wakeUp(red.id);
  assert.equal(r.outcome, "done", "if JEV says go ahead, it repeats it");
  red.onWake = "objective"; red.objective = "Una frase al día";
  const m = calls.length;
  await ed.wakeUp(red.id); await ed.wakeUp(red.id);
  assert.equal(calls.slice(m).filter((l) => l.url === DECISIONS).length, 0, "each heartbeat's work doesn't go through the repeat check");
});

test("retrying something that failed goes through JEV, only once; if it fails again, JEV proposes a red coin", async () => {
  let fail = true, decide = "go_ahead", jevDown = false;
  const { ed } = create((url) => (url === DECISIONS ? (jevDown ? { status: 503, json: { error: { message: "no" } } } : jevSays(decide)) : fail ? { status: 500, json: { error: { message: "caído" } } } : resp("ok")));
  await withTeam(ed);
  const red = ed.agent("Redactor");
  ed.assignTask(red, "Escribe el boletín", "", true);
  await ed.wakeUp(red.id);
  assert.equal(red.tasks.at(-1).state, "error");
  let r = await ed.wakeUp(red.id);   // reintento
  assert.equal(ed.e.jevQueries.at(-1).type, "retry");
  assert.equal(r.outcome, "error");
  const redCoin = ed.e.coins.find((m) => m.type === "red" && m.proposedBy === "jev");
  assert.ok(redCoin && redCoin.state === "proposed", "JEV proposes; you confirm");
  const n = ed.e.jevQueries.length;
  assert.equal((await ed.wakeUp(red.id)).outcome, "nothing", "at most one automatic retry per task");
  assert.equal(ed.e.jevQueries.length, n);
  // JEV says stop: it isn't retried
  ed.assignTask(red, "Escribe la circular", "", true); await ed.wakeUp(red.id);
  decide = "stop";
  r = await ed.wakeUp(red.id);
  assert.equal(r.outcome, "stopped");
  assert.equal(red.tasks.at(-1).state, "stopped");
  // JEV doesn't answer: it isn't retried either (without its yes, nothing is spent again on what failed)
  ed.assignTask(red, "Escribe el resumen", "", true); await ed.wakeUp(red.id);
  jevDown = true; fail = false;
  r = await ed.wakeUp(red.id);
  assert.equal(r.outcome, "no_retry");
  assert.equal(red.tasks.at(-1).state, "error");
  assert.equal((await ed.wakeUp(red.id)).outcome, "nothing");
});

test("council of sages: both answer and they pay", async () => {
  const { ed } = create((url, b) => {
    const sys = String(b.messages[0].content);
    if (sys.startsWith("Eres el jefe del edificio")) {
      if (!b.messages.some((m) => m.role === "tool")) return resp("", { tool_calls: [{ id: "c1", type: "function", function: { name: "consult_sages", arguments: '{"question":"¿Vendemos?"}' } }] });
      const tool = b.messages.find((m) => m.role === "tool").content;
      return resp("Resumen: " + tool);
    }
    if (sys.includes("sabio del consejo")) return resp(b.model.includes("opus") ? "Consejo A" : "Consejo B");
    return resp("x");
  });
  await ed.start("basic");
  const r = await ed.speak("Decisión importante: ¿vendemos?");
  assert.match(r.reply, /Consejo A/);
  assert.match(r.reply, /Consejo B/);
  for (const s of ed.byRoleList("sage")) assert.ok(ed.agentSpending(s, "today") > 0);
});

test("Memory: saving and “remember” searches by keywords without spending", async () => {
  let lastSystem = "";
  const { ed } = create((url, b) => {
    lastSystem = String(b.messages[0].content);
    if (!b.messages.some((m) => m.role === "tool") && /guarda/i.test(b.messages.at(-1).content)) return resp("", { tool_calls: [{ id: "c1", type: "function", function: { name: "save_memory", arguments: '{"text":"El coche de la empresa es un Seat azul","tags":["coche"]}' } }] });
    return resp("Hecho.");
  });
  await ed.start("basic");
  await ed.speak("Guarda que el coche de la empresa es un Seat azul");
  assert.equal(ed.e.longMemory.length, 1);
  const memorySpending = ed.agentSpending(ed.agent("Memory"), "month");
  await ed.speak("¿Recuerdas de qué color es el coche?");
  assert.match(lastSystem, /Seat azul/);
  assert.equal(ed.agentSpending(ed.agent("Memory"), "month"), memorySpending);
});

test("Controller: freezing by bands and cap", async () => {
  const { ed } = create(() => resp("x"));
  await withTeam(ed);
  ed.e.settings.dailyCap = 1; ed.e.settings.monthlyCap = 100;
  const red = ed.agent("Redactor"); red.priority = 4;       // 9.1: 1 is the most important, 5 the least
  const searchBox = ed.agent("Buscador"); searchBox.priority = 3;
  ed.recordSpending(ed.boss(), 0.85);
  ed.applyBudget();
  assert.equal(red.state, "frozen");
  assert.equal(searchBox.state, "idle");
  assert.equal(ed.boss().state, "idle");
  ed.recordSpending(ed.boss(), 0.06);   // 91 %
  ed.applyBudget();
  assert.equal(searchBox.state, "frozen");
  assert.ok(ed.byRoleList("sage").every((s) => s.state === "frozen"), "the sages (priority 2) freeze before the cap");
  assert.equal(ed.boss().state, "idle");
  ed.recordSpending(ed.boss(), 0.1);    // 101 %
  ed.applyBudget();
  assert.equal(ed.boss().state, "frozen");
  await assert.rejects(() => ed.speak("hola"), /congelado/);
  ed.e.settings.dailyCap = 10;      // you raise the cap → they come back
  ed.applyBudget();
  assert.equal(ed.boss().state, "idle");
  assert.equal(red.state, "idle");
});

test("heartbeats: each agent wakes up at its own pace; without tasks it doesn't spend", async () => {
  const nowRef = { t: Date.parse("2026-11-04T10:00:00") };
  const { ed, calls } = create(() => resp("avance"), nowRef);
  await withTeam(ed);
  const red = ed.agent("Redactor");
  red.heartbeat = { every: 10, unit: "min" }; red.onWake = "tasks";
  for (const a of ed.e.agents) if (a !== red) a.next = 9e15;
  red.next = 0;
  await ed.tick();
  assert.equal(calls.length, 0, "heartbeat without tasks = 0 calls");
  const t1 = red.last;
  nowRef.t += 5 * 60e3; await ed.tick();
  assert.equal(red.last, t1, "at 5 minutes it isn't its turn yet");
  nowRef.t += 6 * 60e3; await ed.tick();
  assert.ok(red.last > t1, "at 11 minutes it is");
  red.onWake = "objective"; red.objective = "Escribir una frase al día";
  nowRef.t += 11 * 60e3; await ed.tick();
  assert.ok(calls.length >= 1, "with an objective, the heartbeat works (and spends)");
});

// ---------- Fixes after the independent review ----------
test("the cap is checked before each call and the sages only once per conversation", async () => {
  let sages = 0;
  const { ed } = create((url, b) => {
    const sys = String(b.messages[0].content);
    if (sys.startsWith("Eres el jefe del edificio")) {
      const rounds = b.messages.filter((m) => m.role === "tool").length;
      if (rounds < 12) return resp("", { tool_calls: [1, 2, 3].map((i) => ({ id: "c" + rounds + i, type: "function", function: { name: "consult_sages", arguments: '{"question":"¿Sí?"}' } })) });
      return resp("end");
    }
    if (sys.includes("sabio del consejo")) { sages++; return { json: { model: "m", choices: [{ message: { content: "advice" } }], usage: { cost: 0.2 } } }; }
    return resp("x");
  });
  await ed.start("basic");
  ed.e.settings.dailyCap = 1;
  await ed.speak("Decisión importante").catch(() => {});
  assert.equal(sages, 2, "a single query (two sages) per conversation");
  assert.ok(ed.buildingSpending("today") < 1.1, "spending doesn't shoot above the cap: " + ed.buildingSpending("today"));
});

test("deleting an agent or loading a template doesn't delete what was spent today", async () => {
  const { ed } = create(() => resp("x"));
  await ed.start("basic");
  ed.e.settings.dailyCap = 1;
  ed.recordSpending(ed.agent("Sabio 1"), 1.2);
  ed.applyBudget();
  assert.equal(ed.boss().state, "frozen");
  await ed.run({ type: "deleteAgent", id: "sage1" });
  ed.applyBudget();
  assert.ok(ed.buildingSpending("today") >= 1.2 && ed.boss().state === "frozen", "it keeps counting and stays frozen");
  await ed.run({ type: "template", name: "empty" });
  assert.ok(ed.buildingSpending("today") >= 1.2 && ed.boss().state === "frozen", "also after changing template");
});

test("if the chat fails, the report that arrived meanwhile isn't deleted", async () => {
  let n = 0;
  const { ed } = create(() => { n++; return { status: 500, json: { error: { message: "caído" } } }; });
  await withTeam(ed);
  const p = ed.speak("hola");
  ed.e.conversation.push({ role: "report", agent: "x", name: "Redactor", content: "informe importante", ts: 1 });
  await assert.rejects(p);
  assert.ok(ed.e.conversation.some((m) => m.role === "report"), "the report stays");
  assert.ok(!ed.e.conversation.some((m) => m.role === "user"), "the failed message is removed");
});

test("a badly made backup is repaired when loaded", async () => {
  const { ed } = create(() => resp("x"));
  await ed.start("basic");
  await ed.run({ type: "import", state: JSON.stringify({ agents: [{ id: "a", name: "Raro", role: "worker", tasks: null, spending: null, heartbeat: null, shortMemory: "x", state: "working" }, { id: "a", name: "Duplicado" }] }) });
  const odd = ed.agent("Raro");
  assert.ok(Array.isArray(odd.tasks) && typeof odd.spending === "object" && odd.heartbeat.unit && odd.state !== "working");
  assert.notEqual(ed.agent("Duplicado").id, "a", "repeated ids are renamed");
  assert.ok(ed.boss(), "if the boss is missing, it's created");
  await ed.tick();
});

test("the checks and the sages aren't given tasks", async () => {
  const { ed } = create((url, b) => {
    if (String(b.messages[0].content).startsWith("Eres el jefe del edificio") && !b.messages.some((m) => m.role === "tool"))
      return resp("", { tool_calls: [{ id: "c1", type: "function", function: { name: "assign_task", arguments: '{"agent":"Memory","task":"x"}' } }, { id: "c2", type: "function", function: { name: "assign_task", arguments: '{"agent":"Sabio 2","task":"y"}' } }] });
    return resp("vale");
  });
  await ed.start("basic");
  await ed.speak("reparte");
  assert.equal(ed.agent("Memory").tasks.length, 0);
  assert.equal(ed.agent("Sabio 2").tasks.length, 0);
  await assert.rejects(() => ed.run({ type: "assignTask", id: "jev", text: "z" }), /control/);
});


// ---------- Version 5 ----------
test("floors: head office for the section head, offices and pool; if they fill up, they're enlarged", async () => {
  const { ed } = create(() => resp("x"));
  await ed.start("basic");
  const { id } = await ed.run({ type: "createFloor", name: "Ventas", job: "Buscar clientes" });
  assert.equal(ed.e.floors[1].id, id, "the new floor is built on top, under the dome");
  await ed.run({ type: "createAgent", profile: { name: "Jefa de ventas", role: "section_head", floor: id, instructions: "Diriges ventas y repartes el trabajo." } });
  await assert.rejects(() => ed.run({ type: "createAgent", profile: { name: "Otra jefa", role: "section_head", floor: id } }), /despacho/);
  for (let i = 1; i <= 6; i++) await ed.run({ type: "createAgent", profile: { name: "Vendedor " + i, role: "subagent", floor: id } });
  const p = ed.floor(id), r = seating(ed.e, id);
  assert.equal(r.office.length, 6);
  assert.equal(p.offices, 6, "the sixth office is added by itself");
  assert.ok(r.office.every((a) => a.reportsTo === r.head_office[0].id), "the sub-agents report to the section head");
  for (let i = 1; i <= 7; i++) await ed.run({ type: "createAgent", profile: { name: "Llamador " + i, role: "subagent", floor: id, seat: "pool" } });
  assert.equal(p.pools, 2, "7 in the pool: two pools of 6 are needed");
  await assert.rejects(() => ed.run({ type: "enlargeFloor", id, what: "pool", delta: -1 }), /muévelos/);
  await ed.run({ type: "enlargeFloor", id, what: "office", delta: 1 });
  assert.equal(p.offices, 7);
  await assert.rejects(() => ed.run({ type: "deleteFloor", id }), /Primero mueve/);
  await assert.rejects(() => ed.run({ type: "deleteFloor", id: "dome" }), /no se pueden borrar/);
});

test("everything can be renamed and the look is saved clean", async () => {
  const { ed } = create(() => resp("x"));
  await ed.start("basic");
  await ed.run({ type: "settings", name: "Torre Norte", changes: {} });
  await ed.run({ type: "editFloor", id: "tech", name: "Sala de máquinas", job: "Que todo funcione" });
  await ed.run({ type: "editAgent", id: "boss", changes: { name: "Lola", look: { p: "girl", clothes: "#123456", hair: "rojo", eyes: "#00ff00" } } });
  assert.equal(ed.e.name, "Torre Norte");
  assert.equal(ed.floor("tech").name, "Sala de máquinas");
  assert.deepEqual(ed.boss().look, { p: "girl", clothes: "#123456", eyes: "#00ff00", hair: null, skin: null });
  assert.equal(ed.agent("Lola").id, "boss");
});

test("the Creator designs an agent with your words; it isn't created until you accept it", async () => {
  const profile = { name: "Recetas", role: "subagent", floor: "new", newFloor: { name: "Cocina", job: "Menús y compras" }, seat: "pool", instructions: "Propones menús semanales sencillos y la lista de la compra.", objective: "Un menú cada domingo",
    level: "budget", heartbeat: { every: 7, unit: "d" }, onWake: "objective", capabilities: ["write", "search", "payments"], look: { p: "grandma", clothes: "#C0392B" }, why: "Barato y semanal." };
  const { ed, calls } = create((url, b) => String(b.messages[0].content).startsWith("Eres el Creador de agentes") ? resp("Aquí va:\n" + JSON.stringify(profile)) : resp("x"));
  await ed.start("basic");
  const n = ed.e.agents.length;
  const r = await ed.run({ type: "proposeAgent", text: "quiero uno que me haga el menú de la semana" });
  assert.equal(ed.e.agents.length, n, "proposing doesn't create");
  assert.equal(r.proposal.profile.name, "Recetas");
  assert.deepEqual(r.proposal.profile.capabilities, ["write", "speak", "hear", "internet"], "the old «search» is «Internet as you» (9.2); what doesn't exist goes");
  assert.equal(r.proposal.profile.brain, chooseModel("budget", ed.models));
  assert.equal(calls.at(-1).body.model, "anthropic/claude-sonnet-5.5", "the Creator thinks with a high brain");
  assert.ok(ed.agentSpending(ed.agent("Creador de agentes"), "today") > 0);
  await ed.run({ type: "acceptProposal", proposal: r.proposal.id });
  const fresh = ed.agent("Recetas");
  assert.equal(ed.floor(fresh.floor).name, "Cocina", "it also creates the floor that was needed");
  assert.equal(fresh.seat, "pool");
  assert.equal(fresh.look.p, "grandma");
  await assert.rejects(() => ed.run({ type: "acceptProposal", proposal: r.proposal.id }), /pendiente/);
});

test("the boss asks the Creator for an agent and the proposal reaches the chat", async () => {
  const { ed } = create((url, b) => {
    const sys = String(b.messages[0].content);
    if (sys.startsWith("Eres el jefe del edificio") && !b.messages.some((m) => m.role === "tool")) return resp("", { tool_calls: [{ id: "c1", type: "function", function: { name: "assign_task", arguments: JSON.stringify({ agent: "Creador de agentes", task: "Un agente que vigile el correo", now: true }) } }] });
    if (sys.startsWith("Eres el jefe del edificio")) return resp("Se lo pido al Creador.");
    if (sys.startsWith("Eres el Creador de agentes")) return resp('{"name":"Cartero","role":"subagent","floor":"tech","seat":"office","instructions":"Vigilas el correo y avisas de lo importante.","level":"budget","heartbeat":{"every":1,"unit":"h"}}');
    return resp("x");
  });
  await ed.start("basic");
  await ed.speak("Quiero un agente para el correo");
  await new Promise((res) => setTimeout(res, 30));
  const inf = ed.e.conversation.find((m) => m.role === "report" && m.proposal);
  assert.ok(inf && /Cartero/.test(inf.content));
  assert.ok(!ed.agent("Cartero"), "it doesn't exist yet");
  await ed.run({ type: "acceptProposal", proposal: inf.proposal });
  assert.equal(ed.agent("Cartero").floor, "tech");
});

test("Techie: check every other night, backup on Fridays, costs on Mondays (only then it spends)", async () => {
  const nowRef = { t: Date.parse("2026-11-04T03:00:00") };   // Wednesday
  const backups = [];
  const { ed, calls } = create((url, b) => resp("Compensa el jefe; el Redactor no: bájale el latido."), nowRef);
  ed.o.backup = async (json, day) => { backups.push(day); };
  await withTeam(ed);
  const red = ed.agent("Redactor");
  red.heartbeat = { every: 1, unit: "h" }; red.last = nowRef.t - 5 * 3600e3;
  ed.e.longMemory.push({ id: "m1", ts: 1, text: "El wifi es Casa24" }, { id: "m2", ts: 2, text: "el  wifi es casa24" });
  const techie = ed.agent("Tecno");
  let r = await ed.techieRound(techie);
  assert.equal(calls.length, 0, "on a Wednesday the round doesn't spend");
  assert.ok(r.warnings.some((x) => /Redactor no deja señal/.test(x)), "it flags the one that doesn't work");
  assert.equal(ed.e.longMemory.length, 1, "quita recuerdos repetidos");
  assert.ok(ed.e.conversation.some((m) => m.role === "report" && m.name === "Tecno"), "the warnings reach the boss");
  nowRef.t = Date.parse("2026-11-06T03:00:00");   // Friday
  red.last = nowRef.t - 600e3;
  r = await ed.techieRound(techie);
  assert.deepEqual(backups, ["2026-11-06"]);
  assert.ok(!r.warnings.length, "check in order: " + r.warnings.join(" | "));
  ed.recordSpending(red, 0.02);
  nowRef.t = Date.parse("2026-11-09T03:00:00");   // Monday
  r = await ed.techieRound(techie);
  assert.equal(calls.length, 1, "on Mondays it judges whether it pays off (one call)");
  assert.match(r.text, /Costes de los últimos 7 días/);
  assert.match(r.text, /bájale el latido/);
});

test("Techie wakes up with its heartbeat and, if it's given something, it does it like anyone", async () => {
  const nowRef = { t: Date.parse("2026-11-04T10:00:00") };
  const { ed, calls } = create((url, b) => String(b.messages[0].content).includes("el control externo") ? resp('{"verdict":"ok"}') : resp("Hecho: ficha revisada."), nowRef);
  await ed.start("basic");
  for (const a of ed.e.agents) a.next = 9e15;
  const techie = ed.agent("Tecno"); techie.next = 0;
  await ed.tick();
  assert.ok(techie.last > 0 && calls.length === 0);
  ed.assignTask(techie, "Revisa la ficha de Arturito", "boss", true);
  const r = await ed.wakeUp("techie");
  assert.equal(r.outcome, "done");
});

test("a version 4 building moves to 5 without losing anything of yours, and it's saved as it was first", async () => {
  const v4 = { version: "4.0", nombre: "Mi casa", plantilla: "particular", ajustes: { topeDiario: 3, topeMensual: 40 },
    plantas: [{ id: "direccion", nombre: "Dirección", tipo: "direccion" }, { id: "investigacion", nombre: "Investigación", tipo: "equipo" }, { id: "p1", nombre: "Ventas", tipo: "equipo" }, { id: "control", nombre: "Control", tipo: "control" }],
    agentes: [{ id: "jefe", nombre: "Fer", rol: "jefe", planta: "direccion", cerebro: "openai/gpt-6-luna", cuerpo: "Eres mi jefe y hablas poco.", tareas: [{ id: "t", texto: "Pendiente del jefe", estado: "pendiente", creada: 1 }], gasto: { "2026-11-04": 0.3 } },
      { id: "je_investigacion", nombre: "Jefa de investigación", rol: "jefe_equipo", planta: "investigacion", cuerpo: "Diriges la búsqueda de información: repartes, revisas y resumes para el jefe." },
      { id: "x0", nombre: "Buscador", rol: "trabajador", planta: "investigacion", cuerpo: "Buscas información actual en internet y la resumes con sus fuentes." },
      { id: "x1", nombre: "Comercial Paco", rol: "trabajador", planta: "p1", cuerpo: "Llamas a clientes de Madrid.", tareas: [{ id: "t2", texto: "Llama a Pepe", estado: "pendiente", creada: 1 }], gasto: { "2026-11-04": 0.2 } },
      { id: "memory", nombre: "Memory", rol: "memory", planta: "control" }],
    memoriaLarga: [{ id: "m", ts: 1, texto: "Prefiero respuestas cortas" }], conversacion: [{ role: "user", content: "hola", ts: 1 }], registro: [], gastoDias: { "2026-11-04": 0.5 } };
  let saved = JSON.stringify(v4); const original = saved, backups = [];
  const ed = new Building({ load: async () => saved, save: async (j) => { saved = j; }, backup: async (j, day) => { backups.push([day, j]); }, key: () => "k", fetch: async () => ({}), now: () => Date.parse("2026-11-04T12:00:00") });
  ed.setModels(MODELS);
  await ed.start();
  assert.deepEqual(backups, [["before-v5", original]], "the version 4 building is saved as it was before rebuilding it");
  assert.deepEqual(ed.e.floors.map((p) => p.name), ["Cúpula", "Planta técnica", "Ventas", "Vestíbulo"], "the untouched example floor is removed; yours comes along");
  const sam = ed.agent("Comercial Paco");
  assert.ok(sam && sam.floor === "p1" && sam.role === "subagent" && sam.instructions === "Llamas a clientes de Madrid." && sam.tasks.length === 1, "your agent comes along with its instructions and its tasks");
  assert.ok(!ed.e.agents.some((a) => a.name === "Buscador" || a.name === "Jefa de investigación"));
  assert.equal(ed.boss().instructions, "Eres mi jefe y hablas poco.", "the instructions you gave the boss are kept");
  assert.equal(ed.boss().tasks.length, 1);
  assert.equal(ed.boss().brain, "openai/gpt-6-luna");
  assert.equal(ed.e.name, "Mi casa");
  assert.equal(ed.e.settings.dailyCap, 3);
  assert.equal(ed.e.longMemory.length, 1);
  assert.equal(ed.buildingSpending("today"), 0.5);
  const notice = ed.e.conversation.at(-1);
  assert.ok(notice.role === "report" && /Comercial Paco/.test(notice.content) && /Investigación/.test(notice.content) && /guardado aparte/.test(notice.content), "it tells you what comes along and what is removed: " + notice.content);
  assert.equal(JSON.parse(saved).version, VERSION);
});

test("review: odd data doesn't open the cap or break the building", async () => {
  const { ed } = create(() => resp("x"));
  await ed.start("basic");
  const today = "2026-11-04";
  await ed.run({ type: "import", state: JSON.stringify({ agents: [{ id: "boss", role: "boss", name: "", look: { p: "constructor" }, capabilities: ["write", "payments"] }], floors: [{ id: "dome" }], spendingDays: { [today]: "0.5" }, settings: { dailyCap: 1 } }) });
  assert.equal(ed.boss().look.p, "boy", "a character that doesn't exist goes back to “chico”");
  assert.deepEqual(ed.boss().capabilities.filter((c) => !["speak", "hear"].includes(c)), ["write"], "the advanced capabilities can't be turned on, not even through a backup");
  assert.ok(ed.boss().name.length > 0);
  assert.equal(ed.buildingSpending("today"), 0.5, "spending saved as text counts as a number");
  ed.e.spendingDays[today] = NaN;
  assert.equal(ed.budgetUsage(), 1, "if the spending doesn't add up, the cap is considered reached");
  const before = JSON.stringify(ed.e), repair = ed.repair;
  ed.repair = function () { ed.repair = repair; throw new Error("rota"); };
  await assert.rejects(() => ed.run({ type: "import", state: JSON.stringify({ agents: [] }) }), /dañada/);
  assert.equal(JSON.stringify(ed.e), before, "if a backup can't be loaded, your building stays as it was");
});

test("review: the actions go to the exact agent, the name isn't left empty and the boss stays in the dome", async () => {
  const { ed } = create(() => resp("x"));
  await ed.start("basic");
  const { id } = await ed.run({ type: "createFloor", name: "Soporte" });
  await ed.run({ type: "createAgent", profile: { name: "Tec", floor: id } });
  await ed.run({ type: "deleteAgent", id: "techie" });
  await assert.rejects(() => ed.run({ type: "deleteAgent", id: "techie" }), /No existe/);
  assert.ok(ed.agent("Tec"), "an old id doesn't delete another that looks like it");
  await ed.run({ type: "editAgent", id: "artie", changes: { name: "   " } });
  assert.equal(ed.agent("artie").name, "Arturito");
  await ed.run({ type: "editAgent", id: "boss", changes: { floor: id, seat: "center" } });
  assert.equal(ed.boss().floor, "dome");
});

test("review: the Creator's proposal says when it wakes up and what it spends", async () => {
  const { ed } = create((url, b) => String(b.messages[0].content).startsWith("Eres el Creador de agentes")
    ? resp('{"name":"Vigía","role":"subagent","floor":"tech","seat":"office","instructions":"Vigilas todo.","level":"high","heartbeat":{"every":1,"unit":"min"},"onWake":"objective","capabilities":["search"],"why":"gastará casi nada"}')
    : resp("x"));
  await ed.start("basic");
  const r = await ed.creatorWork(ed.agent("creator"), { text: "uno que vigile", from: "boss", implicit: true });
  assert.match(r.text, /Despierta cada minuto y cada vez avanza en su objetivo \(gasta en cada latido\)/);
  assert.match(r.text, /claude-sonnet-5\.5 \(alto\)/);
  assert.match(r.text, /Internet como tú/);
  const pr = ed.e.proposals.at(-1);
  await ed.run({ type: "deleteFloor", id: "tech" }).catch(() => {});
  ed.e.floors = ed.e.floors.filter((p) => p.id !== "tech");
  await assert.rejects(() => ed.run({ type: "acceptProposal", proposal: pr.id }), /ya no existe/);
});

test("the built-in agents can be deleted and put back", async () => {
  const { ed } = create(() => resp("x"));
  await ed.start("basic");
  await ed.run({ type: "deleteAgent", id: "artie" });
  await ed.run({ type: "deleteAgent", id: "memory" });
  assert.ok(!ed.agent("Arturito") && !ed.agent("Memory"));
  const r = await ed.run({ type: "restoreBuiltIn" });
  assert.deepEqual(r.returned.sort(), ["Arturito", "Memory"]);
  assert.deepEqual(r.noRoom, []);
  assert.equal(seating(ed.e, "lobby").reception[0].name, "Memory");
  await ed.run({ type: "template", name: "empty" });
  assert.deepEqual(ed.e.agents.map((a) => a.name).sort(), ["Jefe"], "empty: only the boss (memory works without Memory)");
  assert.deepEqual(ed.e.floors.map((p) => p.type), ["dome", "lobby"]);
});

// ---------- Version 6 ----------
test("coins: the gold or the red one becomes a lesson for its role; 5 per role (changed in Settings) and pinned ones don't go", async () => {
  let lastSystem = "";
  const { ed } = create((url, b) => { if (b.messages) lastSystem = String(b.messages[0].content); return resp("ok"); });
  await withTeam(ed);
  const red = ed.agent("Redactor"), bus = ed.agent("Buscador");
  await assert.rejects(() => ed.run({ type: "coin.give", id: red.id, coinType: "gold", reason: "  " }), /motivo/);
  await ed.run({ type: "coin.give", id: red.id, coinType: "gold", reason: "Resumen claro y con fuentes" });
  await ed.run({ type: "coin.give", id: red.id, coinType: "red", reason: "Se inventó una cifra" });
  assert.equal(ed.lessonsOf("subagent").length, 0, "v7: the lesson waits for your yes");
  await approveLessons(ed);
  assert.deepEqual(ed.lessonsOf("subagent").map((l) => l.text), ["Hazlo así: Resumen claro y con fuentes", "No lo hagas: Se inventó una cifra"]);
  ed.assignTask(bus, "Algo", "", true);
  await ed.wakeUp(bus.id);
  assert.match(lastSystem, /Lecciones que has aprendido:/, "another agent with the same role sees them (approved without choosing: for its role, as before 9.1)");
  assert.match(lastSystem, /No lo hagas: Se inventó una cifra/);
  const first = ed.lessonsOf("subagent")[0];
  await ed.run({ type: "lesson.pin", lesson: first.id, fixed: true });
  for (let i = 1; i <= 6; i++) { await ed.run({ type: "coin.give", id: bus.id, coinType: "gold", reason: "Bien " + i }); await approveLessons(ed); }
  const ls = ed.lessonsOf("subagent");
  assert.equal(ls.filter((l) => !l.fixed).length, 5, "5 per role, not counting the pinned ones");
  assert.equal(ls.length, 6, "the 5 and the pinned one");
  assert.ok(ls.some((l) => l.id === first.id), "the pinned one doesn't go even if it's the oldest");
  assert.ok(!ls.some((l) => l.text.endsWith("Se inventó una cifra")), "the oldest unpinned one goes");
  await ed.run({ type: "settings", changes: { lessonsPerRole: 2 } });
  assert.equal(ed.lessonsOf("subagent").length, 3, "2 and the pinned one");
  for (let i = 0; i < 5; i++) { const l = ed.lessonsOf("subagent").find((x) => !x.fixed); if (l) await ed.run({ type: "lesson.pin", lesson: l.id, fixed: true }); }
  await ed.run({ type: "coin.give", id: bus.id, coinType: "gold", reason: "Nueva tras fijar" });
  await approveLessons(ed);
  assert.ok(ed.lessonsOf("subagent").some((l) => l.text.endsWith("Nueva tras fijar")), "even if they're all pinned, the new one gets in");
  assert.equal(ed.lessonsOf("boss").length, 0, "lessons belong to their role, not to everyone");
});

test("the Controller proposes a red coin for whoever reaches their cap; you confirm it or dismiss it", async () => {
  const { ed } = create(() => resp("x"));
  await withTeam(ed);
  const red = ed.agent("Redactor"); red.dailyCap = 0.01;
  ed.recordSpending(red, 0.02); ed.applyBudget();
  const m = ed.e.coins.find((x) => x.proposedBy === "controller");
  assert.ok(m && m.type === "red" && m.state === "proposed" && m.agent === red.id);
  assert.equal(ed.lessonsOf("subagent").length, 0, "proposal: it isn't a lesson yet");
  await ed.run({ type: "coin.confirm", coin: m.id });
  await approveLessons(ed);
  assert.equal(ed.lessonsOf("subagent").length, 1);
  ed.applyBudget();
  assert.equal(ed.e.coins.filter((x) => x.proposedBy === "controller").length, 1, "it doesn't repeat it the same day");
});

test("each agent has its own chat, with its brain and its instructions", async () => {
  const { ed, calls } = create((url, b) => resp("Soy " + (String(b.messages[0].content).startsWith("Eres Tecno") ? "Tecno" : "other")));
  await ed.start("basic");
  const r = await ed.run({ type: "speak", agent: "techie", text: "¿Qué tal las copias?" });
  assert.equal(r.reply, "Soy Tecno");
  assert.equal(r.agent, "techie");
  assert.equal(calls.at(-1).body.model, ed.agent("techie").brain);
  assert.equal(ed.agent("techie").chat.length, 2);
  assert.equal(ed.e.conversation.length, 0, "it doesn't get mixed with the boss's chat");
  assert.ok((calls.at(-1).body.tools || []).some((t) => t.function.name === "assign_task"), "9.1: any agent can hand work to another one (not only the boss)");
  await assert.rejects(() => ed.run({ type: "speak", agent: "memory", text: "hola" }), /sin cerebro/);
  await ed.run({ type: "conversation.new", id: "techie" });
  assert.equal(ed.agent("techie").chat.length, 0);
});

test("meeting rooms: up to 10 at the table, agenda, the boss chairs, rounds and minutes", async () => {
  const { ed, calls } = create((url, b) => {
    const u = String(b.messages.at(-1).content);
    if (u.includes("Escribe el acta")) return resp("## Conclusiones\n- Vamos bien\n## Decisiones\n- Seguir");
    return resp("Intervención");
  });
  await ed.start("basic");
  await assert.rejects(() => ed.run({ type: "meeting.call", title: "X", agenda: "", participants: ["techie"] }), /orden del día/);
  const many = ["sage1", "sage2", "techie", "artie", "creator", "jev", "controller", "memory"];
  await ed.run({ type: "createFloor", name: "P" });
  for (let i = 0; i < 5; i++) await ed.run({ type: "createAgent", profile: { name: "Extra " + i, floor: ed.e.floors[1].id } });
  await assert.rejects(() => ed.run({ type: "meeting.call", title: "X", agenda: "Y", participants: [...many, "Extra 0", "Extra 1", "Extra 2", "Extra 3", "Extra 4"] }), /caben 10/);
  const without = await ed.run({ type: "meeting.call", title: "X", agenda: "Y", participants: ["jev", "controller", "memory", "techie"], rounds: 12 });
  const rs = ed.e.meetings.find((x) => x.id === without.id);
  assert.deepEqual(rs.participants, ["boss", "techie"], "JEV, the Controller and Memory don't sit down: they don't hold conversations");
  assert.equal(rs.rounds, 12, "the rounds have no invented cap");
  const { id, estimate } = await ed.run({ type: "meeting.call", title: "Plan de noviembre", agenda: "1. Gasto\n2. Mejoras", participants: ["techie", "artie"], rounds: 2 });
  assert.equal(estimate.calls, 2 * 2 + 2 + 1);
  await ed.holdMeeting(id);
  const r = ed.e.meetings.find((x) => x.id === id);
  assert.equal(r.state, "finished");
  assert.equal(r.contributions.length, 2 * (1 + 2), "per round: the boss chairs and both speak");
  assert.ok(r.contributions[0].chairs);
  assert.match(r.minutes, /## Conclusiones[\s\S]*## Decisiones/);
  assert.ok(ed.e.conversation.some((m) => m.meeting === id && /Acta de «Plan de noviembre»/.test(m.content)), "the minutes reach the boss's chat");
  assert.ok(r.cost > 0 && calls.length === 7);
});

test("the boss calls a meeting: it stays proposed until you confirm the rounds", async () => {
  const { ed } = create((url, b) => {
    const sys = String(b.messages[0].content);
    if (sys.startsWith("Eres el jefe del edificio") && !b.messages.some((m) => m.role === "tool") && b.tools) return resp("", { tool_calls: [{ id: "c1", type: "function", function: { name: "call_meeting", arguments: JSON.stringify({ title: "Costes", agenda: "Revisar el gasto", participants: ["Tecno", "Interventor"], rounds: 3 }) } }] });
    return resp("ok");
  });
  await ed.start("basic");
  const r = await ed.speak("Reúne a Tecno y al Interventor para hablar del gasto");
  assert.ok(r.events.includes("reunión propuesta"));
  const re = ed.e.meetings.at(-1);
  assert.equal(re.state, "proposed"); assert.equal(re.calledBy, "boss"); assert.equal(re.rounds, 3);
  assert.equal(ed.e.conversation.at(-1).meeting, re.id, "the chat shows the proposal to confirm it");
  await ed.run({ type: "meeting.start", meeting: re.id, rounds: 1 });
  await new Promise((res) => setTimeout(res, 50));
  assert.equal(re.rounds, 1);
  assert.equal(re.state, "finished");
});

test("models: they're classified by what they do; recommended per level; Artie proposes and you decide", async () => {
  const L = [
    { id: "a/texto", pricing: { prompt: "0.000001", completion: "0.000002" }, architecture: { output_modalities: ["text"] } },
    { id: "b/img", pricing: { prompt: "0.000001", completion: "0" }, architecture: { output_modalities: ["image", "text"] } },
    { id: "google/lyria-3-pro-preview", pricing: { prompt: "0.000002", completion: "0" }, architecture: { output_modalities: ["text", "audio"] } },
    { id: "c/voz", pricing: { prompt: "0.000001", completion: "0" }, architecture: { output_modalities: ["speech"] } },
    { id: "d/oido", pricing: { prompt: "0.000001", completion: "0" }, architecture: { output_modalities: ["transcription"] } },
    { id: "typesafe/jev-1.14", pricing: { prompt: "0.000000042", completion: "0" }, architecture: { output_modalities: ["decisions"] } },
    { id: "e/video", pricing: { prompt: "0.000001", completion: "0" }, architecture: { output_modalities: ["video"] } }];
  assert.deepEqual(L.map((m) => modelType(m)), ["text", "image", "music", "voice", "hearing", "decisions", "others"]);
  const rec = initialRecommended(L.map((m) => ({ id: m.id, inPrice: +m.pricing.prompt, outPrice: +m.pricing.completion, out: m.architecture.output_modalities })));
  assert.ok(rec.music && Object.values(rec.music).flat().includes("google/lyria-3-pro-preview"));
  const { ed } = create((url, b) => resp("Informe del día.\nRECOMMENDED: budget | text | openai/gpt-6-luna | Igual de bueno y más barato\nRECOMMENDED: high | text | no/existe | x"));
  await ed.start("basic");
  assert.ok(ed.e.settings.recommended && ed.e.settings.recommended.text, "starting recommendations");
  ed.e.seenModels = ed.e.seenModels.filter((x) => x !== "openai/gpt-6-luna");
  const art = ed.agent("artie");
  ed.assignTask(art, "Informe", "", true);
  await ed.wakeUp(art.id);
  const pm = ed.e.modelProposals;
  assert.equal(pm.length, 1, "only models that exist");
  await ed.run({ type: "model.accept", proposal: pm[0].id });
  assert.equal(ed.e.settings.recommended.text.budget[0], "openai/gpt-6-luna");
  assert.ok(ed.e.seenModels.includes("openai/gpt-6-luna"));
});

test("create music: the agent's music model; the audio arrives in parts", async () => {
  const sse = ['data: {"choices":[{"delta":{"audio":{"data":"QUJD","format":"mp3"}}}]}', 'data: {"choices":[{"delta":{"audio":{"data":"REVG"}}}],"usage":{"cost":0.03}}', "data: [DONE]"].join("\n");
  const { ed, calls } = create(() => ({ text: sse, json: {} }));
  await ed.start("basic");
  const j = ed.boss(); j.musicModel = "google/lyria-3-pro-preview";
  const m = await ed.createMusic(j, "Música alegre para un vídeo");
  assert.equal(m.url, "data:audio/mpeg;base64,QUJDREVG");
  assert.equal(calls.at(-1).body.model, "google/lyria-3-pro-preview");
  assert.deepEqual(calls.at(-1).body.modalities, ["text", "audio"]);
  assert.equal(ed.agentSpending(j, "today"), 0.03);
});

test("the Creator, when the boss gives it the job, asks JEV first", async () => {
  const { ed, calls } = create((url) => (url === DECISIONS ? jevSays("stop") : resp('{"name":"X"}')));
  await ed.start("basic");
  const cr = ed.agent("creator");
  ed.assignTask(cr, "Un agente para el correo", "boss", true);
  const r = await ed.wakeUp(cr.id);
  assert.equal(r.outcome, "stopped");
  assert.equal(ed.e.jevQueries.at(-1).type, "create_agent");
  assert.equal(calls.filter((l) => l.url !== DECISIONS).length, 0, "it doesn't spend on designing it");
  assert.match(ed.e.conversation.at(-1).content, /JEV dice/);
});

test("a version 5 building moves to 6: the higher brain goes and JEV decides with Jev", async () => {
  const { ed } = create(() => resp("x"));
  await ed.start("basic");
  const v5 = JSON.parse(JSON.stringify(ed.e));
  v5.version = "5.0";
  for (const a of v5.agents) a.higherBrain = "anthropic/claude-sonnet-5.5";
  const jev = v5.agents.find((a) => a.role === "jev");
  jev.brain = "openai/gpt-6-luna"; jev.instructions = "Eres JEV, el control externo. Revisas el trabajo de los demás antes de darlo por bueno: que no invente datos sin fuente, que no repita trabajo ya hecho y que no gaste en algo innecesario. Eres estricto pero justo.";
  delete v5.coins; delete v5.meetings;
  await ed.run({ type: "import", state: JSON.stringify(v5) });
  assert.ok(!ed.e.agents.some((a) => "higherBrain" in a));
  assert.equal(ed.agent("jev").brain, JEV_MODEL);
  assert.match(ed.agent("jev").instructions, /seguir, aprovechar lo que ya hay, parar o preguntar al jefe/);
  assert.ok(Array.isArray(ed.e.coins) && Array.isArray(ed.e.meetings));
});

test("v6 review: a variable price (-1) is never “free” or recommended; music with no reported cost is charged per request", async () => {
  const auto = { id: "openrouter/auto", pricing: { prompt: "-1", completion: "-1" }, architecture: { output_modalities: ["text"] } };
  assert.equal(priceLevel(auto), "variable");
  const rec = initialRecommended([auto, { id: "a/gratis:free", pricing: { prompt: "0", completion: "0" }, architecture: { output_modalities: ["text"] } }]);
  assert.ok(!Object.values(rec.text || {}).flat().includes("openrouter/auto"));
  const lyria = { id: "google/lyria-3-clip-preview", pricing: { prompt: "0", completion: "0", request: "0.04" }, architecture: { output_modalities: ["text", "audio"] } };
  assert.equal(priceLevel(lyria), "mid", "it's charged per song, it isn't free");
  const sse = 'data: {"choices":[{"delta":{"audio":{"data":"AAAA","format":"mp3"}}}]}\n\ndata: [DONE]\n\n';
  const { ed } = create((url) => ({ status: 200, text: sse }));
  ed.setModels([...MODELS, lyria]);
  await ed.start("basic");
  ed.e.settings.musicModel = lyria.id;
  const r = await ed.createMusic(ed.boss(), "Una sintonía");
  assert.equal(r.cost, 0.04, "no cost in the reply: the price per request");
  const { ed: ed2 } = create(() => ({ status: 200, text: 'data: {"error":{"code":402,"message":"sin crédito"}}\n\n' }));
  ed2.setModels([...MODELS, lyria]); await ed2.start("basic"); ed2.e.settings.musicModel = lyria.id;
  await assert.rejects(() => ed2.createMusic(ed2.boss(), "x"), (e) => !/no devolvió audio/.test(e.message), "an error halfway is counted as it is");
});

// v9: the engine is written in English; everything it said in these Spanish buildings was in languages/es.js
test("v9: everything the engine said in Spanish was in the dictionary", () => {
  assert.deepEqual([...UNTRANSLATED].filter((x) => !["min", "h"].includes(x)), []);
});

test("9.1: priority 1 is the most important; a building from before is turned round when loaded, each agent keeping its place", async () => {
  const first = create(() => resp("x"));
  await withTeam(first.ed);
  assert.equal(first.ed.boss().priority, 1, "the boss: the most important");
  const old = JSON.parse(JSON.stringify(first.ed.e));
  delete old.priorityOneFirst;
  for (const a of old.agents) a.priority = a.role === "boss" ? 5 : a.name === "Redactor" ? 2 : 3;   // as 9.0 saved them (5 = most important)
  const load = (json) => { const b = new Building({ load: async () => json, save: async () => {}, key: () => "sk-or-test", fetch: async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({}) }) }); b.setModels(MODELS); return b; };
  const ed = load(JSON.stringify(old));
  await ed.start();
  assert.equal(ed.boss().priority, 1);
  assert.equal(ed.agent("Redactor").priority, 4);
  assert.equal(ed.e.priorityOneFirst, true);
  const ed2 = load(JSON.stringify(ed.e));
  await ed2.start();
  assert.equal(ed2.agent("Redactor").priority, 4, "only once");
});
