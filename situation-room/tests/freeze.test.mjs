import test from "node:test"; import assert from "node:assert/strict"; import http from "node:http"; import os from "node:os"; import fs from "node:fs"; import path from "node:path";
import { startServer } from "../server.mjs";
const KEY = "sr_" + "A".repeat(43), tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "sr-"));
function mock() { const st = { n: 1 }; const s = http.createServer((q, a) => { a.writeHead(200, { "content-type": "application/json" }); a.end(JSON.stringify({ syncedAt: `2026-10-12T10:00:0${st.n}Z`, n: st.n, election: { name: "T" } })); }); return new Promise((r) => s.listen(0, "127.0.0.1", () => r({ s, st, url: `http://127.0.0.1:${s.address().port}` }))); }
const O = (p) => ({ origin: `http://127.0.0.1:${p}` });
const call = async (port, p, o = {}) => { const r = await fetch(`http://127.0.0.1:${port}${p}`, o); return { s: r.status, j: await r.json().catch(() => null) }; };
const freeze = (port, on, headers) => call(port, "/api/freeze", { method: "POST", headers: headers ?? O(port), body: JSON.stringify({ on }) });
const boot = async (m, dir) => startServer({ centralUrl: m.url, stationKey: KEY, port: 0, pollSeconds: 60, dataDir: dir, configFile: path.join(dir, "c.json") });

test("freeze holds the on-air numbers while Preview keeps moving; resume catches up", async () => {
  const m = await mock(), a = await boot(m, tmp()); let f = (await call(a.port, "/api/feed")).j; assert.equal(f.program.n, 1); assert.equal(f.frozenAt, null);
  assert.equal((await freeze(a.port, true)).j.ok, true);
  m.st.n = 2; await a.pollNow(); f = (await call(a.port, "/api/feed")).j;
  assert.equal(f.feed.n, 2); assert.equal(f.program.n, 1); assert.ok(f.frozenAt > 0);               // live moved on, air did not
  m.st.n = 3; await a.pollNow(); assert.equal((await call(a.port, "/api/feed")).j.program.n, 1);
  await freeze(a.port, false); f = (await call(a.port, "/api/feed")).j; assert.deepEqual([f.program.n, f.frozenAt], [3, null]);
  await a.close(); m.s.close();
});
test("freezing twice keeps the ORIGINAL snapshot (it does not refreeze newer data)", async () => {
  const m = await mock(), a = await boot(m, tmp()); await freeze(a.port, true); const t1 = (await call(a.port, "/api/status")).j.frozenAt;
  m.st.n = 2; await a.pollNow(); await freeze(a.port, true); const f = (await call(a.port, "/api/feed")).j; assert.equal(f.program.n, 1); assert.equal(f.frozenAt, t1); await a.close(); m.s.close();
});
test("nothing to freeze yet: refused with a clear message", async () => {
  const a = await startServer({ centralUrl: "", stationKey: "", port: 0, pollSeconds: 60, dataDir: tmp() }); const r = await freeze(a.port, true); assert.equal(r.s, 409); assert.match(r.j.error, /no data/i); await a.close();
});
test("only our own Origin can freeze or resume; bad input refused", async () => {
  const m = await mock(), a = await boot(m, tmp());
  assert.equal((await freeze(a.port, true, {})).s, 403); assert.equal((await freeze(a.port, true, { origin: "https://evil.example" })).s, 403);
  assert.equal((await call(a.port, "/api/freeze", { method: "POST", headers: O(a.port), body: JSON.stringify({ on: "yes" }) })).s, 422); await a.close(); m.s.close();
});
test("a frozen picture survives an app restart", async () => {
  const m = await mock(), dir = tmp(); let a = await boot(m, dir); await freeze(a.port, true); await a.close();
  m.st.n = 5; a = await boot(m, dir); const f = (await call(a.port, "/api/feed")).j; assert.equal(f.program.n, 1); assert.equal(f.feed.n, 5); assert.ok(f.frozenAt); await a.close(); m.s.close();
});
test("a corrupt freeze file is ignored: the app starts live", async () => {
  const m = await mock(), dir = tmp(); fs.writeFileSync(path.join(dir, "freeze.json"), '{"at":"x","feed":5}'); const a = await boot(m, dir);
  assert.equal((await call(a.port, "/api/status")).j.frozenAt, null); await a.close(); m.s.close();
});
test("changing the central address or key clears a freeze (never show the old source's numbers)", async () => {
  const m = await mock(), a = await boot(m, tmp()); await freeze(a.port, true); assert.ok((await call(a.port, "/api/status")).j.frozenAt);
  const body = { label: "L", centralUrl: m.url, stationKey: "sr_" + "E".repeat(43) };
  assert.equal((await call(a.port, "/api/config", { method: "PUT", headers: O(a.port), body: JSON.stringify(body) })).s, 200); assert.equal((await call(a.port, "/api/status")).j.frozenAt, null); await a.close(); m.s.close();
});
