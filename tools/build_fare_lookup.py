#!/usr/bin/env python3
"""
Build data/fare_lookup.json by mapping the official DRT (Department of Rail Transport)
fare table (data/fares_drt.json) onto the app's station graph (data/transit.json).

Usage:
    python tools/build_fare_lookup.py

Outputs:
    data/fare_lookup.json          - compact {lineId:idx|lineId:idx -> fare} lookup
    tools/fare_mapping_report.md   - per-line coverage report + unmapped stations
"""
import json
import re
import difflib
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FARES_PATH = ROOT / "data" / "fares_drt.json"
TRANSIT_PATH = ROOT / "data" / "transit.json"
OUT_LOOKUP_PATH = ROOT / "data" / "fare_lookup.json"
OUT_REPORT_PATH = ROOT / "tools" / "fare_mapping_report.md"

FUZZY_THRESHOLD = 0.82

# --- 1. DRT Thai line name -> app line id -----------------------------------
# Discovered distinct Line1/Line2 values in fares_drt.json (8 lines, all rows
# have Type == "รถไฟฟ้า "):
#   สายสุขุมวิท    -> bts_sukhumvit  (BTS Sukhumvit)
#   สายสีลม        -> bts_silom      (BTS Silom)
#   สายสีทอง       -> bts_gold       (BTS Gold)
#   สายสีน้ำเงิน    -> mrt_blue       (MRT Blue)
#   สายสีม่วง      -> mrt_purple     (MRT Purple)
#   สายสีเหลือง    -> mrt_yellow     (MRT Yellow)
#   สายสีชมพู      -> mrt_pink       (MRT Pink)
#   สายสีแดง       -> srt_dark_red OR srt_light_red (ambiguous, see below)
# The DRT table has no rows for Airport Rail Link (arl), so "arl" never
# appears in the output lookup.
LINE_TH_TO_APPID = {
    "สายสุขุมวิท": "bts_sukhumvit",
    "สายสีลม": "bts_silom",
    "สายสีทอง": "bts_gold",
    "สายสีน้ำเงิน": "mrt_blue",
    "สายสีม่วง": "mrt_purple",
    "สายสีเหลือง": "mrt_yellow",
    "สายสีชมพู": "mrt_pink",
}

# The DRT table uses a single Thai name "สายสีแดง" (Red Line) for BOTH the SRT
# Dark Red (Bang Sue <-> Rangsit, station id prefix "RN") and SRT Light Red
# (Bang Sue <-> Taling Chan, station id prefix "RW") lines. Station ID prefix
# is used to disambiguate which app line a "สายสีแดง" row belongs to -- this
# is necessary evidence (not just a tiebreak) because line name alone is
# insufficient here.
RED_PREFIX_TO_APPID = {
    "RN": "srt_dark_red",
    "RW": "srt_light_red",
}

# --- known synonyms for stations whose DRT name and app-graph name diverge
# too much for normalization + fuzzy matching (>=0.82) to bridge on their own.
# Keys are (line_id, normalized DRT name) -> normalized app-graph name to
# match against instead. Discovered by inspecting the unmapped list from an
# initial run without aliases.
STATION_ALIASES = {
    # DRT keeps the pre-2023 name "Central Bangsue"; the app graph (OSM) uses
    # the official renamed station "Krung Thep Aphiwat" (กรุงเทพอภิวัฒน์),
    # which is the same physical station shared by both Red Line branches.
    ("srt_dark_red", "centralbangsue"): "krungthepaphiwat",
    ("srt_light_red", "centralbangsue"): "krungthepaphiwat",
    # DRT uses the colloquial abbreviation "จรัญฯ 13" is actually what the app
    # graph stores too, but DRT spells the full name "จรัญสนิทวงศ์ 13".
    ("mrt_blue", "จรัญสนิทวงศ์13"): "จรัญฯ13",
    # DRT uses short names; the app graph (OSM) keeps a longer official/
    # disambiguating suffix for the same physical station.
    ("srt_dark_red", "lakhok"): "lakhokrangsitu",
    ("srt_light_red", "talingchan"): "talingchanjunction",
}

THAI_CHAR_RE = re.compile(r"[฀-๿]")
NON_ALNUM_RE = re.compile(r"[^0-9a-zก-๙]")


