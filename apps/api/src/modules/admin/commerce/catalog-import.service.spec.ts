import { CatalogImportItemStatus, ProductStatus } from "@prisma/client";
import * as sourceFetch from "../../travel-external/safe-fetch";
import { CatalogImportService } from "./catalog-import.service";

const snapshot = {
  sourceItemId: "42", sourceUrl: "https://www.digikala.com/product/dkp-42/", title: "Pet food", titleEn: null,
  brandName: "Source brand", sourceCategoryName: "Food", description: "Description",
  specifications: [{ label: "Weight", value: "2kg" }],
  images: [1, 2, 3].map((n) => ({ url: `https://dkstatics-public.digikala.com/image-${n}.jpg`, alt: `Image ${n}` })),
};
const job = { id: "job-1", targetCategoryId: "category-1", targetBrandId: null };
type TestJob = typeof job;
type TestSnapshot = typeof snapshot;

describe("CatalogImportService", () => {
  beforeEach(() => {
    jest.spyOn(sourceFetch, "safeFetch").mockImplementation(async (url) => url.endsWith("/robots.txt")
      ? { status: 200, body: "User-agent: *\nAllow: /\n", bodyBytes: Buffer.alloc(0), finalUrl: url, contentType: "text/plain" }
      : { status: 200, body: "", bodyBytes: Buffer.from([0xff, 0xd8, 0xff]), finalUrl: url, contentType: "image/jpeg" });
  });
  afterEach(() => jest.restoreAllMocks());

  it("creates a simple draft with exactly three stored images and never creates seller price or stock", async () => {
    const productCreate = jest.fn().mockResolvedValue({ id: "product-1" });
    const itemCreate = jest.fn().mockResolvedValue({ id: "item-1" });
    const storeCatalogImage = jest.fn(async (_productId: string, _mime: string, _bytes: Buffer) => ({ url: "https://media.petlife.test/image.jpg", key: `product-catalog/${_productId}/11111111-1111-4111-8111-111111111111.jpg` }));
    const prisma = {
      catalogImportItem: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null), create: itemCreate },
      product: { create: productCreate, deleteMany: jest.fn() },
    };
    (prisma as unknown as { $transaction: (fn: (tx: typeof prisma) => Promise<unknown>) => Promise<unknown> }).$transaction = (fn) => fn(prisma);
    const service = new CatalogImportService(prisma as never, { storeCatalogImage, deleteCatalogImage: jest.fn() } as never, { record: jest.fn() } as never, { raise: jest.fn() } as never);
    const result = await (service as unknown as { ingestSnapshot: (sourceJob: TestJob, sourceSnapshot: TestSnapshot) => Promise<string> }).ingestSnapshot(job, snapshot);
    expect(result).toBe("IMPORTED");
    const data = productCreate.mock.calls[0]![0].data;
    expect(data).toMatchObject({ status: ProductStatus.DRAFT, categoryId: job.targetCategoryId, brandId: null, title: snapshot.title });
    expect(data.media.create).toHaveLength(3);
    expect(data).not.toHaveProperty("variants");
    expect(data).not.toHaveProperty("price");
    expect(data).not.toHaveProperty("stock");
    expect(data.media.create[0]).toMatchObject({ sourceUrl: snapshot.images[0]!.url });
    expect(itemCreate.mock.calls[0]![0].data.status).toBe(CatalogImportItemStatus.IMPORTED);
    expect(storeCatalogImage).toHaveBeenCalledTimes(3);
  });

  it("keeps changed source data pending rather than overwriting an existing local product", async () => {
    const itemCreate = jest.fn().mockResolvedValue({ id: "incoming-item" });
    const productUpdate = jest.fn();
    const oldSnapshot = { ...snapshot, title: "Old source title" };
    const prisma = {
      catalogImportItem: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue({ sourceHash: "old-hash", sourceSnapshot: oldSnapshot, productId: "local-product" }),
        create: itemCreate,
      },
      product: { update: productUpdate },
    };
    const service = new CatalogImportService(prisma as never, {} as never, { record: jest.fn() } as never, { raise: jest.fn() } as never);
    const result = await (service as unknown as { ingestSnapshot: (sourceJob: TestJob, sourceSnapshot: TestSnapshot) => Promise<string> }).ingestSnapshot(job, snapshot);
    expect(result).toBe("NEEDS_REVIEW");
    expect(itemCreate.mock.calls[0]![0].data).toMatchObject({ productId: "local-product", status: CatalogImportItemStatus.NEEDS_REVIEW, pendingSnapshot: snapshot });
    expect(productUpdate).not.toHaveBeenCalled();
  });
});
