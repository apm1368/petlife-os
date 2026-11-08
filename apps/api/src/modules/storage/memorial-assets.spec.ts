import { randomUUID } from "node:crypto";
import { ServiceUnavailableException } from "@nestjs/common";
import type { StorageDriver } from "./storage-driver.interface";
import { StorageService } from "./storage.service";
import { isPrivateUploadPath, resolveObjectUrl } from "./object-url.util";

describe("StorageService memorial publication assets", () => {
  const petId = "3f0b8a52-3c1e-4f0e-9a51-0d2c4b8e7a11";
  const sourceKey = `pet-memories-public/${petId}/7c9d2e10-5b4a-4e3f-8c21-6a0f1b2c3d4e.webp`;
  let driver: Pick<StorageDriver, "copyObject" | "openObject" | "deleteObject">;
  let storage: StorageService;

  beforeEach(() => {
    driver = {
      copyObject: jest.fn().mockResolvedValue(undefined),
      openObject: jest.fn().mockResolvedValue({ body: undefined, contentType: "image/webp" }),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    } as unknown as Pick<StorageDriver, "copyObject" | "openObject" | "deleteObject">;
    storage = new StorageService(driver as StorageDriver);
  });

  it("creates an opaque private copy while leaving the existing public source namespace unchanged", async () => {
    const assetKey = await storage.createPetMemorialPublicationAsset(petId, sourceKey);

    expect(assetKey).toMatch(/^pet-memorial-assets\/[0-9a-f-]{36}\.webp$/i);
    expect(assetKey).not.toContain(petId);
    expect(driver.copyObject).toHaveBeenCalledWith(sourceKey, assetKey, "image/webp");
    expect(isPrivateUploadPath(assetKey)).toBe(true);
    expect(() => resolveObjectUrl(assetKey)).toThrow();
    expect(isPrivateUploadPath(sourceKey)).toBe(false);
  });

  it("rejects keys outside the selected pet source and cannot turn a source key into a public alias", async () => {
    await expect(storage.createPetMemorialPublicationAsset(petId, `pet-memories-public/${randomUUID()}/x.jpg`)).rejects.toThrow("Invalid memorial source image object key");
    await expect(storage.openPetMemorialPublicationAsset(sourceKey)).rejects.toThrow("Invalid memorial publication asset key");
    expect(driver.copyObject).not.toHaveBeenCalled();
    expect(driver.openObject).not.toHaveBeenCalled();
  });

  it("does not leak S3/storage errors or internal source keys to callers", async () => {
    (driver.copyObject as jest.Mock).mockRejectedValueOnce(new Error(`No access to ${sourceKey}`));
    let thrown: unknown;
    try {
      await storage.createPetMemorialPublicationAsset(petId, sourceKey);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ServiceUnavailableException);
    expect(String(thrown)).toContain("The selected photo is temporarily unavailable.");
    expect(String(thrown)).not.toContain(petId);
    expect(String(thrown)).not.toContain(sourceKey);
  });
});
