// Bangkok Transit 3D — night flight over the rail network.
// Data: data/transit.json (OpenStreetMap via Overpass); falls back to a tiny
// built-in sample so the scene still renders without the data file.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { initRidership } from './ridership.js';
import { initFirstRide } from './firstride.js';
import { initPages } from './pages.js';
import { initPlacePlanner } from './place-ui.js';
import { buildCity } from './city.js';
import { buildGraph, findRoute, haversine } from './planner.js';
import { DAY, T } from './theme.js';
import { bandOf, BAND_LABEL_TH, headwayFor, trainCountFor, RIDE_KMH,
         computeFares, flatFare, sunAt, co2Saved,
         serviceHours, crowdLevel, ledgerAdd } from './service.js';

const escHTML = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

// official DRT fare table (optional — ladder fallback when absent)
let fareLookup = null;
fetch('data/fare_lookup.json')
  .then(r => r.ok ? r.json() : null)
  .then(d => { if (d) fareLookup = d.pairs; })
  .catch(() => {});

// Loop lines list a station twice (MRT Blue: ท่าพระ at idx 0 and 32) but the
// fare table keys one index per name — canonicalize to the first occurrence.
// Interchanges also appear on several lines under one name (สยาม, เตาปูน) and
// the DRT table may key a pair to either line — nameAlts collects them all.
const canonId = new Map();
const nameAlts = new Map(); // "ชื่อ" → [lineId:idx, ...] (canonical only)
const MRTA_LINES = new Set(['mrt_blue', 'mrt_purple', 'mrt_yellow', 'mrt_pink']);
function buildCanonIds(lines) {
  for (const line of lines) {
    const firstByName = new Map();
    line.stations.forEach((s, i) => {
      const key = s.name_th || s.name_en;
      if (!firstByName.has(key)) {
        firstByName.set(key, i);
        if (!nameAlts.has(key)) nameAlts.set(key, []);
        nameAlts.get(key).push(`${line.id}:${i}`);
      }
      canonId.set(`${line.id}:${i}`, `${line.id}:${firstByName.get(key)}`);
    });
  }
}

function altsOf(node) {
  const name = node.station.name_th || node.station.name_en;
  return nameAlts.get(name) ?? [canonId.get(node.id) ?? node.id];
}

document.body.classList.toggle('day', DAY);
// ?clean — hide all HUD (clean screenshots/video capture)
if (new URLSearchParams(location.search).has('clean')) {
  document.body.classList.add('clean');
}

// ── projection ───────────────────────────────────────────────────────
// Equirectangular around Bangkok center; 1 scene unit ≈ 100 m.
const CENTER = { lat: 13.745, lon: 100.535 };
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON = 111320 * Math.cos(CENTER.lat * Math.PI / 180);
const SCALE = 1 / 100;

function project(lat, lon) {
  return new THREE.Vector2(
    (lon - CENTER.lon) * M_PER_DEG_LON * SCALE,
    -(lat - CENTER.lat) * M_PER_DEG_LAT * SCALE,  // north = -z
  );
}

// Elevated systems fly above the ground grid, subway dives below it —
// matching the real network (BTS/monorail/ARL/SRT elevated, MRT underground).
const ELEVATION = {
  BTS: 0.22, ARL: 0.34, SRT: 0.28,
  MRT_MONORAIL: 0.42,  // yellow/pink monorails
  MRT_SUBWAY: -0.22,   // blue/purple underground
};
function lineElevation(line) {
  if (line.system === 'MRT') {
    return (line.id === 'mrt_yellow' || line.id === 'mrt_pink')
      ? ELEVATION.MRT_MONORAIL : ELEVATION.MRT_SUBWAY;
  }
  return ELEVATION[line.system] ?? 3.0;
}

// ── fallback sample (only if data/transit.json is missing) ──────────
const FALLBACK = {
  lines: [
    {
      id: 'bts_sukhumvit', name_th: 'บีทีเอส สายสุขุมวิท', name_en: 'BTS Sukhumvit',
      system: 'BTS', color: '#79B928',
      stations: [
        { name_th: 'หมอชิต', name_en: 'Mo Chit', lat: 13.80248, lon: 100.55381 },
        { name_th: 'สยาม', name_en: 'Siam', lat: 13.74566, lon: 100.53415 },
        { name_th: 'อโศก', name_en: 'Asok', lat: 13.73716, lon: 100.56034 },
        { name_th: 'อ่อนนุช', name_en: 'On Nut', lat: 13.70557, lon: 100.60104 },
      ],
    },
    {
      id: 'mrt_blue', name_th: 'เอ็มอาร์ที สายสีน้ำเงิน', name_en: 'MRT Blue',
      system: 'MRT', color: '#1E4F9C',
      stations: [
        { name_th: 'บางซื่อ', name_en: 'Bang Sue', lat: 13.80305, lon: 100.54083 },
        { name_th: 'สวนจตุจักร', name_en: 'Chatuchak Park', lat: 13.80283, lon: 100.55221 },
        { name_th: 'สุขุมวิท', name_en: 'Sukhumvit', lat: 13.73833, lon: 100.56146 },
        { name_th: 'หัวลำโพง', name_en: 'Hua Lamphong', lat: 13.73779, lon: 100.51702 },
      ],
    },
  ],
};

// ── renderer / scene ─────────────────────────────────────────────────
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(T.sky);
scene.fog = new THREE.FogExp2(T.sky, T.fog);

let hemiLight = null, sunLight = null;
if (DAY) {
  hemiLight = new THREE.HemisphereLight(0xeaf2ff, 0xcfc8bb, 1.05);
  scene.add(hemiLight);
  sunLight = new THREE.DirectionalLight(0xfff0d8, 1.5);
  sunLight.position.set(280, 200, -90);
  scene.add(sunLight);
}

// ── simulation clock ─────────────────────────────────────────────────
// simHour: 0-24 (Bangkok local); live = follow wall clock
const simState = { hour: (Date.now() / 3600000 + 7) % 24, live: true, playing: false };
const _skyDay = new THREE.Color(0xdfe9f2);
const _skyDawn = new THREE.Color(0xf2d9bd);
const _skyNightish = new THREE.Color(0x8fa3bd);

function applyTimeOfDay() {
  if (!DAY) return;
  const s = sunAt(simState.hour);
  if (s.up) {
    sunLight.position.set(s.x, s.y, s.z);
    sunLight.intensity = s.intensity;
    sunLight.color.setHSL(0.085, 0.75 * (1 - s.whiteness), 0.72 + 0.2 * s.whiteness);
    hemiLight.intensity = 0.55 + 0.55 * s.whiteness;
    const sky = _skyDawn.clone().lerp(_skyDay, s.whiteness);
    scene.background.copy(sky);
    scene.fog.color.copy(sky);
  } else {
    // night hours inside day theme: dim blue-grey, city still readable
    sunLight.intensity = 0.12;
    hemiLight.intensity = 0.5;
    scene.background.copy(_skyNightish);
    scene.fog.color.copy(_skyNightish);
  }
}

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 4000);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 2;
controls.maxDistance = 900;

// bloom sells the neon; threshold low so line colors glow, HUD is DOM so unaffected
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight),
  T.bloomStrength, T.bloomRadius, T.bloomThreshold);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// DOM overlay renderer for station name labels
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
labelRenderer.domElement.id = 'labels';
labelRenderer.domElement.style.cssText =
  'position:fixed;inset:0;pointer-events:none;z-index:5;';
document.body.appendChild(labelRenderer.domElement);

// ── ground: radial-faded grid plane ──────────────────────────────────
function makeGround() {
  const group = new THREE.Group();

  // land plate (day: warm paper; night: near-black under the grid)
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(330, 72),
    new THREE.MeshBasicMaterial({
      color: T.land, transparent: !DAY, opacity: DAY ? 1 : 0.32, depthWrite: false,
    }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = -0.05;
  group.add(disc);

  if (!T.grid) return group;

  const gridMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(0x21303f) } },
    vertexShader: /* glsl */`
      varying vec2 vXY;
      void main() {
        vXY = position.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vXY;
      uniform vec3 uColor;
      void main() {
        vec2 g = abs(fract(vXY / 10.0 - 0.5) - 0.5) / fwidth(vXY / 10.0);
        float line = 1.0 - min(min(g.x, g.y), 1.0);
        float fade = 1.0 - smoothstep(90.0, 320.0, length(vXY));
        float a = line * fade * 0.55;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor, a);
      }`,
  });
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(700, 700, 1, 1), gridMat);
  grid.geometry.rotateX(-Math.PI / 2);
  group.add(grid);

  return group;
}
scene.add(makeGround());

// ── network build ────────────────────────────────────────────────────
const network = new THREE.Group();
scene.add(network);

