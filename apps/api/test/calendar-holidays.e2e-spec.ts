import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { HolidayCalendarService } from "../src/modules/calendar/holiday-calendar.service";
import { IRAN_OFFICIAL_HOLIDAYS } from "../src/common/time/iran-holidays.data";
import { jalaliOf, tehranDateKey } from "../src/common/time/iran-holidays";
import { businessHoursBetween } from "../src/common/time/business-hours";

type Actor = { adminUserId: string; cookie: string; csrf: string };
const DAY = 86_400_000;
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/** Business calendar: official Iranian holidays from the repo, staff closures/openings on top, audited, public read. */
describe("Business calendar (holidays and closures)", () => {
  let app: INestApplication, db: PrismaService;
  const touched: string[] = [];
  const server = () => app.getHttpServer();
  const get = (a: Actor | null, u: string) => (a ? request(server()).get(u).set("Cookie", a.cookie) : request(server()).get(u));
  const send = (m: "post" | "put", a: Actor, u: string) => request(server())[m](u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function admin(role: AdminRole): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: `cal ${role}`, email: `cal-${randomUUID()}@example.com`, emailVerifiedAt: new Date() } });
    const row = await db.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + DAY) } });
    const csrf = extractCookie((await request(server()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
    return { adminUserId: row.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    db = app.get(PrismaService);
  });
  afterAll(async () => {
    if (touched.length) await db.calendarDayOverride.deleteMany({ where: { date: { in: touched.map((d) => new Date(`${d}T00:00:00Z`)) } } });
    await app.get(HolidayCalendarService).refresh();
    await app.close();
  });

  it("lists a Persian year, lets settings staff close a day or open a holiday, and serves closed days publicly", async () => {
    const root = await admin(AdminRole.SUPER_ADMIN);
    const editor = await admin(AdminRole.EDITOR);
    const today = tehranDateKey(new Date());
    const official = IRAN_OFFICIAL_HOLIDAYS.find((h) => h.date > addDays(today, 3) && weekday(h.date) !== 5)!;
    let plain = addDays(today, 10);
    while (weekday(plain) === 5 || IRAN_OFFICIAL_HOLIDAYS.some((h) => h.date === plain)) plain = addDays(plain, 1);
    let otherPlain = addDays(plain, 1);
    while (weekday(otherPlain) === 5 || IRAN_OFFICIAL_HOLIDAYS.some((h) => h.date === otherPlain)) otherPlain = addDays(otherPlain, 1);
    let friday = addDays(today, 1);
    while (weekday(friday) !== 5) friday = addDays(friday, 1);
    touched.push(official.date, plain);

    await get(editor, "/admin/calendar/days?year=1405").expect(403);
    const year = (await get(root, `/admin/calendar/days?year=${jalaliOf(official.date).year}`).expect(200)).body;
    expect(year).toMatchObject({ coverage: expect.stringMatching(/official|provisional/) });
    expect(year.days.find((d: { date: string }) => d.date === official.date)).toMatchObject({ closed: true, official: { title: official.title }, staff: null });

    // A sudden closure on a normal working day.
    const reason = "Office closed for maintenance";
    await send("put", editor, `/admin/calendar/days/${plain}`).send({ closed: true, title: "Office closure", reason }).expect(403);
    const closed = (await send("put", root, `/admin/calendar/days/${plain}`).send({ closed: true, title: "Office closure", reason }).expect(200)).body;
    expect(closed).toMatchObject({ date: plain, closed: true, official: null, staff: { closed: true, title: "Office closure" } });
    // An official holiday opened as a working day.
    const opened = (await send("put", root, `/admin/calendar/days/${official.date}`).send({ closed: false, title: official.title.slice(0, 100), reason: "Team works this holiday" }).expect(200)).body;
    expect(opened).toMatchObject({ closed: false, official: { title: official.title } });

    // Only real changes; Fridays follow the weekly pattern; dates must be real.
    const rule = async (date: string, body: object) => (await send("put", root, `/admin/calendar/days/${date}`).send({ title: "x day", reason: "testing rules", ...body }).expect(409)).body.error.details.rule;
    expect(await rule(friday, { closed: true })).toBe("CALENDAR_FRIDAY");
    expect(await rule(otherPlain, { closed: false })).toBe("CALENDAR_ALREADY_OPEN");
    expect(await rule(addDays(official.date, 0), { closed: true })).toBe("CALENDAR_ALREADY_CLOSED");
    expect(await rule("2030-01-01", { closed: true })).toBe("CALENDAR_OUT_OF_RANGE");
    await send("put", root, "/admin/calendar/days/2026-02-30").send({ closed: true, title: "bad", reason: "testing rules" }).expect(400);

    // The public read and the working-hours target both see the change.
    const pub = (await request(server()).get(`/calendar/closed-days?from=${today}&to=${addDays(today, 120)}`).expect("Cache-Control", /public/).expect(200)).body;
    expect(pub.days.map((d: { date: string }) => d.date)).toContain(plain);
    expect(pub.days.map((d: { date: string }) => d.date)).not.toContain(official.date);
    expect(JSON.stringify(pub)).not.toContain(reason);
    const closedSet = app.get(HolidayCalendarService).closedDays();
    expect(closedSet.has(plain)).toBe(true);
    const start = new Date(Date.parse(`${plain}T00:00:00Z`) - 3.5 * 3_600_000);
    expect(businessHoursBetween(start, new Date(start.getTime() + DAY), closedSet)).toBe(0);
    await request(server()).get(`/calendar/closed-days?from=${today}&to=${addDays(today, 500)}`).expect(400);

    // Clearing returns the day to the official list; every change is audited with its reason.
    await send("post", root, `/admin/calendar/days/${official.date}/clear`).send({ reason: "Back to the official calendar" }).expect(201);
    expect((await send("post", root, `/admin/calendar/days/${official.date}/clear`).send({ reason: "Nothing to clear" }).expect(409)).body.error.details.rule).toBe("CALENDAR_NO_STAFF_CHANGE");
    expect(app.get(HolidayCalendarService).isClosed(official.date)).toBe(true);
    const audit = await db.adminAuditLog.findMany({ where: { adminUserId: root.adminUserId, action: { startsWith: "calendar_day." } }, orderBy: { createdAt: "asc" } });
    expect(audit.map((r) => r.action)).toEqual(["calendar_day.changed", "calendar_day.changed", "calendar_day.cleared"]);
    expect(audit[0]!.reason).toBe(reason);
  });
});
