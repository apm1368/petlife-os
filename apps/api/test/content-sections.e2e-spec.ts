import type { INestApplication } from "@nestjs/common";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import request from "supertest";
import { createTestApp } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { validateRichTextDocument } from "../src/modules/content/rich-text.util";

/** Guides and the blog are distinct sections over one article model; the demo articles are valid content. */
describe("Content sections — blog vs guides, and the demo articles", () => {
  let app: INestApplication, db: PrismaService;
  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    execFileSync("npx", ["ts-node", "--transpile-only", "prisma/seed-content-demo.ts"], { cwd: join(__dirname, ".."), env: process.env, stdio: "pipe" });
  });
  afterAll(async () => { await app?.close(); });
  const list = (q: string) => request(app.getHttpServer()).get(`/blog/articles?${q}`).expect(200);

  it("guides list only guides, under /guides; the blog list leaves them out", async () => {
    for (const locale of ["fa", "en"]) {
      const guides = (await list(`locale=${locale}&categorySlug=guides&pageSize=50`)).body.items;
      expect(guides.length).toBeGreaterThanOrEqual(3);
      for (const g of guides) expect(g.canonicalPath).toBe(`/${locale}/guides/${g.slug}`);
      const blog = (await list(`locale=${locale}&excludeCategorySlug=guides&pageSize=50`)).body.items;
      expect(blog.some((b: { category: { slug: string } | null }) => b.category?.slug === "guides")).toBe(false);
      // Looked up within its own category so the check doesn't depend on how many other articles exist.
      const care = (await list(`locale=${locale}&categorySlug=care-and-health&excludeCategorySlug=guides&pageSize=50`)).body.items;
      expect(care.some((b: { slug: string }) => b.slug === "cat-nutrition-by-age")).toBe(true);
      for (const b of blog) expect(b.canonicalPath.startsWith(`/${locale}/blog/`)).toBe(true);
    }
  });

  it("every demo article has SEO fields, a cover and a body the rich-text validator accepts", async () => {
    const rows = await db.articleLocale.findMany({ where: { slug: { in: ["dog-vaccination-schedule", "cat-nutrition-by-age", "signs-to-see-a-vet", "teaching-dog-to-stay-alone", "dog-cat-dental-care"] } }, include: { article: true } });
    expect(rows).toHaveLength(10); // five articles × fa/en
    for (const r of rows) {
      expect(r.seoTitle && r.seoDescription && r.excerpt).toBeTruthy();
      expect(r.article.coverMediaAssetId).toBeTruthy();
      expect(() => validateRichTextDocument(r.body)).not.toThrow();
    }
    const detail = await request(app.getHttpServer()).get("/blog/articles/dog-vaccination-schedule?locale=fa").expect(200);
    expect(detail.body.category.slug).toBe("guides");
    expect(detail.body.coverMediaAsset.url).toBe("/images/experience/vet-hero.png");
  });
});
