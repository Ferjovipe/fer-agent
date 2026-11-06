// Version 9: the program's names are in English. A building saved by an earlier version (Spanish field names)
// moves to them once, when it's opened or loaded from a backup, and nothing of it is lost.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Building, ROLES, CAPABILITIES, SEATS, migrateFromV8, isBeforeV9, readBackupFile } from "../engine.js";
import { readSkillMd } from "../hands.mjs";

const OLD = readFileSync(new URL("./building-v8.json", import.meta.url), "utf8");
const old = JSON.parse(OLD);
function open(txt) {
  let saved = txt;
  const backups = [];
  const ed = new Building({ load: async () => saved, save: async (j) => { saved = j; }, backup: async (j, day) => { backups.push([day, j]); },
    key: () => "", fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }), now: () => Date.parse("2026-11-06T10:00:00") });
  return { ed, backups, saved: () => saved };
}
// the Spanish field names of version 8 (any of them left would mean something wasn't moved)
const SPANISH = /"(agentes|plantas|ajustes|nombre|rol|planta|puesto|cuerpo|latido|unidad|tareas|estado|memoriaLarga|memoriaCorta|conversacion|registro|monedas|lecciones|reuniones|autorizaciones|consultasJev|propuestas|propuestasModelos|gastoDias|aspecto|capacidades|skillFija|reportaA|alDespertar|siAgota|idioma|plantilla|fase|tipo|texto|agente|motivo|papel|convoca|participantes|intervenciones)":/;