const lineGroups = new Map();   // id → {group, line, curve, materials, trains}
const stationMeshes = [];       // visible cores
const stationHits = [];         // enlarged invisible hit targets (mobile-friendly)
const stationGeo = new THREE.SphereGeometry(0.4, 18, 14);
const stationHitGeo = new THREE.SphereGeometry(1.3, 8, 6);
const stationHitMat = new THREE.MeshBasicMaterial({ visible: false });
const stationCoreMat = new THREE.MeshBasicMaterial({ color: T.stationCore });
const stationRingGeo = new THREE.TorusGeometry(0.52, 0.11, 8, 24);

function buildLine(line) {
  const elev = lineElevation(line);
  const raw = (line.path && line.path.length >= 2)
    ? line.path
    : line.stations.map(s => [s.lat, s.lon]);
  const pts = raw.map(([lat, lon]) => {
    const v = project(lat, lon);
    return new THREE.Vector3(v.x, elev, v.y);
  });

  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.15);
  const segments = Math.min(1400, Math.max(160, pts.length * 6));
  const color = new THREE.Color(line.color);
  if (!DAY && elev < 0) color.lerp(new THREE.Color(0xffffff), 0.1);

  const group = new THREE.Group();
  const materials = [];

  const tubeMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 });
  tubeMat.userData.fullOpacity = (DAY && elev < 0) ? T.undergroundOpacity : 1;
  materials.push(tubeMat);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, segments, 0.5, 10, false), tubeMat));

  if (DAY) {
    // thin dark casing under the colored tube — lifts low-contrast lines
    // (yellow/gold) off the pale ground, classic printed-map trick
    const casingMat = new THREE.MeshBasicMaterial({
      color: 0x3a4150, transparent: true, opacity: 0 });
    casingMat.userData.fullOpacity = 0.9;
    materials.push(casingMat);
    group.add(new THREE.Mesh(
      new THREE.TubeGeometry(curve, segments, 0.62, 8, false), casingMat));
  }

  // support columns for elevated lines / shafts for subway, at each station
  const colMat = new THREE.MeshBasicMaterial({ color: T.column, transparent: true, opacity: 0 });
  colMat.userData.fullOpacity = T.columnOpacity;
  materials.push(colMat);

  line.stations.forEach((s, idx) => {
    const v = project(s.lat, s.lon);
    const st = new THREE.Mesh(stationGeo, stationCoreMat.clone());
    st.material.transparent = true;
    st.material.opacity = 0;
    materials.push(st.material);
    st.position.set(v.x, elev, v.y);
    st.userData = { station: s, line, nodeId: `${line.id}:${idx}` };
    group.add(st);
    stationMeshes.push(st);

    // oversized invisible hit target (Fitts: ~3× the visual core)
    const hit = new THREE.Mesh(stationHitGeo, stationHitMat);
    hit.position.copy(st.position);
    hit.userData = st.userData;
    hit.userData.core = st;
    group.add(hit);
    stationHits.push(hit);

    if (T.stationRing) {
      // day mode: metro-map style — white core, line-colored ring
      const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 });
      materials.push(ringMat);
      const ring = new THREE.Mesh(stationRingGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.copy(st.position);
      group.add(ring);
    }

    const h = Math.abs(elev);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, h, 6), colMat);
    col.position.set(v.x, elev / 2, v.y);
    group.add(col);

    // name label (visibility managed by LOD in the main loop)
    const div = document.createElement('div');
    div.className = 'st-label';
    div.textContent = s.name_th || s.name_en || '';
    const lab = new CSS2DObject(div);
    lab.position.set(0, 0.55, 0);
    lab.visible = false;
    st.add(lab);
    st.userData.label = lab;
  });

  // trains are spawned per time-band by syncTrains() — prep 3 materials
  const trains = [];
  const trainColor = T.trainLighten >= 0
    ? color.clone().lerp(new THREE.Color(0xffffff), T.trainLighten)
    : color.clone().lerp(new THREE.Color(0x000000), -T.trainLighten);
  const matOpts = { transparent: true, opacity: 0 };
  const mk = (c) => {
    const m = DAY
      ? new THREE.MeshLambertMaterial({ color: c, ...matOpts })
      : new THREE.MeshBasicMaterial({ color: c, ...matOpts });
    m.userData.fullOpacity = 1;
    materials.push(m);
    return m;
  };
  const trainMat = mk(trainColor);
  const trainWinMat = mk(WIN_MAT_BASE.color);
  const trainRoofMat = mk(ROOF_MAT_BASE.color);

  // per-station nearest path-point index, for slicing route-highlight tubes
  const stationPathIdx = line.stations.map((s) => {
    const v = project(s.lat, s.lon);
    let best = 0, bestD = Infinity;
    pts.forEach((p, i) => {
      const d = (p.x - v.x) ** 2 + (p.z - v.y) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  });

  network.add(group);
  lineGroups.set(line.id, {
    group, line, curve, materials, trains, visible: true, born: -1,
    pathWorld: pts, stationPathIdx,
    lengthKm: curve.getLength() / 10, // scene unit = 100 m
    trainMat, trainWinMat, trainRoofMat,
  });
}

// ── trains: 3-car sets, spawned per time band, oriented along track ──
// geometry shared by every train; per-line materials carry the color
const TRAIN_GEOS = (() => {
  const CAR_L = 0.95, CAR_W = 0.36, CAR_H = 0.26, GAP = 0.1;
  const offs = [-(CAR_L + GAP), 0, CAR_L + GAP];
  const bodies = [], windows = [], roofs = [];
  for (const z of offs) {
    const b = new THREE.BoxGeometry(CAR_W, CAR_H, CAR_L);
    b.translate(0, 0, z);
    bodies.push(b);
    // dark glazing band, slightly proud of the body
    const w = new THREE.BoxGeometry(CAR_W + 0.02, CAR_H * 0.34, CAR_L * 0.82);
    w.translate(0, CAR_H * 0.12, z);
    windows.push(w);
    // pale roof cap
    const r = new THREE.BoxGeometry(CAR_W * 0.82, 0.035, CAR_L * 0.92);
    r.translate(0, CAR_H / 2 + 0.017, z);
    roofs.push(r);
  }
  // tapered nose on the lead car (front = +z)
  const nose = new THREE.CylinderGeometry(CAR_W * 0.34, CAR_W * 0.46, 0.16, 4, 1);
  nose.rotateX(Math.PI / 2);
  nose.rotateZ(Math.PI / 4);
  nose.translate(0, -0.015, offs[2] + CAR_L / 2 + 0.07);
  bodies.push(nose);
  return {
    body: mergeGeometries(bodies, false),
    win: mergeGeometries(windows, false),
    roof: mergeGeometries(roofs, false),
    halfLen: CAR_L * 1.5 + GAP + 0.15,
  };
})();
const WIN_MAT_BASE = { color: 0x0e1620 };
const ROOF_MAT_BASE = { color: DAY ? 0xf2f3f4 : 0x39465c };

function makeTrain(lg) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(TRAIN_GEOS.body, lg.trainMat);
  const win = new THREE.Mesh(TRAIN_GEOS.win, lg.trainWinMat);
  const roof = new THREE.Mesh(TRAIN_GEOS.roof, lg.trainRoofMat);
  g.add(body, win, roof);
  return g;
}

const trainMeshes = [];
const SIM_SPEED = 20; // trains animate at 20× real time so motion reads
const TRAIN_LIFT = 0.62; // ride on top of the 0.5-radius track tube

function syncTrains() {
  for (const lg of lineGroups.values()) {
    const want = trainCountFor(lg.line.id, lg.lengthKm, simState.hour);
    if (lg.trains.length === want) continue;
    for (const tr of lg.trains) {
      lg.group.remove(tr);
      const gi = trainMeshes.indexOf(tr);
      if (gi >= 0) trainMeshes.splice(gi, 1);
      if (chase.train === tr) exitChase();
    }
    lg.trains.length = 0;
    const perDir = Math.ceil(want / 2);
    for (let i = 0; i < want; i++) {
      const tr = makeTrain(lg);
      const dir = i < perDir ? 1 : -1;
      const k = dir === 1 ? i : i - perDir;
      tr.userData = {
        lg, dir,
        offset: (k / perDir + (dir === 1 ? 0 : 0.5 / perDir)) % 1,
      };
      lg.group.add(tr);
      lg.trains.push(tr);
      trainMeshes.push(tr);
    }
  }
}

// ── chase / cab camera ───────────────────────────────────────────────
const chase = { train: null, cab: false };
const chaseBar = document.getElementById('chase');
const chaseLabel = document.getElementById('chase-label');
const _fwd = new THREE.Vector3(), _campos = new THREE.Vector3(), _look = new THREE.Vector3();

function enterChase(train) {
  chase.train = train;
  chase.cab = false;
  controls.enabled = false;
  const line = train.userData.lg.line;
  chaseLabel.textContent = `🚆 กำลังตามขบวน · ${line.name_th || line.name_en}`;
  chaseLabel.style.color = line.color;
  chaseBar.hidden = false;
}

function exitChase() {
  if (!chase.train) return;
  controls.target.copy(chase.train.position);
  chase.train = null;
  controls.enabled = true;
  chaseBar.hidden = true;
}

