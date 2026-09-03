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

  /** A completely separate key namespace (`cms/media/...`) from `pets/...` — spec: "strongly separate CMS media authorization from private pet documents." CMS media is meant to be public (blog images), so this uses the same plain-public-URL delivery `createPetPhotoUploadTarget` already established, never a signed-read scheme this codebase has no other precedent for. Returns `key` alongside the target (unlike the pet-photo variant) since the CMS confirm step needs it verbatim, not reconstructed from the URL. */
  async createCmsMediaUploadTarget(contentType: string, extension: string): Promise<UploadTarget & { key: string }> {
    const key = `cms/media/${randomUUID()}.${extension}`;
    const target = await this.driver.createUploadTarget(key, contentType);
    return { ...target, key };
  }
}
