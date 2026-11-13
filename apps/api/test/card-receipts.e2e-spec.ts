import { Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { AdminMembershipStatus, AdminRole, CardTransferPaymentStatus } from "@prisma/client";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";

// Test-only operational configuration (never a secret): the env company card, so card-to-card is open.
process.env.CARD_TRANSFER_ACCOUNT_NUMBER = "6037991234567890";
process.env.CARD_TRANSFER_ACCOUNT_HOLDER = "PET LIFE OS";

interface Cookies { session?: string; csrf?: string }

function otp(logSpy: jest.SpyInstance, identifier: string): string {
  const call = logSpy.mock.calls.find((args) => typeof args[0] === "string" && args[0].includes("[DEV OTP]") && args[0].includes(identifier));
  const match = call && /code=(\d+)/.exec(call[0] as string);
  if (!match) throw new Error("Expected DEV OTP log entry");
  return match[1]!;
}

/** Card-to-card receipts: the finance queue for orders/bookings, and the member hearing every decision. */
describe("Card-to-card receipts (e2e)", () => {
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
  async function person(prefix: string) {
    const email = `${prefix}-${unique()}@example.com`;
    const c = client(await session(email));
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return { c, user };
  }
  async function admin(role: AdminRole) {
    const p = await person(`receipts-${role.toLowerCase()}`);
    await prisma.adminUser.create({ data: { userId: p.user.id, role, status: AdminMembershipStatus.ACTIVE } });
    return p.c;
  }
  const notices = (userId: string, type: string) => prisma.notification.findMany({ where: { userId, type } });

  it("tells the member when a wallet top-up receipt is approved or rejected", async () => {
    const { c, user } = await person("receipts-member");
    const finance = await admin(AdminRole.FINANCE);
    const submit = async () => {
      const started = await c.post("/wallet/top-ups").set("Idempotency-Key", unique()).send({ amount: 2_000_000, rail: "CARD_TO_CARD", locale: "fa" }).expect(201);
      const id = started.body.topUp.id as string;
      const target = await c.post(`/wallet/top-ups/${id}/receipt-upload`).send({ contentType: "image/png", fileSizeBytes: 2048 }).expect(201);
      await c.post(`/wallet/top-ups/${id}/receipt`).send({ objectKey: target.body.key }).expect(201);
      return id;
    };
    const approved = await submit();
    await finance.post(`/admin/wallet-top-ups/${approved}/review`).send({ approve: true, receivedAmount: 2_000_000 }).expect(201);
    const credited = await notices(user.id, "wallet.top_up_credited");
    expect(credited).toHaveLength(1);
    expect(credited[0]!.body).toContain("200,000");

    const rejected = await submit();
    await finance.post(`/admin/wallet-top-ups/${rejected}/review`).send({ approve: false, receivedAmount: 0, reason: "The receipt is unreadable" }).expect(201);
    const refused = await notices(user.id, "wallet.top_up_rejected");
    expect(refused).toHaveLength(1);
    expect(refused[0]!.body).toContain("The receipt is unreadable");
  });

  it("lists order/booking receipts pending first, and notifies the member on approve, reject and short payment", async () => {
    const { user } = await person("receipts-payer");
    const support = await admin(AdminRole.SUPPORT);
    const finance = await admin(AdminRole.FINANCE);
    const pending = (expectedAmount: number) =>
      prisma.cardTransferPayment.create({
        data: {
          userId: user.id, idempotencyKey: unique(), expectedAmount, companyCardNumberMasked: "••••••••••••7890", accountHolderName: "PET LIFE OS",
          status: CardTransferPaymentStatus.REVIEW_PENDING, receiptUploadedAt: new Date(), receiptUploadDeadlineAt: new Date(Date.now() + 3_600_000), reviewAvailableAt: new Date(0),
        },
      });
    const a = await pending(5_000_000);
    const b = await pending(3_000_000);
    const s = await pending(4_000_000);

    const queue = await finance.get("/admin/card-transfer-payments").expect(200);
    expect(queue.body.items.map((r: { id: string }) => r.id)).toEqual(expect.arrayContaining([a.id, b.id, s.id]));
    expect(queue.body.items.every((r: { status: string }) => r.status === "REVIEW_PENDING")).toBe(true);
    expect((await finance.get(`/admin/card-transfer-payments/${a.id}`).expect(200)).body).toMatchObject({ member: { userId: user.id }, reference: { kind: "ORDER" }, expectedAmount: 5_000_000 });
    // No receipt file on record: nothing to open.
    await finance.post(`/admin/card-transfer-payments/${a.id}/receipt-link`).expect(400);
    // Reviewing needs finance.refund.execute.
    await support.post(`/admin/card-transfer-payments/${a.id}/review`).send({ approve: true, receivedAmount: 5_000_000 }).expect(403);

    await finance.post(`/admin/card-transfer-payments/${a.id}/review`).send({ approve: true, receivedAmount: 5_000_000 }).expect(201);
    await finance.post(`/admin/card-transfer-payments/${b.id}/review`).send({ approve: false, receivedAmount: 0, reason: "Amount does not match" }).expect(201);
    await finance.post(`/admin/card-transfer-payments/${s.id}/review`).send({ approve: true, receivedAmount: 3_000_000 }).expect(201);

    expect(await notices(user.id, "payment.card_transfer_approved")).toHaveLength(1);
    const rejected = await notices(user.id, "payment.card_transfer_rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.body).toContain("Amount does not match");
    const short = await notices(user.id, "payment.card_transfer_underpaid");
    expect(short).toHaveLength(1);
    expect(short[0]!.body).toContain("100,000");
    expect((await finance.get("/admin/card-transfer-payments?status=REJECTED").expect(200)).body.items.map((r: { id: string }) => r.id)).toContain(b.id);
  });
});
