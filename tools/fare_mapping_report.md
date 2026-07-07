# DRT Fare Lookup Mapping Report

Source updated: 2026-04-30  
Source URL: https://drt.gdcatalog.go.th/dataset/2f475b29-1792-4bb3-9946-6f0f5a86343d/resource/3f9f03d0-f658-4887-8789-c99fed62f9b8/download/untitled.csv

## DRT Thai line name -> app line id mapping

| DRT Line1/Line2 (Thai) | App line id | Notes |
|---|---|---|
| สายสุขุมวิท | bts_sukhumvit | direct mapping |
| สายสีลม | bts_silom | direct mapping |
| สายสีทอง | bts_gold | direct mapping |
| สายสีน้ำเงิน | mrt_blue | direct mapping |
| สายสีม่วง | mrt_purple | direct mapping |
| สายสีเหลือง | mrt_yellow | direct mapping |
| สายสีชมพู | mrt_pink | direct mapping |
| สายสีแดง | srt_dark_red / srt_light_red | disambiguated by station ID prefix: RN*->srt_dark_red, RW*->srt_light_red |

## Per-line coverage (distinct DRT station names)

| App line | Mapped | Unmapped | Total distinct | Coverage % |
|---|---|---|---|---|
| bts_gold | 3 | 0 | 3 | 100.0% |
| bts_silom | 13 | 0 | 13 | 100.0% |
| bts_sukhumvit | 46 | 2 | 48 | 95.8% |
| mrt_blue | 37 | 0 | 37 | 100.0% |
| mrt_pink | 30 | 0 | 30 | 100.0% |
| mrt_purple | 16 | 0 | 16 | 100.0% |
| mrt_yellow | 23 | 0 | 23 | 100.0% |
| srt_dark_red | 10 | 0 | 10 | 100.0% |
| srt_light_red | 3 | 0 | 3 | 100.0% |

## Unmapped DRT stations (with nearest candidate found on same line)

### bts_sukhumvit

- `Mo Chit` -> nearest candidate: `Phloen Chit` / `เพลินจิต` (ratio=0.62)
- `Sena Ruam*` -> nearest candidate: `Sena Nikhom` / `เสนานิคม` (ratio=0.56)

Note: `Mo Chit` and `Sena Ruam*` have no counterpart at all in data/transit.json's bts_sukhumvit station list (verified by full-text search, not just a normalization miss) -- this is a gap in the app's OSM-derived station graph, not a mapping bug. They cannot be aliased since there is no target station to alias to.

## Summary

- Total DRT rows: 6953
- Rows mapped to app pairs: 6713
- Row coverage: 96.55%
- Total unique fare pairs emitted: 3447
- Fare range: 12 - 65 THB
- Output file size: 114614 bytes