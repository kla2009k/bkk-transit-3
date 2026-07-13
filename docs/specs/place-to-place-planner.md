# Spec: Place-to-Place Rail Journey Planner

## Objective

Turn Bangkok Transit 3D from a station-first competition demo into a place-first
journey product for new riders and anyone unfamiliar with Bangkok rail routes.
Users enter an origin place and destination place; the app chooses suitable
stations, explains the rail journey, identifies the best known destination exit,
shows approximate walking distance, and keeps the existing 3D rehearsal flow.

## Tech Stack

- Static HTML/CSS and browser-native ES modules
- Three.js r170 vendored in `vendor/three/`
- Node.js built-in test runner for pure logic and data regression tests
- Geoapify-compatible place provider when a browser key is configured
- OpenStreetMap Nominatim search-on-submit fallback (no autocomplete traffic)
- No new runtime dependency and no backend requirement

## Commands

- Run: `python -m http.server 8321`
- Test: `node --test`
- Syntax: `node --check js/app.js`
- Data rebuild: `python tools/fix_sukhumvit_data.py`

## Project Structure

- `js/places.js` — provider contract, response validation, caching, URL parsing
- `js/journey.js` — station candidate ranking, place-to-place scoring, exit choice
- `js/place-ui.js` — accessible search UI and journey orchestration
- `tests/` — Node unit and regression tests
- `data/places.json` — small curated Bangkok destination fallback
- `docs/specs/` — product and implementation decisions

## Code Style

Use small browser-native modules with explicit input/output objects:

```js
export function choosePlaceJourney(graph, origin, destination, options = {}) {
  if (!isValidPlace(origin) || !isValidPlace(destination)) return null;
  // Pure deterministic scoring; network and DOM stay outside this module.
}
```

- camelCase functions and variables; UPPER_SNAKE_CASE constants
- pure logic separated from DOM and network effects
- external responses validated and rendered with `textContent`
- additive changes preserve station-to-station deep links and map interaction

## Testing Strategy

- Data regression: Mo Chit exists as N8 and index-keyed datasets remain aligned
- Unit tests: candidate ranking, route scoring, exit selection, provider parsing,
  Google Maps coordinate/query parsing, and invalid external responses
- Integration smoke: serve all app-shell assets over localhost and verify HTTP 200
- Browser verification: desktop/mobile layout, keyboard flow, console and network
  when an isolated browser connector is available

## Boundaries

- Always: label estimated walking/service data, validate third-party responses,
  debounce/cache searches, preserve OSM/API attribution, test before commits
- Ask first: adding paid services, a backend, new runtime dependencies, or live
  incident claims
- Never: commit API keys, render API/user strings with unsafe HTML, claim walking
  distance or service status is real-time when it is estimated

## Success Criteria

- Mo Chit is searchable, coded N8, routable, and fare mapping coverage improves
- A user can search origin and destination places in Thai or English
- The app evaluates multiple nearby station pairs instead of blindly choosing the
  independently nearest two stations
- Results show access station, rail steps, destination station, best known exit,
  approximate walking distance, time, transfers, fare, and 3D rehearsal action
- Without a Geoapify key, curated results and deliberate Nominatim submit search
  still work; with a key, debounced autocomplete is enabled
- Judge/pitch pages are absent from the normal primary navigation and available
  only through `?pitch`
- Google Maps text/URL can be pasted, and installed PWA share-target input is read
- Existing station routes and URL deep links continue to work
- All tests and syntax checks pass; no credential appears in tracked files

## Implementation Plan

1. Add tests and repair index-keyed Sukhumvit data.
2. Add provider and place-journey contracts with pure tests.
3. Build the accessible place search vertical slice and connect to the 3D route.
4. Productize navigation and isolate pitch content.
5. Add Google Maps import/share and shareable place trips.
6. Update PWA cache/docs, perform runtime verification and review.

## Open Questions

- Production Geoapify key provisioning remains an owner/deployment action; the key
  must be origin-restricted and is intentionally not committed.
- Walking distance falls back to a labelled geometric estimate when the optional
  walking provider is unavailable.
