// Version 9: the automatic memory. When a conversation goes quiet, Memory files what matters in it (a cheap model),
// each fact under its topic, and says where it came from. No network: a simulated OpenRouter.
import test from "node:test";
import assert from "node:assert/strict";
import { Building, memoryFacts } from "../engine.js";

const MODELS = [
  { id: "anthropic/claude-sonnet-5.5", name: "Claude Sonnet 5.5", pricing: { prompt: "0.000002", completion: "0.00001" }, architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] }, context_length: 200000 },
  { id: "openai/gpt-6-luna", name: "GPT 6 Luna", pricing: { prompt: "0.0000001", completion: "0.0000005" }, architecture: { input_modalities: ["text"], output_modalities: ["text"] }, context_length: 128000 }
];
const MIN = 60e3;
const isMemory = (body) => /^(You are|Eres) Memory/.test(String((body.messages && body.messages[0] && body.messages[0].content) || ""));

function create({ facts = { facts: [] }, fail = false, saved = null, jev = [] } = {}) {
  const calls = [], memoryCalls = [], jevCalls = [], clock = { t: Date.parse("2026-11-06T10:00:00") };
  let store = saved;
  const reply = (content, cost) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ model: "m", choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 20, cost } }) });
  const fetch = async (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : {};
    calls.push(body);
    if (body.questions) {   // JEV (OpenRouter's decisions API): the answers given in order
      jevCalls.push(body);
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ answers: { decision: { choice: jev[jevCalls.length - 1] || "go_ahead" } }, usage: { cost: 0.00002 } }) };
    }
    if (isMemory(body)) {
      memoryCalls.push(body);
      if (fail) throw new Error("network down");
      return reply(typeof facts === "string" ? facts : JSON.stringify(facts), 0.0001);
    }
    return reply("Noted.", 0.001);
  };
  const ed = new Building({ load: async () => store, save: async (j) => { store = j; }, key: () => "sk-or-test", fetch, now: () => clock.t });
  ed.setModels(MODELS);
  return { ed, calls, memoryCalls, jevCalls, clock, saved: () => store };
}

test("a conversation that goes quiet is filed: each fact under its topic, with where it came from; it works with the pause on", async () => {
  const { ed, memoryCalls, clock } = create({ facts: { facts: [
    { topic: "Acme", text: "Acme wants the proposal by Friday 14 November 2026.", tags: ["client"] },
    { topic: "Ana Ruiz", text: "Ana Ruiz is the contact at Acme (ana@acme.example).", tags: [] }] } });
  await ed.start("empty", "en");
  assert.equal(ed.e.settings.pause, true, "the building starts paused");
  assert.equal(ed.e.settings.autoMemory, true, "the automatic memory comes on");
  await ed.speak("My client Acme wants the proposal by Friday 14 November. The contact is Ana Ruiz, ana@acme.example.");
  clock.t += 5 * MIN; await ed.tick();
  assert.equal(memoryCalls.length, 0, "while the conversation goes on, nothing is filed");
  clock.t += 6 * MIN; await ed.tick();
  assert.equal(memoryCalls.length, 1, "10 minutes of quiet: Memory files it");
  const sent = memoryCalls[0].messages[1].content;
  assert.match(sent, /Conversation with Boss/); assert.match(sent, /Owner: My client Acme/); assert.match(sent, /Boss: Noted\./);
  assert.equal(memoryCalls[0].model, "openai/gpt-6-luna", "with the cheapest model that will do");
  const boss = ed.boss(), mem = ed.agent("memory");
  assert.deepEqual(ed.e.longMemory.map((n) => [n.topic, n.text]), [
    ["Acme", "Acme wants the proposal by Friday 14 November 2026. (chat with Boss)"],
    ["Ana Ruiz", "Ana Ruiz is the contact at Acme (ana@acme.example). (chat with Boss)"]]);
  assert.ok(ed.e.longMemory.every((n) => n.author === (mem ? mem.id : "")), "written by Memory");
  assert.ok(ed.e.log.some((l) => l.agent === boss.id && /memory: filing the conversation/.test(l.text) && l.cost === 0.0001), "the boss, who was talked to, pays for it");
  assert.equal(boss.memoryUpTo, ed.e.conversation.at(-1).ts);
  clock.t += 30 * MIN; await ed.tick();
  assert.equal(memoryCalls.length, 1, "what's filed isn't filed again");
});

test("an existing topic is reused even if the model writes it differently; what's already known is passed so it isn't repeated", async () => {
  const { ed, memoryCalls, clock } = create({ facts: { facts: [{ topic: "clientes epsa", text: "EPSA quiere la propuesta de formación en enero." }] } });
  await ed.start("empty", "es");
  ed.saveMemory("EPSA es una empresa de formación de Madrid.", [], "you", "Clientes EPSA");
  await ed.speak("EPSA quiere la propuesta de formación en enero.");
  clock.t += 11 * MIN; await ed.tick();
  assert.equal(memoryCalls.length, 1);
  assert.match(memoryCalls[0].messages[0].content, /^Eres Memory/, "in the building's language");
  assert.match(memoryCalls[0].messages[1].content, /Temas que ya hay: Clientes EPSA/);
  assert.match(memoryCalls[0].messages[1].content, /EPSA es una empresa de formación de Madrid/, "what Memory already has on it");
  assert.deepEqual(ed.e.longMemory.map((n) => n.topic), ["Clientes EPSA", "Clientes EPSA"]);
  assert.match(ed.e.longMemory[1].text, /\(chat con Jefe\)$/, "where it came from, in Spanish");
});

