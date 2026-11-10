import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../../common/redis/redis.module";
import type { AppEnv } from "../../config/env";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveLocalStoragePath } from "./local-storage-path";
import type { DownloadOptions, DownloadTarget, StorageDriver, UploadTarget } from "./storage-driver.interface";

const UPLOAD_TOKEN_TTL_SECONDS = 15 * 60;
/** Uploads without a declared size (pet photos, CMS media) and the hard ceiling for any upload. */
export const DEFAULT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const UPLOAD_CEILING_BYTES = 50 * 1024 * 1024;
/** Same short-TTL rationale as S3StorageDriver's presigned GET — see its doc comment. */
const DOWNLOAD_TOKEN_TTL_SECONDS = 5 * 60;

/**
 * Dev fallback: instead of a real presigned URL, we hand back a one-time
 * token mapped (in Redis) to a destination key. UploadsController streams
 * the PUT body for that token straight to STORAGE_LOCAL_DIR on disk.
 */
@Injectable()
export class LocalStorageDriver implements StorageDriver {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async createUploadTarget(key: string, contentType: string, maxBytes?: number): Promise<UploadTarget> {
    this.resolve(key);
    const token = randomUUID();
    await this.redis.set(`upload-token:${token}`, JSON.stringify({ key, contentType, maxBytes: Math.min(maxBytes ?? DEFAULT_UPLOAD_MAX_BYTES, UPLOAD_CEILING_BYTES) }), "EX", UPLOAD_TOKEN_TTL_SECONDS);

    const apiOrigin = this.config.get("STORAGE_PUBLIC_BASE_URL", { infer: true }).replace(/\/uploads$/, "");
    return {
      uploadUrl: `${apiOrigin}/uploads/${token}`,
      method: "PUT",
      publicUrl: `${this.config.get("STORAGE_PUBLIC_BASE_URL", { infer: true })}/${key}`,
      headers: { "Content-Type": contentType },
      expiresInSeconds: UPLOAD_TOKEN_TTL_SECONDS,
    };
  }

  /** Dev fallback for private downloads — a token mapped to a key, resolved by DownloadsController, never a stable public path. */
  async createDownloadTarget(key: string, options?: DownloadOptions): Promise<DownloadTarget> {
    this.resolve(key);
    const token = randomUUID();
    await this.redis.set(`download-token:${token}`, key, "EX", DOWNLOAD_TOKEN_TTL_SECONDS);
    if (options?.filename || options?.contentType) await this.redis.set(`download-meta:${token}`, JSON.stringify(options), "EX", DOWNLOAD_TOKEN_TTL_SECONDS);

    const apiOrigin = this.config.get("STORAGE_PUBLIC_BASE_URL", { infer: true }).replace(/\/uploads$/, "");
    return { downloadUrl: `${apiOrigin}/downloads/${token}`, expiresInSeconds: DOWNLOAD_TOKEN_TTL_SECONDS };
  }

  private resolve(key: string): string {
    return resolveLocalStoragePath(this.config.get("STORAGE_LOCAL_DIR", { infer: true }), key);
  }

  async putObject(key: string, body: Buffer): Promise<void> {
    const target = this.resolve(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body, { mode: 0o600 });
  }

  async copyObject(sourceKey: string, destinationKey: string): Promise<void> {
    const source = this.resolve(sourceKey);
    const destination = this.resolve(destinationKey);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }

  async openObject(key: string) {
    const target = this.resolve(key);
    await stat(target);
    const extension = target.split(".").pop()?.toLowerCase();
    const contentType = extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : extension === "jpg" || extension === "jpeg" ? "image/jpeg" : undefined;
    return { body: createReadStream(target), contentType };
  }

  async deleteObject(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}
