import { Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { AdminMembershipStatus, AdminRole, PetLifecycleStatus } from "@prisma/client";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";

interface Cookies {
  session?: string;
  csrf?: string;
}

function captureOtpCode(logSpy: jest.SpyInstance, identifier: string): string {
  const call = logSpy.mock.calls.find((args) => typeof args[0] === "string" && args[0].includes("[DEV OTP]") && args[0].includes(identifier));
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
  await request(app.getHttpServer()).post("/auth/request-otp").set("Cookie", `petlife_csrf=${primed.csrf}`).set("x-csrf-token", primed.csrf!).send({ identifier }).expect(200);
  const code = captureOtpCode(logSpy, identifier);
  const verifyRes = await request(app.getHttpServer()).post("/auth/verify-otp").set("Cookie", `petlife_csrf=${primed.csrf}`).set("x-csrf-token", primed.csrf!).send({ identifier, code }).expect(200);
  const session = extractCookie(verifyRes.headers["set-cookie"], "petlife_session");
  return { session, csrf: primed.csrf };
}

function authedRequest(app: INestApplication, cookies: Cookies) {
  const cookieHeader = `petlife_session=${cookies.session}; petlife_csrf=${cookies.csrf}`;
  return {
    get: (url: string) => request(app.getHttpServer()).get(url).set("Cookie", cookieHeader),
    post: (url: string) => request(app.getHttpServer()).post(url).set("Cookie", cookieHeader).set("x-csrf-token", cookies.csrf!),
    patch: (url: string) => request(app.getHttpServer()).patch(url).set("Cookie", cookieHeader).set("x-csrf-token", cookies.csrf!),
    delete: (url: string) => request(app.getHttpServer()).delete(url).set("Cookie", cookieHeader).set("x-csrf-token", cookies.csrf!),
  };
}

/**
 * Handoff 18 — Lost Pet + Animal Support + Community + Memories e2e flows
 * (mirrors clinical-health.e2e-spec.ts's own structure). Covers spec Flows
 * A, B, C, D, F, G, H, I, J, K, L, M, N, O, P.
 */
describe("Lost Pet + Animal Support + Community + Memories (Handoff 18)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let logSpy: jest.SpyInstance;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
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

  async function setupHousehold(petName = "Luna") {
    const identifier = `h18-owner-${unique()}@example.com`;
    const client = authedRequest(app, await signUp(app, logSpy, identifier));
    const ownerUser = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });
    const household = await client.post("/households").send({}).expect(201);
    const householdId = household.body.id as string;
    const pet = await client.post(`/households/${householdId}/pets`).send({ name: petName, species: "DOG", approximateAgeMonths: 30 }).expect(201);
    return { client, householdId, ownerUserId: ownerUser.id as string, petId: pet.body.id as string };
  }

  async function setupAdmin(role: AdminRole) {
    const identifier = `h18-admin-${role.toLowerCase()}-${unique()}@example.com`;
    const client = authedRequest(app, await signUp(app, logSpy, identifier));
    const user = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });
    await prisma.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } });
    return { client, userId: user.id as string };
  }

  async function setupVerifiedOrgWithActiveCampaign(admin: ReturnType<typeof setupAdmin> extends Promise<infer T> ? T : never, fundType: "GENERAL" | "RESTRICTED") {
    const org = await admin.client.post("/admin/animal-support/organizations").send({ type: "NGO", name: `Rescue Org ${unique()}` }).expect(201);
    const organizationId = org.body.id as string;
    await admin.client.post(`/admin/animal-support/organizations/${organizationId}/verification`).send({ verificationStatus: "VERIFIED" }).expect(201);
    await admin.client.post(`/admin/animal-support/organizations/${organizationId}/listing`).send({ isPubliclyListed: true }).expect(201);
    const campaign = await admin.client.post(`/admin/animal-support/organizations/${organizationId}/campaigns`).send({ title: `Campaign ${unique()}`, description: "Help the animals", fundType }).expect(201);
    const campaignId = campaign.body.id as string;
    await admin.client.patch(`/admin/animal-support/campaigns/${campaignId}/status`).send({ status: "ACTIVE" }).expect(200);
    return { organizationId, campaignId };
  }

  // -- Flow A + B: Lost Pet Incident + Public Privacy -----------------------

  it("Flow A/B: opening an incident transitions the pet to LOST, and the public view excludes private fields", async () => {
    const { client, petId } = await setupHousehold();

    const incident = await client
      .post(`/pets/${petId}/lost-incidents`)
      .send({ description: "Ran off during a walk", lastKnownLocation: "Central Park", privateNotes: "Chip number 12345", contactPreference: "IN_APP_MESSAGE" })
      .expect(201);
    const incidentId = incident.body.id as string;
    expect(incident.body.status).toBe("OPEN");

    const pet = await prisma.pet.findUniqueOrThrow({ where: { id: petId } });
    expect(pet.lifecycleStatus).toBe(PetLifecycleStatus.LOST);

    const publicView = await request(app.getHttpServer()).get(`/lost-pets/${incidentId}`).expect(200);
    expect(publicView.body.privateNotes).toBeUndefined();
    expect(publicView.body.createdByUserId).toBeUndefined();
    expect(publicView.body.householdId).toBeUndefined();
    expect(publicView.body.petName).toBe("Luna");
  });

  // -- Flow C + D: Sighting + Reunification ---------------------------------

  it("Flow C/D: an anonymous sighting is accepted without exposing the reporter, and reuniting returns the pet to ACTIVE", async () => {
    const { client, petId } = await setupHousehold();
    const incident = await client.post(`/pets/${petId}/lost-incidents`).send({ description: "Lost near the park" }).expect(201);
    const incidentId = incident.body.id as string;

    const primed = await primeCsrf(app);
    const sighting = await request(app.getHttpServer())
      .post(`/lost-pets/${incidentId}/sightings`)
      .set("Cookie", `petlife_csrf=${primed.csrf}`)
      .set("x-csrf-token", primed.csrf!)
      .send({ location: "5th Ave", seenAt: new Date().toISOString(), description: "Saw a dog matching the description" })
      .expect(201);
    expect(sighting.body.isAnonymous).toBe(true);
    expect(sighting.body.reporterUserId).toBeNull();

    const afterSighting = await client.get(`/pets/${petId}/lost-incidents/${incidentId}`).expect(200);
    expect(afterSighting.body.status).toBe("SIGHTING_REPORTED");

    await client.post(`/pets/${petId}/lost-incidents/${incidentId}/mark-found`).send({}).expect(201);
    await client.post(`/pets/${petId}/lost-incidents/${incidentId}/reunite`).send({}).expect(201);

    const pet = await prisma.pet.findUniqueOrThrow({ where: { id: petId } });
    expect(pet.lifecycleStatus).toBe(PetLifecycleStatus.ACTIVE);
  });

  // -- Flow L: Lost Pet Community Share --------------------------------------

  it("Flow L: sharing an incident to community creates a distribution post without affecting the incident", async () => {
    const { client, petId } = await setupHousehold();
    const incident = await client.post(`/pets/${petId}/lost-incidents`).send({ description: "Lost near downtown" }).expect(201);
    const incidentId = incident.body.id as string;

    const post = await client.post(`/pets/${petId}/lost-incidents/${incidentId}/share-to-community`).send({}).expect(201);
    expect(post.body.sourceType).toBe("LOST_PET_INCIDENT");
    expect(post.body.sourceLostPetIncidentId).toBe(incidentId);

    const stillOpen = await client.get(`/pets/${petId}/lost-incidents/${incidentId}`).expect(200);
    expect(stillOpen.body.status).toBe("OPEN");
  });

  // -- Flow F: Animal Support Organization -----------------------------------

  it("Flow F: only a VERIFIED and publicly-listed organization is visible on the public directory", async () => {
    const admin = await setupAdmin(AdminRole.ADMIN);
    const org = await admin.client.post("/admin/animal-support/organizations").send({ type: "SHELTER", name: `Shelter ${unique()}` }).expect(201);
    const organizationId = org.body.id as string;

    const hiddenBefore = await request(app.getHttpServer()).get(`/animal-support/organizations/${organizationId}`);
    expect(hiddenBefore.status).toBe(404);

    await admin.client.post(`/admin/animal-support/organizations/${organizationId}/verification`).send({ verificationStatus: "VERIFIED" }).expect(201);
    await admin.client.post(`/admin/animal-support/organizations/${organizationId}/listing`).send({ isPubliclyListed: true }).expect(201);

    const visible = await request(app.getHttpServer()).get(`/animal-support/organizations/${organizationId}`).expect(200);
    expect(visible.body.verificationStatus).toBe("VERIFIED");
  });

  // -- Flow G: Restricted Donation fund separation ---------------------------

  it("Flow G: a restricted donation posts only to the restricted fund, never the general fund", async () => {
    const admin = await setupAdmin(AdminRole.ADMIN);
    const { organizationId, campaignId } = await setupVerifiedOrgWithActiveCampaign(admin, "RESTRICTED");
    const { client: donorClient } = await setupHousehold();

    await donorClient.post(`/animal-support/campaigns/${campaignId}/donate`).send({ amountIrr: 500_000 }).expect(201);

    const balance = await admin.client.get(`/admin/animal-support/organizations/${organizationId}/fund-balance`).expect(200);
    expect(balance.body.restrictedAvailableIrr).toBe(500_000);
    expect(balance.body.generalAvailableIrr).toBe(0);
  });

  // -- Flow H: Duplicate Donation idempotency --------------------------------

  it("Flow H: repeating a donation request with the same idempotencyKey never double-posts the ledger", async () => {
    const admin = await setupAdmin(AdminRole.ADMIN);
    const { campaignId } = await setupVerifiedOrgWithActiveCampaign(admin, "GENERAL");
    const { client: donorClient } = await setupHousehold();
    const idempotencyKey = `donate-${unique()}`;

    const first = await donorClient.post(`/animal-support/campaigns/${campaignId}/donate`).send({ amountIrr: 250_000, idempotencyKey }).expect(201);
    const second = await donorClient.post(`/animal-support/campaigns/${campaignId}/donate`).send({ amountIrr: 250_000, idempotencyKey }).expect(201);
    expect(second.body.donationIntentId).toBe(first.body.donationIntentId);

    const transactionCount = await prisma.donationTransaction.count({ where: { donationIntentId: first.body.donationIntentId } });
    expect(transactionCount).toBe(1);
  });

  // -- Flow I: Donation Privacy -----------------------------------------------

  it("Flow I: a donor's identity is never exposed publicly unless they explicitly opt in", async () => {
    const admin = await setupAdmin(AdminRole.ADMIN);
    const { campaignId } = await setupVerifiedOrgWithActiveCampaign(admin, "GENERAL");
    const { client: anonDonorClient } = await setupHousehold();
    const { client: publicDonorClient } = await setupHousehold();

    await anonDonorClient.post(`/animal-support/campaigns/${campaignId}/donate`).send({ amountIrr: 100_000 }).expect(201);
    await publicDonorClient.post(`/animal-support/campaigns/${campaignId}/donate`).send({ amountIrr: 200_000, showDonorPublicly: true }).expect(201);

    const donors = await request(app.getHttpServer()).get(`/animal-support/campaigns/${campaignId}/donors`).expect(200);
    expect(donors.body).toHaveLength(1);
    expect(donors.body[0].amountIrr).toBe(200_000);
  });

  // -- Flow J: Community Post --------------------------------------------------

  it("Flow J: an authenticated user can create and read back a community post, anonymous users can only read", async () => {
    const { client } = await setupHousehold();

    const created = await client.post("/community/posts").send({ type: "GENERAL", body: "Any tips for a picky eater?" }).expect(201);
    expect(created.body.status).toBe("PUBLISHED");

    const publicList = await request(app.getHttpServer()).get("/community/posts").expect(200);
    expect(publicList.body.items.some((p: { id: string }) => p.id === created.body.id)).toBe(true);

    await request(app.getHttpServer()).post("/community/posts").send({ type: "GENERAL", body: "should be rejected" }).expect(403);
  });

  // -- Flow K: Community Report + moderation escalation ------------------------

  it("Flow K: a report can be escalated by a moderator into the existing Trust & Safety queue", async () => {
    const { client: authorClient } = await setupHousehold();
    const { client: reporterClient } = await setupHousehold();
    const trustAdmin = await setupAdmin(AdminRole.TRUST_SAFETY);

    const post = await authorClient.post("/community/posts").send({ type: "GENERAL", body: "Some post" }).expect(201);
    const postId = post.body.id as string;

    const report = await reporterClient.post(`/community/posts/${postId}/report`).send({ reason: "SPAM" }).expect(201);
    const reportId = report.body.id as string;

    const escalated = await trustAdmin.client.post(`/admin/community/reports/${reportId}/escalate`).send({ reason: "Looks like spam" }).expect(201);
    expect(escalated.body.status).toBe("ESCALATED");
    expect(escalated.body.trustCaseId).toBeTruthy();

    const trustCase = await prisma.trustCase.findUniqueOrThrow({ where: { id: escalated.body.trustCaseId } });
    expect(trustCase.subjectType).toBe("COMMUNITY_CONTENT");
    expect(trustCase.subjectId).toBe(postId);
  });

  // -- Flow M + N: Memory + cross-household privacy ----------------------------

  it("Flow M/N: a memory defaults to household-private and is invisible to another household", async () => {
    const { client, petId } = await setupHousehold();
    const { client: otherClient } = await setupHousehold();

    const memory = await client.post(`/pets/${petId}/memories`).send({ type: "MILESTONE", title: "First swim", occurredAt: new Date().toISOString() }).expect(201);
    expect(memory.body.visibility).toBe("PRIVATE");

    await otherClient.get(`/pets/${petId}/memories`).expect(403);
    await otherClient.get(`/pets/${petId}/memories/${memory.body.id}`).expect(403);
  });

  // -- Flow O + P: Memorial mode + no automatic death inference -----------------

  it("Flow O/P: an observation never changes lifecycle status, and an explicit memorial transition suppresses commercial Home actions", async () => {
    const { client, petId } = await setupHousehold();

    await client.post(`/pets/${petId}/observations`).send({ category: "APPETITE", description: "Ate less than usual", observedAt: new Date().toISOString() }).expect(201);
    const afterObservation = await prisma.pet.findUniqueOrThrow({ where: { id: petId } });
    expect(afterObservation.lifecycleStatus).toBe(PetLifecycleStatus.ACTIVE);

    await client.post(`/pets/${petId}/mark-deceased`).send({ reason: "Passed away peacefully" }).expect(201);
    const deceased = await prisma.pet.findUniqueOrThrow({ where: { id: petId } });
    expect(deceased.lifecycleStatus).toBe(PetLifecycleStatus.DECEASED);

    await client.post(`/pets/${petId}/transition-to-memorial`).send({}).expect(201);
    const memorial = await prisma.pet.findUniqueOrThrow({ where: { id: petId } });
    expect(memorial.lifecycleStatus).toBe(PetLifecycleStatus.MEMORIAL);

    const home = await client.get("/home").expect(200);
    expect(home.body.primaryAction.kind).toBe("VIEW_MEMORIES");
  });

  // -- Handoff 21: Memories/Diary enhancement -----------------------------------

  it("H21: a quick entry with no title is accepted and falls back to nothing forced server-side", async () => {
    const { client, petId } = await setupHousehold();

    const created = await client.post(`/pets/${petId}/memories`).send({ type: "STORY", occurredAt: new Date().toISOString(), description: "Chased a squirrel all afternoon" }).expect(201);
    expect(created.body.title).toBeNull();
    expect(created.body.tags).toEqual([]);
    expect(created.body.archivedAt).toBeNull();
  });

  it("H21: memories can be filtered by tag, year, and free-text search", async () => {
    const { client, petId } = await setupHousehold();

    await client.post(`/pets/${petId}/memories`).send({ type: "TRAVEL", title: "Trip to the mountains", occurredAt: "2024-06-01T00:00:00.000Z", tags: ["trip", "milestone"] }).expect(201);
    await client.post(`/pets/${petId}/memories`).send({ type: "STORY", title: "A quiet Sunday nap", occurredAt: "2025-03-10T00:00:00.000Z", tags: ["funny-moment"] }).expect(201);

    const byTag = await client.get(`/pets/${petId}/memories?tag=trip`).expect(200);
    expect(byTag.body.map((m: { title: string }) => m.title)).toEqual(["Trip to the mountains"]);

    const byYear = await client.get(`/pets/${petId}/memories?year=2025`).expect(200);
    expect(byYear.body.map((m: { title: string }) => m.title)).toEqual(["A quiet Sunday nap"]);

    const bySearch = await client.get(`/pets/${petId}/memories?search=quiet`).expect(200);
    expect(bySearch.body.map((m: { title: string }) => m.title)).toEqual(["A quiet Sunday nap"]);

    const all = await client.get(`/pets/${petId}/memories`).expect(200);
    expect(all.body).toHaveLength(2);
  });

  it("H21: archiving a memory is a soft-delete — it disappears from the default list and Life Timeline but is never destroyed, and restore brings it back", async () => {
    const { client, petId } = await setupHousehold();

    const memory = await client.post(`/pets/${petId}/memories`).send({ type: "MILESTONE", title: "Learned to sit", occurredAt: new Date().toISOString() }).expect(201);
    const memoryId = memory.body.id as string;

    await client.delete(`/pets/${petId}/memories/${memoryId}`).expect(200);

    const defaultList = await client.get(`/pets/${petId}/memories`).expect(200);
    expect(defaultList.body.some((m: { id: string }) => m.id === memoryId)).toBe(false);

    const timeline = await client.get(`/pets/${petId}/life-timeline`).expect(200);
    expect(timeline.body.some((e: { recordId: string }) => e.recordId === memoryId)).toBe(false);

    const includingArchived = await client.get(`/pets/${petId}/memories?includeArchived=true`).expect(200);
    const archived = includingArchived.body.find((m: { id: string }) => m.id === memoryId);
    expect(archived.archivedAt).not.toBeNull();

    // Never hard-deleted — the row is still directly readable.
    const stillReadable = await client.get(`/pets/${petId}/memories/${memoryId}`).expect(200);
    expect(stillReadable.body.id).toBe(memoryId);

    await client.post(`/pets/${petId}/memories/${memoryId}/restore`).expect(201);
    const restoredList = await client.get(`/pets/${petId}/memories`).expect(200);
    expect(restoredList.body.some((m: { id: string }) => m.id === memoryId)).toBe(true);
  });

  it("H21: exceeding memories.entries.max is rejected, but every existing memory remains fully readable — a downgrade never holds memories hostage", async () => {
    const { client, petId, householdId } = await setupHousehold();
    const adminUserForOverride = await prisma.user.create({ data: { email: `h21-super-${unique()}@example.com`, displayName: "H21 Test Admin" } });
    const superAdmin = await prisma.adminUser.create({ data: { userId: adminUserForOverride.id, role: AdminRole.SUPER_ADMIN, status: AdminMembershipStatus.ACTIVE } });
    await prisma.subscriptionEntitlementOverride.create({
      data: { householdId, key: "memories.entries.max", type: "LIMIT", limitValue: 1, reason: "H21 test — force a low limit", createdByAdminId: superAdmin.id },
    });

    const first = await client.post(`/pets/${petId}/memories`).send({ type: "PHOTO", title: "First one", occurredAt: new Date().toISOString() }).expect(201);

    const rejected = await client.post(`/pets/${petId}/memories`).send({ type: "PHOTO", title: "One too many", occurredAt: new Date().toISOString() }).expect(409);
    expect(rejected.body.error.code).toBe("SUBSCRIPTION_ENTITLEMENT_LIMIT_EXCEEDED");
    expect(rejected.body.error.details.key).toBe("memories.entries.max");

    // Existing memory remains fully accessible — the limit blocks new creation only.
    await client.get(`/pets/${petId}/memories/${first.body.id}`).expect(200);

    // Archiving the one memory frees a slot without ever hard-deleting it.
    await client.delete(`/pets/${petId}/memories/${first.body.id}`).expect(200);
    await client.post(`/pets/${petId}/memories`).send({ type: "PHOTO", title: "Now there's room", occurredAt: new Date().toISOString() }).expect(201);
  });
});
