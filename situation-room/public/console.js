import { SCENES, take } from "./programme.js"; import { Monitor } from "./monitor.js"; import { loadMap } from "./scenes.js";
const $ = (id) => document.getElementById(id), esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let rev = 0, prog = null, feed = null, programFeed = null, status = null, mediaItems = [], mediaError = "", editingCompositionId = "", mvInstances = new Map(), mvSetupKey = "", compRenderKey = "", mediaRenderKey = "";   // feed: live (Preview); programFeed: what is on air (frozen or live)
const prev = new Monitor($("mPrev"), { gfx: false }), live = new Monitor($("mLive"));
const call = async (url, opt) => { try { const r = await fetch(url, opt); return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) }; } catch { return { ok: false, status: 0, body: {} }; } };

function fill() { if (!prog) return; const g = prog.graphics; $("l3t").value = g.lower.title; $("l3s").value = g.lower.sub; $("tki").value = g.ticker.items.join("\n"); $("ann").value = g.announce.text; $("bt").value = prog.branding.title; $("be").value = prog.branding.election; $("ttype").value = prog.transition.type; $("tms").value = prog.transition.ms; $("tdir").value = prog.transition.direction || "left"; $("tcolor").value = prog.transition.color || "#000000"; $("tstinger").value = prog.transition.stingerUrl || ""; $("videoTsOn").checked = g.videoTimestamp !== false; $("videoLocOn").checked = g.videoLocation !== false; $("videoTimezone").value = g.videoTimezone || "Africa/Lagos"; }
async function commit(fn) {
  if (!prog) return; const next = structuredClone(prog); fn(next);
  const r = await call("/api/programme", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ rev, programme: next }) });
  if (r.ok || r.status === 409) { rev = r.body.rev; prog = r.body.programme; if (r.status === 409) fill(); } else flash("Could not save. Is the app still running?");
  render();
}
function flash(m) { const el = $("conn"); el.textContent = m; el.className = "pill bad"; }
const doTake = (via) => commit((p) => { const t = take(p, via ?? p.transition.type); p.live = t.live; p.preview = t.preview; });