def normalize(s: str) -> str:
    """lowercase, strip, remove the word 'station', then strip punctuation/spaces."""
    s = s.strip().lower()
    s = re.sub(r"\bstation\b", "", s)
    s = NON_ALNUM_RE.sub("", s)
    return s


def is_thai(s: str) -> bool:
    return bool(THAI_CHAR_RE.search(s))


def resolve_line_id(line_th: str, station_id: str):
    if line_th == "สายสีแดง":
        if station_id:
            prefix = station_id[:2].upper()
            return RED_PREFIX_TO_APPID.get(prefix)
        return None
    return LINE_TH_TO_APPID.get(line_th)


def build_station_index(transit):
    """Return {line_id: [{"idx", "name_en", "name_th", "norm_en", "norm_th"}, ...]}"""
    index = {}
    for line in transit["lines"]:
        entries = []
        for i, st in enumerate(line["stations"]):
            entries.append(
                {
                    "idx": i,
                    "name_en": st.get("name_en", ""),
                    "name_th": st.get("name_th", ""),
                    "norm_en": normalize(st.get("name_en", "")),
                    "norm_th": normalize(st.get("name_th", "")),
                }
            )
        index[line["id"]] = entries
    return index


def match_station(line_id, raw_name, station_index, station_id=None):
    """Match a DRT station name against the app's station list for line_id.
    Returns (idx, method) or (None, reason)."""
    if line_id not in station_index:
        return None, "unknown-line"

    entries = station_index[line_id]
    if not entries:
        return None, "empty-line"

    thai = is_thai(raw_name)
    field = "norm_th" if thai else "norm_en"
    norm_target = normalize(raw_name)

    alias = STATION_ALIASES.get((line_id, norm_target))
    if alias is not None:
        norm_target = alias

    # exact match
    exact_matches = [e for e in entries if e[field] == norm_target and norm_target != ""]
    if len(exact_matches) == 1:
        return exact_matches[0]["idx"], "exact"
    if len(exact_matches) > 1:
        # tie-break using station ID ordering position within the line, if any
        return exact_matches[0]["idx"], "exact-ambiguous"

    # fuzzy match within same line, same field
    best = None
    best_ratio = 0.0
    for e in entries:
        candidate = e[field]
        if not candidate:
            continue
        ratio = difflib.SequenceMatcher(None, norm_target, candidate).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best = e
    if best is not None and best_ratio >= FUZZY_THRESHOLD:
        return best["idx"], f"fuzzy({best_ratio:.2f})"

    return None, ("no-match", best["name_en"] if best else None, best["name_th"] if best else None, best_ratio if best else 0.0)


