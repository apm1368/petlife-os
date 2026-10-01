import { registerDecorator, type ValidationOptions } from "class-validator";
import { ForeignUploadKeyException } from "../errors/api-exception";

/**
 * A client may only hand back an object key in the exact shape StorageService minted for that
 * field: `<prefix>/<uuid>/<uuid>.<ext>` with one of the field's own prefixes. Anything else — a
 * private prefix (`health-documents/…`), a traversal (`../`), a URL, another feature's key — is
 * refused at the boundary. Without this, one post pointing at a private key made
 * resolveObjectUrl() throw on every public read of the feed it appeared in.
 *
 * `/images/…` is allowed: repository-owned static demo assets that are already public paths.
 */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const STATIC_ASSET = /^\/images\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.[A-Za-z0-9]{2,5}$/;

export function isObjectKeyFor(value: unknown, prefixes: readonly string[]): boolean {
  if (typeof value !== "string" || value.length > 300) return false;
  if (STATIC_ASSET.test(value)) return true;
  return prefixes.some((prefix) => new RegExp(`^${prefix.replace(/[-/]/g, "\\$&")}/${UUID}/${UUID}(?:-${UUID})?\\.[a-z0-9]{2,5}$`, "i").test(value));
}

/** Works on a single key or on each key of an array. */
export function IsObjectKeyFor(prefixes: readonly string[], options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) =>
    registerDecorator({
      name: "isObjectKeyFor",
      target: target.constructor,
      propertyName: propertyName as string,
      options: { message: `${String(propertyName)} must be a file uploaded for this item`, ...options },
      validator: {
        validate: (value: unknown) => (Array.isArray(value) ? value.every((v) => isObjectKeyFor(v, prefixes)) : isObjectKeyFor(value, prefixes)),
      },
    });
}

/**
 * Private files are served back through a signed download of whatever key the row holds, so a
 * key must sit under the owner it is being attached to (`health-documents/<this pet>/…`). Otherwise
 * anyone who once saw a key — a member or vet whose access was later revoked — could attach it to
 * their own pet and keep downloading someone else's file.
 */
export function assertObjectKeyUnder(key: string, prefix: string, ownerId: string): void {
  if (!isObjectKeyFor(key, [prefix]) || !key.toLowerCase().startsWith(`${prefix}/${ownerId.toLowerCase()}/`)) {
    throw new ForeignUploadKeyException({ field: prefix });
  }
}
