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

// ---------------- Second round (tanda B): agents that carry on by themselves ----------------
const jevAnswer = (choice, probs) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ answers: { decision: { choice, probabilities: probs || { [choice]: 0.8 } } }, usage: { cost: 0.00001 } }) });
function team(answer, { jev } = {}) {
  const calls = [], jevCalls = [], clock = { t: Date.parse("2026-11-07T10:00:00") };
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    if (!body.messages) { jevCalls.push(body); return jev ? jev(body, jevCalls) : jevAnswer("go_ahead"); }
    calls.push(body); return answer(body, calls);
  };
  const ed = new Building({ load: async () => null, save: async () => {}, key: () => "sk-or-test", fetch, now: () => clock.t });
  ed.setModels(MODELS);
  return { ed, calls, jevCalls, clock };
}
async function hire(ed, name, extra = {}) {
  const r = await ed.run({ type: "createAgent", profile: Object.assign({ name, role: "subagent", floor: "tech", seat: "office", brain: "openai/gpt-6-luna", instructions: `You are ${name}.`, objective: "",
    heartbeat: { every: 1, unit: "on_request" }, onWake: "tasks", capabilities: ["write"] }, extra) });
  const a = ed.agent(r.id); a.reportsTo = ed.boss().id; return a;
}
const isAgent = (b, name) => new RegExp(`You are ${name}\\.`).test(sysOf(b));
const toolCall = (name, args) => ok({ content: null, tool_calls: [{ id: "c" + Math.random().toString(36).slice(2, 7), type: "function", function: { name, arguments: JSON.stringify(args) } }] });
async function run(ed, clock, times = 12) { for (let i = 0; i < times; i++) { clock.t += 1000; await ed.tick(); } }

test("a coordinator hands the work round, in order, and is woken up with each result until it's done: nobody has to say «carry on»", async () => {
  const seen = [];
  const { ed, clock } = team((b) => {
    const last = lastOf(b);
    if (isAgent(b, "Coordinator")) {
      if (b.messages.at(-1).role === "tool") return ok({ content: "Handed over." });
      if (/^Task: Answer/.test(last) || /asks you to: Answer/.test(last)) return toolCall("assign_task", { agent: "Lupe 1", task: "Answer: what is 2+2?", follow_up: "pass it to Lupe 2 to improve it" });
      if (/Result of the task you gave Lupe 1/.test(last)) { seen.push("from Lupe 1"); return toolCall("assign_task", { agent: "Lupe 2", task: "Improve this answer: " + last.match(/<<<\n([\s\S]*?)\n>>>/)[1], follow_up: "deliver it" }); }
      if (/Result of the task you gave Lupe 2/.test(last)) { seen.push("from Lupe 2"); return ok({ content: "FINAL: " + last.match(/<<<\n([\s\S]*?)\n>>>/)[1] }); }
    }
    if (isAgent(b, "Lupe 1")) return ok({ content: "4" });
    if (isAgent(b, "Lupe 2")) return ok({ content: "2+2 = 4 (four)." });
    return ok({ content: "Noted." });
  });
  await ed.start("basic", "en"); ed.e.settings.pause = false;
  const c = await hire(ed, "Coordinator"); await hire(ed, "Lupe 1"); await hire(ed, "Lupe 2");
  ed.assignTask(c, "Answer, with your team, what is 2+2.", "", true);
  await run(ed, clock);
  assert.deepEqual(seen, ["from Lupe 1", "from Lupe 2"], "woken up with each result, in order");
  assert.ok(ed.e.conversation.some((m) => m.role === "report" && m.agent === c.id && /FINAL: 2\+2 = 4 \(four\)\./.test(m.content)), "the final result reaches the boss's chat");
  assert.equal(ed.e.conversation.filter((m) => m.role === "user").length, 0, "and nobody said «carry on»");
});

