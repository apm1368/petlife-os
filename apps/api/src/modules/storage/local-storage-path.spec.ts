import { ConfigService } from "@nestjs/config";
import { NotFoundException } from "@nestjs/common";
import type Redis from "ioredis";
import type { Request, Response } from "express";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, normalize, resolve } from "node:path";
import type { AppEnv } from "../../config/env";
import { DownloadsController } from "./downloads.controller";
import { UploadsController } from "./uploads.controller";
import { LocalStorageDriver } from "./local-storage.driver";
import { resolveLocalStoragePath } from "./local-storage-path";

describe("local storage containment", () => {
  const base = "/tmp/storage";
  it("reproduces the old sibling-prefix mistake and rejects it", () => {
    const key = "../storage-other/private.jpg";
    expect(normalize(join(base, key)).startsWith(base)).toBe(true);
    expect(() => resolveLocalStoragePath(base, key)).toThrow("Invalid storage key");
  });
  it.each(["../outside", "../../outside", "a/../../storage-other/file", "/etc/passwd", "", ".", "a/..", "bad\0key"])("rejects invalid key %j", (key) => {
    expect(() => resolveLocalStoragePath(base, key)).toThrow("Invalid storage key");
  });
  it("supports nested and normalized relative roots without prefix confusion", () => {
    expect(resolveLocalStoragePath("./local-storage", "pets/a/../photo.jpg")).toBe(resolve("./local-storage/pets/photo.jpg"));
    expect(resolveLocalStoragePath(base, "..photo.jpg")).toBe(`${base}/..photo.jpg`);
  });

  const redis = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  const config = { get: jest.fn((name: string) => name === "STORAGE_DRIVER" ? "local" : name === "STORAGE_LOCAL_DIR" ? base : "http://localhost/uploads") };
  const driver = new LocalStorageDriver(redis as unknown as Redis, config as unknown as ConfigService<AppEnv, true>);
  beforeEach(() => jest.clearAllMocks());

  it("rejects escaped read/write/copy/delete operations and token issuance", async () => {
    const invalid = "../storage-other/file";
    await expect(driver.putObject(invalid, Buffer.from("fixture"))).rejects.toThrow("Invalid storage key");
    await expect(driver.openObject(invalid)).rejects.toThrow("Invalid storage key");
    await expect(driver.deleteObject(invalid)).rejects.toThrow("Invalid storage key");
    await expect(driver.copyObject(invalid, "safe.jpg")).rejects.toThrow("Invalid storage key");
    await expect(driver.copyObject("safe.jpg", invalid)).rejects.toThrow("Invalid storage key");
    await expect(driver.createUploadTarget(invalid, "image/jpeg")).rejects.toThrow("Invalid storage key");
    await expect(driver.createDownloadTarget(invalid)).rejects.toThrow("Invalid storage key");
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("rejects malicious legacy Redis tokens at both HTTP handlers before response/stream use", async () => {
    const configService = config as unknown as ConfigService<AppEnv, true>;
    redis.get.mockResolvedValueOnce("../storage-other/private.jpg");
    const response = { setHeader: jest.fn() };
    await expect(new DownloadsController(redis as unknown as Redis, configService).download("fixture", response as unknown as Response)).rejects.toBeInstanceOf(NotFoundException);
    expect(response.setHeader).not.toHaveBeenCalled();
    redis.get.mockResolvedValueOnce(JSON.stringify({ key: "../storage-other/private.jpg" }));
    const request = { headers: {}, pipe: jest.fn() };
    await expect(new UploadsController(redis as unknown as Redis, configService).upload("fixture", request as unknown as Request)).rejects.toBeInstanceOf(NotFoundException);
    expect(request.pipe).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it("disables local token handlers for S3 before looking up tokens", async () => {
    const s3 = { get: () => "s3" } as unknown as ConfigService<AppEnv, true>;
    await expect(new DownloadsController(redis as unknown as Redis, s3).download("fixture", {} as Response)).rejects.toBeInstanceOf(NotFoundException);
    await expect(new UploadsController(redis as unknown as Redis, s3).upload("fixture", {} as Request)).rejects.toBeInstanceOf(NotFoundException);
    expect(redis.get).not.toHaveBeenCalled();
  });

  it("preserves valid write, copy, read and deletion using only disposable fixture data", async () => {
    const directory = await mkdtemp(join(tmpdir(), "petlife-storage-qa-"));
    const localConfig = { get: () => directory } as unknown as ConfigService<AppEnv, true>;
    const local = new LocalStorageDriver(redis as unknown as Redis, localConfig);
    try {
      await local.putObject("nested/photo.jpg", Buffer.from("fixture"));
      await local.copyObject("nested/photo.jpg", "copy/photo.jpg");
      const opened = await local.openObject("copy/photo.jpg");
      expect(opened.contentType).toBe("image/jpeg");
      const chunks: Buffer[] = [];
      for await (const chunk of opened.body) chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks).toString()).toBe("fixture");
      await local.deleteObject("copy/photo.jpg");
      await expect(readFile(join(directory, "copy/photo.jpg"))).rejects.toMatchObject({ code: "ENOENT" });
      expect((await readFile(join(directory, "nested/photo.jpg"))).toString()).toBe("fixture");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
