# Situation Room (laptop app)

An independent app for ONE laptop. It works like a small OBS/vMix switcher: Preview and Program monitors, a scene list,
Cut and Transition, lower third, ticker, announcement, and addresses to add to OBS or vMix as browser sources.
**It only receives display data from the central election system.** What is on Preview or Program, the ticker text and the title
stay on this laptop. Every laptop has its own state.

## Install (operators)
1. Run **Situation-Room-Setup-1.0.1.exe**. It installs for your Windows user (no administrator needed) and adds a desktop shortcut.
   Windows may show "Windows protected your PC" because the installer is not code-signed: choose **More info**, then **Run anyway**.
2. Open **Situation Room**. On first start the **Settings** window appears. Enter a name for the laptop, the central system address,
   and the **one-time pairing code** an authorised administrator generated for this laptop (Admin > Situation-room stations). Choose Save and connect. The app exchanges the code for its unique station key automatically.
3. The status badge at the top turns green when data is flowing. Settings can be changed later with the Settings button.

## Using it
- Click a scene to put it on **Preview**. **Transition** (or `T`) fades Preview to Program; **Cut** (`C`) switches instantly. Double-click a scene to take it straight to Program.
- **Freeze data** (button, or `F`) holds the numbers that are on air. Preview keeps showing live data so you can see what has changed, and a red
  "PROGRAM FROZEN since ..." badge stays in the header. **Resume live data** brings Program back up to date. The frozen picture survives an app
  restart, and changing the central address or key clears it. Use it before a dramatic swing, or whenever you want the screen to stop moving.
- Results update by themselves, about every 5 seconds, **including on Program**: a scene that is on air redraws when new verified results arrive.
  Freeze if you do not want that.
- **Graphics** overlay Program: lower third, scrolling ticker, announcement bar.
- In OBS or vMix add a **Browser source**, width 1920, height 1080:
  - `http://127.0.0.1:4010/output.html` is the full picture.
  - `http://127.0.0.1:4010/output.html?layer=overlay` is graphics only, on a transparent background.
  The File menu has **Copy OBS address** items. Keep Situation Room open while OBS is using it.
- If the central system cannot be reached, the last good data stays on screen and the console says "Data delayed". Figures are never invented; sections with no data say so.

## OBS or vMix on a different computer
Use **network sharing** (off by default): Settings > "Let OBS on another computer on this network show the output".
1. Turn it on and save. Windows may ask to allow network access the first time: choose **Private networks**.
2. The Outputs panel then lists addresses such as `http://192.168.1.20:4011/o/<secret>/output.html` (Program) and the same ending in `?layer=overlay` (graphics only, transparent).
3. On the OBS computer add a **Browser source** with that address, width 1920, height 1080. Both computers must be on the same network, and the Situation Room app must stay open.
- Only the picture is shared, behind a long secret in the address. The console, settings and every control stay on the Situation Room laptop.
  Other computers can only read; wrong or missing secrets get an empty 404.
- **Make new address** replaces the secret at once (old addresses stop working, so update OBS). Do this if an address leaks.
- The connection is plain HTTP, so anyone on that network who can see the address can view the output. Use a trusted network, not public Wi-Fi.
- Frozen data (Freeze) and the transparent overlay apply to shared outputs exactly as they do locally.
- Not NDI: this is a web page that OBS draws. If you need a true NDI video source (for example vMix on another machine), that is separate work.
- The two computers must be able to reach each other (some guest or hotel networks block this). If OBS shows a blank source, test the address in a browser on the OBS computer first.

## Multiview, composite scenes, transitions, and cloud video library

- **Scene Composition** creates a reusable scene made from existing scenes, text, images, and videos. Set each layer's X/Y/width/height percentages, save it, preview it, and then transition it to Program. Cloud library items can be added to a composition with their recording metadata.
- **Cloud Video Library** is a separate panel from the main Program/Preview monitors. It supports search, lazy metadata/thumbnail loading, streaming on selection, and a separate Grid/Label media multiview. Loading or playing a media item never takes it live automatically.
- The desktop app does **not** connect directly to Supabase or contain a Supabase service-role key. It calls the authenticated central-system endpoint configured in Settings (default `/api/media-library`) using the station key as a Bearer token. The central web app must validate that key, read the existing media metadata from Supabase, and return authorized playback URLs—preferably short-lived signed URLs for a private Storage bucket.
- The central web app now provides `/api/media-library` as a station-key-protected adapter. Configure `SITUATION_ROOM_MEDIA_SOURCE_URL` on the web app to point at the existing provider API; optionally set `SITUATION_ROOM_MEDIA_SOURCE_TOKEN` as a server-only bearer token. The endpoint may return an array or `{ "items": [...] }`, `{ "videos": [...] }`, or `{ "media": [...] }`. Each item should contain `id`, `title`/`name`, and an authorized playback URL (`url`, `signedUrl`, `playbackUrl`, or `publicUrl`). Use `recordingAt`/`recording_at` for the original recording timestamp, `uploadedAt`/`uploaded_at` for upload time, `location` for source location, and optionally `duration` and `thumbnail`. For resolution selection, provide `variants` or `playbackVariants` with each rendition's `height` and URL, or an explicit `playbackUrl1080p`. If variants are declared but none are 1080p or lower, the desktop app excludes that item rather than silently selecting a higher rendition.
- **1080p limitation:** the desktop app can select a declared rendition at or below 1080p, but it does not transcode source videos. The upload/processing pipeline must create a suitable rendition and record it in the Supabase metadata before the app can guarantee playback at 1080p or lower.
- The on-screen recording timestamp comes only from the recording metadata returned by the central endpoint. It does not substitute Supabase upload time or the computer clock. A timestamp is labelled unverified unless the server explicitly supplies trustworthy verification metadata. Missing timestamps display “Recording time unavailable.” If the provider URL is not configured, the endpoint returns `503` with a setup message; no mock videos are shown.

### Expected Supabase-backed API response example

```json
{
  "items": [
    {
      "id": "video-record-id",
      "title": "Polling Unit 001 Recording",
      "recordingAt": "2026-10-17T08:30:00Z",
      "timestampStatus": "unverified",
      "uploadedAt": "2026-10-17T08:35:00Z",
      "location": "Example polling unit",
      "thumbnail": "https://example.invalid/thumbnail.jpg",
      "variants": [
        { "height": 720, "url": "https://example.invalid/signed-720p.mp4" },
        { "height": 1080, "url": "https://example.invalid/signed-1080p.mp4" }
      ]
    }
  ]
}
```

The URLs above are placeholders only. In production, return real short-lived signed URLs created server-side from the actual private Supabase Storage bucket and stored object paths. Never expose a service-role key in the desktop app, public frontend, API response, or repository.
