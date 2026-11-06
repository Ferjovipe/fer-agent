// Test of the order: a fake building with 72 agents on 12 floors, without heartbeat (on request only) and without spending.
import { Building } from "../engine.js";
// Usage: node pruebas/torre72.mjs > torre72.json   (used by web_test.py; also handy to try it by hand: Settings → Load a backup)
const MODELS = [
  { id: "anthropic/claude-sonnet-5.5", pricing: { prompt: "0.000002", completion: "0.00001" }, architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] }, context_length: 200000 },
  { id: "anthropic/claude-haiku-5.5", pricing: { prompt: "0.0000001", completion: "0.0000005" }, architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] }, context_length: 200000 },
  { id: "openai/gpt-6-luna", pricing: { prompt: "0.0000001", completion: "0.0000005" }, architecture: { input_modalities: ["text"], output_modalities: ["text"] }, context_length: 128000 }];
let g = null;
const ed = new Building({ load: async () => null, save: async (j) => { g = j; }, key: () => "", fetch: async () => { throw new Error("sin red"); } });
ed.setModels(MODELS);
await ed.start("empty");
await ed.run({ type: "installBuiltIn", id: "memory" });   // v8: «vacio» no longer comes with Memory; the test building does
const STOREYS = [["Ventas", "Buscar clientes y cerrar ventas"], ["Marketing", "Campañas, redes y web"], ["Atención al cliente", "Responder dudas y reclamaciones"], ["Finanzas", "Facturas, cobros y previsiones"],
  ["Compras", "Proveedores y pedidos"], ["Logística", "Envíos y almacén"], ["Legal", "Contratos y cumplimiento"], ["Personas", "Selección y formación"],
  ["Producto", "Qué construimos y por qué"], ["Datos", "Informes y métricas"], ["Soporte técnico", "Incidencias y mantenimiento"], ["Comunicación", "Prensa y mensajes internos"]];
const NAMES = ["Ana", "Bruno", "Carla", "Diego", "Elena", "Fermín", "Gloria", "Hugo", "Irene", "Javier", "Lucía", "Mario", "Nuria", "Óscar", "Paula", "Quique", "Rosa", "Sergio",
  "Teresa", "Ulises", "Vera", "Wilson", "Ximena", "Yago", "Zoe", "Álvaro", "Blanca", "César", "Daniela", "Emilio", "Fátima", "Gonzalo", "Helena", "Ignacio", "Julia", "Kevin",
  "Laura", "Manuel", "Noelia", "Pablo", "Raquel", "Samuel", "Tania", "Víctor", "Alba", "Borja", "Clara", "David", "Eva", "Félix", "Gema", "Héctor", "Inés", "Jorge",
  "Lorena", "Marcos", "Natalia", "Olga", "Pedro", "Rocío", "Santiago", "Sofía", "Tomás", "Úrsula", "Valeria", "Adrián", "Beatriz", "Carlos", "Dolores", "Enrique", "Francisca", "Guillermo"];
const PJ = ["boy", "girl", "grandpa", "grandma"], CLOTHES = ["#1F3A93", "#3A9FE3", "#2E9E5B", "#7B3FB5", "#E8C22C", "#EF6AA6", "#8E1B2C", "#2A2C36"];
let k = 0;
for (const [name, job] of STOREYS.slice().reverse()) {   // each new floor is built on top: that way they end up in this order
  const { id } = await ed.run({ type: "createFloor", name, job });
  for (let i = 0; i < 6; i++, k++) {
    await ed.run({ type: "createAgent", profile: { floor: id, name: NAMES[k], role: i === 0 ? "section_head" : "subagent", seat: i === 0 ? "head_office" : "office",
      instructions: `Trabajas en ${name}.`, heartbeat: { every: 1, unit: "on_request" }, level: "budget", capabilities: ["write"],
      look: { p: PJ[(k * 7) % 4], clothes: CLOTHES[(k * 3) % CLOTHES.length] } } });
  }
}
// 4 switched off, to see the filters (no pending tasks: a pending task would be done and would spend)
for (const n of ["Hugo", "Paula", "Wilson", "Laura"]) ed.exactAgent(n).off = true;
ed.applyBudget();
await ed.save();
process.stdout.write(g);
