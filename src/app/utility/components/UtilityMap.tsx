'use client';

import { useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useUtilityMap } from '@/lib/utilityState';
import { megLocations, loadFieldLocations } from '@/lib/utilityData';
import {
  createMegIcon,
  createHqIcon,
  MEG_BRANCH_COLOR,
  MEG_TSDF_COLOR,
} from '@/app/components/Map/icons';
import { getUtilityColor } from '@/lib/colors';
import type { UtilityDataset, Utility, FieldLocationsDataset } from '@/types/utility';
import 'leaflet/dist/leaflet.css';

const HQ_COLOR = '#0C1B32'; // AW oxford blue - utility HQ pins
const IN_RANGE_COLOR = '#05B5A9'; // AW sea green - field location within radius
const OUT_RANGE_COLOR = '#9CA3AF'; // gray - field location beyond radius
const OUTLINE_COLOR = '#64748B'; // slate - calm default territory outline

/** Keep a ref in sync with the latest value (for Leaflet event handlers). */
function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

type TerritoryMode = 'default' | 'dimmed' | 'hovered' | 'selected';

/**
 * Single source of truth for territory polygon styling. Future contract-status
 * coloring (green = active contract, yellow = prospect) swaps this function.
 * Calm-by-default: neutral outlines until hover/selection reveals color.
 * Note: fill stays on (near-invisible) so polygon interiors remain clickable.
 */
function getUtilityStyle(color: string, mode: TerritoryMode): L.PathOptions {
  switch (mode) {
    case 'selected':
      return { color, weight: 3, opacity: 1, fillColor: color, fillOpacity: 0.35 };
    case 'hovered':
      return { color, weight: 2, opacity: 0.9, fillColor: color, fillOpacity: 0.15 };
    case 'dimmed':
      return { color: OUTLINE_COLOR, weight: 1, opacity: 0.25, fillColor: OUTLINE_COLOR, fillOpacity: 0.01 };
    default:
      return { color: OUTLINE_COLOR, weight: 1.2, opacity: 0.55, fillColor: OUTLINE_COLOR, fillOpacity: 0.02 };
  }
}

function modeFor(
  utilityId: string,
  selectedId: string | null,
  hoveredId: string | null
): TerritoryMode {
  if (selectedId === utilityId) return 'selected';
  if (hoveredId === utilityId) return 'hovered';
  if (selectedId) return 'dimmed';
  return 'default';
}

// ============ Territory Polygon Layer (imperative, ref-driven) ============
function TerritoryLayer({ dataset }: { dataset: UtilityDataset }) {
  const map = useMap();
  const { state, dispatch } = useUtilityMap();
  const stateRef = useLatestRef(state);

  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const polygonsRef = useRef<Map<string, L.GeoJSON>>(new Map());

  // Build polygons once per dataset
  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    layerGroupRef.current = group;

    dataset.utilities.forEach((utility) => {
      const layer = L.geoJSON(
        { type: 'Feature', properties: {}, geometry: utility.geometry } as GeoJSON.Feature,
        { style: getUtilityStyle(OUTLINE_COLOR, 'default') }
      );
      layer.bindTooltip(utility.name, { sticky: true, className: 'zip-tooltip' });
      layer.on('mouseover', () => dispatch({ type: 'HOVER_UTILITY', payload: utility.id }));
      layer.on('mouseout', () => dispatch({ type: 'HOVER_UTILITY', payload: null }));
      layer.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        dispatch({
          type: 'SELECT_UTILITY',
          payload: stateRef.current.selectedUtilityId === utility.id ? null : utility.id,
        });
      });
      group.addLayer(layer);
      polygonsRef.current.set(utility.id, layer);
    });

    const polygons = polygonsRef.current;
    return () => {
      group.remove();
      polygons.clear();
    };
  }, [map, dataset, dispatch, stateRef]);

  // Restyle on hover/selection changes
  useEffect(() => {
    dataset.utilities.forEach((utility, i) => {
      const layer = polygonsRef.current.get(utility.id);
      if (!layer) return;
      const mode = modeFor(utility.id, state.selectedUtilityId, state.hoveredUtilityId);
      layer.setStyle(getUtilityStyle(getUtilityColor(i), mode));
      if (mode === 'selected' || mode === 'hovered') layer.bringToFront();
    });
  }, [state.hoveredUtilityId, state.selectedUtilityId, dataset]);

  // Zoom to selection (triggered from finder or map clicks). Deferred a tick
  // with invalidateSize + a zoom cap: fitBounds against a not-yet-measured
  // container degenerates to max zoom (same guard as the zip builder's AutoFit).
  useEffect(() => {
    if (!state.selectedUtilityId) return;
    const layer = polygonsRef.current.get(state.selectedUtilityId);
    if (!layer) return;
    const bounds = layer.getBounds();
    if (!bounds.isValid()) return;
    const timer = setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 10 });
    }, 100);
    return () => clearTimeout(timer);
  }, [state.selectedUtilityId, map]);

  // Escape deselects
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stateRef.current.selectedUtilityId) {
        dispatch({ type: 'SELECT_UTILITY', payload: null });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dispatch, stateRef]);

  return null;
}

