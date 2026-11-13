import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole, LedgerAccountCode, WalletBalanceType, WalletCreditSource } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { WalletService } from "../src/modules/commerce/payments/wallet.service";
import { SponsoredService } from "../src/modules/sponsored/sponsored.service";

type Actor = { id: string; adminUserId?: string; cookie: string; csrf: string };
const BROWSER = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/** Sponsored listings: flat price per click from the business wallet, P-01 filters, budgets, staff refunds and holds. */
describe("Sponsored listings (CPC)", () => {
  let app: INestApplication, db: PrismaService, wallets: WalletService, sponsored: SponsoredService;
  const server = () => app.getHttpServer();
  const get = (a: Actor | null, u: string) => (a ? request(server()).get(u).set("Cookie", a.cookie) : request(server()).get(u));
  const post = (a: Actor, u: string) => request(server()).post(u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);
  const click = (campaignId: string, ip: string, who: Actor | null = null, ua = BROWSER) => get(who, `/sponsored/c/${campaignId}?l=en`).set("User-Agent", ua).set("X-Forwarded-For", ip);

  async function actor(name: string, role?: AdminRole): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `spon-${randomUUID()}@example.com` } });
    const admin = role ? await db.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } }) : null;
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, adminUserId: admin?.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }
  const outcomes = async (campaignId: string) => (await db.sponsoredClick.findMany({ where: { campaignId }, orderBy: { clickedAt: "asc" } })).map((c) => c.outcome);

  beforeAll(async () => {
    app = await createTestApp();
    // The site sits behind nginx on loopback; trust it here too so each request can carry its own client IP.
    (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set("trust proxy", "loopback");
    await app.listen(0);
    db = app.get(PrismaService);
    wallets = app.get(WalletService);
    sponsored = app.get(SponsoredService);
  });
  afterAll(async () => app.close());

  it("bills one flat-priced click per viewer and IP per day from the business wallet, never self/staff/bots, and staff can refund, hold and reprice", async () => {
    const tag = randomUUID().slice(0, 8);
    const owner = await actor("Shop owner");
    const stranger = await actor("Stranger");
    const shopper = await actor("Shopper");
    const staff = await actor("Commerce ops", AdminRole.ADMIN);
    const finance = await actor("Finance", AdminRole.FINANCE);
    const superAdmin = await actor("Super", AdminRole.SUPER_ADMIN);
    const category = await db.productCategory.create({ data: { name: `Treats ${tag}`, slug: `treats-${tag}` } });
    const product = await db.product.create({ data: { categoryId: category.id, title: `Sponsored Treat ${tag}`, slug: `treat-${tag}`, allergenTags: [], status: "ACTIVE", supportsDog: true, supportsCat: false } });
    const variant = await db.productVariant.create({ data: { productId: product.id, sku: `trt-${tag}`, title: "200 g" } });
    const shop = await db.sellerOrganization.create({ data: { name: `Ad Shop ${tag}`, countryCode: "IR", verificationStatus: "VERIFIED", status: "ACTIVE", memberships: { create: { userId: owner.id, role: "OWNER", status: "ACTIVE" } } } });
    await db.sellerOffer.create({ data: { sellerOrganizationId: shop.id, productVariantId: variant.id, priceAmount: 450_000, status: "ACTIVE", moderationStatus: "APPROVED" } });
    const account = await wallets.accountForOwner({ type: "SELLER", id: shop.id });
    await wallets.creditEntry({ walletAccountId: account.id, balanceType: WalletBalanceType.PURCHASE_ONLY, amount: 100_000, source: WalletCreditSource.TOP_UP, referenceType: "TEST", referenceId: randomUUID(), debitAccount: LedgerAccountCode.CUSTOMER_PAYMENT_CLEARING });
    const balance = async () => (await wallets.balancesOf(account.id)).PURCHASE_ONLY;

    // Partner side: only the wallet's managers; the price is the flat default (2,000 toman).
    await get(stranger, `/wallet/accounts/${account.id}/sponsored`).expect(404);
    const overview = (await get(owner, `/wallet/accounts/${account.id}/sponsored`).expect(200)).body;
    expect(overview).toMatchObject({ enabled: true, verified: true, rate: { currentIrr: 20_000 }, campaigns: [] });
    expect((await get(owner, `/wallet/accounts/${account.id}/sponsored/targets`).expect(200)).body).toEqual([expect.objectContaining({ placement: "SHOP", id: product.id, live: false })]);
    await post(owner, `/wallet/accounts/${account.id}/sponsored`).send({ placement: "SHOP", productId: product.id, dailyBudgetIrr: 10_000, maxCpcIrr: 20_000 }).expect(400);
    const campaign = (await post(owner, `/wallet/accounts/${account.id}/sponsored`).send({ placement: "SHOP", productId: product.id, dailyBudgetIrr: 40_000, maxCpcIrr: 25_000 }).expect(201)).body;
    expect(campaign).toMatchObject({ status: "ACTIVE", serving: true, target: { kind: "PRODUCT", id: product.id } });
    await post(owner, `/wallet/accounts/${account.id}/sponsored`).send({ placement: "SHOP", productId: product.id, dailyBudgetIrr: 40_000, maxCpcIrr: 25_000 }).expect(400);

    // Serving: the slot uses only the list's own context.
    sponsored.clearCache();
    expect((await get(null, `/sponsored/slots?placement=SHOP&category=${category.id}`).expect(200)).body).toEqual([expect.objectContaining({ campaignId: campaign.id, kind: "PRODUCT", title: product.title, subtitle: shop.name, priceIrr: 450_000, clickPath: `/sponsored/c/${campaign.id}` })]);
    expect((await get(null, `/sponsored/slots?placement=SHOP&species=CAT&category=${category.id}`).expect(200)).body).toEqual([]);

    // Clicks: the first real click pays; a repeat from the same IP or the same account that day does not.
    const first = await click(campaign.id, "203.0.113.10").expect(302);
    expect(first.headers.location).toMatch(new RegExp(`/en/shop/products/${product.id}$`));
    expect(await balance()).toBe(80_000);
    await click(campaign.id, "203.0.113.10").expect(302); // same IP
    await click(campaign.id, "203.0.113.11", null, "curl/8.4.0").expect(302); // bot
    await click(campaign.id, "203.0.113.12", owner).expect(302); // the partner's own team
    await click(campaign.id, "203.0.113.13", staff).expect(302); // staff
    await click(campaign.id, "203.0.113.14", shopper).expect(302); // a second real visitor pays
    await click(campaign.id, "203.0.113.15", shopper).expect(302); // same account, another IP: not again
    expect(await balance()).toBe(60_000);
    await click(campaign.id, "203.0.113.16").expect(302); // a third would pass the 40,000 daily budget
    expect(await balance()).toBe(60_000);
    expect(await outcomes(campaign.id)).toEqual(["BILLED", "DUPLICATE", "BOT", "SELF", "STAFF", "BILLED", "DUPLICATE", "OVER_BUDGET"]);
    sponsored.clearCache();
    expect((await get(null, "/sponsored/slots?placement=SHOP").expect(200)).body.map((s: { campaignId: string }) => s.campaignId)).not.toContain(campaign.id);

    // Each billed click is one balanced ledger transaction: wallet liability → CPC revenue.
    const billed = await db.sponsoredClick.findMany({ where: { campaignId: campaign.id, outcome: "BILLED" } });
    const ledger = await db.ledgerTransaction.findMany({ where: { referenceType: "SPONSORED_CLICK", referenceId: { in: billed.map((c) => c.id) } }, include: { entries: { include: { ledgerAccount: true } } } });
    expect(ledger).toHaveLength(2);
    for (const tx of ledger) expect(tx.entries.map((e) => `${e.direction}:${e.ledgerAccount.code}:${e.amount}`).sort()).toEqual(["CREDIT:CPC_REVENUE:20000", "DEBIT:WALLET_PURCHASE_LIABILITY:20000"]);
    expect(billed.every((c) => c.ipHash && !c.ipHash.includes("203.0.113"))).toBe(true);

    // Staff: refunding money needs wallet.adjust; a click is credited back once.
    await post(staff, "/admin/sponsored/clicks/refund").send({ clickIds: [billed[0]!.id], reason: "Competitor click farm" }).expect(403);
    expect((await post(finance, "/admin/sponsored/clicks/refund").send({ clickIds: [billed[0]!.id], reason: "Competitor click farm" }).expect(201)).body).toEqual({ refunded: 1, amountIrr: 20_000 });
    expect(await balance()).toBe(80_000);
    await post(finance, "/admin/sponsored/clicks/refund").send({ clickIds: [billed[0]!.id], reason: "Competitor click farm" }).expect(400);
    const detail = (await get(staff, `/admin/sponsored/campaigns/${campaign.id}`).expect(200)).body;
    expect(detail.campaign).toMatchObject({ owner: { type: "SELLER", ownerId: shop.id }, total: { spentIrr: 40_000, billedClicks: 2, refundedIrr: 20_000 } });
    expect(detail.clicks.find((c: { id: string }) => c.id === billed[0]!.id)).toMatchObject({ invalidReason: "Competitor click farm" });

    // A staff hold stops serving and billing until released, whatever the partner does.
    await post(staff, `/admin/sponsored/campaigns/${campaign.id}/hold`).send({ reason: "Misleading product title" }).expect(201);
    await post(owner, `/wallet/accounts/${account.id}/sponsored/${campaign.id}/resume`).expect(201);
    expect((await get(owner, `/wallet/accounts/${account.id}/sponsored`).expect(200)).body.campaigns[0]).toMatchObject({ serving: false, notServingReason: "STAFF_HOLD", staffHoldReason: "Misleading product title" });
    await post(staff, `/admin/sponsored/campaigns/${campaign.id}/release`).expect(201);

    // A new flat price above the partner's ceiling: the campaign simply stops being shown (never charged more).
    await post(finance, "/admin/sponsored/rate").send({ rateIrr: 30_000, reason: "New price list" }).expect(403); // needs settings.manage
    const rate = (await post(staff, "/admin/sponsored/rate").send({ rateIrr: 30_000, reason: "New price list" }).expect(201)).body;
    expect(rate).toMatchObject({ currentIrr: 30_000, history: [expect.objectContaining({ rateIrr: 30_000, reason: "New price list" })] });
    expect((await get(owner, `/wallet/accounts/${account.id}/sponsored`).expect(200)).body.campaigns[0]).toMatchObject({ serving: false, notServingReason: "ABOVE_CEILING" });
    await click(campaign.id, "203.0.113.30").expect(302);
    expect((await outcomes(campaign.id)).at(-1)).toBe("ABOVE_CEILING");
    expect(await balance()).toBe(80_000);
    await post(superAdmin, "/admin/sponsored/rate").send({ rateIrr: 20_000, reason: "Back to the launch price" }).expect(201);

    // The partner stops it for good; personal data on clicks is erased after 90 days.
    expect((await post(owner, `/wallet/accounts/${account.id}/sponsored/${campaign.id}/stop`).expect(201)).body).toMatchObject({ status: "STOPPED" });
    await post(owner, `/wallet/accounts/${account.id}/sponsored/${campaign.id}/resume`).expect(400);
    await sponsored.erasePersonalData(new Date(Date.now() + 91 * 24 * 60 * 60 * 1000));
    expect(await db.sponsoredClick.count({ where: { campaignId: campaign.id, OR: [{ ipHash: { not: null } }, { viewerUserId: { not: null } }] } })).toBe(0);
    expect(await db.sponsoredClick.count({ where: { campaignId: campaign.id, outcome: "BILLED" } })).toBe(2);
    await get(null, `/sponsored/c/${randomUUID()}`).expect(404);
  });
});
