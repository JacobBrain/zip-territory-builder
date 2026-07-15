import L from 'leaflet';

/** Round colored dot pin (used for territory/MEG locations). */
export function createColoredIcon(color: string, isActive: boolean) {
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

export const MEG_BRANCH_COLOR = '#2E7D32'; // green - MEG branch / operation center
export const MEG_TSDF_COLOR = '#1E88E5'; // blue - MEG Transfer, Storage & Disposal Facility

/**
 * MEG location pin: green circle for branches, blue square for TSDFs -
 * mirrors the color convention on millerenvironmentalgroup.com/all-locations.
 */
export function createMegIcon(tsdf: boolean) {
  const size = 12;
  const border = 2;
  const color = tsdf ? MEG_TSDF_COLOR : MEG_BRANCH_COLOR;
  return L.divIcon({
    className: 'custom-pin',
    html: `<div style="
      width: ${size}px; height: ${size}px;
      background: ${color}; border: ${border}px solid white;
      border-radius: ${tsdf ? '2px' : '50%'};
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      position: relative; z-index: 500;
    "></div>`,
    iconSize: [size + border * 2, size + border * 2],
    iconAnchor: [(size + border * 2) / 2, (size + border * 2) / 2],
    popupAnchor: [0, -(size / 2 + border)],
  });
}

/** Diamond pin for utility HQs - visually distinct from the round MEG dots. */
export function createHqIcon(color: string, isActive = false) {
  const size = isActive ? 14 : 11;
  const border = 2;
  return L.divIcon({
    className: 'custom-pin',
    html: `<div style="
      width: ${size}px; height: ${size}px;
      background: ${color}; border: ${border}px solid white;
      transform: rotate(45deg);
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      position: relative; z-index: ${isActive ? 900 : 400};
    "></div>`,
    iconSize: [size + border * 2, size + border * 2],
    iconAnchor: [(size + border * 2) / 2, (size + border * 2) / 2],
    popupAnchor: [0, -(size / 2 + border)],
  });
}
