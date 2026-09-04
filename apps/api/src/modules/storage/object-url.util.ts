/**
 * Reconstructs the same publicUrl shape StorageDriver.createUploadTarget()
 * hands back at upload time (`${STORAGE_PUBLIC_BASE_URL}/${key}`), so a
 * stored objectKey can be rendered later without re-issuing an upload target.
 * A plain function (not a service) so pure mapper files can call it without
 * a DI dependency — mirrors the same default env.ts already uses.
 */
const DEFAULT_STORAGE_PUBLIC_BASE_URL = "http://localhost:4000/uploads";

export function resolveObjectUrl(key: string | null): string | null {
  if (!key) return null;
  const base = process.env.STORAGE_PUBLIC_BASE_URL ?? DEFAULT_STORAGE_PUBLIC_BASE_URL;
  return `${base}/${key}`;
}

export function resolveObjectUrls(keys: string[]): string[] {
  return keys.map((key) => resolveObjectUrl(key)).filter((url): url is string => url !== null);
}
