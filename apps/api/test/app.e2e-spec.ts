import { Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";

interface Cookies {
  session?: string;
  csrf?: string;
}

/** Extracts the code the DevOtpProvider logs instead of sending an SMS/email. */
function captureOtpCode(logSpy: jest.SpyInstance, identifier: string): string {
  const call = logSpy.mock.calls.find(
    (args) => typeof args[0] === "string" && args[0].includes("[DEV OTP]") && args[0].includes(identifier),
  );
  if (!call) throw new Error(`No OTP log found for ${identifier}`);
  const match = /code=(\d+)/.exec(call[0] as string);
  if (!match) throw new Error("Could not parse OTP code from log line");
  return match[1]!;
}

async function primeCsrf(app: INestApplication): Promise<Cookies> {
  const res = await request(app.getHttpServer()).get("/health/live");
  return { csrf: extractCookie(res.headers["set-cookie"], "petlife_csrf") };
}

async function signUp(app: INestApplication, logSpy: jest.SpyInstance, identifier: string): Promise<Cookies> {
  const primed = await primeCsrf(app);
  await request(app.getHttpServer())
    .post("/auth/request-otp")
    .set("Cookie", `petlife_csrf=${primed.csrf}`)
    .set("x-csrf-token", primed.csrf!)
    .send({ identifier })
    .expect(200);

  const code = captureOtpCode(logSpy, identifier);

  const verifyRes = await request(app.getHttpServer())
    .post("/auth/verify-otp")
    .set("Cookie", `petlife_csrf=${primed.csrf}`)
    .set("x-csrf-token", primed.csrf!)
    .send({ identifier, code })
    .expect(200);

  const session = extractCookie(verifyRes.headers["set-cookie"], "petlife_session");
  return { session, csrf: primed.csrf };
}

function authedRequest(app: INestApplication, cookies: Cookies) {
  const cookieHeader = `petlife_session=${cookies.session}; petlife_csrf=${cookies.csrf}`;
  return {
    get: (url: string) => request(app.getHttpServer()).get(url).set("Cookie", cookieHeader),
    post: (url: string) =>
      request(app.getHttpServer()).post(url).set("Cookie", cookieHeader).set("x-csrf-token", cookies.csrf!),
    patch: (url: string) =>
      request(app.getHttpServer()).patch(url).set("Cookie", cookieHeader).set("x-csrf-token", cookies.csrf!),
    put: (url: string) =>
      request(app.getHttpServer()).put(url).set("Cookie", cookieHeader).set("x-csrf-token", cookies.csrf!),
  };
}

describe("PET LIFE OS critical paths (e2e)", () => {
  let app: INestApplication;
  let logSpy: jest.SpyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  it("requests and verifies an OTP to establish a session", async () => {
    const identifier = `sarah-${unique()}@example.com`;
    const cookies = await signUp(app, logSpy, identifier);
    expect(cookies.session).toBeDefined();

    const client = authedRequest(app, cookies);
    const sessionRes = await client.get("/auth/session").expect(200);
    expect(sessionRes.body.user.email).toBe(identifier);
  });

  it("denies access to a pet the user has no PetAccess grant for (IDOR)", async () => {
    const ownerIdentifier = `owner-${unique()}@example.com`;
    const strangerIdentifier = `stranger-${unique()}@example.com`;

    const owner = authedRequest(app, await signUp(app, logSpy, ownerIdentifier));
    const stranger = authedRequest(app, await signUp(app, logSpy, strangerIdentifier));

    const household = await owner.post("/households").send({ name: "Owner Home" }).expect(201);
    const pet = await owner
      .post(`/households/${household.body.id}/pets`)
      .send({ name: "Luna", species: "DOG", birthDate: "2022-03-15" })
      .expect(201);

    const denied = await stranger.get(`/pets/${pet.body.id}`).expect(403);
    expect(denied.body.error.code).toBe("PET_ACCESS_DENIED");
  });

  it("creates a household, creates a pet with optional fields skipped, and auto-activates it", async () => {
    const identifier = `flow-${unique()}@example.com`;
    const client = authedRequest(app, await signUp(app, logSpy, identifier));

    const household = await client.post("/households").send({}).expect(201);
    const householdId = household.body.id;

    const luna = await client
      .post(`/households/${householdId}/pets`)
      .send({ name: "Luna", species: "DOG", approximateAgeMonths: 24 })
      .expect(201);
    expect(luna.body.breed).toBeNull();
    expect(luna.body.photoUrl).toBeNull();

    const activePet = await client.get(`/households/${householdId}/active-pet`).expect(200);
    expect(activePet.body.id).toBe(luna.body.id);
  });

  it("switches active pet between Luna and Milo, and Home reflects the change", async () => {
    const identifier = `switcher-${unique()}@example.com`;
    const client = authedRequest(app, await signUp(app, logSpy, identifier));

    const household = await client.post("/households").send({}).expect(201);
    const householdId = household.body.id;

    const luna = await client
      .post(`/households/${householdId}/pets`)
      .send({ name: "Luna", species: "DOG", approximateAgeMonths: 24 })
      .expect(201);
    const milo = await client
      .post(`/households/${householdId}/pets`)
      .send({ name: "Milo", species: "CAT", approximateAgeMonths: 18 })
      .expect(201);

    const homeWithLuna = await client.get("/home").expect(200);
    expect(homeWithLuna.body.activePet.id).toBe(luna.body.id);

    await client.put(`/households/${householdId}/active-pet`).send({ petId: milo.body.id }).expect(200);

    const homeWithMilo = await client.get("/home").expect(200);
    expect(homeWithMilo.body.activePet.id).toBe(milo.body.id);
  });

  it("resumes onboarding progress across requests", async () => {
    const identifier = `onboard-${unique()}@example.com`;
    const client = authedRequest(app, await signUp(app, logSpy, identifier));

    const initial = await client.get("/onboarding").expect(200);
    expect(initial.body.status).toBe("IN_PROGRESS");
    expect(initial.body.chapter).toBe("ACCOUNT");

    await client
      .put("/onboarding/progress")
      .send({ chapter: "HOUSEHOLD", step: "household-setup", status: "COMPLETED" })
      .expect(200);

    const resumed = await client.get("/onboarding").expect(200);
    expect(resumed.body.chapter).toBe("HOUSEHOLD");
    expect(resumed.body.completedSteps).toContain("household-setup");
  });

  it("treats a retried pet creation with the same Idempotency-Key as a single create", async () => {
    const identifier = `idem-${unique()}@example.com`;
    const client = authedRequest(app, await signUp(app, logSpy, identifier));

    const household = await client.post("/households").send({}).expect(201);
    const householdId = household.body.id;
    const idempotencyKey = `key-${unique()}`;

    const first = await client
      .post(`/households/${householdId}/pets`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ name: "Rex", species: "DOG", approximateAgeMonths: 6 })
      .expect(201);

    const second = await client
      .post(`/households/${householdId}/pets`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ name: "Rex", species: "DOG", approximateAgeMonths: 6 })
      .expect(201);

    expect(second.body.id).toBe(first.body.id);

    const pets = await client.get(`/households/${householdId}/pets`).expect(200);
    expect(pets.body.filter((p: { name: string }) => p.name === "Rex")).toHaveLength(1);
  });
});
