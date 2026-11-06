// Writing in the agents' folder (never outside it, never deletes). It only gets here with your permission.
import fs from "node:fs/promises";
import path from "node:path";
export default async function write(data, h) {
  const d = data || {};
  const relPath = String(d.path || d.ruta || "").trim();   // «ruta», «texto», «anadir»: the names before version 9
  if (!relPath || relPath.endsWith("/")) throw new Error(h.L("Tell me the file's name (data: {path, text})."));
  const target = h.path(relPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const text = String(d.text ?? d.texto ?? "");
  if (d.append || d.anadir || d["añadir"]) await fs.appendFile(target, text); else await fs.writeFile(target, text);
  return { text: h.L("Saved in {1} ({2} characters).", path.relative(h.folder, target), text.length) };
}
