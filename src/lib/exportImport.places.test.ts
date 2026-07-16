import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { TerritoryState, ZipToCityLookup, USPlaces } from '@/types';
import { exportToCityLookup } from './exportImport';

// ---------------------------------------------------------------------------
// Self-contained test for the US-places by_city enrichment. Uses synthetic
// GeoJSON (two square ZIPs in GA) so it needs no downloaded fixtures and runs
// fast. Verifies the three guarantees of the enrichment:
//   1. a municipality USPS folds into a bigger city (Doraville -> "Atlanta")
//      becomes searchable and points at the same territory as its ZIP;
//   2. a name that resolves to >1 territory in a state is left out (not made
//      ambiguous);
//   3. an entry the ZIP pass already produced is never modified.
// ---------------------------------------------------------------------------

// Box 1 (Atlanta metro-ish): lng [-84.35,-84.20], lat [33.85,33.96]
const BOX1 = [[[-84.35, 33.85], [-84.20, 33.85], [-84.20, 33.96], [-84.35, 33.96], [-84.35, 33.85]]];
// Box 2 (far away, distinct territory): lng [-83.00,-82.90], lat [32.00,32.10]
const BOX2 = [[[-83.00, 32.00], [-82.90, 32.00], [-82.90, 32.10], [-83.00, 32.10], [-83.00, 32.00]]];

const GA_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { ZCTA5CE10: '30340' }, geometry: { type: 'Polygon', coordinates: BOX1 } },
    { type: 'Feature', properties: { ZCTA5CE10: '30500' }, geometry: { type: 'Polygon', coordinates: BOX2 } },
  ],
};

let result: {
  by_zip: Record<string, (number | string)[]>;
  by_city: Record<string, Record<string, (number | string)[]>>;
};

beforeAll(async () => {
  vi.stubGlobal('fetch', (url: string) => {
    const ok = (obj: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(obj) });
    if (url.endsWith('/geojson/ga.json')) return ok(GA_GEOJSON);
    // every other state file: empty collection
    return ok({ type: 'FeatureCollection', features: [] });
  });

  const state: TerritoryState = {
    locations: [
      { id: 'a', name: 'Atlanta, GA', address: '', formattedAddress: '', lat: 33.9, lng: -84.27, color: '#111', zipCodes: ['30340'], createdAt: '' },
      { id: 'b', name: 'Columbus', address: '', formattedAddress: '', lat: 32.05, lng: -82.95, color: '#222', zipCodes: ['30500'], createdAt: '' },
    ],
    zipAssignments: { '30340': 'a', '30500': 'b' },
    activeLocationId: null,
    viewMode: 'edit', paintMode: false, eraserMode: false, showUnassignedOnly: false,
    isGeocoding: false, geocodingProgress: { current: 0, total: 0 }, loadedStates: [], radiusPreview: null,
  };

  const zipToCity: ZipToCityLookup = {
    '30340': { city: 'Atlanta, GA', lat: 33.9, lng: -84.27 },
    '30500': { city: 'Columbus, GA', lat: 32.05, lng: -82.95 },
  };

  const usPlaces: USPlaces = [
    ['Doraville', 'GA', 33.9083, -84.2699],  // inside 30340 (territory a)
    ['Chamblee', 'GA', 33.8811, -84.3017],   // inside 30340
    ['Dunwoody', 'GA', 33.9414, -84.3127],   // inside 30340
    ['Atlanta', 'GA', 32.05, -82.95],        // name already in by_city -> must be ignored
    ['Centerville', 'GA', 33.90, -84.25],    // one Centerville in territory a ...
    ['Centerville', 'GA', 32.05, -82.95],    // ... another in territory b -> ambiguous, skip
  ];

  const { json } = await exportToCityLookup(state, zipToCity, usPlaces);
  result = JSON.parse(json);
});

