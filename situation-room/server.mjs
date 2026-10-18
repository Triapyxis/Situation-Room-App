// Situation Room: a standalone laptop app. Serves the console + output pages on THIS laptop only, keeps its own
// programme state, and pulls display data from the central system (read-only) using this laptop's station key.
import http from "node:http";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import os from "node:os";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { defaultProgramme, sanitize } from "./public/programme.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), PUB = path.join(HERE, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json" };

export function loadConfig(env = process.env, dir = env.SR_CONFIG_DIR || HERE) {
  const file = path.join(dir, "config.json"); let c = {}; if (existsSync(file)) { try { c = JSON.parse(readFileSync(file, "utf8")); } catch { /* reported as not configured */ } }
  return { centralUrl: String(env.CENTRAL_URL || c.centralUrl || "").replace(/\/+$/, ""), stationKey: String(env.STATION_KEY || c.stationKey || ""), label: String(c.label || env.STATION_LABEL || "This laptop"),
    port: Number(env.PORT ?? c.port ?? 4010), pollSeconds: Math.max(2, Number(c.pollSeconds || 5)), dataDir: c.dataDir || path.join(dir, "data"), configFile: file, autoUpdate: c.autoUpdate !== false,
    mediaPath: typeof c.mediaPath === "string" && /^\/api\/[A-Za-z0-9_/-]{1,100}$/.test(c.mediaPath) ? c.mediaPath : "/api/media-library", share: c.share === true, shareToken: /^[A-Za-z0-9_-]{20,64}$/.test(c.shareToken ?? "") ? c.shareToken : "", sharePort: Number.isInteger(c.sharePort) ? c.sharePort : 4011 };
}

/** Validates the Settings form. The station key is optional on later saves (blank keeps the current one). */
export function validateSettings(b, current = {}) {
  const errors = [], v = {}; v.label = String(b?.label ?? "").trim();
  if (v.label.length < 1 || v.label.length > 60) errors.push("Give this laptop a name of 1 to 60 characters.");
  try {
    const u = new URL(String(b?.centralUrl ?? "").trim()), local = u.hostname === "127.0.0.1" || u.hostname === "localhost";
    if (!(u.protocol === "https:" || (u.protocol === "http:" && local)) || u.search || u.hash || u.username || u.password) throw new Error("bad");
    v.centralUrl = u.origin + u.pathname.replace(/\/+$/, "");
  } catch { errors.push("The central address must be a web address starting with https://"); }
  const key = String(b?.stationKey ?? "").trim();
  const pairingCode = String(b?.pairingCode ?? "").trim().toUpperCase();
  if (pairingCode && !/^[0-9A-F]{16}$/.test(pairingCode)) errors.push("The one-time pairing code must be 16 letters or numbers shown by the web app.");
  if (key) { if (/^sr_[A-Za-z0-9_-]{43}$/.test(key)) v.stationKey = key; else errors.push("That does not look like a station key."); }
  else { v.stationKey = current.stationKey || ""; if (!v.stationKey && !pairingCode) errors.push("Enter a one-time pairing code or an existing station key."); }
  v.share = typeof b?.share === "boolean" ? b.share : current.share === true;
  v.mediaPath = String(b?.mediaPath ?? current.mediaPath ?? "/api/media-library").trim(); if (!/^\/api\/[A-Za-z0-9_/-]{1,100}$/.test(v.mediaPath) || v.mediaPath.includes("..")) errors.push("Media API endpoint must be a local API path beginning /api/.");
  v.autoUpdate = typeof b?.autoUpdate === "boolean" ? b.autoUpdate : current.autoUpdate !== false;
  return { errors, values: v };
}

