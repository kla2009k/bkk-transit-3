import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPlaceProvider,
  normalizeGeoapifyResponse,
  normalizeNominatimResponse,
  parseGoogleMapsInput,
  sanitizePlaceQuery,
} from '../js/places.js';

test('Geoapify response is normalized and invalid features are discarded', () => {
  const places = normalizeGeoapifyResponse({
    features: [
      {
        properties: {
          place_id: 'abc',
          name: 'Siam Paragon',
          formatted: 'Siam Paragon, Pathum Wan, Bangkok',
          lat: 13.7462,
          lon: 100.5348,
          result_type: 'amenity',
        },
      },
      { properties: { place_id: 'bad', name: '<script>', lat: 'nope', lon: 100 } },
    ],
  });

  assert.equal(places.length, 1);
  assert.equal(places[0].name, 'Siam Paragon');
  assert.equal(places[0].source, 'geoapify');
});

test('Nominatim response is normalized without trusting display strings as markup', () => {
  const places = normalizeNominatimResponse([
    {
      place_id: 42,
      display_name: '<b>Wat Arun</b>, Bangkok',
      name: 'Wat Arun',
      lat: '13.7437',
      lon: '100.4889',
      type: 'attraction',
    },
  ]);

  assert.equal(places[0].address, '<b>Wat Arun</b>, Bangkok');
  assert.equal(places[0].lat, 13.7437);
  assert.equal(places[0].source, 'nominatim');
});

test('Google Maps coordinates and query links are parsed without fetching arbitrary URLs', () => {
  assert.deepEqual(
    parseGoogleMapsInput('https://www.google.com/maps/place/Test/@13.7563,100.5018,17z'),
    { type: 'coordinates', lat: 13.7563, lon: 100.5018, label: 'สถานที่จาก Google Maps' },
  );
  assert.deepEqual(
    parseGoogleMapsInput('https://www.google.com/maps/search/?api=1&query=วัดอรุณ'),
    { type: 'query', query: 'วัดอรุณ' },
  );
});

test('place queries are length-bounded and whitespace-normalized', () => {
  assert.equal(sanitizePlaceQuery('  Siam   Paragon  '), 'Siam Paragon');
  assert.equal(sanitizePlaceQuery('x'.repeat(400)).length, 160);
});

test('Geoapify provider uses the documented autocomplete boundary and validates output', async () => {
  let requestedUrl = '';
  const provider = createPlaceProvider({
    geoapifyKey: 'test-key',
    fetchFn: async (url) => {
      requestedUrl = String(url);
      return {
        ok: true,
        json: async () => ({
          features: [{
            properties: {
              place_id: 'siam', name: 'Siam Paragon', formatted: 'Bangkok',
              lat: 13.7462, lon: 100.5348,
            },
          }],
        }),
      };
    },
  });

  const results = await provider.autocomplete('Siam');

  assert.match(requestedUrl, /\/autocomplete\?/);
  assert.match(requestedUrl, /filter=countrycode%3Ath/);
  assert.equal(results[0].id, 'siam');
});

test('without a key autocomplete stays local and does not hit Nominatim', async () => {
  let requests = 0;
  const provider = createPlaceProvider({
    localPlaces: [{ id: 'wat-arun', name: 'วัดอรุณ', address: 'บางกอกใหญ่', lat: 13.7437, lon: 100.4889 }],
    fetchFn: async () => { requests += 1; throw new Error('should not fetch'); },
  });

  const results = await provider.autocomplete('วัดอรุณ');

  assert.equal(results[0].source, 'curated');
  assert.equal(requests, 0);
});
