// =====================================================================
// Fer Agent · the desktop app (version 9)
// It's the same building: it starts Fer Home (fer-casa.mjs) inside the app,
// only on this computer (127.0.0.1), and opens its window. No Terminal:
// the app sets the PIN itself and the OpenRouter key is pasted in Settings.
// The data (building, keys, brain, the agents' Chrome) stays in the app's data folder
// of each user.
// =====================================================================
const { app, BrowserWindow, shell, dialog, Menu, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");
const { pathToFileURL } = require("node:url");

const RAIZ = path.join(__dirname, "..");
let ventana = null, puerto = 0, pin = "", saliendo = false;

if (!app.requestSingleInstanceLock()) app.quit();   // only one app open (only one building beating)

// What Fer Home writes goes to a file in the data folder (to check if something fails)
function registroEnArchivo(datos) {
  const f = path.join(datos, "fer-agent.log");
  try { if (fs.existsSync(f) && fs.statSync(f).size > 2e6) fs.renameSync(f, f + ".1"); } catch {}
  const escribir = (...a) => { try { fs.appendFileSync(f, a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ") + "\n"); } catch {} };
  for (const k of ["log", "warn", "error"]) { const original = console[k].bind(console); console[k] = (...a) => { escribir(...a); original(...a); }; }
}
function puertoLibre(preferido) {
  return new Promise((res) => {
    const s = net.createServer();
    s.once("error", () => { const t = net.createServer(); t.listen(0, "127.0.0.1", () => { const p = t.address().port; t.close(() => res(p)); }); });
    s.listen(preferido, "127.0.0.1", () => s.close(() => res(preferido)));
  });
}
async function esperar(url, ms) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { try { const r = await fetch(url); if (r.ok) return true; } catch {} await new Promise((r) => setTimeout(r, 150)); }
  return false;
}
function abrirVentana() {
  const local = `http://127.0.0.1:${puerto}`;
  ventana = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 600, title: "Fer Agent", backgroundColor: "#0B1640", show: false,
    icon: path.join(RAIZ, "build", "icon.png"),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, preload: path.join(__dirname, "preload.cjs") }
  });
  ventana.once("ready-to-show", () => ventana.show());
  // outside links (OpenRouter, GitHub…) open in your usual browser, not inside the app
  ventana.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url) && !url.startsWith(local)) shell.openExternal(url); return { action: "deny" }; });
  ventana.webContents.on("will-navigate", (ev, url) => { if (!url.startsWith(local)) { ev.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  ventana.loadURL(`${local}/app/entrar?t=${encodeURIComponent(pin)}`);
  ventana.on("closed", () => { ventana = null; });
}

app.whenReady().then(async () => {
  const datos = path.join(app.getPath("userData"), "datos");
  fs.mkdirSync(datos, { recursive: true });
  registroEnArchivo(datos);
  if (process.platform !== "darwin") Menu.setApplicationMenu(null);
  puerto = await puertoLibre(Number(process.env.FER_PUERTO) || 8787);
  // a new building is born in the computer's language: Spanish if it's in Spanish; if not, English
  const idioma = /^es\b/i.test(app.getLocale() || "") ? "es" : "en";
  Object.assign(process.env, { FER_APP: "1", FER_DATOS: datos, FER_PUERTO: String(puerto), FER_IDIOMA: process.env.FER_IDIOMA || idioma });
  // the only two messages of this file, in the computer's language (the building isn't open yet, so there's no dictionary)
  const msg = idioma === "es" ? { noArranca: "No se pudo arrancar el edificio: ", noAbre: "El edificio no arrancó. Mira el archivo fer-agent.log en " }
    : { noArranca: "The building couldn't start: ", noAbre: "The building didn't start. Look at the fer-agent.log file in " };
  try { await import(pathToFileURL(path.join(RAIZ, "fer-casa.mjs")).href); }
  catch (e) { dialog.showErrorBox("Fer Agent", msg.noArranca + e.message); app.quit(); return; }
  if (!(await esperar(`http://127.0.0.1:${puerto}/api/hola`, 30000))) { dialog.showErrorBox("Fer Agent", msg.noAbre + datos); app.quit(); return; }
  try { pin = JSON.parse(fs.readFileSync(path.join(datos, "config.json"), "utf8")).pin; } catch {}
  abrirVentana();
  app.on("activate", () => { if (!ventana) abrirVentana(); });
});
// The only things the window can ask the app for: choosing the brain folder and reopening
ipcMain.handle("elegir-carpeta", async () => {
  const r = await dialog.showOpenDialog(ventana, { title: "Fer Agent", properties: ["openDirectory", "createDirectory"] });
  return r.canceled || !r.filePaths.length ? "" : r.filePaths[0];
});
ipcMain.handle("reiniciar", () => { app.relaunch(); app.quit(); });
app.on("second-instance", () => { if (ventana) { if (ventana.isMinimized()) ventana.restore(); ventana.focus(); } else if (app.isReady() && pin) abrirVentana(); });
// On the Mac, closing the window doesn't switch the building off (it stays in the Dock); on Windows and Linux, it does
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
// When quitting, Fer Home saves the building and closes the agents' Chrome
app.on("before-quit", (ev) => {
  if (saliendo || !process.env.FER_APP) return;
  saliendo = true; ev.preventDefault();
  process.emit("SIGTERM");
  setTimeout(() => app.exit(0), 8000);   // in case something doesn't answer
});
