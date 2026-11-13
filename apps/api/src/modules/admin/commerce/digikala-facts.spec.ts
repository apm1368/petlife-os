import { CatalogImportItemStatus, CatalogImportJobStatus, ProductStatus, WeightUnit } from "@prisma/client";
import * as sourceFetch from "../../travel-external/safe-fetch";
import { CatalogImportService, factsMaxProducts, factsVariantRows } from "./catalog-import.service";
import { factsDetailUrl, factsListUrl, parseFactsDetail, parseFactsList, parseFactsSubcategories, parseWeightKg, planQuotas } from "./digikala-facts";

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
      totalItems: 2,
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

  it("reads the pet sub-categories from the listing's own category filter", () => {
    const body = { status: 200, data: { filters: { categories: { options: [
      { code: "cat-dry-foods", title_fa: "غذای خشک گربه" },
      { code: "dog-collar", title_fa: "قلاده سگ" },
      { code: "cat-dry-foods", title_fa: "تکراری" },
      { code: "../x", title_fa: "نامعتبر" },
      { title_fa: "بدون کد" },
    ] } } } };
    expect(parseFactsSubcategories(body)).toEqual([{ code: "cat-dry-foods", title: "غذای خشک گربه" }, { code: "dog-collar", title: "قلاده سگ" }]);
    expect(parseFactsSubcategories({ data: {} })).toEqual([]);
  });

  it("splits the total across sub-categories by size, never above what one can serve, biggest first", () => {
    const plan = planQuotas([{ code: "c", title: "C", total: 10_000 }, { code: "a", title: "A", total: 60_000 }, { code: "b", title: "B", total: 30_000 }, { code: "z", title: "Z", total: 0 }], 16_000);
    expect(plan.map((p) => [p.code, p.quota])).toEqual([["a", 9_600], ["b", 4_800], ["c", 1_600]]);
    expect(plan.every((p) => p.page === 1 && p.taken === 0 && !p.exhausted)).toBe(true);
    // Digikala serves at most 500 pages of 20 per category: the rest goes to the others, as far as they can take it.
    const capped = planQuotas([{ code: "big", title: "B", total: 90_000 }, { code: "small", title: "S", total: 9_000 }], 16_000);
    expect(capped.map((p) => [p.code, p.quota])).toEqual([["big", 10_000], ["small", 6_000]]);
    expect(planQuotas([{ code: "a", title: "A", total: 50 }], 16_000)[0]!.quota).toBe(50);
    // Rounding never loses or invents a product.
    const odd = planQuotas([{ code: "a", title: "A", total: 7 }, { code: "b", title: "B", total: 7 }, { code: "c", title: "C", total: 7 }], 10);
    expect(odd.reduce((n, p) => n + p.quota, 0)).toBe(10);
  });

  it("turns Digikala's colour/size/flavour variants into catalog variants, without seller or price data", () => {
    const variant = (id: number, themes: Array<[string, string]>) => ({
      id, themes: themes.map(([label, title]) => ({ label, value: { title } })),
      seller: { title: "فروشنده الف" }, price: { selling_price: 999 }, warranty: { title_fa: "گارانتی" },
    });
    const body = detail(5, "قلاده سگ و گربه طرح پاپیون", {
      specifications: [{ title: "مشخصات", attributes: [{ title: "طعم", values: ["مرغ"] }, { title: "وزن", values: ["10 گرم"] }, { title: "رنگ بندی", values: ["چند رنگ"] }] }],
      variants: [variant(1, [["رنگ", "قرمز"], ["سایز", "S"]]), variant(2, [["رنگ", "قرمز"], ["سایز", "S"]]), variant(3, [["رنگ", "زرد"], ["سایز", "M"]])],
    });
    const snap = parseFactsDetail(body, { id: "5", referencePriceIrr: null, referenceStock: null, marketable: true }, "dog-collar")!;
    expect(snap.subcategory).toBe("dog-collar");
    // Two sellers of the same red S are one variant; the single flavour applies to all; "رنگ بندی" is not a colour.
    expect(snap.variants).toEqual([
      { attributes: { طعم: "مرغ", رنگ: "قرمز", اندازه: "S" }, weightKg: 0.01 },
      { attributes: { طعم: "مرغ", رنگ: "زرد", اندازه: "M" }, weightKg: 0.01 },
    ]);
    expect(JSON.stringify(snap)).not.toMatch(/فروشنده الف|گارانتی|999/);
    expect(factsVariantRows(snap)).toEqual([
      { sku: "DK-5-1", title: "مرغ · قرمز · S", attributes: { طعم: "مرغ", رنگ: "قرمز", اندازه: "S" }, weightValue: 0.01, weightUnit: WeightUnit.KG },
      { sku: "DK-5-2", title: "مرغ · زرد · M", attributes: { طعم: "مرغ", رنگ: "زرد", اندازه: "M" }, weightValue: 0.01, weightUnit: WeightUnit.KG },
    ]);
    // A weight variant carries its own weight.
    const byWeight = parseFactsDetail(detail(6, "غذای خشک سگ", { variants: [variant(1, [["وزن", "2 کیلوگرم"]]), variant(2, [["وزن", "500 گرم"]])] }), { id: "6", referencePriceIrr: null, referenceStock: null, marketable: true })!;
    expect(byWeight.variants.map((v) => [v.attributes["وزن"], v.weightKg])).toEqual([["2 کیلوگرم", 2], ["500 گرم", 0.5]]);
  });

  it("caps the one-time total at 16,000 unless the server sets another total", () => {
    expect(factsMaxProducts({})).toBe(16_000);
    expect(factsMaxProducts({ DIGIKALA_FACTS_MAX_PRODUCTS: "5000" })).toBe(5_000);
    expect(factsMaxProducts({ DIGIKALA_FACTS_MAX_PRODUCTS: "abc" })).toBe(16_000);
    expect(factsMaxProducts({ DIGIKALA_FACTS_MAX_PRODUCTS: "999999" })).toBe(16_000);
  });

  describe("full run across sub-categories", () => {
    const page = (ids: number[], totalPages = 1, totalItems = ids.length, extra: Record<string, unknown> = {}) => ({ status: 200, data: { pager: { current_page: 1, total_pages: totalPages, total_items: totalItems }, products: ids.map((id) => ({ id, status: "marketable", default_variant: [] })), ...extra } });
    const root = page([1], 500, 60, { filters: { categories: { options: [{ code: "cat-dry-foods", title_fa: "غذای خشک گربه" }, { code: "dog-collar", title_fa: "قلاده سگ" }] } } });

    function harness(job: Record<string, unknown>, known: string[] = []) {
      const urls: string[] = [];
      jest.spyOn(sourceFetch, "safeFetch").mockImplementation(async (url) => {
        urls.push(url);
        const body = url === factsListUrl(1) ? root
          : url === factsListUrl(1, "cat-dry-foods") ? page([11, 12, 13], 1, 40)
          : url === factsListUrl(1, "dog-collar") ? page([21, 22, 23, 24], 1, 20)
          : url.startsWith("https://api.digikala.com/v2/product/") ? detail(Number(url.split("/").at(-2)), `کالا ${url.split("/").at(-2)} برای گربه`)
          : null;
        if (!body) throw new Error(`unexpected ${url}`);
        return { status: 200, body: JSON.stringify(body), bodyBytes: Buffer.alloc(0), finalUrl: url, contentType: "application/json" };
      });
      const productCreate = jest.fn().mockImplementation(async (args: { data: { slug: string } }) => ({ id: args.data.slug }));
      const recorded = new Set(known);
      const itemCreate = jest.fn().mockImplementation(async (args: { data: { sourceItemId: string } }) => { recorded.add(args.data.sourceItemId); return { id: "item" }; });
      const jobUpdate = jest.fn().mockResolvedValue({});
      const tx = { product: { create: productCreate }, catalogImportItem: { create: itemCreate } };
      const prisma = {
        catalogImportJob: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "job-1", mode: "DIGIKALA_FACTS", targetCategoryId: "cat-1", targetBrandId: null, maxPages: 500, pagesVisited: 0, productsSeen: 0, productsFailed: 0, progress: null, ...job }), findUnique: jest.fn().mockResolvedValue({ cancelRequested: false }), update: jobUpdate },
        catalogImportItem: { findFirst: jest.fn().mockImplementation(async (args: { where: { sourceItemId: string } }) => (recorded.has(args.where.sourceItemId) ? { id: "known" } : null)), create: itemCreate, count: jest.fn().mockImplementation(async () => productCreate.mock.calls.length) },
        brand: { findFirst: jest.fn().mockResolvedValue(null) },
        $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
      };
      const service = new CatalogImportService(prisma as never, {} as never, {} as never, {} as never, {} as never);
      service.factsDelayMs = 0;
      const run = () => (service as unknown as { runFactsJob(id: string): Promise<void> }).runFactsJob("job-1");
      return { urls, productCreate, jobUpdate, run };
    }

    it("measures each sub-category, takes each one's share of best-sellers, saves the cursor, and completes", async () => {
      const h = harness({ maxProducts: 3 });
      await h.run();
      // Planning: the pet page once, then page 1 of each sub-category for its size (40 and 20 → shares 2 and 1).
      const planned = h.jobUpdate.mock.calls.map((c) => c[0].data.progress).filter((p) => p?.planned)[0];
      expect(planned.plan.map((p: { code: string; quota: number }) => [p.code, p.quota])).toEqual([["cat-dry-foods", 2], ["dog-collar", 1]]);
      expect(h.productCreate.mock.calls.map((c) => c[0].data.slug)).toEqual(["digikala-11", "digikala-12", "digikala-21"]);
      expect(h.urls).not.toContain(factsDetailUrl("13"));
      expect(h.urls.every((u) => u.startsWith("https://api.digikala.com/"))).toBe(true);
      const last = h.jobUpdate.mock.calls.at(-1)![0].data;
      expect(last).toMatchObject({ status: CatalogImportJobStatus.COMPLETED, productsSeen: 3, productsImported: 3 });
      expect(last.progress.plan.map((p: { taken: number }) => p.taken)).toEqual([2, 1]);
      // Every save renews the lock and resets the failure count (only failures in a row end the run).
      expect(h.jobUpdate.mock.calls.every((c) => c[0].data.lockedUntil !== undefined)).toBe(true);
    });

    it("resumes from the saved cursor without measuring again or re-reading recorded products", async () => {
      const progress = {
        version: 1, planned: true, pass: "QUOTA", current: 1,
        subcategories: [{ code: "cat-dry-foods", title: "غذای خشک گربه", total: 40 }, { code: "dog-collar", title: "قلاده سگ", total: 20 }],
        plan: [
          { code: "cat-dry-foods", title: "غذای خشک گربه", total: 40, quota: 2, taken: 2, page: 1, exhausted: false },
          { code: "dog-collar", title: "قلاده سگ", total: 20, quota: 1, taken: 0, page: 1, exhausted: false },
        ],
      };
      const h = harness({ maxProducts: 3, productsSeen: 2, progress }, ["11", "12"]);
      await h.run();
      expect(h.urls).not.toContain(factsListUrl(1));
      expect(h.urls).not.toContain(factsListUrl(1, "cat-dry-foods"));
      expect(h.productCreate.mock.calls.map((c) => c[0].data.slug)).toEqual(["digikala-21"]);
    });

    it("tops the total up from sub-categories with products left when a share runs short", async () => {
      // Shares for 6: cat food 4, collars 2. Cat food really has only 3, so the FILL pass takes a 3rd collar.
      const h = harness({ maxProducts: 6 });
      await h.run();
      expect(h.productCreate.mock.calls.map((c) => c[0].data.slug)).toEqual(["digikala-11", "digikala-12", "digikala-13", "digikala-21", "digikala-22", "digikala-23"]);
      expect(h.jobUpdate.mock.calls.at(-1)![0].data.progress.pass).toBe("FILL");
    });
  });
});
