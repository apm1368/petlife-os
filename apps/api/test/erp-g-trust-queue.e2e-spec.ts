import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";

type Actor = { id: string; adminId?: string; cookie: string; csrf: string };
const H = 3600e3;

/** ERP-G: one prioritized Trust & Safety queue over reports, place reports, cases and appeals; chat/review report escalation fixed. */
describe("ERP-G unified Trust & Safety queue", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const post = (a: Actor, u: string) => request(server()).post(u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function actor(name: string, role?: AdminRole): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `erpg-${randomUUID()}@example.com` } });
    const admin = role ? await db.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } }) : null;
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 24 * H) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, adminId: admin?.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }
  /** All pages (local DBs are reused, so the queue can exceed one page). */
  const queue = async (a: Actor, q = "") => {
    const items: { key: string; [k: string]: unknown }[] = [];
    for (let page = 1; ; page++) {
      const b = (await get(a, `/admin/trust/queue?pageSize=100&page=${page}${q}`).expect(200)).body;
      items.push(...b.items);
      if (items.length >= b.total || !b.items.length) return { ...b, items };
    }
  };

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0); // concurrent requests below: listen once (per-request listen() races → ECONNRESET)
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("groups duplicate reports per target, triages severity, flags SLA breaches, claim/release/dismiss with audit; permissions", async () => {
    const ts = await actor("ts", AdminRole.TRUST_SAFETY);
    const ts2 = await actor("ts2", AdminRole.TRUST_SAFETY);
    const fin = await actor("fin", AdminRole.FINANCE);
    const author = await actor("author");
    const reporters = await Promise.all([actor("r1"), actor("r2"), actor("r3")]);
    const spamPost = await db.communityPost.create({ data: { authorUserId: author.id, body: "buy now (QA)", status: "PUBLISHED" } });
    const cruelPost = await db.communityPost.create({ data: { authorUserId: author.id, body: "QA animal welfare case", status: "PUBLISHED" } });
    for (const r of reporters) await db.communityReport.create({ data: { postId: spamPost.id, reporterUserId: r.id, reason: "SPAM" } });
    await db.communityReport.create({ data: { postId: cruelPost.id, reporterUserId: reporters[0]!.id, reason: "ANIMAL_WELFARE", createdAt: new Date(Date.now() - 10 * H) } });

    await get(fin, "/admin/trust/queue").expect(403);
    const q = await queue(ts, "&kind=REPORT");
    const spam = q.items.find((i: { subjectId: string }) => i.subjectId === spamPost.id);
    const cruel = q.items.find((i: { subjectId: string }) => i.subjectId === cruelPost.id);
    expect(spam).toMatchObject({ kind: "REPORT", subjectType: "COMMUNITY_CONTENT", reportCount: 3, reporterCount: 3, severity: "MEDIUM", reasons: ["SPAM"], slaBreached: false, assignedAdminId: null });
    expect(cruel).toMatchObject({ severity: "HIGH", slaHours: 4, slaBreached: true });
    // Breached + higher severity first.
    expect(q.items.findIndex((i: { key: string }) => i.key === cruel.key)).toBeLessThan(q.items.findIndex((i: { key: string }) => i.key === spam.key));
    expect((await queue(ts, "&breachedOnly=true")).items.map((i: { key: string }) => i.key)).toContain(cruel.key);
    const sum = (await get(ts, "/admin/trust/queue/summary").expect(200)).body;
    expect(sum.slaBreached).toBeGreaterThanOrEqual(1);
    expect(sum.sla).toEqual({ highSeverityHours: 4, standardHours: 48 });

    // Claim: the whole group moves; a second moderator can't take it; release frees it.
    await post(fin, "/admin/trust/queue/claim").send({ key: spam.key }).expect(403);
    await post(ts, "/admin/trust/queue/claim").send({ key: "REPORT:nope" }).expect(400);
    expect((await post(ts, "/admin/trust/queue/claim").send({ key: spam.key }).expect(201)).body).toMatchObject({ assignedAdminId: ts.adminId });
    expect(await db.communityReport.count({ where: { postId: spamPost.id, assignedAdminId: ts.adminId } })).toBe(3);
    expect((await post(ts2, "/admin/trust/queue/claim").send({ key: spam.key }).expect(400)).body.error.details.reason).toBe("ALREADY_CLAIMED");
    expect((await queue(ts, "&assigned=me")).items.map((i: { key: string }) => i.key)).toEqual([spam.key]);
    expect((await queue(ts2, "&assigned=unassigned")).items.map((i: { key: string }) => i.key)).not.toContain(spam.key);
    await post(ts, "/admin/trust/queue/release").send({ key: spam.key }).expect(201);
    expect(await db.communityReport.count({ where: { postId: spamPost.id, assignedAdminId: null } })).toBe(3);

    // Brigade of spam reports dismissed in one audited step; the item leaves the queue.
    await post(ts, "/admin/trust/queue/dismiss").send({ key: spam.key, reason: "duplicate spam reports, content is fine" }).expect(201);
    expect(await db.communityReport.count({ where: { postId: spamPost.id, status: "DISMISSED" } })).toBe(3);
    expect((await queue(ts)).items.map((i: { key: string }) => i.key)).not.toContain(spam.key);
    await post(ts, "/admin/trust/queue/dismiss").send({ key: `TRUST_CASE:${randomUUID()}`, reason: "not a group" }).expect(404);
    expect(await db.adminAuditLog.count({ where: { entityId: spam.key, action: { in: ["trust_queue.claimed", "trust_queue.released", "trust_queue.bulk_dismissed"] } } })).toBe(3);
  });

  it("place reports, open cases and pending appeals appear in the same queue; claiming an appeal starts its review", async () => {
    const ts = await actor("ts", AdminRole.TRUST_SAFETY);
    const member = await actor("member");
    const place = await db.petFriendlyPlace.findFirst() ?? null;
    if (place) await db.placeReport.create({ data: { placeId: place.id, userId: member.id, reason: "CLOSED_PERMANENTLY" } });
    const tcase = await db.trustCase.create({ data: { subjectType: "USER", subjectId: member.id, reason: "QA case", severity: "CRITICAL", openedByAdminId: ts.adminId! } });
    const action = await db.trustAction.create({ data: { trustCaseId: tcase.id, actionType: "WARNING", reason: "QA warning", performedByAdminId: ts.adminId! } });
    const appeal = await db.appeal.create({ data: { trustActionId: action.id, appellantUserId: member.id, reason: "I disagree (QA)" } });
    const items = (await queue(ts)).items;
    expect(items.find((i: { key: string }) => i.key === `TRUST_CASE:${tcase.id}`)).toMatchObject({ kind: "TRUST_CASE", severity: "CRITICAL", slaHours: 4 });
    expect(items.find((i: { key: string }) => i.key === `APPEAL:${appeal.id}`)).toMatchObject({ kind: "APPEAL", trustCaseId: tcase.id });
    if (place) expect(items.some((i: { kind: string; subjectId: string }) => i.kind === "PLACE_REPORT" && i.subjectId === place.id)).toBe(true);
    await post(ts, "/admin/trust/queue/claim").send({ key: `APPEAL:${appeal.id}` }).expect(201);
    expect(await db.appeal.findUniqueOrThrow({ where: { id: appeal.id } })).toMatchObject({ status: "UNDER_REVIEW", reviewerAdminId: ts.adminId });
    await post(ts, "/admin/trust/queue/claim").send({ key: `TRUST_CASE:${tcase.id}` }).expect(201);
    expect((await db.trustCase.findUniqueOrThrow({ where: { id: tcase.id } })).assignedAdminId).toBe(ts.adminId);
  });

  it("fix: chat-message and provider-review reports escalate into cases and moderation actually hides/restores them", async () => {
    const ts = await actor("ts", AdminRole.TRUST_SAFETY);
    const a = await actor("a"), b = await actor("b");
    const conv = await db.chatConversation.create({ data: { pairKey: [a.id, b.id].sort().join(":"), participants: { create: [{ userId: a.id }, { userId: b.id }] } } });
    {
      const msg = await db.chatMessage.create({ data: { conversationId: conv.id, senderUserId: a.id, body: "QA abusive message" } });
      const rep = await db.communityReport.create({ data: { chatMessageId: msg.id, reporterUserId: b.id, reason: "HARASSMENT" } });
      const esc = (await post(ts, `/admin/community/reports/${rep.id}/escalate`).send({ reason: "harassment in chat" }).expect(201)).body;
      expect(esc).toMatchObject({ status: "ESCALATED", chatMessageId: msg.id });
      await post(ts, `/admin/trust/cases/${esc.trustCaseId}/actions`).send({ actionType: "REMOVE_CONTENT", reason: "harassment" }).expect(201);
      expect((await db.chatMessage.findUniqueOrThrow({ where: { id: msg.id } })).status).toBe("REMOVED");
      await post(ts, `/admin/trust/cases/${esc.trustCaseId}/actions`).send({ actionType: "RESTORE", reason: "appeal upheld" }).expect(201);
      expect((await db.chatMessage.findUniqueOrThrow({ where: { id: msg.id } })).status).toBe("PUBLISHED");
    }
    const org = await db.providerOrganization.create({ data: { name: `ERPG ${randomUUID().slice(0, 6)}`, type: "VET_CLINIC", verificationStatus: "VERIFIED" } });
    const loc = await db.providerLocation.create({ data: { providerOrganizationId: org.id, addressLine: "x", city: "Tehran", countryCode: "IR", timezone: "UTC" } });
    const svc = await db.providerService.create({ data: { providerOrganizationId: org.id, locationId: loc.id, name: "v", type: "GENERAL_VET_VISIT", category: "VET", locationMode: "AT_PROVIDER", durationMinutes: 30 } });
    const hh = await db.household.create({ data: { name: "h", members: { create: { userId: a.id, role: "OWNER" } } } });
    const pet = await db.pet.create({ data: { householdId: hh.id, name: "p", species: "DOG", approximateAgeMonths: 20 } });
    const bk = await db.booking.create({ data: { householdId: hh.id, petId: pet.id, userId: a.id, providerOrganizationId: org.id, providerLocationId: loc.id, providerServiceId: svc.id, category: "VET", locationMode: "AT_PROVIDER", startAt: new Date(Date.now() - 86400e3), endAt: new Date(Date.now() - 86000e3), timezone: "UTC", bookingStatus: "COMPLETED" } });
    const review = await db.providerReview.create({ data: { bookingId: bk.id, providerOrganizationId: org.id, userId: a.id, rating: 1, body: "QA fake review" } });
    const rr = await db.communityReport.create({ data: { providerReviewId: review.id, reporterUserId: b.id, reason: "SCAM" } });
    expect((await queue(ts, "&subjectType=REVIEW")).items.find((i: { subjectId: string }) => i.subjectId === review.id)).toMatchObject({ severity: "HIGH" });
    const e2 = (await post(ts, `/admin/community/reports/${rr.id}/escalate`).send({ reason: "fake review" }).expect(201)).body;
    expect(await db.trustCase.findUniqueOrThrow({ where: { id: e2.trustCaseId } })).toMatchObject({ subjectType: "REVIEW", subjectId: review.id });
    await post(ts, `/admin/trust/cases/${e2.trustCaseId}/actions`).send({ actionType: "REMOVE_CONTENT", reason: "fake" }).expect(201);
    expect((await db.providerReview.findUniqueOrThrow({ where: { id: review.id } })).status).toBe("HIDDEN");
    await post(ts, `/admin/trust/cases/${e2.trustCaseId}/actions`).send({ actionType: "RESTORE", reason: "verified genuine" }).expect(201);
    expect((await db.providerReview.findUniqueOrThrow({ where: { id: review.id } })).status).toBe("PUBLISHED");
  });
});
