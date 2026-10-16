import { SCENES, take } from "./programme.js"; import { Monitor } from "./monitor.js"; import { loadMap } from "./scenes.js";
const $ = (id) => document.getElementById(id), esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let rev = 0, prog = null, feed = null, programFeed = null, status = null;   // feed: live (Preview); programFeed: what is on air (frozen or live)
const prev = new Monitor($("mPrev"), { gfx: false }), live = new Monitor($("mLive"));
const call = async (url, opt) => { try { const r = await fetch(url, opt); return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) }; } catch { return { ok: false, status: 0, body: {} }; } };

function fill() { if (!prog) return; const g = prog.graphics; $("l3t").value = g.lower.title; $("l3s").value = g.lower.sub; $("tki").value = g.ticker.items.join("\n"); $("ann").value = g.announce.text; $("bt").value = prog.branding.title; $("be").value = prog.branding.election; $("ttype").value = prog.transition.type; $("tms").value = prog.transition.ms; }
async function commit(fn) {
  if (!prog) return; const next = structuredClone(prog); fn(next);
  const r = await call("/api/programme", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ rev, programme: next }) });
  if (r.ok || r.status === 409) { rev = r.body.rev; prog = r.body.programme; if (r.status === 409) fill(); } else flash("Could not save. Is the app still running?");
  render();
}
function flash(m) { const el = $("conn"); el.textContent = m; el.className = "pill bad"; }
const doTake = (via) => commit((p) => { const t = take(p, via ?? p.transition.type); p.live = t.live; p.preview = t.preview; });