function allScenes() { return [...Object.entries(SCENES).map(([id, name]) => ({ id, name })), ...(prog?.customScenes || []).map((s) => ({ id: s.id, name: s.name }))]; }
function sceneOptions(selected = "") { return allScenes().map((s) => `<option value="${esc(s.id)}" ${s.id === selected ? "selected" : ""}>${esc(s.name)}</option>`).join(""); }
function render() {
  if (!prog) return;
  prev.update({ scene: prog.preview.scene, via: "cut", feed, prog });
  live.update({ scene: prog.live.scene, via: prog.live.via, ms: prog.transition.ms, feed: programFeed ?? feed, prog });
  $("scenes").innerHTML = allScenes().map(({id, name}) => `<li data-id="${esc(id)}" class="${id === prog.preview.scene ? "pvx " : ""}${id === prog.live.scene ? "lvx" : ""}">${esc(name)}</li>`).join("");
  renderOutputs(); renderMultiview(); renderComposition(); renderMedia();
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
function renderMultiview() {
  const panel = document.querySelector('[data-panel="multiview"]'); if (!panel || panel.classList.contains("closed") || panel.classList.contains("min")) return;
  const count = Number($("mvCount").value || 4), scenes = allScenes(), key = `${count}|${scenes.map((s) => s.id).join(",")}`;
  let saved = []; try { saved = JSON.parse(localStorage.getItem("sr-multiview-scenes") || "[]"); } catch {}
  const defaults = ["national", "president", "map", "progress"];
  if (mvSetupKey !== key) {
    $("multiviewGrid").innerHTML = ""; mvInstances.clear();
    for (let i = 0; i < count; i++) {
      const scene = scenes.some((s) => s.id === saved[i]) ? saved[i] : (scenes.some((s) => s.id === defaults[i]) ? defaults[i] : scenes[0]?.id || "national");
      const tile = document.createElement("div"); tile.className = "mv-tile"; tile.dataset.tile = String(i);
      tile.innerHTML = `<h4>Monitor ${i + 1} <span class="mv-tag" data-mv-tag></span></h4><div class="mini-vp" id="mvBox${i}"></div><select aria-label="Scene for monitor ${i + 1}" data-mv-scene="${i}">${sceneOptions(scene)}</select><button type="button" data-mv-preview="${i}">Load into Preview</button>`;
      $("multiviewGrid").append(tile); mvInstances.set(i, { monitor: new Monitor(tile.querySelector(".mini-vp"), { gfx: false, contain: true }), scene });
    }
    mvSetupKey = key;
  }
  for (const [i, item] of mvInstances) {
    const sel = $("multiviewGrid").querySelector(`[data-mv-scene="${i}"]`); if (sel) item.scene = sel.value || item.scene;
    item.monitor.update({ scene: item.scene, via: "cut", feed, prog });
    const tile = $("multiviewGrid").querySelector(`[data-tile="${i}"]`), tag = tile?.querySelector("[data-mv-tag]");
    if (tag) { const isLive = item.scene === prog.live.scene, isPreview = item.scene === prog.preview.scene; tag.textContent = isLive ? "PROGRAM" : isPreview ? "PREVIEW" : ""; tag.className = `mv-tag${isLive ? " program" : isPreview ? " preview" : ""}`; }
  }
  const updated = [...mvInstances.values()].map((x) => x.scene); try { localStorage.setItem("sr-multiview-scenes", JSON.stringify(updated)); } catch {}
}
function renderComposition() {
  if (!prog) return;
  const typeNow = $("compType").value; const keyNow = `${JSON.stringify(prog.customScenes)}|${editingCompositionId}|${typeNow}|${prog.preview.scene}`; if (keyNow === compRenderKey) return; compRenderKey = keyNow;
  const sel = $("compTarget"), old = editingCompositionId || sel.value;
  sel.innerHTML = `<option value="">Select a composition</option>` + (prog.customScenes || []).map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("");
  editingCompositionId = (prog.customScenes || []).some((s) => s.id === old) ? old : ""; sel.value = editingCompositionId;
  $("compSourceScene").innerHTML = sceneOptions(prog.preview.scene);
  const type = $("compType").value; $("compSceneWrap").hidden = type !== "scene"; $("compUrlWrap").hidden = !["video", "image"].includes(type); $("compTextWrap").hidden = type !== "text";
  const target = (prog.customScenes || []).find((s) => s.id === editingCompositionId);
  $("compLayers").innerHTML = target ? (target.layers || []).map((l, i) => `<div class="comp-layer-row" data-layer-row="${esc(l.id)}"><span class="comp-layer-title">${i + 1}. ${esc(l.label || l.type)} · ${esc(l.type)}</span><div class="comp-layer-edit"><label>X<input data-layer-field="x" type="number" min="0" max="100" value="${l.x}"></label><label>Y<input data-layer-field="y" type="number" min="0" max="100" value="${l.y}"></label><label>W<input data-layer-field="w" type="number" min="1" max="100" value="${l.w}"></label><label>H<input data-layer-field="h" type="number" min="1" max="100" value="${l.h}"></label><label>Z<input data-layer-field="z" type="number" min="0" max="100" value="${l.z}"></label><label>Fit<select data-layer-field="fit"><option value="contain" ${l.fit === "contain" ? "selected" : ""}>Contain</option><option value="cover" ${l.fit === "cover" ? "selected" : ""}>Cover</option><option value="fill" ${l.fit === "fill" ? "selected" : ""}>Fill</option></select></label><label class="inline-check"><input data-layer-field="visible" type="checkbox" ${l.visible ? "checked" : ""}> Visible</label><label class="inline-check"><input data-layer-field="locked" type="checkbox" ${l.locked ? "checked" : ""}> Locked</label><div class="btns"><button type="button" data-comp-save="${esc(l.id)}">Apply</button><button type="button" data-comp-remove="${esc(l.id)}">Remove</button></div></div></div>`).join("") || `<p class="hint">No layers yet. Add scenes, text, or media.</p>` : `<p class="hint">Create or select a composition to edit its layers.</p>`;
  $("compDelete").disabled = !target; $("compPreview").disabled = !target; $("compAdd").disabled = !target;
}
function formatCloudTime(v) { if (!v || !Number.isFinite(Date.parse(v))) return "Recording time unavailable"; const tz = prog?.graphics?.videoTimezone || "Africa/Lagos"; return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZoneName: "short", timeZone: tz }).format(new Date(v)); }
function renderMedia() {
  if (!prog) return;
  const q = ($("mediaSearch").value || "").trim().toLowerCase(); const items = mediaItems.filter((m) => `${m.title} ${m.location}`.toLowerCase().includes(q));
  $("mediaStatus").textContent = mediaError || (mediaItems.length ? `${mediaItems.length} cloud video${mediaItems.length === 1 ? "" : "s"} available. Recording time is from cloud recording metadata; upload time is separate.` : "No cloud videos returned by the configured endpoint.");
  const keyNow = `${q}|${editingCompositionId}|${mediaError}|${JSON.stringify(items)}`; if (keyNow === mediaRenderKey) return; mediaRenderKey = keyNow;
  $("mediaList").innerHTML = items.map((m) => `<article class="media-item"><div>${m.thumbnail ? `<img src="${esc(m.thumbnail)}" alt="" loading="lazy">` : `<div class="media-thumb"></div>`}</div><div><h4>${esc(m.title)}</h4><p class="recorded">Recorded: ${esc(formatCloudTime(m.recordingAt))}</p><p class="uploaded">Uploaded: ${esc(m.uploadAt ? formatCloudTime(m.uploadAt) : "Unavailable")}</p>${m.location ? `<p>Location: ${esc(m.location)}</p>` : ""}${m.duration != null ? `<p>Duration: ${Math.round(m.duration)} sec</p>` : ""}<div class="btns"><button type="button" data-media-load="${esc(m.id)}">Load into Preview</button><button type="button" data-media-add="${esc(m.id)}" ${editingCompositionId ? "" : "disabled"}>Add to composition</button></div></div></article>`).join("") || `<p class="hint">${mediaError ? esc(mediaError) : "No matching videos."}</p>`;
}
async function loadMediaLibrary(force = false) {
  $("mediaStatus").textContent = "Loading cloud video library…";
  const r = await call(`/api/media-library${force ? "?refresh=1" : ""}`);
  if (r.ok && r.body.ok) { mediaItems = Array.isArray(r.body.items) ? r.body.items : []; mediaError = ""; }
  else mediaError = r.body.error || "Could not load cloud video library.";
  renderMedia();
}
function uniqueSceneId(prefix, name) { const slug = String(name || "scene").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32) || "scene"; let id = `${prefix}_${slug}`, i = 2; while (allScenes().some((s) => s.id === id)) id = `${prefix}_${slug}_${i++}`; return id; }
function mediaLayer(item, x = 0, y = 0, w = 100, h = 100, z = 0) { return { id: uniqueLayerId(), type: "video", label: item.title, url: item.url, recordingAt: item.recordingAt || "", uploadAt: item.uploadAt || "", location: item.location || "", showTimestamp: true, showLocation: true, muted: true, loop: false, x, y, w, h, z, fit: "contain", locked: false, visible: true }; }
let layerSeq = 1; function uniqueLayerId() { return `layer_${Date.now().toString(36)}_${layerSeq++}`; }
async function loadMediaScene(item) {
  const id = uniqueSceneId("video", item.title);
  await commit((p) => { p.customScenes.push({ id, name: item.title.slice(0, 100), background: "#000000", layers: [mediaLayer(item)] }); p.preview.scene = id; });
}
async function addMediaToComposition(item) {
  if (!editingCompositionId) { flash("Create or select a composition first."); return; }
  await commit((p) => { const s = p.customScenes.find((x) => x.id === editingCompositionId); if (!s) return; const i = s.layers.length, x = i === 0 ? 0 : (i % 2) * 50, y = i < 2 ? 0 : 50, w = i === 0 ? 100 : 50, h = i === 0 ? 100 : 50; s.layers.push(mediaLayer(item, x, y, w, h, i)); });
}
function makeLayer() {
  const type = $("compType").value, target = (prog.customScenes || []).find((s) => s.id === editingCompositionId); if (!target) return null;
  const n = target.layers.length, val = (id, fallback) => Number.isFinite(Number($(id).value)) ? Number($(id).value) : fallback;
  const layer = { id: uniqueLayerId(), type, label: type === "scene" ? allScenes().find((s) => s.id === $("compSourceScene").value)?.name || "Scene" : type === "text" ? $("compText").value.slice(0, 80) : type === "video" ? "Video source" : "Image source", sourceScene: type === "scene" ? $("compSourceScene").value : "", url: ["video", "image"].includes(type) ? $("compUrl").value.trim() : "", text: type === "text" ? $("compText").value : "", recordingAt: "", uploadAt: "", location: "", showTimestamp: true, showLocation: true, muted: true, loop: false, x: val("compX", 0), y: val("compY", 0), w: val("compW", 100), h: val("compH", 100), z: n, fit: "contain", locked: false, visible: true };
  if (type === "scene" && !layer.sourceScene) return null;
  if (["video", "image"].includes(type)) { try { const u = new URL(layer.url); if (!["http:", "https:"].includes(u.protocol)) return null; } catch { return null; } }
  if (type === "text" && !layer.text.trim()) return null;
  return layer;
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
  $("feedinfo").innerHTML = `<div><span>Central system</span><b>${esc(s.centralUrl || "not set")}</b></div><div><span>Last update</span><b>${s.lastOkAt ? new Date(s.lastOkAt).toLocaleTimeString("en-NG") : "never"}</b></div>${s.lastError ? `<div class="err">${esc(s.lastError)}</div>` : ""}<div><span>Election</span><b>${esc(f?.election?.name ?? "no data")}</b></div><div><span>Presidential</span><b>${has(f?.president)}</b></div><div><span>Senate / House / Gov.</span><b>${has(f?.seats?.senate)} / ${has(f?.seats?.house)} / ${has(f?.seats?.governorship)}</b></div><div><span>App version</span><b>${esc(u.current ?? "dev")}</b></div><div><span>Updates</span><b>${esc(u.state === "ready" ? `v${u.version} ready` : u.state === "downloading" ? `downloading ${u.percent ?? 0}%` : u.message || u.state || "")}</b></div>${u.state === "unavailable" || u.state === "dev" ? "" : '<div><span></span><button data-upd="check">Check now</button></div>'}<div><span>Projection released</span><b>${f?.projection ? "yes" : "no"}</b></div>${!s.configured ? '<div class="err">Open Settings and enter the central address and the station key from the central Admin.</div>' : ""}`;
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
$("tdir").onchange = () => commit((p) => { p.transition.direction = $("tdir").value; }); $("tcolor").onchange = () => commit((p) => { p.transition.color = $("tcolor").value; }); $("tstinger").onchange = () => commit((p) => { p.transition.stingerUrl = $("tstinger").value.trim(); });
$("videoTsOn").onchange = () => commit((p) => { p.graphics.videoTimestamp = $("videoTsOn").checked; }); $("videoLocOn").onchange = () => commit((p) => { p.graphics.videoLocation = $("videoLocOn").checked; }); $("videoTimezone").onchange = () => commit((p) => { p.graphics.videoTimezone = $("videoTimezone").value; });
document.addEventListener("keydown", (e) => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.ctrlKey || e.metaKey) return; if (e.key === "t") doTake(); if (e.key === "c") doTake("cut"); if (e.key === "f") toggleFreeze(); });
$("mvCount").onchange = () => { mvSetupKey = ""; renderMultiview(); };
$("mediaRefresh").onclick = () => loadMediaLibrary(true); $("mediaSearch").oninput = () => renderMedia();
$("compType").onchange = () => renderComposition(); $("compTarget").onchange = () => { editingCompositionId = $("compTarget").value; renderComposition(); renderMedia(); };
$("compCreate").onclick = () => {
  const name = $("compName").value.trim(); if (!name) { flash("Enter a name for the composition."); return; }
  const id = uniqueSceneId("comp", name); editingCompositionId = id;
  const sourceIds = ["national", "president", "map", "progress", "senate", "house"];
  const template = $("compTemplate").value;
  const positions = template === "two" ? [[0,0,50,100],[50,0,50,100]] : template === "four" ? [[0,0,50,50],[50,0,50,50],[0,50,50,50],[50,50,50,50]] : template === "six" ? [[0,0,33.34,50],[33.33,0,33.34,50],[66.66,0,33.34,50],[0,50,33.34,50],[33.33,50,33.34,50],[66.66,50,33.34,50]] : template === "pip" ? [[0,0,100,100],[66,5,29,29]] : [];
  const layers = positions.map(([x,y,w,h], i) => ({ id: uniqueLayerId(), type: "scene", label: allScenes().find((s) => s.id === sourceIds[i])?.name || sourceIds[i], sourceScene: sourceIds[i], url: "", text: "", recordingAt: "", uploadAt: "", location: "", showTimestamp: true, showLocation: true, muted: true, loop: false, x, y, w, h, z: i, fit: "contain", locked: false, visible: true }));
  commit((p) => { p.customScenes.push({ id, name: name.slice(0, 100), background: "#071a25", layers }); });
};
$("compAdd").onclick = () => { const layer = makeLayer(); if (!layer) { flash("Choose a valid source and complete the required field."); return; } commit((p) => { const s = p.customScenes.find((x) => x.id === editingCompositionId); if (s) s.layers.push(layer); }); };
$("compPreview").onclick = () => { if (editingCompositionId) commit((p) => { p.preview.scene = editingCompositionId; }); };
$("compDelete").onclick = () => { const id = editingCompositionId; if (!id || !confirm("Delete this composition? This cannot be undone.")) return; editingCompositionId = ""; commit((p) => { p.customScenes = p.customScenes.filter((s) => s.id !== id); if (p.preview.scene === id) p.preview.scene = "national"; if (p.live.scene === id) p.live.scene = "title"; }); };
document.addEventListener("change", (e) => { const sel = e.target.closest("[data-mv-scene]"); if (!sel) return; const i = Number(sel.dataset.mvScene), inst = mvInstances.get(i); if (inst) inst.scene = sel.value; renderMultiview(); });
document.addEventListener("click", (e) => {
  const t = e.target;
  if (t.dataset.mvPreview !== undefined) { const inst = mvInstances.get(Number(t.dataset.mvPreview)); if (inst) commit((p) => { p.preview.scene = inst.scene; }); }
  if (t.dataset.mediaLoad) { const item = mediaItems.find((m) => m.id === t.dataset.mediaLoad); if (item) loadMediaScene(item); }
  if (t.dataset.mediaAdd) { const item = mediaItems.find((m) => m.id === t.dataset.mediaAdd); if (item) addMediaToComposition(item); }
  if (t.dataset.compSave) { const layerId = t.dataset.compSave, row = t.closest("[data-layer-row]"); if (!row) return; const field = (k) => row.querySelector(`[data-layer-field="${k}"]`); const vals = { x: Number(field("x").value), y: Number(field("y").value), w: Number(field("w").value), h: Number(field("h").value), z: Number(field("z").value), fit: field("fit").value, visible: field("visible").checked, locked: field("locked").checked }; commit((p) => { const s = p.customScenes.find((x) => x.id === editingCompositionId), l = s?.layers.find((x) => x.id === layerId); if (!l) return; if (!l.locked || !vals.locked) { Object.assign(l, { x: vals.x, y: vals.y, w: vals.w, h: vals.h, z: vals.z }); } Object.assign(l, { fit: vals.fit, visible: vals.visible, locked: vals.locked }); }); }
  if (t.dataset.compRemove) { const layerId = t.dataset.compRemove; commit((p) => { const s = p.customScenes.find((x) => x.id === editingCompositionId); if (s) s.layers = s.layers.filter((l) => l.id !== layerId); }); }
});
const dlg = $("settings");
$("openSettings").onclick = async () => { const r = await call("/api/config"); if (r.ok) { $("sLabel").value = r.body.label ?? ""; $("sUrl").value = r.body.centralUrl ?? ""; $("sMediaPath").value = r.body.mediaPath ?? "/api/media-library"; $("sKey").value = ""; $("sAuto").checked = r.body.autoUpdate !== false; $("sShare").checked = r.body.share === true; $("sKey").placeholder = r.body.keySet ? "Leave blank to keep the current key" : "Paste the station key"; } $("sMsg").textContent = ""; dlg.showModal(); };
$("sCancel").onclick = () => dlg.close();
$("sSave").onclick = async (e) => { e.preventDefault(); const r = await call("/api/config", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ label: $("sLabel").value, centralUrl: $("sUrl").value, mediaPath: $("sMediaPath").value, stationKey: $("sKey").value, autoUpdate: $("sAuto").checked, share: $("sShare").checked }) });
  if (r.ok) { dlg.close(); status = r.body; renderStatus(); loadMediaLibrary(true); } else $("sMsg").textContent = (r.body.errors ?? [r.body.error ?? "Could not save."]).join(" "); };
