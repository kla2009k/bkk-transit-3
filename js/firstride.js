// firstride.js — "ซ้อมนั่งครั้งแรก" (First Ride Simulator).
// A guided, gamified walkthrough of a complete first trip: buying a ticket,
// passing the gate, picking the right platform (quiz from real headsigns),
// riding each leg as a 3D flythrough, transferring, and tapping out (quiz
// from real exit data). Built for people who have never ridden the system —
// and for classrooms. No new data: everything reuses the live route result.
//
// Wiring: app.js calls initFirstRide(ctx) after boot; ctx exposes the small
// set of internals the simulator needs. Entry points: onboarding button,
// route-panel button, ?firstride URL param.

let ctx = null;
const state = { steps: [], i: 0, score: 0, quizzes: 0, firstTry: true };

// ── DOM ──────────────────────────────────────────────────────────────
let card, body, titleEl;

function buildDOM() {
  card = document.createElement('div');
  card.id = 'fr-card';
  card.hidden = true;
  card.innerHTML = `
    <div class="fr-head">
      <span id="fr-title">🎓 ซ้อมนั่งครั้งแรก</span>
      <span id="fr-progress" class="muted"></span>
      <button id="fr-x" title="ออก (Esc)">✕</button>
    </div>
    <div id="fr-body"></div>`;
  document.body.appendChild(card);
  body = card.querySelector('#fr-body');
  titleEl = card.querySelector('#fr-title');
  card.querySelector('#fr-x').addEventListener('click', stop);
}

// ── step builders ────────────────────────────────────────────────────
function buildSteps(result) {
  const steps = [{ type: 'intro' }, { type: 'ticket' }, { type: 'gate' }];
  result.legs.forEach((leg, i) => {
    steps.push({ type: 'platform', legIdx: i });
    steps.push({ type: 'ride', legIdx: i });
    if (i < result.legs.length - 1) steps.push({ type: 'transfer', legIdx: i });
  });
  steps.push({ type: 'exit' });
  steps.push({ type: 'badge' });
  return steps;
}

const codeOf = (node) => {
  const c = ctx.stationCodes()[node.id];
  return c ? `<b>${c}</b> ` : '';
};

function legInfo(legIdx) {
  const leg = ctx.getResult().legs[legIdx];
  const from = leg.nodes[0], to = leg.nodes[leg.nodes.length - 1];
  const lineSt = leg.line.stations;
  const goingUp = to.idx > from.idx;
  const correct = goingUp ? lineSt[lineSt.length - 1] : lineSt[0];
  const wrong = goingUp ? lineSt[0] : lineSt[lineSt.length - 1];
  return { leg, from, to, n: leg.nodes.length - 1, correct, wrong };
}

