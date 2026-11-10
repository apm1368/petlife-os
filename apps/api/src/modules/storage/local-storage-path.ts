import { isAbsolute, relative, resolve, sep } from "node:path";

/** Lexical containment only; the local dev/test storage root must not contain untrusted symlinks. */
export function resolveLocalStoragePath(baseDirectory: string, key: string): string {
  if (!key || key.includes("\0") || isAbsolute(key)) throw new Error("Invalid storage key");
  const base = resolve(baseDirectory);
  const target = resolve(base, key);
  const within = relative(base, target);
  if (!within || within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within)) {
    throw new Error("Invalid storage key");
  }
  return target;
}