function render() {
  if (!prog) return;
  prev.update({ scene: prog.preview.scene, via: "cut", feed, prog });
  live.update({ scene: prog.live.scene, via: prog.live.via, ms: prog.transition.ms, feed: programFeed ?? feed, prog });
  $("scenes").innerHTML = Object.entries(SCENES).map(([id, t]) => `<li data-id="${id}" class="${id === prog.preview.scene ? "pvx " : ""}${id === prog.live.scene ? "lvx" : ""}">${esc(t)}</li>`).join("");
  renderOutputs();
}
function renderOutputs() {
  const row = (l, u) => `<div class="out"><span>${esc(l)}</span><code>${esc(u)}</code><button data-copy="${esc(u)}">Copy</button> <a href="${esc(u)}" target="_blank" rel="noreferrer">Open</a></div>`, b = location.origin, sh = status?.share;
  let h = `<p class="hint">OBS on THIS laptop</p>${row("Program (full picture)", b + "/output.html")}${row("Overlay (graphics only, transparent)", b + "/output.html?layer=overlay")}`;
  h += `<p class="hint" style="margin-top:12px">OBS on ANOTHER computer</p>`;
  if (!sh?.enabled) h += `<p class="hint">${sh?.error ? esc(sh.error) + ". " : ""}Turn on sharing in Settings to get network addresses.</p>`;
  else if (!sh.urls.length) h += `<p class="hint">No network connection found on this laptop.</p>`;
  else h += sh.urls.map((u) => row(`Program via ${u.ip}`, u.program) + row(`Overlay via ${u.ip}`, u.overlay)).join("") + `<div class="out"><span>Anyone on this network who has an address can view the output. Use a trusted network.</span><button data-share="regen">Make new address</button></div>`;
  $("outs").innerHTML = h;
}
function renderStatus() {
  const s = status; if (!s) return; const age = s.lastOkAt ? Math.round((Date.now() - s.lastOkAt) / 1000) : null; let cls = "ok", txt = "Connected";
  if (!s.configured) { cls = "bad"; txt = "Not configured"; } else if (s.authError) { cls = "bad"; txt = "Station key rejected"; } else if (!s.lastOkAt) { cls = "bad"; txt = "No data yet"; } else if (s.stale) { cls = "warn"; txt = `Data delayed ${age}s`; }
  $("conn").className = "pill " + cls; $("conn").textContent = txt; $("station").textContent = s.label;
  renderOutputs();
  const fz = $("frz"); fz.hidden = !s.frozenAt; if (s.frozenAt) fz.textContent = `PROGRAM FROZEN since ${new Date(s.frozenAt).toLocaleTimeString("en-NG")}`;
  $("freeze").classList.toggle("on", !!s.frozenAt); $("freeze").textContent = s.frozenAt ? "Resume live data" : "Freeze data";
  const u = s.update ?? {}, upd = $("upd");
  if (u.state === "ready") { upd.hidden = false; upd.innerHTML = `Update ${esc(u.version)} ready <button id="updGo">Restart and update</button>`; } else if (u.state === "downloading") { upd.hidden = false; upd.textContent = `Downloading update ${u.percent ?? 0}%`; } else upd.hidden = true;
  const f = feed, has = (v) => (v ? "yes" : "no data");
  $("feedinfo").innerHTML = `<div><span>Central system</span><b>${esc(s.centralUrl || "not set")}</b></div><div><span>Last update</span><b>${s.lastOkAt ? new Date(s.lastOkAt).toLocaleTimeString("en-NG") : "never"}</b></div>${s.lastError ? `<div class="err">${esc(s.lastError)}</div>` : ""}<div><span>Election</span><b>${esc(f?.election?.name ?? "no data")}</b></div><div><span>Presidential</span><b>${has(f?.president)}</b></div><div><span>Senate / House / Gov.</span><b>${has(f?.seats?.senate)} / ${has(f?.seats?.house)} / ${has(f?.seats?.governorship)}</b></div><div><span>App version</span><b>${esc(u.current ?? "dev")}</b></div><div><span>Updates</span><b>${esc(u.state === "ready" ? `v${u.version} ready` : u.state === "downloading" ? `downloading ${u.percent ?? 0}%` : u.message || u.state || "")}</b></div>${u.state === "unavailable" || u.state === "dev" ? "" : '<div><span></span><button data-upd="check">Check now</button></div>'}<div><span>Projection released</span><b>${f?.projection ? "yes" : "no"}</b></div>${!s.configured ? '<div class="err">Copy config.example.json to config.json, fill in the address and key, then restart.</div>' : ""}`;
}
let askedSettings = false;
async function pullFeed() { const j = await call("/api/feed"); if (j.ok) { status = j.body; feed = j.body.feed; programFeed = j.body.program; renderStatus(); render(); if (!status.configured && !askedSettings) { askedSettings = true; $("openSettings").click(); } } else flash("App not responding"); }
async function pollFeed() { await pullFeed(); setTimeout(pollFeed, 2000); }
async function toggleFreeze() { if (!status) return; const r = await call("/api/freeze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ on: !status.frozenAt }) }); if (!r.ok) flash(r.body.error ?? "Could not change freeze"); await pullFeed(); }

document.addEventListener("click", (e) => {
  const t = e.target; if (t.closest("#scenes li")) { const id = t.closest("li").dataset.id; commit((p) => { p.preview.scene = id; }); }
  if (t.dataset.copy) navigator.clipboard?.writeText(t.dataset.copy);
  if (t.dataset.share === "regen" && confirm("Make a new address?\n\nThe old addresses stop working immediately. You will need to update the Browser source in OBS.")) call("/api/share/regenerate", { method: "POST" }).then(pullFeed);
  if (t.dataset.upd === "check") call("/api/update/check", { method: "POST" });
  if (t.id === "updGo" && confirm("Restart Situation Room to install the update?\n\nMake sure OBS or vMix is not showing this laptop's output right now: the picture will go blank for a short moment.")) call("/api/update/install", { method: "POST" });
  const g = t.dataset.g; if (!g) return;
  const lines = () => $("tki").value.split("\n").map((x) => x.trim()).filter(Boolean);
  const act = { l3on: (p) => { Object.assign(p.graphics.lower, { on: true, title: $("l3t").value, sub: $("l3s").value }); }, l3off: (p) => { p.graphics.lower.on = false; },
    tkon: (p) => { Object.assign(p.graphics.ticker, { on: true, items: lines() }); }, tkoff: (p) => { p.graphics.ticker.on = false; },
    anon: (p) => { Object.assign(p.graphics.announce, { on: true, text: $("ann").value }); }, anoff: (p) => { p.graphics.announce.on = false; },
    brand: (p) => { p.branding.title = $("bt").value; p.branding.election = $("be").value; } }[g];
  if (act) commit(act);
});
document.addEventListener("dblclick", (e) => { const li = e.target.closest("#scenes li"); if (li) commit((p) => { p.preview.scene = li.dataset.id; const t = take(p, p.transition.type); p.live = t.live; p.preview = t.preview; }); });
$("freeze").onclick = () => toggleFreeze(); $("take").onclick = () => doTake(); $("cut").onclick = () => doTake("cut");
$("ttype").onchange = () => commit((p) => { p.transition.type = $("ttype").value; }); $("tms").onchange = () => commit((p) => { p.transition.ms = Number($("tms").value); });
document.addEventListener("keydown", (e) => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.ctrlKey || e.metaKey) return; if (e.key === "t") doTake(); if (e.key === "c") doTake("cut"); if (e.key === "f") toggleFreeze(); });
const dlg = $("settings");
$("openSettings").onclick = async () => { const r = await call("/api/config"); if (r.ok) { $("sLabel").value = r.body.label ?? ""; $("sUrl").value = r.body.centralUrl ?? ""; $("sKey").value = ""; $("sAuto").checked = r.body.autoUpdate !== false; $("sShare").checked = r.body.share === true; $("sKey").placeholder = r.body.keySet ? "Leave blank to keep the current key" : "Paste the station key"; } $("sMsg").textContent = ""; dlg.showModal(); };
$("sCancel").onclick = () => dlg.close();
$("sSave").onclick = async (e) => { e.preventDefault(); const r = await call("/api/config", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ label: $("sLabel").value, centralUrl: $("sUrl").value, stationKey: $("sKey").value, autoUpdate: $("sAuto").checked, share: $("sShare").checked }) });
  if (r.ok) { dlg.close(); status = r.body; renderStatus(); } else $("sMsg").textContent = (r.body.errors ?? [r.body.error ?? "Could not save."]).join(" "); };
setInterval(() => { $("clock").textContent = new Date().toLocaleTimeString("en-NG"); }, 1000);

await loadMap(); const r = await call("/api/programme"); if (r.ok) { rev = r.body.rev; prog = r.body.programme; fill(); render(); } pollFeed();
