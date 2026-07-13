// Pure place-to-place journey logic. DOM and network effects live elsewhere.
import { findRoute, haversine } from './planner.js';

const STATION_GROUP_M = 180;
const WALK_DISTANCE_FACTOR = 1.25;
const WALK_METERS_PER_MINUTE = 75;

function validCoordinate(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

export function isValidPlace(place) {
  return Boolean(place)
    && validCoordinate(place.lat, -90, 90)
    && validCoordinate(place.lon, -180, 180);
}

export function estimateWalkingMeters(a, b) {
  if (!isValidPlace(a) || !isValidPlace(b)) return null;
  return Math.round(haversine(a, b) * WALK_DISTANCE_FACTOR);
}

export function groupNearbyStations(nodes, maxDistanceM = STATION_GROUP_M) {
  const groups = [];
  for (const node of nodes) {
    if (!isValidPlace(node.station)) continue;
    let group = groups.find((candidate) =>
      haversine(candidate, node.station) <= maxDistanceM,
    );
    if (!group) {
      group = { lat: node.station.lat, lon: node.station.lon, nodes: [] };
      groups.push(group);
    }
    group.nodes.push(node);
    group.lat = group.nodes.reduce((sum, item) => sum + item.station.lat, 0) / group.nodes.length;
    group.lon = group.nodes.reduce((sum, item) => sum + item.station.lon, 0) / group.nodes.length;
  }
  return groups;
}

export function rankStationGroups(groups, place, limit = 5) {
  if (!isValidPlace(place)) return [];
  return groups
    .map((group) => ({
      ...group,
      straightMeters: Math.round(haversine(place, group)),
      walkMeters: estimateWalkingMeters(place, group),
    }))
    .sort((a, b) => a.walkMeters - b.walkMeters)
    .slice(0, Math.max(1, limit));
}

function stationSummary(node) {
  return {
    nodeId: node.id,
    nameTh: node.station.name_th || node.station.name_en || '',
    nameEn: node.station.name_en || node.station.name_th || '',
    lat: node.station.lat,
    lon: node.station.lon,
    lineId: node.line.id,
  };
}

export function choosePlaceJourney(graph, origin, destination, options = {}) {
  if (!graph?.nodes?.length || !isValidPlace(origin) || !isValidPlace(destination)) {
    return null;
  }
  const candidateLimit = options.candidateLimit ?? 5;
  const groups = options.stationGroups ?? groupNearbyStations(graph.nodes);
  const origins = rankStationGroups(groups, origin, candidateLimit);
  const destinations = rankStationGroups(groups, destination, candidateLimit);
  let best = null;

  for (const originGroup of origins) {
    for (const destinationGroup of destinations) {
      for (const fromNode of originGroup.nodes) {
        for (const toNode of destinationGroup.nodes) {
          if (fromNode.id === toNode.id) continue;
          const route = findRoute(graph, fromNode.id, toNode.id);
          if (!route) continue;
          const accessMinutes = Math.ceil(originGroup.walkMeters / WALK_METERS_PER_MINUTE);
          const egressMinutes = Math.ceil(destinationGroup.walkMeters / WALK_METERS_PER_MINUTE);
          const totalMinutes = accessMinutes + route.minutes + egressMinutes;
          const score = totalMinutes + route.transfers * 1.5;
          if (best && best.score <= score) continue;
          best = {
            score,
            totalMinutes,
            origin,
            destination,
            originGroup,
            destinationGroup,
            originStation: stationSummary(fromNode),
            destinationStation: stationSummary(toNode),
            access: {
              straightMeters: originGroup.straightMeters,
              walkMeters: originGroup.walkMeters,
              minutes: accessMinutes,
              isEstimated: true,
            },
            egress: {
              straightMeters: destinationGroup.straightMeters,
              walkMeters: destinationGroup.walkMeters,
              minutes: egressMinutes,
              isEstimated: true,
            },
            route,
          };
        }
      }
    }
  }
  return best;
}

export function chooseBestExit(exits, destination) {
  if (!Array.isArray(exits) || !exits.length || !isValidPlace(destination)) return null;
  let best = null;
  for (const exit of exits) {
    if (!isValidPlace(exit)) continue;
    const straightMeters = Math.round(haversine(exit, destination));
    if (best && best.straightMeters <= straightMeters) continue;
    const fallback = exit.name ? String(exit.name) : 'Exit';
    best = {
      ...exit,
      label: exit.ref ? `ทางออก ${String(exit.ref)}` : fallback,
      straightMeters,
      walkMeters: estimateWalkingMeters(exit, destination),
      isEstimated: true,
    };
  }
  return best;
}