setInterval(() => { $("clock").textContent = new Date().toLocaleTimeString("en-NG"); }, 1000);

await loadMap(); const r = await call("/api/programme"); if (r.ok) { rev = r.body.rev; prog = r.body.programme; fill(); render(); } pollFeed(); loadMediaLibrary(false);

// ---- Secondary panels: each opens, minimises and closes on its own. Program/Preview live outside this and are never touched.
const PANELS = { scenes: "Scenes", multiview: "Multiview Monitor", media: "Cloud Video Library", composition: "Scene Composition", graphics: "Graphics", outputs: "Outputs (OBS or vMix)", feed: "Data feed" };
const PANEL_DEFAULT = { scenes: "open", graphics: "open", outputs: "closed", feed: "closed", multiview: "closed", media: "closed", composition: "closed" };   // optional panels start closed on a fresh session
let panels = (() => { try { const s = JSON.parse(localStorage.getItem("sr-panels") || "null"); const out = { ...PANEL_DEFAULT }; if (s && typeof s === "object") for (const k in PANELS) if (["open", "min", "closed"].includes(s[k])) out[k] = s[k]; return out; } catch { return { ...PANEL_DEFAULT }; } })();
function applyPanels() {
  for (const k in PANELS) { const el = document.querySelector(`[data-panel="${k}"]`); if (!el) continue; el.classList.toggle("closed", panels[k] === "closed"); el.classList.toggle("min", panels[k] === "min"); const b = el.querySelector("[data-pmin]"); b.textContent = panels[k] === "min" ? "+" : "\u2013"; b.title = b.ariaLabel = (panels[k] === "min" ? "Restore " : "Minimize ") + PANELS[k]; }
  $("pmenub").innerHTML = Object.entries(PANELS).map(([k, n]) => `<label><input type="checkbox" data-ptoggle="${k}" ${panels[k] !== "closed" ? "checked" : ""}> ${esc(n)}</label>`).join("");
  try { localStorage.setItem("sr-panels", JSON.stringify(panels)); } catch { /* storage unavailable: layout just is not remembered */ }
  const mv = document.querySelector('[data-panel="multiview"]'); if (mv) { if (panels.multiview === "open") { renderMultiview(); mv.querySelectorAll("video").forEach((v) => v.play().catch(() => {})); } else mv.querySelectorAll("video").forEach((v) => v.pause()); }
}
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-panel]"), t = e.target;
  if (el && t.closest("[data-pmin]")) { const k = el.dataset.panel; panels[k] = panels[k] === "min" ? "open" : "min"; applyPanels(); }
  else if (el && t.closest("[data-pclose]")) { panels[el.dataset.panel] = "closed"; applyPanels(); }
  if (!t.closest("#pmenu")) $("pmenu").open = false;
});
document.addEventListener("change", (e) => { const k = e.target.dataset?.ptoggle; if (k) { panels[k] = e.target.checked ? "open" : "closed"; applyPanels(); } });
applyPanels();
