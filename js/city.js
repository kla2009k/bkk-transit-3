// city.js — Bangkok city context: dense buildings with lit windows, major
// roads, Chao Phraya river. "Google Maps at night, but cinematic."
// Sources: data/citydense.json (65k OBB boxes), data/buildings.json
// (true footprints for towers), data/roads.json, data/river.json.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DAY, T } from './theme.js';

// low-rises are visually tiny at true scale — exaggerate below-tower heights
// so shophouses/houses read as mass (towers stay true)
const H_EXAG = 1.45, H_MIN = 7;
const exag = (h) => Math.max(h < 100 ? h * H_EXAG : h, H_MIN);

// Split between the two building datasets (meters): towers >= SPLIT_H use
// real extruded footprints, everything below renders as instanced boxes.
const SPLIT_H = 60;

// SwiftShader/llvmpipe hang compiling the window shader's instancing variant
// and crawl on 64k instances — detect software GL once and degrade gracefully.
const SOFT_GL = (() => {
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
      || document.createElement('canvas').getContext('webgl');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
    return /swiftshader|llvmpipe|softpipe|software/i.test(String(r));
  } catch { return false; }
})();

// night-window facade: injected into standard materials so it works for both
// merged extrusions and InstancedMesh without a custom shader pipeline
function windowize(mat, litRatio = 0.30) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos; varying vec3 vWNrm;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 _wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          vWNrm = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        #else
          vec4 _wp = modelMatrix * vec4(transformed, 1.0);
          vWNrm = normalize(mat3(modelMatrix) * normal);
        #endif
        vWPos = _wp.xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos; varying vec3 vWNrm;
        float _hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <opaque_fragment>', `
        {
          vec3 n = normalize(vWNrm);
          // vertical facades only, above street level (scene: 1u = 100 m)
          if (abs(n.y) < 0.35 && vWPos.y > 0.012) {
            vec3 tang = normalize(cross(vec3(0.0, 1.0, 0.0), n));
            float s = dot(vWPos, tang);
            // window cell ~4.2 m wide x 3.2 m tall
            vec2 cell = vec2(floor(s / 0.042), floor(vWPos.y / 0.032));
            float rnd = _hash(cell + floor(vWPos.xz * 3.0));
            vec2 f = vec2(fract(s / 0.042), fract(vWPos.y / 0.032));
            float win = step(0.18, f.x) * step(f.x, 0.72) *
                        step(0.22, f.y) * step(f.y, 0.78);
            float lit = step(rnd, ${litRatio.toFixed(2)}) * win;
            vec3 warm = vec3(1.0, 0.72, 0.42);
            vec3 cool = vec3(0.62, 0.78, 1.0);
            vec3 winCol = mix(warm, cool, step(0.5, fract(rnd * 7.31)));
            outgoingLight += winCol * lit * 0.55;
          }
        }
        #include <opaque_fragment>`);
  };
  return mat;
}

function buildingMat(color, litRatio, { vertexColors = false } = {}) {
  const mat = T.lambert
    ? new THREE.MeshLambertMaterial({ color, vertexColors })
    : new THREE.MeshBasicMaterial({ color, vertexColors });
  return T.windows ? windowize(mat, litRatio) : mat;
}

// dense boxes: white base × per-instance color; towers: white base × vertex color
// (MAT_LOW is shared with the InstancedMesh, whose BoxGeometry has no color
// attribute — so it must NOT set vertexColors; extruded low bucket gets its own)
const MAT_LOW = buildingMat(0xffffff, 0.16);
const MAT_LOW_VC = buildingMat(0xffffff, 0.16, { vertexColors: true });
const MAT_MID = buildingMat(0xffffff, 0.26, { vertexColors: true });
const MAT_TALL = buildingMat(0xffffff, 0.34, { vertexColors: true });