function updateChase() {
  const tr = chase.train;
  if (!tr) return;
  tr.getWorldDirection(_fwd); // train +Z = direction of travel
  if (chase.cab) {
    // driver's seat: just behind the nose of the lead car
    _campos.copy(tr.position).addScaledVector(_fwd, TRAIN_GEOS.halfLen + 0.1);
    _campos.y += 0.34;
    camera.position.lerp(_campos, 0.3);
    _look.copy(tr.position).addScaledVector(_fwd, 12);
    _look.y = tr.position.y + 0.1;
    camera.lookAt(_look);
  } else {
    _campos.copy(tr.position).addScaledVector(_fwd, -6.0);
    _campos.y += 2.6;
    camera.position.lerp(_campos, 0.07);
    _look.copy(tr.position).addScaledVector(_fwd, 2.5);
    camera.lookAt(_look);
  }
}

document.getElementById('chase-exit').addEventListener('click', exitChase);
document.getElementById('chase-cab').addEventListener('click', () => { chase.cab = !chase.cab; });
addEventListener('keydown', (e) => {
  if (e.key === 'c' || e.key === 'C') chase.cab = !chase.cab;
});

// ── UI: legend / stats / tooltip ─────────────────────────────────────
const legendEl = document.getElementById('legend');
const statsEl = document.getElementById('stats');
const card = document.getElementById('card');
const cardLine = document.getElementById('card-line');
const cardTh = document.getElementById('card-th');
const cardEn = document.getElementById('card-en');

function setLineVisible(id, on) {
  const lg = lineGroups.get(id);
  lg.visible = on;
  lg.group.visible = on;
  document.querySelector(`.chip[data-id="${id}"]`)?.classList.toggle('off', !on);
}

function activateMRTA() {
  for (const lg of lineGroups.values()) {
    setLineVisible(lg.line.id, MRTA_LINES.has(lg.line.id));
  }
  statsEl.textContent = 'โหมด MRTA · 4 สาย รฟม.';
  document.getElementById('panel').classList.remove('collapsed');
}

function buildLegend(lines) {
  let stationTotal = 0;
  for (const line of lines) {
    stationTotal += line.stations.length;
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.dataset.id = line.id;
    chip.style.color = line.color;
    chip.innerHTML =
      `<span class="dot" style="background:${line.color}"></span>` +
      `<span class="nm">${line.name_th || line.name_en}</span>` +
      `<span class="ct">${line.stations.length}</span>`;
    chip.addEventListener('click', () => setLineVisible(line.id, !lineGroups.get(line.id).visible));
    chip.addEventListener('dblclick', () => {
      const others = [...lineGroups.values()].filter(g => g.line.id !== line.id);
      const anyOn = others.some(g => g.visible);
      for (const g of others) setLineVisible(g.line.id, !anyOn);
      setLineVisible(line.id, true);
    });
    legendEl.appendChild(chip);
  }
  statsEl.textContent = `${lines.length} สาย · ${stationTotal} สถานี`;
}

// ── route planner wiring ─────────────────────────────────────────────
let graph = null;
const routeState = { from: null, to: null, placeJourney: null, overlay: new THREE.Group(), markers: [] };
scene.add(routeState.overlay);
const routePanel = document.getElementById('route');
const routeBody = document.getElementById('route-body');

function meshOf(nodeId) {
  return stationMeshes.find(m => m.userData.nodeId === nodeId);
}

function makeMarker(pos, color) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.9, 0.09, 10, 36),
    new THREE.MeshBasicMaterial({ color }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.copy(pos);
  ring.userData.pulse = true;
  routeState.overlay.add(ring);
  routeState.markers.push(ring);
  return ring;
}

function clearRoute() {
  routeState.from = routeState.to = null;
  routeState.result = null;
  routeState.placeJourney = null;
  setCityDim(false);
  routeState.markers.length = 0;
  routeState.overlay.clear();
  for (const lg of lineGroups.values()) {
    for (const m of lg.materials) m.opacity = m.userData.fullOpacity ?? 1;
  }
  routePanel.classList.remove('active');
  routeBody.innerHTML = '<span class="muted">คลิกสถานีต้นทาง แล้วคลิกสถานีปลายทาง</span>';
  const p = new URLSearchParams(location.search);
  if (p.has('route') || p.has('placeFrom') || p.has('placeTo')) {
    p.delete('route');
    p.delete('placeFrom');
    p.delete('placeTo');
    history.replaceState(null, '', location.pathname + (p.size ? '?' + p : ''));
  }
  if (typeof updateSbSum === 'function') updateSbSum();
}

// focus mode: fade the whole city layer so the journey pops
let cityGroup = null;
function setCityDim(on) {
  if (!cityGroup) return;
  cityGroup.traverse((o) => {
    const m = o.material;
    if (!m) return;
    if (m.userData.origOpacity == null) {
      m.userData.origOpacity = m.opacity ?? 1;
      m.userData.origTransparent = m.transparent;
    }
    if (on) {
      m.transparent = true;
      m.opacity = m.userData.origOpacity * 0.3;
    } else {
      m.opacity = m.userData.origOpacity;
      m.transparent = m.userData.origTransparent;
    }
  });
}

function highlightRoute(result) {
  setCityDim(true);
  const usedLines = new Set(result.legs.map(l => l.line.id));
  for (const lg of lineGroups.values()) {
    const on = usedLines.has(lg.line.id);
    for (const m of lg.materials) {
      m.opacity = on ? (m.userData.fullOpacity ?? 1) : T.dimOpacity;
    }
  }
  // bright overlay tube along each leg, following real track geometry
  for (const leg of result.legs) {
    const lg = lineGroups.get(leg.line.id);
    const a = lg.stationPathIdx[leg.nodes[0].idx];
    const b = lg.stationPathIdx[leg.nodes[leg.nodes.length - 1].idx];
    const slice = lg.pathWorld.slice(Math.min(a, b), Math.max(a, b) + 1);
    if (slice.length < 2) continue;
    const curve = new THREE.CatmullRomCurve3(slice, false, 'centripetal', 0.1);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(leg.line.color).lerp(new THREE.Color(0xffffff), 0.35),
    });
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, Math.max(60, slice.length * 4), 0.75, 10, false), mat);
    routeState.overlay.add(tube);
  }
}

function routeFareSummary(result = routeState.result) {
  if (!result) return null;
  const legInfo = result.legs.map(l => ({
    lineId: l.line.id,
    stations: l.nodes.length - 1,
    from: canonId.get(l.nodes[0].id) ?? l.nodes[0].id,
    to: canonId.get(l.nodes[l.nodes.length - 1].id) ?? l.nodes[l.nodes.length - 1].id,
    fromAlts: altsOf(l.nodes[0]),
    toAlts: altsOf(l.nodes[l.nodes.length - 1]),
  }));
  const first = result.legs[0].nodes[0].station;
  const lastLeg = result.legs[result.legs.length - 1];
  const last = lastLeg.nodes[lastLeg.nodes.length - 1].station;
  return {
    from: first.name_th || first.name_en,
    to: last.name_th || last.name_en,
    minutes: result.minutes,
    km: result.totalM / 1000,
    stationCount: result.stationCount,
    transfers: result.transfers,
    normal: computeFares(legInfo, fareLookup),
    flat: flatFare(result.minutes),
  };
}

