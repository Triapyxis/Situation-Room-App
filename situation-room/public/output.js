import { Monitor } from "./monitor.js"; import { loadMap } from "./scenes.js";
// OBS/vMix browser source. ?layer=overlay shows only the graphics on a transparent background.
const layer = new URLSearchParams(location.search).get("layer") === "overlay" ? "overlay" : "program";
const m = new Monitor(document.getElementById("out"), { layer, contain: true });
let prog = null, feed = null;
const paint = () => { if (prog) m.update({ scene: prog.live.scene, via: prog.live.via, ms: prog.transition.ms, feed, prog }); };
const pull = async (url) => { try { const r = await fetch(url, { cache: "no-store" }); return r.ok ? await r.json() : null; } catch { return null; } };   // on failure keep showing the last good frame
await loadMap();
// One endpoint, same relative address locally (/api/output) and on another computer (/o/<secret>/api/output).
// "feed" is the frozen snapshot while the operator has frozen the picture. On any failure the last good frame stays on screen.
(async function loop() { const j = await pull("api/output"); if (j && j.programme) { prog = j.programme; if (j.feed) feed = j.feed; paint(); } setTimeout(loop, 1000); })();
