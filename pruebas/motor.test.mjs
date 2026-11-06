// Engine tests with no network: simulated OpenRouter. Run: node --test pruebas/
import test from "node:test";
import assert from "node:assert/strict";
import { Edificio, crearPlantilla, elegirModelo, intervaloMs, reparto, tipoModelo, recomendadosIniciales, nivelDePrecio, MODELO_JEV, VERSION , SIN_TRADUCIR } from "../engine.js";
// v7: lessons are born as proposals and wait for your yes (inbox); in the v6 tests they are all approved
const aprobarLecciones = async (ed) => { for (const l of ed.e.lecciones.filter((x) => x.estado === "propuesta")) await ed.ejecutar({ tipo: "leccion.aprobar", leccion: l.id }); };

const MODELOS = [
  { id: "anthropic/claude-opus-5.5", name: "Claude Opus 5.5", pricing: { prompt: "0.000015", completion: "0.000075" }, architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] }, context_length: 200000 },
  { id: "anthropic/claude-sonnet-5.5", name: "Claude Sonnet 5.5", pricing: { prompt: "0.000002", completion: "0.00001" }, architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] }, context_length: 200000 },
  { id: "anthropic/claude-haiku-5.5", name: "Claude Haiku 5.5", pricing: { prompt: "0.0000001", completion: "0.0000005" }, architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] }, context_length: 200000 },
  { id: "openai/gpt-6.1-sol-pro", name: "GPT 6.1 Sol Pro", pricing: { prompt: "0.00002", completion: "0.00008" }, architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] }, context_length: 200000 },
  { id: "openai/gpt-6-luna", name: "GPT 6 Luna", pricing: { prompt: "0.0000001", completion: "0.0000005" }, architecture: { input_modalities: ["text"], output_modalities: ["text"] }, context_length: 128000 },
  { id: "deepseek/deepseek-v4.1-flash", name: "DeepSeek Flash", pricing: { prompt: "0.00000015", completion: "0.0000006" }, architecture: { input_modalities: ["text"], output_modalities: ["text"] }, context_length: 128000 },
  { id: "x/free:free", name: "gratis", pricing: { prompt: "0", completion: "0" }, architecture: { input_modalities: ["text"], output_modalities: ["text"] }, context_length: 32000 }
];

function crear(guion, ahoraRef = { t: Date.parse("2026-11-04T10:00:00") }) {
  const llamadas = [];
  let guardado = null;
  const fetch = async (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : {};
    llamadas.push({ url, body });
    const r = guion(url, body, llamadas);
    return { ok: (r.status || 200) < 400, status: r.status || 200, headers: { get: () => null }, json: async () => r.json, text: async () => (typeof r.text === "string" ? r.text : JSON.stringify(r.json)) };
  };
  const ed = new Edificio({ cargar: async () => guardado, guardar: async (j) => { guardado = j; }, clave: () => "sk-or-test", fetch, ahora: () => ahoraRef.t });
  ed.setModelos(MODELOS);
  // v7: the building starts on general pause; these tests (from v6) are about heartbeats, so they lift it when starting
  const iniciar = ed.iniciar.bind(ed);
  ed.iniciar = async (p) => { const r = await iniciar(p); ed.e.ajustes.pausa = false; return r; };
  return { ed, llamadas, ahoraRef, guardado: () => guardado };
}
// In v5 the built-in building doesn't come with invented teams: the tests create their own.
async function conEquipo(ed) {
  await ed.iniciar("basico");
  const { id } = await ed.ejecutar({ tipo: "crearPlanta", nombre: "Contenidos", funcion: "Escribir y buscar" });
  await ed.ejecutar({ tipo: "crearAgente", ficha: { nombre: "Redactor", rol: "subagente", planta: id, cuerpo: "Escribes textos claros y cortos para el equipo.", nivel: "economico" } });
  await ed.ejecutar({ tipo: "crearAgente", ficha: { nombre: "Buscador", rol: "subagente", planta: id, puesto: "pool", cuerpo: "Buscas información en internet y la resumes.", capacidades: ["buscar"] } });
  return id;
}
// JEV answers through the decisions API; the tests choose what it decides
const DECISIONES = "https://openrouter.ai/api/alpha/decisions";
const jevDice = (choice) => ({ json: { model: "typesafe/jev-1.14", answers: { decision: { type: "choice", choice, confidence: 0.8, probabilities: { seguir: 0.1, aprovechar: 0.1, parar: 0.1, preguntar_jefe: 0.1, [choice]: 0.7 } } }, usage: { input_tokens: 500, output_tokens: 20, cost: 0.000021 } } });
const resp = (content, extra = {}) => ({ json: Object.assign({ model: "m", choices: [{ message: Object.assign({ content }, extra) }], usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.001 } }) });

test("it chooses brains by level with the real list", () => {
  const L = MODELOS.map((m) => ({ id: m.id, inPrice: +m.pricing.prompt, outPrice: +m.pricing.completion, out: ["text"], inp: m.architecture.input_modalities, context: m.context_length }));
  assert.equal(elegirModelo("vanguardia_anthropic", L), "anthropic/claude-opus-5.5");
  assert.equal(elegirModelo("vanguardia_openai", L), "openai/gpt-6.1-sol-pro");
  assert.equal(elegirModelo("alto", L), "anthropic/claude-sonnet-5.5");
  assert.ok(["anthropic/claude-haiku-5.5", "openai/gpt-6-luna"].includes(elegirModelo("economico", L)));
  assert.notEqual(elegirModelo("economico", L, "anthropic").split("/")[0], "anthropic", "JEV uses another provider");
  assert.equal(intervaloMs({ cada: 10, unidad: "min" }), 600000);
  assert.equal(intervaloMs({ cada: 1, unidad: "peticion" }), null);
});

test("built-in building: dome with boss and sages, tech floor, lobby with Memory; no invented teams", async () => {
  const { ed } = crear(() => resp("ok"));
  await ed.iniciar("basico");
  const e = ed.e;
  assert.deepEqual(e.plantas.map((p) => p.tipo), ["cupula", "piso", "vestibulo"]);
  assert.deepEqual(e.agentes.map((a) => a.nombre).sort(), ["Arturito", "Creador de agentes", "Interventor", "JEV", "Jefe", "Memory", "Sabio 1", "Sabio 2", "Tecno"]);
  assert.ok(!e.agentes.some((a) => /Investigaci|Escritura|Redactor/.test(a.nombre + a.planta)));
  const cup = reparto(e, "cupula");
  assert.equal(cup.centro[0].rol, "jefe");
  assert.deepEqual([cup.izquierda[0].aspecto.p, cup.derecha[0].aspecto.p], ["abuelo", "abuela"]);
  const tec = reparto(e, "tecnica");
  assert.equal(tec.despacho[0].nombre, "Tecno", "Techie, head of its floor, in the head office on the left");
  assert.deepEqual(tec.oficina.map((a) => a.nombre), ["Arturito", "Creador de agentes", "JEV", "Interventor"]);
  assert.equal(reparto(e, "vestibulo").recepcion[0].nombre, "Memory");
  assert.equal(ed.jefe().cerebro, "anthropic/claude-sonnet-5.5");
  const sabios = ed.porRol("sabio");
  assert.equal(sabios.length, 2);
  assert.deepEqual(sabios.map((s) => s.cerebro), ["anthropic/claude-opus-5.5", "openai/gpt-6.1-sol-pro"]);
  assert.ok(sabios.every((s) => s.latido.unidad === "peticion"));
});

