// One-time script: geocode MEG operation centers and write src/lib/meg-locations.json
// Sources: names from the live location-lookup export (26 territories),
// addresses scraped from millerenvironmentalgroup.com location pages and
// affiliate sites (centralohiooil.com, hazmatnc.com, cancousa.com).
// Uses the free US Census geocoder for street addresses and Nominatim (OSM)
// for city-level entries. Run: node scripts/geocode-meg-locations.mjs
// Results are committed; this script is not part of the build.

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'src', 'lib', 'meg-locations.json');

// kind: 'operation' | 'affiliate' | 'facility'
// precision 'address' => Census geocoder; 'city' => Nominatim city lookup
const LOCATIONS = [
  { id: 'albany-ny', name: 'Albany, NY', address: '40 Hamilton Lane, Glenmont, NY 12077', precision: 'address', kind: 'operation' },
  { id: 'atlanta-ga', name: 'Atlanta, GA', address: '7108 Keegan Court, Covington, GA 30014', precision: 'address', kind: 'operation' },
  { id: 'baltimore-md', name: 'Baltimore, MD', address: '4420 East Eager Street, Baltimore, MD 21205', precision: 'address', kind: 'operation' },
  { id: 'bohemia-ny', name: 'Bohemia, NY', address: '1599 Ocean Avenue, Bohemia, NY 11716', precision: 'address', kind: 'operation' },
  { id: 'buffalo-ny', name: 'Buffalo, NY', address: '4429 Walden Avenue, Lancaster, NY 14086', precision: 'address', kind: 'operation' },
  { id: 'calverton-ny', name: 'Calverton, NY (Long Island)', address: '538 Edwards Avenue, Calverton, NY 11933', precision: 'address', kind: 'operation' },
  { id: 'charlotte-nc', name: 'Charlotte, NC (Haz-Mat)', address: '6215 Orr Road, Charlotte, NC 28213', precision: 'address', kind: 'affiliate' },
  { id: 'chester-sc', name: 'Chester, SC (CANCO)', address: '1248 Armory Road, Chester, SC 29706', precision: 'address', kind: 'affiliate' },
  { id: 'columbus-oh', name: 'Columbus, OH (Central Ohio Oil)', address: '795 Marion Road, Columbus, OH 43207', precision: 'address', kind: 'affiliate' },
  { id: 'dover-de', name: 'Dover, DE', address: '544 Webbs Lane, Dover, DE 19904', precision: 'address', kind: 'operation' },
  { id: 'harrisburg-pa', name: 'Harrisburg, PA', address: '1539 Bobali Drive, Harrisburg, PA 17104', precision: 'address', kind: 'operation' },
  { id: 'hudson-valley-ny', name: 'Hudson Valley, NY', address: '169 Stone Castle Road, Rock Tavern, NY 12575', precision: 'address', kind: 'operation' },
  { id: 'mannington-nj', name: 'Mannington, NJ', address: 'Mannington Township, NJ 08079', precision: 'city', kind: 'facility' },
  { id: 'north-jersey', name: 'North Jersey', address: '800 Paul Amico Way, Secaucus, NJ 07094', precision: 'address', kind: 'operation' },
  { id: 'nyc-metro', name: 'NYC Metro', address: '1300 Shames Drive, Westbury, NY 11590', precision: 'address', kind: 'operation' },
  { id: 'ohio-valley-oh', name: 'Ohio Valley, OH', address: '55680 Industrial Drive, Bridgeport, OH 43912', precision: 'address', kind: 'operation' },
  { id: 'philadelphia-metro', name: 'Philadelphia Metro', address: '105 Riverview Avenue, Paulsboro, NJ 08066', precision: 'address', kind: 'operation' },
  { id: 'raleigh-nc', name: 'Raleigh, NC', address: '8205 Old McCullers Rd, Raleigh, NC 27603', precision: 'address', kind: 'operation' },
  { id: 'stamford-ct', name: 'Stamford, CT', address: 'Stamford, CT 06902', precision: 'city', kind: 'operation' },
  { id: 'syracuse-ny', name: 'Syracuse, NY', address: '532 State Fair Boulevard, Syracuse, NY 13204', precision: 'address', kind: 'operation' },
  { id: 'tampa-fl', name: 'Tampa, FL', address: '905 S Woodrow Wilson St, Plant City, FL 33563', precision: 'address', kind: 'operation' },
  { id: 'washington-dc-metro', name: 'Washington DC Metro', address: 'Washington, DC', precision: 'city', kind: 'operation' },
  { id: 'newburgh-ny-waterworks', name: 'Waterworks - Newburgh, NY', address: '77 Stewart Avenue, Newburgh, NY 12550', precision: 'address', kind: 'facility' },
  { id: 'williamsport-pa', name: 'Williamsport, PA', address: '2902 Reach Road, Williamsport, PA 17701', precision: 'address', kind: 'operation' },
  { id: 'woodstown-nj', name: 'Woodstown, NJ', address: '108 East Lake Road, Woodstown, NJ 08098', precision: 'address', kind: 'operation' },
  { id: 'youngstown-oh', name: 'Youngstown, OH', address: '3100 Benjamin Franklin Hwy, Edinburg, PA 16116', precision: 'address', kind: 'operation' },
];

async function censusGeocode(address) {
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Census HTTP ${res.status}`);
  const data = await res.json();
  const match = data?.result?.addressMatches?.[0];
  if (!match) return null;
  return { lat: match.coordinates.y, lng: match.coordinates.x, matched: match.matchedAddress };
}

async function nominatimGeocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=us`;
  const res = await fetch(url, { headers: { 'User-Agent': 'meg-territory-map/1.0 (one-time geocode)' } });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const data = await res.json();
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), matched: data[0].display_name };
}

const results = [];
for (const loc of LOCATIONS) {
  let geo = null;
  try {
    if (loc.precision === 'address') {
      geo = await censusGeocode(loc.address);
      if (!geo) {
        console.warn(`  Census miss for ${loc.name}, falling back to Nominatim`);
        geo = await nominatimGeocode(loc.address);
      }
    } else {
      geo = await nominatimGeocode(loc.address);
    }
  } catch (err) {
    console.error(`  ERROR geocoding ${loc.name}: ${err.message}`);
  }
  if (!geo) {
    console.error(`  FAILED: ${loc.name} (${loc.address})`);
    results.push({ ...loc, lat: null, lng: null });
  } else {
    console.log(`  OK ${loc.name}: ${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}  <- ${geo.matched}`);
    results.push({
      id: loc.id, name: loc.name, address: loc.address, kind: loc.kind,
      precision: loc.precision,
      lat: Math.round(geo.lat * 1e5) / 1e5, lng: Math.round(geo.lng * 1e5) / 1e5,
    });
  }
  await new Promise((r) => setTimeout(r, 1100)); // be polite to free geocoders
}

const failed = results.filter((r) => r.lat === null);
if (failed.length) {
  console.error(`\n${failed.length} locations failed to geocode — fix manually before committing.`);
  process.exitCode = 1;
}
writeFileSync(OUT, JSON.stringify(results, null, 2) + '\n');
console.log(`\nWrote ${results.length} locations to ${OUT}`);
