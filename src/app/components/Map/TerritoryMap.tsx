'use client';

import { useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { useTerritory } from '@/lib/territoryState';
import {
  loadStateGeoJSON,
  getStatesInViewport,
  isFeatureInViewport,
  type ZipFeature,
} from '@/lib/zipBoundaries';
import 'leaflet/dist/leaflet.css';

const MIN_ZOOM = 7; // Show boundaries starting at this zoom level

// ============ Custom Location Pin Icons ============
function createColoredIcon(color: string, isActive: boolean) {
  const size = isActive ? 16 : 12;
  const border = isActive ? 3 : 2;
  return L.divIcon({
    className: 'custom-pin',
    html: `<div style="
      width: ${size}px; height: ${size}px;
      background: ${color}; border: ${border}px solid white;
      border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      position: relative; z-index: ${isActive ? 1000 : 500};
    "></div>`,
    iconSize: [size + border * 2, size + border * 2],
    iconAnchor: [(size + border * 2) / 2, (size + border * 2) / 2],
    popupAnchor: [0, -(size / 2 + border)],
  });
}

// ============ Zip Polygon Layer (imperative Leaflet, no React state for polygons) ============
function ZipBoundaryLayer() {
  const map = useMap();
  const { state, dispatch } = useTerritory();

  // All refs to avoid stale closures
  const stateRef = useRef(state);
  stateRef.current = state;

  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const polygonMapRef = useRef<Map<string, L.Path>>(new Map());
  const allFeaturesRef = useRef<Map<string, ZipFeature>>(new Map());
  const loadedStatesRef = useRef<Set<string>>(new Set());
  const isPaintingRef = useRef(false);
  const paintedZipsRef = useRef<Set<string>>(new Set());
  const paintTrailRef = useRef<L.Polyline | null>(null);

  // Init layer group once
  useEffect(() => {
    layerGroupRef.current = L.layerGroup().addTo(map);
    return () => { layerGroupRef.current?.remove(); };
  }, [map]);

  // Core function: load GeoJSON for visible states, then render polygons
  const refreshBoundaries = useCallback(async () => {
    const zoom = map.getZoom();

    if (zoom < MIN_ZOOM) {
      // Remove all polygons when too zoomed out
      if (layerGroupRef.current) {
        layerGroupRef.current.clearLayers();
        polygonMapRef.current.clear();
      }
      return;
    }

    const bounds = map.getBounds();
    const viewBounds = {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
    };

    // Load new state GeoJSON files
    const neededStates = getStatesInViewport(viewBounds);
    const newStates = neededStates.filter(s => !loadedStatesRef.current.has(s));

    if (newStates.length > 0) {
      for (const s of newStates) loadedStatesRef.current.add(s);
      const results = await Promise.all(newStates.map(s => loadStateGeoJSON(s)));
      for (const features of results) {
        for (const f of features) {
          allFeaturesRef.current.set(f.zipCode, f);
        }
      }
    }

    // Determine which zips are visible in viewport
    const visibleZips = new Set<string>();
    for (const [zip, feature] of allFeaturesRef.current) {
      if (isFeatureInViewport(feature, viewBounds)) {
        visibleZips.add(zip);
      }
    }

    if (!layerGroupRef.current) return;

    // Remove polygons no longer visible
    for (const [zip, layer] of polygonMapRef.current) {
      if (!visibleZips.has(zip)) {
        layerGroupRef.current.removeLayer(layer);
        polygonMapRef.current.delete(zip);
      }
    }

    // Add new polygons or update existing styles
    for (const zip of visibleZips) {
      const style = getStyle(zip);
      const existing = polygonMapRef.current.get(zip);

      if (existing) {
        existing.setStyle(style);
      } else {
        const feature = allFeaturesRef.current.get(zip)!;
        const polygon = createPolygon(feature, style);

        polygon.on('click', () => onZipClick(zip));
        polygon.bindTooltip(zip, {
          permanent: false,
          direction: 'center',
          className: 'zip-tooltip',
        });
        polygon.on('mouseover', () => {
          if (!isPaintingRef.current) polygon.setStyle({ weight: 2.5, opacity: 1 });
        });
        polygon.on('mouseout', () => {
          if (!isPaintingRef.current) {
            const s = getStyle(zip);
            polygon.setStyle({ weight: s.weight, opacity: s.opacity });
          }
        });

        layerGroupRef.current!.addLayer(polygon);
        polygonMapRef.current.set(zip, polygon);
      }
    }
  }, [map]); // Only depends on map - reads state from ref

  // Style helper (reads from ref, never stale)
  function getStyle(zipCode: string): L.PathOptions {
    const s = stateRef.current;
    const locationId = s.zipAssignments[zipCode];
    if (locationId) {
      const location = s.locations.find(l => l.id === locationId);
      if (location) {
        return {
          fillColor: location.color,
          fillOpacity: 0.45,
          color: location.color,
          weight: 1.5,
          opacity: 0.8,
        };
      }
    }
    return {
      fillColor: '#D4D4D4',
      fillOpacity: 0.3,
      color: '#888888',
      weight: 1,
      opacity: 0.6,
    };
  }

  // Click handler (reads from ref)
  function onZipClick(zipCode: string) {
    const s = stateRef.current;

    if (s.eraserMode) {
      if (s.zipAssignments[zipCode]) {
        dispatch({ type: 'UNASSIGN_ZIP', payload: zipCode });
      }
      return;
    }

    if (!s.activeLocationId) return;

    const current = s.zipAssignments[zipCode];
    if (!current) {
      dispatch({ type: 'ASSIGN_ZIP', payload: { zipCode, locationId: s.activeLocationId } });
    } else if (current === s.activeLocationId) {
      dispatch({ type: 'UNASSIGN_ZIP', payload: zipCode });
    } else {
      dispatch({ type: 'ASSIGN_ZIP', payload: { zipCode, locationId: s.activeLocationId } });
    }
  }

  // Create Leaflet polygon from a ZipFeature
  function createPolygon(feature: ZipFeature, style: L.PathOptions): L.Polygon {
    if (feature.geometry.type === 'Polygon') {
      const rings = feature.geometry.coordinates.map(ring =>
        ring.map(([lng, lat]) => [lat, lng] as [number, number])
      );
      return L.polygon(rings, style);
    } else {
      // MultiPolygon
      const allRings = feature.geometry.coordinates.map(polygon =>
        polygon.map(ring =>
          ring.map(([lng, lat]) => [lat, lng] as [number, number])
        )
      );
      return L.polygon(allRings.flat() as L.LatLngExpression[][], style);
    }
  }

  // Map events trigger refresh
  useMapEvents({
    moveend: () => refreshBoundaries(),
    zoomend: () => refreshBoundaries(),
  });

  // Initial load + load when map is ready
  useEffect(() => {
    // Small delay to ensure map is fully initialized
    const timer = setTimeout(() => refreshBoundaries(), 200);
    return () => clearTimeout(timer);
  }, [refreshBoundaries]);

  // Re-style polygons when assignments change (without reloading GeoJSON)
  useEffect(() => {
    for (const [zip, layer] of polygonMapRef.current) {
      layer.setStyle(getStyle(zip));
    }
  }, [state.zipAssignments, state.locations]);

  // ---- Paint Mode ----
  useEffect(() => {
    const container = map.getContainer();

    const onMouseDown = (e: MouseEvent) => {
      if (!e.shiftKey) return;
      const s = stateRef.current;
      if (!s.activeLocationId && !s.eraserMode) return;

      e.preventDefault();
      e.stopPropagation();
      isPaintingRef.current = true;
      paintedZipsRef.current = new Set();
      map.dragging.disable();

      const color = s.eraserMode
        ? '#EC7B57'
        : (s.locations.find(l => l.id === s.activeLocationId)?.color || '#8C2433');
      paintTrailRef.current = L.polyline([], {
        color, weight: 4, opacity: 0.6, dashArray: '6 4',
      }).addTo(map);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isPaintingRef.current) return;
      const rect = container.getBoundingClientRect();
      const latlng = map.containerPointToLatLng(
        L.point(e.clientX - rect.left, e.clientY - rect.top)
      );
      paintTrailRef.current?.addLatLng(latlng);

      const s = stateRef.current;
      for (const [zip, layer] of polygonMapRef.current) {
        if (paintedZipsRef.current.has(zip)) continue;
        if ((layer as L.Polygon).getBounds().contains(latlng)) {
          paintedZipsRef.current.add(zip);
          if (s.eraserMode) {
            if (s.zipAssignments[zip]) {
              dispatch({ type: 'UNASSIGN_ZIP', payload: zip });
            }
          } else if (s.activeLocationId) {
            dispatch({ type: 'ASSIGN_ZIP', payload: { zipCode: zip, locationId: s.activeLocationId } });
          }
        }
      }
    };

    const onMouseUp = () => {
      if (!isPaintingRef.current) return;
      isPaintingRef.current = false;
      paintedZipsRef.current = new Set();
      paintTrailRef.current?.remove();
      paintTrailRef.current = null;
      map.dragging.enable();
    };

    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      container.removeEventListener('mousedown', onMouseDown);
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [map, dispatch]);

  // ---- Keyboard: E for eraser ----
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'e' || e.key === 'E') {
        if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
        dispatch({ type: 'TOGGLE_ERASER_MODE' });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dispatch]);

  return null;
}

