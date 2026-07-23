/**
 * Builds public/utility-data/utility-territories.json for the /utility page.
 *
 * Pulls utility service territory polygons from the HIFLD/EIA "Electric Retail
 * Service Territories" dataset (derived from federal Form EIA-861 filings),
 * filtered to the utilities in src/lib/utility-name-map.json (the client list),
 * simplifies geometry, geocodes HQ addresses, and precomputes coverage stats
 * against MEG locations (src/lib/meg-locations.json) at 25/50/100 miles.
 *
 * Also writes UTILITY_DATA_REPORT.md (repo root) - a human-readable audit of
 * every client-list entry, what it matched, and corrections applied.
 *
 * The output is committed to git; this runs in prebuild but skips if the
 * output already exists (delete the file to force a refresh).
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import * as turf from '@turf/turf';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'public', 'utility-data');
const OUT_FILE = join(OUT_DIR, 'utility-territories.json');
const REPORT_FILE = join(ROOT, 'UTILITY_DATA_REPORT.md');

// HIFLD Electric Retail Service Territories (archived HIFLD Open snapshot).
// Mirror list: first that responds wins.
const SERVICE_URLS = [
  'https://services3.arcgis.com/OYP7N6mAJJCyH6hd/arcgis/rest/services/Electric_Retail_Service_Territories_HIFLD/FeatureServer/0',
  'https://services1.arcgis.com/Ox83qAeY1hGpFP6l/arcgis/rest/services/Electric_Retail_Service_Territories/FeatureServer/0',
];
const DATASET_PAGE =
  'https://catalog.data.gov/dataset/electric-retail-service-territories';

const RADII_MILES = [25, 50, 100];
const SIMPLIFY_TOLERANCE = 0.01; // degrees; ~1km — fine for a regional overview map
const COORD_PRECISION = 4; // ~11m

if (existsSync(OUT_FILE) && !process.argv.includes('--force')) {
  console.log('utility-territories.json already exists, skipping (use --force to rebuild)');
  process.exit(0);
}

const nameMap = JSON.parse(
  readFileSync(join(ROOT, 'src', 'lib', 'utility-name-map.json'), 'utf8')
);
const megLocations = JSON.parse(
  readFileSync(join(ROOT, 'src', 'lib', 'meg-locations.json'), 'utf8')
);

async function pickServiceUrl() {
  for (const url of SERVICE_URLS) {
    try {
      const res = await fetch(`${url}?f=json`, { signal: AbortSignal.timeout(20000) });
      const meta = await res.json();
      if (meta && !meta.error && meta.fields) {
        console.log(`Using service: ${url}`);
        return url;
      }
    } catch {
      /* try next */
    }
  }
  throw new Error('No Electric Retail Service Territories mirror is reachable.');
}

async function fetchEntity(serviceUrl, eiaId) {
  // NOTE: ID is a string field in this dataset - the value must be quoted.
  const params = new URLSearchParams({
    where: `ID = '${eiaId}'`,
    outFields:
      'ID,NAME,STATE,TYPE,CUSTOMERS,HOLDING_CO,ADDRESS,CITY,ZIP,WEBSITE,SOURCEDATE,VAL_DATE,YEAR',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson',
  });
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${serviceUrl}/query?${params}`, {
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for EIA ID ${eiaId}`);
      const data = await res.json();
      if (data.error) {
        throw new Error(
          `ArcGIS error for EIA ID ${eiaId}: ${data.error.message || JSON.stringify(data.error)}`
        );
      }
      return data.features || [];
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

async function censusGeocode(address) {
  try {
    const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    const data = await res.json();
    const match = data?.result?.addressMatches?.[0];
    if (!match) return null;
    return { lat: match.coordinates.y, lng: match.coordinates.x };
  } catch {
    return null;
  }
}

function countVertices(geometry) {
  let n = 0;
  turf.coordEach(turf.feature(geometry), () => n++);
  return n;
}

