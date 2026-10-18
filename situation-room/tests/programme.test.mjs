import test from "node:test"; import assert from "node:assert/strict";
import { sanitize, take, defaultProgramme, SCENES } from "../public/programme.js";
test("garbage input falls back to safe defaults and never throws", () => { for (const x of [null, undefined, 5, "x", [], { preview: 7, graphics: "no" }]) assert.deepEqual(sanitize(x), defaultProgramme()); });
test("unknown scenes are rejected; known are kept", () => { const p = sanitize({ preview: { scene: "map" }, live: { scene: "<script>" } }); assert.equal(p.preview.scene, "map"); assert.equal(p.live.scene, "title"); });
test("transition: types are supported and duration is clamped to 0-3000", () => { assert.equal(sanitize({ transition: { type: "wipe", ms: 99999 } }).transition.ms, 3000); assert.equal(sanitize({ transition: { type: "wipe" } }).transition.type, "wipe"); assert.equal(sanitize({ transition: { ms: -5 } }).transition.ms, 0); assert.equal(sanitize({ transition: { ms: "abc" } }).transition.ms, 600); });
test("text is trimmed and length-capped; ticker items limited to 20 and non-empty", () => {
  const p = sanitize({ graphics: { lower: { title: " " + "x".repeat(500), sub: "s" }, ticker: { items: [" a ", "", ...Array(40).fill("b".repeat(300))] }, announce: { text: "y".repeat(999) } } });
  assert.equal(p.graphics.lower.title.length, 80); assert.equal(p.graphics.ticker.items[0], "a"); assert.equal(p.graphics.ticker.items.length, 20); assert.ok(p.graphics.ticker.items.every((i) => i.length <= 140)); assert.equal(p.graphics.announce.text.length, 200);
});
test("take swaps preview and program and records the transition used", () => {
  const p = { ...defaultProgramme(), preview: { scene: "map" }, live: { scene: "title", via: "cut" } }, t = take(p, "fade");
  assert.deepEqual([t.live.scene, t.live.via, t.preview.scene], ["map", "fade", "title"]); assert.equal(p.live.scene, "title"); assert.equal(take(p, "cut").live.via, "cut");
});
test("scene list covers the planned scenes", () => assert.ok(["title", "national", "president", "map", "senate", "house", "progress", "projection", "announce", "closing"].every((k) => k in SCENES)));

test("custom compositions preserve safe source layers and allow a custom scene in Preview", () => {
  const p = sanitize({ customScenes: [{ id: "comp_grid", name: "National Grid", layers: [{ id: "vid1", type: "video", url: "https://cdn.example/video.mp4", recordingAt: "2026-10-17T08:00:00Z", x: 0, y: 0, w: 50, h: 100 }, { id: "bad", type: "video", url: "javascript:alert(1)" }] }], preview: { scene: "comp_grid" } });
  assert.equal(p.preview.scene, "comp_grid"); assert.equal(p.customScenes[0].layers[0].recordingAt, "2026-10-17T08:00:00.000Z"); assert.equal(p.customScenes[0].layers[0].url, "https://cdn.example/video.mp4"); assert.equal(p.customScenes[0].layers[1].url, "");
});
