import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";

type Actor = { id: string; cookie: string; csrf: string };

/** ERP-F: support tags/links/attachments/SLA, dispute refund outcome through the finance workflow, queue SLA, malformed-id hardening. */
describe("ERP-F support, disputes, SLA", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const send = (m: "post" | "put" | "patch" | "delete", a: Actor, u: string) => request(server())[m](u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function actor(name: string, role?: AdminRole): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `erpf-${randomUUID()}@example.com` } });
    if (role) await db.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }
  async function supportCase(requester: Actor, agent: Actor) {
    return (await send("post", agent, "/admin/support").send({ requesterUserId: requester.id, subject: "Order arrived damaged", description: "The bag was torn.", category: "ORDER" }).expect(201)).body;
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("support: tags, validated links, SLA timestamps, reopen counting; staff/requester attachment visibility", async () => {
    const agent = await actor("agent", AdminRole.SUPPORT);
    const ro = await actor("ro", AdminRole.READ_ONLY);
    const requester = await actor("requester");
    const stranger = await actor("stranger");
    const c = await supportCase(requester, agent);

    await send("put", ro, `/admin/support/${c.id}/tags`).send({ tags: ["x"] }).expect(403);
    expect((await send("put", agent, `/admin/support/${c.id}/tags`).send({ tags: ["Damaged", "damaged ", "courier"] }).expect(200)).body.tags).toEqual(["damaged", "courier"]);
    await send("post", agent, `/admin/support/${c.id}/links`).send({ entityType: "ORDER", entityId: randomUUID() }).expect(404); // must exist
    const hh = await db.household.create({ data: { name: "h" } });
    await send("post", agent, `/admin/support/${c.id}/links`).send({ entityType: "HOUSEHOLD", entityId: hh.id }).expect(201);
    const extras = (await send("post", agent, `/admin/support/${c.id}/links`).send({ entityType: "HOUSEHOLD", entityId: hh.id }).expect(201)).body; // idempotent
    expect(extras.links).toHaveLength(1);
    expect(extras.sla).toMatchObject({ firstResponseTargetHours: 24, firstAssignedAt: null, breached: false });

    await send("patch", agent, `/admin/support/${c.id}/assign`).send({ assigneeAdminId: (await db.adminUser.findUniqueOrThrow({ where: { userId: agent.id } })).id }).expect(200);
    await send("post", agent, `/admin/support/${c.id}/messages`).send({ body: "We're on it.", visibility: "PUBLIC" }).expect(201);
    await send("patch", agent, `/admin/support/${c.id}/status`).send({ status: "RESOLVED" }).expect(200);
    await send("patch", agent, `/admin/support/${c.id}/status`).send({ status: "IN_PROGRESS" }).expect(200);
    const sla = (await get(agent, `/admin/support/${c.id}/extras`).expect(200)).body.sla;
    expect(sla.firstAssignedAt).toBeTruthy();
    expect(sla.firstResponseAt).toBeTruthy();
    expect(sla.reopenCount).toBe(1);

    // Attachments: staff INTERNAL stays internal; the requester's upload is SHARED; strangers see nothing.
    const staffKey = (await send("post", agent, `/admin/support/${c.id}/attachments/uploads`).send({ contentType: "application/pdf", fileSizeBytes: 100 }).expect(201)).body.key;
    const internal = (await send("post", agent, `/admin/support/${c.id}/attachments`).send({ objectKey: staffKey, contentType: "application/pdf", fileSizeBytes: 100 }).expect(201)).body;
    expect(internal.visibility).toBe("INTERNAL");
    const userKey = (await send("post", requester, `/support/cases/${c.id}/attachments/uploads`).send({ contentType: "image/png", fileSizeBytes: 100 }).expect(201)).body.key;
    await send("post", requester, `/support/cases/${c.id}/attachments`).send({ objectKey: staffKey.replace(c.id, randomUUID()), contentType: "image/png", fileSizeBytes: 100 }).expect(400);
    const shared = (await send("post", requester, `/support/cases/${c.id}/attachments`).send({ objectKey: userKey, contentType: "image/png", fileSizeBytes: 100, visibility: "INTERNAL" }).expect(201)).body;
    expect(shared.visibility).toBe("SHARED");
    expect((await get(requester, `/support/cases/${c.id}/attachments`).expect(200)).body.map((a: { id: string }) => a.id)).toEqual([shared.id]);
    await send("post", requester, `/support/cases/${c.id}/attachments/${internal.id}/download`).expect(404);
    await send("post", requester, `/support/cases/${c.id}/attachments/${shared.id}/download`).expect(201);
    await get(stranger, `/support/cases/${c.id}/attachments`).expect(404);
    await send("post", stranger, `/support/cases/${c.id}/attachments/uploads`).send({ contentType: "image/png", fileSizeBytes: 100 }).expect(404);
    await send("post", agent, `/admin/support/${c.id}/attachments/${internal.id}/download`).expect(201);
    expect(await db.adminAuditLog.count({ where: { entityId: c.id, action: { in: ["support_case.tags_changed", "support_case.linked", "support_case.attachment_added", "support_case.attachment_opened"] } } })).toBe(4);
  });

  it("dispute refund outcome goes through the refund approval workflow; queue SLA metrics; malformed ids are 400 not 500", async () => {
    const admin = await actor("admin", AdminRole.ADMIN);
    const support = await actor("support", AdminRole.SUPPORT);
    const buyer = await actor("buyer");
    const seller = await db.sellerOrganization.create({ data: { name: `ERP-F S ${randomUUID().slice(0, 6)}`, verificationStatus: "VERIFIED", status: "ACTIVE", countryCode: "IR" } });
    const order = await db.order.create({ data: { userId: buyer.id, sellerOrganizationId: seller.id, status: "CONFIRMED", subtotalAmount: 300_000, deliveryAmount: 0, discountAmount: 0, totalAmount: 300_000, currency: "IRR", shippingAddressSnapshot: {} } });
    const dispute = (await send("post", admin, "/admin/disputes").send({ subjectType: "ORDER", subjectId: order.id, raisedByUserId: buyer.id, claim: "Never delivered" }).expect(201)).body;
    await send("post", support, `/admin/disputes/${dispute.id}/refund-outcome`).send({ amount: 100_000, reason: "carrier lost it" }).expect(403);
    expect((await send("post", admin, `/admin/disputes/${dispute.id}/refund-outcome`).send({ amount: 100_000, reason: "carrier lost it" }).expect(400)).body.error.details.reason).toBe("INVALID_TRANSITION"); // still OPEN
    await send("patch", admin, `/admin/disputes/${dispute.id}/status`).send({ status: "UNDER_REVIEW" }).expect(200);
    expect((await send("post", admin, `/admin/disputes/${dispute.id}/refund-outcome`).send({ amount: 999_999, reason: "carrier lost it" }).expect(400)).body.error.details.reason).toBe("EXCEEDS_ORDER_TOTAL");
    const outcome = (await send("post", admin, `/admin/disputes/${dispute.id}/refund-outcome`).send({ amount: 100_000, reason: "carrier lost it" }).expect(201)).body;
    expect(outcome).toMatchObject({ status: "RESOLVED_CUSTOMER", lifecycle: "RESOLVED_USER", refundApproval: { status: "REQUESTED", amount: 100_000, orderId: order.id } });
    expect(await db.refund.count({ where: { orderId: order.id } })).toBe(0); // nothing moved yet — approval/execution are separate steps
    expect((await send("post", admin, `/admin/disputes/${dispute.id}/refund-outcome`).send({ amount: 100_000, reason: "again again" }).expect(400)).body.error.details.reason).toBe("INVALID_TRANSITION");

    const sla = (await get(support, "/admin/queues/sla?days=7").expect(200)).body;
    expect(sla).toHaveProperty("support.firstResponseTargetHours");
    expect(sla).toHaveProperty("verification.pending");
    expect(sla).toHaveProperty("tasks.overdue");
    await get(buyer, "/admin/queues/sla").expect(403);

    // Global hardening: a malformed id on a route without ParseUUIDPipe is a 400, never a 500.
    expect((await get(admin, "/admin/disputes/not-a-uuid").expect(400)).body.error.details.reason).toBe("INVALID_ID");
    await get(buyer, "/support/cases/not-a-uuid").expect(400);
  });
});
