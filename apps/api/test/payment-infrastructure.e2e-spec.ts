import { Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { AdminMembershipStatus, AdminRole, BookingPaymentMode, BookingStatus, LocationMode, PetSpecies, ProviderServiceType, ProviderType, SellerMembershipRole, SellerMembershipStatus, SellerStatus, SellerVerificationStatus, ServiceCategory, WalletBalanceType, WalletCreditSource, WalletEntryKind } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { InventoryReservationService } from "../src/modules/commerce/checkout/inventory-reservation.service";
import { CardTransferPaymentService } from "../src/modules/commerce/payments/card-transfer-payment.service";
import { WalletService } from "../src/modules/commerce/payments/wallet.service";
import { ZibalGateway } from "../src/modules/commerce/payments/zibal.gateway";

// ConfigModule is instantiated only by createTestApp(), after this module is
// evaluated. These values are test-only operational configuration, never
// payment secrets.
process.env.ZIBAL_CALLBACK_URL = "http://localhost:4000/payments/zibal/callback";
process.env.CARD_TRANSFER_ACCOUNT_NUMBER = "6037991234567890";
process.env.CARD_TRANSFER_ACCOUNT_HOLDER = "PET LIFE OS";

interface Cookies { session?: string; csrf?: string; }

function otp(logSpy: jest.SpyInstance, identifier: string): string {
  const call = logSpy.mock.calls.find((args) => typeof args[0] === "string" && args[0].includes("[DEV OTP]") && args[0].includes(identifier));
  const match = call && /code=(\d+)/.exec(call[0] as string);
  if (!match) throw new Error("Expected DEV OTP log entry");
  return match[1]!;
}

describe("P1-a payment infrastructure (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reservations: InventoryReservationService;
  let cardTransfer: CardTransferPaymentService;
  let wallet: WalletService;
  let server: ReturnType<INestApplication["getHttpServer"]>;
  let logSpy: jest.SpyInstance;
  const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    reservations = app.get(InventoryReservationService);
    cardTransfer = app.get(CardTransferPaymentService);
    wallet = app.get(WalletService);
  });
  afterAll(async () => app.close());
  beforeEach(() => { logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined); });
  afterEach(() => logSpy.mockRestore());

  async function session(identifier: string) {
    const primed = await request(server).get("/health/live");
    const csrf = extractCookie(primed.headers["set-cookie"], "petlife_csrf")!;
    await request(server).post("/auth/request-otp").set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf).send({ identifier }).expect(200);
    const verified = await request(server).post("/auth/verify-otp").set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf).send({ identifier, code: otp(logSpy, identifier) }).expect(200);
    return { session: extractCookie(verified.headers["set-cookie"], "petlife_session"), csrf } satisfies Cookies;
  }
  function client(cookies: Cookies) {
    const cookie = `petlife_session=${cookies.session}; petlife_csrf=${cookies.csrf}`;
    return {
      post: (path: string) => request(server).post(path).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
      patch: (path: string) => request(server).patch(path).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
    };
  }

  async function buyer() {
    const email = `payment-buyer-${unique()}@example.com`;
    const c = client(await session(email));
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const household = await c.post("/households").send({}).expect(201);
    const address = await c.post("/addresses").send({ householdId: household.body.id, addressLine: "1 Test Street", city: "Tehran", countryCode: "IR", postalCode: "1234567890" }).expect(201);
    return { c, user, householdId: household.body.id as string, addressId: address.body.id as string };
  }

  async function checkoutFor(b: Awaited<ReturnType<typeof buyer>>, amount = 1_000_000) {
    const sellerUser = await prisma.user.create({ data: { email: `payment-seller-${unique()}@example.com`, displayName: "Seller" } });
    const seller = await prisma.sellerOrganization.create({ data: { name: `Payment seller ${unique()}`, verificationStatus: SellerVerificationStatus.VERIFIED, status: SellerStatus.ACTIVE, countryCode: "IR" } });
    await prisma.sellerMembership.create({ data: { sellerOrganizationId: seller.id, userId: sellerUser.id, role: SellerMembershipRole.OWNER, status: SellerMembershipStatus.ACTIVE, acceptedAt: new Date() } });
    const category = await prisma.productCategory.create({ data: { name: `Payment category ${unique()}`, slug: `payment-category-${unique()}` } });
    const product = await prisma.product.create({ data: { categoryId: category.id, title: "Payment test product", slug: `payment-product-${unique()}`, supportsDog: true, supportsCat: true, allergenTags: [] } });
    const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: `PAY-${unique()}`, title: "One" } });
    const offer = await prisma.sellerOffer.create({ data: { sellerOrganizationId: seller.id, productVariantId: variant.id, priceAmount: amount, currency: "IRR" } });
    await prisma.inventoryItem.create({ data: { sellerOfferId: offer.id, onHand: 1 } });
    await b.c.post("/cart/items").send({ offerId: offer.id, quantity: 1 }).expect(201);
    const checkout = await b.c.post("/checkout").send({ addressId: b.addressId }).expect(201);
    return { checkoutId: checkout.body.id as string, amount, offer };
  }

  async function financeAdmin() {
    const email = `payment-admin-${unique()}@example.com`;
    const c = client(await session(email));
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.adminUser.create({ data: { userId: user.id, role: AdminRole.SUPER_ADMIN, status: AdminMembershipStatus.ACTIVE } });
    return c;
  }

  async function assertLedgerTransactionsBalanced(references: Array<{ referenceType: string; referenceId: string }>) {
    const transactions = await prisma.ledgerTransaction.findMany({ where: { OR: references.map((reference) => ({ referenceType: reference.referenceType, referenceId: reference.referenceId })) }, include: { entries: true } });
    for (const transaction of transactions) {
      const debits = transaction.entries.filter((entry) => entry.direction === "DEBIT").reduce((sum, entry) => sum + entry.amount, 0);
      const credits = transaction.entries.filter((entry) => entry.direction === "CREDIT").reduce((sum, entry) => sum + entry.amount, 0);
      expect({ id: transaction.id, debits, credits }).toEqual(expect.objectContaining({ debits: credits }));
    }
  }

  it("requires Zibal verification before order creation, then confirms exactly once", async () => {
    const b = await buyer();
    const { checkoutId } = await checkoutFor(b);
    const initiated = await b.c.post(`/payments/zibal/checkout/${checkoutId}/initiate`).set("idempotency-key", `zibal-${unique()}`).expect(201);
    expect(await prisma.order.count({ where: { checkoutId } })).toBe(0);
    await b.c.post(`/payments/zibal/verify/${initiated.body.trackId}`).expect(201);
    expect(await prisma.order.count({ where: { checkoutId } })).toBe(1);
    await assertLedgerTransactionsBalanced([{ referenceType: "PAYMENT", referenceId: checkoutId }]);
    const intent = await prisma.paymentIntent.findFirstOrThrow({ where: { checkoutId } });
    const chargeCountBeforeReplay = await prisma.transaction.count({ where: { paymentIntentId: intent.id, type: "CHARGE", status: "SUCCEEDED" } });
    const ledgerCountBeforeReplay = await prisma.ledgerTransaction.count({ where: { referenceType: "PAYMENT", referenceId: checkoutId, description: "Payment captured" } });
    const walletEntryCountBeforeReplay = await prisma.walletEntry.count({ where: { walletAccount: { userId: b.user.id } } });
    jest.spyOn(app.get(ZibalGateway), "verify").mockResolvedValue({ verified: true, trackId: initiated.body.trackId, refNumber: `replay-${unique()}`, amount: 1_000_000, paidAt: new Date(), resultCode: 201, returnedOrderId: intent.id });
    await b.c.post(`/payments/zibal/verify/${initiated.body.trackId}`).expect(201);
    expect(await prisma.order.count({ where: { checkoutId } })).toBe(1);
    expect(await prisma.transaction.count({ where: { paymentIntentId: intent.id, type: "CHARGE", status: "SUCCEEDED" } })).toBe(chargeCountBeforeReplay);
    expect(await prisma.ledgerTransaction.count({ where: { referenceType: "PAYMENT", referenceId: checkoutId, description: "Payment captured" } })).toBe(ledgerCountBeforeReplay);
    expect(await prisma.walletEntry.count({ where: { walletAccount: { userId: b.user.id } } })).toBe(walletEntryCountBeforeReplay);
    const observations = await prisma.zibalVerifyObservation.findMany({ where: { zibalPayment: { paymentIntentId: intent.id } }, orderBy: { observedAt: "asc" } });
    expect(observations).toHaveLength(2);
    expect(observations[1]).toMatchObject({ trackId: initiated.body.trackId, refNumber: expect.stringMatching(/^replay-/), amount: 1_000_000, resultCode: 201, returnedOrderId: intent.id, verified: true });
    await expect(prisma.zibalVerifyObservation.update({ where: { id: observations[1]!.id }, data: { refNumber: "attempted-overwrite" } })).rejects.toThrow(/financial evidence is append-only/);
    expect((await prisma.zibalVerifyObservation.findUniqueOrThrow({ where: { id: observations[1]!.id } })).refNumber).toBe(observations[1]!.refNumber);
    await assertLedgerTransactionsBalanced([{ referenceType: "PAYMENT", referenceId: checkoutId }]);
  });

  it("detects a confirmed duplicate only from distinct settlement references and requires an audited second-admin wallet correction", async () => {
    const b = await buyer();
    const { checkoutId } = await checkoutFor(b, 1_000_000);
    const initiated = await b.c.post(`/payments/zibal/checkout/${checkoutId}/initiate`).set("idempotency-key", `zibal-statement-${unique()}`).expect(201);
    await b.c.post(`/payments/zibal/verify/${initiated.body.trackId}`).expect(201);
    const intent = await prisma.paymentIntent.findFirstOrThrow({ where: { checkoutId } });
    const order = await prisma.order.findFirstOrThrow({ where: { checkoutId } });
    const adminA = await financeAdmin();
    const adminB = await financeAdmin();
    const paidAt = new Date().toISOString();
    const imported = await adminA.post("/admin/finance/reconciliation/zibal-statement").send({ rows: [
      { merchantReference: intent.id, refNumber: `bank-a-${unique()}`, amount: intent.amount, paidAt },
      { merchantReference: intent.id, refNumber: `bank-b-${unique()}`, amount: intent.amount, paidAt },
    ] }).expect(201);
    expect(imported.body.newRows).toBe(2);
    const finding = await prisma.financeReconciliationFinding.findUniqueOrThrow({ where: { check_entityType_entityId: { check: "ZIBAL_DUPLICATE_CAPTURE", entityType: "ZibalDuplicateCapture", entityId: intent.id } } });
    expect(finding).toMatchObject({ outcome: "DUPLICATE", status: "OPEN" });
    expect(finding.detail).toMatchObject({ paymentIntentId: intent.id, orderId: order.id, userId: b.user.id, amount: intent.amount, surplusAmount: intent.amount, statementCaptures: [expect.objectContaining({ refNumber: expect.stringMatching(/^bank-a-/), amount: intent.amount }), expect.objectContaining({ refNumber: expect.stringMatching(/^bank-b-/), amount: intent.amount })] });
    const importedLine = await prisma.zibalSettlementStatementLine.findFirstOrThrow({ where: { merchantReference: intent.id } });
    await expect(prisma.zibalSettlementStatementLine.update({ where: { id: importedLine.id }, data: { refNumber: "attempted-overwrite" } })).rejects.toThrow(/financial evidence is append-only/);

    const approval = await adminA.post(`/admin/finance/reconciliation/findings/${finding.id}/zibal-refund-approval`).send({ reason: "Confirmed by settlement statement", idempotencyKey: `zibal-refund-${unique()}` }).expect(201);
    await adminA.patch(`/admin/transactions/refund-approvals/${approval.body.id}/approve`).expect(409);
    await adminB.patch(`/admin/transactions/refund-approvals/${approval.body.id}/approve`).expect(200);
    const transactionsBeforeExecute = await prisma.transaction.count({ where: { paymentIntentId: intent.id } });
    const settlementsBeforeExecute = await prisma.sellerSettlement.count({ where: { sellerOrganizationId: order.sellerOrganizationId } });
    await adminB.patch(`/admin/transactions/refund-approvals/${approval.body.id}/execute`).expect(200);

    const credit = await prisma.walletEntry.findFirstOrThrow({ where: { walletAccount: { userId: b.user.id }, referenceType: "ZIBAL_DUPLICATE_CAPTURE", referenceId: finding.id } });
    expect(credit).toMatchObject({ balanceType: WalletBalanceType.WITHDRAWABLE, kind: WalletEntryKind.CREDIT, source: WalletCreditSource.REFUND, amount: intent.amount });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: order.status, totalAmount: order.totalAmount });
    expect(await prisma.transaction.count({ where: { paymentIntentId: intent.id } })).toBe(transactionsBeforeExecute);
    expect(await prisma.sellerSettlement.count({ where: { sellerOrganizationId: order.sellerOrganizationId } })).toBe(settlementsBeforeExecute);
    const correctionLedger = await prisma.ledgerTransaction.findFirstOrThrow({ where: { referenceType: "WALLET_CREDIT", referenceId: finding.id }, include: { entries: true } });
    expect(correctionLedger.entries.filter((entry) => entry.direction === "DEBIT").reduce((sum, entry) => sum + entry.amount, 0)).toBe(intent.amount);
    expect(correctionLedger.entries.filter((entry) => entry.direction === "CREDIT").reduce((sum, entry) => sum + entry.amount, 0)).toBe(intent.amount);
    expect(await prisma.adminAuditLog.count({ where: { entityId: approval.body.id, action: { in: ["admin_refund_approval.zibal_duplicate_requested", "admin_refund_approval.approved", "admin_refund_approval.executed"] } } })).toBeGreaterThanOrEqual(3);
    await assertLedgerTransactionsBalanced([{ referenceType: "PAYMENT", referenceId: checkoutId }, { referenceType: "WALLET_CREDIT", referenceId: finding.id }]);
  });

  it("reviews card-to-card receipts and credits a surplus to the withdrawable wallet", async () => {
    const b = await buyer();
    const { checkoutId, amount } = await checkoutFor(b);
    const started = await b.c.post(`/payments/card-transfer/checkout/${checkoutId}`).set("idempotency-key", `c2c-${unique()}`).expect(201);
    const receiptKey = `card-transfer-receipts/${b.user.id}/00000000-0000-4000-8000-000000000001.jpg`;
    await b.c.post(`/payments/card-transfer/${started.body.id}/receipt`).send({ receiptObjectKey: receiptKey }).expect(201);
    await prisma.cardTransferPayment.update({ where: { id: started.body.id }, data: { reviewAvailableAt: new Date(0) } });
    const admin = await financeAdmin();
    await admin.post(`/admin/card-transfer-payments/${started.body.id}/review`).send({ approve: true, receivedAmount: amount + 50_000, reason: "Verified bank receipt" }).expect(201);
    expect(await prisma.order.count({ where: { checkoutId } })).toBe(1);
    const wallet = await prisma.walletAccount.findUniqueOrThrow({ where: { userId: b.user.id }, include: { entries: true } });
    expect(wallet.entries.filter((entry) => entry.source === "OVERPAYMENT").reduce((sum, entry) => sum + entry.amount, 0)).toBe(50_000);
    await assertLedgerTransactionsBalanced([{ referenceType: "CARD_TRANSFER", referenceId: started.body.id }, { referenceType: "WALLET_CREDIT", referenceId: started.body.id }]);
  });

  it("keeps an underpaid receipt pending for its difference window instead of confirming an order", async () => {
    const b = await buyer();
    const { checkoutId, amount } = await checkoutFor(b);
    const started = await b.c.post(`/payments/card-transfer/checkout/${checkoutId}`).set("idempotency-key", `under-${unique()}`).expect(201);
    const receiptKey = `card-transfer-receipts/${b.user.id}/00000000-0000-4000-8000-000000000002.jpg`;
    await b.c.post(`/payments/card-transfer/${started.body.id}/receipt`).send({ receiptObjectKey: receiptKey }).expect(201);
    await prisma.cardTransferPayment.update({ where: { id: started.body.id }, data: { reviewAvailableAt: new Date(0) } });
    const admin = await financeAdmin();
    const reviewed = await admin.post(`/admin/card-transfer-payments/${started.body.id}/review`).send({ approve: true, receivedAmount: amount - 10_000, reason: "Short receipt" }).expect(201);
    expect(reviewed.body.status).toBe("UNDERPAID_AWAITING_DIFFERENCE");
    expect(await prisma.order.count({ where: { checkoutId } })).toBe(0);
    expect(reviewed.body.differenceDueAt).toBeTruthy();
    await prisma.cardTransferPayment.update({ where: { id: started.body.id }, data: { differenceDueAt: new Date(0) } });
    expect(await cardTransfer.expireOverdue(new Date())).toBe(1);
    const refunded = await prisma.walletEntry.findFirstOrThrow({ where: { referenceId: started.body.id, source: "REFUND" } });
    expect(refunded).toMatchObject({ balanceType: "WITHDRAWABLE", amount: amount - 10_000 });
    await assertLedgerTransactionsBalanced([{ referenceType: "CARD_TRANSFER", referenceId: started.body.id }, { referenceType: "WALLET_CREDIT", referenceId: started.body.id }]);
  });

  it("uses one idempotent payment intent, reserves stock only at payment start, and releases it after 15 minutes", async () => {
    const b = await buyer();
    const { checkoutId, offer } = await checkoutFor(b);
    const key = `idem-${unique()}`;
    const first = await b.c.post(`/payments/zibal/checkout/${checkoutId}/initiate`).set("idempotency-key", key).expect(201);
    const retry = await b.c.post(`/payments/zibal/checkout/${checkoutId}/initiate`).set("idempotency-key", key).expect(201);
    expect(first.body.paymentIntentId).toBe(retry.body.paymentIntentId);
    expect(await prisma.paymentIntent.count({ where: { checkoutId } })).toBe(1);
    const beforeExpiry = await prisma.inventoryItem.findUniqueOrThrow({ where: { sellerOfferId: offer.id } });
    expect(beforeExpiry.reserved).toBe(1);
    await prisma.inventoryReservation.updateMany({ where: { checkoutId }, data: { expiresAt: new Date(Date.now() - 1) } });
    expect(await reservations.releaseExpired(new Date())).toBe(1);
    const afterExpiry = await prisma.inventoryItem.findUniqueOrThrow({ where: { sellerOfferId: offer.id } });
    expect(afterExpiry.reserved).toBe(0);
  });

  it("allows only one last-unit payment start under a concurrent race", async () => {
    const firstBuyer = await buyer();
    const firstCheckout = await checkoutFor(firstBuyer);
    const secondBuyer = await buyer();
    await secondBuyer.c.post("/cart/items").send({ offerId: firstCheckout.offer.id, quantity: 1 }).expect(201);
    const secondCheckout = await secondBuyer.c.post("/checkout").send({ addressId: secondBuyer.addressId }).expect(201);
    const results = await Promise.all([
      firstBuyer.c.post(`/payments/zibal/checkout/${firstCheckout.checkoutId}/initiate`).set("idempotency-key", `race-a-${unique()}`),
      secondBuyer.c.post(`/payments/zibal/checkout/${secondCheckout.body.id}/initiate`).set("idempotency-key", `race-b-${unique()}`),
    ]);
    expect(results.filter((result) => result.status === 201)).toHaveLength(1);
    const inventory = await prisma.inventoryItem.findUniqueOrThrow({ where: { sellerOfferId: firstCheckout.offer.id } });
    expect(inventory.reserved).toBe(1);
  });

  it("enforces the 24-hour booking boundary and holds an accepted card-transfer booking", async () => {
    const b = await buyer();
    const pet = await prisma.pet.create({ data: { householdId: b.householdId, name: "Test pet", species: PetSpecies.CAT } });
    const provider = await prisma.providerOrganization.create({ data: { name: `Payment clinic ${unique()}`, type: ProviderType.VET_CLINIC, verificationStatus: "VERIFIED" } });
    const location = await prisma.providerLocation.create({ data: { providerOrganizationId: provider.id, name: "Clinic", addressLine: "1 Clinic St", city: "Tehran", countryCode: "IR", timezone: "Asia/Tehran" } });
    const service = await prisma.providerService.create({ data: { providerOrganizationId: provider.id, locationId: location.id, name: "Visit", type: ProviderServiceType.GENERAL_VET_VISIT, category: ServiceCategory.VET, durationMinutes: 30, priceAmount: 500_000, currency: "IRR", locationMode: LocationMode.AT_PROVIDER, paymentMode: BookingPaymentMode.FULL_PREPAYMENT } });
    const makeBooking = (hours: number) => prisma.booking.create({ data: { householdId: b.householdId, petId: pet.id, userId: b.user.id, providerOrganizationId: provider.id, providerLocationId: location.id, providerServiceId: service.id, category: ServiceCategory.VET, locationMode: LocationMode.AT_PROVIDER, startAt: new Date(Date.now() + hours * 3_600_000), endAt: new Date(Date.now() + (hours * 3_600_000) + 30 * 60_000), timezone: "Asia/Tehran", bookingStatus: BookingStatus.AWAITING_PAYMENT, paymentMode: BookingPaymentMode.FULL_PREPAYMENT, priceAmount: 500_000, currency: "IRR" } });
    const near = await makeBooking(23);
    await expect(cardTransfer.startForBooking(b.user.id, near.id, `near-${unique()}`)).rejects.toMatchObject({ details: expect.objectContaining({ reason: "CARD_TRANSFER_BOOKING_LESS_THAN_24H" }) });
    const far = await makeBooking(25);
    const transfer = await cardTransfer.startForBooking(b.user.id, far.id, `far-${unique()}`);
    expect(transfer.bookingId).toBe(far.id);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: far.id } })).paymentStatus).toBe("PENDING");
  });

  it("derives separate wallet balances, expires gift credit, and has no persisted wallet balance field", async () => {
    const b = await buyer();
    const refundReference = randomUUID();
    const giftReference = randomUUID();
    await wallet.credit({ userId: b.user.id, balanceType: WalletBalanceType.WITHDRAWABLE, amount: 70_000, source: WalletCreditSource.REFUND, referenceType: "TEST_REFUND", referenceId: refundReference });
    await wallet.credit({ userId: b.user.id, balanceType: WalletBalanceType.PURCHASE_ONLY, amount: 30_000, source: WalletCreditSource.GIFT, referenceType: "TEST_GIFT", referenceId: giftReference, expiresAt: new Date(Date.now() + 60_000) });
    expect(await wallet.getBalances(b.user.id)).toEqual({ WITHDRAWABLE: 70_000, PURCHASE_ONLY: 30_000 });
    const gift = await prisma.walletEntry.findFirstOrThrow({ where: { walletAccount: { userId: b.user.id }, source: WalletCreditSource.GIFT } });
    await prisma.walletEntry.update({ where: { id: gift.id }, data: { expiresAt: new Date(0) } });
    expect(await wallet.expireGiftCredits(new Date())).toBe(1);
    expect(await wallet.getBalances(b.user.id)).toEqual({ WITHDRAWABLE: 70_000, PURCHASE_ONLY: 0 });
    expect(readFileSync("prisma/schema.prisma", "utf8")).toMatch(/model WalletAccount \{[\s\S]*?entries WalletEntry\[\]/);
    expect(readFileSync("prisma/schema.prisma", "utf8")).not.toMatch(/model WalletAccount \{[\s\S]*?\n\s*(?:balance|withdrawableBalance|purchaseOnlyBalance)\s+/);
    expect(await prisma.walletEntry.count({ where: { walletAccount: { userId: b.user.id }, kind: WalletEntryKind.EXPIRY } })).toBe(1);
    await assertLedgerTransactionsBalanced([{ referenceType: "WALLET_CREDIT", referenceId: refundReference }, { referenceType: "WALLET_CREDIT", referenceId: giftReference }, { referenceType: "WALLET_EXPIRY", referenceId: gift.id }]);
  });
});
