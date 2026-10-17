import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { NotificationCategory, ProviderServiceType, ServiceCategory, SubscriptionStatus } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { grantPlanFeatures } from "./plan-features";
import { TrialEndingNotifier } from "../src/modules/subscriptions/trial-ending.notifier";
import { TripReminderNotifier } from "../src/modules/travel/trip-reminder.notifier";

type Actor = { id: string; cookie: string; csrf: string };

/** G9: notification groups/grouping/bulk read/digest prefs, subscription summary + downgrade preview, activity feed, automations. */
describe("Notifications, activity and subscription coherence", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const send = (m: "post" | "put" | "delete", a: Actor, u: string) => request(server())[m](u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function actor(name: string): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `g9-${randomUUID()}@example.com` } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }
  async function household() {
    const owner = await actor("owner");
    const hh = (await send("post", owner, "/households").send({}).expect(201)).body;
    const pet = (await send("post", owner, `/households/${hh.id}/pets`).send({ name: "Feed Dog", species: "DOG", approximateAgeMonths: 30 }).expect(201)).body;
    return { owner, householdId: hh.id as string, petId: pet.id as string };
  }
  const note = (userId: string, type: string, category: NotificationCategory, entity?: [string, string]) =>
    db.notification.create({ data: { userId, type, category, title: type, body: type, locale: "fa", ...(entity ? { entityType: entity[0], entityId: entity[1] } : {}) } });

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("groups, server-side grouping, bulk and group read stay scoped to the caller; digest preferences are stored", async () => {
    const a = await actor("a");
    const b = await actor("b");
    const conv = randomUUID();
    await note(a.id, "clinic.reminder", "HEALTH");
    await note(a.id, "health.reminder", "HEALTH");
    for (let i = 0; i < 3; i++) await note(a.id, "community.chat_message", "COMMUNITY", ["ChatConversation", conv]);
    await note(a.id, "community.chat_message", "COMMUNITY", ["ChatConversation", randomUUID()]);
    await note(a.id, "booking.confirmed", "BOOKING", ["Booking", randomUUID()]);
    await note(b.id, "community.chat_message", "COMMUNITY", ["ChatConversation", conv]);

    const care = (await get(a, "/notifications?group=CARE").expect(200)).body;
    expect(care.items.map((n: { type: string; group: string }) => [n.type, n.group])).toEqual([["health.reminder", "CARE"]]);
    expect((await get(a, "/notifications?group=CLINIC").expect(200)).body.items).toHaveLength(1);
    await get(a, "/notifications?group=NOPE").expect(400);

    const grouped = (await get(a, "/notifications/grouped").expect(200)).body;
    const chat = grouped.find((g: { entityId: string }) => g.entityId === conv);
    expect(chat).toMatchObject({ group: "COMMUNITY", groupCount: 3, unreadCount: 3, deepLink: null });
    expect(grouped.filter((g: { type: string }) => g.type === "community.chat_message")).toHaveLength(2);

    // b can't touch a's group through the group key.
    expect((await send("post", b, "/notifications/groups/read").send({ groupKey: chat.groupKey }).expect(201)).body.updatedCount).toBe(1);
    expect((await get(a, "/notifications/grouped").expect(200)).body.find((g: { entityId: string }) => g.entityId === conv).unreadCount).toBe(3);
    expect((await send("post", a, "/notifications/groups/read").send({ groupKey: chat.groupKey }).expect(201)).body.updatedCount).toBe(3);
    expect((await send("post", a, "/notifications/read-all?group=CARE").expect(201)).body.updatedCount).toBe(1);
    expect((await get(a, "/notifications/unread-count").expect(200)).body.unreadCount).toBe(3);

    const prefs = (await get(a, "/notification-preferences/digest").expect(200)).body;
    expect(prefs.deliveryStatus).toBe("STORED_ONLY");
    expect(prefs.groups.every((g: { mode: string }) => g.mode === "INSTANT")).toBe(true);
    expect((await send("put", a, "/notification-preferences/digest").send({ group: "COMMUNITY", mode: "DAILY" }).expect(200)).body.groups.find((g: { group: string }) => g.group === "COMMUNITY").mode).toBe("DAILY");
    await send("put", a, "/notification-preferences/digest").send({ group: "COMMUNITY", mode: "HOURLY" }).expect(400);
    expect((await get(b, "/notification-preferences/digest").expect(200)).body.groups.find((g: { group: string }) => g.group === "COMMUNITY").mode).toBe("INSTANT");
  });

  it("subscription summary is server-derived; the trial-ending notice goes out once; downgrade preview never deletes", async () => {
    const h = await household();
    await grantPlanFeatures(db, h.householdId, ["care.reminders", "vet.share"]);
    const endsAt = new Date(Date.now() + 36 * 3600e3);
    await db.subscription.update({ where: { householdId: h.householdId }, data: { status: SubscriptionStatus.TRIALING, trialEndsAt: endsAt } });
    const summary = (await get(h.owner, `/households/${h.householdId}/subscription/summary`).expect(200)).body;
    expect(summary.trial).toMatchObject({ endsAt: endsAt.toISOString(), daysRemaining: 2 });
    expect(summary.usage.some((u: { key: string; used: number }) => u.key === "pets.max" && u.used === 1)).toBe(true);

    const notifier = app.get(TrialEndingNotifier);
    await notifier.process();
    await notifier.process();
    expect(await db.notification.count({ where: { userId: h.owner.id, type: "subscription.trial_ending", deepLink: "/profile/membership" } })).toBe(1);

    for (let i = 0; i < 3; i++) await db.householdMember.create({ data: { householdId: h.householdId, userId: (await actor(`m${i}`)).id, role: "FAMILY" } });
    const free = await db.subscriptionPlan.findFirstOrThrow({ where: { isFree: true } });
    const preview = (await get(h.owner, `/households/${h.householdId}/subscription/downgrade-preview?planCode=${free.code}`).expect(200)).body;
    expect(preview.dataDeleted).toBe(false);
    expect(preview.overLimitResources).toEqual(expect.arrayContaining([{ resource: "household.members.max", usage: 4, targetLimit: 2, behavior: "EXISTING_READABLE_NEW_CREATION_BLOCKED" }]));
    expect(preview.lostFeatures.map((f: { feature: string }) => f.feature)).toEqual(expect.arrayContaining(["care.reminders", "vet.share"]));
    await get(h.owner, `/households/${h.householdId}/subscription/downgrade-preview?planCode=nope`).expect(404);
    const stranger = await actor("stranger");
    await get(stranger, `/households/${h.householdId}/subscription/summary`).expect(403);
  });

  it("activity feed: real events, per-pet access filtering (health hidden from identity-only members), cursor pagination", async () => {
    const h = await household();
    await send("post", h.owner, `/pets/${h.petId}/health/allergies`).send({ name: "Pollen" }).expect(201);
    await send("post", h.owner, `/pets/${h.petId}/trips`).send({ originCountry: "IR", destinationCountry: "TR", departAt: new Date(Date.now() + 30 * 86400e3).toISOString() }).expect(201);
    await send("post", h.owner, `/households/${h.householdId}/pets`).send({ name: "Second", species: "CAT", approximateAgeMonths: 10 }).expect(201);

    const all = (await get(h.owner, `/households/${h.householdId}/activity`).expect(200)).body;
    const kinds = all.items.map((i: { kind: string }) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(["PET_ADDED", "HEALTH_RECORD_ADDED", "TRIP_CREATED"]));
    const added = all.items.find((i: { kind: string }) => i.kind === "PET_ADDED");
    expect(added).toMatchObject({ messageKey: "activity.PET_ADDED", actor: { isMe: true } });
    expect(Object.keys(added)).not.toContain("payload");

    const viewer = await actor("viewer");
    await db.householdMember.create({ data: { householdId: h.householdId, userId: viewer.id, role: "FAMILY" } });
    await db.petAccessGrant.create({ data: { petId: h.petId, userId: viewer.id, canViewIdentity: true } });
    const seen = (await get(viewer, `/households/${h.householdId}/activity`).expect(200)).body.items;
    expect(seen.map((i: { kind: string }) => i.kind)).not.toContain("HEALTH_RECORD_ADDED");
    expect(seen.every((i: { petId: string }) => i.petId === h.petId)).toBe(true);

    const p1 = (await get(h.owner, `/households/${h.householdId}/activity?limit=2`).expect(200)).body;
    expect(p1.items).toHaveLength(2);
    const p2 = (await get(h.owner, `/households/${h.householdId}/activity?limit=2&cursor=${p1.nextCursor}`).expect(200)).body;
    expect(p2.items.map((i: { id: string }) => i.id)).not.toEqual(expect.arrayContaining(p1.items.map((i: { id: string }) => i.id)));
    await get(h.owner, `/households/${h.householdId}/activity?cursor=garbage`).expect(400);
    const stranger = await actor("stranger");
    await get(stranger, `/households/${h.householdId}/activity`).expect(403);
  });

  it("automations: a completed booking invites a review once; an approaching trip reminds once", async () => {
    const h = await household();
    const org = await db.providerOrganization.create({ data: { name: "Groom", type: "GROOMER", verificationStatus: "VERIFIED" } });
    const loc = await db.providerLocation.create({ data: { providerOrganizationId: org.id, addressLine: "x", city: "x", countryCode: "IR", timezone: "UTC" } });
    const staff = await actor("staff");
    await db.providerUser.create({ data: { userId: staff.id, providerOrganizationId: org.id, role: "OWNER" } });
    const svc = await db.providerService.create({ data: { providerOrganizationId: org.id, locationId: loc.id, name: "Bath", type: ProviderServiceType.GROOMING_SESSION, category: ServiceCategory.GROOMING, durationMinutes: 30, priceAmount: 1, currency: "IRR" } });
    const b = await db.booking.create({ data: { householdId: h.householdId, petId: h.petId, userId: h.owner.id, providerOrganizationId: org.id, providerLocationId: loc.id, providerServiceId: svc.id, category: "GROOMING", locationMode: "AT_PROVIDER", startAt: new Date(), endAt: new Date(Date.now() + 1800e3), timezone: "UTC", bookingStatus: "IN_PROGRESS" } });
    await send("post", staff, `/provider/bookings/${b.id}/complete`).send({}).expect(201);
    expect(await db.notification.count({ where: { userId: h.owner.id, type: "booking.review_invite", deepLink: `/bookings/${b.id}` } })).toBe(1);

    const trip = (await send("post", h.owner, `/pets/${h.petId}/trips`).send({ originCountry: "IR", destinationCountry: "TR", departAt: new Date(Date.now() + 2 * 86400e3).toISOString() }).expect(201)).body;
    await send("post", h.owner, `/pets/${h.petId}/trips/${trip.id}/checklist/defaults`).expect(201);
    const reminders = app.get(TripReminderNotifier);
    await reminders.process();
    await reminders.process();
    const n = await db.notification.findMany({ where: { userId: h.owner.id, type: "travel.trip_approaching" } });
    expect(n).toHaveLength(1);
    expect(n[0]!.body).toContain("6");
  });
});
