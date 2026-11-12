"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MapsClientConfigDto } from "@petlife/types";
import { apiFetch } from "@/lib/api/client";
import "./map-view.css";

export type MapPoint = { latitude: number; longitude: number };
export type MapMarker = MapPoint & { id: string; kind: "pickup" | "dropoff" | "driver" | "me"; label: string };

export interface MapViewProps {
  center: MapPoint;
  zoom?: number;
  markers: MapMarker[];
  /** Draws a line from the first to the second point (straight, not a road route). */
  line?: [MapPoint, MapPoint] | null;
  /** Tapping the map places a point. */
  onPick?: (point: MapPoint) => void;
  /** Accessible name of the map region. */
  label: string;
  zoomInLabel: string;
  zoomOutLabel: string;
  className?: string;
}

let configPromise: Promise<MapsClientConfigDto> | null = null;
const FALLBACK: MapsClientConfigDto = { provider: "none", tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", tileAttribution: "© OpenStreetMap contributors", googleBrowserKey: null, search: false, estimatesOnly: true };

/** The deployment's map settings (provider, tiles, public key), fetched once per page. */
export function useMapsConfig(): MapsClientConfigDto | null {
  const [config, setConfig] = useState<MapsClientConfigDto | null>(null);
  useEffect(() => {
    configPromise ??= apiFetch<MapsClientConfigDto>("/maps/config").catch(() => FALLBACK);
    let alive = true;
    void configPromise.then((c) => alive && setConfig(c));
    return () => {
      alive = false;
    };
  }, []);
  return config;
}

/**
 * One map component for the app. With a Google browser key it draws Google Maps; otherwise raster tiles (OpenStreetMap
 * by default, or the deployment's MAP_TILE_URL) with its own pan / zoom / tap-to-pin, so no map SDK is required and the
 * page still works where Google is unreachable.
 */
export function MapView(props: MapViewProps) {
  const config = useMapsConfig();
  if (!config) return <div className={`map-view map-view--loading ${props.className ?? ""}`} aria-busy="true" aria-label={props.label} />;
  if (config.provider === "google" && config.googleBrowserKey) return <GoogleMap {...props} apiKey={config.googleBrowserKey} fallback={config} />;
  return <TileMap {...props} tileUrl={config.tileUrl} attribution={config.tileAttribution} />;
}

// ---------------------------------------------------------------- raster tiles

const TILE = 256;
const project = (p: MapPoint, z: number) => {
  const scale = TILE * 2 ** z;
  const lat = Math.max(-85.05112878, Math.min(85.05112878, p.latitude));
  const sin = Math.sin((lat * Math.PI) / 180);
  return { x: ((p.longitude + 180) / 360) * scale, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale };
};
const unproject = (x: number, y: number, z: number): MapPoint => {
  const scale = TILE * 2 ** z;
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  return { latitude: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), longitude: lng };
};

function TileMap({ center, zoom: initialZoom = 13, markers, line, onPick, label, zoomInLabel, zoomOutLabel, className, tileUrl, attribution }: MapViewProps & { tileUrl: string; attribution: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 360 });
  const [zoom, setZoom] = useState(initialZoom);
  const [view, setView] = useState<MapPoint>(center);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);

  // Follow a new center from the parent (a picked place, the driver moving) without fighting a pan in progress.
  useEffect(() => {
    if (!drag.current) setView(center);
  }, [center.latitude, center.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => entry && setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const c = project(view, zoom);
  const left = c.x - size.w / 2;
  const top = c.y - size.h / 2;
  const n = 2 ** zoom;
  const tiles: { key: string; src: string; x: number; y: number }[] = [];
  for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + size.w) / TILE); tx++) {
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + size.h) / TILE); ty++) {
      if (ty < 0 || ty >= n) continue;
      const wx = ((tx % n) + n) % n;
      tiles.push({ key: `${zoom}/${tx}/${ty}`, src: tileUrl.replace("{z}", String(zoom)).replace("{x}", String(wx)).replace("{y}", String(ty)).replace("{s}", "a"), x: tx * TILE - left, y: ty * TILE - top });
    }
  }
  const screen = (p: MapPoint) => {
    const q = project(p, zoom);
    return { x: q.x - left, y: q.y - top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, cx: c.x, cy: c.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.moved) setView(unproject(d.cx - dx, d.cy - dy, zoom));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || !onPick || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    onPick(unproject(left + (e.clientX - rect.left), top + (e.clientY - rect.top), zoom));
  };
  const zoomBy = useCallback((delta: number) => setZoom((z) => Math.max(4, Math.min(18, z + delta))), []);
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = 80;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      setView(unproject(c.x + moves[e.key]![0], c.y + moves[e.key]![1], zoom));
    } else if (e.key === "+" || e.key === "=") zoomBy(1);
    else if (e.key === "-") zoomBy(-1);
  };

  return (
    <div className={`map-view ${className ?? ""}`}>
      <div
        ref={ref}
        className="map-view__canvas"
        role="application"
        aria-label={label}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        onWheel={(e) => zoomBy(e.deltaY < 0 ? 1 : -1)}
        onKeyDown={onKeyDown}
        dir="ltr"
      >
        {tiles.map((t) => (
          // Raster tiles are decorative background; positions are absolute per tile.
          // eslint-disable-next-line @next/next/no-img-element
          <img key={t.key} src={t.src} alt="" draggable={false} className="map-view__tile" style={{ transform: `translate(${t.x}px, ${t.y}px)` }} />
        ))}
        {line ? (
          <svg className="map-view__overlay" width={size.w} height={size.h} aria-hidden="true">
            <line x1={screen(line[0]).x} y1={screen(line[0]).y} x2={screen(line[1]).x} y2={screen(line[1]).y} className="map-view__line" />
          </svg>
        ) : null}
        {markers.map((m) => {
          const p = screen(m);
          return (
            <span key={m.id} className={`map-view__marker map-view__marker--${m.kind}`} style={{ transform: `translate(${p.x}px, ${p.y}px)` }} title={m.label}>
              <span className="sr-only">{m.label}</span>
            </span>
          );
        })}
      </div>
      <div className="map-view__zoom">
        <button type="button" onClick={() => zoomBy(1)} aria-label={zoomInLabel}>
          +
        </button>
        <button type="button" onClick={() => zoomBy(-1)} aria-label={zoomOutLabel}>
          −
        </button>
      </div>
      <small className="map-view__attribution">{attribution}</small>
    </div>
  );
}

