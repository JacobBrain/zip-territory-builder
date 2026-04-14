import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { TerritoryState, ZipToCityLookup } from '@/types';
import { exportToCityLookup } from './exportImport';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PUBLIC = join(process.cwd(), 'public');

/** Read a file from /public and return it as a Response-like object. */
function fakeResponse(filePath: string) {
  const abs = join(PUBLIC, filePath);
  try {
    const buf = readFileSync(abs);
    return { ok: true, json: () => Promise.resolve(JSON.parse(buf.toString())) };
  } catch {
    return { ok: false, status: 404, json: () => Promise.reject('not found') };
  }
}

// ---------------------------------------------------------------------------
// Shared state — loaded once before all tests
// ---------------------------------------------------------------------------

let exportResult: {
  locations: { id: number | string; name: string }[];
  by_zip: Record<string, (number | string)[]>;
  by_city: Record<string, Record<string, (number | string)[]>>;
  _unmapped?: string[];
};

let zipToCityLookup: ZipToCityLookup;

beforeAll(async () => {
  // Mock fetch so the export can load GeoJSON + zip-to-city from disk
  vi.stubGlobal('fetch', (url: string) => {
    // url will be e.g. "/geojson/ny.json" or "/data/zip-to-city.json"
    const relative = url.startsWith('/') ? url : new URL(url).pathname;
    return Promise.resolve(fakeResponse(relative));
  });

  // Load zip-to-city data directly for assertions
  zipToCityLookup = JSON.parse(
    readFileSync(join(PUBLIC, 'data', 'zip-to-city.json'), 'utf-8')
  );

  // Build a realistic TerritoryState from the Miller Territories export.
  // We use the real territory file so the test reflects production data.
  const millerPath = join(process.env.HOME!, 'Downloads', 'Miller_Territories.json');
  interface MillerLocation {
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    color: string;
    zipCodes: string[];
  }

  let millerData: { locations: MillerLocation[] };
  try {
    millerData = JSON.parse(readFileSync(millerPath, 'utf-8'));
  } catch {
    throw new Error(
      `Test requires Miller_Territories.json at ${millerPath}. ` +
      'Export from the territory builder and place it there.'
    );
  }

  const locations = millerData.locations.map((loc) => ({
    id: loc.id,
    name: loc.name,
    address: loc.address,
    formattedAddress: loc.address,
    lat: loc.lat,
    lng: loc.lng,
    color: loc.color,
    zipCodes: loc.zipCodes || [],
    createdAt: new Date().toISOString(),
  }));

  const zipAssignments: Record<string, string> = {};
  for (const loc of locations) {
    for (const zip of loc.zipCodes) {
      zipAssignments[zip] = loc.id;
    }
  }

  const state: TerritoryState = {
    locations,
    zipAssignments,
    activeLocationId: null,
    viewMode: 'edit',
    paintMode: false,
    eraserMode: false,
    showUnassignedOnly: false,
    isGeocoding: false,
    geocodingProgress: { current: 0, total: 0 },
    loadedStates: [],
    radiusPreview: null,
  };

  // Run the export
  const { json } = await exportToCityLookup(state, zipToCityLookup);
  exportResult = JSON.parse(json);
}, 120_000); // generous timeout — loads 21 GeoJSON files

// ---------------------------------------------------------------------------
// 1. Standard ZIPs — have polygons, are directly assigned
// ---------------------------------------------------------------------------
describe('Standard ZIPs (have polygon, directly assigned)', () => {
  const cases: [string, string, number][] = [
    // [zip, territory, expected WP id]
    ['11542', 'NYC Metro', 2316],
    ['11010', 'NYC Metro', 2316],
    ['11020', 'NYC Metro', 2316],
    ['10001', 'NYC Metro', 2316],         // Manhattan core
    ['10016', 'NYC Metro', 2316],         // Midtown East
    ['10128', 'NYC Metro', 2316],         // Upper East Side
    ['30548', 'Atlanta, GA', 2274],
    ['30620', 'Atlanta, GA', 2274],
    ['30234', 'Atlanta, GA', 2274],
    ['08310', 'Philadelphia Metro', 2324],
    ['08046', 'Philadelphia Metro', 2324],
    ['08002', 'Philadelphia Metro', 2324],
    ['33603', 'Tampa, FL', 2332],
    ['33619', 'Tampa, FL', 2332],
    ['33617', 'Tampa, FL', 2332],
    ['21144', 'Baltimore, MD', 2276],
    ['21108', 'Baltimore, MD', 2276],
    ['21060', 'Baltimore, MD', 2276],
    ['12205', 'Albany, NY*', 2268],
    ['12009', 'Albany, NY*', 2268],
    ['06820', 'Stamford, CT', 2652],
    ['06830', 'Stamford, CT', 2652],
    ['06902', 'Stamford, CT', 2652],
    ['15377', 'Ohio Valley, OH', 2322],
    ['15004', 'Ohio Valley, OH', 2322],
  ];

  for (const [zip, territory, wpId] of cases) {
    it(`${zip} (${territory}) → by_zip contains WP ID ${wpId}`, () => {
      expect(exportResult.by_zip[zip]).toBeDefined();
      expect(exportResult.by_zip[zip]).toContain(wpId);
    });
  }
});