function renderRoutePanel(result) {
  const km = (result.totalM / 1000).toFixed(1);
  const placeJourney = routeState.placeJourney;
  const placeIntro = placeJourney ? `
    <section class="rt-place-summary" aria-label="สรุปการเดินทางจากสถานที่ถึงสถานที่">
      <div class="rt-place-row"><span class="rt-place-icon">🚶</span><div>
        <b>${escHTML(placeJourney.origin.name)}</b><br>
        <span class="muted">เดินประมาณ ${placeJourney.access.walkMeters.toLocaleString('th-TH')} ม. ไปสถานี ${escHTML(placeJourney.originStation.nameTh)}</span>
      </div></div>
      <div class="rt-place-row rt-place-dest"><span class="rt-place-icon">🏁</span><div>
        <b>${escHTML(placeJourney.destination.name)}</b><br>
        <span class="muted">ลงสถานี ${escHTML(placeJourney.destinationStation.nameTh)}${placeJourney.bestExit
          ? ` · ใช้${escHTML(placeJourney.bestExit.label)} · เดินประมาณ ${placeJourney.bestExit.walkMeters.toLocaleString('th-TH')} ม.`
          : ` · เดินประมาณ ${placeJourney.egress.walkMeters.toLocaleString('th-TH')} ม.`}</span>
      </div></div>
      <small class="muted">ระยะเดินเป็นค่าประมาณจากพิกัด ไม่ใช่เส้นทางเดินแบบเลี้ยวต่อเลี้ยว</small>
    </section>` : '';
  // journey card: numbered instructions in platform-signage language —
  // readable by someone who has never ridden the system
  let stepNo = 0;
  const stepsArr = [];
  const codeOf = (node) => stationCodes[node.id] ? `<b>${stationCodes[node.id]}</b> ` : '';
  result.legs.forEach((leg, i) => {
    const from = leg.nodes[0], to = leg.nodes[leg.nodes.length - 1];
    const n = leg.nodes.length - 1;
    const lineSt = leg.line.stations;
    const goingUp = to.idx > from.idx;
    const terminus = goingUp ? lineSt[lineSt.length - 1] : lineSt[0];
    const legMin = Math.max(2, Math.round((leg.distM / 1000) / RIDE_KMH * 60));
    const under = lineElevation(leg.line) < 0;
    const crowd = crowdLevel(leg.line.id, simState.hour);
    stepsArr.push(`<div class="js-step">
      <span class="js-no" style="background:${leg.line.color}">${++stepNo}</span>
      <div><b>ขึ้นที่ ${codeOf(from)}${from.station.name_th}</b> — ชานชาลามุ่งหน้า <b>${terminus.name_th || terminus.name_en}</b><br>
      <span class="muted">${leg.line.name_th || leg.line.name_en} · ${under ? '⬇️ ใต้ดิน' : '🛤️ ยกระดับ'} · ${crowd.icon} ${crowd.label}</span></div></div>`);
    stepsArr.push(`<div class="js-step">
      <span class="js-no" style="background:${leg.line.color}">${++stepNo}</span>
      <div>นั่ง ${n} สถานี <span class="muted">(~${legMin} นาที)</span> → ลงที่ <b>${codeOf(to)}${to.station.name_th}</b></div></div>`);
    if (i < result.legs.length - 1) {
      const nxt = result.legs[i + 1].nodes[0];
      const walkM = Math.max(30, Math.round(haversine(to.station, nxt.station) / 10) * 10);
      stepsArr.push(`<div class="js-step js-walk">🚶 เดินเปลี่ยนสาย ~${walkM} ม. (~${Math.max(1, Math.round(walkM / 70))} นาที) ไป${result.legs[i + 1].line.name_th || ''}
        <span class="muted">(เงื่อนไข 20฿: แตะเข้าภายใน 30 นาที)</span></div>`);
    }
  });
  const lastLegD = result.legs[result.legs.length - 1];
  const destNode = lastLegD.nodes[lastLegD.nodes.length - 1];
  const destExits = exitsByStation.get(destNode.id) ?? [];
  const namedExits = destExits.filter(e => e.ref && e.name).slice(0, 3);
  const destWc = destExits.filter(e => e.wc);
  stepsArr.push(`<div class="js-step"><span class="js-no js-fin">🏁</span>
    <div><b>ถึง ${codeOf(destNode)}${destNode.station.name_th}</b>${destExits.length
      ? `<br><span class="muted">🚪 ${destExits.length} ทางออก${namedExits.length
        ? ': ' + namedExits.map(e => `<b>${e.ref}</b> ${e.name}`).join(' · ') : ''}${
        destWc.length ? `<br>♿ วีลแชร์ใช้ได้ ${destWc.length} จุด${destWc.filter(e => e.ref).length
          ? ' (ทางออก ' + destWc.filter(e => e.ref).map(e => e.ref).slice(0, 4).join(', ') + ')' : ''}` : ''}</span>`
      : ''}</div></div>`);
  const steps = stepsArr.join('');
  const exitHint = '';

  // fares: registered 20-baht flat scheme vs normal per-operator tickets
  const fareSummary = routeFareSummary(result);
  const normal = fareSummary.normal;
  const flat = fareSummary.flat;
  const co2 = co2Saved(result.totalM / 1000);
  const flatRow = flat.eligible
    ? `<div class="rt-fare-row"><span>ลงทะเบียน 20 บาทตลอดสาย</span><b class="rt-price">20฿</b></div>
       <div class="muted rt-fare-note">เงื่อนไข: ลงทะเบียนแอปทางรัฐ · เปลี่ยนสายใน 30 นาที · ถึงปลายทางใน 180 นาที · ข้าม BTS↔MRT ใช้คนละบัตร · ถึง 30 ก.ย. 2569</div>`
    : `<div class="rt-fare-row"><span>ลงทะเบียน 20 บาทตลอดสาย</span><b class="rt-price">ไม่เข้าเงื่อนไข</b></div>
       <div class="muted rt-fare-note">เส้นทางนี้ ~${result.minutes} นาที เกินเงื่อนไข 180 นาที</div>`;
  const parts = normal.parts.length > 1
    ? ` <span class="muted">(${normal.parts.map(p => p.fare + '฿').join(' + ')})</span>` : '';
  // live timing: average wait (headway/2) + arrival clock + last-train warning
  const firstLine = result.legs[0].line.id;
  const hw = headwayFor(firstLine, simState.hour);
  let timingRow = '';
  if (hw == null) {
    timingRow = `<div class="rt-timing rt-warn">⚫ ช่วงนี้ปิดให้บริการ (~ตี 0:30-5:30) — เลื่อนแถบเวลาดูรอบให้บริการได้</div>`;
  } else {
    const waitMin = Math.max(1, Math.round(hw / 2));
    const arriveH = simState.hour + (waitMin + result.minutes) / 60;
    const parseEnd = (s) => { const [h, m] = s.split(':').map(Number); return (h < 4 ? h + 24 : h) + m / 60; };
    const minEnd = Math.min(...result.legs.map(l => parseEnd(serviceHours(l.line.id)[1])));
    const lastWarn = (simState.hour < 4 ? simState.hour + 24 : simState.hour) + (waitMin + result.minutes) / 60 > minEnd - 0.5
      ? `<div class="rt-timing rt-warn">⚠️ ใกล้รถเที่ยวสุดท้าย — เช็คเวลาปิดที่สถานีก่อนเดินทาง</div>` : '';
    timingRow = `<div class="rt-timing">🕐 ออกตอนนี้ · รอรถ ~${waitMin} นาที (มาทุก ~${hw} นาที) · ถึงประมาณ <b>${fmtHour(arriveH % 24)}</b></div>${lastWarn}`;
  }

  routeBody.innerHTML = `
    ${placeIntro}
    <div class="rt-stats">~${placeJourney?.totalMinutes ?? result.minutes} นาทีรวม · ${km} กม. บนราง · ${result.stationCount} สถานี · เปลี่ยน ${result.transfers} ครั้ง</div>
    ${timingRow}
    ${steps}
    ${exitHint}
    <div class="rt-fare">
      ${flatRow}
      <div class="rt-fare-row"><span>ราคาปกติ${normal.allExact ? '' : ' (ประมาณ)'}</span><b class="rt-price">${normal.allExact ? '' : '~'}${normal.total}฿${parts}</b></div>
      <div class="muted rt-fare-note">${normal.allExact
        ? 'อัตราตามประกาศทางการ (Open Data กรมการขนส่งทางราง, เม.ย. 2569)'
        : 'บางช่วงประมาณจากอัตราเผยแพร่ อาจต่างจากจริง'}</div>
      <div class="rt-co2">🌱 ทริปนี้ลด CO₂ ~<b>${co2.kg.toFixed(1)} กก.</b> เทียบรถยนต์
        (มอเตอร์ไซค์ ~${co2.kgMoto.toFixed(1)} กก.) <span class="muted">≈ ต้นไม้ดูดซับ ${Math.round(co2.treeDays)} วัน</span><br>
        <span class="muted">สะสมที่คุณช่วยลดแล้ว <b>${ledgerAdd(co2.kg).toFixed(1)} กก.</b> ·
        MRT ใช้ไฟส่วนหนึ่งจาก solar rooftop 17 MWp ของ รฟม. เอง · ประมาณการ</span></div>
    </div>
    <button class="rt-tour" id="route-tour">🎬 ซ้อมเดินทางแบบ 3D</button>
    <button class="rt-share" id="route-firstride">🎓 โหมดสอนทีละขั้น (ครั้งแรกก็นั่งเป็น)</button>
    <button class="rt-share" id="route-share">📋 คัดลอกลิงก์เส้นทางนี้</button>`;
  document.getElementById('route-tour').addEventListener('click', startTour);
  document.getElementById('route-firstride').addEventListener('click', () => firstRide?.startFirstRide());
  document.getElementById('route-share').addEventListener('click', async (e) => {
    try {
      await navigator.clipboard.writeText(location.href);
      e.target.textContent = '✅ คัดลอกแล้ว';
      setTimeout(() => { e.target.textContent = '📋 คัดลอกลิงก์เส้นทางนี้'; }, 1600);
    } catch {
      e.target.textContent = location.href; // fallback: show it
    }
  });
}