// ============ Fit Bounds Button ============
function FitBoundsButton() {
  const map = useMap();
  const { state } = useTerritory();
  const stateRef = useRef(state);
  stateRef.current = state;

  const fitToLocations = useCallback(() => {
    const locs = stateRef.current.locations;
    if (locs.length === 0) return;
    const bounds = L.latLngBounds(locs.map(l => [l.lat, l.lng] as [number, number]));
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [map]);

  useEffect(() => {
    const FitControl = L.Control.extend({
      options: { position: 'topleft' as L.ControlPosition },
      onAdd() {
        const btn = L.DomUtil.create('button', 'leaflet-bar leaflet-control');
        btn.innerHTML = '&#x25A3;';
        btn.title = 'Fit to all locations (F)';
        btn.style.cssText = 'width:32px;height:32px;background:white;border:none;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;border-radius:6px;';
        L.DomEvent.on(btn, 'click', (e) => {
          L.DomEvent.stopPropagation(e);
          L.DomEvent.preventDefault(e);
          fitToLocations();
        });
        return btn;
      },
    });
    const ctrl = new FitControl();
    map.addControl(ctrl);
    return () => { map.removeControl(ctrl); };
  }, [map, fitToLocations]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
        fitToLocations();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fitToLocations]);

  return null;
}

