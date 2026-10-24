import type { INestApplication } from "@nestjs/common";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
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

  it("reading time is server-derived; related reading uses category/tags only and never the article itself", async () => {
    const http = () => request(app.getHttpServer());
    const detail = (await http().get("/blog/articles/dog-vaccination-schedule?locale=fa").expect(200)).body;
    expect(Number.isInteger(detail.estimatedReadingMinutes) && detail.estimatedReadingMinutes >= 1).toBe(true);
    const list = (await http().get("/blog/articles?locale=fa&categorySlug=guides").expect(200)).body;
    expect(list.items.every((a: { estimatedReadingMinutes: number }) => a.estimatedReadingMinutes >= 1)).toBe(true);
    const related = (await http().get("/blog/articles/dog-vaccination-schedule/related?locale=fa").expect(200)).body;
    expect(related.length).toBeGreaterThan(0);
    expect(related.length).toBeLessThanOrEqual(5);
    expect(related.map((a: { slug: string }) => a.slug)).not.toContain("dog-vaccination-schedule");
    expect(related.every((a: { locale: string }) => a.locale === "fa")).toBe(true);
    // Same-category articles come first, and the order is stable.
    expect(related[0].category.slug).toBe("guides");
    expect((await http().get("/blog/articles/dog-vaccination-schedule/related?locale=fa").expect(200)).body.map((a: { id: string }) => a.id)).toEqual(related.map((a: { id: string }) => a.id));
    await http().get("/blog/articles/no-such-article/related?locale=fa").expect(404);
  });

  it("feedback: one answer per member, changing updates it, counts carry no identities, sign-in required to vote", async () => {
    const http = () => request(app.getHttpServer());
    const member = async () => {
      const user = await db.user.create({ data: { displayName: "reader", email: `reader-${randomUUID()}@example.com` } });
      const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
      const csrf = extractCookie((await http().get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
      const cookie = `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}`;
      return { post: (u: string) => http().post(u).set("Cookie", cookie).set("x-csrf-token", csrf), get: (u: string) => http().get(u).set("Cookie", cookie) };
    };
    const url = "/blog/articles/signs-to-see-a-vet/feedback?locale=fa";
    const before = (await http().get(url).expect(200)).body;
    expect(before.mine).toBeNull();
    await http().post(url).send({ vote: "HELPFUL" }).expect((r) => expect([401, 403]).toContain(r.status));
    const a = await member();
    const b = await member();
    expect((await a.post(url).send({ vote: "NOT_HELPFUL", reason: "Too short" }).expect(201)).body).toMatchObject({ mine: "NOT_HELPFUL", notHelpfulCount: before.notHelpfulCount + 1 });
    const changed = (await a.post(url).send({ vote: "HELPFUL", reason: "ignored" }).expect(201)).body;
    expect(changed).toMatchObject({ mine: "HELPFUL", helpfulCount: before.helpfulCount + 1, notHelpfulCount: before.notHelpfulCount });
    await b.post(url).send({ vote: "HELPFUL" }).expect(201);
    const summary = (await http().get(url).expect(200)).body;
    expect(summary).toEqual({ helpfulCount: before.helpfulCount + 2, notHelpfulCount: before.notHelpfulCount, mine: null });
    expect((await b.get(url).expect(200)).body.mine).toBe("HELPFUL");
    const row = await db.articleFeedback.findFirstOrThrow({ where: { helpful: true, reason: { not: null } } }).catch(() => null);
    expect(row).toBeNull();
    await a.post(url).send({ vote: "MAYBE" }).expect(400);
    await a.post("/blog/articles/no-such-article/feedback?locale=fa").send({ vote: "HELPFUL" }).expect(404);
  });
});