describe('by_city enrichment from US places', () => {
  it('adds a folded-in municipality pointing at its ZIP territory', () => {
    for (const city of ['doraville', 'chamblee', 'dunwoody']) {
      expect(result.by_city[city], `${city} present`).toBeDefined();
      expect(result.by_city[city].ga).toEqual(result.by_zip['30340']);
    }
  });

  it('leaves out a name that resolves to more than one territory in the state', () => {
    expect(result.by_city['centerville']).toBeUndefined();
  });

  it('never modifies an entry the ZIP pass already produced', () => {
    // "Atlanta, GA" came from the ZIP pass (zip 30340 -> territory a). The stray
    // Atlanta place sits in territory b but must not change the existing entry.
    expect(result.by_city['atlanta'].ga).toEqual(result.by_zip['30340']);
  });

  it('is a no-op when no places are supplied', async () => {
    const state: TerritoryState = {
      locations: [{ id: 'a', name: 'Atlanta, GA', address: '', formattedAddress: '', lat: 33.9, lng: -84.27, color: '#111', zipCodes: ['30340'], createdAt: '' }],
      zipAssignments: { '30340': 'a' },
      activeLocationId: null, viewMode: 'edit', paintMode: false, eraserMode: false,
      showUnassignedOnly: false, isGeocoding: false, geocodingProgress: { current: 0, total: 0 },
      loadedStates: [], radiusPreview: null,
    };
    const { json } = await exportToCityLookup(state, { '30340': { city: 'Atlanta, GA', lat: 33.9, lng: -84.27 } });
    const r = JSON.parse(json);
    expect(r.by_city['doraville']).toBeUndefined();
    expect(r.by_city['atlanta'].ga).toEqual(r.by_zip['30340']);
  });
});

const baseState = (locations: TerritoryState['locations'], zipAssignments: Record<string, string>): TerritoryState => ({
  locations, zipAssignments, activeLocationId: null, viewMode: 'edit', paintMode: false,
  eraserMode: false, showUnassignedOnly: false, isGeocoding: false,
  geocodingProgress: { current: 0, total: 0 }, loadedStates: [], radiusPreview: null,
});
const loc = (id: string, name: string, zipCodes: string[]) =>
  ({ id, name, address: '', formattedAddress: '', lat: 0, lng: 0, color: '#000', zipCodes, createdAt: '' });

describe('straddle-city collapse to a single territory', () => {
  it('collapses to the territory holding the most of the city ZIPs', async () => {
    // Same USPS city name across 3 ZIPs: 2 in territory a, 1 in territory b.
    const state = baseState(
      [loc('a', 'Atlanta, GA', ['30340', '30341']), loc('b', 'Columbus', ['30500'])],
      { '30340': 'a', '30341': 'a', '30500': 'b' },
    );
    const zipToCity: ZipToCityLookup = {
      '30340': { city: 'Straddle, GA', lat: 0, lng: 0 },
      '30341': { city: 'Straddle, GA', lat: 0, lng: 0 },
      '30500': { city: 'Straddle, GA', lat: 0, lng: 0 },
    };
    const { json } = await exportToCityLookup(state, zipToCity);
    const r = JSON.parse(json);
    expect(r.by_city['straddle'].ga).toHaveLength(1);
    expect(r.by_city['straddle'].ga).toEqual(r.by_zip['30340']); // majority = territory a
  });

  it('counts ZIPs AFTER backfill, so a backfilled majority wins', async () => {
    // Pre-backfill: territory a=1 (30340), b=1 (30500) → a tie. A PO-box ZIP with
    // no polygon (30999) sits inside territory a's polygon and backfills to a,
    // making the true majority a=2. The collapse must follow the post-backfill count.
    const state = baseState(
      [loc('a', 'Atlanta, GA', ['30340']), loc('b', 'Columbus', ['30500'])],
      { '30340': 'a', '30500': 'b' },
    );
    const zipToCity: ZipToCityLookup = {
      '30340': { city: 'Flip, GA', lat: 33.90, lng: -84.27 }, // in BOX1 (territory a)
      '30500': { city: 'Flip, GA', lat: 32.05, lng: -82.95 }, // in BOX2 (territory b)
      '30999': { city: 'Flip, GA', lat: 33.88, lng: -84.30 }, // PO box, no polygon, inside BOX1
    };
    const { json } = await exportToCityLookup(state, zipToCity);
    const r = JSON.parse(json);
    expect(r.by_zip['30999']).toBeDefined();            // backfilled
    expect(r.by_city['flip'].ga).toHaveLength(1);
    expect(r.by_city['flip'].ga).toEqual(r.by_zip['30340']); // majority a after backfill
  });

  it('uses CITY_TIEBREAK on an even split (somerset,pa → Ohio Valley 2322)', async () => {
    // 1 ZIP each → 1/1 tie; override must decide.
    const state = baseState(
      [loc('ov', 'Ohio Valley, OH', ['15501']), loc('hb', 'Harrisburg, PA*', ['15502'])],
      { '15501': 'ov', '15502': 'hb' },
    );
    const zipToCity: ZipToCityLookup = {
      '15501': { city: 'Somerset, PA', lat: 0, lng: 0 },
      '15502': { city: 'Somerset, PA', lat: 0, lng: 0 },
    };
    const { json } = await exportToCityLookup(state, zipToCity);
    const r = JSON.parse(json);
    expect(r.by_city['somerset'].pa).toEqual([2322]);
  });
});