test("the boss hands out an urgent task; the worker does it and the report arrives (with no review afterwards)", async () => {
  const { ed, llamadas } = crear((url, b) => {
    if (url === DECISIONES) return jevDice("seguir");
    const sys = (b.messages || [])[0] ? String(b.messages[0].content) : "";
    if (sys.startsWith("Eres el jefe del edificio")) {
      if (!b.messages.some((m) => m.role === "tool")) return resp("", { tool_calls: [{ id: "c1", type: "function", function: { name: "asignar_tarea", arguments: JSON.stringify({ agente: "redactor", tarea: "Escribe un saludo", ahora: true }) } }] });
      return resp("Se lo he encargado al Redactor.");
    }
    return resp("¡Hola a todos!");
  });
  await conEquipo(ed);
  const r = await ed.hablar("Que el redactor escriba un saludo ya");
  assert.equal(r.respuesta, "Se lo he encargado al Redactor.");
  const red = ed.agente("Redactor");
  await new Promise((res) => setTimeout(res, 30));
  assert.equal(red.tareas.at(-1).estado, "hecha");
  assert.equal(red.tareas.at(-1).resultado, "¡Hola a todos!");
  assert.ok(ed.e.conversacion.some((m) => m.role === "informe" && m.nombre === "Redactor"));
  assert.ok(!llamadas.some((l) => l.url === DECISIONES), "no search, no repetition, no retry: no need to ask JEV");
  assert.ok(!ed.e.agentes.some((a) => "cerebroSuperior" in a), "the higher brain no longer exists");
});

test("JEV before searching: with “Jev Latest”, it gets who the agent is, what it's about to do and its short memory", async () => {
  let decide = "seguir";
  const { ed, llamadas } = crear((url, b) => (url === DECISIONES ? jevDice(decide) : resp("Resultado con datos.")));
  await conEquipo(ed);
  const bus = ed.agente("Buscador");
  assert.equal(ed.agente("JEV").cerebro, MODELO_JEV);
  assert.equal(MODELO_JEV, "~typesafe/jev-latest");
  bus.memoriaCorta.push({ ts: 1, tipo: "nota", texto: "Ayer resumí los precios de la luz" });
  ed.asignarTarea(bus, "Precios de la luz hoy", "", true);
  let r = await ed.despertar(bus.id);
  const q = llamadas.find((l) => l.url === DECISIONES).body;
  assert.equal(q.model, "~typesafe/jev-latest");
  assert.match(q.state.join("\n"), /Quién es: Buscador/);
  assert.match(q.state.join("\n"), /Buscar en internet para la tarea «Precios de la luz hoy»/);
  assert.match(q.state.join("\n"), /Ayer resumí los precios de la luz/);
  assert.deepEqual(Object.keys(q.questions.decision.criteria), ["seguir", "aprovechar", "parar", "preguntar_jefe"]);
  assert.equal(r.hecho, "hecha");
  assert.ok(llamadas.at(-1).body.plugins, "go ahead: it searches the internet");
  const c = ed.e.consultasJev.at(-1);
  assert.equal(c.decision, "seguir"); assert.equal(c.agente, bus.id); assert.ok(c.costeJev > 0); assert.equal(c.sirvio, null, "“did it help?” is marked by you"); assert.match(c.hizo, /buscó/);
  assert.ok(ed.gastoAgente(ed.agente("JEV"), "hoy") > 0, "the query is charged to JEV's spending");
  // reuse: it works without paying for the search
  decide = "aprovechar";
  ed.asignarTarea(bus, "Precios del gas", "", true);
  r = await ed.despertar(bus.id);
  assert.equal(r.hecho, "hecha");
  assert.ok(!llamadas.at(-1).body.plugins, "reuse: no search");
  // stop: it doesn't do the task or spend
  decide = "parar";
  const n = llamadas.length;
  ed.asignarTarea(bus, "Precios del agua", "", true);
  r = await ed.despertar(bus.id);
  assert.equal(r.hecho, "parada");
  assert.equal(llamadas.length, n + 1, "only the query to JEV");
  assert.equal(bus.tareas.at(-1).estado, "parada");
});

test("JEV: “ask the boss” is decided by the boss; if JEV doesn't answer, the agent goes ahead and it's noted", async () => {
  let jefeDice = "SI, adelante", jevFalla = false;
  const { ed, llamadas } = crear((url, b) => {
    if (url === DECISIONES) return jevFalla ? { status: 500, json: { error: { message: "caído" } } } : jevDice("preguntar_jefe");
    if (String(b.messages[0].content).includes("JEV te pasa una duda")) return resp(jefeDice);
    return resp("hecho");
  });
  await conEquipo(ed);
  const bus = ed.agente("Buscador");
  ed.asignarTarea(bus, "Busca A", "", true);
  assert.equal((await ed.despertar(bus.id)).hecho, "hecha");
  assert.match(ed.e.consultasJev.at(-1).texto, /el jefe: SI/);
  jefeDice = "NO, no compensa";
  ed.asignarTarea(bus, "Busca B", "", true);
  assert.equal((await ed.despertar(bus.id)).hecho, "parada");
  jevFalla = true;
  ed.asignarTarea(bus, "Busca C", "", true);
  assert.equal((await ed.despertar(bus.id)).hecho, "hecha");
  assert.equal(ed.e.consultasJev.at(-1).decision, "sin respuesta");
  assert.ok(llamadas.length > 0);
});

test("a repeated task is no longer forbidden: JEV decides (“reuse” reuses without spending); the objective's heartbeat is never blocked", async () => {
  let decide = "aprovechar";
  const { ed, llamadas } = crear((url) => (url === DECISIONES ? jevDice(decide) : resp("resultado")));
  await conEquipo(ed);
  const red = ed.agente("Redactor");
  ed.asignarTarea(red, "Resume la semana", "", true);
  await ed.despertar(red.id);
  assert.ok(!llamadas.some((l) => l.url === DECISIONES), "the first time nothing is repeated");
  const n = llamadas.length;
  ed.asignarTarea(red, "resume la semana ", "", true);
  let r = await ed.despertar(red.id);
  assert.equal(r.hecho, "aprovechada");
  assert.equal(llamadas.length, n + 1, "it only asks JEV; it doesn't pay for the work again");
  assert.equal(ed.e.consultasJev.at(-1).tipo, "repetida");
  decide = "seguir";
  ed.asignarTarea(red, "Resume la semana", "", true);
  r = await ed.despertar(red.id);
  assert.equal(r.hecho, "hecha", "if JEV says go ahead, it repeats it");
  red.alDespertar = "objetivo"; red.objetivo = "Una frase al día";
  const m = llamadas.length;
  await ed.despertar(red.id); await ed.despertar(red.id);
  assert.equal(llamadas.slice(m).filter((l) => l.url === DECISIONES).length, 0, "each heartbeat's work doesn't go through the repeat check");
});

