import { chooseBestExit, choosePlaceJourney } from './journey.js';
import { createPlaceProvider, parseGoogleMapsInput, sanitizePlaceQuery } from './places.js';

const DEBOUNCE_MS = 450;

function loadGeoapifyKey() {
  try { return localStorage.getItem('bkk3d_geoapify_key') || ''; } catch { return ''; }
}

async function loadCuratedPlaces() {
  try {
    const response = await fetch('data/places.json');
    if (!response.ok) return [];
    const payload = await response.json();
    return Array.isArray(payload.places) ? payload.places : [];
  } catch {
    return [];
  }
}

function setInputPlace(input, place) {
  input.value = place?.name || '';
  input.dataset.placeId = place?.id || '';
}

function renderOptions(container, places, onChoose) {
  container.replaceChildren();
  if (!places.length) {
    container.hidden = true;
    return;
  }
  for (const place of places) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'place-option';
    const title = document.createElement('b');
    title.textContent = place.name;
    const address = document.createElement('span');
    address.textContent = place.address;
    button.append(title, address);
    button.addEventListener('click', () => onChoose(place));
    container.appendChild(button);
  }
  container.hidden = false;
}

function placeFromCoordinates(lat, lon, name = 'ตำแหน่งปัจจุบัน') {
  return { id: `coords:${lat.toFixed(6)},${lon.toFixed(6)}`, name, address: name, lat, lon, type: 'location', source: 'device' };
}

