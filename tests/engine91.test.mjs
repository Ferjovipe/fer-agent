// Version 9.1 (first round of Fer's list): what an agent does on waking up is seen in its own chat; «Wake up now» always does
// something useful; an overloaded brain is tried again quietly; «start from scratch»; the Creator designs from its chat;
// the meeting room without word limits. No network: a simulated OpenRouter.
import test from "node:test";
import assert from "node:assert/strict";
import { Building } from "../engine.js";

const MODELS = [
  { id: "anthropic/claude-sonnet-5.5", name: "Claude Sonnet 5.5", pricing: { prompt: "0.000002", completion: "0.00001" }, architecture: { input_modalities: ["text"], output_modalities: ["text"] }, context_length: 200000 },
  { id: "openai/gpt-6-luna", name: "GPT 6 Luna", pricing: { prompt: "0.0000001", completion: "0.0000005" }, architecture: { input_modalities: ["text"], output_modalities: ["text"] }, context_length: 128000 }
];
const ok = (msg, cost = 0.0002) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ model: "m", choices: [{ message: msg }], usage: { cost } }) });
function create(answer) {
  const calls = [], clock = { t: Date.parse("2026-11-07T10:00:00") };
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body); calls.push(body);
    if (!body.messages) return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ answers: { decision: { choice: "go_ahead" } }, usage: { cost: 0.00001 } }) };   // JEV
    return answer(body, calls);
  };
  const ed = new Building({ load: async () => null, save: async () => {}, key: () => "sk-or-test", fetch, now: () => clock.t });
  ed.setModels(MODELS);
  return { ed, calls, clock };
}
const sysOf = (b) => String((b.messages && b.messages[0] && b.messages[0].content) || "");
const lastOf = (b) => String((b.messages && b.messages.at(-1) && b.messages.at(-1).content) || "");

async function withGemma(ed, extra = {}) {
  await ed.start("basic", "en");
  ed.e.settings.pause = false;
  const r = await ed.run({ type: "createAgent", profile: Object.assign({ name: "Gemma", role: "subagent", floor: "tech", seat: "office", brain: "openai/gpt-6-luna",
    instructions: "Every time you wake up, write a friendly greeting.", objective: "Greet every minute.", heartbeat: { every: 1, unit: "min" }, onWake: "objective", capabilities: ["write"] }, extra) });
  const g = ed.agent(r.id);
  g.reportsTo = ed.boss().id;   // as in Fer's test: «Reports to: Boss»
  return g;
}

test("what an agent does on waking up is also seen in its own chat (and Memory doesn't file it twice)", async () => {
  const { ed, clock } = create((b) => ok({ content: /Gemma/.test(sysOf(b)) ? "Hello! Have a lovely day." : "Noted." }));
  const g = await withGemma(ed);
  g.next = 0; await ed.tick();
  const own = ed.chatOf(g).filter((m) => m.role === "report");
  assert.equal(own.length, 1, "in its own chat");
  assert.match(own[0].content, /Hello! Have a lovely day\./);
  assert.ok(own[0].own && !own[0].task, "marked as its own work on waking up");
  assert.ok(ed.e.conversation.some((m) => m.role === "report" && m.agent === g.id), "and, as before, in the chat of whoever it reports to");
  assert.equal(ed.unfiled(g).length, 0, "the automatic memory files it from the boss's chat, not twice");
  clock.t += 61e3; await ed.tick();
  assert.equal(ed.chatOf(g).filter((m) => m.role === "report").length, 2, "a minute later, another one");
});

test("«Wake up now» with no tasks takes a step towards its objective even if it only does tasks on its heartbeat; without an objective it says it had nothing", async () => {
  const { ed } = create((b) => ok({ content: /Lola/.test(sysOf(b)) ? "Step done: list of three suppliers." : "Noted." }));
  await ed.start("basic", "en");
  const r = await ed.run({ type: "createAgent", profile: { name: "Lola", role: "subagent", floor: "tech", seat: "office", brain: "openai/gpt-6-luna", instructions: "You look for suppliers.",
    objective: "Find suppliers of steel.", heartbeat: { every: 1, unit: "on_request" }, onWake: "tasks", capabilities: ["write"] } });
  const res = await ed.run({ type: "wakeUp", id: r.id });
  assert.equal(res.outcome, "done");
  assert.match(ed.chatOf(ed.agent(r.id)).at(-1).content, /three suppliers/);
  const r2 = await ed.run({ type: "createAgent", profile: { name: "Pepe", role: "subagent", floor: "tech", seat: "office", brain: "openai/gpt-6-luna", instructions: "You help.", objective: "",
    heartbeat: { every: 1, unit: "on_request" }, onWake: "tasks", capabilities: ["write"] } });
  assert.equal((await ed.run({ type: "wakeUp", id: r2.id })).outcome, "nothing");
});

