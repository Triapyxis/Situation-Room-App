import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const consoleSource = readFileSync(path.join(root, "public/console.js"), "utf8");
const monitorSource = readFileSync(path.join(root, "public/monitor.js"), "utf8");

test("primary actions resolve nested text and icon clicks to their button", () => {
  assert.match(consoleSource, /e\.target\.closest\("button, a, \[data-g\], \[data-copy\], \[data-share\], \[data-upd\]"\)/);
});
test("multiview, media, and composition actions resolve delegated targets", () => {
  assert.match(consoleSource, /e\.target\.closest\("\[data-mv-preview\], \[data-media-load\], \[data-cloud-preview\], \[data-cloud-play\], \[data-media-add\], \[data-comp-save\], \[data-comp-remove\]"\)/);
});
test("programme writes are serialized and stale revisions are retried", () => {
  assert.match(consoleSource, /let commitQueue = Promise\.resolve\(\)/);
  assert.match(consoleSource, /const task = commitQueue\.then\(run, run\)/);
  assert.match(consoleSource, /if \(r\.status === 409 && r\.body\?\.programme/);
});
test("reused monitor layers clear stale transition animation classes", () => {
  assert.match(monitorSource, /_clearTransition\(el\)/);
  assert.match(monitorSource, /this\._clearTransition\(nel\); this\._clearTransition\(oel\)/);
});
