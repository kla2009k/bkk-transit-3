// ridership.js — monthly passenger volumes (DRT open data, Mar 2026).
// Line-level bars in a panel + 3D glow columns at ARL stations (the only
// line DRT publishes per-station figures for).
import * as THREE from 'three';
import { DAY } from './theme.js';

const LINE_COLORS = {
  'BTS (สายสุขุมวิท+สีลม)': '#79B928',
  'MRT (สายสีน้ำเงิน+สีม่วง)': '#1E4F9C',
  'สายสีชมพู (Pink Line)': '#E85298',
  'สายสีเหลือง (Yellow Line)': '#F5B21B',
  'สายสีแดง (SRT Red Line)': '#D31245',
  'แอร์พอร์ต เรล ลิงก์ (ARL)': '#ED1C24',
  'SRT (รถไฟทางไกล/ชานเมือง)': '#6E1E22',
};
const SHORT = {
  'BTS (สายสุขุมวิท+สีลม)': 'BTS',
  'MRT (สายสีน้ำเงิน+สีม่วง)': 'MRT',
  'สายสีชมพู (Pink Line)': 'สายสีชมพู',
  'สายสีเหลือง (Yellow Line)': 'สายสีเหลือง',
  'สายสีแดง (SRT Red Line)': 'สายสีแดง',
  'แอร์พอร์ต เรล ลิงก์ (ARL)': 'ARL',
  'SRT (รถไฟทางไกล/ชานเมือง)': 'SRT ชานเมือง',
};

const fmtM = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + ' ล้าน' : Math.round(n / 1000) + 'k';

export async function initRidership({ scene, project, transit }) {
  let data;
  try {
    const res = await fetch('data/ridership.json');
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch {
    console.warn('ridership.json not found — stats disabled');
    return null;
  }

  // ── panel bars ──
  const panel = document.getElementById('rider-panel');
  const entries = Object.entries(data.lines)
    .sort((a, b) => b[1].total - a[1].total);
  const max = entries[0][1].total;
  panel.innerHTML =
    `<div class="rd-head">ผู้โดยสารต่อเดือน · ${data.updated.split(' ')[0]} 2569</div>` +
    entries.map(([name, v]) => {
      const c = LINE_COLORS[name] ?? '#888';
      const w = Math.max(3, (v.total / max) * 100);
      return `<div class="rd-row" title="${name}">
        <span class="rd-nm">${SHORT[name] ?? name}</span>
        <span class="rd-track"><span class="rd-bar" style="width:${w}%;background:${c}"></span></span>
        <span class="rd-val">${fmtM(v.total)}</span>
      </div>`;
    }).join('') +
    `<div class="rd-note">ที่มา: Open Data กรมการขนส่งทางราง · แท่ง 3D บนแผนที่ = ผู้โดยสารรายสถานี ARL (สายเดียวที่เปิดข้อมูลรายสถานี)</div>`;

  // ── ARL 3D columns ──
  const group = new THREE.Group();
  group.visible = false;
  const arl = data.lines['แอร์พอร์ต เรล ลิงก์ (ARL)'];
  const arlLine = transit.lines.find(l => l.id === 'arl');
  if (arl?.stations && arlLine) {
    const maxSt = Math.max(...Object.values(arl.stations));
    for (const [name, count] of Object.entries(arl.stations)) {
      const st = arlLine.stations.find(s =>
        (s.name_th || '').includes(name) || name.includes(s.name_th || '~'));
      if (!st) continue;
      const v = project(st.lat, st.lon);
      const h = 1.5 + (count / maxSt) * 9;
      // additive glow reads great on the night scene but vanishes on the
      // pale day ground — day gets solid bars with a dark cap instead
      const geo = new THREE.CylinderGeometry(0.55, 0.75, h, 14, 1, false);
      const mat = DAY
        ? new THREE.MeshBasicMaterial({ color: 0xe2543a, transparent: true, opacity: 0.88 })
        : new THREE.MeshBasicMaterial({
            color: 0xed4b2a, transparent: true, opacity: 0.5,
            blending: THREE.AdditiveBlending, depthWrite: false,
          });
      const col = new THREE.Mesh(geo, mat);
      col.position.set(v.x, h / 2 + 0.7, v.y);
      group.add(col);
      const core = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, h, 8),
        new THREE.MeshBasicMaterial({ color: DAY ? 0x8c2f1b : 0xffc9a3 }));
      core.position.copy(col.position);
      group.add(core);
    }
  }
  scene.add(group);

  // ── toggle ──
  const btn = document.getElementById('rider-btn');
  const setOn = (on) => {
    panel.hidden = !on;
    group.visible = on;
    btn.classList.toggle('on', on);
  };
  btn.addEventListener('click', () => setOn(panel.hidden));
  if (new URLSearchParams(location.search).has('stats')) setOn(true);

  return { group };
}