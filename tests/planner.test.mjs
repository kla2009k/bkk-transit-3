import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildGraph, findRoute } from '../js/planner.js';

const transit = JSON.parse(
  await readFile(new URL('../data/transit.json', import.meta.url), 'utf8'),
);
const graph = buildGraph(transit.lines);

function nodeByThaiName(name) {
  return graph.nodes.find((node) => node.station.name_th === name);
}

test('Siam to Tha Phra remains a one-transfer journey', () => {
  const route = findRoute(graph, nodeByThaiName('สยาม').id, nodeByThaiName('ท่าพระ').id);

  assert.equal(route.transfers, 1);
  assert.deepEqual(route.legs.map((leg) => leg.line.id), ['bts_silom', 'mrt_blue']);
  assert.ok(route.minutes >= 20 && route.minutes <= 35);
});

test('Mo Chit can route to Sukhumvit without a phantom transfer', () => {
  const route = findRoute(graph, nodeByThaiName('หมอชิต').id, nodeByThaiName('อโศก').id);

  assert.equal(route.transfers, 0);
  assert.deepEqual(route.legs.map((leg) => leg.line.id), ['bts_sukhumvit']);
});
