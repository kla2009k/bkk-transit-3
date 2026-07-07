// theme.js — day (default, "morning map" readability) vs night (neon cinematic).
// Shared by app.js and city.js so both pick matching palettes.
export const DAY = !new URLSearchParams(location.search).has('night');

export const T = DAY ? {
  // ── morning ──
  sky: 0xdfe9f2, fog: 0.0007,
  land: 0xeceae3, grid: false,
  bloomStrength: 0.16, bloomRadius: 0.4, bloomThreshold: 0.75,
  buildingLow: 0xe6e1d7, buildingMid: 0xdcd6cb, buildingTall: 0xcfc9bf,
  // varied facade tints — warm plaster/concrete for low-rise, glassy
  // blue-grays for towers (Google-Maps-like readability, not flat mass)
  paletteLow: [0xf0e9db, 0xe9e0cf, 0xe2d7c3, 0xe9e5dd, 0xdcd7cc,
               0xe8d8c6, 0xdfe3e0, 0xecdcc8, 0xd8d2c4, 0xe5dbc9],
  paletteTall: [0xb7c6d4, 0xc4d0da, 0xafc1d1, 0xccd6de, 0xa9bccd, 0xd4dce2],
  windows: false, lambert: true,
  river: 0x9dc3e6, riverOpacity: 0.95,
  roads: {
    hwy: { color: 0xe8a33d, opacity: 0.9, y: 0.016 },
    pri: { color: 0xa9b2bf, opacity: 0.85, y: 0.012 },
    sec: { color: 0xc3c9d2, opacity: 0.6, y: 0.008 },
  },
  roadsAdditive: false,
  column: 0x8f99a6, columnOpacity: 0.85,
  stationCore: 0xffffff, stationRing: true,
  undergroundOpacity: 0.7, dimOpacity: 0.12,
  trainLighten: -0.18, // darken trains a touch on light bg
} : {
  // ── night ──
  sky: 0x04060c, fog: 0.0011,
  land: 0x05080f, grid: true,
  // toned down from 1.35/0.08 — heavy bloom merged nearby lines into one
  // glow blob and drowned the labels (UX audit)
  bloomStrength: 0.55, bloomRadius: 0.5, bloomThreshold: 0.3,
  buildingLow: 0x101828, buildingMid: 0x18233a, buildingTall: 0x1f2c44,
  paletteLow: [0x0f1626, 0x121a2c, 0x0d1422, 0x141d30, 0x101a28],
  paletteTall: [0x1f2c44, 0x243350, 0x1b2740, 0x28395a],
  windows: true, lambert: false,
  river: 0x10305a, riverOpacity: 0.85,
  roads: {
    hwy: { color: 0xd9a544, opacity: 0.38, y: 0.016 },
    pri: { color: 0x8a7a4a, opacity: 0.24, y: 0.012 },
    sec: { color: 0x4c5a74, opacity: 0.14, y: 0.008 },
  },
  roadsAdditive: true,
  column: 0x2a3547, columnOpacity: 0.5,
  stationCore: 0xf5f2e8, stationRing: false,
  undergroundOpacity: 1.0, dimOpacity: 0.05,
  trainLighten: 0.45,
};