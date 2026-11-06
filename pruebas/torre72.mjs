// Test of the order: a fake building with 72 agents on 12 floors, without heartbeat (on request only) and without spending.
import { Edificio } from "../engine.js";
// Usage: node pruebas/torre72.mjs > torre72.json   (used by web_test.py; also handy to try it by hand: Settings → Load a backup)
const MODELOS = [
  { id: "anthropic/claude-sonnet-5.5", pricing: { prompt: "0.000002", completion: "0.00001" }, architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] }, context_length: 200000 },
  { id: "anthropic/claude-haiku-5.5", pricing: { prompt: "0.0000001", completion: "0.0000005" }, architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] }, context_length: 200000 },
  { id: "openai/gpt-6-luna", pricing: { prompt: "0.0000001", completion: "0.0000005" }, architecture: { input_modalities: ["text"], output_modalities: ["text"] }, context_length: 128000 }];
let g = null;
const ed = new Edificio({ cargar: async () => null, guardar: async (j) => { g = j; }, clave: () => "", fetch: async () => { throw new Error("sin red"); } });
ed.setModelos(MODELOS);
await ed.iniciar("vacio");
await ed.ejecutar({ tipo: "instalarSerie", id: "memory" });   // v8: «vacio» no longer comes with Memory; the test building does
const PISOS = [["Ventas", "Buscar clientes y cerrar ventas"], ["Marketing", "Campañas, redes y web"], ["Atención al cliente", "Responder dudas y reclamaciones"], ["Finanzas", "Facturas, cobros y previsiones"],
  ["Compras", "Proveedores y pedidos"], ["Logística", "Envíos y almacén"], ["Legal", "Contratos y cumplimiento"], ["Personas", "Selección y formación"],
  ["Producto", "Qué construimos y por qué"], ["Datos", "Informes y métricas"], ["Soporte técnico", "Incidencias y mantenimiento"], ["Comunicación", "Prensa y mensajes internos"]];
const NOMBRES = ["Ana", "Bruno", "Carla", "Diego", "Elena", "Fermín", "Gloria", "Hugo", "Irene", "Javier", "Lucía", "Mario", "Nuria", "Óscar", "Paula", "Quique", "Rosa", "Sergio",
  "Teresa", "Ulises", "Vera", "Wilson", "Ximena", "Yago", "Zoe", "Álvaro", "Blanca", "César", "Daniela", "Emilio", "Fátima", "Gonzalo", "Helena", "Ignacio", "Julia", "Kevin",
  "Laura", "Manuel", "Noelia", "Pablo", "Raquel", "Samuel", "Tania", "Víctor", "Alba", "Borja", "Clara", "David", "Eva", "Félix", "Gema", "Héctor", "Inés", "Jorge",
  "Lorena", "Marcos", "Natalia", "Olga", "Pedro", "Rocío", "Santiago", "Sofía", "Tomás", "Úrsula", "Valeria", "Adrián", "Beatriz", "Carlos", "Dolores", "Enrique", "Francisca", "Guillermo"];
const PJ = ["chico", "chica", "abuelo", "abuela"], ROPA = ["#1F3A93", "#3A9FE3", "#2E9E5B", "#7B3FB5", "#E8C22C", "#EF6AA6", "#8E1B2C", "#2A2C36"];
let k = 0;
for (const [nombre, funcion] of PISOS.slice().reverse()) {   // each new floor is built on top: that way they end up in this order
  const { id } = await ed.ejecutar({ tipo: "crearPlanta", nombre, funcion });
  for (let i = 0; i < 6; i++, k++) {
    await ed.ejecutar({ tipo: "crearAgente", ficha: { planta: id, nombre: NOMBRES[k], rol: i === 0 ? "jefe_seccion" : "subagente", puesto: i === 0 ? "despacho" : "oficina",
      cuerpo: `Trabajas en ${nombre}.`, latido: { cada: 1, unidad: "peticion" }, nivel: "economico", capacidades: ["escribir"],
      aspecto: { p: PJ[(k * 7) % 4], ropa: ROPA[(k * 3) % ROPA.length] } } });
  }
}
// 4 switched off, to see the filters (no pending tasks: a pending task would be done and would spend)
for (const n of ["Hugo", "Paula", "Wilson", "Laura"]) ed.agenteExacto(n).apagado = true;
ed.aplicarPresupuesto();
await ed.guardar();
process.stdout.write(g);
