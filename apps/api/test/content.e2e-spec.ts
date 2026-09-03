import { Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";

interface Cookies {
  session?: string;
  csrf?: string;
}

function captureOtpCode(logSpy: jest.SpyInstance, identifier: string): string {
  const call = logSpy.mock.calls.find((args) => typeof args[0] === "string" && args[0].includes("[DEV OTP]") && args[0].includes(identifier));
  if (!call) throw new Error(`No OTP log found for ${identifier}`);
  const match = /code=(\d+)/.exec(call[0] as string);
  if (!match) throw new Error("Could not parse OTP code from log line");
  return match[1]!;
}

async function primeCsrf(app: INestApplication): Promise<Cookies> {
  const res = await request(app.getHttpServer()).get("/health/live");
  return { csrf: extractCookie(res.headers["set-cookie"], "petlife_csrf") };
}

async function signUp(app: INestApplication, logSpy: jest.SpyInstance, identifier: string): Promise<Cookies> {
  const primed = await primeCsrf(app);
  await request(app.getHttpServer()).post("/auth/request-otp").set("Cookie", `petlife_csrf=${primed.csrf}`).set("x-csrf-token", primed.csrf!).send({ identifier }).expect(200);
  const code = captureOtpCode(logSpy, identifier);
  const verifyRes = await request(app.getHttpServer()).post("/auth/verify-otp").set("Cookie", `petlife_csrf=${primed.csrf}`).set("x-csrf-token", primed.csrf!).send({ identifier, code }).expect(200);
  const session = extractCookie(verifyRes.headers["set-cookie"], "petlife_session");
  return { session, csrf: primed.csrf };
}

function authedRequest(app: INestApplication, cookies: Cookies) {
  const cookieHeader = `petlife_session=${cookies.session}; petlife_csrf=${cookies.csrf}`;
  return {
    get: (url: string) => request(app.getHttpServer()).get(url).set("Cookie", cookieHeader),
    post: (url: string) => request(app.getHttpServer()).post(url).set("Cookie", cookieHeader).set("x-csrf-token", cookies.csrf!),
    put: (url: string) => request(app.getHttpServer()).put(url).set("Cookie", cookieHeader).set("x-csrf-token", cookies.csrf!),
    patch: (url: string) => request(app.getHttpServer()).patch(url).set("Cookie", cookieHeader).set("x-csrf-token", cookies.csrf!),
  };
}

/** A minimal, structurally-valid RichTextDocument — one paragraph with one plain text run. */
function simpleBody(text: string) {
  return [{ type: "paragraph", content: [{ text }] }];
}

/**
 * Handoff 15 — CMS + Blog + Content Management e2e flows (spec Flows A-T).
 * A separate file from app.e2e-spec.ts, mirroring the Handoff 14
 * (seller-finance.e2e-spec.ts) precedent — exercises the real HTTP surface
 * end to end (admin CMS controller + public blog controller), never calling
 * services directly, so wiring mistakes (guards, permission decorators,
 * DTO whitelisting) are caught the same way a real client would hit them.
 */
describe("CMS + Blog + Content Management (Handoff 15)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let logSpy: jest.SpyInstance;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  async function setupAdmin(role: AdminRole, status: AdminMembershipStatus = AdminMembershipStatus.ACTIVE) {
    const identifier = `hf15-admin-${role.toLowerCase()}-${unique()}@example.com`;
    const client = authedRequest(app, await signUp(app, logSpy, identifier));
    const user = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });
    const adminUser = await prisma.adminUser.create({ data: { userId: user.id, role, status } });
    return { client, userId: user.id, adminUserId: adminUser.id };
  }

  async function createCategory(admin: ReturnType<typeof authedRequest>) {
    const s = unique();
    const res = await admin
      .post("/admin/content/categories")
      .send({ locales: [{ locale: "fa", name: `دسته ${s}`, slug: `cat-fa-${s}` }, { locale: "en", name: `Category ${s}`, slug: `cat-en-${s}` }] })
      .expect(201);
    return res.body.id as string;
  }

  async function createArticleDraft(admin: ReturnType<typeof authedRequest>, overrides: Partial<{ locale: "fa" | "en"; title: string; slug: string; categoryId: string }> = {}) {
    const s = unique();
    const res = await admin
      .post("/admin/content/articles")
      .send({
        locale: overrides.locale ?? "fa",
        title: overrides.title ?? `مقاله ${s}`,
        slug: overrides.slug ?? `article-${s}`,
        body: simpleBody("متن نمونه"),
        categoryId: overrides.categoryId,
      })
      .expect(201);
    return res.body as { id: string; locales: { locale: string; status: string; slug: string; title: string }[] };
  }

  // --- Flow A: editor creates draft --------------------------------------

  it("Flow A: an editor can create a draft article", async () => {
    const editor = await setupAdmin(AdminRole.EDITOR);
    const article = await createArticleDraft(editor.client);
    expect(article.locales).toHaveLength(1);
    expect(article.locales[0]!.status).toBe("DRAFT");
  });

  // --- Flow B: draft invisible publicly -----------------------------------

  it("Flow B: a DRAFT article is invisible on every public read", async () => {
    const editor = await setupAdmin(AdminRole.EDITOR);
    const article = await createArticleDraft(editor.client);
    const slug = article.locales[0]!.slug;

    await request(app.getHttpServer()).get(`/blog/articles/${slug}?locale=fa`).expect(404);
    const list = await request(app.getHttpServer()).get("/blog/articles?locale=fa").expect(200);
    expect(list.body.items.find((a: { slug: string }) => a.slug === slug)).toBeUndefined();
  });

  // --- Flow C & D: publisher publishes -> article publicly visible -------

  it("Flows C & D: an ADMIN can publish a DRAFT to VISIBLE and it becomes publicly readable", async () => {
    const editor = await setupAdmin(AdminRole.EDITOR);
    const admin = await setupAdmin(AdminRole.ADMIN);
    const article = await createArticleDraft(editor.client);
    const slug = article.locales[0]!.slug;

    const published = await admin.client.post(`/admin/content/articles/${article.id}/locales/fa/publish`).expect(201);
    expect(published.body.status).toBe("VISIBLE");
    expect(published.body.publishedAt).not.toBeNull();

    const publicArticle = await request(app.getHttpServer()).get(`/blog/articles/${slug}?locale=fa`).expect(200);
    expect(publicArticle.body.slug).toBe(slug);
    expect(publicArticle.body.title).toBe(article.locales[0]!.title);
  });

  // --- Flow E & F: Persian-only publish, English added independently -----

  it("Flows E & F: fa can publish alone, then en can be added and published independently without touching fa", async () => {
    const editor = await setupAdmin(AdminRole.EDITOR);
    const admin = await setupAdmin(AdminRole.ADMIN);
    const article = await createArticleDraft(editor.client, { locale: "fa" });
    await admin.client.post(`/admin/content/articles/${article.id}/locales/fa/publish`).expect(201);

    // fa is live, en does not exist at all yet.
    await request(app.getHttpServer()).get(`/blog/articles?locale=en`).expect(200);
    await request(app.getHttpServer()).get(`/blog/articles/${article.locales[0]!.slug}?locale=en`).expect(404);

    const s = unique();
    const enSlug = `article-en-${s}`;
    await editor.client.put(`/admin/content/articles/${article.id}/locales/en`).send({ title: `English ${s}`, slug: enSlug, body: simpleBody("English body") }).expect(200);
    await admin.client.post(`/admin/content/articles/${article.id}/locales/en/publish`).expect(201);

    const faStill = await request(app.getHttpServer()).get(`/blog/articles/${article.locales[0]!.slug}?locale=fa`).expect(200);
    expect(faStill.body.slug).toBe(article.locales[0]!.slug);
    const enNow = await request(app.getHttpServer()).get(`/blog/articles/${enSlug}?locale=en`).expect(200);
    expect(enNow.body.title).toBe(`English ${s}`);
  });

  // --- Flow G: unauthorized admin cannot publish --------------------------

  it("Flow G: an EDITOR (no content.publish) cannot publish an article", async () => {
    const editor = await setupAdmin(AdminRole.EDITOR);
    const article = await createArticleDraft(editor.client);
    const denied = await editor.client.post(`/admin/content/articles/${article.id}/locales/fa/publish`).expect(403);
    expect(denied.body.error.details.reason).toBe("INSUFFICIENT_PERMISSION");
  });

  // --- Flow H: SUPPORT cannot publish --------------------------------------

  it("Flow H: SUPPORT has no content.* permission at all", async () => {
    const support = await setupAdmin(AdminRole.SUPPORT);
    const admin = await setupAdmin(AdminRole.ADMIN);
    const editor = await setupAdmin(AdminRole.EDITOR);
    const article = await createArticleDraft(editor.client);
    await admin.client.post(`/admin/content/articles/${article.id}/locales/fa/publish`).expect(201);

    await support.client.get("/admin/content/articles").expect(403);
    await support.client.post(`/admin/content/articles/${article.id}/locales/fa/hide`).expect(403);
  });

  // --- Flow I: hidden article disappears publicly --------------------------

  it("Flow I: hiding a VISIBLE locale removes it from every public read", async () => {
    const editor = await setupAdmin(AdminRole.EDITOR);
    const admin = await setupAdmin(AdminRole.ADMIN);
    const article = await createArticleDraft(editor.client);
    const slug = article.locales[0]!.slug;
    await admin.client.post(`/admin/content/articles/${article.id}/locales/fa/publish`).expect(201);
    await request(app.getHttpServer()).get(`/blog/articles/${slug}?locale=fa`).expect(200);

    const hidden = await admin.client.post(`/admin/content/articles/${article.id}/locales/fa/hide`).expect(201);
    expect(hidden.body.status).toBe("HIDDEN");
    await request(app.getHttpServer()).get(`/blog/articles/${slug}?locale=fa`).expect(404);

    // HIDDEN -> VISIBLE is allowed (spec's exact transition table).
    const restored = await admin.client.post(`/admin/content/articles/${article.id}/locales/fa/publish`).expect(201);
    expect(restored.body.status).toBe("VISIBLE");
  });

  // --- Flow J: archived article unavailable publicly (terminal state) -----

  it("Flow J: an ARCHIVED locale is publicly unavailable and can never transition back", async () => {
    const editor = await setupAdmin(AdminRole.EDITOR);
    const admin = await setupAdmin(AdminRole.ADMIN);
    const article = await createArticleDraft(editor.client);
    const slug = article.locales[0]!.slug;
    await admin.client.post(`/admin/content/articles/${article.id}/locales/fa/publish`).expect(201);
    await admin.client.post(`/admin/content/articles/${article.id}/locales/fa/hide`).expect(201);

    const archived = await admin.client.post(`/admin/content/articles/${article.id}/locales/fa/archive`).expect(201);
    expect(archived.body.status).toBe("ARCHIVED");
    await request(app.getHttpServer()).get(`/blog/articles/${slug}?locale=fa`).expect(404);

    const rejected = await admin.client.post(`/admin/content/articles/${article.id}/locales/fa/publish`).expect(409);
    expect(rejected.body.error.code).toBe("INVALID_ARTICLE_LIFECYCLE_TRANSITION");
  });

  // --- Flow K: version history created -------------------------------------

  it("Flow K: creating and editing an article builds a recoverable version history", async () => {
    const editor = await setupAdmin(AdminRole.EDITOR);
    const article = await createArticleDraft(editor.client);
    await editor.client.put(`/admin/content/articles/${article.id}/locales/fa`).send({ title: "ویرایش دوم", slug: article.locales[0]!.slug, body: simpleBody("متن ویرایش‌شده"), changeNote: "second edit" }).expect(200);

    const versions = await editor.client.get(`/admin/content/articles/${article.id}/locales/fa/versions`).expect(200);
    expect(versions.body).toHaveLength(2);
    expect(versions.body.map((v: { versionNumber: number }) => v.versionNumber).sort()).toEqual([1, 2]);
  });

  // --- Flow L: restore creates a new version, never mutates history --------

  it("Flow L: restoring an old version creates a brand-new version and never rewrites history", async () => {
    const editor = await setupAdmin(AdminRole.EDITOR);
    const article = await createArticleDraft(editor.client, { title: "عنوان اول" });
    const originalSlug = article.locales[0]!.slug;
    await editor.client.put(`/admin/content/articles/${article.id}/locales/fa`).send({ title: "عنوان دوم", slug: originalSlug, body: simpleBody("نسخه دوم") }).expect(200);

    const versionsBefore = await editor.client.get(`/admin/content/articles/${article.id}/locales/fa/versions`).expect(200);
    const v1Id = versionsBefore.body.find((v: { versionNumber: number }) => v.versionNumber === 1).id as string;

    const restored = await editor.client.post(`/admin/content/content-versions/${v1Id}/restore`).expect(201);
    expect(restored.body.title).toBe("عنوان اول");

    const versionsAfter = await editor.client.get(`/admin/content/articles/${article.id}/locales/fa/versions`).expect(200);
    expect(versionsAfter.body).toHaveLength(3);
    // The original version 1 row itself is untouched.
    const v1Again = await editor.client.get(`/admin/content/content-versions/${v1Id}`).expect(200);
    expect(v1Again.body.snapshot.title).toBe("عنوان اول");
  });

  // --- Flow M: duplicate localized slug rejected ---------------------------

  it("Flow M: a duplicate slug within the same locale is rejected", async () => {
    const editor = await setupAdmin(AdminRole.EDITOR);
    const s = unique();
    const slug = `duplicate-slug-${s}`;
    await editor.client.post("/admin/content/articles").send({ locale: "fa", title: "اول", slug, body: simpleBody("متن") }).expect(201);
    const conflict = await editor.client.post("/admin/content/articles").send({ locale: "fa", title: "دوم", slug, body: simpleBody("متن") }).expect(409);
    expect(conflict.body.error.code).toBe("DUPLICATE_ARTICLE_SLUG");
  });

  // --- Flow N: public query excludes DRAFT ---------------------------------

  it("Flow N: the public article list only ever contains VISIBLE locales", async () => {
    const editor = await setupAdmin(AdminRole.EDITOR);
    const admin = await setupAdmin(AdminRole.ADMIN);
    const visible = await createArticleDraft(editor.client);
    const draft = await createArticleDraft(editor.client);
    await admin.client.post(`/admin/content/articles/${visible.id}/locales/fa/publish`).expect(201);

    const list = await request(app.getHttpServer()).get("/blog/articles?locale=fa&pageSize=100").expect(200);
    const slugs = list.body.items.map((a: { slug: string }) => a.slug);
    expect(slugs).toContain(visible.locales[0]!.slug);
    expect(slugs).not.toContain(draft.locales[0]!.slug);
  });

  // --- Flow O & P: preview works for authorized editor, blocked anonymously ---

  it("Flows O & P: preview (the admin locale GET) works for an authorized editor and is blocked anonymously", async () => {
    const editor = await setupAdmin(AdminRole.EDITOR);
    const article = await createArticleDraft(editor.client);

    const preview = await editor.client.get(`/admin/content/articles/${article.id}/locales/fa`).expect(200);
    expect(preview.body.status).toBe("DRAFT");
    expect(preview.body.title).toBe(article.locales[0]!.title);

    await request(app.getHttpServer()).get(`/admin/content/articles/${article.id}/locales/fa`).expect(401);
  });

  // --- Flow Q: malicious rich text sanitized --------------------------------

  it("Flow Q: an unsafe or unrecognized rich text structure is rejected, never silently stripped", async () => {
    const editor = await setupAdmin(AdminRole.EDITOR);
    const s = unique();

    const unsafeLink = await editor.client
      .post("/admin/content/articles")
      .send({ locale: "fa", title: "لینک ناامن", slug: `unsafe-link-${s}`, body: [{ type: "paragraph", content: [{ type: "link", href: "javascript:alert(1)", text: "click" }] }] })
      .expect(400);
    expect(unsafeLink.body.error.code).toBe("INVALID_RICH_TEXT_CONTENT");

    const unknownBlock = await editor.client
      .post("/admin/content/articles")
      .send({ locale: "fa", title: "بلوک ناشناخته", slug: `unknown-block-${s}`, body: [{ type: "script", content: "alert(1)" }] })
      .expect(400);
    expect(unknownBlock.body.error.code).toBe("INVALID_RICH_TEXT_CONTENT");
  });

  // --- Flow R: pagination works ---------------------------------------------

  it("Flow R: the public article list paginates deterministically", async () => {
    const editor = await setupAdmin(AdminRole.EDITOR);
    const admin = await setupAdmin(AdminRole.ADMIN);
    const category = await createCategory(admin.client);
    const slugs: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const article = await createArticleDraft(editor.client, { categoryId: category });
      await admin.client.post(`/admin/content/articles/${article.id}/locales/fa/publish`).expect(201);
      slugs.push(article.locales[0]!.slug);
    }

    const page1 = await request(app.getHttpServer()).get(`/blog/articles?locale=fa&categorySlug=${await categorySlug(category)}&page=1&pageSize=2`).expect(200);
    const page2 = await request(app.getHttpServer()).get(`/blog/articles?locale=fa&categorySlug=${await categorySlug(category)}&page=2&pageSize=2`).expect(200);
    expect(page1.body.total).toBe(5);
    expect(page1.body.items).toHaveLength(2);
    expect(page2.body.items).toHaveLength(2);
    const page1Slugs = page1.body.items.map((a: { slug: string }) => a.slug);
    const page2Slugs = page2.body.items.map((a: { slug: string }) => a.slug);
    expect(page1Slugs.some((s: string) => page2Slugs.includes(s))).toBe(false);
  });

  async function categorySlug(categoryId: string): Promise<string> {
    const row = await prisma.categoryLocale.findFirstOrThrow({ where: { categoryId, locale: "fa" } });
    return row.slug;
  }

  // --- Flow S: media access rules correct -----------------------------------

  it("Flow S: media upload/confirm requires content.media.manage, rejects bad input, and disabled media cannot be selected", async () => {
    const editor = await setupAdmin(AdminRole.EDITOR);
    const support = await setupAdmin(AdminRole.SUPPORT);

    await support.client.post("/admin/content/media/upload-url").send({ contentType: "image/jpeg" }).expect(403);

    const target = await editor.client.post("/admin/content/media/upload-url").send({ contentType: "image/jpeg" }).expect(201);
    expect(target.body.key).toMatch(/^cms\/media\//);

    // Rejected at the DTO whitelist (@IsIn) before it ever reaches AdminMediaService's own UnsupportedMediaTypeException check.
    await editor.client.post("/admin/content/media/upload-url").send({ contentType: "application/pdf" }).expect(400);

    const confirmed = await editor.client
      .post("/admin/content/media")
      .send({ key: target.body.key, url: target.body.publicUrl, mimeType: "image/jpeg", fileSizeBytes: 1024, altText: "a photo" })
      .expect(201);
    const mediaId = confirmed.body.id as string;

    const tooLarge = await editor.client.post("/admin/content/media").send({ key: target.body.key, url: target.body.publicUrl, mimeType: "image/jpeg", fileSizeBytes: 999_999_999 }).expect(400);
    expect(tooLarge.body.error.code).toBe("MEDIA_TOO_LARGE");

    await editor.client.post(`/admin/content/media/${mediaId}/disable`).expect(201);
    const article = await createArticleDraft(editor.client);
    const rejectedAttach = await editor.client.patch(`/admin/content/articles/${article.id}`).send({ coverMediaAssetId: mediaId }).expect(409);
    expect(rejectedAttach.body.error.code).toBe("MEDIA_ASSET_DISABLED");
  });

  // --- Flow T: placement update audited --------------------------------------

  it("Flow T: replacing a placement's blocks is audited and never touches Codex's own Landing rendering (no layout fields exist)", async () => {
    const admin = await setupAdmin(AdminRole.ADMIN);
    const updated = await admin.client
      .put("/admin/content/placements/LANDING_HERO")
      .send({
        blocks: [
          {
            sortOrder: 0,
            locales: [
              { locale: "fa", heading: "عنوان", body: "متن", ctaLabel: "بیشتر بدانید", ctaHref: "/blog" },
              { locale: "en", heading: "Heading", body: "Body", ctaLabel: "Learn more", ctaHref: "/blog" },
            ],
          },
        ],
      })
      .expect(200);
    expect(updated.body.blocks).toHaveLength(1);

    const publicPlacement = await request(app.getHttpServer()).get("/content/placements/LANDING_HERO?locale=fa").expect(200);
    expect(publicPlacement.body.blocks[0].heading).toBe("عنوان");

    const auditEntry = await prisma.adminAuditLog.findFirst({ where: { action: "content_placement.updated", entityType: "CONTENT_PLACEMENT" }, orderBy: { createdAt: "desc" } });
    expect(auditEntry).not.toBeNull();
    expect((auditEntry!.afterSummary as { key: string }).key).toBe("LANDING_HERO");

    // An unsafe ctaHref is rejected the same way unsafe rich text is.
    const unsafe = await admin.client
      .put("/admin/content/placements/LANDING_HERO")
      .send({ blocks: [{ sortOrder: 0, locales: [{ locale: "fa", ctaHref: "javascript:alert(1)" }] }] })
      .expect(400);
    expect(unsafe.body.error.code).toBe("INVALID_RICH_TEXT_CONTENT");
  });
});
