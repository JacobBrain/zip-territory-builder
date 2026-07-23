---
name: meg-utility-map-update
description: Use when someone asks to add or fix a utility/territory on the MEG (Miller Environmental Group) Utility Map — e.g. "a utility isn't showing up on the map", "add Gulf Power / [utility name]", "Kenny says [utility] didn't come up on search", or a ClickUp "Utility Location/Territory Addition" task. Handles the whole flow: diagnose why it's missing, add it to the map data, deploy, verify live, produce the Location Lookup file, and hand it to Mike.
---

# MEG Utility Map — add / fix a utility

This is the interim runbook for the current (manual) MEG utility-map process, until it gets rebuilt into something more streamlined. **Anyone can run this.** The deliverable goes **straight to Mike** — you do not need to route through Jacob or Chad first.

## The one thing to understand first: there are TWO separate systems

1. **Utility Map** (`/utility` on the site) — utility service territories drawn from **federal EIA-861 data**. This is what the client (Kenny relays from MEG) searches with "Find a utility". A missing/wrong utility here is fixed by **editing committed data + deploying** (git push → Vercel). Mike is NOT involved in this part.
2. **Location Lookup** (ZIP Builder → Export → "Location Lookup") — a `city/ZIP → location` mapping that **Mike loads into the client website's location search**. This is a different system. It's what you hand Mike.

Most "utility didn't show up on the map" tickets are **#1** (the deploy is the actual fix). Produce the **#2** Location Lookup file only if the utility/territory also needs to be resolvable on the website search — and note that a brand-new name exports as `unknown:<name>` under `_unmapped` until its WordPress location id is set (see below).

## Data source

Utility territories: HIFLD/EIA "Electric Retail Service Territories" (Form EIA-861), committed to `public/utility-data/utility-territories.json`. Substations: HIFLD (matched by territory). Plants: EIA-860 (matched by owner EIA ID). The client list → EIA mapping lives in `src/lib/utility-name-map.json`. The prebuild download scripts **skip if the committed JSON already exists**, so hand edits to the committed files survive a normal build.

## Prerequisites

- Repo: `JacobBrain/zip-territory-builder` (clone it; `npm install`). Push access needed to deploy (`master` → Vercel).
- The ClickUp task for the request (list "MEG (ACE)"). Log time and comments there.
- Optional: tl;dv connector, if you want to review how it's been done before.

## Procedure

### 1. Scope the request
Read the ClickUp task. Identify the utility name and the area/state. Note the drop-dead date.

### 2. Diagnose why it's missing
Search the live map's "Find a utility" box, and query the federal dataset directly to see if the utility exists there and under what name/ID:
```
# does a NAME exist in the retail-territories service?
curl -s "https://services3.arcgis.com/OYP7N6mAJJCyH6hd/arcgis/rest/services/Electric_Retail_Service_Territories_HIFLD/FeatureServer/0/query?where=NAME+LIKE+'%25<NAME>%25'&outFields=ID,NAME,STATE,HOLDING_CO,YEAR&returnGeometry=false&f=json"
```
Common reasons a utility is missing: it **merged into another utility** and its EIA-861 filing was retired (e.g. Gulf Power → FPL, 2021), it was **renamed**, or it's a **co-op/municipal** not on the client list. Figure out which — it determines the path below.

### 3. Pick the path

- **A — the utility still has its own federal polygon** (the NAME query returns a feature with an EIA ID): add it to `src/lib/utility-name-map.json` (`id`, `displayName`, `clientNames`, `parentCo`, `statesListed`, `eiaIds: [<id>]`, `eiaNames: ["<exact NAME>"]`), delete `public/utility-data/utility-territories.json` and `field-locations.json`, then rebuild:
  ```
  node scripts/download-utility-territories.mjs --force
  node scripts/download-field-locations.mjs --force
  ```
  (Heavy: re-fetches all utilities. Only do this if a fresh federal pull is acceptable.)