// ---------------------------------------------------------------- Google Maps

type GLatLng = { lat: number; lng: number };
interface GMapsNamespace {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => { setCenter(c: GLatLng): void; addListener(ev: string, cb: (e: { latLng?: { lat(): number; lng(): number } }) => void): void };
  Marker: new (opts: Record<string, unknown>) => { setMap(m: unknown): void; setPosition(p: GLatLng): void };
  Polyline: new (opts: Record<string, unknown>) => { setMap(m: unknown): void };
}
let googleLoad: Promise<GMapsNamespace> | null = null;
function loadGoogle(key: string): Promise<GMapsNamespace> {
  googleLoad ??= new Promise((resolve, reject) => {
    const w = window as unknown as { google?: { maps?: GMapsNamespace } };
    if (w.google?.maps) return resolve(w.google.maps);
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&language=${encodeURIComponent(document.documentElement.lang || "fa")}`;
    script.async = true;
    script.onload = () => (w.google?.maps ? resolve(w.google.maps) : reject(new Error("google maps missing")));
    script.onerror = () => reject(new Error("google maps unreachable"));
    document.head.appendChild(script);
  });
  return googleLoad;
}

const MARKER_COLOR: Record<MapMarker["kind"], string> = { pickup: "#2f7d4c", dropoff: "#c2410c", driver: "#1d4ed8", me: "#6b7280" };

function GoogleMap(props: MapViewProps & { apiKey: string; fallback: MapsClientConfigDto }) {
  const { center, zoom = 13, markers, line, onPick, label, apiKey, fallback } = props;
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<InstanceType<GMapsNamespace["Map"]> | null>(null);
  const gm = useRef<GMapsNamespace | null>(null);
  const drawn = useRef<{ setMap(m: unknown): void }[]>([]);
  const pick = useRef(onPick);
  pick.current = onPick;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadGoogle(apiKey)
      .then((g) => {
        if (!alive || !ref.current) return;
        gm.current = g;
        map.current = new g.Map(ref.current, { center: { lat: center.latitude, lng: center.longitude }, zoom, disableDefaultUI: true, zoomControl: true, gestureHandling: "greedy" });
        map.current.addListener("click", (e) => e.latLng && pick.current?.({ latitude: e.latLng.lat(), longitude: e.latLng.lng() }));
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [apiKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    map.current?.setCenter({ lat: center.latitude, lng: center.longitude });
  }, [center.latitude, center.longitude]);

  useEffect(() => {
    const g = gm.current;
    if (!g || !map.current) return;
    drawn.current.forEach((d) => d.setMap(null));
    drawn.current = markers.map((m) => new g.Marker({ map: map.current, position: { lat: m.latitude, lng: m.longitude }, title: m.label, icon: { path: 0, scale: 9, fillColor: MARKER_COLOR[m.kind], fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 } }));
    if (line) drawn.current.push(new g.Polyline({ map: map.current, path: line.map((p) => ({ lat: p.latitude, lng: p.longitude })), strokeColor: "#2f7d4c", strokeOpacity: 0.8, strokeWeight: 4 }));
  });

  // Google unreachable (common in Iran without a VPN): fall back to tiles rather than an empty box.
  if (failed) return <TileMap {...props} tileUrl={fallback.tileUrl} attribution={fallback.tileAttribution} />;
  return <div ref={ref} className={`map-view map-view__canvas ${props.className ?? ""}`} role="application" aria-label={label} />;
}

/** Deep links that open turn-by-turn navigation in the driver's own app. */
export function navigationLinks(to: MapPoint) {
  const ll = `${to.latitude},${to.longitude}`;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=driving`,
    neshan: `https://nshn.ir/?lat=${to.latitude}&lng=${to.longitude}`,
    waze: `https://waze.com/ul?ll=${ll}&navigate=yes`,
  };
}
