import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { HouseholdRole, PetAccessSource } from "@prisma/client";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";

/**
 * Someone an owner trusted with canManageAccess (for a limited time) must not be able to use it on themselves,
 * hand out access that outlives their own, or rewrite what a grant means through its reason.
 */
describe("Pet access grants: no self-escalation", () => {
  let app: INestApplication, db: PrismaService, csrf: string;
  let householdId: string, petId: string, managerGrantId: string;
  const DAY = 86_400_000;
  const managerExpiry = new Date(Date.now() + 2 * DAY);
  type Client = { id: string; post: (p: string) => request.Test; patch: (p: string) => request.Test };
  let owner: Client, manager: Client, target: Client;

  const FLAGS_NONE = {
    canViewIdentity: false, canEditIdentity: false, canViewHealth: false, canEditHealth: false, canBookCare: false,
    canViewCareProfile: false, canEditCareProfile: false, canViewLocation: false, canManageAccess: false, canRecordClinicalData: false,
  };
  const identityOnly = { ...FLAGS_NONE, canViewIdentity: true };

  async function member(name: string, role: HouseholdRole): Promise<Client> {
    const user = await db.user.create({ data: { displayName: name, email: `${name}-${randomUUID()}@example.com` } });
    await db.householdMember.create({ data: { householdId, userId: user.id, role } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + DAY) } });
    const cookie = `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}`;
    const server = app.getHttpServer();
    const withAuth = (t: request.Test) => t.set("Cookie", cookie).set("x-csrf-token", csrf);
    return { id: user.id, post: (p) => withAuth(request(server).post(p)), patch: (p) => withAuth(request(server).patch(p)) };
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    csrf = extractCookie((await request(app.getHttpServer()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
    householdId = (await db.household.create({ data: { name: "Escalation household" } })).id;
    owner = await member("owner", HouseholdRole.OWNER);
    manager = await member("manager", HouseholdRole.FAMILY);
    target = await member("target", HouseholdRole.FAMILY);
    petId = (await owner.post(`/households/${householdId}/pets`).send({ name: "Guarded", species: "DOG", approximateAgeMonths: 12 }).expect(201)).body.id;
    managerGrantId = (await db.petAccessGrant.create({
      data: { petId, userId: manager.id, source: PetAccessSource.TEMPORARY, grantedByUserId: owner.id, expiresAt: managerExpiry, canViewIdentity: true, canViewHealth: true, canManageAccess: true },
    })).id;
  });
  afterAll(async () => { await app?.close(); });

  it("a manager can't grant access to themselves", async () => {
    const res = await manager.post(`/pets/${petId}/access-grants`).send({ userId: manager.id, ...identityOnly, canViewHealth: true }).expect(400);
    expect(res.body.error.details.field).toBe("userId");
  });

  it("a manager can't change their own grant (e.g. extend it)", async () => {
    const res = await manager.patch(`/pets/${petId}/access-grants/${managerGrantId}`).send({ expiresAt: new Date(Date.now() + 365 * DAY).toISOString() }).expect(400);
    expect(res.body.error.details.field).toBe("grantId");
    expect((await db.petAccessGrant.findUniqueOrThrow({ where: { id: managerGrantId } })).expiresAt).toEqual(managerExpiry);
  });

  it("a temporary manager can only grant access that ends no later than their own", async () => {
    await manager.post(`/pets/${petId}/access-grants`).send({ userId: target.id, ...identityOnly }).expect(400);
    await manager.post(`/pets/${petId}/access-grants`).send({ userId: target.id, ...identityOnly, expiresAt: new Date(managerExpiry.getTime() + DAY).toISOString() }).expect(400);
    const ok = await manager.post(`/pets/${petId}/access-grants`).send({ userId: target.id, ...identityOnly, expiresAt: new Date(Date.now() + DAY).toISOString() }).expect(201);
    await manager.patch(`/pets/${petId}/access-grants/${ok.body.id}`).send({ expiresAt: new Date(managerExpiry.getTime() + DAY).toISOString() }).expect(400);
  });

  it("an owner (no expiry) may still grant open-ended access", async () => {
    await owner.post(`/pets/${petId}/access-grants`).send({ userId: target.id, ...identityOnly }).expect(201);
  });

  it("a grant's reason is fixed, and system reasons can't be used", async () => {
    const created = await owner.post(`/pets/${petId}/access-grants`).send({ userId: target.id, ...identityOnly, reason: "Pet sitter" }).expect(201);
    await owner.patch(`/pets/${petId}/access-grants/${created.body.id}`).send({ reason: "Something else" }).expect(400);
    await owner.patch(`/pets/${petId}/access-grants/${created.body.id}`).send({ reason: "Pet sitter", canEditIdentity: true }).expect(200);

    const booking = await db.petAccessGrant.create({ data: { petId, userId: target.id, source: PetAccessSource.TEMPORARY, reason: "VET_BOOKING", canViewIdentity: true, canViewHealth: true, expiresAt: new Date(Date.now() + DAY) } });
    await owner.patch(`/pets/${petId}/access-grants/${booking.id}`).send({ reason: "unlocked" }).expect(400);
    expect((await db.petAccessGrant.findUniqueOrThrow({ where: { id: booking.id } })).reason).toBe("VET_BOOKING");

    await owner.post(`/pets/${petId}/access-grants`).send({ userId: target.id, ...identityOnly, reason: "VET_BOOKING" }).expect(400);
    await owner.post(`/pets/${petId}/access-grants`).send({ userId: target.id, ...identityOnly, reason: "EXPLICIT_VET_SHARE" }).expect(400);
  });
});
