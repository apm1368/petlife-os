import { resolve } from "node:path";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import { isPrivateUploadPath } from "./object-url.util";

/**
 * The local driver's static `/uploads` mount. It serves the entire local storage directory — every object
 * key StorageService ever mints lives under it, private ones included. A private key must only ever be
 * reached through DownloadsController's short-lived, Redis-token-gated route, never this unauthenticated
 * static route, so private paths are refused before the static middleware runs (validateStorageConfig in
 * config/env.ts additionally refuses to boot with this driver in production at all). Shared by main.ts and
 * the e2e suite so the test exercises the exact mount the server runs.
 */
export function mountLocalUploads(app: NestExpressApplication, storageLocalDir: string): void {
  app.use("/uploads", (req: Request, res: Response, next: NextFunction) => {
    if (isPrivateUploadPath(req.path)) {
      res.status(404).end();
      return;
    }
    next();
  });
  app.useStaticAssets(resolve(storageLocalDir), { prefix: "/uploads/" });
}
