import { renderScene, gfxHtml } from "./scenes.js";
/** A 1920x1080 stage scaled into its box. Two layers crossfade between scenes; the same code drives the console monitors and the output page. */
export class Monitor {
  constructor(box, { gfx = true, layer = "program", contain = false } = {}) {
    this.box = box; this.useGfx = gfx; this.layer = layer; this.cur = "a"; this.scene = null; this.html = { a: "", b: "" }; this.g = null;
    box.innerHTML = `<div class="stage"><div class="layer a"></div><div class="layer b"></div><div class="gfx"></div></div>`;
    this.stage = box.firstChild; this.a = this.stage.querySelector(".a"); this.b = this.stage.querySelector(".b"); this.gfxEl = this.stage.querySelector(".gfx");
    if (layer === "overlay") { this.a.style.display = this.b.style.display = "none"; }
    const fit = () => { const w = box.clientWidth, h = box.clientHeight; const s = contain ? Math.min(w / 1920, h / 1080) : w / 1920; this.stage.style.transform = `scale(${s})`; };
    new ResizeObserver(fit).observe(box); fit();
  }
  update({ scene, via = "fade", ms = 600, feed, prog }) {
    if (this.layer !== "overlay") {
      const html = renderScene(scene, feed, prog);
      if (scene !== this.scene) {
        const next = this.cur === "a" ? "b" : "a", nel = this[next], oel = this[this.cur], d = via === "cut" || this.scene === null ? 0 : ms;
        nel.innerHTML = html; this.html[next] = html; nel.style.transition = oel.style.transition = `opacity ${d}ms linear`;
        nel.classList.add("on"); oel.classList.remove("on"); this.cur = next; this.scene = scene;
      } else if (html !== this.html[this.cur]) { this[this.cur].innerHTML = html; this.html[this.cur] = html; }
    }
    if (this.useGfx) { const g = gfxHtml(prog); if (g !== this.g) { this.gfxEl.innerHTML = g; this.g = g; } }
  }
}
