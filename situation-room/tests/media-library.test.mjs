import test from "node:test"; import assert from "node:assert/strict"; import http from "node:http"; import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { startServer } from "../server.mjs";
const KEY = "sr_" + "A".repeat(43);
const call = async (port, pathname) => { const r = await fetch(`http://127.0.0.1:${port}${pathname}`); return { status: r.status, body: await r.json() }; };
test("cloud media library uses the station key and keeps recording time separate from upload time", async () => {
  const central = http.createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${KEY}`) { res.writeHead(401); return res.end(); }
    res.writeHead(200, { "content-type": "application/json" });
    if (req.url === "/api/feed") return res.end(JSON.stringify({ syncedAt: "2026-10-17T08:00:00Z" }));
    if (req.url === "/api/media-library") return res.end(JSON.stringify({ items: [
      { id: "field-1", title: "Field report", url: "https://cdn.example/field-4k.mp4", variants: [{ height: 2160, url: "https://cdn.example/field-4k.mp4" }, { height: 1080, url: "https://cdn.example/field-1080.mp4" }, { height: 720, url: "https://cdn.example/field-720.mp4" }], recordingAt: "2026-10-17T07:00:00Z", uploadedAt: "2026-10-17T09:00:00Z", location: "Kano", mimeType: "video/mp4" },
      { id: "photo-1", title: "Not a video", url: "https://cdn.example/photo.png", mimeType: "image/png" }
    ] }));
    res.writeHead(404); res.end();
  });
  await new Promise((resolve) => central.listen(0, "127.0.0.1", resolve));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sr-media-"));
  const app = await startServer({ centralUrl: `http://127.0.0.1:${central.address().port}`, stationKey: KEY, port: 0, pollSeconds: 60, dataDir: dir, configFile: path.join(dir, "config.json") });
  try {
    const result = await call(app.port, "/api/media-library?refresh=1");
    assert.equal(result.status, 200); assert.equal(result.body.ok, true); assert.equal(result.body.items.length, 1);
    assert.equal(result.body.items[0].recordingAt, "2026-10-17T07:00:00.000Z"); assert.equal(result.body.items[0].uploadAt, "2026-10-17T09:00:00.000Z");
    assert.equal(result.body.items[0].location, "Kano");
    assert.equal(result.body.items[0].url, "https://cdn.example/field-1080.mp4", "prefer the highest cloud rendition at or below 1080p");
    assert.equal(result.body.items[0].timestampStatus, "unverified", "cloud origin alone must not verify recording time");
  } finally { await app.close(); central.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