def main():
    fares = json.loads(FARES_PATH.read_text(encoding="utf-8"))
    transit = json.loads(TRANSIT_PATH.read_text(encoding="utf-8"))
    station_index = build_station_index(transit)

    rows = fares["rows"]
    pairs = {}
    total_rows = len(rows)
    mapped_rows = 0

    # per-line stats: mapped stations set, unmapped station -> nearest candidate info
    per_line_mapped = defaultdict(set)
    per_line_unmapped = defaultdict(dict)  # raw_name -> (candidate_en, candidate_th, ratio)
    per_line_total_stations = defaultdict(set)

    for r in rows:
        line_th1, sid1, name1 = r["Line1"], r["Station_ID1"], r["Station1"]
        line_th2, sid2, name2 = r["Line2"], r["Station_ID2"], r["Station2"]
        fare = r["Fares"]

        app_line1 = resolve_line_id(line_th1, sid1)
        app_line2 = resolve_line_id(line_th2, sid2)

        per_line_total_stations[app_line1 or line_th1].add(name1)
        per_line_total_stations[app_line2 or line_th2].add(name2)

        idx1, info1 = (None, "unresolved-line") if app_line1 is None else match_station(app_line1, name1, station_index, sid1)
        idx2, info2 = (None, "unresolved-line") if app_line2 is None else match_station(app_line2, name2, station_index, sid2)

        if idx1 is not None:
            per_line_mapped[app_line1].add(name1)
        else:
            key = app_line1 or line_th1
            if name1 not in per_line_unmapped[key]:
                per_line_unmapped[key][name1] = info1

        if idx2 is not None:
            per_line_mapped[app_line2].add(name2)
        else:
            key = app_line2 or line_th2
            if name2 not in per_line_unmapped[key]:
                per_line_unmapped[key][name2] = info2

        if idx1 is not None and idx2 is not None:
            a = f"{app_line1}:{idx1}"
            b = f"{app_line2}:{idx2}"
            key = "|".join(sorted([a, b]))
            pairs[key] = int(fare)
            mapped_rows += 1

    lookup = {
        "updated": fares.get("updated"),
        "source": "DRT",
        "pairs": pairs,
    }
    OUT_LOOKUP_PATH.write_text(json.dumps(lookup, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # ---------------- report ----------------
    lines_out = []
    lines_out.append("# DRT Fare Lookup Mapping Report\n")
    lines_out.append(f"Source updated: {fares.get('updated')}  \nSource URL: {fares.get('source_url')}\n")
    lines_out.append("## DRT Thai line name -> app line id mapping\n")
    lines_out.append("| DRT Line1/Line2 (Thai) | App line id | Notes |")
    lines_out.append("|---|---|---|")
    for th, appid in LINE_TH_TO_APPID.items():
        lines_out.append(f"| {th} | {appid} | direct mapping |")
    lines_out.append("| สายสีแดง | srt_dark_red / srt_light_red | disambiguated by station ID prefix: RN*->srt_dark_red, RW*->srt_light_red |")
    lines_out.append("")

    lines_out.append("## Per-line coverage (distinct DRT station names)\n")
    lines_out.append("| App line | Mapped | Unmapped | Total distinct | Coverage % |")
    lines_out.append("|---|---|---|---|---|")
    all_keys = sorted(set(list(per_line_mapped.keys()) + list(per_line_unmapped.keys()) + list(per_line_total_stations.keys())))
    for key in all_keys:
        mapped_n = len(per_line_mapped.get(key, set()))
        unmapped_n = len(per_line_unmapped.get(key, {}))
        total_n = len(per_line_total_stations.get(key, set()))
        pct = (mapped_n / total_n * 100) if total_n else 0.0
        lines_out.append(f"| {key} | {mapped_n} | {unmapped_n} | {total_n} | {pct:.1f}% |")
    lines_out.append("")

    lines_out.append("## Unmapped DRT stations (with nearest candidate found on same line)\n")
    for key in all_keys:
        unmapped = per_line_unmapped.get(key, {})
        if not unmapped:
            continue
        lines_out.append(f"### {key}\n")
        for name, info in sorted(unmapped.items()):
            if isinstance(info, tuple) and info[0] == "no-match":
                _, cand_en, cand_th, ratio = info
                lines_out.append(f"- `{name}` -> nearest candidate: `{cand_en}` / `{cand_th}` (ratio={ratio:.2f})")
            else:
                lines_out.append(f"- `{name}` -> {info}")
        lines_out.append("")

    coverage_pct = (mapped_rows / total_rows * 100) if total_rows else 0.0
    lines_out.append("## Summary\n")
    lines_out.append(f"- Total DRT rows: {total_rows}")
    lines_out.append(f"- Rows mapped to app pairs: {mapped_rows}")
    lines_out.append(f"- Row coverage: {coverage_pct:.2f}%")
    lines_out.append(f"- Total unique fare pairs emitted: {len(pairs)}")
    fare_values = list(pairs.values())
    if fare_values:
        lines_out.append(f"- Fare range: {min(fare_values)} - {max(fare_values)} THB")
    lines_out.append(f"- Output file size: {OUT_LOOKUP_PATH.stat().st_size} bytes")

    OUT_REPORT_PATH.write_text("\n".join(lines_out), encoding="utf-8")

    print(f"Wrote {OUT_LOOKUP_PATH} ({OUT_LOOKUP_PATH.stat().st_size} bytes, {len(pairs)} pairs)")
    print(f"Wrote {OUT_REPORT_PATH}")
    print(f"Row coverage: {mapped_rows}/{total_rows} = {coverage_pct:.2f}%")


if __name__ == "__main__":
    main()
