import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { AppModule } from "../src/app.module";
import { ApiExceptionFilter } from "../src/common/filters/api-exception.filter";
import type { AppEnv } from "../src/config/env";
import { mountLocalUploads } from "../src/modules/storage/local-uploads.mount";

export async function createTestApp(options: { mountLocalUploads?: boolean; storageLocalDir?: string } = {}): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  if (options.mountLocalUploads) {
    const config = moduleRef.get<ConfigService<AppEnv, true>>(ConfigService);
    if (config.get("STORAGE_DRIVER", { infer: true }) === "local") {
      mountLocalUploads(app as NestExpressApplication, options.storageLocalDir ?? config.get("STORAGE_LOCAL_DIR", { infer: true }));
    }
  }
  app.use(cookieParser());
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.init();
  return app;
}

export function extractCookie(setCookieHeader: string | string[] | undefined, name: string): string | undefined {
  const headers = Array.isArray(setCookieHeader) ? setCookieHeader : setCookieHeader ? [setCookieHeader] : [];
  const line = headers.find((c) => c.startsWith(`${name}=`));
  if (!line) return undefined;
  const value = line.split(";")[0]?.split("=")[1];
  return value;
}
