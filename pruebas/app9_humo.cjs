// Smoke test of the desktop app ALREADY BUILT (or the development one):
// it opens it with Electron, goes in, looks at Settings, pastes a key, opens the agents' Chrome and closes it.
// Usage (Linux, no screen):  xvfb-run -a node pruebas/app9_humo.cjs [path of the built executable]
//   without a path, it uses node_modules/electron with this folder.
// Needs Playwright (npm install -g playwright, or the PLAYWRIGHT variable with its path).
const path = require("node:path"), fs = require("node:fs"), os = require("node:os"), http = require("node:http");
const { _electron: electron } = require(process.env.PLAYWRIGHT || "playwright");
const ROOT = path.join(__dirname, "..");
const OUTPUT = process.env.OUTPUT || path.join(ROOT, "pruebas", "capturas");
fs.mkdirSync(OUTPUT, { recursive: true });
let ok = true;
const check = (c, t) => { console.log((c ? "PASS " : "FAIL ") + t); ok = ok && !!c; };

(async () => {
  // a fake OpenRouter, so the boss answers
  const or = http.createServer((req, res) => {
    let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.url.startsWith("/api/v1/models")) return res.end(JSON.stringify({ data: [{ id: "anthropic/claude-sonnet-5.5", name: "Claude Sonnet 5.5", pricing: { prompt: "0.000002", completion: "0.00001" }, architecture: { input_modalities: ["text"], output_modalities: ["text"] } }] }));
      if (req.url === "/api/v1/chat/completions") return res.end(JSON.stringify({ model: "m", choices: [{ message: { content: "Hello from the desktop app." } }], usage: { prompt_tokens: 5, completion_tokens: 5, cost: 0.0001 } }));
      if (req.url === "/web") { res.setHeader("Content-Type", "text/html"); return res.end("<title>web</title>ok"); }
      res.statusCode = 404; res.end("{}");
    });
  }).listen(9941, "127.0.0.1");
  const userHome = fs.mkdtempSync(path.join(os.tmpdir(), "feragent-humo-"));   // a new user: empty data folder
  const built = process.argv[2];
  const app = await electron.launch({
    executablePath: built || path.join(ROOT, "node_modules", "electron", "dist", "electron"),
    args: [...(process.getuid && process.getuid() === 0 ? ["--no-sandbox"] : []), ...(built ? [] : [ROOT]), "--lang=en-US"],
    env: Object.assign({}, process.env, { HOME: userHome, XDG_CONFIG_HOME: path.join(userHome, ".config"), OPENROUTER_BASE: "http://127.0.0.1:9941/api/v1", FER_PORT: "8852", FER_CHROME_CANAL: "chromium" }),
    timeout: 60000
  });
  const data = path.join(await app.evaluate(({ app }) => app.getPath("userData")), "datos");
  const win = await app.firstWindow();
  await win.waitForSelector("#landing .heroe-txt", { timeout: 30000 });
  check(await win.title() !== "" && /127\.0\.0\.1:8852\/$/.test(win.url()), `the window opens the building on this computer (${win.url()})`);
  check(await win.evaluate(() => !!(window.ferApp && window.ferApp.chooseFolder && window.ferApp.restart)) && await win.evaluate(() => typeof require === "undefined"),
    "the window can only ask to choose a folder and reopen (no access to the computer)");
  check((await win.innerText("#landing h1")) === "You have an agentic company at your service.", "a computer in English, the app in English");
  check((await win.locator("#landing .boton-borde").count()) === 0, "inside the app “Download the app” doesn't appear");
  await win.screenshot({ path: path.join(OUTPUT, "app9-humo-portada.png") });
  await win.waitForTimeout(2000);
  await win.click("#landing .boton-grande >> nth=0");
  await win.waitForSelector("#cajon:not([hidden]) #cajonCuerpo h4", { timeout: 15000 });
  check((await win.innerText("#modo")) === "In this app · works while it's open", "arriba: «In this app»");
  check(await win.isVisible("#cajonCuerpo button:text-is('Change the folder')"), "Settings → brain: “Change the folder” button");
  await win.screenshot({ path: path.join(OUTPUT, "app9-humo-ajustes.png") });
  const block = "#cajonCuerpo .bloque:has(h4:text-is('Your OpenRouter key'))";
  await win.fill(`${block} input[type=password]`, "sk-or-v1-humohumohumohumo");
  await win.click(`${block} button:text-is('Save')`);
  await win.waitForTimeout(800);
  const conf = JSON.parse(fs.readFileSync(path.join(data, "config.json"), "utf8"));
  check(conf.key === "sk-or-v1-humohumohumohumo", "the pasted key stays in the app's data folder");
  await win.click("#hablarJefe"); await win.waitForSelector("#vistaChat:not([hidden])");
  await win.fill("#texto", "Hello"); await win.keyboard.press("Enter");
  await win.waitForSelector("#mensajes .msg.bot:not(.saludo) .meta", { timeout: 20000 });
  check((await win.innerText("#mensajes")).includes("Hello from the desktop app."), "the boss answers");
  await win.screenshot({ path: path.join(OUTPUT, "app9-humo-chat.png") });
  await win.click("#cerrarChat");
  // the agents' Chrome (Playwright goes inside the app)
  await win.click("#abrirAjustes"); await win.waitForSelector("#cajonCuerpo h4");
  const web = "#cajonCuerpo .bloque:has(h4:text-is(\"Your websites, in the agents' Chrome\"))";
  await win.fill(`${web} input`, "http://127.0.0.1:9941/web"); await win.click(`${web} button:text-is('Open')`);
  await win.waitForTimeout(8000);
  const notice = await win.innerText("#avisoFlotante").catch(() => "");
  check(notice.startsWith("The agents' Chrome is open") && fs.existsSync(path.join(data, "chrome-agentes")), `the agents' Chrome opens: “${notice.slice(0, 60)}”`);
  await app.close();
  const log = fs.readFileSync(path.join(data, "fer-agent.log"), "utf8");
  check(/Saving and quitting/.test(log) && fs.existsSync(path.join(data, "edificio.json")), "on closing, it saves the building (fer-agent.log, in the building's language: English)");
  or.close();
  console.log("RESULT:", ok ? "OK" : "FAILURES");
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error("FALLO:", e.message); process.exit(1); });
