// =====================================================================
// Fer Agent · the desktop app (version 9)
// It's the same building: it starts Fer Home (fer-home.mjs) inside the app,
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

const ROOT = path.join(__dirname, "..");
let win = null, port = 0, pin = "", quitting = false;

if (!app.requestSingleInstanceLock()) app.quit();   // only one app open (only one building beating)

// What Fer Home writes goes to a file in the data folder (to check if something fails)
function logToFile(data) {
  const f = path.join(data, "fer-agent.log");
  try { if (fs.existsSync(f) && fs.statSync(f).size > 2e6) fs.renameSync(f, f + ".1"); } catch {}
  const write = (...a) => { try { fs.appendFileSync(f, a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ") + "\n"); } catch {} };
  for (const k of ["log", "warn", "error"]) { const original = console[k].bind(console); console[k] = (...a) => { write(...a); original(...a); }; }
}
function freePort(preferred) {
  return new Promise((res) => {
    const s = net.createServer();
    s.once("error", () => { const t = net.createServer(); t.listen(0, "127.0.0.1", () => { const p = t.address().port; t.close(() => res(p)); }); });
    s.listen(preferred, "127.0.0.1", () => s.close(() => res(preferred)));
  });
}
async function waitFor(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { const r = await fetch(url); if (r.ok) return true; } catch {} await new Promise((r) => setTimeout(r, 150)); }
  return false;
}
function openWindow() {
  const local = `http://127.0.0.1:${port}`;
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 600, title: "Fer Agent", backgroundColor: "#0B1640", show: false,
    icon: path.join(ROOT, "build", "icon.png"),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, preload: path.join(__dirname, "preload.cjs") }
  });
  win.once("ready-to-show", () => win.show());
  // outside links (OpenRouter, GitHub…) open in your usual browser, not inside the app
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url) && !url.startsWith(local)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (ev, url) => { if (!url.startsWith(local)) { ev.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.loadURL(`${local}/app/signin?t=${encodeURIComponent(pin)}`);
  win.on("closed", () => { win = null; });
}

// 9.4 · Updates: the app looks for a new version in the project's GitHub «Releases» when it opens and every 6 hours, downloads it
// in the background and installs it when you close the app (the system tells you when it's ready). On a Mac it only works with the
// app signed by Apple; until then, the new version is installed by hand, as before. FER_NO_UPDATES=1: it doesn't look.
function lookForUpdates(language) {
  if (!app.isPackaged || process.env.FER_NO_UPDATES === "1") return;
  let updater;
  try { ({ autoUpdater: updater } = require("electron-updater")); } catch (e) { console.log("Updates: " + e.message); return; }
  updater.logger = { info: (m) => console.log("Updates: " + m), warn: (m) => console.warn("Updates: " + m), error: (m) => console.error("Updates: " + m), debug: () => {} };
  const notice = language === "es" ? { title: "Fer Agent: versión nueva lista", body: "La versión {version} ya está descargada: se instala sola al cerrar la app." }
    : { title: "Fer Agent: new version ready", body: "Version {version} is downloaded: it installs itself when you close the app." };
  const look = () => updater.checkForUpdatesAndNotify(notice).catch((e) => console.log("Updates: " + ((e && e.message) || e)));
  look(); setInterval(look, 6 * 3600e3);
}

app.whenReady().then(async () => {
  const data = path.join(app.getPath("userData"), "data");
  // before version 9 it was called «datos»: it moves once (Fer Home then moves what's inside)
  const before = path.join(app.getPath("userData"), "datos");
  if (fs.existsSync(before) && !fs.existsSync(data)) { try { fs.renameSync(before, data); } catch {} }
  fs.mkdirSync(data, { recursive: true });
  logToFile(data);
  if (process.platform !== "darwin") Menu.setApplicationMenu(null);
  port = await freePort(Number(process.env.FER_PORT) || 8787);
  // a new building is born in the computer's language: Spanish if it's in Spanish; if not, English
  const language = /^es\b/i.test(app.getLocale() || "") ? "es" : "en";
  Object.assign(process.env, { FER_APP: "1", FER_DATA: data, FER_PORT: String(port), FER_LANGUAGE: process.env.FER_LANGUAGE || language });
  // the only two messages of this file, in the computer's language (the building isn't open yet, so there's no dictionary)
  const msg = language === "es" ? { doesNotStart: "No se pudo arrancar el edificio: ", doesNotOpen: "El edificio no arrancó. Mira el archivo fer-agent.log en " }
    : { doesNotStart: "The building couldn't start: ", doesNotOpen: "The building didn't start. Look at the fer-agent.log file in " };
  try { await import(pathToFileURL(path.join(ROOT, "fer-home.mjs")).href); }
  catch (e) { dialog.showErrorBox("Fer Agent", msg.doesNotStart + e.message); app.quit(); return; }
  if (!(await waitFor(`http://127.0.0.1:${port}/api/hello`, 30000))) { dialog.showErrorBox("Fer Agent", msg.doesNotOpen + data); app.quit(); return; }
  try { pin = JSON.parse(fs.readFileSync(path.join(data, "config.json"), "utf8")).pin; } catch {}
  openWindow();
  app.on("activate", () => { if (!win) openWindow(); });
  lookForUpdates(language);
});
// The only things the window can ask the app for: choosing the brain folder and reopening
ipcMain.handle("choose-folder", async () => {
  const r = await dialog.showOpenDialog(win, { title: "Fer Agent", properties: ["openDirectory", "createDirectory"] });
  return r.canceled || !r.filePaths.length ? "" : r.filePaths[0];
});
ipcMain.handle("restart", () => { app.relaunch(); app.quit(); });
app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } else if (app.isReady() && pin) openWindow(); });
// On the Mac, closing the window doesn't switch the building off (it stays in the Dock); on Windows and Linux, it does
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
// When quitting, Fer Home saves the building and closes the agents' Chrome
app.on("before-quit", (ev) => {
  if (quitting || !process.env.FER_APP) return;
  quitting = true; ev.preventDefault();
  process.emit("SIGTERM");
  setTimeout(() => app.exit(0), 8000);   // in case something doesn't answer
});
