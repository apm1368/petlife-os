import { Controller, Inject, NotFoundException, Param, Put, Req } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type Redis from "ioredis";
import type { Request } from "express";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { REDIS_CLIENT } from "../../common/redis/redis.module";
import type { AppEnv } from "../../config/env";

/** Local-dev-only endpoint the LocalStorageDriver's upload URLs point at. Not used when STORAGE_DRIVER=s3. */
@Controller("uploads")
export class UploadsController {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  @Put(":token")
  async upload(@Param("token") token: string, @Req() req: Request): Promise<{ ok: true }> {
    const raw = await this.redis.get(`upload-token:${token}`);
    if (!raw) throw new NotFoundException("Upload token expired or invalid");
    const { key } = JSON.parse(raw) as { key: string };

    const baseDir = this.config.get("STORAGE_LOCAL_DIR", { infer: true });
    const destination = normalize(join(baseDir, key));
    if (!destination.startsWith(normalize(baseDir))) {
      throw new NotFoundException("Invalid upload key");
    }

    await mkdir(dirname(destination), { recursive: true });
    await new Promise<void>((resolve, reject) => {
      const writeStream = createWriteStream(destination);
      req.pipe(writeStream);
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });

    await this.redis.del(`upload-token:${token}`);
    return { ok: true };
  }
}
