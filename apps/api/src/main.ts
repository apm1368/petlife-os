import "reflect-metadata";
import { resolve } from "node:path";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import type { NextFunction, Request, Response } from "express";
import { AppModule } from "./app.module";
import type { AppEnv } from "./config/env";
import { isPrivateUploadPath } from "./modules/storage/object-url.util";
import { applyTrustProxy } from "./common/http/trust-proxy.util";
import { waitForDatabase } from "./common/bootstrap/wait-for-database";

/** How long boot waits for PostgreSQL (REQUIRED_AT_BOOT) before exiting so PM2 restarts the process. */
const BOOT_DB_WAIT_MS = Number(process.env.BOOT_DB_WAIT_SECONDS ?? 90) * 1000;

async function bootstrap() {
  // AppModule's import has already loaded .env into process.env (ConfigModule.forRoot).
  await waitForDatabase(process.env.DATABASE_URL, { timeoutMs: BOOT_DB_WAIT_MS });
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ["log", "warn", "error"],
  });

  const config = app.get(ConfigService<AppEnv, true>);

  applyTrustProxy(app, config.get("TRUST_PROXY", { infer: true }));
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.get("WEB_APP_ORIGIN", { infer: true }).split(","),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  if (config.get("STORAGE_DRIVER", { infer: true }) === "local") {
    // The static mount below serves the entire local storage directory —
    // every object key StorageService ever mints lives under it, private
    // ones included. A private key must only ever be reached through
    // DownloadsController's short-lived, Redis-token-gated route, never this
    // unauthenticated static route, so block those prefixes here before the
    // static middleware ever runs (validateStorageConfig in config/env.ts
    // additionally refuses to boot with this driver in production at all).
    app.use("/uploads", (req: Request, res: Response, next: NextFunction) => {
      if (isPrivateUploadPath(req.path)) {
        res.status(404).end();
        return;
      }
      next();
    });
    app.useStaticAssets(resolve(config.get("STORAGE_LOCAL_DIR", { infer: true })), { prefix: "/uploads/" });
  }

  const port = config.get("PORT", { infer: true });
  await app.listen(port, config.get("HOST", { infer: true }));
  console.log(`PET LIFE OS API listening on port ${port}`);
}

// Fail fast: any boot failure must end the process. PM2 installs its own unhandledRejection handler, so a bare
// `void bootstrap()` rejection would leave a live process with workers ticking and no HTTP listener.
bootstrap().catch((error: unknown) => {
  console.error("[boot] PET LIFE OS API failed to start — exiting", error);
  process.exit(1);
});
