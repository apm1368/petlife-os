import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { StorageService } from "../src/modules/storage/storage.service";
import { mountLocalUploads } from "../src/modules/storage/local-uploads.mount";

/**
 * Every file a private uploader mints must be unreachable through the unauthenticated `/uploads` static
 * mount, while public media stays reachable. Keys come from the real StorageService methods (not hand-written
 * prefixes), and the request goes through the exact mount main.ts installs — so a new private uploader whose
 * prefix nobody thought about is caught here.
 */
describe("Local /uploads mount never serves a private upload", () => {
  let app: NestExpressApplication, storage: StorageService, dir: string;
  const id = () => randomUUID();
  const pdf = "application/pdf";
  const png = "image/png";

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "petlife-uploads-"));
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    mountLocalUploads(app, dir);
    await app.init();
    storage = app.get(StorageService);
  });
  afterAll(async () => {
    await app?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  async function fetchStored(key: string) {
    const path = join(dir, key);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "file body");
    return request(app.getHttpServer()).get(`/uploads/${key}`);
  }

  const privateUploaders: Array<[string, () => Promise<{ key: string }>]> = [
    ["health document", () => storage.createHealthDocumentUploadTarget(id(), pdf, 1000)],
    ["booking attachment", () => storage.createBookingAttachmentUploadTarget(id(), pdf, 1000)],
    ["observation media", () => storage.createObservationMediaUploadTarget(id(), png, 1000)],
    ["private pet memory media", () => storage.createPetMemoryMediaUploadTarget(id(), png, 1000, "PRIVATE")],
    ["NGO verification document", () => storage.createOrgVerificationDocumentUploadTarget(id(), pdf, 1000)],
    ["support case attachment", () => storage.createSupportAttachmentUploadTarget(id(), pdf, 1000)],
    ["provider verification document", () => storage.createPartnerVerificationUploadTarget("provider", id(), pdf, 1000)],
    ["seller verification document", () => storage.createPartnerVerificationUploadTarget("seller", id(), pdf, 1000)],
  ];

  it.each(privateUploaders)("%s → 404", async (_label, mint) => {
    const { key } = await mint();
    const res = await fetchStored(key);
    expect(res.status).toBe(404);
    expect(res.text).not.toContain("file body");
  });

  it("an account export → 404", async () => {
    const key = await storage.putAccountExport(id(), id(), Buffer.from("{}"));
    await storage.deletePrivateObject(key);
    expect((await fetchStored(key)).status).toBe(404);
  });

  it.each([
    ["public lost pet photo", () => storage.createLostPetPhotoUploadTarget(id(), png, 1000)],
    ["public travel listing image", () => storage.createTravelListingImageUploadTarget(id(), png, 1000)],
    ["public pet memory media", () => storage.createPetMemoryMediaUploadTarget(id(), png, 1000, "PUBLIC")],
    ["public community media", () => storage.createCommunityMediaUploadTarget(id(), png, 1000)],
  ] as Array<[string, () => Promise<{ key: string }>]>)("%s stays reachable", async (_label, mint) => {
    const { key } = await mint();
    const res = await fetchStored(key);
    expect(res.status).toBe(200);
  });
});
