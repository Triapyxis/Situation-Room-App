// Auto-update policy for a LIVE-BROADCAST tool: check and download in the background, but NEVER restart on its own.
// The update installs when the operator clicks "Restart and update" or simply quits the app at the end of the day.
const CHECK_FIRST_MS = 30_000, CHECK_EVERY_MS = 4 * 3600_000;

function setupUpdates({ app, server, cfg, autoUpdater, schedule = { once: setTimeout, every: setInterval } }) {
  const current = app.getVersion(); let st = "idle";
  const set = (u) => { st = u.state ?? st; server.setUpdate({ current, ...u }); };
  if (!app.isPackaged) { set({ state: "dev", message: "Updates work in the installed app only." }); return { check: async () => {}, install: () => {} }; }

  autoUpdater.autoDownload = true; autoUpdater.autoInstallOnAppQuit = true; autoUpdater.allowPrerelease = false; autoUpdater.allowDowngrade = false;
  set({ state: "idle", message: "" });
  autoUpdater.on("checking-for-update", () => { if (st !== "ready") set({ state: "checking", message: "" }); });
  autoUpdater.on("update-available", (i) => set({ state: "downloading", version: i.version, percent: 0, message: "" }));
  autoUpdater.on("update-not-available", () => { if (st !== "ready") set({ state: "idle", version: null, percent: null, lastChecked: Date.now(), message: "You have the latest version." }); });
  autoUpdater.on("download-progress", (p) => set({ state: "downloading", percent: Math.round(p.percent) }));
  autoUpdater.on("update-downloaded", (i) => set({ state: "ready", version: i.version, percent: 100, message: "" }));
  autoUpdater.on("error", () => { if (st !== "ready") set({ state: "error", message: "Could not check for updates." }); });   // generic text: no internals shown on screen

  let busy = false;
  const check = async () => { if (busy) return; busy = true; try { await autoUpdater.checkForUpdates(); } catch { if (st !== "ready") set({ state: "error", message: "Could not check for updates." }); } finally { busy = false; } };
  const tick = () => { if (cfg.autoUpdate !== false && st !== "ready" && st !== "downloading") void check(); };   // the setting is read at each tick, so it can be changed live
  const t1 = schedule.once(tick, CHECK_FIRST_MS), t2 = schedule.every(tick, CHECK_EVERY_MS); t1?.unref?.(); t2?.unref?.();
  const install = () => { if (st === "ready") autoUpdater.quitAndInstall(false, true); };
  return { check, install };
}
module.exports = { setupUpdates, CHECK_FIRST_MS, CHECK_EVERY_MS };
