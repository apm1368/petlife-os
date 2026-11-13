import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";

type Actor = { id: string; adminUserId?: string; cookie: string; csrf: string };

/** Admin → Transactions → Explorer: one filtered, keyset-paged list of money movements; masked; export needs finance.manage. */
describe("Admin transactions explorer", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);

  async function actor(name: string, role?: AdminRole): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `txx-${randomUUID()}@example.com` } });
    const admin = role ? await db.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } }) : null;
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, adminUserId: admin?.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }

  async function buyerWithMoney() {
    const national = `912${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
    const buyer = await db.user.create({ data: { displayName: `Explorer buyer ${randomUUID().slice(0, 6)}`, email: `txx-b-${randomUUID()}@example.com`, phone: `+98${national}` } });
    const cart = await db.cart.create({ data: { userId: buyer.id } });
    const checkout = await db.checkout.create({ data: { userId: buyer.id, cartId: cart.id, deliveryMethod: "STANDARD", status: "CONFIRMED", subtotalAmount: 410_000, deliveryAmount: 0, discountAmount: 0, totalAmount: 410_000, currency: "IRR" } });
    const zibal = await db.paymentIntent.create({ data: { checkoutId: checkout.id, amount: 410_000, currency: "IRR", status: "CAPTURED", provider: "STANDARD_GATEWAY", rail: "ZIBAL" } });
    const cart2 = await db.cart.create({ data: { userId: buyer.id } });
    const checkout2 = await db.checkout.create({ data: { userId: buyer.id, cartId: cart2.id, deliveryMethod: "STANDARD", status: "CONFIRMED", subtotalAmount: 90_000, deliveryAmount: 0, discountAmount: 0, totalAmount: 90_000, currency: "IRR" } });
    const card = await db.paymentIntent.create({ data: { checkoutId: checkout2.id, amount: 90_000, currency: "IRR", status: "CAPTURED", provider: "DEV_SIMULATED", rail: "CARD_TO_CARD" } });
    await db.cardTransferPayment.create({
      data: {
        userId: buyer.id,
        checkoutId: checkout2.id,
        idempotencyKey: randomUUID(),
        expectedAmount: 90_000,
        companyCardNumberMasked: "6037-9917-0429-7788",
        accountHolderName: "opetlife",
        receiptUploadDeadlineAt: new Date(Date.now() + 3600_000),
        reviewAvailableAt: new Date(),
        status: "APPROVED",
      },
    });
    const refund = await db.refund.create({ data: { paymentIntentId: zibal.id, amount: 100_000, status: "SUCCEEDED" } });
    // Not CREDITED: a credited top-up must point at its wallet entry (wallet_top_ups_credited_has_entry); the explorer lists every status.
    const topUp = await db.walletTopUp.create({ data: { userId: buyer.id, rail: "ZIBAL", status: "AWAITING_PAYMENT", amount: 2_000_000, idempotencyKey: randomUUID() } });
    return { buyer, national, zibal, card, refund, topUp };
  }

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("lists one person's payments, refund and top-up newest first, masked, filtered and paged; audits the person search", async () => {
    const support = await actor("support", AdminRole.SUPPORT);
    const ro = await actor("read-only", AdminRole.READ_ONLY);
    const { buyer, national, zibal, card, refund, topUp } = await buyerWithMoney();

    await get(support, `/admin/finance/transactions?person=${buyer.id}`).expect(403);

    const all = (await get(ro, `/admin/finance/transactions?person=0${national}`).expect(200)).body;
    const ids = all.items.map((r: { id: string }) => r.id);
    expect(ids).toEqual(expect.arrayContaining([zibal.id, card.id, refund.id, topUp.id]));
    const times = all.items.map((r: { occurredAt: string }) => r.occurredAt);
    expect([...times].sort().reverse()).toEqual(times);
    const cardRow = all.items.find((r: { id: string }) => r.id === card.id);
    expect(cardRow).toMatchObject({ kind: "PAYMENT", gateway: "CARD_TO_CARD", cardMasked: "•••• 7788", direction: "IN" });
    expect(JSON.stringify(all)).not.toContain("9917-0429");
    expect(cardRow.person).toMatchObject({ id: buyer.id });
    expect(cardRow.person.phoneMasked).not.toContain(national);
    expect(all.items.find((r: { id: string }) => r.id === refund.id)).toMatchObject({ kind: "REFUND", direction: "OUT", gateway: "ZIBAL", amountIrr: 100_000 });
    expect(all.items.find((r: { id: string }) => r.id === topUp.id)).toMatchObject({ kind: "WALLET_TOP_UP", purpose: "WALLET", gateway: "ZIBAL" });

    const audit = await db.adminAuditLog.findFirst({ where: { adminUserId: ro.adminUserId, action: "finance.transactions.searched" }, orderBy: { createdAt: "desc" } });
    expect(audit?.afterSummary).toMatchObject({ filters: { person: `0${national}` } });

    const refundsOnly = (await get(ro, `/admin/finance/transactions?person=${buyer.id}&kind=REFUND`).expect(200)).body;
    expect(refundsOnly.items.map((r: { id: string }) => r.id)).toEqual([refund.id]);
    const cardOnly = (await get(ro, `/admin/finance/transactions?person=${buyer.id}&gateway=CARD_TO_CARD`).expect(200)).body;
    expect(cardOnly.items.map((r: { id: string }) => r.id)).toEqual([card.id]);
    const big = (await get(ro, `/admin/finance/transactions?person=${buyer.id}&minAmount=400000&maxAmount=2000000`).expect(200)).body;
    expect(big.items.map((r: { id: string }) => r.id).sort()).toEqual([zibal.id, topUp.id].sort());
    const noProduct = (await get(ro, `/admin/finance/transactions?person=${buyer.id}&product=${randomUUID()}`).expect(200)).body;
    expect(noProduct.items).toEqual([]);

    // Keyset paging: one row at a time walks the same rows once each.
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: { items: { id: string }[]; nextCursor: string | null } = (await get(ro, `/admin/finance/transactions?person=${buyer.id}&limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`).expect(200)).body;
      seen.push(...page.items.map((r) => r.id));
      cursor = page.nextCursor;
    } while (cursor && seen.length < 10);
    expect(seen).toEqual(ids);

    await get(ro, "/admin/finance/transactions?cursor=not-a-cursor").expect(400);
    await get(ro, "/admin/finance/transactions?gateway=PAYPAL").expect(400);
    await get(ro, "/admin/finance/transactions?minAmount=10&maxAmount=5").expect(400);
  });

  it("exports CSV only with finance.manage, masked, formula-safe and audited", async () => {
    const ro = await actor("read-only export", AdminRole.READ_ONLY);
    const finance = await actor("finance export", AdminRole.FINANCE);
    const { buyer } = await buyerWithMoney();
    await db.user.update({ where: { id: buyer.id }, data: { displayName: "=HYPERLINK(\"http://x\")" } });

    await get(ro, `/admin/finance/transactions/export?person=${buyer.id}`).expect(403);
    const res = await get(finance, `/admin/finance/transactions/export?person=${buyer.id}`).expect(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="transactions-/);
    expect(res.headers["x-export-rows"]).toBe("4");
    const csv = res.text;
    expect(csv.split("\r\n")[0]).toContain("occurredAt,kind,purpose,id,amountIrr");
    expect(csv).toContain("•••• 7788");
    expect(csv).not.toContain("9917-0429");
    expect(csv).toContain("'=HYPERLINK");
    const audit = await db.adminAuditLog.findFirst({ where: { adminUserId: finance.adminUserId, action: "finance.transactions.exported" } });
    expect(audit?.afterSummary).toMatchObject({ rows: 4, truncated: false, filters: { person: buyer.id } });
  });
});