test("retrying something that failed goes through JEV, only once; if it fails again, JEV proposes a red coin", async () => {
  let fallar = true, decide = "seguir", jevCaido = false;
  const { ed } = crear((url) => (url === DECISIONES ? (jevCaido ? { status: 503, json: { error: { message: "no" } } } : jevDice(decide)) : fallar ? { status: 500, json: { error: { message: "caído" } } } : resp("ok")));
  await conEquipo(ed);
  const red = ed.agente("Redactor");
  ed.asignarTarea(red, "Escribe el boletín", "", true);
  await ed.despertar(red.id);
  assert.equal(red.tareas.at(-1).estado, "error");
  let r = await ed.despertar(red.id);   // reintento
  assert.equal(ed.e.consultasJev.at(-1).tipo, "reintentar");
  assert.equal(r.hecho, "error");
  const roja = ed.e.monedas.find((m) => m.tipo === "roja" && m.propone === "jev");
  assert.ok(roja && roja.estado === "propuesta", "JEV proposes; you confirm");
  const n = ed.e.consultasJev.length;
  assert.equal((await ed.despertar(red.id)).hecho, "nada", "at most one automatic retry per task");
  assert.equal(ed.e.consultasJev.length, n);
  // JEV says stop: it isn't retried
  ed.asignarTarea(red, "Escribe la circular", "", true); await ed.despertar(red.id);
  decide = "parar";
  r = await ed.despertar(red.id);
  assert.equal(r.hecho, "parada");
  assert.equal(red.tareas.at(-1).estado, "parada");
  // JEV doesn't answer: it isn't retried either (without its yes, nothing is spent again on what failed)
  ed.asignarTarea(red, "Escribe el resumen", "", true); await ed.despertar(red.id);
  jevCaido = true; fallar = false;
  r = await ed.despertar(red.id);
  assert.equal(r.hecho, "sin reintento");
  assert.equal(red.tareas.at(-1).estado, "error");
  assert.equal((await ed.despertar(red.id)).hecho, "nada");
});

test("council of sages: both answer and they pay", async () => {
  const { ed } = crear((url, b) => {
    const sys = String(b.messages[0].content);
    if (sys.startsWith("Eres el jefe del edificio")) {
      if (!b.messages.some((m) => m.role === "tool")) return resp("", { tool_calls: [{ id: "c1", type: "function", function: { name: "consultar_sabios", arguments: '{"pregunta":"¿Vendemos?"}' } }] });
      const tool = b.messages.find((m) => m.role === "tool").content;
      return resp("Resumen: " + tool);
    }
    if (sys.includes("sabio del consejo")) return resp(b.model.includes("opus") ? "Consejo A" : "Consejo B");
    return resp("x");
  });
  await ed.iniciar("basico");
  const r = await ed.hablar("Decisión importante: ¿vendemos?");
  assert.match(r.respuesta, /Consejo A/);
  assert.match(r.respuesta, /Consejo B/);
  for (const s of ed.porRol("sabio")) assert.ok(ed.gastoAgente(s, "hoy") > 0);
});

test("Memory: saving and “remember” searches by keywords without spending", async () => {
  let ultimoSistema = "";
  const { ed } = crear((url, b) => {
    ultimoSistema = String(b.messages[0].content);
    if (!b.messages.some((m) => m.role === "tool") && /guarda/i.test(b.messages.at(-1).content)) return resp("", { tool_calls: [{ id: "c1", type: "function", function: { name: "guardar_memoria", arguments: '{"texto":"El coche de la empresa es un Seat azul","etiquetas":["coche"]}' } }] });
    return resp("Hecho.");
  });
  await ed.iniciar("basico");
  await ed.hablar("Guarda que el coche de la empresa es un Seat azul");
  assert.equal(ed.e.memoriaLarga.length, 1);
  const gastoMemory = ed.gastoAgente(ed.agente("Memory"), "mes");
  await ed.hablar("¿Recuerdas de qué color es el coche?");
  assert.match(ultimoSistema, /Seat azul/);
  assert.equal(ed.gastoAgente(ed.agente("Memory"), "mes"), gastoMemory);
});

test("Controller: freezing by bands and cap", async () => {
  const { ed } = crear(() => resp("x"));
  await conEquipo(ed);
  ed.e.ajustes.topeDiario = 1; ed.e.ajustes.topeMensual = 100;
  const red = ed.agente("Redactor"); red.prioridad = 2;
  const buscador = ed.agente("Buscador"); buscador.prioridad = 3;
  ed.apuntarGasto(ed.jefe(), 0.85);
  ed.aplicarPresupuesto();
  assert.equal(red.estado, "congelado");
  assert.equal(buscador.estado, "reposo");
  assert.equal(ed.jefe().estado, "reposo");
  ed.apuntarGasto(ed.jefe(), 0.06);   // 91 %
  ed.aplicarPresupuesto();
  assert.equal(buscador.estado, "congelado");
  assert.ok(ed.porRol("sabio").every((s) => s.estado === "congelado"), "the sages (priority 4) freeze before the cap");
  assert.equal(ed.jefe().estado, "reposo");
  ed.apuntarGasto(ed.jefe(), 0.1);    // 101 %
  ed.aplicarPresupuesto();
  assert.equal(ed.jefe().estado, "congelado");
  await assert.rejects(() => ed.hablar("hola"), /congelado/);
  ed.e.ajustes.topeDiario = 10;      // you raise the cap → they come back
  ed.aplicarPresupuesto();
  assert.equal(ed.jefe().estado, "reposo");
  assert.equal(red.estado, "reposo");
});

test("heartbeats: each agent wakes up at its own pace; without tasks it doesn't spend", async () => {
  const ahoraRef = { t: Date.parse("2026-11-04T10:00:00") };
  const { ed, llamadas } = crear(() => resp("avance"), ahoraRef);
  await conEquipo(ed);
  const red = ed.agente("Redactor");
  red.latido = { cada: 10, unidad: "min" }; red.alDespertar = "tareas";
  for (const a of ed.e.agentes) if (a !== red) a.proximo = 9e15;
  red.proximo = 0;
  await ed.tick();
  assert.equal(llamadas.length, 0, "heartbeat without tasks = 0 calls");
  const t1 = red.ultimo;
  ahoraRef.t += 5 * 60e3; await ed.tick();
  assert.equal(red.ultimo, t1, "at 5 minutes it isn't its turn yet");
  ahoraRef.t += 6 * 60e3; await ed.tick();
  assert.ok(red.ultimo > t1, "at 11 minutes it is");
  red.alDespertar = "objetivo"; red.objetivo = "Escribir una frase al día";
  ahoraRef.t += 11 * 60e3; await ed.tick();
  assert.ok(llamadas.length >= 1, "with an objective, the heartbeat works (and spends)");
});

// ---------- Fixes after the independent review ----------
test("the cap is checked before each call and the sages only once per conversation", async () => {
  let sabios = 0;
  const { ed } = crear((url, b) => {
    const sys = String(b.messages[0].content);
    if (sys.startsWith("Eres el jefe del edificio")) {
      const rondas = b.messages.filter((m) => m.role === "tool").length;
      if (rondas < 12) return resp("", { tool_calls: [1, 2, 3].map((i) => ({ id: "c" + rondas + i, type: "function", function: { name: "consultar_sabios", arguments: '{"pregunta":"¿Sí?"}' } })) });
      return resp("fin");
    }
    if (sys.includes("sabio del consejo")) { sabios++; return { json: { model: "m", choices: [{ message: { content: "consejo" } }], usage: { cost: 0.2 } } }; }
    return resp("x");
  });
  await ed.iniciar("basico");
  ed.e.ajustes.topeDiario = 1;
  await ed.hablar("Decisión importante").catch(() => {});
  assert.equal(sabios, 2, "a single query (two sages) per conversation");
  assert.ok(ed.gastoEdificio("hoy") < 1.1, "spending doesn't shoot above the cap: " + ed.gastoEdificio("hoy"));
});

