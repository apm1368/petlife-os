import type { PetFriendlyPlaceCategory } from "@prisma/client";

export interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface OsmPlaceCandidate {
  osmType: OsmElement["type"];
  osmId: bigint;
  name: string;
  category: PetFriendlyPlaceCategory;
  latitude: number;
  longitude: number;
  address: string | null;
  city: string | null;
  phone: string | null;
  website: string | null;
  leashRequired: boolean | null;
  dogsOnly: boolean;
  tags: Record<string, string>;
}

/** Everything the directory takes from OpenStreetMap, in one Overpass request per city bounding box. */
export function overpassQuery(bbox: { south: number; west: number; north: number; east: number }): string {
  const b = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  return `[out:json][timeout:90];
(
  nwr["amenity"="veterinary"](${b});
  nwr["shop"="pet"](${b});
  nwr["shop"="pet_grooming"](${b});
  nwr["amenity"="animal_boarding"](${b});
  nwr["amenity"="animal_shelter"](${b});
  nwr["leisure"="dog_park"](${b});
  nwr["leisure"="park"]["dog"~"^(yes|leashed|designated)$"](${b});
  nwr["amenity"~"^(cafe|restaurant)$"]["dog"~"^(yes|leashed|designated)$"](${b});
);
out center tags;`;
}

function categoryOf(t: Record<string, string>): PetFriendlyPlaceCategory | null {
  if (t.amenity === "veterinary") return "VETERINARY";
  if (t.shop === "pet_grooming") return "GROOMING";
  if (t.shop === "pet") return "PET_SHOP";
  if (t.amenity === "animal_boarding") return "BOARDING";
  if (t.amenity === "animal_shelter") return "SHELTER";
  if (t.leisure === "dog_park") return "DOG_PARK";
  const dogsWelcome = ["yes", "leashed", "designated"].includes(t.dog ?? "");
  if (t.leisure === "park" && dogsWelcome) return "PARK";
  if (t.amenity === "cafe" && dogsWelcome) return "CAFE";
  if (t.amenity === "restaurant" && dogsWelcome) return "RESTAURANT";
  return null;
}

const clean = (v: string | undefined, max: number) => (v && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null);

/** First phone only; OSM allows "a;b". Business contact exactly as tagged, nothing inferred. */
function phoneOf(t: Record<string, string>): string | null {
  const raw = t["contact:phone"] ?? t.phone ?? t["contact:mobile"];
  const first = raw?.split(";")[0]?.trim();
  return first && /^[+0-9()\-\s۰-۹]{5,30}$/.test(first) ? first : null;
}

function websiteOf(t: Record<string, string>): string | null {
  const raw = (t["contact:website"] ?? t.website)?.trim();
  if (!raw) return null;
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString().slice(0, 300) : null;
  } catch {
    return null;
  }
}

/** One OSM element → a directory candidate, or null when it is not something the directory lists (or has no name). */
export function mapOsmElement(el: OsmElement): OsmPlaceCandidate | null {
  const t = el.tags ?? {};
  const category = categoryOf(t);
  if (!category) return null;
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  const name = clean(t["name:fa"] ?? t.name ?? t["name:en"], 200);
  if (!name) return null;
  const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
  const address = clean(t["addr:full"] ?? (street || undefined), 300);
  return {
    osmType: el.type,
    osmId: BigInt(el.id),
    name,
    category,
    latitude: lat,
    longitude: lon,
    address,
    city: clean(t["addr:city"], 120),
    phone: phoneOf(t),
    website: websiteOf(t),
    leashRequired: t.dog === "leashed" ? true : null,
    dogsOnly: category === "DOG_PARK",
    tags: t,
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[\s‌\-_.،,]+/g, "").replace(/ي/g, "ی").replace(/ك/g, "ک");

/** Same business already in the directory: within 60 m and the same name once spacing and letter forms are ignored. */
export function sameBusiness(a: { name: string; latitude: number; longitude: number }, b: { name: string; latitude: number; longitude: number }): boolean {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  const meters = 2 * 6_371_000 * Math.asin(Math.sqrt(h));
  return meters <= 60 && norm(a.name) === norm(b.name);
}

export const OSM_ATTRIBUTION = "© OpenStreetMap contributors";
export const osmUrl = (type: string, id: bigint | number | string) => `https://www.openstreetmap.org/${type}/${id}`;
