// Pruebas del motor en INGLÉS (versión 8.2): un edificio en inglés nace en inglés, se habla en inglés con cada agente
// y nada de lo que el motor dice o apunta se queda sin traducir. Ejecutar: node --test pruebas/motor82.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { Edificio, SIN_TRADUCIR, fmt, textoLatido, IDIOMA, fijarIdioma, notasMemoriaMd } from "../engine.js";

const M = (id, prompt, completion) => ({ id, name: id, pricing: { prompt: String(prompt), completion: String(completion) }, architecture: { input_modalities: ["text"], output_modalities: ["text"] }, context_length: 200000 });
const MODELOS = [M("anthropic/claude-opus-5.5", 0.000004, 0.00002), M("anthropic/claude-sonnet-5.5", 0.000002, 0.00001), M("openai/gpt-6.1-sol", 0.000002, 0.00001), M("openai/gpt-6-luna", 0.0000001, 0.0000005), M("deepseek/deepseek-v4.1-flash", 0.00000015, 0.0000006)];
const resp = (content, extra = {}) => ({ json: { model: "m", choices: [{ message: Object.assign({ content }, extra) }], usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.001 } } });
const ESPANOL = /\b(Eres|Tu nombre|Te llamas|Regla:|Fecha y hora|Organigrama|Objetivos del edificio|Puedes usar|Responde|Estás|Lección|Moneda|Reunión|jefe|sabio|edificio|planta|tarea)\b/;

function crear(guion) {
  const llamadas = [];
  let guardado = null;
  const ahoraRef = { t: Date.parse("2026-11-09T10:00:00") };   // un lunes
  const fetch = async (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : {};
    llamadas.push({ url, body });
    const r = guion(url, body, llamadas);
    const texto = typeof r.text === "string" ? r.text : JSON.stringify(r.json);
    return { ok: (r.status || 200) < 400, status: r.status || 200, headers: { get: () => null }, json: async () => r.json, text: async () => texto };
  };
  const ed = new Edificio({ cargar: async () => guardado, guardar: async (j) => { guardado = j; }, clave: () => "sk-or-test", claves: () => ({}), fetch, ahora: () => ahoraRef.t });
  ed.setModelos(MODELOS);
  return { ed, llamadas, ahoraRef };
}
const sistemas = (ll) => ll.filter((x) => x.body && x.body.messages).map((x) => String(x.body.messages[0].content));

test("un edificio nuevo en inglés: nombres, plantas e instrucciones en inglés", async () => {
  const { ed } = crear(() => resp("ok"));
  await ed.iniciar("basico", "en");
  assert.equal(ed.e.idioma, "en");
  assert.deepEqual(ed.e.plantas.map((p) => p.nombre), ["Dome", "Tech floor", "Lobby"]);
  assert.deepEqual(ed.e.agentes.map((a) => a.nombre), ["Boss", "Sage 1", "Sage 2", "Techie", "Artie", "Agent Creator", "JEV", "Controller", "Memory"]);
  for (const a of ed.e.agentes) assert.doesNotMatch(a.cuerpo || "", /\b(Eres|Vigilas|Guardas)\b/, a.nombre);
  assert.equal(IDIOMA, "en");
  assert.equal(fmt(0.0123), "$0.0123");
  assert.equal(textoLatido({ cada: 3, unidad: "d" }), "every 3 days");
  fijarIdioma("es"); assert.equal(fmt(0.0123), "0,0123 $"); assert.equal(textoLatido({ cada: 3, unidad: "d" }), "cada 3 días"); fijarIdioma("en");
});

