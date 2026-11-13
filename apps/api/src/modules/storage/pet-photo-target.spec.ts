import type { StorageDriver } from "./storage-driver.interface";
import { PET_PHOTO_MAX_BYTES, StorageService } from "./storage.service";

describe("pet photo upload target (owner 2026-11-13: up to 50 MB)", () => {
  it("issues a pets/<id>/ key with the photo's own extension and a 50 MB ceiling", async () => {
    const createUploadTarget = jest.fn(async (key: string) => ({ uploadUrl: `/uploads/t`, method: "PUT" as const, publicUrl: `/uploads/${key}`, key }));
    const service = new StorageService({ createUploadTarget } as unknown as StorageDriver);
    await service.createPetPhotoUploadTarget("pet-1", "image/webp");
    expect(PET_PHOTO_MAX_BYTES).toBe(50 * 1024 * 1024);
    expect(createUploadTarget).toHaveBeenCalledWith(expect.stringMatching(/^pets\/pet-1\/[0-9a-f-]+\.webp$/), "image/webp", PET_PHOTO_MAX_BYTES);
    await expect(service.createPetPhotoUploadTarget("pet-1", "image/gif")).rejects.toThrow();
  });
});
