export const STORAGE_DRIVER = Symbol("STORAGE_DRIVER");

export interface UploadTarget {
  /** Where the client should PUT the raw file bytes. */
  uploadUrl: string;
  method: "PUT";
  /** The URL the object will be reachable at once uploaded — store this on the entity, never the bytes. */
  publicUrl: string;
  headers?: Record<string, string>;
  expiresInSeconds: number;
}

/**
 * Handoff 17: a short-TTL signed GET, minted per-request AFTER authorization
 * has already been checked by the caller (HealthStorageService never mints
 * one on its own). Never cached, never stored on the entity — the entity
 * stores only the private `fileObjectKey`.
 */
export interface DownloadTarget {
  downloadUrl: string;
  expiresInSeconds: number;
}

/**
 * S3-compatible object storage abstraction. Swapping providers (MinIO in
 * dev, S3/R2/Spaces in production) means implementing this interface —
 * nothing above this boundary should know which one is active.
 */
export interface StorageDriver {
  createUploadTarget(key: string, contentType: string): Promise<UploadTarget>;
  /**
   * Handoff 17: mints a short-TTL signed GET for a key in the PRIVATE
   * object space. Distinct from `createUploadTarget`'s `publicUrl` — a
   * private key is never reachable at a stable, permanent URL.
   */
  createDownloadTarget(key: string): Promise<DownloadTarget>;
}