function selectStation(mesh) {
  if (!graph) return;
  const id = mesh.userData.nodeId;
  if (!routeState.from || (routeState.from && routeState.to)) {
    clearRoute();
    const placeFrom = document.getElementById('place-from-input');
    const placeTo = document.getElementById('place-to-input');
    if (placeFrom) placeFrom.value = '';
    if (placeTo) placeTo.value = '';
    routeState.from = id;
    makeMarker(mesh.position, 0xd4af5f);
    routePanel.classList.add('active');
    routeBody.innerHTML =
      `<b>จาก:</b> ${mesh.userData.station.name_th} — <span class="muted">คลิกสถานีปลายทาง</span>`;
  } else if (id !== routeState.from) {
    routeState.to = id;
    makeMarker(mesh.position, 0xffffff);
    const result = findRoute(graph, routeState.from, routeState.to);
    if (result) {
      routeState.result = result;
      highlightRoute(result);
      renderRoutePanel(result);
      // shareable URL: ?route=ต้นทาง,ปลายทาง + remember in recents
      const a = result.legs[0].nodes[0].station;
      const lastLeg = result.legs[result.legs.length - 1];
      const b = lastLeg.nodes[lastLeg.nodes.length - 1].station;
      const p = new URLSearchParams(location.search);
      p.set('route', `${a.name_th || a.name_en},${b.name_th || b.name_en}`);
      history.replaceState(null, '', '?' + p.toString());
      saveRecent(a.name_th || a.name_en, b.name_th || b.name_en);
      fromInput.value = a.name_th || a.name_en;
      toInput.value = b.name_th || b.name_en;
      updateSbSum();
      miniSearch(true);
    } else {
      routeBody.innerHTML = '<span class="muted">หาเส้นทางไม่ได้ — ลองสถานีอื่น</span>';
    }
  }
}

function planNodeTrip(fromId, toId, placeJourney = null) {
  if (!graph || fromId === toId) return false;
  const fromMesh = meshOf(fromId);
  const toMesh = meshOf(toId);
  if (!fromMesh || !toMesh) return false;

  clearRoute();
  routeState.from = fromId;
  routeState.to = toId;
  routeState.placeJourney = placeJourney;
  makeMarker(fromMesh.position, 0xd4af5f);
  makeMarker(toMesh.position, 0xffffff);
  const result = findRoute(graph, fromId, toId);
  if (!result) return false;

  routeState.result = result;
  highlightRoute(result);
  renderRoutePanel(result);
  routePanel.classList.add('active');
  const first = result.legs[0].nodes[0].station;
  const lastLeg = result.legs[result.legs.length - 1];
  const last = lastLeg.nodes[lastLeg.nodes.length - 1].station;
  fromInput.value = first.name_th || first.name_en;
  toInput.value = last.name_th || last.name_en;

  const params = new URLSearchParams(location.search);
  if (placeJourney) {
    params.delete('route');
    params.set('placeFrom', `${placeJourney.origin.lat},${placeJourney.origin.lon},${placeJourney.origin.name}`);
    params.set('placeTo', `${placeJourney.destination.lat},${placeJourney.destination.lon},${placeJourney.destination.name}`);
    saveRecent(placeJourney.origin.name, placeJourney.destination.name);
  } else {
    params.set('route', `${fromInput.value},${toInput.value}`);
  }
  history.replaceState(null, '', `${location.pathname}?${params}`);
  updateSbSum();
  miniSearch(true);
  return true;
}

document.getElementById('route-clear').addEventListener('click', clearRoute);
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (firstRide?.isActive()) firstRide.stop();
    else if (tour.active) exitTour();
    else if (chase.train) exitChase();
    else clearRoute();
  }
});

// day/night toggle — full reload keeps material setup simple
const themeBtn = document.getElementById('theme-toggle');
themeBtn.textContent = DAY ? '🌙' : '☀️';
themeBtn.addEventListener('click', () => {
  const p = new URLSearchParams(location.search);
  if (DAY) p.delete('day'); else p.set('day', '');
  location.search = p.toString();
});

// click = pointerdown/up with no drag; trains take priority over stations
let downXY = null;
addEventListener('pointerdown', (e) => { downXY = [e.clientX, e.clientY]; });
addEventListener('pointerup', (e) => {
  if (!downXY) return;
  const moved = Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]);
  downXY = null;
  if (moved > 5) return;
  raycaster.setFromCamera(pointer, camera);
  const trainHits = raycaster.intersectObjects(
    trainMeshes.filter(m => m.parent.visible), true);
  if (trainHits[0]) {
    let obj = trainHits[0].object;
    while (obj && !obj.userData.lg) obj = obj.parent;
    if (obj) { enterChase(obj); return; }
  }
  const hits = raycaster.intersectObjects(stationHits.filter(m => m.parent.visible), false);
  if (hits[0]) openSheet(hits[0].object.userData.core);
});

// ── station search + fly-to ──────────────────────────────────────────
const flyState = { active: false, t: 0, dur: 1.4,
  fromCam: new THREE.Vector3(), toCam: new THREE.Vector3(),
  fromTgt: new THREE.Vector3(), toTgt: new THREE.Vector3() };

function flyTo(pos) {
  flyState.fromCam.copy(camera.position);
  flyState.fromTgt.copy(controls.target);
  flyState.toTgt.copy(pos);
  flyState.toCam.set(pos.x + 9, pos.y + 7, pos.z + 11);
  flyState.t = 0;
  flyState.active = true;
}

function updateFly(dt) {
  if (!flyState.active) return;
  flyState.t += dt / flyState.dur;
  const k = flyState.t >= 1 ? 1 : 1 - Math.pow(1 - flyState.t, 3);
  camera.position.lerpVectors(flyState.fromCam, flyState.toCam, k);
  controls.target.lerpVectors(flyState.fromTgt, flyState.toTgt, k);
  if (flyState.t >= 1) flyState.active = false;
}