test("deleting an agent or loading a template doesn't delete what was spent today", async () => {
  const { ed } = crear(() => resp("x"));
  await ed.iniciar("basico");
  ed.e.ajustes.topeDiario = 1;
  ed.apuntarGasto(ed.agente("Sabio 1"), 1.2);
  ed.aplicarPresupuesto();
  assert.equal(ed.jefe().estado, "congelado");
  await ed.ejecutar({ tipo: "borrarAgente", id: "sabio1" });
  ed.aplicarPresupuesto();
  assert.ok(ed.gastoEdificio("hoy") >= 1.2 && ed.jefe().estado === "congelado", "it keeps counting and stays frozen");
  await ed.ejecutar({ tipo: "plantilla", nombre: "vacio" });
  assert.ok(ed.gastoEdificio("hoy") >= 1.2 && ed.jefe().estado === "congelado", "also after changing template");
});

test("if the chat fails, the report that arrived meanwhile isn't deleted", async () => {
  let n = 0;
  const { ed } = crear(() => { n++; return { status: 500, json: { error: { message: "caído" } } }; });
  await conEquipo(ed);
  const p = ed.hablar("hola");
  ed.e.conversacion.push({ role: "informe", agente: "x", nombre: "Redactor", content: "informe importante", ts: 1 });
  await assert.rejects(p);
  assert.ok(ed.e.conversacion.some((m) => m.role === "informe"), "the report stays");
  assert.ok(!ed.e.conversacion.some((m) => m.role === "user"), "the failed message is removed");
});

test("a badly made backup is repaired when loaded", async () => {
  const { ed } = crear(() => resp("x"));
  await ed.iniciar("basico");
  await ed.ejecutar({ tipo: "importar", estado: JSON.stringify({ agentes: [{ id: "a", nombre: "Raro", rol: "trabajador", tareas: null, gasto: null, latido: null, memoriaCorta: "x", estado: "trabajando" }, { id: "a", nombre: "Duplicado" }] }) });
  const raro = ed.agente("Raro");
  assert.ok(Array.isArray(raro.tareas) && typeof raro.gasto === "object" && raro.latido.unidad && raro.estado !== "trabajando");
  assert.notEqual(ed.agente("Duplicado").id, "a", "repeated ids are renamed");
  assert.ok(ed.jefe(), "if the boss is missing, it's created");
  await ed.tick();
});

test("the checks and the sages aren't given tasks", async () => {
  const { ed } = crear((url, b) => {
    if (String(b.messages[0].content).startsWith("Eres el jefe del edificio") && !b.messages.some((m) => m.role === "tool"))
      return resp("", { tool_calls: [{ id: "c1", type: "function", function: { name: "asignar_tarea", arguments: '{"agente":"Memory","tarea":"x"}' } }, { id: "c2", type: "function", function: { name: "asignar_tarea", arguments: '{"agente":"Sabio 2","tarea":"y"}' } }] });
    return resp("vale");
  });
  await ed.iniciar("basico");
  await ed.hablar("reparte");
  assert.equal(ed.agente("Memory").tareas.length, 0);
  assert.equal(ed.agente("Sabio 2").tareas.length, 0);
  await assert.rejects(() => ed.ejecutar({ tipo: "asignarTarea", id: "jev", texto: "z" }), /control/);
});


// ---------- Version 5 ----------
test("floors: head office for the section head, offices and pool; if they fill up, they're enlarged", async () => {
  const { ed } = crear(() => resp("x"));
  await ed.iniciar("basico");
  const { id } = await ed.ejecutar({ tipo: "crearPlanta", nombre: "Ventas", funcion: "Buscar clientes" });
  assert.equal(ed.e.plantas[1].id, id, "the new floor is built on top, under the dome");
  await ed.ejecutar({ tipo: "crearAgente", ficha: { nombre: "Jefa de ventas", rol: "jefe_seccion", planta: id, cuerpo: "Diriges ventas y repartes el trabajo." } });
  await assert.rejects(() => ed.ejecutar({ tipo: "crearAgente", ficha: { nombre: "Otra jefa", rol: "jefe_seccion", planta: id } }), /despacho/);
  for (let i = 1; i <= 6; i++) await ed.ejecutar({ tipo: "crearAgente", ficha: { nombre: "Vendedor " + i, rol: "subagente", planta: id } });
  const p = ed.planta(id), r = reparto(ed.e, id);
  assert.equal(r.oficina.length, 6);
  assert.equal(p.oficinas, 6, "the sixth office is added by itself");
  assert.ok(r.oficina.every((a) => a.reportaA === r.despacho[0].id), "the sub-agents report to the section head");
  for (let i = 1; i <= 7; i++) await ed.ejecutar({ tipo: "crearAgente", ficha: { nombre: "Llamador " + i, rol: "subagente", planta: id, puesto: "pool" } });
  assert.equal(p.pools, 2, "7 in the pool: two pools of 6 are needed");
  await assert.rejects(() => ed.ejecutar({ tipo: "ampliarPlanta", id, que: "pool", cambio: -1 }), /muévelos/);
  await ed.ejecutar({ tipo: "ampliarPlanta", id, que: "oficina", cambio: 1 });
  assert.equal(p.oficinas, 7);
  await assert.rejects(() => ed.ejecutar({ tipo: "borrarPlanta", id }), /Primero mueve/);
  await assert.rejects(() => ed.ejecutar({ tipo: "borrarPlanta", id: "cupula" }), /no se pueden borrar/);
});

test("everything can be renamed and the look is saved clean", async () => {
  const { ed } = crear(() => resp("x"));
  await ed.iniciar("basico");
  await ed.ejecutar({ tipo: "ajustes", nombre: "Torre Norte", cambios: {} });
  await ed.ejecutar({ tipo: "editarPlanta", id: "tecnica", nombre: "Sala de máquinas", funcion: "Que todo funcione" });
  await ed.ejecutar({ tipo: "editarAgente", id: "jefe", cambios: { nombre: "Lola", aspecto: { p: "chica", ropa: "#123456", pelo: "rojo", ojos: "#00ff00" } } });
  assert.equal(ed.e.nombre, "Torre Norte");
  assert.equal(ed.planta("tecnica").nombre, "Sala de máquinas");
  assert.deepEqual(ed.jefe().aspecto, { p: "chica", ropa: "#123456", ojos: "#00ff00", pelo: null, piel: null });
  assert.equal(ed.agente("Lola").id, "jefe");
});

