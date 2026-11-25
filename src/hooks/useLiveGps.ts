import { useCallback, useEffect, useRef, useState } from 'react';
import { LatLngTuple } from '../types/territory';

export interface LiveGpsState {
  coords: LatLngTuple | null;
  heading: number | null;
  accuracy: number | null;
  isTracking: boolean;
  error: GeolocationPositionError | null;
  startTracking: () => void;
  requestCompassPermission: () => Promise<void>;
  setManualCoords: (coords: LatLngTuple) => void;
}

interface UseLiveGpsOptions {
  autoStart?: boolean;
  onFirstFix?: (coords: LatLngTuple) => void;
}

function normalizeDegrees(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function angularDiff(a: number, b: number): number {
  const diff = Math.abs(normalizeDegrees(a) - normalizeDegrees(b));
  return diff > 180 ? 360 - diff : diff;
}

function getScreenOrientationAngle(): number {
  if (typeof window === 'undefined') return 0;
  if (typeof window.screen?.orientation?.angle === 'number') {
    return window.screen.orientation.angle;
  }
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === 'number' ? legacy : 0;
}

function computeDistanceMeters(a: LatLngTuple, b: LatLngTuple): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function computeBearingDegrees(from: LatLngTuple, to: LatLngTuple): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(from[0]);
  const lat2 = toRad(to[0]);
  const dLng = toRad(to[1] - from[1]);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return normalizeDegrees(toDeg(Math.atan2(y, x)));
}

export function useLiveGps(options: UseLiveGpsOptions = {}): LiveGpsState {
  const { autoStart = true, onFirstFix } = options;

  const [coords, setCoords] = useState<LatLngTuple | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [isTracking, setIsTracking] = useState<boolean>(autoStart);
  const [error, setError] = useState<GeolocationPositionError | null>(null);

  const onFirstFixRef = useRef(onFirstFix);
  onFirstFixRef.current = onFirstFix;

  const hasFirstFixRef = useRef(false);
  const watchIdRef = useRef<number | null>(null);
  const lastCoordsRef = useRef<LatLngTuple | null>(null);
  const lastHeadingRef = useRef<number | null>(null);
  const lastCompassTimeRef = useRef<number>(0);
  const compassAttachedRef = useRef<boolean>(false);

  const updateHeadingThrottled = useCallback((nextHeading: number) => {
    const normalized = normalizeDegrees(nextHeading);
    if (
      lastHeadingRef.current !== null &&
      angularDiff(lastHeadingRef.current, normalized) < 2
    ) {
      return;
    }
    lastHeadingRef.current = normalized;
    setHeading(normalized);
  }, []);

  const handleOrientationEvent = useCallback(
    (e: DeviceOrientationEvent) => {
      const webkitHeading = (
        e as unknown as { webkitCompassHeading?: number }
      ).webkitCompassHeading;

      if (
        typeof webkitHeading === 'number' &&
        !Number.isNaN(webkitHeading)
      ) {
        lastCompassTimeRef.current = Date.now();
        updateHeadingThrottled(webkitHeading + getScreenOrientationAngle());
        return;
      }

      if (
        typeof e.alpha === 'number' &&
        !Number.isNaN(e.alpha) &&
        (e.absolute === true || e.type === 'deviceorientationabsolute')
      ) {
        lastCompassTimeRef.current = Date.now();
        updateHeadingThrottled(360 - e.alpha + getScreenOrientationAngle());
      }
    },
    [updateHeadingThrottled]
  );

  const attachCompassListener = useCallback(() => {
    if (typeof window === 'undefined' || compassAttachedRef.current) return;

    const hasAbsolute = 'ondeviceorientationabsolute' in window;
    const eventName = hasAbsolute
      ? 'deviceorientationabsolute'
      : 'deviceorientation';

    window.addEventListener(
      eventName,
      handleOrientationEvent as EventListener,
      true
    );
    compassAttachedRef.current = true;
  }, [handleOrientationEvent]);

  const requestCompassPermission = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const DevOrient = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    if (DevOrient && typeof DevOrient.requestPermission === 'function') {
      try {
        const result = await DevOrient.requestPermission();
        if (result === 'granted') {
          attachCompassListener();
        }
      } catch {
        // Ignore if not called from a user gesture or unsupported
      }
    } else {
      attachCompassListener();
    }
  }, [attachCompassListener]);

  // Attach compass automatically on platforms that don't require explicit iOS permission
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const DevOrient = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    const needsExplicitPermission =
      Boolean(DevOrient) && typeof DevOrient.requestPermission === 'function';

    if (!needsExplicitPermission) {
      attachCompassListener();
    }

    return () => {
      if (compassAttachedRef.current) {
        const hasAbsolute = 'ondeviceorientationabsolute' in window;
        const eventName = hasAbsolute
          ? 'deviceorientationabsolute'
          : 'deviceorientation';
        window.removeEventListener(
          eventName,
          handleOrientationEvent as EventListener,
          true
        );
        compassAttachedRef.current = false;
      }
    };
  }, [attachCompassListener, handleOrientationEvent]);

  // Live geolocation watchPosition
  useEffect(() => {
    if (!isTracking) return;
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      return;
    }

    const handlePosition = (pos: GeolocationPosition) => {
      const nextCoords: LatLngTuple = [
        pos.coords.latitude,
        pos.coords.longitude,
      ];
      setCoords(nextCoords);
      setAccuracy(
        typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : null
      );
      setError(null);

      // Use GPS heading or movement bearing as fallback when compass isn't actively reporting
      const compassIsFresh = Date.now() - lastCompassTimeRef.current < 3000;
      if (!compassIsFresh) {
        if (
          pos.coords.heading !== null &&
          !Number.isNaN(pos.coords.heading) &&
          (pos.coords.speed === null || pos.coords.speed > 0.3)
        ) {
          updateHeadingThrottled(pos.coords.heading);
        } else if (lastCoordsRef.current) {
          const movedMeters = computeDistanceMeters(
            lastCoordsRef.current,
            nextCoords
          );
          if (movedMeters >= 4) {
            updateHeadingThrottled(
              computeBearingDegrees(lastCoordsRef.current, nextCoords)
            );
          }
        }
      }

      lastCoordsRef.current = nextCoords;

      if (!hasFirstFixRef.current) {
        hasFirstFixRef.current = true;
        onFirstFixRef.current?.(nextCoords);
      }
    };

    const handleError = (err: GeolocationPositionError) => {
      setError(err);
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000,
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [isTracking, updateHeadingThrottled]);

  const startTracking = useCallback(() => {
    setIsTracking(true);
    void requestCompassPermission();
  }, [requestCompassPermission]);

  const setManualCoords = useCallback((manualCoords: LatLngTuple) => {
    setCoords(manualCoords);
    lastCoordsRef.current = manualCoords;
  }, []);

  return {
    coords,
    heading,
    accuracy,
    isTracking,
    error,
    startTracking,
    requestCompassPermission,
    setManualCoords,
  };
}