test("the boss, asked once, hands out the first step with follow_up and carries on by itself when the result arrives", async () => {
  const { ed, clock } = team((b) => {
    const last = lastOf(b), boss = /building's boss/i.test(sysOf(b));
    if (boss && b.messages.at(-1).role === "tool") return ok({ content: "On it: Lupe 1 starts and I'll take it from there." });
    if (boss && /Result of the task you gave Lupe 1/.test(last)) return ok({ content: "Here it is, checked: “Bread with a soul.”" });
    if (boss && /Write a slogan/.test(last)) return toolCall("assign_task", { agent: "Lupe 1", task: "Write a slogan for a bakery.", follow_up: "check it and give it to the owner" });
    if (isAgent(b, "Lupe 1")) return ok({ content: "Bread with a soul." });
    return ok({ content: "Noted." });
  });
  await ed.start("basic", "en"); ed.e.settings.pause = false;
  await hire(ed, "Lupe 1");
  await ed.speak("Write a slogan for my bakery.");
  await run(ed, clock);
  const last = ed.e.conversation.at(-1);
  assert.equal(last.role, "report"); assert.equal(last.agent, ed.boss().id);
  assert.match(last.content, /Bread with a soul/, "the boss delivers the result by itself, without being told to carry on");
  assert.equal(ed.e.conversation.filter((m) => m.role === "user").length, 1, "you spoke once");
});

test("JEV is asked before an agent hands out work (not the boss); if it says stop, the task isn't given", async () => {
  const { ed, jevCalls } = team((b) => (isAgent(b, "Coordinator") && b.messages.at(-1).role !== "tool" ? toolCall("assign_task", { agent: "Lupe 1", task: "Count the stars." }) : ok({ content: "OK." })),
    { jev: (body) => jevAnswer(/Give Lupe 1 the task/.test(body.state.join("\n")) ? "stop" : "go_ahead") });
  await ed.start("basic", "en");
  const c = await hire(ed, "Coordinator"), l = await hire(ed, "Lupe 1");
  await ed.speak("Organise something.", { agent: c.id });
  assert.ok(jevCalls.some((x) => /Give Lupe 1 the task: Count the stars/.test(x.state.join("\n"))));
  assert.equal(l.tasks.length, 0, "JEV said stop: nothing given");
});

test("an agent working on its own that gives the same task again and again: JEV is told how many times, and its stop ends the loop", async () => {
  let n = 0;
  const { ed, clock, jevCalls } = team((b) => {
    if (isAgent(b, "Coordinator") && b.messages.at(-1).role !== "tool") { n++; return toolCall("assign_task", { agent: "Lupe 1", task: "Count the stars again.", follow_up: "ask again" }); }
    if (isAgent(b, "Lupe 1")) return ok({ content: "Too many." });
    return ok({ content: "OK." });
  }, { jev: (body) => jevAnswer(/already gave it this same task 2 times/.test(body.state.join("\n")) ? "stop" : "go_ahead") });
  await ed.start("basic", "en"); ed.e.settings.pause = false;
  const c = await hire(ed, "Coordinator"); await hire(ed, "Lupe 1");
  ed.assignTask(c, "Start.", "", true);
  await run(ed, clock, 20);
  assert.ok(jevCalls.some((x) => /already gave it this same task 1 times today/.test(x.state.join("\n"))), "JEV knows it's a repeat");
  assert.equal(ed.agent("Lupe 1").tasks.length, 2, "after the second time, JEV stops it");
});

test("a delegated task that fails for good wakes up whoever gave it, with the failure", async () => {
  const { ed, clock } = team((b) => {
    if (isAgent(b, "Lupe 1")) return { ok: false, status: 500, headers: { get: () => null }, json: async () => ({ error: { message: "upstream broke" } }) };
    if (isAgent(b, "Coordinator") && /failed/.test(lastOf(b))) return ok({ content: "Lupe 1 failed; I'll tell the boss." });
    return ok({ content: "OK." });
  });
  await ed.start("basic", "en"); ed.e.settings.pause = false;
  const c = await hire(ed, "Coordinator"), l = await hire(ed, "Lupe 1");
  const t = ed.assignTask(l, "Do something.", c.id, true); t.followUp = { by: c.id, note: "use it", parentFrom: "" };
  await run(ed, clock, 6);
  assert.ok(c.tasks.some((x) => /failed: /.test(x.text)), "the coordinator learns it failed");
});

