import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";

type Actor = { id: string; cookie: string; csrf: string };

/** G11: completeness recommendations, selectable public card fields, consented phone, safe finder contact, rotation state, Lost Pet ↔ identity card. */
describe("Pet identity platform", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const send = (m: "post" | "put", a: Actor, u: string) => request(server())[m](u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);
  const pub = (token: string) => request(server()).get(`/public/pet-cards/${token}`);
  let anon: { cookie: string; csrf: string };

  async function actor(name: string): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `g11-${randomUUID()}@example.com` } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }
  async function owner() {
    const o = await actor("owner");
    const hh = (await send("post", o, "/households").send({}).expect(201)).body;
    const pet = (await send("post", o, `/households/${hh.id}/pets`).send({ name: "Tag Dog", species: "DOG", approximateAgeMonths: 30 }).expect(201)).body;
    await db.pet.update({ where: { id: pet.id }, data: { microchipNumber: "985112000000001", breed: "Mixed" } });
    return { o, householdId: hh.id as string, petId: pet.id as string };
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    anon = { csrf, cookie: `petlife_csrf=${csrf}` };
  });
  afterAll(async () => app.close());

  it("completeness returns a deterministic score and the next most useful fields", async () => {
    const { o, petId } = await owner();
    const c = (await get(o, `/pets/${petId}/completeness`).expect(200)).body;
    expect(c.score).toBe(c.completionScore);
    expect(c.completedFields).toEqual(expect.arrayContaining(["species", "breed", "microchip", "birthDate"]));
    expect(c.recommendedNextFields).toEqual(["emergencyContact", "photo", "vaccinationHistory"]);
  });

  it("public card shows only selected fields, never the microchip number, and a phone only with explicit consent", async () => {
    const { o, petId } = await owner();
    await send("post", o, `/pets/${petId}/health/allergies`).send({ name: "Penicillin", reaction: "Hives" }).expect(201);
    await send("post", o, `/pets/${petId}/share-cards`).send({ kind: "ID_TAG", fields: ["PHOTO", "HOME_ADDRESS"] }).expect(400);
    await send("post", o, `/pets/${petId}/share-cards`).send({ kind: "ID_TAG", contactMode: "PHONE", phoneConsent: true }).expect(400); // no emergency phone yet
    const card = (await send("post", o, `/pets/${petId}/share-cards`).send({ kind: "ID_TAG", fields: ["SPECIES", "MICROCHIP_STATUS"] }).expect(201)).body;
    expect(card).toMatchObject({ state: "ACTIVE", contactMode: "IN_APP", visibleFields: ["SPECIES", "MICROCHIP_STATUS"], phoneConsentAt: null });
    expect(card.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(card.token).not.toContain(petId);
    const read = (await pub(card.token).expect(200)).body;
    expect(read).toMatchObject({ name: "Tag Dog", species: "DOG", hasMicrochip: true, microchipNumber: null, emergencyContact: null, contact: { mode: "IN_APP", canMessageOwner: true, emergencyContact: null } });
    for (const k of ["breed", "photoUrl", "allergies", "petId", "householdId"]) expect(read[k]).toBeUndefined();
    expect(JSON.stringify(read)).not.toContain("985112000000001");

    await send("put", o, `/pets/${petId}/emergency-info`).send({ contactName: "Sara", contactPhone: "09120000000" }).expect(200);
    const phone = (await send("post", o, `/pets/${petId}/share-cards`).send({ kind: "EMERGENCY", fields: ["ALLERGIES"], contactMode: "BOTH", phoneConsent: true }).expect(201)).body;
    const em = (await pub(phone.token).expect(200)).body;
    expect(em.allergies.map((a: { name: string }) => a.name)).toEqual(["Penicillin"]);
    expect(em.contact).toMatchObject({ mode: "BOTH", canMessageOwner: true, emergencyContact: { phone: "09120000000" } });

    // Rotation: old token dead and reported as ROTATED; revoke → REVOKED.
    const rotated = (await send("post", o, `/pets/${petId}/share-cards/${card.id}/rotate`).expect(201)).body;
    await pub(card.token).expect(404);
    expect(rotated.visibleFields).toEqual(["SPECIES", "MICROCHIP_STATUS"]);
    await send("post", o, `/pets/${petId}/share-cards/${rotated.id}/revoke`).expect(201);
    const states = Object.fromEntries((await get(o, `/pets/${petId}/share-cards`).expect(200)).body.map((c: { id: string; state: string }) => [c.id, c.state]));
    expect(states[card.id]).toBe("ROTATED");
    expect(states[rotated.id]).toBe("REVOKED");
  });

  it("finders message the owner through the card without learning anything about them; only the owner reads it", async () => {
    const { o, petId } = await owner();
    const stranger = await actor("stranger");
    const card = (await send("post", o, `/pets/${petId}/share-cards`).send({ kind: "ID_TAG" }).expect(201)).body;
    const msg = request(server()).post(`/public/pet-cards/${card.token}/messages`).set("Cookie", anon.cookie).set("x-csrf-token", anon.csrf);
    expect((await msg.send({ message: "Found your dog near the park gate", finderContact: "0912 111 2222" }).expect(201)).body).toEqual({ received: true });
    await request(server()).post(`/public/pet-cards/not-a-real-token-but-long-enough/messages`).set("Cookie", anon.cookie).set("x-csrf-token", anon.csrf).send({ message: "hello there" }).expect(404);
    const inbox = (await get(o, `/pets/${petId}/card-messages`).expect(200)).body;
    expect(inbox[0]).toMatchObject({ message: "Found your dog near the park gate", finderContact: "0912 111 2222", readAt: null });
    await get(stranger, `/pets/${petId}/card-messages`).expect(403);
    await send("post", stranger, `/pets/${petId}/card-messages/${inbox[0].id}/read`).expect(403);
    await send("post", o, `/pets/${petId}/card-messages/${inbox[0].id}/read`).expect(201);
    expect(await db.notification.count({ where: { userId: o.id, type: "pet.card_contact_message" } })).toBe(1);

    // A PHONE-only card does not accept in-app messages.
    await send("put", o, `/pets/${petId}/emergency-info`).send({ contactPhone: "09120000000" }).expect(200);
    const phoneOnly = (await send("post", o, `/pets/${petId}/share-cards`).send({ kind: "ID_TAG", contactMode: "PHONE", phoneConsent: true }).expect(201)).body;
    await request(server()).post(`/public/pet-cards/${phoneOnly.token}/messages`).set("Cookie", anon.cookie).set("x-csrf-token", anon.csrf).send({ message: "Found your dog" }).expect(400);
  });

  it("lost pet: the incident exposes the identity card, the card points back to the incident, sightings reach the owner and the activity feed", async () => {
    const { o, householdId, petId } = await owner();
    const stranger = await actor("stranger");
    const incident = (await send("post", o, `/pets/${petId}/lost-incidents`).send({ description: "Ran off near the park", publicArea: "Vanak", exposeIdentityCard: true }).expect(201)).body;
    expect(incident.identityCardId).toBeTruthy();
    expect(incident.identityCardToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const card = (await pub(incident.identityCardToken).expect(200)).body;
    expect(card).toMatchObject({ isReportedLost: true, lostIncidentId: incident.id });
    const publicIncident = JSON.stringify((await request(server()).get(`/lost-pets/${incident.id}`).expect(200)).body);
    expect(publicIncident).not.toContain(incident.identityCardToken);
    expect(publicIncident).not.toContain(incident.identityCardId);
    expect(publicIncident).not.toContain(householdId);

    await send("post", stranger, `/pets/${petId}/lost-incidents/${incident.id}/identity-card`).send({ expose: false }).expect(403);
    expect((await send("post", o, `/pets/${petId}/lost-incidents/${incident.id}/identity-card`).send({ expose: false }).expect(201)).body.incident.identityCardId).toBeNull();
    // Re-exposing reuses the active card (no new token).
    const again = (await send("post", o, `/pets/${petId}/lost-incidents/${incident.id}/identity-card`).send({ expose: true }).expect(201)).body;
    expect(again).toMatchObject({ identityCardToken: null, incident: { identityCardId: incident.identityCardId } });

    await request(server()).post(`/lost-pets/${incident.id}/sightings`).set("Cookie", anon.cookie).set("x-csrf-token", anon.csrf).send({ seenAt: new Date().toISOString(), description: "Saw it near the bakery" }).expect(201);
    const kinds = (await get(o, `/households/${householdId}/activity`).expect(200)).body.items.map((i: { kind: string }) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(["LOST_REPORTED", "SIGHTING_REPORTED"]));
    expect((await get(o, `/pets/${petId}/lost-incidents/${incident.id}`).expect(200)).body.status).toBe("SIGHTING_REPORTED");
  });
});
