import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { SupportNeedService } from "../src/modules/animal-support/support-need.service";

/**
 * A support need end to end: one listing that asks for both money and items. Cash goes through the
 * campaign (ledger), items through pledges (no ledger) — each moves only its own progress line.
 */
describe("Animal support — cash and in-kind contributions end to end", () => {
  let app: INestApplication, db: PrismaService, needs: SupportNeedService;
  type Actor = { id: string; get: (u: string) => request.Test; post: (u: string) => request.Test; patch: (u: string) => request.Test };
  let staff: Actor, admin: Actor, helperA: Actor, helperB: Actor, donor: Actor, outsider: Actor;
  let orgId: string, campaignId: string;

  async function actor(name: string, adminRole?: AdminRole): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `as-${name}-${randomUUID()}@example.com` } });
    if (adminRole) await db.adminUser.create({ data: { userId: user.id, role: adminRole, status: AdminMembershipStatus.ACTIVE } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(app.getHttpServer()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    const cookie = `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}`;
    const http = () => request(app.getHttpServer());
    return {
      id: user.id,
      get: (u) => http().get(u).set("Cookie", cookie),
      post: (u) => http().post(u).set("Cookie", cookie).set("x-csrf-token", csrf),
      patch: (u) => http().patch(u).set("Cookie", cookie).set("x-csrf-token", csrf),
    };
  }

  async function liveNeed(extra: Record<string, unknown> = {}) {
    const created = await staff.post("/animal-support/needs").send({
      title: `غذا و هزینهٔ درمان ${randomUUID().slice(0, 6)}`,
      description: "برای هشت سگ نجات‌یافته غذا و هزینهٔ جراحی یکی از آن‌ها لازم داریم.",
      category: "FOOD", province: "تهران", city: "تهران",
      organizationId: orgId, campaignId, contactMode: "DONATE",
      neededQuantity: 10, quantityUnit: "کیسه", targetAmountIrr: 5_000_000,
      ...extra,
    }).expect(201);
    await staff.post(`/animal-support/needs/${created.body.id}/submit`).expect(201);
    await admin.post(`/admin/animal-support/needs/${created.body.id}/review`).send({ status: "PUBLISHED" }).expect(201);
    return created.body.id as string;
  }
  const summary = async (id: string) => (await request(app.getHttpServer()).get(`/animal-support/needs/${id}/summary`).expect(200)).body;
  const ledgerRows = () => db.donationLedgerEntry.count();

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    needs = app.get(SupportNeedService);
    staff = await actor("staff"); admin = await actor("admin", AdminRole.TRUST_SAFETY);
    helperA = await actor("helperA"); helperB = await actor("helperB"); donor = await actor("donor"); outsider = await actor("outsider");
    const org = await db.animalSupportOrganization.create({ data: { type: "SHELTER", name: `پناهگاه ${randomUUID().slice(0, 6)}`, verificationStatus: "VERIFIED", isPubliclyListed: true } });
    orgId = org.id;
    await db.animalSupportOrgMembership.create({ data: { organizationId: orgId, userId: staff.id, role: "COORDINATOR" } });
    campaignId = (await db.supportCampaign.create({ data: { organizationId: orgId, title: "هزینه‌های جاری", description: "درمان و غذا", status: "ACTIVE" } })).id;
  });
  afterAll(async () => { await app?.close(); });

  it("partial cash, then the rest: raised/remaining add up and only the ledger moves", async () => {
    const id = await liveNeed();
    const before = await ledgerRows();
    await donor.post(`/animal-support/campaigns/${campaignId}/donate`).send({ amountIrr: 2_000_000, supportNeedListingId: id }).expect(201);
    let s = await summary(id);
    expect([s.targetAmountIrr, s.raisedAmountIrr, s.remainingAmountIrr, s.donationCount]).toEqual([5_000_000, 2_000_000, 3_000_000, 1]);
    // "Pay the full amount" = the remaining balance.
    await donor.post(`/animal-support/campaigns/${campaignId}/donate`).send({ amountIrr: s.remainingAmountIrr, supportNeedListingId: id }).expect(201);
    s = await summary(id);
    expect([s.raisedAmountIrr, s.remainingAmountIrr]).toEqual([5_000_000, 0]);
    expect(await ledgerRows()).toBeGreaterThan(before);
    // Money never moves the item line.
    expect(s.fulfilledQuantity).toBe(0);
    // Donor identity is never part of the public summary.
    expect(JSON.stringify(s)).not.toContain(donor.id);
  });

  it("in-kind pledge: pledge → accept → in progress → received adds to the item line, never to cash", async () => {
    const id = await liveNeed();
    const ledgerBefore = await ledgerRows();
    const offer = await helperA.post(`/animal-support/needs/${id}/offers`).send({ message: "۴ کیسه غذای خشک می‌آورم.", helpType: "FOOD", quantity: 4 }).expect(201);
    // Only the publisher (org staff) may accept; the helper and outsiders cannot.
    await helperA.patch(`/animal-support/needs/${id}/offers/${offer.body.id}`).send({ status: "ACCEPTED" }).expect(403);
    await outsider.patch(`/animal-support/needs/${id}/offers/${offer.body.id}`).send({ status: "ACCEPTED" }).expect(403);
    await staff.patch(`/animal-support/needs/${id}/offers/${offer.body.id}`).send({ status: "ACCEPTED" }).expect(200);
    await staff.patch(`/animal-support/needs/${id}/offers/${offer.body.id}`).send({ status: "IN_PROGRESS" }).expect(200);
    await staff.patch(`/animal-support/needs/${id}/offers/${offer.body.id}`).send({ status: "COMPLETED", fulfilledQuantity: 4 }).expect(200);
    const s = await summary(id);
    expect([s.fulfilledQuantity, s.neededQuantity, s.raisedAmountIrr]).toEqual([4, 10, 0]);
    expect((await db.supportNeedListing.findUniqueOrThrow({ where: { id } })).status).toBe("PARTIALLY_FULFILLED");
    expect(await ledgerRows()).toBe(ledgerBefore);
    // A received pledge cannot be received again.
    await staff.patch(`/animal-support/needs/${id}/offers/${offer.body.id}`).send({ status: "COMPLETED", fulfilledQuantity: 4 }).expect(409);
    // The helper was told, with a working deep link.
    const notes = await db.notification.findMany({ where: { userId: helperA.id } });
    expect(notes.map((n) => n.type)).toEqual(expect.arrayContaining(["animal_support.offer_accepted", "animal_support.offer_completed"]));
  });

  it("a declined pledge and a helper-cancelled pledge change nothing", async () => {
    const id = await liveNeed();
    const a = await helperA.post(`/animal-support/needs/${id}/offers`).send({ message: "۲ کیسه", helpType: "FOOD", quantity: 2 }).expect(201);
    const b = await helperB.post(`/animal-support/needs/${id}/offers`).send({ message: "۳ کیسه", helpType: "FOOD", quantity: 3 }).expect(201);
    await staff.patch(`/animal-support/needs/${id}/offers/${a.body.id}`).send({ status: "DECLINED" }).expect(200);
    await helperB.patch(`/animal-support/needs/${id}/offers/${b.body.id}`).send({ status: "CANCELLED" }).expect(200);
    const s = await summary(id);
    expect([s.fulfilledQuantity, s.pendingOffers, s.completedOffers]).toEqual([0, 0, 0]);
  });

  it("two simultaneous 'received' confirmations for one pledge count it once", async () => {
    const id = await liveNeed();
    const offer = await helperA.post(`/animal-support/needs/${id}/offers`).send({ message: "۵ کیسه", helpType: "FOOD", quantity: 5 }).expect(201);
    await staff.patch(`/animal-support/needs/${id}/offers/${offer.body.id}`).send({ status: "ACCEPTED" }).expect(200);
    const [r1, r2] = await Promise.all([
      staff.patch(`/animal-support/needs/${id}/offers/${offer.body.id}`).send({ status: "COMPLETED", fulfilledQuantity: 5 }),
      staff.patch(`/animal-support/needs/${id}/offers/${offer.body.id}`).send({ status: "COMPLETED", fulfilledQuantity: 5 }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    expect((await summary(id)).fulfilledQuantity).toBe(5);
  });

  it("items received in full fulfil the need; further pledges and restricted donations are refused", async () => {
    const id = await liveNeed({ neededQuantity: 3 });
    const offer = await helperA.post(`/animal-support/needs/${id}/offers`).send({ message: "همهٔ ۳ کیسه", helpType: "FOOD", quantity: 3 }).expect(201);
    await staff.patch(`/animal-support/needs/${id}/offers/${offer.body.id}`).send({ status: "ACCEPTED" }).expect(200);
    await staff.patch(`/animal-support/needs/${id}/offers/${offer.body.id}`).send({ status: "COMPLETED", fulfilledQuantity: 3 }).expect(200);
    expect((await db.supportNeedListing.findUniqueOrThrow({ where: { id } })).status).toBe("FULFILLED");
    await helperB.post(`/animal-support/needs/${id}/offers`).send({ message: "بیشتر", helpType: "FOOD", quantity: 1 }).expect((r) => expect(r.status).toBeGreaterThanOrEqual(400));
    await donor.post(`/animal-support/campaigns/${campaignId}/donate`).send({ amountIrr: 100_000, supportNeedListingId: id }).expect(400);
  });

  it("after expiry no new pledge can be accepted, but one already accepted can still be received", async () => {
    const id = await liveNeed();
    const accepted = await helperA.post(`/animal-support/needs/${id}/offers`).send({ message: "۲ کیسه", helpType: "FOOD", quantity: 2 }).expect(201);
    const pending = await helperB.post(`/animal-support/needs/${id}/offers`).send({ message: "۱ کیسه", helpType: "FOOD", quantity: 1 }).expect(201);
    await staff.patch(`/animal-support/needs/${id}/offers/${accepted.body.id}`).send({ status: "ACCEPTED" }).expect(200);
    await db.supportNeedListing.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await needs.processExpiries();
    expect((await db.supportNeedListing.findUniqueOrThrow({ where: { id } })).status).toBe("EXPIRED");
    const refused = await staff.patch(`/animal-support/needs/${id}/offers/${pending.body.id}`).send({ status: "ACCEPTED" }).expect(409);
    expect(refused.body.error.details.reason).toBe("LISTING_NOT_ACCEPTING_OFFERS");
    await staff.patch(`/animal-support/needs/${id}/offers/${accepted.body.id}`).send({ status: "COMPLETED", fulfilledQuantity: 2 }).expect(200);
    expect((await db.supportNeedListing.findUniqueOrThrow({ where: { id } })).fulfilledQuantity).toBe(2);
  });

  it("another organization's staff cannot manage this need's pledges, and the offer inbox is the publisher's only", async () => {
    const id = await liveNeed();
    const otherStaff = await actor("otherStaff");
    const otherOrg = await db.animalSupportOrganization.create({ data: { type: "SHELTER", name: `دیگر ${randomUUID().slice(0, 6)}`, verificationStatus: "VERIFIED", isPubliclyListed: true } });
    await db.animalSupportOrgMembership.create({ data: { organizationId: otherOrg.id, userId: otherStaff.id, role: "COORDINATOR" } });
    const offer = await helperA.post(`/animal-support/needs/${id}/offers`).send({ message: "۱ کیسه", helpType: "FOOD", quantity: 1 }).expect(201);
    await otherStaff.patch(`/animal-support/needs/${id}/offers/${offer.body.id}`).send({ status: "ACCEPTED" }).expect(403);
    await otherStaff.get(`/animal-support/needs/${id}/offers`).expect(403);
    const inbox = await staff.get(`/animal-support/needs/${id}/offers`).expect(200);
    expect(inbox.body.length ?? inbox.body.items?.length).toBeGreaterThan(0);
  });
});
