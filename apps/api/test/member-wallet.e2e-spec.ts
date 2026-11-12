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
    };
  }
  async function member() {
    const email = `wallet-member-${unique()}@example.com`;
    const c = client(await session(email));
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return { c, user };
  }
  async function admin(role: AdminRole) {
    const email = `wallet-admin-${role.toLowerCase()}-${unique()}@example.com`;
    const c = client(await session(email));
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } });
    return c;
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
    expect(started.body.cardTransfer).toEqual({ cardNumber: "6037-9912-3456-7890", cardHolderName: "PET LIFE OS" });
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

  it("corrects a balance only with wallet.adjust, a reason and enough money, and audits it", async () => {
    const { c, user } = await member();
    const viewer = await admin(AdminRole.ADMIN);
    await viewer.get(`/admin/wallets/${user.id}`).expect(200);
    await viewer.post(`/admin/wallets/${user.id}/adjustments`).send({ direction: "CREDIT", balanceType: "PURCHASE_ONLY", amount: 500_000, reasonCode: "GOODWILL", reason: "Late delivery" }).expect(403);

    const finance = await admin(AdminRole.FINANCE);
    await finance.post(`/admin/wallets/${user.id}/adjustments`).send({ direction: "CREDIT", balanceType: "PURCHASE_ONLY", amount: 500_000, reasonCode: "GOODWILL", reason: "no" }).expect(400);
    const key = unique();
    const credit = await finance.post(`/admin/wallets/${user.id}/adjustments`).set("Idempotency-Key", key).send({ direction: "CREDIT", balanceType: "PURCHASE_ONLY", amount: 500_000, reasonCode: "SERVICE_RECOVERY", reason: "Late delivery of order", evidenceReference: "SUP-42" }).expect(201);
    const again = await finance.post(`/admin/wallets/${user.id}/adjustments`).set("Idempotency-Key", key).send({ direction: "CREDIT", balanceType: "PURCHASE_ONLY", amount: 500_000, reasonCode: "SERVICE_RECOVERY", reason: "Late delivery of order" }).expect(201);
    expect(again.body.id).toBe(credit.body.id);

    await finance.post(`/admin/wallets/${user.id}/adjustments`).send({ direction: "DEBIT", balanceType: "PURCHASE_ONLY", amount: 600_000, reasonCode: "PAYMENT_CORRECTION", reason: "Too much taken" }).expect(400);
    await finance.post(`/admin/wallets/${user.id}/adjustments`).send({ direction: "DEBIT", balanceType: "PURCHASE_ONLY", amount: 200_000, reasonCode: "PAYMENT_CORRECTION", reason: "Part of the goodwill was a mistake" }).expect(201);

    const mine = await c.get("/wallet").expect(200);
    expect(mine.body.balances.purchaseOnly).toBe(300_000);
    const detail = await finance.get(`/admin/wallets/${user.id}`).expect(200);
    expect(detail.body.adjustments).toHaveLength(2);
    expect(detail.body.audit.map((a: { action: string }) => a.action).sort()).toEqual(["wallet.credited", "wallet.debited"]);
    expect(detail.body.user.email).not.toContain(user.email!.split("@")[0]);
    const history = await c.get("/wallet/entries").expect(200);
    expect(history.body.items.map((e: { purpose: string; note: string | null }) => [e.purpose, e.note])).toEqual([
      ["ADJUSTMENT", "PAYMENT_CORRECTION"],
      ["ADJUSTMENT", "SERVICE_RECOVERY"],
    ]);
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
