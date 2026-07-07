// service.js — service simulation data: real-world headways per line per time
// band, fare ladders per line, and sun position for time-of-day lighting.
//
// Headways are approximate published values (BTS/MRTA/SRTET service info,
// 2025-2026). Fares are approximations of the published ladders — the UI must
// label them "ประมาณการ". The 20-baht flat-fare scheme (registered via ทางรัฐ)
// runs through 30 Sep 2026: transfer within 30 min, complete trip within
// 180 min, separate cards across BTS↔MRT gates.

// ── time bands ───────────────────────────────────────────────────────
// hour (0-24 float) → band key
export function bandOf(hour) {
  if (hour < 5.5) return 'closed';
  if (hour < 7) return 'early';
  if (hour < 9) return 'rush';
  if (hour < 17) return 'midday';
  if (hour < 19.5) return 'rush';
  if (hour < 22) return 'evening';
  return 'late';
}

export const BAND_LABEL_TH = {
  closed: 'ปิดให้บริการ',
  early: 'เช้าตรู่',
  rush: 'ชั่วโมงเร่งด่วน',
  midday: 'กลางวัน',
  evening: 'ช่วงค่ำ',
  late: 'ดึก',
};

// headway in minutes per band; null = no service
const HEADWAY = {
  bts_sukhumvit: { early: 5, rush: 2.5, midday: 5, evening: 6, late: 8 },
  bts_silom:     { early: 5, rush: 3.5, midday: 5.5, evening: 6, late: 8 },
  bts_gold:      { early: 8, rush: 5, midday: 8, evening: 8, late: 10 },
  mrt_blue:      { early: 6, rush: 3, midday: 6, evening: 7, late: 9 },
  mrt_purple:    { early: 6, rush: 4, midday: 8, evening: 9, late: 10 },
  mrt_yellow:    { early: 8, rush: 5, midday: 10, evening: 10, late: 12 },
  mrt_pink:      { early: 8, rush: 5, midday: 10, evening: 10, late: 12 },
  arl:           { early: 12, rush: 10, midday: 12, evening: 12, late: 15 },
  srt_dark_red:  { early: 15, rush: 12, midday: 18, evening: 18, late: 20 },
  srt_light_red: { early: 20, rush: 15, midday: 20, evening: 20, late: 20 },
};

export function headwayFor(lineId, hour) {
  const band = bandOf(hour);
  if (band === 'closed') return null;
  const h = HEADWAY[lineId];
  return h ? (h[band] ?? h.midday) : 6;
}

// trains visible on a line = length / (speed × headway), both directions
export const RIDE_KMH = 32;
export function trainCountFor(lineId, lengthKm, hour) {
  const hw = headwayFor(lineId, hour);
  if (hw == null) return 0;
  const spacingKm = (RIDE_KMH / 60) * hw;
  const perDir = Math.max(1, Math.round(lengthKm / spacingKm));
  return Math.min(perDir * 2, 30); // cap for perf
}

// ── fares (approximate ladders; label as ประมาณการ) ─────────────────
// [boarding fare, per-station step, cap]
const FARE_LADDER = {
  bts_sukhumvit: [17, 3, 65],
  bts_silom:     [17, 3, 65],
  bts_gold:      [16, 0, 16],
  mrt_blue:      [17, 2.5, 45],
  mrt_purple:    [14, 2.5, 42],
  mrt_yellow:    [15, 3, 45],
  mrt_pink:      [15, 3, 45],
  arl:           [15, 5, 45],
  srt_dark_red:  [12, 4, 42],
  srt_light_red: [12, 4, 42],
};

export function fareForLeg(lineId, stationCount) {
  const [base, step, cap] = FARE_LADDER[lineId] ?? [17, 3, 65];
  return Math.min(base + Math.round(step * Math.max(stationCount - 1, 0)), cap);
}

// Normal-price total: legs on the same operator gate-group ride one ticket,
// crossing between groups buys a new one. Groups: BTS (สุขุมวิท/สีลม/ทอง),
// MRT (น้ำเงิน/ม่วง), monorails ticket separately, ARL, SRT.
const GATE_GROUP = {
  bts_sukhumvit: 'bts', bts_silom: 'bts', bts_gold: 'bts_gold',
  mrt_blue: 'mrt', mrt_purple: 'mrt',
  mrt_yellow: 'yellow', mrt_pink: 'pink',
  arl: 'arl', srt_dark_red: 'srt', srt_light_red: 'srt',
};

// Exact fares from the official DRT table (data/fare_lookup.json, built by
// tools/build_fare_lookup.py). Same ticket-merging as normalFare, but each
// ticket first tries the published origin→destination fare; the ladder is
// only a fallback for unmapped pairs.
export function computeFares(legs, lookup) {
  // legs: [{lineId, stations, from:"lineId:idx", to:"lineId:idx"}]
  const tickets = [];
  for (const leg of legs) {
    const g = GATE_GROUP[leg.lineId] ?? leg.lineId;
    const last = tickets[tickets.length - 1];
    if (last && last.group === g) {
      last.stations += leg.stations;
      last.to = leg.to;
      last.toAlts = leg.toAlts;
      last.lines.push(leg.lineId);
    } else {
      tickets.push({ group: g, stations: leg.stations, lines: [leg.lineId],
                     from: leg.from, to: leg.to,
                     fromAlts: leg.fromAlts, toAlts: leg.toAlts });
    }
  }
  let total = 0, allExact = true;
  const parts = tickets.map(tk => {
    let fare = null, exact = false;
    if (lookup) {
      // interchange stations appear on several lines under one name; the DRT
      // table keys each pair to specific lines — try every alias combination
      const fromList = tk.fromAlts ?? [tk.from];
      const toList = tk.toAlts ?? [tk.to];
      for (const a of fromList) {
        for (const b of toList) {
          const v = lookup[[a, b].sort().join('|')];
          if (v != null && (fare == null || v < fare)) { fare = v; exact = true; }
        }
      }
    }
    if (fare == null) {
      fare = fareForLeg(tk.lines[0], tk.stations + 1);
      allExact = false;
    }
    total += fare;
    return { group: tk.group, fare, exact };
  });
  return { total, parts, allExact };
}