export async function startServer(cfg, hooks = {}) {
  let lan = null, shareError = null;                                  // optional output-only listener for OBS on OTHER computers
  const newToken = () => randomBytes(24).toString("base64url");
  const saveConfig = async () => { if (cfg.configFile) {
    if (cfg.secureStationKey && typeof cfg.persistStationKey === "function") await cfg.persistStationKey(cfg.stationKey || "");
    const saved = { label: cfg.label, centralUrl: cfg.centralUrl, ...(cfg.secureStationKey ? {} : { stationKey: cfg.stationKey }), port: cfg.port, pollSeconds: cfg.pollSeconds, autoUpdate: cfg.autoUpdate !== false, mediaPath: cfg.mediaPath || "/api/media-library", share: cfg.share === true, shareToken: cfg.shareToken || "", sharePort: cfg.sharePort ?? 4011 };
    await writeFile(cfg.configFile, JSON.stringify(saved, null, 2), { mode: 0o600 });
  } };
  let mediaCache = { at: 0, items: [], error: "Media library has not been loaded." };
  let update = { state: "unavailable", message: "Updates work in the installed app only.", current: null };
  const feed = { data: null, lastOkAt: null, lastError: null, authError: false }, STALE_MS = 30_000;
  const pfile = path.join(cfg.dataDir, "programme.json"); await mkdir(cfg.dataDir, { recursive: true });
  let prog = { rev: 0, data: defaultProgramme() };
  if (existsSync(pfile)) { try { const s = JSON.parse(readFileSync(pfile, "utf8")); prog = { rev: Number(s.rev) || 0, data: sanitize(s.data) }; } catch { /* start fresh */ } }
  let freeze = null; const ffile = path.join(cfg.dataDir, "freeze.json");        // frozen on-air numbers, kept across restarts
  if (existsSync(ffile)) { try { const f = JSON.parse(readFileSync(ffile, "utf8")); if (f && Number.isFinite(f.at) && f.feed && typeof f.feed === "object" && f.feed.syncedAt) freeze = { at: f.at, feed: f.feed }; } catch { /* unreadable: start live */ } }
  const saveFreeze = async () => { const tmp = ffile + ".tmp"; await writeFile(tmp, JSON.stringify(freeze)); await rename(tmp, ffile); };
  const persist = async () => { const tmp = pfile + ".tmp"; await writeFile(tmp, JSON.stringify(prog)); await rename(tmp, pfile); };

  async function pollNow() {
    if (!cfg.centralUrl || !cfg.stationKey) { feed.lastError = "Not configured: open Settings and pair this laptop with a one-time code"; return; }
    try {
      const r = await fetch(cfg.centralUrl + "/api/feed", { headers: { authorization: `Bearer ${cfg.stationKey}` }, signal: AbortSignal.timeout(8000) });
      if (r.status === 401) { feed.authError = true; feed.lastError = "The central system rejected this station key"; return; }
      if (!r.ok) { feed.lastError = `Central system returned ${r.status}`; return; }
      const j = await r.json(); if (!j || typeof j !== "object" || !j.syncedAt) { feed.lastError = "Unexpected reply from the central system"; return; }
      Object.assign(feed, { data: j, lastOkAt: Date.now(), lastError: null, authError: false });
    } catch (e) { feed.lastError = "Cannot reach the central system"; }   // last good data is KEPT and marked stale, never discarded or guessed
  }
  const shareView = () => {
    if (cfg.share !== true) return { enabled: false, error: null, urls: [] };
    const port = lan ? lan.address().port : cfg.sharePort, ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && (i.family === "IPv4" || i.family === 4) && !i.internal).map((i) => i.address);
    const u = (ip) => `http://${ip}:${port}/o/${cfg.shareToken}/output.html`;
    return { enabled: !!lan, error: shareError, port, token: cfg.shareToken, urls: ips.map((ip) => ({ ip, program: u(ip), overlay: u(ip) + "?layer=overlay" })) };
  };
  const OUT_FILES = new Set(["output.html", "output.js", "monitor.js", "scenes.js", "programme.js", "styles.css", "ng-map.json"]);          // the ONLY files other computers can fetch
  const sameToken = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
  const outputPayload = () => ({ programme: prog.data, feed: freeze ? freeze.feed : feed.data, frozen: !!freeze });
  const cleanMediaItems = (payload) => {
    const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : Array.isArray(payload?.videos) ? payload.videos : Array.isArray(payload?.media) ? payload.media : [];
    return rows.map((x, i) => {
      if (!x || typeof x !== "object") return null;
      const metadata = x.metadata && typeof x.metadata === "object" ? x.metadata : {};
      // Prefer an explicit <=1080p rendition. If the Supabase-backed API provides adaptive
      // variants, select the highest declared rendition no taller than 1080p.
      const variants = Array.isArray(x.variants) ? x.variants : Array.isArray(x.playbackVariants) ? x.playbackVariants : Array.isArray(metadata.variants) ? metadata.variants : [];
      const variantUrl = variants.filter((v) => v && typeof v === "object" && Number(v.height || v.resolutionHeight || v.resolution_height) > 0 && Number(v.height || v.resolutionHeight || v.resolution_height) <= 1080 && typeof (v.url || v.playbackUrl || v.playback_url) === "string" && /^https?:\/\//i.test(v.url || v.playbackUrl || v.playback_url)).sort((a,b) => Number(b.height || b.resolutionHeight || b.resolution_height) - Number(a.height || a.resolutionHeight || a.resolution_height))[0];
      const explicit1080 = [x.playbackUrl1080p, x.playback_url_1080p, x.url1080p, x.url_1080p, x.hls1080pUrl, x.hls_1080p_url, metadata.playbackUrl1080p, metadata.playback_url_1080p].find((v) => typeof v === "string" && /^https?:\/\//i.test(v));
      // When the source declares variants but none are <=1080p, do not silently
      // choose a higher-resolution rendition.
      if (variants.length && !variantUrl && !explicit1080) return null;
      const url = (variantUrl && (variantUrl.url || variantUrl.playbackUrl || variantUrl.playback_url)) || explicit1080 || [x.url, x.signedUrl, x.signed_url, x.playbackUrl, x.playback_url, x.publicUrl, x.public_url].find((v) => typeof v === "string" && /^https?:\/\//i.test(v));
      if (!url) return null;
      const mime = String(x.mimeType || x.mime_type || x.contentType || x.content_type || "").toLowerCase();
      if (mime && !mime.startsWith("video/")) return null;
      const recorded = x.recordingAt || x.recording_at || x.recordedAt || x.recorded_at || x.recordingTimestamp || x.recording_timestamp || x.originalRecordedAt || x.original_recorded_at || metadata.recordingAt || metadata.recording_at || metadata.recordedAt || metadata.recorded_at || metadata.recordingTimestamp || metadata.recording_timestamp || metadata.captureTime || "";
      const uploaded = x.uploadedAt || x.uploaded_at || x.storageUploadedAt || x.storage_uploaded_at || "";
      const validDate = (v) => v && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : "";
      const recordingAt = validDate(recorded);
      const declaredStatus = String(x.timestampVerificationStatus || x.timestamp_verification_status || metadata.timestampVerificationStatus || metadata.timestamp_verification_status || "").toLowerCase();
      const verifiedWithSource = (x.timestampVerified === true || x.timestamp_verified === true || metadata.timestampVerified === true || metadata.timestamp_verified === true) && Boolean(x.timestampVerificationSource || x.timestamp_verification_source || metadata.timestampVerificationSource || metadata.timestamp_verification_source);
      const timestampStatus = declaredStatus === "conflict" ? "conflict" : recordingAt && (declaredStatus === "verified" && verifiedWithSource) ? "verified" : recordingAt ? "unverified" : "unavailable";
      return { id: String(x.id || x.path || x.key || `media-${i}`).slice(0, 160), title: String(x.title || x.name || x.filename || `Video ${i + 1}`).slice(0, 180), url,
        recordingAt, timestampStatus, uploadAt: validDate(uploaded), location: String(x.location || metadata.location || "").slice(0, 180), duration: x.duration != null && Number.isFinite(Number(x.duration)) ? Math.max(0, Number(x.duration)) : null,
        thumbnail: typeof (x.thumbnail || x.thumbnailUrl || x.thumbnail_url) === "string" && /^https?:\/\//i.test(x.thumbnail || x.thumbnailUrl || x.thumbnail_url) ? (x.thumbnail || x.thumbnailUrl || x.thumbnail_url) : "" };
    }).filter(Boolean);
  };
  async function getMediaLibrary(force = false) {
    if (!cfg.centralUrl || !cfg.stationKey) return { ok: false, items: [], error: "Configure the central system before loading the media library." };
    if (!force && Date.now() - mediaCache.at < 30000) return { ok: !mediaCache.error, items: mediaCache.items, error: mediaCache.error };
    try {
      const r = await fetch(cfg.centralUrl + (cfg.mediaPath || "/api/media-library"), { headers: { authorization: `Bearer ${cfg.stationKey}` }, signal: AbortSignal.timeout(10000), cache: "no-store" });
      if (!r.ok) throw new Error(r.status === 404 ? "The web app does not expose the configured media API endpoint yet." : `Media API endpoint returned ${r.status}.`);
      const payload = await r.json();
      if (!Array.isArray(payload) && !Array.isArray(payload?.items) && !Array.isArray(payload?.videos) && !Array.isArray(payload?.media)) throw new Error("Media API endpoint returned an unsupported response format.");
      mediaCache = { at: Date.now(), items: cleanMediaItems(payload), error: "" }; return { ok: true, items: mediaCache.items, error: "" };
    } catch (e) { mediaCache = { at: Date.now(), items: mediaCache.items, error: String(e?.message || "Could not load media library.").slice(0, 220) }; return { ok: false, items: mediaCache.items, error: mediaCache.error }; }
  }
  async function lanHandler(req, res) {
    const nf = () => { res.writeHead(404); res.end(); };                                  // wrong token and unknown path look identical: nothing to probe
    try {
      if (req.method !== "GET") { res.writeHead(405); return res.end(); }
      const m = /^\/o\/([A-Za-z0-9_-]{20,64})\/([A-Za-z0-9_.\-\/]*)$/.exec(new URL(req.url, "http://x").pathname);
      if (!m || !cfg.shareToken || !sameToken(m[1], cfg.shareToken)) return nf();
      if (m[2] === "api/output") return send(res, 200, outputPayload());
      if (!OUT_FILES.has(m[2])) return nf();
      const data = await readFile(path.join(PUB, m[2])).catch(() => null); if (!data) return nf();
      res.writeHead(200, { "content-type": TYPES[path.extname(m[2])] || "application/octet-stream", "cache-control": "no-store" }); res.end(data);
    } catch { try { nf(); } catch { /* gone */ } }
  }
  async function closeLan() { if (lan) { const l = lan; lan = null; l.closeAllConnections?.(); await new Promise((r) => l.close(r)); } }
  async function applyShare() {
    await closeLan(); shareError = null; if (cfg.share !== true) return;
    if (!cfg.shareToken) cfg.shareToken = newToken();
    const port = Number.isInteger(cfg.sharePort) ? cfg.sharePort : 4011;
    if (port !== 0 && server.address() && port === server.address().port) { shareError = "The sharing port must differ from the console port"; return; }
    const l = http.createServer(lanHandler);
    try { await new Promise((res, rej) => { l.once("error", rej); l.listen(port, "0.0.0.0", res); }); lan = l; }
    catch (e) { shareError = e && e.code === "EADDRINUSE" ? `Port ${port} is already in use` : "Could not start sharing"; }
  }
  const view = () => ({ configured: !!(cfg.centralUrl && cfg.stationKey), label: cfg.label, centralUrl: cfg.centralUrl, lastOkAt: feed.lastOkAt, lastError: feed.lastError, authError: feed.authError, stale: !feed.lastOkAt || Date.now() - feed.lastOkAt > STALE_MS, update, frozenAt: freeze ? freeze.at : null, share: shareView() });

  const body = (req) => new Promise((res, rej) => { let b = ""; req.on("data", (c) => { b += c; if (b.length > 65536) { rej(new Error("too large")); req.destroy(); } }); req.on("end", () => res(b)); req.on("error", rej); });
  const send = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(obj)); };

  const server = http.createServer(async (req, res) => {
    try {
      const host = (req.headers.host || "").split(":")[0];
      if (host !== "127.0.0.1" && host !== "localhost") return send(res, 403, { error: "Local access only." });   // blocks DNS-rebinding
      const url = new URL(req.url, "http://localhost");
      if (req.method !== "GET" && req.method !== "HEAD") {                       // other websites open in this browser must not be able to change anything
        const o = req.headers.origin, p = server.address().port;
        if (o !== `http://127.0.0.1:${p}` && o !== `http://localhost:${p}`) return send(res, 403, { error: "Cross-origin request refused." });
      }
      if (url.pathname === "/api/config") {
        if (req.method === "GET") return send(res, 200, { label: cfg.label, centralUrl: cfg.centralUrl, mediaPath: cfg.mediaPath || "/api/media-library", keySet: !!cfg.stationKey, secureStorage: cfg.secureStationKey === true, autoUpdate: cfg.autoUpdate !== false, share: cfg.share === true });   // the key itself is never sent back
        if (req.method !== "PUT") return send(res, 405, { error: "Method not allowed." });
        if (!cfg.configFile) return send(res, 501, { error: "Saving settings is not available." });
        let b; try { b = JSON.parse(await body(req)); } catch { return send(res, 400, { error: "Invalid JSON." }); }
        const r = validateSettings(b, cfg); if (r.errors.length) return send(res, 422, { errors: r.errors });
        const values = r.values;
        const pairingCode = String(b?.pairingCode ?? "").trim().toUpperCase();
        if (pairingCode) {
          let pr;
          try { pr = await fetch(values.centralUrl + "/api/stations/pair", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: pairingCode }), signal: AbortSignal.timeout(10000), cache: "no-store" }); }
          catch { return send(res, 502, { error: "Could not reach the web app to pair this station. Check the address and internet connection." }); }
          const pj = await pr.json().catch(() => ({}));
          if (!pr.ok || typeof pj.stationKey !== "string" || !/^sr_[A-Za-z0-9_-]{43}$/.test(pj.stationKey)) return send(res, pr.status >= 400 && pr.status < 500 ? pr.status : 502, { error: pj.error || "Station pairing failed. Generate a new code if this one has expired." });
          values.stationKey = pj.stationKey;
          if (typeof pj.label === "string" && pj.label.trim()) values.label = pj.label.trim();
        }
        const changed = values.centralUrl !== cfg.centralUrl || values.stationKey !== cfg.stationKey; const mediaChanged = changed || values.mediaPath !== cfg.mediaPath;
        Object.assign(cfg, values); if (mediaChanged) mediaCache = { at: 0, items: [], error: "Media library has not been loaded." };
        await applyShare(); await saveConfig();
        if (changed) { Object.assign(feed, { data: null, lastOkAt: null, lastError: null, authError: false }); if (freeze) { freeze = null; await saveFreeze(); } }   // a new source never inherits the old source's frozen figures          // never show the old source's figures under a new source
        await pollNow(); return send(res, 200, { ok: true, ...view() });
      }
      if (url.pathname === "/api/media-library" && req.method === "GET") return send(res, 200, await getMediaLibrary(url.searchParams.get("refresh") === "1"));
      if (url.pathname === "/api/update/check" && req.method === "POST") {
        if (!hooks.checkUpdates) return send(res, 200, { ok: false, ...view() });
        Promise.resolve(hooks.checkUpdates()).catch(() => {}); return send(res, 202, { ok: true });
      }
      if (url.pathname === "/api/update/install" && req.method === "POST") {                 // only ever on an explicit click, and only when an update is already downloaded
        if (update.state !== "ready" || !hooks.installUpdate) return send(res, 409, { error: "No update is ready to install." });
        send(res, 200, { ok: true }); setTimeout(() => hooks.installUpdate(), 300); return;
      }
      if (url.pathname === "/api/freeze" && req.method === "POST") {
        let b; try { b = JSON.parse(await body(req)); } catch { return send(res, 400, { error: "Invalid JSON." }); }
        if (b.on === true) { if (!freeze) { if (!feed.data) return send(res, 409, { error: "There is no data to freeze yet." }); freeze = { at: Date.now(), feed: structuredClone(feed.data) }; await saveFreeze(); } }
        else if (b.on === false) { if (freeze) { freeze = null; await saveFreeze(); } }
        else return send(res, 422, { error: "on must be true or false." });
        return send(res, 200, { ok: true, frozenAt: freeze ? freeze.at : null });
      }
      if (url.pathname === "/api/output") return send(res, 200, outputPayload());                  // what the output page draws (same payload other computers get)
      if (url.pathname === "/api/share/regenerate" && req.method === "POST") {
        if (cfg.share !== true) return send(res, 409, { error: "Sharing is off." });
        cfg.shareToken = newToken(); await saveConfig(); return send(res, 200, { ok: true, share: shareView() });   // old addresses stop working at once
      }
      if (url.pathname === "/api/status") return send(res, 200, view());
      if (url.pathname === "/api/feed") return send(res, 200, { feed: feed.data, program: freeze ? freeze.feed : feed.data, ...view() });   // feed = live (Preview), program = what goes on air
      if (url.pathname === "/api/programme") {
        if (req.method === "GET") return send(res, 200, { rev: prog.rev, programme: prog.data });
        if (req.method === "PUT") {
          let b; try { b = JSON.parse(await body(req)); } catch { return send(res, 400, { error: "Invalid JSON." }); }
          if (b.rev !== prog.rev) return send(res, 409, { rev: prog.rev, programme: prog.data });          // stale tab: adopt the current state
          prog = { rev: prog.rev + 1, data: sanitize(b.programme) }; await persist(); return send(res, 200, { rev: prog.rev, programme: prog.data });
        }
        return send(res, 405, { error: "Method not allowed." });
      }
      if (req.method !== "GET") return send(res, 405, { error: "Method not allowed." });
      const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname), file = path.join(PUB, rel);
      if (!file.startsWith(PUB + path.sep)) return send(res, 403, { error: "Forbidden." });
      const data = await readFile(file).catch(() => null);
      if (!data) return send(res, 404, { error: "Not found." });
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-cache" }); res.end(data);
    } catch { try { send(res, 500, { error: "Server error." }); } catch { /* connection gone */ } }
  });
  await new Promise((r) => server.listen(cfg.port, "127.0.0.1", r));
  await applyShare(); if (cfg.share === true) await saveConfig(); await pollNow(); const timer = setInterval(pollNow, cfg.pollSeconds * 1000); timer.unref();
  return { port: server.address().port, pollNow, setUpdate: (u) => { update = { ...update, ...u }; }, close: async () => { clearInterval(timer); await closeLan(); await new Promise((r) => server.close(r)); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cfg = loadConfig(); const s = await startServer(cfg);
  console.log(`\nSituation Room (${cfg.label}) is running.\n  Console:  http://127.0.0.1:${s.port}/\n  OBS/vMix: http://127.0.0.1:${s.port}/output.html\n  Overlay:  http://127.0.0.1:${s.port}/output.html?layer=overlay\n`);
  if (!cfg.centralUrl || !cfg.stationKey) console.log("NOT CONFIGURED: copy config.example.json to config.json and fill in centralUrl and stationKey.\n");
}
