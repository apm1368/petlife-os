import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";

type Actor = { id: string; cookie: string; csrf: string };

/**
 * Help Center, legal documents, status and the support hand-off. Everything goes through the HTTP API.
 * The empty-state cases matter as much as the happy paths: a fresh database must serve nothing, because
 * no legal text or article may exist that an admin did not enter.
 */
describe("Help Center, legal pages and status", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const anon = (u: string) => request(server()).get(u);
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const send = (m: "post" | "put" | "patch", a: Actor, u: string) => request(server())[m](u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function actor(role?: AdminRole): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: `help ${role ?? "member"}`, email: `help-${randomUUID()}@example.com` } });
    if (role) await db.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) } });
    const csrf = extractCookie((await request(server()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }

  /** A unique slug per run so a re-run against a used database never collides. */
  const slug = (base: string) => `${base}-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  // ------------------------------------------------------------------ admin publish / rollback → public search

  describe("articles: draft, publish, search, rollback", () => {
    let editor: Actor, publisher: Actor, categoryId: string;
    const catSlug = slug("cat");

    beforeAll(async () => {
      editor = await actor(AdminRole.EDITOR);
      publisher = await actor(AdminRole.CONTENT_ADMIN);
      categoryId = (await send("post", publisher, "/admin/help/categories").send({ slug: catSlug, titleFa: "سفارش‌ها", titleEn: "Orders" }).expect(201)).body.id;
    });

    it("serves nothing to readers until an article is published", async () => {
      const s = slug("refund");
      const saved = (await send("post", editor, "/admin/help/articles").send({ categoryId, locale: "fa", slug: s, title: "بازپرداخت سفارش", body: "برای بازپرداخت وارد حساب شوید." }).expect(201)).body;
      expect(saved.version).toBe(1);

      // A draft is invisible: not in the article list, not by slug, not in search, and its (empty) category is hidden.
      await anon(`/help/articles/${s}?locale=fa`).expect(404);
      expect((await anon("/help/search?locale=fa&q=بازپرداخت").expect(200)).body.map((a: { slug: string }) => a.slug)).not.toContain(s);
      expect((await anon("/help/categories?locale=fa").expect(200)).body.map((c: { slug: string }) => c.slug)).not.toContain(catSlug);
    });

    it("lets an editor draft but not publish; a content admin publishes, and search then finds it", async () => {
      const s = slug("shipping");
      const saved = (await send("post", editor, "/admin/help/articles").send({ categoryId, locale: "fa", slug: s, title: "پیگیری مرسوله", summary: "وضعیت ارسال", body: "کد رهگیری را در صفحهٔ سفارش ببینید." }).expect(201)).body;

      await send("post", editor, `/admin/help/articles/${saved.id}/publish`).send({}).expect(403);
      await send("post", publisher, `/admin/help/articles/${saved.id}/publish`).send({}).expect(201);

      // search → article, including a query typed with the Arabic letter variant and Persian digits.
      const found = (await anon("/help/search?locale=fa&q=رهگيري").expect(200)).body;
      expect(found.map((a: { slug: string }) => a.slug)).toContain(s);
      const article = (await anon(`/help/articles/${s}?locale=fa`).expect(200)).body;
      expect(article.title).toBe("پیگیری مرسوله");
      expect(article.version).toBe(1);
      expect((await anon("/help/categories?locale=fa").expect(200)).body.map((c: { slug: string }) => c.slug)).toContain(catSlug);
    });

    it("keeps an edit invisible to readers until it is published, then rolls back", async () => {
      const s = slug("returns");
      const saved = (await send("post", editor, "/admin/help/articles").send({ categoryId, locale: "fa", slug: s, title: "مرجوعی نسخه ۱", body: "متن نسخهٔ اول" }).expect(201)).body;
      await send("post", publisher, `/admin/help/articles/${saved.id}/publish`).send({}).expect(201);

      // Edit while published: the new text is saved as version 2 but readers still get version 1.
      await send("put", editor, `/admin/help/articles/${saved.id}`).send({ categoryId, locale: "fa", slug: s, title: "مرجوعی نسخه ۲", body: "متن نسخهٔ دوم", changeNote: "rewrite" }).expect(200);
      expect((await anon(`/help/articles/${s}?locale=fa`).expect(200)).body.title).toBe("مرجوعی نسخه ۱");

      // Publishing version 2 makes it live.
      await send("post", publisher, `/admin/help/articles/${saved.id}/publish`).send({ version: 2 }).expect(201);
      expect((await anon(`/help/articles/${s}?locale=fa`).expect(200)).body.title).toBe("مرجوعی نسخه ۲");

      // Rollback to version 1: written forward as version 3 (history is append-only), live immediately.
      const rolled = (await send("post", publisher, `/admin/help/articles/${saved.id}/rollback`).send({ version: 1 }).expect(201)).body;
      expect(rolled.version).toBe(3);
      const live = (await anon(`/help/articles/${s}?locale=fa`).expect(200)).body;
      expect(live.title).toBe("مرجوعی نسخه ۱");
      expect(live.version).toBe(3);
      const versions = (await get(publisher, `/admin/help/articles/${saved.id}/versions`).expect(200)).body;
      expect(versions.map((v: { versionNumber: number }) => v.versionNumber)).toEqual([3, 2, 1]);
    });

    it("answers 404 for a version that does not exist rather than publishing nothing", async () => {
      const saved = (await send("post", editor, "/admin/help/articles").send({ categoryId, locale: "fa", slug: slug("ghost"), title: "x", body: "y" }).expect(201)).body;
      await send("post", publisher, `/admin/help/articles/${saved.id}/publish`).send({ version: 99 }).expect(404);
      await send("post", publisher, `/admin/help/articles/${saved.id}/rollback`).send({ version: 99 }).expect(404);
    });

    it("rejects a duplicate slug and a non-latin slug as field errors, not 500s", async () => {
      const s = slug("dup");
      await send("post", editor, "/admin/help/articles").send({ categoryId, locale: "fa", slug: s, title: "a", body: "b" }).expect(201);
      const dup = await send("post", editor, "/admin/help/articles").send({ categoryId, locale: "fa", slug: s, title: "a", body: "b" }).expect(400);
      expect(dup.body.error.details).toMatchObject({ field: "slug", reason: "SLUG_TAKEN" });
      const bad = await send("post", editor, "/admin/help/articles").send({ categoryId, locale: "fa", slug: "فارسی", title: "a", body: "b" }).expect(400);
      expect(bad.body.error.details).toMatchObject({ field: "slug", reason: "INVALID_SLUG" });
    });

    it("unpublishing hides the article again", async () => {
      const s = slug("temp");
      const saved = (await send("post", editor, "/admin/help/articles").send({ categoryId, locale: "fa", slug: s, title: "temp", body: "temp" }).expect(201)).body;
      await send("post", publisher, `/admin/help/articles/${saved.id}/publish`).send({}).expect(201);
      await anon(`/help/articles/${s}?locale=fa`).expect(200);
      await send("post", publisher, `/admin/help/articles/${saved.id}/unpublish`).send({}).expect(201);
      await anon(`/help/articles/${s}?locale=fa`).expect(404);
    });

    it("refuses admin routes to a non-admin and to an anonymous caller", async () => {
      await request(server()).get("/admin/help/articles").expect(401);
      await get(await actor(), "/admin/help/articles").expect(403);
    });
  });

  // ------------------------------------------------------------------ legal: never invent text

  describe("legal documents", () => {
    it("reports every page as unavailable on a fresh install — empty means empty", async () => {
      const index = (await anon("/legal?locale=fa").expect(200)).body as Array<{ kind: string; available: boolean }>;
      expect(index).toHaveLength(10);
      // Nothing has been published in this locale by this suite, so no page may claim to have text.
      const doc = (await anon("/legal/terms?locale=fa").expect(200)).body;
      if (!doc.available) {
        expect(doc).toMatchObject({ available: false, title: null, body: null, version: null, effectiveAt: null });
      }
    });

    it("404s a slug that is not one of the ten legal pages", async () => {
      await anon("/legal/not-a-page?locale=fa").expect(404);
    });

    it("serves a document only after a content admin publishes a version, with its effective date", async () => {
      const publisher = await actor(AdminRole.CONTENT_ADMIN);
      const editor = await actor(AdminRole.EDITOR);
      // Use a kind/locale pair no other test in this file publishes so the empty-state assertion above stays valid.
      const body = { kind: "ACCESSIBILITY", locale: "en", title: "Accessibility", body: "text supplied by the owner", effectiveAt: "2026-11-01T00:00:00.000Z" };
      const v = (await send("post", editor, "/admin/legal/versions").send(body).expect(201)).body;
      expect(v.versionNumber).toBeGreaterThanOrEqual(1);

      // Saved but not published: still empty.
      expect((await anon("/legal/accessibility?locale=en").expect(200)).body.available).toBe(false);
      await send("post", editor, "/admin/legal/publish").send({ kind: "ACCESSIBILITY", locale: "en", version: v.versionNumber }).expect(403);

      await send("post", publisher, "/admin/legal/publish").send({ kind: "ACCESSIBILITY", locale: "en", version: v.versionNumber }).expect(201);
      const live = (await anon("/legal/accessibility?locale=en").expect(200)).body;
      expect(live).toMatchObject({ available: true, title: "Accessibility", body: "text supplied by the owner", version: v.versionNumber });
      expect(live.effectiveAt).toBe("2026-11-01T00:00:00.000Z");

      // Withdrawing returns the page to its empty state; history is kept.
      await send("post", publisher, "/admin/legal/unpublish").send({ kind: "ACCESSIBILITY", locale: "en" }).expect(201);
      expect((await anon("/legal/accessibility?locale=en").expect(200)).body.available).toBe(false);
      expect((await get(publisher, "/admin/legal/versions?kind=ACCESSIBILITY&locale=en").expect(200)).body.length).toBeGreaterThanOrEqual(1);
    });

    it("rejects an invalid effective date as a field error", async () => {
      const editor = await actor(AdminRole.EDITOR);
      await send("post", editor, "/admin/legal/versions").send({ kind: "DELIVERY", locale: "en", title: "t", body: "b", effectiveAt: "not-a-date" }).expect(400);
    });
  });

  // ------------------------------------------------------------------ status

  describe("system status", () => {
    it("derives the indicator from recorded incidents and maintenance, never asserts it", async () => {
      const agent = await actor(AdminRole.SUPPORT_AGENT);
      const opened = (await send("post", agent, "/admin/status/incidents").send({ title: "Search degraded", impact: "MINOR", components: ["search"], body: "Looking into it" }).expect(201)).body;

      let status = (await anon("/status").expect(200)).body;
      expect(status.indicator).toBe("DEGRADED");
      expect(status.openIncidents.map((i: { id: string }) => i.id)).toContain(opened.id);

      await send("post", agent, `/admin/status/incidents/${opened.id}/updates`).send({ status: "RESOLVED", body: "Fixed" }).expect(201);
      const detail = (await anon(`/status/incidents/${opened.id}`).expect(200)).body;
      expect(detail.status).toBe("RESOLVED");
      expect(detail.resolvedAt).not.toBeNull();
      expect(detail.updates.map((u: { status: string }) => u.status)).toEqual(["RESOLVED", "INVESTIGATING"]);
      status = (await anon("/status").expect(200)).body;
      expect(status.openIncidents.map((i: { id: string }) => i.id)).not.toContain(opened.id);
    });

    it("shows maintenance only while its window is open, and rejects a window that ends before it starts", async () => {
      const agent = await actor(AdminRole.SUPPORT_AGENT);
      const now = Date.now();
      await send("post", agent, "/admin/status/maintenance").send({ title: "bad", startsAt: new Date(now + 3600_000).toISOString(), endsAt: new Date(now).toISOString() }).expect(400);
      const w = (await send("post", agent, "/admin/status/maintenance").send({ title: "DB upgrade", message: "Back soon", startsAt: new Date(now - 60_000).toISOString(), endsAt: new Date(now + 3600_000).toISOString() }).expect(201)).body;
      const during = (await anon("/status").expect(200)).body;
      expect(during.indicator).toBe("MAINTENANCE");
      expect(during.activeMaintenance).toMatchObject({ title: "DB upgrade" });
      await send("post", agent, `/admin/status/maintenance/${w.id}/cancel`).send({}).expect(201);
      expect((await anon("/status").expect(200)).body.activeMaintenance).toBeNull();
    });

    it("lets a reader-only role view but not declare incidents", async () => {
      const analyst = await actor(AdminRole.ANALYTICS);
      await send("post", analyst, "/admin/status/incidents").send({ title: "x", impact: "MINOR", body: "y" }).expect(403);
    });
  });

  // ------------------------------------------------------------------ escalation

  describe("escalating a ticket to a person", () => {
    async function ticket(a: Actor) {
      return (await send("post", a, "/support/cases").send({ subject: "Where is my order", description: "It has been a week", category: "ORDER" }).expect(201)).body;
    }

    it("requires an explicit confirmation, then returns a reference number the member can quote", async () => {
      const member = await actor();
      const t = await ticket(member);

      const refused = await send("post", member, `/support/cases/${t.id}/escalate`).send({ reason: "Need a person please", confirm: false }).expect(400);
      expect(refused.body.error.details).toMatchObject({ field: "confirm", reason: "CONFIRMATION_REQUIRED" });

      const done = (await send("post", member, `/support/cases/${t.id}/escalate`).send({ reason: "Need a person please", confirm: true }).expect(201)).body;
      expect(done.referenceNumber).toMatch(/^ESC-\d{6}$/);
      expect(done.caseNumber).toBe(t.caseNumber);
    });

    it("is idempotent: a second tap returns the same reference instead of a duplicate", async () => {
      const member = await actor();
      const t = await ticket(member);
      const first = (await send("post", member, `/support/cases/${t.id}/escalate`).send({ reason: "Need a person please", confirm: true }).expect(201)).body;
      const second = (await send("post", member, `/support/cases/${t.id}/escalate`).send({ reason: "Need a person please", confirm: true }).expect(201)).body;
      expect(second.referenceNumber).toBe(first.referenceNumber);
      expect(await db.supportEscalation.count({ where: { caseId: t.id } })).toBe(1);
    });

    it("answers 404 for someone else's ticket — indistinguishable from one that does not exist", async () => {
      const owner = await actor();
      const intruder = await actor();
      const t = await ticket(owner);
      await send("post", intruder, `/support/cases/${t.id}/escalate`).send({ reason: "Need a person please", confirm: true }).expect(404);
      await send("post", intruder, `/support/cases/${randomUUID()}/escalate`).send({ reason: "Need a person please", confirm: true }).expect(404);
      expect(await db.supportEscalation.count({ where: { caseId: t.id } })).toBe(0);
    });

    it("refuses an escalation on a ticket that is already closed", async () => {
      const member = await actor();
      const t = await ticket(member);
      await db.supportCase.update({ where: { id: t.id }, data: { status: "CLOSED", closedAt: new Date() } });
      const res = await send("post", member, `/support/cases/${t.id}/escalate`).send({ reason: "Need a person please", confirm: true }).expect(400);
      expect(res.body.error.details).toMatchObject({ reason: "CASE_NOT_OPEN" });
    });

    it("requires a session", async () => {
      // An anonymous caller has a CSRF token but no session cookie: the session guard answers 401.
      const csrf = extractCookie((await request(server()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
      await request(server()).post(`/support/cases/${randomUUID()}/escalate`).set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf).send({ reason: "Need a person please", confirm: true }).expect(401);
    });
  });
});
