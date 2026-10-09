import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole, LedgerAccountCode } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { LedgerService } from "../src/modules/commerce/ledger/ledger.service";

type Actor = { id: string; adminUserId?: string; cookie: string; csrf: string };

/** ERP-E: payment trace, reconciliation engine (findings, tasks, clearing, resolution), settlement hold/export, refund preview. */
describe("ERP-E finance control plane", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const post = (a: Actor, u: string) => request(server()).post(u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function actor(name: string, role?: AdminRole): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `erpe-${randomUUID()}@example.com` } });
    const admin = role ? await db.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } }) : null;
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, adminUserId: admin?.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }
  /** A captured payment; `consistent` adds the CHARGE transaction and the ledger posting a real capture writes. */
  async function payment(amount: number, opts: { consistent: boolean; order?: boolean } = { consistent: true }) {
    const buyer = await db.user.create({ data: { displayName: "buyer", email: `erpe-b-${randomUUID()}@example.com` } });
    const cart = await db.cart.create({ data: { userId: buyer.id } });
    const checkout = await db.checkout.create({ data: { userId: buyer.id, cartId: cart.id, deliveryMethod: "STANDARD", status: "CONFIRMED", subtotalAmount: amount, deliveryAmount: 0, discountAmount: 0, totalAmount: amount, currency: "IRR" } });
    const intent = await db.paymentIntent.create({ data: { checkoutId: checkout.id, amount, currency: "IRR", status: "CAPTURED", provider: "DEV_SIMULATED" } });
    if (opts.consistent) {
      await db.transaction.create({ data: { paymentIntentId: intent.id, type: "CHARGE", status: "SUCCEEDED", amount, currency: "IRR" } });
      await app.get(LedgerService).recordPaymentSucceeded(checkout.id, amount, "IRR");
    }
    let order = null;
    if (opts.order) {
      const seller = await db.sellerOrganization.create({ data: { name: `ERP-E S ${randomUUID().slice(0, 6)}`, verificationStatus: "VERIFIED", status: "ACTIVE", countryCode: "IR" } });
      order = await db.order.create({ data: { checkoutId: checkout.id, userId: buyer.id, sellerOrganizationId: seller.id, status: "CONFIRMED", subtotalAmount: amount, deliveryAmount: 0, discountAmount: 0, totalAmount: amount, currency: "IRR", shippingAddressSnapshot: {} } });
    }
    return { checkout, intent, order };
  }
  const findingFor = (check: string, entityId: string) => db.financeReconciliationFinding.findUnique({ where: { check_entityType_entityId: { check: check as never, entityType: check === "ORDER_CAPTURE" ? "Checkout" : "PaymentIntent", entityId } } });

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("reconciliation: classifies, persists findings once with one FINANCE_MISMATCH task, clears them when fixed, humans resolve", async () => {
    const finance = await actor("finance", AdminRole.FINANCE);
    const ro = await actor("ro", AdminRole.READ_ONLY);
    const support = await actor("support", AdminRole.SUPPORT);
    const good = await payment(120_000);
    const broken = await payment(80_000, { consistent: false });
    const dup = await payment(50_000);
    await db.transaction.create({ data: { paymentIntentId: dup.intent.id, type: "CHARGE", status: "SUCCEEDED", amount: 50_000, currency: "IRR" } });
    const bad = await db.ledgerTransaction.create({ data: { description: "test imbalance", referenceType: "PAYMENT", referenceId: randomUUID(), currency: "IRR" } });
    const acct = await db.ledgerAccount.findFirstOrThrow({ where: { code: LedgerAccountCode.CASH_GATEWAY_RECEIVABLE } });
    await db.ledgerEntry.createMany({ data: [{ ledgerTransactionId: bad.id, ledgerAccountId: acct.id, direction: "DEBIT", amount: 100 }, { ledgerTransactionId: bad.id, ledgerAccountId: acct.id, direction: "CREDIT", amount: 90 }] });

    await post(ro, "/admin/finance/reconciliation/run").expect(403);
    await post(support, "/admin/finance/reconciliation/run").expect(403);
    const run = (await post(finance, "/admin/finance/reconciliation/run").expect(201)).body;
    expect(run.summary.INTENT_TRANSACTION.MATCHED).toBeGreaterThanOrEqual(1);
    expect((await findingFor("INTENT_TRANSACTION", good.intent.id))).toBeNull();
    expect((await findingFor("INTENT_TRANSACTION", broken.intent.id))).toMatchObject({ outcome: "MISSING", status: "OPEN" });
    expect((await findingFor("TRANSACTION_LEDGER", broken.intent.id))).toMatchObject({ outcome: "MISSING" });
    expect((await findingFor("INTENT_TRANSACTION", dup.intent.id))).toMatchObject({ outcome: "DUPLICATE" });
    expect(await db.financeReconciliationFinding.findUnique({ where: { check_entityType_entityId: { check: "LEDGER_BALANCE", entityType: "MAIN_LEDGER_TRANSACTION", entityId: bad.id } } })).toMatchObject({ outcome: "MISMATCH" });
    expect(await db.adminTask.count({ where: { dedupeKey: `finance-mismatch:INTENT_TRANSACTION:${broken.intent.id}`, source: "FINANCE_MISMATCH", team: "FINANCE" } })).toBe(1);

    // Re-running (also concurrently) never duplicates findings or tasks.
    await Promise.all([post(finance, "/admin/finance/reconciliation/run").expect(201), post(finance, "/admin/finance/reconciliation/run").expect(201)]);
    expect(await db.financeReconciliationFinding.count({ where: { entityId: broken.intent.id } })).toBe(2);
    expect(await db.adminTask.count({ where: { dedupeKey: { startsWith: "finance-mismatch:" }, relatedEntityId: broken.intent.id } })).toBe(2);

    // Fixed through the normal path → the finding clears itself.
    await db.transaction.create({ data: { paymentIntentId: broken.intent.id, type: "CHARGE", status: "SUCCEEDED", amount: 80_000, currency: "IRR" } });
    await app.get(LedgerService).recordPaymentSucceeded(broken.checkout.id, 80_000, "IRR");
    await post(finance, "/admin/finance/reconciliation/run").expect(201);
    expect((await findingFor("INTENT_TRANSACTION", broken.intent.id))?.status).toBe("CLEARED");
    expect((await findingFor("TRANSACTION_LEDGER", broken.intent.id))?.status).toBe("CLEARED");

    const list = (await get(ro, `/admin/finance/reconciliation/findings?status=OPEN&entityId=${dup.intent.id}`).expect(200)).body;
    expect(list.items[0]).toMatchObject({ check: "INTENT_TRANSACTION", outcome: "DUPLICATE", task: expect.objectContaining({ status: "OPEN" }) });
    await post(ro, `/admin/finance/reconciliation/findings/${list.items[0].id}/resolve`).send({ resolution: "EXPLAINED", note: "provider double webhook" }).expect(403);
    await post(finance, `/admin/finance/reconciliation/findings/${list.items[0].id}/resolve`).send({ resolution: "MADE_UP", note: "provider double webhook" }).expect(400);
    await post(finance, `/admin/finance/reconciliation/findings/${list.items[0].id}/resolve`).send({ resolution: "EXPLAINED", note: "provider double webhook" }).expect(201);
    await post(finance, `/admin/finance/reconciliation/findings/${list.items[0].id}/resolve`).send({ resolution: "EXPLAINED", note: "again again" }).expect(400);
    await post(finance, "/admin/finance/reconciliation/run").expect(201);
    expect((await findingFor("INTENT_TRANSACTION", dup.intent.id))?.status).toBe("RESOLVED"); // not silently reopened
    expect(await db.adminAuditLog.count({ where: { action: "finance.finding_resolved", entityId: dup.intent.id } })).toBe(1);
    // Nothing in the money tables changed because of reconciliation.
    expect(await db.transaction.count({ where: { paymentIntentId: dup.intent.id } })).toBe(2);
  });

  it("payment trace: one graph from intent, checkout or order; permissioned and audited", async () => {
    const finance = await actor("finance", AdminRole.FINANCE);
    const p = await payment(70_000, { consistent: true, order: true });
    await get(await actor("member"), `/admin/finance/trace?type=order&id=${p.order!.id}`).expect(403);
    await get(await actor("ops", AdminRole.COMMERCE_OPERATIONS), `/admin/finance/trace?type=order&id=${p.order!.id}`).expect(403);
    await get(finance, `/admin/finance/trace?type=nonsense&id=${p.order!.id}`).expect(400);
    await get(finance, `/admin/finance/trace?type=order&id=${randomUUID()}`).expect(404);
    for (const [type, id] of [["order", p.order!.id], ["paymentIntent", p.intent.id], ["checkout", p.checkout.id]] as const) {
      const t = (await get(finance, `/admin/finance/trace?type=${type}&id=${id}`).expect(200)).body;
      expect(t.intents.map((i: { id: string }) => i.id)).toEqual([p.intent.id]);
      expect(t.intents[0].transactions[0]).toMatchObject({ type: "CHARGE", status: "SUCCEEDED", amount: 70_000 });
      expect(t.orders.map((o: { id: string }) => o.id)).toEqual([p.order!.id]);
      expect(t.ledger[0]).toMatchObject({ description: "Payment captured", balanced: true });
      expect(t.ledger[0].entries).toEqual(expect.arrayContaining([{ account: "CASH_GATEWAY_RECEIVABLE", direction: "DEBIT", amount: 70_000 }]));
    }
    expect(await db.adminAuditLog.count({ where: { action: "finance.trace_viewed", entityId: { in: [p.order!.id, p.intent.id, p.checkout.id] } } })).toBe(3);
  });

  it("settlement hold blocks approve and payout until released; breakdown and CSV export; refund preview", async () => {
    const finance = await actor("finance", AdminRole.FINANCE);
    const admin = await actor("admin", AdminRole.ADMIN);
    const ro = await actor("ro", AdminRole.READ_ONLY);
    const seller = await db.sellerOrganization.create({ data: { name: `ERP-E Seller ${randomUUID().slice(0, 6)}`, verificationStatus: "VERIFIED", status: "ACTIVE", countryCode: "IR" } });
    const settlement = await db.sellerSettlement.create({ data: { reference: `ST-${randomUUID().slice(0, 8)}`, sellerOrganizationId: seller.id, periodStart: new Date(Date.now() - 30 * 86400e3), periodEnd: new Date(), currency: "IRR", grossIrr: 0, commissionIrr: 0, refundsIrr: 0, adjustmentsIrr: 0, netIrr: 0, initiatedByAdminId: admin.adminUserId! } });
    await post(ro, `/admin/finance/settlements/${settlement.id}/hold`).send({ reason: "chargeback review" }).expect(403);
    await post(finance, `/admin/finance/settlements/${settlement.id}/hold`).send({ reason: "chargeback review" }).expect(201);
    expect((await post(finance, `/admin/finance/settlements/${settlement.id}/hold`).send({ reason: "chargeback review" }).expect(400)).body.error.details.reason).toBe("UNCHANGED");
    expect((await post(finance, `/admin/settlements/${settlement.id}/approve`).send({}).expect(409)).body.error.details.reason).toBe("ON_HOLD");
    expect((await post(finance, `/admin/settlements/${settlement.id}/payout`).set("Idempotency-Key", randomUUID()).send({}).expect(409)).body.error.details.reason).toBe("ON_HOLD");
    await post(finance, `/admin/finance/settlements/${settlement.id}/release`).send({ reason: "review done" }).expect(201);
    await post(finance, `/admin/settlements/${settlement.id}/approve`).send({}).expect(201);
    const b = (await get(ro, `/admin/finance/settlements/${settlement.id}/breakdown`).expect(200)).body;
    expect(b).toMatchObject({ settlement: { onHold: false, status: "APPROVED" }, clinicSettlement: "PRODUCT_DECISION_REQUIRED" });
    const csv = await get(finance, `/admin/finance/settlements/${settlement.id}/export`).expect(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.text).toContain(settlement.reference);
    expect(await db.adminAuditLog.count({ where: { entityId: settlement.id, action: { in: ["settlement.held", "settlement.released", "settlement.exported"] } } })).toBe(3);

    const p = await payment(90_000, { consistent: true, order: true });
    const preview = (await get(finance, `/admin/finance/orders/${p.order!.id}/refund-preview`).expect(200)).body;
    expect(preview).toMatchObject({ capturedAmount: 90_000, refundable: 90_000, canRequest: true });
    expect((await get(finance, `/admin/finance/orders/${p.order!.id}/refund-preview?amount=100000`).expect(200)).body.blockers).toContain("EXCEEDS_REFUNDABLE");
    expect(await db.refund.count({ where: { orderId: p.order!.id } })).toBe(0); // preview never creates anything
  });
});
