import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole, LedgerAccountCode, WalletBalanceType, WalletCreditSource } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { WalletService } from "../src/modules/commerce/payments/wallet.service";

type Actor = { id: string; adminUserId?: string; cookie: string; csrf: string };

/** One wallet per account (member / seller org / provider org) and two-person staff transfers between them (FE-16). */
describe("Business wallets and staff wallet transfers", () => {
  let app: INestApplication, db: PrismaService, wallets: WalletService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const post = (a: Actor, u: string) => request(server()).post(u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function actor(name: string, role?: AdminRole): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `bizw-${randomUUID()}@example.com` } });
    const admin = role ? await db.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } }) : null;
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, adminUserId: admin?.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }
  const seller = (name: string, ownerId: string, verified: boolean) =>
    db.sellerOrganization.create({ data: { name, countryCode: "IR", status: "ACTIVE", verificationStatus: verified ? "VERIFIED" : "SUBMITTED", memberships: { create: { userId: ownerId, role: "OWNER", status: "ACTIVE" } } } });
  const balances = async (walletAccountId: string) => wallets.balancesOf(walletAccountId);

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    db = app.get(PrismaService);
    wallets = app.get(WalletService);
  });
  afterAll(async () => app.close());

  it("partners see only the business wallets they manage; a business top-up credits the organisation, not the member", async () => {
    const owner = await actor("Biz owner");
    const stranger = await actor("Stranger");
    const finance = await actor("Finance", AdminRole.FINANCE);
    const shop = await seller(`Biz Shop ${randomUUID().slice(0, 6)}`, owner.id, true);

    const mine = (await get(owner, "/wallet/business").expect(200)).body;
    expect(mine).toEqual([expect.objectContaining({ role: "OWNER", owner: expect.objectContaining({ type: "SELLER", ownerId: shop.id, name: shop.name }), balances: expect.objectContaining({ total: 0 }) })]);
    const accountId: string = mine[0].owner.walletAccountId;
    expect((await get(stranger, "/wallet/business").expect(200)).body).toEqual([]);
    await get(stranger, `/wallet/accounts/${accountId}`).expect(404);
    await post(stranger, `/wallet/accounts/${accountId}/top-ups`).set("Idempotency-Key", randomUUID()).send({ amount: 5_000_000, rail: "CARD_TO_CARD" }).expect(404);
    // A member's own wallet is never reachable as a "business" wallet.
    const ownWallet = await wallets.accountForOwner({ type: "MEMBER", id: owner.id });
    await get(owner, `/wallet/accounts/${ownWallet.id}`).expect(404);
    expect((await get(owner, `/wallet/accounts/${accountId}`).expect(200)).body).toMatchObject({ owner: { type: "SELLER", name: shop.name }, balances: { total: 0 } });

    // Finance credits a business top-up receipt: the organisation's wallet gets it, the member's own wallet does not.
    const topUp = await db.walletTopUp.create({
      data: { userId: owner.id, walletAccountId: accountId, rail: "CARD_TO_CARD", status: "REVIEW_PENDING", amount: 3_000_000, idempotencyKey: randomUUID(), receiptObjectKey: `wallet-top-up-receipts/x/${randomUUID()}.jpg`, receiptUploadedAt: new Date() },
    });
    await post(finance, `/admin/wallet-top-ups/${topUp.id}/review`).send({ approve: true, receivedAmount: 3_000_000 }).expect((r) => expect([200, 201]).toContain(r.status));
    expect((await balances(accountId)).PURCHASE_ONLY).toBe(3_000_000);
    expect((await balances(ownWallet.id)).PURCHASE_ONLY).toBe(0);
    expect((await get(owner, `/wallet/accounts/${accountId}/top-ups`).expect(200)).body).toEqual([expect.objectContaining({ id: topUp.id, status: "CREDITED", walletAccountId: accountId })]);
    expect((await get(owner, "/wallet/top-ups").expect(200)).body.map((t: { id: string }) => t.id)).not.toContain(topUp.id);
    const notice = await db.notification.findFirst({ where: { userId: owner.id, type: "wallet.top_up_credited", entityId: topUp.id } });
    expect(notice?.deepLink).toBe(`/profile/wallet/business/${accountId}`);
  });

  it("transfers take two admins, follow the related / verified rules, post balanced ledger entries and reverse only by a new two-person request", async () => {
    const memberA = await actor("Member A");
    const memberB = await actor("Member B");
    const requester = await actor("Finance requester", AdminRole.FINANCE);
    const approver = await actor("Finance approver", AdminRole.FINANCE);
    const readOnly = await actor("Read only", AdminRole.READ_ONLY);
    const shop = await seller(`Transfer Shop ${randomUUID().slice(0, 6)}`, memberA.id, true);
    const pending = await seller(`Unverified Shop ${randomUUID().slice(0, 6)}`, memberA.id, false);
    const clinic = await db.providerOrganization.create({ data: { name: `Transfer Clinic ${randomUUID().slice(0, 6)}`, type: "VET_CLINIC", verificationStatus: "VERIFIED" } });
    await db.providerUser.create({ data: { userId: memberB.id, providerOrganizationId: clinic.id, role: "OWNER" } });

    const memberWallet = await wallets.accountForOwner({ type: "MEMBER", id: memberA.id });
    await wallets.creditEntry({ userId: memberA.id, balanceType: WalletBalanceType.PURCHASE_ONLY, amount: 1_000_000, source: WalletCreditSource.TOP_UP, referenceType: "TEST", referenceId: randomUUID(), debitAccount: LedgerAccountCode.CUSTOMER_PAYMENT_CLEARING });
    const base = { from: { type: "MEMBER", id: memberA.id }, balanceType: "PURCHASE_ONLY", note: "Owner asked to fund the shop's ads", evidenceReference: "TICKET-1234" };

    await post(readOnly, "/admin/wallet-transfers").send({ ...base, to: { type: "SELLER", id: shop.id }, amount: 300_000, reasonCode: "OWNER_REQUEST" }).expect(403);
    const created = (await post(requester, "/admin/wallet-transfers").set("Idempotency-Key", randomUUID()).send({ ...base, to: { type: "SELLER", id: shop.id }, amount: 300_000, reasonCode: "OWNER_REQUEST" }).expect(201)).body;
    expect(created).toMatchObject({ status: "PENDING", related: true, amount: 300_000, from: { type: "MEMBER" }, to: { type: "SELLER", ownerId: shop.id } });
    expect((await balances(memberWallet.id)).PURCHASE_ONLY).toBe(1_000_000); // nothing moves on request

    expect((await post(requester, `/admin/wallet-transfers/${created.id}/approve`).expect(409)).body.error.code).toBe("WALLET_TRANSFER_SELF_APPROVAL");
    const approved = (await post(approver, `/admin/wallet-transfers/${created.id}/approve`).expect(201)).body;
    expect(approved).toMatchObject({ status: "APPROVED", decidedBy: { adminUserId: approver.adminUserId } });
    await post(approver, `/admin/wallet-transfers/${created.id}/approve`).expect(409);
    const shopWallet = approved.to.walletAccountId as string;
    expect((await balances(memberWallet.id)).PURCHASE_ONLY).toBe(700_000);
    expect((await balances(shopWallet)).PURCHASE_ONLY).toBe(300_000);

    // Two balanced ledger transactions; the clearing account nets to zero.
    const ledger = await db.ledgerTransaction.findMany({ where: { referenceType: "WALLET_TRANSFER", referenceId: created.id }, include: { entries: { include: { ledgerAccount: true } } } });
    expect(ledger).toHaveLength(2);
    for (const tx of ledger) {
      const sum = (d: string) => tx.entries.filter((e) => e.direction === d).reduce((n, e) => n + e.amount, 0);
      expect(sum("DEBIT")).toBe(sum("CREDIT"));
    }
    const clearing = ledger.flatMap((t) => t.entries).filter((e) => e.ledgerAccount.code === "WALLET_TRANSFER_CLEARING");
    expect(clearing.reduce((n, e) => n + (e.direction === "DEBIT" ? e.amount : -e.amount), 0)).toBe(0);
    expect(await db.notification.count({ where: { userId: memberA.id, entityId: created.id, type: { in: ["wallet.transfer_in", "wallet.transfer_out"] } } })).toBe(2);
    expect(await db.adminAuditLog.count({ where: { entityId: created.id, action: { in: ["wallet_transfer.requested", "wallet_transfer.approved"] } } })).toBe(2);

    // Unrelated wallets need a restricted reason code; an unverified organisation only receives refunds.
    const unrelated = { ...base, to: { type: "PROVIDER", id: clinic.id }, amount: 100_000 };
    expect((await post(requester, "/admin/wallet-transfers").send({ ...unrelated, reasonCode: "OWNER_REQUEST" }).expect(400)).body.error.details).toMatchObject({ reason: "UNRELATED_WALLETS" });
    const legal = (await post(requester, "/admin/wallet-transfers").send({ ...unrelated, reasonCode: "LEGAL_ORDER" }).expect(201)).body;
    expect(legal).toMatchObject({ related: false, status: "PENDING" });
    expect((await post(requester, "/admin/wallet-transfers").send({ ...base, to: { type: "SELLER", id: pending.id }, amount: 100_000, reasonCode: "OWNER_REQUEST" }).expect(400)).body.error.details).toMatchObject({ reason: "DESTINATION_NOT_VERIFIED" });
    await post(requester, "/admin/wallet-transfers").send({ ...base, to: { type: "SELLER", id: pending.id }, amount: 100_000, reasonCode: "REFUND" }).expect(201);
    expect((await post(requester, "/admin/wallet-transfers").send({ ...base, to: { type: "SELLER", id: shop.id }, amount: 900_000, reasonCode: "OWNER_REQUEST" }).expect(400)).body.error.details).toMatchObject({ reason: "INSUFFICIENT_WALLET_BALANCE", available: 700_000 });
    await post(requester, "/admin/wallet-transfers").send({ ...base, to: { type: "MEMBER", id: memberA.id }, amount: 1_000, reasonCode: "OWNER_REQUEST" }).expect(400);

    // Rejecting posts nothing.
    expect((await post(approver, `/admin/wallet-transfers/${legal.id}/reject`).send({ reason: "No court order attached" }).expect(201)).body).toMatchObject({ status: "REJECTED" });
    await post(approver, `/admin/wallet-transfers/${legal.id}/approve`).expect(409);

    // A reversal is a new pending request the other way; one live reversal per transfer; a reversal is not reversible.
    const reversal = (await post(requester, `/admin/wallet-transfers/${created.id}/reverse`).send({ note: "Shop asked to move it back", evidenceReference: "TICKET-1240" }).expect(201)).body;
    expect(reversal).toMatchObject({ status: "PENDING", reasonCode: "REVERSAL", reversesTransferId: created.id, from: { walletAccountId: shopWallet }, to: { walletAccountId: memberWallet.id } });
    expect((await post(approver, `/admin/wallet-transfers/${created.id}/reverse`).send({ note: "Second try at reversing", evidenceReference: "TICKET-1241" }).expect(400)).body.error.details).toMatchObject({ reason: "ALREADY_REVERSED" });
    await post(approver, `/admin/wallet-transfers/${reversal.id}/approve`).expect(201);
    expect((await balances(memberWallet.id)).PURCHASE_ONLY).toBe(1_000_000);
    expect((await balances(shopWallet)).PURCHASE_ONLY).toBe(0);
    expect((await post(requester, `/admin/wallet-transfers/${reversal.id}/reverse`).send({ note: "Reverse the reversal", evidenceReference: "TICKET-1250" }).expect(400)).body.error.details).toMatchObject({ reason: "CANNOT_REVERSE_A_REVERSAL" });
    expect((await get(readOnly, `/admin/wallet-transfers/${created.id}`).expect(200)).body).toMatchObject({ reversalId: reversal.id });

    // The member sees the transfer in their own history as a TRANSFER with its reason code.
    const history = (await get(memberA, "/wallet/entries").expect(200)).body.items;
    expect(history.filter((e: { purpose: string }) => e.purpose === "TRANSFER").map((e: { signedAmount: number }) => e.signedAmount).sort()).toEqual([-300_000, 300_000]);

    // Admin wallet listing finds organisations by name with their balances.
    const listed = (await get(readOnly, `/admin/wallet-accounts?type=SELLER&q=${encodeURIComponent(shop.name)}`).expect(200)).body;
    expect(listed.items).toEqual([expect.objectContaining({ owner: expect.objectContaining({ ownerId: shop.id }), balances: expect.objectContaining({ total: 0 }) })]);
    const detail = (await get(readOnly, `/admin/wallet-accounts/${shopWallet}`).expect(200)).body;
    expect(detail.transfers.map((t: { id: string }) => t.id)).toEqual(expect.arrayContaining([created.id, reversal.id]));
  });
});
