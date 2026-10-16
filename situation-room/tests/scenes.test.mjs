import test from "node:test"; import assert from "node:assert/strict";
import { renderScene, gfxHtml } from "../public/scenes.js"; import { defaultProgramme } from "../public/programme.js";
const prog = defaultProgramme();
const feed = { syncedAt: "2026-10-12T10:00:00Z", election: { name: "Test Election" },
  president: { contest: "P", totalVotes: 300, progress: { expected: 1000, reporting: 100, pending: 4, rejected: 1 }, stateLeaders: { lagos: { party: "A", colour: "#112233", votes: 5 } },
    candidates: [{ id: "1", name: "Ada <script>alert(1)</script>", party: "A", colour: "#112233", votes: 200 }, { id: "2", name: "Bayo", party: "B", colour: null, votes: 100 }, { id: "3", name: "Chi", party: "C", colour: null, votes: null }] },
  seats: { senate: { parties: [{ party: "A", colour: null, seats: 3 }], tied: 1, counted: 4, total: 109 }, house: null, governorship: null },
  states: [{ key: "lagos", name: "Lagos", expected: 100, reporting: 50 }, { key: "ogun", name: "Ogun", expected: 0, reporting: 0 }],
  projection: { contest: "P", shares: [{ party: "A", name: "Ada", share: 61.2 }], coverage: { statesIncluded: 2, statesTotal: 37 }, createdAt: "2026-10-12T10:00:00Z", assumptions: [] } };

test("no data: every scene says so instead of showing numbers", () => { for (const id of ["national", "president", "senate", "progress", "projection", "map"]) { const h = renderScene(id, null, prog); assert.ok(/Awaiting|No data|No released|No reporting|No verified/.test(h), id); assert.ok(!/\d{3,}/.test(h.replace(/<[^>]+>/g, "")), id + " must show no figures"); } });
test("national shows real figures, the lead and the provisional wording", () => {
  const h = renderScene("national", feed, prog); assert.match(h, /200/); assert.match(h, /A leads by 100/); assert.match(h, /provisional until officially declared/); assert.match(h, /100/);
});
test("a candidate with no reported votes shows 'No data', not zero", () => assert.match(renderScene("president", feed, prog), /No data/));
test("hostile text from the feed is escaped, never executed", () => { const h = renderScene("president", feed, prog) + renderScene("national", feed, prog); assert.ok(!h.includes("<script>")); });
test("missing contest type says no data; seats say leading, not declared; ties reported", () => {
  assert.match(renderScene("house", feed, prog), /No data for this contest type/); const s = renderScene("senate", feed, prog); assert.match(s, /Leading, not declared/); assert.match(s, /1 tied/);
});
test("projection is always labelled as an estimate", () => { const h = renderScene("projection", feed, prog); assert.match(h, /ESTIMATE, NOT A RESULT/); assert.match(h, /Not an official declaration/); });
test("progress: zero expected shows n/a, not NaN or 100%", () => { const h = renderScene("progress", feed, prog); assert.match(h, /n\/a/); assert.ok(!/NaN/.test(h)); });
test("title and announcement use operator text, escaped", () => { const p = { ...prog, branding: { title: "A & B", election: "" }, graphics: { ...prog.graphics, announce: { on: true, text: "<b>x</b>" } } }; assert.match(renderScene("title", null, p), /A &amp; B/); assert.ok(!renderScene("announce", null, p).includes("<b>x")); });
test("graphics appear only when switched on", () => {
  assert.equal(gfxHtml(prog), ""); const g = { ...prog, graphics: { lower: { on: true, title: "T", sub: "S" }, ticker: { on: true, items: ["a", "b"] }, announce: { on: true, text: "N" } } };
  const h = gfxHtml(g); assert.ok(h.includes("lower") && h.includes("ticker") && h.includes("announce"));
});
