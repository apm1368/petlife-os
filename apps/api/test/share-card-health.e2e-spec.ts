import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { PetAccessSource } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";

type Client = { id: string; post: (u: string) => request.Test };

/**
 * A share card is public. Someone trusted to manage access to a pet, but not to see its health, must not be able
 * to publish allergies, conditions, medications, blood type or critical notes on one — by choosing those fields,
 * by taking the emergency card's defaults, or by rotating a card the owner made with them.
 */
describe("Share cards: health fields need health access", () => {
  let app: INestApplication;
  let db: PrismaService;
  let petId: string, owner: Client, manager: Client;

  async function user(name: string, householdId: string, role: "OWNER" | "FAMILY"): Promise<Client> {
    const u = await db.user.create({ data: { displayName: name, email: `sc-${randomUUID()}@example.com` } });
    await db.householdMember.create({ data: { householdId, userId: u.id, role } });
    const session = await db.session.create({ data: { userId: u.id, expiresAt: new Date(Date.now() + 86400000) } });
    const csrf = extractCookie((await request(app.getHttpServer()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
    const cookie = `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}`;
    return { id: u.id, post: (url) => request(app.getHttpServer()).post(url).set("Cookie", cookie).set("x-csrf-token", csrf) };
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    const hh = await db.household.create({ data: { name: "Card household" } });
    petId = (await db.pet.create({ data: { householdId: hh.id, name: "Pixel", species: "CAT", approximateAgeMonths: 20 } })).id;
    owner = await user("owner", hh.id, "OWNER");
    manager = await user("manager", hh.id, "FAMILY");
    await db.petAccessGrant.create({ data: { petId, userId: owner.id, source: PetAccessSource.HOUSEHOLD, canViewIdentity: true, canEditIdentity: true, canViewHealth: true, canManageAccess: true } });
    await db.petAccessGrant.create({ data: { petId, userId: manager.id, source: PetAccessSource.MANUAL, canViewIdentity: true, canManageAccess: true } });
  });
  afterAll(async () => { await app?.close(); });

  it("a manager without health access can't put health fields on a card, explicitly or by default", async () => {
    for (const fields of [["SPECIES", "ALLERGIES"], ["MEDICATIONS"], ["BLOOD_TYPE"], ["CRITICAL_NOTES"], ["CONDITIONS"]]) {
      const res = await manager.post(`/pets/${petId}/share-cards`).send({ kind: "ID_TAG", fields }).expect(403);
      expect(res.body.error.details.reason).toBe("HEALTH_FIELDS_REQUIRE_HEALTH_ACCESS");
    }
    // The emergency card's defaults include health.
    await manager.post(`/pets/${petId}/share-cards`).send({ kind: "EMERGENCY" }).expect(403);
    expect(await db.petShareCard.count({ where: { petId, createdByUserId: manager.id } })).toBe(0);
  });

  it("identity-only cards stay available to that manager", async () => {
    await manager.post(`/pets/${petId}/share-cards`).send({ kind: "ID_TAG" }).expect(201);
    await manager.post(`/pets/${petId}/share-cards`).send({ kind: "ID_TAG", fields: ["PHOTO", "SPECIES", "MICROCHIP_STATUS"] }).expect(201);
  });

  it("the manager can't rotate the owner's health card (which would re-publish it under their name); the owner can", async () => {
    const card = (await owner.post(`/pets/${petId}/share-cards`).send({ kind: "EMERGENCY" }).expect(201)).body;
    await manager.post(`/pets/${petId}/share-cards/${card.id}/rotate`).expect(403);
    await owner.post(`/pets/${petId}/share-cards/${card.id}/rotate`).expect(201);
  });
});
