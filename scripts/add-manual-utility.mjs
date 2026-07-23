/**
 * Adds a manually-authored utility to the /utility map from a config file.
 *
 * Use this for utilities that have NO fetchable federal service-territory
 * polygon — typically because they merged into another utility and their own
 * EIA-861 filing was retired (e.g. Gulf Power -> FPL, 2021). The territory is
 * authored from the counties the utility served (US Census TIGER), which is a
 * documented approximation suited to this regional-overview map.
 *
 * If the utility DOES still have its own federal polygon, do NOT use this —
 * add it to src/lib/utility-name-map.json with its eiaIds and rebuild with
 * `node scripts/download-utility-territories.mjs --force` instead.
 *
 * Usage:
 *   node scripts/add-manual-utility.mjs scripts/utilities/<name>.json [--dry-run]
 *
 * It edits the committed data files directly (the prebuild generators skip
 * when their output exists, so a normal build keeps these edits):
 *   - public/utility-data/utility-territories.json
 *   - public/utility-data/field-locations.json
 *   - src/lib/utility-name-map.json
 * Idempotent: re-running replaces any prior entry with the same id.
 *
 * A --force rebuild of the generators SKIPS manual entries (empty eiaIds);
 * re-run this script afterward to restore them.
 *
 * Config schema (see scripts/utilities/gulf-power.json for a worked example):
 * {
 *   "id": "gulf-power",                 // unique slug
 *   "name": "Gulf Power",               // display + search name
 *   "clientNames": ["Gulf Power"],       // aliases (what the client calls it)
 *   "parentCo": "NextEra Energy",
 *   "statesListed": "FL",
 *   "states": ["FL"],
 *   "customers": 460000,
 *   "website": "https://www.fpl.com",
 *   "note": "…provenance + methodology…",
 *   "entity": { "eiaId": "7801", "name": "GULF POWER CO", "holdingCo": "NEXTERA ENERGY INC" },
 *   "hqAddress": "One Energy Place, Pensacola, FL 32520",
 *   "territory": { "stateFips": "12", "stateAbbr": "FL",
 *                  "counties": ["Escambia", "Santa Rosa", …] },   // county BASENAMEs
 *   "plantsOwnerEiaId": 6452,             // pull this owner's EIA-860 plants inside the territory (or null)
 *   "stripClientNameFrom": { "utilityId": "fpl", "clientName": "Gulf Power", "newNote": "…" }  // or null
 * }
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as turf from '@turf/turf';

const CONFIG_PATH = process.argv[2];
const DRY_RUN = process.argv.includes('--dry-run');
if (!CONFIG_PATH) {
  console.error('Usage: node scripts/add-manual-utility.mjs <config.json> [--dry-run]');
  process.exit(1);
}

const ROOT = process.cwd();
const TERR_FILE = join(ROOT, 'public', 'utility-data', 'utility-territories.json');
const FIELD_FILE = join(ROOT, 'public', 'utility-data', 'field-locations.json');
const NAMEMAP_FILE = join(ROOT, 'src', 'lib', 'utility-name-map.json');
const MEG_FILE = join(ROOT, 'src', 'lib', 'meg-locations.json');

const cfg = JSON.parse(readFileSync(join(ROOT, CONFIG_PATH), 'utf8'));
const terr = JSON.parse(readFileSync(TERR_FILE, 'utf8'));
const field = JSON.parse(readFileSync(FIELD_FILE, 'utf8'));
const nameMap = JSON.parse(readFileSync(NAMEMAP_FILE, 'utf8'));
const megLocations = JSON.parse(readFileSync(MEG_FILE, 'utf8'));

const RADII_MILES = [25, 50, 100];
const SIMPLIFY_TOLERANCE = 0.01;
const COORD_PRECISION = 4;
const COUNTY_URL = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query';
const SUBSTATIONS_URL = 'https://services1.arcgis.com/PMShNXB1carltgVf/arcgis/rest/services/Electric_Substations/FeatureServer/0';
const PLANTS_URL = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Power_Plants_in_the_US/FeatureServer/0';

// --- helpers (mirror scripts/download-utility-territories.mjs) ---
const EARTH_RADIUS_MILES = 3958.8;
const toRad = (d) => (d * Math.PI) / 180;
function haversineMiles(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function nearestMegMiles(lat, lng) {
  let min = Infinity;
  for (const l of megLocations) { const d = haversineMiles(lat, lng, l.lat, l.lng); if (d < min) min = d; }
  return Math.round(min * 10) / 10;
}
function unionAll(features) {
  if (features.length === 1) return features[0];
  let acc = features[0];
  for (let i = 1; i < features.length; i++) acc = turf.union(turf.featureCollection([acc, features[i]]));
  return acc;
}
function distanceToTerritory(point, tf) {
  if (turf.booleanPointInPolygon(point, tf)) return 0;
  let min = Infinity;
  const lines = turf.polygonToLine(tf);
  const lfs = lines.type === 'FeatureCollection' ? lines.features : [lines];
  for (const line of lfs) {
    const geoms = line.geometry.type === 'MultiLineString'
      ? line.geometry.coordinates.map((c) => turf.lineString(c)) : [line];
    for (const g of geoms) { const d = turf.pointToLineDistance(point, g, { units: 'miles' }); if (d < min) min = d; }
  }
  return min;
}
async function arcgis(base, params) {
  const search = new URLSearchParams({ f: 'json', ...params });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${base}/query?${search}`, { signal: AbortSignal.timeout(120000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      return data;
    } catch (err) { if (attempt === 3) throw err; await new Promise((r) => setTimeout(r, 2000 * attempt)); }
  }
}

// --- 1. Territory from counties ---
const { stateFips, stateAbbr, counties } = cfg.territory;
console.log(`Fetching ${counties.length} counties in state ${stateAbbr}...`);
const nameList = counties.map((n) => `'${n}'`).join(',');
const countyGeo = await (async () => {
  const search = new URLSearchParams({
    where: `STATE='${stateFips}' AND BASENAME IN (${nameList})`,
    outFields: 'BASENAME', returnGeometry: 'true', outSR: '4326', f: 'geojson',
  });
  const res = await fetch(`${COUNTY_URL}?${search}`, { signal: AbortSignal.timeout(120000) });
  return res.json();
})();
if (!countyGeo.features || countyGeo.features.length !== counties.length) {
  throw new Error(`Expected ${counties.length} counties, got ${countyGeo.features?.length}. Check county BASENAMEs and stateFips.`);
}
console.log(`  got: ${countyGeo.features.map((f) => f.properties.BASENAME).join(', ')}`);
const merged = unionAll(countyGeo.features.map((f) => turf.feature(f.geometry)));
const simplified = turf.truncate(
  turf.cleanCoords(turf.simplify(merged, { tolerance: SIMPLIFY_TOLERANCE, highQuality: false, mutate: false })),
  { precision: COORD_PRECISION, mutate: true });
const geometry = simplified.geometry.type === 'Polygon'
  ? { type: 'MultiPolygon', coordinates: [simplified.geometry.coordinates] } : simplified.geometry;
const tf = turf.feature(geometry);
const areaSqMi = Math.round(turf.area(tf) / 2589988.11);
console.log(`  territory area: ${areaSqMi} sq mi`);

// --- 2. Coverage stats vs MEG ---
const megPoints = megLocations.map((l) => turf.point([l.lng, l.lat], { name: l.name }));
const stats = {};
for (const radius of RADII_MILES) {
  const union = unionAll(megPoints.map((p) => turf.buffer(p, radius, { units: 'miles', steps: 32 })));
  let pct = 0;
  const inter = turf.intersect(turf.featureCollection([tf, union]));
  if (inter) pct = turf.area(inter) / turf.area(tf);
  stats[radius] = { coveredPct: Math.min(1, Math.round(pct * 1000) / 1000) };
}
let minEdge = Infinity, nearestName = null;
for (const p of megPoints) { const d = distanceToTerritory(p, tf); if (d < minEdge) { minEdge = d; nearestName = p.properties.name; } }
stats.nearestMegFromEdgeMiles = Math.round(minEdge * 10) / 10;
stats.nearestMegLocation = nearestName;

// --- 3. HQ ---
let hq;
try {
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(cfg.hqAddress)}&benchmark=Public_AR_Current&format=json`;
  const m = (await (await fetch(url, { signal: AbortSignal.timeout(20000) })).json())?.result?.addressMatches?.[0];
  hq = m ? { lat: Math.round(m.coordinates.y * 1e5) / 1e5, lng: Math.round(m.coordinates.x * 1e5) / 1e5, address: cfg.hqAddress, precision: 'address' } : null;
} catch { hq = null; }
if (!hq) { const c = turf.centerOfMass(tf).geometry.coordinates; hq = { lat: Math.round(c[1] * 1e5) / 1e5, lng: Math.round(c[0] * 1e5) / 1e5, address: cfg.hqAddress || null, precision: 'territory-center' }; }
let minHq = Infinity;
for (const l of megLocations) { const d = haversineMiles(hq.lat, hq.lng, l.lat, l.lng); if (d < minHq) minHq = d; }
stats.nearestMegFromHqMiles = Math.round(minHq * 10) / 10;
console.log(`  coverage@50mi: ${(stats[50].coveredPct * 100).toFixed(1)}%  nearest MEG: ${nearestName} (${stats.nearestMegFromEdgeMiles} mi)`);

// --- 4. Utility record ---
const utility = {
  id: cfg.id, name: cfg.name, clientNames: cfg.clientNames, parentCo: cfg.parentCo || null,
  statesListed: cfg.statesListed, states: cfg.states, customers: cfg.customers ?? null,
  areaSqMi, website: cfg.website || null, note: cfg.note || null, hq,
  entities: [{ eiaId: cfg.entity.eiaId, name: cfg.entity.name, state: cfg.states[0] || null, type: 'INVESTOR OWNED', customers: cfg.customers ?? null, holdingCo: cfg.entity.holdingCo || null, address: cfg.hqAddress || null, website: null, sourceDate: null, valDate: null, dataYear: null }],
  stats, geometry,
};

// --- 5. Field locations ---
console.log(`Fetching ${stateAbbr} substations (in service)...`);
const subs = [];
let offset = 0;
for (;;) {
  const data = await arcgis(SUBSTATIONS_URL, {
    where: `STATE = '${stateAbbr}' AND STATUS = 'IN SERVICE'`,
    outFields: 'NAME,MAX_VOLT,LATITUDE,LONGITUDE', returnGeometry: 'false',
    resultOffset: String(offset), resultRecordCount: '2000', orderByFields: 'OBJECTID_1',
  });
  const feats = data.features || [];
  for (const f of feats) {
    const a = f.attributes, lat = a.LATITUDE, lng = a.LONGITUDE;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    if (!turf.booleanPointInPolygon(turf.point([lng, lat]), tf)) continue;
    subs.push([Math.round(lng * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4, nearestMegMiles(lat, lng), a.NAME || null, a.MAX_VOLT > 0 ? a.MAX_VOLT : null]);
  }
  offset += feats.length;
  if (!data.exceededTransferLimit && feats.length < 2000) break;
}
console.log(`  substations in territory: ${subs.length}`);

const plants = [];
if (cfg.plantsOwnerEiaId) {
  console.log(`Fetching EIA-860 plants owned by ${cfg.plantsOwnerEiaId} inside the territory...`);
  const data = await arcgis(PLANTS_URL, { where: `Utility_ID=${cfg.plantsOwnerEiaId}`, outFields: 'Plant_Name,Total_MW,PrimSource,Latitude,Longitude', returnGeometry: 'true', outSR: '4326', resultRecordCount: '2000' });
  for (const f of data.features || []) {
    const a = f.attributes, lng = a.Longitude ?? f.geometry?.x, lat = a.Latitude ?? f.geometry?.y;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    if (!turf.booleanPointInPolygon(turf.point([lng, lat]), tf)) continue;
    plants.push([Math.round(lng * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4, nearestMegMiles(lat, lng), a.Plant_Name || null, a.Total_MW ? Math.round(a.Total_MW) : null, a.PrimSource || null]);
  }
  console.log(`  plants in territory: ${plants.length}`);
}

// --- 6. Optionally strip an alias off another utility so search resolves here ---
if (cfg.stripClientNameFrom) {
  const { utilityId, clientName, newNote } = cfg.stripClientNameFrom;
  for (const store of [terr.utilities, nameMap.utilities]) {
    const u = store.find((x) => x.id === utilityId);
    if (u) { u.clientNames = (u.clientNames || []).filter((n) => n !== clientName); if (newNote) u.note = newNote; }
  }
}

// --- 7. Splice in (idempotent) ---
if (DRY_RUN) {
  console.log(`\n[dry-run] would add "${cfg.name}" (${cfg.id}): area ${areaSqMi} sq mi, ${subs.length} substations, ${plants.length} plants; coverage 25/50/100 = ${stats[25].coveredPct}/${stats[50].coveredPct}/${stats[100].coveredPct}`);
  process.exit(0);
}
terr.utilities = terr.utilities.filter((u) => u.id !== cfg.id);
const anchor = cfg.stripClientNameFrom?.utilityId;
const idx = anchor ? terr.utilities.findIndex((u) => u.id === anchor) : -1;
terr.utilities.splice(idx >= 0 ? idx + 1 : terr.utilities.length, 0, utility);

field.byUtility[cfg.id] = { substations: subs, plants };

nameMap.utilities = nameMap.utilities.filter((u) => u.id !== cfg.id);
const nmIdx = anchor ? nameMap.utilities.findIndex((u) => u.id === anchor) : -1;
nameMap.utilities.splice(nmIdx >= 0 ? nmIdx + 1 : nameMap.utilities.length, 0, {
  id: cfg.id, displayName: cfg.name, clientNames: cfg.clientNames, parentCo: cfg.parentCo || null,
  statesListed: cfg.statesListed, eiaIds: [], eiaNames: [],
  note: `Manually authored (no federal polygon). Config: ${CONFIG_PATH}. eiaIds intentionally empty — a --force rebuild SKIPS this entry; re-run scripts/add-manual-utility.mjs afterward.`,
  website: cfg.website || null,
});

writeFileSync(TERR_FILE, JSON.stringify(terr));
writeFileSync(FIELD_FILE, JSON.stringify(field));
writeFileSync(NAMEMAP_FILE, JSON.stringify(nameMap, null, 2) + '\n');
console.log(`\nDone. utilities: ${terr.utilities.length}; ${cfg.id}: ${subs.length} substations, ${plants.length} plants, ${areaSqMi} sq mi.`);
console.log('Next: update UTILITY_DATA_REPORT.md, verify (npx tsc --noEmit + local build), then deploy.');