function buildSearchIndex() {
  const dl = document.getElementById('station-list');
  const seen = new Set();
  for (const m of stationMeshes) {
    const s = m.userData.station;
    const key = (s.name_th || s.name_en || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const opt = document.createElement('option');
    opt.value = key;
    if (s.name_en && s.name_en !== key) opt.label = s.name_en;
    dl.appendChild(opt);
  }
}

function findStationMesh(q) {
  q = q.trim().toLowerCase();
  if (!q) return null;
  return stationMeshes.find(m =>
    (m.userData.station.name_th || '').toLowerCase() === q ||
    (m.userData.station.name_en || '').toLowerCase() === q)
    || stationMeshes.find(m =>
      (m.userData.station.name_th || '').toLowerCase().includes(q) ||
      (m.userData.station.name_en || '').toLowerCase().includes(q));
}

// ── from→to search bar, action sheet, geolocation, recents ──────────
const fromInput = document.getElementById('from-input');
const toInput = document.getElementById('to-input');
const pending = { from: null, to: null };

// station codes (N8/BL13/CEN…) — DRT-derived, loaded async then stamped
let stationCodes = {};
fetch('data/station_codes.json').then(r => r.ok ? r.json() : {}).then(codes => {
  stationCodes = codes;
  for (const m of stationMeshes) {
    const code = codes[m.userData.nodeId];
    if (!code) continue;
    m.userData.code = code;
    const el = m.userData.label?.element;
    if (el) el.innerHTML = `<b>${code}</b> ${m.userData.station.name_th || ''}`;
  }
}).catch(() => {});

// station exits (OSM subway_entrance) — grouped per station node id
let exitsByStation = new Map();
fetch('data/exits.json').then(r => r.ok ? r.json() : null).then(d => {
  if (!d) return;
  for (const e of d.exits) {
    if (!exitsByStation.has(e.st)) exitsByStation.set(e.st, []);
    exitsByStation.get(e.st).push(e);
  }
}).catch(() => {});

function stationDisplayName(mesh) {
  const s = mesh.userData.station;
  return s.name_th || s.name_en || '';
}

function applyPending() {
  if (!pending.from) return;
  if (chase.train) exitChase();
  clearRoute();
  selectStation(pending.from);
  if (pending.to && pending.to !== pending.from) selectStation(pending.to);
  else flyTo(pending.from.position);
}

function planTrip(fromName, toName) {
  const from = findStationMesh(fromName);
  const to = findStationMesh(toName);
  if (!from || !to) return false;
  pending.from = from;
  pending.to = to;
  fromInput.value = stationDisplayName(from);
  toInput.value = stationDisplayName(to);
  applyPending();
  updateSbSum();
  miniSearch(true);
  return !!routeState.result;
}

function runDemo() {
  activateMRTA();
  const ok = planTrip('สยาม', 'ท่าพระ') || planTrip('เตาปูน', 'ศูนย์วัฒนธรรมฯ');
  if (ok) {
    routePanel.classList.add('active');
  }
}

function wireSearchInput(input, role) {
  input.addEventListener('change', () => {
    const m = findStationMesh(input.value);
    if (!m) return;
    pending[role] = m;
    input.value = stationDisplayName(m);
    input.blur();
    applyPending();
  });
}
wireSearchInput(fromInput, 'from');
wireSearchInput(toInput, 'to');

// mobile: search collapses to a one-line summary (tap to expand)
const searchbarEl = document.getElementById('searchbar');
const sbSum = document.getElementById('sb-sum');
const isMobile = () => innerWidth <= 640;
function updateSbSum() {
  const placeFrom = document.getElementById('place-from-input')?.value.trim();
  const placeTo = document.getElementById('place-to-input')?.value.trim();
  sbSum.textContent = routeState.result
    ? `${placeFrom || fromInput.value} → ${placeTo || toInput.value}`
    : '🔍 ค้นหาเส้นทาง…';
}
function miniSearch(on) {
  if (!isMobile()) return;
  searchbarEl.classList.toggle('mini', on);
}
sbSum.addEventListener('click', () => {
  searchbarEl.classList.remove('mini');
  (document.getElementById('place-from-input') || fromInput).focus();
});
if (isMobile()) miniSearch(true);
updateSbSum();

// mobile: the 4 tool buttons live behind a ⋯ toggle
document.getElementById('tools-btn')?.addEventListener('click', () => {
  document.body.classList.toggle('showtools');
});

document.getElementById('swap-btn').addEventListener('click', () => {
  [pending.from, pending.to] = [pending.to, pending.from];
  [fromInput.value, toInput.value] = [toInput.value, fromInput.value];
  applyPending();
});

document.getElementById('geo-btn').addEventListener('click', () => {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition((p) => {
    const { latitude: la, longitude: lo } = p.coords;
    let best = null, bestD = Infinity;
    for (const m of stationMeshes) {
      const s = m.userData.station;
      const d = (s.lat - la) ** 2 + (s.lon - lo) ** 2;
      if (d < bestD) { bestD = d; best = m; }
    }
    if (best) {
      pending.from = best;
      fromInput.value = stationDisplayName(best);
      applyPending();
    }
  }, () => {}, { timeout: 6000 });
});

// ── recent routes (localStorage) ─────────────────────────────────────
const recentsEl = document.getElementById('recents');
function loadRecents() {
  try { return JSON.parse(localStorage.getItem('bkk3d_recents') || '[]'); }
  catch { return []; }
}
function saveRecent(a, b) {
  const list = loadRecents().filter(r => !(r[0] === a && r[1] === b));
  list.unshift([a, b]);
  try { localStorage.setItem('bkk3d_recents', JSON.stringify(list.slice(0, 3))); } catch {}
  renderRecents();
}
const POPULAR = [['สยาม', 'สนามไชย'], ['พญาไท', 'สุวรรณภูมิ']];
function renderRecents() {
  const recents = loadRecents();
  const list = recents.length ? recents : POPULAR;
  const tag = recents.length ? '' : '🔥 ';
  recentsEl.innerHTML = list.map((r, i) =>
    `<button class="rc" data-i="${i}">${tag}${r[0]} → ${r[1]}</button>`).join('');
  recentsEl.querySelectorAll('.rc').forEach(btn => {
    btn.addEventListener('click', () => {
      const [a, b] = list[+btn.dataset.i];
      pending.from = findStationMesh(a);
      pending.to = findStationMesh(b);
      fromInput.value = a; toInput.value = b;
      applyPending();
    });
  });
}
renderRecents();

// ── station action sheet ─────────────────────────────────────────────
const sheet = document.getElementById('sheet');
let sheetMesh = null;

function crowdHTML(lineId) {
  const c = crowdLevel(lineId, simState.hour);
  return `${c.icon} ${c.label} <span class="muted">(ประมาณการ)</span>`;
}

function openSheet(mesh) {
  sheetMesh = mesh;
  const { station, line, nodeId } = mesh.userData;
  const code = mesh.userData.code || stationCodes[nodeId] || '';
  document.getElementById('sh-code').textContent = code || '•';
  document.getElementById('sh-code').style.background = line.color;
  document.getElementById('sh-name').textContent = station.name_th || station.name_en;
  document.getElementById('sh-sub').textContent =
    `${line.name_th || line.name_en}${station.name_en ? ' · ' + station.name_en : ''}`;

  const [first, last] = serviceHours(line.id);
  const exits = exitsByStation.get(nodeId) ?? [];
  const exitRefs = exits.filter(e => e.ref).map(e => e.ref)
    .sort((a, b) => (parseInt(a) || 99) - (parseInt(b) || 99));
  const wcRefs = exits.filter(e => e.wc).map(e => e.ref).filter(Boolean);
  const wcCount = exits.filter(e => e.wc).length;
  const exitLine = exits.length
    ? `🚪 ทางออก ${exits.length} จุด${exitRefs.length ? ' (' + exitRefs.slice(0, 8).join(', ') + ')' : ''}${
        wcCount ? `<br>♿ รองรับวีลแชร์ ${wcCount} จุด${wcRefs.length ? ' (ทางออก ' + wcRefs.slice(0, 5).join(', ') + ')' : ''}` : ''}`
    : `🚪 ทางออก: <span class="muted">ยังไม่มีข้อมูลใน OSM</span>`;
  document.getElementById('sh-info').innerHTML = `
    <div>🕐 รถแรก ~${first} · รถสุดท้าย ~${last}</div>
    <div>${exitLine}</div>
    <div>👥 ${crowdHTML(line.id)}</div>`;
  sheet.hidden = false;
  flyTo(mesh.position);
}

function closeSheet() { sheet.hidden = true; sheetMesh = null; }
document.getElementById('sh-close').addEventListener('click', closeSheet);
document.getElementById('sh-from').addEventListener('click', () => {
  if (!sheetMesh) return;
  pending.from = sheetMesh;
  fromInput.value = stationDisplayName(sheetMesh);
  closeSheet();
  applyPending();
});
document.getElementById('sh-to').addEventListener('click', () => {
  if (!sheetMesh) return;
  pending.to = sheetMesh;
  toInput.value = stationDisplayName(sheetMesh);
  closeSheet();
  applyPending();
});

// ── onboarding (first visit) ─────────────────────────────────────────
{
  const q = new URLSearchParams(location.search);
  const seen = localStorage.getItem('bkk3d_seen');
  if ((!seen || q.has('fresh')) && !q.has('snap') && !q.has('clean')) {
    document.getElementById('onboard').hidden = false;
  }
  document.getElementById('ob-go').addEventListener('click', () => {
    document.getElementById('onboard').hidden = true;
    try { localStorage.setItem('bkk3d_seen', '1'); } catch {}
  });
  document.getElementById('ob-first').addEventListener('click', () => {
    document.getElementById('onboard').hidden = true;
    try { localStorage.setItem('bkk3d_seen', '1'); } catch {}
    firstRide?.startFirstRide();
  });
}

// ── big-text mode (accessibility) ────────────────────────────────────
document.getElementById('big-btn')?.addEventListener('click', () => {
  document.body.classList.toggle('big');
});

// ── reset view (🧭 home) ─────────────────────────────────────────────
const homeView = { cam: new THREE.Vector3(18, 51, 94), tgt: new THREE.Vector3(0, 0, 0) };
document.getElementById('home-btn')?.addEventListener('click', () => {
  if (firstRide?.isActive()) firstRide.stop();
  if (tour.active) exitTour();
  if (chase.train) exitChase();
  controls.target.copy(homeView.tgt);
  flyState.fromCam.copy(camera.position);
  flyState.fromTgt.copy(controls.target);
  flyState.toCam.copy(homeView.cam);
  flyState.toTgt.copy(homeView.tgt);
  flyState.t = 0;
  flyState.active = true;
});

// ── PWA install prompt ───────────────────────────────────────────────
let installEvt = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvt = e;
  const btn = document.getElementById('ab-install');
  if (btn) btn.hidden = false;
});
document.getElementById('ab-install')?.addEventListener('click', async () => {
  if (!installEvt) return;
  installEvt.prompt();
  await installEvt.userChoice;
  installEvt = null;
  document.getElementById('ab-install').hidden = true;
});

// ── collapsible legend panel (mobile starts collapsed) ───────────────
{
  const panel = document.getElementById('panel');
  const statsEl2 = document.getElementById('stats');
  if (innerWidth <= 640) panel.classList.add('collapsed');
  statsEl2.addEventListener('click', () => panel.classList.toggle('collapsed'));
}

// ── about modal ──────────────────────────────────────────────────────
document.getElementById('about-btn')?.addEventListener('click', () => {
  document.getElementById('about').hidden = false;
});
document.getElementById('ab-close')?.addEventListener('click', () => {
  document.getElementById('about').hidden = true;
});

// ── PWA ──────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// ── route flythrough: "ซ้อมเดินทาง" ─────────────────────────────────
// camera rides the actual track from origin to destination, pausing at
// transfers — a first-time rider sees the whole trip before leaving home
const tour = { active: false, legs: [], idx: 0, u: 0, pauseT: 0, done: false };
const TOUR_SPEED = 16; // scene units/s ≈ 1.6 km/s
const tourBanner = document.getElementById('tour-banner');
const tourText = document.getElementById('tour-text');

function tourLegText(i) {
  const { leg } = tour.legs[i];
  const to = leg.nodes[leg.nodes.length - 1];
  const lineSt = leg.line.stations;
  const goingUp = to.idx > leg.nodes[0].idx;
  const terminus = goingUp ? lineSt[lineSt.length - 1] : lineSt[0];
  const code = stationCodes[to.id] ? stationCodes[to.id] + ' ' : '';
  return `🚆 ${leg.line.name_th || leg.line.name_en} มุ่งหน้า${terminus.name_th || ''} → ลงที่ ${code}${to.station.name_th}`;
}

