import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import {
  AdminMembershipStatus,
  AdminRole,
  HouseholdRole,
  ProviderType,
  ProviderUserRole,
  SellerMembershipRole,
  SellerMembershipStatus,
} from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";

type Actor = { id: string; cookie: string; csrf: string };

/**
 * W2-5. One row per person, whatever hats they wear, with their roles, linked businesses and the
 * coarse last-active stamp. Gated on customer.view. Everything runs through the HTTP API.
 */
describe("Admin users directory (W2-5)", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);

  async function user(name: string): Promise<string> {
    return (await db.user.create({ data: { displayName: name, email: `w2-5-${randomUUID()}@example.com` } })).id;
  }
  async function actor(role?: AdminRole): Promise<Actor> {
    const id = await user(`w2-5 ${role ?? "member"}`);
    if (role) await db.adminUser.create({ data: { userId: id, role, status: AdminMembershipStatus.ACTIVE } });
    const session = await db.session.create({ data: { userId: id, expiresAt: new Date(Date.now() + 86_400_000) } });
    const csrf = extractCookie((await request(server()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
    return { id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("refuses an anonymous caller and a non-admin, allows customer.view", async () => {
    await request(server()).get("/admin/users").expect(401);
    const member = await actor();
    await get(member, "/admin/users").expect(403);
    const support = await actor(AdminRole.SUPPORT);
    await get(support, "/admin/users").expect(200);
  });

  it("lists a person with every hat they wear, each with its business", async () => {
    const root = await actor(AdminRole.SUPER_ADMIN);

    const person = await user(`Multi ${randomUUID()}`);
    // customer
    const household = await db.household.create({ data: { name: "Home", city: "Tehran" } });
    await db.householdMember.create({ data: { householdId: household.id, userId: person, role: HouseholdRole.OWNER } });
    // clinic staff
    const clinic = await db.providerOrganization.create({ data: { name: "Mehr Clinic", type: ProviderType.VET_CLINIC } });
    await db.providerUser.create({ data: { userId: person, providerOrganizationId: clinic.id, role: ProviderUserRole.OWNER } });
    // shop staff
    const shop = await db.sellerOrganization.create({ data: { name: "Paw Shop", countryCode: "IR" } });
    await db.sellerMembership.create({ data: { userId: person, sellerOrganizationId: shop.id, role: SellerMembershipRole.OWNER, status: SellerMembershipStatus.ACTIVE } });

    const row = (await get(root, "/admin/users?pageSize=100").expect(200)).body.items.find((r: { id: string }) => r.id === person);
    expect(row).toBeTruthy();
    const kinds = row.roles.map((r: { kind: string }) => r.kind).sort();
    expect(kinds).toEqual(["CLINIC", "CUSTOMER", "SHOP"]);
    const clinicRole = row.roles.find((r: { kind: string }) => r.kind === "CLINIC");
    expect(clinicRole.business).toMatchObject({ name: "Mehr Clinic" });
    const customerRole = row.roles.find((r: { kind: string }) => r.kind === "CUSTOMER");
    expect(customerRole.business).toBeNull();
    expect(row.emailMasked).toContain("*");
  });

  it("filters by role kind", async () => {
    const root = await actor(AdminRole.SUPER_ADMIN);
    const groomerUser = await user(`Groomer ${randomUUID()}`);
    const groomer = await db.providerOrganization.create({ data: { name: "Fluffy Grooming", type: ProviderType.GROOMER } });
    await db.providerUser.create({ data: { userId: groomerUser, providerOrganizationId: groomer.id, role: ProviderUserRole.STAFF } });

    const groomers = (await get(root, "/admin/users?kind=GROOMER&pageSize=100").expect(200)).body;
    expect(groomers.items.some((r: { id: string }) => r.id === groomerUser)).toBe(true);
    expect(groomers.items.every((r: { roles: { kind: string }[] }) => r.roles.some((x) => x.kind === "GROOMER"))).toBe(true);

    const hosts = (await get(root, "/admin/users?kind=HOST&pageSize=100").expect(200)).body;
    expect(hosts.items.some((r: { id: string }) => r.id === groomerUser)).toBe(false);

    const insurerUser = await user(`Insurer ${randomUUID()}`);
    const insurer = await db.insuranceProvider.create({ data: { name: "Safe Paws", country: "IR" } });
    await db.insurerMembership.create({ data: { userId: insurerUser, providerId: insurer.id } });
    const ngoUser = await user(`NGO ${randomUUID()}`);
    const ngo = await db.animalSupportOrganization.create({ data: { name: "Kind Paws", type: "NGO" } });
    await db.animalSupportOrgMembership.create({ data: { userId: ngoUser, organizationId: ngo.id } });

    const insurers = (await get(root, "/admin/users?kind=INSURER&pageSize=100").expect(200)).body;
    expect(insurers.items.some((r: { id: string }) => r.id === insurerUser)).toBe(true);
    const ngos = (await get(root, "/admin/users?kind=NGO&pageSize=100").expect(200)).body;
    expect(ngos.items.some((r: { id: string }) => r.id === ngoUser)).toBe(true);
  });

  it("searches by display name", async () => {
    const root = await actor(AdminRole.SUPER_ADMIN);
    const needle = `Unique${randomUUID().slice(0, 8)}`;
    const target = await user(needle);
    const found = (await get(root, `/admin/users?q=${needle}`).expect(200)).body;
    expect(found.items).toHaveLength(1);
    expect(found.items[0].id).toBe(target);
  });

  it("returns the complete bounded profile contract", async () => {
    const root = await actor(AdminRole.SUPER_ADMIN);
    const owner = await user(`Owner ${randomUUID()}`);
    const household = await db.household.create({ data: { name: "Family", city: "Tehran" } });
    await db.householdMember.create({ data: { householdId: household.id, userId: owner, role: HouseholdRole.OWNER } });
    await db.pet.create({ data: { householdId: household.id, name: "Rex", species: "DOG" } });
    await db.pet.create({ data: { householdId: household.id, name: "Mia", species: "CAT" } });
    const clinic = await db.providerOrganization.create({ data: { name: "Profile Clinic", type: ProviderType.VET_CLINIC } });
    await db.providerUser.create({ data: { userId: owner, providerOrganizationId: clinic.id, role: ProviderUserRole.VET } });
    const rootAdmin = await db.adminUser.findUniqueOrThrow({ where: { userId: root.id } });
    await db.adminAuditLog.create({ data: { adminUserId: rootAdmin.id, action: "profile.test", entityType: "USER", entityId: owner, reason: "Profile contract test" } });

    const profile = (await get(root, `/admin/users/${owner}`).expect(200)).body;
    expect(profile.user.roles.map((r: { kind: string }) => r.kind).sort()).toEqual(["CLINIC", "CUSTOMER"]);
    expect(profile.households[0]).toMatchObject({ id: household.id, memberCount: 1 });
    expect(profile.households[0].pets.map((pet: { name: string }) => pet.name).sort()).toEqual(["Mia", "Rex"]);
    expect(profile.businesses).toContainEqual(expect.objectContaining({ id: clinic.id, kind: "CLINIC", name: "Profile Clinic" }));
    expect(profile).toEqual(expect.objectContaining({ orders: expect.any(Array), requests: expect.any(Array), tickets: expect.any(Array), reviews: expect.any(Array) }));
    expect(profile.auditTrail[0]).toMatchObject({ action: "profile.test", reason: "Profile contract test" });
    expect(profile.householdCount).toBe(1);
    expect(profile.petCount).toBe(2);
  });

  it("404s an unknown user id", async () => {
    const root = await actor(AdminRole.SUPER_ADMIN);
    await get(root, `/admin/users/${randomUUID()}`).expect(404);
  });
});