test("lo que se dice a los agentes, en inglés: chat, tarea con MISSING, ronda de Tecno, sabios, reunión, Creador y lección", async () => {
  const { ed, llamadas, ahoraRef } = crear((url, body) => {
    const s = body.messages ? String(body.messages[0].content) : "";
    const u = body.messages ? String(body.messages[body.messages.length - 1].content) : "";
    if (/alpha\/decisions/.test(url)) return { json: { answers: { decision: { choice: "seguir", probabilities: { seguir: 0.9 } } }, usage: { cost: 0.00002 } } };
    if (s.startsWith("You are the Agent Creator")) return resp(JSON.stringify({ nombre: "Chef", rol: "subagente", planta: "nueva", plantaNueva: { nombre: "Kitchen", funcion: "Menus" }, puesto: "pool", cuerpo: "You cook.", objetivo: "A menu", nivel: "economico", latido: { cada: 7, unidad: "d" }, alDespertar: "tareas", capacidades: ["escribir"], aspecto: { p: "chica" }, porque: "Cheap." }));
    if (s.startsWith("You turn the reason for a coin")) return resp("Check the facts before answering.");
    if (u.startsWith("Task:") && s.includes("Your name is Artie")) return resp("MISSING: a list of AI newsletters.");
    if (s.startsWith("You are the building's boss") && /sages/i.test(u) && !body.messages.some((m) => m.role === "tool")) return resp("", { tool_calls: [{ id: "t1", type: "function", function: { name: "consultar_sabios", arguments: JSON.stringify({ pregunta: "Should we open a new office?" }) } }] });
    if (s.startsWith("You are the building's boss") && /meeting/i.test(u) && !body.messages.some((m) => m.role === "tool")) return resp("", { tool_calls: [{ id: "t2", type: "function", function: { name: "convocar_reunion", arguments: JSON.stringify({ titulo: "Weekly plan", orden_del_dia: "Agenda: decide the week.", participantes: ["Techie"], rondas: 1 }) } }] });
    return resp("Done. NOTHING else.".startsWith("x") ? "" : "Here is my answer.");
  });
  await ed.iniciar("basico", "en");
  await ed.ejecutar({ tipo: "pausa", pausa: false });
  // chat con el jefe y con un agente
  await ed.ejecutar({ tipo: "hablar", texto: "Hello" });
  await ed.ejecutar({ tipo: "hablar", agente: "tecno", texto: "How is everything?" });
  // el jefe consulta a los sabios y convoca una reunión
  await ed.ejecutar({ tipo: "hablar", texto: "Ask the sages whether we should open an office" });
  await ed.ejecutar({ tipo: "hablar", texto: "Call a meeting with Tecno" });
  const reu = ed.e.reuniones.at(-1);
  assert.ok(reu, "el jefe propone la reunión");
  await ed.ejecutar({ tipo: "reunion.empezar", reunion: reu.id, rondas: 1 });
  for (let i = 0; i < 40 && ed.e.reuniones.at(-1).estado !== "terminada"; i++) await new Promise((r) => setTimeout(r, 25));
  assert.equal(ed.e.reuniones.at(-1).ordenDelDia, "decide the week.", "sin repetir «Agenda:»");
  // una tarea que no puede hacer: MISSING
  await ed.ejecutar({ tipo: "asignarTarea", id: "arturito", texto: "Send me the AI news" });
  await ed.ejecutar({ tipo: "despertar", id: "arturito" });
  const art = ed.agente("arturito");
  assert.ok(art.falta && /newsletters/.test(art.falta.texto), "MISSING: se entiende");
  assert.match(art.tareas.at(-1).resultado, /^Missing: /);
  // Tecno hace su ronda de los lunes (con revisión de costes)
  await ed.ejecutar({ tipo: "despertar", id: "tecno" });
  // el Creador diseña un agente
  const p = await ed.ejecutar({ tipo: "proponerAgente", texto: "One that plans the weekly menu" });
  assert.equal(p.propuesta.ficha.nombre, "Chef");
  // una moneda con su lección
  await ed.ejecutar({ tipo: "moneda.dar", id: "tecno", tipoMoneda: "oro", motivo: "Clear and short" });
  // el día siguiente: parte del Interventor
  ahoraRef.t += 86400e3; await ed.tick();
  // la bandeja, las notas de la memoria y los avisos
  ed.guardarMemoria("The owner prefers one-page reports", ["reports"], "tú");
  const notas = notasMemoriaMd(ed.e.memoriaLarga, {});
  assert.match(notas.find((n) => /reports/.test(n.ruta)).texto, /What the agents have learned about “reports”/);
  const bandeja = ed.bandeja();
  assert.ok(bandeja.length >= 2);
  // todo lo que se mandó a los cerebros, en inglés
  const s = sistemas(llamadas);
  mkdirSync(new URL("./capturas/", import.meta.url), { recursive: true });   // en una copia recién bajada de GitHub no existe
  writeFileSync(new URL("./capturas/motor82-prompts.txt", import.meta.url), s.join("\n\n==========\n\n"));
  assert.ok(s.length >= 8, "hubo llamadas");
  // (al Creador se le dan las claves del JSON tal cual: «nombre», «planta»… son nombres de campos, no texto)
  for (const x of s) if (!x.startsWith("You are the Agent Creator")) assert.doesNotMatch(x, ESPANOL, x.slice(0, 200));
  assert.ok(s.some((x) => x.startsWith("You are the Agent Creator") && x.includes("Reply ONLY with a JSON object") && x.includes("Floors of the building:")));
  for (const x of llamadas.filter((y) => y.body && y.body.messages)) for (const m of x.body.messages) if (m.role === "user" || m.role === "system") assert.doesNotMatch(String(m.content), /\b(Tarea:|Lo dicho|Transcripción|Escribe el acta|Orden del día|ME FALTA)\b/, String(m.content).slice(0, 160));
  // lo que apunta el motor (actividad) y la bandeja, en inglés
  for (const r of ed.e.registro) assert.doesNotMatch(r.texto, /\b(latido|tarea|ronda|gasto|moneda|reunión|lección|cerebro|despierta|guardado)\b/, r.texto);
  for (const b of bandeja) assert.doesNotMatch(`${b.que} ${b.detalle || ""}`, /\b(Lección|Moneda|Reunión|llamadas|Dice que)\b/, b.que);
  // y nada se pidió que no esté en el diccionario
  assert.deepEqual([...SIN_TRADUCIR].filter((x) => !["min", "h"].includes(x)), []);
});