export function normalFare(legs) {
  // legs: [{lineId, stations}] — merge consecutive same-group legs
  const tickets = [];
  for (const leg of legs) {
    const g = GATE_GROUP[leg.lineId] ?? leg.lineId;
    const last = tickets[tickets.length - 1];
    if (last && last.group === g) {
      last.stations += leg.stations;
      last.lines.push(leg.lineId);
    } else {
      tickets.push({ group: g, stations: leg.stations, lines: [leg.lineId] });
    }
  }
  let total = 0;
  const parts = tickets.map(tk => {
    // charge by the dominant line's ladder within the ticket
    const fare = fareForLeg(tk.lines[0], tk.stations + 1);
    total += fare;
    return { group: tk.group, fare };
  });
  return { total, parts };
}

// 20-baht flat fare (registered): valid through 30 Sep 2026,
// trip must complete within 180 minutes
export function flatFare(minutes) {
  return { eligible: minutes <= 180, total: 20 };
}

// ── service hours (approximate, label "ประมาณ") ─────────────────────
const SERVICE_HOURS = {
  bts_sukhumvit: ['05:15', '00:45'], bts_silom: ['05:30', '00:30'],
  bts_gold: ['06:00', '00:00'],
  mrt_blue: ['05:30', '24:00'], mrt_purple: ['05:30', '24:00'],
  mrt_yellow: ['06:00', '24:00'], mrt_pink: ['06:00', '24:00'],
  arl: ['05:30', '24:00'],
  srt_dark_red: ['05:30', '24:00'], srt_light_red: ['05:30', '24:00'],
};
export function serviceHours(lineId) {
  return SERVICE_HOURS[lineId] ?? ['05:30', '24:00'];
}

// ── crowd forecast (heuristic from monthly ridership × time band) ────
// no public realtime API exists — this is an estimate, always label it
const CROWD_BASE = { // 0-2 baseline by line group size
  bts_sukhumvit: 2, bts_silom: 2, mrt_blue: 2,
  mrt_pink: 1, mrt_yellow: 1, mrt_purple: 1, arl: 1,
  srt_dark_red: 0, srt_light_red: 0, bts_gold: 0,
};
const CROWD_BAND = { rush: 1, evening: 0.5, midday: 0, early: 0, late: -0.5, closed: -9 };
export function crowdLevel(lineId, hour) {
  const score = (CROWD_BASE[lineId] ?? 1) + (CROWD_BAND[bandOf(hour)] ?? 0);
  if (score >= 2.5) return { icon: '🔴', label: 'คนแน่น' };
  if (score >= 1.5) return { icon: '🟡', label: 'ปานกลาง' };
  if (score >= 0) return { icon: '🟢', label: 'ค่อนข้างโล่ง' };
  return { icon: '⚫', label: 'ปิดบริการ' };
}

// ── CO₂ per trip: rail vs private car ───────────────────────────────
// Emission factors (g CO₂e per passenger-km), rounded from TGO/IPCC-style
// public figures: private car (1 occupant, gasoline) ~150; Bangkok electric
// rail ~25 (grid-powered, high occupancy). Label output as "ประมาณการ".
const CAR_G_PER_KM = 150;
const MOTO_G_PER_KM = 85;
const RAIL_G_PER_KM = 25;

export function co2Saved(km) {
  const grams = Math.max(0, (CAR_G_PER_KM - RAIL_G_PER_KM) * km);
  const gramsMoto = Math.max(0, (MOTO_G_PER_KM - RAIL_G_PER_KM) * km);
  // equivalence: one mature tree absorbs ~60 g CO₂ per day
  return { kg: grams / 1000, kgMoto: gramsMoto / 1000, treeDays: grams / 60 };
}

// green ledger: lifetime CO₂ saved across planned trips (localStorage)
export function ledgerAdd(kg) {
  let total = 0;
  try {
    total = (parseFloat(localStorage.getItem('bkk3d_co2')) || 0) + kg;
    localStorage.setItem('bkk3d_co2', String(total));
  } catch { total = kg; }
  return total;
}

// ── sun position for time-of-day lighting (day theme) ───────────────
// Bangkok ~13.75°N: sunrise ≈ 6:00, sunset ≈ 18:45 (annual average-ish).
// Returns {x,y,z} direction (unnormalized, scene units), intensity 0-1.5,
// and a warm-cold color blend factor (0 = golden hour, 1 = noon white).
export function sunAt(hour) {
  const rise = 6.0, set = 18.75;
  const dayFrac = (hour - rise) / (set - rise); // 0..1 across daylight
  if (dayFrac <= 0 || dayFrac >= 1) {
    return { up: false, x: 0, y: -1, z: 0, intensity: 0, whiteness: 0 };
  }
  const elev = Math.sin(dayFrac * Math.PI);          // 0..1..0
  const azim = (dayFrac - 0.5) * Math.PI * 0.9;      // east → west sweep
  return {
    up: true,
    x: Math.sin(azim) * 300,                          // west positive… sign
    y: 60 + elev * 260,
    z: -Math.cos(azim) * 120 - 60,
    intensity: 0.35 + elev * 1.15,
    whiteness: Math.min(elev * 1.6, 1),
  };
}