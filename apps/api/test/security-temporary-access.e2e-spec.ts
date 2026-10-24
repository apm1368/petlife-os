import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";

/**
 * Security finding F — a temporary grant gives access only inside its window. The claim was that some
 * permission paths check revokedAt and ignore expiresAt; every effective-permission path goes through
 * PetAccessService.getEffectivePermissions (isGrantActive: revoked, startsAt, expiresAt). This spec
 * proves it on real guarded routes for each grant state, including a booking whose visit has ended.
 */
describe("Security: temporary pet access windows (finding F)", () => {
  let app: INestApplication;
  let db: PrismaService;
  let petId: string;
  const actors: Record<string, { cookie: string }> = {};
  const hour = 3_600_000;
  const at = (ms: number) => new Date(Date.now() + ms);

  type GrantShape = { startsAt?: Date; expiresAt?: Date; revokedAt?: Date; reason?: string };
  const STATES: Record<string, GrantShape> = {
    TEMP_VALID: { startsAt: at(-hour), expiresAt: at(hour) },
    TEMP_NOT_STARTED: { startsAt: at(hour), expiresAt: at(2 * hour) },
    TEMP_EXPIRED: { startsAt: at(-2 * hour), expiresAt: at(-1000) },
    TEMP_REVOKED: { startsAt: at(-hour), expiresAt: at(hour), revokedAt: at(-1000) },
    BOOKING_ACTIVE: { startsAt: at(-hour), expiresAt: at(hour), reason: "VET_BOOKING" },
    BOOKING_ENDED: { startsAt: at(-3 * hour), expiresAt: at(-hour), reason: "VET_BOOKING" },
  };

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    const household = await db.household.create({ data: { name: "خانوادهٔ آزمون دسترسی موقت" } });
    petId = (await db.pet.create({ data: { householdId: household.id, name: "نخودی", species: "DOG" } })).id;
    for (const [name, shape] of Object.entries(STATES)) {
      const user = await db.user.create({ data: { displayName: name, email: `f-${randomUUID()}@example.com` } });
      await db.petAccessGrant.create({
        data: { petId, userId: user.id, source: "TEMPORARY", canViewIdentity: true, canViewHealth: true, canRecordClinicalData: Boolean(shape.reason), ...shape },
      });
      const session = await db.session.create({ data: { userId: user.id, expiresAt: at(24 * hour) } });
      const csrf = extractCookie((await request(app.getHttpServer()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
      actors[name] = { cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
    }
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (actor: string, url: string) => request(app.getHttpServer()).get(url).set("Cookie", actors[actor]!.cookie);

  it("a grant inside its window reads identity and health", async () => {
    await get("TEMP_VALID", `/pets/${petId}`).expect(200);
    await get("TEMP_VALID", `/pets/${petId}/health/timeline`).expect(200);
  });

  it.each(["TEMP_NOT_STARTED", "TEMP_EXPIRED", "TEMP_REVOKED", "BOOKING_ENDED"])("%s has no effective permission on any route", async (actor) => {
    await get(actor, `/pets/${petId}`).expect(403);
    await get(actor, `/pets/${petId}/overview`).expect(403);
    await get(actor, `/pets/${petId}/health/timeline`).expect(403);
    await get(actor, `/pets/${petId}/health/documents`).expect(403);
  });

  it("a live booking grant reaches identity but never health without recorded owner consent", async () => {
    await get("BOOKING_ACTIVE", `/pets/${petId}`).expect(200);
    await get("BOOKING_ACTIVE", `/pets/${petId}/health/timeline`).expect(403);
  });

  it("the same grant stops working the moment it expires — no cleanup job is needed for enforcement", async () => {
    const grant = await db.petAccessGrant.findFirstOrThrow({ where: { petId, user: { displayName: "TEMP_VALID" } } });
    await db.petAccessGrant.update({ where: { id: grant.id }, data: { expiresAt: at(-1) } });
    await get("TEMP_VALID", `/pets/${petId}`).expect(403);
    await db.petAccessGrant.update({ where: { id: grant.id }, data: { expiresAt: at(hour) } });
  });
});