// ---------------------------------------------------------------------------
// 2. PO Box / Unique ZIPs — no polygon, should be backfilled via
//    point-in-polygon because their coords fall inside a painted territory
// ---------------------------------------------------------------------------
describe('PO Box / unique ZIPs (backfilled via point-in-polygon)', () => {
  const cases: [string, string, number][] = [
    // Manhattan PO Box ZIPs → NYC Metro
    ['10158', 'NYC Metro', 2316],   // the original bug report
    ['10008', 'NYC Metro', 2316],
    ['10041', 'NYC Metro', 2316],
    ['10043', 'NYC Metro', 2316],
    ['10055', 'NYC Metro', 2316],
    ['10101', 'NYC Metro', 2316],
    ['10108', 'NYC Metro', 2316],
    ['10116', 'NYC Metro', 2316],
    ['10120', 'NYC Metro', 2316],
    ['10150', 'NYC Metro', 2316],
    ['10156', 'NYC Metro', 2316],
    ['10159', 'NYC Metro', 2316],
    ['10163', 'NYC Metro', 2316],
    ['10199', 'NYC Metro', 2316],   // was directly assigned (has polygon)

    // Atlanta area PO Box ZIPs
    ['30003', 'Atlanta, GA', 2274],   // Norcross
    ['30006', 'Atlanta, GA', 2274],   // Marietta

    // Pennsylvania area PO Box ZIPs — Bethlehem is in Harrisburg's polygon, not Philly's
    ['18025', 'Harrisburg, PA*', 2308],     // Bethlehem
    ['18098', 'Philadelphia Metro', 2324],  // Emmaus

    // Baltimore / DC area
    ['20108', 'Baltimore, MD', 2276],  // Manassas, VA

    // Albany area
    ['12201', 'Albany, NY*', 2268],  // Albany PO Box
    ['12212', 'Albany, NY*', 2268],

    // Ohio Valley
    ['15123', 'Ohio Valley, OH', 2322],  // West Mifflin
    ['15230', 'Ohio Valley, OH', 2322],  // Pittsburgh
  ];

  for (const [zip, territory, wpId] of cases) {
    it(`${zip} (PO Box in ${territory}) → backfilled to WP ID ${wpId}`, () => {
      expect(exportResult.by_zip[zip]).toBeDefined();
      expect(exportResult.by_zip[zip]).toContain(wpId);
    });
  }
});

// ---------------------------------------------------------------------------
// 3. ZIPs outside any territory — should NOT appear in by_zip
// ---------------------------------------------------------------------------
describe('ZIPs outside any territory (should not be in by_zip)', () => {
  const outsideZips = [
    '25632',  // Lyburn, WV
    '22738',  // Rochelle, VA
    '36610',  // Mobile, AL
    '35098',  // Logan, AL
    '32301',  // Tallahassee, FL
    '27916',  // Aydlett, NC
    '25187',  // Southside, WV
    '04613',  // Birch Harbor, ME
    '24878',  // Premier, WV
    '03215',  // Waterville Valley, NH
  ];

  for (const zip of outsideZips) {
    const city = zipToCityLookup?.[zip]?.city ?? 'unknown';
    it(`${zip} (${city}) → not in by_zip`, () => {
      expect(exportResult.by_zip[zip]).toBeUndefined();
    });
  }
});

// ---------------------------------------------------------------------------
// 4. PO Box ZIPs whose city is NOT served — should NOT be backfilled
// ---------------------------------------------------------------------------
describe('PO Box ZIPs whose city name is NOT directly assigned but whose coords DO fall inside a territory polygon', () => {
  // These ZIPs have city names that no territory directly serves, but their
  // lat/lng coordinates land inside an assigned polygon — so the point-in-polygon
  // backfill correctly picks them up. This is the whole point of the feature.
  const cases: [string, string, number][] = [
    ['32030', 'Tampa, FL', 2332],         // Doctors Inlet, FL — inside Tampa territory polygon
    ['13814', 'Syracuse, NY', 2331],      // North Norwich, NY — inside Syracuse polygon
    ['13747', 'Albany, NY*', 2268],        // Colliersville, NY — inside Albany polygon
    ['17575', 'Harrisburg, PA*', 2308],   // Silver Spring, PA — inside Harrisburg polygon
    ['23873', 'Raleigh, NC*', 2326],      // Meredithville, VA — inside Raleigh polygon
  ];

  for (const [zip, territory, wpId] of cases) {
    it(`${zip} (city unserved but coords inside ${territory}) → backfilled to ${wpId}`, () => {
      expect(exportResult.by_zip[zip]).toBeDefined();
      expect(exportResult.by_zip[zip]).toContain(wpId);
    });
  }
});

