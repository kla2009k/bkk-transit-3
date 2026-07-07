# Bangkok Transit 3D — MRTA Innovation Camp Submission Note

## One-line pitch
Bangkok Transit 3D turns Bangkok rail planning into a pre-trip simulator: route, fare, transfer, station exits, MRTA spotlight, and first-ride training in one browser app.

## Problem
Many potential rail users know the destination but not the real journey: which line to board, where to transfer, how much it costs, whether the 20-baht policy applies, and how to exit the station. This uncertainty is worse for first-time riders, tourists, older users, and people who need accessible routes.

## Solution
- 3D rail map from real station and track geometry.
- Route planner with transfer steps and platform-direction language.
- Fare comparison: registered 20-baht scheme vs normal per-operator fares.
- Service-time view: first train, last train, and headway by time band.
- First Ride Simulator for users who have never ridden before.
- MRTA Mode to spotlight MRT Blue, Purple, Yellow, and Pink lines.
- Data transparency pages: official/open/estimated/local-only labels.

## Demo URL checklist
Run locally:

```powershell
python -m http.server 8321
```

Open:

```text
http://127.0.0.1:8321/
http://127.0.0.1:8321/?mrta
http://127.0.0.1:8321/?route=สยาม,ท่าพระ
http://127.0.0.1:8321/?route=สยาม,ท่าพระ&tour
http://127.0.0.1:8321/?firstride
http://127.0.0.1:8321/?snap
```

## What judges should click
1. เพิ่มเติม → Demo Mode → เริ่มเดโม
2. บริการ → เทียบราคา 20฿ vs ปกติ
3. บริการ → ซ้อมนั่งครั้งแรก
4. เพิ่มเติม → ที่มาข้อมูลแบบละเอียด
5. ข่าวสาร → Incident Feed roadmap

## Data status
- Official/Open Data: fare lookup and ridership from Department of Rail Transport open data.
- Open Map: network, station, building, and exit geometry from OpenStreetMap.
- Estimated: service headways, crowd forecast, and CO2 impact are labelled as estimates.
- Local Only: recent routes and CO2 ledger stay in the browser.

## Known limits
- This is not an official operator app.
- Timetable data is line-level service guidance, not per-station official timetable.
- Exit and wheelchair data depend on OpenStreetMap completeness.
- Realtime incident feed is not connected yet; the app shows a roadmap rather than fake incidents.
