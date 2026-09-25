import { Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import {
  LocationMode,
  PetAccessSource,
  ProviderServiceType,
  ProviderType,
  ProviderVerificationStatus,
  ServiceCategory,
} from "@prisma/client";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";

type Cookies = { session?: string; csrf?: string };

function captureOtpCode(spy: jest.SpyInstance, identifier: string): string {
  const line = spy.mock.calls.find((args) => typeof args[0] === "string" && args[0].includes("[DEV OTP]") && args[0].includes(identifier))?.[0] as string | undefined;
  const code = line ? /code=(\d+)/.exec(line)?.[1] : undefined;
  if (!code) throw new Error(`OTP not captured for ${identifier}`);
  return code;
}

async function signUp(app: INestApplication, spy: jest.SpyInstance, identifier: string): Promise<Cookies> {
  const primed = await request(app.getHttpServer()).get("/health/live");
  const csrf = extractCookie(primed.headers["set-cookie"], "petlife_csrf");
  await request(app.getHttpServer()).post("/auth/request-otp").set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf!).send({ identifier }).expect(200);
  const verified = await request(app.getHttpServer()).post("/auth/verify-otp").set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf!).send({ identifier, code: captureOtpCode(spy, identifier) }).expect(200);
  return { csrf, session: extractCookie(verified.headers["set-cookie"], "petlife_session") };
}

function client(app: INestApplication, cookies: Cookies) {
  const cookie = `petlife_session=${cookies.session}; petlife_csrf=${cookies.csrf}`;
  return {
    get: (url: string) => request(app.getHttpServer()).get(url).set("Cookie", cookie),
    post: (url: string) => request(app.getHttpServer()).post(url).set("Cookie", cookie),
  };
}

describe("Phase 0 discovery privacy and vet integrity (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let logSpy: jest.SpyInstance | undefined;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });

  afterAll(async () => {
    logSpy?.mockRestore();
    if (app) await app.close();
  });

  it("exposes immutable release traceability metadata", async () => {
    const response = await request(app.getHttpServer()).get("/health/version").expect(200);
    expect(response.body).toEqual(expect.objectContaining({
      version: expect.any(String),
      sha: expect.any(String),
      buildTime: expect.any(String),
      environment: expect.any(String),
      deploymentId: expect.any(String),
    }));
  });

  it("personalizes service and vet availability only for owner/granted users, without cross-household disclosure", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ownerEmail = `p0-owner-${suffix}@example.com`;
    const grantedEmail = `p0-granted-${suffix}@example.com`;
    const strangerEmail = `p0-stranger-${suffix}@example.com`;
    const [ownerCookies, grantedCookies, strangerCookies] = await Promise.all([
      signUp(app, logSpy!, ownerEmail),
      signUp(app, logSpy!, grantedEmail),
      signUp(app, logSpy!, strangerEmail),
    ]);
    const owner = client(app, ownerCookies);
    const granted = client(app, grantedCookies);
    const stranger = client(app, strangerCookies);

    const household = await owner.post("/households").set("x-csrf-token", ownerCookies.csrf!).send({ name: "P0 household" }).expect(201);
    const pet = await owner.post(`/households/${household.body.id}/pets`).set("x-csrf-token", ownerCookies.csrf!).send({ name: "Private dog", species: "DOG", approximateAgeMonths: 24 }).expect(201);
    const grantedUser = await prisma.user.findUniqueOrThrow({ where: { email: grantedEmail } });
    await prisma.petAccessGrant.create({ data: { petId: pet.body.id, userId: grantedUser.id, source: PetAccessSource.MANUAL, canViewIdentity: true } });

    const vet = await prisma.providerOrganization.create({ data: { name: `P0 vet ${suffix}`, type: ProviderType.VET_CLINIC, verificationStatus: ProviderVerificationStatus.VERIFIED } });
    const location = await prisma.providerLocation.create({ data: { providerOrganizationId: vet.id, addressLine: "P0", city: "Tehran", countryCode: "IR", timezone: "Asia/Tehran" } });
    const service = await prisma.providerService.create({
      data: {
        providerOrganizationId: vet.id,
        locationId: location.id,
        name: "Cats only consultation",
        type: ProviderServiceType.CONSULTATION,
        category: ServiceCategory.VET,
        durationMinutes: 30,
        priceAmount: 1000,
        currency: "IRR",
        locationMode: LocationMode.AT_PROVIDER,
        supportsDog: false,
        supportsCat: true,
      },
    });

    const detailUrl = `/provider-services/${service.id}?petId=${pet.body.id}`;
    expect((await request(app.getHttpServer()).get(detailUrl).expect(200)).body.compatibility).toBeNull();
    expect((await stranger.get(detailUrl).expect(200)).body.compatibility).toBeNull();
    expect((await owner.get(detailUrl).expect(200)).body.compatibility.status).toBe("NOT_SUPPORTED");
    expect((await granted.get(detailUrl).expect(200)).body.compatibility.status).toBe("NOT_SUPPORTED");

    const from = new Date(Date.now() + 86_400_000).toISOString();
    const to = new Date(Date.now() + 172_800_000).toISOString();
    const availabilityUrl = `/providers/vets/${vet.id}/availability?locationId=${location.id}&serviceId=${service.id}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&petId=${pet.body.id}`;
    expect((await request(app.getHttpServer()).get(availabilityUrl).expect(200)).body.petCompatible).toBe(true);
    expect((await stranger.get(availabilityUrl).expect(200)).body.petCompatible).toBe(true);
    expect((await owner.get(availabilityUrl).expect(200)).body.petCompatible).toBe(false);
    expect((await granted.get(availabilityUrl).expect(200)).body.petCompatible).toBe(false);
  });

  it("returns actual veterinary organizations only from vet discovery", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const groomer = await prisma.providerOrganization.create({ data: { name: `P0 groomer ${suffix}`, type: ProviderType.GROOMER, verificationStatus: ProviderVerificationStatus.VERIFIED } });
    await prisma.providerService.create({ data: { providerOrganizationId: groomer.id, name: "Grooming", type: ProviderServiceType.GROOMING_SESSION, category: ServiceCategory.GROOMING, durationMinutes: 45, priceAmount: 1000, currency: "IRR", locationMode: LocationMode.AT_PROVIDER } });

    const response = await request(app.getHttpServer()).get(`/providers/vets?search=${encodeURIComponent(suffix)}`).expect(200);
    expect(response.body).toEqual([]);
  });
});
