// =====================================================================
// Fer Agent · la aplicación de escritorio (versión 9)
// Es el mismo edificio: arranca Fer Home (fer-casa.mjs) dentro de la aplicación,
// solo en este ordenador (127.0.0.1), y abre su ventana. Sin Terminal:
// el PIN lo pone la aplicación sola y la clave de OpenRouter se pega en Ajustes.
// Los datos (edificio, claves, cerebro, Chrome de los agentes) quedan en la carpeta
// de datos de la aplicación de cada usuario.
// =====================================================================
const { app, BrowserWindow, shell, dialog, Menu, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");
const { pathToFileURL } = require("node:url");

const RAIZ = path.join(__dirname, "..");
let ventana = null, puerto = 0, pin = "", saliendo = false;

if (!app.requestSingleInstanceLock()) app.quit();   // una sola aplicación abierta (un solo edificio latiendo)

// Lo que escribe Fer Home va a un archivo en la carpeta de datos (para revisar si algo falla)
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
  // los enlaces de fuera (OpenRouter, GitHub…) se abren en tu navegador de siempre, no dentro de la aplicación
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
  // un edificio nuevo nace en el idioma del ordenador: español si está en español; si no, inglés
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
// Lo único que la ventana puede pedirle a la aplicación: elegir la carpeta del cerebro y volver a abrirse
ipcMain.handle("elegir-carpeta", async () => {
  const r = await dialog.showOpenDialog(ventana, { title: "Fer Agent", properties: ["openDirectory", "createDirectory"] });
  return r.canceled || !r.filePaths.length ? "" : r.filePaths[0];
});
ipcMain.handle("reiniciar", () => { app.relaunch(); app.quit(); });
app.on("second-instance", () => { if (ventana) { if (ventana.isMinimized()) ventana.restore(); ventana.focus(); } else if (app.isReady() && pin) abrirVentana(); });
// En el Mac, cerrar la ventana no apaga el edificio (sigue en el Dock); en Windows y Linux, sí
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
// Al salir, Fer Home guarda el edificio y cierra el Chrome de los agentes
app.on("before-quit", (ev) => {
  if (saliendo || !process.env.FER_APP) return;
  saliendo = true; ev.preventDefault();
  process.emit("SIGTERM");
  setTimeout(() => app.exit(0), 8000);   // por si algo no responde
});