/** Union an array of (Multi)Polygon features into one feature. */
function unionAll(features) {
  if (features.length === 1) return features[0];
  let acc = features[0];
  for (let i = 1; i < features.length; i++) {
    acc = turf.union(turf.featureCollection([acc, features[i]]));
  }
  return acc;
}

/** Concatenate (Multi)Polygon features into a single MultiPolygon geometry. */
function concatToMultiPolygon(features) {
  const coords = [];
  for (const f of features) {
    if (f.geometry.type === 'Polygon') coords.push(f.geometry.coordinates);
    else if (f.geometry.type === 'MultiPolygon') coords.push(...f.geometry.coordinates);
  }
  return { type: 'MultiPolygon', coordinates: coords };
}

function simplifyFeature(feature) {
  try {
    const simplified = turf.simplify(feature, {
      tolerance: SIMPLIFY_TOLERANCE,
      highQuality: false,
      mutate: false,
    });
    return turf.truncate(turf.cleanCoords(simplified), {
      precision: COORD_PRECISION,
      mutate: true,
    });
  } catch (err) {
    console.warn(`    simplify failed (${err.message}), retrying tolerance/2 + cleanCoords`);
    try {
      const simplified = turf.simplify(turf.cleanCoords(feature), {
        tolerance: SIMPLIFY_TOLERANCE / 2,
        highQuality: true,
        mutate: false,
      });
      return turf.truncate(simplified, { precision: COORD_PRECISION, mutate: true });
    } catch (err2) {
      console.warn(`    simplify retry failed (${err2.message}), keeping raw geometry`);
      return turf.truncate(feature, { precision: COORD_PRECISION, mutate: false });
    }
  }
}

/** Min straight-line miles from a point to a (Multi)Polygon (0 if inside). */
function distanceToTerritory(point, territoryFeature) {
  if (turf.booleanPointInPolygon(point, territoryFeature)) return 0;
  let min = Infinity;
  const lines = turf.polygonToLine(territoryFeature);
  const lineFeatures = lines.type === 'FeatureCollection' ? lines.features : [lines];
  for (const line of lineFeatures) {
    const geoms =
      line.geometry.type === 'MultiLineString'
        ? line.geometry.coordinates.map((c) => turf.lineString(c))
        : [line];
    for (const g of geoms) {
      const d = turf.pointToLineDistance(point, g, { units: 'miles' });
      if (d < min) min = d;
    }
  }
  return min;
}

// ---------------------------------------------------------------------------

const serviceUrl = await pickServiceUrl();

console.log(`Precomputing MEG buffer unions for radii: ${RADII_MILES.join(', ')} miles...`);
const megPoints = megLocations.map((l) => turf.point([l.lng, l.lat], { name: l.name }));
const bufferUnions = {};
for (const radius of RADII_MILES) {
  const buffers = megPoints.map((p) => turf.buffer(p, radius, { units: 'miles', steps: 32 }));
  bufferUnions[radius] = unionAll(buffers);
}

const utilities = [];
const reportRows = [];
const failures = [];

