import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole, ProviderUserRole } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { OsmDirectoryService } from "../src/modules/places/osm/osm-directory.service";
import type { OsmElement } from "../src/modules/places/osm/osm-mapping";

type Actor = { id: string; csrf: string; cookie: string };

/** OSM seeding with a stubbed Overpass response (no network in CI), public visibility with labels, re-sync, claims. */
describe("OpenStreetMap directory (e2e)", () => {
  let app: INestApplication, db: PrismaService, osm: OsmDirectoryService;
  const server = () => app.getHttpServer();
  const get = (a: Actor | null, u: string) => (a ? request(server()).get(u).set("Cookie", a.cookie) : request(server()).get(u));
  const post = (a: Actor, u: string) => request(server()).post(u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);
  const city = `شهر-${randomUUID().slice(0, 6)}`;
  const base = 30 + Math.random();

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    osm = app.get(OsmDirectoryService);
  });
  afterAll(async () => app.close());

  async function actor(name: string): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `osm-${randomUUID()}@example.com` } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }

  it("imports labelled unverified listings, re-syncs them, hides vanished ones, and hands a claimed one to a verified partner", async () => {
    const area = await db.osmSyncArea.create({ data: { city, south: base, west: 50, north: base + 0.2, east: 50.2, active: false } });
    const id = Math.floor(Math.random() * 1e9);
    const vet: OsmElement = { type: "node", id, lat: base + 0.1, lon: 50.1, tags: { amenity: "veterinary", name: "Vet One", phone: "+98 21 000 0000" } };
    const shop: OsmElement = { type: "way", id: id + 1, center: { lat: base + 0.11, lon: 50.11 }, tags: { shop: "pet", name: "Shop Two" } };
    await osm.run(area, undefined, async () => [vet, shop, { type: "node", id: id + 2, lat: base, lon: 50, tags: { amenity: "cafe", name: "No dogs here" } }]);
    const run = await db.osmImportRun.findFirstOrThrow({ where: { areaId: area.id }, orderBy: { startedAt: "desc" } });
    expect(run).toMatchObject({ status: "SUCCEEDED", fetched: 3, created: 2, skipped: 1 });

    // Public, but labelled as OpenStreetMap / not verified, with no verified status.
    const list = (await get(null, `/places?city=${encodeURIComponent(city)}`).expect(200)).body.items as { name: string; source: string; status: string; claimed: boolean; osmUrl: string; phone: string | null }[];
    expect(list.map((p) => p.name).sort()).toEqual(["Shop Two", "Vet One"]);
    expect(list.every((p) => p.source === "OSM" && p.status === "UNVERIFIED" && !p.claimed && p.osmUrl.startsWith("https://www.openstreetmap.org/"))).toBe(true);
    const vetRow = await db.petFriendlyPlace.findFirstOrThrow({ where: { osmId: BigInt(id) } });
    expect(vetRow).toMatchObject({ category: "VETERINARY", phone: "+98 21 000 0000", city });

    // A member claims the vet; with no partner account the next step is sign-up.
    const owner = await actor("Dr. Owner");
    expect((await post(owner, `/places/${vetRow.id}/claim`).send({ message: "This is my clinic" }).expect(201)).body).toMatchObject({ status: "PENDING", nextStep: "CREATE_PARTNER_ACCOUNT" });
    expect((await get(owner, `/places/${vetRow.id}/claim`).expect(200)).body).toMatchObject({ claim: { status: "PENDING", nextStep: "CREATE_PARTNER_ACCOUNT" } });
    const staff = await actor("staff");
    await db.adminUser.create({ data: { userId: staff.id, role: AdminRole.SUPER_ADMIN, status: AdminMembershipStatus.ACTIVE } });
    const claimId = (await get(staff, "/admin/places/claims").expect(200)).body.items.find((c: { place: { id: string } }) => c.place.id === vetRow.id).id;
    // Not approvable until the business passed KYC.
    await post(staff, `/admin/places/claims/${claimId}/decision`).send({ approve: true, reason: "Looks right" }).expect(400);
    const org = await db.providerOrganization.create({ data: { name: "Vet One Clinic", type: "VET_CLINIC", verificationStatus: "VERIFIED" } });
    await db.providerUser.create({ data: { userId: owner.id, providerOrganizationId: org.id, role: ProviderUserRole.OWNER } });
    // Still refused: the claim was filed without a business; the claimant refreshes it to name their verified one.
    await post(staff, `/admin/places/claims/${claimId}/decision`).send({ approve: true, reason: "KYC passed" }).expect(400);
    expect((await post(owner, `/places/${vetRow.id}/claim`).send({}).expect(201)).body).toMatchObject({ claimId, nextStep: "AWAITING_REVIEW" });
    const queued = (await get(staff, "/admin/places/claims").expect(200)).body.items.find((c: { id: string }) => c.id === claimId);
    expect(queued).toMatchObject({ organization: { id: org.id, name: "Vet One Clinic", verificationStatus: "VERIFIED" }, place: { osmTags: { name: "Vet One", phone: "+98 21 000 0000" } } });
    await post(staff, `/admin/places/claims/${claimId}/decision`).send({ approve: true, reason: "KYC passed, same address" }).expect(201);
    const claimed = await db.petFriendlyPlace.findUniqueOrThrow({ where: { id: vetRow.id } });
    expect(claimed).toMatchObject({ claimedByProviderOrganizationId: org.id, status: "VERIFIED" });

    // Re-sync: the claimed vet keeps its fields even though OSM renamed it; the vanished shop is hidden.
    await osm.run(area, undefined, async () => [{ ...vet, tags: { ...vet.tags, name: "Renamed in OSM" } }]);
    expect((await db.petFriendlyPlace.findUniqueOrThrow({ where: { id: vetRow.id } })).name).toBe("Vet One");
    const shopRow = await db.petFriendlyPlace.findFirstOrThrow({ where: { osmId: BigInt(id + 1) } });
    expect(shopRow).toMatchObject({ isPubliclyListed: false });
    expect(shopRow.osmMissingSince).not.toBeNull();
  });

  it("approves only for the claim's own verified business, refuses suspended places, caps open claims, and can release a claim", async () => {
    const area = await db.osmSyncArea.create({ data: { city: `${city}-4`, south: base, west: 52, north: base + 0.1, east: 52.1, active: false } });
    const first = Math.floor(Math.random() * 1e9);
    const shops: OsmElement[] = Array.from({ length: 8 }, (_, i) => ({ type: "node", id: first + i, lat: base + 0.01 * (i + 1), lon: 52.05, tags: { shop: "pet", name: `Shop ${i}`, phone: `+98 21 111 000${i}` } }));
    await osm.run(area, undefined, async () => shops);
    const places = await db.petFriendlyPlace.findMany({ where: { osmId: { in: shops.map((s) => BigInt(s.id)) } }, orderBy: { name: "asc" } });
    expect(places).toHaveLength(8);
    const staff = await actor("staff-4");
    await db.adminUser.create({ data: { userId: staff.id, role: AdminRole.SUPER_ADMIN, status: AdminMembershipStatus.ACTIVE } });

    // A claim filed while the member's business was unverified names that business; owning another, verified one
    // later does not let staff approve it until the member refreshes the claim.
    const member = await actor("Claimant A");
    const unverified = await db.providerOrganization.create({ data: { name: "Shop Zero (pending)", type: "GROOMER", verificationStatus: "UNDER_REVIEW" } });
    await db.providerUser.create({ data: { userId: member.id, providerOrganizationId: unverified.id, role: ProviderUserRole.OWNER } });
    const claim = (await post(member, `/places/${places[0]!.id}/claim`).send({}).expect(201)).body;
    expect(claim).toMatchObject({ nextStep: "COMPLETE_VERIFICATION" });
    const verified = await db.providerOrganization.create({ data: { name: "Shop Zero", type: "GROOMER", verificationStatus: "VERIFIED" } });
    await db.providerUser.create({ data: { userId: member.id, providerOrganizationId: verified.id, role: ProviderUserRole.OWNER } });
    await post(staff, `/admin/places/claims/${claim.claimId}/decision`).send({ approve: true, reason: "Looks right" }).expect(400);
    await post(member, `/places/${places[0]!.id}/claim`).send({}).expect(201);
    await post(staff, `/admin/places/claims/${claim.claimId}/decision`).send({ approve: true, reason: "KYC matches the OSM phone" }).expect(201);
    expect(await db.petFriendlyPlace.findUniqueOrThrow({ where: { id: places[0]!.id } })).toMatchObject({ claimedByProviderOrganizationId: verified.id, status: "VERIFIED" });

    // Released after a dispute: back to an unverified OSM listing, the approved claim withdrawn.
    const approved = (await get(staff, "/admin/places/claims?status=APPROVED").expect(200)).body.items.find((c: { id: string }) => c.id === claim.claimId);
    expect(approved).toMatchObject({ status: "APPROVED", place: { claimedByThisClaim: true } });
    await post(staff, `/admin/places/${places[0]!.id}/release-claim`).send({ reason: "The real owner disputed it" }).expect(201);
    expect(await db.petFriendlyPlace.findUniqueOrThrow({ where: { id: places[0]!.id } })).toMatchObject({ claimedByProviderOrganizationId: null, status: "UNVERIFIED", verificationSource: "OPENSTREETMAP" });
    expect(await db.placeClaim.findUniqueOrThrow({ where: { id: claim.claimId } })).toMatchObject({ status: "WITHDRAWN" });
    expect(await db.adminAuditLog.count({ where: { action: "place_claim.released", entityId: places[0]!.id } })).toBe(1);
    await post(staff, `/admin/places/${places[0]!.id}/release-claim`).send({ reason: "Again" }).expect(400);

    // A suspended listing cannot be claimed.
    await post(staff, `/admin/places/${places[1]!.id}/verification`).send({ status: "SUSPENDED" }).expect(201);
    const other = await actor("Claimant B");
    await post(other, `/places/${places[1]!.id}/claim`).send({}).expect(400);

    // At most five open claims per member.
    for (const place of places.slice(2, 7)) await post(other, `/places/${place.id}/claim`).send({}).expect(201);
    const limited = await post(other, `/places/${places[7]!.id}/claim`).send({}).expect(400);
    expect(limited.body.error.details).toMatchObject({ reason: "OPEN_CLAIMS_LIMIT" });
    // Refreshing an open claim is not a new one.
    await post(other, `/places/${places[2]!.id}/claim`).send({ message: "Still mine" }).expect(201);
  });

  it("keeps what staff changed through a re-sync and never gives an unclaimed import the verified badge by hand", async () => {
    const area = await db.osmSyncArea.create({ data: { city: `${city}-3`, south: base, west: 51, north: base + 0.1, east: 51.1, active: false } });
    const el: OsmElement = { type: "node", id: Math.floor(Math.random() * 1e9), lat: base + 0.05, lon: 51.05, tags: { shop: "pet", name: "Pet Corner", website: "petcorner.example" } };
    await osm.run(area, undefined, async () => [el]);
    const row = await db.petFriendlyPlace.findFirstOrThrow({ where: { osmId: BigInt(el.id) } });
    expect(row.website).toBe("https://petcorner.example/");
    const staff = await actor("staff-3");
    await db.adminUser.create({ data: { userId: staff.id, role: AdminRole.SUPER_ADMIN, status: AdminMembershipStatus.ACTIVE } });
    await request(server()).patch(`/admin/places/${row.id}`).set("Cookie", staff.cookie).set("x-csrf-token", staff.csrf).send({ name: "Pet Corner (Vanak)" }).expect(200);
    await post(staff, `/admin/places/${row.id}/listing`).send({ isPubliclyListed: false }).expect(201);
    await post(staff, `/admin/places/${row.id}/verification`).send({ status: "VERIFIED" }).expect(400);

    await osm.run(area, undefined, async () => [{ ...el, tags: { ...el.tags, name: "Pet Corner OSM", website: "petcorner2.example" } }]);
    const after = await db.petFriendlyPlace.findUniqueOrThrow({ where: { id: row.id } });
    expect(after).toMatchObject({ name: "Pet Corner (Vanak)", website: "https://petcorner2.example/", isPubliclyListed: false, status: "UNVERIFIED" });
    expect(after.osmEditedFields).toEqual(["isPubliclyListed", "name"]);
  });

  it("stops on an Overpass rate limit and lets the area come round again soon", async () => {
    const { OverpassRateLimitedError } = await import("../src/modules/places/osm/osm-directory.service");
    const area = await db.osmSyncArea.create({ data: { city: `${city}-2`, south: base, west: 50, north: base + 0.1, east: 50.1, active: false } });
    await osm.run(area, undefined, async () => {
      throw new OverpassRateLimitedError("Overpass answered 429");
    });
    expect((await db.osmImportRun.findFirstOrThrow({ where: { areaId: area.id } })).status).toBe("RATE_LIMITED");
  });
});