function sharedInput(params) {
  return [params.get('share-title'), params.get('share-text'), params.get('share-url')]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function parsePlaceParam(raw) {
  if (!raw) return null;
  const [latRaw, lonRaw, ...nameParts] = raw.split(',');
  const lat = Number.parseFloat(latRaw);
  const lon = Number.parseFloat(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return placeFromCoordinates(lat, lon, nameParts.join(',') || 'สถานที่ที่แชร์');
}

export async function initPlacePlanner({ graph, exitsForNode, onJourney, onStatus }) {
  const form = document.getElementById('place-form');
  const fromInput = document.getElementById('place-from-input');
  const toInput = document.getElementById('place-to-input');
  const fromOptions = document.getElementById('place-from-options');
  const toOptions = document.getElementById('place-to-options');
  const status = document.getElementById('place-status');
  if (!form || !fromInput || !toInput) return null;

  const localPlaces = await loadCuratedPlaces();
  const provider = createPlaceProvider({ geoapifyKey: loadGeoapifyKey(), localPlaces });
  const selected = { from: null, to: null };
  const controllers = { from: null, to: null };
  const timers = { from: null, to: null };

  const showStatus = (message, kind = '') => {
    status.textContent = message;
    status.dataset.kind = kind;
    onStatus?.(message, kind);
  };

  function choose(role, place) {
    selected[role] = place;
    const input = role === 'from' ? fromInput : toInput;
    const options = role === 'from' ? fromOptions : toOptions;
    setInputPlace(input, place);
    options.hidden = true;
    if (selected.from && selected.to) showStatus('พร้อมหาเส้นทางที่เหมาะที่สุด');
  }

  async function suggestions(role) {
    const input = role === 'from' ? fromInput : toInput;
    const options = role === 'from' ? fromOptions : toOptions;
    const query = sanitizePlaceQuery(input.value);
    if (query.length < 2) return renderOptions(options, [], () => {});
    controllers[role]?.abort();
    controllers[role] = new AbortController();
    try {
      const places = await provider.autocomplete(query, { signal: controllers[role].signal });
      renderOptions(options, places, (place) => choose(role, place));
    } catch (error) {
      if (error?.name !== 'AbortError') renderOptions(options, [], () => {});
    }
  }

  for (const [role, input] of [['from', fromInput], ['to', toInput]]) {
    input.addEventListener('input', () => {
      selected[role] = null;
      input.dataset.placeId = '';
      clearTimeout(timers[role]);
      timers[role] = setTimeout(() => suggestions(role), DEBOUNCE_MS);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        (role === 'from' ? fromOptions : toOptions).hidden = true;
      }
    });
  }

  async function resolveInput(role) {
    if (selected[role]) return selected[role];
    const input = role === 'from' ? fromInput : toInput;
    const query = sanitizePlaceQuery(input.value);
    if (!query) return null;
    showStatus(`กำลังค้นหา “${query}”…`);
    const results = await provider.search(query);
    if (!results.length) return null;
    choose(role, results[0]);
    return results[0];
  }

  async function plan() {
    showStatus('กำลังเปรียบเทียบสถานีและเส้นทาง…');
    try {
      const origin = await resolveInput('from');
      const destination = await resolveInput('to');
      if (!origin || !destination) {
        showStatus('ไม่พบสถานที่ กรุณาเลือกผลค้นหาหรือพิมพ์ชื่อให้ละเอียดขึ้น', 'error');
        return;
      }
      const journey = choosePlaceJourney(graph, origin, destination);
      if (!journey) {
        showStatus('ยังหาเส้นทางรถไฟฟ้าระหว่างสองสถานที่นี้ไม่ได้', 'error');
        return;
      }
      const exitCandidates = journey.destinationGroup.nodes
        .flatMap((node) => exitsForNode(node.id));
      journey.bestExit = chooseBestExit(exitCandidates, destination);
      onJourney(journey);
      showStatus(`แนะนำ ${journey.originStation.nameTh} → ${journey.destinationStation.nameTh}`, 'success');
    } catch (error) {
      const message = String(error?.message || '');
      showStatus(message.startsWith('PLACE_API_')
        ? 'ค้นหาสถานที่ออนไลน์ไม่ได้ชั่วคราว ลองใหม่หรือเลือกสถานที่ยอดนิยม'
        : 'เกิดข้อผิดพลาดขณะหาเส้นทาง กรุณาลองใหม่', 'error');
    }
  }

  form.addEventListener('submit', (event) => { event.preventDefault(); plan(); });
  document.getElementById('place-swap-btn')?.addEventListener('click', () => {
    [selected.from, selected.to] = [selected.to, selected.from];
    const fromValue = fromInput.value;
    fromInput.value = toInput.value;
    toInput.value = fromValue;
  });
  document.getElementById('place-geo-btn')?.addEventListener('click', () => {
    if (!navigator.geolocation) return showStatus('อุปกรณ์นี้ไม่รองรับตำแหน่งปัจจุบัน', 'error');
    showStatus('กำลังหาตำแหน่งปัจจุบัน…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => choose('from', placeFromCoordinates(coords.latitude, coords.longitude)),
      () => showStatus('ไม่ได้รับสิทธิใช้ตำแหน่ง กรุณาพิมพ์ต้นทางแทน', 'error'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  });

  const imported = sharedInput(new URLSearchParams(location.search));
  const fromParam = parsePlaceParam(new URLSearchParams(location.search).get('placeFrom'));
  const toParam = parsePlaceParam(new URLSearchParams(location.search).get('placeTo'));
  if (fromParam) choose('from', fromParam);
  if (toParam) choose('to', toParam);
  if (fromParam && toParam) queueMicrotask(plan);
  if (imported) {
    const parsed = parseGoogleMapsInput(imported);
    if (parsed?.type === 'coordinates') choose('to', placeFromCoordinates(parsed.lat, parsed.lon, parsed.label));
    else if (parsed?.type === 'query') toInput.value = parsed.query;
    else {
      const withoutUrl = sanitizePlaceQuery(imported.replace(/https?:\/\/\S+/gi, ''));
      if (withoutUrl) toInput.value = withoutUrl;
      showStatus('ได้รับลิงก์แล้ว กดค้นหาเพื่อเลือกสถานที่', 'success');
    }
  }

  const importForm = document.getElementById('google-import-form');
  importForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = document.getElementById('google-import-input')?.value || '';
    const parsed = parseGoogleMapsInput(value);
    if (parsed?.type === 'coordinates') {
      choose('to', placeFromCoordinates(parsed.lat, parsed.lon, parsed.label));
      showStatus('รับพิกัดจาก Google Maps แล้ว', 'success');
    } else if (parsed?.type === 'query') {
      toInput.value = parsed.query;
      selected.to = null;
      showStatus('รับชื่อสถานที่แล้ว กดดูเส้นทางเพื่อค้นหา', 'success');
    } else {
      showStatus('ลิงก์แบบย่อนี้ไม่มีพิกัด กรุณาวางชื่อสถานที่แทน', 'error');
    }
  });

  return { plan, provider, selected };
}