test("the Creator designs an agent with your words; it isn't created until you accept it", async () => {
  const ficha = { nombre: "Recetas", rol: "subagente", planta: "nueva", plantaNueva: { nombre: "Cocina", funcion: "Menús y compras" }, puesto: "pool", cuerpo: "Propones menús semanales sencillos y la lista de la compra.", objetivo: "Un menú cada domingo",
    nivel: "economico", latido: { cada: 7, unidad: "d" }, alDespertar: "objetivo", capacidades: ["escribir", "buscar", "pagos"], aspecto: { p: "abuela", ropa: "#C0392B" }, porque: "Barato y semanal." };
  const { ed, llamadas } = crear((url, b) => String(b.messages[0].content).startsWith("Eres el Creador de agentes") ? resp("Aquí va:\n" + JSON.stringify(ficha)) : resp("x"));
  await ed.iniciar("basico");
  const n = ed.e.agentes.length;
  const r = await ed.ejecutar({ tipo: "proponerAgente", texto: "quiero uno que me haga el menú de la semana" });
  assert.equal(ed.e.agentes.length, n, "proposing doesn't create");
  assert.equal(r.propuesta.ficha.nombre, "Recetas");
  assert.deepEqual(r.propuesta.ficha.capacidades, ["escribir", "hablar", "oir", "buscar"], "never capabilities that pay");
  assert.equal(r.propuesta.ficha.cerebro, elegirModelo("economico", ed.modelos));
  assert.equal(llamadas.at(-1).body.model, "anthropic/claude-sonnet-5.5", "the Creator thinks with a high brain");
  assert.ok(ed.gastoAgente(ed.agente("Creador de agentes"), "hoy") > 0);
  await ed.ejecutar({ tipo: "aceptarPropuesta", propuesta: r.propuesta.id });
  const nuevo = ed.agente("Recetas");
  assert.equal(ed.planta(nuevo.planta).nombre, "Cocina", "it also creates the floor that was needed");
  assert.equal(nuevo.puesto, "pool");
  assert.equal(nuevo.aspecto.p, "abuela");
  await assert.rejects(() => ed.ejecutar({ tipo: "aceptarPropuesta", propuesta: r.propuesta.id }), /pendiente/);
});

test("the boss asks the Creator for an agent and the proposal reaches the chat", async () => {
  const { ed } = crear((url, b) => {
    const sys = String(b.messages[0].content);
    if (sys.startsWith("Eres el jefe del edificio") && !b.messages.some((m) => m.role === "tool")) return resp("", { tool_calls: [{ id: "c1", type: "function", function: { name: "asignar_tarea", arguments: JSON.stringify({ agente: "Creador de agentes", tarea: "Un agente que vigile el correo", ahora: true }) } }] });
    if (sys.startsWith("Eres el jefe del edificio")) return resp("Se lo pido al Creador.");
    if (sys.startsWith("Eres el Creador de agentes")) return resp('{"nombre":"Cartero","rol":"subagente","planta":"tecnica","puesto":"oficina","cuerpo":"Vigilas el correo y avisas de lo importante.","nivel":"economico","latido":{"cada":1,"unidad":"h"}}');
    return resp("x");
  });
  await ed.iniciar("basico");
  await ed.hablar("Quiero un agente para el correo");
  await new Promise((res) => setTimeout(res, 30));
  const inf = ed.e.conversacion.find((m) => m.role === "informe" && m.propuesta);
  assert.ok(inf && /Cartero/.test(inf.content));
  assert.ok(!ed.agente("Cartero"), "it doesn't exist yet");
  await ed.ejecutar({ tipo: "aceptarPropuesta", propuesta: inf.propuesta });
  assert.equal(ed.agente("Cartero").planta, "tecnica");
});

test("Techie: check every other night, backup on Fridays, costs on Mondays (only then it spends)", async () => {
  const ahoraRef = { t: Date.parse("2026-11-04T03:00:00") };   // Wednesday
  const copias = [];
  const { ed, llamadas } = crear((url, b) => resp("Compensa el jefe; el Redactor no: bájale el latido."), ahoraRef);
  ed.o.copia = async (json, dia) => { copias.push(dia); };
  await conEquipo(ed);
  const red = ed.agente("Redactor");
  red.latido = { cada: 1, unidad: "h" }; red.ultimo = ahoraRef.t - 5 * 3600e3;
  ed.e.memoriaLarga.push({ id: "m1", ts: 1, texto: "El wifi es Casa24" }, { id: "m2", ts: 2, texto: "el  wifi es casa24" });
  const tecno = ed.agente("Tecno");
  let r = await ed.rondaTecno(tecno);
  assert.equal(llamadas.length, 0, "on a Wednesday the round doesn't spend");
  assert.ok(r.avisos.some((x) => /Redactor no deja señal/.test(x)), "it flags the one that doesn't work");
  assert.equal(ed.e.memoriaLarga.length, 1, "quita recuerdos repetidos");
  assert.ok(ed.e.conversacion.some((m) => m.role === "informe" && m.nombre === "Tecno"), "the warnings reach the boss");
  ahoraRef.t = Date.parse("2026-11-06T03:00:00");   // viernes
  red.ultimo = ahoraRef.t - 600e3;
  r = await ed.rondaTecno(tecno);
  assert.deepEqual(copias, ["2026-11-06"]);
  assert.ok(!r.avisos.length, "check in order: " + r.avisos.join(" | "));
  ed.apuntarGasto(red, 0.02);
  ahoraRef.t = Date.parse("2026-11-09T03:00:00");   // lunes
  r = await ed.rondaTecno(tecno);
  assert.equal(llamadas.length, 1, "on Mondays it judges whether it pays off (one call)");
  assert.match(r.texto, /Costes de los últimos 7 días/);
  assert.match(r.texto, /bájale el latido/);
});

test("Techie wakes up with its heartbeat and, if it's given something, it does it like anyone", async () => {
  const ahoraRef = { t: Date.parse("2026-11-04T10:00:00") };
  const { ed, llamadas } = crear((url, b) => String(b.messages[0].content).includes("el control externo") ? resp('{"veredicto":"vale"}') : resp("Hecho: ficha revisada."), ahoraRef);
  await ed.iniciar("basico");
  for (const a of ed.e.agentes) a.proximo = 9e15;
  const tecno = ed.agente("Tecno"); tecno.proximo = 0;
  await ed.tick();
  assert.ok(tecno.ultimo > 0 && llamadas.length === 0);
  ed.asignarTarea(tecno, "Revisa la ficha de Arturito", "jefe", true);
  const r = await ed.despertar("tecno");
  assert.equal(r.hecho, "hecha");
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
  let guardado = JSON.stringify(v4); const original = guardado, copias = [];
  const ed = new Edificio({ cargar: async () => guardado, guardar: async (j) => { guardado = j; }, copia: async (j, dia) => { copias.push([dia, j]); }, clave: () => "k", fetch: async () => ({}), ahora: () => Date.parse("2026-11-04T12:00:00") });
  ed.setModelos(MODELOS);
  await ed.iniciar();
  assert.deepEqual(copias, [["antes-de-v5", original]], "the version 4 building is saved as it was before rebuilding it");
  assert.deepEqual(ed.e.plantas.map((p) => p.nombre), ["Cúpula", "Planta técnica", "Ventas", "Vestíbulo"], "the untouched example floor is removed; yours comes along");
  const paco = ed.agente("Comercial Paco");
  assert.ok(paco && paco.planta === "p1" && paco.rol === "subagente" && paco.cuerpo === "Llamas a clientes de Madrid." && paco.tareas.length === 1, "your agent comes along with its instructions and its tasks");
  assert.ok(!ed.e.agentes.some((a) => a.nombre === "Buscador" || a.nombre === "Jefa de investigación"));
  assert.equal(ed.jefe().cuerpo, "Eres mi jefe y hablas poco.", "the instructions you gave the boss are kept");
  assert.equal(ed.jefe().tareas.length, 1);
  assert.equal(ed.jefe().cerebro, "openai/gpt-6-luna");
  assert.equal(ed.e.nombre, "Mi casa");
  assert.equal(ed.e.ajustes.topeDiario, 3);
  assert.equal(ed.e.memoriaLarga.length, 1);
  assert.equal(ed.gastoEdificio("hoy"), 0.5);
  const aviso = ed.e.conversacion.at(-1);
  assert.ok(aviso.role === "informe" && /Comercial Paco/.test(aviso.content) && /Investigación/.test(aviso.content) && /guardado aparte/.test(aviso.content), "it tells you what comes along and what is removed: " + aviso.content);
  assert.equal(JSON.parse(guardado).version, VERSION);
});