// ============ MEG Serviceability Rings (selection-only) ============
function RingsLayer() {
  const map = useMap();
  const { state } = useUtilityMap();
  const groupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    groupRef.current?.remove();
    groupRef.current = null;
    if (!state.showRings || !state.selectedUtilityId) return;

    const group = L.layerGroup().addTo(map);
    const radiusMeters = state.radiusMiles * 1609.344;
    for (const loc of megLocations) {
      group.addLayer(
        L.circle([loc.lat, loc.lng], {
          radius: radiusMeters,
          color: MEG_BRANCH_COLOR,
          weight: 1.5,
          opacity: 0.5,
          fillColor: MEG_BRANCH_COLOR,
          fillOpacity: 0.05,
          dashArray: '8 6',
          interactive: false,
        })
      );
    }
    groupRef.current = group;
    return () => {
      group.remove();
    };
  }, [state.showRings, state.radiusMiles, state.selectedUtilityId, map]);

  return null;
}

// ============ Field Locations (substations + plants for selected utility) ============
function FieldLocationsLayer() {
  const map = useMap();
  const { state } = useUtilityMap();
  const dataRef = useRef<FieldLocationsDataset | null>(null);
  const groupRef = useRef<L.LayerGroup | null>(null);
  // markers paired with their precomputed nearest-MEG distance for instant recolor
  const markersRef = useRef<{ marker: L.CircleMarker; distMiles: number; isPlant: boolean }[]>([]);

  const styleFor = (distMiles: number, isPlant: boolean, radiusMiles: number): L.PathOptions => {
    const inRange = distMiles <= radiusMiles;
    return {
      color: inRange ? '#03857C' : '#6B7280',
      weight: isPlant ? 2 : 1,
      fillColor: inRange ? IN_RANGE_COLOR : OUT_RANGE_COLOR,
      fillOpacity: isPlant ? 0.95 : 0.8,
      opacity: 0.9,
    };
  };

  // Build the dot layer when selection or toggles change
  useEffect(() => {
    groupRef.current?.remove();
    groupRef.current = null;
    markersRef.current = [];
    if (!state.selectedUtilityId || (!state.showSubstations && !state.showPlants)) return;

    let cancelled = false;
    const utilityId = state.selectedUtilityId;
    const radius = state.radiusMiles;

    loadFieldLocations().then((data) => {
      if (cancelled) return;
      dataRef.current = data;
      const entry = data.byUtility[utilityId];
      if (!entry) return;

      const group = L.layerGroup();
      const markers: { marker: L.CircleMarker; distMiles: number; isPlant: boolean }[] = [];

      if (state.showSubstations) {
        for (const [lng, lat, dist, name, maxVolt] of entry.substations) {
          const marker = L.circleMarker([lat, lng], {
            radius: 3,
            ...styleFor(dist, false, radius),
          });
          marker.bindTooltip(
            `${name || 'Substation'}${maxVolt ? ` · ${maxVolt} kV` : ''} · ${dist} mi to MEG`,
            { className: 'zip-tooltip', sticky: true }
          );
          group.addLayer(marker);
          markers.push({ marker, distMiles: dist, isPlant: false });
        }
      }
      if (state.showPlants) {
        for (const [lng, lat, dist, name, totalMw, primSource] of entry.plants) {
          const marker = L.circleMarker([lat, lng], {
            radius: 6,
            ...styleFor(dist, true, radius),
          });
          marker.bindTooltip(
            `⚡ ${name || 'Plant'}${totalMw ? ` · ${totalMw.toLocaleString('en-US')} MW` : ''}${primSource ? ` · ${primSource}` : ''} · ${dist} mi to MEG`,
            { className: 'zip-tooltip', sticky: true }
          );
          group.addLayer(marker);
          markers.push({ marker, distMiles: dist, isPlant: true });
        }
      }

      group.addTo(map);
      groupRef.current = group;
      markersRef.current = markers;
    });

    return () => {
      cancelled = true;
      groupRef.current?.remove();
      groupRef.current = null;
      markersRef.current = [];
    };
    // radius changes are handled by the cheap recolor effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, state.selectedUtilityId, state.showSubstations, state.showPlants]);

  // Instant recolor on radius change (no rebuild)
  useEffect(() => {
    for (const { marker, distMiles, isPlant } of markersRef.current) {
      marker.setStyle(styleFor(distMiles, isPlant, state.radiusMiles));
    }
  }, [state.radiusMiles]);

  return null;
}

// ============ Persistent map legend (bottom-left) ============
function MapLegend({ dataset }: { dataset: UtilityDataset }) {
  const map = useMap();
  const { state } = useUtilityMap();

  useEffect(() => {
    const utility = dataset.utilities.find((u) => u.id === state.selectedUtilityId);

    const idleRows = `
      <div class="field-legend-row"><span class="field-legend-dot" style="background:${MEG_BRANCH_COLOR}"></span> MEG branch</div>
      <div class="field-legend-row"><span class="field-legend-dot" style="background:${MEG_TSDF_COLOR};border-radius:2px"></span> MEG TSDF (disposal facility)</div>
      <div class="field-legend-row"><span class="field-legend-line"></span> Utility service territory</div>
    `;
    const selectedRows = utility
      ? `
      <div class="field-legend-row"><span class="field-legend-dot" style="background:${HQ_COLOR};border-radius:1px;transform:rotate(45deg)"></span> ${utility.name} HQ</div>
      <div class="field-legend-row"><span class="field-legend-dot" style="background:${IN_RANGE_COLOR}"></span> Field location within ${state.radiusMiles} mi of MEG</div>
      <div class="field-legend-row"><span class="field-legend-dot" style="background:${OUT_RANGE_COLOR}"></span> Beyond ${state.radiusMiles} mi</div>
      <div class="field-legend-row"><span class="field-legend-dot field-legend-plant"></span> Larger dot = power plant</div>
      <div class="field-legend-row"><span class="field-legend-ring"></span> ${state.radiusMiles} mi radius around MEG locations</div>
    `
      : '';

    const Legend = L.Control.extend({
      options: { position: 'bottomright' as L.ControlPosition },
      onAdd() {
        const div = L.DomUtil.create('div', 'field-legend');
        div.innerHTML = `
          <div class="field-legend-title">${utility ? `${utility.name}` : 'Map key'}</div>
          ${idleRows}
          ${selectedRows}
        `;
        return div;
      },
    });
    const ctrl = new Legend();
    map.addControl(ctrl);
    return () => {
      map.removeControl(ctrl);
    };
  }, [map, dataset, state.selectedUtilityId, state.radiusMiles]);

  return null;
}

// ============ Fit-all button ============
function FitAllButton({ dataset }: { dataset: UtilityDataset }) {
  const map = useMap();

  const fitAll = useCallback(() => {
    const bounds = L.latLngBounds(megLocations.map((l) => [l.lat, l.lng] as [number, number]));
    for (const u of dataset.utilities) {
      const layer = L.geoJSON({ type: 'Feature', properties: {}, geometry: u.geometry } as GeoJSON.Feature);
      bounds.extend(layer.getBounds());
    }
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });
  }, [map, dataset]);

  useEffect(() => {
    const FitControl = L.Control.extend({
      options: { position: 'topleft' as L.ControlPosition },
      onAdd() {
        const btn = L.DomUtil.create('button', 'leaflet-bar leaflet-control');
        btn.innerHTML = '&#x25A3;';
        btn.title = 'Fit to all territories (F)';
        btn.style.cssText =
          'width:32px;height:32px;background:white;border:none;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;border-radius:6px;';
        L.DomEvent.on(btn, 'click', (e) => {
          L.DomEvent.stopPropagation(e);
          L.DomEvent.preventDefault(e);
          fitAll();
        });
        return btn;
      },
    });
    const ctrl = new FitControl();
    map.addControl(ctrl);
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        if ((e.target as HTMLElement).tagName === 'INPUT') return;
        fitAll();
      }
    };
    window.addEventListener('keydown', keyHandler);
    return () => {
      map.removeControl(ctrl);
      window.removeEventListener('keydown', keyHandler);
    };
  }, [map, fitAll]);

  return null;
}