test("cambiar el idioma del edificio: lo de serie cambia de idioma; lo que escribió el dueño, no", async () => {
  const { ed, llamadas } = crear(() => resp("ok"));
  await ed.iniciar("basico", "en");
  // lo que escribe el dueño: renombra a Sage 2, crea una planta y cambia las instrucciones de Techie
  await ed.ejecutar({ tipo: "editarAgente", id: "sabio2", cambios: { nombre: "Consejera ChatGPT Pro" } });
  const pl = await ed.ejecutar({ tipo: "crearPlanta", nombre: "Redes Sociales", funcion: "Publicar" });
  await ed.ejecutar({ tipo: "editarAgente", id: "tecno", cambios: { cuerpo: "Mis instrucciones." } });
  const r = await ed.ejecutar({ tipo: "idioma", idioma: "es" });
  assert.equal(ed.e.idioma, "es");
  assert.ok(r.cambiados > 10, "cambió lo de serie");
  assert.deepEqual(ed.e.agentes.map((a) => a.nombre), ["Jefe", "Sabio 1", "Consejera ChatGPT Pro", "Tecno", "Arturito", "Creador de agentes", "JEV", "Interventor", "Memory"]);
  assert.deepEqual(ed.e.plantas.filter((p) => p.id !== pl.id).map((p) => p.nombre), ["Cúpula", "Planta técnica", "Vestíbulo"]);
  assert.equal(ed.planta(pl.id).nombre, "Redes Sociales");
  assert.equal(ed.e.nombre, "Mi edificio");
  assert.match(ed.agente("jefe").cuerpo, /^Eres el jefe del edificio/);
  assert.match(ed.agente("arturito").cuerpo, /^Eres Arturito/);
  assert.match(ed.agente("arturito").objetivo, /^Un informe diario/);
  assert.equal(ed.agente("tecno").cuerpo, "Mis instrucciones.", "las instrucciones que cambió el dueño se quedan");
  await ed.ejecutar({ tipo: "hablar", texto: "Hola" });
  assert.match(sistemas(llamadas).at(-1), /^Eres el jefe del edificio/);
  assert.match(sistemas(llamadas).at(-1), /Te llamas Jefe\. Tu papel: Jefe\./);
  // el botón «Volver a los nombres de serie»
  const b = await ed.ejecutar({ tipo: "nombresDeSerie" });
  assert.equal(b.cambiados, 1);
  assert.equal(ed.agente("sabio2").nombre, "Sabio 2");
  assert.equal(ed.planta(pl.id).nombre, "Redes Sociales", "lo que creó el dueño no cambia");
  // y otra vez a inglés
  await ed.ejecutar({ tipo: "idioma", idioma: "en" });
  assert.deepEqual(ed.e.agentes.map((a) => a.nombre), ["Boss", "Sage 1", "Sage 2", "Techie", "Artie", "Agent Creator", "JEV", "Controller", "Memory"]);
  assert.deepEqual(ed.e.plantas.map((p) => p.nombre).sort(), ["Dome", "Lobby", "Redes Sociales", "Tech floor"]);
  assert.equal(ed.e.nombre, "My building");
  assert.match(ed.agente("jefe").cuerpo, /^You are the building's boss/);
  assert.equal(ed.agente("tecno").cuerpo, "Mis instrucciones.");
  // los edificios de antes de la 8.2 (en español), y los textos de serie de versiones anteriores
  const v = crear(() => resp("ok"));
  await v.ed.iniciar("basico");
  assert.equal(v.ed.e.idioma, "es");
  assert.equal(v.ed.e.agentes[0].nombre, "Jefe");
  v.ed.agente("arturito").cuerpo = "Eres Arturito, el de la mejora continua. Conoces cómo está montado este edificio, sigues cada día cómo avanzan los agentes de IA fuera " +
    "y propones al jefe mejoras concretas: funciones nuevas, cambios de estructura, agentes que faltan o sobran. Tu trabajo es mejorar el edificio, no ganar dinero: " +
    "si ves una idea de negocio, se la pasas al jefe. Cada propuesta, con su porqué y lo que costaría.";   // el de la versión 5
  await v.ed.ejecutar({ tipo: "idioma", idioma: "en" });
  assert.equal(v.ed.agente("arturito").nombre, "Artie");
  assert.match(v.ed.agente("arturito").cuerpo, /^You are Artie/);
});

test("edificios con historia: ya marcado en inglés con nombres en español, o con ids antiguos; siempre pasan a inglés", async () => {
  // 1) el edificio ya dice «en» pero conserva los nombres en español (lo que dejaba la 8.2): al pulsar English, se arreglan
  const a = crear(() => resp("ok"));
  await a.ed.iniciar("basico");
  a.ed.e.idioma = "en";
  const r = await a.ed.ejecutar({ tipo: "idioma", idioma: "en" });
  assert.ok(r.cambiados > 10);
  assert.deepEqual(a.ed.e.agentes.map((x) => x.nombre), ["Boss", "Sage 1", "Sage 2", "Techie", "Artie", "Agent Creator", "JEV", "Controller", "Memory"]);
  assert.deepEqual(a.ed.e.plantas.map((x) => x.nombre), ["Dome", "Tech floor", "Lobby"]);
  // 2) ids que no son los de serie (edificios muy antiguos): se reconocen por su papel, su tipo o su nombre de serie
  const b = crear(() => resp("ok"));
  await b.ed.iniciar("basico");
  const j = b.ed.agente("jefe"); const s2 = b.ed.agente("sabio2");
  for (const x of b.ed.e.agentes) { if (x.reportaA) x.reportaA = x.reportaA === "jefe" ? "ag_viejo1" : x.reportaA; }
  j.id = "ag_viejo1"; s2.id = "ag_viejo2";
  b.ed.e.plantas.find((p) => p.id === "cupula").id = "direccion";
  b.ed.e.plantas.find((p) => p.id === "tecnica").id = "pl_viejo";
  for (const x of b.ed.e.agentes) { if (x.planta === "cupula") x.planta = "direccion"; if (x.planta === "tecnica") x.planta = "pl_viejo"; }
  await b.ed.ejecutar({ tipo: "idioma", idioma: "en" });
  assert.equal(b.ed.agente("ag_viejo1").nombre, "Boss");
  assert.equal(b.ed.agente("ag_viejo2").nombre, "Sage 2");
  assert.equal(b.ed.planta("direccion").nombre, "Dome");
  assert.equal(b.ed.planta("pl_viejo").nombre, "Tech floor");
  // y el botón también los reconoce
  b.ed.agente("ag_viejo2").nombre = "Consejera ChatGPT Pro";
  const n = await b.ed.ejecutar({ tipo: "nombresDeSerie" });
  assert.equal(n.cambiados, 1);
  assert.equal(b.ed.agente("ag_viejo2").nombre, "Sage 2");
});
