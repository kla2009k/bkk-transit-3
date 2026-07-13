// Place-provider boundary. All third-party responses are validated before use.
const GEOAPIFY_BASE = 'https://api.geoapify.com/v1/geocode';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const MAX_QUERY_LENGTH = 160;
const SEARCH_LIMIT = 6;

export function sanitizePlaceQuery(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

function coordinate(value, min, max) {
  const number = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function normalizedPlace({ id, name, address, lat, lon, type, source }) {
  const safeLat = coordinate(lat, -90, 90);
  const safeLon = coordinate(lon, -180, 180);
  const safeName = sanitizePlaceQuery(name || address);
  if (safeLat == null || safeLon == null || !safeName) return null;
  return {
    id: String(id || `${source}:${safeLat},${safeLon}`),
    name: safeName,
    address: String(address || safeName).trim().slice(0, 300),
    lat: safeLat,
    lon: safeLon,
    type: String(type || 'place').slice(0, 60),
    source,
  };
}

export function normalizeGeoapifyResponse(payload) {
  if (!payload || !Array.isArray(payload.features)) return [];
  return payload.features.flatMap((feature) => {
    const properties = feature?.properties;
    if (!properties || typeof properties !== 'object') return [];
    const coords = feature?.geometry?.coordinates;
    const place = normalizedPlace({
      id: properties.place_id,
      name: properties.name || properties.address_line1 || properties.formatted,
      address: properties.formatted || properties.address_line2,
      lat: properties.lat ?? coords?.[1],
      lon: properties.lon ?? coords?.[0],
      type: properties.result_type || properties.category,
      source: 'geoapify',
    });
    return place ? [place] : [];
  });
}

export function normalizeNominatimResponse(payload) {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const place = normalizedPlace({
      id: item.place_id,
      name: item.name || item.display_name,
      address: item.display_name,
      lat: item.lat,
      lon: item.lon,
      type: item.type || item.class,
      source: 'nominatim',
    });
    return place ? [place] : [];
  });
}

function validGoogleHost(hostname) {
  return hostname === 'google.com'
    || hostname.endsWith('.google.com')
    || hostname === 'maps.app.goo.gl'
    || /^www\.google\.[a-z.]+$/i.test(hostname);
}

function coordinateResult(latValue, lonValue) {
  const lat = coordinate(latValue, -90, 90);
  const lon = coordinate(lonValue, -180, 180);
  return lat == null || lon == null
    ? null
    : { type: 'coordinates', lat, lon, label: 'สถานที่จาก Google Maps' };
}

export function parseGoogleMapsInput(rawValue) {
  const raw = String(rawValue ?? '').trim().slice(0, 2048);
  if (!raw) return null;
  const urlText = raw.match(/https?:\/\/[^\s]+/i)?.[0] || raw;
  try {
    const url = new URL(urlText);
    if (!validGoogleHost(url.hostname.toLowerCase())) return { type: 'query', query: sanitizePlaceQuery(raw) };
    const at = url.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (at) return coordinateResult(at[1], at[2]);
    for (const key of ['query', 'q', 'destination', 'daddr']) {
      const query = sanitizePlaceQuery(url.searchParams.get(key));
      if (query) return { type: 'query', query };
    }
    const sharedLabel = sanitizePlaceQuery(raw.replace(urlText, ''));
    return sharedLabel
      ? { type: 'query', query: sharedLabel }
      : { type: 'unsupported-link', url: url.toString() };
  } catch {
    return { type: 'query', query: sanitizePlaceQuery(raw) };
  }
}

function dedupePlaces(places) {
  const seen = new Set();
  return places.filter((place) => {
    const key = `${place.name.toLowerCase()}|${place.lat.toFixed(4)}|${place.lon.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function searchLocal(localPlaces, query) {
  const needle = query.toLocaleLowerCase('th');
  return localPlaces
    .filter((place) => `${place.name} ${place.address || ''} ${(place.aliases || []).join(' ')}`
      .toLocaleLowerCase('th').includes(needle))
    .slice(0, SEARCH_LIMIT)
    .map((place) => normalizedPlace({ ...place, source: 'curated' }))
    .filter(Boolean);
}

export function createPlaceProvider({
  fetchFn = globalThis.fetch,
  geoapifyKey = '',
  localPlaces = [],
} = {}) {
  const cache = new Map();
  let lastNominatimAt = 0;

  async function request(url, signal) {
    const response = await fetchFn(url, { signal, headers: { Accept: 'application/json' } });
    if (!response?.ok) throw new Error(`PLACE_API_${response?.status || 'FAILED'}`);
    return response.json();
  }

  async function remote(query, { autocomplete, bias, signal }) {
    if (geoapifyKey) {
      const endpoint = autocomplete ? 'autocomplete' : 'search';
      const params = new URLSearchParams({
        text: query,
        lang: 'th',
        limit: String(SEARCH_LIMIT),
        filter: 'countrycode:th',
        apiKey: geoapifyKey,
      });
      if (bias && coordinate(bias.lat, -90, 90) != null && coordinate(bias.lon, -180, 180) != null) {
        params.set('bias', `proximity:${bias.lon},${bias.lat}`);
      }
      return normalizeGeoapifyResponse(await request(`${GEOAPIFY_BASE}/${endpoint}?${params}`, signal));
    }
    if (autocomplete) return [];
    const waitMs = Math.max(0, 1100 - (Date.now() - lastNominatimAt));
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastNominatimAt = Date.now();
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      countrycodes: 'th',
      addressdetails: '1',
      limit: String(SEARCH_LIMIT),
      'accept-language': 'th,en',
    });
    return normalizeNominatimResponse(await request(`${NOMINATIM_URL}?${params}`, signal));
  }

  async function search(rawQuery, options = {}) {
    const query = sanitizePlaceQuery(rawQuery);
    if (query.length < 2) return [];
    const autocomplete = options.autocomplete === true;
    const key = `${autocomplete ? 'a' : 's'}:${query.toLocaleLowerCase('th')}`;
    if (cache.has(key)) return cache.get(key);
    const local = searchLocal(localPlaces, query);
    let external = [];
    try {
      external = await remote(query, { ...options, autocomplete });
    } catch (error) {
      if (!local.length) throw error;
    }
    const results = dedupePlaces([...local, ...external]).slice(0, SEARCH_LIMIT);
    cache.set(key, results);
    return results;
  }

  return {
    hasAutocomplete: Boolean(geoapifyKey),
    autocomplete(query, options = {}) {
      return search(query, { ...options, autocomplete: true });
    },
    search(query, options = {}) {
      return search(query, { ...options, autocomplete: false });
    },
  };
}