test("review: odd data doesn't open the cap or break the building", async () => {
  const { ed } = crear(() => resp("x"));
  await ed.iniciar("basico");
  const hoy = "2026-11-04";
  await ed.ejecutar({ tipo: "importar", estado: JSON.stringify({ agentes: [{ id: "jefe", rol: "jefe", nombre: "", aspecto: { p: "constructor" }, capacidades: ["escribir", "pagos"] }], plantas: [{ id: "cupula" }], gastoDias: { [hoy]: "0.5" }, ajustes: { topeDiario: 1 } }) });
  assert.equal(ed.jefe().aspecto.p, "chico", "a character that doesn't exist goes back to “chico”");
  assert.deepEqual(ed.jefe().capacidades.filter((c) => !["hablar", "oir"].includes(c)), ["escribir"], "the advanced capabilities can't be turned on, not even through a backup");
  assert.ok(ed.jefe().nombre.length > 0);
  assert.equal(ed.gastoEdificio("hoy"), 0.5, "spending saved as text counts as a number");
  ed.e.gastoDias[hoy] = NaN;
  assert.equal(ed.usoPresupuesto(), 1, "if the spending doesn't add up, the cap is considered reached");
  const antes = JSON.stringify(ed.e), reparar = ed.reparar;
  ed.reparar = function () { ed.reparar = reparar; throw new Error("rota"); };
  await assert.rejects(() => ed.ejecutar({ tipo: "importar", estado: JSON.stringify({ agentes: [] }) }), /dañada/);
  assert.equal(JSON.stringify(ed.e), antes, "if a backup can't be loaded, your building stays as it was");
});

test("review: the actions go to the exact agent, the name isn't left empty and the boss stays in the dome", async () => {
  const { ed } = crear(() => resp("x"));
  await ed.iniciar("basico");
  const { id } = await ed.ejecutar({ tipo: "crearPlanta", nombre: "Soporte" });
  await ed.ejecutar({ tipo: "crearAgente", ficha: { nombre: "Tec", planta: id } });
  await ed.ejecutar({ tipo: "borrarAgente", id: "tecno" });
  await assert.rejects(() => ed.ejecutar({ tipo: "borrarAgente", id: "tecno" }), /No existe/);
  assert.ok(ed.agente("Tec"), "an old id doesn't delete another that looks like it");
  await ed.ejecutar({ tipo: "editarAgente", id: "arturito", cambios: { nombre: "   " } });
  assert.equal(ed.agente("arturito").nombre, "Arturito");
  await ed.ejecutar({ tipo: "editarAgente", id: "jefe", cambios: { planta: id, puesto: "centro" } });
  assert.equal(ed.jefe().planta, "cupula");
});

test("review: the Creator's proposal says when it wakes up and what it spends", async () => {
  const { ed } = crear((url, b) => String(b.messages[0].content).startsWith("Eres el Creador de agentes")
    ? resp('{"nombre":"Vigía","rol":"subagente","planta":"tecnica","puesto":"oficina","cuerpo":"Vigilas todo.","nivel":"alto","latido":{"cada":1,"unidad":"min"},"alDespertar":"objetivo","capacidades":["buscar"],"porque":"gastará casi nada"}')
    : resp("x"));
  await ed.iniciar("basico");
  const r = await ed.trabajarCreador(ed.agente("creador"), { texto: "uno que vigile", de: "jefe", implicita: true });
  assert.match(r.texto, /Despierta cada minuto y cada vez avanza en su objetivo \(gasta en cada latido\)/);
  assert.match(r.texto, /claude-sonnet-5\.5 \(alto\)/);
  assert.match(r.texto, /Buscar en internet/);
  const pr = ed.e.propuestas.at(-1);
  await ed.ejecutar({ tipo: "borrarPlanta", id: "tecnica" }).catch(() => {});
  ed.e.plantas = ed.e.plantas.filter((p) => p.id !== "tecnica");
  await assert.rejects(() => ed.ejecutar({ tipo: "aceptarPropuesta", propuesta: pr.id }), /ya no existe/);
});

test("the built-in agents can be deleted and put back", async () => {
  const { ed } = crear(() => resp("x"));
  await ed.iniciar("basico");
  await ed.ejecutar({ tipo: "borrarAgente", id: "arturito" });
  await ed.ejecutar({ tipo: "borrarAgente", id: "memory" });
  assert.ok(!ed.agente("Arturito") && !ed.agente("Memory"));
  const r = await ed.ejecutar({ tipo: "restaurarSerie" });
  assert.deepEqual(r.vueltos.sort(), ["Arturito", "Memory"]);
  assert.deepEqual(r.sinSitio, []);
  assert.equal(reparto(ed.e, "vestibulo").recepcion[0].nombre, "Memory");
  await ed.ejecutar({ tipo: "plantilla", nombre: "vacio" });
  assert.deepEqual(ed.e.agentes.map((a) => a.nombre).sort(), ["Jefe"], "empty: only the boss (memory works without Memory)");
  assert.deepEqual(ed.e.plantas.map((p) => p.tipo), ["cupula", "vestibulo"]);
});

