import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function readJson(path) {
  return JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
}

test('BTS Sukhumvit includes Mo Chit between Ha Yaek Lat Phrao and Saphan Khwai', async () => {
  const transit = await readJson('data/transit.json');
  const line = transit.lines.find((candidate) => candidate.id === 'bts_sukhumvit');
  const names = line.stations.map((station) => station.name_en);
  const moChitIndex = names.indexOf('Mo Chit');

  assert.notEqual(moChitIndex, -1);
  assert.equal(names[moChitIndex - 1], 'Ha Yaek Lat Phrao');
  assert.equal(names[moChitIndex + 1], 'Saphan Khwai');
});

test('Mo Chit has official code N8 and every station has a code', async () => {
  const transit = await readJson('data/transit.json');
  const codes = await readJson('data/station_codes.json');
  const line = transit.lines.find((candidate) => candidate.id === 'bts_sukhumvit');
  const moChitIndex = line.stations.findIndex((station) => station.name_en === 'Mo Chit');
  const stationCount = transit.lines.reduce((sum, candidate) => sum + candidate.stations.length, 0);

  assert.equal(codes[`bts_sukhumvit:${moChitIndex}`], 'N8');
  assert.equal(Object.keys(codes).length, stationCount);
});

test('Sukhumvit exits remain attached to the geographically matching station', async () => {
  const transit = await readJson('data/transit.json');
  const exits = await readJson('data/exits.json');
  const line = transit.lines.find((candidate) => candidate.id === 'bts_sukhumvit');
  const asokIndex = line.stations.findIndex((station) => station.name_en === 'Asok');
  const asokExits = exits.exits.filter((exit) => exit.st === `bts_sukhumvit:${asokIndex}`);

  assert.ok(asokExits.length >= 6);
  assert.ok(asokExits.every((exit) => Math.abs(exit.lat - 13.737) < 0.003));
});
