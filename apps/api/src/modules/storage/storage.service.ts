import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { STORAGE_DRIVER, type StorageDriver, type UploadTarget } from "./storage-driver.interface";

@Injectable()
export class StorageService {
  constructor(@Inject(STORAGE_DRIVER) private readonly driver: StorageDriver) {}

  async createPetPhotoUploadTarget(petId: string, contentType: string): Promise<UploadTarget> {
    const extension = contentType === "image/png" ? "png" : "jpg";
    const key = `pets/${petId}/${randomUUID()}.${extension}`;
    return this.driver.createUploadTarget(key, contentType);
  }
}
