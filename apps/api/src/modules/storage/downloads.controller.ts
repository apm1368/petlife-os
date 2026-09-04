import { Controller, Get, Inject, NotFoundException, Param, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type Redis from "ioredis";
import type { Response } from "express";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join, normalize } from "node:path";
import { REDIS_CLIENT } from "../../common/redis/redis.module";
import type { AppEnv } from "../../config/env";

/**
 * Local-dev-only endpoint LocalStorageDriver's download URLs point at — the
 * private-storage equivalent of UploadsController. Not used when
 * STORAGE_DRIVER=s3 (S3StorageDriver mints a real presigned GET directly
 * against the bucket). Never a static/public file route: the token must
 * resolve in Redis (still within its short TTL) or the request 404s.
 */
@Controller("downloads")
export class DownloadsController {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  @Get(":token")
  async download(@Param("token") token: string, @Res() res: Response): Promise<void> {
    const key = await this.redis.get(`download-token:${token}`);
    if (!key) throw new NotFoundException("Download link expired or invalid");

    const baseDir = this.config.get("STORAGE_LOCAL_DIR", { infer: true });
    const source = normalize(join(baseDir, key));
    if (!source.startsWith(normalize(baseDir))) throw new NotFoundException("Invalid download key");

    try {
      await stat(source);
    } catch {
      throw new NotFoundException("File not found");
    }

    createReadStream(source).pipe(res);
  }
}
