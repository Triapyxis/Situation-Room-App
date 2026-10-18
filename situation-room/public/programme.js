// Shared by the server (validation) and browser clients. All persisted input is bounded and sanitized.
export const SCENES = { title: "Title card", national: "National dashboard", president: "Presidential standings", map: "Nigeria map", senate: "Senate seats led", house: "House seats led", governorship: "Governorship seats led", progress: "Reporting progress", projection: "Projection (estimate)", announce: "Announcement", closing: "Closing screen" };
export const TRANSITIONS = ["cut", "fade", "fade-black", "fade-color", "slide", "push", "wipe", "zoom", "morph", "stinger"];
export const defaultProgramme = () => ({
  preview: { scene: "national" }, live: { scene: "title", via: "cut" },
  graphics: { lower: { on: false, title: "", sub: "" }, ticker: { on: false, items: [] }, announce: { on: false, text: "" }, videoTimestamp: true, videoLocation: true, videoTimezone: "Africa/Lagos" },
  transition: { type: "fade", ms: 600, color: "#000000", direction: "left", stingerUrl: "" }, branding: { title: "Election Results Centre", election: "" }, customScenes: [],
});
const str = (v, max, d = "") => (typeof v === "string" ? v.trim().slice(0, max) : d);
const bool = (v, d = false) => (typeof v === "boolean" ? v : d);
const safeUrl = (v) => { const s = str(v, 2048); try { const u = new URL(s); return ["https:", "http:"].includes(u.protocol) ? u.href : ""; } catch { return ""; } };
const safeId = (v) => /^[a-zA-Z0-9_-]{1,64}$/.test(String(v ?? "")) ? String(v) : "";
const safeDate = (v) => { const s = str(v, 80); return s && Number.isFinite(Date.parse(s)) ? new Date(s).toISOString() : ""; };
function cleanLayer(x, i) {
  const type = ["scene", "video", "image", "text"].includes(x?.type) ? x.type : "text";
  return { id: safeId(x?.id) || `layer_${i + 1}`, type, label: str(x?.label, 100, `Layer ${i + 1}`),
    sourceScene: safeId(x?.sourceScene), url: safeUrl(x?.url), text: str(x?.text, 500),
    recordingAt: safeDate(x?.recordingAt), uploadAt: safeDate(x?.uploadAt), timestampStatus: ["verified", "unverified", "conflict", "unavailable"].includes(x?.timestampStatus) ? x.timestampStatus : "unavailable", location: str(x?.location, 180),
    showTimestamp: bool(x?.showTimestamp, true), showLocation: bool(x?.showLocation, true), muted: bool(x?.muted, true), loop: bool(x?.loop, false),
    x: Math.max(0, Math.min(100, Number.isFinite(Number(x?.x)) ? Number(x.x) : 0)),
    y: Math.max(0, Math.min(100, Number.isFinite(Number(x?.y)) ? Number(x.y) : 0)),
    w: Math.max(1, Math.min(100, Number.isFinite(Number(x?.w)) ? Number(x.w) : 100)),
    h: Math.max(1, Math.min(100, Number.isFinite(Number(x?.h)) ? Number(x.h) : 100)), z: Math.max(0, Math.min(100, Number.isFinite(Number(x?.z)) ? Number(x.z) : i)),
    fit: ["cover", "contain", "fill"].includes(x?.fit) ? x.fit : "contain", locked: bool(x?.locked), visible: bool(x?.visible, true) };
}
function cleanCustomScenes(input) {
  if (!Array.isArray(input)) return [];
  const used = new Set(Object.keys(SCENES));
  return input.slice(0, 50).map((s, i) => {
    const id = safeId(s?.id); if (!id || used.has(id)) return null; used.add(id);
    return { id, name: str(s?.name, 100, `Custom scene ${i + 1}`), background: /^#[0-9a-fA-F]{6}$/.test(s?.background ?? "") ? s.background : "#071a25",
      layers: (Array.isArray(s?.layers) ? s.layers : []).slice(0, 40).map(cleanLayer) };
  }).filter(Boolean);
}
/** Never throws: unexpected data falls back to safe defaults and all persisted values are bounded. */
export function sanitize(input) {
  const d = defaultProgramme(), i = input && typeof input === "object" ? input : {}, g = i.graphics ?? {}, t = i.transition ?? {}, b = i.branding ?? {};
  const customScenes = cleanCustomScenes(i.customScenes);
  const knownScene = (v, fb) => typeof v === "string" && (v in SCENES || customScenes.some((s) => s.id === v)) ? v : fb;
  const ms = Number.isFinite(Number(t.ms)) && t.ms !== null && t.ms !== "" ? Math.min(3000, Math.max(0, Math.round(Number(t.ms)))) : d.transition.ms;
  const type = TRANSITIONS.includes(t.type) ? t.type : d.transition.type;
  return {
    preview: { scene: knownScene(i.preview?.scene, d.preview.scene) },
    live: { scene: knownScene(i.live?.scene, d.live.scene), via: TRANSITIONS.includes(i.live?.via) ? i.live.via : "cut" },
    graphics: {
      lower: { on: bool(g.lower?.on), title: str(g.lower?.title, 80), sub: str(g.lower?.sub, 120) },
      ticker: { on: bool(g.ticker?.on), items: (Array.isArray(g.ticker?.items) ? g.ticker.items : []).map((x) => str(x, 140)).filter(Boolean).slice(0, 20) },
      announce: { on: bool(g.announce?.on), text: str(g.announce?.text, 200) },
      videoTimestamp: bool(g.videoTimestamp, true), videoLocation: bool(g.videoLocation, true), videoTimezone: ["Africa/Lagos", "UTC", "Europe/London", "America/New_York"].includes(g.videoTimezone) ? g.videoTimezone : "Africa/Lagos",
    },
    transition: { type, ms, color: /^#[0-9a-fA-F]{6}$/.test(t.color ?? "") ? t.color : "#000000", direction: ["left", "right", "up", "down"].includes(t.direction) ? t.direction : "left", stingerUrl: safeUrl(t.stingerUrl) },
    branding: { title: str(b.title, 80, d.branding.title), election: str(b.election, 120) }, customScenes,
  };
}
/** Preview goes to Program; Program goes back to Preview. */
export function take(p, via) { const type = TRANSITIONS.includes(via) ? via : "fade"; return { ...p, live: { scene: p.preview.scene, via: type }, preview: { scene: p.live.scene } }; }
