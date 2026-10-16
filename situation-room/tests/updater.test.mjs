import test from "node:test"; import assert from "node:assert/strict"; import { EventEmitter } from "node:events"; import { createRequire } from "node:module"; import http from "node:http"; import os from "node:os"; import fs from "node:fs"; import path from "node:path";
import { startServer } from "../server.mjs";
const { setupUpdates } = createRequire(import.meta.url)("../electron/updater.cjs");

function rig({ packaged = true, autoUpdate = true } = {}) {
  const au = Object.assign(new EventEmitter(), { checks: 0, installs: [], checkForUpdates: async () => { au.checks++; }, quitAndInstall: (...a) => au.installs.push(a) });
  const states = [], server = { setUpdate: (u) => states.push(u) }, cfg = { autoUpdate }, ticks = [];
  const u = setupUpdates({ app: { getVersion: () => "1.0.0", isPackaged: packaged }, server, cfg, autoUpdater: au, schedule: { once: (f, ms) => (ticks.push({ f, ms }), 1), every: (f, ms) => (ticks.push({ f, ms }), 2) } });
  return { au, states, cfg, ticks, u, last: () => states.at(-1) };
}
test("not packaged (dev): says so, registers no checks", () => { const r = rig({ packaged: false }); assert.equal(r.last().state, "dev"); assert.equal(r.ticks.length, 0); assert.equal(r.au.listenerCount("error"), 0); });
test("update lifecycle: checking -> downloading with progress -> ready with the new version", () => {
  const r = rig(); r.au.emit("checking-for-update"); assert.equal(r.last().state, "checking");
  r.au.emit("update-available", { version: "1.0.1" }); assert.deepEqual([r.last().state, r.last().version], ["downloading", "1.0.1"]);
  r.au.emit("download-progress", { percent: 41.6 }); assert.equal(r.last().percent, 42);
  r.au.emit("update-downloaded", { version: "1.0.1" }); assert.deepEqual([r.last().state, r.last().version, r.last().current], ["ready", "1.0.1", "1.0.0"]);
});
test("it NEVER restarts by itself: downloading and ready do not call quitAndInstall", () => {
  const r = rig(); r.au.emit("update-available", { version: "2" }); r.au.emit("update-downloaded", { version: "2" }); r.ticks.forEach((t) => t.f()); assert.equal(r.au.installs.length, 0);
});
test("install happens only on request, and only once an update is ready", () => {
  const r = rig(); r.u.install(); assert.equal(r.au.installs.length, 0);
  r.au.emit("update-downloaded", { version: "2" }); r.u.install(); assert.equal(r.au.installs.length, 1);
});
test("a later error or 'no update' does not wipe a downloaded update", () => {
  const r = rig(); r.au.emit("update-downloaded", { version: "2" }); r.au.emit("error", new Error("net")); r.au.emit("update-not-available"); r.au.emit("checking-for-update");
  assert.equal(r.states.filter((s) => s.state !== "ready").length, 1 /* initial idle only */);
});
test("errors show a generic message, never internals", () => { const r = rig(); r.au.emit("error", new Error("ENOTFOUND github.com secret-token-xyz")); assert.equal(r.last().state, "error"); assert.ok(!JSON.stringify(r.last()).includes("secret")); });
test("scheduled checks: first after 30 s, then every 4 h; skipped when the setting is off or already downloading", async () => {
  const r = rig(); assert.deepEqual(r.ticks.map((t) => t.ms), [30000, 4 * 3600 * 1000]);
  r.ticks[0].f(); await new Promise((x) => setImmediate(x)); assert.equal(r.au.checks, 1);
  r.cfg.autoUpdate = false; r.ticks[1].f(); await new Promise((x) => setImmediate(x)); assert.equal(r.au.checks, 1);          // setting read live
  r.cfg.autoUpdate = true; r.au.emit("update-available", { version: "2" }); r.ticks[1].f(); await new Promise((x) => setImmediate(x)); assert.equal(r.au.checks, 1);
});
test("manual check works even when automatic checks are off, and overlapping checks collapse", async () => {
  const r = rig({ autoUpdate: false }); await Promise.all([r.u.check(), r.u.check()]); assert.equal(r.au.checks, 1);
});

// ---- server side of the feature ----
const O = (p) => ({ origin: `http://127.0.0.1:${p}` });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "sr-"));
const call = async (port, p, o = {}) => { const r = await fetch(`http://127.0.0.1:${port}${p}`, o); return { s: r.status, j: await r.json().catch(() => null) }; };
test("server: status carries update info; install refused until ready; needs our Origin; hooks are called", async () => {
  let installed = 0, checked = 0; const a = await startServer({ centralUrl: "", stationKey: "", port: 0, pollSeconds: 60, dataDir: tmp() }, { installUpdate: () => installed++, checkUpdates: async () => { checked++; } });
  assert.equal((await call(a.port, "/api/status")).j.update.state, "unavailable");
  assert.equal((await call(a.port, "/api/update/install", { method: "POST", headers: O(a.port) })).s, 409);
  a.setUpdate({ state: "ready", version: "1.0.1", current: "1.0.0" }); assert.equal((await call(a.port, "/api/status")).j.update.version, "1.0.1");
  assert.equal((await call(a.port, "/api/update/install", { method: "POST" })).s, 403); assert.equal(installed, 0);       // another website cannot trigger a restart
  assert.equal((await call(a.port, "/api/update/install", { method: "POST", headers: O(a.port) })).s, 200); await new Promise((r) => setTimeout(r, 450)); assert.equal(installed, 1);
  assert.equal((await call(a.port, "/api/update/check", { method: "POST", headers: O(a.port) })).s, 202); await new Promise((r) => setImmediate(r)); assert.equal(checked, 1); await a.close();
});
test("server: the automatic-update setting is saved and returned", async () => {
  const file = path.join(tmp(), "c.json"), a = await startServer({ centralUrl: "", stationKey: "", port: 0, pollSeconds: 60, dataDir: tmp(), configFile: file });
  const body = { label: "L", centralUrl: "https://x.org", stationKey: "sr_" + "D".repeat(43), autoUpdate: false };
  assert.equal((await call(a.port, "/api/config", { method: "PUT", headers: O(a.port), body: JSON.stringify(body) })).s, 200);
  assert.equal((await call(a.port, "/api/config")).j.autoUpdate, false); assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).autoUpdate, false); await a.close();
});
