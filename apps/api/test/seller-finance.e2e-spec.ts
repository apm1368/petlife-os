import { Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { AdminMembershipStatus, AdminRole, MarketplaceProvider, RefundStatus, SellerMembershipRole, SellerMembershipStatus, SellerStatus, SellerVerificationStatus } from "@prisma/client";
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
  };
}

/**
 * Handoff 14 — Marketplace & Seller Financial Settlement e2e flows (spec
 * Flows A-O). A separate file from app.e2e-spec.ts (jest's `.e2e-spec.ts$`
 * regex picks up any matching file) rather than appending to that already
 * 4800-line file. Exercises the real HTTP surface end to end — checkout ->
 * pay for direct sales, the dev marketplace webhook simulation for
 * marketplace sales, and the actual admin/seller controllers for
 * settlement, refund, and reconciliation flows — never calling services
 * directly, so these tests catch wiring mistakes the same way a real
 * client would hit them.
 */
describe("Marketplace & Seller Financial Settlement (Handoff 14)", () => {
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

  async function setupSeller() {
    const identifier = `hf14-seller-owner-${unique()}@example.com`;
    const client = authedRequest(app, await signUp(app, logSpy, identifier));
    const ownerUser = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });
    const seller = await prisma.sellerOrganization.create({ data: { name: `HF14 Seller ${unique()}`, verificationStatus: SellerVerificationStatus.VERIFIED, status: SellerStatus.ACTIVE, countryCode: "US" } });
    await prisma.sellerMembership.create({ data: { sellerOrganizationId: seller.id, userId: ownerUser.id, role: SellerMembershipRole.OWNER, status: SellerMembershipStatus.ACTIVE, acceptedAt: new Date() } });
    return { client, sellerId: seller.id, ownerUserId: ownerUser.id };
  }

  async function setupAdmin(role: AdminRole, status: AdminMembershipStatus = AdminMembershipStatus.ACTIVE) {
    const identifier = `hf14-admin-${role.toLowerCase()}-${unique()}@example.com`;
    const client = authedRequest(app, await signUp(app, logSpy, identifier));
    const user = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });
    const adminUser = await prisma.adminUser.create({ data: { userId: user.id, role, status } });
    return { client, userId: user.id, adminUserId: adminUser.id };
  }

  /** Real checkout -> pay flow (mirrors app.e2e-spec.ts's own setupPaidOrder) — the genuine trigger for direct-sale attribution, never a direct DB insert. */
  async function createDirectSaleOrder(sellerId: string, priceAmount: number) {
    const identifier = `hf14-buyer-${unique()}@example.com`;
    const client = authedRequest(app, await signUp(app, logSpy, identifier));
    const household = await client.post("/households").send({}).expect(201);
    const category = await prisma.productCategory.create({ data: { name: `HF14 Category ${unique()}`, slug: `hf14-category-${unique()}` } });
    const product = await prisma.product.create({ data: { categoryId: category.id, title: `HF14 Product ${unique()}`, slug: `hf14-product-${unique()}`, supportsDog: true, supportsCat: true, allergenTags: [] } });
    const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: `HF14-SKU-${unique()}` } });
    const offer = await prisma.sellerOffer.create({ data: { sellerOrganizationId: sellerId, productVariantId: variant.id, priceAmount, currency: "IRR" } });
    await prisma.inventoryItem.create({ data: { sellerOfferId: offer.id, onHand: 100 } });
    const addressRes = await client.post("/addresses").send({ householdId: household.body.id, addressLine: "1 Test St.", city: "Testville", countryCode: "US" }).expect(201);
    await client.post("/cart/items").send({ offerId: offer.id, quantity: 1 }).expect(201);
    const checkout = await client.post("/checkout").send({ addressId: addressRes.body.id }).expect(201);
    await client.post(`/checkout/${checkout.body.id}/payment-intent`).send({}).expect(201);
    const paid = await client.post(`/checkout/${checkout.body.id}/pay`).send({ mode: "SUCCESS" }).expect(201);
    const orderId = paid.body.orderIds[0] as string;
    return { orderId };
  }

  /** Real dev-marketplace webhook simulation (spec Flow B) — connects a DEV channel, publishes nothing (uses sellerSku resolution instead), then simulates an order. */
  async function createMarketplaceSaleOrder(sellerClient: ReturnType<typeof authedRequest>, sellerId: string, grossAmount: number) {
    const category = await prisma.productCategory.create({ data: { name: `HF14 MP Category ${unique()}`, slug: `hf14-mp-category-${unique()}` } });
    const product = await prisma.product.create({ data: { categoryId: category.id, title: `HF14 MP Product ${unique()}`, slug: `hf14-mp-product-${unique()}`, supportsDog: true, supportsCat: true, allergenTags: [] } });
    const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: `HF14-MP-SKU-${unique()}` } });
    const sellerSku = `HF14-MP-SELLERSKU-${unique()}`;
    const offer = await prisma.sellerOffer.create({ data: { sellerOrganizationId: sellerId, productVariantId: variant.id, priceAmount: grossAmount, currency: "IRR", sellerSku } });
    await prisma.inventoryItem.create({ data: { sellerOfferId: offer.id, onHand: 100 } });

    const channel = await sellerClient.post(`/seller-organizations/${sellerId}/channels`).send({ provider: MarketplaceProvider.DEV, displayName: `HF14 DEV Channel ${unique()}` }).expect(201);
    const externalOrderId = `HF14-EXT-${unique()}`;
    const simulate = await sellerClient
      .post(`/seller-organizations/${sellerId}/channels/${channel.body.id}/dev/simulate/order`)
      .send({ externalOrderId, items: [{ sellerSku, quantity: 1, unitPriceAmount: grossAmount }] })
      .expect(201);
    const marketplaceOrderId = simulate.body.id as string;
    const mo = await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: marketplaceOrderId } });
    return { channelAccountId: channel.body.id as string, externalOrderId, orderId: mo.mappedOrderId as string };
  }

  async function getSellerBalance(sellerId: string) {
    const account = await prisma.sellerLedgerAccount.findUnique({ where: { sellerOrganizationId_code: { sellerOrganizationId: sellerId, code: "RECEIVABLE" } } });
    if (!account) return { pendingIrr: 0 };
    const entries = await prisma.sellerLedgerEntry.findMany({
      where: { sellerLedgerAccountId: account.id, sellerLedgerTransaction: { sellerSettlementId: null } },
      select: { direction: true, amount: true },
    });
    const pendingIrr = entries.reduce((sum, e) => sum + (e.direction === "DEBIT" ? e.amount : -e.amount), 0);
    return { pendingIrr };
  }

  // --- Flow A: Direct PET LIFE Sale ---------------------------------------

  it("Flow A: a direct checkout sale attributes seller/platform economics and grows the seller's pending receivable", async () => {
    const seller = await setupSeller();
    const { orderId } = await createDirectSaleOrder(seller.sellerId, 5_000_000);

    const breakdown = await prisma.orderFinancialBreakdown.findUniqueOrThrow({ where: { orderId } });
    expect(breakdown.origin).toBe("PET_LIFE");
    expect(breakdown.sellerNetIrr).toBe(4_500_000);
    expect(breakdown.platformCommissionIrr).toBe(500_000);

    const summary = await seller.client.get(`/seller-organizations/${seller.sellerId}/finance/summary`).expect(200);
    expect(summary.body.balance.pendingIrr).toBeGreaterThanOrEqual(4_500_000);
  });

  // --- Flow B: External Marketplace Sale ----------------------------------

  it("Flow B: a DEV marketplace sale never creates a PaymentIntent and still attributes seller economics honestly", async () => {
    const seller = await setupSeller();
    const { orderId } = await createMarketplaceSaleOrder(seller.client, seller.sellerId, 3_000_000);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.checkoutId).toBeNull();

    const breakdown = await prisma.orderFinancialBreakdown.findUniqueOrThrow({ where: { orderId } });
    expect(breakdown.origin).toBe("DEV_MARKETPLACE");
    expect(breakdown.sellerNetIrr).toBe(2_700_000);

    const balance = await getSellerBalance(seller.sellerId);
    expect(balance.pendingIrr).toBeGreaterThanOrEqual(2_700_000);
  });

  // --- Flow C: Settlement calculate -> approve -> payout, with threshold enforcement ---

  it("Flow C: a large settlement requires approval before payout, then pays out and moves the balance from pending to paid", async () => {
    const seller = await setupSeller();
    const { orderId } = await createDirectSaleOrder(seller.sellerId, 15_000_000); // sellerNet 13.5M >= SETTLEMENT_APPROVAL_THRESHOLD_IRR (10M)
    void orderId;

    const finance = await setupAdmin(AdminRole.FINANCE);
    const superAdmin = await setupAdmin(AdminRole.SUPER_ADMIN);

    const periodStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const periodEnd = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const calc = await finance.client.post("/admin/settlements/calculate").send({ sellerOrganizationId: seller.sellerId, periodStart, periodEnd }).expect(201);
    expect(calc.body.status).toBe("CALCULATED");
    expect(calc.body.netIrr).toBe(13_500_000);
    const settlementId = calc.body.id as string;

    const payoutTooEarly = await finance.client.post(`/admin/settlements/${settlementId}/payout`).send({}).expect(409);
    expect(payoutTooEarly.body.error.code).toBe("SELLER_SETTLEMENT_APPROVAL_REQUIRED");

    await superAdmin.client.post(`/admin/settlements/${settlementId}/approve`).send({}).expect(201);
    const paid = await finance.client.post(`/admin/settlements/${settlementId}/payout`).send({ payoutReference: "manual-ref-1" }).expect(201);
    expect(paid.body.status).toBe("PAID");

    const paidTxn = await prisma.sellerLedgerTransaction.findFirst({ where: { sellerOrganizationId: seller.sellerId, referenceType: "SETTLEMENT_PAYMENT", sellerSettlementId: settlementId } });
    expect(paidTxn).not.toBeNull();
  });

  // --- Flow D: Double Settlement Protection (concurrency) -----------------

  it("Flow D: two concurrent calculate() calls for the same period never both sweep the same order", async () => {
    const seller = await setupSeller();
    await createDirectSaleOrder(seller.sellerId, 2_000_000);
    const finance = await setupAdmin(AdminRole.FINANCE);

    const periodStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const periodEnd = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const body = { sellerOrganizationId: seller.sellerId, periodStart, periodEnd };

    const [a, b] = await Promise.allSettled([
      finance.client.post("/admin/settlements/calculate").send(body),
      finance.client.post("/admin/settlements/calculate").send(body),
    ]);

    const succeeded = [a, b].filter((r): r is PromiseFulfilledResult<request.Response> => r.status === "fulfilled" && r.value.status === 201);
    const withOrder = succeeded.filter((r) => r.value.body.netIrr === 1_800_000);
    // Exactly one of the two racing calls actually swept the order — the other either failed outright or produced an empty (netIrr=0) settlement.
    expect(withOrder.length).toBe(1);
  });

  // --- Flow E: Refund Before Settlement ------------------------------------

  it("Flow E: a refund before settlement reduces the seller's pending receivable back toward zero", async () => {
    const seller = await setupSeller();
    const identifier = `hf14-refund-buyer-${unique()}@example.com`;
    const buyerClient = authedRequest(app, await signUp(app, logSpy, identifier));
    const household = await buyerClient.post("/households").send({}).expect(201);
    const category = await prisma.productCategory.create({ data: { name: `HF14 Refund Category ${unique()}`, slug: `hf14-refund-category-${unique()}` } });
    const product = await prisma.product.create({ data: { categoryId: category.id, title: `HF14 Refund Product ${unique()}`, slug: `hf14-refund-product-${unique()}`, supportsDog: true, supportsCat: true, allergenTags: [] } });
    const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: `HF14-REFUND-SKU-${unique()}` } });
    const offer = await prisma.sellerOffer.create({ data: { sellerOrganizationId: seller.sellerId, productVariantId: variant.id, priceAmount: 2_000_000, currency: "IRR" } });
    await prisma.inventoryItem.create({ data: { sellerOfferId: offer.id, onHand: 10 } });
    const addressRes = await buyerClient.post("/addresses").send({ householdId: household.body.id, addressLine: "1 Test St.", city: "Testville", countryCode: "US" }).expect(201);
    await buyerClient.post("/cart/items").send({ offerId: offer.id, quantity: 1 }).expect(201);
    const checkout = await buyerClient.post("/checkout").send({ addressId: addressRes.body.id }).expect(201);
    await buyerClient.post(`/checkout/${checkout.body.id}/payment-intent`).send({}).expect(201);
    const paid = await buyerClient.post(`/checkout/${checkout.body.id}/pay`).send({ mode: "SUCCESS" }).expect(201);
    const orderId = paid.body.orderIds[0] as string;

    const balanceBefore = await getSellerBalance(seller.sellerId);
    await buyerClient.post(`/orders/${orderId}/refunds`).send({}).expect(201);
    const balanceAfter = await getSellerBalance(seller.sellerId);

    expect(balanceAfter.pendingIrr).toBe(balanceBefore.pendingIrr - 1_800_000);
  });

  // --- Flow F: Refund After Settlement -------------------------------------

  it("Flow F: a refund after the order was already paid out creates a negative carry-forward, never rewriting the paid settlement", async () => {
    const seller = await setupSeller();
    const identifier = `hf14-late-refund-buyer-${unique()}@example.com`;
    const buyerClient = authedRequest(app, await signUp(app, logSpy, identifier));
    const household = await buyerClient.post("/households").send({}).expect(201);
    const category = await prisma.productCategory.create({ data: { name: `HF14 Late Refund Category ${unique()}`, slug: `hf14-late-refund-category-${unique()}` } });
    const product = await prisma.product.create({ data: { categoryId: category.id, title: `HF14 Late Refund Product ${unique()}`, slug: `hf14-late-refund-product-${unique()}`, supportsDog: true, supportsCat: true, allergenTags: [] } });
    const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: `HF14-LATE-SKU-${unique()}` } });
    const offer = await prisma.sellerOffer.create({ data: { sellerOrganizationId: seller.sellerId, productVariantId: variant.id, priceAmount: 1_000_000, currency: "IRR" } });
    await prisma.inventoryItem.create({ data: { sellerOfferId: offer.id, onHand: 10 } });
    const addressRes = await buyerClient.post("/addresses").send({ householdId: household.body.id, addressLine: "1 Test St.", city: "Testville", countryCode: "US" }).expect(201);
    await buyerClient.post("/cart/items").send({ offerId: offer.id, quantity: 1 }).expect(201);
    const checkout = await buyerClient.post("/checkout").send({ addressId: addressRes.body.id }).expect(201);
    await buyerClient.post(`/checkout/${checkout.body.id}/payment-intent`).send({}).expect(201);
    const paid = await buyerClient.post(`/checkout/${checkout.body.id}/pay`).send({ mode: "SUCCESS" }).expect(201);
    const orderId = paid.body.orderIds[0] as string;

    const finance = await setupAdmin(AdminRole.FINANCE);
    const periodStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const periodEnd = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const calc = await finance.client.post("/admin/settlements/calculate").send({ sellerOrganizationId: seller.sellerId, periodStart, periodEnd }).expect(201);
    await finance.client.post(`/admin/settlements/${calc.body.id}/payout`).send({}).expect(201);

    const balanceAfterPayout = await getSellerBalance(seller.sellerId);
    await buyerClient.post(`/orders/${orderId}/refunds`).send({}).expect(201);
    const balanceAfterRefund = await getSellerBalance(seller.sellerId);

    // The refund's reversal is a brand-new, unswept entry — it never touches the already-PAID settlement's own rows.
    expect(balanceAfterRefund.pendingIrr).toBe(balanceAfterPayout.pendingIrr - 900_000);
    expect(balanceAfterRefund.pendingIrr).toBeLessThan(0);

    const settlementAfter = await prisma.sellerSettlement.findUniqueOrThrow({ where: { id: calc.body.id } });
    expect(settlementAfter.status).toBe("PAID");
    expect(settlementAfter.netIrr).toBe(900_000); // untouched — the original PAID settlement's own totals are never rewritten
  });

  // --- Flow G / H: Marketplace Reconciliation Match / Mismatch ------------

  it("Flows G & H: an imported statement line matching internal economics is MATCHED, a disagreeing one is MISMATCH with the correct variance", async () => {
    const seller = await setupSeller();
    const finance = await setupAdmin(AdminRole.FINANCE);

    const matchOrder = await createMarketplaceSaleOrder(seller.client, seller.sellerId, 4_000_000);
    const mismatchOrder = await createMarketplaceSaleOrder(seller.client, seller.sellerId, 6_000_000);

    const now = new Date();
    const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const periodEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const statement = await finance.client
      .post("/admin/marketplace-settlements/import")
      .send({
        marketplaceChannelAccountId: matchOrder.channelAccountId,
        source: "MANUAL",
        periodStart,
        periodEnd,
        currency: "IRR",
        lines: [
          { externalOrderId: matchOrder.externalOrderId, amount: 4_000_000 },
          { externalOrderId: mismatchOrder.externalOrderId, amount: 5_500_000 },
        ],
      })
      .expect(201);

    const results = await finance.client.get(`/admin/marketplace-settlements/${statement.body.id}`).expect(200);
    expect(results.body.lines).toHaveLength(2);

    const reconciliation = await finance.client.get("/admin/marketplace-reconciliation").expect(200);
    const matched = reconciliation.body.find((r: { statementAmount: number; status: string }) => r.statementAmount === 4_000_000);
    const mismatched = reconciliation.body.find((r: { statementAmount: number; status: string }) => r.statementAmount === 5_500_000);
    expect(matched.status).toBe("MATCHED");
    expect(mismatched.status).toBe("MISMATCH");
    expect(mismatched.variance).toBe(5_500_000 - 6_000_000);
  });

  // --- Flow I: Duplicate Statement -----------------------------------------

  it("Flow I: importing the same channel/period statement twice converges on the same statement, never a duplicate", async () => {
    const seller = await setupSeller();
    const finance = await setupAdmin(AdminRole.FINANCE);
    const order = await createMarketplaceSaleOrder(seller.client, seller.sellerId, 1_500_000);

    const now = new Date();
    const periodStart = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const periodEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const body = { marketplaceChannelAccountId: order.channelAccountId, source: "MANUAL", periodStart, periodEnd, currency: "IRR", lines: [{ externalOrderId: order.externalOrderId, amount: 1_500_000 }] };

    const first = await finance.client.post("/admin/marketplace-settlements/import").send(body).expect(201);
    const second = await finance.client.post("/admin/marketplace-settlements/import").send(body).expect(201);
    expect(second.body.id).toBe(first.body.id);

    const count = await prisma.marketplaceSettlementStatement.count({ where: { marketplaceChannelAccountId: order.channelAccountId } });
    expect(count).toBe(1);
  });

  // --- Flow J: Seller Isolation ---------------------------------------------

  it("Flow J: a seller can never read another seller's finance summary, transactions, or settlement detail", async () => {
    const sellerA = await setupSeller();
    const sellerB = await setupSeller();
    await createDirectSaleOrder(sellerA.sellerId, 1_000_000);

    await sellerB.client.get(`/seller-organizations/${sellerA.sellerId}/finance/summary`).expect(403);

    const finance = await setupAdmin(AdminRole.FINANCE);
    const periodStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const periodEnd = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const calc = await finance.client.post("/admin/settlements/calculate").send({ sellerOrganizationId: sellerA.sellerId, periodStart, periodEnd }).expect(201);

    await sellerB.client.get(`/seller-organizations/${sellerB.sellerId}/settlements/${calc.body.id}`).expect(404);
    await sellerA.client.get(`/seller-organizations/${sellerA.sellerId}/settlements/${calc.body.id}`).expect(200);
  });

  // --- Flow K: Admin RBAC ----------------------------------------------------

  it("Flow K: SUPPORT never gets settlement authority; FINANCE does", async () => {
    const seller = await setupSeller();
    await createDirectSaleOrder(seller.sellerId, 1_000_000);
    const support = await setupAdmin(AdminRole.SUPPORT);
    const finance = await setupAdmin(AdminRole.FINANCE);

    const periodStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const periodEnd = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const denied = await support.client.post("/admin/settlements/calculate").send({ sellerOrganizationId: seller.sellerId, periodStart, periodEnd }).expect(403);
    expect(denied.body.error.details.reason).toBe("INSUFFICIENT_PERMISSION");

    await finance.client.post("/admin/settlements/calculate").send({ sellerOrganizationId: seller.sellerId, periodStart, periodEnd }).expect(201);
  });

  // --- Flow L: Two-person Approval -------------------------------------------

  it("Flow L: the admin who calculated a settlement cannot also approve it", async () => {
    const seller = await setupSeller();
    await createDirectSaleOrder(seller.sellerId, 12_000_000); // above threshold, so approval actually matters for payout
    const finance = await setupAdmin(AdminRole.FINANCE);

    const periodStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const periodEnd = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const calc = await finance.client.post("/admin/settlements/calculate").send({ sellerOrganizationId: seller.sellerId, periodStart, periodEnd }).expect(201);

    const selfApprove = await finance.client.post(`/admin/settlements/${calc.body.id}/approve`).send({}).expect(409);
    expect(selfApprove.body.error.code).toBe("SELLER_SETTLEMENT_SELF_APPROVAL");
  });

  // --- Flow M: Settlement/Refund Race (concurrency) --------------------------

  it("Flow M: a refund racing a settlement calculation never loses or duplicates money", async () => {
    const seller = await setupSeller();
    const identifier = `hf14-race-buyer-${unique()}@example.com`;
    const buyerClient = authedRequest(app, await signUp(app, logSpy, identifier));
    const household = await buyerClient.post("/households").send({}).expect(201);
    const category = await prisma.productCategory.create({ data: { name: `HF14 Race Category ${unique()}`, slug: `hf14-race-category-${unique()}` } });
    const product = await prisma.product.create({ data: { categoryId: category.id, title: `HF14 Race Product ${unique()}`, slug: `hf14-race-product-${unique()}`, supportsDog: true, supportsCat: true, allergenTags: [] } });
    const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: `HF14-RACE-SKU-${unique()}` } });
    const offer = await prisma.sellerOffer.create({ data: { sellerOrganizationId: seller.sellerId, productVariantId: variant.id, priceAmount: 3_000_000, currency: "IRR" } });
    await prisma.inventoryItem.create({ data: { sellerOfferId: offer.id, onHand: 10 } });
    const addressRes = await buyerClient.post("/addresses").send({ householdId: household.body.id, addressLine: "1 Test St.", city: "Testville", countryCode: "US" }).expect(201);
    await buyerClient.post("/cart/items").send({ offerId: offer.id, quantity: 1 }).expect(201);
    const checkout = await buyerClient.post("/checkout").send({ addressId: addressRes.body.id }).expect(201);
    await buyerClient.post(`/checkout/${checkout.body.id}/payment-intent`).send({}).expect(201);
    const paid = await buyerClient.post(`/checkout/${checkout.body.id}/pay`).send({ mode: "SUCCESS" }).expect(201);
    const orderId = paid.body.orderIds[0] as string;

    const finance = await setupAdmin(AdminRole.FINANCE);
    const periodStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const periodEnd = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await Promise.allSettled([
      buyerClient.post(`/orders/${orderId}/refunds`).send({}),
      finance.client.post("/admin/settlements/calculate").send({ sellerOrganizationId: seller.sellerId, periodStart, periodEnd }),
    ]);

    // Whichever interleaving happened, the seller's total (unswept + swept-unpaid + paid) must reconcile to exactly the net-of-refund amount — never more, never less.
    const account = await prisma.sellerLedgerAccount.findUnique({ where: { sellerOrganizationId_code: { sellerOrganizationId: seller.sellerId, code: "RECEIVABLE" } } });
    const entries = account ? await prisma.sellerLedgerEntry.findMany({ where: { sellerLedgerAccountId: account.id } }) : [];
    const total = entries.reduce((sum, e) => sum + (e.direction === "DEBIT" ? e.amount : -e.amount), 0);
    expect(total).toBe(0); // sale (+2.7M) fully reversed by refund (-2.7M), regardless of whether the settlement swept it first
  });

  // --- Flow N: Payout Race (concurrency) --------------------------------------

  it("Flow N: two concurrent payout calls on the same settlement only ever post one payment", async () => {
    const seller = await setupSeller();
    await createDirectSaleOrder(seller.sellerId, 2_000_000);
    const finance = await setupAdmin(AdminRole.FINANCE);

    const periodStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const periodEnd = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const calc = await finance.client.post("/admin/settlements/calculate").send({ sellerOrganizationId: seller.sellerId, periodStart, periodEnd }).expect(201);

    const [a, b] = await Promise.all([
      finance.client.post(`/admin/settlements/${calc.body.id}/payout`).send({}),
      finance.client.post(`/admin/settlements/${calc.body.id}/payout`).send({}),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);

    const paymentTxns = await prisma.sellerLedgerTransaction.count({ where: { sellerSettlementId: calc.body.id, referenceType: "SETTLEMENT_PAYMENT" } });
    expect(paymentTxns).toBe(1);
  });

  // --- Flow O: Ledger Balance Invariant ----------------------------------------

  it("Flow O: every SellerLedgerTransaction created by this whole test file balances (sum of debits equals sum of credits)", async () => {
    const transactions = await prisma.sellerLedgerTransaction.findMany({ include: { entries: true } });
    expect(transactions.length).toBeGreaterThan(0);
    for (const txn of transactions) {
      const debit = txn.entries.filter((e) => e.direction === "DEBIT").reduce((sum, e) => sum + e.amount, 0);
      const credit = txn.entries.filter((e) => e.direction === "CREDIT").reduce((sum, e) => sum + e.amount, 0);
      expect(debit).toBe(credit);
    }
  });

  // --- Seller adjustment (spec: "no arbitrary balance editing") ---------------

  it("An admin-created seller adjustment posts a real, unswept ledger transaction, never a direct balance edit", async () => {
    const seller = await setupSeller();
    const finance = await setupAdmin(AdminRole.FINANCE);

    const before = await getSellerBalance(seller.sellerId);
    const created = await finance.client
      .post(`/admin/seller-finance/${seller.sellerId}/adjustments`)
      .send({ sellerOrganizationId: seller.sellerId, type: "CREDIT", reasonCode: "SHIPPING_COMPENSATION", amountIrr: 250_000, reason: "Late courier pickup compensation" })
      .expect(201);
    expect(created.body.type).toBe("CREDIT");

    const after = await getSellerBalance(seller.sellerId);
    expect(after.pendingIrr).toBe(before.pendingIrr + 250_000);

    const txn = await prisma.sellerLedgerTransaction.findFirst({ where: { referenceType: "ADJUSTMENT", referenceId: created.body.id } });
    expect(txn).not.toBeNull();
    expect(txn!.sellerSettlementId).toBeNull();
  });

  it("A settlement resolve-reconciliation action never mutates the underlying financial rows, only the finding itself", async () => {
    const seller = await setupSeller();
    const finance = await setupAdmin(AdminRole.FINANCE);
    const order = await createMarketplaceSaleOrder(seller.client, seller.sellerId, 800_000);

    const now = new Date();
    const statement = await finance.client
      .post("/admin/marketplace-settlements/import")
      .send({
        marketplaceChannelAccountId: order.channelAccountId,
        source: "MANUAL",
        periodStart: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        periodEnd: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        currency: "IRR",
        lines: [{ externalOrderId: order.externalOrderId, amount: 700_000 }],
      })
      .expect(201);

    const reconciliation = await finance.client.get("/admin/marketplace-reconciliation").expect(200);
    const finding = reconciliation.body.find((r: { statementAmount: number }) => r.statementAmount === 700_000);
    expect(finding.status).toBe("MISMATCH");

    const resolved = await finance.client.post(`/admin/marketplace-reconciliation/${finding.id}/resolve`).send({ notes: "Confirmed with marketplace support — statement was correct, internal price was stale." }).expect(201);
    expect(resolved.body.resolvedAt).not.toBeNull();

    // The order's own breakdown is never touched by resolving a reconciliation finding.
    const breakdown = await prisma.orderFinancialBreakdown.findUniqueOrThrow({ where: { orderId: order.orderId } });
    expect(breakdown.grossMerchandiseIrr).toBe(800_000);
    void statement;
  });

  it("An order's REFUNDED refund reference from a support case resolves to a coarse financial summary without leaking bank details", async () => {
    const seller = await setupSeller();
    const identifier = `hf14-support-buyer-${unique()}@example.com`;
    const buyerClient = authedRequest(app, await signUp(app, logSpy, identifier));
    const buyerUser = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });
    const household = await buyerClient.post("/households").send({}).expect(201);
    const category = await prisma.productCategory.create({ data: { name: `HF14 Support Category ${unique()}`, slug: `hf14-support-category-${unique()}` } });
    const product = await prisma.product.create({ data: { categoryId: category.id, title: `HF14 Support Product ${unique()}`, slug: `hf14-support-product-${unique()}`, supportsDog: true, supportsCat: true, allergenTags: [] } });
    const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: `HF14-SUPPORT-SKU-${unique()}` } });
    const offer = await prisma.sellerOffer.create({ data: { sellerOrganizationId: seller.sellerId, productVariantId: variant.id, priceAmount: 600_000, currency: "IRR" } });
    await prisma.inventoryItem.create({ data: { sellerOfferId: offer.id, onHand: 10 } });
    const addressRes = await buyerClient.post("/addresses").send({ householdId: household.body.id, addressLine: "1 Test St.", city: "Testville", countryCode: "US" }).expect(201);
    await buyerClient.post("/cart/items").send({ offerId: offer.id, quantity: 1 }).expect(201);
    const checkout = await buyerClient.post("/checkout").send({ addressId: addressRes.body.id }).expect(201);
    await buyerClient.post(`/checkout/${checkout.body.id}/payment-intent`).send({}).expect(201);
    const paid = await buyerClient.post(`/checkout/${checkout.body.id}/pay`).send({ mode: "SUCCESS" }).expect(201);
    const orderId = paid.body.orderIds[0] as string;
    await buyerClient.post(`/orders/${orderId}/refunds`).send({}).expect(201);
    const refund = await prisma.refund.findFirstOrThrow({ where: { orderId, status: RefundStatus.SUCCEEDED } });

    const support = await setupAdmin(AdminRole.SUPPORT);
    const created = await support.client.post("/admin/support").send({ requesterUserId: buyerUser.id, subject: "Refund question", description: "x", category: "PAYMENT", relatedEntityType: "REFUND", relatedEntityId: refund.id }).expect(201);
    const context = await support.client.get(`/admin/support/${created.body.id}/context`).expect(200);
    expect(context.body.relatedEntity.type).toBe("REFUND");
    expect(context.body.relatedEntity.summary).toContain("SUCCEEDED");
    expect(context.body.relatedEntity.summary).not.toMatch(/IBAN|\*\*\*\*/);
  });
});
