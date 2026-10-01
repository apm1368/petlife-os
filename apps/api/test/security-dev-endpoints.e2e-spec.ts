import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type * as TestAppModule from "./test-app";

/** The development Google sign-in simulation must be unreachable unless explicitly enabled. */
describe("Security: development sign-in simulation is opt-in", () => {
  let app: INestApplication;
  const previous = process.env.GOOGLE_DEV_SIMULATE_ENABLED;

  let extractCookie: typeof TestAppModule.extractCookie;

  beforeAll(async () => {
    // Config is validated when AppModule is first imported, so the flag must be set before loading it.
    process.env.GOOGLE_DEV_SIMULATE_ENABLED = "false";
    let testApp!: typeof TestAppModule;
    await jest.isolateModulesAsync(async () => {
      testApp = await import("./test-app");
    });
    extractCookie = testApp.extractCookie;
    app = await testApp.createTestApp();
  });

  afterAll(async () => {
    process.env.GOOGLE_DEV_SIMULATE_ENABLED = previous;
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
});