// deterministic per-building tint (stable across reloads)
const _tint = new THREE.Color();
function pickTint(lat, lon, palette) {
  const h = Math.abs(Math.sin(lat * 129.898 + lon * 78.233) * 43758.5453) % 1;
  return _tint.setHex(palette[(h * palette.length) | 0]);
}
const MAT_RIVER = new THREE.MeshBasicMaterial({
  color: T.river, transparent: true, opacity: T.riverOpacity, depthWrite: false,
});

const ROAD_STYLES = T.roads;

export async function buildCity(project, scale) {
  const group = new THREE.Group();
  const denseLoaded = await addDenseBuildings(group, project, scale);
  await Promise.all([
    addBuildings(group, project, scale, denseLoaded),
    addRiver(group, project),
    addRoads(group, project),
  ]);
  return group;
}

// 65k+ houses/shophouses/mid-rises as one InstancedMesh (single draw call).
// citydense.json = downtown core; cityring.json = outskirts along the rail
// corridors (optional, merged when present).
async function addDenseBuildings(group, project, scale) {
  let data;
  try {
    data = await fetchJSON('data/citydense.json');
  } catch {
    return false;
  }
  try {
    const ring = await fetchJSON('data/cityring.json');
    data.b = data.b.concat(ring.b);
  } catch { /* ring optional */ }
  let entries = data.b.filter(e => e[5] < SPLIT_H);
  // ?cap=N — limit instances; software GL gets an automatic cap
  let cap = parseInt(new URLSearchParams(location.search).get('cap'), 10);
  if (!(cap > 0) && SOFT_GL) cap = 12000;
  if (cap > 0 && entries.length > cap) {
    entries = entries.filter((_, i) => i % Math.ceil(entries.length / cap) === 0);
  }
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0); // pivot at base
  // window shader hangs software GL's instancing path — use plain there
  // (white base: per-instance tints carry the color)
  const mat = ((SOFT_GL || new URLSearchParams(location.search).has('plain')) && T.windows)
    ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : MAT_LOW;
  const mesh = new THREE.InstancedMesh(geo, mat, entries.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(),
        pos = new THREE.Vector3(), scl = new THREE.Vector3(),
        axis = new THREE.Vector3(0, 1, 0);
  entries.forEach(([lat, lon, w, d, rot, h], i) => {
    const v = project(lat, lon);
    pos.set(v.x, 0, v.y);
    // rot is CCW-from-east in ENU (x=east, y=north); scene is x=east,
    // z=-north, and three.js +Y rotation maps +X→(cosφ,0,-sinφ) — so the
    // ENU angle carries over directly
    q.setFromAxisAngle(axis, rot);
    scl.set(Math.max(w * scale, 0.02), exag(h) * scale, Math.max(d * scale, 0.02));
    m4.compose(pos, q, scl);
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, pickTint(lat, lon, h >= 25 ? T.paletteTall : T.paletteLow));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  group.add(mesh);
  console.info(`city: ${entries.length} dense buildings (instanced)`);
  return true;
}

async function addRoads(group, project) {
  if (new URLSearchParams(location.search).has('noroads')) return;
  let data;
  try {
    data = await fetchJSON('data/roads.json');
  } catch {
    console.warn('roads.json not found — road layer skipped');
    return;
  }
  for (const [key, style] of Object.entries(ROAD_STYLES)) {
    const ways = data[key];
    if (!ways || !ways.length) continue;
    const verts = [];
    for (const way of ways) {
      for (let i = 0; i + 1 < way.length; i++) {
        const a = project(way[i][0], way[i][1]);
        const b = project(way[i + 1][0], way[i + 1][1]);
        verts.push(a.x, style.y, a.y, b.x, style.y, b.y);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const mat = new THREE.LineBasicMaterial({
      color: style.color, transparent: true, opacity: style.opacity,
      blending: T.roadsAdditive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
    });
    group.add(new THREE.LineSegments(g, mat));
  }
  console.info('city: road layers added');
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

async function addBuildings(group, project, scale, denseLoaded) {
  let data;
  try {
    data = await fetchJSON('data/buildings.json');
  } catch {
    console.warn('buildings.json not found — city layer skipped');
    return;
  }

  // bucket by height so we can tint tall towers slightly lighter
  const buckets = { low: [], mid: [], tall: [] };

  for (const b of data.buildings) {
    if (!b.poly || b.poly.length < 3) continue;
    // when the dense instanced layer is present it owns everything under
    // SPLIT_H — only true tower footprints come from this file
    if (denseLoaded && b.h < SPLIT_H) continue;
    const shape = new THREE.Shape();
    b.poly.forEach(([lat, lon], i) => {
      const v = project(lat, lon);
      // rotateX(-90°) maps shape (x, y) → world (x, 0, -y); negate so the
      // city lands on the same north = -z plane as the transit layer
      if (i === 0) shape.moveTo(v.x, -v.y);
      else shape.lineTo(v.x, -v.y);
    });

    const h = Math.max(exag(b.h) * scale, 0.03);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
    // per-building tint baked as a uniform vertex color (merge-friendly)
    const tint = pickTint(b.poly[0][0], b.poly[0][1], T.paletteTall);
    const n = geo.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let ci = 0; ci < n; ci++) {
      colors[ci * 3] = tint.r; colors[ci * 3 + 1] = tint.g; colors[ci * 3 + 2] = tint.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // ExtrudeGeometry grows along +z; rotate so height is +y and z follows
    // our projected "north = -z" plane
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, 0);

    if (b.h >= 100) buckets.tall.push(geo);
    else if (b.h >= 35) buckets.mid.push(geo);
    else buckets.low.push(geo);
  }

  const pairs = [
    [buckets.low, MAT_LOW_VC],
    [buckets.mid, MAT_MID],
    [buckets.tall, MAT_TALL],
  ];
  let total = 0;
  for (const [geos, mat] of pairs) {
    if (!geos.length) continue;
    total += geos.length;
    // merge in chunks to keep peak memory sane on 20k+ geometries
    const CHUNK = 4000;
    for (let i = 0; i < geos.length; i += CHUNK) {
      const merged = mergeGeometries(geos.slice(i, i + CHUNK), false);
      for (const g of geos.slice(i, i + CHUNK)) g.dispose();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
  }
  console.info(`city: ${total} buildings in ${group.children.length} draw calls`);
}

async function addRiver(group, project) {
  let data;
  try {
    data = await fetchJSON('data/river.json');
  } catch {
    console.warn('river.json not found — river skipped');
    return;
  }

  if (data.polygons && data.polygons.length) {
    for (const ring of data.polygons) {
      if (ring.length < 3) continue;
      const shape = new THREE.Shape();
      ring.forEach(([lat, lon], i) => {
        const v = project(lat, lon);
        if (i === 0) shape.moveTo(v.x, v.y);
        else shape.lineTo(v.x, v.y);
      });
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, MAT_RIVER);
      mesh.position.y = 0.02;
      group.add(mesh);
    }
  } else if (data.centerline && data.centerline.length >= 2) {
    // fallback: extrude a ribbon along the centerline
    const pts = data.centerline.map(([lat, lon]) => {
      const v = project(lat, lon);
      return new THREE.Vector3(v.x, 0.02, v.y);
    });
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.1);
    const widthUnits = ((data.width_m || 350) / 100) / 2; // scene: 1u = 100 m
    const seg = Math.min(1200, pts.length * 4);
    const ribbon = new THREE.PlaneGeometry(1, 1, seg, 1);
    const pos = ribbon.attributes.position;
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      const c = curve.getPointAt(u);
      const tan = curve.getTangentAt(u);
      const normal = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
      const a = c.clone().addScaledVector(normal, widthUnits);
      const b = c.clone().addScaledVector(normal, -widthUnits);
      pos.setXYZ(i, a.x, a.y, a.z);
      pos.setXYZ(i + (seg + 1), b.x, b.y, b.z);
    }
    pos.needsUpdate = true;
    ribbon.computeVertexNormals();
    group.add(new THREE.Mesh(ribbon, MAT_RIVER));
  }
  console.info('city: river layer added');
}