test("an overloaded brain (429) isn't a failure: it's tried again in two minutes, quietly, and works when it can", async () => {
  let busy = true;
  const { ed, clock } = create((b) => {
    if (/Gemma/.test(sysOf(b)) && busy) return { ok: false, status: 429, headers: { get: () => null }, json: async () => ({ error: { message: "Rate limit exceeded: free-models-per-min" } }) };
    return ok({ content: /Gemma/.test(sysOf(b)) ? "Hello again!" : "Noted." });
  });
  const g = await withGemma(ed);
  g.next = 0; await ed.tick();
  assert.equal(ed.e.log.filter((l) => l.agent === g.id && /overloaded/.test(l.text)).length, 1, "said once, in plain words");
  assert.ok(!ed.e.log.some((l) => l.agent === g.id && /^error/.test(l.text)), "not as an error");
  assert.ok(g.next - clock.t >= 2 * 60e3 - 1, "tries again in two minutes");
  clock.t += 61e3; await ed.tick();
  assert.equal(ed.chatOf(g).filter((m) => m.role === "report").length, 0, "not before");
  clock.t += 60e3; await ed.tick();
  assert.equal(ed.e.log.filter((l) => l.agent === g.id && /overloaded/.test(l.text)).length, 1, "it doesn't fill the activity with the same notice");
  busy = false; clock.t += 121e3; await ed.tick();
  assert.match(ed.chatOf(g).filter((m) => m.role === "report").at(-1).content, /Hello again!/);
});

test("«start from scratch»: its conversation and short memory go; the long-term memory stays", async () => {
  const { ed } = create(() => ok({ content: "Once upon a time…" }));
  const g = await withGemma(ed);
  await ed.speak("Write a story.", { agent: g.id });
  ed.saveMemory("Acme wants the proposal on Friday.", [], "you", "Acme");
  assert.ok(ed.chatOf(g).length && g.shortMemory.length);
  await ed.run({ type: "conversation.new", id: g.id, alsoShort: true });
  assert.equal(ed.chatOf(g).length, 0); assert.equal(g.shortMemory.length, 0);
  assert.equal(ed.e.longMemory.length, 1);
});

test("the Creator designs, from its own chat, the agent you ask it for: the proposal comes with its buttons and nothing is created without your yes", async () => {
  const design = { name: "Redactor 1", role: "subagent", floor: "tech", seat: "office", instructions: "You write fiction in Spanish.", objective: "Write stories.", personality: "A mad genius.",
    level: "budget", heartbeat: { every: 1, unit: "on_request" }, onWake: "tasks", capabilities: ["write"], look: { p: "boy" }, why: "A writer, only when asked." };
  const { ed, calls } = create((b) => {
    if (/Reply ONLY with a JSON object/.test(sysOf(b))) return ok({ content: JSON.stringify(design) });
    if (b.messages.at(-1).role === "tool") return ok({ content: "Done: it's waiting for your yes below." });
    if (/Create a writer/.test(lastOf(b))) return ok({ content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "design_agent", arguments: JSON.stringify({ request: "A fiction writer called Redactor 1 on the Redactores floor, only when asked." }) } }] });
    return ok({ content: "Noted." });
  });
  await ed.start("basic", "en");
  const c = ed.byRoleList("creator")[0];
  const before = ed.e.agents.length;
  await ed.speak("Create a writer called Redactor 1.", { agent: c.id });
  const chatBody = calls.find((b) => b.tools && b.tools.some((t) => t.function.name === "design_agent"));
  assert.ok(chatBody, "the Creator has the tool in its chat");
  const card = ed.chatOf(c).find((m) => m.role === "report" && m.proposal);
  assert.ok(card, "the proposal, in its chat, with its buttons");
  assert.match(card.content, /Redactor 1/);
  assert.equal(ed.e.agents.length, before, "nothing created yet");
  await ed.run({ type: "acceptProposal", proposal: card.proposal });
  assert.ok(ed.agent("Redactor 1"), "created with your yes");
});

test("the meeting room: no word limit for each one, and everyone reads everything that was said", async () => {
  const long = "word ".repeat(400).trim();
  const { ed, calls } = create((b) => ok({ content: /minutes in Markdown/.test(lastOf(b)) ? "## Conclusions\n- ok\n## Decisions\n- none" : long }));
  const g = await withGemma(ed);
  const r = ed.callMeeting({ title: "Story", agenda: "Write a story together.", participants: [g.id], rounds: 2 }, "you");
  await ed.holdMeeting(r.id);
  const turns = calls.filter((b) => /Your turn/.test(lastOf(b)));
  assert.ok(turns.length >= 2);
  assert.ok(turns.every((b) => !b.max_tokens), "no cap on what each one says");
  assert.ok(turns.every((b) => !/words at most/.test(lastOf(b))), "and no word limit asked for");
  assert.ok(lastOf(turns.at(-1)).includes(long), "the whole of what was said before, not cut at 700 letters");
});
