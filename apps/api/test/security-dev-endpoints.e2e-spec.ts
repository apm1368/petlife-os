import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type * as TestAppModule from "./test-app";

/** Development simulations (Google sign-in, dev notifications, unsigned sandbox webhooks) are unreachable unless explicitly enabled. */
describe("Security: development simulations are opt-in", () => {
  let app: INestApplication;
  const previous = process.env.GOOGLE_DEV_SIMULATE_ENABLED;
  const previousSimulation = process.env.DEV_SIMULATION_ENABLED;

  let extractCookie: typeof TestAppModule.extractCookie;
  let prismaToken: unknown;
  let signSessionCookie: (id: string, secret: string) => string;

  beforeAll(async () => {
    // Config is validated when AppModule is first imported, so the flag must be set before loading it.
    process.env.GOOGLE_DEV_SIMULATE_ENABLED = "false";
    process.env.DEV_SIMULATION_ENABLED = "false";
    let testApp!: typeof TestAppModule;
    await jest.isolateModulesAsync(async () => {
      testApp = await import("./test-app");
      prismaToken = (await import("../src/common/prisma/prisma.service")).PrismaService;
      signSessionCookie = (await import("../src/common/session/session-cookie.util")).signSessionCookie;
    });
    extractCookie = testApp.extractCookie;
    app = await testApp.createTestApp();
  });

  afterAll(async () => {
    process.env.GOOGLE_DEV_SIMULATE_ENABLED = previous;
    process.env.DEV_SIMULATION_ENABLED = previousSimulation;
    await app.close();
  });

  it("refuses to issue a session when the flag is not set, outside production too", async () => {
    const csrf = extractCookie((await request(app.getHttpServer()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
    const res = await request(app.getHttpServer())
      .post("/dev/auth/google/simulate")
      .set("Cookie", `petlife_csrf=${csrf}`)
      .set("x-csrf-token", csrf)
      .send({ sub: "probe", email: "someone@example.com", emailVerified: true });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(extractCookie(res.headers["set-cookie"], "petlife_session")).toBeUndefined();
  });

  it("refuses unsigned sandbox payment and shipping webhooks from anyone", async () => {
    const pay = await request(app.getHttpServer()).post("/payments/webhooks/dev_simulated").send({ paymentIntentId: "00000000-0000-4000-8000-000000000000", eventId: "probe-1", status: "SUCCEEDED" });
    expect(pay.status).toBe(400);
    expect(pay.body.error.code).toBe("WEBHOOK_SIGNATURE_INVALID");
    const ship = await request(app.getHttpServer()).post("/shipping/webhooks/dev").send({ providerShipmentId: "probe-1", rawStatus: "DELIVERED" });
    expect(ship.status).toBeGreaterThanOrEqual(400);
    expect(ship.body.error.details.reason).toBe("SANDBOX_WEBHOOKS_DISABLED");
  });

  it("refuses /dev/notifications to a signed-in member", async () => {
    const db = app.get(prismaToken as never) as import("../src/common/prisma/prisma.service").PrismaService;
    const user = await db.user.create({ data: { displayName: "probe", email: `dev-probe-${Date.now()}@example.com` } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 3600e3) } });
    const csrf = extractCookie((await request(app.getHttpServer()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
    const res = await request(app.getHttpServer())
      .post("/dev/notifications/deliveries/process-due")
      .set("Cookie", `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}`)
      .set("x-csrf-token", csrf);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("MESSAGING_PROVIDER_DISABLED");
  });
});
