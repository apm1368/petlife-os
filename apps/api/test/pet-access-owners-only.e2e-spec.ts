import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { HouseholdRole } from "@prisma/client";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";

/**
 * Decision 3 (owner + PM): a new pet gives automatic access to household OWNERs only. Membership alone
 * never implies health, location, documents, emergency sharing or care management. A FAMILY member who
 * creates a pet gets identity only (see + edit the profile); every other member sees nothing until an
 * owner grants it explicitly.
 */
describe("New-pet access: owners only", () => {
  let app: INestApplication, db: PrismaService, csrf: string;
  let householdId: string;
  type Client = { id: string; get: (p: string) => request.Test; post: (p: string) => request.Test; put: (p: string) => request.Test; patch: (p: string) => request.Test };
  let owner: Client, creator: Client, bystander: Client;

  async function member(name: string, role: HouseholdRole): Promise<Client> {
    const user = await db.user.create({ data: { displayName: name, email: `${name}-${randomUUID()}@example.com` } });
    await db.householdMember.create({ data: { householdId, userId: user.id, role } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const cookie = `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}`;
    const server = app.getHttpServer();
    const withAuth = (t: request.Test) => t.set("Cookie", cookie).set("x-csrf-token", csrf);
    return {
      id: user.id,
      get: (p) => withAuth(request(server).get(p)),
      post: (p) => withAuth(request(server).post(p)),
      put: (p) => withAuth(request(server).put(p)),
      patch: (p) => withAuth(request(server).patch(p)),
    };
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    csrf = extractCookie((await request(app.getHttpServer()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
    householdId = (await db.household.create({ data: { name: "Access household" } })).id;
    owner = await member("owner", HouseholdRole.OWNER);
    creator = await member("creator", HouseholdRole.FAMILY);
    bystander = await member("bystander", HouseholdRole.FAMILY);
  });
  afterAll(async () => { await app?.close(); });

  it("owner-created pet: the owner gets everything, other members get nothing", async () => {
    const petId = (await owner.post(`/households/${householdId}/pets`).send({ name: "OwnersPet", species: "DOG", approximateAgeMonths: 12 }).expect(201)).body.id;

    const access = (await owner.get(`/pets/${petId}/access`).expect(200)).body;
    expect(access).toMatchObject({ canViewIdentity: true, canViewHealth: true, canViewLocation: true, canManageAccess: true });
    await owner.get(`/pets/${petId}/health/summary`).expect(200);

    for (const other of [creator, bystander]) {
      await other.get(`/pets/${petId}`).expect(403);
      await other.get(`/pets/${petId}/health/summary`).expect(403);
      const listed = (await other.get(`/households/${householdId}/pets`).expect(200)).body as Array<{ id: string }>;
      expect(listed.map((p) => p.id)).not.toContain(petId);
    }
    expect(await db.petAccessGrant.count({ where: { petId, userId: { in: [creator.id, bystander.id] } } })).toBe(0);
  });

  it("FAMILY-created pet: the creator sees and edits identity only; owners get everything; the other member nothing", async () => {
    const petId = (await creator.post(`/households/${householdId}/pets`).send({ name: "FamilyPet", species: "CAT", approximateAgeMonths: 6 }).expect(201)).body.id;

    await creator.get(`/pets/${petId}`).expect(200);
    await creator.patch(`/pets/${petId}`).send({ name: "FamilyPet renamed" }).expect(200);
    const access = (await creator.get(`/pets/${petId}/access`).expect(200)).body;
    expect(access).toMatchObject({
      canViewIdentity: true, canEditIdentity: true,
      canViewHealth: false, canEditHealth: false, canViewLocation: false, canBookCare: false,
      canViewCareProfile: false, canEditCareProfile: false, canManageAccess: false,
    });
    await creator.get(`/pets/${petId}/health/summary`).expect(403);

    expect((await owner.get(`/pets/${petId}/access`).expect(200)).body).toMatchObject({ canViewHealth: true, canManageAccess: true });

    await bystander.get(`/pets/${petId}`).expect(403);
    const listed = (await bystander.get(`/households/${householdId}/pets`).expect(200)).body as Array<{ id: string }>;
    expect(listed.map((p) => p.id)).not.toContain(petId);
  });

  it("Home never returns an active pet the caller can't see, even with a stale preference", async () => {
    const petId = (await owner.post(`/households/${householdId}/pets`).send({ name: "StalePref", species: "DOG", approximateAgeMonths: 3 }).expect(201)).body.id;
    await db.activePetPreference.upsert({
      where: { userId_householdId: { userId: bystander.id, householdId } },
      update: { petId },
      create: { userId: bystander.id, householdId, petId },
    });
    const home = (await bystander.get("/home").expect(200)).body;
    expect(home.activePet).toBeNull();
  });
});
