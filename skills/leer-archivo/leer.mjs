// Reading from the agents' folder (never outside it)
import fs from "node:fs/promises";
import path from "node:path";
export default async function read(data, h) {
  const relPath = (data && (data.path || data.path)) || ".";   // «ruta»: the name before version 9
  const target = h.path(relPath);
  const st = await fs.stat(target).catch(() => null);
  if (!st) throw new Error(h.L("It doesn't exist: {1}", relPath));
  if (st.isDirectory()) {
    const items = await fs.readdir(target, { withFileTypes: true });
    return { text: h.L("Folder {1}:", path.relative(h.folder, target) || ".") + "\n" + (items.map((d) => (d.isDirectory() ? h.L("[folder]") + " " : "") + d.name).join("\n") || h.L("(empty)")) };
  }
  if (st.size > 2e6) throw new Error(h.L("That file is too big to read in full (more than 2 MB)."));
  const text = await fs.readFile(target, "utf8");
  return { text: text.slice(0, 200000) };
}
