import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../../common/redis/redis.module";
import type { AppEnv } from "../../config/env";
import type { DownloadTarget, StorageDriver, UploadTarget } from "./storage-driver.interface";

const UPLOAD_TOKEN_TTL_SECONDS = 15 * 60;
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

  async createUploadTarget(key: string, contentType: string): Promise<UploadTarget> {
    const token = randomUUID();
    await this.redis.set(`upload-token:${token}`, JSON.stringify({ key, contentType }), "EX", UPLOAD_TOKEN_TTL_SECONDS);

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
  async createDownloadTarget(key: string): Promise<DownloadTarget> {
    const token = randomUUID();
    await this.redis.set(`download-token:${token}`, key, "EX", DOWNLOAD_TOKEN_TTL_SECONDS);

    const apiOrigin = this.config.get("STORAGE_PUBLIC_BASE_URL", { infer: true }).replace(/\/uploads$/, "");
    return { downloadUrl: `${apiOrigin}/downloads/${token}`, expiresInSeconds: DOWNLOAD_TOKEN_TTL_SECONDS };
  }
}