describe('PO Box ZIPs genuinely outside all territory polygons (should not be in by_zip)', () => {
  const unservedZips = [
    '24037',  // Roanoke, VA — not in any territory's polygons
    '36427',  // Brewton, AL — not in any territory's polygons
    '40129',  // Hillview, KY — not in any territory's polygons
  ];

  for (const zip of unservedZips) {
    const city = zipToCityLookup?.[zip]?.city ?? 'unknown';
    it(`${zip} (${city}) → not in by_zip`, () => {
      expect(exportResult.by_zip[zip]).toBeUndefined();
    });
  }
});

// ---------------------------------------------------------------------------
// 5. by_city correctness — cities with assigned ZIPs should be present
// ---------------------------------------------------------------------------
describe('by_city lookup for major cities', () => {
  const cases: [string, string, number][] = [
    ['new_york', 'ny', 2316],
    ['atlanta', 'ga', 2274],
    ['tampa', 'fl', 2332],
    ['baltimore', 'md', 2276],
    ['albany', 'ny', 2268],
    ['stamford', 'ct', 2652],
    ['cherry_hill', 'nj', 2324],
    ['glen_cove', 'ny', 2316],
  ];

  for (const [cityKey, stateKey, wpId] of cases) {
    it(`by_city["${cityKey}"]["${stateKey}"] contains WP ID ${wpId}`, () => {
      expect(exportResult.by_city[cityKey]).toBeDefined();
      expect(exportResult.by_city[cityKey][stateKey]).toBeDefined();
      expect(exportResult.by_city[cityKey][stateKey]).toContain(wpId);
    });
  }
});

// ---------------------------------------------------------------------------
// 6. Cities NOT served should be absent from by_city
// ---------------------------------------------------------------------------
describe('Unserved cities absent from by_city', () => {
  const absentCities = [
    'tallahassee',   // FL, not in any territory
    'mobile',        // AL, not in any territory
    'birch_harbor',  // ME, not in any territory
    // Note: 'roanoke' is present because Roanoke, AL (36274) is served by Atlanta
  ];

  for (const city of absentCities) {
    it(`by_city["${city}"] is absent`, () => {
      expect(exportResult.by_city[city]).toBeUndefined();
    });
  }
});

// ---------------------------------------------------------------------------
// 7. Locations list — all mapped territories have numeric IDs
// ---------------------------------------------------------------------------
describe('Locations list', () => {
  it('contains all territories from location-ids.json', () => {
    const names = exportResult.locations.map(l => l.name);
    expect(names).toContain('NYC Metro');
    expect(names).toContain('Atlanta, GA');
    expect(names).toContain('Philadelphia Metro');
    expect(names).toContain('Baltimore, MD');
  });

  it('locations with known WP IDs have numeric id, not string', () => {
    for (const loc of exportResult.locations) {
      if (typeof loc.id === 'string' && loc.id.startsWith('unknown:')) continue;
      expect(typeof loc.id).toBe('number');
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Cross-state ZIPs that are assigned should appear correctly
// ---------------------------------------------------------------------------
describe('Cross-state ZIPs', () => {
  it('20135 (Bluemont, VA — assigned to Baltimore, MD) is in by_zip', () => {
    expect(exportResult.by_zip['20135']).toBeDefined();
    expect(exportResult.by_zip['20135']).toContain(2276);
  });

  it('21912 (Warwick, MD — assigned to Dover, DE) is in by_zip', () => {
    expect(exportResult.by_zip['21912']).toBeDefined();
    expect(exportResult.by_zip['21912']).toContain(2301);
  });
});

// ---------------------------------------------------------------------------
// 9. Overall sanity checks
// ---------------------------------------------------------------------------
describe('Overall sanity', () => {
  it('by_zip has more entries than just the directly-assigned ZIPs', () => {
    // The Miller data has ~9145 directly assigned ZIPs. With backfill, there
    // should be noticeably more.
    expect(Object.keys(exportResult.by_zip).length).toBeGreaterThan(9145);
  });

  it('by_city has entries', () => {
    expect(Object.keys(exportResult.by_city).length).toBeGreaterThan(100);
  });

  it('no by_zip entry has an empty array', () => {
    for (const [zip, ids] of Object.entries(exportResult.by_zip)) {
      expect(ids.length, `by_zip["${zip}"] is empty`).toBeGreaterThan(0);
    }
  });
});
