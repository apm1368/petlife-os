import { Controller, Inject, NotFoundException, Param, PayloadTooLargeException, Put, Req } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type Redis from "ioredis";
import type { Request } from "express";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { REDIS_CLIENT } from "../../common/redis/redis.module";
import type { AppEnv } from "../../config/env";
import { DEFAULT_UPLOAD_MAX_BYTES, UPLOAD_CEILING_BYTES } from "./local-storage.driver";

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
    const { key, maxBytes: declared } = JSON.parse(raw) as { key: string; maxBytes?: number };
    // The body may not exceed the size declared when the target was issued (tokens from before this
    // field existed get the default); otherwise one signed-in user could stream an unbounded file to disk.
    const maxBytes = Math.min(declared ?? DEFAULT_UPLOAD_MAX_BYTES, UPLOAD_CEILING_BYTES);
    if (Number(req.headers["content-length"] ?? 0) > maxBytes) throw new PayloadTooLargeException("This file is larger than the size declared for the upload.");

    const baseDir = this.config.get("STORAGE_LOCAL_DIR", { infer: true });
    const destination = normalize(join(baseDir, key));
    if (!destination.startsWith(normalize(baseDir))) {
      throw new NotFoundException("Invalid upload key");
    }

    await mkdir(dirname(destination), { recursive: true });
    let received = 0;
    const tooLarge = await new Promise<boolean>((resolve, reject) => {
      const writeStream = createWriteStream(destination);
      req.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > maxBytes) {
          req.unpipe(writeStream);
          writeStream.destroy();
          resolve(true);
        }
      });
      req.pipe(writeStream);
      writeStream.on("finish", () => resolve(false));
      writeStream.on("error", reject);
    });
    if (tooLarge) {
      await rm(destination, { force: true });
      throw new PayloadTooLargeException("This file is larger than the size declared for the upload.");
    }

    await this.redis.del(`upload-token:${token}`);
    return { ok: true };
  }
}
