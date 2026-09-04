/**
 * Reconstructs the same publicUrl shape StorageDriver.createUploadTarget()
 * hands back at upload time (`${STORAGE_PUBLIC_BASE_URL}/${key}`), so a
 * stored objectKey can be rendered later without re-issuing an upload target.
 * A plain function (not a service) so pure mapper files can call it without
 * a DI dependency — mirrors the same default env.ts already uses.
 */
const DEFAULT_STORAGE_PUBLIC_BASE_URL = "http://localhost:4000/uploads";

/**
 * Every object-key prefix StorageService ever mints for content that must
 * never be reachable via a plain, permanent, unauthenticated URL (Handoff 20
 * release-critical privacy check). A mapper for one of these must instead
 * mint a per-request signed download (see MedicalDocumentService.getDownload,
 * PetObservationService.getDownload, PetMemoryService.getMediaDownload) —
 * resolveObjectUrl refuses to run rather than silently returning a public
 * URL for a private key, so a future mapper bug fails loudly instead of
 * leaking. Also used by main.ts to keep the local-dev static file mount from
 * ever serving one of these prefixes.
 */
export const PRIVATE_OBJECT_KEY_PREFIXES = ["health-documents/", "pet-observations/", "pet-memories-private/"] as const;

function isPrivateKey(key: string): boolean {
  return PRIVATE_OBJECT_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function resolveObjectUrl(key: string | null): string | null {
  if (!key) return null;
  if (isPrivateKey(key)) {
    throw new Error(`resolveObjectUrl() must never be called with a private object key (got "${key}") — mint a per-request signed download instead.`);
  }
  const base = process.env.STORAGE_PUBLIC_BASE_URL ?? DEFAULT_STORAGE_PUBLIC_BASE_URL;
  return `${base}/${key}`;
}

export function resolveObjectUrls(keys: string[]): string[] {
  return keys.map((key) => resolveObjectUrl(key)).filter((url): url is string => url !== null);
}
