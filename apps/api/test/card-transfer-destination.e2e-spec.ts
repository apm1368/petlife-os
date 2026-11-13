import { Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";

// Test-only operational configuration (never a secret): the server env account used before the owner sets one.
process.env.CARD_TRANSFER_ACCOUNT_NUMBER = "6037991234567890";
process.env.CARD_TRANSFER_ACCOUNT_HOLDER = "PET LIFE OS";

interface Cookies { session?: string; csrf?: string }
type Client = ReturnType<typeof clientFor>;
interface Actor { c: Client; user: { id: string }; adminUserId: string }

function otp(logSpy: jest.SpyInstance, identifier: string): string {
  const call = logSpy.mock.calls.find((args) => typeof args[0] === "string" && args[0].includes("[DEV OTP]") && args[0].includes(identifier));
  const match = call && /code=(\d+)/.exec(call[0] as string);
  if (!match) throw new Error("Expected DEV OTP log entry");
  return match[1]!;
}

function clientFor(server: ReturnType<INestApplication["getHttpServer"]>, cookies: Cookies) {
  const cookie = `petlife_session=${cookies.session}; petlife_csrf=${cookies.csrf}`;
  return {
    get: (path: string) => request(server).get(path).set("Cookie", cookie),
    post: (path: string) => request(server).post(path).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
    put: (path: string) => request(server).put(path).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
  };
}

const BASE = "/admin/finance/card-transfer-destination";
const approvePath = (id: string) => `${BASE}/pending/${id}/approve`;
const rejectPath = (id: string) => `${BASE}/pending/${id}/reject`;

/**
 * The owner's card-to-card account in admin: who may change it, how it is audited and announced, and what members
 * see. BO-14: a change is only a proposal until a second super admin approves it.
 */
describe("Card-to-card destination (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication["getHttpServer"]>;
  let logSpy: jest.SpyInstance;
  const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // Three super admins (requester, approver, a racing approver), an ADMIN holding settings.manage, and finance.
  let owner: Actor;
  let otherOwner: Actor;
  let thirdOwner: Actor;
  let plainAdmin: Actor;
  let finance: Actor;

  async function session(identifier: string): Promise<Cookies> {
    const primed = await request(server).get("/health/live");
    const csrf = extractCookie(primed.headers["set-cookie"], "petlife_csrf")!;
    await request(server).post("/auth/request-otp").set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf).send({ identifier }).expect(200);
    const verified = await request(server).post("/auth/verify-otp").set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf).send({ identifier, code: otp(logSpy, identifier) }).expect(200);
    return { session: extractCookie(verified.headers["set-cookie"], "petlife_session"), csrf };
  }
  async function admin(role: AdminRole): Promise<Actor> {
    const email = `card-dest-${role.toLowerCase()}-${unique()}@example.com`;
    const c = clientFor(server, await session(email));
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const membership = await prisma.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } });
    return { c, user, adminUserId: membership.id };
  }
  async function member() {
    const email = `card-dest-member-${unique()}@example.com`;
    return clientFor(server, await session(email));
  }
  const topUp = (m: Client) => m.post("/wallet/top-ups").set("Idempotency-Key", unique()).send({ amount: 1_000_000, rail: "CARD_TO_CARD", locale: "fa" }).expect(201);
  const notices = (user: { id: string }, type: string) => prisma.notification.count({ where: { userId: user.id, type } });
  const dashboardCount = async (a: Actor) => (await a.c.get("/admin/dashboard").expect(200)).body.pendingCardDestinationChanges as number | null;
  /** Proposes `card` as `by` and returns the pending proposal's id. */
  async function propose(by: Actor, card: Record<string, string>) {
    const res = await by.c.put(BASE).send(card).expect(200);
    expect(res.body.pending).toBeTruthy();
    return res.body.pending.id as string;
  }

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    await prisma.cardTransferDestination.deleteMany({});
    logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    owner = await admin(AdminRole.SUPER_ADMIN);
    otherOwner = await admin(AdminRole.SUPER_ADMIN);
    thirdOwner = await admin(AdminRole.SUPER_ADMIN);
    plainAdmin = await admin(AdminRole.ADMIN);
    finance = await admin(AdminRole.FINANCE);
    logSpy.mockRestore();
  }, 60_000);
  // Other suites rely on the env fallback, which only applies while no destination has ever been active.
  afterAll(async () => {
    await prisma.cardTransferDestination.deleteMany({});
    await app.close();
  });
  beforeEach(async () => {
    logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    await prisma.cardTransferDestination.deleteMany({});
  });
  afterEach(() => logSpy.mockRestore());

  const NEW_CARD = { cardNumber: "6219-8600-0000-1231", sheba: "IR050170000000123456789012", holderName: "شرکت پت لایف", bankName: "سامان", reason: "Owner moved payments to the company account" };
  const CARD_A = { cardNumber: "6037700000003334", holderName: "شرکت پت لایف", reason: "First company account for card-to-card" };
  const CARD_B = { cardNumber: "6104330000004443", holderName: "شرکت پت لایف", reason: "Moving to the new company bank account" };
  const CARD_C = { cardNumber: "5892100000005551", holderName: "Someone Else", reason: "A different account somebody proposed" };

  it("a change waits for a second super admin while members keep the old account; the requester can't approve; concurrent approvals activate it once", async () => {
    const m = await member();
    const before = await topUp(m);
    expect(before.body.cardTransfer).toMatchObject({ cardNumber: "6037-9912-3456-7890", cardHolderName: "PET LIFE OS" });

    const view = await finance.c.get(BASE).expect(200);
    expect(view.body).toMatchObject({ source: "ENV", canEdit: false, pending: null, approvalWindowHours: 48, current: { cardNumberMasked: "**** **** **** 7890" } });
    // Finance cannot propose, nor can an ADMIN holding settings.manage: only SUPER_ADMIN.
    expect((await finance.c.put(BASE).send(NEW_CARD)).status).toBe(403);
    // The ADMIN role really holds settings.manage; the owner-level role is still required.
    expect((await plainAdmin.c.get("/admin/me").expect(200)).body.permissions).toContain("settings.manage");
    expect((await plainAdmin.c.put(BASE).send(NEW_CARD)).status).toBe(403);
    expect((await plainAdmin.c.post(`${BASE}/deactivate`).send({ reason: "Trying to switch it off" })).status).toBe(403);

    await owner.c.put(BASE).send({ ...NEW_CARD, cardNumber: "6219860000001232" }).expect(400);
    await owner.c.put(BASE).send({ ...NEW_CARD, reason: "short" }).expect(400);
    const requested = await owner.c.put(BASE).send(NEW_CARD).expect(200);
    // Proposed, not active: the overview still shows the env account as current.
    expect(requested.body).toMatchObject({
      source: "ENV",
      canEdit: true,
      current: { cardNumberMasked: "**** **** **** 7890" },
      pending: { cardNumberMasked: "**** **** **** 1231", shebaMasked: "IR** **** **** **** **** 9012", holderName: "شرکت پت لایف", reason: NEW_CARD.reason, requestedByMe: true, canApprove: false, canReject: true },
    });
    const pendingId = requested.body.pending.id as string;
    const expiresIn = new Date(requested.body.pending.expiresAt).getTime() - Date.now();
    expect(expiresIn).toBeGreaterThan(47 * 3_600_000);
    expect(expiresIn).toBeLessThanOrEqual(48 * 3_600_000);
    // The admin API never echoes the full numbers back.
    expect(JSON.stringify(requested.body)).not.toContain("6219860000001231");
    expect(JSON.stringify(requested.body)).not.toContain("IR050170000000123456789012");
    const row = await prisma.cardTransferDestination.findUniqueOrThrow({ where: { id: pendingId } });
    expect(row).toMatchObject({ status: "PENDING", active: false, approvedByAdminId: null, createdByAdminId: owner.adminUserId });

    const requestedAudit = await prisma.adminAuditLog.findFirstOrThrow({ where: { action: "card_transfer_destination.change_requested", entityId: pendingId } });
    expect(requestedAudit.reason).toBe(NEW_CARD.reason);
    expect(JSON.stringify(requestedAudit.afterSummary)).toContain("**** **** **** 1231");
    expect(JSON.stringify([requestedAudit.beforeSummary, requestedAudit.afterSummary])).not.toContain("6219860000001231");
    // Every super admin is told it waits for approval, the requester included.
    for (const a of [owner, otherOwner, thirdOwner]) expect(await notices(a.user, "admin.card_destination_change_requested")).toBe(1);

    // Members still see and use the old account while it waits.
    const during = await topUp(m);
    expect(during.body.cardTransfer).toMatchObject({ cardNumber: "6037-9912-3456-7890", cardHolderName: "PET LIFE OS" });
    expect((await m.get("/wallet").expect(200)).body.topUp.rails).toContain("CARD_TO_CARD");
    expect(JSON.stringify((await m.get("/wallet").expect(200)).body)).not.toMatch(/6219[-\s]?8600[-\s]?0000[-\s]?1231/);
    expect(JSON.stringify((await request(server).get("/settings/public")).body)).not.toMatch(/6219[-\s]?8600[-\s]?0000[-\s]?1231/);

    // Finance sees the proposal masked but cannot decide it; neither can an ADMIN with settings.manage.
    expect((await finance.c.get(BASE).expect(200)).body.pending).toMatchObject({ id: pendingId, cardNumberMasked: "**** **** **** 1231", canApprove: false, canReject: false });
    expect((await finance.c.post(approvePath(pendingId)).send({})).status).toBe(403);
    expect((await plainAdmin.c.post(approvePath(pendingId)).send({})).status).toBe(403);
    expect((await plainAdmin.c.post(rejectPath(pendingId)).send({ reason: "Trying to reject it anyway" })).status).toBe(403);

    // One proposal at a time: another one is refused until this one is decided.
    const second = await otherOwner.c.put(BASE).send(CARD_C).expect(409);
    expect(second.body.error.code).toBe("CARD_DESTINATION_CHANGE_ALREADY_PENDING");
    expect(await prisma.cardTransferDestination.count({ where: { status: "PENDING" } })).toBe(1);

    // The dashboard counts it for the super admins who may approve it, and for nobody else.
    expect(await dashboardCount(owner)).toBe(1);
    expect(await dashboardCount(otherOwner)).toBe(1);
    expect(await dashboardCount(plainAdmin)).toBeNull();
    expect(await dashboardCount(finance)).toBeNull();

    // Two-person control: the requester cannot approve their own change (409, as for refund approvals).
    const self = await owner.c.post(approvePath(pendingId)).send({}).expect(409);
    expect(self.body.error.code).toBe("CARD_DESTINATION_SELF_APPROVAL");
    expect((await prisma.cardTransferDestination.findUniqueOrThrow({ where: { id: pendingId } })).status).toBe("PENDING");
    expect((await topUp(await member())).body.cardTransfer).toMatchObject({ cardNumber: "6037-9912-3456-7890" });

    // Another super admin sees Approve; two of them (one twice) approve at the same moment: it activates once.
    expect((await otherOwner.c.get(BASE).expect(200)).body.pending).toMatchObject({ id: pendingId, requestedByMe: false, canApprove: true, canReject: true });
    const results = await Promise.all([
      otherOwner.c.post(approvePath(pendingId)).send({}),
      thirdOwner.c.post(approvePath(pendingId)).send({}),
      otherOwner.c.post(approvePath(pendingId)).send({}),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    for (const r of results.filter((x) => x.status === 409)) expect(r.body.error.code).toBe("CARD_DESTINATION_CHANGE_NOT_PENDING");
    const approved = results.find((r) => r.status === 200)!;
    expect(approved.body).toMatchObject({ source: "ADMIN", pending: null, current: { cardNumberMasked: "**** **** **** 1231", holderName: "شرکت پت لایف" } });
    const active = await prisma.cardTransferDestination.findMany({ where: { active: true } });
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ id: pendingId, status: "ACTIVE", createdByAdminId: owner.adminUserId });
    expect([otherOwner.adminUserId, thirdOwner.adminUserId]).toContain(active[0]!.approvedByAdminId);
    expect(await prisma.adminAuditLog.count({ where: { action: "card_transfer_destination.approved", entityId: pendingId } })).toBe(1);
    const approvedAudit = await prisma.adminAuditLog.findFirstOrThrow({ where: { action: "card_transfer_destination.approved", entityId: pendingId } });
    expect(approvedAudit.adminUserId).toBe(active[0]!.approvedByAdminId);
    expect(JSON.stringify(approvedAudit.afterSummary)).toContain("**** **** **** 1231");
    expect(JSON.stringify([approvedAudit.beforeSummary, approvedAudit.afterSummary])).not.toContain("6219860000001231");
    for (const a of [owner, otherOwner, thirdOwner]) expect(await notices(a.user, "admin.card_destination_approved")).toBe(1);
    expect(await dashboardCount(owner)).toBe(0);

    // New payments use the new account; the requests started earlier keep the account they were started with.
    const after = await topUp(m);
    expect(after.body.cardTransfer).toEqual({ cardNumber: "6219-8600-0000-1231", cardHolderName: "شرکت پت لایف", bankName: "سامان", sheba: "IR050170000000123456789012" });
    expect((await m.get(`/wallet/top-ups/${before.body.topUp.id}`).expect(200)).body.cardTransfer).toMatchObject({ cardNumber: "6037-9912-3456-7890" });
    expect((await m.get(`/wallet/top-ups/${during.body.topUp.id}`).expect(200)).body.cardTransfer).toMatchObject({ cardNumber: "6037-9912-3456-7890" });
    // Outside an active card-to-card payment nothing carries it: public settings, the member's own wallet and
    // profile, and another member's view of that payment.
    const digits = /6219[-\s]?8600[-\s]?0000[-\s]?1231|IR050170000000123456789012/;
    for (const res of [await request(server).get("/settings/public"), await request(server).get("/settings/public?locale=en")]) expect(JSON.stringify(res.body)).not.toMatch(digits);
    const bystander = await member();
    for (const path of ["/wallet", "/wallet/entries", "/me", "/auth/session"]) {
      const res = await bystander.get(path);
      expect(res.status).toBeLessThan(500);
      expect(JSON.stringify(res.body)).not.toMatch(digits);
    }
    // Someone else's top-up is refused (whichever refusal the route uses) and never carries the account.
    const peek = await bystander.get(`/wallet/top-ups/${after.body.topUp.id}`);
    expect([400, 403, 404]).toContain(peek.status);
    expect(JSON.stringify(peek.body)).not.toMatch(digits);
    expect(JSON.stringify((await m.get("/wallet").expect(200)).body)).not.toMatch(digits);

    // Switching it off stays immediate (one super admin, no approval), closes card-to-card (no silent fall back to
    // the env account) and is announced too.
    await owner.c.post(`${BASE}/deactivate`).send({ reason: "Bank account is being replaced" }).expect(201);
    expect((await m.get("/wallet").expect(200)).body.topUp.rails).not.toContain("CARD_TO_CARD");
    expect(await notices(otherOwner.user, "admin.card_destination_disabled")).toBe(1);
    const history = (await finance.c.get(BASE).expect(200)).body;
    expect(history).toMatchObject({ source: "NONE", current: null, pending: null });
    expect(history.history[0]).toMatchObject({ id: pendingId, active: false, status: "CLOSED", closeReason: "Bank account is being replaced" });
    expect(await prisma.cardTransferDestination.count({ where: { active: true } })).toBe(0);
  }, 60_000);

  it("approving a change closes the previous account in the same step; rejecting or withdrawing one changes nothing", async () => {
    const firstId = await propose(owner, CARD_A);
    await otherOwner.c.post(approvePath(firstId)).send({}).expect(200);
    const m = await member();
    const onA = await topUp(m);
    expect(onA.body.cardTransfer).toMatchObject({ cardNumber: "6037-7000-0000-3334" });

    // Rejected by another super admin: a reason is required, nothing changes for members, everyone hears.
    const rejectedId = await propose(otherOwner, CARD_C);
    await owner.c.post(rejectPath(rejectedId)).send({ reason: "short" }).expect(400);
    const rejected = await owner.c.post(rejectPath(rejectedId)).send({ reason: "Not an account we recognise" }).expect(200);
    expect(rejected.body).toMatchObject({ source: "ADMIN", pending: null, current: { cardNumberMasked: "**** **** **** 3334" } });
    expect(await prisma.cardTransferDestination.findUniqueOrThrow({ where: { id: rejectedId } })).toMatchObject({ status: "REJECTED", active: false, closedByAdminId: owner.adminUserId, closeReason: "Not an account we recognise" });
    expect(await prisma.cardTransferDestination.findUniqueOrThrow({ where: { id: firstId } })).toMatchObject({ status: "ACTIVE", active: true, closedAt: null });
    const rejectedAudit = await prisma.adminAuditLog.findFirstOrThrow({ where: { action: "card_transfer_destination.rejected", entityId: rejectedId } });
    expect(rejectedAudit).toMatchObject({ adminUserId: owner.adminUserId, reason: "Not an account we recognise" });
    expect(rejectedAudit.afterSummary).toMatchObject({ withdrawnByRequester: false });
    for (const a of [owner, otherOwner]) expect(await notices(a.user, "admin.card_destination_change_rejected")).toBeGreaterThanOrEqual(1);
    expect((await topUp(m)).body.cardTransfer).toMatchObject({ cardNumber: "6037-7000-0000-3334" });
    // A decided proposal cannot be decided again.
    expect((await otherOwner.c.post(rejectPath(rejectedId)).send({ reason: "Rejecting it a second time" }).expect(409)).body.error.code).toBe("CARD_DESTINATION_CHANGE_NOT_PENDING");
    expect((await thirdOwner.c.post(approvePath(rejectedId)).send({})).status).toBe(409);
    expect((await thirdOwner.c.post(approvePath("00000000-0000-4000-8000-000000000000")).send({})).status).toBe(404);

    // Withdrawn by its own requester.
    const withdrawnId = await propose(otherOwner, CARD_B);
    await otherOwner.c.post(rejectPath(withdrawnId)).send({ reason: "Typed the wrong card number" }).expect(200);
    expect((await prisma.cardTransferDestination.findUniqueOrThrow({ where: { id: withdrawnId } })).status).toBe("REJECTED");
    expect((await prisma.adminAuditLog.findFirstOrThrow({ where: { action: "card_transfer_destination.rejected", entityId: withdrawnId } })).afterSummary).toMatchObject({ withdrawnByRequester: true });
    expect(await prisma.cardTransferDestination.count({ where: { active: true } })).toBe(1);

    // Approved: the previous admin account is closed and the new one active, together.
    const nextId = await propose(otherOwner, CARD_B);
    const switched = await thirdOwner.c.post(approvePath(nextId)).send({}).expect(200);
    expect(switched.body).toMatchObject({ source: "ADMIN", pending: null, current: { cardNumberMasked: "**** **** **** 4443" } });
    const previous = await prisma.cardTransferDestination.findUniqueOrThrow({ where: { id: firstId } });
    expect(previous).toMatchObject({ status: "CLOSED", active: false, closedByAdminId: thirdOwner.adminUserId, closeReason: CARD_B.reason });
    expect(previous.closedAt).toBeTruthy();
    expect(await prisma.cardTransferDestination.findUniqueOrThrow({ where: { id: nextId } })).toMatchObject({ status: "ACTIVE", active: true, approvedByAdminId: thirdOwner.adminUserId, createdByAdminId: otherOwner.adminUserId });
    expect(await prisma.cardTransferDestination.count({ where: { active: true } })).toBe(1);
    const history = (switched.body.history as { id: string; status: string; approvedBy: string | null }[]).map((h) => [h.id, h.status]);
    expect(history).toEqual(expect.arrayContaining([[nextId, "ACTIVE"], [firstId, "CLOSED"], [rejectedId, "REJECTED"], [withdrawnId, "REJECTED"]]));
    // New payments go to the new account; the one started on the previous account keeps it.
    expect((await topUp(await member())).body.cardTransfer).toMatchObject({ cardNumber: "6104-3300-0000-4443" });
    expect((await m.get(`/wallet/top-ups/${onA.body.topUp.id}`).expect(200)).body.cardTransfer).toMatchObject({ cardNumber: "6037-7000-0000-3334" });
  }, 60_000);

  it("an expired change can't be approved, stops counting and no longer blocks a new one", async () => {
    const id = await propose(owner, NEW_CARD);
    expect(await dashboardCount(otherOwner)).toBe(1);
    // Its 48 hours have passed.
    await prisma.cardTransferDestination.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    expect(await dashboardCount(otherOwner)).toBe(0);
    const view = (await otherOwner.c.get(BASE).expect(200)).body;
    expect(view).toMatchObject({ source: "ENV", pending: null });
    expect(view.history[0]).toMatchObject({ id, status: "EXPIRED", active: false });

    const late = await otherOwner.c.post(approvePath(id)).send({}).expect(409);
    expect(late.body.error.code).toBe("CARD_DESTINATION_CHANGE_EXPIRED");
    expect(await prisma.cardTransferDestination.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "EXPIRED", active: false, approvedByAdminId: null });
    expect(await prisma.adminAuditLog.count({ where: { action: "card_transfer_destination.approved", entityId: id } })).toBe(0);
    expect((await otherOwner.c.post(rejectPath(id)).send({ reason: "Rejecting an expired change" }).expect(409)).body.error.code).toBe("CARD_DESTINATION_CHANGE_EXPIRED");
    // Members never saw it, and the env fallback still applies because no admin account was ever active.
    expect((await topUp(await member())).body.cardTransfer).toMatchObject({ cardNumber: "6037-9912-3456-7890" });
    // A new proposal is accepted again.
    const again = await owner.c.put(BASE).send(NEW_CARD).expect(200);
    expect(again.body.pending.id).not.toBe(id);
  }, 60_000);

  it("switching the account off stays immediate and leaves a waiting proposal to its own decision", async () => {
    const liveId = await propose(owner, CARD_A);
    await otherOwner.c.post(approvePath(liveId)).send({}).expect(200);
    const waitingId = await propose(owner, CARD_B);
    // One super admin, no approval step: card-to-card is off at once.
    const off = await owner.c.post(`${BASE}/deactivate`).send({ reason: "Suspicious activity on the account" }).expect(201);
    expect(off.body).toMatchObject({ source: "NONE", current: null, pending: { id: waitingId } });
    expect(await prisma.cardTransferDestination.findUniqueOrThrow({ where: { id: liveId } })).toMatchObject({ status: "CLOSED", active: false, closeReason: "Suspicious activity on the account" });
    expect((await (await member()).get("/wallet").expect(200)).body.topUp.rails).not.toContain("CARD_TO_CARD");
    for (const a of [owner, otherOwner, thirdOwner]) expect(await notices(a.user, "admin.card_destination_disabled")).toBeGreaterThanOrEqual(1);
    await owner.c.post(`${BASE}/deactivate`).send({ reason: "Switching it off a second time" }).expect(400);
    // The waiting proposal still needs its second super admin.
    expect((await owner.c.post(approvePath(waitingId)).send({})).status).toBe(409);
    await thirdOwner.c.post(approvePath(waitingId)).send({}).expect(200);
    expect((await topUp(await member())).body.cardTransfer).toMatchObject({ cardNumber: "6104-3300-0000-4443" });
  }, 60_000);
});
