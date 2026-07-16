/**
 * Downloads the Census Places Gazetteer and writes a compact list of US
 * municipalities (incorporated places + CDPs) with their internal points,
 * limited to the states we carry ZIP boundaries for.
 *
 * The City Lookup export uses this so that municipalities USPS folds into a
 * larger "preferred" city (e.g. Doraville/Chamblee/Dunwoody -> "Atlanta") are
 * still individually searchable. Runs as a prebuild step alongside
 * download-geojson.mjs / download-zip-cities.mjs.
 *
 * Output: public/data/us-places.json  ->  [[name, "ST", lat, lng], ...]
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const DATA_DIR = join(process.cwd(), 'public', 'data');
const OUTPUT = join(DATA_DIR, 'us-places.json');
const GAZ_URL = 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_place_national.zip';

// States we have ZIP boundary GeoJSON for (must match download-geojson.mjs).
const COVERED = new Set([
  'al', 'ct', 'de', 'fl', 'ga', 'ky', 'ma', 'md', 'me', 'nc', 'nh',
  'nj', 'ny', 'oh', 'pa', 'ri', 'sc', 'tn', 'va', 'vt', 'wv',
]);

if (existsSync(OUTPUT)) {
  console.log('us-places.json already exists, skipping');
  process.exit(0);
}

mkdirSync(DATA_DIR, { recursive: true });

console.log('Downloading Census Places Gazetteer...');
const res = await fetch(GAZ_URL);
if (!res.ok) {
  console.error(`FAILED to download: ${res.status}`);
  process.exit(1);
}
const zipPath = join(DATA_DIR, 'gaz_place.zip');
writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
console.log('  Download complete');

console.log('  Extracting...');
execSync(`unzip -o "${zipPath}" -d "${DATA_DIR}"`, { stdio: 'pipe' });

// Strip the trailing LSAD label ("city", "town", "CDP", ...) from a gazetteer
// NAME so it reads as the bare municipality name.
const TRAIL = /\s+(CDP|city|town|village|borough|municipality|corporation|county)$/i;
function cleanName(name) {
  let n = name.trim();
  const low = n.toLowerCase();
  if (low.includes('government') || low.includes('(balance)')) {
    // Consolidated / metro governments: "Athens-Clarke County unified
    // government (balance)" -> "Athens", "Louisville/Jefferson ..." -> "Louisville".
    let s = n.replace(/\(balance\)/i, '')
      .replace(/\b(unified|consolidated|metro|metropolitan)\b/gi, '')
      .replace(/\bgovernment\b/gi, '')
      .replace(/\bcity\b/gi, '');
    s = s.split(/\bcounty\b/i)[0];
    n = s.split(/[/-]/)[0].trim();
  } else {
    n = n.replace(TRAIL, '').trim();
  }
  return n;
}

const tsvPath = join(DATA_DIR, '2023_Gaz_place_national.txt');
const tsv = readFileSync(tsvPath, 'utf-8');
const places = [];
const lines = tsv.split('\n');
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  const cols = line.split('\t');
  const st = (cols[0] || '').trim().toLowerCase();
  if (!COVERED.has(st)) continue;
  const name = cleanName(cols[3] || '');
  const lat = parseFloat(cols[10]);
  const lng = parseFloat(cols[11]);
  if (!name || Number.isNaN(lat) || Number.isNaN(lng)) continue;
  places.push([name, st.toUpperCase(), lat, lng]);
}

writeFileSync(OUTPUT, JSON.stringify(places));
const sizeMB = (readFileSync(OUTPUT).length / 1024 / 1024).toFixed(1);
console.log(`  us-places.json created: ${places.length} places (${sizeMB} MB)`);

unlinkSync(zipPath);
unlinkSync(tsvPath);

console.log('Done!');