// ---------- Version 6 ----------
test("coins: the gold or the red one becomes a lesson for its role; 5 per role (changed in Settings) and pinned ones don't go", async () => {
  let ultimoSistema = "";
  const { ed } = crear((url, b) => { if (b.messages) ultimoSistema = String(b.messages[0].content); return resp("ok"); });
  await conEquipo(ed);
  const red = ed.agente("Redactor"), bus = ed.agente("Buscador");
  await assert.rejects(() => ed.ejecutar({ tipo: "moneda.dar", id: red.id, tipoMoneda: "oro", motivo: "  " }), /motivo/);
  await ed.ejecutar({ tipo: "moneda.dar", id: red.id, tipoMoneda: "oro", motivo: "Resumen claro y con fuentes" });
  await ed.ejecutar({ tipo: "moneda.dar", id: red.id, tipoMoneda: "roja", motivo: "Se inventó una cifra" });
  assert.equal(ed.leccionesDe("subagente").length, 0, "v7: the lesson waits for your yes");
  await aprobarLecciones(ed);
  assert.deepEqual(ed.leccionesDe("subagente").map((l) => l.texto), ["Hazlo así: Resumen claro y con fuentes", "No lo hagas: Se inventó una cifra"]);
  ed.asignarTarea(bus, "Algo", "", true);
  await ed.despertar(bus.id);
  assert.match(ultimoSistema, /Lecciones de tu papel:/, "another agent with the same role sees them");
  assert.match(ultimoSistema, /No lo hagas: Se inventó una cifra/);
  const primera = ed.leccionesDe("subagente")[0];
  await ed.ejecutar({ tipo: "leccion.fijar", leccion: primera.id, fija: true });
  for (let i = 1; i <= 6; i++) { await ed.ejecutar({ tipo: "moneda.dar", id: bus.id, tipoMoneda: "oro", motivo: "Bien " + i }); await aprobarLecciones(ed); }
  const ls = ed.leccionesDe("subagente");
  assert.equal(ls.filter((l) => !l.fija).length, 5, "5 per role, not counting the pinned ones");
  assert.equal(ls.length, 6, "the 5 and the pinned one");
  assert.ok(ls.some((l) => l.id === primera.id), "the pinned one doesn't go even if it's the oldest");
  assert.ok(!ls.some((l) => l.texto.endsWith("Se inventó una cifra")), "the oldest unpinned one goes");
  await ed.ejecutar({ tipo: "ajustes", cambios: { leccionesPorPapel: 2 } });
  assert.equal(ed.leccionesDe("subagente").length, 3, "2 and the pinned one");
  for (let i = 0; i < 5; i++) { const l = ed.leccionesDe("subagente").find((x) => !x.fija); if (l) await ed.ejecutar({ tipo: "leccion.fijar", leccion: l.id, fija: true }); }
  await ed.ejecutar({ tipo: "moneda.dar", id: bus.id, tipoMoneda: "oro", motivo: "Nueva tras fijar" });
  await aprobarLecciones(ed);
  assert.ok(ed.leccionesDe("subagente").some((l) => l.texto.endsWith("Nueva tras fijar")), "even if they're all pinned, the new one gets in");
  assert.equal(ed.leccionesDe("jefe").length, 0, "lessons belong to their role, not to everyone");
});

test("the Controller proposes a red coin for whoever reaches their cap; you confirm it or dismiss it", async () => {
  const { ed } = crear(() => resp("x"));
  await conEquipo(ed);
  const red = ed.agente("Redactor"); red.topeDiario = 0.01;
  ed.apuntarGasto(red, 0.02); ed.aplicarPresupuesto();
  const m = ed.e.monedas.find((x) => x.propone === "interventor");
  assert.ok(m && m.tipo === "roja" && m.estado === "propuesta" && m.agente === red.id);
  assert.equal(ed.leccionesDe("subagente").length, 0, "proposal: it isn't a lesson yet");
  await ed.ejecutar({ tipo: "moneda.confirmar", moneda: m.id });
  await aprobarLecciones(ed);
  assert.equal(ed.leccionesDe("subagente").length, 1);
  ed.aplicarPresupuesto();
  assert.equal(ed.e.monedas.filter((x) => x.propone === "interventor").length, 1, "it doesn't repeat it the same day");
});

test("each agent has its own chat, with its brain and its instructions", async () => {
  const { ed, llamadas } = crear((url, b) => resp("Soy " + (String(b.messages[0].content).startsWith("Eres Tecno") ? "Tecno" : "otro")));
  await ed.iniciar("basico");
  const r = await ed.ejecutar({ tipo: "hablar", agente: "tecno", texto: "¿Qué tal las copias?" });
  assert.equal(r.respuesta, "Soy Tecno");
  assert.equal(r.agente, "tecno");
  assert.equal(llamadas.at(-1).body.model, ed.agente("tecno").cerebro);
  assert.equal(ed.agente("tecno").chat.length, 2);
  assert.equal(ed.e.conversacion.length, 0, "it doesn't get mixed with the boss's chat");
  assert.ok(!(llamadas.at(-1).body.tools || []).some((t) => t.function.name === "asignar_tarea"), "sharing out work is still the boss's job");
  await assert.rejects(() => ed.ejecutar({ tipo: "hablar", agente: "memory", texto: "hola" }), /sin cerebro/);
  await ed.ejecutar({ tipo: "conversacion.nueva", id: "tecno" });
  assert.equal(ed.agente("tecno").chat.length, 0);
});