for (const entry of nameMap.utilities) {
  // Manually-authored entries (e.g. gulf-power) have no fetchable federal
  // polygon and carry empty eiaIds. Skip them here rather than treating the
  // missing geometry as fatal; re-run scripts/add-gulf-power.mjs after a
  // --force rebuild to restore them.
  if (!entry.eiaIds || entry.eiaIds.length === 0) {
    console.warn(`${entry.displayName}: no eiaIds (manually-authored) — skipping; re-run scripts/add-gulf-power.mjs after this rebuild.`);
    continue;
  }
  console.log(`\n${entry.displayName} (${entry.eiaIds.length} EIA entit${entry.eiaIds.length === 1 ? 'y' : 'ies'})`);
  const entities = [];
  const rawFeatures = [];

  for (const eiaId of entry.eiaIds) {
    let features;
    try {
      features = await fetchEntity(serviceUrl, eiaId);
    } catch (err) {
      failures.push(`${entry.displayName}: fetch failed for EIA ID ${eiaId} - ${err.message}`);
      continue;
    }
    if (!features.length) {
      failures.push(`${entry.displayName}: EIA ID ${eiaId} matched zero features`);
      continue;
    }
    for (const f of features) {
      const p = f.properties;
      const expectedName = entry.eiaNames[entry.eiaIds.indexOf(eiaId)];
      if (expectedName && p.NAME !== expectedName) {
        failures.push(
          `${entry.displayName}: EIA ID ${eiaId} returned NAME "${p.NAME}" but mapping expects "${expectedName}" - dataset may have changed, re-verify.`
        );
      }
      entities.push({
        eiaId: p.ID,
        name: p.NAME,
        state: p.STATE,
        type: p.TYPE,
        customers: p.CUSTOMERS > 0 ? p.CUSTOMERS : null,
        holdingCo: p.HOLDING_CO,
        address: [p.ADDRESS, p.CITY, p.STATE, p.ZIP].filter(Boolean).join(', ') || null,
        website: p.WEBSITE && p.WEBSITE.startsWith('http') ? p.WEBSITE : null,
        sourceDate: p.SOURCEDATE ? new Date(p.SOURCEDATE).toISOString().slice(0, 10) : null,
        valDate: p.VAL_DATE ? new Date(p.VAL_DATE).toISOString().slice(0, 10) : null,
        dataYear: p.YEAR || null,
      });
      rawFeatures.push(f);
    }
  }

  if (!rawFeatures.length) {
    failures.push(`${entry.displayName}: NO GEOMETRY - utility will be missing from the map`);
    reportRows.push({ entry, entities, status: 'FAILED' });
    continue;
  }

  const rawVertices = rawFeatures.reduce((n, f) => n + countVertices(f.geometry), 0);
  const simplified = rawFeatures.map((f) => simplifyFeature(f));
  const geometry = concatToMultiPolygon(simplified);
  const simpVertices = countVertices(geometry);
  console.log(`  vertices: ${rawVertices} -> ${simpVertices}`);

  const territoryFeature = turf.feature(geometry);
  let areaSqMi = null;
  const stats = { nearestMegFromEdgeMiles: null, nearestMegFromHqMiles: null };
  try {
    areaSqMi = turf.area(territoryFeature) / 2589988.11; // m^2 -> mi^2
    for (const radius of RADII_MILES) {
      let coveredPct = 0;
      const intersection = turf.intersect(
        turf.featureCollection([territoryFeature, bufferUnions[radius]])
      );
      if (intersection) coveredPct = turf.area(intersection) / turf.area(territoryFeature);
      stats[radius] = { coveredPct: Math.min(1, Math.round(coveredPct * 1000) / 1000) };
    }
    let minEdge = Infinity;
    let nearestName = null;
    for (const p of megPoints) {
      const d = distanceToTerritory(p, territoryFeature);
      if (d < minEdge) {
        minEdge = d;
        nearestName = p.properties.name;
      }
    }
    stats.nearestMegFromEdgeMiles = Math.round(minEdge * 10) / 10;
    stats.nearestMegLocation = nearestName;
  } catch (err) {
    console.warn(`  stats failed: ${err.message}`);
    failures.push(`${entry.displayName}: coverage stats failed - ${err.message}`);
    for (const radius of RADII_MILES) stats[radius] = { coveredPct: null };
  }

  // HQ pin: geocode the address of the largest entity (by customers); fall
  // back to territory center if the address does not geocode.
  const primary = [...entities].sort((a, b) => (b.customers || 0) - (a.customers || 0))[0];
  let hq = null;
  if (primary?.address) {
    const geo = await censusGeocode(primary.address);
    await new Promise((r) => setTimeout(r, 600));
    if (geo) {
      hq = {
        lat: Math.round(geo.lat * 1e5) / 1e5,
        lng: Math.round(geo.lng * 1e5) / 1e5,
        address: primary.address,
        precision: 'address',
      };
    }
  }
  if (!hq) {
    const center = turf.centerOfMass(territoryFeature).geometry.coordinates;
    hq = {
      lat: Math.round(center[1] * 1e5) / 1e5,
      lng: Math.round(center[0] * 1e5) / 1e5,
      address: primary?.address || null,
      precision: 'territory-center',
    };
  }
  if (hq && stats.nearestMegFromEdgeMiles !== null) {
    let minHq = Infinity;
    for (const l of megLocations) {
      const d = turf.distance([hq.lng, hq.lat], [l.lng, l.lat], { units: 'miles' });
      if (d < minHq) minHq = d;
    }
    stats.nearestMegFromHqMiles = Math.round(minHq * 10) / 10;
  }

  const customers = entities.reduce((n, e) => n + (e.customers || 0), 0) || null;
  const states = [...new Set(entities.map((e) => e.state).filter(Boolean))];
  const website = entry.website || entities.find((e) => e.website)?.website || null;

  utilities.push({
    id: entry.id,
    name: entry.displayName,
    clientNames: entry.clientNames,
    parentCo: entry.parentCo || null,
    statesListed: entry.statesListed,
    states,
    customers,
    areaSqMi: areaSqMi ? Math.round(areaSqMi) : null,
    website,
    note: entry.note || null,
    hq,
    entities,
    stats,
    geometry,
  });
  reportRows.push({ entry, entities, status: 'OK', stats, customers });
}

