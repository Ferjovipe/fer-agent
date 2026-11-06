// Leer de la carpeta de los agentes (nunca fuera)
import fs from "node:fs/promises";
import path from "node:path";
export default async function leer(datos, h) {
  const destino = h.ruta((datos && datos.ruta) || ".");
  const st = await fs.stat(destino).catch(() => null);
  if (!st) throw new Error("No existe: " + (datos.ruta || "."));
  if (st.isDirectory()) {
    const items = await fs.readdir(destino, { withFileTypes: true });
    return { texto: `Carpeta ${path.relative(h.carpeta, destino) || "."}:\n` + (items.map((d) => (d.isDirectory() ? "[carpeta] " : "") + d.name).join("\n") || "(vacía)") };
  }
  if (st.size > 2e6) throw new Error("Ese archivo es demasiado grande para leerlo entero (más de 2 MB).");
  const texto = await fs.readFile(destino, "utf8");
  return { texto: texto.slice(0, 200000) };
}
