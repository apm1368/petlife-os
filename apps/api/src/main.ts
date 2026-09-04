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
import { PRIVATE_OBJECT_KEY_PREFIXES } from "./modules/storage/object-url.util";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ["log", "warn", "error"],
  });

  const config = app.get(ConfigService<AppEnv, true>);

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
      const key = decodeURIComponent(req.path.replace(/^\/+/, ""));
      if (PRIVATE_OBJECT_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        res.status(404).end();
        return;
      }
      next();
    });
    app.useStaticAssets(resolve(config.get("STORAGE_LOCAL_DIR", { infer: true })), { prefix: "/uploads/" });
  }

  const port = config.get("PORT", { infer: true });
  await app.listen(port);
  console.log(`PET LIFE OS API listening on port ${port}`);
}

void bootstrap();