function buildTourLegs(result) {
  const legs = [];
  for (const leg of result.legs) {
    const lg = lineGroups.get(leg.line.id);
    const a = lg.stationPathIdx[leg.nodes[0].idx];
    const b = lg.stationPathIdx[leg.nodes[leg.nodes.length - 1].idx];
    let slice = lg.pathWorld.slice(Math.min(a, b), Math.max(a, b) + 1);
    if (slice.length < 2) continue;
    if (b < a) slice = [...slice].reverse(); // always travel origin→destination
    const curve = new THREE.CatmullRomCurve3(slice, false, 'centripetal', 0.1);
    legs.push({ curve, len: curve.getLength(), leg });
  }
  return legs;
}

function startTour() {
  if (!routeState.result) return;
  tour.legs = buildTourLegs(routeState.result);
  if (!tour.legs.length) return;
  if (chase.train) exitChase();
  closeSheet();
  Object.assign(tour, { active: true, idx: 0, u: 0, pauseT: 0, done: false,
                        single: false, onEnd: null });
  controls.enabled = false;
  tourBanner.hidden = false;
  tourText.textContent = tourLegText(0);
}

// single-leg playback for the First Ride simulator: ride leg i, then hand
// control back and fire onDone (instead of chaining to the next leg)
function startLegRide(i, onDone, bannerText) {
  if (!routeState.result) return false;
  tour.legs = buildTourLegs(routeState.result);
  if (!tour.legs[i]) return false;
  if (chase.train) exitChase();
  closeSheet();
  Object.assign(tour, { active: true, idx: i, u: 0, pauseT: 0, done: false,
                        single: true, onEnd: onDone });
  controls.enabled = false;
  tourBanner.hidden = false;
  tourText.textContent = bannerText || tourLegText(i);
  return true;
}

function exitTour() {
  if (!tour.active) return;
  tour.active = false;
  tour.single = false;
  tour.onEnd = null;
  controls.enabled = true;
  tourBanner.hidden = true;
  const last = tour.legs[tour.legs.length - 1];
  if (last) {
    const end = last.curve.getPointAt(1);
    controls.target.copy(end);
    camera.position.set(end.x + 7, Math.max(end.y, 0) + 6, end.z + 9);
  }
}

function updateTour(dt) {
  if (tour.pauseT > 0) { tour.pauseT -= dt; if (tour.pauseT > 0) return; }
  const cur = tour.legs[tour.idx];
  tour.u += (TOUR_SPEED * dt) / cur.len;
  if (tour.u >= 1) {
    if (tour.single) {
      tour.active = false;
      tour.single = false;
      controls.enabled = true;
      tourBanner.hidden = true;
      const cb = tour.onEnd;
      tour.onEnd = null;
      if (cb) cb();
      return;
    }
    if (tour.idx + 1 < tour.legs.length) {
      tour.idx++;
      tour.u = 0;
      tour.pauseT = 1.8;
      tourText.textContent = `🚶 เปลี่ยนสาย · ${tourLegText(tour.idx)}`;
    } else if (!tour.done) {
      tour.done = true;
      tour.pauseT = 1.4;
      tourText.textContent = '🏁 ถึงปลายทาง — เที่ยวจริงก็หน้าตาแบบนี้เลย';
    } else {
      exitTour();
    }
    return;
  }
  const u = Math.min(tour.u, 1);
  const p = cur.curve.getPointAt(u);
  const ahead = cur.curve.getPointAt(Math.min(u + 0.02, 1));
  _fwd.copy(ahead).sub(p);
  if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, 1); else _fwd.normalize();
  _campos.copy(p).addScaledVector(_fwd, -5);
  // stay above ground even on underground legs — the tube shows through
  _campos.y = Math.max(p.y + 2.4, 1.4);
  camera.position.lerp(_campos, 0.12);
  _look.copy(ahead);
  _look.y = Math.max(ahead.y, 0.15);
  camera.lookAt(_look);
}

document.getElementById('tour-exit').addEventListener('click', exitTour);

// ── First Ride simulator wiring ──────────────────────────────────────
let firstRide = null;
function setupFirstRide() {
  firstRide = initFirstRide({
    getResult: () => routeState.result,
    planRoute: (a, b) => {
      const A = findStationMesh(a), B = findStationMesh(b);
      if (!A || !B) return false;
      clearRoute();
      selectStation(A);
      selectStation(B);
      return !!routeState.result;
    },
    rideLeg: startLegRide,
    stationCodes: () => stationCodes,
    exitsFor: (nodeId) => exitsByStation.get(nodeId) ?? [],
    isUnderground: (line) => lineElevation(line) < 0,
    walkMeters: (a, b) => Math.max(30, Math.round(haversine(a, b) / 10) * 10),
    defaultMission: ['สยาม', 'ท่าพระ'],
  });
}

// ── time bar wiring ──────────────────────────────────────────────────
const timeSlider = document.getElementById('time-slider');
const timeLabel = document.getElementById('time-label');
const timePlay = document.getElementById('time-play');
const timeLive = document.getElementById('time-live');
let lastBand = null;

function fmtHour(h) {
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function refreshTimeUI() {
  timeSlider.value = simState.hour;
  timeLabel.textContent = `${fmtHour(simState.hour)} · ${BAND_LABEL_TH[bandOf(simState.hour)]}`;
  timeLive.classList.toggle('on', simState.live);
  timePlay.textContent = simState.playing ? '⏸' : '▶';
}

function setSimHour(h, { live = false } = {}) {
  simState.hour = ((h % 24) + 24) % 24;
  simState.live = live;
  const band = bandOf(simState.hour);
  if (band !== lastBand) {
    lastBand = band;
    syncTrains();
  }
  applyTimeOfDay();
  refreshTimeUI();
}

timeSlider.addEventListener('input', () => {
  simState.playing = false;
  setSimHour(parseFloat(timeSlider.value));
});
timePlay.addEventListener('click', () => {
  simState.playing = !simState.playing;
  simState.live = false;
  refreshTimeUI();
});
timeLive.addEventListener('click', () => {
  simState.playing = false;
  setSimHour((Date.now() / 3600000 + 7) % 24, { live: true });
});

// hover tooltip via raycaster
const raycaster = new THREE.Raycaster();
raycaster.params.Points = { threshold: 1 };
const pointer = new THREE.Vector2(-2, -2);
let hovered = null;

addEventListener('pointermove', (e) => {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
});

function updateHover() {
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(stationHits.filter(m => m.parent.visible), false);
  const hit = hits[0]?.object.userData.core ?? null;
  if (hit !== hovered) {
    if (hovered) hovered.scale.setScalar(1);
    hovered = hit;
    if (hovered) {
      hovered.scale.setScalar(1.8);
      const { station, line } = hovered.userData;
      cardLine.textContent = line.name_en || line.name_th;
      cardLine.style.color = line.color;
      cardTh.textContent = station.name_th || station.name_en;
      cardEn.textContent = station.name_en || '';
      card.hidden = false;
      document.body.style.cursor = 'pointer';
    } else {
      card.hidden = true;
      document.body.style.cursor = '';
    }
  }
  if (hovered) {
    const p = hovered.position.clone().project(camera);
    card.style.left = `${(p.x * 0.5 + 0.5) * innerWidth}px`;
    card.style.top = `${(-p.y * 0.5 + 0.5) * innerHeight}px`;
  }
}

// ── intro animation ──────────────────────────────────────────────────
const clock = new THREE.Clock();
let introT = 0;
const INTRO = 3.2;
const camFrom = new THREE.Vector3(0, 620, 40);
const camTo = new THREE.Vector3(58, 96, 150);
const ease = (t) => 1 - Math.pow(1 - t, 3);

function startIntro() {
  // start high over the whole network, land on the downtown core — the
  // full 47 km sprawl stays reachable by zooming out
  const box = new THREE.Box3().setFromObject(network);
  const center = box.getCenter(new THREE.Vector3());
  const span = Math.max(box.getSize(new THREE.Vector3()).x, box.getSize(new THREE.Vector3()).z, 20);
  const CORE = 110; // ~11 km view over Siam
  controls.target.set(0, 0, 0); // projection center = Siam area
  camFrom.set(center.x, span * 2.2, center.z + span * 0.1);
  camTo.set(CORE * 0.16, CORE * 0.62, CORE * 0.85);
  camera.position.copy(camFrom);
  // home view for the 🧭 reset button
  homeView.cam.copy(camTo);
  homeView.tgt.copy(controls.target);
  let i = 0;
  for (const lg of lineGroups.values()) lg.born = 0.25 + i++ * 0.22;

  // accessibility: skip the flying intro for reduced-motion users
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    introT = INTRO;
    camera.position.copy(camTo);
    for (const lg of lineGroups.values()) {
      lg.born = -1;
      lg.materials.forEach((m) => { m.opacity = m.userData.fullOpacity ?? 1; });
    }
  }

  // ?snap → jump straight to the final framing with everything lit,
  // for headless screenshots and embeds
  if (new URLSearchParams(location.search).has('snap')) {
    introT = INTRO;
    camera.position.copy(camTo);
    for (const lg of lineGroups.values()) {
      lg.born = -1;
      for (const m of lg.materials) m.opacity = m.userData.fullOpacity ?? 1;
    }
  }
}

