import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole, ProviderUserRole, SellerMembershipRole, SellerMembershipStatus } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";

type Actor = { id: string; cookie: string; csrf: string };
type Row = { id: string };

/**
 * Partner support: a provider or shop team opens cases from its own panel.
 * The case belongs to the business (managers see the team's cases, other
 * members their own), never shows in anyone's personal support centre, and
 * reaches admin support under Partners with the business named.
 */
describe("partner support from the provider and shop panels", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const send = (m: "post" | "patch", a: Actor, u: string) => request(server())[m](u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);
  const ids = (rows: Row[]) => rows.map((r) => r.id).sort();

  async function actor(name: string, role?: AdminRole): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `psup-${randomUUID()}@example.com` } });
    if (role) await db.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }

  async function eventually<T>(read: () => Promise<T | null>, timeoutMs = 5000): Promise<T | null> {
    const until = Date.now() + timeoutMs;
    for (;;) {
      const value = await read();
      if (value || Date.now() > until) return value;
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("provider: the owner follows every case, staff their own; personal support stays personal; admin sees it under Partners", async () => {
    const owner = await actor("Clinic Owner");
    const staff = await actor("Clinic Staff");
    const outsider = await actor("Not On The Team");
    const agent = await actor("Support Agent", AdminRole.SUPPORT);
    // Still in verification on purpose: support must be reachable before KYC is done.
    const org = await db.providerOrganization.create({ data: { name: `PS Clinic ${randomUUID().slice(0, 6)}`, type: "VET_CLINIC" } });
    await db.providerUser.create({ data: { userId: owner.id, providerOrganizationId: org.id, role: ProviderUserRole.OWNER } });
    await db.providerUser.create({ data: { userId: staff.id, providerOrganizationId: org.id, role: ProviderUserRole.STAFF } });

    const byOwner = (await send("post", owner, "/provider/support/cases").send({ subject: "Payout missing", description: "Last week's payout did not arrive.", category: "PAYMENT" }).expect(201)).body;
    expect(byOwner).toMatchObject({ status: "SUBMITTED", category: "PAYMENT", openedBy: { id: owner.id, isMe: true }, organization: { type: "PROVIDER", id: org.id, name: org.name } });
    const byStaff = (await send("post", staff, "/provider/support/cases").send({ subject: "Calendar sync", description: "Slots do not show.", category: "PROVIDER" }).expect(201)).body;
    // Consumer-only topics and missing text are refused.
    await send("post", staff, "/provider/support/cases").send({ subject: "x", description: "y", category: "TRUST_SAFETY" }).expect(400);
    await send("post", staff, "/provider/support/cases").send({ subject: "", description: "y", category: "OTHER" }).expect(400);

    expect(ids((await get(owner, "/provider/support/cases").expect(200)).body.items)).toEqual(ids([byOwner, byStaff]));
    const staffList = (await get(staff, "/provider/support/cases").expect(200)).body.items;
    expect(ids(staffList)).toEqual([byStaff.id]);
    expect(staffList[0].openedBy).toMatchObject({ isMe: true, displayName: "Clinic Staff" });
    await get(staff, `/provider/support/cases/${byOwner.id}`).expect(404);
    await send("post", staff, `/provider/support/cases/${byOwner.id}/messages`).send({ body: "peek" }).expect(404);
    await get(outsider, "/provider/support/cases").expect(403);

    // A business case never shows in the personal support centre, not even to whoever wrote it.
    expect((await get(owner, "/support/cases").expect(200)).body.items).toEqual([]);
    await get(owner, `/support/cases/${byOwner.id}`).expect(404);
    await send("post", owner, `/support/cases/${byOwner.id}/messages`).send({ body: "via personal" }).expect(404);

    // Admin: one business's cases, with the business named; the personal tab leaves them out.
    const forOrg = (await get(agent, `/admin/support?requesterKind=PROVIDER&requesterOrgId=${org.id}`).expect(200)).body.items;
    expect(ids(forOrg)).toEqual(ids([byOwner, byStaff]));
    expect(forOrg[0].requesterOrganization).toEqual({ type: "PROVIDER", id: org.id, name: org.name });
    expect((await get(agent, `/admin/support?requesterKind=PERSONAL&search=${byOwner.caseNumber}`).expect(200)).body.items).toEqual([]);
    expect(ids((await get(agent, `/admin/support?requesterKind=PARTNER&search=${byOwner.caseNumber}`).expect(200)).body.items)).toEqual([byOwner.id]);
    expect((await get(agent, `/admin/support?requesterKind=SELLER&requesterOrgId=${org.id}`).expect(200)).body.items).toEqual([]);
    await get(agent, "/admin/support?requesterKind=EVERYONE").expect(400);
    expect((await get(agent, `/admin/support/${byStaff.id}`).expect(200)).body.requesterOrganization).toEqual({ type: "PROVIDER", id: org.id, name: org.name });

    // Internal notes stay internal; asking for information parks the case until the team answers.
    await send("post", agent, `/admin/support/${byStaff.id}/messages`).send({ body: "Internal: check the calendar sync job", visibility: "INTERNAL" }).expect(201);
    await send("post", agent, `/admin/support/${byStaff.id}/messages`).send({ body: "Can you send a screenshot?", visibility: "PUBLIC" }).expect(201);
    await send("patch", agent, `/admin/support/${byStaff.id}/status`).send({ status: "WAITING_ON_USER" }).expect(200);
    const waiting = (await get(staff, `/provider/support/cases/${byStaff.id}`).expect(200)).body;
    expect(waiting.status).toBe("WAITING");
    expect(waiting.messages.map((m: { body: string }) => m.body)).toEqual(["Can you send a screenshot?"]);

    // The owner can answer on a teammate's case; that hands it back to the queue.
    await send("post", owner, `/provider/support/cases/${byStaff.id}/messages`).send({ body: "Owner here, screenshot attached." }).expect(201);
    expect((await get(staff, `/provider/support/cases/${byStaff.id}`).expect(200)).body.status).toBe("UNDER_REVIEW");

    // The reply notification opens the case in the provider panel.
    const note = await eventually(() => db.notification.findFirst({ where: { userId: staff.id, type: "support.message_posted", entityId: byStaff.id } }));
    expect(note?.deepLink).toBe(`/provider/support/${byStaff.id}`);

    await send("patch", agent, `/admin/support/${byStaff.id}/status`).send({ status: "RESOLVED" }).expect(200);
    expect((await send("post", staff, `/provider/support/cases/${byStaff.id}/reopen`).expect(201)).body.status).toBe("SUBMITTED");
    await send("post", staff, `/provider/support/cases/${byOwner.id}/reopen`).expect(404);
  });

  it("shop: owner, admins and the support role follow every case; the path names the shop; a suspended shop can still ask", async () => {
    const owner = await actor("Shop Owner");
    const supportMember = await actor("Shop Support");
    const viewer = await actor("Shop Viewer");
    const otherOwner = await actor("Other Shop Owner");
    const agent = await actor("Support Agent 2", AdminRole.SUPPORT);
    const shop = await db.sellerOrganization.create({ data: { name: `PS Shop ${randomUUID().slice(0, 6)}`, status: "SUSPENDED", verificationStatus: "VERIFIED", countryCode: "IR" } });
    const other = await db.sellerOrganization.create({ data: { name: `PS Other ${randomUUID().slice(0, 6)}`, status: "ACTIVE", verificationStatus: "VERIFIED", countryCode: "IR" } });
    for (const [user, role, org] of [[owner, SellerMembershipRole.OWNER, shop], [supportMember, SellerMembershipRole.SUPPORT, shop], [viewer, SellerMembershipRole.VIEWER, shop], [otherOwner, SellerMembershipRole.OWNER, other]] as const) {
      await db.sellerMembership.create({ data: { userId: user.id, sellerOrganizationId: org.id, role, status: SellerMembershipStatus.ACTIVE, acceptedAt: new Date() } });
    }
    const base = `/seller-organizations/${shop.id}/support/cases`;

    const byViewer = (await send("post", viewer, base).send({ subject: "Why suspended?", description: "Our shop was suspended this morning.", category: "SELLER" }).expect(201)).body;
    expect(byViewer.organization).toEqual({ type: "SELLER", id: shop.id, name: shop.name });
    const byOwner = (await send("post", owner, base).send({ subject: "Order stuck", description: "Order is stuck in packing.", category: "ORDER" }).expect(201)).body;

    expect(ids((await get(supportMember, base).expect(200)).body.items)).toEqual(ids([byViewer, byOwner]));
    expect(ids((await get(viewer, base).expect(200)).body.items)).toEqual([byViewer.id]);
    await get(viewer, `${base}/${byOwner.id}`).expect(404);
    await get(otherOwner, base).expect(403);
    // Another shop's path never reaches this shop's cases.
    await get(otherOwner, `/seller-organizations/${other.id}/support/cases/${byViewer.id}`).expect(404);
    expect((await get(otherOwner, `/seller-organizations/${other.id}/support/cases`).expect(200)).body.items).toEqual([]);

    const shops = (await get(agent, `/admin/support?requesterKind=SELLER&requesterOrgId=${shop.id}`).expect(200)).body.items;
    expect(ids(shops)).toEqual(ids([byViewer, byOwner]));
    expect(shops[0].requesterOrganization).toEqual({ type: "SELLER", id: shop.id, name: shop.name });

    await send("post", agent, `/admin/support/${byViewer.id}/messages`).send({ body: "We are reviewing the suspension.", visibility: "PUBLIC" }).expect(201);
    const note = await eventually(() => db.notification.findFirst({ where: { userId: viewer.id, type: "support.message_posted", entityId: byViewer.id } }));
    expect(note?.deepLink).toBe(`/seller/support/${byViewer.id}`);
    // The support role answers for the shop.
    await send("post", supportMember, `${base}/${byViewer.id}/messages`).send({ body: "Thanks, here is our licence." }).expect(201);
    const thread = (await get(viewer, `${base}/${byViewer.id}`).expect(200)).body.messages;
    expect(thread.map((m: { body: string; author: { displayName: string } | null }) => [m.body, m.author?.displayName])).toEqual([
      ["We are reviewing the suspension.", "Support Agent 2"],
      ["Thanks, here is our licence.", "Shop Support"],
    ]);
  });

  it("a personal case keeps its personal deep link and stays out of the Partners tab", async () => {
    const person = await actor("Pet Owner");
    const agent = await actor("Support Agent 3", AdminRole.SUPPORT);
    const mine = (await send("post", person, "/support/cases").send({ subject: "Login", description: "Cannot sign in.", category: "ACCOUNT" }).expect(201)).body;
    expect((await get(agent, `/admin/support?requesterKind=PARTNER&search=${mine.caseNumber}`).expect(200)).body.items).toEqual([]);
    const personal = (await get(agent, `/admin/support?requesterKind=PERSONAL&search=${mine.caseNumber}`).expect(200)).body.items;
    expect(personal).toHaveLength(1);
    expect(personal[0].requesterOrganization).toBeNull();
    await send("post", agent, `/admin/support/${mine.id}/messages`).send({ body: "Try resetting your password.", visibility: "PUBLIC" }).expect(201);
    const note = await eventually(() => db.notification.findFirst({ where: { userId: person.id, type: "support.message_posted", entityId: mine.id } }));
    expect(note?.deepLink).toBe(`/support/tickets/${mine.id}`);
  });
});
