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
 * S3-compatible object storage abstraction. Swapping providers (MinIO in
 * dev, S3/R2/Spaces in production) means implementing this interface —
 * nothing above this boundary should know which one is active.
 */
export interface StorageDriver {
  createUploadTarget(key: string, contentType: string): Promise<UploadTarget>;
}