test("meeting rooms: up to 10 at the table, agenda, the boss chairs, rounds and minutes", async () => {
  const { ed, llamadas } = crear((url, b) => {
    const u = String(b.messages.at(-1).content);
    if (u.includes("Escribe el acta")) return resp("## Conclusiones\n- Vamos bien\n## Decisiones\n- Seguir");
    return resp("Intervención");
  });
  await ed.iniciar("basico");
  await assert.rejects(() => ed.ejecutar({ tipo: "reunion.convocar", titulo: "X", ordenDelDia: "", participantes: ["tecno"] }), /orden del día/);
  const muchos = ["sabio1", "sabio2", "tecno", "arturito", "creador", "jev", "interventor", "memory"];
  await ed.ejecutar({ tipo: "crearPlanta", nombre: "P" });
  for (let i = 0; i < 5; i++) await ed.ejecutar({ tipo: "crearAgente", ficha: { nombre: "Extra " + i, planta: ed.e.plantas[1].id } });
  await assert.rejects(() => ed.ejecutar({ tipo: "reunion.convocar", titulo: "X", ordenDelDia: "Y", participantes: [...muchos, "Extra 0", "Extra 1", "Extra 2", "Extra 3", "Extra 4"] }), /caben 10/);
  const sin = await ed.ejecutar({ tipo: "reunion.convocar", titulo: "X", ordenDelDia: "Y", participantes: ["jev", "interventor", "memory", "tecno"], rondas: 12 });
  const rs = ed.e.reuniones.find((x) => x.id === sin.id);
  assert.deepEqual(rs.participantes, ["jefe", "tecno"], "JEV, the Controller and Memory don't sit down: they don't hold conversations");
  assert.equal(rs.rondas, 12, "the rounds have no invented cap");
  const { id, estimacion } = await ed.ejecutar({ tipo: "reunion.convocar", titulo: "Plan de noviembre", ordenDelDia: "1. Gasto\n2. Mejoras", participantes: ["tecno", "arturito"], rondas: 2 });
  assert.equal(estimacion.llamadas, 2 * 2 + 2 + 1);
  await ed.celebrarReunion(id);
  const r = ed.e.reuniones.find((x) => x.id === id);
  assert.equal(r.estado, "terminada");
  assert.equal(r.intervenciones.length, 2 * (1 + 2), "per round: the boss chairs and both speak");
  assert.ok(r.intervenciones[0].modera);
  assert.match(r.acta, /## Conclusiones[\s\S]*## Decisiones/);
  assert.ok(ed.e.conversacion.some((m) => m.reunion === id && /Acta de «Plan de noviembre»/.test(m.content)), "the minutes reach the boss's chat");
  assert.ok(r.coste > 0 && llamadas.length === 7);
});

test("the boss calls a meeting: it stays proposed until you confirm the rounds", async () => {
  const { ed } = crear((url, b) => {
    const sys = String(b.messages[0].content);
    if (sys.startsWith("Eres el jefe del edificio") && !b.messages.some((m) => m.role === "tool") && b.tools) return resp("", { tool_calls: [{ id: "c1", type: "function", function: { name: "convocar_reunion", arguments: JSON.stringify({ titulo: "Costes", orden_del_dia: "Revisar el gasto", participantes: ["Tecno", "Interventor"], rondas: 3 }) } }] });
    return resp("ok");
  });
  await ed.iniciar("basico");
  const r = await ed.hablar("Reúne a Tecno y al Interventor para hablar del gasto");
  assert.ok(r.eventos.includes("reunión propuesta"));
  const re = ed.e.reuniones.at(-1);
  assert.equal(re.estado, "propuesta"); assert.equal(re.convoca, "jefe"); assert.equal(re.rondas, 3);
  assert.equal(ed.e.conversacion.at(-1).reunion, re.id, "the chat shows the proposal to confirm it");
  await ed.ejecutar({ tipo: "reunion.empezar", reunion: re.id, rondas: 1 });
  await new Promise((res) => setTimeout(res, 50));
  assert.equal(re.rondas, 1);
  assert.equal(re.estado, "terminada");
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
  assert.deepEqual(L.map((m) => tipoModelo(m)), ["texto", "imagen", "musica", "voz", "oido", "decisiones", "otros"]);
  const rec = recomendadosIniciales(L.map((m) => ({ id: m.id, inPrice: +m.pricing.prompt, outPrice: +m.pricing.completion, out: m.architecture.output_modalities })));
  assert.ok(rec.musica && Object.values(rec.musica).flat().includes("google/lyria-3-pro-preview"));
  const { ed } = crear((url, b) => resp("Informe del día.\nRECOMENDADO: economico | texto | openai/gpt-6-luna | Igual de bueno y más barato\nRECOMENDADO: alto | texto | no/existe | x"));
  await ed.iniciar("basico");
  assert.ok(ed.e.ajustes.recomendados && ed.e.ajustes.recomendados.texto, "starting recommendations");
  ed.e.modelosVistos = ed.e.modelosVistos.filter((x) => x !== "openai/gpt-6-luna");
  const art = ed.agente("arturito");
  ed.asignarTarea(art, "Informe", "", true);
  await ed.despertar(art.id);
  const pm = ed.e.propuestasModelos;
  assert.equal(pm.length, 1, "only models that exist");
  await ed.ejecutar({ tipo: "modelo.aceptar", propuesta: pm[0].id });
  assert.equal(ed.e.ajustes.recomendados.texto.economico[0], "openai/gpt-6-luna");
  assert.ok(ed.e.modelosVistos.includes("openai/gpt-6-luna"));
});

test("create music: the agent's music model; the audio arrives in parts", async () => {
  const sse = ['data: {"choices":[{"delta":{"audio":{"data":"QUJD","format":"mp3"}}}]}', 'data: {"choices":[{"delta":{"audio":{"data":"REVG"}}}],"usage":{"cost":0.03}}', "data: [DONE]"].join("\n");
  const { ed, llamadas } = crear(() => ({ text: sse, json: {} }));
  await ed.iniciar("basico");
  const j = ed.jefe(); j.modeloMusica = "google/lyria-3-pro-preview";
  const m = await ed.crearMusica(j, "Música alegre para un vídeo");
  assert.equal(m.url, "data:audio/mpeg;base64,QUJDREVG");
  assert.equal(llamadas.at(-1).body.model, "google/lyria-3-pro-preview");
  assert.deepEqual(llamadas.at(-1).body.modalities, ["text", "audio"]);
  assert.equal(ed.gastoAgente(j, "hoy"), 0.03);
});

test("the Creator, when the boss gives it the job, asks JEV first", async () => {
  const { ed, llamadas } = crear((url) => (url === DECISIONES ? jevDice("parar") : resp('{"nombre":"X"}')));
  await ed.iniciar("basico");
  const cr = ed.agente("creador");
  ed.asignarTarea(cr, "Un agente para el correo", "jefe", true);
  const r = await ed.despertar(cr.id);
  assert.equal(r.hecho, "parada");
  assert.equal(ed.e.consultasJev.at(-1).tipo, "crear_agente");
  assert.equal(llamadas.filter((l) => l.url !== DECISIONES).length, 0, "it doesn't spend on designing it");
  assert.match(ed.e.conversacion.at(-1).content, /JEV dice/);
});

test("a version 5 building moves to 6: the higher brain goes and JEV decides with Jev", async () => {
  const { ed } = crear(() => resp("x"));
  await ed.iniciar("basico");
  const v5 = JSON.parse(JSON.stringify(ed.e));
  v5.version = "5.0";
  for (const a of v5.agentes) a.cerebroSuperior = "anthropic/claude-sonnet-5.5";
  const jev = v5.agentes.find((a) => a.rol === "jev");
  jev.cerebro = "openai/gpt-6-luna"; jev.cuerpo = "Eres JEV, el control externo. Revisas el trabajo de los demás antes de darlo por bueno: que no invente datos sin fuente, que no repita trabajo ya hecho y que no gaste en algo innecesario. Eres estricto pero justo.";
  delete v5.monedas; delete v5.reuniones;
  await ed.ejecutar({ tipo: "importar", estado: JSON.stringify(v5) });
  assert.ok(!ed.e.agentes.some((a) => "cerebroSuperior" in a));
  assert.equal(ed.agente("jev").cerebro, MODELO_JEV);
  assert.match(ed.agente("jev").cuerpo, /seguir, aprovechar lo que ya hay, parar o preguntar al jefe/);
  assert.ok(Array.isArray(ed.e.monedas) && Array.isArray(ed.e.reuniones));
});

test("v6 review: a variable price (-1) is never “free” or recommended; music with no reported cost is charged per request", async () => {
  const auto = { id: "openrouter/auto", pricing: { prompt: "-1", completion: "-1" }, architecture: { output_modalities: ["text"] } };
  assert.equal(nivelDePrecio(auto), "variable");
  const rec = recomendadosIniciales([auto, { id: "a/gratis:free", pricing: { prompt: "0", completion: "0" }, architecture: { output_modalities: ["text"] } }]);
  assert.ok(!Object.values(rec.texto || {}).flat().includes("openrouter/auto"));
  const lyria = { id: "google/lyria-3-clip-preview", pricing: { prompt: "0", completion: "0", request: "0.04" }, architecture: { output_modalities: ["text", "audio"] } };
  assert.equal(nivelDePrecio(lyria), "medio", "it's charged per song, it isn't free");
  const sse = 'data: {"choices":[{"delta":{"audio":{"data":"AAAA","format":"mp3"}}}]}\n\ndata: [DONE]\n\n';
  const { ed } = crear((url) => ({ status: 200, text: sse }));
  ed.setModelos([...MODELOS, lyria]);
  await ed.iniciar("basico");
  ed.e.ajustes.modeloMusica = lyria.id;
  const r = await ed.crearMusica(ed.jefe(), "Una sintonía");
  assert.equal(r.coste, 0.04, "no cost in the reply: the price per request");
  const { ed: ed2 } = crear(() => ({ status: 200, text: 'data: {"error":{"code":402,"message":"sin crédito"}}\n\n' }));
  ed2.setModelos([...MODELOS, lyria]); await ed2.iniciar("basico"); ed2.e.ajustes.modeloMusica = lyria.id;
  await assert.rejects(() => ed2.crearMusica(ed2.jefe(), "x"), (e) => !/no devolvió audio/.test(e.message), "an error halfway is counted as it is");
});

// v9: the engine is written in English; everything it said in these Spanish buildings was in textos/es.js
test("v9: everything the engine said in Spanish was in the dictionary", () => {
  assert.deepEqual([...SIN_TRADUCIR].filter((x) => !["min", "h"].includes(x)), []);
});
