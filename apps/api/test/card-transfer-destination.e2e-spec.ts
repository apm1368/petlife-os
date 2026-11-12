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

function otp(logSpy: jest.SpyInstance, identifier: string): string {
  const call = logSpy.mock.calls.find((args) => typeof args[0] === "string" && args[0].includes("[DEV OTP]") && args[0].includes(identifier));
  const match = call && /code=(\d+)/.exec(call[0] as string);
  if (!match) throw new Error("Expected DEV OTP log entry");
  return match[1]!;
}

/** The owner's card-to-card account in admin: who may change it, how it is audited and announced, and what members see. */
describe("Card-to-card destination (e2e)", () => {
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
    await prisma.cardTransferDestination.deleteMany({});
  });
  // Other suites rely on the env fallback, which only applies while no destination exists.
  afterAll(async () => {
    await prisma.cardTransferDestination.deleteMany({});
    await app.close();
  });
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
      put: (path: string) => request(server).put(path).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
    };
  }
  async function admin(role: AdminRole) {
    const email = `card-dest-${role.toLowerCase()}-${unique()}@example.com`;
    const c = client(await session(email));
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } });
    return { c, user };
  }
  async function member() {
    const email = `card-dest-member-${unique()}@example.com`;
    return client(await session(email));
  }

  const NEW_CARD = { cardNumber: "6219-8600-0000-1231", sheba: "IR050170000000123456789012", holderName: "شرکت پت لایف", bankName: "سامان", reason: "Owner moved payments to the company account" };

  it("uses the env account until the owner sets one, then only a super admin can change it, audited, masked and announced", async () => {
    const m = await member();
    const before = await m.post("/wallet/top-ups").set("Idempotency-Key", unique()).send({ amount: 1_000_000, rail: "CARD_TO_CARD", locale: "fa" }).expect(201);
    expect(before.body.cardTransfer).toMatchObject({ cardNumber: "6037-9912-3456-7890", cardHolderName: "PET LIFE OS" });

    const finance = await admin(AdminRole.FINANCE);
    const view = await finance.c.get("/admin/finance/card-transfer-destination").expect(200);
    expect(view.body).toMatchObject({ source: "ENV", canEdit: false, current: { cardNumberMasked: "**** **** **** 7890" } });
    // Finance cannot change it, nor can an ADMIN holding settings.manage: only SUPER_ADMIN.
    expect((await finance.c.put("/admin/finance/card-transfer-destination").send(NEW_CARD)).status).toBe(403);
    const plainAdmin = await admin(AdminRole.ADMIN);
    expect((await plainAdmin.c.put("/admin/finance/card-transfer-destination").send(NEW_CARD)).status).toBe(403);

    const owner = await admin(AdminRole.SUPER_ADMIN);
    const otherOwner = await admin(AdminRole.SUPER_ADMIN);
    await owner.c.put("/admin/finance/card-transfer-destination").send({ ...NEW_CARD, cardNumber: "6219860000001232" }).expect(400);
    await owner.c.put("/admin/finance/card-transfer-destination").send({ ...NEW_CARD, reason: "short" }).expect(400);
    const changed = await owner.c.put("/admin/finance/card-transfer-destination").send(NEW_CARD).expect(200);
    expect(changed.body).toMatchObject({ source: "ADMIN", canEdit: true, current: { cardNumberMasked: "**** **** **** 1231", shebaMasked: "IR** **** **** **** **** 9012", holderName: "شرکت پت لایف" } });
    // The admin API never echoes the full numbers back.
    expect(JSON.stringify(changed.body)).not.toContain("6219860000001231");
    expect(JSON.stringify(changed.body)).not.toContain("IR050170000000123456789012");

    const audit = await prisma.adminAuditLog.findFirstOrThrow({ where: { action: "card_transfer_destination.changed" }, orderBy: { createdAt: "desc" } });
    expect(audit.reason).toBe(NEW_CARD.reason);
    expect(JSON.stringify(audit.afterSummary)).toContain("**** **** **** 1231");
    expect(JSON.stringify([audit.beforeSummary, audit.afterSummary])).not.toContain("6219860000001231");
    // Every super admin is told, the actor included.
    for (const u of [owner.user, otherOwner.user]) {
      expect(await prisma.notification.count({ where: { userId: u.id, type: "admin.card_destination_changed" } })).toBe(1);
    }

    // New payments use the new account; the request started earlier keeps the account it was started with.
    const after = await m.post("/wallet/top-ups").set("Idempotency-Key", unique()).send({ amount: 1_000_000, rail: "CARD_TO_CARD", locale: "fa" }).expect(201);
    expect(after.body.cardTransfer).toEqual({ cardNumber: "6219-8600-0000-1231", cardHolderName: "شرکت پت لایف", bankName: "سامان", sheba: "IR050170000000123456789012" });
    expect((await m.get(`/wallet/top-ups/${before.body.topUp.id}`).expect(200)).body.cardTransfer).toMatchObject({ cardNumber: "6037-9912-3456-7890" });
    // Public settings never carry it.
    expect(JSON.stringify((await request(server).get("/settings/public").expect(200)).body)).not.toContain("6219");

    // Switching it off closes card-to-card (no silent fall back to the env account) and is announced too.
    await owner.c.post("/admin/finance/card-transfer-destination/deactivate").send({ reason: "Bank account is being replaced" }).expect(201);
    expect((await m.get("/wallet").expect(200)).body.topUp.rails).not.toContain("CARD_TO_CARD");
    expect(await prisma.notification.count({ where: { userId: otherOwner.user.id, type: "admin.card_destination_disabled" } })).toBe(1);
    const history = (await finance.c.get("/admin/finance/card-transfer-destination").expect(200)).body;
    expect(history).toMatchObject({ source: "NONE", current: null });
    expect(history.history[0]).toMatchObject({ active: false, closeReason: "Bank account is being replaced" });
  });
});
