import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";

type Actor = { userId: string; adminUserId?: string; cookie: string; csrf: string };

/** ID-03: a disputed ownership transfer reaches staff (task, queue, list), and staff close it without moving the pet. */
describe("Admin pet ownership disputes", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const post = (a: Actor, u: string) => request(server()).post(u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function person(name: string, role?: AdminRole): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `own-${randomUUID()}@example.com`, emailVerifiedAt: new Date() } });
    const admin = role ? await db.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } }) : null;
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) } });
    const csrf = extractCookie((await request(server()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
    return { userId: user.id, adminUserId: admin?.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }
  async function until<T>(read: () => Promise<T | null>): Promise<T | null> {
    for (let i = 0; i < 30; i++) {
      const v = await read();
      if (v) return v;
      await new Promise((r) => setTimeout(r, 100));
    }
    return null;
  }

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("routes a member's dispute to staff and lets a staff member close it with a reason, notifying both", async () => {
    const owner = await person("Owner Ana");
    const recipient = await person("Recipient Bo");
    const homeA = await db.household.create({ data: { name: "A", members: { create: { userId: owner.userId, role: "OWNER" } } } });
    const homeB = await db.household.create({ data: { name: "B", members: { create: { userId: recipient.userId, role: "OWNER" } } } });
    const pet = await db.pet.create({ data: { householdId: homeA.id, name: "Pishi", species: "CAT" } });
    await db.petOwnership.create({ data: { petId: pet.id, ownerUserId: owner.userId, householdId: homeA.id } });
    const transfer = await db.petOwnershipTransfer.create({ data: { petId: pet.id, fromUserId: owner.userId, toUserId: recipient.userId, fromHouseholdId: homeA.id, toHouseholdId: homeB.id, expiresAt: new Date(Date.now() + 7 * 86_400_000) } });

    // The recipient disputes a pending request: staff get a task and the owner hears about it.
    await post(recipient, `/pet-ownership/transfers/${transfer.id}/dispute`).send({ reason: "This is not my cat" }).expect((r) => expect(r.status).toBeLessThan(300));
    const task = await until(() => db.adminTask.findFirst({ where: { relatedEntityType: "PetOwnershipTransfer", relatedEntityId: transfer.id } }));
    expect(task).toMatchObject({ source: "OWNERSHIP_DISPUTE", priority: "HIGH", status: "OPEN" });
    const notice = await until(() => db.notification.findFirst({ where: { userId: owner.userId, type: "pet.ownership_disputed" } }));
    expect(notice).toMatchObject({ entityId: transfer.id, deepLink: "/profile/household/ownership" });

    // Support can see it (and the queue count), but not close it; an admin can.
    const support = await person("Support", AdminRole.SUPPORT);
    const list = (await get(support, "/admin/pet-ownership/transfers?status=DISPUTED").expect(200)).body;
    const row = list.items.find((r: { id: string }) => r.id === transfer.id);
    expect(row).toMatchObject({ status: "DISPUTED", pet: { name: "Pishi" }, from: { name: "Owner Ana" }, to: { name: "Recipient Bo" }, registeredOwner: { userId: owner.userId }, appliedAt: null });
    expect(list.disputed).toBeGreaterThanOrEqual(1);
    expect((await get(support, "/admin/dashboard").expect(200)).body.openOwnershipDisputes).toBeGreaterThanOrEqual(1);
    expect((await get(support, `/admin/pet-ownership/transfers?q=pishi`).expect(200)).body.items.map((r: { id: string }) => r.id)).toContain(transfer.id);
    await post(support, `/admin/pet-ownership/transfers/${transfer.id}/close-dispute`).send({ reason: "Checked papers" }).expect(403);
    await get(await person("Editor", AdminRole.EDITOR), "/admin/pet-ownership/transfers").expect(403);

    const admin = await person("Admin", AdminRole.ADMIN);
    await post(admin, `/admin/pet-ownership/transfers/${transfer.id}/close-dispute`).send({ reason: "no" }).expect(400);
    const closed = (await post(admin, `/admin/pet-ownership/transfers/${transfer.id}/close-dispute`).send({ reason: "Checked the purchase papers with both" }).expect(201)).body;
    expect(closed).toMatchObject({ status: "CANCELLED", registeredOwner: { userId: owner.userId } });
    expect((await post(admin, `/admin/pet-ownership/transfers/${transfer.id}/close-dispute`).send({ reason: "Again please" }).expect(409)).body.error.details.rule).toBe("OWNERSHIP_NOT_DISPUTED");
    // The pet never moved, the decision is audited with its reason, and both people heard the outcome.
    expect((await db.petOwnership.findUniqueOrThrow({ where: { petId: pet.id } })).ownerUserId).toBe(owner.userId);
    expect((await db.pet.findUniqueOrThrow({ where: { id: pet.id } })).householdId).toBe(homeA.id);
    expect(await db.adminAuditLog.findFirst({ where: { action: "pet_ownership.dispute_closed", entityId: transfer.id } })).toMatchObject({ reason: "Checked the purchase papers with both", adminUserId: admin.adminUserId });
    for (const who of [owner.userId, recipient.userId]) {
      expect(await until(() => db.notification.findFirst({ where: { userId: who, type: "pet.ownership_dispute_closed_owner_stays" } }))).not.toBeNull();
    }
  });
});
