# Situation Room (laptop app)

An independent app for ONE laptop. It works like a small OBS/vMix switcher: Preview and Program monitors, a scene list,
Cut and Transition, lower third, ticker, announcement, and addresses to add to OBS or vMix as browser sources.
**It only receives display data from the central election system.** What is on Preview or Program, the ticker text and the title
stay on this laptop. Every laptop has its own state.

## Install (operators)
1. Run **Situation-Room-Setup-1.0.0.exe**. It installs for your Windows user (no administrator needed) and adds a desktop shortcut.
   Windows may show "Windows protected your PC" because the installer is not code-signed: choose **More info**, then **Run anyway**.
2. Open **Situation Room**. On first start the **Settings** window appears. Enter a name for the laptop, the central system address,
   and the **station key** an administrator created for this laptop (Admin > Situation-room stations). Choose Save and connect.
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
- **Multiview Monitor** is an optional panel that can monitor 2, 4, 6, or 8 existing scenes. Selecting a tile and pressing “Load into Preview” does not put it on air.
- **Scene Composition** creates a reusable scene made from existing scenes, text, images, and videos. Set each layer's X/Y/width/height percentages, save it, preview it, and then transition it to Program. Video library items can be added with their trusted cloud recording metadata.
- Available transitions include Cut, Crossfade, Fade to black/color, Slide, Push, Wipe, Zoom, Morph, and Stinger. Morph animates matching composition layers; when scenes have no matching layers, it falls back to a crossfade. These are browser-rendered effects, not a claim of frame-accurate broadcast hardware transitions.
- The cloud library uses the authenticated **Cloud media API path** in Settings (default `/api/media-library`). The central system must expose this API using the same station-key Bearer authorization and return an array or `{ "items": [...] }`, `{ "videos": [...] }`, or `{ "media": [...] }`. Each item should contain `id`, `title`/`name`, and a direct or signed `url` (`url`, `signedUrl`, `playbackUrl`, or `publicUrl`). Use `recordingAt` or `recording_at` for the original recording timestamp, `uploadedAt`/`uploaded_at` for upload time, `location` for actual source metadata, and optionally `duration` and `thumbnail`. The endpoint must return authorized video URLs; this laptop app does not hold a Supabase service-role key and does not generate signed storage URLs itself.
- The recording overlay uses only trusted recording metadata returned by that cloud endpoint. It does not substitute cloud upload time or the computer clock. Missing recording timestamps display “Recording time unavailable.” The configured endpoint must be implemented on the central application for cloud videos to appear; a 404 is reported instead of mock data.

## What it can and cannot see
Public results, seats led, reporting progress and projections an administrator has RELEASED. No agents, locations, submissions or accounts.
A lost laptop is cut off by revoking its key in the central Admin.

## Security
- Listens on this laptop only (127.0.0.1), refuses foreign host names, and refuses changes from any other website.
- The station key is stored in your Windows user profile (File > Open settings folder) and is never sent back to the screen. Treat it like a password.

## Build the installer (developers)
This needs Windows (or the free GitHub build below). It cannot be built from this source on a phone or in a restricted sandbox.
- **GitHub (easiest):** put this folder in its own GitHub repository, open Actions > "Build Windows installer" > Run workflow. When it finishes, download the **Situation-Room-Setup** artifact.
- **On a Windows PC with Node.js:** double-click `build-installer.bat`. The installer appears in `dist`.
- **Without installing anything (testing):** install Node.js, run `npm install`, then `npm run app` for the desktop window, or `node server.mjs` and open http://127.0.0.1:4010/.
- Tests: `npm test` (Node 18+). The server is tested against a stand-in central system.

## Updates
- The installed app checks for a new version 30 seconds after it starts and then every 4 hours, and downloads it in the background.
- **It never restarts by itself, so it cannot interrupt a live show.** When an update is ready the header shows **Update x.y.z ready** with a
  **Restart and update** button (it asks you to confirm OBS is not on air). If you ignore it, the update installs the next time you quit the app.
- Settings has a switch to turn automatic checks off; Help > Check for updates and the Data feed panel's Check now still work.
- **Before an election: do not publish new versions in the last days.** Freeze, test, then leave it alone.

### Publishing an update (developers)
1. The GitHub repository must be **public** (installed apps read releases without a login; the installer contains no secrets).
   Use two-factor sign-in on the account: whoever can publish a release can change every laptop's software.
2. Change `version` in `package.json` (for example 1.0.1) and commit.
3. Create and push a tag that matches it: `git tag v1.0.1` then `git push --tags`.
4. The "Build installer" action tests, builds and publishes the release. Laptops pick it up within 4 hours.
A tag that does not match `package.json` makes the action fail on purpose.

## Not done
Code signing (removes the Windows warning and lets updates be verified against a publisher, needs a certificate), staged rollouts, macOS and Linux installers. The desktop wrapper, installer and auto-update have NOT been built or run here (the update logic is unit-tested with a stand-in updater, never against a real release), and the screens have not been tested in a browser or in OBS.