// ============ Auto-fit on first location load ============
function AutoFit() {
  const map = useMap();
  const { state } = useTerritory();
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (prevCountRef.current === 0 && state.locations.length > 0) {
      const bounds = L.latLngBounds(
        state.locations.map(loc => [loc.lat, loc.lng] as [number, number])
      );
      if (bounds.isValid()) {
        setTimeout(() => map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 }), 300);
      }
    }
    prevCountRef.current = state.locations.length;
  }, [state.locations.length, map]);

  return null;
}

// ============ Radius Preview Circle ============
function RadiusCircle() {
  const map = useMap();
  const { state } = useTerritory();
  const circleRef = useRef<L.Circle | null>(null);

  useEffect(() => {
    // Remove old circle
    if (circleRef.current) {
      circleRef.current.remove();
      circleRef.current = null;
    }

    if (state.radiusPreview) {
      const { lat, lng, radiusMiles } = state.radiusPreview;
      const radiusMeters = radiusMiles * 1609.344;
      circleRef.current = L.circle([lat, lng], {
        radius: radiusMeters,
        color: '#8C2433',
        weight: 2,
        opacity: 0.6,
        fillColor: '#8C2433',
        fillOpacity: 0.08,
        dashArray: '8 6',
        interactive: false,
      }).addTo(map);
    }

    return () => {
      circleRef.current?.remove();
      circleRef.current = null;
    };
  }, [state.radiusPreview, map]);

  return null;
}

// ============ Main Map Component ============
export default function TerritoryMap() {
  const { state, dispatch } = useTerritory();

  return (
    <div className="map-wrapper">
      <MapContainer
        center={[37.5, -77.5]}
        zoom={7}
        style={{ width: '100%', height: '100%' }}
        preferCanvas={true}
        zoomControl={true}
        boxZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ZipBoundaryLayer />
        <FitBoundsButton />
        <AutoFit />
        <RadiusCircle />
        {state.locations.map(location => (
          <Marker
            key={location.id}
            position={[location.lat, location.lng]}
            icon={createColoredIcon(location.color, location.id === state.activeLocationId)}
            zIndexOffset={location.id === state.activeLocationId ? 1000 : 0}
            eventHandlers={{
              click: () => dispatch({ type: 'SET_ACTIVE_LOCATION', payload: location.id }),
            }}
          >
            <Popup>
              <div style={{ minWidth: 160 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{
                    display: 'inline-block', width: 10, height: 10,
                    borderRadius: '50%', backgroundColor: location.color,
                  }} />
                  <strong>{location.name}</strong>
                </div>
                <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 2 }}>
                  {location.formattedAddress || location.address}
                </div>
                <div style={{ fontSize: 12, color: '#6B7280' }}>
                  {location.zipCodes.length} zip code{location.zipCodes.length !== 1 ? 's' : ''} assigned
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <style>{`
        .leaflet-container { cursor: ${state.eraserMode ? 'crosshair' : 'grab'} !important; }
        .leaflet-container.leaflet-drag-target { cursor: ${state.eraserMode ? 'crosshair' : 'grabbing'} !important; }
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
