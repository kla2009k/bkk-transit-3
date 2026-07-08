// pages.js — app-style tab pages (บริการ / ข่าวสาร / เพิ่มเติม) layered over
// the 3D map, à la THE SKYTRAINs' bottom-tab structure — but every card here
// is real: live headway/first-last tables come from service.js data, news is
// our verified 20฿-policy card + links to official operator channels. No mock
// promos, no fake feeds.

let ctx = null;
let pageEl, tabbar;

const OFFICIAL = [
  ['🟢 BTS (สุขุมวิท/สีลม/ทอง)', 'https://www.bts.co.th'],
  ['🔵 MRT น้ำเงิน/ม่วง (BEM)', 'https://metro.bemplc.co.th'],
  ['🟡 สายสีเหลือง/ชมพู', 'https://www.mrta.co.th'],
  ['🏛️ รฟม. (MRTA)', 'https://www.mrta.co.th'],
  ['🔴 สายสีแดง (SRTET)', 'https://www.srtet.co.th'],
  ['📊 Open Data กรมการขนส่งทางราง', 'https://drt.gdcatalog.go.th'],
];

function esc(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function lineName(line) {
  return esc((line.name_th || line.name_en || '').replace('รถไฟฟ้า', '').trim());
}

function farePartLabel(group) {
  return ({
    bts: 'BTS',
    bts_gold: 'สายสีทอง',
    mrt: 'MRT น้ำเงิน/ม่วง',
    yellow: 'สายสีเหลือง',
    pink: 'สายสีชมพู',
    arl: 'ARL',
    srt: 'สายสีแดง',
  }[group] ?? group);
}

function routeLabel(summary) {
  if (!summary) return 'ยังไม่ได้เลือกเส้นทาง';
  return `${esc(summary.from)} → ${esc(summary.to)}`;
}

const PRESET_TRIPS = [
  ['สยาม', 'ท่าพระ', 'โชว์เปลี่ยน BTS → MRT และเทียบสิทธิ 20 บาท'],
  ['เตาปูน', 'ศูนย์วัฒนธรรมฯ', 'เส้นทาง MRTA ใต้ดิน อ่านง่ายสำหรับกรรมการ'],
  ['ห้าแยกลาดพร้าว', 'สำโรง', 'ตัวอย่างข้ามระบบไปสายสีเหลือง/เขียว'],
  ['บางซื่อ', 'มีนบุรี', 'โชว์การวางแผนไปโซนตะวันออกและสายใหม่'],
];

const DATA_BADGES = [
  ['Official/Open Data', 'ค่าโดยสารคู่สถานีและผู้โดยสารจาก Open Data กรมการขนส่งทางราง'],
  ['Open Map', 'เส้นทาง สถานี อาคาร และทางออกจาก OpenStreetMap'],
  ['Estimated', 'เวลาเดินรถ ความหนาแน่น และ CO₂ เป็นค่าประมาณ มี label ชัดเจน'],
  ['Local Only', 'ประวัติ route และ CO₂ สะสมอยู่ใน browser ของผู้ใช้เท่านั้น'],
  ['Future AI Model', 'crowd prediction เป็น roadmap ต้องใช้ข้อมูลทางการ/นิรนาม ไม่ใช่ข้อมูลสดใน prototype'],
];

const CROWD_SCENARIOS = [
  ['สุขุมวิท', '08:10', 'สูง', 'จุดเปลี่ยนสาย + ช่วงเข้างาน + สถานี office district'],
  ['ศูนย์วัฒนธรรมฯ', '18:25', 'สูง', 'ช่วงเลิกงาน + เชื่อมต่อกิจกรรม/ห้าง/เส้นทางหลัก'],
  ['เตาปูน', '17:45', 'กลาง', 'จุดเชื่อมสีน้ำเงิน/ม่วง แต่กระจายผู้โดยสารได้หลายทิศทาง'],
  ['บางซื่อ', '07:30', 'กลาง', 'เชื่อมระบบรางหลายรูปแบบ ต้องเผื่อเวลาต่อระบบ'],
  ['ท่าพระ', '10:30', 'ต่ำ', 'นอก rush hour เหมาะกับผู้ใช้ใหม่หรือผู้สูงอายุ'],
];

const AI_ROADMAP = [
  ['Phase 1', 'Pre-trip simulator', 'แผนที่ 3D + route planner + ค่าโดยสาร + First Ride ใช้งานได้ใน prototype ปัจจุบัน'],
  ['Phase 2', 'Official data integration', 'ต่อข้อมูล incident, lift/escalator, facility, timetable และประกาศจากแหล่งทางการ'],
  ['Phase 3', 'AI crowd prediction', 'คาดการณ์คนหนาแน่นรายสถานี/ช่วงเวลา จากเวลา วัน สถานี จุดเปลี่ยนสาย event และสภาพอากาศ'],
  ['Phase 4', 'Inclusive mobility', 'แนะนำเส้นทางที่เหมาะกับผู้สูงอายุ ผู้ใช้ wheelchair คนมีสัมภาระ และผู้โดยสารที่ต้องการเลี่ยงความแออัด'],
  ['Phase 5', 'Operator intelligence', 'ช่วย MRTA วางกำลังเจ้าหน้าที่ จัดการ crowd surge และปรับพลังงานตาม demand'],
];

const PERSONAS = [
  ['เด็กต่างจังหวัด', 'เข้ากรุงเทพฯ ครั้งแรกเพื่อสอบ/แข่ง/เรียนพิเศษ', 'อยากรู้ว่าต้องขึ้นสายไหน เปลี่ยนตรงไหน ค่าโดยสารเท่าไหร่ และจะหลงไหม', 'First Ride + route planner + ค่าโดยสาร + QR เปิดบนมือถือ'],
  ['ผู้สูงอายุ', 'เดินทางไปโรงพยาบาลหรือหน่วยงานรัฐ', 'ไม่อยากเดินไกล ไม่อยากเจอสถานีแน่น และต้องการคำอธิบายชัด', 'ตัวหนังสือใหญ่ + accessibility layer + AI crowd roadmap'],
  ['นักท่องเที่ยว', 'รู้ชื่อสถานที่แต่ไม่รู้ระบบรถไฟฟ้าไทย', 'ต้องการเส้นทางง่าย บัตรที่ใช้ได้ และเวลาเปิด-ปิด', 'station guide + card guide + official links'],
  ['ผู้ใช้ wheelchair', 'ต้องการ route ที่มีลิฟต์และหลีกเลี่ยงจุดแออัด', 'ข้อมูล accessibility กระจายและไม่ครบทุกแอป', 'accessibility layer + future official facility dataset'],
  ['คนไป event', 'ไปคอนเสิร์ต งานประชุม หรือสนามกีฬา', 'กลัวรถแน่นตอนเลิกงาน/เลิก event และไม่รู้ควรกลับทางไหน', 'AI crowd prediction + route goals + incident roadmap'],
];

const JOURNEY = [
  ['ก่อนออกจากบ้าน', 'ค้นต้นทาง-ปลายทาง ดูสายที่ต้องขึ้น ค่าโดยสาร 20 บาท vs ปกติ เวลาเดินรถ และ crowd concept'],
  ['ถึงสถานี', 'อ่านคู่มือใช้สถานี เลือกบัตร/ตั๋ว ดูชานชาลา ทิศทางปลายทาง และข้อควรระวัง'],
  ['ระหว่างเดินทาง', 'เห็นจุดเปลี่ยนสาย สถานีที่ต้องผ่าน และใช้ First Ride mission เพื่อซ้อมขั้นตอนจริง'],
  ['ถึงปลายทาง', 'ดูทางออก/ข้อมูล OSM ติดต่อของหายหรือช่องทางทางการ และประเมิน CO₂ ที่ช่วยลดได้'],
];

const JUDGE_QA = [
  ['ต่างจาก Google Maps ยังไง?', 'Google Maps เก่งเรื่องเส้นทางทั่วไป แต่ Bangkok Transit 3D เน้นผู้โดยสารใหม่: ซ้อมขึ้นครั้งแรก อธิบายบัตร/ค่าโดยสาร/การเปลี่ยนสาย และแสดง data trust สำหรับระบบรางโดยเฉพาะ'],
  ['ข้อมูล real-time ไหม?', 'ยังไม่ใช่ทั้งหมด เราแยกชัดว่าอะไรคือ official/open data, estimated, local only และ future AI model ข้อมูลฉุกเฉิน/incident ต้องต่อ feed ทางการเท่านั้น'],
  ['AI crowd prediction ทำจริงยังไง?', 'เริ่มจาก historical average แล้วใช้ ML เช่น Random Forest/Gradient Boosting จากเวลา วัน สถานี จุดเปลี่ยนสาย event weather และ tap-in/tap-out แบบนิรนาม'],
  ['เรื่อง privacy ทำยังไง?', 'prototype นี้เก็บประวัติแค่ใน browser ส่วนเวอร์ชัน AI จริงควรใช้ข้อมูลรวม/นิรนาม ไม่เก็บใบหน้า ไม่เก็บข้อมูลส่วนบุคคล และให้หน่วยงานควบคุม data governance'],
  ['ถ้า MRTA จะใช้จริงต้องต่ออะไร?', 'ควรต่อ timetable/service API, fare API, incident feed, facility/accessibility dataset, ridership/crowd aggregate และ official announcement channel'],
];

const ROUTE_GOALS = [
  ['เร็วที่สุด', 'เน้นเวลารวมต่ำสุดและเปลี่ยนสายน้อย ใช้ได้กับคนที่คุ้นระบบแล้ว'],
  ['คนน้อยที่สุด', 'ใช้ AI crowd prediction เพื่อเลี่ยงสถานี/ช่วงเวลาที่คาดว่าแออัด'],
  ['เดินน้อยที่สุด', 'ให้คะแนน transfer และทางออกที่ลดระยะเดิน เหมาะกับผู้สูงอายุหรือคนมีสัมภาระ'],
  ['เหมาะกับ wheelchair', 'เลือกสถานี/ทางออกที่มีลิฟต์และหลีกเลี่ยงบันไดเมื่อมีข้อมูลทางการครบ'],
  ['ถูกที่สุด', 'เปรียบเทียบราคาปกติ สิทธิ 20 บาท และข้อจำกัดการแตะบัตรข้ามระบบ'],
];

const DESTINATIONS = [
  ['โรงพยาบาล', 'ศิริราช · จุฬาฯ · รามาธิบดี · ราชวิถี', 'ผู้ใช้จำนวนมากรู้ชื่อโรงพยาบาล แต่ไม่รู้สถานี/ทางออกที่เหมาะ'],
  ['สถานศึกษา', 'จุฬาฯ · ธรรมศาสตร์ท่าพระจันทร์ · เกษตร · มศว', 'เหมาะกับนักเรียนต่างจังหวัดที่เข้ามาสอบหรือเรียน'],
  ['ศูนย์ประชุม/งานใหญ่', 'ศูนย์ประชุมสิริกิติ์ · อิมแพ็ค · ไบเทค', 'เชื่อมกับ crowd prediction เพราะ event ทำให้สถานีแน่นเป็นช่วงเวลา'],
  ['จุดต่อเมือง', 'บางซื่อ · หมอชิต · มักกะสัน · พญาไท', 'ช่วยวางแผนต่อรถไฟ รถตู้ รถบัส และ airport link'],
];

const SAFETY_GUIDES = [
  ['หลงในสถานี', 'หยุดดูป้ายปลายทางและถามเจ้าหน้าที่ อย่าเดินย้อนทางในพื้นที่ห้ามเข้า'],
  ['แตะบัตรผิด/เงินไม่พอ', 'ไปที่ห้องจำหน่ายบัตรหรือเจ้าหน้าที่ประจำประตู อย่าฝืนผ่านประตู'],
  ['ขึ้นผิดฝั่ง', 'ลงสถานีถัดไปแล้วเปลี่ยนฝั่งตามป้าย ใช้ route card เช็กปลายทางก่อนขึ้นใหม่'],
  ['ของหาย', 'จำสาย สถานี เวลา และทิศทางขบวน แล้วติดต่อเจ้าหน้าที่หรือช่องทางทางการ'],
  ['เหตุฉุกเฉิน', 'ใช้ปุ่มฉุกเฉิน/แจ้งเจ้าหน้าที่ ทำตามประกาศ และหลีกเลี่ยงการถ่ายหรือขวางทางอพยพ'],
];

// ── page renderers ───────────────────────────────────────────────────
function pageServices() {
  return `
  <div class="pg-title">บริการ</div>
  <div class="pg-hero">
    <div><b>วางแผนเดินทางแบบใช้ได้จริง</b><br><span>เวลาเดินรถ · ค่าโดยสาร · ซ้อมเดินทาง · ข้อมูลสถานี</span></div>
    <button class="pg-mini" data-act="fares">ค้นเส้นทาง</button>
  </div>
  <div class="pg-sec">ข้อมูลบัตรโดยสาร</div>
  <div class="pg-grid">
    <button class="pg-card" data-act="cards">🎫<span>บัตรโดยสาร<br>มีอะไรบ้าง</span></button>
    <button class="pg-card" data-act="fare20">🏷️<span>สิทธิ 20 บาท<br>ตลอดสาย</span></button>
    <button class="pg-card" data-act="fareCompare">⚖️<span>เทียบราคา<br>20฿ vs ปกติ</span></button>
  </div>
  <div class="pg-sec">ข้อมูลให้บริการ</div>
  <div class="pg-grid">
    <button class="pg-card" data-act="fares">💰<span>ค้นเส้นทาง<br>+ ค่าโดยสาร</span></button>
    <button class="pg-card" data-act="presetTrips">⭐<span>เส้นทาง<br>ตัวอย่าง</span></button>
    <button class="pg-card" data-act="times">🕐<span>เวลา &amp;<br>ความถี่รถ</span></button>
    <button class="pg-card" data-act="firstRideHub">🎓<span>ซ้อมนั่ง<br>ครั้งแรก</span></button>
    <button class="pg-card" data-act="stats">📊<span>ผู้โดยสาร<br>รายเดือน</span></button>
    <button class="pg-card" data-act="exits">🚪<span>ทางออก &amp;<br>วีลแชร์</span></button>
    <button class="pg-card" data-act="faq">❓<span>คำถาม<br>ที่พบบ่อย</span></button>
    <button class="pg-card" data-act="stationGuide">🧭<span>คู่มือ<br>ใช้สถานี</span></button>
    <button class="pg-card" data-act="rules">🤝<span>มารยาท &amp;<br>ข้อควรระวัง</span></button>
    <button class="pg-card" data-act="mrtaMode">🏛️<span>MRTA<br>Mode</span></button>
    <button class="pg-card" data-act="accessibility">♿<span>Accessibility<br>Layer</span></button>
    <button class="pg-card" data-act="aiMobility">🤖<span>AI Crowd<br>Prediction</span></button>
    <button class="pg-card" data-act="routeGoals">🎯<span>Route Goals<br>ตามเป้าหมาย</span></button>
    <button class="pg-card" data-act="destinations">🏥<span>สถานีปลายทาง<br>สำคัญ</span></button>
    <button class="pg-card" data-act="safetyGuide">🛟<span>Safety<br>Guide</span></button>
  </div>`;
}

function pageTimes() {
  const rows = ctx.lines.map(l => {
    const [first, last] = ctx.serviceHours(l.id);
    const hw = (h) => { const v = ctx.headwayFor(l.id, h); return v == null ? '—' : v; };
    const closed = hw(2) === '—';
    return `<tr>
      <td><span class="pg-dot" style="background:${esc(l.color)}"></span>${lineName(l)}</td>
      <td>~${first}</td><td>~${last}</td>
      <td>${hw(6)}</td><td>${hw(8)}</td><td>${hw(13)}</td><td>${hw(18)}</td><td>${hw(23)}</td>
      <td><span class="pg-tag ${closed ? 'warn' : 'ok'}">${closed ? 'มีช่วงปิด' : 'เปิด'}</span></td></tr>`;
  }).join('');
  const cards = ctx.lines.map(l => {
    const [first, last] = ctx.serviceHours(l.id);
    const rush = ctx.headwayFor(l.id, 8);
    const midday = ctx.headwayFor(l.id, 13);
    const late = ctx.headwayFor(l.id, 23);
    return `<div class="pg-linecard">
      <div class="pg-linehead"><span class="pg-dot" style="background:${esc(l.color)}"></span><b>${lineName(l)}</b></div>
      <div class="pg-metrics">
        <span><b>~${first}</b><small>รถแรก</small></span>
        <span><b>~${last}</b><small>รถสุดท้าย</small></span>
        <span><b>${rush ?? '—'} นาที</b><small>เร่งด่วน</small></span>
      </div>
      <div class="pg-note">กลางวัน ~${midday ?? '—'} นาที · ดึก ~${late ?? '—'} นาที · วันหยุด/เหตุพิเศษอาจเปลี่ยน</div>
    </div>`;
  }).join('');
  return `
  <button class="pg-back" data-act="services">← บริการ</button>
  <div class="pg-title">เวลา &amp; ความถี่การเดินรถ</div>
  <div class="pg-hero">
    <div><b>ตารางเวลาแบบใช้งานเร็ว</b><br><span>ความถี่ = รถมาทุกกี่นาที โดยประมาณจากข้อมูลบริการที่แอปใช้จำลองขบวนรถ</span></div>
  </div>
  <div class="pg-sec">สรุปรายสาย</div>
  <div class="pg-list pg-linegrid">${cards}</div>
  <div class="pg-sec">ตารางรวม</div>
  <div class="pg-tablewrap"><table class="pg-table">
    <tr><th>สาย</th><th>รถแรก</th><th>รถสุดท้าย</th><th>เช้าตรู่</th><th>เร่งด่วน</th><th>กลางวัน</th><th>เย็น</th><th>ดึก</th><th>สถานะ</th></tr>
    ${rows}
  </table></div>
  <div class="pg-note">ตารางนี้เป็นข้อมูลระดับสาย ไม่ใช่ timetable รายสถานีจริง รถเที่ยวแรก/สุดท้ายอาจต่างตามสถานีและปลายทาง ควรเช็คผู้ให้บริการก่อนเดินทางสำคัญ</div>`;
}

function pageCards() {
  return `
  <button class="pg-back" data-act="services">← บริการ</button>
  <div class="pg-title">บัตรโดยสารมีอะไรบ้าง</div>
  <div class="pg-list">
    <div class="pg-item"><b>🎟️ ตั๋ว/เหรียญเที่ยวเดียว</b><br>ซื้อจากตู้อัตโนมัติทุกสถานี เลือกปลายทาง → จ่ายเงิน → BTS ได้บัตรแผ่น, MRT ได้เหรียญกลม (แตะขาเข้า <b>หยอดลงช่อง</b>ขาออก)</div>
    <div class="pg-item"><b>🐰 บัตร Rabbit</b><br>บัตรเติมเงินของฝั่ง BTS ใช้กับสายสุขุมวิท/สีลม/ทอง และร้านค้าที่ร่วม — เหมาะคนใช้ BTS ประจำ</div>
    <div class="pg-item"><b>🚇 บัตร MRT</b><br>บัตรเติมเงินของฝั่ง MRT (น้ำเงิน/ม่วง) ออกโดย BEM</div>
    <div class="pg-item"><b>💳 บัตร EMV (เดบิต/เครดิตแบบแตะ)</b><br>บัตรธนาคารที่มีสัญลักษณ์ contactless แตะที่ประตูได้เลยแทบทุกสาย ไม่ต้องซื้อตั๋ว — สะดวกสุดสำหรับผู้มาเยือน</div>
    <div class="pg-item"><b>🏷️ สิทธิ 20 บาทตลอดสาย</b><br>ลงทะเบียนบัตรผ่านแอป "ทางรัฐ" แล้วเดินทางข้ามสายที่ร่วมโครงการในราคา 20฿/เที่ยว (ดูเงื่อนไขในการ์ดถัดไป)</div>
  </div>
  <div class="pg-note">เงื่อนไข/ราคาบัตรแต่ละชนิดเปลี่ยนได้ — เช็คเว็บทางการก่อนซื้อ</div>`;
}

function pageFare20() {
  return `
  <button class="pg-back" data-act="services">← บริการ</button>
  <div class="pg-title">สิทธิ 20 บาทตลอดสาย</div>
  <div class="pg-list">
    <div class="pg-item">✅ <b>ครอบคลุม 13 เส้นทาง 194 สถานี</b> — เขียว ทอง น้ำเงิน ม่วง เหลือง ชมพู แดง ARL</div>
    <div class="pg-item">📝 <b>ลงทะเบียนก่อนใช้</b> ผ่านแอป "ทางรัฐ" ผูกบัตร EMV / Rabbit / บัตร MRT ที่จะใช้เดินทาง</div>
    <div class="pg-item">⏱️ <b>เงื่อนไขเวลา</b> — เปลี่ยนสายแตะเข้าใหม่ภายใน <b>30 นาที</b> · จบทริปภายใน <b>180 นาที</b></div>
    <div class="pg-item">💳 <b>ข้าม BTS↔MRT ใช้คนละบัตรตามระบบ</b> — ต้องออกประตูแล้วแตะเข้าใหม่</div>
    <div class="pg-item">📅 <b>ใช้ได้ถึง 30 กันยายน 2569</b> (ตามมติปัจจุบัน — ติดตามการต่ออายุจากภาครัฐ)</div>
  </div>
  <button class="pg-cta" data-act="fareCompare">เทียบกับราคาปกติของเส้นทางคุณ →</button>`;
}

function pageFareCompare() {
  const s = ctx.fareSummary?.();
  if (!s) {
    return `
    <button class="pg-back" data-act="services">← บริการ</button>
    <div class="pg-title">เทียบราคา 20฿ vs ปกติ</div>
    <div class="pg-empty">
      <b>เลือกเส้นทางก่อน แล้วหน้านี้จะคำนวณให้ทันที</b>
      <span>ตัวอย่าง: สยาม → ท่าพระ หรือ เตาปูน → ศูนย์วัฒนธรรมฯ</span>
      <button class="pg-cta" data-act="fares">ไปเลือกต้นทาง-ปลายทาง</button>
    </div>
    <div class="pg-list">
      <div class="pg-item"><b>สิ่งที่จะแสดงหลังเลือก route</b><br>ราคาปกติจากตาราง DRT เมื่อมีข้อมูล · ราคา 20 บาทเมื่อเข้าเงื่อนไข · ส่วนต่างที่ประหยัด · แยกตั๋วตามระบบประตู</div>
      <div class="pg-item"><b>เงื่อนไขสำคัญ</b><br>ลงทะเบียนผ่านแอปทางรัฐ เปลี่ยนสายภายใน 30 นาที และจบทริปภายใน 180 นาที</div>
    </div>`;
  }
  const saving = s.flat.eligible ? Math.max(0, s.normal.total - 20) : 0;
  const parts = s.normal.parts.map(p =>
    `<div class="pg-farepart"><span>${farePartLabel(p.group)}${p.exact ? '' : ' (ประมาณ)'}</span><b>${p.fare}฿</b></div>`).join('');
  return `
  <button class="pg-back" data-act="services">← บริการ</button>
  <div class="pg-title">เทียบราคา 20฿ vs ปกติ</div>
  <div class="pg-hero">
    <div><b>${routeLabel(s)}</b><br><span>~${s.minutes} นาที · ${(s.km).toFixed(1)} กม. · ${s.stationCount} สถานี · เปลี่ยน ${s.transfers} ครั้ง</span></div>
  </div>
  <div class="pg-compare">
    <div><span>สิทธิ 20 บาท</span><b>${s.flat.eligible ? '20฿' : 'ไม่เข้าเงื่อนไข'}</b><small>${s.flat.eligible ? 'จบทริปใน 180 นาที' : 'เวลาเดินทางเกินเงื่อนไข'}</small></div>
    <div><span>ราคาปกติ${s.normal.allExact ? '' : ' (บางช่วงประมาณ)'}</span><b>${s.normal.allExact ? '' : '~'}${s.normal.total}฿</b><small>${s.normal.allExact ? 'อ้างอิง Open Data DRT' : 'มี fallback ladder'}</small></div>
    <div><span>ประหยัดได้</span><b>${s.flat.eligible ? `${saving}฿` : '—'}</b><small>ต่อเที่ยว เมื่อใช้สิทธิถูกต้อง</small></div>
  </div>
  <div class="pg-sec">แยกตามตั๋ว/ระบบประตู</div>
  <div class="pg-list">${parts}</div>
  <div class="pg-note">ราคาจริงอาจขึ้นกับบัตร ประเภทผู้โดยสาร โปรโมชัน และประกาศล่าสุดของผู้ให้บริการ</div>`;
}

function pageDemoMode() {
  return `
  <button class="pg-back" data-act="more">← เพิ่มเติม</button>
  <div class="pg-title">Demo Mode กรรมการ</div>
  <div class="pg-hero">
    <div><b>กดครั้งเดียวเพื่อเริ่ม flow โชว์งาน</b><br><span>เปิด MRTA Mode · วางเส้นทางตัวอย่าง · โชว์ค่าโดยสาร 20฿ vs ปกติ · พร้อมกดซ้อมเดินทาง 3D</span></div>
    <button class="pg-mini" data-act="runDemo">เริ่มเดโม</button>
  </div>
  <div class="pg-timeline">
    <div><b>1</b><span>เปิดแผนที่รวม แล้ว spotlight เฉพาะสาย รฟม.</span></div>
    <div><b>2</b><span>วาง route ตัวอย่าง สยาม → ท่าพระ เพื่อเห็นการเปลี่ยนสายและค่าโดยสาร</span></div>
    <div><b>3</b><span>เปิดหน้าเทียบราคา 20 บาท vs ปกติ และอธิบายแหล่งข้อมูล</span></div>
    <div><b>4</b><span>กดซ้อมเดินทางแบบ 3D หรือ First Ride Simulator</span></div>
  </div>
  <div class="pg-grid">
    <button class="pg-card" data-act="judgeSummary">🏆<span>สรุปสำหรับ<br>กรรมการ</span></button>
    <button class="pg-card" data-act="presetTrips">⭐<span>เส้นทาง<br>โชว์เร็ว</span></button>
    <button class="pg-card" data-act="dataSources">📚<span>ที่มา<br>ข้อมูล</span></button>
  </div>`;
}

function pageJudgeSummary() {
  return `
  <button class="pg-back" data-act="more">← เพิ่มเติม</button>
  <div class="pg-title">สรุปสำหรับกรรมการ</div>
  <div class="pg-hero">
    <div><b>Bangkok Transit 3D = ตัวช่วยก่อนเดินทางจริง</b><br><span>ไม่ใช่แค่แผนที่ แต่ลดความกลัวของผู้ใช้ใหม่ และทำให้นโยบาย 20 บาทเข้าใจได้ทันที</span></div>
  </div>
  <div class="pg-list">
    <div class="pg-item"><b>ปัญหา</b><br>ผู้ใช้จำนวนมากไม่มั่นใจว่าจะขึ้นสายไหน เปลี่ยนสายยังไง จ่ายเท่าไร และกลัวหลงในสถานีใหญ่</div>
    <div class="pg-item"><b>ทางแก้</b><br>3D route planner + ค่าโดยสารจริง/ประมาณตาม data source + ตารางเวลา + First Ride Simulator + MRTA Mode</div>
    <div class="pg-item"><b>Impact</b><br>ช่วยให้คนตัดสินใจใช้ระบบรางง่ายขึ้น ลดความกลัวการเปลี่ยนสาย ดันการใช้สิทธิ 20 บาท และสื่อสาร CO₂ ที่ประหยัดได้</div>
    <div class="pg-item"><b>ต่างจากแอปทั่วไป</b><br>แอปทั่วไปบอกเส้นทาง แต่โปรเจกต์นี้ “ซ้อมการเดินทาง” ให้เห็นภาพก่อนออกจากบ้าน พร้อมข้อมูลที่อ้างอิงได้</div>
    <div class="pg-item"><b>Scalable</b><br>ต่อ official incident feed, API ค่าโดยสาร, accessibility dataset และ notification เฉพาะสายที่ผู้ใช้ใช้ประจำได้ในเวอร์ชันถัดไป</div>
    <div class="pg-item"><b>Future AI</b><br>ต่อยอดเป็น AI Mobility Assistant ที่คาดการณ์ crowd รายสถานี/ช่วงเวลา แนะนำ route ที่คนน้อยกว่า และช่วย MRTA บริหารสถานีด้าน safety/energy</div>
  </div>
  <button class="pg-cta" data-act="runDemo">เริ่ม flow เดโมกรรมการ</button>
  <button class="pg-cta pg-secondary" data-act="aiMobility">ดู AI Mobility Lab →</button>`;
}

function pagePresetTrips() {
  const cards = PRESET_TRIPS.map(([from, to, desc]) =>
    `<button class="pg-item pg-row pg-preset" data-act="preset:${esc(from)}|${esc(to)}">
      <span><b>${esc(from)} → ${esc(to)}</b><br><small>${esc(desc)}</small></span><b>เปิด</b>
    </button>`).join('');
  return `
  <button class="pg-back" data-act="services">← บริการ</button>
  <div class="pg-title">เส้นทางตัวอย่าง</div>
  <div class="pg-hero">
    <div><b>ไม่ต้องพิมพ์เองตอนเดโม</b><br><span>เลือก route ที่โชว์ความสามารถคนละมุม: เปลี่ยนสาย, MRTA, ค่าโดยสาร, first ride</span></div>
  </div>
  <div class="pg-list">${cards}</div>
  <div class="pg-note">ถ้าบางสถานีสะกดต่างจาก dataset แอปจะพยายามหาแบบ contains matching และถ้าไม่พบจะไม่เปลี่ยน route เดิม</div>`;
}

function pageFirstRideHub() {
  const missions = PRESET_TRIPS.slice(0, 3).map(([from, to, desc]) =>
    `<button class="pg-item pg-row pg-preset" data-act="mission:${esc(from)}|${esc(to)}">
      <span><b>${esc(from)} → ${esc(to)}</b><br><small>${esc(desc)}</small></span><b>เริ่มสอน</b>
    </button>`).join('');
  return `
  <button class="pg-back" data-act="services">← บริการ</button>
  <div class="pg-title">ซ้อมนั่งครั้งแรก</div>
  <div class="pg-hero">
    <div><b>ลดความกลัวก่อนขึ้นรถไฟฟ้าจริง</b><br><span>ฝึกเลือกต้นทาง-ปลายทาง อ่านป้ายมุ่งหน้า เปลี่ยนสาย ใช้ทางออก และตอบ quiz ทีละขั้น</span></div>
    <button class="pg-mini" data-act="firstride">เริ่มทันที</button>
  </div>
  <div class="pg-sec">Mission สำเร็จรูป</div>
  <div class="pg-list">${missions}</div>
  <div class="pg-list">
    <div class="pg-item"><b>ใช้ขายกับกรรมการ</b><br>ฟีเจอร์นี้เปลี่ยนแผนที่ให้เป็นเครื่องมือฝึกจริง เหมาะกับนักเรียน ผู้สูงอายุ นักท่องเที่ยว และคนที่ไม่เคยเปลี่ยนสาย</div>
  </div>`;
}

function pageFAQ() {
  const faqs = [
    ['ต้องเผื่อเวลาเท่าไหร่ก่อนขึ้นครั้งแรก?', 'เผื่อ ~15 นาทีสำหรับซื้อตั๋ว+หาชานชาลา หรือกด "🎓 ซ้อมนั่งครั้งแรก" ในแอปนี้ ซ้อมล่วงหน้า 3 นาทีจากบ้านได้เลย'],
    ['เหรียญ MRT หายไปในเครื่องตอนขาออก — ปกติไหม?', 'ปกติ! เหรียญเที่ยวเดียวออกแบบให้หยอดคืนที่ประตูขาออก ไม่ใช่เครื่องกิน'],
    ['ข้าม BTS ↔ MRT ต้องจ่ายใหม่ไหม?', 'เป็นคนละระบบ ต้องออกประตูแล้วแตะเข้าใหม่ — ถ้าลงทะเบียนสิทธิ 20฿ และทำตามเงื่อนไขเวลา ทริปข้ามสายคิดรวม 20฿'],
    ['รถขบวนแรก/สุดท้ายกี่โมง?', 'ส่วนใหญ่เริ่ม ~05:15-06:00 และหมด ~เที่ยงคืน ต่างกันตามสาย — ดูตาราง "เวลา & ความถี่" ในหน้าบริการ'],
    ['เด็ก/ผู้สูงอายุมีส่วนลดไหม?', 'มีตามเงื่อนไขของแต่ละผู้ให้บริการ (เช่น เด็กเล็กตามเกณฑ์ส่วนสูงมักฟรี ผู้สูงอายุลดครึ่งราคาบางระบบ) — เช็คเว็บทางการของสายที่ใช้'],
    ['พาจักรยาน/สัตว์เลี้ยงขึ้นได้ไหม?', 'โดยทั่วไปสัตว์เลี้ยงไม่อนุญาต (ยกเว้นสัตว์นำทาง) จักรยานพับได้บางระบบอนุญาตนอกชั่วโมงเร่งด่วน — กฎต่างกันทุกสาย เช็คทางการก่อน'],
    ['ลืมของบนรถ/ในสถานี?', 'แจ้งเจ้าหน้าที่สถานีทันที (ทุกสถานีมีจุดบริการ) หรือติดต่อช่องทางทางการของสายนั้นในหน้า "ข่าวสาร"'],
    ['แอปนี้เป็นแอปทางการหรือเปล่า?', 'ไม่ใช่ — เป็นโปรเจกต์นักเรียนที่ใช้ข้อมูลเปิดภาครัฐ + OpenStreetMap ราคา/เวลาเป็นข้อมูล ณ วันที่ระบุใน "เกี่ยวกับ"'],
  ];
  return `
  <button class="pg-back" data-act="services">← บริการ</button>
  <div class="pg-title">คำถามที่พบบ่อย</div>
  <div class="pg-list">${faqs.map(([q, a]) =>
    `<details class="pg-faq"><summary>${q}</summary><p>${a}</p></details>`).join('')}
  </div>`;
}

function pageStationGuide() {
  return `
  <button class="pg-back" data-act="services">← บริการ</button>
  <div class="pg-title">คู่มือใช้สถานี</div>
  <div class="pg-list">
    <div class="pg-item"><b>1. เช็กสถานีก่อนออกจากบ้าน</b><br>พิมพ์ต้นทาง-ปลายทางในแผนที่ แล้วดูสายที่ต้องขึ้น สถานีเปลี่ยนขบวน ค่าโดยสาร และเวลาประมาณการก่อนเดินทางจริง</div>
    <div class="pg-item"><b>2. อ่านป้าย “มุ่งหน้า...”</b><br>เวลาเข้าชานชาลาให้ดูปลายทางของสาย เช่น มุ่งหน้าคูคต / เคหะฯ / หลักสอง ไม่ใช่ดูแค่สีสายอย่างเดียว</div>
    <div class="pg-item"><b>3. เปลี่ยนสายให้เผื่อเวลา</b><br>บางจุดเป็นสถานีเชื่อมในอาคารเดียวกัน บางจุดต้องออกประตูแล้วเดินต่อ แอปจะแสดง transfer ใน route card เพื่อให้เห็นล่วงหน้า</div>
    <div class="pg-item"><b>4. ทางออกและลิฟต์</b><br>กดสถานีบนแผนที่เพื่อดูข้อมูลทางออกจาก OpenStreetMap ถ้าข้อมูลยังไม่ครบ แอประบุตรง ๆ เพื่อไม่ทำให้หลง</div>
    <div class="pg-item"><b>5. ซ้อมเที่ยวแรก</b><br>ถ้ายังไม่เคยขึ้น กด “ซ้อมนั่งครั้งแรก” เพื่อฝึกตั้งแต่ซื้อตั๋ว แตะบัตร เลือกชานชาลา เปลี่ยนสาย และออกสถานี</div>
  </div>`;
}

function pageAccessibility() {
  return `
  <button class="pg-back" data-act="services">← บริการ</button>
  <div class="pg-title">Accessibility Layer</div>
  <div class="pg-hero">
    <div><b>ทำให้ระบบรางใช้ง่ายขึ้นสำหรับทุกคน</b><br><span>รวมลิฟต์ ทางออก วีลแชร์ ตัวหนังสือใหญ่ และข้อจำกัดข้อมูลไว้ในที่เดียว</span></div>
    <button class="pg-mini" data-act="exits">ดูสถานีที่มีทางออก</button>
  </div>
  <div class="pg-list">
    <div class="pg-item"><b>ข้อมูลทางออก/วีลแชร์</b><br>เมื่อแตะสถานี แอปดึงข้อมูลทางออกจาก OpenStreetMap และแสดงจำนวนทางออก/จุดที่ระบุ wheelchair ได้เท่าที่ dataset มี</div>
    <div class="pg-item"><b>โหมดตัวหนังสือใหญ่</b><br>เปิดได้จากหน้าเพิ่มเติมหรือปุ่ม 🔎 เพื่อให้ route card, station sheet และคำอธิบายอ่านง่ายขึ้น</div>
    <div class="pg-item"><b>ข้อจำกัดที่ต้องบอกตรง ๆ</b><br>ข้อมูล accessibility ยังไม่ครบทุกสถานี เพราะขึ้นกับ OSM/community mapping ไม่ควรใช้แทนประกาศทางการในกรณีจำเป็นสูง</div>
    <div class="pg-item"><b>เวอร์ชันถัดไป</b><br>ต่อ official accessibility dataset, ทำ filter “ต้องมีลิฟต์”, และเพิ่ม route ที่หลีกเลี่ยงบันไดเมื่อข้อมูลครบ</div>
    <div class="pg-item"><b>เชื่อมกับ AI Crowd Prediction</b><br>เมื่อมีข้อมูลความหนาแน่นรายช่วงเวลา แอปสามารถแนะนำเวลาหรือเส้นทางที่คนน้อยกว่าให้ผู้สูงอายุ ผู้ใช้วีลแชร์ และคนที่ไม่มั่นใจกับสถานีใหญ่</div>
  </div>`;
}

function crowdClass(level) {
  return level === 'สูง' ? 'high' : level === 'กลาง' ? 'mid' : 'low';
}

function pageAIMobility() {
  const scenarioRows = CROWD_SCENARIOS.map(([station, time, level, reason]) =>
    `<div class="pg-crowdrow">
      <div><b>${esc(station)}</b><span>${esc(time)} · คาดการณ์ ${esc(level)}</span></div>
      <em class="${crowdClass(level)}">${esc(level)}</em>
      <small>${esc(reason)}</small>
    </div>`).join('');
  const roadmap = AI_ROADMAP.map(([phase, title, desc]) =>
    `<div><b>${esc(phase)}</b><span><strong>${esc(title)}</strong><br>${esc(desc)}</span></div>`).join('');
  return `
  <button class="pg-back" data-act="more">← เพิ่มเติม</button>
  <div class="pg-title">AI Mobility Lab</div>
  <div class="pg-hero pg-aihero">
    <div><b>จาก pre-trip simulator สู่ AI Mobility Assistant</b><br><span>คาดการณ์ความหนาแน่น แนะนำเส้นทางที่เหมาะกับผู้ใช้แต่ละกลุ่ม และช่วย MRTA บริหารสถานีในอนาคต</span></div>
  </div>
  <div class="pg-ai-grid">
    <div class="pg-ai-card">
      <b>🤖 AI Crowd Prediction</b>
      <span>คาดการณ์คนหนาแน่นรายสถานี/ช่วงเวลา เช่น อีก 30-60 นาที สถานีไหนควรเลี่ยง หรือเส้นทางไหนคนน้อยกว่า</span>
    </div>
    <div class="pg-ai-card">
      <b>♿ Smart Accessibility</b>
      <span>แนะนำ route ที่ใช้ลิฟต์ เดินน้อย เลี่ยงสถานีแน่น และเหมาะกับผู้สูงอายุ ผู้ใช้ wheelchair หรือคนมีสัมภาระ</span>
    </div>
    <div class="pg-ai-card">
      <b>🛡️ IoT Safety</b>
      <span>ต่อยอดกับ sensor หรือ computer vision แบบไม่ระบุตัวตน เพื่อแจ้งเตือน crowd surge และพื้นที่เสี่ยง</span>
    </div>
    <div class="pg-ai-card">
      <b>⚡ Energy Saving</b>
      <span>ใช้ demand prediction ช่วยปรับแอร์ บันไดเลื่อน กำลังเจ้าหน้าที่ และการจัดการสถานีให้ประหยัดขึ้น</span>
    </div>
  </div>
  <div class="pg-sec">ตัวอย่างหน้าคาดการณ์ crowd (concept)</div>
  <div class="pg-crowdpanel">
    ${scenarioRows}
  </div>
  <div class="pg-note">ข้อมูลในหน้านี้เป็น concept/roadmap สำหรับค่าย ไม่ใช่ข้อมูลความหนาแน่นสดจริง เวอร์ชัน production ต้องใช้ข้อมูลทางการ เช่น tap-in/tap-out รายเวลา, event, weather และสถานะเดินรถ</div>
  <div class="pg-sec">โมเดลที่เหมาะสำหรับ prototype</div>
  <div class="pg-list">
    <div class="pg-item"><b>Baseline</b><br>เริ่มจากค่าเฉลี่ยรายสถานีตามวันและเวลา เพื่อมีจุดเปรียบเทียบที่อธิบายง่าย</div>
    <div class="pg-item"><b>ML รุ่นแรก</b><br>ใช้ Random Forest / Gradient Boosting จาก feature เช่น ชั่วโมง วันในสัปดาห์ จุดเปลี่ยนสาย ความถี่รถ ฝนตก และ event ใกล้สถานี</div>
    <div class="pg-item"><b>เมื่อมีข้อมูลมากขึ้น</b><br>ต่อยอดเป็น time-series หรือ graph model เพื่อดูการไหลของผู้โดยสารทั้งโครงข่าย ไม่ใช่แค่สถานีเดียว</div>
  </div>
  <div class="pg-sec">Roadmap ต่อจากเว็บนี้</div>
  <div class="pg-timeline pg-roadmap">${roadmap}</div>
  <button class="pg-cta" data-act="aiModelPlan">ดู AI Model Plan →</button>
  <button class="pg-cta pg-secondary" data-act="transitCopilot">ลอง Transit AI Copilot</button>`;
}

function pagePersonas() {
  const cards = PERSONAS.map(([name, context, pain, help]) => `
    <div class="pg-persona">
      <b>${esc(name)}</b>
      <span>${esc(context)}</span>
      <small><strong>Pain:</strong> ${esc(pain)}</small>
      <small><strong>App helps:</strong> ${esc(help)}</small>
    </div>`).join('');
  return `
  <button class="pg-back" data-act="more">← เพิ่มเติม</button>
  <div class="pg-title">Persona Cards</div>
  <div class="pg-hero">
    <div><b>ออกแบบจากผู้ใช้จริง ไม่ใช่ feature list</b><br><span>เห็นชัดว่าแต่ละกลุ่มกลัวอะไร และแอปช่วยลดความไม่มั่นใจตรงไหน</span></div>
  </div>
  <div class="pg-personagrid">${cards}</div>
  <div class="pg-note">ใช้ตอน pitch เพื่อบอกกรรมการว่า pain point ไม่ได้กว้างเกินไป แต่เจาะผู้โดยสารใหม่และกลุ่มที่ต้องการความช่วยเหลือจริง</div>`;
}

function pageUserJourney() {
  const steps = JOURNEY.map(([phase, desc], i) =>
    `<div><b>${i + 1}</b><span><strong>${esc(phase)}</strong><br>${esc(desc)}</span></div>`).join('');
  return `
  <button class="pg-back" data-act="more">← เพิ่มเติม</button>
  <div class="pg-title">User Journey</div>
  <div class="pg-hero">
    <div><b>จากก่อนออกจากบ้านจนถึงปลายทาง</b><br><span>แอปนี้ไม่ได้ตอบแค่ “ขึ้นสายไหน” แต่ช่วยทุกช่วงที่ผู้โดยสารใหม่ลังเล</span></div>
  </div>
  <div class="pg-timeline pg-roadmap">${steps}</div>
  <div class="pg-list">
    <div class="pg-item"><b>แนวคิดสำคัญ</b><br>ผู้โดยสารใหม่ต้องการลดความเสี่ยงก่อนเดินทางจริง ถ้ารู้ขั้นตอนล่วงหน้า เขาจะกล้าเลือก MRT/ระบบรางมากขึ้น</div>
    <div class="pg-item"><b>ใช้ต่อยอดกับ AI</b><br>AI ไม่ควรตอบแค่ route แต่ควรดูสถานการณ์ทั้ง journey เช่น เดินน้อยกว่า คนน้อยกว่า หรือต้องเผื่อเวลามากกว่า</div>
  </div>`;
}

function pageJudgeQA() {
  return `
  <button class="pg-back" data-act="more">← เพิ่มเติม</button>
  <div class="pg-title">คำถามกรรมการ</div>
  <div class="pg-list">${JUDGE_QA.map(([q, a]) =>
    `<details class="pg-faq"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>
  <div class="pg-note">เตรียมไว้ปิดจุดเสี่ยง: data real-time, ความต่างจากแอปทั่วไป, privacy และแผนต่อ MRTA API</div>`;
}

function pageAIModelPlan() {
  return `
  <button class="pg-back" data-act="aiMobility">← AI Mobility Lab</button>
  <div class="pg-title">AI Model Plan</div>
  <div class="pg-mlflow">
    <div><b>Input</b><span>เวลา · วัน · สถานี · จุดเปลี่ยนสาย · event · weather · headway · tap-in/out แบบนิรนาม</span></div>
    <div><b>Model</b><span>Baseline average → Random Forest / Gradient Boosting → Time-series / Graph model เมื่อข้อมูลมากพอ</span></div>
    <div><b>Output</b><span>crowd level · route suggestion · station alert · เวลาเดินทางที่เหมาะกับแต่ละ persona</span></div>
    <div><b>Impact</b><span>ผู้โดยสารเลือกเวลาที่สบายกว่า และ operator วางกำลังคน/พลังงานได้ดีขึ้น</span></div>
  </div>
  <div class="pg-list">
    <div class="pg-item"><b>ทำไมไม่เริ่มจาก deep learning</b><br>สำหรับ prototype ควรเริ่มจาก baseline และ model ที่อธิบายได้ก่อน เพื่อให้กรรมการเห็นเหตุผลว่าอะไรทำให้สถานีแออัด</div>
    <div class="pg-item"><b>privacy guardrail</b><br>ใช้ข้อมูลรวมระดับสถานี/ช่วงเวลา ไม่ใช้ใบหน้า ไม่ระบุตัวบุคคล และให้หน่วยงานกำกับสิทธิการเข้าถึงข้อมูล</div>
  </div>`;
}

function pageRouteGoals() {
  return `
  <button class="pg-back" data-act="services">← บริการ</button>
  <div class="pg-title">Route Goals</div>
  <div class="pg-hero">
    <div><b>เส้นทางที่ดีที่สุดไม่เหมือนกันทุกคน</b><br><span>เวอร์ชันถัดไปควรให้ผู้ใช้เลือกเป้าหมายก่อนคำนวณ route</span></div>
  </div>
  <div class="pg-list">${ROUTE_GOALS.map(([goal, desc]) =>
    `<div class="pg-item"><b>${esc(goal)}</b><br>${esc(desc)}</div>`).join('')}</div>`;
}

function pageDestinations() {
  return `
  <button class="pg-back" data-act="services">← บริการ</button>
  <div class="pg-title">สถานีปลายทางสำคัญ</div>
  <div class="pg-hero">
    <div><b>ผู้ใช้ใหม่มักรู้ “สถานที่” ไม่ใช่ชื่อสถานี</b><br><span>หน้านี้คือ roadmap สำหรับค้นหาแบบปลายทางชีวิตจริง เช่น โรงพยาบาล สถานศึกษา งานใหญ่</span></div>
  </div>
  <div class="pg-grid pg-destgrid">${DESTINATIONS.map(([type, examples, why]) =>
    `<div class="pg-badgecard"><b>${esc(type)}</b><span>${esc(examples)}</span><small>${esc(why)}</small></div>`).join('')}</div>
  <div class="pg-note">เวอร์ชัน production ควรต่อ POI dataset และแสดงทางออกที่ใกล้ที่สุดจากสถานี ไม่ใช่แค่ชื่อสถานี</div>`;
}

function pageCarbonImpact() {
  return `
  <button class="pg-back" data-act="more">← เพิ่มเติม</button>
  <div class="pg-title">Carbon &amp; Energy Impact</div>
  <div class="pg-compare">
    <div><span>เปลี่ยน 1 ทริป</span><b>ลด CO₂</b><small>เมื่อเลือก rail แทนรถส่วนตัวในเมือง</small></div>
    <div><span>1,000 ผู้ใช้ใหม่</span><b>scale</b><small>impact โตตามจำนวนคนที่กล้าใช้ระบบราง</small></div>
    <div><span>AI demand</span><b>energy</b><small>ช่วยปรับแอร์/บันไดเลื่อน/เจ้าหน้าที่ตามความหนาแน่น</small></div>
  </div>
  <div class="pg-list">
    <div class="pg-item"><b>ผู้โดยสาร</b><br>เห็นผลกระทบของการเลือกเดินทางด้วยระบบรางผ่าน route card และ CO₂ estimate</div>
    <div class="pg-item"><b>เมือง</b><br>ถ้าคนต่างจังหวัดและผู้ใช้ใหม่กล้าใช้ MRT มากขึ้น จะลดภาระถนนและเพิ่มคุณค่าการลงทุนระบบราง</div>
    <div class="pg-item"><b>operator</b><br>crowd prediction ช่วยคาด demand เพื่อจัดพลังงานและกำลังคนให้เหมาะกว่าเดิม</div>
  </div>`;
}

function pageSafetyGuide() {
  return `
  <button class="pg-back" data-act="services">← บริการ</button>
  <div class="pg-title">Emergency &amp; Safety Guide</div>
  <div class="pg-list">${SAFETY_GUIDES.map(([topic, desc]) =>
    `<div class="pg-item"><b>${esc(topic)}</b><br>${esc(desc)}</div>`).join('')}</div>
  <div class="pg-note">หน้านี้ไม่แทนที่ประกาศความปลอดภัยของสถานี แต่ช่วยผู้โดยสารใหม่รู้ว่าควรทำอะไรเมื่อเกิดเหตุที่พบบ่อย</div>`;
}

const COPILOT_ANSWERS = {
  first: 'ถ้าใช้รถไฟฟ้าครั้งแรก ให้เริ่มจากค้นต้นทาง-ปลายทาง ดูสายที่ต้องขึ้นและสถานีเปลี่ยนสาย จากนั้นกด First Ride เพื่อซ้อมขั้นตอนซื้อตั๋ว แตะบัตร เลือกชานชาลา และออกสถานี',
  fare: 'สิทธิ 20 บาทต้องลงทะเบียนบัตรผ่านแอปทางรัฐ และเปลี่ยนสายภายในเงื่อนไขเวลา แอปนี้ช่วยเทียบกับราคาปกติของ route เพื่อให้เห็นว่าประหยัดเท่าไหร่',
  crowd: 'เวอร์ชันนี้ยังไม่ใช่ crowd สด แต่ AI Mobility Lab วางแผนใช้เวลา วัน จุดเปลี่ยนสาย event weather และ tap-in/out แบบนิรนาม เพื่อคาดการณ์ความหนาแน่นในอนาคต',
  access: 'สำหรับผู้สูงอายุหรือ wheelchair ให้ดู Accessibility Layer และในอนาคต route goals จะเลือกเส้นทางที่เดินน้อย มีลิฟต์ และเลี่ยงสถานีแน่นได้',
  lost: 'ถ้าหลงหรือขึ้นผิดฝั่ง ให้หยุดดูป้ายปลายทาง ถามเจ้าหน้าที่ และอย่าเข้าเขตห้าม ถ้าของหายให้จำสาย สถานี เวลา และทิศทางขบวนแล้วติดต่อช่องทางทางการ',
};

function pageTransitCopilot() {
  return `
  <button class="pg-back" data-act="more">← เพิ่มเติม</button>
  <div class="pg-title">Transit AI Copilot</div>
  <div class="pg-hero">
    <div><b>ผู้ช่วยถาม-ตอบสำหรับผู้โดยสารใหม่</b><br><span>Prototype นี้ตอบจาก rule/local content ก่อน เวอร์ชันจริงต่อ LLM ผ่าน backend ได้โดยไม่ฝัง API key ในเว็บ</span></div>
  </div>
  <div class="pg-chatlog" aria-live="polite">
    <div class="pg-bubble bot"><b>Copilot</b><br>ลองเลือกคำถามด้านล่างได้เลย ผมจะตอบแบบผู้ช่วยเดินทางสำหรับคนที่ไม่คุ้นระบบราง</div>
  </div>
  <div class="pg-chipgrid">
    <button class="pg-chip" data-act="ask:first">ขึ้นครั้งแรกต้องทำยังไง?</button>
    <button class="pg-chip" data-act="ask:fare">20 บาทใช้ยังไง?</button>
    <button class="pg-chip" data-act="ask:crowd">AI crowd prediction คืออะไร?</button>
    <button class="pg-chip" data-act="ask:access">อยากเดินน้อย/ใช้ลิฟต์</button>
    <button class="pg-chip" data-act="ask:lost">หลง/ของหายทำไง?</button>
  </div>
  <div class="pg-note">เหตุผลที่ยังไม่ต่อ LLM จริงใน GitHub Pages: public frontend ไม่ควรเก็บ API key และข้อมูลผู้ใช้ควรผ่าน backend ที่ควบคุม privacy/logging ได้</div>`;
}

function pageRules() {
  return `
  <button class="pg-back" data-act="services">← บริการ</button>
  <div class="pg-title">มารยาท &amp; ข้อควรระวัง</div>
  <div class="pg-list">
    <div class="pg-item">🚶 <b>ยืนชิดด้านข้างก่อนขึ้น</b><br>รอให้ผู้โดยสารออกจากขบวนก่อน แล้วค่อยเดินเข้า</div>
    <div class="pg-item">🎒 <b>ช่วงเร่งด่วนให้ถอดกระเป๋าเป้</b><br>ถือไว้ด้านหน้าเพื่อลดการชนคนอื่นและช่วยให้คนเข้า-ออกได้เร็วขึ้น</div>
    <div class="pg-item">🛗 <b>ลิฟต์ให้ผู้จำเป็นใช้ก่อน</b><br>ผู้ใช้วีลแชร์ ผู้สูงอายุ เด็กเล็ก รถเข็น และผู้บาดเจ็บควรได้สิทธิก่อน</div>
    <div class="pg-item">📢 <b>ถ้าเกิดเหตุผิดปกติ</b><br>แจ้งเจ้าหน้าที่สถานีหรือใช้ปุ่มฉุกเฉินตามจุดที่กำหนด อย่าวิ่งลงรางหรือเปิดประตูเอง</div>
    <div class="pg-item">🧾 <b>เก็บบัตร/เหรียญไว้จนออกสถานี</b><br>โดยเฉพาะเหรียญ MRT ต้องใช้หยอดคืนที่ประตูขาออก</div>
  </div>`;
}

function pageNews() {
  return `
  <div class="pg-title">ข่าวสาร &amp; โปรโมชัน</div>
  <div class="pg-item pg-highlight">🏷️ <b>นโยบาย 20 บาทตลอดสาย ใช้ได้ถึง 30 ก.ย. 2569</b><br>
    ลงทะเบียนผ่านแอปทางรัฐ · เปลี่ยนสายใน 30 นาที · จบทริปใน 180 นาที
    <button class="pg-mini" data-act="fare20">ดูเงื่อนไขเต็ม</button></div>
  <div class="pg-item">🚧 <b>สายที่กำลังมา</b> — สายสีส้ม (ศูนย์วัฒนธรรมฯ–มีนบุรี ช่วงแรก) อยู่ระหว่างเตรียมเปิดให้บริการ
    ติดตามประกาศจาก รฟม.</div>
  <div class="pg-sec">เมนูข่าวสาร</div>
  <div class="pg-grid">
    <button class="pg-card" data-act="promos">🏷️<span>โปรโมชัน<br>ทางการ</span></button>
    <button class="pg-card" data-act="announcements">📢<span>ประกาศ<br>ผู้ให้บริการ</span></button>
    <button class="pg-card" data-act="serviceNotice">🚧<span>สถานะบริการ<br>และเหตุพิเศษ</span></button>
    <button class="pg-card" data-act="officialLinks">🔗<span>ช่องทาง<br>ทางการ</span></button>
    <button class="pg-card" data-act="incidentFeed">⚙️<span>Incident<br>roadmap</span></button>
  </div>
  <div class="pg-note">เราไม่ทำ feed ข่าวปลอมในแอปนี้ เพราะโปรโมชันและประกาศเปลี่ยนได้ตลอด จึงพาไปแหล่งทางการแทน</div>`;
}

function pageMRTA() {
  const mrtaLines = ctx.lines.filter(l => ['mrt_blue', 'mrt_purple', 'mrt_yellow', 'mrt_pink'].includes(l.id));
  const rows = mrtaLines.map(l => {
    const [first, last] = ctx.serviceHours(l.id);
    const rush = ctx.headwayFor(l.id, 8);
    return `<tr><td><span class="pg-dot" style="background:${esc(l.color)}"></span>${lineName(l)}</td><td>~${first}</td><td>~${last}</td><td>${rush ?? '—'} นาที</td></tr>`;
  }).join('');
  return `
  <button class="pg-back" data-act="more">← เพิ่มเติม</button>
  <div class="pg-title">MRTA Mode</div>
  <div class="pg-hero">
    <div><b>โหมดสำหรับเวที MRTA</b><br><span>เน้นสายภายใต้บริบท รฟม.: น้ำเงิน ม่วง เหลือง ชมพู และซ่อนสายอื่นชั่วคราว</span></div>
    <button class="pg-mini" data-act="activateMRTA">เปิดโหมด</button>
  </div>
  <div class="pg-tablewrap"><table class="pg-table">
    <tr><th>สาย</th><th>รถแรก</th><th>รถสุดท้าย</th><th>เร่งด่วน</th></tr>
    ${rows}
  </table></div>
  <div class="pg-list">
    <div class="pg-item"><b>ใช้ตอนพรีเซนต์</b><br>เริ่มจากแผนที่รวม แล้วกด MRTA Mode เพื่ออธิบายว่าระบบช่วยผู้โดยสารของ รฟม. ยังไง: ตารางเวลา, ค่าโดยสาร, ทางออก, first-ride simulator</div>
    <div class="pg-item"><b>กลับเป็นแผนที่รวม</b><br>กดชิปสายทางซ้ายเพื่อเปิด/ปิด หรือรีเฟรชหน้าเพื่อกลับค่าเริ่มต้น</div>
  </div>`;
}

function pagePromos() {
  return `
  <button class="pg-back" data-act="news">← ข่าวสาร</button>
  <div class="pg-title">โปรโมชันทางการ</div>
  <div class="pg-body">หน้านี้ทำหน้าที่เป็น “ประตูรวม” ไปยังโปรโมชันจริงของแต่ละระบบ แทนการคัดลอกข้อความมาเก็บไว้จนหมดอายุ</div>
  <div class="pg-list">
    <a class="pg-item pg-link" href="https://www.bts.co.th" target="_blank" rel="noopener">🟢 BTS / Rabbit: โปรโมชันและข่าวสาร ↗</a>
    <a class="pg-item pg-link" href="https://metro.bemplc.co.th" target="_blank" rel="noopener">🔵 MRT Blue/Purple: ข่าวและสิทธิพิเศษ BEM ↗</a>
    <a class="pg-item pg-link" href="https://www.mrta.co.th" target="_blank" rel="noopener">🟡 MRTA / Yellow / Pink / โครงการใหม่ ↗</a>
    <a class="pg-item pg-link" href="https://www.srtet.co.th" target="_blank" rel="noopener">🔴 รถไฟฟ้าสายสีแดง / Airport Rail Link ↗</a>
  </div>
  <div class="pg-note">ข้อดีสำหรับกรรมการ: ข้อมูลไม่กลายเป็น mock content และลดความเสี่ยงที่ผู้ใช้เห็นโปรโมชันหมดอายุ</div>`;
}

function pageAnnouncements() {
  return `
  <button class="pg-back" data-act="news">← ข่าวสาร</button>
  <div class="pg-title">ประกาศผู้ให้บริการ</div>
  <div class="pg-list">
    ${OFFICIAL.map(([label, url]) =>
      `<a class="pg-item pg-link" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`).join('')}
  </div>
  <div class="pg-note">เหมาะสำหรับเช็กประกาศปิดปรับปรุง จุดเชื่อมต่อพิเศษ เวลาบริการวันหยุด และเงื่อนไขบัตรโดยสารล่าสุด</div>`;
}

function pageServiceNotice() {
  return `
  <button class="pg-back" data-act="news">← ข่าวสาร</button>
  <div class="pg-title">สถานะบริการและเหตุพิเศษ</div>
  <div class="pg-list">
    <div class="pg-item"><b>สถานะ real-time</b><br>โปรเจกต์นี้ยังไม่มี API เหตุขัดข้องแบบสด จึงไม่แสดงสถานะปลอม ถ้าจะทำต่อควรต่อ feed ทางการหรือระบบ admin สำหรับประกาศฉุกเฉิน</div>
    <div class="pg-item"><b>สิ่งที่แอปทำได้ตอนนี้</b><br>จำลองความถี่รถตามช่วงเวลา เปิดดูขบวนวิ่งบนแผนที่ และดูเวลาเปิด-ปิดโดยประมาณรายสาย</div>
    <div class="pg-item"><b>แนวทางเวอร์ชันถัดไป</b><br>เพิ่ม incident banner หน้าแรก, push notification เฉพาะสายที่ผู้ใช้บันทึกไว้, และ badge สีบน route card เมื่อมีเหตุผิดปกติ</div>
  </div>`;
}

function pageIncidentFeed() {
  return `
  <button class="pg-back" data-act="news">← ข่าวสาร</button>
  <div class="pg-title">Incident Feed Placeholder</div>
  <div class="pg-hero">
    <div><b>พร้อมต่อ feed ทางการ แต่ไม่แสดงเหตุขัดข้องปลอม</b><br><span>หน้านี้อธิบาย architecture ที่จะต่อในเวอร์ชัน production</span></div>
  </div>
  <div class="pg-list">
    <div class="pg-item"><b>สถานะปัจจุบัน</b><br>ยังไม่มี official realtime incident API ในโปรเจกต์นี้ จึงไม่ mock เหตุขัดข้องเพื่อหลอกว่ามีข้อมูลสด</div>
    <div class="pg-item"><b>Schema ที่รองรับได้</b><br>line_id · severity · station_range · started_at · updated_at · title_th · body_th · official_url</div>
    <div class="pg-item"><b>UI ที่จะใช้</b><br>banner บนแผนที่, badge บน route card, push notification เฉพาะสายที่ผู้ใช้บันทึกไว้, และ timeline ในหน้าข่าวสาร</div>
    <div class="pg-item"><b>เหตุผลเชิงความน่าเชื่อถือ</b><br>ข้อมูลฉุกเฉินต้องมาจากต้นทางจริงเท่านั้น เพราะมีผลต่อการเดินทางและความปลอดภัยของผู้ใช้</div>
  </div>`;
}

function pageOfficialLinks() {
  return `
  <button class="pg-back" data-act="news">← ข่าวสาร</button>
  <div class="pg-title">ช่องทางทางการ</div>
  <div class="pg-sec">โปรโมชัน/ประกาศทางการ (เปิดจากต้นทางจริง)</div>
  <div class="pg-body">โปรโมชันเปลี่ยนตลอดเวลา — เราไม่คัดลอกมาแปะให้ข้อมูลเก่าค้าง
  แต่รวมประตูไปหน้าทางการของทุกค่ายไว้ให้ที่เดียว:</div>
  <div class="pg-list">${OFFICIAL.map(([label, url]) =>
    `<a class="pg-item pg-link" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`).join('')}
  </div>
  <div class="pg-note">ลิงก์เปิดเว็บทางการในแท็บใหม่ — เนื้อหาในนั้นเป็นของผู้ให้บริการแต่ละราย</div>`;
}

function pageMore() {
  return `
  <div class="pg-title">เพิ่มเติม</div>
  <div class="pg-hero">
    <div><b>พร้อมส่งประกวด</b><br><span>เดโมกรรมการ · pitch summary · data trust · accessibility · incident roadmap</span></div>
    <button class="pg-mini" data-act="demoMode">เดโม</button>
  </div>
  <div class="pg-sec">ส่งประกวด / เดโม</div>
  <div class="pg-list">
    <button class="pg-item pg-row" data-act="demoMode">🎬 Demo Mode ปุ่มเดียว <span>›</span></button>
    <button class="pg-item pg-row" data-act="judgeSummary">🏆 สรุปสำหรับกรรมการ <span>›</span></button>
    <button class="pg-item pg-row" data-act="judgeQA">❓ คำถามกรรมการ / Q&A <span>›</span></button>
    <button class="pg-item pg-row" data-act="presetTrips">⭐ เส้นทางตัวอย่าง / Preset Trips <span>›</span></button>
    <button class="pg-item pg-row" data-act="firstRideHub">🎓 First Ride mission cards <span>›</span></button>
  </div>
  <div class="pg-sec">ตั้งค่าการใช้งาน</div>
  <div class="pg-list">
    <button class="pg-item pg-row" data-act="theme">🌗 สลับโหมดกลางวัน / กลางคืน <span>›</span></button>
    <button class="pg-item pg-row" data-act="big">🔎 โหมดตัวหนังสือใหญ่ <span>›</span></button>
    <button class="pg-item pg-row" data-act="mrtaMode">🏛️ MRTA Mode สำหรับเดโมกรรมการ <span>›</span></button>
    <button class="pg-item pg-row" data-act="clear">🧹 ล้างประวัติการค้นหา/สถิติในเครื่อง <span>›</span></button>
  </div>
  <div class="pg-sec">เกี่ยวกับ</div>
  <div class="pg-list">
    <button class="pg-item pg-row" data-act="about">ℹ️ เกี่ยวกับแอป + ที่มาข้อมูล + ผลกระทบ <span>›</span></button>
    <button class="pg-item pg-row" data-act="dataSources">📚 ที่มาข้อมูลแบบละเอียด <span>›</span></button>
    <button class="pg-item pg-row" data-act="dataStatus">🏷️ สถานะข้อมูล / data labels <span>›</span></button>
    <button class="pg-item pg-row" data-act="userJourney">🧭 User Journey <span>›</span></button>
    <button class="pg-item pg-row" data-act="personas">👥 Persona Cards <span>›</span></button>
    <button class="pg-item pg-row" data-act="aiMobility">🤖 AI Mobility Lab / Crowd Prediction <span>›</span></button>
    <button class="pg-item pg-row" data-act="transitCopilot">💬 Transit AI Copilot <span>›</span></button>
    <button class="pg-item pg-row" data-act="carbonImpact">🌱 Carbon / Energy Impact <span>›</span></button>
    <button class="pg-item pg-row" data-act="accessibility">♿ Accessibility Layer <span>›</span></button>
    <button class="pg-item pg-row" data-act="incidentFeed">🚧 Incident Feed roadmap <span>›</span></button>
    <button class="pg-item pg-row" data-act="fareCompare">⚖️ เทียบค่าโดยสาร 20฿ vs ปกติ <span>›</span></button>
    <button class="pg-item pg-row" data-act="contact">☎️ ติดต่อผู้ให้บริการ / ของหาย <span>›</span></button>
    <button class="pg-item pg-row" data-act="privacy">🔐 ความเป็นส่วนตัว <span>›</span></button>
    <button class="pg-item pg-row" data-act="onboard">🎬 ดูวิธีใช้อีกครั้ง <span>›</span></button>
    <div class="pg-item">🏷️ เวอร์ชัน 1.0 · ข้อมูล: ค่าโดยสาร เม.ย. 2569 · ผู้โดยสาร มี.ค. 2569 · แผนที่ OSM ก.ค. 2569<br>
    <span class="pg-note">โปรเจกต์นักเรียนเพื่อ MRTA Innovation Camp 2026 · © OpenStreetMap contributors (ODbL)</span></div>
  </div>`;
}

function pageDataStatus() {
  const badges = DATA_BADGES.map(([label, desc]) =>
    `<div class="pg-badgecard"><b>${esc(label)}</b><span>${esc(desc)}</span></div>`).join('');
  return `
  <button class="pg-back" data-act="more">← เพิ่มเติม</button>
  <div class="pg-title">สถานะข้อมูล</div>
  <div class="pg-grid pg-badgegrid">${badges}</div>
  <div class="pg-list">
    <div class="pg-item"><b>ทำไมต้องแยก label</b><br>ข้อมูลบางอย่างเป็น official/open data แต่บางอย่างเป็นค่าประมาณเพื่อ simulation การแยก label ทำให้กรรมการเห็นว่าทีมไม่มั่วข้อมูล</div>
    <div class="pg-item"><b>AI ต้องใช้ข้อมูลแบบไหน</b><br>crowd prediction เวอร์ชันจริงควรใช้ข้อมูลนิรนาม เช่น tap-in/tap-out รายช่วงเวลา สถานะเดินรถ event และสภาพอากาศ โดยไม่เก็บใบหน้าหรือข้อมูลส่วนบุคคล</div>
    <div class="pg-item"><b>ใช้ใน pitch</b><br>บอกว่าแอปนี้ตั้งใจ “โปร่งใสเรื่องข้อมูล” ตั้งแต่ prototype ไม่รอให้เป็น production ก่อน</div>
  </div>`;
}

function pageDataSources() {
  const rows = [
    ['เส้นทาง · สถานี · อาคาร · ทางออก', 'OpenStreetMap contributors (ODbL)', 'แผนที่ OSM ก.ค. 2569', 'ใช้วาด 3D network และข้อมูลทางออก'],
    ['ค่าโดยสารคู่สถานี', 'Open Data กรมการขนส่งทางราง', 'เม.ย. 2569', 'ใช้เมื่อพบคู่สถานีใน fare_lookup.json'],
    ['ผู้โดยสารรายเดือน', 'Open Data กรมการขนส่งทางราง', 'มี.ค. 2569', 'ใช้แผงสถิติและชั้นข้อมูล ridership'],
    ['ความถี่และเวลาเปิด-ปิด', 'ข้อมูลเผยแพร่ของผู้ให้บริการ + service.js', 'ประมาณ 2025-2026', 'ใช้จำลองขบวนและตารางเวลาระดับสาย'],
    ['นโยบาย 20 บาท', 'ประกาศภาครัฐ/รฟม. ตามเงื่อนไขปัจจุบัน', 'ใช้ได้ถึง 30 ก.ย. 2569', 'ใช้เปรียบเทียบค่าโดยสารและ route card'],
    ['CO₂ ที่ประหยัดได้', 'ค่าประมาณ emission factor สาธารณะ', 'ประมาณการ', 'ใช้สื่อสารผลกระทบเชิงสิ่งแวดล้อม'],
    ['Crowd prediction', 'ต้องใช้ข้อมูลทางการ/นิรนามในอนาคต', 'roadmap', 'ใช้แนะนำเวลา/เส้นทางที่เหมาะกับผู้ใช้แต่ละกลุ่ม'],
  ].map(([topic, source, date, use]) =>
    `<tr><td>${topic}</td><td>${source}</td><td>${date}</td><td>${use}</td></tr>`).join('');
  return `
  <button class="pg-back" data-act="more">← เพิ่มเติม</button>
  <div class="pg-title">ที่มาข้อมูล</div>
  <div class="pg-tablewrap"><table class="pg-table pg-source-table">
    <tr><th>ข้อมูล</th><th>แหล่งที่มา</th><th>วันที่/สถานะ</th><th>ใช้ทำอะไร</th></tr>
    ${rows}
  </table></div>
  <div class="pg-list">
    <div class="pg-item"><b>หลักการของแอป</b><br>ข้อมูลที่เปลี่ยนบ่อย เช่น โปรโมชันหรือประกาศเหตุขัดข้อง จะไม่คัดลอกมาเป็น feed ปลอม แต่เปิดลิงก์ไปต้นทางจริง</div>
    <div class="pg-item"><b>ข้อจำกัดที่บอกตรง ๆ</b><br>เวลาเดินรถเป็นระดับสาย ทางออกขึ้นกับความครบถ้วนของ OSM และราคาจริงอาจขึ้นกับบัตร/สิทธิ/ประกาศล่าสุด</div>
  </div>`;
}

function pageContact() {
  return `
  <button class="pg-back" data-act="more">← เพิ่มเติม</button>
  <div class="pg-title">ติดต่อ / ของหาย</div>
  <div class="pg-list">
    <div class="pg-item"><b>ของหายในสถานีหรือบนขบวน</b><br>จำชื่อสถานี เวลา สาย และทิศทางขบวนให้ได้มากที่สุด แล้วติดต่อเจ้าหน้าที่สถานีหรือช่องทางทางการของผู้ให้บริการสายนั้น</div>
    <div class="pg-item"><b>เหตุฉุกเฉินในสถานี</b><br>แจ้งเจ้าหน้าที่ใกล้ที่สุดทันที ใช้ปุ่มฉุกเฉินตามจุดที่กำหนด และทำตามประกาศในสถานี</div>
    <div class="pg-item"><b>ช่องทางออนไลน์</b><br>ใช้หน้า “ช่องทางทางการ” เพื่อไปยังเว็บของ BTS, BEM, MRTA, SRTET และ Open Data โดยตรง</div>
  </div>
  <button class="pg-cta" data-act="officialLinks">เปิดช่องทางทางการ →</button>`;
}

function pagePrivacy() {
  return `
  <button class="pg-back" data-act="more">← เพิ่มเติม</button>
  <div class="pg-title">ความเป็นส่วนตัว</div>
  <div class="pg-list">
    <div class="pg-item"><b>ข้อมูลที่เก็บในเครื่อง</b><br>ประวัติ route ล่าสุด, สถานะ onboarding และค่าประมาณ CO₂ ถูกเก็บไว้ใน browser ของเครื่องนี้เท่านั้น</div>
    <div class="pg-item"><b>ตำแหน่งปัจจุบัน</b><br>ใช้เฉพาะเมื่อกดปุ่มสถานีใกล้ฉัน และ browser จะถามสิทธิก่อนเสมอ แอปไม่ได้ส่งตำแหน่งไป server ของเรา</div>
    <div class="pg-item"><b>ล้างข้อมูล</b><br>กลับไปหน้าเพิ่มเติมแล้วกด “ล้างประวัติการค้นหา/สถิติในเครื่อง” ได้ทันที</div>
  </div>`;
}

const PAGES = {
  services: pageServices, times: pageTimes, cards: pageCards,
  demoMode: pageDemoMode, judgeSummary: pageJudgeSummary,
  judgeQA: pageJudgeQA, presetTrips: pagePresetTrips, firstRideHub: pageFirstRideHub,
  fare20: pageFare20, faq: pageFAQ, stationGuide: pageStationGuide,
  accessibility: pageAccessibility, aiMobility: pageAIMobility, aiModelPlan: pageAIModelPlan,
  personas: pagePersonas, userJourney: pageUserJourney, routeGoals: pageRouteGoals,
  destinations: pageDestinations, carbonImpact: pageCarbonImpact, safetyGuide: pageSafetyGuide,
  transitCopilot: pageTransitCopilot, rules: pageRules, fareCompare: pageFareCompare,
  news: pageNews, promos: pagePromos,
  announcements: pageAnnouncements, serviceNotice: pageServiceNotice, incidentFeed: pageIncidentFeed,
  officialLinks: pageOfficialLinks, mrtaMode: pageMRTA, more: pageMore,
  dataStatus: pageDataStatus, dataSources: pageDataSources, contact: pageContact, privacy: pagePrivacy,
};

// ── engine ───────────────────────────────────────────────────────────
let current = null;

export function showPage(name) {
  current = name;
  if (!name) {
    pageEl.hidden = true;
    setActiveTab('map');
    return;
  }
  pageEl.innerHTML = `<div class="pg-inner">${PAGES[name]()}</div>`;
  pageEl.hidden = false;
  pageEl.scrollTop = 0;
  setActiveTab(['services', 'times', 'cards', 'fare20', 'faq', 'stationGuide', 'accessibility', 'aiMobility', 'aiModelPlan', 'routeGoals', 'destinations', 'safetyGuide', 'rules', 'fareCompare', 'presetTrips', 'firstRideHub'].includes(name) ? 'services'
    : ['news', 'promos', 'announcements', 'serviceNotice', 'incidentFeed', 'officialLinks'].includes(name) ? 'news' : 'more');
  wireActions();
}

function setActiveTab(tab) {
  tabbar?.querySelectorAll('.tb-item').forEach(b =>
    b.classList.toggle('on', b.dataset.tab === tab));
}

function wireActions() {
  pageEl.querySelectorAll('[data-act]').forEach(btn => {
    btn.addEventListener('click', () => {
      const act = btn.dataset.act;
      if (PAGES[act]) return showPage(act);
      if (act.startsWith('ask:')) {
        const key = act.slice(4);
        const log = pageEl.querySelector('.pg-chatlog');
        const label = btn.textContent.trim();
        const answer = COPILOT_ANSWERS[key] || 'ยังไม่มีคำตอบสำหรับคำถามนี้ใน prototype แต่เวอร์ชัน LLM จริงสามารถค้นจากข้อมูลทางการและบริบทเส้นทางของผู้ใช้ได้';
        if (log) {
          log.insertAdjacentHTML('beforeend',
            `<div class="pg-bubble user">${esc(label)}</div><div class="pg-bubble bot"><b>Copilot</b><br>${esc(answer)}</div>`);
          log.scrollTop = log.scrollHeight;
        }
        return;
      }
      showPage(null);
      if (act.startsWith('preset:')) {
        const [from, to] = act.slice(7).split('|');
        ctx.planTrip(from, to);
        return;
      }
      if (act.startsWith('mission:')) {
        const [from, to] = act.slice(8).split('|');
        ctx.planTrip(from, to);
        ctx.startFirstRide();
        return;
      }
      switch (act) {
        case 'fares': ctx.focusSearch(); break;
        case 'firstride': ctx.startFirstRide(); break;
        case 'runDemo': ctx.runDemo(); break;
        case 'stats': ctx.openStats(); break;
        case 'exits': ctx.hintExits(); break;
        case 'activateMRTA': ctx.activateMRTA(); break;
        case 'theme': ctx.toggleTheme(); break;
        case 'big': ctx.toggleBig(); break;
        case 'about': ctx.openAbout(); break;
        case 'onboard': ctx.openOnboard(); break;
        case 'clear':
          try {
            ['bkk3d_recents', 'bkk3d_co2', 'bkk3d_seen'].forEach(k => localStorage.removeItem(k));
          } catch {}
          alert('ล้างข้อมูลในเครื่องแล้ว');
          break;
      }
    });
  });
}

export function initPages(context) {
  ctx = context;
  pageEl = document.getElementById('page');
  tabbar = document.getElementById('tabbar');
  tabbar.querySelectorAll('.tb-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.tab;
      showPage(t === 'map' ? null : t === 'services' ? 'services'
        : t === 'news' ? 'news' : 'more');
    });
  });
  return { showPage };
}
