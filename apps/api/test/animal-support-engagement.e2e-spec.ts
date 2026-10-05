import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { DonationService } from "../src/modules/animal-support/donation.service";

type Actor = { id: string; cookie: string; csrf: string };

/** Animal support engagement: updates, derived milestones, follows, saved needs, volunteer interest. */
describe("Animal support — engagement", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor | null, u: string) => (a ? request(server()).get(u).set("Cookie", a.cookie) : request(server()).get(u));
  const send = (m: "post" | "delete", a: Actor, u: string) => request(server())[m](u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function actor(name: string): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `g7-${randomUUID()}@example.com`, phone: `+98912${Math.floor(1000000 + Math.random() * 8999999)}` } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }
  async function org() {
    const manager = await actor("manager");
    const o = await db.animalSupportOrganization.create({ data: { type: "SHELTER", name: `Shelter ${randomUUID().slice(0, 6)}`, verificationStatus: "VERIFIED", isPubliclyListed: true } });
    await db.animalSupportOrgMembership.create({ data: { organizationId: o.id, userId: manager.id, role: "OWNER" } });
    const campaign = await db.supportCampaign.create({ data: { organizationId: o.id, title: "Care fund", description: "x", status: "ACTIVE" } });
    const listing = await db.supportNeedListing.create({ data: { organizationId: o.id, campaignId: campaign.id, title: "Surgery for Rana", description: "x", category: "VETERINARY_CARE", contactMode: "BOTH", status: "PUBLISHED", province: "Tehran", city: "Tehran", publishedAt: new Date(), targetAmountIrr: 10_000_000, neededQuantity: 4 } });
    return { manager, orgId: o.id, campaignId: campaign.id, listingId: listing.id };
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("updates are posted by managers only and reach followers, involved helpers and donors", async () => {
    const o = await org();
    const follower = await actor("follower");
    const donor = await actor("donor");
    const helper = await actor("helper");
    const stranger = await actor("stranger");
    await send("post", follower, `/animal-support/organizations/${o.orgId}/follow`).expect(201);
    await app.get(DonationService).donate(o.campaignId, donor.id, { amountIrr: 6_000_000, supportNeedListingId: o.listingId, idempotencyKey: randomUUID() });
    await db.helpOffer.create({ data: { listingId: o.listingId, helperUserId: helper.id, message: "x", helpType: "VETERINARY_CARE", status: "ACCEPTED", quantity: 1 } });
    await db.helpOffer.create({ data: { listingId: o.listingId, helperUserId: stranger.id, message: "x", helpType: "VETERINARY_CARE", status: "PENDING", quantity: 1 } });

    await send("post", stranger, `/animal-support/needs/${o.listingId}/updates`).send({ body: "fake" }).expect(403);
    const posted = (await send("post", o.manager, `/animal-support/needs/${o.listingId}/updates`).send({ body: "Surgery went well" }).expect(201)).body;
    expect(posted.notified).toBe(3);
    for (const u of [follower, donor, helper]) expect(await db.notification.count({ where: { userId: u.id, type: "animal_support.need_update", deepLink: `/animal-support/needs/${o.listingId}` } })).toBe(1);
    // A pending offer is not "involved" yet.
    expect(await db.notification.count({ where: { userId: stranger.id, type: "animal_support.need_update" } })).toBe(0);
    expect((await get(null, `/animal-support/needs/${o.listingId}/updates`).expect(200)).body.map((u: { body: string }) => u.body)).toEqual(["Surgery went well"]);
    await send("delete", stranger, `/animal-support/needs/${o.listingId}/updates/${posted.id}`).expect(404);
    await send("delete", o.manager, `/animal-support/needs/${o.listingId}/updates/${posted.id}`).expect(200);
    expect((await get(null, `/animal-support/needs/${o.listingId}/updates`).expect(200)).body).toEqual([]);
  });

  it("milestones come only from real state", async () => {
    const o = await org();
    const donor = await actor("donor");
    expect((await get(null, `/animal-support/needs/${o.listingId}/milestones`).expect(200)).body).toEqual([]);
    const donations = app.get(DonationService);
    await donations.donate(o.campaignId, donor.id, { amountIrr: 4_000_000, supportNeedListingId: o.listingId, idempotencyKey: randomUUID() });
    expect((await get(null, `/animal-support/needs/${o.listingId}/milestones`).expect(200)).body).toEqual([]);
    await donations.donate(o.campaignId, donor.id, { amountIrr: 2_000_000, supportNeedListingId: o.listingId, idempotencyKey: randomUUID() });
    expect((await get(null, `/animal-support/needs/${o.listingId}/milestones`).expect(200)).body.map((m: { key: string }) => m.key)).toEqual(["FUNDING_50"]);
    await donations.donate(o.campaignId, donor.id, { amountIrr: 4_000_000, supportNeedListingId: o.listingId, idempotencyKey: randomUUID() });
    await db.helpOffer.create({ data: { listingId: o.listingId, helperUserId: donor.id, message: "x", helpType: "VETERINARY_CARE", status: "COMPLETED", quantity: 1 } });
    expect((await get(null, `/animal-support/needs/${o.listingId}/milestones`).expect(200)).body.map((m: { key: string }) => m.key)).toEqual(["FUNDING_50", "FUNDING_100", "FIRST_HELP_RECEIVED"]);
    await get(null, `/animal-support/needs/${randomUUID()}/milestones`).expect(404);
  });

  it("follows and saved needs are per member; hidden needs and unverified organisations are refused", async () => {
    const o = await org();
    const m = await actor("member");
    await send("post", m, `/animal-support/needs/${o.listingId}/save`).expect(201);
    await send("post", m, `/animal-support/needs/${o.listingId}/save`).expect(201);
    expect((await get(m, "/me/saved-needs").expect(200)).body.map((n: { id: string }) => n.id)).toEqual([o.listingId]);
    await db.supportNeedListing.update({ where: { id: o.listingId }, data: { status: "REMOVED" } });
    expect((await get(m, "/me/saved-needs").expect(200)).body).toEqual([]);
    await send("post", m, `/animal-support/needs/${o.listingId}/save`).expect(404);
    const pending = await db.animalSupportOrganization.create({ data: { type: "NGO", name: "Pending org", verificationStatus: "UNDER_REVIEW" } });
    await send("post", m, `/animal-support/organizations/${pending.id}/follow`).expect(404);
    await send("post", m, `/animal-support/organizations/${o.orgId}/follow`).expect(201);
    expect((await get(m, "/me/followed-organizations").expect(200)).body.map((x: { id: string }) => x.id)).toEqual([o.orgId]);
    await send("delete", m, `/animal-support/organizations/${o.orgId}/follow`).expect(200);
    expect((await get(m, "/me/followed-organizations").expect(200)).body).toEqual([]);
  });

  it("volunteer interest: contact shared only on opt-in; only the organisation's staff see it", async () => {
    const o = await org();
    const shy = await actor("shy");
    const open = await actor("open");
    await send("post", shy, `/animal-support/organizations/${o.orgId}/volunteer`).send({ kinds: ["TRANSPORT"], city: "Tehran" }).expect(201);
    await send("post", open, `/animal-support/organizations/${o.orgId}/volunteer`).send({ kinds: ["TEMPORARY_FOSTER", "DELIVERY"], city: "Karaj", shareContact: true }).expect(201);
    await send("post", open, `/animal-support/organizations/${o.orgId}/volunteer`).send({ kinds: ["SKYDIVING"], city: "Karaj" }).expect(400);
    expect(await db.notification.count({ where: { userId: o.manager.id, type: "animal_support.volunteer_interest" } })).toBe(2);
    const list = (await get(o.manager, "/ngo/volunteers").expect(200)).body;
    const shyRow = list.find((r: { volunteer: { displayName: string } }) => r.volunteer.displayName === "shy");
    const openRow = list.find((r: { volunteer: { displayName: string } }) => r.volunteer.displayName === "open");
    expect(shyRow.volunteer.email).toBeUndefined();
    expect(openRow.volunteer.email).toMatch(/@example\.com$/);
    await send("post", o.manager, `/ngo/volunteers/${shyRow.id}/status`).send({ status: "CONTACTED" }).expect(201);
    expect((await get(shy, "/me/volunteer-interests").expect(200)).body[0].status).toBe("CONTACTED");
    // Another organisation's staff see none of this.
    const other = await org();
    expect((await get(other.manager, "/ngo/volunteers").expect(200)).body).toEqual([]);
    await send("post", other.manager, `/ngo/volunteers/${shyRow.id}/status`).send({ status: "CLOSED" }).expect(404);
    await get(shy, "/ngo/volunteers").expect(403);
    await send("delete", shy, `/animal-support/organizations/${o.orgId}/volunteer`).expect(200);
  });
});
