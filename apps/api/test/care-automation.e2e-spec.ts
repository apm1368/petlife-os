import { Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { grantPlanFeatures } from "./plan-features";
import { CareReminderWorker } from "../src/modules/care-reminders/care-reminder.worker";

type Client = ReturnType<typeof authed>;
function authed(app: INestApplication, session: string, csrf: string) {
  const cookie = `petlife_session=${session}; petlife_csrf=${csrf}`;
  return {
    get: (url: string) => request(app.getHttpServer()).get(url).set("Cookie", cookie),
    post: (url: string) => request(app.getHttpServer()).post(url).set("Cookie", cookie).set("x-csrf-token", csrf),
    put: (url: string) => request(app.getHttpServer()).put(url).set("Cookie", cookie).set("x-csrf-token", csrf),
    del: (url: string) => request(app.getHttpServer()).delete(url).set("Cookie", cookie).set("x-csrf-token", csrf),
  };
}

/** Care automation: templates (confirmed items only), series ends, skip, shared care, history, no double completion. */
describe("Care automation", () => {
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

  async function signUp(tag: string): Promise<{ client: Client; userId: string; email: string }> {
    const email = `care-${tag}-${unique()}@example.com`;
    const primed = await request(app.getHttpServer()).get("/health/live");
    const csrf = extractCookie(primed.headers["set-cookie"], "petlife_csrf")!;
    await request(app.getHttpServer()).post("/auth/request-otp").set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf).send({ identifier: email }).expect(200);
    const line = logSpy.mock.calls.find((a) => typeof a[0] === "string" && a[0].includes("[DEV OTP]") && a[0].includes(email))![0] as string;
    const code = /code=(\d+)/.exec(line)![1];
    const res = await request(app.getHttpServer()).post("/auth/verify-otp").set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf).send({ identifier: email, code }).expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return { client: authed(app, extractCookie(res.headers["set-cookie"], "petlife_session")!, csrf), userId: user.id, email };
  }

  async function owner(paid = true) {
    const o = await signUp("owner");
    const hh = (await o.client.post("/households").send({}).expect(201)).body;
    const pet = (await o.client.post(`/households/${hh.id}/pets`).send({ name: "Care Cat", species: "CAT", approximateAgeMonths: 20 }).expect(201)).body;
    if (paid) await grantPlanFeatures(prisma, hh.id, ["care.reminders"]);
    return { ...o, householdId: hh.id as string, petId: pet.id as string };
  }
  const soon = (h = 2) => new Date(Date.now() + h * 3600e3).toISOString();

  it("templates create only the confirmed items; unknown items are refused; free plans are gated", async () => {
    const o = await owner();
    const catalog = (await o.client.get("/care-templates").expect(200)).body;
    expect(catalog.map((t: { key: string }) => t.key)).toEqual(expect.arrayContaining(["parasite-prevention", "vaccination-booster", "medication-course", "grooming", "dental-care", "weight-check"]));
    const created = (await o.client.post(`/pets/${o.petId}/care-templates/apply`).send({ templateKey: "dental-care", startAt: soon(), items: [{ key: "brushing" }] }).expect(201)).body;
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ type: "DENTAL", recurrence: "WEEKDAYS", weekdays: [0, 2, 4] });
    const course = (await o.client.post(`/pets/${o.petId}/care-templates/apply`).send({ templateKey: "medication-course", startAt: soon(), items: [{ key: "dose", maxOccurrences: 2 }] }).expect(201)).body;
    expect(course[0].maxOccurrences).toBe(2);
    await o.client.post(`/pets/${o.petId}/care-templates/apply`).send({ templateKey: "dental-care", startAt: soon(), items: [{ key: "nope" }] }).expect(400);
    await o.client.post(`/pets/${o.petId}/care-templates/apply`).send({ templateKey: "dental-care", startAt: soon(), items: [] }).expect(400);
    await o.client.post(`/pets/${o.petId}/care-templates/apply`).send({ templateKey: "unknown", startAt: soon(), items: [{ key: "x" }] }).expect(404);
    expect(await prisma.careReminder.count({ where: { petId: o.petId } })).toBe(2);
    const free = await owner(false);
    expect((await free.client.post(`/pets/${free.petId}/care-templates/apply`).send({ templateKey: "grooming", startAt: soon(), items: [{ key: "bath" }] }).expect(409)).body.error.code).toBe("SUBSCRIPTION_FEATURE_NOT_INCLUDED");
  });

  it("skip and complete move the series on, a series ends at its count, and nothing completes twice", async () => {
    const o = await owner();
    const item = (await o.client.post(`/pets/${o.petId}/care-items`).send({ title: "Pill", type: "MEDICATION", dueAt: soon(), recurrence: "DAILY", maxOccurrences: 2 }).expect(201)).body;
    const skipped = (await o.client.post(`/pets/${o.petId}/care-items/${item.id}/actions`).send({ action: "SKIP" }).expect(201)).body;
    expect(skipped).toMatchObject({ state: "SKIPPED", completedByUserId: o.userId });
    const second = await prisma.careReminder.findFirstOrThrow({ where: { parentId: item.id } });
    expect(second.occurrenceIndex).toBe(2);
    // Two concurrent completions: exactly one wins, and the ended series creates no third occurrence.
    const [a, b] = await Promise.all([0, 1].map(() => o.client.post(`/pets/${o.petId}/care-items/${second.id}/actions`).send({ action: "COMPLETE" })));
    expect([a!.status, b!.status].sort()).toEqual([201, 400]);
    expect(await prisma.careReminder.count({ where: { parentId: second.id } })).toBe(0);
    await o.client.post(`/pets/${o.petId}/care-items/${item.id}/actions`).send({ action: "COMPLETE" }).expect(400);
    await o.client.post(`/pets/${o.petId}/care-items`).send({ title: "x", type: "GROOMING", dueAt: soon(), recurrence: "WEEKDAYS" }).expect(400);
    await o.client.post(`/pets/${o.petId}/care-items`).send({ title: "x", type: "GROOMING", dueAt: soon(48), untilDate: soon(1) }).expect(400);

    const history = (await o.client.get(`/pets/${o.petId}/care-items/history?pageSize=10`).expect(200)).body;
    expect(history.total).toBe(2);
    expect(history.items.map((h: { state: string }) => h.state).sort()).toEqual(["COMPLETED", "SKIPPED"]);
    expect(history.items[0].completedByDisplayName).not.toBeUndefined();
  });

  it("shared care: assign to a member who can edit care; the assignee is notified and reminded", async () => {
    const o = await owner();
    const member = await signUp("member");
    await prisma.householdMember.create({ data: { householdId: o.householdId, userId: member.userId, role: "FAMILY" } });
    await prisma.petAccessGrant.create({ data: { petId: o.petId, userId: member.userId, canViewIdentity: true, canViewCareProfile: true, canEditCareProfile: true } });
    const viewer = await signUp("viewer");
    await prisma.householdMember.create({ data: { householdId: o.householdId, userId: viewer.userId, role: "FAMILY" } });
    await prisma.petAccessGrant.create({ data: { petId: o.petId, userId: viewer.userId, canViewIdentity: true, canViewCareProfile: true } });

    expect((await o.client.post(`/pets/${o.petId}/care-items`).send({ title: "Litter", type: "CUSTOM", dueAt: soon(), assignedToUserId: viewer.userId }).expect(400)).body.error.details.reason).toBe("ASSIGNEE_CANNOT_EDIT_CARE");
    const task = (await o.client.post(`/pets/${o.petId}/care-items`).send({ title: "Litter", type: "CUSTOM", dueAt: soon(1), recurrence: "WEEKLY", assignedToUserId: member.userId }).expect(201)).body;
    expect(await prisma.notification.count({ where: { userId: member.userId, type: "care.assigned", deepLink: `/pets/${o.petId}/care/${task.id}` } })).toBe(1);
    await app.get(CareReminderWorker).process();
    expect(await prisma.notification.count({ where: { userId: member.userId, type: "health.reminder", entityId: task.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: o.userId, type: "health.reminder", entityId: task.id } })).toBe(0);
    // The assignee completes; the next occurrence stays assigned to them.
    expect((await member.client.post(`/pets/${o.petId}/care-items/${task.id}/actions`).send({ action: "COMPLETE" }).expect(201)).body.completedByUserId).toBe(member.userId);
    expect((await prisma.careReminder.findFirstOrThrow({ where: { parentId: task.id } })).assignedToUserId).toBe(member.userId);
    // A view-only member cannot act.
    await viewer.client.post(`/pets/${o.petId}/care-items/${task.id}/actions`).send({ action: "SKIP" }).expect(403);
  });
});
