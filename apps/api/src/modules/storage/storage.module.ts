import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../../config/env";
import { LocalStorageDriver } from "./local-storage.driver";
import { S3StorageDriver } from "./s3-storage.driver";
import { STORAGE_DRIVER } from "./storage-driver.interface";
import { StorageService } from "./storage.service";
import { UploadsController } from "./uploads.controller";
import { DownloadsController } from "./downloads.controller";

@Module({
  controllers: [UploadsController, DownloadsController],
  providers: [
    LocalStorageDriver,
    S3StorageDriver,
    {
      provide: STORAGE_DRIVER,
      inject: [ConfigService, LocalStorageDriver, S3StorageDriver],
      useFactory: (config: ConfigService<AppEnv, true>, local: LocalStorageDriver, s3: S3StorageDriver) => {
        return config.get("STORAGE_DRIVER", { infer: true }) === "s3" ? s3 : local;
      },
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
