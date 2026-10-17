import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { LocationMode, ProviderServiceType, ProviderUserRole, ServiceCategory } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { SlotGeneratorService } from "../src/modules/providers/slot-generator.service";

type Actor = { id: string; cookie: string; csrf: string };

/** Services: versioned intake forms answered at booking, private attachments both ways, aftercare instructions. */
describe("Service intake, booking attachments and aftercare", () => {
  let app: INestApplication, db: PrismaService, slots: SlotGeneratorService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const post = (a: Actor, u: string) => request(server()).post(u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);
  const put = (a: Actor, u: string) => request(server()).put(u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);
  const del = (a: Actor, u: string) => request(server()).delete(u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function actor(name: string): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `intake-${randomUUID()}@example.com` } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }
  async function member() {
    const owner = await actor("owner");
    const hh = await db.household.create({ data: { name: "hh", members: { create: { userId: owner.id, role: "OWNER" } } } });
    const pet = await db.pet.create({ data: { householdId: hh.id, name: "Fluffy", species: "DOG", approximateAgeMonths: 30 } });
    await db.petAccessGrant.create({ data: { petId: pet.id, userId: owner.id, canViewIdentity: true, canBookCare: true, canViewCareProfile: true, canManageAccess: true } });
    return { owner, petId: pet.id };
  }
  async function groomer() {
    const org = await db.providerOrganization.create({ data: { name: `Groom ${randomUUID().slice(0, 6)}`, type: "GROOMER", verificationStatus: "VERIFIED" } });
    const location = await db.providerLocation.create({ data: { providerOrganizationId: org.id, addressLine: "St", city: "Tehran", countryCode: "IR", timezone: "UTC" } });
    const staff = await actor("groomer");
    const pu = await db.providerUser.create({ data: { userId: staff.id, providerOrganizationId: org.id, role: ProviderUserRole.OWNER } });
    const service = await db.providerService.create({ data: { providerOrganizationId: org.id, locationId: location.id, name: "Full groom", type: ProviderServiceType.GROOMING_SESSION, category: ServiceCategory.GROOMING, locationMode: LocationMode.AT_PROVIDER, durationMinutes: 60, priceAmount: 1_000_000, currency: "IRR" } });
    await db.providerAvailabilityRule.createMany({ data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ providerOrganizationId: org.id, locationId: location.id, providerUserId: pu.id, dayOfWeek, startLocalTime: "00:00", endLocalTime: "23:30", timezone: "UTC" })) });
    return { org, location, service, staff };
  }
  async function hold(m: Awaited<ReturnType<typeof member>>, g: Awaited<ReturnType<typeof groomer>>, offsetH = 48) {
    const from = new Date(Date.now() + offsetH * 3600_000);
    const s = (await slots.generate({ providerOrganizationId: g.org.id, locationId: g.location.id, serviceId: g.service.id, from, to: new Date(from.getTime() + 2 * 86400_000) })).find((x) => x.state === "AVAILABLE")!;
    return (await post(m.owner, "/booking-holds").send({ petId: m.petId, providerId: g.org.id, locationId: g.location.id, serviceId: g.service.id, slotStart: s.startAt.toISOString() }).expect(201)).body.holdId as string;
  }
  const book = (m: Awaited<ReturnType<typeof member>>, holdId: string, intakeAnswers?: unknown) => post(m.owner, "/bookings").set("Idempotency-Key", randomUUID()).send({ holdId, petId: m.petId, ...(intakeAnswers === undefined ? {} : { intakeAnswers }) });

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    slots = app.get(SlotGeneratorService);
  });
  afterAll(async () => app.close());

  const QUESTIONS = [
    { key: "bites", type: "YES_NO", label: "Has your dog bitten before?", required: true },
    { key: "style", type: "SINGLE_CHOICE", label: "Cut style", required: true, options: ["Short", "Natural"] },
    { key: "notes", type: "LONG_TEXT", label: "Anything else?", required: false },
  ];

  it("intake forms are versioned; answers are validated before the hold is used; both sides see the answers", async () => {
    const g = await groomer();
    const m = await member();
    expect((await request(server()).get(`/provider-services/${g.service.id}/intake-form`).expect(200)).body).toEqual({});
    await request(server()).get(`/provider-services/${randomUUID()}/intake-form`).expect(404);
    await put(g.staff, `/provider/services/${g.service.id}/intake-form`).send({ questions: [{ key: "x", type: "TEXT", label: "<script>" }] }).expect(400);
    const v1 = (await put(g.staff, `/provider/services/${g.service.id}/intake-form`).send({ questions: QUESTIONS }).expect(200)).body;
    expect(v1.version).toBe(1);
    // Another provider cannot edit this service's form.
    const other = await groomer();
    await put(other.staff, `/provider/services/${g.service.id}/intake-form`).send({ questions: QUESTIONS }).expect(404);

    const h = await hold(m, g);
    expect((await book(m, h, { style: "Mohawk" }).expect(400)).body.error.details.errors).toEqual(expect.arrayContaining(["bites is required", "style must be one of the options"]));
    // The hold survived the rejected answers.
    const booking = (await book(m, h, { bites: false, style: "Short", notes: "Nervous with dryers" }).expect(201)).body;
    const detail = (await get(m.owner, `/bookings/${booking.id}`).expect(200)).body;
    expect(detail.intake).toMatchObject({ formVersion: 1, answers: [{ key: "bites", value: false }, { key: "style", value: "Short" }, { key: "notes", value: "Nervous with dryers" }] });
    expect((await get(g.staff, `/provider/bookings/${booking.id}/intake`).expect(200)).body.formVersion).toBe(1);
    await get(other.staff, `/provider/bookings/${booking.id}/intake`).expect(404);

    // A new version applies to new bookings; the old booking keeps the version it answered.
    const v2 = (await put(g.staff, `/provider/services/${g.service.id}/intake-form`).send({ questions: [QUESTIONS[0]] }).expect(200)).body;
    expect(v2.version).toBe(2);
    expect((await get(m.owner, `/bookings/${booking.id}`).expect(200)).body.intake.formVersion).toBe(1);
    // A service without a form refuses answers.
    await del(g.staff, `/provider/services/${g.service.id}/intake-form`).expect(200);
    await book(m, await hold(m, g, 96), { bites: true }).expect(400);
  });

  it("attachments: private, both directions, scoped to the booking, removable only by their uploader", async () => {
    const g = await groomer();
    const m = await member();
    const booking = (await book(m, await hold(m, g)).expect(201)).body;
    const target = (await post(m.owner, `/bookings/${booking.id}/attachments/upload-url`).send({ contentType: "image/jpeg", fileSizeBytes: 2048 }).expect(201)).body;
    expect(target.key).toMatch(new RegExp(`^booking-attachments/${booking.id}/`));
    await post(m.owner, `/bookings/${booking.id}/attachments/upload-url`).send({ contentType: "text/html", fileSizeBytes: 10 }).expect(400);
    const list = (await post(m.owner, `/bookings/${booking.id}/attachments`).send({ key: target.key, mimeType: "image/jpeg", sizeBytes: 2048, title: "Matted fur" }).expect(201)).body;
    expect(list).toHaveLength(1);
    await post(m.owner, `/bookings/${booking.id}/attachments`).send({ key: target.key, mimeType: "image/jpeg", sizeBytes: 2048 }).expect(400);

    // A key minted for another booking can't be attached here.
    const otherBooking = (await book(m, await hold(m, g, 96)).expect(201)).body;
    const foreign = (await post(m.owner, `/bookings/${otherBooking.id}/attachments/upload-url`).send({ contentType: "application/pdf", fileSizeBytes: 100 }).expect(201)).body;
    expect([400, 403]).toContain((await post(m.owner, `/bookings/${booking.id}/attachments`).send({ key: foreign.key, mimeType: "application/pdf", sizeBytes: 100 })).status);

    // The provider sees and downloads it; another provider and a stranger don't.
    const seen = (await get(g.staff, `/provider/bookings/${booking.id}/attachments`).expect(200)).body;
    expect(seen[0]).toMatchObject({ side: "OWNER", title: "Matted fur" });
    expect((await get(g.staff, `/provider/bookings/${booking.id}/attachments/${seen[0].id}/download`).expect(200)).body.downloadUrl).toBeTruthy();
    const other = await groomer();
    await get(other.staff, `/provider/bookings/${booking.id}/attachments`).expect(404);
    const stranger = await actor("stranger");
    expect([403, 404]).toContain((await get(stranger, `/bookings/${booking.id}/attachments`)).status);
    expect([403, 404]).toContain((await get(stranger, `/bookings/${booking.id}/attachments/${seen[0].id}/download`)).status);

    // Provider → owner document, with a notification; the owner can't delete the provider's file.
    const pTarget = (await post(g.staff, `/provider/bookings/${booking.id}/attachments/upload-url`).send({ contentType: "application/pdf", fileSizeBytes: 4096 }).expect(201)).body;
    const both = (await post(g.staff, `/provider/bookings/${booking.id}/attachments`).send({ key: pTarget.key, mimeType: "application/pdf", sizeBytes: 4096, title: "Aftercare sheet" }).expect(201)).body;
    expect(both.map((a: { side: string }) => a.side).sort()).toEqual(["OWNER", "PROVIDER"]);
    expect(await db.notification.count({ where: { userId: m.owner.id, type: "booking.provider_document", deepLink: `/bookings/${booking.id}` } })).toBe(1);
    const providerFile = both.find((a: { side: string }) => a.side === "PROVIDER");
    await del(m.owner, `/bookings/${booking.id}/attachments/${providerFile.id}`).expect(404);
    expect((await del(m.owner, `/bookings/${booking.id}/attachments/${seen[0].id}`).expect(200)).body).toHaveLength(1);
  });

  it("completion carries owner-visible aftercare instructions", async () => {
    const g = await groomer();
    const m = await member();
    const booking = (await book(m, await hold(m, g)).expect(201)).body;
    await db.booking.update({ where: { id: booking.id }, data: { bookingStatus: "IN_PROGRESS" } });
    await post(g.staff, `/provider/bookings/${booking.id}/complete`).send({ completionNote: "All done", aftercareInstructions: "x".repeat(2001) }).expect(400);
    await post(g.staff, `/provider/bookings/${booking.id}/complete`).send({ completionNote: "All done", aftercareInstructions: "Keep the paws dry for 24 hours." }).expect(201);
    expect((await get(m.owner, `/bookings/${booking.id}`).expect(200)).body).toMatchObject({ completionNote: "All done", aftercareInstructions: "Keep the paws dry for 24 hours." });
  });
});