// ============ HQ pin popup content ============
function HqPopup({ utility }: { utility: Utility }) {
  const nearest = utility.stats.nearestMegFromHqMiles;
  return (
    <div style={{ minWidth: 180 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span
          style={{
            display: 'inline-block',
            width: 9,
            height: 9,
            backgroundColor: HQ_COLOR,
            transform: 'rotate(45deg)',
          }}
        />
        <strong>{utility.name}</strong>
      </div>
      {utility.hq.address && (
        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 2 }}>
          {utility.hq.precision === 'territory-center' ? 'Territory center (HQ address not geocodable): ' : ''}
          {utility.hq.address}
        </div>
      )}
      {nearest !== null && (
        <div style={{ fontSize: 12, color: '#374151' }}>
          {nearest.toFixed(1)} mi to nearest MEG location
          {utility.stats.nearestMegLocation ? ` (${utility.stats.nearestMegLocation})` : ''}
        </div>
      )}
    </div>
  );
}

// ============ Main map ============
export default function UtilityMap({
  dataset,
  children,
}: {
  dataset: UtilityDataset | null;
  children?: React.ReactNode;
}) {
  const { state } = useUtilityMap();

  const selected = dataset?.utilities.find((u) => u.id === state.selectedUtilityId) ?? null;

  return (
    <div className="map-wrapper">
      <MapContainer
        center={[39.5, -79.0]}
        zoom={6}
        style={{ width: '100%', height: '100%' }}
        preferCanvas={true}
        zoomControl={true}
        boxZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {dataset && <TerritoryLayer dataset={dataset} />}
        <RingsLayer />
        <FieldLocationsLayer />
        {dataset && <MapLegend dataset={dataset} />}
        {dataset && <FitAllButton dataset={dataset} />}

        {/* MEG locations - green circles (branches), blue squares (TSDFs) */}
        {megLocations.map((loc) => (
          <Marker
            key={loc.id}
            position={[loc.lat, loc.lng]}
            icon={createMegIcon(!!loc.tsdf)}
            zIndexOffset={600}
          >
            <Popup>
              <div style={{ minWidth: 160 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: loc.tsdf ? 2 : '50%',
                      backgroundColor: loc.tsdf ? MEG_TSDF_COLOR : MEG_BRANCH_COLOR,
                    }}
                  />
                  <strong>{loc.name}</strong>
                </div>
                <div style={{ fontSize: 12, color: '#6B7280' }}>{loc.address}</div>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                  MEG {loc.kind === 'affiliate' ? 'affiliated company' : loc.kind === 'facility' ? 'facility' : 'operation center'}
                  {loc.tsdf ? ' · Transfer, Storage & Disposal Facility' : ''}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Selected utility's HQ pin only */}
        {selected && (
          <Marker
            key={selected.id}
            position={[selected.hq.lat, selected.hq.lng]}
            icon={createHqIcon(HQ_COLOR, true)}
            zIndexOffset={400}
          >
            <Popup>
              <HqPopup utility={selected} />
            </Popup>
          </Marker>
        )}
      </MapContainer>
      {children}
      <style>{`
        .zip-tooltip {
          background: rgba(0,0,0,0.8) !important; border: none !important;
          color: white !important; font-size: 11px !important; font-weight: 600 !important;
          padding: 2px 6px !important; border-radius: 4px !important; box-shadow: none !important;
        }
        .zip-tooltip::before { display: none !important; }
      `}</style>
    </div>
  );
}
