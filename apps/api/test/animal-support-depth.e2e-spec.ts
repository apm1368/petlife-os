import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { DonationService } from "../src/modules/animal-support/donation.service";

type Actor = { id: string; cookie: string; csrf: string };

/** G16: update media + pagination, stored milestones (single emission, chain #5), anonymous activity, volunteer transitions, follower notifications. */
describe("Animal support depth", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor | null, u: string) => (a ? request(server()).get(u).set("Cookie", a.cookie) : request(server()).get(u));
  const send = (m: "post" | "delete", a: Actor, u: string) => request(server())[m](u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function actor(name: string): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `g16-${randomUUID()}@example.com` } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }
  async function org(status: "PUBLISHED" | "PENDING_REVIEW" = "PUBLISHED") {
    const manager = await actor("manager");
    const o = await db.animalSupportOrganization.create({ data: { type: "SHELTER", name: `Shelter ${randomUUID().slice(0, 6)}`, verificationStatus: "VERIFIED", isPubliclyListed: true } });
    await db.animalSupportOrgMembership.create({ data: { organizationId: o.id, userId: manager.id, role: "OWNER" } });
    const campaign = await db.supportCampaign.create({ data: { organizationId: o.id, title: "Care fund", description: "x", status: "ACTIVE" } });
    const listing = await db.supportNeedListing.create({ data: { organizationId: o.id, campaignId: campaign.id, title: `Need ${randomUUID().slice(0, 4)}`, description: "x", category: "VETERINARY_CARE", contactMode: "BOTH", status, province: "Tehran", city: "Tehran", publishedAt: status === "PUBLISHED" ? new Date() : null, targetAmountIrr: 10_000_000 } });
    return { manager, orgId: o.id, campaignId: campaign.id, listingId: listing.id };
  }

  beforeAll(async () => {
    app = await createTestApp();
    // Concurrent requests below: listen once on an ephemeral port (supertest's per-request listen() races → ECONNRESET).
    await app.listen(0);
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("updates: managers only, own uploaded images only, cursor pagination, hidden needs unreadable", async () => {
    const o = await org();
    const other = await org();
    const key = `support-need-images/${o.manager.id}/${randomUUID()}.jpg`;
    await send("post", other.manager, `/animal-support/needs/${o.listingId}/updates`).send({ body: "cross-org" }).expect(403);
    await send("post", o.manager, `/animal-support/needs/${o.listingId}/updates`).send({ body: "x", mediaObjectKeys: ["https://evil.example/a.jpg"] }).expect(400);
    await send("post", o.manager, `/animal-support/needs/${o.listingId}/updates`).send({ body: "x", mediaObjectKeys: [`support-need-images/${other.manager.id}/${randomUUID()}.jpg`] }).expect(400);
    const withMedia = (await send("post", o.manager, `/animal-support/needs/${o.listingId}/updates`).send({ body: "Photo update", mediaObjectKeys: [key] }).expect(201)).body;
    expect(withMedia.mediaObjectKeys).toEqual([key]);
    expect(withMedia.mediaUrls).toHaveLength(1);
    for (let i = 0; i < 4; i++) await send("post", o.manager, `/animal-support/needs/${o.listingId}/updates`).send({ body: `Update ${i}` }).expect(201);
    const p1 = (await get(null, `/animal-support/needs/${o.listingId}/updates?limit=2`).expect(200)).body;
    expect(p1.items.map((u: { body: string }) => u.body)).toEqual(["Update 3", "Update 2"]);
    const p2 = (await get(null, `/animal-support/needs/${o.listingId}/updates?limit=2&cursor=${p1.nextCursor}`).expect(200)).body;
    const p3 = (await get(null, `/animal-support/needs/${o.listingId}/updates?limit=2&cursor=${p2.nextCursor}`).expect(200)).body;
    expect([...p2.items, ...p3.items].map((u: { body: string }) => u.body)).toEqual(["Update 1", "Update 0", "Photo update"]);
    expect(p3.nextCursor).toBeNull();
    await db.supportNeedListing.update({ where: { id: o.listingId }, data: { status: "REMOVED" } });
    await get(null, `/animal-support/needs/${o.listingId}/updates`).expect(404);
    await get(null, `/animal-support/needs/${o.listingId}/activity`).expect(404);
  });

  it("chain #5: concurrent donations record each milestone once; major ones notify followers/donors once; activity stays anonymous", async () => {
    const o = await org();
    const follower = await actor("follower");
    const donors = await Promise.all([actor("d1"), actor("d2"), actor("d3")]);
    await send("post", follower, `/animal-support/organizations/${o.orgId}/follow`).expect(201);
    await send("post", follower, `/animal-support/organizations/${o.orgId}/follow`).expect(201); // idempotent
    const donations = app.get(DonationService);
    await Promise.all(donors.map((d) => donations.donate(o.campaignId, d.id, { amountIrr: 3_000_000, supportNeedListingId: o.listingId, idempotencyKey: randomUUID() })));
    await donations.donate(o.campaignId, donors[0]!.id, { amountIrr: 1_000_000, supportNeedListingId: o.listingId, idempotencyKey: randomUUID() });
    const rows = await db.supportNeedMilestone.findMany({ where: { listingId: o.listingId } });
    expect(rows.map((r) => r.key).sort()).toEqual(["FUNDING_100", "FUNDING_25", "FUNDING_50", "FUNDING_75"]);
    expect(await db.domainEvent.count({ where: { type: "SupportNeedMilestoneReached", aggregateId: o.listingId } })).toBe(4);
    // Reading reconciles but never re-emits.
    await get(null, `/animal-support/needs/${o.listingId}/milestones`).expect(200);
    expect(await db.domainEvent.count({ where: { type: "SupportNeedMilestoneReached", aggregateId: o.listingId } })).toBe(4);
    // Major milestones only (50 %, 100 %): the follower gets both, once each. A donor gets each milestone at most once —
    // one whose donation committed after 50 % was recorded wasn't a donor yet then, so they may only get 100 %.
    expect(await db.notification.count({ where: { userId: follower.id, type: "animal_support.milestone" } })).toBe(2);
    for (const d of donors) {
      const rows = await db.notification.findMany({ where: { userId: d.id, type: "animal_support.milestone" }, select: { entityId: true } });
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(new Set(rows.map((r) => r.entityId)).size).toBe(rows.length);
      expect(rows.map((r) => r.entityId)).toContain(`${o.listingId}:FUNDING_100`);
    }
    expect(await db.notification.count({ where: { userId: o.manager.id, type: "animal_support.milestone" } })).toBe(0);

    await send("post", o.manager, `/animal-support/needs/${o.listingId}/updates`).send({ body: "Thank you" }).expect(201);
    const activity = (await get(null, `/animal-support/needs/${o.listingId}/activity`).expect(200)).body;
    expect(activity.map((a: { kind: string }) => a.kind)).toEqual(expect.arrayContaining(["NEED_PUBLISHED", "MILESTONE", "UPDATE_POSTED"]));
    const text = JSON.stringify(activity);
    for (const d of donors) expect(text).not.toContain(d.id);
    expect(text).not.toContain("@example.com");
  });

  it("new need: followers hear once on first publication only", async () => {
    const o = await org("PENDING_REVIEW");
    const follower = await actor("follower");
    await send("post", follower, `/animal-support/organizations/${o.orgId}/follow`).expect(201);
    const admin = await actor("admin");
    await db.adminUser.create({ data: { userId: admin.id, role: AdminRole.SUPER_ADMIN, status: AdminMembershipStatus.ACTIVE } });
    await send("post", admin, `/admin/animal-support/needs/${o.listingId}/review`).send({ status: "PUBLISHED" }).expect(201);
    expect(await db.notification.count({ where: { userId: follower.id, type: "animal_support.new_need" } })).toBe(1);
    await send("post", admin, `/admin/animal-support/needs/${o.listingId}/review`).send({ status: "REMOVED", reviewNote: "x" }).expect(201);
    await send("post", admin, `/admin/animal-support/needs/${o.listingId}/review`).send({ status: "PUBLISHED" }).expect(201);
    expect(await db.notification.count({ where: { userId: follower.id, type: "animal_support.new_need" } })).toBe(1);
  });

  it("volunteer: explicit transitions by the organisation, member may only cancel, other org can't touch, re-register reopens", async () => {
    const o = await org();
    const other = await org();
    const vol = await actor("volunteer");
    await send("post", vol, `/animal-support/organizations/${o.orgId}/volunteer`).send({ kinds: ["OTHER"], city: "Tehran", listingId: other.listingId }).expect(404); // need of another org
    await send("post", vol, `/animal-support/organizations/${o.orgId}/volunteer`).send({ kinds: ["TRANSPORT", "OTHER"], city: "Tehran", listingId: o.listingId }).expect(201);
    const row = (await get(o.manager, "/ngo/volunteers").expect(200)).body[0];
    expect(row).toMatchObject({ status: "INTERESTED", listingId: o.listingId });
    expect(row.volunteer.email).toBeUndefined();
    const status = (s: string) => send("post", o.manager, `/ngo/volunteers/${row.id}/status`).send({ status: s });
    expect((await status("COMPLETED").expect(400)).body.error.details).toMatchObject({ reason: "INVALID_TRANSITION", from: "INTERESTED" });
    await status("CONTACTED").expect(201);
    // Editing details keeps the organisation's progress.
    await send("post", vol, `/animal-support/organizations/${o.orgId}/volunteer`).send({ kinds: ["TRANSPORT"], city: "Karaj" }).expect(201);
    expect((await get(vol, "/me/volunteer-interests").expect(200)).body[0].status).toBe("CONTACTED");
    await send("post", other.manager, `/ngo/volunteers/${row.id}/status`).send({ status: "ACCEPTED" }).expect(404);
    await send("post", vol, `/ngo/volunteers/${row.id}/status`).send({ status: "ACCEPTED" }).expect(403);
    await status("ACCEPTED").expect(201);
    expect(await db.notification.count({ where: { userId: vol.id, type: "animal_support.volunteer_status" } })).toBe(2);
    expect((await get(null, `/animal-support/needs/${o.listingId}/activity`).expect(200)).body.map((a: { kind: string }) => a.kind)).toContain("VOLUNTEER_ACCEPTED");
    await status("COMPLETED").expect(201);
    await send("delete", vol, `/animal-support/organizations/${o.orgId}/volunteer`).expect(400); // terminal
    await send("post", vol, `/animal-support/organizations/${o.orgId}/volunteer`).send({ kinds: ["DELIVERY"], city: "Tehran" }).expect(201);
    expect((await get(vol, "/me/volunteer-interests").expect(200)).body[0].status).toBe("INTERESTED");
    expect((await send("delete", vol, `/animal-support/organizations/${o.orgId}/volunteer`).expect(200)).body.status).toBe("CANCELLED");
    expect(await db.domainEvent.count({ where: { type: "VolunteerInterestStatusChanged", aggregateId: row.id } })).toBe(4);
  });
});
