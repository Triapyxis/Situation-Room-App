// Shared by the server (validation) and the console (switching). Pure, no DOM.
export const SCENES = { title: "Title card", national: "National dashboard", president: "Presidential standings", map: "Nigeria map", senate: "Senate seats led", house: "House seats led", governorship: "Governorship seats led", progress: "Reporting progress", projection: "Projection (estimate)", announce: "Announcement", closing: "Closing screen" };
export const defaultProgramme = () => ({
  preview: { scene: "national" }, live: { scene: "title", via: "cut" },
  graphics: { lower: { on: false, title: "", sub: "" }, ticker: { on: false, items: [] }, announce: { on: false, text: "" } },
  transition: { type: "fade", ms: 600 }, branding: { title: "Election Results Centre", election: "" },
});
const str = (v, max, d = "") => (typeof v === "string" ? v.trim().slice(0, max) : d);
const bool = (v, d = false) => (typeof v === "boolean" ? v : d);
/** Never throws; anything unexpected falls back to a safe default, and every string is length-capped. */
export function sanitize(input) {
  const d = defaultProgramme(), i = input && typeof input === "object" ? input : {}, g = i.graphics ?? {}, t = i.transition ?? {}, b = i.branding ?? {};
  const scene = (v, fb) => (typeof v === "string" && v in SCENES ? v : fb);
  const ms = Number.isFinite(Number(t.ms)) && t.ms !== null && t.ms !== "" ? Math.min(3000, Math.max(0, Math.round(Number(t.ms)))) : d.transition.ms;
  return {
    preview: { scene: scene(i.preview?.scene, d.preview.scene) },
    live: { scene: scene(i.live?.scene, d.live.scene), via: i.live?.via === "fade" ? "fade" : "cut" },
    graphics: {
      lower: { on: bool(g.lower?.on), title: str(g.lower?.title, 80), sub: str(g.lower?.sub, 120) },
      ticker: { on: bool(g.ticker?.on), items: (Array.isArray(g.ticker?.items) ? g.ticker.items : []).map((x) => str(x, 140)).filter(Boolean).slice(0, 20) },
      announce: { on: bool(g.announce?.on), text: str(g.announce?.text, 200) },
    },
    transition: { type: t.type === "cut" ? "cut" : "fade", ms },
    branding: { title: str(b.title, 80, d.branding.title), election: str(b.election, 120) },
  };
}
/** Preview goes to Program; Program goes back to Preview (as in OBS studio mode). */
export function take(p, via) { return { ...p, live: { scene: p.preview.scene, via: via === "cut" ? "cut" : "fade" }, preview: { scene: p.live.scene } }; }
