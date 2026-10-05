import { Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { AdminMembershipStatus, AdminRole, BookingStatus, LedgerAccountCode, PaymentStatus, ProviderType, ProviderUserRole, ProviderVerificationStatus } from "@prisma/client";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { ClinicRemindersService } from "../src/modules/clinic-os/clinic-reminders.service";
import { LedgerService } from "../src/modules/commerce/ledger/ledger.service";

type Client = ReturnType<typeof authed>;
function authed(app: INestApplication, session: string, csrf: string) {
  const cookie = `petlife_session=${session}; petlife_csrf=${csrf}`;
  return {
    get: (url: string) => request(app.getHttpServer()).get(url).set("Cookie", cookie),
    post: (url: string) => request(app.getHttpServer()).post(url).set("Cookie", cookie).set("x-csrf-token", csrf),
    del: (url: string) => request(app.getHttpServer()).delete(url).set("Cookie", cookie).set("x-csrf-token", csrf),
  };
}

/**
 * Clinic OS: a B2B plan context separate from household subscriptions, the customer registry, clinic → owner
 * reminders through the notification orchestrator, and a finance report built from real bookings/payments/ledger.
 */
describe("Clinic OS", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let logSpy: jest.SpyInstance;
  const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => app.close());
  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });
  afterEach(() => logSpy.mockRestore());

  async function signUp(tag: string): Promise<{ client: Client; userId: string }> {
    const identifier = `clinic-${tag}-${unique()}@example.com`;
    const primed = await request(app.getHttpServer()).get("/health/live");
    const csrf = extractCookie(primed.headers["set-cookie"], "petlife_csrf")!;
    await request(app.getHttpServer()).post("/auth/request-otp").set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf).send({ identifier }).expect(200);
    const line = logSpy.mock.calls.find((a) => typeof a[0] === "string" && a[0].includes("[DEV OTP]") && a[0].includes(identifier))![0] as string;
    const code = /code=(\d+)/.exec(line)![1];
    const res = await request(app.getHttpServer()).post("/auth/verify-otp").set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf).send({ identifier, code }).expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });
    return { client: authed(app, extractCookie(res.headers["set-cookie"], "petlife_session")!, csrf), userId: user.id };
  }

  async function owner(petName: string) {
    const o = await signUp("owner");
    const hh = (await o.client.post("/households").send({}).expect(201)).body;
    const pet = (await o.client.post(`/households/${hh.id}/pets`).send({ name: petName, species: "DOG", approximateAgeMonths: 24 }).expect(201)).body;
    return { ...o, householdId: hh.id as string, petId: pet.id as string };
  }

  async function clinic(role: ProviderUserRole = ProviderUserRole.OWNER) {
    const staff = await signUp("staff");
    const org = await prisma.providerOrganization.create({ data: { name: `Clinic ${unique()}`, type: ProviderType.VET_CLINIC, verificationStatus: ProviderVerificationStatus.VERIFIED } });
    await prisma.providerUser.create({ data: { userId: staff.userId, providerOrganizationId: org.id, role } });
    const location = await prisma.providerLocation.create({ data: { providerOrganizationId: org.id, addressLine: "Valiasr 1", city: "Tehran", countryCode: "IR", timezone: "Asia/Tehran" } });
    const service = await prisma.providerService.create({ data: { providerOrganizationId: org.id, locationId: location.id, name: "Checkup", type: "GENERAL_VET_VISIT", category: "VET", durationMinutes: 30, priceAmount: 1_500_000 } });
    return { ...staff, orgId: org.id, locationId: location.id, serviceId: service.id };
  }

  async function booking(c: Awaited<ReturnType<typeof clinic>>, o: Awaited<ReturnType<typeof owner>>, over: Partial<{ status: BookingStatus; startAt: Date; price: number; discount: number; paymentMode: "PAY_AT_PROVIDER" | "FULL_PREPAYMENT"; paymentStatus: PaymentStatus; paymentIntentId: string }> = {}) {
    const startAt = over.startAt ?? new Date(Date.now() - 2 * 86400e3);
    return prisma.booking.create({
      data: {
        householdId: o.householdId, petId: o.petId, userId: o.userId, providerOrganizationId: c.orgId, providerLocationId: c.locationId, providerServiceId: c.serviceId,
        category: "VET", locationMode: "AT_PROVIDER", startAt, endAt: new Date(startAt.getTime() + 1800e3), timezone: "Asia/Tehran",
        bookingStatus: over.status ?? BookingStatus.COMPLETED, priceAmount: over.price ?? 1_500_000, discountAmount: over.discount ?? 0, currency: "IRR",
        paymentMode: over.paymentMode ?? "PAY_AT_PROVIDER", paymentStatus: over.paymentStatus ?? PaymentStatus.NOT_REQUIRED, paymentIntentId: over.paymentIntentId ?? null, serviceNameSnapshot: "Checkup",
      },
    });
  }

  async function setPlan(orgId: string, code: string) {
    const plan = await prisma.clinicPlan.findUniqueOrThrow({ where: { code } });
    await prisma.clinicSubscription.upsert({ where: { providerOrganizationId: orgId }, update: { planId: plan.id }, create: { providerOrganizationId: orgId, planId: plan.id } });
  }

  async function admin(role: AdminRole) {
    const a = await signUp("admin");
    await prisma.adminUser.create({ data: { userId: a.userId, role, status: AdminMembershipStatus.ACTIVE } });
    return a.client;
  }

  it("a clinic resolves to CLINIC_BASIC by default; the plan catalog is clinic-only with no invented prices", async () => {
    const c = await clinic();
    const sub = (await c.client.get("/provider/clinic/subscription").expect(200)).body;
    expect(sub.plan.code).toBe("CLINIC_BASIC");
    expect(sub.status).toBe("ACTIVE");
    const keys = Object.fromEntries(sub.plan.entitlements.map((e: { key: string; enabled: boolean }) => [e.key, e.enabled]));
    expect(keys).toMatchObject({ "clinic.medical_records": true, "clinic.appointments": true, "clinic.customers": true, "clinic.reminders": false, "clinic.finance.reports": false });
    const plans = (await c.client.get("/provider/clinic/plans").expect(200)).body;
    expect(plans.map((p: { code: string }) => p.code)).toEqual(["CLINIC_BASIC", "CLINIC_GROWTH", "CLINIC_PRO"]);
    expect(plans.every((p: { prices: unknown[] }) => p.prices.length === 0)).toBe(true);

    // Separate context: consumer plans never list clinic plans, and a household cannot see clinic endpoints.
    const o = await owner("Consumer Dog");
    const consumerPlans = (await o.client.get(`/households/${o.householdId}/subscription/plans`).expect(200)).body;
    expect(JSON.stringify(consumerPlans)).not.toContain("CLINIC_");
    await o.client.get("/provider/clinic/subscription").expect(403);
  });

  it("only an admin with subscription.manage can assign a plan; it is audited and unlocks gated features", async () => {
    const c = await clinic();
    await c.client.post("/provider/clinic/reminders").send({ petId: "00000000-0000-4000-8000-000000000000", kind: "CHECKUP", title: "x" }).expect(409);
    const readOnly = await admin(AdminRole.READ_ONLY);
    await readOnly.post(`/admin/clinic-subscriptions/${c.orgId}/assign`).send({ planCode: "CLINIC_GROWTH", reason: "pilot clinic" }).expect(403);
    await c.client.post(`/admin/clinic-subscriptions/${c.orgId}/assign`).send({ planCode: "CLINIC_GROWTH", reason: "self-upgrade" }).expect(403);
    const superAdmin = await admin(AdminRole.SUPER_ADMIN);
    await superAdmin.post(`/admin/clinic-subscriptions/${c.orgId}/assign`).send({ planCode: "CLINIC_GROWTH", reason: "x" }).expect(400);
    await superAdmin.post(`/admin/clinic-subscriptions/${c.orgId}/assign`).send({ planCode: "PREMIUM", reason: "wrong context" }).expect(400);
    const assigned = (await superAdmin.post(`/admin/clinic-subscriptions/${c.orgId}/assign`).send({ planCode: "CLINIC_GROWTH", reason: "pilot clinic" }).expect(201)).body;
    expect(assigned.plan.code).toBe("CLINIC_GROWTH");
    expect(assigned.history[0]).toMatchObject({ type: "UPGRADE", fromPlanCode: "CLINIC_BASIC", toPlanCode: "CLINIC_GROWTH", reason: "pilot clinic" });
    expect(await prisma.adminAuditLog.count({ where: { action: "clinic_subscription.plan_assigned", entityId: (await prisma.clinicSubscription.findUniqueOrThrow({ where: { providerOrganizationId: c.orgId } })).id } })).toBe(1);
    expect((await c.client.get("/provider/clinic/subscription").expect(200)).body.plan.code).toBe("CLINIC_GROWTH");
    await superAdmin.post(`/admin/clinic-subscriptions/00000000-0000-4000-8000-000000000000/assign`).send({ planCode: "CLINIC_PRO", reason: "missing org" }).expect(404);

    // An assigned period that has ended falls back to the default plan's entitlements.
    await prisma.clinicSubscription.update({ where: { providerOrganizationId: c.orgId }, data: { currentPeriodEndsAt: new Date(Date.now() - 1000) } });
    const lapsed = (await c.client.get("/provider/clinic/subscription").expect(200)).body;
    expect(lapsed).toMatchObject({ status: "EXPIRED", assignedPlanCode: "CLINIC_GROWTH" });
    expect(lapsed.plan.code).toBe("CLINIC_BASIC");
  });

  it("the customer registry lists only this clinic's customers, with no contact or health data", async () => {
    const c = await clinic(ProviderUserRole.STAFF);
    const o = await owner("Registry Dog");
    const stranger = await owner("Elsewhere Dog");
    await booking(c, o);
    await booking(c, o, { status: BookingStatus.CONFIRMED, startAt: new Date(Date.now() + 3 * 86400e3) });
    const list = (await c.client.get("/provider/clinic/customers").expect(200)).body;
    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({ householdId: o.householdId, completedVisitCount: 1 });
    expect(list.items[0].pets.map((p: { id: string }) => p.id)).toEqual([o.petId]);
    expect(list.items[0].nextAppointment).not.toBeNull();
    const raw = JSON.stringify(list);
    expect(raw).not.toMatch(/@example\.com|phone|email/i);
    expect((await c.client.get("/provider/clinic/customers?q=Registry").expect(200)).body.total).toBe(1);
    expect((await c.client.get("/provider/clinic/customers?q=nobody-matches").expect(200)).body.total).toBe(0);
    const detail = (await c.client.get(`/provider/clinic/customers/${o.householdId}`).expect(200)).body;
    expect(detail.bookings).toHaveLength(2);
    // Someone else's household (and a made-up one) look identical: 404.
    await c.client.get(`/provider/clinic/customers/${stranger.householdId}`).expect(404);
    await c.client.get(`/provider/clinic/customers/00000000-0000-4000-8000-000000000000`).expect(404);
    const otherClinic = await clinic();
    await otherClinic.client.get(`/provider/clinic/customers/${o.householdId}`).expect(404);
  });

  it("reminders: own patients only, sent through the orchestrator once, cancellable while scheduled, capped per month", async () => {
    const c = await clinic(ProviderUserRole.VET);
    const o = await owner("Reminder Dog");
    const stranger = await owner("Not A Patient");
    await booking(c, o);
    await setPlan(c.orgId, "CLINIC_GROWTH");

    await c.client.post("/provider/clinic/reminders").send({ petId: stranger.petId, kind: "CHECKUP", title: "x" }).expect(404);
    await c.client.post("/provider/clinic/reminders").send({ petId: o.petId, kind: "CHECKUP", title: "x", dueAt: new Date(Date.now() - 86400e3).toISOString() }).expect(400);
    await c.client.post("/provider/clinic/reminders").send({ petId: o.petId, kind: "CHECKUP", title: "   " }).expect(400);

    const now = (await c.client.post("/provider/clinic/reminders").send({ petId: o.petId, kind: "MESSAGE", title: "نتیجه‌ی آزمایش آماده است" }).expect(201)).body;
    expect(now).toMatchObject({ status: "SENT", recipientCount: 1 });
    const inbox = (await o.client.get("/notifications").expect(200)).body;
    const items = inbox.items ?? inbox;
    const n = items.find((x: { entityId: string }) => x.entityId === now.id);
    expect(n).toMatchObject({ type: "clinic.message", deepLink: `/pets/${o.petId}` });

    const later = (await c.client.post("/provider/clinic/reminders").send({ petId: o.petId, kind: "VACCINATION", title: "واکسن سالانه", dueAt: new Date(Date.now() + 3600e3).toISOString() }).expect(201)).body;
    expect(later.status).toBe("SCHEDULED");
    const cancelMe = (await c.client.post("/provider/clinic/reminders").send({ petId: o.petId, kind: "FOLLOW_UP", title: "پیگیری", dueAt: new Date(Date.now() + 7200e3).toISOString() }).expect(201)).body;
    expect((await c.client.post(`/provider/clinic/reminders/${cancelMe.id}/cancel`).expect(201)).body.status).toBe("CANCELLED");
    await c.client.post(`/provider/clinic/reminders/${now.id}/cancel`).expect(400);
    const otherClinic = await clinic();
    await otherClinic.client.post(`/provider/clinic/reminders/${later.id}/cancel`).expect(404);

    // Becomes due → the worker delivers it exactly once, even when two ticks race.
    await prisma.clinicReminder.update({ where: { id: later.id }, data: { dueAt: new Date(Date.now() - 1000) } });
    await prisma.clinicReminder.update({ where: { id: cancelMe.id }, data: { dueAt: new Date(Date.now() - 1000) } });
    const worker = app.get(ClinicRemindersService);
    await Promise.all([worker.processDue(), worker.processDue()]);
    expect(await prisma.notification.count({ where: { entityId: later.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { entityId: cancelMe.id } })).toBe(0);

    const listed = (await c.client.get("/provider/clinic/reminders?status=SENT").expect(200)).body;
    expect(listed.items.map((r: { id: string }) => r.id).sort()).toEqual([now.id, later.id].sort());
    expect((await otherClinic.client.get("/provider/clinic/reminders").expect(200)).body.total).toBe(0);

    // Monthly cap from the plan's LIMIT entitlement.
    const growth = await prisma.clinicPlan.findUniqueOrThrow({ where: { code: "CLINIC_GROWTH" } });
    const cap = await prisma.clinicPlanEntitlement.findUniqueOrThrow({ where: { planId_key: { planId: growth.id, key: "clinic.reminders.monthly.max" } } });
    await prisma.clinicPlanEntitlement.update({ where: { id: cap.id }, data: { limitValue: 3 } });
    try {
      const over = await c.client.post("/provider/clinic/reminders").send({ petId: o.petId, kind: "CHECKUP", title: "یکی بیشتر" }).expect(409);
      expect(over.body.error.code).toBe("SUBSCRIPTION_ENTITLEMENT_LIMIT_EXCEEDED");
    } finally {
      await prisma.clinicPlanEntitlement.update({ where: { id: cap.id }, data: { limitValue: cap.limitValue } });
    }
  });

  it("the finance report is owner-only, plan-gated, and adds up real bookings, payments and ledger postings", async () => {
    const c = await clinic(ProviderUserRole.OWNER);
    const o = await owner("Finance Dog");
    await c.client.get("/provider/clinic/reports/finance").expect(409);
    await setPlan(c.orgId, "CLINIC_PRO");

    await booking(c, o, { price: 1_500_000, discount: 100_000 });
    await booking(c, o, { status: BookingStatus.NO_SHOW });
    await booking(c, o, { status: BookingStatus.CANCELLED_BY_USER });
    await booking(c, o, { startAt: new Date(Date.now() - 90 * 86400e3) }); // outside the default 30-day window
    // An online-paid completed booking with a real ledger posting.
    const cart = await prisma.cart.create({ data: { userId: o.userId, status: "CONVERTED" } });
    const checkout = await prisma.checkout.create({ data: { userId: o.userId, householdId: o.householdId, cartId: cart.id, currency: "IRR", subtotalAmount: 2_000_000, totalAmount: 2_000_000 } });
    const intent = await prisma.paymentIntent.create({ data: { checkoutId: checkout.id, amount: 2_000_000, currency: "IRR", status: "CAPTURED" } });
    await app.get(LedgerService).recordPaymentSucceeded(checkout.id, 2_000_000, "IRR");
    await booking(c, o, { price: 2_000_000, paymentMode: "FULL_PREPAYMENT", paymentStatus: PaymentStatus.PAID, paymentIntentId: intent.id });

    const r = (await c.client.get("/provider/clinic/reports/finance").expect(200)).body;
    expect(r.bookings).toMatchObject({ total: 4, completed: 2, noShow: 1, cancelled: 1 });
    expect(r.billedAmount).toEqual([{ currency: "IRR", amount: "3400000" }]);
    expect(r.payAtClinic).toEqual([{ currency: "IRR", amount: "1400000" }]);
    expect(r.collectedOnline).toEqual([{ currency: "IRR", amount: "2000000" }]);
    expect(r.ledgerPosted).toEqual([{ currency: "IRR", amount: "2000000" }]);
    expect(r.byService[0]).toMatchObject({ count: 2, amount: "3400000" });
    expect(await prisma.ledgerAccount.count({ where: { code: LedgerAccountCode.CASH_GATEWAY_RECEIVABLE } })).toBe(1);

    const wide = (await c.client.get(`/provider/clinic/reports/finance?from=${new Date(Date.now() - 120 * 86400e3).toISOString()}`).expect(200)).body;
    expect(wide.bookings.completed).toBe(3);
    await c.client.get(`/provider/clinic/reports/finance?from=2020-01-01T00:00:00Z&to=2026-01-01T00:00:00Z`).expect(400);
    await c.client.get(`/provider/clinic/reports/finance?from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z`).expect(400);

    // Another clinic's report never includes these bookings; VET/STAFF cannot read money.
    const other = await clinic(ProviderUserRole.OWNER);
    await setPlan(other.orgId, "CLINIC_GROWTH");
    expect((await other.client.get("/provider/clinic/reports/finance").expect(200)).body.bookings.total).toBe(0);
    const vet = await signUp("vet");
    await prisma.providerUser.create({ data: { userId: vet.userId, providerOrganizationId: c.orgId, role: ProviderUserRole.VET } });
    await vet.client.get("/provider/clinic/reports/finance").expect(403);
  });

  describe("team: invitations, seat/branch limits, removal (clinic.staff.max / clinic.branches.max)", () => {
    type Person = { client: Client; userId: string; email: string };
    const person = async (tag: string): Promise<Person> => {
      const p = await signUp(tag);
      return { ...p, email: (await prisma.user.findUniqueOrThrow({ where: { id: p.userId } })).email! };
    };
    /** Fills seats directly (fast) — the invitation flow itself is covered by the first tests. */
    const fillSeats = async (orgId: string, n: number) => {
      for (let i = 0; i < n; i++) {
        const u = await prisma.user.create({ data: { email: `clinic-seat-${unique()}@example.com`, displayName: "Seat" } });
        await prisma.providerUser.create({ data: { userId: u.id, providerOrganizationId: orgId, role: ProviderUserRole.STAFF } });
      }
    };
    const invite = (c: { client: Client }, email: string, role = "VET") => c.client.post("/provider/clinic/staff").send({ email, role });
    const myInvitation = async (p: Person, orgId: string) => ((await p.client.get("/me/clinic-invitations").expect(200)).body as { id: string; organization: { id: string } }[]).find((i) => i.organization.id === orgId)!;
    const addBranch = (c: { client: Client }, n: number) => c.client.post("/provider/clinic/branches").send({ name: `Branch ${n}`, addressLine: `Street ${n}`, city: "Tehran" });

    it("invite → pending → accept creates the membership; nothing is joined without the invitee", async () => {
      const c = await clinic();
      const a = await person("inv-a");
      const sent = (await invite(c, a.email).expect(201)).body;
      expect(sent.invitation).toMatchObject({ status: "PENDING", role: "VET" });
      expect(sent.usage).toEqual({ used: 1, pending: 1, limit: 3 });
      // Not a member yet: no provider access, and the invitee was notified with a working link.
      await a.client.get("/provider/clinic/staff").expect(403);
      expect(await prisma.notification.count({ where: { userId: a.userId, type: "clinic.staff_invited", deepLink: "/clinic-invitations" } })).toBe(1);
      expect((await invite(c, a.email).expect(409)).body.error).toMatchObject({ code: "CLINIC_INVITATION_CONFLICT", details: { reason: "ALREADY_PENDING" } });

      const inv = await myInvitation(a, c.orgId);
      const accepted = (await a.client.post(`/me/clinic-invitations/${inv.id}/accept`).expect(201)).body;
      expect(accepted).toMatchObject({ providerOrganizationId: c.orgId, role: "VET" });
      expect((await a.client.get("/provider/clinic/staff").expect(200)).body.usage).toEqual({ used: 2, pending: 0, limit: 3 });
      expect(await prisma.notification.count({ where: { userId: c.userId, type: "clinic.invitation_accepted", deepLink: "/provider/team" } })).toBe(1);
      await a.client.post(`/me/clinic-invitations/${inv.id}/accept`).expect(409);
      expect((await invite(c, a.email).expect(409)).body.error.code).toBe("CLINIC_STAFF_ALREADY_MEMBER");
      await invite(c, `nobody-${unique()}@example.com`).expect(404);
      await invite(c, a.email, "OWNER").expect(400);
      // A VET member cannot invite.
      await a.client.post("/provider/clinic/staff").send({ email: (await person("x")).email, role: "STAFF" }).expect(403);
    });

    it("pending invitations hold seats; revoking frees one; only the invitee can answer; expiry and decline", async () => {
      const c = await clinic();
      const [a, b, d, outsider] = [await person("p-a"), await person("p-b"), await person("p-d"), await person("p-o")];
      await invite(c, a.email).expect(201);
      await invite(c, b.email).expect(201);
      expect((await invite(c, d.email).expect(409)).body.error).toMatchObject({ code: "SUBSCRIPTION_ENTITLEMENT_LIMIT_EXCEEDED" });
      const invA = await myInvitation(a, c.orgId);
      // Someone else's invitation looks like a missing one.
      await outsider.client.post(`/me/clinic-invitations/${invA.id}/accept`).expect(404);
      await outsider.client.post(`/me/clinic-invitations/${invA.id}/decline`).expect(404);
      expect((await outsider.client.get("/me/clinic-invitations").expect(200)).body).toEqual([]);
      // Revoke frees the seat.
      expect((await c.client.post(`/provider/clinic/staff/invitations/${invA.id}/revoke`).expect(201)).body.usage).toEqual({ used: 1, pending: 1, limit: 3 });
      await a.client.post(`/me/clinic-invitations/${invA.id}/accept`).expect(409);
      await c.client.post(`/provider/clinic/staff/invitations/${invA.id}/revoke`).expect(409);
      await invite(c, d.email).expect(201);
      // Decline notifies the owners; expired cannot be accepted.
      const invB = await myInvitation(b, c.orgId);
      expect((await b.client.post(`/me/clinic-invitations/${invB.id}/decline`).expect(201)).body.status).toBe("DECLINED");
      expect(await prisma.notification.count({ where: { userId: c.userId, type: "clinic.invitation_declined" } })).toBe(1);
      const invD = await myInvitation(d, c.orgId);
      await prisma.clinicInvitation.update({ where: { id: invD.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      expect((await d.client.post(`/me/clinic-invitations/${invD.id}/accept`).expect(409)).body.error.details.reason).toBe("EXPIRED");
      expect((await d.client.get("/me/clinic-invitations").expect(200)).body).toEqual([]);
      // An expired invitation no longer blocks a fresh one.
      await invite(c, d.email).expect(201);
      // Another clinic cannot revoke this clinic's invitation.
      const other = await clinic();
      await other.client.post(`/provider/clinic/staff/invitations/${(await myInvitation(d, c.orgId)).id}/revoke`).expect(404);
    });

    it("two concurrent invites can never both take the last seat", async () => {
      const c = await clinic();
      await fillSeats(c.orgId, 1);
      const [a, b] = await Promise.all([invite(c, (await person("c-a")).email), invite(c, (await person("c-b")).email)]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
    });

    it("plan limits: BASIC 3 seats/1 branch, GROWTH 10/3, PRO unlimited", async () => {
      const basic = await clinic();
      expect((await addBranch(basic, 2).expect(409)).body.error.code).toBe("SUBSCRIPTION_ENTITLEMENT_LIMIT_EXCEEDED");
      await c_assertBranches(basic, { used: 1, limit: 1 });

      const growth = await clinic();
      await setPlan(growth.orgId, "CLINIC_GROWTH");
      await fillSeats(growth.orgId, 8);
      await invite(growth, (await person("g-9")).email).expect(201);
      expect((await invite(growth, (await person("g-11")).email).expect(409)).body.error.code).toBe("SUBSCRIPTION_ENTITLEMENT_LIMIT_EXCEEDED");
      await addBranch(growth, 2).expect(201);
      await addBranch(growth, 3).expect(201);
      await addBranch(growth, 4).expect(409);

      const pro = await clinic();
      await setPlan(pro.orgId, "CLINIC_PRO");
      await fillSeats(pro.orgId, 11);
      const sent = (await invite(pro, (await person("pro-13")).email).expect(201)).body;
      expect(sent.usage).toEqual({ used: 12, pending: 1, limit: null });
      for (let i = 2; i <= 5; i++) await addBranch(pro, i).expect(201);
      await c_assertBranches(pro, { used: 5, limit: null });
    });

    async function c_assertBranches(c: { client: Client }, usage: { used: number; limit: number | null }) {
      expect((await c.client.get("/provider/clinic/branches").expect(200)).body.usage).toEqual(usage);
    }

    it("removing a member ends their access, revokes their clinic grants, unassigns open bookings; owners are protected", async () => {
      const c = await clinic();
      await setPlan(c.orgId, "CLINIC_PRO");
      const vet = await person("rm-vet");
      await invite(c, vet.email).expect(201);
      const inv = await myInvitation(vet, c.orgId);
      const member = (await vet.client.post(`/me/clinic-invitations/${inv.id}/accept`).expect(201)).body;
      const o = await owner("Removal Dog");
      const open = await booking(c, o, { status: BookingStatus.CONFIRMED, startAt: new Date(Date.now() + 2 * 86400e3) });
      const done = await booking(c, o);
      await prisma.booking.updateMany({ where: { id: { in: [open.id, done.id] } }, data: { providerUserId: member.providerUserId } });
      const grant = await prisma.petAccessGrant.create({ data: { petId: o.petId, userId: vet.userId, canViewHealth: true, canRecordClinicalData: true, source: "TEMPORARY", reason: "BOOKING" } });
      await prisma.bookingPetAccess.create({ data: { bookingId: open.id, petAccessGrantId: grant.id, scopePreset: "HEALTH_BASICS" } });
      await vet.client.get(`/provider/clinical/patients/${o.petId}`).expect(200);

      // Not removable: the owner (even by themselves), a member of another clinic, and by a non-owner.
      const ownerRow = await prisma.providerUser.findFirstOrThrow({ where: { providerOrganizationId: c.orgId, role: ProviderUserRole.OWNER } });
      expect((await c.client.del(`/provider/clinic/staff/${ownerRow.id}`).expect(409)).body.error.details.reason).toBe("OWNER");
      const other = await clinic();
      await other.client.del(`/provider/clinic/staff/${member.providerUserId}`).expect(404);
      await vet.client.del(`/provider/clinic/staff/${member.providerUserId}`).expect(403);

      const after = (await c.client.del(`/provider/clinic/staff/${member.providerUserId}`).expect(200)).body;
      expect(after.items.map((m: { providerUserId: string }) => m.providerUserId)).not.toContain(member.providerUserId);
      await vet.client.get("/provider/clinic/staff").expect(403);
      await vet.client.get(`/provider/clinical/patients/${o.petId}`).expect(403);
      expect((await prisma.petAccessGrant.findUniqueOrThrow({ where: { id: grant.id } })).revokedAt).not.toBeNull();
      expect((await prisma.booking.findUniqueOrThrow({ where: { id: open.id } })).providerUserId).toBeNull();
      // History keeps its author.
      expect((await prisma.booking.findUniqueOrThrow({ where: { id: done.id } })).providerUserId).toBe(member.providerUserId);
      expect(await prisma.notification.count({ where: { userId: vet.userId, type: "clinic.staff_removed" } })).toBe(1);
      await c.client.del(`/provider/clinic/staff/${member.providerUserId}`).expect(404);

      // Re-inviting and accepting reactivates the same member row.
      await invite(c, vet.email).expect(201);
      const again = (await vet.client.post(`/me/clinic-invitations/${(await myInvitation(vet, c.orgId)).id}/accept`).expect(201)).body;
      expect(again.providerUserId).toBe(member.providerUserId);
      await vet.client.get("/provider/clinic/staff").expect(200);
    });

    it("a branch is removable only when nothing operational points at it", async () => {
      const c = await clinic();
      await setPlan(c.orgId, "CLINIC_PRO");
      expect((await c.client.del(`/provider/clinic/branches/${c.locationId}`).expect(409)).body.error.details.reason).toBe("LAST_BRANCH");
      const added = (await addBranch(c, 2).expect(201)).body.items.find((b: { name: string }) => b.name === "Branch 2");
      // In use by a service → refused.
      const svc = await prisma.providerService.create({ data: { providerOrganizationId: c.orgId, locationId: added.id, name: "Groom", type: "GENERAL_VET_VISIT", category: "VET", durationMinutes: 30 } });
      expect((await c.client.del(`/provider/clinic/branches/${added.id}`).expect(409)).body.error.details.reason).toBe("HAS_SERVICES_OR_SCHEDULE");
      await prisma.providerService.delete({ where: { id: svc.id } });
      // A booking ever made there keeps the branch.
      const o = await owner("Branch Dog");
      const b = await booking({ ...c, locationId: added.id }, o);
      expect((await c.client.del(`/provider/clinic/branches/${added.id}`).expect(409)).body.error.details.reason).toBe("HAS_BOOKINGS");
      await prisma.booking.delete({ where: { id: b.id } });
      const vetUser = await person("br-vet");
      await prisma.providerUser.create({ data: { userId: vetUser.userId, providerOrganizationId: c.orgId, role: ProviderUserRole.VET } });
      await vetUser.client.del(`/provider/clinic/branches/${added.id}`).expect(403);
      const other = await clinic();
      await other.client.del(`/provider/clinic/branches/${added.id}`).expect(404);
      expect((await c.client.del(`/provider/clinic/branches/${added.id}`).expect(200)).body.usage).toEqual({ used: 1, limit: null });
    });
  });
});
