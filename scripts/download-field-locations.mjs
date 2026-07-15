/**
 * Builds public/utility-data/field-locations.json for the /utility page.
 *
 * Two field-location layers for the utilities in src/lib/utility-name-map.json:
 *  1. Electric substations (HIFLD "Electric Substations", federal infrastructure
 *     dataset). No owner attribution exists in the data, so substations are
 *     matched SPATIALLY: a substation lists under a utility because it falls
 *     inside that utility's service territory polygon.
 *  2. Power plants (EIA "Power Plants in the US", from Form EIA-860), matched
 *     by OWNERSHIP via the federal EIA Utility ID - the same ID space as
 *     eiaIds in utility-name-map.json.
 *
 * Each point gets nearestMegMiles precomputed (straight-line to the closest
 * MEG location) so the UI can compute radius coverage instantly client-side.
 *
 * Requires public/utility-data/utility-territories.json (run
 * download-utility-territories.mjs first; prebuild order guarantees this).
 * Output is committed; skips if present (use --force to rebuild).
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import * as turf from '@turf/turf';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'public', 'utility-data');
const OUT_FILE = join(OUT_DIR, 'field-locations.json');
const TERRITORIES_FILE = join(OUT_DIR, 'utility-territories.json');
const REPORT_FILE = join(ROOT, 'UTILITY_DATA_REPORT.md');

// HIFLD Electric Substations - open mirror (75,328 records, refreshed 2025-07).
// Fallback mirrors exist but are token-gated:
//   services1.arcgis.com/Hp6G80Pky0om7QvQ/.../Electric_Substations_1  (blocked)
//   services6.arcgis.com/iPjopzs2VuXEoj3J/.../Electric_Substations    (blocked)
const SUBSTATIONS_URL =
  'https://services1.arcgis.com/PMShNXB1carltgVf/arcgis/rest/services/Electric_Substations/FeatureServer/0';
// EIA Power Plants (Federal User Community org, synced from EIA Form 860)
const PLANTS_URL =
  'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/Power_Plants_in_the_US/FeatureServer/0';

const EASTERN_STATES = [
  'ME', 'NH', 'VT', 'MA', 'RI', 'CT', 'NY', 'NJ', 'PA', 'DE', 'MD', 'DC', 'VA', 'WV',
  'NC', 'SC', 'GA', 'FL', 'AL', 'MS', 'TN', 'KY', 'OH', 'IN', 'IL', 'MI', 'WI',
];

if (existsSync(OUT_FILE) && !process.argv.includes('--force')) {
  console.log('field-locations.json already exists, skipping (use --force to rebuild)');
  process.exit(0);
}
if (!existsSync(TERRITORIES_FILE)) {
  console.error('utility-territories.json missing - run download-utility-territories.mjs first.');
  process.exit(1);
}

const nameMap = JSON.parse(readFileSync(join(ROOT, 'src', 'lib', 'utility-name-map.json'), 'utf8'));
const megLocations = JSON.parse(readFileSync(join(ROOT, 'src', 'lib', 'meg-locations.json'), 'utf8'));
const territories = JSON.parse(readFileSync(TERRITORIES_FILE, 'utf8'));

// ---------------------------------------------------------------------------

async function queryArcgis(baseUrl, params, label) {
  const search = new URLSearchParams({ f: 'json', ...params });
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/query?${search}`, { signal: AbortSignal.timeout(120000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} (${label})`);
      const data = await res.json();
      if (data.error) {
        throw new Error(`ArcGIS error (${label}): ${data.error.message || JSON.stringify(data.error)}`);
      }
      return data;
    } catch (err) {
      lastErr = err;
      if (attempt < 3) {
        console.warn(`    attempt ${attempt} failed (${err.message}), retrying...`);
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }
  throw lastErr;
}

const EARTH_RADIUS_MILES = 3958.8;
const toRad = (deg) => (deg * Math.PI) / 180;
// Same haversine as src/lib/distance.ts
function haversineMiles(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
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

// ---------------------------------------------------------------------------
// 1. Substations: paginated pull, then spatial join against territories

console.log('Fetching substations (eastern states, in service)...');
const where = `STATE IN (${EASTERN_STATES.map((s) => `'${s}'`).join(',')}) AND STATUS = 'IN SERVICE'`;
const allSubstations = [];
let offset = 0;
for (;;) {
  const data = await queryArcgis(
    SUBSTATIONS_URL,
    {
      where,
      outFields: 'NAME,CITY,STATE,MAX_VOLT,VAL_DATE,LATITUDE,LONGITUDE',
      returnGeometry: 'false', // LATITUDE/LONGITUDE attributes are cleaner than reprojecting
      resultOffset: String(offset),
      resultRecordCount: '2000',
      orderByFields: 'OBJECTID_1',
    },
    `substations offset ${offset}`
  );
  const feats = data.features || [];
  for (const f of feats) allSubstations.push(f.attributes);
  offset += feats.length;
  process.stdout.write(`  ${offset} fetched\r`);
  if (!data.exceededTransferLimit && feats.length < 2000) break;
}
console.log(`\n  total substations fetched: ${allSubstations.length}`);

// Spatial join: bbox prescreen per territory, then exact point-in-polygon.
console.log('Spatial-joining substations to territories...');
const territoryFeatures = territories.utilities.map((u) => {
  const feature = turf.feature(u.geometry);
  return { id: u.id, name: u.name, feature, bbox: turf.bbox(feature) };
});

const substationsByUtility = {};
for (const t of territoryFeatures) substationsByUtility[t.id] = [];

let joined = 0;
for (const s of allSubstations) {
  const lat = s.LATITUDE;
  const lng = s.LONGITUDE;
  if (typeof lat !== 'number' || typeof lng !== 'number') continue;
  const pt = turf.point([lng, lat]);
  let dist = null; // computed lazily, only for points inside some territory
  for (const t of territoryFeatures) {
    const [minX, minY, maxX, maxY] = t.bbox;
    if (lng < minX || lng > maxX || lat < minY || lat > maxY) continue;
    if (turf.booleanPointInPolygon(pt, t.feature)) {
      if (dist === null) dist = nearestMegMiles(lat, lng);
      substationsByUtility[t.id].push([
        Math.round(lng * 1e4) / 1e4,
        Math.round(lat * 1e4) / 1e4,
        dist,
        s.NAME || null,
        s.MAX_VOLT > 0 ? s.MAX_VOLT : null,
      ]);
      joined++;
    }
  }
}
console.log(`  placements: ${joined} (a substation in overlapping territories lists under each)`);

// ---------------------------------------------------------------------------
// 2. Power plants: ownership join via EIA Utility ID

console.log('Fetching power plants by EIA utility ID...');
const idToUtility = {};
for (const entry of nameMap.utilities) {
  for (const id of entry.eiaIds) idToUtility[String(id)] = entry.id;
}
const allIds = Object.keys(idToUtility);

// Verify Utility_ID field type so the where clause quotes correctly
const plantsMeta = await (await fetch(`${PLANTS_URL}?f=json`, { signal: AbortSignal.timeout(30000) })).json();
const utilIdField = (plantsMeta.fields || []).find((f) => f.name === 'Utility_ID');
const idIsString = utilIdField?.type === 'esriFieldTypeString';
console.log(`  Utility_ID field type: ${utilIdField?.type}`);

const plantsByUtility = {};
for (const entry of nameMap.utilities) plantsByUtility[entry.id] = [];

for (let i = 0; i < allIds.length; i += 30) {
  const chunk = allIds.slice(i, i + 30);
  const values = idIsString ? chunk.map((v) => `'${v}'`).join(',') : chunk.join(',');
  const data = await queryArcgis(
    PLANTS_URL,
    {
      where: `Utility_ID IN (${values})`,
      outFields: 'Plant_Code,Plant_Name,Utility_ID,Utility_Na,Total_MW,PrimSource,City,State,Longitude,Latitude',
      returnGeometry: 'true',
      outSR: '4326',
      resultRecordCount: '2000',
    },
    `plants chunk ${i / 30 + 1}`
  );
  for (const f of data.features || []) {
    const a = f.attributes;
    const lng = a.Longitude ?? f.geometry?.x;
    const lat = a.Latitude ?? f.geometry?.y;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    const utilityId = idToUtility[String(a.Utility_ID)];
    if (!utilityId) continue;
    plantsByUtility[utilityId].push([
      Math.round(lng * 1e4) / 1e4,
      Math.round(lat * 1e4) / 1e4,
      nearestMegMiles(lat, lng),
      a.Plant_Name || null,
      a.Total_MW ? Math.round(a.Total_MW) : null,
      a.PrimSource || null,
    ]);
  }
}
const totalPlants = Object.values(plantsByUtility).reduce((n, arr) => n + arr.length, 0);
console.log(`  plants matched: ${totalPlants}`);

// ---------------------------------------------------------------------------
// 3. Write output + report

const generatedAt = new Date().toISOString();
const output = {
  generatedAt,
  sources: {
    substations: {
      name: 'HIFLD Electric Substations (U.S. federal infrastructure dataset)',
      serviceUrl: SUBSTATIONS_URL,
      attribution: 'territory-based',
      note: 'Substations are matched to a utility by falling inside its service territory; some may be owned by transmission companies or municipal utilities.',
    },
    plants: {
      name: 'EIA Power Plants (Form EIA-860, U.S. Energy Information Administration)',
      serviceUrl: PLANTS_URL,
      attribution: 'owner-based',
      note: 'Plants are matched by the utility’s federal EIA ID - true ownership.',
    },
  },
  byUtility: {},
};
for (const entry of nameMap.utilities) {
  output.byUtility[entry.id] = {
    substations: substationsByUtility[entry.id] || [],
    plants: plantsByUtility[entry.id] || [],
  };
}

mkdirSync(OUT_DIR, { recursive: true });
const json = JSON.stringify(output);
writeFileSync(OUT_FILE, json);
console.log(`\nWrote ${OUT_FILE} (${(json.length / 1024 / 1024).toFixed(2)} MB)`);

// Report section
const pctWithin = (entries, r) => {
  if (!entries.length) return null;
  return entries.filter((e) => e[2] <= r).length / entries.length;
};
const lines = [
  '',
  '## Field Locations',
  '',
  `Generated: ${generatedAt}`,
  '',
  '**Substations** come from the federal HIFLD Electric Substations dataset (in-service only).',
  'The federal data intentionally carries no owner field, so substations are attributed to a',
  "utility by location: they fall inside that utility's service territory. Counts can include",
  'substations owned by transmission companies or municipal utilities, and a substation inside',
  'two overlapping territories is counted for both.',
  '',
  '**Power plants** come from the EIA Power Plants dataset (Form EIA-860) and are matched by the',
  "utility's federal EIA ID - these are true ownership matches.",
  '',
  '| Utility | Substations in territory | % within 50 mi | Plants owned | % within 50 mi |',
  '|---|---|---|---|---|',
];
for (const entry of nameMap.utilities) {
  const subs = substationsByUtility[entry.id] || [];
  const plants = plantsByUtility[entry.id] || [];
  const sp = pctWithin(subs, 50);
  const pp = pctWithin(plants, 50);
  lines.push(
    `| ${entry.displayName} | ${subs.length} | ${sp === null ? '-' : Math.round(sp * 100) + '%'} | ${plants.length} | ${pp === null ? '-' : Math.round(pp * 100) + '%'} |`
  );
  console.log(
    `  ${entry.displayName.padEnd(42)} subs: ${String(subs.length).padStart(5)} (${sp === null ? ' -' : Math.round(sp * 100) + '%'} @50mi)  plants: ${String(plants.length).padStart(3)}`
  );
}
lines.push('');
appendFileSync(REPORT_FILE, lines.join('\n'));
console.log(`Appended Field Locations section to ${REPORT_FILE}`);

const zeroSubs = nameMap.utilities.filter((e) => !(substationsByUtility[e.id] || []).length);
if (zeroSubs.length) {
  console.warn(`\nWARNING: utilities with zero substations in territory: ${zeroSubs.map((e) => e.displayName).join(', ')}`);
}
console.log('Done!');
