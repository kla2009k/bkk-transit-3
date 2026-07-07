# กรุงเทพฯ Transit 3D — Bangkok Rail Network

Interactive 3D visualization of Bangkok's entire rail transit network (BTS · MRT · ARL · SRT Red Lines), rendered as a cinematic "night flight" over the city. Real station coordinates and track geometry from OpenStreetMap — the network is to scale.

![style](https://img.shields.io/badge/three.js-r170-black) ![data](https://img.shields.io/badge/data-OpenStreetMap-7EBC6F)

## Features
- **From→To search bar** with autocomplete, 📍 nearest-station geolocation, swap, and recent-route chips
- **Station action sheet** — tap any station: official code (N8/BL13/CEN), first/last train, exits (OSM), estimated crowding, set as origin/destination
- **Official station codes** on labels and route steps; interchanges drawn with a double ring
- **Boarding direction** per leg ("ขึ้นขบวนมุ่งหน้า หลักสอง") matching real platform signage, plus destination exit hints
- **PWA** — installable (Add to Home Screen), app shell cached offline; big-text accessibility mode 🔎
- First-visit onboarding (3 bullets), `?fresh` to replay
- **True elevation semantics** — elevated lines (BTS, monorails, ARL, SRT) fly above the ground grid; underground MRT lines dive below it
- **Neon bloom** rendering with per-line official colors
- **Route planner** — click two stations → Dijkstra over the real network with proximity-based interchanges (BTS Asok ↔ MRT Sukhumvit etc.); shows minutes, km, station count, transfers; dims unused lines and draws the route as a bright tube along real track geometry. Also via URL: `?route=สยาม,ท่าพระ`
- **Station name labels** with zoom LOD — far: none, mid: interchanges/termini, near: all
- **City context** — real Bangkok buildings with shader-lit night windows, Chao Phraya river, major-road network glow
- **Service simulation** — train count per line follows real published headways by time of day (rush ≈2.5 min on Sukhumvit → ~30 trains; after midnight the network sleeps). Time bar: live clock, scrub 0-24h, or ▶ to fast-forward the day. Trains run both directions and orient along the track.
- **Chase / cab camera** — click any train to follow it; press **C** (or the button) for the driver's-eye view; Esc exits. URL: `?chase=bts_sukhumvit[,cab]`
- **Fare display** — both the registered 20-baht flat scheme (with its 30-min transfer / 180-min trip conditions, valid through 30 Sep 2026) and approximate normal per-operator fares with a per-ticket breakdown
- **Time-of-day lighting** (day theme) — sun sweeps east→west with warm dawn/dusk tones tied to the sim clock
- Hover a station → Thai/English name card
- Legend: click to toggle a line, double-click to isolate it
- `?snap` — skip intro (for screenshots/embeds)
- Fully offline — Three.js vendored locally, no CDN at runtime (fonts via Google Fonts are the only external fetch)

## Run
```powershell
cd Project_BKKTransit3D
python -m http.server 8321
# open http://localhost:8321
```
(any static server works; `file://` won't, because of ES modules + fetch)

## MRTA Camp Demo
Fastest judging flow:

1. Open the app.
2. Close onboarding if shown.
3. Tap `เพิ่มเติม`.
4. Tap `Demo Mode ปุ่มเดียว`.
5. Tap `เริ่มเดโม`.

Submission helper files are in `mrta_camp/`:

- `QUICK_README_FOR_JUDGES.md`
- `SUBMISSION_READY_NOTE.md`
- `DEMO_SCRIPT_3_MIN.md`
- `ONE_PAGER.md`

## Data
`data/transit.json` — generated from the Overpass API (OpenStreetMap).
Schema: `lines[] → {id, name_th, name_en, system, color, stations[{name_th, name_en, lat, lon}], path[[lat,lon],…]}`.
If the file is missing the app boots with a tiny built-in sample.

## Stack
Three.js r170 (vendored in `vendor/three/`) · UnrealBloomPass · OrbitControls · vanilla JS, no build step.
