import { Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";

// Test-only operational configuration (never a secret): a company card so the card-to-card rail is open, and the
// default sandbox payment mode, in which the Zibal rail must stay closed.
process.env.CARD_TRANSFER_ACCOUNT_NUMBER = "6037991234567890";
process.env.CARD_TRANSFER_ACCOUNT_HOLDER = "PET LIFE OS";

interface Cookies { session?: string; csrf?: string }

function otp(logSpy: jest.SpyInstance, identifier: string): string {
  const call = logSpy.mock.calls.find((args) => typeof args[0] === "string" && args[0].includes("[DEV OTP]") && args[0].includes(identifier));
  const match = call && /code=(\d+)/.exec(call[0] as string);
  if (!match) throw new Error("Expected DEV OTP log entry");
  return match[1]!;
}

describe("Member wallet: top-ups, corrections and permissions (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication["getHttpServer"]>;
  let logSpy: jest.SpyInstance;
  const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => app.close());
  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });
  afterEach(() => logSpy.mockRestore());

  async function session(identifier: string): Promise<Cookies> {
    const primed = await request(server).get("/health/live");
    const csrf = extractCookie(primed.headers["set-cookie"], "petlife_csrf")!;
    await request(server).post("/auth/request-otp").set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf).send({ identifier }).expect(200);
    const verified = await request(server).post("/auth/verify-otp").set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf).send({ identifier, code: otp(logSpy, identifier) }).expect(200);
    return { session: extractCookie(verified.headers["set-cookie"], "petlife_session"), csrf };
  }
  function client(cookies: Cookies) {
    const cookie = `petlife_session=${cookies.session}; petlife_csrf=${cookies.csrf}`;
    return {
      get: (path: string) => request(server).get(path).set("Cookie", cookie),
      post: (path: string) => request(server).post(path).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
      patch: (path: string) => request(server).patch(path).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
    };
  }
  async function member() {
    const email = `wallet-member-${unique()}@example.com`;
    const c = client(await session(email));
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return { c, user };
  }
  async function staff(role: AdminRole) {
    const email = `wallet-admin-${role.toLowerCase()}-${unique()}@example.com`;
    const c = client(await session(email));
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const membership = await prisma.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } });
    return { c, adminUserId: membership.id };
  }
  async function admin(role: AdminRole) {
    return (await staff(role)).c;
  }

  it("shows an empty wallet with only real rails (no Zibal in sandbox)", async () => {
    const { c } = await member();
    const res = await c.get("/wallet").expect(200);
    expect(res.body.balances).toEqual({ purchaseOnly: 0, withdrawable: 0, total: 0, currency: "IRR" });
    expect(res.body.topUp.rails).toEqual(["CARD_TO_CARD"]);
    await c.post("/wallet/top-ups").set("Idempotency-Key", unique()).send({ amount: 1_000_000, rail: "ZIBAL" }).expect(400);
  });

  it("credits a card-to-card top-up exactly once, for the amount finance confirmed", async () => {
    const { c, user } = await member();
    const key = unique();
    const started = await c.post("/wallet/top-ups").set("Idempotency-Key", key).send({ amount: 2_000_000, rail: "CARD_TO_CARD", locale: "en" }).expect(201);
    expect(started.body.cardTransfer).toEqual({ cardNumber: "6037-9912-3456-7890", cardHolderName: "PET LIFE OS", bankName: null, sheba: null });
    expect(started.body.topUp.status).toBe("AWAITING_RECEIPT");
    // A retried start replays the same request instead of opening a second one.
    const replay = await c.post("/wallet/top-ups").set("Idempotency-Key", key).send({ amount: 2_000_000, rail: "CARD_TO_CARD" }).expect(201);
    expect(replay.body.topUp.id).toBe(started.body.topUp.id);
    const id = started.body.topUp.id as string;

    // Someone else's key, or a key outside this request's folder, is refused.
    const other = await member();
    await other.c.post(`/wallet/top-ups/${id}/receipt`).send({ objectKey: `wallet-top-up-receipts/${id}/x.jpg` }).expect(400);
    await c.post(`/wallet/top-ups/${id}/receipt`).send({ objectKey: `wallet-top-up-receipts/${other.user.id}/x.jpg` }).expect(400);
    const target = await c.post(`/wallet/top-ups/${id}/receipt-upload`).send({ contentType: "image/png", fileSizeBytes: 2048 }).expect(201);
    expect(target.body.key).toMatch(new RegExp(`^wallet-top-up-receipts/${id}/`));
    await c.post(`/wallet/top-ups/${id}/receipt`).send({ objectKey: target.body.key }).expect(201);

    const support = await admin(AdminRole.SUPPORT);
    await support.get("/admin/wallet-top-ups?status=REVIEW_PENDING").expect(200);
    await support.post(`/admin/wallet-top-ups/${id}/review`).send({ approve: true, receivedAmount: 1_900_000 }).expect(403);

    const finance = await admin(AdminRole.FINANCE);
    const queue = await finance.get("/admin/wallet-top-ups?status=REVIEW_PENDING").expect(200);
    expect(queue.body.items.map((r: { id: string }) => r.id)).toContain(id);
    const [first, second] = await Promise.all([
      finance.post(`/admin/wallet-top-ups/${id}/review`).send({ approve: true, receivedAmount: 1_900_000 }),
      finance.post(`/admin/wallet-top-ups/${id}/review`).send({ approve: true, receivedAmount: 1_900_000 }),
    ]);
    expect([first.status, second.status].sort()).toEqual([201, 400]);

    const wallet = await c.get("/wallet").expect(200);
    expect(wallet.body.balances.purchaseOnly).toBe(1_900_000);
    const entries = await prisma.walletEntry.findMany({ where: { referenceType: "WALLET_TOP_UP", referenceId: id } });
    expect(entries).toHaveLength(1);
    const audit = await prisma.adminAuditLog.findMany({ where: { entityType: "WalletTopUp", entityId: id, action: "wallet_top_up.approved" } });
    expect(audit).toHaveLength(1);
    const history = await c.get("/wallet/entries").expect(200);
    expect(history.body.items[0]).toMatchObject({ purpose: "TOP_UP", signedAmount: 1_900_000, balanceType: "PURCHASE_ONLY" });
    void user;
  });

  describe("corrections need a second admin (FE-16)", () => {
    const credit = { direction: "CREDIT", balanceType: "PURCHASE_ONLY", amount: 500_000, reasonCode: "SERVICE_RECOVERY", reason: "Late delivery of order", evidenceReference: "SUP-42" };
    const adjustmentEntries = async (userId: string) => {
      const account = await prisma.walletAccount.findUnique({ where: { userId } });
      return account ? prisma.walletEntry.findMany({ where: { walletAccountId: account.id, referenceType: "WALLET_ADJUSTMENT" } }) : [];
    };

    it("records a request without moving money, and only wallet.adjust may ask or decide", async () => {
      const { c, user } = await member();
      // ADMIN and SUPPORT may see wallets but hold no wallet.adjust.
      const viewer = await admin(AdminRole.ADMIN);
      const support = await admin(AdminRole.SUPPORT);
      await viewer.get(`/admin/wallets/${user.id}`).expect(200);
      await viewer.post(`/admin/wallets/${user.id}/adjustment-requests`).send(credit).expect(403);
      await support.post(`/admin/wallets/${user.id}/adjustment-requests`).send(credit).expect(403);
      // The old one-person route is gone.
      const finance = await staff(AdminRole.FINANCE);
      await finance.c.post(`/admin/wallets/${user.id}/adjustments`).send(credit).expect(404);

      await finance.c.post(`/admin/wallets/${user.id}/adjustment-requests`).send({ ...credit, reason: "no" }).expect(400);
      const key = unique();
      const asked = await finance.c.post(`/admin/wallets/${user.id}/adjustment-requests`).set("Idempotency-Key", key).send(credit).expect(201);
      expect(asked.body).toMatchObject({ status: "PENDING", userId: user.id, amount: 500_000, direction: "CREDIT", reason: "Late delivery of order", evidenceReference: "SUP-42", walletEntryId: null, decidedBy: null });
      expect(asked.body.requestedBy.adminUserId).toBe(finance.adminUserId);
      expect(new Date(asked.body.expiresAt).getTime() - Date.now()).toBeGreaterThan(71 * 3600 * 1000);
      // A retried submission replays the same request instead of opening a second one.
      const again = await finance.c.post(`/admin/wallets/${user.id}/adjustment-requests`).set("Idempotency-Key", key).send(credit).expect(201);
      expect(again.body.id).toBe(asked.body.id);

      // No money moved.
      expect((await c.get("/wallet").expect(200)).body.balances.purchaseOnly).toBe(0);
      expect(await adjustmentEntries(user.id)).toHaveLength(0);
      expect(await prisma.adminAuditLog.count({ where: { entityType: "WalletAdjustmentRequest", entityId: asked.body.id, action: "wallet_adjustment.requested" } })).toBe(1);

      // Admins without wallet.adjust can read the queue but not decide.
      const queue = await viewer.get(`/admin/wallet-adjustment-requests?status=PENDING&userId=${user.id}`).expect(200);
      expect(queue.body.items.map((r: { id: string }) => r.id)).toEqual([asked.body.id]);
      await viewer.patch(`/admin/wallet-adjustment-requests/${asked.body.id}/approve`).send({}).expect(403);
      await support.patch(`/admin/wallet-adjustment-requests/${asked.body.id}/reject`).send({ reason: "Not a finance user" }).expect(403);

      // The requester can't approve their own request, whatever their role.
      const own = await finance.c.patch(`/admin/wallet-adjustment-requests/${asked.body.id}/approve`).send({}).expect(409);
      expect(own.body.error.code).toBe("WALLET_ADJUSTMENT_SELF_APPROVAL");
      const root = await staff(AdminRole.SUPER_ADMIN);
      const rootAsk = await root.c.post(`/admin/wallets/${user.id}/adjustment-requests`).send({ ...credit, evidenceReference: undefined }).expect(201);
      expect((await root.c.patch(`/admin/wallet-adjustment-requests/${rootAsk.body.id}/approve`).send({}).expect(409)).body.error.code).toBe("WALLET_ADJUSTMENT_SELF_APPROVAL");
      expect(await adjustmentEntries(user.id)).toHaveLength(0);
    });

    it("posts exactly once when two admins approve at the same moment", async () => {
      const { c, user } = await member();
      const requester = await staff(AdminRole.FINANCE);
      const second = await staff(AdminRole.FINANCE);
      const root = await staff(AdminRole.SUPER_ADMIN);
      const asked = await requester.c.post(`/admin/wallets/${user.id}/adjustment-requests`).send(credit).expect(201);
      const id = asked.body.id as string;

      const results = await Promise.all([
        second.c.patch(`/admin/wallet-adjustment-requests/${id}/approve`).send({}),
        root.c.patch(`/admin/wallet-adjustment-requests/${id}/approve`).send({}),
        second.c.patch(`/admin/wallet-adjustment-requests/${id}/approve`).send({}),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
      const losers = results.filter((r) => r.status === 409);
      expect(losers.every((r) => r.body.error.code === "INVALID_WALLET_ADJUSTMENT_REQUEST_TRANSITION")).toBe(true);

      const entries = await adjustmentEntries(user.id);
      expect(entries).toHaveLength(1);
      const approved = await prisma.walletAdjustmentRequest.findUniqueOrThrow({ where: { id } });
      expect(approved).toMatchObject({ status: "APPROVED", walletEntryId: entries[0]!.id });
      expect(approved.decidedByAdminId).not.toBe(requester.adminUserId);
      const adjustment = await prisma.walletAdjustment.findUniqueOrThrow({ where: { id: approved.walletAdjustmentId! } });
      expect(adjustment).toMatchObject({ amount: 500_000, direction: "CREDIT", walletEntryId: entries[0]!.id, createdByAdminId: requester.adminUserId });
      // The ledger moved with it, balanced.
      const ledger = await prisma.ledgerEntry.findMany({ where: { ledgerTransactionId: entries[0]!.ledgerTransactionId! } });
      expect(ledger.reduce((sum, e) => sum + (e.direction === "DEBIT" ? e.amount : -e.amount), 0)).toBe(0);
      expect(await prisma.adminAuditLog.count({ where: { entityType: "WalletAdjustmentRequest", entityId: id, action: "wallet_adjustment.approved" } })).toBe(1);
      expect((await c.get("/wallet").expect(200)).body.balances.purchaseOnly).toBe(500_000);
      const history = await c.get("/wallet/entries").expect(200);
      expect(history.body.items.map((e: { purpose: string; note: string | null }) => [e.purpose, e.note])).toEqual([["ADJUSTMENT", "SERVICE_RECOVERY"]]);

      const detail = await second.c.get(`/admin/wallets/${user.id}`).expect(200);
      expect(detail.body.adjustments).toHaveLength(1);
      expect(detail.body.adjustments[0].createdBy.adminUserId).toBe(requester.adminUserId);
      expect(detail.body.adjustments[0].approvedBy.adminUserId).toBe(approved.decidedByAdminId);
      expect(detail.body.adjustmentRequests.map((r: { id: string; status: string }) => [r.id, r.status])).toEqual([[id, "APPROVED"]]);
      expect(detail.body.audit.map((a: { action: string }) => a.action).sort()).toEqual(["wallet_adjustment.approved", "wallet_adjustment.requested"]);
    });

    it("re-checks a debit against the balance at approval, and a rejection posts nothing", async () => {
      const { c, user } = await member();
      const requester = await staff(AdminRole.FINANCE);
      const approver = await staff(AdminRole.FINANCE);
      const seed = await requester.c.post(`/admin/wallets/${user.id}/adjustment-requests`).send(credit).expect(201);
      await approver.c.patch(`/admin/wallet-adjustment-requests/${seed.body.id}/approve`).send({}).expect(200);

      const debit = { direction: "DEBIT", balanceType: "PURCHASE_ONLY", reasonCode: "PAYMENT_CORRECTION", reason: "Part of the goodwill was a mistake" };
      // More than the bucket holds is refused already at request time.
      const tooMuch = await requester.c.post(`/admin/wallets/${user.id}/adjustment-requests`).send({ ...debit, amount: 600_000 }).expect(400);
      expect(tooMuch.body.error.details.reason).toBe("INSUFFICIENT_WALLET_BALANCE");
      // Two debits that each fit today, but not together.
      const first = await requester.c.post(`/admin/wallets/${user.id}/adjustment-requests`).send({ ...debit, amount: 400_000 }).expect(201);
      const second = await requester.c.post(`/admin/wallets/${user.id}/adjustment-requests`).send({ ...debit, amount: 300_000 }).expect(201);
      await approver.c.patch(`/admin/wallet-adjustment-requests/${first.body.id}/approve`).send({}).expect(200);
      const refused = await approver.c.patch(`/admin/wallet-adjustment-requests/${second.body.id}/approve`).send({}).expect(400);
      expect(refused.body.error.details.reason).toBe("INSUFFICIENT_WALLET_BALANCE");
      expect((await prisma.walletAdjustmentRequest.findUniqueOrThrow({ where: { id: second.body.id } })).status).toBe("PENDING");
      expect(await adjustmentEntries(user.id)).toHaveLength(2);
      expect((await c.get("/wallet").expect(200)).body.balances.purchaseOnly).toBe(100_000);

      // Rejecting needs a reason and moves nothing.
      await approver.c.patch(`/admin/wallet-adjustment-requests/${second.body.id}/reject`).send({ reason: "no" }).expect(400);
      await approver.c.patch(`/admin/wallet-adjustment-requests/${second.body.id}/reject`).send({}).expect(400);
      const rejected = await approver.c.patch(`/admin/wallet-adjustment-requests/${second.body.id}/reject`).send({ reason: "Already corrected by the first debit" }).expect(200);
      expect(rejected.body).toMatchObject({ status: "REJECTED", decisionReason: "Already corrected by the first debit", walletEntryId: null, walletAdjustmentId: null });
      expect(rejected.body.decidedBy.adminUserId).toBe(approver.adminUserId);
      expect(await adjustmentEntries(user.id)).toHaveLength(2);
      expect((await c.get("/wallet").expect(200)).body.balances.purchaseOnly).toBe(100_000);
      expect(await prisma.adminAuditLog.count({ where: { entityType: "WalletAdjustmentRequest", entityId: second.body.id, action: "wallet_adjustment.rejected" } })).toBe(1);
      // A decided request can't be decided again.
      const late = await approver.c.patch(`/admin/wallet-adjustment-requests/${second.body.id}/approve`).send({}).expect(409);
      expect(late.body.error.code).toBe("INVALID_WALLET_ADJUSTMENT_REQUEST_TRANSITION");
    });

    it("never approves a request past its window, and marks it expired", async () => {
      const { c, user } = await member();
      const requester = await staff(AdminRole.FINANCE);
      const approver = await staff(AdminRole.FINANCE);
      const asked = await requester.c.post(`/admin/wallets/${user.id}/adjustment-requests`).send(credit).expect(201);
      await prisma.walletAdjustmentRequest.update({ where: { id: asked.body.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });

      const lapsed = await approver.c.patch(`/admin/wallet-adjustment-requests/${asked.body.id}/approve`).send({}).expect(409);
      expect(lapsed.body.error.code).toBe("WALLET_ADJUSTMENT_REQUEST_EXPIRED");
      expect((await prisma.walletAdjustmentRequest.findUniqueOrThrow({ where: { id: asked.body.id } })).status).toBe("EXPIRED");
      expect(await adjustmentEntries(user.id)).toHaveLength(0);
      expect((await c.get("/wallet").expect(200)).body.balances.purchaseOnly).toBe(0);
      const queue = await approver.c.get(`/admin/wallet-adjustment-requests?status=PENDING&userId=${user.id}`).expect(200);
      expect(queue.body.items).toEqual([]);
    });

    it("caps the open requests one member may have", async () => {
      const { user } = await member();
      const requester = await staff(AdminRole.FINANCE);
      const expiresAt = new Date(Date.now() + 3600_000);
      await prisma.walletAdjustmentRequest.createMany({
        data: Array.from({ length: 20 }, () => ({ userId: user.id, direction: "CREDIT" as const, balanceType: "PURCHASE_ONLY" as const, amountIrr: 10_000, reasonCode: "GOODWILL", note: "Seeded open request", requestedByAdminId: requester.adminUserId, expiresAt })),
      });
      const capped = await requester.c.post(`/admin/wallets/${user.id}/adjustment-requests`).send(credit).expect(400);
      expect(capped.body.error.details).toMatchObject({ reason: "TOO_MANY_PENDING", max: 20 });
      // Lapsed requests don't count against the cap.
      const oldest = await prisma.walletAdjustmentRequest.findFirstOrThrow({ where: { userId: user.id } });
      await prisma.walletAdjustmentRequest.update({ where: { id: oldest.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await requester.c.post(`/admin/wallets/${user.id}/adjustment-requests`).send(credit).expect(201);
    });

    it("counts requests waiting for a second admin on the dashboard", async () => {
      const { user } = await member();
      const requester = await staff(AdminRole.FINANCE);
      const approver = await staff(AdminRole.FINANCE);
      const readOnly = await admin(AdminRole.READ_ONLY);
      const editor = await admin(AdminRole.EDITOR);
      const count = async () => (await approver.c.get("/admin/dashboard").expect(200)).body.pendingWalletAdjustments as number;

      const before = await count();
      expect(typeof before).toBe("number");
      const asked = await requester.c.post(`/admin/wallets/${user.id}/adjustment-requests`).send(credit).expect(201);
      expect(await count()).toBe(before + 1);
      // Anyone who may open Wallets sees the queue; an admin without wallet.view gets null, not zero.
      expect((await readOnly.get("/admin/dashboard").expect(200)).body.pendingWalletAdjustments).toBe(before + 1);
      expect((await editor.get("/admin/dashboard").expect(200)).body.pendingWalletAdjustments).toBeNull();
      await approver.c.patch(`/admin/wallet-adjustment-requests/${asked.body.id}/approve`).send({}).expect(200);
      expect(await count()).toBe(before);
    });
  });

  it("never lets a member read or touch another member's top-up", async () => {
    const owner = await member();
    const started = await owner.c.post("/wallet/top-ups").set("Idempotency-Key", unique()).send({ amount: 1_000_000, rail: "CARD_TO_CARD" }).expect(201);
    const stranger = await member();
    await stranger.c.get(`/wallet/top-ups/${started.body.topUp.id}`).expect(400);
    await stranger.c.post(`/wallet/top-ups/${started.body.topUp.id}/cancel`).expect(400);
    await owner.c.post(`/wallet/top-ups/${started.body.topUp.id}/cancel`).expect(201);
    const list = await owner.c.get("/wallet/top-ups").expect(200);
    expect(list.body[0].status).toBe("CANCELLED");
  });
});
