import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../../config/env";
import { PlatformSettingsService } from "../platform-settings/platform-settings.service";

export type LatLng = { latitude: number; longitude: number };
export type RouteSource = "GOOGLE" | "NESHAN" | "STRAIGHT_LINE_ESTIMATE";
export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  source: RouteSource;
}
export interface PlaceResult {
  label: string;
  address: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
}
export interface MapsClientConfig {
  provider: "none" | "neshan" | "google";
  /** Raster tiles drawn by the web map when no provider SDK is used. */
  tileUrl: string;
  tileAttribution: string;
  /** Google's browser key is public by design (restricted by HTTP referrer in Google Cloud). */
  googleBrowserKey: string | null;
  /** Whether place search / reverse lookup is available. */
  search: boolean;
  /** True when routes are straight-line estimates rather than road routes. */
  estimatesOnly: boolean;
}

/** Road distance is longer than the straight line; city driving in Iran averages ~22 km/h door to door. */
const ROAD_FACTOR = 1.35;
const CITY_KMH = 22;
const TIMEOUT_MS = 5_000;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export function straightLineRoute(a: LatLng, b: LatLng): RouteResult {
  const distanceMeters = Math.round(haversineMeters(a, b) * ROAD_FACTOR);
  return { distanceMeters, durationSeconds: Math.max(60, Math.round((distanceMeters / 1000 / CITY_KMH) * 3600)), source: "STRAIGHT_LINE_ESTIMATE" };
}

export function validLatLng(p: Partial<LatLng> | null | undefined): p is LatLng {
  return !!p && typeof p.latitude === "number" && typeof p.longitude === "number" && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;
}

/**
 * One maps interface for the whole app. Each provider call is bounded (5 s) and any failure falls back to the
 * straight-line estimate, so a blocked or unbilled provider never stops a quote; the source says which one was used.
 */
@Injectable()
export class MapsService {
  private readonly logger = new Logger(MapsService.name);

  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly settings: PlatformSettingsService,
  ) {}

  private provider(): "none" | "neshan" | "google" {
    const p = this.config.get("MAPS_PROVIDER", { infer: true });
    if (p === "neshan" && this.config.get("NESHAN_SERVICE_KEY", { infer: true })) return "neshan";
    if (p === "google" && this.config.get("GOOGLE_MAPS_SERVER_KEY", { infer: true })) return "google";
    return "none";
  }

  /**
   * What the browser draws. Admin › Site settings › Maps chooses OpenStreetMap or Google and holds the Google browser
   * key (public by design, HTTP-referrer restricted; env values are only the fallback until an admin sets them).
   * Without a key the web keeps OpenStreetMap tiles. Search and routes still use the server key from the env.
   */
  clientConfig(): MapsClientConfig {
    const server = this.provider();
    const browserKey = this.settings.get<string | null>("maps.googleBrowserKey");
    const googleMap = this.settings.get<string>("maps.provider") === "google" && !!browserKey;
    return {
      provider: googleMap ? "google" : server === "neshan" ? "neshan" : "none",
      tileUrl: this.config.get("MAP_TILE_URL", { infer: true }),
      tileAttribution: this.config.get("MAP_TILE_ATTRIBUTION", { infer: true }),
      googleBrowserKey: googleMap ? browserKey : null,
      search: server !== "none",
      estimatesOnly: server === "none",
    };
  }

  async route(from: LatLng, to: LatLng): Promise<RouteResult> {
    const provider = this.provider();
    try {
      if (provider === "neshan") {
        const q = new URLSearchParams({ type: "car", origins: `${from.latitude},${from.longitude}`, destinations: `${to.latitude},${to.longitude}` });
        const res = await fetch(`https://api.neshan.org/v1/distance-matrix?${q}`, { headers: { "Api-Key": this.config.get("NESHAN_SERVICE_KEY", { infer: true })! }, signal: AbortSignal.timeout(TIMEOUT_MS) });
        const body = (await res.json()) as { rows?: { elements?: { status?: string; distance?: { value?: number }; duration?: { value?: number } }[] }[] };
        const el = body.rows?.[0]?.elements?.[0];
        if (res.ok && el?.distance?.value != null && el.duration?.value != null) return { distanceMeters: el.distance.value, durationSeconds: el.duration.value, source: "NESHAN" };
      } else if (provider === "google") {
        const q = new URLSearchParams({ origins: `${from.latitude},${from.longitude}`, destinations: `${to.latitude},${to.longitude}`, mode: "driving", key: this.config.get("GOOGLE_MAPS_SERVER_KEY", { infer: true })! });
        const res = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?${q}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        const body = (await res.json()) as { rows?: { elements?: { status?: string; distance?: { value?: number }; duration?: { value?: number } }[] }[] };
        const el = body.rows?.[0]?.elements?.[0];
        if (res.ok && el?.status === "OK" && el.distance?.value != null && el.duration?.value != null) return { distanceMeters: el.distance.value, durationSeconds: el.duration.value, source: "GOOGLE" };
      }
    } catch (error) {
      this.logger.warn(`Maps route via ${provider} failed, using the straight-line estimate: ${error instanceof Error ? error.message : String(error)}`);
    }
    return straightLineRoute(from, to);
  }

  /** Place search near a point. Empty without a provider (members then pin on the map or use their location). */
  async search(term: string, near?: LatLng): Promise<PlaceResult[]> {
    const provider = this.provider();
    const q = term.trim().slice(0, 100);
    if (!q || provider === "none") return [];
    try {
      if (provider === "neshan") {
        const at = near ?? { latitude: 35.6997, longitude: 51.338 };
        const res = await fetch(`https://api.neshan.org/v1/search?${new URLSearchParams({ term: q, lat: String(at.latitude), lng: String(at.longitude) })}`, { headers: { "Api-Key": this.config.get("NESHAN_SERVICE_KEY", { infer: true })! }, signal: AbortSignal.timeout(TIMEOUT_MS) });
        const body = (await res.json()) as { items?: { title?: string; address?: string; region?: string; location?: { x?: number; y?: number } }[] };
        return (body.items ?? [])
          .filter((i) => i.title && typeof i.location?.y === "number" && typeof i.location?.x === "number")
          .slice(0, 8)
          .map((i) => ({ label: i.title!, address: i.address ?? null, city: i.region?.split("،")[0]?.trim() || null, latitude: i.location!.y!, longitude: i.location!.x! }));
      }
      const params = new URLSearchParams({ query: q, key: this.config.get("GOOGLE_MAPS_SERVER_KEY", { infer: true })!, ...(near ? { location: `${near.latitude},${near.longitude}`, radius: "30000" } : {}) });
      const res = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      const body = (await res.json()) as { results?: { name?: string; formatted_address?: string; geometry?: { location?: { lat?: number; lng?: number } } }[] };
      return (body.results ?? [])
        .filter((r) => r.name && typeof r.geometry?.location?.lat === "number")
        .slice(0, 8)
        .map((r) => ({ label: r.name!, address: r.formatted_address ?? null, city: null, latitude: r.geometry!.location!.lat!, longitude: r.geometry!.location!.lng! }));
    } catch (error) {
      this.logger.warn(`Maps search via ${provider} failed: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }
}