// ── main loop ────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t = clock.elapsedTime;

  if (introT < INTRO) {
    introT += dt;
    const k = ease(Math.min(introT / INTRO, 1));
    camera.position.lerpVectors(camFrom, camTo, k);
  }

  for (const lg of lineGroups.values()) {
    if (lg.born >= 0 && t > lg.born) {
      const o = Math.min((t - lg.born) / 1.1, 1);
      for (const m of lg.materials) m.opacity = o * (m.userData.fullOpacity ?? 1);
      if (o >= 1) lg.born = -1; // fade done — stop touching (route dimming owns opacity now)
    }
    if (lg.visible && lg.trains.length) {
      // u-speed: RIDE_KMH at SIM_SPEED× over the line's real length
      const uPerSec = (RIDE_KMH * SIM_SPEED / 3600) / lg.lengthKm;
      for (const tr of lg.trains) {
        const { dir, offset } = tr.userData;
        let u = (t * uPerSec * dir + offset) % 1;
        if (u < 0) u += 1;
        tr.position.copy(lg.curve.getPointAt(u));
        tr.position.y += TRAIN_LIFT;
        // face along travel direction (same lift keeps the body level)
        const uAhead = Math.min(Math.max(u + 0.002 * dir, 0), 1);
        _look.copy(lg.curve.getPointAt(uAhead));
        _look.y += TRAIN_LIFT;
        if (!_look.equals(tr.position)) tr.lookAt(_look);
      }
    }
  }

  // label LOD: everything when close, interchanges/termini at mid range
  const camDist = camera.position.distanceTo(controls.target);
  const showAll = camDist < 40, showMajor = camDist < 140;
  for (const m of stationMeshes) {
    const lab = m.userData.label;
    if (!lab) continue;
    lab.visible = m.parent.visible &&
      (showAll || (showMajor && m.userData.major));
  }

  // pulse route markers
  for (const mk of routeState.markers) {
    mk.scale.setScalar(1 + 0.18 * Math.sin(t * 4));
  }

  // sim clock: play = +6 sim-min per real second; live = follow wall clock
  if (simState.playing) {
    setSimHour(simState.hour + dt * 0.1);
  } else if (simState.live && (t | 0) % 30 === 0) {
    setSimHour((Date.now() / 3600000 + 7) % 24, { live: true });
  }

  if (tour.active) {
    updateTour(dt);
  } else if (chase.train) {
    updateChase();
  } else {
    updateFly(dt);
    controls.update();
  }
  updateHover();
  composer.render();
  labelRenderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
});

// ── boot ─────────────────────────────────────────────────────────────
const loaderTxt = document.querySelector('#loader .txt');
function loaderStage(msg) { if (loaderTxt) loaderTxt.textContent = msg; }

async function boot() {
  loaderStage('โหลดเส้นทางรถไฟฟ้า 10 สาย…');
  let data;
  try {
    const res = await fetch('data/transit.json');
    if (!res.ok) throw new Error(`${res.status}`);
    data = await res.json();
  } catch {
    console.warn('transit.json not found — using built-in sample');
    data = FALLBACK;
  }
  for (const line of data.lines) buildLine(line);
  buildLegend(data.lines);
  buildCanonIds(data.lines);

  // spawn trains for the current time band + set lighting/UI
  setSimHour(simState.hour, { live: true });

  // planner graph + mark interchange/terminus stations for label LOD;
  // interchanges get a second outer ring so they read at a glance
  graph = buildGraph(data.lines);
  const outerRingGeo = new THREE.TorusGeometry(0.78, 0.07, 8, 32);
  for (const n of graph.nodes) {
    const m = meshOf(n.id);
    if (!m) continue;
    m.userData.major = n.major;
    if (n.major && T.stationRing) {
      const lg = lineGroups.get(m.userData.line.id);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x3a4150, transparent: true, opacity: 0 });
      mat.userData.fullOpacity = 0.9;
      lg.materials.push(mat);
      const ring = new THREE.Mesh(outerRingGeo, mat);
      ring.rotation.x = Math.PI / 2;
      ring.position.copy(m.position);
      lg.group.add(ring);
    }
  }
  buildSearchIndex();
  await initPlacePlanner({
    graph,
    exitsForNode: (nodeId) => exitsByStation.get(nodeId) ?? [],
    onJourney: (journey) => planNodeTrip(
      journey.originStation.nodeId,
      journey.destinationStation.nodeId,
      journey,
    ),
  });

  // (route auto-plan runs after startIntro — snap mode resets opacities and
  // must not clobber the route highlight)

  // city context layer (buildings + Chao Phraya) — optional, loads in
  // parallel-fetched files; scene works without it
  loaderStage('สร้างเมือง 3 มิติ · ตึก 110,000 หลัง…');
  try {
    cityGroup = await buildCity(project, SCALE);
    scene.add(cityGroup);
  } catch (e) {
    console.warn('city layer failed:', e);
  }
  loaderStage('โหลดค่าโดยสารทางการ + ข้อมูลสถานี…');

  console.info('boot: city done');
  // ridership stats (DRT open data) — optional layer + panel
  try {
    await initRidership({ scene, project, transit: data });
  } catch (e) {
    console.warn('ridership init failed:', e);
  }
  console.info('boot: ridership done');

  startIntro();

  // ?mrta — MRTA-context mode: spotlight the authority's own lines
  // (น้ำเงิน ม่วง เหลือง ชมพู); others stay togglable in the legend
  if (new URLSearchParams(location.search).has('mrta')) {
    activateMRTA();
  }

  // ?look=lat,lon,dist — reframe onto a spot (verification / deep links)
  const lookQ = new URLSearchParams(location.search).get('look');
  if (lookQ) {
    const [la, lo, di] = lookQ.split(',').map(Number);
    const v = project(la, lo);
    controls.target.set(v.x, 0, v.y);
    camera.position.set(v.x + di * 0.5, di * 0.8, v.y + di * 0.9);
    introT = INTRO;
  }

  // ?route=ต้นทาง,ปลายทาง — auto-plan (also used for headless verification)
  const routeQ = new URLSearchParams(location.search).get('route');
  if (routeQ) {
    const [qa, qb] = routeQ.split(',').map(s => s.trim().toLowerCase());
    const find = (q) => stationMeshes.find(m =>
      (m.userData.station.name_th || '').toLowerCase().includes(q) ||
      (m.userData.station.name_en || '').toLowerCase().includes(q));
    const A = find(qa), B = find(qb);
    if (A && B) { selectStation(A); selectStation(B); }
    if (new URLSearchParams(location.search).has('tour')) startTour();
  }

  setupFirstRide();
  if (new URLSearchParams(location.search).has('firstride')) {
    firstRide.startFirstRide();
  }

  // app-style tab pages (บริการ/ข่าวสาร/เพิ่มเติม)
  const pages = initPages({
    lines: data.lines.map(l => ({ id: l.id, name_th: l.name_th, name_en: l.name_en, color: l.color })),
    headwayFor, serviceHours,
    fareSummary: () => routeFareSummary(),
    activateMRTA,
    planTrip,
    runDemo,
    startFirstRide: () => firstRide?.startFirstRide(),
    focusSearch: () => {
      searchbarEl.classList.remove('mini');
      (document.getElementById('place-from-input') || fromInput).focus();
    },
    openStats: () => {
      document.getElementById('panel').classList.remove('collapsed');
      const rp = document.getElementById('rider-panel');
      if (rp.hidden) document.getElementById('rider-btn').click();
    },
    hintExits: () => {
      const first = stationMeshes.find(m => (exitsByStation.get(m.userData.nodeId) ?? []).length >= 3);
      if (first) openSheet(first);
    },
    toggleTheme: () => document.getElementById('theme-toggle').click(),
    toggleBig: () => document.body.classList.toggle('big'),
    openAbout: () => { document.getElementById('about').hidden = false; },
    openOnboard: () => { document.getElementById('onboard').hidden = false; },
  });
  document.getElementById('copilot-fab')?.addEventListener('click', () => pages.showPage('transitCopilot'));

  // ?chase=lineId[,cab] — auto-follow first train (demo/verification)
  const chaseQ = new URLSearchParams(location.search).get('chase');
  if (chaseQ) {
    const [cid, mode] = chaseQ.split(',');
    const lg = lineGroups.get(cid);
    if (lg && lg.trains[0]) {
      enterChase(lg.trains[0]);
      if (mode === 'cab') chase.cab = true;
    }
  }

  console.info('boot: complete');
  const loader = document.getElementById('loader');
  if (new URLSearchParams(location.search).has('snap')) loader.remove();
  else loader.classList.add('done');
  animate();
}
boot();
