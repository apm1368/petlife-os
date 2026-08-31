import "reflect-metadata";
import { resolve } from "node:path";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ConfigService } from "@nestjs/config";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import type { AppEnv } from "./config/env";

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
    app.useStaticAssets(resolve(config.get("STORAGE_LOCAL_DIR", { infer: true })), { prefix: "/uploads/" });
  }

  const port = config.get("PORT", { infer: true });
  await app.listen(port);
  console.log(`PET LIFE OS API listening on port ${port}`);
}

void bootstrap();
