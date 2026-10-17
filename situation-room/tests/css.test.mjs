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
