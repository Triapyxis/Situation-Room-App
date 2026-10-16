// Desktop wrapper: one window, one local server, settings stored per Windows user. No Node.js install needed on the laptop.
const { app, BrowserWindow, Menu, shell, dialog, clipboard } = require("electron");
const path = require("node:path");
const { setupUpdates } = require("./updater.cjs");
const { pathToFileURL } = require("node:url");

let server = null, win = null, cfg = null, updates = { check: async () => {}, install: () => {} };
if (!app.requestSingleInstanceLock()) app.quit();                      // a second copy would fight over the port
app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => { try { server?.close(); } catch { /* exiting */ } });

const base = () => `http://127.0.0.1:${server.port}`;
function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "File", submenu: [
      { label: "Copy OBS address: Program", click: () => clipboard.writeText(base() + "/output.html") },
      { label: "Copy OBS address: Overlay (graphics only)", click: () => clipboard.writeText(base() + "/output.html?layer=overlay") },
      { label: "Open Program output in browser", click: () => shell.openExternal(base() + "/output.html") },
      { label: "Open settings folder", click: () => shell.openPath(app.getPath("userData")) }, { type: "separator" }, { role: "quit" }] },
    { label: "View", submenu: [{ role: "reload" }, { role: "togglefullscreen" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" }] },
    { label: "Help", submenu: [{ label: "Check for updates", click: () => updates.check() }, { label: "About", click: () => dialog.showMessageBox({ message: "Situation Room", detail: `Version ${app.getVersion()}\nStation: ${cfg?.label}\nConsole and outputs run on this laptop only (127.0.0.1:${server?.port}).` }) }] },
  ]));
}
async function boot() {
  process.env.SR_CONFIG_DIR = app.getPath("userData");                 // settings live in the user's profile, not in the read-only install folder
  const mod = await import(pathToFileURL(path.join(__dirname, "..", "server.mjs")).href);
  cfg = mod.loadConfig();
  const hooks = { checkUpdates: () => updates.check(), installUpdate: () => updates.install() };
  try { server = await mod.startServer(cfg, hooks); }
  catch (e) { dialog.showErrorBox("Situation Room", e && e.code === "EADDRINUSE" ? `Port ${cfg.port} is already used by another program, possibly another copy of Situation Room. Close it and start again.` : `Could not start: ${e && e.message}`); app.quit(); return; }
  updates = setupUpdates({ app, server, cfg, autoUpdater: require("electron-updater").autoUpdater });
  win = new BrowserWindow({ width: 1440, height: 900, minWidth: 1100, minHeight: 700, backgroundColor: "#1b1b1b", title: "Situation Room", webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  buildMenu();
  win.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith(base() + "/")) shell.openExternal(url); return { action: "deny" }; });   // output pages open in the normal browser
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith(base() + "/")) e.preventDefault(); });                                   // the window can never leave the local app
  win.on("closed", () => { win = null; });
  await win.loadURL(base() + "/");
}
app.whenReady().then(boot);