- **B — no federal polygon** (merged/absorbed, NAME query finds nothing): author the territory from the counties the utility served, using the config-driven script. **This is the common case.** Copy `scripts/utilities/gulf-power.json` to `scripts/utilities/<slug>.json`, edit the fields (name, clientNames, parentCo, customers, website, note, `entity` = the utility's own historical EIA id/name, `hqAddress`, `territory.counties` + `stateFips`/`stateAbbr`, `plantsOwnerEiaId` = the current owner's EIA id to pull the fleet, and `stripClientNameFrom` if the alias currently sits on another utility). Then:
  ```
  node scripts/add-manual-utility.mjs scripts/utilities/<slug>.json --dry-run   # sanity check
  node scripts/add-manual-utility.mjs scripts/utilities/<slug>.json
  ```
  Then add rows to `UTILITY_DATA_REPORT.md` (main table + Field Locations table) and a "Manual additions" note, including the county-envelope caveat (whole counties overstate the real filed footprint — say by roughly how much).

### 4. Verify
```
npx tsc --noEmit
npm run dev   # then open http://localhost:3000/utility, search the utility, confirm the territory renders in the right place and the info card is right
```
Sanity-check with point-in-polygon that expected cities are inside and neighbors (other states / adjacent utilities) are NOT.

### 5. Deploy
Commit only the intended files (don't commit `package-lock.json` churn from `npm install`; restore it). Push to `master`; Vercel auto-deploys the live client tool. Poll until it's live:
```
curl -s "https://zip-territory-builder.vercel.app/utility-data/utility-territories.json" | python3 -c "import sys,json;d=json.load(sys.stdin);print(any(u['id']=='<slug>' for u in d['utilities']))"
```
Then re-check the live `/utility` page in the browser.

### 6. Location Lookup file for Mike (only if the website search also needs it)
Build the territory as a named location in the ZIP Builder, then Export → Location Lookup. Fastest reliable way: generate `zip-to-city.json` (`node scripts/download-zip-cities.mjs`), point-in-polygon the utility's committed geometry against those ZIP centroids to get the ZIP set, build an Import JSON (`{version, exportedAt, locations:[{id,name,address,lat,lng,color,zipCodes:[…]}], metadata}`), Import it in the live ZIP Builder, then click **Export → Location Lookup** so the file is the app's real output. Verify it's the correct state only (no bleed across state lines — a radius from one pin bleeds; a county/territory match doesn't).

### 7. Deliver — directly to Mike
- Attach the Location Lookup file to the ClickUp task (`clickup_attach_task_file`).
- Post a comment addressed to **Mike** (resolve him with `clickup_find_member_by_name "Mike"`; notify him) explaining: what the file is, the ZIP/city counts, and — critically — that the location id is `unknown:<name>` under `_unmapped` because the name has no WordPress location id yet, so **Mike must map it to the real WP location id (or route it) before it resolves on the site.**
- Log your time on the task and leave a short summary comment of the map change (root cause + what shipped + that it's live).
- No Jacob/Chad sign-off required for the routine version of this.

## Gotchas / lessons learned

- **`--force` drops manual (path-B) entries.** They have empty `eiaIds`, so a `--force` rebuild skips them. After any `--force`, re-run `node scripts/add-manual-utility.mjs scripts/utilities/<slug>.json`. (The generator is written to skip them gracefully, not crash.)
- **County envelope overstates coverage.** Whole-county boundaries sweep in rural areas actually served by co-ops. Fine for a sales-overview map; say so in the note and report.
- **Get the EIA entity right.** Use the utility's OWN historical EIA id/name in the `entity` (e.g. Gulf Power = 7801), not the acquirer's id. Verify via the EIA-860 plants service or EIA-861 data before shipping — this shows on the client-facing info card.
- **`unknown:<name>` / `_unmapped`** in the Location Lookup means the name isn't in `src/lib/location-ids.json` (WP office ids). Expected for a utility; flag it for Mike.
- **Don't trust a single-pin radius for a stretched territory** — it bleeds across state lines and misses the far end. Match the actual counties/territory.
- **Live client tool.** `master` deploys straight to what clients see. Verify locally first. (A PR + Vercel preview is the safer long-term default once the process is rebuilt.)

## Reference files
- Data: `public/utility-data/utility-territories.json`, `public/utility-data/field-locations.json`
- Mapping: `src/lib/utility-name-map.json`; WP ids: `src/lib/location-ids.json`
- Scripts: `scripts/add-manual-utility.mjs` (+ `scripts/utilities/*.json`), `scripts/download-utility-territories.mjs`, `scripts/download-field-locations.mjs`, `scripts/download-zip-cities.mjs`
- Types: `src/types/utility.ts`; export logic: `src/lib/exportImport.ts`
- Audit/doc: `UTILITY_DATA_REPORT.md`
