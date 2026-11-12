import { CatalogImportItemStatus, CatalogImportJobStatus, ProductStatus, WeightUnit } from "@prisma/client";
import * as sourceFetch from "../../travel-external/safe-fetch";
import { CatalogImportService } from "./catalog-import.service";
import { factsDetailUrl, factsListUrl, parseFactsDetail, parseFactsList, parseWeightKg } from "./digikala-facts";

const listBody = {
  status: 200,
  data: {
    pager: { current_page: 1, total_pages: 1, total_items: 2 },
    products: [
      { id: 20815034, status: "marketable", default_variant: { price: { selling_price: 4_754_000, marketable_stock: 7 } } },
      { id: 21786916, status: "out_of_stock", default_variant: [] },
    ],
  },
};
const detail = (id: number, title: string, extra: Record<string, unknown> = {}) => ({
  status: 200,
  data: {
    product: {
      id,
      title_fa: title,
      title_en: "",
      brand: { title_fa: "وی پت", title_en: "Vipet" },
      category: { title_fa: "غذای گربه" },
      breadcrumb: [{ title: "دیجی‌کالا" }, { title: "پت شاپ" }, { title: "غذای گربه" }, { title }],
      specifications: [{ title: "مشخصات", attributes: [{ title: "وزن", values: ["1 کیلوگرم"] }, { title: "طعم", values: ["مرغ", "ماهی"] }, { title: "توضیحات", values: ["x".repeat(400)] }] }],
      // Present in the source and deliberately ignored:
      images: { main: { url: ["https://dkstatics-public.digikala.com/a.jpg"] } },
      review: { description: "Digikala's own product text" },
      expert_reviews: { description: "Digikala's own review" },
      ...extra,
    },
  },
});

describe("Digikala facts (one-time pet import)", () => {
  it("reads weight from Persian or Latin text in kilos or grams", () => {
    expect(parseWeightKg("غذای خشک گربه وزن ۱ کیلوگرم")).toBe(1);
    expect(parseWeightKg("۵۰۰ گرم")).toBe(0.5);
    expect(parseWeightKg("2.5kg")).toBe(2.5);
    expect(parseWeightKg("ظرف آب")).toBeNull();
  });

  it("takes ids and reference price/stock from a listing page", () => {
    expect(parseFactsList(listBody)).toEqual({
      totalPages: 1,
      items: [
        { id: "20815034", referencePriceIrr: 4_754_000, referenceStock: 7, marketable: true },
        { id: "21786916", referencePriceIrr: null, referenceStock: null, marketable: false },
      ],
    });
  });

  it("keeps facts only: no images, descriptions or reviews, long values dropped, species from the title", () => {
    const snap = parseFactsDetail(detail(20815034, "غذای خشک گربه بالغ وی پت وزن 1 کیلوگرم"), parseFactsList(listBody).items[0]!)!;
    expect(snap).toMatchObject({ title: "غذای خشک گربه بالغ وی پت وزن 1 کیلوگرم", brandName: "وی پت", weightKg: 1, supportsCat: true, supportsDog: false, categoryPath: ["پت شاپ", "غذای گربه"], referencePriceIrr: 4_754_000 });
    expect(snap.specifications).toEqual([{ label: "وزن", value: "1 کیلوگرم" }, { label: "طعم", value: "مرغ، ماهی" }]);
    const text = JSON.stringify(snap);
    expect(text).not.toContain("dkstatics");
    expect(text).not.toContain("Digikala's own");
    // "Miscellaneous" is not a brand.
    expect(parseFactsDetail(detail(1, "ظرف آب", { brand: { title_fa: "متفرقه", title_en: "Miscellaneous" }, category: { title_fa: "ظرف آب و غذا" }, breadcrumb: [{ title: "پت شاپ" }, { title: "ظرف آب و غذا" }] }), { id: "1", referencePriceIrr: null, referenceStock: null, marketable: true })).toMatchObject({ brandName: null, supportsDog: true, supportsCat: true });
  });

  it("imports drafts with a weighted variant, skips known products, and stops on a block", async () => {
    const urls: string[] = [];
    jest.spyOn(sourceFetch, "safeFetch").mockImplementation(async (url) => {
      urls.push(url);
      if (url === factsListUrl(1)) return { status: 200, body: JSON.stringify(listBody), bodyBytes: Buffer.alloc(0), finalUrl: url, contentType: "application/json" };
      if (url === factsDetailUrl("20815034")) return { status: 200, body: JSON.stringify(detail(20815034, "غذای خشک گربه وزن 1 کیلوگرم")), bodyBytes: Buffer.alloc(0), finalUrl: url, contentType: "application/json" };
      throw new sourceFetch.SourceFetchError("RATE_LIMITED", "source rate limited us", 429);
    });
    const productCreate = jest.fn().mockResolvedValue({ id: "product-1" });
    const itemCreate = jest.fn().mockResolvedValue({ id: "item" });
    const jobUpdate = jest.fn().mockResolvedValue({});
    const tx = { product: { create: productCreate }, catalogImportItem: { create: itemCreate } };
    const prisma = {
      catalogImportJob: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "job-1", mode: "DIGIKALA_FACTS", targetCategoryId: "cat-1", targetBrandId: null, maxPages: 500, maxProducts: 10, pagesVisited: 0, productsSeen: 0, productsFailed: 0 }), findUnique: jest.fn().mockResolvedValue({ cancelRequested: false }), update: jobUpdate },
      catalogImportItem: { findFirst: jest.fn().mockResolvedValue(null), create: itemCreate, count: jest.fn().mockResolvedValue(1) },
      brand: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const service = new CatalogImportService(prisma as never, {} as never, {} as never, {} as never, {} as never);
    service.factsDelayMs = 0;
    await expect((service as unknown as { runFactsJob(id: string): Promise<void> }).runFactsJob("job-1")).rejects.toThrow("rate limited");
    // Only the API host, never the www pages or image hosts.
    expect(urls.every((u) => u.startsWith("https://api.digikala.com/"))).toBe(true);
    expect(productCreate).toHaveBeenCalledTimes(1);
    expect(productCreate.mock.calls[0][0].data).toMatchObject({ status: ProductStatus.DRAFT, description: null, slug: "digikala-20815034", supportsCat: true, variants: { create: { sku: "DK-20815034", weightValue: 1, weightUnit: WeightUnit.KG } } });
    expect(productCreate.mock.calls[0][0].data.specifications[0]).toEqual({ label: "برند", value: "وی پت" });
    expect(productCreate.mock.calls[0][0].data).not.toHaveProperty("media");
    expect(itemCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: CatalogImportItemStatus.IMPORTED, productId: "product-1" }) }));
    // The rate-limited product is recorded as failed, and the run stops there (no completion written).
    expect(itemCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sourceItemId: "21786916", status: CatalogImportItemStatus.FAILED }) }));
    expect(jobUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: CatalogImportJobStatus.COMPLETED }) }));
  });
});
