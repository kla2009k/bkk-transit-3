import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildGraph } from '../js/planner.js';
import {
  chooseBestExit,
  choosePlaceJourney,
  groupNearbyStations,
} from '../js/journey.js';

const transit = JSON.parse(
  await readFile(new URL('../data/transit.json', import.meta.url), 'utf8'),
);
const exitData = JSON.parse(
  await readFile(new URL('../data/exits.json', import.meta.url), 'utf8'),
);
const graph = buildGraph(transit.lines);

test('nearby station grouping keeps both Siam line nodes together', () => {
  const groups = groupNearbyStations(graph.nodes);
  const siam = groups.find((group) => group.nodes.some((node) => node.station.name_en === 'Siam'));

  assert.ok(siam);
  assert.deepEqual(
    new Set(siam.nodes.map((node) => node.line.id)),
    new Set(['bts_sukhumvit', 'bts_silom']),
  );
});

test('place journey chooses Mo Chit to Siam without requiring station names from the user', () => {
  const journey = choosePlaceJourney(
    graph,
    { id: 'origin', name: 'Chatuchak destination', lat: 13.8025, lon: 100.5538 },
    { id: 'destination', name: 'Siam Paragon', lat: 13.7462, lon: 100.5348 },
  );

  assert.ok(journey);
  assert.equal(journey.originStation.nameEn, 'Mo Chit');
  assert.equal(journey.destinationStation.nameEn, 'Siam');
  assert.equal(journey.route.transfers, 0);
  assert.ok(journey.access.walkMeters < 100);
  assert.ok(journey.egress.walkMeters < 200);
});

test('best exit is chosen by destination distance and returns a labelled estimate', () => {
  const asokExits = exitData.exits.filter((exit) => exit.st === 'bts_sukhumvit:27');
  const selected = chooseBestExit(
    asokExits,
    { lat: 13.73765, lon: 100.56015 },
  );

  assert.ok(selected);
  assert.ok(selected.walkMeters >= selected.straightMeters);
  assert.match(selected.label, /ทางออก|Exit/);
});

test('invalid place coordinates are rejected at the journey boundary', () => {
  const journey = choosePlaceJourney(
    graph,
    { id: 'bad', name: 'Bad', lat: Number.NaN, lon: 100.5 },
    { id: 'destination', name: 'Siam', lat: 13.7462, lon: 100.5348 },
  );

  assert.equal(journey, null);
});
