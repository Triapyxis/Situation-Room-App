import test from "node:test"; import assert from "node:assert/strict"; import http from "node:http"; import net from "node:net"; import os from "node:os"; import fs from "node:fs"; import path from "node:path";
import { startServer } from "../server.mjs";
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "sr-")), KEY = "sr_" + "A".repeat(43);
const O = (p) => ({ origin: `http://127.0.0.1:${p}` });
const call = async (port, p, o = {}) => { const r = await fetch(`http://127.0.0.1:${port}${p}`, o); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* not json */ } return { s: r.status, j, t }; };
const feedSrv = (n = 1) => new Promise((r) => { const s = http.createServer((q, a) => { a.writeHead(200, { "content-type": "application/json" }); a.end(JSON.stringify({ syncedAt: "2026-10-12T10:00:0" + n + "Z", n, election: { name: "T" } })); }); s.listen(0, "127.0.0.1", () => r(s)); });
const boot = async (extra = {}, central = "") => { const dir = tmp(); const a = await startServer({ centralUrl: central, stationKey: central ? KEY : "", port: 0, pollSeconds: 60, dataDir: dir, configFile: path.join(dir, "c.json"), sharePort: 0, ...extra }); return { a, dir }; };
const enable = (a) => call(a.port, "/api/config", { method: "PUT", headers: O(a.port), body: JSON.stringify({ label: "L", centralUrl: "https://x.org", stationKey: KEY, share: true }) });
const closed = (port) => new Promise((r) => { const s = net.connect(port, "127.0.0.1"); s.once("connect", () => { s.destroy(); r(false); }); s.once("error", () => r(true)); });

test("sharing is OFF by default: nothing is listening for other computers", async () => { const { a } = await boot(); const st = (await call(a.port, "/api/status")).j.share; assert.deepEqual([st.enabled, st.urls.length], [false, 0]); await a.close(); });
test("enabling shares ONLY the output: picture data and the allow-listed files", async () => {
  const m = await feedSrv(), { a } = await boot({}, `http://127.0.0.1:${m.address().port}`); await call(a.port, "/api/config", { method: "PUT", headers: O(a.port), body: JSON.stringify({ label: "L", centralUrl: `http://127.0.0.1:${m.address().port}`, stationKey: KEY, share: true }) });
  const sh = (await call(a.port, "/api/status")).j.share; assert.equal(sh.enabled, true); const T = `/o/${sh.token}`, lan = sh.port;
  const out = await call(lan, `${T}/api/output`); assert.equal(out.s, 200); assert.equal(out.j.feed.n, 1); assert.ok(out.j.programme.live);
  for (const f of ["output.html", "output.js", "monitor.js", "scenes.js", "styles.css", "ng-map.json"]) assert.equal((await call(lan, `${T}/${f}`)).s, 200, f);
  for (const p of ["index.html", "console.js", "programme.js", "server.mjs", "api/config", "api/status", "api/feed", "api/programme", "api/freeze", "../server.mjs", "%2e%2e/server.mjs"]) assert.equal((await call(lan, `${T}/${p}`)).s, 404, p);
  await a.close(); m.close();
});
test("wrong, missing or malformed secrets are indistinguishable 404s with no body", async () => {
  const { a } = await boot(); await enable(a); const { token, port } = (await call(a.port, "/api/status")).j.share;
  for (const p of ["/api/output", "/output.html", `/o/${"x".repeat(32)}/api/output`, `/o/${token.slice(0, -1)}x/api/output`, `/o/short/api/output`, `/o/${token}`, "/"]) { const r = await call(port, p); assert.equal(r.s, 404, p); assert.equal(r.t, "", p); }
  await a.close();
});
test("other computers can only READ: no writes, and the console API stays local", async () => {
  const { a } = await boot(); await enable(a); const { token, port } = (await call(a.port, "/api/status")).j.share;
  for (const method of ["PUT", "POST", "DELETE"]) assert.equal((await call(port, `/o/${token}/api/output`, { method, body: "{}" })).s, 405, method);
  const code = (o) => new Promise((r) => http.get({ host: "127.0.0.1", port: a.port, ...o }, (res) => { res.resume(); r(res.statusCode); }));
  assert.equal(await code({ path: "/api/status", headers: { host: "192.168.1.5:4010" } }), 403);          // the console listener still refuses foreign hosts
  await a.close();
});
test("frozen picture is what other computers receive too", async () => {
  const m = await feedSrv(1), { a } = await boot({}, `http://127.0.0.1:${m.address().port}`); await call(a.port, "/api/config", { method: "PUT", headers: O(a.port), body: JSON.stringify({ label: "L", centralUrl: `http://127.0.0.1:${m.address().port}`, stationKey: KEY, share: true }) });
  const { token, port } = (await call(a.port, "/api/status")).j.share; await call(a.port, "/api/freeze", { method: "POST", headers: O(a.port), body: JSON.stringify({ on: true }) });
  m.close(); const m2 = http.createServer((q, r) => { r.writeHead(200); r.end(JSON.stringify({ syncedAt: "2026-10-12T10:00:09Z", n: 9 })); }); await new Promise((r) => m2.listen(m.address?.()?.port ?? 0, "127.0.0.1", r));
  const out = (await call(port, `/o/${token}/api/output`)).j; assert.equal(out.feed.n, 1); assert.equal(out.frozen, true); await a.close(); m2.close();
});
test("new address: old secret stops working immediately; change needs our Origin", async () => {
  const { a } = await boot(); await enable(a); const s1 = (await call(a.port, "/api/status")).j.share;
  assert.equal((await call(a.port, "/api/share/regenerate", { method: "POST" })).s, 403);
  const r = await call(a.port, "/api/share/regenerate", { method: "POST", headers: O(a.port) }); assert.equal(r.s, 200); const s2 = r.j.share; assert.notEqual(s2.token, s1.token);
  assert.equal((await call(s2.port, `/o/${s1.token}/api/output`)).s, 404); assert.equal((await call(s2.port, `/o/${s2.token}/api/output`)).s, 200); await a.close();
});
test("turning sharing off closes the listener; the token is saved and reused after a restart", async () => {
  const { a, dir } = await boot(); await enable(a); const s1 = (await call(a.port, "/api/status")).j.share; const saved = JSON.parse(fs.readFileSync(path.join(dir, "c.json"), "utf8")); assert.equal(saved.share, true); assert.equal(saved.shareToken, s1.token);
  await call(a.port, "/api/config", { method: "PUT", headers: O(a.port), body: JSON.stringify({ label: "L", centralUrl: "https://x.org", share: false }) }); assert.equal(await closed(s1.port), true); assert.equal((await call(a.port, "/api/status")).j.share.enabled, false); await a.close();
  const { a: b } = await boot({ configFile: path.join(dir, "c.json"), dataDir: dir, share: true, shareToken: saved.shareToken }); assert.equal((await call(b.port, "/api/status")).j.share.token, saved.shareToken); await b.close();
});
test("port already in use: sharing reports the problem, the console keeps working", async () => {
  const blocker = net.createServer().listen(0, "0.0.0.0"); await new Promise((r) => blocker.once("listening", r)); const busy = blocker.address().port;
  const { a } = await boot({ sharePort: busy }); await enable(a); const sh = (await call(a.port, "/api/status")).j.share; assert.equal(sh.enabled, false); assert.match(sh.error, /already in use/); assert.equal((await call(a.port, "/api/status")).s, 200); await a.close(); blocker.close();
});
