/**
 * Downloads East Coast state zip code GeoJSON boundary files from OpenDataDE.
 * Used as a prebuild step on Vercel (and locally if needed).
 */
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const DEST = join(process.cwd(), 'public', 'geojson');
const BASE_URL = 'https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master';

const STATES = {
  ct: 'ct_connecticut_zip_codes_geo.min.json',
  de: 'de_delaware_zip_codes_geo.min.json',
  fl: 'fl_florida_zip_codes_geo.min.json',
  ga: 'ga_georgia_zip_codes_geo.min.json',
  ma: 'ma_massachusetts_zip_codes_geo.min.json',
  md: 'md_maryland_zip_codes_geo.min.json',
  me: 'me_maine_zip_codes_geo.min.json',
  nc: 'nc_north_carolina_zip_codes_geo.min.json',
  nh: 'nh_new_hampshire_zip_codes_geo.min.json',
  nj: 'nj_new_jersey_zip_codes_geo.min.json',
  ny: 'ny_new_york_zip_codes_geo.min.json',
  pa: 'pa_pennsylvania_zip_codes_geo.min.json',
  ri: 'ri_rhode_island_zip_codes_geo.min.json',
  sc: 'sc_south_carolina_zip_codes_geo.min.json',
  va: 'va_virginia_zip_codes_geo.min.json',
  vt: 'vt_vermont_zip_codes_geo.min.json',
};

mkdirSync(DEST, { recursive: true });

console.log('Downloading GeoJSON files for 16 East Coast states...');

const entries = Object.entries(STATES);
// Download 4 at a time to avoid overwhelming the connection
for (let i = 0; i < entries.length; i += 4) {
  const batch = entries.slice(i, i + 4);
  await Promise.all(
    batch.map(async ([code, file]) => {
      const outPath = join(DEST, `${code}.json`);
      if (existsSync(outPath)) {
        console.log(`  ${code}.json already exists, skipping`);
        return;
      }
      console.log(`  Downloading ${code}.json...`);
      const res = await fetch(`${BASE_URL}/${file}`);
      if (!res.ok) {
        console.error(`  FAILED ${code}.json: ${res.status}`);
        return;
      }
      const data = await res.text();
      writeFileSync(outPath, data);
      console.log(`  ${code}.json done (${(data.length / 1024 / 1024).toFixed(1)} MB)`);
    })
  );
}

console.log('Done!');
