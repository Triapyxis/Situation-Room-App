import { renderScene, gfxHtml } from "./scenes.js";
/** Shared 1920x1080 renderer for console monitors and OBS/vMix output. */
export class Monitor {
  constructor(box, { gfx = true, layer = "program", contain = false } = {}) {
    this.box = box; this.useGfx = gfx; this.layer = layer; this.cur = "a"; this.scene = null; this.html = { a: "", b: "" }; this.g = null; this.lastProg = null;
    box.innerHTML = `<div class="stage"><div class="layer a"></div><div class="layer b"></div><div class="gfx"></div></div>`;
    this.stage = box.firstChild; this.a = this.stage.querySelector(".a"); this.b = this.stage.querySelector(".b"); this.gfxEl = this.stage.querySelector(".gfx");
    if (layer === "overlay") { this.a.style.display = this.b.style.display = "none"; }
    const fit = () => { const w = box.clientWidth, h = box.clientHeight; if (!w || !h) return; const s = contain ? Math.min(w / 1920, h / 1080) : w / 1920; this.stage.style.transform = `scale(${s})`; };
    this.fitObserver = new ResizeObserver(fit); this.fitObserver.observe(box); fit();
  }
  _preserveMedia(el) {
    return [...el.querySelectorAll("video")].map((v) => ({ id: v.closest("[data-layer-id]")?.dataset.layerId, src: v.currentSrc || v.src, time: Number.isFinite(v.currentTime) ? v.currentTime : 0, paused: v.paused, muted: v.muted }));
  }
  _restoreMedia(el, states) {
    for (const state of states) {
      const v = [...el.querySelectorAll("video")].find((x) => x.closest("[data-layer-id]")?.dataset.layerId === state.id && (x.currentSrc || x.src) === state.src);
      if (!v) continue; v.muted = state.muted; const restore = () => { try { if (state.time > 0 && Number.isFinite(v.duration)) v.currentTime = Math.min(state.time, Math.max(0, v.duration - 0.1)); } catch {} if (!state.paused) v.play().catch(() => {}); };
      if (v.readyState >= 1) restore(); else v.addEventListener("loadedmetadata", restore, { once: true });
    }
  }
  _morph(outgoing, incoming, ms) {
    const oldLayers = new Map();
    for (const el of outgoing.querySelectorAll("[data-layer-id]")) { const key = el.dataset.morphKey || el.dataset.layerId; if (!oldLayers.has(key)) oldLayers.set(key, []); oldLayers.get(key).push(el); }
    let matches = 0;
    for (const el of incoming.querySelectorAll("[data-layer-id]")) {
      const key = el.dataset.morphKey || el.dataset.layerId, bucket = oldLayers.get(key), old = bucket?.shift(); if (!old) continue;
      const a = old.getBoundingClientRect(), b = el.getBoundingClientRect(); if (!a.width || !a.height || !b.width || !b.height) continue;
      const stageRect = this.stage.getBoundingClientRect(), scale = stageRect.width / 1920 || 1;
      const dx = (a.left - b.left) / scale, dy = (a.top - b.top) / scale, sx = a.width / b.width, sy = a.height / b.height;
      try { el.animate([{ transformOrigin: "top left", transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})`, opacity: .75 }, { transformOrigin: "top left", transform: "translate(0,0) scale(1,1)", opacity: 1 }], { duration: ms, easing: "cubic-bezier(.2,.8,.2,1)" }); matches++; } catch {}
    }
    return matches > 0;
  }
  _transition(outgoing, incoming, type, ms, prog) {
    const d = Math.max(0, Math.min(3000, ms || 0));
    if (type === "cut" || !outgoing || d === 0) { incoming.style.opacity = "1"; outgoing?.classList.remove("on"); incoming.classList.add("on"); return; }
    incoming.style.setProperty("--transition-ms", `${d}ms`); incoming.style.setProperty("--transition-color", prog?.transition?.color || "#000000"); this.stage.style.setProperty("--transition-ms", `${d}ms`); this.stage.style.setProperty("--transition-color", prog?.transition?.color || "#000000");
    if (outgoing) outgoing.style.transition = `opacity ${d}ms linear`; incoming.style.transition = `opacity ${d}ms linear`;
    incoming.classList.add("on"); outgoing.classList.remove("on");
    const supported = ["fade", "fade-black", "fade-color", "slide", "push", "wipe", "zoom", "morph", "stinger"];
    const actual = supported.includes(type) ? type : "fade";
    if (actual === "morph") {
      const matched = this._morph(outgoing, incoming, d);
      if (!matched) incoming.classList.add("fx-fade");
    } else incoming.classList.add(`fx-${actual}`, `dir-${prog?.transition?.direction || "left"}`);
    if (actual === "fade-black" || actual === "fade-color") { this.stage.classList.add(`stage-${actual}`); setTimeout(() => this.stage.classList.remove(`stage-${actual}`), d + 40); }
    if (actual === "stinger" && prog?.transition?.stingerUrl) {
      const v = document.createElement("video"); v.className = "stinger-video"; v.src = prog.transition.stingerUrl; v.autoplay = true; v.playsInline = true; v.muted = true; v.onended = () => v.remove(); v.onerror = () => v.remove(); this.stage.append(v); v.play().catch(() => v.remove()); setTimeout(() => v.remove(), Math.max(d + 1000, 6000));
    }
    setTimeout(() => { incoming.classList.remove(...["fx-fade", "fx-fade-black", "fx-fade-color", "fx-slide", "fx-push", "fx-wipe", "fx-zoom", "fx-morph", "fx-stinger", "dir-left", "dir-right", "dir-up", "dir-down"]); incoming.style.removeProperty("--transition-ms"); }, d + 80);
  }
  update({ scene, via = "fade", ms = 600, feed, prog }) {
    this.lastProg = prog;
    if (this.layer !== "overlay") {
      const html = renderScene(scene, feed, prog);
      if (scene !== this.scene) {
        const next = this.cur === "a" ? "b" : "a", nel = this[next], oel = this.scene === null ? null : this[this.cur];
        nel.innerHTML = html; this.html[next] = html; nel.style.transition = "none"; nel.classList.remove("on");
        // Layout is measured after insertion, then the selected transition is applied.
        nel.getBoundingClientRect(); this._transition(oel, nel, via, ms, prog); this.cur = next; this.scene = scene;
      } else if (html !== this.html[this.cur]) {
        const el = this[this.cur], states = this._preserveMedia(el); el.innerHTML = html; this.html[this.cur] = html; this._restoreMedia(el, states);
      }
    }
    if (this.useGfx) { const g = gfxHtml(prog); if (g !== this.g) { this.gfxEl.innerHTML = g; this.g = g; } }
  }
}
