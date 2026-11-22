// Version 9.4 · Floors in a file: a whole floor (its name, its job and its agents) is saved to a file without anything private
// (memory, tasks, spending, documents, mailboxes, Telegram, its own look, a brain with your own key) and is loaded in another building with one tap.
// The agents come in with «Ask me first». The same check is used for the floors sent to «Community floors».
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { Building, floorFile, checkFloorFile, setLanguage } from "../engine.js";

const MODELS = [{ id: "openai/gpt-6-luna", name: "GPT 6 Luna", pricing: { prompt: "0.0000001", completion: "0.0000005" }, architecture: { input_modalities: ["text"], output_modalities: ["text"] }, context_length: 128000 }];
async function building(language = "es") {
  const ed = new Building({ load: async () => null, save: async () => {}, key: () => "sk-or-test", fetch: async () => { throw new Error("no network in this test"); }, now: () => Date.now() });
  ed.setModels(MODELS);
  await ed.start("basic", language);
  return ed;
}

test("a floor is saved to a file without anything private, and loaded in another building with its agents and who reports to whom", async () => {
  const ed = await building("es");
  const { id: pid } = await ed.run({ type: "createFloor", name: "Ventas", job: "Buscar clientes y preparar presupuestos" });
  const head = (await ed.run({ type: "createAgent", profile: { name: "Marta", role: "section_head", floor: pid, seat: "head_office", brain: "openai/gpt-6-luna",
    instructions: "Diriges ventas.", objective: "Más clientes.", heartbeat: { every: 1, unit: "d" }, capabilities: ["write", "internet"] } })).id;
  const a1 = (await ed.run({ type: "createAgent", profile: { name: "Leo", role: "subagent", floor: pid, seat: "office", brain: "openai/gpt-6-luna",
    instructions: "Preparas presupuestos.", heartbeat: { every: 1, unit: "on_request" }, capabilities: ["write"] } })).id;
  const a2 = (await ed.run({ type: "createAgent", profile: { name: "Ana", role: "junior", floor: pid, seat: "pool", instructions: "Buscas contactos.", capabilities: ["write"] } })).id;
  // things that are its own and must not travel
  Object.assign(ed.agent(a1), { provider: "anthropic", brain: "claude-sonnet-5-5", mailboxes: ["main"], telegram: true, docs: { folder: "/Users/yo/Secretos", manual: false },
    shortMemory: [{ ts: 1, text: "El cliente X paga 4.000 €" }], tasks: [{ id: "t1", text: "secreto", state: "pending" }], spending: { "2026-11-22": 3 }, look: { p: "custom", media: "med_1" },
    permissions: { mode: "free", ask: [] }, skills: ["x-watcher"] });
  ed.agent(a2).reportsTo = a1;
  const f = floorFile(ed.e, pid);
  assert.equal(f.ferAgentFloor, 1);
  assert.deepEqual([f.name, f.job, f.language, f.agents.length], ["Ventas", "Buscar clientes y preparar presupuestos", "es", 3]);
  assert.equal(f.agents[0].name, "Marta", "the section head first");
  const text = JSON.stringify(f);
  for (const secret of ["4.000", "secreto", "Secretos", "main", "med_1", "claude-sonnet-5-5", "\"free\"", "spending", "shortMemory", "telegram", "mailboxes", "docs", "permissions", head, a1, a2])
    assert.ok(!text.includes(secret), "nothing private in the file: " + secret);
  const leo = f.agents.find((x) => x.name === "Leo"), ana = f.agents.find((x) => x.name === "Ana");
  assert.deepEqual([leo.brain, leo.look.p, leo.skills, ana.reportsTo], ["", "boy", ["x-watcher"], leo.ref], "a brain with your own key and its own look stay at home; who it reports to, by reference");
  assert.equal(checkFloorFile(f), "");

  // in another building (in English)
  const other = await building("en");
  const before = other.e.floors.length;
  const r = await other.run({ type: "importFloor", file: JSON.parse(JSON.stringify(f)) });
  assert.equal(other.e.floors.length, before + 1);
  const p = other.floor(r.id);
  assert.deepEqual([p.name, p.job, p.type], ["Ventas", "Buscar clientes y preparar presupuestos", "storey"]);
  const ags = other.e.agents.filter((a) => a.floor === r.id);
  const by = Object.fromEntries(ags.map((a) => [a.name, a]));
  assert.deepEqual(Object.keys(by).sort(), ["Ana", "Leo", "Marta"]);
  assert.deepEqual([by.Marta.seat, by.Marta.reportsTo, by.Leo.reportsTo, by.Ana.reportsTo], ["head_office", "boss", by.Marta.id, by.Leo.id], "who reports to whom, as in the file");
  assert.ok(ags.every((a) => a.permissions.mode === "ask"), "they come in with «Ask me first»");
  assert.ok(ags.every((a) => !a.mailboxes.length && !a.telegram && !a.docs.folder && !a.shortMemory.length && !a.tasks.length), "with nothing of anyone else's");
  assert.equal(by.Leo.brain, other.defaultBrain(by.Leo), "without a brain in the file: the default one");
  assert.deepEqual(by.Leo.skills, ["x-watcher"]);
  assert.ok(by.Marta.capabilities.includes("internet"));
  // loading it twice: two floors, no mix-ups
  await other.run({ type: "importFloor", file: f });
  assert.equal(other.e.agents.filter((a) => a.name === "Marta").length, 2);
});

