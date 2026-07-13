#!/usr/bin/env python3
"""Repair the missing Mo Chit node and shift index-keyed Sukhumvit exits.

Run this once before rebuilding station codes and fare lookup. The operation is
idempotent: a second run validates the repaired data and makes no changes.
"""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
TRANSIT_PATH = ROOT / "data" / "transit.json"
EXITS_PATH = ROOT / "data" / "exits.json"
LINE_ID = "bts_sukhumvit"
INSERT_INDEX = 16
MO_CHIT = {
    "name_th": "หมอชิต",
    "name_en": "Mo Chit",
    "lat": 13.80248,
    "lon": 100.55381,
}


def main():
    transit = json.loads(TRANSIT_PATH.read_text(encoding="utf-8"))
    line = next(item for item in transit["lines"] if item["id"] == LINE_ID)
    names = [station.get("name_en") for station in line["stations"]]

    if "Mo Chit" in names:
        index = names.index("Mo Chit")
        if index != INSERT_INDEX:
            raise SystemExit(f"Mo Chit exists at unexpected index {index}")
        print("Mo Chit already present; no migration needed")
        return

    if names[INSERT_INDEX - 1] != "Ha Yaek Lat Phrao" or names[INSERT_INDEX] != "Saphan Khwai":
        raise SystemExit("Refusing to migrate: neighboring station order changed")

    line["stations"].insert(INSERT_INDEX, MO_CHIT)
    TRANSIT_PATH.write_text(
        json.dumps(transit, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    exits = json.loads(EXITS_PATH.read_text(encoding="utf-8"))
    shifted = 0
    for item in exits["exits"]:
        prefix = f"{LINE_ID}:"
        if not item.get("st", "").startswith(prefix):
            continue
        index = int(item["st"][len(prefix):])
        if index >= INSERT_INDEX:
            item["st"] = f"{LINE_ID}:{index + 1}"
            shifted += 1
    EXITS_PATH.write_text(
        json.dumps(exits, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Inserted Mo Chit at {LINE_ID}:{INSERT_INDEX}; shifted {shifted} exits")


if __name__ == "__main__":
    main()