// ── renderers per step type ──────────────────────────────────────────
const RENDER = {
  intro() {
    const r = ctx.getResult();
    const a = r.legs[0].nodes[0].station;
    const lastLeg = r.legs[r.legs.length - 1];
    const b = lastLeg.nodes[lastLeg.nodes.length - 1].station;
    return {
      html: `<div class="fr-big">🚇 ภารกิจแรกของคุณ</div>
      <p>เดินทางจาก <b>${a.name_th}</b> ไป <b>${b.name_th}</b> ด้วยรถไฟฟ้า —
      เราจะพาทำ<b>ทีละขั้น</b> ตั้งแต่ซื้อตั๋วจนถึงทางออก เหมือนมีเพื่อนที่นั่งประจำพาไป</p>
      <p class="muted">ใช้เวลา ~3 นาที · มีควิซให้ลองตัดสินใจเองแบบไม่มีใครมอง 😌</p>`,
      next: 'เริ่มภารกิจ →',
    };
  },
  ticket() {
    return {
      html: `<div class="fr-big">🎫 ขั้นที่ 1 — ซื้อตั๋ว</div>
      <ul class="fr-list">
        <li>🖥️ <b>ตู้อัตโนมัติ:</b> จิ้มสถานีปลายทางบนจอ → หยอดเงิน → รับ<b>เหรียญ</b> (MRT) หรือ<b>บัตร</b> (BTS)</li>
        <li>💳 มีบัตรเดบิต/เครดิตแบบแตะ (EMV)? <b>แตะที่ประตูได้เลย</b> ไม่ต้องต่อคิวตู้</li>
        <li>🏷️ <b>สิทธิ 20 บาทตลอดสาย:</b> ลงทะเบียนแอป "ทางรัฐ" แล้วใช้บัตรที่ลงทะเบียน (ถึง 30 ก.ย. 2569)</li>
      </ul>
      <p class="muted">💡 เกร็ด: เหรียญ MRT ใช้<b>แตะ</b>ตอนเข้า และ<b>หยอดลงช่อง</b>ตอนออก — ไม่ต้องตกใจว่าเครื่องกินเหรียญ มันคือแบบนั้นเอง</p>`,
      next: 'ได้ตั๋วแล้ว →',
    };
  },
  gate() {
    return {
      html: `<div class="fr-big">🚧 ขั้นที่ 2 — ผ่านประตูอัตโนมัติ</div>
      <ul class="fr-list">
        <li>แตะเหรียญ/บัตรที่<b>เครื่องอ่านด้านขวา</b>ของช่อง → ประตูเปิด → เดินผ่านได้เลย</li>
        <li>ประตูปิดเร็ว — <b>คนละ 1 คนต่อการแตะ</b> อย่าเดินตามคนหน้าติดๆ</li>
        <li>ติดขัดตรงไหน มองหา<b>เจ้าหน้าที่เสื้อสายงาน</b>ข้างประตูได้เสมอ ไม่มีใครว่า</li>
      </ul>`,
      next: 'เข้ามาแล้ว →',
    };
  },
  platform(step) {
    const { leg, to, correct, wrong } = legInfo(step.legIdx);
    const under = ctx.isUnderground(leg.line);
    const opts = Math.random() < 0.5
      ? [correct, wrong] : [wrong, correct];
    return {
      html: `<div class="fr-big">⬆️ ขั้นที่ 3 — เลือกชานชาลา</div>
      <p>${under ? 'ลงบันไดเลื่อนสู่ชานชาลาใต้ดิน' : 'ขึ้นบันไดเลื่อนไปชานชาลา'} —
      ป้ายบอกทาง 2 ฝั่ง คุณจะไป <b>${codeOf(to)}${to.station.name_th}</b></p>
      <p><b>ต้องขึ้นขบวนฝั่งไหน?</b> <span class="muted">(ลองเลือกดู — ตอบผิดไม่มีใครเห็น)</span></p>
      <div class="fr-quiz">
        ${opts.map(t => `<button class="fr-opt" data-ok="${t === correct}">
          🚆 มุ่งหน้า ${t.name_th || t.name_en}</button>`).join('')}
      </div>
      <div id="fr-feedback"></div>`,
      quiz: {
        explainOk: `ใช่เลย! หลักจำ: <b>ดูชื่อสถานีปลายทางบนป้าย</b> — ฝั่งที่วิ่งผ่านสถานีของเราคือฝั่ง "มุ่งหน้า ${correct.name_th}"`,
        explainNo: `ยังไม่ใช่ — ฝั่งนั้นวิ่งไปทาง${wrong.name_th} ตรงข้ามกับที่เราจะไป ลองใหม่: สถานีของเราอยู่ทิศทางเดียวกับปลายทางฝั่งไหน?`,
      },
    };
  },
  ride(step) {
    const { to, n } = legInfo(step.legIdx);
    return {
      html: `<div class="fr-big">🚆 ขึ้นขบวนแล้ว!</div>
      <p>นั่งไป <b>${n} สถานี</b> แล้วลงที่ <b>${codeOf(to)}${to.station.name_th}</b>
      — ในรถจะมีเสียงประกาศ + จอบอกสถานีถัดไปทุกป้าย</p>
      <p class="muted">💡 เตรียมตัวลุกก่อนถึง 1 สถานี จะได้ไม่ต้องรีบ</p>
      <p class="muted">⚡ รู้ไหม? ตอนรถไฟเบรก มอเตอร์จะกลายเป็นเครื่องปั่นไฟ
      คืนพลังงานกลับเข้าระบบ (regenerative braking) — และสถานี MRT
      ยังใช้ไฟจาก solar rooftop ที่ รฟม. ติดตั้งเองอีก 17 MWp 🌱</p>`,
      next: '🎬 ออกเดินทาง (ดูวิวจริง)',
      ride: step.legIdx,
    };
  },
  transfer(step) {
    const r = ctx.getResult();
    const cur = legInfo(step.legIdx);
    const nextLeg = r.legs[step.legIdx + 1];
    const walkM = ctx.walkMeters(cur.to.station, nextLeg.nodes[0].station);
    const crossOperator = cur.leg.line.id.startsWith('bts') !== nextLeg.line.id.startsWith('bts');
    return {
      html: `<div class="fr-big">🔄 เปลี่ยนสาย</div>
      <p>ลงแล้ว! เดินตามป้ายสี<b>${(nextLeg.line.name_th || '').replace('รถไฟฟ้า', '')}</b>
      ประมาณ <b>${walkM} เมตร</b></p>
      <ul class="fr-list">
        ${crossOperator
          ? '<li>⚠️ ข้ามระบบ (BTS↔MRT): ต้อง<b>ออกประตู</b>แล้ว<b>แตะเข้าใหม่</b>อีกฝั่ง</li>'
          : '<li>อยู่ในระบบเดียวกัน — เดินต่อได้ไม่ต้องออกประตู</li>'}
        <li>🏷️ ใช้สิทธิ 20฿: แตะเข้าสายถัดไป<b>ภายใน 30 นาที</b></li>
      </ul>`,
      next: 'ถึงชานชาลาสายถัดไป →',
    };
  },
  exit() {
    const r = ctx.getResult();
    const lastLeg = r.legs[r.legs.length - 1];
    const dest = lastLeg.nodes[lastLeg.nodes.length - 1];
    const exits = ctx.exitsFor(dest.id);
    const named = exits.filter(e => e.ref && e.name);
    let quizHTML = '', quiz = null;
    if (named.length >= 2) {
      const target = named[0];
      const opts = named.slice(0, 3).sort(() => Math.random() - 0.5);
      quizHTML = `<p><b>ควิซสุดท้าย:</b> จะไป <b>${target.name}</b> ใช้ทางออกไหน?</p>
        <div class="fr-quiz">${opts.map(e =>
          `<button class="fr-opt" data-ok="${e.ref === target.ref}">🚪 ทางออก ${e.ref}</button>`).join('')}</div>
        <div id="fr-feedback"></div>`;
      quiz = {
        explainOk: `ถูกต้อง! ป้ายในสถานีจะมีรายชื่อสถานที่ต่อท้ายเลขทางออกแบบนี้เลย`,
        explainNo: `ยังไม่ใช่ — เช็คป้ายรายชื่อสถานที่ข้างเลขทางออกอีกที`,
      };
    } else {
      quizHTML = exits.length
        ? `<p class="muted">สถานีนี้มี ${exits.length} ทางออก — ดูป้ายรายชื่อสถานที่เหนือบันไดก่อนขึ้น</p>`
        : `<p class="muted">ยังไม่มีข้อมูลทางออกของสถานีนี้ใน OSM — ดูป้ายในสถานีจริงได้เลย</p>`;
    }
    return {
      html: `<div class="fr-big">🏁 ขั้นสุดท้าย — แตะออก</div>
      <p>MRT: <b>หยอดเหรียญลงช่อง</b>ที่ประตูขาออก · BTS: สอดบัตร/แตะเหมือนขาเข้า</p>
      ${quizHTML}`,
      next: quiz ? null : 'ออกจากสถานี →',
      quiz,
    };
  },
  badge() {
    const pct = state.quizzes ? Math.round((state.score / state.quizzes) * 100) : 100;
    return {
      html: `<div class="fr-badge">🎖️</div>
      <div class="fr-big" style="text-align:center">คุณพร้อมเดินทางจริงแล้ว!</div>
      <p style="text-align:center">ตอบควิซถูกครั้งแรก <b>${state.score}/${state.quizzes}</b> (${pct}%)</p>
      <p class="muted" style="text-align:center">เที่ยวจริงต่างจากนี้แค่อย่างเดียว: คนเยอะกว่า 😄<br>
      แชร์โหมดซ้อมนี้ให้คนที่ยังไม่กล้านั่งได้เลย</p>`,
      next: '✅ จบภารกิจ',
      final: true,
    };
  },
};

