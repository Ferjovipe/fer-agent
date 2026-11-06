// Writing in the agents' folder (never outside it, never deletes). It only gets here with your permission.
import fs from "node:fs/promises";
import path from "node:path";
export default async function escribir(datos, h) {
  const d = datos || {};
  const ruta = String(d.path || d.ruta || "").trim();   // «ruta», «texto», «anadir»: the names before version 9
  if (!ruta || ruta.endsWith("/")) throw new Error(h.L("Tell me the file's name (data: {path, text})."));
  const destino = h.ruta(ruta);
  await fs.mkdir(path.dirname(destino), { recursive: true });
  const texto = String(d.text ?? d.texto ?? "");
  if (d.append || d.anadir || d["añadir"]) await fs.appendFile(destino, texto); else await fs.writeFile(destino, texto);
  return { texto: h.L("Saved in {1} ({2} characters).", path.relative(h.carpeta, destino), texto.length) };
}
