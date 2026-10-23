import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PetSpecies, HouseholdRole } from "@prisma/client";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";

describe("Minimal pet saves and duplicate chip recovery", () => {
  let app: INestApplication, db: PrismaService, csrf: string;
  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    csrf = extractCookie((await request(app.getHttpServer()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
  });
  afterAll(async () => { await app?.close(); });

  async function member() {
    const user = await db.user.create({ data: { displayName: "Minimal test member", email: `minimal-${randomUUID()}@example.com` } });
    const household = await db.household.create({ data: {
      name: "Minimal pet test", members: { create: { userId: user.id, role: HouseholdRole.OWNER } },
    } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 3600000) } });
    const cookie = `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}`;
    const auth = (req: request.Test) => req.set("Cookie", cookie).set("x-csrf-token", csrf);
    return {
      householdId: household.id,
      create: (body: object) => auth(request(app.getHttpServer()).post(`/households/${household.id}/pets`)).send(body),
      update: (id: string, body: object) => auth(request(app.getHttpServer()).patch(`/pets/${id}`)).send(body),
    };
  }

  it.each(Object.values(PetSpecies))("creates %s with only name and species", async (species) => {
    const client = await member();
    const result = await client.create({ name: "کوکی", species }).expect(201);
    expect(result.body).toMatchObject({ name: "کوکی", species, microchipNumber: null, birthDate: null, approximateAgeMonths: null });
    expect(await db.pet.count({ where: { householdId: client.householdId } })).toBe(1);
  });

  it("reports a cross-household normalized duplicate as a field error and rolls back", async () => {
    const first = await member(), second = await member();
    const chip = randomUUID();
    await first.create({ name: "First", species: "CAT", microchipNumber: chip }).expect(201);
    const res = await second.create({ name: "Second", species: "DOG", microchipNumber: chip.replace(/-/g, "").toUpperCase() }).expect(400);
    expect(res.body.error).toMatchObject({ code: "VALIDATION_ERROR", details: { field: "microchipNumber", reason: "MICROCHIP_ALREADY_REGISTERED" } });
    expect(await db.pet.count({ where: { householdId: second.householdId } })).toBe(0);
    await second.create({ name: "Second", species: "DOG" }).expect(201);
  });

  it("rejects a duplicate on update without changing the saved pet", async () => {
    const first = await member(), second = await member();
    const chip = randomUUID();
    await first.create({ name: "First", species: "CAT", microchipNumber: chip }).expect(201);
    const pet = await second.create({ name: "Second", species: "DOG" }).expect(201);
    const res = await second.update(pet.body.id, { name: "Changed", microchipNumber: chip }).expect(400);
    expect(res.body.error.details).toEqual({ field: "microchipNumber", reason: "MICROCHIP_ALREADY_REGISTERED" });
    expect(await db.pet.findUnique({ where: { id: pet.body.id } })).toMatchObject({ name: "Second", microchipNumber: null });
    await second.update(pet.body.id, { microchipNumber: null }).expect(200);
  });

  it.each([{ birthDate: "not-a-date" }, { approximateAgeMonths: -1 }, { species: "UNICORN" }])("rejects invalid input with 400: %j", async (invalid) => {
    const client = await member();
    const res = await client.create({ name: "Invalid", species: "DOG", ...invalid }).expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(await db.pet.count({ where: { householdId: client.householdId } })).toBe(0);
  });

  it("does not let another household edit a pet", async () => {
    const first = await member(), outsider = await member();
    const pet = await first.create({ name: "Private", species: "BIRD" }).expect(201);
    await outsider.update(pet.body.id, { name: "Unauthorized" }).expect(403);
    expect(await db.pet.findUnique({ where: { id: pet.body.id } })).toMatchObject({ name: "Private" });
  });
});