test("loop room «improve»: in order, each one receives the whole latest version and gives it back improved; every version is kept and the result goes into the minutes as it is", async () => {
  const { ed, calls } = team((b) => {
    const last = lastOf(b);
    if (/The loop has finished/.test(last)) return ok({ content: "It got clearer each time; the last one is the best." });
    const n = (last.match(/The latest version, by [^:]+:\n<<<\n([\s\S]*?)\n>>>/) || [])[1];
    const who = (sysOf(b).match(/You are (Lupe \d)\./) || [])[1] || "?";
    return ok({ content: n ? `${n} + ${who}` : `v1 by ${who}` });
  });
  await ed.start("basic", "en");
  const l1 = await hire(ed, "Lupe 1"), l2 = await hire(ed, "Lupe 2");
  const r = ed.callMeeting({ title: "Lupes", agenda: "What is the best way to learn a language?", participants: [l1.id, l2.id], rounds: 2, mode: "improve" }, "you");
  assert.equal(r.mode, "improve");
  await ed.holdMeeting(r.id);
  assert.equal(r.state, "finished");
  assert.deepEqual(r.contributions.map((x) => [x.name, x.text]), [["Lupe 1", "v1 by Lupe 1"], ["Lupe 2", "v1 by Lupe 1 + Lupe 2"], ["Lupe 1", "v1 by Lupe 1 + Lupe 2 + Lupe 1"], ["Lupe 2", "v1 by Lupe 1 + Lupe 2 + Lupe 1 + Lupe 2"]]);
  assert.match(r.minutes, /## Result\n\nv1 by Lupe 1 \+ Lupe 2 \+ Lupe 1 \+ Lupe 2/, "the last version, whole and as it is");
  assert.match(r.minutes, /## How it got here\n\nIt got clearer/);
  assert.ok(!calls.some((b) => /Open the meeting|Start round/.test(lastOf(b))), "nobody chairs each round: no extra calls");
  assert.ok(ed.e.conversation.some((m) => m.meeting === r.id), "the minutes reach the boss's chat");
});

test("loop room «continue»: each one continues where the previous one left off, with the whole text so far", async () => {
  const { ed, calls } = team((b) => {
    const last = lastOf(b);
    if (/The loop has finished/.test(last)) return ok({ content: "Four parts." });
    const who = (sysOf(b).match(/You are (Writer \d)\./) || [])[1];
    return ok({ content: `[part by ${who}]` });
  });
  await ed.start("basic", "en");
  const w1 = await hire(ed, "Writer 1"), w2 = await hire(ed, "Writer 2");
  const r = ed.callMeeting({ title: "Story", agenda: "A story about a clockmaker, at least 1000 words each.", participants: [w1.id, w2.id], rounds: 2, mode: "continue" }, "you");
  await ed.holdMeeting(r.id);
  assert.match(r.result, /^\[part by Writer 1\]\n\n\[part by Writer 2\]\n\n\[part by Writer 1\]\n\n\[part by Writer 2\]$/);
  const third = calls.filter((b) => /The text so far/.test(lastOf(b)))[1];
  assert.match(lastOf(third), /\[part by Writer 1\]\n\n\[part by Writer 2\]/, "the third one receives the whole text so far");
});

test("the boss calls a loop with follow_up: when it finishes, it's woken up with the minutes and carries on", async () => {
  const { ed, clock } = team((b) => {
    const last = lastOf(b), boss = /building's boss/i.test(sysOf(b));
    if (/The loop has finished/.test(last)) return ok({ content: "Fine." });
    if (boss && b.messages.at(-1).role === "tool") return ok({ content: "Proposed: confirm the rounds." });
    if (boss && /Lupes and Brunos/.test(last)) return toolCall("call_meeting", { title: "Lupes", agenda: "Best slogan for a bakery", participants: ["Lupe 1"], rounds: 1, mode: "improve", follow_up: "then ask the Brunos" });
    if (boss && /The meeting “Lupes” has finished/.test(last)) return ok({ content: "The Lupes are done; next, the Brunos." });
    return ok({ content: "Bread with a soul." });
  });
  await ed.start("basic", "en"); ed.e.settings.pause = false;
  await hire(ed, "Lupe 1");
  await ed.speak("Run the Lupes and Brunos experiment.");
  const r = ed.e.meetings.at(-1);
  assert.equal(r.state, "proposed", "the owner confirms the rounds first");
  assert.equal(r.mode, "improve");
  await ed.run({ type: "meeting.start", meeting: r.id, rounds: 1 });
  for (let i = 0; i < 40 && r.state !== "finished"; i++) await new Promise((ok) => setTimeout(ok, 5));
  await run(ed, clock, 4);
  assert.match(ed.e.conversation.at(-1).content, /The Lupes are done; next, the Brunos\./, "woken up with the minutes, it carries on by itself");
});

test("JEV chooses the best of several answers, reading them twice in opposite orders; if it changes its mind, it says there's no clear winner", async () => {
  const agree = team(() => ok({ content: "x" }), { jev: () => jevAnswer("option_1", { option_1: 0.7, option_2: 0.3 }) });   // Lupes both times, wherever it's read
  await agree.ed.start("basic", "en");
  let r = await agree.ed.jevChoose(agree.ed.boss(), "Best slogan?", [{ name: "Lupes", text: "Bread with a soul." }, { name: "Brunos", text: "Bread." }]);
  assert.equal(agree.jevCalls.length, 2, "asked twice");
  assert.match(agree.jevCalls[0].state[1], /^Lupes:/); assert.match(agree.jevCalls[1].state[1], /^Brunos:/, "the second time, the other way round");
  assert.equal(r.choice, "Lupes");
  // always the one it reads first (option_1 the first time; option_2, read first, the second): that's its bias, not a winner
  const flip = team(() => ok({ content: "x" }), { jev: (body, all) => jevAnswer(all.length === 1 ? "option_1" : "option_2") });
  await flip.ed.start("basic", "en");
  r = await flip.ed.jevChoose(flip.ed.boss(), "Best slogan?", [{ name: "Lupes", text: "Bread with a soul." }, { name: "Brunos", text: "Bread." }]);
  assert.equal(r.choice, null); assert.match(r.text, /doesn't see a clear winner/);
});

test("coins: the boss asks who learns the lesson; only that agent, its role, everyone or the ones chosen", async () => {
  let lastSystem = "";
  const { ed } = team((b) => { lastSystem = sysOf(b); return ok({ content: /turn the reason for a coin/i.test(sysOf(b)) ? "Always cite your sources." : "Done." }); });
  await ed.start("basic", "en");
  const a1 = await hire(ed, "Arturo"), a2 = await hire(ed, "Bea"), a3 = await hire(ed, "Carla");
  await ed.run({ type: "coin.give", id: a1.id, coinType: "gold", reason: "Cited every source" });
  const ask = ed.e.conversation.at(-1);
  assert.equal(ask.agent, ed.boss().id); assert.ok(ask.lesson, "the boss asks, in its chat");
  assert.match(ask.content, /You liked what Arturo did: “Cited every source”\. Shall I pass that way of working on\? To everyone, to some, or only to Arturo\?/);
  await ed.run({ type: "lesson.approve", lesson: ask.lesson, scope: "agent" });
  const l = ed.e.lessons.find((x) => x.id === ask.lesson);
  assert.deepEqual([l.scope, ed.lessonsFor(a1).length, ed.lessonsFor(a2).length], ["agent", 1, 0], "only Arturo");
  await ed.run({ type: "coin.give", id: a2.id, coinType: "red", reason: "Made up a figure" });
  const ask2 = ed.e.conversation.at(-1);
  assert.match(ask2.content, /You didn't like what Bea did: “Made up a figure”\. Shall I make it clear that it mustn't happen again\?/);
  await ed.run({ type: "lesson.approve", lesson: ask2.lesson, scope: "agents", agents: [a2.id, a3.id] });
  assert.deepEqual([ed.lessonsFor(a1).length, ed.lessonsFor(a2).length, ed.lessonsFor(a3).length], [1, 1, 1], "Bea and Carla learn the second one; Arturo, only his");
  await ed.run({ type: "coin.give", id: a3.id, coinType: "gold", reason: "Short and clear" });
  await ed.run({ type: "lesson.approve", lesson: ed.e.conversation.at(-1).lesson, scope: "all" });
  assert.equal(ed.lessonsFor(ed.boss()).length, 1, "«every agent»: the boss too");
  a2.next = 0; ed.assignTask(a2, "Something", "", true); await ed.wakeUp(a2.id);
  assert.match(lastSystem, /Lessons you've learnt:[\s\S]*Made up a figure|Lessons you've learnt:[\s\S]*Always cite/);
  assert.match(ed.lessonScopeText(ed.e.lessons.find((x) => x.scope === "agents")), /Bea, Carla/);
});

test("the Junior role: very simple, repetitive jobs with a cheap brain; it goes to the pool, and the Creator can propose it", async () => {
  const { ed } = team((b) => ok({ content: /Reply ONLY with a JSON object/.test(sysOf(b)) ? JSON.stringify({ name: "Sorter", role: "junior", floor: "tech", instructions: "You sort emails.", objective: "", level: "budget", heartbeat: { every: 1, unit: "on_request" }, onWake: "tasks", capabilities: ["write"], look: { p: "boy" }, why: "Simple and repetitive." }) : "OK." }));
  await ed.start("basic", "en");
  const r = await ed.run({ type: "createAgent", profile: { name: "Copier", role: "junior", floor: "tech", instructions: "You copy things.", capabilities: ["write"] } });
  const j = ed.agent(r.id);
  assert.deepEqual([j.role, j.seat, j.priority], ["junior", "pool", 4], "a junior: in the pool, priority 4");
  assert.equal(j.brain, "openai/gpt-6-luna", "the cheapest brain that will do");
  const p = await ed.proposeAgent("I want one that sorts my emails into folders, nothing else.");
  assert.deepEqual([p.proposal.profile.role, p.proposal.profile.seat], ["junior", "pool"]);
  await ed.run({ type: "editAgent", id: j.id, changes: { role: "subagent" } });
  assert.equal(ed.agent(j.id).role, "subagent", "it can be changed like the others");
});

test("the Creator writes an agent's instructions, objective or personality from what you say in your own words", async () => {
  const seen = [];
  const { ed } = team((b) => { seen.push(b); return ok({ content: /instructions in the second person/.test(sysOf(b)) ? "You write fiction in Spanish, at least 1,000 words each time." : /personality in one or two sentences/.test(sysOf(b)) ? "“A mad genius: brilliant, chaotic and funny.”" : "Write one story a week." }); });
  await ed.start("basic", "en");
  const a = await hire(ed, "Cervantes");
  let r = await ed.run({ type: "creator.write", field: "instructions", text: "que escriba historias largas en español", id: a.id });
  assert.match(r.text, /^You write fiction in Spanish/);
  assert.match(lastOf(seen.at(-1)), /Name: Cervantes[\s\S]*What the owner says: que escriba historias largas en español/, "it knows who it's for");
  r = await ed.run({ type: "creator.write", field: "personality", text: "genio loco", id: a.id });
  assert.equal(r.text, "A mad genius: brilliant, chaotic and funny.", "without the quotes around it");
  r = await ed.run({ type: "creator.write", field: "objective", text: "una historia a la semana", about: { name: "Nuevo" } });
  assert.equal(r.text, "Write one story a week.", "also for an agent that doesn't exist yet («Create agent»)");
  assert.ok(ed.e.log.some((l) => l.agent === "creator" && /wrote the instructions of Cervantes/.test(l.text)), "the Creator does it (and pays for it)");
  await assert.rejects(ed.run({ type: "creator.write", field: "objective", text: "  " }), /First write something/);
});
