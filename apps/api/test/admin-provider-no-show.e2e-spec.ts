import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";

type Actor = { userId: string; cookie: string; csrf: string };

/** A member's "the provider didn't show up" report reaches staff: a task, a queue count and a bookings filter. */
describe("Admin provider no-show reports", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const post = (a: Actor, u: string) => request(server()).post(u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function person(name: string, role?: AdminRole): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `noshow-${randomUUID()}@example.com`, emailVerifiedAt: new Date() } });
    if (role) await db.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) } });
    const csrf = extractCookie((await request(server()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
    return { userId: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("raises a task, counts it on the dashboard and lets staff filter bookings by who didn't show", async () => {
    const owner = await person("Owner Sima");
    const household = await db.household.create({ data: { name: "Sima home", members: { create: { userId: owner.userId, role: "OWNER" } } } });
    const pet = await db.pet.create({ data: { householdId: household.id, name: "Toto", species: "DOG" } });
    const org = await db.providerOrganization.create({ data: { name: `NoShow Clinic ${randomUUID().slice(0, 5)}`, type: "VET_CLINIC", verificationStatus: "VERIFIED" } });
    const location = await db.providerLocation.create({ data: { providerOrganizationId: org.id, addressLine: "Road", city: "Tehran", countryCode: "IR", timezone: "UTC" } });
    const service = await db.providerService.create({ data: { providerOrganizationId: org.id, locationId: location.id, name: "Checkup", type: "GENERAL_VET_VISIT", category: "VET", locationMode: "AT_PROVIDER", durationMinutes: 30 } });
    const booking = await db.booking.create({
      data: {
        householdId: household.id, petId: pet.id, userId: owner.userId, providerOrganizationId: org.id, providerLocationId: location.id, providerServiceId: service.id,
        category: "VET", locationMode: "AT_PROVIDER", startAt: new Date(Date.now() - 40 * 60_000), endAt: new Date(Date.now() - 10 * 60_000), timezone: "UTC", bookingStatus: "CONFIRMED",
      },
    });

    await post(owner, `/bookings/${booking.id}/report-provider-no-show`).expect(201);
    let task = null;
    for (let i = 0; i < 30 && !task; i++) {
      task = await db.adminTask.findFirst({ where: { source: "PROVIDER_NO_SHOW", relatedEntityId: booking.id } });
      if (!task) await new Promise((r) => setTimeout(r, 100));
    }
    expect(task).toMatchObject({ relatedEntityType: "Booking", priority: "HIGH", status: "OPEN" });

    const support = await person("Support", AdminRole.SUPPORT);
    expect((await get(support, "/admin/dashboard").expect(200)).body.openProviderNoShows).toBeGreaterThanOrEqual(1);
    const reported = (await get(support, "/admin/service-bookings?noShowParty=PROVIDER").expect(200)).body.items;
    expect(reported.find((b: { id: string }) => b.id === booking.id)).toMatchObject({ status: "NO_SHOW", noShowParty: "PROVIDER" });
    expect((await get(support, "/admin/service-bookings?noShowParty=OWNER").expect(200)).body.items.map((b: { id: string }) => b.id)).not.toContain(booking.id);
    await get(support, "/admin/service-bookings?noShowParty=SOMEONE").expect(400);
    expect((await get(await person("Editor", AdminRole.EDITOR), "/admin/dashboard").expect(200)).body.openProviderNoShows).toBeNull();

    // Once staff finish the task, it leaves the queue.
    const before = (await get(support, "/admin/dashboard").expect(200)).body.openProviderNoShows;
    await db.adminTask.update({ where: { id: task!.id }, data: { status: "DONE" } });
    expect((await get(support, "/admin/dashboard").expect(200)).body.openProviderNoShows).toBe(before - 1);
  });
});
