import test from "node:test"; import assert from "node:assert/strict"; import http from "node:http"; import os from "node:os"; import fs from "node:fs"; import path from "node:path";
import { startServer } from "../server.mjs";
const KEY = "sr_" + "A".repeat(43), FEED = { syncedAt: "2026-10-12T10:00:00Z", election: { name: "T" }, president: null };
const mock = () => new Promise((r) => { const s = http.createServer((q, a) => { if (q.headers.authorization !== `Bearer ${KEY}`) { a.writeHead(401); return a.end("{}"); } a.writeHead(200, { "content-type": "application/json" }); a.end(JSON.stringify(FEED)); }); s.listen(0, "127.0.0.1", () => r(s)); });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "sr-"));
const get = async (port, p, o) => { const r = await fetch(`http://127.0.0.1:${port}${p}`, o); return { s: r.status, j: await r.json().catch(() => null) }; };
const O = (port) => ({ origin: `http://127.0.0.1:${port}` });
const put = (port, b) => get(port, "/api/programme", { method: "PUT", headers: O(port), body: JSON.stringify(b) });
const putCfg = (port, b, headers) => get(port, "/api/config", { method: "PUT", headers: headers ?? O(port), body: JSON.stringify(b) });

test("pulls the feed from the central system with its station key", async () => {
  const m = await mock(), a = await startServer({ centralUrl: `http://127.0.0.1:${m.address().port}`, stationKey: KEY, port: 0, pollSeconds: 60, dataDir: tmp(), label: "T" });
  const f = await get(a.port, "/api/feed"); assert.equal(f.j.feed.syncedAt, FEED.syncedAt); assert.equal(f.j.stale, false); assert.equal(f.j.authError, false);
  await a.close(); m.close();
});
test("a rejected key is reported and no data is shown", async () => {
  const m = await mock(), a = await startServer({ centralUrl: `http://127.0.0.1:${m.address().port}`, stationKey: "sr_" + "B".repeat(43), port: 0, pollSeconds: 60, dataDir: tmp() });
  const f = await get(a.port, "/api/feed"); assert.equal(f.j.authError, true); assert.equal(f.j.feed, null); await a.close(); m.close();
});
test("central down: last good data is KEPT and flagged, never invented", async () => {
  const m = await mock(), a = await startServer({ centralUrl: `http://127.0.0.1:${m.address().port}`, stationKey: KEY, port: 0, pollSeconds: 60, dataDir: tmp() });
  await new Promise((r) => m.close(r)); await a.pollNow(); const f = await get(a.port, "/api/feed");
  assert.equal(f.j.feed.syncedAt, FEED.syncedAt); assert.match(f.j.lastError, /Cannot reach/); await a.close();
});
test("not configured is stated plainly", async () => { const a = await startServer({ centralUrl: "", stationKey: "", port: 0, pollSeconds: 60, dataDir: tmp() }); const s = await get(a.port, "/api/status"); assert.equal(s.j.configured, false); assert.match(s.j.lastError, /Not configured/); await a.close(); });
test("programme: rev check (409), sanitising, and persistence across restarts", async () => {
  const dir = tmp(), cfg = { centralUrl: "", stationKey: "", port: 0, pollSeconds: 60, dataDir: dir }; let a = await startServer(cfg);
  assert.equal((await get(a.port, "/api/programme")).j.rev, 0);
  const ok = await put(a.port, { rev: 0, programme: { preview: { scene: "map" }, transition: { ms: 99999 } } }); assert.equal(ok.s, 200); assert.equal(ok.j.rev, 1); assert.equal(ok.j.programme.transition.ms, 3000);
  const stale = await put(a.port, { rev: 0, programme: {} }); assert.equal(stale.s, 409); assert.equal(stale.j.rev, 1);
  await a.close(); a = await startServer(cfg); const again = await get(a.port, "/api/programme"); assert.equal(again.j.rev, 1); assert.equal(again.j.programme.preview.scene, "map"); await a.close();
});
test("local access only: foreign Host header and path traversal are refused", async () => {
  const a = await startServer({ centralUrl: "", stationKey: "", port: 0, pollSeconds: 60, dataDir: tmp() });
  const code = (o) => new Promise((r) => http.get({ host: "127.0.0.1", port: a.port, ...o }, (res) => { res.resume(); r(res.statusCode); }));
  assert.equal(await code({ path: "/", headers: { host: "evil.example" } }), 403);
  assert.ok([403, 404].includes(await code({ path: "/..%2fserver.mjs" }))); assert.equal(await code({ path: "/" }), 200); await a.close();
});

const NEWKEY = "sr_" + "C".repeat(43);
test("changes are refused without our own Origin (other websites cannot drive the app)", async () => {
  const a = await startServer({ centralUrl: "", stationKey: "", port: 0, pollSeconds: 60, dataDir: tmp(), configFile: path.join(tmp(), "c.json") });
  assert.equal((await putCfg(a.port, { label: "x" }, {})).s, 403); assert.equal((await putCfg(a.port, { label: "x" }, { origin: "https://evil.example" })).s, 403);
  assert.equal((await get(a.port, "/api/programme", { method: "PUT", body: "{}" })).s, 403); await a.close();
});
test("settings validation: bad address, bad key, empty name, missing key", async () => {
  const a = await startServer({ centralUrl: "", stationKey: "", port: 0, pollSeconds: 60, dataDir: tmp(), configFile: path.join(tmp(), "c.json") });
  for (const u of ["javascript:alert(1)", "ftp://x.org", "http://example.com", "not a url", "", "https://user:pw@x.org", "https://x.org/?a=1"]) assert.equal((await putCfg(a.port, { label: "L", centralUrl: u, stationKey: NEWKEY })).s, 422, u);
  assert.equal((await putCfg(a.port, { label: "L", centralUrl: "https://x.org", stationKey: "sr_short" })).s, 422);
  assert.equal((await putCfg(a.port, { label: " ", centralUrl: "https://x.org", stationKey: NEWKEY })).s, 422);
  assert.equal((await putCfg(a.port, { label: "L", centralUrl: "https://x.org" })).s, 422);      // no key at all on first save
  await a.close();
});
test("settings: saved to disk, key never returned, blank key keeps the old one, hot-reloads and connects", async () => {
  const m = await mock(), file = path.join(tmp(), "c.json"), a = await startServer({ centralUrl: "", stationKey: "", port: 0, pollSeconds: 60, dataDir: tmp(), configFile: file });
  assert.equal((await get(a.port, "/api/status")).j.configured, false);
  const r = await putCfg(a.port, { label: "Studio", centralUrl: `http://127.0.0.1:${m.address().port}/`, stationKey: KEY }); assert.equal(r.s, 200); assert.equal(r.j.configured, true);
  assert.equal((await get(a.port, "/api/feed")).j.feed.syncedAt, FEED.syncedAt);                // connected without a restart
  const cfgGet = await get(a.port, "/api/config"); assert.equal(cfgGet.j.keySet, true); assert.ok(!JSON.stringify(cfgGet.j).includes(KEY));
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).stationKey, KEY);
  assert.equal((await putCfg(a.port, { label: "Renamed", centralUrl: `http://127.0.0.1:${m.address().port}` })).s, 200);   // blank key = keep
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).stationKey, KEY);
  await putCfg(a.port, { label: "Renamed", centralUrl: `http://127.0.0.1:${m.address().port}`, stationKey: NEWKEY });          // new key: old data must not linger
  const f = await get(a.port, "/api/feed"); assert.equal(f.j.feed, null); assert.equal(f.j.authError, true);
  await a.close(); m.close();
});
