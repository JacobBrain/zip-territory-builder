/**
 * One-off supplement: adds "Gulf Power" to the /utility map as its own
 * territory covering the FL Panhandle.
 *
 * Why this is a manual addition and not a name-map + --force rebuild:
 * Gulf Power Company legally merged into Florida Power & Light (FPL, EIA 6452)
 * in 2021 and no longer files Form EIA-861 separately. The HIFLD/EIA "Electric
 * Retail Service Territories" dataset therefore has NO standalone Gulf Power
 * polygon (verified: a NAME search returns only "Gulf Coast Electric Coop"),
 * and FPL's committed boundary is the 2018 peninsula footprint that does not
 * reach the Panhandle. So the Panhandle is currently a hole in the map and the
 * client's "Gulf Power" search finds nothing. There is no federal polygon to
 * fetch by EIA ID, so the territory is authored from the eight Northwest-
 * Florida counties Gulf Power served (Escambia, Santa Rosa, Okaloosa, Walton,
 * Holmes, Washington, Bay, Jackson) — a documented approximation suited to
 * this regional-overview map, not operational dispatch.
 *
 * This edits the committed data files directly (the prebuild generators skip
 * when their output exists, so a normal build keeps these edits):
 *   - public/utility-data/utility-territories.json  (adds gulf-power; edits fpl)
 *   - public/utility-data/field-locations.json       (adds gulf-power)
 *   - src/lib/utility-name-map.json                  (adds gulf-power; edits fpl)
 *
 * Field locations reuse the pipeline's methods: substations matched by falling
 * inside the territory (HIFLD, territory-based); plants are the FPL-owned
 * (EIA 6452) plants located in the Panhandle — the former Gulf Power fleet.
 *
 * Run: node scripts/add-gulf-power.mjs   (idempotent — replaces any prior gulf-power)
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as turf from '@turf/turf';

const ROOT = process.cwd();
const TERR_FILE = join(ROOT, 'public', 'utility-data', 'utility-territories.json');
const FIELD_FILE = join(ROOT, 'public', 'utility-data', 'field-locations.json');
const NAMEMAP_FILE = join(ROOT, 'src', 'lib', 'utility-name-map.json');
const MEG_FILE = join(ROOT, 'src', 'lib', 'meg-locations.json');

const RADII_MILES = [25, 50, 100];
const SIMPLIFY_TOLERANCE = 0.01;
const COORD_PRECISION = 4;

// Gulf Power's eight Northwest-Florida counties (FIPS in state 12).
const PANHANDLE_COUNTIES = ['Escambia', 'Santa Rosa', 'Okaloosa', 'Walton', 'Holmes', 'Washington', 'Bay', 'Jackson'];
const COUNTY_URL =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query';
const SUBSTATIONS_URL =
  'https://services1.arcgis.com/PMShNXB1carltgVf/arcgis/rest/services/Electric_Substations/FeatureServer/0';
const PLANTS_URL =
  'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Power_Plants_in_the_US/FeatureServer/0';

const terr = JSON.parse(readFileSync(TERR_FILE, 'utf8'));
const field = JSON.parse(readFileSync(FIELD_FILE, 'utf8'));
const nameMap = JSON.parse(readFileSync(NAMEMAP_FILE, 'utf8'));
const megLocations = JSON.parse(readFileSync(MEG_FILE, 'utf8'));

// --- helpers copied from the pipeline for identical results ---
const EARTH_RADIUS_MILES = 3958.8;
const toRad = (d) => (d * Math.PI) / 180;
function haversineMiles(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function nearestMegMiles(lat, lng) {
  let min = Infinity;
  for (const l of megLocations) {
    const d = haversineMiles(lat, lng, l.lat, l.lng);
    if (d < min) min = d;
  }
  return Math.round(min * 10) / 10;
}
function unionAll(features) {
  let acc = features[0];
  for (let i = 1; i < features.length; i++) acc = turf.union(turf.featureCollection([acc, features[i]]));
  return acc;
}
function distanceToTerritory(point, territoryFeature) {
  if (turf.booleanPointInPolygon(point, territoryFeature)) return 0;
  let min = Infinity;
  const lines = turf.polygonToLine(territoryFeature);
  const lineFeatures = lines.type === 'FeatureCollection' ? lines.features : [lines];
  for (const line of lineFeatures) {
    const geoms = line.geometry.type === 'MultiLineString'
      ? line.geometry.coordinates.map((c) => turf.lineString(c))
      : [line];
    for (const g of geoms) {
      const d = turf.pointToLineDistance(point, g, { units: 'miles' });
      if (d < min) min = d;
    }
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
    } catch (err) {
      if (attempt === 3) throw err;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

// --- 1. Build the territory from the eight counties ---
console.log(`Fetching ${PANHANDLE_COUNTIES.length} Panhandle county boundaries...`);
const nameList = PANHANDLE_COUNTIES.map((n) => `'${n}'`).join(',');
const countyGeo = await (async () => {
  const search = new URLSearchParams({
    where: `STATE='12' AND BASENAME IN (${nameList})`,
    outFields: 'BASENAME', returnGeometry: 'true', outSR: '4326', f: 'geojson',
  });
  const res = await fetch(`${COUNTY_URL}?${search}`, { signal: AbortSignal.timeout(120000) });
  return res.json();
})();
if (!countyGeo.features || countyGeo.features.length !== PANHANDLE_COUNTIES.length) {
  throw new Error(`Expected ${PANHANDLE_COUNTIES.length} counties, got ${countyGeo.features?.length}`);
}
console.log(`  got: ${countyGeo.features.map((f) => f.properties.BASENAME).join(', ')}`);

const merged = unionAll(countyGeo.features.map((f) => turf.feature(f.geometry)));
const simplified = turf.truncate(
  turf.cleanCoords(turf.simplify(merged, { tolerance: SIMPLIFY_TOLERANCE, highQuality: false, mutate: false })),
  { precision: COORD_PRECISION, mutate: true }
);
const geometry = simplified.geometry.type === 'Polygon'
  ? { type: 'MultiPolygon', coordinates: [simplified.geometry.coordinates] }
  : simplified.geometry;
const territoryFeature = turf.feature(geometry);
const areaSqMi = Math.round(turf.area(territoryFeature) / 2589988.11);
console.log(`  territory area: ${areaSqMi} sq mi`);

// --- 2. Coverage stats vs MEG locations (same method as the pipeline) ---
const megPoints = megLocations.map((l) => turf.point([l.lng, l.lat], { name: l.name }));
const stats = {};
for (const radius of RADII_MILES) {
  const buffers = megPoints.map((p) => turf.buffer(p, radius, { units: 'miles', steps: 32 }));
  const union = unionAll(buffers);
  let coveredPct = 0;
  const intersection = turf.intersect(turf.featureCollection([territoryFeature, union]));
  if (intersection) coveredPct = turf.area(intersection) / turf.area(territoryFeature);
  stats[radius] = { coveredPct: Math.min(1, Math.round(coveredPct * 1000) / 1000) };
}
let minEdge = Infinity, nearestName = null;
for (const p of megPoints) {
  const d = distanceToTerritory(p, territoryFeature);
  if (d < minEdge) { minEdge = d; nearestName = p.properties.name; }
}
stats.nearestMegFromEdgeMiles = Math.round(minEdge * 10) / 10;
stats.nearestMegLocation = nearestName;

// --- 3. HQ pin: Gulf Power HQ, One Energy Place, Pensacola ---
const hqAddress = 'One Energy Place, Pensacola, FL 32520';
let hq;
try {
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(hqAddress)}&benchmark=Public_AR_Current&format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const m = (await res.json())?.result?.addressMatches?.[0];
  hq = m
    ? { lat: Math.round(m.coordinates.y * 1e5) / 1e5, lng: Math.round(m.coordinates.x * 1e5) / 1e5, address: hqAddress, precision: 'address' }
    : null;
} catch { hq = null; }
if (!hq) {
  // Pensacola fallback
  hq = { lat: 30.4419, lng: -87.2008, address: hqAddress, precision: 'address' };
}
let minHq = Infinity;
for (const l of megLocations) {
  const d = haversineMiles(hq.lat, hq.lng, l.lat, l.lng);
  if (d < minHq) minHq = d;
}
stats.nearestMegFromHqMiles = Math.round(minHq * 10) / 10;
console.log(`  coverage@50mi: ${(stats[50].coveredPct * 100).toFixed(1)}%  nearest MEG: ${nearestName} (${stats.nearestMegFromEdgeMiles} mi)`);

// --- 4. Assemble the utility record ---
const gulfPower = {
  id: 'gulf-power',
  name: 'Gulf Power',
  clientNames: ['Gulf Power'],
  parentCo: 'NextEra Energy',
  statesListed: 'FL',
  states: ['FL'],
  customers: 460000,
  areaSqMi,
  website: 'https://www.fpl.com',
  note: 'Gulf Power Company merged into Florida Power & Light (FPL) in 2021 and no longer files a separate federal service-territory boundary, so it was missing from the map. Shown here as its historical Northwest-Florida service area — the eight counties Gulf Power served (Escambia, Santa Rosa, Okaloosa, Walton, Holmes, Washington, Bay, Jackson) — approximated from county boundaries (US Census TIGER). Customer count is Gulf Power’s pre-merger figure (~460,000).',
  hq,
  entities: [
    {
      eiaId: '6452',
      name: 'FLORIDA POWER & LIGHT CO (formerly Gulf Power Co)',
      state: 'FL',
      type: 'INVESTOR OWNED',
      customers: null,
      holdingCo: 'NEXTERA ENERGY INC',
      address: hqAddress,
      website: null,
      sourceDate: null,
      valDate: null,
      dataYear: null,
    },
  ],
  stats,
  geometry,
};

// --- 5. Field locations: substations (territory-based), plants (former Gulf Power fleet) ---
console.log('Fetching FL substations (in service)...');
const subs = [];
let offset = 0;
for (;;) {
  const data = await arcgis(SUBSTATIONS_URL, {
    where: "STATE = 'FL' AND STATUS = 'IN SERVICE'",
    outFields: 'NAME,MAX_VOLT,LATITUDE,LONGITUDE',
    returnGeometry: 'false', resultOffset: String(offset), resultRecordCount: '2000', orderByFields: 'OBJECTID_1',
  });
  const feats = data.features || [];
  for (const f of feats) {
    const a = f.attributes, lat = a.LATITUDE, lng = a.LONGITUDE;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    if (!turf.booleanPointInPolygon(turf.point([lng, lat]), territoryFeature)) continue;
    subs.push([Math.round(lng * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4, nearestMegMiles(lat, lng), a.NAME || null, a.MAX_VOLT > 0 ? a.MAX_VOLT : null]);
  }
  offset += feats.length;
  if (!data.exceededTransferLimit && feats.length < 2000) break;
}
console.log(`  substations in Gulf Power territory: ${subs.length}`);

console.log('Fetching FPL-owned plants in the Panhandle (former Gulf Power fleet)...');
const plants = [];
{
  const data = await arcgis(PLANTS_URL, {
    where: 'Utility_ID=6452',
    outFields: 'Plant_Name,Total_MW,PrimSource,Latitude,Longitude',
    returnGeometry: 'true', outSR: '4326', resultRecordCount: '2000',
  });
  for (const f of data.features || []) {
    const a = f.attributes;
    const lng = a.Longitude ?? f.geometry?.x;
    const lat = a.Latitude ?? f.geometry?.y;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    if (!turf.booleanPointInPolygon(turf.point([lng, lat]), territoryFeature)) continue;
    plants.push([Math.round(lng * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4, nearestMegMiles(lat, lng), a.Plant_Name || null, a.Total_MW ? Math.round(a.Total_MW) : null, a.PrimSource || null]);
  }
}
console.log(`  plants in Gulf Power territory: ${plants.length}`);

// --- 6. Edit FPL: drop the "Gulf Power" alias so search resolves to the new entry ---
function stripGulfFromFpl(entry) {
  if (!entry) return;
  entry.clientNames = (entry.clientNames || []).filter((n) => n !== 'Gulf Power');
  entry.note = 'Client list combined "Florida Power & Light (FPL)" and "Gulf Power"; Gulf Power merged into FPL in 2021 but its former Northwest-Florida (Panhandle) territory is outside FPL’s federal service-territory boundary, so it is mapped separately as "Gulf Power".';
}
stripGulfFromFpl(terr.utilities.find((u) => u.id === 'fpl'));
stripGulfFromFpl(nameMap.utilities.find((u) => u.id === 'fpl'));

// --- 7. Splice records in (idempotent) ---
terr.utilities = terr.utilities.filter((u) => u.id !== 'gulf-power');
const fplIdx = terr.utilities.findIndex((u) => u.id === 'fpl');
terr.utilities.splice(fplIdx >= 0 ? fplIdx + 1 : terr.utilities.length, 0, gulfPower);

field.byUtility['gulf-power'] = { substations: subs, plants };

nameMap.utilities = nameMap.utilities.filter((u) => u.id !== 'gulf-power');
const nmFplIdx = nameMap.utilities.findIndex((u) => u.id === 'fpl');
nameMap.utilities.splice(nmFplIdx >= 0 ? nmFplIdx + 1 : nameMap.utilities.length, 0, {
  id: 'gulf-power',
  displayName: 'Gulf Power',
  clientNames: ['Gulf Power'],
  parentCo: 'NextEra Energy',
  statesListed: 'FL',
  eiaIds: [],
  eiaNames: [],
  note: 'Merged into FPL (EIA 6452) in 2021; no separate EIA-861 territory. Authored from the eight NW-Florida counties Gulf Power served (see add-gulf-power.mjs). Not regenerated by --force.',
  website: 'https://www.fpl.com',
});

writeFileSync(TERR_FILE, JSON.stringify(terr));
writeFileSync(FIELD_FILE, JSON.stringify(field));
writeFileSync(NAMEMAP_FILE, JSON.stringify(nameMap, null, 2) + '\n');

console.log(`\nDone. utilities: ${terr.utilities.length}; gulf-power substations: ${subs.length}, plants: ${plants.length}`);
console.log(`Territory ${areaSqMi} sq mi; coverage 25/50/100 = ${stats[25].coveredPct}/${stats[50].coveredPct}/${stats[100].coveredPct}`);
