/**
 * Downloads the GeoNames US postal code dataset and converts it to a
 * compact ZIP-to-city JSON lookup used by the City Lookup export feature.
 * Runs as a prebuild step alongside download-geojson.mjs.
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const DATA_DIR = join(process.cwd(), 'public', 'data');
const OUTPUT = join(DATA_DIR, 'zip-to-city.json');
const ZIP_URL = 'https://download.geonames.org/export/zip/US.zip';

if (existsSync(OUTPUT)) {
  console.log('zip-to-city.json already exists, skipping');
  process.exit(0);
}

mkdirSync(DATA_DIR, { recursive: true });

// 1. Download
console.log('Downloading US postal code data from GeoNames...');
const res = await fetch(ZIP_URL);
if (!res.ok) {
  console.error(`FAILED to download: ${res.status}`);
  process.exit(1);
}
const zipPath = join(DATA_DIR, 'US.zip');
writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
console.log('  Download complete');

// 2. Extract
console.log('  Extracting...');
execSync(`unzip -o "${zipPath}" -d "${DATA_DIR}"`, { stdio: 'pipe' });

// 3. Parse TSV → JSON lookup
const tsvPath = join(DATA_DIR, 'US.txt');
const tsv = readFileSync(tsvPath, 'utf-8');
const lookup = {};

for (const line of tsv.split('\n')) {
  if (!line.trim()) continue;
  const cols = line.split('\t');
  const zip = cols[1];
  const city = cols[2];
  const state = cols[4];
  if (zip && city && state) {
    lookup[zip] = { city: `${city}, ${state}`, lat: parseFloat(cols[9]) || 0, lng: parseFloat(cols[10]) || 0 };
  }
}

// 4. Write compact JSON
writeFileSync(OUTPUT, JSON.stringify(lookup));
const entries = Object.keys(lookup).length;
const sizeMB = (readFileSync(OUTPUT).length / 1024 / 1024).toFixed(1);
console.log(`  zip-to-city.json created: ${entries} entries (${sizeMB} MB)`);

// 5. Cleanup temp files
unlinkSync(zipPath);
unlinkSync(tsvPath);
try { unlinkSync(join(DATA_DIR, 'readme.txt')); } catch { /* may not exist */ }

console.log('Done!');
