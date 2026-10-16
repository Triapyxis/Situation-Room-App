// Renders each scene as HTML for a 1920x1080 stage. Only data from the central feed is shown; missing data says so.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const n = (v) => Number(v).toLocaleString("en-NG");
const NEUTRAL = "#2c4b32";
let MAP = [];
export async function loadMap() { try { MAP = await (await fetch("ng-map.json")).json(); } catch { MAP = []; } }

const sc = (eb, title, body, foot = "") => `<div class="sc"><div class="eb">${esc(eb)}</div><h1>${esc(title)}</h1><div class="body">${body}</div>${foot ? `<div class="foot">${esc(foot)}</div>` : ""}</div>`;
const waiting = (m = "Awaiting results") => `<div class="center"><div class="big">${esc(m)}</div></div>`;
const stamp = (f) => (f?.syncedAt ? `Verified results, provisional until officially declared. Data as of ${new Date(f.syncedAt).toLocaleTimeString("en-NG")}` : "No data received yet");
const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0);
const bar = (c, p) => `<div class="t"><i style="width:${Math.max(0, Math.min(100, p))}%;background:${esc(c || "#43A047")}"></i></div>`;

function national(f) {
  const P = f?.president, have = P && P.candidates.some((c) => c.votes != null);
  if (!have) return sc(f?.election?.name || "Election", "National results", waiting(), stamp(f));
  const [a, b] = P.candidates.filter((c) => c.votes != null), cell = (c) => `<div class="col"><div class="cap">${esc(c.party)}</div><div class="nm">${esc(c.name)}</div><div class="big">${n(c.votes)}</div><div class="cap">${pct(c.votes, P.totalVotes).toFixed(1)}% of verified votes</div></div>`;
  const pr = P.progress, lead = a && b ? `${esc(a.party)} leads by ${n(a.votes - b.votes)}` : "";
  return sc(f.election?.name || "Election", "National results", `${cell(a)}${b ? cell(b) : ""}<div class="col"><div class="cap">Polling units reporting</div><div class="big">${n(pr.reporting)}</div><div class="cap">of ${n(pr.expected)} (${pct(pr.reporting, pr.expected).toFixed(1)}%)</div>${bar("#8FD19A", pct(pr.reporting, pr.expected))}<div class="cap">${n(pr.pending)} awaiting verification, ${n(pr.rejected)} rejected</div><div class="cap">${lead}</div></div>`, stamp(f));
}
function president(f) {
  const P = f?.president; if (!P || !P.candidates.some((c) => c.votes != null)) return sc("Presidential", "Presidential standings", waiting(), stamp(f));
  const rows = P.candidates.slice(0, 9).map((c) => `<div class="row"><div class="n">${esc(c.party)}</div>${bar(c.colour, pct(c.votes ?? 0, P.totalVotes))}<div class="v">${c.votes == null ? "No data" : n(c.votes)}<small>${c.votes == null ? "" : pct(c.votes, P.totalVotes).toFixed(1) + "%"}</small></div></div>`).join("");
  return sc(f.election?.name || "Presidential", "Presidential standings", `<div class="col">${rows}</div>`, stamp(f));
}
function map(f) {
  const L = f?.president?.stateLeaders ?? {}, any = Object.keys(L).length;
  const paths = MAP.map((s) => `<path d="${s.d}" fill="${esc(L[s.key]?.colour || NEUTRAL)}" stroke="#0B2E10" stroke-width="1.2"/>`).join("");
  const seen = new Map(Object.values(L).filter((v) => v.colour).map((v) => [v.party, v.colour]));
  const legend = [...seen].map(([p, c]) => `<div class="lg"><span class="sw" style="background:${esc(c)}"></span>${esc(p)}</div>`).join("");
  return sc("Presidential", "Leading party by state", `<div class="map"><svg viewBox="0 0 1000 812">${paths}</svg></div><div class="col">${any ? legend : waiting("No verified state results yet")}<div class="cap" style="margin-top:24px">Colour shows who is leading, not a declared winner. Grey: no verified results yet.</div></div>`, stamp(f));
}
function seats(f, key, title) {
  const S = f?.seats?.[key]; if (!S) return sc(title, `${title}: seats led`, waiting("No data for this contest type"), stamp(f));
  if (!S.parties.length) return sc(title, `${title}: seats led`, waiting(), stamp(f));
  const max = Math.max(1, ...S.parties.map((p) => p.seats)), rows = S.parties.slice(0, 9).map((p) => `<div class="row"><div class="n">${esc(p.party)}</div>${bar(p.colour, (p.seats / max) * 100)}<div class="v">${p.seats}</div></div>`).join("");
  return sc(title, `${title}: seats led`, `<div class="col">${rows}<div class="cap" style="margin-top:20px">Leading, not declared. ${S.counted} of ${S.total} contests have verified results${S.tied ? `, ${S.tied} tied` : ""}.</div></div>`, stamp(f));
}
function progress(f) {
  const st = f?.states ?? []; if (!st.length) return sc("Reporting", "Reporting progress", waiting("No reporting data yet"), stamp(f));
  const cells = st.map((s) => `<div class="cell"><div class="cn">${esc(s.name)}</div><div class="cp">${s.expected ? pct(s.reporting, s.expected).toFixed(0) + "%" : "n/a"}</div>${bar("#8FD19A", pct(s.reporting, s.expected))}</div>`).join("");
  return sc("Reporting", "Polling units reporting by state", `<div class="grid37">${cells}</div>`, stamp(f));
}
function projection(f) {
  const P = f?.projection; if (!P) return sc("Estimate", "Projection", waiting("No released projection"), stamp(f));
  const max = Math.max(1, ...P.shares.map((s) => s.share));
  return sc("ESTIMATE, NOT A RESULT", P.contest, `<div class="col">${P.shares.slice(0, 8).map((s) => `<div class="row"><div class="n">${esc(s.party)}</div>${bar("#E0A800", (s.share / max) * 100)}<div class="v">about ${s.share.toFixed(1)}%<small></small></div></div>`).join("")}<div class="cap" style="margin-top:20px">Projected from ${P.coverage.statesIncluded} of ${P.coverage.statesTotal} states. Not an official declaration.</div></div>`, `Produced ${new Date(P.createdAt).toLocaleTimeString("en-NG")}`);
}
export function renderScene(id, f, prog) {
  const b = prog?.branding ?? {};
  switch (id) {
    case "title": return `<div class="sc"><div class="center"><div class="eb">${esc(b.election)}</div><h1 style="font-size:110px">${esc(b.title)}</h1></div></div>`;
    case "national": return national(f); case "president": return president(f); case "map": return map(f);
    case "senate": return seats(f, "senate", "Senate"); case "house": return seats(f, "house", "House of Representatives"); case "governorship": return seats(f, "governorship", "Governorship");
    case "progress": return progress(f); case "projection": return projection(f);
    case "announce": return `<div class="sc"><div class="center"><h1 style="font-size:84px;text-align:center;max-width:1500px">${esc(prog?.graphics?.announce?.text || "")}</h1></div></div>`;
    case "closing": return `<div class="sc"><div class="center"><div class="eb">Thank you for watching</div><h1 style="font-size:100px">${esc(b.title)}</h1></div></div>`;
    default: return `<div class="sc"></div>`;
  }
}
export function gfxHtml(prog) {
  const g = prog?.graphics; if (!g) return ""; let h = "";
  if (g.announce.on && g.announce.text) h += `<div class="announce">${esc(g.announce.text)}</div>`;
  if (g.lower.on && (g.lower.title || g.lower.sub)) h += `<div class="lower"><b>${esc(g.lower.title)}</b><span>${esc(g.lower.sub)}</span></div>`;
  if (g.ticker.on && g.ticker.items.length) { const t = g.ticker.items.map(esc).join("<i>&#9679;</i>"), secs = Math.max(20, Math.round(g.ticker.items.join(" ").length * 0.2)); h += `<div class="ticker"><div class="track" style="animation-duration:${secs}s"><span>${t}</span><span>${t}</span></div></div>`; }
  return h;
}
