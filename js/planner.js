// planner.js — route planning over the transit network.
// Graph: one node per (line, station index); ride edges between consecutive
// stations, transfer edges between nearby stations on different lines
// (interchanges in Bangkok often have different names per system, e.g.
// BTS Asok ↔ MRT Sukhumvit, so proximity beats name matching).

const TRANSFER_MAX_M = 450;      // stations closer than this are walkable
const TRANSFER_PENALTY_M = 1600; // walk + wait, in meter-equivalents (~2 stops)
const RIDE_KMH = 32;             // avg incl. dwell
const TRANSFER_MIN = 6;          // minutes per transfer

export function haversine(a, b) {
  const R = 6371000, d = Math.PI / 180;
  const dLat = (b.lat - a.lat) * d, dLon = (b.lon - a.lon) * d;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function buildGraph(lines) {
  const nodes = [];
  const adj = new Map();   // nodeId → [{to, w, type, line}]

  const addEdge = (a, b, w, type, line) => {
    adj.get(a).push({ to: b, w, type, line });
    adj.get(b).push({ to: a, w, type, line });
  };

  for (const line of lines) {
    line.stations.forEach((st, i) => {
      const id = `${line.id}:${i}`;
      nodes.push({ id, line, idx: i, station: st });
      adj.set(id, []);
    });
    for (let i = 0; i + 1 < line.stations.length; i++) {
      const w = haversine(line.stations[i], line.stations[i + 1]);
      addEdge(`${line.id}:${i}`, `${line.id}:${i + 1}`, w, 'ride', line);
    }
  }

  // transfer edges between different lines, plus zero-ish-cost hops between
  // same-line duplicate nodes (loop lines list a station twice — MRT Blue
  // passes Tha Phra at both ends — and dijkstra must know they're one place)
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if (a.line.id === b.line.id) {
        if (Math.abs(a.idx - b.idx) > 1) {
          const dist = haversine(a.station, b.station);
          if (dist <= 150) addEdge(a.id, b.id, dist + 100, 'transfer', null);
        }
        continue;
      }
      const dist = haversine(a.station, b.station);
      if (dist <= TRANSFER_MAX_M) {
        addEdge(a.id, b.id, dist + TRANSFER_PENALTY_M, 'transfer', null);
      }
    }
  }

  const byId = new Map(nodes.map(n => [n.id, n]));
  // a station is "major" if it participates in a transfer (interchange)
  // or is a terminus — used for label level-of-detail
  for (const n of nodes) {
    const edges = adj.get(n.id);
    n.major = n.idx === 0 || n.idx === n.line.stations.length - 1 ||
      edges.some(e => e.type === 'transfer');
  }
  return { nodes, adj, byId };
}

export function findRoute(graph, fromId, toId) {
  const { adj, byId } = graph;
  const dist = new Map(), prev = new Map();
  dist.set(fromId, 0);
  // simple binary-heap-free dijkstra — network is ~400 nodes, this is fine
  const visited = new Set();
  const queue = new Set([fromId]);

  while (queue.size) {
    let u = null, best = Infinity;
    for (const id of queue) {
      const d = dist.get(id) ?? Infinity;
      if (d < best) { best = d; u = id; }
    }
    queue.delete(u);
    if (u === toId) break;
    visited.add(u);
    for (const e of adj.get(u)) {
      if (visited.has(e.to)) continue;
      const nd = best + e.w;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, { from: u, edge: e });
        queue.add(e.to);
      }
    }
  }
  if (!prev.has(toId) && fromId !== toId) return null;

  // reconstruct node path
  const path = [];
  let cur = toId;
  while (cur !== fromId) {
    const p = prev.get(cur);
    path.unshift({ node: byId.get(cur), edge: p.edge });
    cur = p.from;
  }

  // group into ride legs (transfer edges break legs; transfer hops at the
  // very start/end vanish naturally since they produce no ride leg)
  const seq = [{ node: byId.get(fromId), edgeIn: null },
               ...path.map(s => ({ node: s.node, edgeIn: s.edge }))];
  const legs = [];
  let curLeg = null;
  for (let i = 1; i < seq.length; i++) {
    const { node, edgeIn } = seq[i];
    if (edgeIn.type === 'ride') {
      if (!curLeg || curLeg.line.id !== edgeIn.line.id) {
        curLeg = { line: edgeIn.line, nodes: [seq[i - 1].node], distM: 0 };
        legs.push(curLeg);
      }
      curLeg.nodes.push(node);
      curLeg.distM += edgeIn.w;
    } else {
      curLeg = null;
    }
  }
  const cleaned = legs.filter(l => l.nodes.length >= 2);
  if (!cleaned.length) return null;

  const totalM = cleaned.reduce((s, l) => s + l.distM, 0);
  const transfers = cleaned.length - 1;
  const rideMin = (totalM / 1000) / RIDE_KMH * 60;
  const minutes = Math.round(rideMin + transfers * TRANSFER_MIN);
  const stationCount = cleaned.reduce((s, l) => s + l.nodes.length - 1, 0);

  return { legs: cleaned, totalM, transfers, minutes, stationCount };
}