test("a version 8 building moves to the English names: it's saved as it was first, and nothing is lost", async () => {
  const { ed, backups, saved } = open(OLD);
  await ed.start();
  assert.deepEqual(backups, [["before-v9", OLD]], "the building is saved exactly as it was before moving it");
  const now = JSON.parse(saved());
  assert.ok(Array.isArray(now.agents) && !now.agentes, "the move stays saved");
  // no Spanish field name is left (except in what an action passes to a skill: that's the skill's, and it reads both names)
  const check = JSON.parse(saved());
  for (const x of check.approvals) delete x.action.data;
  assert.doesNotMatch(JSON.stringify(check), SPANISH, "no Spanish field name is left");
  assert.deepEqual(now.approvals.map((x) => x.action.data), old.autorizaciones.map((x) => x.accion.datos), "what the action passes to the skill, as it was");
  // everything comes along
  for (const [was, is] of [["agentes", "agents"], ["plantas", "floors"], ["memoriaLarga", "longMemory"], ["monedas", "coins"], ["lecciones", "lessons"], ["reuniones", "meetings"],
    ["autorizaciones", "approvals"], ["propuestas", "proposals"], ["consultasJev", "jevQueries"], ["modelosVistos", "seenModels"]]) assert.equal(ed.e[is].length, old[was].length, is);
  assert.equal(ed.e.name, old.nombre);
  assert.equal(ed.e.language, "en");
  assert.equal(ed.buildingSpending("today") >= 0, true);
  assert.deepEqual(ed.e.spendingDays, old.gastoDias, "the spending per day, as it was");
  // the built-in agents and floors, with their new ids, and everything that points to them
  assert.deepEqual(ed.e.agents.slice(0, 9).map((a) => a.id), ["boss", "sage1", "sage2", "techie", "artie", "creator", "jev", "controller", "memory"]);
  assert.deepEqual(ed.e.floors.map((p) => [p.id, p.type]), [["dome", "dome"], ["tech", "storey"], ["lobby", "lobby"]]);
  for (const a of ed.e.agents) {
    assert.ok(ROLES[a.role], `${a.name}: role ${a.role}`);
    assert.ok(ed.e.floors.some((p) => p.id === a.floor), `${a.name}: floor ${a.floor}`);
    assert.ok((SEATS[ed.floor(a.floor).type] || []).includes(a.seat), `${a.name}: seat ${a.seat}`);
    assert.ok(!a.reportsTo || ed.agent(a.reportsTo), `${a.name}: reports to ${a.reportsTo}`);
    assert.ok(["min", "h", "d", "on_request"].includes(a.heartbeat.unit), `${a.name}: heartbeat ${a.heartbeat.unit}`);
    assert.ok(a.capabilities.every((c) => CAPABILITIES.some((x) => x.id === c)), `${a.name}: ${a.capabilities}`);
    assert.ok(["tasks", "objective"].includes(a.onWake), `${a.name}: on waking up ${a.onWake}`);
    assert.ok(["boy", "girl", "grandpa", "grandma", "purple", "green", "coral", "blue", "teal", "shirt"].includes(a.look.p), `${a.name}: look ${a.look.p}`);
    for (const t of a.tasks) assert.ok(["pending", "done", "stopped", "error"].includes(t.state), `${a.name}: task ${t.state}`);
    for (const m of a.shortMemory) assert.ok(["chat", "report", "result", "note", "advice", "meeting", "missing"].includes(m.type), `${a.name}: memory ${m.type}`);
  }
  assert.equal(ed.agent("boss").name, old.agentes[0].nombre, "the names stay as they were");
  assert.equal(ed.agent("techie").instructions, old.agentes[3].cuerpo);
  // the rest of the building's records
  for (const m of ed.e.coins) assert.ok(["gold", "red"].includes(m.type) && ["proposed", "confirmed", "discarded"].includes(m.state) && ROLES[m.role]);
  for (const l of ed.e.lessons) assert.ok(["gold", "red"].includes(l.type) && ["proposed", "approved", "rejected"].includes(l.state) && ROLES[l.role]);
  for (const r of ed.e.meetings) {
    assert.ok(["proposed", "ready", "in_progress", "finished", "cancelled", "interrupted"].includes(r.state), r.state);
    assert.ok(r.participants.every((id) => ed.agent(id)), "the meeting's participants, with their new ids");
    assert.ok(r.contributions.every((x) => ed.agent(x.agent)));
    assert.ok(["you", "boss"].includes(r.calledBy));
  }
  for (const j of ed.e.jevQueries) assert.ok(["go_ahead", "reuse", "stop", "ask_boss", "no_answer"].includes(j.decision) && ["search", "repeated", "retry", "create_agent"].includes(j.type));
  for (const x of ed.e.approvals) assert.ok(["pending", "done", "error", "rejected", "running"].includes(x.state) && x.action && x.action.skill);
  for (const p of ed.e.proposals) assert.ok(["pending", "created", "discarded"].includes(p.state) && ROLES[p.profile.role] && ["tasks", "objective"].includes(p.profile.onWake));
  for (const m of ed.e.conversation) assert.ok(["user", "assistant", "report"].includes(m.role) && (!m.agent || ed.agent(m.agent) || m.agent === "x"));
  assert.equal(ed.e.settings.buildingView, "strips");
  assert.equal(migrateFromV8(old).phase, "freeze1", "the spending phase (the engine works it out again on opening)");
  assert.deepEqual(Object.keys(ed.e.settings.brainFolders).sort(), ["backup", "index", "library", "memory"]);
  assert.deepEqual(ed.e.settings.connections.map((c) => [c.id, c.name, c.format]), [["mia", "Mi API", "openai"]], "your own APIs, with the id you gave them");
  // the X Watcher keeps its settings and what it had already seen
  const w = ed.e.agents.find((a) => a.fixedSkill && a.fixedSkill.skill === "x-watcher");
  const ow = old.agentes.find((a) => a.skillFija && a.skillFija.skill === "vigia-x");   // its name before version 9
  assert.deepEqual(Object.keys(w.fixedSkill.settings).sort(), ["base", "minimum", "scrolls", "terms", "windowMinutes"]);
  assert.deepEqual(w.fixedSkill.settings.terms, ow.skillFija.ajustes.terminos);
  assert.deepEqual(w.fixedSkill.state.seen, ow.skillFija.estado.vistos);
  // the skills that come with Fer Agent, with their new names
  assert.deepEqual(ed.e.approvals.map((x) => x.action.skill), old.autorizaciones.map((x) => ({ "escribir-archivo": "write-file" })[x.accion.skill] || x.accion.skill));
  const s = migrateFromV8({ agentes: [{ id: "x", habilidades: ["leer-web", "buscar-web", "mi-skill"], skillFija: { skill: "leer-archivo", ajustes: {}, estado: {} } }],
    autorizaciones: [{ accion: { skill: "escribir-archivo", datos: { ruta: "a.md" } } }] });
  assert.deepEqual([s.agents[0].skills, s.agents[0].fixedSkill.skill, s.approvals[0].action.skill, s.approvals[0].action.data], [["read-web", "web-search", "mi-skill"], "read-file", "write-file", { ruta: "a.md" }]);
  // opening it again: it's already in version 9 (no second backup)
  const again = open(saved());
  await again.ed.start();
  assert.deepEqual(again.backups, []);
  assert.deepEqual(again.ed.e.agents.map((a) => a.id), ed.e.agents.map((a) => a.id));
});