// ---------------------------------------------------------------------------

const generatedAt = new Date().toISOString();
const output = {
  generatedAt,
  source: {
    name: 'Electric Retail Service Territories (HIFLD / U.S. Energy Information Administration, Form EIA-861)',
    url: DATASET_PAGE,
    serviceUrl,
  },
  radiiPrecomputed: RADII_MILES,
  utilities,
};

mkdirSync(OUT_DIR, { recursive: true });
const json = JSON.stringify(output);
writeFileSync(OUT_FILE, json);
console.log(`\nWrote ${utilities.length} utilities to ${OUT_FILE} (${(json.length / 1024 / 1024).toFixed(2)} MB)`);

// Report
const lines = [
  '# Utility Territory Data Report',
  '',
  `Generated: ${generatedAt}`,
  '',
  `Source: [Electric Retail Service Territories (EIA / HIFLD)](${DATASET_PAGE}) - service territory`,
  'boundaries as filed by each utility with the U.S. Energy Information Administration (Form EIA-861).',
  '',
  `Client list: "List of Utilities East of Mississippi.xlsx" (Jeff Landis, MEG) - 49 rows, 48 unique`,
  'utilities, mapped to the entries below. Corrections and interpretations are noted per utility.',
  '',
  '| Utility (map) | Client list row(s) | EIA legal entities (ID) | States | Customers | % within 50 mi | Note |',
  '|---|---|---|---|---|---|---|',
];
for (const row of reportRows) {
  const e = row.entry;
  const ents = row.entities.map((x) => `${x.name} (${x.eiaId})`).join('<br>') || '-';
  const states = [...new Set(row.entities.map((x) => x.state))].join(', ') || '-';
  const cust = row.customers ? row.customers.toLocaleString('en-US') : '-';
  const pct =
    row.stats && row.stats[50] && row.stats[50].coveredPct !== null
      ? `${Math.round(row.stats[50].coveredPct * 100)}%`
      : row.status;
  lines.push(
    `| ${e.displayName} | ${e.clientNames.join('; ')} | ${ents} | ${states} | ${cust} | ${pct} | ${e.note || ''} |`
  );
}
lines.push('');
if (failures.length) {
  lines.push('## Issues', '');
  for (const f of failures) lines.push(`- ${f}`);
} else {
  lines.push('## Issues', '', 'None - every client-list utility matched federal territory data.');
}
lines.push('');
writeFileSync(REPORT_FILE, lines.join('\n'));
console.log(`Wrote report to ${REPORT_FILE}`);

if (failures.length) {
  console.error(`\n${failures.length} issue(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  // Missing geometry is fatal; name-drift warnings are not.
  const fatal = failures.filter((f) => f.includes('NO GEOMETRY'));
  if (fatal.length) process.exit(1);
}
console.log('Done!');
