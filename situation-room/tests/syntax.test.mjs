import test from "node:test"; import assert from "node:assert/strict"; import { readdirSync } from "node:fs"; import { spawnSync } from "node:child_process"; import path from "node:path"; import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [...readdirSync(path.join(root, "public")).filter((f) => f.endsWith(".js")).map((f) => path.join("public", f)), "server.mjs", "electron/main.cjs", "electron/updater.cjs"];
for (const f of files) test(`syntax: ${f}`, () => { const r = spawnSync(process.execPath, ["--check", path.join(root, f)], { encoding: "utf8" }); assert.equal(r.status, 0, r.stderr); });
