// «Community floors»: checks every floor file in a folder (the same check the app does when loading one) and rebuilds its list,
// index.json, which is what the app reads. Usage: node community/check-floors.mjs [folder]   (by default, community/floors)
// It ends with an error (code 1) if any file is wrong, saying which one and why; then the list isn't touched.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkFloorFile, setLanguage } from "../engine.js";

setLanguage("en");
const dir = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), "floors"));
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json").sort();
const floors = [], wrong = [];
for (const file of files) {
  let x; try { x = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")); } catch (e) { wrong.push(`${file}: it isn't valid JSON (${e.message})`); continue; }
  const bad = checkFloorFile(x);
  if (bad) { wrong.push(`${file}: ${bad}`); continue; }
  const s = (v, n) => String(v || "").slice(0, n);
  floors.push({ file, name: s(x.name, 40), job: s(x.job, 300), language: s(x.language, 10) || "es", author: s(x.author, 60), agents: x.agents.length });
}
if (wrong.length) { console.log("Wrong:\n" + wrong.map((w) => "- " + w).join("\n")); process.exit(1); }
fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify({ floors }, null, 1) + "\n");
console.log(`OK: ${floors.length} floors in ${path.join(dir, "index.json")}`);
