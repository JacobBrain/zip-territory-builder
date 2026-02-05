# Product Requirements Document: Zip Territory Builder

**Version:** 1.0
**Date:** February 4, 2026
**Author:** Arachnid Works
**Status:** Draft

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [User Stories](#2-user-stories)
3. [Feature Specifications](#3-feature-specifications)
4. [Technical Architecture](#4-technical-architecture)
5. [UI/UX Wireframe Descriptions](#5-uiux-wireframe-descriptions)
6. [Implementation Phases](#6-implementation-phases)
7. [Appendices](#7-appendices)

---

## 1. Product Overview

### 1.1 Problem Statement

Sales organizations with multiple locations need to define geographic territories for each location. Traditional radius-based approaches create two critical problems:

1. **Overlapping coverage** — Circular radii inevitably overlap, causing confusion about which location "owns" a customer
2. **Coverage gaps** — Areas between circles go unassigned, leaving potential customers without a clear point of contact

The real world doesn't operate in perfect circles. Territories need to follow natural boundaries like highways, rivers, county lines, and competitive considerations. Human judgment is required to draw these lines effectively.

### 1.2 Solution

**Zip Territory Builder** is a web-based tool that allows users to:

1. Upload a list of business locations (name + address)
2. Visualize those locations as pins on an interactive map with zip code boundaries
3. "Paint" zip codes onto territories by dragging across the map
4. See color-coded territories to identify gaps and overlaps
5. Export the final territory assignments for use in CRM systems, routing software, or sales planning

### 1.3 Target Users

- **Sales Operations Managers** — Defining and adjusting sales territories
- **Regional Directors** — Visualizing coverage and identifying gaps
- **Business Analysts** — Exporting territory data for analysis and reporting

### 1.4 Goals & Success Metrics

| Goal | Success Metric |
|------|----------------|
| Enable territory creation without GIS expertise | User can create first territory within 5 minutes of loading the tool |
| Eliminate gaps and overlaps | User can visually verify 100% coverage with no conflicts |
| Support iterative refinement | User can export, close browser, re-import, and continue editing |
| Fast performance | Map interactions (pan, zoom, paint) feel instant (<100ms response) |

### 1.5 Scope

**In Scope (v1):**
- East Coast US coverage (16 states: ME, NH, VT, MA, RI, CT, NY, NJ, PA, DE, MD, VA, NC, SC, GA, FL)
- 20-30 locations per session
- CSV upload for locations
- Paint-mode territory assignment
- Color-coded territory visualization
- Overlap warnings
- JSON export/import
- URL-based sharing (for small datasets)

**Out of Scope (v1):**
- User authentication / accounts
- Database persistence
- Real-time collaboration
- Territory auto-optimization
- West Coast / Midwest coverage
- Mobile-optimized interface

### 1.6 Assumptions & Constraints

**Assumptions:**
- Users have modern browsers (Chrome, Firefox, Edge, Safari)
- Users have reliable internet connections
- Locations are real US addresses that can be geocoded
- ~500-2000 zip codes will be assigned across all territories

**Constraints:**
- No backend database (stateless, export/import only)
- Free-tier API limits (Google Geocoding: 10,000/month)
- GeoJSON file sizes must be manageable for browser performance

---

## 2. User Stories

### 2.1 Location Management

#### US-1: Upload Locations via CSV
**As a** sales operations manager
**I want to** upload a CSV file containing my location names and addresses
**So that** I can quickly populate the map with all my locations without manual entry

**Acceptance Criteria:**
- [ ] System accepts CSV files with columns: `name`, `address` (at minimum)
- [ ] System validates CSV format and shows clear error messages for malformed files
- [ ] System geocodes each address using Google Maps Geocoding API
- [ ] System displays a progress indicator during geocoding
- [ ] System shows a summary of successfully geocoded locations vs. failures
- [ ] Failed geocodes display the problematic address and allow manual lat/lng entry
- [ ] Successfully geocoded locations appear as pins on the map

**Example CSV Format:**
```csv
name,address
"Richmond Main Office","123 Main St, Richmond, VA 23220"
"Norfolk Branch","456 Harbor Blvd, Norfolk, VA 23510"
"DC Metro Office","789 K Street NW, Washington, DC 20001"
```

#### US-2: Manually Add a Location
**As a** user
**I want to** manually add a single location by typing its name and address
**So that** I can add locations one at a time or fix geocoding failures

**Acceptance Criteria:**
- [ ] Form fields for: Location Name, Address (single line or structured)
- [ ] "Add Location" button triggers geocoding and adds pin to map
- [ ] Optional: Manual lat/lng override fields for addresses that don't geocode
- [ ] New location appears in the location list and on the map

#### US-3: Edit a Location
**As a** user
**I want to** edit an existing location's name or address
**So that** I can fix typos or update information without re-uploading

**Acceptance Criteria:**
- [ ] Click location in list or pin on map to select it
- [ ] Edit form appears with current values pre-filled
- [ ] Changing address triggers re-geocoding
- [ ] Changes reflect immediately on map and in list

#### US-4: Delete a Location
**As a** user
**I want to** delete a location I no longer need
**So that** I can clean up my workspace

**Acceptance Criteria:**
- [ ] Delete button available for each location
- [ ] Confirmation prompt before deletion
- [ ] Deleting a location also unassigns all zip codes assigned to it
- [ ] Unassigned zip codes revert to neutral/unassigned color

---

### 2.2 Map Interaction

#### US-5: View Zip Code Boundaries
**As a** user
**I want to** see zip code boundaries overlaid on the map
**So that** I can understand the geographic units I'll be assigning

**Acceptance Criteria:**
- [ ] Zip code polygons render over base map tiles
- [ ] Boundaries are visible but don't obscure underlying map details
- [ ] Polygons load progressively based on viewport (not all 5000+ at once)
- [ ] Zoom level determines boundary visibility (hide at very low zoom)
- [ ] Each polygon displays its zip code number (at appropriate zoom levels)

#### US-6: Pan and Zoom the Map
**As a** user
**I want to** navigate the map smoothly
**So that** I can focus on different areas while building territories

**Acceptance Criteria:**
- [ ] Standard map controls: drag to pan, scroll to zoom, +/- buttons
- [ ] Double-click to zoom in on a point
- [ ] Map stays responsive even with many polygons loaded
- [ ] "Fit to Locations" button zooms to show all location pins

#### US-7: View Location Details on Hover/Click
**As a** user
**I want to** see information about a location when I interact with its pin
**So that** I can identify locations while working

**Acceptance Criteria:**
- [ ] Hovering over a pin shows tooltip with location name
- [ ] Clicking a pin shows popup with full details (name, address, assigned zip count)
- [ ] Clicking a pin also selects that location for territory assignment

---

### 2.3 Territory Assignment

#### US-8: Select Active Location for Assignment
**As a** user
**I want to** select which location I'm currently assigning zip codes to
**So that** my paint actions know which territory to assign to

**Acceptance Criteria:**
- [ ] Location list shows all locations with their assigned colors
- [ ] Clicking a location in the list makes it "active"
- [ ] Active location is visually highlighted in the list
- [ ] Active location's pin pulses or highlights on the map
- [ ] Status bar shows "Assigning to: [Location Name]"

#### US-9: Paint Zip Codes to Territory (Paint Mode)
**As a** user
**I want to** hold Shift and drag across the map to "paint" zip codes
**So that** I can quickly assign large contiguous areas to a territory

**Acceptance Criteria:**
- [ ] With a location selected, holding Shift changes cursor to paint brush icon
- [ ] Shift+drag creates a visible paint stroke trail
- [ ] All zip code polygons touched by the paint stroke get assigned to active location
- [ ] Assigned polygons immediately change to the location's color
- [ ] Paint stroke trail disappears after mouse release
- [ ] Performance: painting should feel instant, no lag

#### US-10: Click to Toggle Single Zip Code
**As a** user
**I want to** click a single zip code to toggle its assignment
**So that** I can make precise adjustments without painting

**Acceptance Criteria:**
- [ ] Single click on unassigned zip → assigns to active location
- [ ] Single click on zip assigned to active location → unassigns it (returns to neutral)
- [ ] Single click on zip assigned to different location → shows reassignment warning
- [ ] If user confirms reassignment, zip changes to active location's color

#### US-11: Handle Overlapping Assignments (Warning)
**As a** user
**I want to** be warned when I'm about to reassign a zip code from another territory
**So that** I can make intentional decisions about overlaps

**Acceptance Criteria:**
- [ ] Warning modal appears: "This zip code (XXXXX) is currently assigned to [Location A]. Reassign to [Location B]?"
- [ ] Options: "Reassign" / "Cancel"
- [ ] Optional: "Don't warn me again this session" checkbox
- [ ] If painting over multiple already-assigned zips, show count: "X zip codes will be reassigned from other territories. Continue?"

#### US-12: Unassign Zip Codes
**As a** user
**I want to** remove zip codes from a territory without reassigning them
**So that** I can clear mistakes or leave areas intentionally unassigned

**Acceptance Criteria:**
- [ ] "Eraser mode" toggle or keyboard shortcut (E key)
- [ ] In eraser mode, clicking or painting removes assignments (returns to neutral)
- [ ] Visual indicator that eraser mode is active
- [ ] Press E again or click toggle to exit eraser mode

---

### 2.4 Visualization

#### US-13: Color-Coded Territories
**As a** user
**I want to** see each territory in a distinct color
**So that** I can visually distinguish territories at a glance

**Acceptance Criteria:**
- [ ] System auto-assigns a unique color to each location from a predefined palette
- [ ] Colors have sufficient contrast to distinguish adjacent territories
- [ ] Unassigned zip codes are a neutral color (light gray)
- [ ] Color is shown next to location name in the list
- [ ] Optional: User can change a location's color via color picker

#### US-14: View Territory Statistics
**As a** user
**I want to** see summary statistics for each territory
**So that** I can ensure balanced territory sizes

**Acceptance Criteria:**
- [ ] Each location in list shows: Name, Color, Zip Code Count
- [ ] Clicking "Details" expands to show list of assigned zip codes
- [ ] Total summary at bottom: Total Locations, Total Assigned Zips, Unassigned Zips

#### US-15: Highlight Unassigned Areas
**As a** user
**I want to** easily identify zip codes that haven't been assigned to any territory
**So that** I can ensure complete coverage

**Acceptance Criteria:**
- [ ] Unassigned zip codes are visually distinct (light gray with dashed border)
- [ ] "Show Unassigned Only" toggle dims assigned territories
- [ ] Count of unassigned zip codes displayed in status bar

---

### 2.5 Import/Export

#### US-16: Export Territory Data to JSON
**As a** user
**I want to** export my complete territory configuration to a JSON file
**So that** I can save my work and reload it later

**Acceptance Criteria:**
- [ ] "Export" button downloads a JSON file
- [ ] Filename: `territories_YYYY-MM-DD_HHMMSS.json`
- [ ] JSON includes: locations array, zip assignments, metadata (export date, version)
- [ ] File is human-readable (formatted, not minified)

**Example Export Format:**
```json
{
  "version": "1.0",
  "exportedAt": "2026-02-04T15:30:00Z",
  "locations": [
    {
      "id": "loc_001",
      "name": "Richmond Main Office",
      "address": "123 Main St, Richmond, VA 23220",
      "lat": 37.5407,
      "lng": -77.4360,
      "color": "#E63946",
      "zipCodes": ["23220", "23221", "23222", "23223"]
    }
  ],
  "metadata": {
    "totalLocations": 22,
    "totalAssignedZips": 487,
    "unassignedZips": 13
  }
}
```

#### US-17: Import Territory Data from JSON
**As a** user
**I want to** import a previously exported JSON file
**So that** I can continue editing from where I left off

**Acceptance Criteria:**
- [ ] "Import" button opens file picker
- [ ] System validates JSON structure
- [ ] Import replaces all current data (with confirmation warning)
- [ ] After import, map updates to show all locations and territory colors
- [ ] Error handling for invalid or corrupted files

#### US-18: Export Territory Data to CSV (Human-Readable)
**As a** user
**I want to** export territory assignments as a CSV
**So that** I can use the data in Excel, CRM imports, or other tools

**Acceptance Criteria:**
- [ ] "Export CSV" button downloads a CSV file
- [ ] Format: `zip_code, location_name, location_address`
- [ ] One row per assigned zip code
- [ ] Sorted by location name, then zip code

**Example CSV Output:**
```csv
zip_code,location_name,location_address
23220,Richmond Main Office,"123 Main St, Richmond, VA 23220"
23221,Richmond Main Office,"123 Main St, Richmond, VA 23220"
23510,Norfolk Branch,"456 Harbor Blvd, Norfolk, VA 23510"
23511,Norfolk Branch,"456 Harbor Blvd, Norfolk, VA 23510"
```

---

### 2.6 Sharing

#### US-19: Share via URL
**As a** user
**I want to** generate a shareable link to my territory configuration
**So that** I can share a view with colleagues without sending files

**Acceptance Criteria:**
- [ ] "Share" button generates a URL with encoded data
- [ ] URL can be copied to clipboard with one click
- [ ] Opening the URL loads the territory configuration in view mode
- [ ] For large datasets exceeding URL limits, show message: "Dataset too large for URL sharing. Please use Export/Import."
- [ ] Shared view is read-only by default; user can click "Edit" to make changes

---

## 3. Feature Specifications

### 3.1 Location Management

#### 3.1.1 CSV Upload Specification

**Supported Columns:**

| Column | Required | Description |
|--------|----------|-------------|
| `name` | Yes | Display name for the location |
| `address` | Yes | Full address for geocoding |
| `lat` | No | Manual latitude override |
| `lng` | No | Manual longitude override |
| `color` | No | Hex color code (e.g., #E63946) |

**Parsing Rules:**
- First row is treated as headers (case-insensitive matching)
- Columns can be in any order
- Extra columns are ignored
- Empty rows are skipped
- Quoted values handle commas within fields

**Error Handling:**
- Missing required column → error message, upload rejected
- Missing value in required field → row flagged, other rows processed
- Geocoding failure → row flagged, manual entry required

#### 3.1.2 Geocoding Logic

**Primary Method:** Google Maps Geocoding API

**Request Format:**
```
GET https://maps.googleapis.com/maps/api/geocode/json
  ?address={encoded_address}
  &key={API_KEY}
```

**Success Handling:**
- Extract `geometry.location.lat` and `geometry.location.lng`
- Store `formatted_address` for display

**Failure Handling:**
- `ZERO_RESULTS` → flag for manual entry
- `OVER_QUERY_LIMIT` → retry with exponential backoff
- `REQUEST_DENIED` → show API key error
- Network error → retry up to 3 times

**Rate Limiting:**
- Process addresses sequentially with 100ms delay
- Show progress: "Geocoding location 5 of 22..."

#### 3.1.3 Location Data Model

```typescript
interface Location {
  id: string;              // Unique identifier (UUID)
  name: string;            // Display name
  address: string;         // Original input address
  formattedAddress: string; // Google-formatted address
  lat: number;             // Latitude
  lng: number;             // Longitude
  color: string;           // Hex color for territory
  zipCodes: string[];      // Assigned zip codes
  createdAt: Date;         // Timestamp
}
```

---

### 3.2 Map Interaction

#### 3.2.1 Zip Code Boundary Loading Strategy

**Problem:** Loading all East Coast zip code polygons at once (~5000+ polygons) would be slow and memory-intensive.

**Solution:** Progressive loading based on viewport and zoom level.

**Zoom Level Behavior:**

| Zoom Level | Behavior |
|------------|----------|
| 1-6 | No zip boundaries shown (too zoomed out) |
| 7-9 | State outlines only (optional) |
| 10+ | Zip code boundaries for visible viewport |

**Loading Strategy:**
1. Determine current map viewport bounds
2. Identify which state files intersect with viewport
3. Load those state GeoJSON files if not already cached
4. Filter polygons to only those intersecting viewport
5. Render filtered polygons
6. On pan/zoom, repeat with new viewport

**Caching:**
- Once a state's GeoJSON is loaded, keep it in memory
- Only reload on page refresh

#### 3.2.2 Paint Mode Interaction

**Activation:** Hold Shift key

**Visual Feedback:**
- Cursor changes to crosshair or paint brush icon
- Status bar shows "Paint Mode: Drag to assign zip codes"

**Painting Mechanics:**
1. On Shift+mousedown: start recording paint path
2. On mousemove (while Shift held): extend path, draw visual trail
3. On mouseup or Shift release: finalize paint
4. Calculate which polygons intersect with paint path
5. Assign intersecting polygons to active location
6. Clear visual trail

**Intersection Detection:**
- Use Turf.js `booleanIntersects` to check if paint path intersects each polygon
- Optimize by first checking bounding box intersection

#### 3.2.3 Click Interaction

**Single Click on Zip Polygon:**
1. Identify clicked polygon via Leaflet event
2. Check current assignment status
3. If unassigned → assign to active location
4. If assigned to active location → unassign
5. If assigned to different location → show warning modal

**Click on Location Pin:**
1. Select that location as active
2. Show location popup with details
3. Highlight location in sidebar list

---

### 3.3 Color Palette

**Auto-Assignment Palette (20 colors):**

```javascript
const TERRITORY_COLORS = [
  '#E63946', // Red
  '#457B9D', // Steel Blue
  '#2A9D8F', // Teal
  '#E9C46A', // Saffron
  '#F4A261', // Sandy Brown
  '#9B5DE5', // Purple
  '#00BBF9', // Cyan
  '#F15BB5', // Pink
  '#00F5D4', // Turquoise
  '#FEE440', // Yellow
  '#8338EC', // Violet
  '#3A86FF', // Blue
  '#FF006E', // Magenta
  '#FB5607', // Orange
  '#38B000', // Green
  '#7209B7', // Deep Purple
  '#4CC9F0', // Light Blue
  '#B5179E', // Fuchsia
  '#560BAD', // Indigo
  '#480CA8', // Dark Indigo
];
```

**Assignment Logic:**
- Each new location gets the next color in the array
- If more than 20 locations, cycle back with slight variation
- User can manually override any color

**Unassigned Style:**
- Fill: `#E5E5E5` (light gray)
- Border: `#999999` (medium gray)
- Border style: dashed

---

### 3.4 Export/Import

#### 3.4.1 JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["version", "exportedAt", "locations"],
  "properties": {
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+$"
    },
    "exportedAt": {
      "type": "string",
      "format": "date-time"
    },
    "locations": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "name", "lat", "lng", "zipCodes"],
        "properties": {
          "id": { "type": "string" },
          "name": { "type": "string" },
          "address": { "type": "string" },
          "lat": { "type": "number" },
          "lng": { "type": "number" },
          "color": { "type": "string", "pattern": "^#[0-9A-Fa-f]{6}$" },
          "zipCodes": {
            "type": "array",
            "items": { "type": "string", "pattern": "^\\d{5}$" }
          }
        }
      }
    },
    "metadata": {
      "type": "object",
      "properties": {
        "totalLocations": { "type": "integer" },
        "totalAssignedZips": { "type": "integer" },
        "unassignedZips": { "type": "integer" }
      }
    }
  }
}
```

#### 3.4.2 URL Sharing Encoding

**Encoding Process:**
1. Serialize state to minimal JSON (omit defaults)
2. Compress with pako/gzip
3. Base64 encode
4. Append as URL parameter: `?data={encoded}`

**Size Limits:**
- URL safe limit: ~2000 characters
- Typical location: ~50 chars when compressed
- Practical limit: ~30 locations with moderate zip assignments

**Fallback:**
- If encoded data exceeds 1800 chars, show warning
- Suggest using file export instead

---

## 4. Technical Architecture

### 4.1 Technology Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Framework | Next.js 16 (App Router) | Proven stack from Zip Radius Finder, excellent DX |
| Language | TypeScript 5.x | Type safety, better tooling |
| Map Library | Leaflet + React-Leaflet | Free, mature, good polygon support |
| Base Tiles | OpenStreetMap | Free, no API key required |
| Zip Boundaries | OpenDataDE GeoJSON | Free, pre-processed, per-state files |
| Geocoding | Google Maps Geocoding API | Best accuracy, sufficient free tier |
| State Management | React Context + useReducer | Sufficient for client-only app |
| Styling | CSS Modules or Tailwind | Consistent with existing patterns |
| Deployment | Vercel | Free tier, excellent Next.js support |

### 4.2 Project Structure

```
zip-territory-builder/
├── app/
│   ├── page.tsx                 # Main application page
│   ├── layout.tsx               # Root layout
│   ├── globals.css              # Global styles
│   ├── api/
│   │   └── geocode/
│   │       └── route.ts         # Geocoding proxy endpoint
│   └── components/
│       ├── Map/
│       │   ├── TerritoryMap.tsx      # Main map component
│       │   ├── ZipPolygon.tsx        # Individual zip polygon
│       │   ├── LocationPin.tsx       # Location marker
│       │   └── PaintOverlay.tsx      # Paint mode overlay
│       ├── Sidebar/
│       │   ├── Sidebar.tsx           # Main sidebar container
│       │   ├── LocationList.tsx      # List of locations
│       │   ├── LocationItem.tsx      # Single location row
│       │   ├── AddLocationForm.tsx   # Manual add form
│       │   └── TerritoryStats.tsx    # Summary statistics
│       ├── Modals/
│       │   ├── ImportModal.tsx       # Import file dialog
│       │   ├── ExportModal.tsx       # Export options dialog
│       │   ├── WarningModal.tsx      # Reassignment warning
│       │   └── CSVUploadModal.tsx    # CSV upload dialog
│       └── UI/
│           ├── Button.tsx
│           ├── ColorPicker.tsx
│           ├── FileInput.tsx
│           └── Toast.tsx
├── lib/
│   ├── geocoding.ts             # Google Geocoding API client
│   ├── zipBoundaries.ts         # GeoJSON loading and caching
│   ├── territoryState.ts        # State management (context/reducer)
│   ├── exportImport.ts          # Export/import utilities
│   ├── urlSharing.ts            # URL encoding/decoding
│   ├── paintMode.ts             # Paint interaction logic
│   └── colors.ts                # Color palette and utilities
├── data/
│   └── geojson/
│       ├── ct_connecticut_zip_codes_geo.min.json
│       ├── de_delaware_zip_codes_geo.min.json
│       ├── fl_florida_zip_codes_geo.min.json
│       ├── ga_georgia_zip_codes_geo.min.json
│       ├── ma_massachusetts_zip_codes_geo.min.json
│       ├── md_maryland_zip_codes_geo.min.json
│       ├── me_maine_zip_codes_geo.min.json
│       ├── nc_north_carolina_zip_codes_geo.min.json
│       ├── nh_new_hampshire_zip_codes_geo.min.json
│       ├── nj_new_jersey_zip_codes_geo.min.json
│       ├── ny_new_york_zip_codes_geo.min.json
│       ├── pa_pennsylvania_zip_codes_geo.min.json
│       ├── ri_rhode_island_zip_codes_geo.min.json
│       ├── sc_south_carolina_zip_codes_geo.min.json
│       ├── va_virginia_zip_codes_geo.min.json
│       └── vt_vermont_zip_codes_geo.min.json
├── public/
│   ├── logo.png
│   └── icons/
│       ├── paint-cursor.svg
│       └── eraser-cursor.svg
├── types/
│   └── index.ts                 # TypeScript type definitions
├── package.json
├── tsconfig.json
├── next.config.ts
├── .env.local                   # Local environment variables
├── .env.example                 # Environment template
└── README.md
```

### 4.3 Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER                                         │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                        React Application                                │ │
│  │  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐   │ │
│  │  │    Sidebar       │    │   TerritoryMap   │    │     Modals       │   │ │
│  │  │  - Location List │    │  - Leaflet Map   │    │  - Import/Export │   │ │
│  │  │  - Add Form      │    │  - Zip Polygons  │    │  - Warnings      │   │ │
│  │  │  - Stats         │    │  - Location Pins │    │  - CSV Upload    │   │ │
│  │  └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘   │ │
│  │           │                       │                       │             │ │
│  │           └───────────────────────┼───────────────────────┘             │ │
│  │                                   │                                     │ │
│  │                    ┌──────────────▼──────────────┐                      │ │
│  │                    │     TerritoryContext        │                      │ │
│  │                    │  - locations: Location[]    │                      │ │
│  │                    │  - activeLocationId: string │                      │ │
│  │                    │  - zipAssignments: Map      │                      │ │
│  │                    │  - viewMode: 'edit'|'view'  │                      │ │
│  │                    └──────────────┬──────────────┘                      │ │
│  │                                   │                                     │ │
│  └───────────────────────────────────┼─────────────────────────────────────┘ │
│                                      │                                       │
│         ┌────────────────────────────┼────────────────────────────┐          │
│         │                            │                            │          │
│         ▼                            ▼                            ▼          │
│  ┌──────────────┐           ┌──────────────┐            ┌──────────────┐     │
│  │  Export to   │           │  Import from │            │  URL Share   │     │
│  │  JSON/CSV    │           │  JSON File   │            │  Encode      │     │
│  │  (Download)  │           │  (FileReader)│            │  (Clipboard) │     │
│  └──────────────┘           └──────────────┘            └──────────────┘     │
│                                                                              │
└───────────────────────────────────────────────────────────────────────────── ┘
                                      │
                                      │ Geocoding Requests
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           NEXT.JS SERVER                                     │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  /api/geocode                                                          │  │
│  │  - Receives address from client                                        │  │
│  │  - Calls Google Maps Geocoding API (server-side, hides API key)        │  │
│  │  - Returns lat/lng to client                                           │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     GOOGLE MAPS GEOCODING API                                │
│                     (External Service)                                       │
└──────────────────────────────────────────────────────────────────────────────┘

                              STATIC ASSETS
┌──────────────────────────────────────────────────────────────────────────────┐
│  /data/geojson/*.json                                                        │
│  - Loaded on-demand based on map viewport                                    │
│  - Cached in browser memory after first load                                 │
│  - ~16 state files, loaded as needed                                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 4.4 State Management

**Context Structure:**

```typescript
interface TerritoryState {
  // Locations
  locations: Location[];
  activeLocationId: string | null;

  // Zip assignments (for fast lookup)
  zipAssignments: Map<string, string>; // zipCode -> locationId

  // UI State
  viewMode: 'edit' | 'view';
  paintMode: boolean;
  eraserMode: boolean;
  showUnassignedOnly: boolean;

  // Loading states
  isGeocoding: boolean;
  geocodingProgress: { current: number; total: number };
  loadedStates: Set<string>; // Which state GeoJSON files are loaded

  // Warnings
  suppressReassignmentWarning: boolean;
}

type TerritoryAction =
  | { type: 'ADD_LOCATION'; payload: Location }
  | { type: 'UPDATE_LOCATION'; payload: Partial<Location> & { id: string } }
  | { type: 'DELETE_LOCATION'; payload: string }
  | { type: 'SET_ACTIVE_LOCATION'; payload: string | null }
  | { type: 'ASSIGN_ZIP'; payload: { zipCode: string; locationId: string } }
  | { type: 'UNASSIGN_ZIP'; payload: string }
  | { type: 'BULK_ASSIGN_ZIPS'; payload: { zipCodes: string[]; locationId: string } }
  | { type: 'IMPORT_STATE'; payload: TerritoryState }
  | { type: 'TOGGLE_PAINT_MODE' }
  | { type: 'TOGGLE_ERASER_MODE' }
  | { type: 'SET_GEOCODING_PROGRESS'; payload: { current: number; total: number } }
  | { type: 'MARK_STATE_LOADED'; payload: string }
  | { type: 'RESET' };
```

### 4.5 API Endpoints

#### POST /api/geocode

**Purpose:** Proxy geocoding requests to hide API key from client.

**Request:**
```json
{
  "address": "123 Main St, Richmond, VA 23220"
}
```

**Response (Success):**
```json
{
  "success": true,
  "lat": 37.5407,
  "lng": -77.4360,
  "formattedAddress": "123 Main St, Richmond, VA 23220, USA"
}
```

**Response (Failure):**
```json
{
  "success": false,
  "error": "Address not found"
}
```

### 4.6 Performance Considerations

#### GeoJSON Loading

**Challenge:** 16 state files could total 50-100MB if loaded all at once.

**Solution:**
1. Only load states visible in current viewport
2. Use bounding box pre-filtering
3. Cache loaded states in memory (don't re-fetch)

**Implementation:**
```typescript
// Determine which states to load based on viewport
function getStatesInViewport(bounds: LatLngBounds): string[] {
  const stateBounds = {
    'ny': { north: 45.02, south: 40.50, east: -71.86, west: -79.76 },
    'va': { north: 39.47, south: 36.54, east: -75.24, west: -83.68 },
    // ... other states
  };

  return Object.entries(stateBounds)
    .filter(([_, sb]) => boundsIntersect(bounds, sb))
    .map(([state]) => state);
}
```

#### Polygon Rendering

**Challenge:** Rendering thousands of polygons causes lag.

**Solutions:**
1. Use `preferCanvas: true` in Leaflet for better performance
2. Simplify polygon geometries for lower zoom levels
3. Only render polygons in viewport (spatial indexing)
4. Use React.memo to prevent unnecessary re-renders

#### Paint Mode Performance

**Challenge:** Checking intersection with hundreds of polygons on each mouse move.

**Solutions:**
1. Use spatial index (RBush) for fast bounding box queries
2. Only check detailed intersection for candidates from bbox query
3. Throttle intersection checks to 60fps max
4. Batch state updates (don't update on every polygon hit)

---

## 5. UI/UX Wireframe Descriptions

### 5.1 Overall Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  HEADER: Logo | "Zip Territory Builder" | [Import] [Export] [Share]  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────┐ ┌───────────────────────────────────────────────┐  │
│  │                     │ │                                               │  │
│  │      SIDEBAR        │ │                                               │  │
│  │                     │ │                    MAP                        │  │
│  │  - Location List    │ │                                               │  │
│  │  - Add Location     │ │              (Leaflet Map with                │  │
│  │  - Statistics       │ │               zip boundaries)                 │  │
│  │                     │ │                                               │  │
│  │   Width: 320px      │ │                                               │  │
│  │                     │ │                                               │  │
│  └─────────────────────┘ └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  STATUS BAR: "Assigning to: Richmond Office" | Zips: 487 | Mode: Edit │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Header Bar

**Elements:**
- **Logo** (left): Arachnid Works logo, links to home
- **Title**: "Zip Territory Builder"
- **Action Buttons** (right):
  - [Upload CSV] - Opens CSV upload modal
  - [Import] - Opens file picker for JSON import
  - [Export ▾] - Dropdown with "Export JSON" and "Export CSV"
  - [Share] - Generates and copies share URL

**Styling:**
- Fixed height: 60px
- Background: Oxford Blue (#0C1B32)
- Text/icons: White
- Buttons: Ghost style with hover states

### 5.3 Sidebar

**Width:** 320px (fixed)
**Sections:**

#### 5.3.1 Location List Section

```
┌────────────────────────────────────┐
│  LOCATIONS (22)        [+ Add]    │
├────────────────────────────────────┤
│  ┌────────────────────────────────┐│
│  │ ● Richmond Main Office    [✎] ││  <- Active (highlighted)
│  │   47 zip codes                 ││
│  └────────────────────────────────┘│
│  ┌────────────────────────────────┐│
│  │ ● Norfolk Branch          [✎] ││
│  │   32 zip codes                 ││
│  └────────────────────────────────┘│
│  ┌────────────────────────────────┐│
│  │ ● DC Metro Office         [✎] ││
│  │   28 zip codes                 ││
│  └────────────────────────────────┘│
│  ... (scrollable)                  │
└────────────────────────────────────┘
```

**Interactions:**
- Click row → Select as active location
- Click [✎] → Edit location details
- Colored dot shows territory color
- Active row has highlight background

#### 5.3.2 Add Location Section (Collapsed by Default)

```
┌────────────────────────────────────┐
│  + ADD NEW LOCATION               │
├────────────────────────────────────┤
│  Name:                            │
│  ┌────────────────────────────────┐│
│  │                                ││
│  └────────────────────────────────┘│
│  Address:                         │
│  ┌────────────────────────────────┐│
│  │                                ││
│  └────────────────────────────────┘│
│  ┌────────┐                        │
│  │  Add   │                        │
│  └────────┘                        │
└────────────────────────────────────┘
```

#### 5.3.3 Statistics Section

```
┌────────────────────────────────────┐
│  SUMMARY                          │
├────────────────────────────────────┤
│  Total Locations:        22       │
│  Assigned Zip Codes:    487       │
│  Unassigned:             13       │
│  ──────────────────────────────── │
│  Coverage:              97.4%     │
└────────────────────────────────────┘
```

### 5.4 Map Area

**Base Layer:** OpenStreetMap tiles

**Overlay Layers:**
1. **Zip Code Polygons**
   - Unassigned: Light gray fill, dashed gray border
   - Assigned: Solid fill with location's color, 50% opacity, solid border

2. **Location Pins**
   - Custom markers with location color
   - Pulsing animation for active location
   - Popup on click with location details

**Map Controls:**
- Zoom +/- buttons (top left)
- "Fit All" button (zoom to show all locations)
- Paint mode indicator (top right)

**Interactions:**
- Pan: Drag
- Zoom: Scroll wheel, +/- buttons, double-click
- Select zip: Single click on polygon
- Paint: Shift + drag
- Erase: E key + click/drag

### 5.5 Status Bar

**Content:**
- **Left:** Current mode indicator
  - "Select a location to begin" (no active location)
  - "Assigning to: [Location Name]" (active location)
  - "Eraser Mode: Click to unassign" (eraser active)

- **Center:** Quick stats
  - "487 assigned | 13 unassigned"

- **Right:** Mode toggles
  - [Paint Mode: ON/OFF]
  - [Eraser: ON/OFF]

### 5.6 Modal Dialogs

#### 5.6.1 CSV Upload Modal

```
┌─────────────────────────────────────────────────┐
│  Upload Locations CSV                     [X]   │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────────────────────────────────────┐    │
│  │                                         │    │
│  │        Drag & drop CSV file here        │    │
│  │              or click to browse         │    │
│  │                                         │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  Expected format:                               │
│  name, address                                  │
│  "Office Name", "123 Main St, City, ST 12345"  │
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │ Download template CSV                    │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
└─────────────────────────────────────────────────┘
```

#### 5.6.2 Geocoding Progress Modal

```
┌─────────────────────────────────────────────────┐
│  Geocoding Locations...                         │
├─────────────────────────────────────────────────┤
│                                                 │
│  ████████████░░░░░░░░░░░░░  12 of 22            │
│                                                 │
│  Current: "456 Harbor Blvd, Norfolk, VA"        │
│                                                 │
│  ✓ Richmond Main Office                         │
│  ✓ Norfolk Branch                               │
│  ⟳ DC Metro Office                              │
│  ...                                            │
│                                                 │
└─────────────────────────────────────────────────┘
```

#### 5.6.3 Reassignment Warning Modal

```
┌─────────────────────────────────────────────────┐
│  Reassign Zip Code?                       [X]   │
├─────────────────────────────────────────────────┤
│                                                 │
│  Zip code 23220 is currently assigned to:       │
│  "Norfolk Branch"                               │
│                                                 │
│  Reassign to "Richmond Main Office"?            │
│                                                 │
│  ☐ Don't warn me again this session             │
│                                                 │
│  ┌───────────┐  ┌───────────┐                   │
│  │  Cancel   │  │ Reassign  │                   │
│  └───────────┘  └───────────┘                   │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 5.7 Responsive Behavior

**Desktop (1200px+):** Full layout as described

**Tablet (768px - 1199px):**
- Sidebar collapses to icons only, expands on hover/click
- Map takes full width

**Mobile (<768px):**
- Not fully supported in v1
- Show message: "This tool works best on desktop"
- Basic functionality still accessible

---

## 6. Implementation Phases

### Phase 1: Foundation (Core Infrastructure)

**Goal:** Basic app shell with map display and location management

**Tasks:**
1. Initialize Next.js project with TypeScript
2. Set up project structure and base components
3. Implement Leaflet map with OpenStreetMap tiles
4. Create sidebar layout and location list component
5. Implement Google Geocoding API proxy endpoint
6. Build CSV upload and parsing logic
7. Create location data model and context
8. Display location pins on map
9. Implement single location add/edit/delete

**Deliverable:** User can upload CSV, see locations as pins on map

---

### Phase 2: Zip Code Boundaries

**Goal:** Display zip code polygons on the map

**Tasks:**
1. Download and integrate East Coast state GeoJSON files
2. Implement viewport-based GeoJSON loading
3. Create zip polygon rendering component
4. Implement zoom-level based visibility
5. Add zip code labels at appropriate zoom levels
6. Optimize rendering performance (canvas mode, memoization)
7. Implement spatial indexing for fast lookups

**Deliverable:** Map shows zip code boundaries that load dynamically

---

### Phase 3: Territory Assignment

**Goal:** Users can assign zip codes to locations

**Tasks:**
1. Implement click-to-assign for single zip codes
2. Build paint mode interaction (Shift+drag)
3. Create paint trail visual feedback
4. Implement intersection detection (Turf.js)
5. Build assignment state management
6. Add color-coded territory visualization
7. Implement eraser mode
8. Add reassignment warning modal
9. Build "suppress warnings" option

**Deliverable:** Full territory painting functionality works

---

### Phase 4: Import/Export

**Goal:** Users can save and restore their work

**Tasks:**
1. Implement JSON export with full state
2. Implement JSON import with validation
3. Build CSV export (human-readable format)
4. Add import confirmation modal
5. Implement error handling for invalid imports
6. Add download filename with timestamp

**Deliverable:** Complete export/import cycle works

---

### Phase 5: Polish & Sharing

**Goal:** Final features and UX polish

**Tasks:**
1. Implement URL-based sharing (encode/decode)
2. Add copy-to-clipboard for share URL
3. Build statistics summary display
4. Add "Fit to Locations" button
5. Implement toast notifications
6. Add loading states and progress indicators
7. Polish UI styling (Arachnid Works branding)
8. Add keyboard shortcuts help tooltip
9. Cross-browser testing
10. Performance optimization pass

**Deliverable:** Production-ready application

---

## 7. Appendices

### Appendix A: East Coast State Bounding Boxes

For viewport-based loading decisions:

| State | North | South | East | West |
|-------|-------|-------|------|------|
| ME | 47.46 | 43.06 | -66.95 | -71.08 |
| NH | 45.31 | 42.70 | -70.70 | -72.56 |
| VT | 45.02 | 42.73 | -71.47 | -73.44 |
| MA | 42.89 | 41.24 | -69.93 | -73.51 |
| RI | 42.02 | 41.15 | -71.12 | -71.86 |
| CT | 42.05 | 40.95 | -71.79 | -73.73 |
| NY | 45.02 | 40.50 | -71.86 | -79.76 |
| NJ | 41.36 | 38.93 | -73.89 | -75.56 |
| PA | 42.27 | 39.72 | -74.69 | -80.52 |
| DE | 39.84 | 38.45 | -75.05 | -75.79 |
| MD | 39.72 | 37.91 | -75.05 | -79.49 |
| VA | 39.47 | 36.54 | -75.24 | -83.68 |
| NC | 36.59 | 33.84 | -75.46 | -84.32 |
| SC | 35.22 | 32.03 | -78.54 | -83.35 |
| GA | 35.00 | 30.36 | -80.84 | -85.61 |
| FL | 31.00 | 24.52 | -80.03 | -87.63 |

### Appendix B: Color Palette Reference

**Territory Colors (20):**
```css
--color-01: #E63946;  /* Red */
--color-02: #457B9D;  /* Steel Blue */
--color-03: #2A9D8F;  /* Teal */
--color-04: #E9C46A;  /* Saffron */
--color-05: #F4A261;  /* Sandy Brown */
--color-06: #9B5DE5;  /* Purple */
--color-07: #00BBF9;  /* Cyan */
--color-08: #F15BB5;  /* Pink */
--color-09: #00F5D4;  /* Turquoise */
--color-10: #FEE440;  /* Yellow */
--color-11: #8338EC;  /* Violet */
--color-12: #3A86FF;  /* Blue */
--color-13: #FF006E;  /* Magenta */
--color-14: #FB5607;  /* Orange */
--color-15: #38B000;  /* Green */
--color-16: #7209B7;  /* Deep Purple */
--color-17: #4CC9F0;  /* Light Blue */
--color-18: #B5179E;  /* Fuchsia */
--color-19: #560BAD;  /* Indigo */
--color-20: #480CA8;  /* Dark Indigo */
```

**UI Colors (Arachnid Works):**
```css
--claret: #8C2433;
--claret-dark: #6B1C28;
--oxford-blue: #0C1B32;
--sea-green: #05B5A9;
--burnt-sienna: #EC7B57;
--french-gray: #ADAEBA;
--off-white: #FAFAFA;
```

### Appendix C: Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Shift + Drag | Paint mode (assign zips while dragging) |
| E | Toggle eraser mode |
| Escape | Cancel current operation / close modal |
| Ctrl/Cmd + S | Export to JSON |
| Ctrl/Cmd + O | Import from JSON |
| F | Fit map to all locations |
| 1-9 | Quick select location 1-9 |

### Appendix D: External Resources

**GeoJSON Data:**
- Repository: https://github.com/OpenDataDE/State-zip-code-GeoJSON
- License: Public Domain (derived from US Census data)

**APIs:**
- Google Maps Geocoding: https://developers.google.com/maps/documentation/geocoding
- Free tier: 10,000 requests/month

**Libraries:**
- Leaflet: https://leafletjs.com/
- React-Leaflet: https://react-leaflet.js.org/
- Turf.js (geospatial): https://turfjs.org/
- Papaparse (CSV): https://www.papaparse.com/
- Pako (compression): https://github.com/nodeca/pako

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-04 | Claude | Initial draft |

---

*End of PRD*
