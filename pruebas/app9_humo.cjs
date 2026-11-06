// Prueba de humo de la aplicación de escritorio YA FABRICADA (o de la de desarrollo):
// la abre con Electron, entra, mira Ajustes, pega una clave, abre el Chrome de los agentes y la cierra.
// Uso (Linux, sin pantalla):  xvfb-run -a node pruebas/app9_humo.cjs [ruta del ejecutable fabricado]
//   sin ruta, usa node_modules/electron con esta carpeta.
// Necesita Playwright (npm install -g playwright, o la variable PLAYWRIGHT con su ruta).
const path = require("node:path"), fs = require("node:fs"), os = require("node:os"), http = require("node:http");
const { _electron: electron } = require(process.env.PLAYWRIGHT || "playwright");
const RAIZ = path.join(__dirname, "..");
const SALIDA = process.env.SALIDA || path.join(RAIZ, "pruebas", "capturas");
fs.mkdirSync(SALIDA, { recursive: true });
let ok = true;
const check = (c, t) => { console.log((c ? "PASS " : "FAIL ") + t); ok = ok && !!c; };

(async () => {
  // un OpenRouter de mentira, para que el jefe conteste
  const or = http.createServer((req, res) => {
    let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.url.startsWith("/api/v1/models")) return res.end(JSON.stringify({ data: [{ id: "anthropic/claude-sonnet-5.5", name: "Claude Sonnet 5.5", pricing: { prompt: "0.000002", completion: "0.00001" }, architecture: { input_modalities: ["text"], output_modalities: ["text"] } }] }));
      if (req.url === "/api/v1/chat/completions") return res.end(JSON.stringify({ model: "m", choices: [{ message: { content: "Hello from the desktop app." } }], usage: { prompt_tokens: 5, completion_tokens: 5, cost: 0.0001 } }));
      if (req.url === "/web") { res.setHeader("Content-Type", "text/html"); return res.end("<title>web</title>ok"); }
      res.statusCode = 404; res.end("{}");
    });
  }).listen(9941, "127.0.0.1");
  const casaUsuario = fs.mkdtempSync(path.join(os.tmpdir(), "feragent-humo-"));   // un usuario nuevo: carpeta de datos vacía
  const fabricado = process.argv[2];
  const app = await electron.launch({
    executablePath: fabricado || path.join(RAIZ, "node_modules", "electron", "dist", "electron"),
    args: [...(process.getuid && process.getuid() === 0 ? ["--no-sandbox"] : []), ...(fabricado ? [] : [RAIZ]), "--lang=en-US"],
    env: Object.assign({}, process.env, { HOME: casaUsuario, XDG_CONFIG_HOME: path.join(casaUsuario, ".config"), OPENROUTER_BASE: "http://127.0.0.1:9941/api/v1", FER_PUERTO: "8852", FER_CHROME_CANAL: "chromium" }),
    timeout: 60000
  });
  const datos = path.join(await app.evaluate(({ app }) => app.getPath("userData")), "datos");
  const win = await app.firstWindow();
  await win.waitForSelector("#landing .heroe-txt", { timeout: 30000 });
  check(await win.title() !== "" && /127\.0\.0\.1:8852\/$/.test(win.url()), `la ventana abre el edificio en este ordenador (${win.url()})`);
  check(await win.evaluate(() => !!(window.ferApp && window.ferApp.elegirCarpeta && window.ferApp.reiniciar)) && await win.evaluate(() => typeof require === "undefined"),
    "la ventana solo puede pedir elegir carpeta y volver a abrirse (sin acceso al ordenador)");
  check((await win.innerText("#landing h1")) === "You have an agentic company at your service.", "un ordenador en inglés, la aplicación en inglés");
  check((await win.locator("#landing .boton-borde").count()) === 0, "dentro de la aplicación no sale «Download the app»");
  await win.screenshot({ path: path.join(SALIDA, "app9-humo-portada.png") });
  await win.waitForTimeout(2000);
  await win.click("#landing .boton-grande >> nth=0");
  await win.waitForSelector("#cajon:not([hidden]) #cajonCuerpo h4", { timeout: 15000 });
  check((await win.innerText("#modo")) === "In this app · works while it's open", "arriba: «In this app»");
  check(await win.isVisible("#cajonCuerpo button:text-is('Change the folder')"), "Ajustes → cerebro: botón «Change the folder»");
  await win.screenshot({ path: path.join(SALIDA, "app9-humo-ajustes.png") });
  const bloque = "#cajonCuerpo .bloque:has(h4:text-is('Your OpenRouter key'))";
  await win.fill(`${bloque} input[type=password]`, "sk-or-v1-humohumohumohumo");
  await win.click(`${bloque} button:text-is('Save')`);
  await win.waitForTimeout(800);
  const conf = JSON.parse(fs.readFileSync(path.join(datos, "config.json"), "utf8"));
  check(conf.clave === "sk-or-v1-humohumohumohumo", "la clave pegada queda en la carpeta de datos de la aplicación");
  await win.click("#hablarJefe"); await win.waitForSelector("#vistaChat:not([hidden])");
  await win.fill("#texto", "Hello"); await win.keyboard.press("Enter");
  await win.waitForSelector("#mensajes .msg.bot:not(.saludo) .meta", { timeout: 20000 });
  check((await win.innerText("#mensajes")).includes("Hello from the desktop app."), "el jefe contesta");
  await win.screenshot({ path: path.join(SALIDA, "app9-humo-chat.png") });
  await win.click("#cerrarChat");
  // el Chrome de los agentes (Playwright va dentro de la aplicación)
  await win.click("#abrirAjustes"); await win.waitForSelector("#cajonCuerpo h4");
  const web = "#cajonCuerpo .bloque:has(h4:text-is(\"Your websites, in the agents' Chrome\"))";
  await win.fill(`${web} input`, "http://127.0.0.1:9941/web"); await win.click(`${web} button:text-is('Open')`);
  await win.waitForTimeout(8000);
  const aviso = await win.innerText("#avisoFlotante").catch(() => "");
  check(aviso.startsWith("The agents' Chrome is open") && fs.existsSync(path.join(datos, "chrome-agentes")), `se abre el Chrome de los agentes: «${aviso.slice(0, 60)}»`);
  await app.close();
  const log = fs.readFileSync(path.join(datos, "fer-agent.log"), "utf8");
  check(/Guardando y saliendo/.test(log) && fs.existsSync(path.join(datos, "edificio.json")), "al cerrar, guarda el edificio (fer-agent.log)");
  or.close();
  console.log("RESULTADO:", ok ? "OK" : "FALLOS");
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error("FALLO:", e.message); process.exit(1); });
