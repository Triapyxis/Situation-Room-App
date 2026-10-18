import test from "node:test"; import assert from "node:assert/strict"; import { readFileSync } from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public"), css = readFileSync(path.join(root, "styles.css"), "utf8"), html = readFileSync(path.join(root, "index.html"), "utf8");

test("scene styles are scoped to the 1920x1080 stage and cannot leak onto console controls", () => {
  // A bare ".big{font:120px}" once blew the Transition and Save buttons up to 266px and 386px tall.
  const selectors = [...css.matchAll(/(^|\})\s*([^{}@]+)\{/g)].flatMap((m) => m[2].split(",").map((s) => s.trim()));
  for (const sel of selectors.filter((s) => /\.big\b/.test(s))) assert.match(sel, /^(button\.big|\.stage\s+\.big)\b/, `unscoped selector: ${sel}`);
});
test("console buttons use the .pri class, not the scene's .big", () => {
  assert.ok(!/<button[^>]*class="[^"]*\bbig\b/.test(html)); assert.match(html, /id="take" class="pri"/); assert.match(html, /id="sSave" class="pri"/);
});
test("the protected Program/Preview section has no minimise or close controls", () => {
  const m = /<section class="mons"[^>]*>([\s\S]*?)<\/section>\s*<section class="docks"/.exec(html); assert.ok(m, "protected section found");
  assert.ok(!/data-pmin|data-pclose|data-panel/.test(m[1]), "no panel controls inside the protected workspace");
  assert.match(html, /<section class="mons" data-protected="program-preview"/);
});
test("secondary panels each have their own minimise and close controls", () => {
  for (const k of ["scenes", "graphics", "outputs", "feed"]) { const i = html.indexOf(`data-panel="${k}"`); assert.ok(i > 0, k); assert.ok(html.slice(i, i + 700).includes("data-pmin") && html.slice(i, i + 700).includes("data-pclose"), k); }
});
test("dialog keeps its buttons outside the scrolling body", () => { assert.match(html, /<div class="dbody">[\s\S]*<\/div><div class="dfoot"><button id="sSave"/); assert.match(css, /dialog\{[^}]*max-height:calc\(100dvh/); });

test("each workspace panel scrolls independently and keeps its header visible", () => {
  assert.match(css, /\.dock\{[^}]*max-height:min\(58vh,620px\)[^}]*overflow-y:auto[^}]*overscroll-behavior:contain/);
  assert.match(css, /\.dh\{[^}]*position:sticky;top:0;z-index:5/);
  assert.match(css, /\.docks\{[^}]*overscroll-behavior:contain/);
});

test("Cloud Data Multiview is a separate panel with its own grid and safe preview actions", () => {
  assert.match(html, /data-panel="cloudmultiview"/);
  assert.match(html, /id="cloudMultiviewGrid"/);
  assert.match(html, /id="cloudMvRefresh"/);
  assert.match(css, /\.cloud-multiview-grid\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  const js = readFileSync(path.join(root, "console.js"), "utf8");
  assert.match(js, /function renderCloudMultiview\(\)/);
  assert.match(js, /data-cloud-preview/);
  assert.match(js, /UNVERIFIED TIME|TIME CONFLICT/);
  assert.doesNotMatch(js, /Duration:|\.duration} sec|Resolution:/);
  assert.match(js, /Recorded:.*formatCloudTime/);
  assert.match(js, /Location unavailable/);
});


test("cloud media thumbnails never open every video and playback streams on selection", () => {
  const js = readFileSync(path.join(root, "console.js"), "utf8");
  assert.match(js, /Never open every Supabase video just to make thumbnails/);
  assert.match(js, /loading="lazy" decoding="async"/);
  assert.match(js, /preload="metadata" controlsList="nodownload"/);
  assert.doesNotMatch(js, /function requestCloudThumbnails/);
  assert.doesNotMatch(js, /function primeFallbackVideoFrames/);
  assert.match(css, /\.media-item img,\.media-item video,\.media-thumb/);
});

test("Cloud Data panel supports grid and label formats without changing the cloud feed", () => {
  assert.match(html, /id="cloudViewGrid"/); assert.match(html, /id="cloudViewLabel"/);
  const js = readFileSync(path.join(root, "console.js"), "utf8");
  assert.match(js, /function setCloudView\(mode\)/); assert.match(js, /localStorage\.setItem\("sr-cloud-video-view", cloudViewMode\)/);
  assert.match(js, /cloudViewMode === "label" \? mediaItems\.slice\(0, cloudLabelLimit\) : mediaItems\.slice\(0, count\)/);
  assert.match(html, /id="cloudMvMore"/);
  assert.match(js, /cloudLabelLimit \+= 100/);
  assert.match(js, /class="cloud-label-row"/); assert.match(css, /\.cloud-multiview-grid\.cloud-label-list\{display:flex;flex-direction:column/);
  assert.match(js, /data-cloud-preview/);
});



test("Cloud Data shows title, location, recording time and timestamp verification status without duration or resolution", () => {
  const js = readFileSync(path.join(root, "console.js"), "utf8");
  const cloud = js.slice(js.indexOf("function renderCloudMultiview()"), js.indexOf("function uniqueSceneId"));
  assert.match(cloud, /<h4>\$\{esc\(m\.title\)\}<\/h4>/);
  assert.match(cloud, /formatCloudTime\(m\.recordingAt\)/);
  assert.match(cloud, /m\.location \|\| "Location unavailable"/);
  assert.match(cloud, /timestampStatus|VERIFIED|UNVERIFIED/i); assert.doesNotMatch(cloud, /duration|resolution|uploadAt/i);
});
