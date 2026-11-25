import L from 'leaflet';
import { LatLngTuple } from '../types/territory';

export interface GpsLayerHandle {
  marker: L.Marker;
  accuracyCircle: L.Circle | null;
  continuousAngle: number | null;
  gradId: string;
}

let gradCounter = 0;

function computeShortestContinuousAngle(
  prevAngle: number | null,
  nextHeading: number
): number {
  const normalizedNext = ((nextHeading % 360) + 360) % 360;
  if (prevAngle === null) return normalizedNext;
  const prevMod = ((prevAngle % 360) + 360) % 360;
  let delta = normalizedNext - prevMod;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return prevAngle + delta;
}

export function syncGpsMarkerOnMap(
  map: L.Map | null,
  handleRef: React.MutableRefObject<GpsLayerHandle | null>,
  coords: LatLngTuple | null,
  heading: number | null,
  accuracy?: number | null,
  tooltipText?: string
): void {
  if (!map) return;

  if (!coords) {
    if (handleRef.current) {
      map.removeLayer(handleRef.current.marker);
      if (handleRef.current.accuracyCircle) {
        map.removeLayer(handleRef.current.accuracyCircle);
      }
      handleRef.current = null;
    }
    return;
  }

  if (!handleRef.current) {
    const gradId = `gpsBeamGrad_${++gradCounter}`;
    const initialAngle =
      heading !== null ? computeShortestContinuousAngle(null, heading) : null;
    const initialOpacity = heading !== null ? 1 : 0;
    const initialRotate = initialAngle !== null ? initialAngle : 0;

    const gpsIcon = L.divIcon({
      className: 'custom-google-maps-gps',
      html: `<div style="position:relative;width:72px;height:72px;pointer-events:none;">
        <div class="gps-beam-wrapper" style="position:absolute;top:0;left:0;width:72px;height:72px;transform:rotate(${initialRotate}deg);transform-origin:36px 36px;pointer-events:none;transition:transform 0.16s linear,opacity 0.2s ease;opacity:${initialOpacity};">
          <svg width="72" height="72" viewBox="0 0 72 72">
            <defs>
              <radialGradient id="${gradId}" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#2563eb" stop-opacity="0.62"/>
                <stop offset="60%" stop-color="#3b82f6" stop-opacity="0.24"/>
                <stop offset="100%" stop-color="#60a5fa" stop-opacity="0"/>
              </radialGradient>
            </defs>
            <path d="M 36 36 L 14 5 A 36 36 0 0 1 58 5 Z" fill="url(#${gradId})" />
          </svg>
        </div>
        <div style="position:absolute;top:24px;left:24px;width:24px;height:24px;border-radius:9999px;background:rgba(37,99,235,0.28);animation:ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
        <div style="position:absolute;top:28px;left:28px;width:16px;height:16px;border-radius:9999px;background:#2563eb;border:2.5px solid #ffffff;box-shadow:0 1px 6px rgba(0,0,0,0.48);"></div>
      </div>`,
      iconSize: [72, 72],
      iconAnchor: [36, 36],
    });

    const marker = L.marker(coords, {
      icon: gpsIcon,
      zIndexOffset: 1000,
      interactive: Boolean(tooltipText),
    }).addTo(map);

    if (tooltipText) {
      marker.bindTooltip(tooltipText, { direction: 'top', offset: [0, -10] });
    }

    let accuracyCircle: L.Circle | null = null;
    if (typeof accuracy === 'number' && accuracy > 12 && accuracy <= 250) {
      accuracyCircle = L.circle(coords, {
        radius: accuracy,
        color: '#2563eb',
        weight: 1,
        opacity: 0.3,
        fillColor: '#3b82f6',
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(map);
    }

    handleRef.current = {
      marker,
      accuracyCircle,
      continuousAngle: initialAngle,
      gradId,
    };
    return;
  }

  // Update position smoothly without recreating layers
  const handle = handleRef.current;
  handle.marker.setLatLng(coords);

  // Update accuracy ring
  if (typeof accuracy === 'number' && accuracy > 12 && accuracy <= 250) {
    if (handle.accuracyCircle) {
      handle.accuracyCircle.setLatLng(coords);
      handle.accuracyCircle.setRadius(accuracy);
    } else {
      handle.accuracyCircle = L.circle(coords, {
        radius: accuracy,
        color: '#2563eb',
        weight: 1,
        opacity: 0.3,
        fillColor: '#3b82f6',
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(map);
    }
  } else if (handle.accuracyCircle) {
    map.removeLayer(handle.accuracyCircle);
    handle.accuracyCircle = null;
  }

  // Rotate beam directly in DOM (no full icon rebuild, smooth across 359° -> 0°)
  const markerEl = handle.marker.getElement();
  const beamEl = markerEl?.querySelector<HTMLDivElement>('.gps-beam-wrapper');
  if (beamEl) {
    if (heading !== null) {
      const nextAngle = computeShortestContinuousAngle(
        handle.continuousAngle,
        heading
      );
      handle.continuousAngle = nextAngle;
      beamEl.style.opacity = '1';
      beamEl.style.transform = `rotate(${nextAngle}deg)`;
    } else {
      beamEl.style.opacity = '0';
    }
  }
}

export function removeGpsMarkerFromMap(
  map: L.Map | null,
  handleRef: React.MutableRefObject<GpsLayerHandle | null>
): void {
  if (!handleRef.current) return;
  if (map) {
    map.removeLayer(handleRef.current.marker);
    if (handleRef.current.accuracyCircle) {
      map.removeLayer(handleRef.current.accuracyCircle);
    }
  }
  handleRef.current = null;
}
