# -*- coding: utf-8 -*-
"""Extract official station codes (N8, BL13, PK19...) from the DRT fare table
and map them onto the app's station graph → data/station_codes.json
{"lineId:idx": "N8", ...}. Reuses the same normalize/fuzzy approach as
build_fare_lookup.py (Thai columns for MRT-family lines, English for BTS/Red).
"""
import json
import re
import difflib
import os

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

LINE_MAP = {
    "สายสุขุมวิท": "bts_sukhumvit",
    "สายสีลม": "bts_silom",
    "สายสีทอง": "bts_gold",
    "สายสีน้ำเงิน": "mrt_blue",
    "สายสีม่วง": "mrt_purple",
    "สายสีเหลือง": "mrt_yellow",
    "สายสีชมพู": "mrt_pink",
}
# keys/values are POST-normalization (lowercase, no spaces/punct)
ALIASES = {
    "จรัญสนิทวงศ์13": "จรัญฯ13",
}
# app stations the DRT tables genuinely miss on that line — verified manually
# against official numbering (BL26=สีลม anchor confirms BL = idx+1 on blue;
# RN/RW ordered from Krung Thep Aphiwat outward)
OVERRIDES = {
    # ARL has no rows in the DRT fare table — official A-codes, city→airport
    "arl:0": "A8", "arl:1": "A7", "arl:2": "A6", "arl:3": "A5",
    "arl:4": "A4", "arl:5": "A3", "arl:6": "A2", "arl:7": "A1",
    "mrt_blue:1": "BL02",        # จรัญฯ 13
    "srt_dark_red:0": "RN01",    # กรุงเทพอภิวัฒน์
    "srt_dark_red:8": "RN09",    # หลักหก (ม.รังสิต)
    "srt_light_red:0": "RW01",   # กรุงเทพอภิวัฒน์
    "srt_light_red:3": "RW04",   # ชุมทางตลิ่งชัน
}
THAI_RE = re.compile(r"[฀-๿]")


def norm(s):
    s = (s or "").strip().lower()
    s = s.replace("station", "")
    s = re.sub(r"[^\w฀-๿ก-๙ ]", "", s)
    s = re.sub(r"\s+", "", s)
    return ALIASES.get(s.strip(), s)


def main():
    fares = json.load(open(os.path.join(BASE, "data", "fares_drt.json"), encoding="utf-8"))
    transit = json.load(open(os.path.join(BASE, "data", "transit.json"), encoding="utf-8"))

    # collect distinct (line_th_or_prefix, station_name) -> code
    drt = {}
    for r in fares["rows"]:
        for ln, sid, st in ((r["Line1"], r["Station_ID1"], r["Station1"]),
                            (r["Line2"], r["Station_ID2"], r["Station2"])):
            if not sid or not st:
                continue
            if ln == "สายสีแดง":
                app = "srt_dark_red" if str(sid).startswith("RN") else "srt_light_red"
            else:
                app = LINE_MAP.get(ln)
            if app:
                drt.setdefault(app, {})[norm(str(st))] = str(sid)

    out = {}
    unmapped = []
    for line in transit["lines"]:
        table = drt.get(line["id"], {})
        keys = list(table)
        for i, s in enumerate(line["stations"]):
            code = None
            for cand in (norm(s.get("name_th")), norm(s.get("name_en"))):
                if cand and cand in table:
                    code = table[cand]
                    break
            if code is None:
                for cand in (norm(s.get("name_th")), norm(s.get("name_en"))):
                    if not cand:
                        continue
                    hit = difflib.get_close_matches(cand, keys, n=1, cutoff=0.82)
                    if hit:
                        code = table[hit[0]]
                        break
            if code is None:
                # interchange listed under another line in DRT (สยาม→CEN on
                # Sukhumvit, เตาปูน→PP16 on Purple): search all line tables
                for other in drt.values():
                    for cand in (norm(s.get("name_th")), norm(s.get("name_en"))):
                        if cand and cand in other:
                            code = other[cand]
                            break
                    if code:
                        break
            if code is None:
                code = OVERRIDES.get(f"{line['id']}:{i}")
            if code:
                out[f"{line['id']}:{i}"] = code
            else:
                unmapped.append(f"{line['id']}:{i} {s.get('name_th')}")

    path = os.path.join(BASE, "data", "station_codes.json")
    json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False,
              separators=(",", ":"))
    total = sum(len(l["stations"]) for l in transit["lines"])
    print(f"codes mapped: {len(out)}/{total} stations (all lines)")
    print(f"unmapped: {len(unmapped)}")
    for u in unmapped[:12]:
        print("  -", u)
    # spot checks
    for k in ("bts_sukhumvit:22", "bts_silom:1", "mrt_blue:25"):
        print(k, "->", out.get(k))


if __name__ == "__main__":
    main()
