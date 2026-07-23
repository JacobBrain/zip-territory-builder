/**
 * Headless Location Lookup generator (doubles as a self-check).
 *
 * The "Location Lookup" button in the ZIP Territory Builder UI is just
 * `exportToCityLookup`. This runs that same function against the client's
 * "JSON - Full data (re-importable)" export (`territories_*.json`) and writes the
 * Location Lookup file Mike loads into the website search (no browser needed).
 *
 *   INPUT="/path/territories_YYYY-MM-DD….json" OUTPUT="./location-lookup.json" \
 *     npx vitest run scripts/generate-location-lookup.test.ts
 *
 * Needs prebuild data in public/ (npm run prebuild, or scripts/download-*.mjs):
 * public/geojson/*.json and public/data/{zip-to-city,us-places}.json.
 *
 * With no INPUT/OUTPUT it skips, so a plain `npx vitest run` is unaffected.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { TerritoryState, ZipToCityLookup, USPlaces } from '@/types';
import { exportToCityLookup } from '@/lib/exportImport';

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

const INPUT = process.env.INPUT;
const OUTPUT = process.env.OUTPUT;

describe('generate-location-lookup', () => {
  const maybe = INPUT && OUTPUT ? it : it.skip;

  maybe(
    'generates a Location Lookup file from a territories_*.json export',
    async () => {
      // Mock fetch so the export loads GeoJSON + zip-to-city from public/ on disk.
      vi.stubGlobal('fetch', (url: string) => {
        const relative = url.startsWith('/') ? url : new URL(url).pathname;
        return Promise.resolve(fakeResponse(relative));
      });

      const zipToCityLookup: ZipToCityLookup = JSON.parse(
        readFileSync(join(PUBLIC, 'data', 'zip-to-city.json'), 'utf-8')
      );
      const usPlaces: USPlaces = JSON.parse(
        readFileSync(join(PUBLIC, 'data', 'us-places.json'), 'utf-8')
      );

      interface TerritoryLocation {
        id: string;
        name: string;
        address: string;
        lat: number;
        lng: number;
        color: string;
        zipCodes: string[];
      }
      const input: { locations: TerritoryLocation[] } = JSON.parse(
        readFileSync(INPUT!, 'utf-8')
      );

      const locations = input.locations.map((loc) => ({
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
        for (const zip of loc.zipCodes) zipAssignments[zip] = loc.id;
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

      const { json } = await exportToCityLookup(state, zipToCityLookup, usPlaces);
      writeFileSync(OUTPUT!, json);
      const result = JSON.parse(json);

      // Self-check: every input location survives to the export (unmapped ones as
      // "unknown:<name>"), and the PO-box backfill still works (10158 -> NYC Metro
      // WP ID 2316, the original bug the export test guards).
      expect(result.locations.length).toBe(input.locations.length);
      expect(result.by_zip['10158']).toContain(2316);

      const unmapped: string[] = result._unmapped || [];
      if (unmapped.length) {
        // Not fatal: new offices with no location-ids.json entry land here and Mike
        // must map them. Surface, don't hide.
        console.warn(`_unmapped (${unmapped.length}): ${unmapped.join(', ')}`);
      }
      console.log(
        `Wrote ${OUTPUT}: ${result.locations.length} locations, ` +
          `${Object.keys(result.by_zip).length} by_zip, ` +
          `${Object.keys(result.by_city).length} by_city, ${unmapped.length} unmapped`
      );
    },
    120_000 // generous: loads 21 GeoJSON files
  );
});
