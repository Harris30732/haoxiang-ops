"use client";

import { useEffect, useState } from "react";

export type GeoCoord = {
  lat: number;
  lng: number;
  accuracy: number;
  ts: number;
};

/**
 * 進頁面就取一次位置；失敗時 error 會有訊息。
 * 如果使用者拒絕授權，只能讓他手動開設定，不自動重試。
 */
export function useGeolocation() {
  const [coord, setCoord] = useState<GeoCoord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setError("瀏覽器不支援定位");
      setBusy(false);
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setCoord({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          ts: pos.timestamp
        });
        setBusy(false);
      },
      (err) => {
        setError(err.message || "定位失敗");
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  return { coord, error, busy };
}
