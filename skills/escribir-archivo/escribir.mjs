// Escribir en la carpeta de los agentes (nunca fuera, nunca borra). Solo llega aquí con tu permiso.
import fs from "node:fs/promises";
import path from "node:path";
export default async function escribir(datos, h) {
  const ruta = String((datos && datos.ruta) || "").trim();
  if (!ruta || ruta.endsWith("/")) throw new Error("Dime el nombre del archivo (datos: {ruta, texto}).");
  const destino = h.ruta(ruta);
  await fs.mkdir(path.dirname(destino), { recursive: true });
  const texto = String((datos && datos.texto) || "");
  if (datos && (datos.anadir || datos["añadir"])) await fs.appendFile(destino, texto); else await fs.writeFile(destino, texto);
  return { texto: `Guardado en ${path.relative(h.carpeta, destino)} (${texto.length} caracteres).` };
}