test("a long conversation is filed every 20 messages; switched off, nothing is filed", async () => {
  const { ed, memoryCalls, clock } = create({ facts: { facts: [] } });
  await ed.start("empty", "en");
  for (let i = 0; i < 10; i++) { await ed.speak("Point " + i); clock.t += MIN; }
  await ed.tick();
  assert.equal(memoryCalls.length, 1, "20 messages: filed without waiting for the quiet");
  ed.e.settings.autoMemory = false;
  await ed.speak("One more thing."); clock.t += 60 * MIN; await ed.tick();
  assert.equal(memoryCalls.length, 1, "switched off in Settings: nothing");
});

test("an answer that can't be read saves nothing and isn't paid for twice; a network failure is tried again later", async () => {
  const bad = create({ facts: "I could not do it, sorry." });
  await bad.ed.start("empty", "en");
  await bad.ed.speak("Remember that the meeting is on Monday."); bad.clock.t += 11 * MIN; await bad.ed.tick(); bad.clock.t += 11 * MIN; await bad.ed.tick();
  assert.equal(bad.memoryCalls.length, 1); assert.equal(bad.ed.e.longMemory.length, 0);
  const down = create({ fail: true });
  await down.ed.start("empty", "en");
  await down.ed.speak("The supplier is Hierros Norte."); down.clock.t += 11 * MIN;
  await down.ed.tick(); await down.ed.tick();
  assert.equal(down.memoryCalls.length, 1, "after a failure it waits before trying again");
  assert.ok(down.ed.e.log.some((l) => /couldn't file the chat with Boss: network down/.test(l.text)));
  down.clock.t += 11 * MIN; await down.ed.tick();
  assert.equal(down.memoryCalls.length, 2, "and then it tries again: nothing is lost");
});

test("a building from before the automatic memory: only what's said from now on is filed, not its whole past", async () => {
  const first = create();
  await first.ed.start("empty", "en");
  await first.ed.speak("An old conversation.");
  const old = JSON.parse(first.saved());
  for (const a of old.agents) delete a.memoryUpTo;
  const { ed, memoryCalls, clock } = create({ saved: JSON.stringify(old) });
  clock.t += 60 * MIN;
  await ed.start();
  await ed.tick();
  assert.equal(memoryCalls.length, 0, "the past chat isn't sent to the model");
  await ed.speak("Something new."); clock.t += 11 * MIN; await ed.tick();
  assert.equal(memoryCalls.length, 1);
  assert.doesNotMatch(memoryCalls[0].messages[1].content, /An old conversation/);
});

test("what the model answers is read in any of its usual shapes", () => {
  assert.deepEqual(memoryFacts('```json\n{"facts": [{"topic": "A", "text": "x"}]}\n```'), [{ topic: "A", text: "x" }]);
  assert.deepEqual(memoryFacts('[{"topic": "A", "text": "x"}]'), [{ topic: "A", text: "x" }]);
  assert.deepEqual(memoryFacts("Here you are: {\"facts\": []}"), []);
  assert.deepEqual(memoryFacts("nothing"), []);
});

test("with JEV in the building, JEV decides first: small talk isn't filed and costs nothing more; something useful is", async () => {
  const { ed, memoryCalls, jevCalls, clock } = create({ jev: ["stop", "go_ahead"], facts: { facts: [{ topic: "Hierros Norte", text: "Hierros Norte delivers the steel on Thursday 12 November 2026." }] } });
  await ed.start("basic", "en");
  assert.ok(ed.agent("jev") && ed.agent("memory"), "the recommended team has JEV and Memory");
  await ed.speak("Hello! How are you?"); clock.t += 11 * MIN; await ed.tick();
  assert.equal(jevCalls.length, 1, "Memory asks JEV first");
  assert.match(jevCalls[0].state.join("\n"), /File in the long-term memory what matters from the chat with Boss/);
  assert.match(jevCalls[0].state.join("\n"), /What was said:\nOwner: Hello! How are you\?/, "JEV reads what was said");
  assert.equal(memoryCalls.length, 0, "JEV says stop: nothing is filed and the cheap model isn't paid for");
  assert.ok(ed.e.log.some((l) => l.agent === "memory" && /didn't file the chat with Boss: JEV says “stop”/.test(l.text)));
  assert.equal(ed.e.jevQueries.at(-1).did, "not filed");
  await ed.speak("Hierros Norte delivers the steel on Thursday."); clock.t += 11 * MIN; await ed.tick();
  assert.equal(jevCalls.length, 2); assert.equal(memoryCalls.length, 1, "JEV says go ahead: it's filed");
  assert.doesNotMatch(memoryCalls[0].messages[1].content, /Hello! How are you/, "what JEV turned down isn't sent again");
  assert.equal(ed.e.longMemory.at(-1).topic, "Hierros Norte");
  assert.equal(ed.e.jevQueries.at(-1).did, "filed 1 fact");
});