// ── engine ───────────────────────────────────────────────────────────
function render() {
  const step = state.steps[state.i];
  if (!step) return stop();
  const r = RENDER[step.type](step);
  card.querySelector('#fr-progress').textContent = `${state.i + 1}/${state.steps.length}`;
  body.innerHTML = r.html +
    (r.next ? `<button class="fr-next" id="fr-next">${r.next}</button>` : '');

  state.firstTry = true;
  if (r.quiz) {
    body.querySelectorAll('.fr-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const ok = btn.dataset.ok === 'true';
        const fb = body.querySelector('#fr-feedback');
        if (ok) {
          state.quizzes++;
          if (state.firstTry) state.score++;
          btn.classList.add('ok');
          body.querySelectorAll('.fr-opt').forEach(b => { b.disabled = true; });
          fb.innerHTML = `<div class="fr-fb ok">✅ ${r.quiz.explainOk}</div>
            <button class="fr-next" id="fr-next">ไปต่อ →</button>`;
          fb.querySelector('#fr-next').addEventListener('click', advance);
        } else {
          state.firstTry = false;
          btn.classList.add('no');
          btn.disabled = true;
          fb.innerHTML = `<div class="fr-fb no">❌ ${r.quiz.explainNo}</div>`;
        }
      });
    });
  }
  const nextBtn = body.querySelector('#fr-next');
  if (nextBtn && !r.quiz) {
    nextBtn.addEventListener('click', () => {
      if (r.ride != null) {
        card.hidden = true;
        const started = ctx.rideLeg(r.ride, () => { card.hidden = false; advance(); },
          `🚆 นั่งไป ${legInfo(r.ride).n} สถานี → ลงที่ ${legInfo(r.ride).to.station.name_th}`);
        if (!started) advance();
      } else if (r.final) {
        stop();
      } else {
        advance();
      }
    });
  } else if (nextBtn && r.quiz) {
    // exit-step case: quiz present AND a next button (no-quiz fallback handled above)
    nextBtn.addEventListener('click', advance);
  }
}

function advance() { state.i++; render(); }

export function startFirstRide() {
  if (!ctx) return;
  let result = ctx.getResult();
  if (!result) {
    if (!ctx.planRoute(...ctx.defaultMission)) return;
    result = ctx.getResult();
    if (!result) return;
  }
  Object.assign(state, { steps: buildSteps(result), i: 0, score: 0, quizzes: 0 });
  card.hidden = false;
  render();
}

export function stop() {
  card.hidden = true;
}

export function isActive() { return !card.hidden; }

export function initFirstRide(context) {
  ctx = context;
  buildDOM();
  return { startFirstRide, stop, isActive };
}