test("a building already in version 9 isn't touched", async () => {
  const { ed } = open(null);
  await ed.start("basic", "en");
  assert.equal(isBeforeV9(ed.e), false);
  assert.equal(migrateFromV8(ed.e), ed.e);
});

test("backups from any version: the old ones (Spanish names) and the new ones are loaded", async () => {
  const v8 = readBackupFile({ tipo: "fer-agent-copia", version: "8.3", fecha: "2026-10-01", aparato: "ap_1", edificio: old, medios: { med_1: { id: "med_1", url: "data:," } }, mudanza: true,
    preferencias: { altavoz: "1", idioma: "es", carpeta: { tipo: "drive", clientId: "x" } } });
  assert.equal(v8.kind, "backup");
  assert.equal(v8.building, old);
  assert.deepEqual(Object.keys(v8.media), ["med_1"]);
  assert.equal(v8.relocation, true);
  assert.deepEqual(v8.preferences, { speaker: "1", language: "es", folder: { tipo: "drive", clientId: "x" } });
  assert.equal(readBackupFile({ tipo: "fer-agent-edificio", aparato: "ap_2", ts: 5, edificio: old }).device, "ap_2");
  assert.equal(readBackupFile({ type: "fer-agent-building", device: "ap_3", ts: 6, building: { agents: [] } }).kind, "building");
  assert.equal(readBackupFile(old).kind, "state", "a building on its own (without the backup's wrapper)");
  // loading an old backup moves it too
  const { ed } = open(null);
  await ed.start("basic", "en");
  await ed.run({ type: "import", state: JSON.stringify(old) });
  assert.equal(ed.e.agents.length, old.agentes.length);
  assert.ok(ed.agent("boss") && ed.floor("dome"));
});

test("a skill written for version 8 (SKILL.md with Spanish names) still works", () => {
  const { header, instructions } = readSkillMd("---\nname: mi-skill\ntitulo: Mi skill\ndescripcion: Hace algo.\nefecto: externo\nfija: true\ntiempo: 30\n" +
    'datos: {"ruta": "x.md"}\najustes: [{"clave": "k", "tipo": "si_no", "nombre": "Activar", "ayuda": "Sí o no", "defecto": true}, {"clave": "n", "tipo": "numero", "nombre": "Cuántos", "defecto": 3}]\nscript: x.mjs\n---\nInstrucciones.');
  assert.equal(header.title, "Mi skill");
  assert.equal(header.description, "Hace algo.");
  assert.equal(header.effect, "external");
  assert.equal(header.fixed, true);
  assert.equal(Number(header.timeout), 30);
  assert.deepEqual(header.data, { ruta: "x.md" });
  assert.deepEqual(header.settings, [{ key: "k", type: "yes_no", name: "Activar", help: "Sí o no", default: true }, { key: "n", type: "number", name: "Cuántos", default: 3 }]);
  assert.equal(instructions, "Instrucciones.");
  // and one written now, as it is
  const now = readSkillMd('---\nname: x\neffect: read\nsettings: [{"key": "terms", "type": "list", "name": "T", "default": []}]\n---\n');
  assert.equal(now.header.effect, "read");
  assert.deepEqual(now.header.settings[0], { key: "terms", type: "list", name: "T", default: [] });
});