test("a file that isn't a floor (or is broken) is rejected and says why, in the building's language", async () => {
  setLanguage("en");
  const ok = { ferAgentFloor: 1, name: "X", agents: [{ name: "A", role: "subagent", instructions: "" }] };
  assert.equal(checkFloorFile(ok), "");
  assert.match(checkFloorFile({ name: "X" }), /isn't a Fer Agent floor file/);
  assert.match(checkFloorFile(Object.assign({}, ok, { ferAgentFloor: 2 })), /newer Fer Agent/);
  assert.match(checkFloorFile(Object.assign({}, ok, { agents: [] })), /no agents/);
  assert.match(checkFloorFile(Object.assign({}, ok, { agents: [{ name: "Jefa", role: "boss", instructions: "" }] })), /role that can't go on a floor/);
  assert.match(checkFloorFile(Object.assign({}, ok, { agents: Array.from({ length: 31 }, (_, i) => ({ name: "A" + i, role: "junior", instructions: "" })) })), /up to 30/);
  assert.match(checkFloorFile(Object.assign({}, ok, { agents: [{ name: "A", role: "section_head", seat: "head_office", instructions: "" }, { name: "B", role: "section_head", seat: "head_office", instructions: "" }] })), /only one section head/);
  const ed = await building("en");
  await assert.rejects(ed.run({ type: "importFloor", file: { hello: 1 } }), /isn't a Fer Agent floor file/);
  setLanguage("es");
  assert.match(checkFloorFile({ name: "X" }), /No es un archivo de planta/);
});

test("«Community floors»: the project's check validates each file and rebuilds the list", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fa94f-"));
  fs.writeFileSync(path.join(dir, "ventas.json"), JSON.stringify({ ferAgentFloor: 1, name: "Ventas", job: "Clientes", language: "es", author: "Ana", agents: [{ ref: "a1", name: "Marta", role: "section_head", seat: "head_office", instructions: "Diriges ventas." }] }));
  fs.writeFileSync(path.join(dir, "rota.json"), "{ no es json");
  let out = "", code = 0;
  try { out = execFileSync("node", [path.resolve("community/check-floors.mjs"), dir], { encoding: "utf8" }); } catch (e) { code = e.status; out = String(e.stdout) + String(e.stderr); }
  assert.equal(code, 1, "a broken file fails the check");
  assert.match(out, /rota\.json/);
  fs.unlinkSync(path.join(dir, "rota.json"));
  out = execFileSync("node", [path.resolve("community/check-floors.mjs"), dir], { encoding: "utf8" });
  const index = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));
  assert.deepEqual(index.floors, [{ file: "ventas.json", name: "Ventas", job: "Clientes", language: "es", author: "Ana", agents: 1 }]);
  // the project's own list is valid (it starts empty: which floors go in is decided by whoever runs the project)
  execFileSync("node", [path.resolve("community/check-floors.mjs"), path.resolve("community/floors")], { encoding: "utf8" });
  assert.ok(Array.isArray(JSON.parse(fs.readFileSync("community/floors/index.json", "utf8")).floors));
});
