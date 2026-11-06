import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { HouseholdRole } from "@prisma/client";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";

/**
 * The household & pet-ownership flow end to end (ID-01, ID-02, ID-03, ID-05, ID-07).
 *
 * These are the decisions that decide who owns a pet and what follows it when it
 * moves. They are exercised through the real HTTP surface and the real database,
 * because the whole point of the module is that a pet never changes hands without
 * both parties agreeing — a rule that only holds in the service layer would not
 * hold in the product.
 */
describe("Pet ownership transfer", () => {
  let app: INestApplication, db: PrismaService, csrf: string;
  type Client = { id: string; get: (p: string) => request.Test; post: (p: string) => request.Test };
  let owner: Client, recipient: Client, stranger: Client;
  let ownerHouseholdId: string, recipientHouseholdId: string;

  async function user(name: string, householdId: string, role: HouseholdRole): Promise<Client> {
    const row = await db.user.create({ data: { displayName: name, email: `${name}-${randomUUID()}@example.com` } });
    await db.householdMember.create({ data: { householdId, userId: row.id, role } });
    const session = await db.session.create({ data: { userId: row.id, expiresAt: new Date(Date.now() + 86400000) } });
    const cookie = `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}`;
    const server = app.getHttpServer();
    const withAuth = (t: request.Test) => t.set("Cookie", cookie).set("x-csrf-token", csrf);
    return { id: row.id, get: (p) => withAuth(request(server).get(p)), post: (p) => withAuth(request(server).post(p)) };
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    csrf = extractCookie((await request(app.getHttpServer()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
    ownerHouseholdId = (await db.household.create({ data: { name: "Owner's home" } })).id;
    recipientHouseholdId = (await db.household.create({ data: { name: "Recipient's home" } })).id;
    owner = await user("owner", ownerHouseholdId, HouseholdRole.OWNER);
    recipient = await user("recipient", recipientHouseholdId, HouseholdRole.OWNER);
    stranger = await user("stranger", ownerHouseholdId, HouseholdRole.FAMILY);
  });
  afterAll(async () => { await app?.close(); });

  async function createPet(name: string): Promise<string> {
    return (await owner.post(`/households/${ownerHouseholdId}/pets`).send({ name, species: "DOG", approximateAgeMonths: 24 }).expect(201)).body.id;
  }

  it("records the primary owner explicitly when the pet is created (ID-01)", async () => {
    const petId = await createPet("Owned");

    const ownership = (await owner.get(`/pet-ownership/pets/${petId}`).expect(200)).body;
    expect(ownership.ownerUserId).toBe(owner.id);
    expect(ownership.householdId).toBe(ownerHouseholdId);

    const owned = (await owner.get("/pet-ownership/pets").expect(200)).body as Array<{ petId: string }>;
    expect(owned.map((pet) => pet.petId)).toContain(petId);
  });

  it("does not reveal a pet's owner to an unrelated account", async () => {
    const petId = await createPet("Private");

    // Ownership is not public: a signed-in stranger learns nothing about who
    // owns somebody else's pet.
    const seen = await stranger.get(`/pet-ownership/pets/${petId}`);
    expect(seen.status).toBe(404);
    expect(seen.body).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("does not move the pet until the recipient approves (ID-01)", async () => {
    const petId = await createPet("Pending");

    const transfer = (await owner.post(`/pet-ownership/pets/${petId}/transfers`).send({ toUserId: recipient.id }).expect(201)).body;
    expect(transfer.status).toBe("PENDING_REVIEW");

    // Nothing has moved yet.
    const pet = await db.pet.findUniqueOrThrow({ where: { id: petId } });
    expect(pet.householdId).toBe(ownerHouseholdId);
    expect((await db.petOwnership.findUniqueOrThrow({ where: { petId } })).ownerUserId).toBe(owner.id);

    // The recipient sees it waiting.
    const incoming = (await recipient.get("/pet-ownership/transfers/incoming").expect(200)).body as Array<{ id: string; petId: string }>;
    expect(incoming.map((item) => item.petId)).toContain(petId);
  });

  it("moves the pet, its ownership and its access once the recipient approves (ID-01, ID-05, ID-06)", async () => {
    const petId = await createPet("Moving");
    await db.petMemory.create({ data: { petId, householdId: ownerHouseholdId, createdByUserId: owner.id, type: "PHOTO", occurredAt: new Date() } });
    await db.petExpense.create({ data: { petId, householdId: ownerHouseholdId, createdByUserId: owner.id, category: "FOOD", amountIrr: 500_000, spentOn: new Date() } });

    const transfer = (await owner.post(`/pet-ownership/pets/${petId}/transfers`).send({ toUserId: recipient.id, memoryDisposition: "TRANSFER" }).expect(201)).body;
    const outcome = (await recipient.post(`/pet-ownership/transfers/${transfer.id}/accept`).expect(201)).body;

    expect(outcome.transfer.status).toBe("ACCEPTED");
    expect(outcome.ownership.ownerUserId).toBe(recipient.id);
    expect(outcome.householdId).toBe(recipientHouseholdId);
    // The health record travelled with the pet.
    expect(outcome.movedHealthRecords).toBe(true);
    // The memories moved because the previous owner chose TRANSFER.
    expect(outcome.movedMemories).toBe(1);
    // The costs did NOT travel — they stayed with the household that paid them.
    expect(outcome.retainedExpenses).toBe(1);

    const pet = await db.pet.findUniqueOrThrow({ where: { id: petId } });
    expect(pet.householdId).toBe(recipientHouseholdId);
    const memory = await db.petMemory.findFirstOrThrow({ where: { petId } });
    expect(memory.householdId).toBe(recipientHouseholdId);
    const expense = await db.petExpense.findFirstOrThrow({ where: { petId } });
    expect(expense.householdId).toBe(ownerHouseholdId);
  });

  it("gives the new owner access to the pet and ends the previous owner's owner grant", async () => {
    const petId = await createPet("Access");
    const transfer = (await owner.post(`/pet-ownership/pets/${petId}/transfers`).send({ toUserId: recipient.id }).expect(201)).body;
    await recipient.post(`/pet-ownership/transfers/${transfer.id}/accept`).expect(201);

    // The new owner can open the pet and its health.
    await recipient.get(`/pets/${petId}`).expect(200);
    await recipient.get(`/pets/${petId}/health/summary`).expect(200);
    // The previous owner no longer holds the owner-level grant.
    const grants = await db.petAccessGrant.findMany({ where: { petId, userId: owner.id, revokedAt: null, canManageAccess: true } });
    expect(grants).toHaveLength(0);
  });

  it("keeps the registered owner when the recipient declines (ID-03)", async () => {
    const petId = await createPet("Declined");
    const transfer = (await owner.post(`/pet-ownership/pets/${petId}/transfers`).send({ toUserId: recipient.id }).expect(201)).body;

    const declined = (await recipient.post(`/pet-ownership/transfers/${transfer.id}/decline`).send({ reason: "not now" }).expect(201)).body;
    expect(declined.status).toBe("DECLINED");

    expect((await db.pet.findUniqueOrThrow({ where: { id: petId } })).householdId).toBe(ownerHouseholdId);
    expect((await db.petOwnership.findUniqueOrThrow({ where: { petId } })).ownerUserId).toBe(owner.id);
  });

  it("records a dispute without moving the pet (ID-03)", async () => {
    const petId = await createPet("Disputed");
    const transfer = (await owner.post(`/pet-ownership/pets/${petId}/transfers`).send({ toUserId: recipient.id }).expect(201)).body;

    const disputed = (await recipient.post(`/pet-ownership/transfers/${transfer.id}/dispute`).send({ reason: "we disagree" }).expect(201)).body;
    expect(disputed.status).toBe("DISPUTED");

    // ID-03: the platform does not judge; the registered owner stays.
    expect((await db.pet.findUniqueOrThrow({ where: { id: petId } })).householdId).toBe(ownerHouseholdId);
    expect((await db.petOwnership.findUniqueOrThrow({ where: { petId } })).ownerUserId).toBe(owner.id);
  });

  it("refuses a proposal from anyone but the registered owner", async () => {
    const petId = await createPet("Guarded");
    await stranger.post(`/pet-ownership/pets/${petId}/transfers`).send({ toUserId: recipient.id }).expect(403);
    expect(await db.petOwnershipTransfer.count({ where: { petId } })).toBe(0);
  });

  it("refuses a transfer addressed to a stranger", async () => {
    const petId = await createPet("NotForStranger");
    const transfer = (await owner.post(`/pet-ownership/pets/${petId}/transfers`).send({ toUserId: recipient.id }).expect(201)).body;
    await stranger.post(`/pet-ownership/transfers/${transfer.id}/accept`).expect(403);
    expect((await db.petOwnership.findUniqueOrThrow({ where: { petId } })).ownerUserId).toBe(owner.id);
  });

  it("keeps a read-only copy of the memories a separated member recorded (ID-02)", async () => {
    const leaver = await user("leaver", ownerHouseholdId, HouseholdRole.FAMILY);
    const petId = await createPet("Memories");
    const memory = await db.petMemory.create({ data: { petId, householdId: ownerHouseholdId, createdByUserId: leaver.id, type: "STORY", title: "My memory", occurredAt: new Date() } });
    await db.petMemory.create({ data: { petId, householdId: ownerHouseholdId, createdByUserId: owner.id, type: "PHOTO", occurredAt: new Date() } });

    await leaver.post(`/households/${ownerHouseholdId}/leave`).expect(201);

    // The copy points at the original memory, which stays with the pet.
    const copy = await db.petMemoryCopy.findFirstOrThrow({ where: { userId: leaver.id, memoryId: memory.id } });
    expect(copy.petId).toBe(petId);
    const original = await db.petMemory.findUniqueOrThrow({ where: { id: memory.id } });
    expect(original.householdId).toBe(ownerHouseholdId);

    // The separated member can read their own copy back.
    const copies = (await leaver.get("/pet-ownership/memory-copies").expect(200)).body as Array<{ memoryId: string }>;
    expect(copies.map((copy) => copy.memoryId)).toContain(memory.id);
    // And nobody else's.
    const ownerCopies = (await owner.get("/pet-ownership/memory-copies").expect(200)).body as unknown[];
    expect(ownerCopies).toHaveLength(0);
  });
});
