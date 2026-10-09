import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";

/** Phase A (full live QA) regressions. */
describe("Phase A live-QA fixes", () => {
  let app: INestApplication, db: PrismaService;
  beforeAll(async () => { app = await createTestApp(); db = app.get(PrismaService); });
  afterAll(async () => app.close());

  it("admin subscription view of a household that never got a subscription row shows the default plan, not 404", async () => {
    const user = await db.user.create({ data: { displayName: "admin", email: `pa-${randomUUID()}@example.com` } });
    await db.adminUser.create({ data: { userId: user.id, role: AdminRole.SUPER_ADMIN, status: AdminMembershipStatus.ACTIVE } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(app.getHttpServer()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    const cookie = `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}`;
    const hh = await db.household.create({ data: { name: "legacy household" } });
    expect(await db.subscription.count({ where: { householdId: hh.id } })).toBe(0);
    const body = (await request(app.getHttpServer()).get(`/admin/subscriptions/households/${hh.id}`).set("Cookie", cookie).expect(200)).body;
    expect(body.household).toMatchObject({ id: hh.id });
    await request(app.getHttpServer()).get(`/admin/subscriptions/households/${randomUUID()}`).set("Cookie", cookie).expect(404);
    await request(app.getHttpServer()).get("/admin/subscriptions/households/not-a-uuid").set("Cookie", cookie).expect(400);
  });
});
