// Reading from the agents' folder (never outside it)
import fs from "node:fs/promises";
import path from "node:path";
export default async function leer(datos, h) {
  const ruta = (datos && (datos.path || datos.ruta)) || ".";   // «ruta»: the name before version 9
  const destino = h.ruta(ruta);
  const st = await fs.stat(destino).catch(() => null);
  if (!st) throw new Error(h.L("It doesn't exist: {1}", ruta));
  if (st.isDirectory()) {
    const items = await fs.readdir(destino, { withFileTypes: true });
    return { texto: h.L("Folder {1}:", path.relative(h.carpeta, destino) || ".") + "\n" + (items.map((d) => (d.isDirectory() ? h.L("[folder]") + " " : "") + d.name).join("\n") || h.L("(empty)")) };
  }
  if (st.size > 2e6) throw new Error(h.L("That file is too big to read in full (more than 2 MB)."));
  const texto = await fs.readFile(destino, "utf8");
  return { texto: texto.slice(0, 200000) };
}
