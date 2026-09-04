import { hashPassword } from "../src/common/password/password-hash.util";
import {
  AdminMembershipStatus,
  AdminRole,
  DeliveryResponsibility,
  DietType,
  FinancialConfidence,
  HealthAreaKnowledgeState,
  HouseholdRole,
  InternalNoteEntityType,
  LedgerEntryDirection,
  LocationMode,
  MarketplaceChannelAccountStatus,
  MarketplaceOrderStatus,
  MarketplaceProvider,
  MarketplaceReconciliationStatus,
  MarketplaceSettlementImportSource,
  OrderOrigin,
  OrderStatus,
  PaymentSourceType,
  PetSpecies,
  Prisma,
  PrismaClient,
  ProviderServiceType,
  ProviderType,
  ProviderUserRole,
  ProviderVerificationStatus,
  RefundStatus,
  SellerLedgerAccountCode,
  SellerSettlementStatus,
  SellerStatus,
  SellerVerificationStatus,
  ServiceCategory,
  SetupStatus,
  SubscriptionBillingInterval,
  SubscriptionEntitlementType,
  SubscriptionPlanPriceStatus,
  SupportCaseCategory,
  SupportMessageAuthorType,
  SupportMessageVisibility,
  VaccinationStatus,
} from "@prisma/client";
import { DEFAULT_FREE_PLAN_CODE } from "../src/modules/subscriptions/subscription-plan-read.service";

const prisma = new PrismaClient();

/**
 * Deterministic DEV catalog (Handoff 16 spec: "seed deterministic DEV
 * FREE/PLUS/PREMIUM plans... fa/en display strings... dev/test-obviously-
 * fake IRR monthly/annual prices"). Written as upserts, unlike most of this
 * file's create-only fixtures, so re-running `db:seed` never fails on a
 * unique-code conflict and always converges the same three plans — the
 * FREE plan specifically reuses `DEFAULT_FREE_PLAN_CODE`, the exact code
 * `SubscriptionPlanReadService.getFreePlanRaw()`'s own self-healing
 * fallback creates when no plan is seeded yet, so seeding after that
 * fallback has already run *upgrades* the same row in place (richer fa/en
 * copy, the product's real limits) instead of creating a second FREE plan.
 * Amounts are placeholder IRR figures for local development only — nowhere
 * close to a real price, and obviously so.
 */
async function seedSubscriptions() {
  const countryCode = "IR";

  async function upsertPlan(input: {
    code: string;
    nameFa: string;
    nameEn: string;
    descriptionFa?: string;
    descriptionEn?: string;
    isFree: boolean;
    sortOrder: number;
    trialDays?: number;
    entitlements: { key: string; type: SubscriptionEntitlementType; boolValue?: boolean; limitValue?: number | null }[];
  }) {
    const plan = await prisma.subscriptionPlan.upsert({
      where: { code: input.code },
      update: {
        nameFa: input.nameFa,
        nameEn: input.nameEn,
        descriptionFa: input.descriptionFa,
        descriptionEn: input.descriptionEn,
        isFree: input.isFree,
        sortOrder: input.sortOrder,
        trialDays: input.trialDays,
      },
      create: {
        code: input.code,
        nameFa: input.nameFa,
        nameEn: input.nameEn,
        descriptionFa: input.descriptionFa,
        descriptionEn: input.descriptionEn,
        isFree: input.isFree,
        sortOrder: input.sortOrder,
        trialDays: input.trialDays,
      },
    });
    await prisma.subscriptionPlanCountry.upsert({
      where: { planId_countryCode: { planId: plan.id, countryCode } },
      update: {},
      create: { planId: plan.id, countryCode },
    });
    for (const entitlement of input.entitlements) {
      await prisma.subscriptionPlanEntitlement.upsert({
        where: { planId_key: { planId: plan.id, key: entitlement.key } },
        update: { type: entitlement.type, boolValue: entitlement.boolValue ?? null, limitValue: entitlement.limitValue ?? null },
        create: { planId: plan.id, key: entitlement.key, type: entitlement.type, boolValue: entitlement.boolValue ?? null, limitValue: entitlement.limitValue ?? null },
      });
    }
    return plan;
  }

  /** Idempotent: only creates a new ACTIVE price if this exact (plan, country, interval) has none yet — never duplicates one on re-seed. */
  async function ensurePrice(planId: string, billingInterval: SubscriptionBillingInterval, amount: number) {
    const existing = await prisma.subscriptionPlanPrice.findFirst({ where: { planId, countryCode, billingInterval, status: SubscriptionPlanPriceStatus.ACTIVE } });
    if (existing) return existing;
    return prisma.subscriptionPlanPrice.create({ data: { planId, countryCode, billingInterval, amount } });
  }

  const free = await upsertPlan({
    code: DEFAULT_FREE_PLAN_CODE,
    nameFa: "رایگان",
    nameEn: "Free",
    descriptionFa: "شروع رایگان برای هر خانواده — همیشه رایگان.",
    descriptionEn: "Every household's starting plan — free forever.",
    isFree: true,
    sortOrder: 0,
    entitlements: [
      { key: "pets.max", type: SubscriptionEntitlementType.LIMIT, limitValue: 2 },
      { key: "household.members.max", type: SubscriptionEntitlementType.LIMIT, limitValue: 3 },
      { key: "premium.support", type: SubscriptionEntitlementType.BOOLEAN, boolValue: false },
      { key: "health.documents.max", type: SubscriptionEntitlementType.LIMIT, limitValue: 10 },
      { key: "health.observations.max", type: SubscriptionEntitlementType.LIMIT, limitValue: 20 },
    ],
  });

  const plus = await upsertPlan({
    code: "plus",
    nameFa: "پلاس",
    nameEn: "Plus",
    descriptionFa: "فضای بیشتر برای خانواده‌های چندحیوانی.",
    descriptionEn: "More room for multi-pet households.",
    isFree: false,
    sortOrder: 1,
    trialDays: 14,
    entitlements: [
      { key: "pets.max", type: SubscriptionEntitlementType.LIMIT, limitValue: 5 },
      { key: "household.members.max", type: SubscriptionEntitlementType.LIMIT, limitValue: 6 },
      { key: "premium.support", type: SubscriptionEntitlementType.BOOLEAN, boolValue: true },
      { key: "health.documents.max", type: SubscriptionEntitlementType.LIMIT, limitValue: 50 },
      { key: "health.observations.max", type: SubscriptionEntitlementType.LIMIT, limitValue: 100 },
    ],
  });
  await ensurePrice(plus.id, SubscriptionBillingInterval.MONTHLY, 990_000);
  await ensurePrice(plus.id, SubscriptionBillingInterval.ANNUAL, 9_900_000);

  const premium = await upsertPlan({
    code: "premium",
    nameFa: "پرمیوم",
    nameEn: "Premium",
    descriptionFa: "بدون محدودیت تعداد حیوان یا عضو خانواده.",
    descriptionEn: "No limit on pets or household members.",
    isFree: false,
    sortOrder: 2,
    trialDays: 14,
    entitlements: [
      { key: "pets.max", type: SubscriptionEntitlementType.LIMIT, limitValue: null },
      { key: "household.members.max", type: SubscriptionEntitlementType.LIMIT, limitValue: null },
      { key: "premium.support", type: SubscriptionEntitlementType.BOOLEAN, boolValue: true },
      { key: "health.documents.max", type: SubscriptionEntitlementType.LIMIT, limitValue: null },
      { key: "health.observations.max", type: SubscriptionEntitlementType.LIMIT, limitValue: null },
    ],
  });
  await ensurePrice(premium.id, SubscriptionBillingInterval.MONTHLY, 1_990_000);
  await ensurePrice(premium.id, SubscriptionBillingInterval.ANNUAL, 19_900_000);

  console.log(`Seeded subscription plans: free=${free.id} plus=${plus.id} premium=${premium.id}`);
  return { free, plus, premium };
}

/**
 * Commerce Core fixtures (Handoff 06): two VERIFIED+ACTIVE sellers so every
 * variant with more than one offer proves the multi-seller cart/order split,
 * one seller still under review (never purchasable, proving the
 * verification gate), a Food product that only supports dogs and only
 * adults with a CHICKEN allergen tag (a real POTENTIAL_SAFETY_CONFLICT/
 * SPECIES_MISMATCH fixture once a test pet's own allergy or species is
 * checked against it), a kitten-only Food product (a real AGE_TOO_OLD/
 * NOT_RECOMMENDED fixture against Milo, who is already 18 months old), an
 * unrestricted Treats product (LIKELY_COMPATIBLE — nothing to actively
 * confirm), a Grooming product that requires a completed Health Basics
 * review (NEEDS_REVIEW until then), and an Accessories product old enough
 * for both Luna and Milo to be a genuine, actively-confirmed COMPATIBLE
 * example.
 */
async function seedCommerce() {
  const [royalCanin, petLifeBasics] = await Promise.all([
    prisma.brand.create({ data: { name: "Royal Canin", slug: "royal-canin" } }),
    prisma.brand.create({ data: { name: "PetLife Basics", slug: "petlife-basics" } }),
  ]);

  const [foodCategory, treatsCategory, groomingCategory, accessoriesCategory] = await Promise.all([
    prisma.productCategory.create({ data: { name: "Food", slug: "food" } }),
    prisma.productCategory.create({ data: { name: "Treats", slug: "treats" } }),
    prisma.productCategory.create({ data: { name: "Grooming", slug: "grooming" } }),
    prisma.productCategory.create({ data: { name: "Accessories", slug: "accessories" } }),
  ]);

  const [petBazaar, golestan, underReviewSeller] = await Promise.all([
    prisma.sellerOrganization.create({ data: { name: "Pet Bazaar Tehran", verificationStatus: SellerVerificationStatus.VERIFIED, status: SellerStatus.ACTIVE, countryCode: "IR", city: "Tehran" } }),
    prisma.sellerOrganization.create({ data: { name: "Golestan Pet Supplies", verificationStatus: SellerVerificationStatus.VERIFIED, status: SellerStatus.ACTIVE, countryCode: "IR", city: "Tehran" } }),
    prisma.sellerOrganization.create({ data: { name: "New Pet Shop (Under Review)", verificationStatus: SellerVerificationStatus.SUBMITTED, status: SellerStatus.ACTIVE, countryCode: "IR", city: "Tehran" } }),
  ]);

  const adultDogFood = await prisma.product.create({
    data: {
      brandId: royalCanin.id,
      categoryId: foodCategory.id,
      title: "Royal Canin Adult Dog Food",
      slug: "royal-canin-adult-dog-food",
      description: "Complete dry food for adult dogs.",
      supportsDog: true,
      supportsCat: false,
      minAgeMonths: 12,
      allergenTags: ["CHICKEN"],
      variants: {
        create: [
          { sku: "RC-ADULT-DOG-2KG", title: "2kg", weightValue: 2, weightUnit: "KG" },
          { sku: "RC-ADULT-DOG-5KG", title: "5kg", weightValue: 5, weightUnit: "KG" },
        ],
      },
    },
    include: { variants: true },
  });

  const kittenFood = await prisma.product.create({
    data: {
      brandId: royalCanin.id,
      categoryId: foodCategory.id,
      title: "Royal Canin Kitten Food",
      slug: "royal-canin-kitten-food",
      description: "Complete dry food for kittens up to 12 months.",
      supportsDog: false,
      supportsCat: true,
      maxAgeMonths: 12,
      variants: { create: [{ sku: "RC-KITTEN-CAT-2KG", title: "2kg", weightValue: 2, weightUnit: "KG" }] },
    },
    include: { variants: true },
  });

  const trainingTreats = await prisma.product.create({
    data: {
      brandId: petLifeBasics.id,
      categoryId: treatsCategory.id,
      title: "Grain-Free Training Treats",
      slug: "grain-free-training-treats",
      description: "Small, soft training treats for dogs and cats.",
      variants: { create: [{ sku: "PLB-TREATS-200G", title: "200g", weightValue: 0.2, weightUnit: "KG" }] },
    },
    include: { variants: true },
  });

  const groomingWipes = await prisma.product.create({
    data: {
      brandId: petLifeBasics.id,
      categoryId: groomingCategory.id,
      title: "Calming Grooming Wipes",
      slug: "calming-grooming-wipes",
      description: "Fragrance-light wipes for sensitive skin.",
      requiresHealthReview: true,
      variants: { create: [{ sku: "PLB-WIPES-30", title: "Pack of 30" }] },
    },
    include: { variants: true },
  });

  const travelCarrier = await prisma.product.create({
    data: {
      brandId: petLifeBasics.id,
      categoryId: accessoriesCategory.id,
      title: "Soft-Sided Travel Carrier",
      slug: "soft-sided-travel-carrier",
      description: "Ventilated carrier for car rides and vet visits.",
      minAgeMonths: 3,
      variants: { create: [{ sku: "PLB-CARRIER-M", title: "Medium" }] },
    },
    include: { variants: true },
  });

  async function createOffer(sellerId: string, variantId: string, priceAmount: number, onHand: number) {
    const offer = await prisma.sellerOffer.create({ data: { sellerOrganizationId: sellerId, productVariantId: variantId, priceAmount, currency: "IRR" } });
    await prisma.inventoryItem.create({ data: { sellerOfferId: offer.id, onHand } });
    return offer;
  }

  await Promise.all([
    createOffer(petBazaar.id, adultDogFood.variants[0]!.id, 1_200_000, 50),
    createOffer(golestan.id, adultDogFood.variants[0]!.id, 1_150_000, 30),
    createOffer(petBazaar.id, adultDogFood.variants[1]!.id, 2_800_000, 20),
    createOffer(golestan.id, kittenFood.variants[0]!.id, 1_100_000, 25),
    createOffer(petBazaar.id, trainingTreats.variants[0]!.id, 180_000, 100),
    createOffer(golestan.id, groomingWipes.variants[0]!.id, 220_000, 40),
    createOffer(petBazaar.id, travelCarrier.variants[0]!.id, 3_500_000, 15),
    createOffer(golestan.id, travelCarrier.variants[0]!.id, 3_650_000, 10),
    // Never discoverable — the seller is still under review.
    createOffer(underReviewSeller.id, trainingTreats.variants[0]!.id, 150_000, 20),
  ]);

  console.log(`Seeded commerce: sellers=[${petBazaar.id}, ${golestan.id}] products=[${adultDogFood.id}, ${kittenFood.id}, ${trainingTreats.id}, ${groomingWipes.id}, ${travelCarrier.id}]`);
  return { petBazaar, golestan };
}

/**
 * Handoff 04: one verified provider per non-vet ServiceCategory, each with a
 * single service and open-ended weekly availability (same "always bookable
 * today or tomorrow" rationale as the Tehran Pet Care Clinic seed above).
 * Sitting/Boarding are booked as a date range rather than a picked slot (see
 * BookingsService), so their availability rule/durationMinutes only feed the
 * discovery "next available" preview, never the actual booked range.
 */
async function seedServiceProvider(opts: {
  orgName: string;
  orgType: ProviderType;
  staffEmail: string;
  staffName: string;
  serviceName: string;
  serviceType: ProviderServiceType;
  category: ServiceCategory;
  durationMinutes: number;
  priceAmount: number;
  locationMode: LocationMode;
  requiresCareProfile?: boolean;
  supportsCat?: boolean;
}) {
  const staffUser = await prisma.user.upsert({
    where: { email: opts.staffEmail },
    update: {},
    create: { email: opts.staffEmail, displayName: opts.staffName, locale: "en" },
  });

  const organization = await prisma.providerOrganization.create({
    data: { name: opts.orgName, type: opts.orgType, verificationStatus: ProviderVerificationStatus.VERIFIED },
  });

  const location = await prisma.providerLocation.create({
    data: {
      providerOrganizationId: organization.id,
      name: `${opts.orgName} — Tehran`,
      addressLine: "1 Valiasr St.",
      city: "Tehran",
      countryCode: "IR",
      timezone: "Asia/Tehran",
    },
  });

  const staff = await prisma.providerUser.create({
    data: { userId: staffUser.id, providerOrganizationId: organization.id, role: ProviderUserRole.STAFF },
  });

  const service = await prisma.providerService.create({
    data: {
      providerOrganizationId: organization.id,
      locationId: location.id,
      name: opts.serviceName,
      type: opts.serviceType,
      category: opts.category,
      durationMinutes: opts.durationMinutes,
      priceAmount: opts.priceAmount,
      currency: "IRR",
      locationMode: opts.locationMode,
      requiresCareProfile: opts.requiresCareProfile ?? false,
      supportsCat: opts.supportsCat ?? true,
    },
  });

  await prisma.providerAvailabilityRule.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      providerOrganizationId: organization.id,
      locationId: location.id,
      providerUserId: staff.id,
      dayOfWeek,
      startLocalTime: "09:00",
      endLocalTime: "18:00",
      timezone: "Asia/Tehran",
    })),
  });

  return { organization, location, staff, service };
}

/**
 * Admin CRM + Support + Disputes + Trust Operations fixtures (Handoff 11).
 * Two dedicated AdminUser identities — never Sarah's own consumer account,
 * mirroring the spec's "no implicit access through normal user session
 * alone" requirement even in seed data — plus one representative, already
 * OPEN SupportCase (with a public reply and an internal note) so a manual
 * QA session lands on real content in the Support workspace immediately,
 * without first having to create a case through the API. Both admin emails
 * sign in through the same OTP flow as any consumer account (DevOtpProvider
 * logs the code) — there is no separate admin credential system.
 */
async function seedAdmin(requesterUserId: string, requesterDisplayName: string) {
  const [rootAdminUser, supportAdminUser, financeAdminUser] = await Promise.all([
    prisma.user.upsert({ where: { email: "admin@example.com" }, update: {}, create: { email: "admin@example.com", displayName: "Root Admin", locale: "en" } }),
    prisma.user.upsert({ where: { email: "support-admin@example.com" }, update: {}, create: { email: "support-admin@example.com", displayName: "Support Agent", locale: "en" } }),
    // Handoff 14 — a dedicated FINANCE-role admin so seller settlement seed
    // data demonstrates real two-person control (initiator != approver)
    // rather than always using the same SUPER_ADMIN for both roles.
    prisma.user.upsert({ where: { email: "finance-admin@example.com" }, update: {}, create: { email: "finance-admin@example.com", displayName: "Finance Admin", locale: "en" } }),
  ]);

  const [rootAdmin, supportAdmin, financeAdmin] = await Promise.all([
    prisma.adminUser.upsert({ where: { userId: rootAdminUser.id }, update: {}, create: { userId: rootAdminUser.id, role: AdminRole.SUPER_ADMIN, status: AdminMembershipStatus.ACTIVE } }),
    prisma.adminUser.upsert({ where: { userId: supportAdminUser.id }, update: {}, create: { userId: supportAdminUser.id, role: AdminRole.SUPPORT, status: AdminMembershipStatus.ACTIVE } }),
    prisma.adminUser.upsert({ where: { userId: financeAdminUser.id }, update: {}, create: { userId: financeAdminUser.id, role: AdminRole.FINANCE, status: AdminMembershipStatus.ACTIVE } }),
  ]);

  const existingCase = await prisma.supportCase.findFirst({ where: { requesterUserId, caseNumber: "CASE-000001" } });
  if (!existingCase) {
    const seqRows = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('support_case_number_seq') AS nextval`;
    const supportCase = await prisma.supportCase.create({
      data: {
        caseNumber: `CASE-${seqRows[0]!.nextval.toString().padStart(6, "0")}`,
        requesterUserId,
        subject: "Trouble booking a grooming appointment",
        description: "The booking calendar shows no available slots for the next two weeks.",
        category: SupportCaseCategory.BOOKING,
        assignedAdminId: supportAdmin.id,
        createdByAdminId: supportAdmin.id,
      },
    });
    await prisma.supportMessage.create({
      data: { caseId: supportCase.id, authorType: SupportMessageAuthorType.ADMIN, authorAdminId: supportAdmin.id, body: `Hi ${requesterDisplayName}, looking into this now.`, visibility: SupportMessageVisibility.PUBLIC },
    });
    await prisma.internalNote.create({
      data: { entityType: InternalNoteEntityType.SUPPORT_CASE, entityId: supportCase.id, authorAdminId: supportAdmin.id, body: "Looks like a slot-generation bug for this provider — escalate to engineering if not resolved by EOD." },
    });
  }

  console.log(`Seeded admin: root=${rootAdminUser.email} support=${supportAdminUser.email} finance=${financeAdminUser.email} (all sign in via OTP, same as any consumer account)`);
  return { rootAdmin, supportAdmin, financeAdmin };
}

/** Minimal raw-Prisma mirror of SellerLedgerService.getOrCreateAccount — this script has no NestJS DI container to inject the real service into, so every seed function in this file talks to Prisma directly (see e.g. seedCommerce's own inline `createOffer` helper). */
async function seedLedgerAccount(sellerOrganizationId: string, code: SellerLedgerAccountCode) {
  const existing = await prisma.sellerLedgerAccount.findUnique({ where: { sellerOrganizationId_code: { sellerOrganizationId, code } } });
  if (existing) return existing;
  return prisma.sellerLedgerAccount.create({ data: { sellerOrganizationId, code } });
}

/** Mirrors SellerLedgerService.recordBalanced — a balanced two-line posting against already-seeded SellerLedgerAccount rows. */
async function seedLedgerPosting(
  sellerOrganizationId: string,
  description: string,
  referenceType: string,
  referenceId: string,
  debit: { code: SellerLedgerAccountCode; amount: number },
  credit: { code: SellerLedgerAccountCode; amount: number },
  sellerSettlementId?: string,
) {
  if (debit.amount !== credit.amount) throw new Error(`seedLedgerPosting: unbalanced (${debit.amount} vs ${credit.amount})`);
  const [debitAccount, creditAccount] = await Promise.all([seedLedgerAccount(sellerOrganizationId, debit.code), seedLedgerAccount(sellerOrganizationId, credit.code)]);
  const transaction = await prisma.sellerLedgerTransaction.create({
    data: { sellerOrganizationId, description, referenceType, referenceId, sellerSettlementId: sellerSettlementId ?? null },
  });
  await prisma.sellerLedgerEntry.createMany({
    data: [
      { sellerLedgerTransactionId: transaction.id, sellerLedgerAccountId: debitAccount.id, direction: LedgerEntryDirection.DEBIT, amount: debit.amount },
      { sellerLedgerTransactionId: transaction.id, sellerLedgerAccountId: creditAccount.id, direction: LedgerEntryDirection.CREDIT, amount: credit.amount },
    ],
  });
  return transaction;
}

/**
 * Marketplace & Seller Financial Settlement fixtures (Handoff 14) — every
 * dollar amount here is deterministic and hand-computed (never generated
 * from a live commission calculation), so the numbers a QA session sees in
 * the Seller/Admin Finance UI are exactly what this comment says they are.
 * No real bank/payout details anywhere (spec: "no real bank details") —
 * `payoutReferenceMasked` is a fabricated placeholder string, and payout
 * method stays MANUAL throughout, same as production until a real provider
 * exists (see README "External provider status").
 *
 * Produces, per the spec's own seed checklist:
 *  - a SellerFinancialAccount for both commerce sellers (Pet Bazaar Tehran, Golestan Pet Supplies)
 *  - a direct PET LIFE order's financials (Pet Bazaar) — pending, unswept
 *  - a DEV marketplace order's financials (Pet Bazaar) — pending, unswept
 *  - a PAID settlement, above the two-person-control threshold (Golestan) — FINANCE admin initiates, SUPER_ADMIN approves
 *  - a refund-adjusted order (Golestan) — sale then full refund, nets to zero before ever being settled
 *  - a reconciliation mismatch example (Golestan, DEV marketplace) — the imported statement disagrees with internal order economics
 */
async function seedSellerFinance(input: { petBazaar: { id: string }; golestan: { id: string }; financeAdmin: { id: string }; rootAdmin: { id: string } }) {
  const { petBazaar, golestan, financeAdmin, rootAdmin } = input;

  const [petBazaarAccount, golestanAccount] = await Promise.all([
    prisma.sellerFinancialAccount.upsert({
      where: { sellerOrganizationId: petBazaar.id },
      update: {},
      create: { sellerOrganizationId: petBazaar.id, payoutMethodType: "MANUAL", payoutReferenceMasked: "IBAN **** **** 1234" },
    }),
    prisma.sellerFinancialAccount.upsert({
      where: { sellerOrganizationId: golestan.id },
      update: {},
      create: { sellerOrganizationId: golestan.id, payoutMethodType: "MANUAL", payoutReferenceMasked: "IBAN **** **** 5678" },
    }),
  ]);

  const defaultCommissionRule = await prisma.commissionRule.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: { id: "00000000-0000-0000-0000-000000000001", sellerOrganizationId: null, channel: null, basisPoints: 1_000, createdByAdminId: financeAdmin.id },
  });

  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  const baseOrderData = { discountAmount: 0, currency: "IRR", shippingAddressSnapshot: {} as Prisma.InputJsonValue, confirmedAt: now };

  // --- Pet Bazaar: a direct PET LIFE sale, still pending (unswept) ---
  const petBazaarDirectOrder = await prisma.order.create({
    data: { ...baseOrderData, sellerOrganizationId: petBazaar.id, status: OrderStatus.CONFIRMED, subtotalAmount: 5_000_000, deliveryAmount: 0, totalAmount: 5_000_000 },
  });
  await prisma.orderFinancialBreakdown.create({
    data: {
      orderId: petBazaarDirectOrder.id,
      sellerOrganizationId: petBazaar.id,
      origin: OrderOrigin.PET_LIFE,
      grossMerchandiseIrr: 5_000_000,
      shippingIrr: 0,
      discountIrr: 0,
      shippingResponsibility: DeliveryResponsibility.PETLIFE,
      commissionRuleId: defaultCommissionRule.id,
      commissionBasisPoints: 1_000,
      platformCommissionIrr: 500_000,
      channelFeeIrr: 0,
      channelFeeConfidence: FinancialConfidence.KNOWN,
      sellerGrossIrr: 5_000_000,
      sellerNetIrr: 4_500_000,
    },
  });
  await seedLedgerPosting(petBazaar.id, "Order sale", "ORDER_SALE", petBazaarDirectOrder.id, { code: SellerLedgerAccountCode.RECEIVABLE, amount: 4_500_000 }, { code: SellerLedgerAccountCode.SALES_INCOME, amount: 4_500_000 });

  // --- Pet Bazaar: a DEV marketplace sale, still pending (unswept) — deliberately no PaymentIntent, PET LIFE OS never collected this cash ---
  const petBazaarMarketplaceOrder = await prisma.order.create({
    data: { ...baseOrderData, sellerOrganizationId: petBazaar.id, status: OrderStatus.CONFIRMED, subtotalAmount: 3_000_000, deliveryAmount: 0, totalAmount: 3_000_000 },
  });
  await prisma.orderFinancialBreakdown.create({
    data: {
      orderId: petBazaarMarketplaceOrder.id,
      sellerOrganizationId: petBazaar.id,
      origin: OrderOrigin.DEV_MARKETPLACE,
      grossMerchandiseIrr: 3_000_000,
      shippingIrr: 0,
      discountIrr: 0,
      shippingResponsibility: DeliveryResponsibility.MARKETPLACE,
      commissionRuleId: defaultCommissionRule.id,
      commissionBasisPoints: 1_000,
      platformCommissionIrr: 300_000,
      channelFeeIrr: 60_000,
      channelFeeConfidence: FinancialConfidence.ESTIMATED,
      sellerGrossIrr: 3_000_000,
      sellerNetIrr: 2_700_000,
    },
  });
  await seedLedgerPosting(
    petBazaar.id,
    "Order sale",
    "ORDER_SALE",
    petBazaarMarketplaceOrder.id,
    { code: SellerLedgerAccountCode.RECEIVABLE, amount: 2_700_000 },
    { code: SellerLedgerAccountCode.SALES_INCOME, amount: 2_700_000 },
  );

  // --- Golestan: a large direct sale, swept into a PAID settlement requiring two-person control (netIrr >= SETTLEMENT_APPROVAL_THRESHOLD_IRR) ---
  const golestanSettledOrder = await prisma.order.create({
    data: { ...baseOrderData, sellerOrganizationId: golestan.id, status: OrderStatus.CONFIRMED, subtotalAmount: 15_000_000, deliveryAmount: 0, totalAmount: 15_000_000 },
  });
  await prisma.orderFinancialBreakdown.create({
    data: {
      orderId: golestanSettledOrder.id,
      sellerOrganizationId: golestan.id,
      origin: OrderOrigin.PET_LIFE,
      grossMerchandiseIrr: 15_000_000,
      shippingIrr: 0,
      discountIrr: 0,
      shippingResponsibility: DeliveryResponsibility.PETLIFE,
      commissionRuleId: defaultCommissionRule.id,
      commissionBasisPoints: 1_000,
      platformCommissionIrr: 1_500_000,
      channelFeeIrr: 0,
      channelFeeConfidence: FinancialConfidence.KNOWN,
      sellerGrossIrr: 15_000_000,
      sellerNetIrr: 13_500_000,
    },
  });
  const golestanSaleTxn = await seedLedgerPosting(
    golestan.id,
    "Order sale",
    "ORDER_SALE",
    golestanSettledOrder.id,
    { code: SellerLedgerAccountCode.RECEIVABLE, amount: 13_500_000 },
    { code: SellerLedgerAccountCode.SALES_INCOME, amount: 13_500_000 },
  );

  const settlementSeqRows = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('seller_settlement_reference_seq') AS nextval`;
  const settlementSeq = settlementSeqRows[0]!.nextval;
  const golestanSettlement = await prisma.sellerSettlement.create({
    data: {
      reference: `STL-${settlementSeq.toString().padStart(6, "0")}`,
      sellerOrganizationId: golestan.id,
      periodStart: daysAgo(14),
      periodEnd: daysAgo(1),
      status: SellerSettlementStatus.PAID,
      grossIrr: 15_000_000,
      commissionIrr: 1_500_000,
      refundsIrr: 0,
      adjustmentsIrr: 0,
      netIrr: 13_500_000,
      initiatedByAdminId: financeAdmin.id,
      approvedByAdminId: rootAdmin.id,
      approvedAt: daysAgo(1),
      paidAt: now,
      payoutMethodType: golestanAccount.payoutMethodType,
    },
  });
  await prisma.sellerSettlementItem.create({
    data: {
      sellerSettlementId: golestanSettlement.id,
      sourceType: "ORDER",
      sourceId: golestanSettledOrder.id,
      grossAmount: 15_000_000,
      feeAmount: 1_500_000,
      netAmount: 13_500_000,
      description: `Order sale — ${golestanSettledOrder.id}`,
    },
  });
  await prisma.sellerLedgerTransaction.update({ where: { id: golestanSaleTxn.id }, data: { sellerSettlementId: golestanSettlement.id } });
  await seedLedgerPosting(
    golestan.id,
    "Settlement payout",
    "SETTLEMENT_PAYMENT",
    golestanSettlement.id,
    { code: SellerLedgerAccountCode.SETTLEMENT_PAID, amount: 13_500_000 },
    { code: SellerLedgerAccountCode.RECEIVABLE, amount: 13_500_000 },
    golestanSettlement.id,
  );

  // --- Golestan: a refund-adjusted order — sold, then fully refunded before ever being swept into a settlement, netting to zero ---
  const golestanRefundedOrder = await prisma.order.create({
    data: { ...baseOrderData, sellerOrganizationId: golestan.id, status: OrderStatus.REFUNDED, subtotalAmount: 2_000_000, deliveryAmount: 0, totalAmount: 2_000_000 },
  });
  await prisma.orderFinancialBreakdown.create({
    data: {
      orderId: golestanRefundedOrder.id,
      sellerOrganizationId: golestan.id,
      origin: OrderOrigin.PET_LIFE,
      grossMerchandiseIrr: 2_000_000,
      shippingIrr: 0,
      discountIrr: 0,
      shippingResponsibility: DeliveryResponsibility.PETLIFE,
      commissionRuleId: defaultCommissionRule.id,
      commissionBasisPoints: 1_000,
      platformCommissionIrr: 200_000,
      channelFeeIrr: 0,
      channelFeeConfidence: FinancialConfidence.KNOWN,
      sellerGrossIrr: 2_000_000,
      sellerNetIrr: 1_800_000,
    },
  });
  await seedLedgerPosting(
    golestan.id,
    "Order sale",
    "ORDER_SALE",
    golestanRefundedOrder.id,
    { code: SellerLedgerAccountCode.RECEIVABLE, amount: 1_800_000 },
    { code: SellerLedgerAccountCode.SALES_INCOME, amount: 1_800_000 },
  );
  const golestanRefund = await prisma.refund.create({
    data: { orderId: golestanRefundedOrder.id, amount: 2_000_000, currency: "IRR", status: RefundStatus.SUCCEEDED, reason: "Customer changed their mind", completedAt: now },
  });
  await seedLedgerPosting(
    golestan.id,
    "Order refund",
    "ORDER_REFUND",
    golestanRefund.id,
    { code: SellerLedgerAccountCode.SALES_INCOME, amount: 1_800_000 },
    { code: SellerLedgerAccountCode.RECEIVABLE, amount: 1_800_000 },
  );

  // --- Golestan: a DEV marketplace reconciliation mismatch example ---
  const golestanChannelAccount = await prisma.marketplaceChannelAccount.create({
    data: { sellerOrganizationId: golestan.id, provider: MarketplaceProvider.DEV, status: MarketplaceChannelAccountStatus.CONNECTED, displayName: "Golestan DEV Marketplace" },
  });
  const golestanMarketplaceInternalOrder = await prisma.order.create({
    data: { ...baseOrderData, sellerOrganizationId: golestan.id, status: OrderStatus.CONFIRMED, subtotalAmount: 4_000_000, deliveryAmount: 0, totalAmount: 4_000_000 },
  });
  const golestanMarketplaceOrder = await prisma.marketplaceOrder.create({
    data: {
      provider: MarketplaceProvider.DEV,
      marketplaceChannelAccountId: golestanChannelAccount.id,
      sellerOrganizationId: golestan.id,
      externalOrderId: "DEV-EXT-9001",
      status: MarketplaceOrderStatus.DELIVERED,
      currency: "IRR",
      totalAmount: 4_000_000,
      deliveryResponsibility: DeliveryResponsibility.MARKETPLACE,
      paymentSource: PaymentSourceType.MARKETPLACE_COLLECTED,
      placedAt: daysAgo(10),
      mappedOrderId: golestanMarketplaceInternalOrder.id,
    },
  });
  await prisma.orderFinancialBreakdown.create({
    data: {
      orderId: golestanMarketplaceInternalOrder.id,
      sellerOrganizationId: golestan.id,
      origin: OrderOrigin.DEV_MARKETPLACE,
      grossMerchandiseIrr: 4_000_000,
      shippingIrr: 0,
      discountIrr: 0,
      shippingResponsibility: DeliveryResponsibility.MARKETPLACE,
      commissionRuleId: defaultCommissionRule.id,
      commissionBasisPoints: 1_000,
      platformCommissionIrr: 400_000,
      channelFeeIrr: 80_000,
      channelFeeConfidence: FinancialConfidence.ESTIMATED,
      sellerGrossIrr: 4_000_000,
      sellerNetIrr: 3_600_000,
    },
  });
  await seedLedgerPosting(
    golestan.id,
    "Order sale",
    "ORDER_SALE",
    golestanMarketplaceInternalOrder.id,
    { code: SellerLedgerAccountCode.RECEIVABLE, amount: 3_600_000 },
    { code: SellerLedgerAccountCode.SALES_INCOME, amount: 3_600_000 },
  );

  const golestanStatement = await prisma.marketplaceSettlementStatement.create({
    data: {
      provider: MarketplaceProvider.DEV,
      marketplaceChannelAccountId: golestanChannelAccount.id,
      sellerOrganizationId: golestan.id,
      source: MarketplaceSettlementImportSource.MANUAL,
      periodStart: daysAgo(30),
      periodEnd: now,
      currency: "IRR",
      totalAmount: 3_700_000,
      importedByAdminId: financeAdmin.id,
    },
  });
  const golestanStatementLine = await prisma.marketplaceSettlementStatementLine.create({
    data: { marketplaceSettlementStatementId: golestanStatement.id, externalOrderId: golestanMarketplaceOrder.externalOrderId, amount: 3_700_000, feeConfidence: FinancialConfidence.UNKNOWN },
  });
  await prisma.marketplaceReconciliationResult.create({
    data: {
      marketplaceSettlementStatementId: golestanStatement.id,
      marketplaceSettlementStatementLineId: golestanStatementLine.id,
      marketplaceOrderId: golestanMarketplaceOrder.id,
      status: MarketplaceReconciliationStatus.MISMATCH,
      expectedAmount: 4_000_000,
      statementAmount: 3_700_000,
      variance: -300_000,
    },
  });

  console.log(
    `Seeded seller finance: accounts=[${petBazaarAccount.id}, ${golestanAccount.id}] paidSettlement=${golestanSettlement.reference} reconciliationMismatch=DEV-EXT-9001`,
  );
}

async function main() {
  await seedSubscriptions();

  const sarah = await prisma.user.upsert({
    where: { email: "sarah@example.com" },
    update: {},
    create: {
      email: "sarah@example.com",
      displayName: "Sarah",
      locale: "en",
    },
  });

  const household = await prisma.household.create({
    data: {
      name: "Sarah's Home",
      city: "Tehran",
      countryCode: "IR",
      members: { create: { userId: sarah.id, role: HouseholdRole.OWNER } },
    },
  });

  const luna = await prisma.pet.create({
    data: {
      householdId: household.id,
      name: "Luna",
      species: PetSpecies.DOG,
      breed: "Golden Retriever",
      birthDate: new Date("2022-03-15"),
      lifecycleStatus: "ACTIVE",
    },
  });

  const milo = await prisma.pet.create({
    data: {
      householdId: household.id,
      name: "Milo",
      species: PetSpecies.CAT,
      breed: "Domestic Shorthair",
      approximateAgeMonths: 18,
      lifecycleStatus: "ACTIVE",
    },
  });

  for (const pet of [luna, milo]) {
    await prisma.petAccessGrant.create({
      data: {
        petId: pet.id,
        userId: sarah.id,
        canViewIdentity: true,
        canEditIdentity: true,
        canViewHealth: true,
        canEditHealth: true,
        canBookCare: true,
        canViewCareProfile: true,
        canEditCareProfile: true,
        canViewLocation: true,
        canManageAccess: true,
        source: "HOUSEHOLD",
      },
    });
  }

  // Luna: vaccination due soon, no known allergies, a filled-in diet profile, a partially
  // filled care profile — enough Health Basics answered to demonstrate PARTIAL, not empty.
  await prisma.healthProfile.create({
    data: { petId: luna.id, allergiesOverallState: HealthAreaKnowledgeState.NONE_KNOWN, status: SetupStatus.PARTIAL },
  });
  await prisma.vaccinationSummary.create({
    data: {
      petId: luna.id,
      status: VaccinationStatus.DUE_SOON,
      nextDueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      lastKnownDate: new Date("2025-08-01"),
    },
  });
  await prisma.nutritionProfile.create({
    data: {
      petId: luna.id,
      dietType: DietType.DRY,
      currentFoodText: "Premium dry kibble, chicken formula",
      feedingFrequencyText: "Twice daily, morning and evening",
      status: SetupStatus.COMPLETE,
    },
  });
  await prisma.careProfile.create({
    data: {
      petId: luna.id,
      temperamentText: "Calm and friendly, great with children",
      feedingRoutineText: "Fed twice a day at fixed times",
      status: SetupStatus.PARTIAL,
    },
  });

  // Milo: everything still Unknown/unanswered except a single care-profile note —
  // deliberately the least-set-up pet, to exercise Unknown (not Known Negative) states.
  await prisma.healthProfile.create({
    data: { petId: milo.id, allergiesOverallState: HealthAreaKnowledgeState.UNKNOWN, status: SetupStatus.PARTIAL },
  });
  await prisma.vaccinationSummary.create({
    data: { petId: milo.id, status: VaccinationStatus.UNKNOWN },
  });
  await prisma.careProfile.create({
    data: { petId: milo.id, temperamentText: "Shy around new people", status: SetupStatus.PARTIAL },
  });

  await prisma.activePetPreference.create({
    data: { userId: sarah.id, householdId: household.id, petId: luna.id },
  });

  await prisma.onboardingProgress.create({
    data: {
      userId: sarah.id,
      householdId: household.id,
      petId: luna.id,
      chapter: "READY",
      step: "ready",
      status: "COMPLETED",
      completedSteps: ["welcome", "account", "household", "pet-identity", "personalization", "ready"],
      lastCompletedAt: new Date(),
    },
  });

  // Tehran Pet Care Clinic: a single VERIFIED provider with one vet, one
  // location, three services, and open-ended weekly availability on all
  // seven days so a slot is always bookable "today or tomorrow" regardless
  // of when this seed (or the browser E2E against it) actually runs.
  const drSaraUser = await prisma.user.upsert({
    where: { email: "dr.sara.vet@example.com" },
    update: {},
    create: { email: "dr.sara.vet@example.com", displayName: "Dr. Sara Vet", locale: "en" },
  });

  const clinic = await prisma.providerOrganization.create({
    data: {
      name: "Tehran Pet Care Clinic",
      type: ProviderType.VET_CLINIC,
      verificationStatus: ProviderVerificationStatus.VERIFIED,
      description: "General veterinary care for dogs and cats.",
      phone: "+98 21 5555 0100",
    },
  });

  const clinicLocation = await prisma.providerLocation.create({
    data: {
      providerOrganizationId: clinic.id,
      name: "Tehran Pet Care Clinic — Vanak",
      addressLine: "12 Vanak St.",
      city: "Tehran",
      countryCode: "IR",
      timezone: "Asia/Tehran",
      phone: "+98 21 5555 0100",
    },
  });

  const drSara = await prisma.providerUser.create({
    data: {
      userId: drSaraUser.id,
      providerOrganizationId: clinic.id,
      role: ProviderUserRole.VET,
      displayTitle: "DVM",
    },
  });

  const [generalVisit] = await Promise.all([
    prisma.providerService.create({
      data: {
        providerOrganizationId: clinic.id,
        locationId: clinicLocation.id,
        name: "General Vet Visit",
        type: ProviderServiceType.GENERAL_VET_VISIT,
        category: ServiceCategory.VET,
        locationMode: LocationMode.AT_PROVIDER,
        durationMinutes: 30,
        priceAmount: 450000,
        currency: "IRR",
      },
    }),
    prisma.providerService.create({
      data: {
        providerOrganizationId: clinic.id,
        locationId: clinicLocation.id,
        name: "Vaccination",
        type: ProviderServiceType.VACCINATION,
        category: ServiceCategory.VET,
        locationMode: LocationMode.AT_PROVIDER,
        durationMinutes: 20,
        priceAmount: 300000,
        currency: "IRR",
      },
    }),
    prisma.providerService.create({
      data: {
        providerOrganizationId: clinic.id,
        locationId: clinicLocation.id,
        name: "Follow-up",
        type: ProviderServiceType.FOLLOW_UP,
        category: ServiceCategory.VET,
        locationMode: LocationMode.AT_PROVIDER,
        durationMinutes: 15,
        priceAmount: 200000,
        currency: "IRR",
      },
    }),
  ]);

  await prisma.providerAvailabilityRule.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      providerOrganizationId: clinic.id,
      locationId: clinicLocation.id,
      providerUserId: drSara.id,
      dayOfWeek,
      startLocalTime: "09:00",
      endLocalTime: "18:00",
      timezone: "Asia/Tehran",
    })),
  });

  console.log(
    `Seeded provider: clinic=${clinic.id} location=${clinicLocation.id} vet=${drSara.id} generalVisitService=${generalVisit.id}`,
  );

  // Handoff 05: a second ProviderUser on the same organization — front-desk
  // staff with no availability rules of their own (they don't personally
  // perform bookable services) — gives the Provider OS's team view a real
  // multi-person roster and a STAFF-vs-VET role contrast to test against.
  const receptionUser = await prisma.user.upsert({
    where: { email: "reception@example.com" },
    update: {},
    create: { email: "reception@example.com", displayName: "Reception Staff", locale: "en" },
  });
  const receptionStaff = await prisma.providerUser.create({
    data: {
      userId: receptionUser.id,
      providerOrganizationId: clinic.id,
      role: ProviderUserRole.STAFF,
      displayTitle: "Front Desk",
    },
  });
  console.log(`Seeded provider team member: clinic=${clinic.id} reception=${receptionStaff.id}`);

  // Handoff 04: one verified provider per remaining ServiceCategory.
  const groomer = await seedServiceProvider({
    orgName: "Happy Paws Grooming",
    orgType: ProviderType.GROOMER,
    staffEmail: "groomer@example.com",
    staffName: "Happy Paws Groomer",
    serviceName: "Full Groom & Bath",
    serviceType: ProviderServiceType.GROOMING_SESSION,
    category: ServiceCategory.GROOMING,
    durationMinutes: 60,
    priceAmount: 550000,
    locationMode: LocationMode.AT_PROVIDER,
  });

  const trainer = await seedServiceProvider({
    orgName: "Good Dog Training",
    orgType: ProviderType.TRAINER,
    staffEmail: "trainer@example.com",
    staffName: "Good Dog Trainer",
    serviceName: "Basic Obedience Session",
    serviceType: ProviderServiceType.TRAINING_SESSION,
    category: ServiceCategory.TRAINING,
    durationMinutes: 45,
    priceAmount: 700000,
    locationMode: LocationMode.AT_PROVIDER,
    requiresCareProfile: true,
    supportsCat: false,
  });

  const walker = await seedServiceProvider({
    orgName: "City Paws Walking",
    orgType: ProviderType.WALKER,
    staffEmail: "walker@example.com",
    staffName: "City Paws Walker",
    serviceName: "30-Minute Walk",
    serviceType: ProviderServiceType.DOG_WALK,
    category: ServiceCategory.WALKING,
    durationMinutes: 30,
    priceAmount: 250000,
    locationMode: LocationMode.AT_CUSTOMER,
    supportsCat: false,
  });

  const sitter = await seedServiceProvider({
    orgName: "Cozy Home Sitting",
    orgType: ProviderType.SITTER,
    staffEmail: "sitter@example.com",
    staffName: "Cozy Home Sitter",
    serviceName: "In-Home Pet Sitting",
    serviceType: ProviderServiceType.PET_SITTING,
    category: ServiceCategory.SITTING,
    durationMinutes: 60,
    priceAmount: 400000,
    locationMode: LocationMode.AT_CUSTOMER,
  });

  const boarding = await seedServiceProvider({
    orgName: "Tehran Pet Boarding",
    orgType: ProviderType.BOARDING,
    staffEmail: "boarding@example.com",
    staffName: "Tehran Pet Boarding Staff",
    serviceName: "Overnight Boarding",
    serviceType: ProviderServiceType.BOARDING_STAY,
    category: ServiceCategory.BOARDING,
    durationMinutes: 60,
    priceAmount: 900000,
    locationMode: LocationMode.AT_PROVIDER,
  });

  const petTaxi = await seedServiceProvider({
    orgName: "PetGo Taxi",
    orgType: ProviderType.PET_TAXI,
    staffEmail: "taxi@example.com",
    staffName: "PetGo Driver",
    serviceName: "Vet Visit Ride",
    serviceType: ProviderServiceType.PET_TAXI_RIDE,
    category: ServiceCategory.PET_TAXI,
    durationMinutes: 30,
    priceAmount: 350000,
    locationMode: LocationMode.TRANSPORT,
  });

  console.log(
    [
      `groomer=${groomer.organization.id}`,
      `trainer=${trainer.organization.id}`,
      `walker=${walker.organization.id}`,
      `sitter=${sitter.organization.id}`,
      `boarding=${boarding.organization.id}`,
      `petTaxi=${petTaxi.organization.id}`,
    ].join(" "),
  );

  console.log(`Seeded: user=${sarah.email} household=${household.id} pets=[Luna:${luna.id}, Milo:${milo.id}]`);

  const { petBazaar, golestan } = await seedCommerce();
  const { rootAdmin, financeAdmin } = await seedAdmin(sarah.id, sarah.displayName);
  await seedSellerFinance({ petBazaar, golestan, financeAdmin, rootAdmin });
  await seedDemoAccount();
}

/**
 * Handoff 12 (Authentication) — "run locally -> log in -> immediately see
 * real product" via username/password, with zero dependency on reading an
 * OTP code out of the server log. Written idempotently (existence-checked
 * before any create), unlike Sarah's own seed above, which pre-dates this
 * handoff and is documented separately as a known issue rather than fixed
 * here — see the H12 completion report.
 */
const DEMO_USERNAME = "demo";
const DEMO_PASSWORD = "dev-only-password";

async function seedDemoAccount(): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { normalizedUsername: DEMO_USERNAME } });
  if (existing) {
    console.log(`Demo account already seeded: username=${DEMO_USERNAME} password=${DEMO_PASSWORD}`);
    return;
  }

  const demoUser = await prisma.user.create({
    data: {
      username: DEMO_USERNAME,
      normalizedUsername: DEMO_USERNAME,
      passwordHash: await hashPassword(DEMO_PASSWORD),
      displayName: "Demo User",
      locale: "en",
    },
  });

  const household = await prisma.household.create({
    data: {
      name: "Demo Household",
      city: "Tehran",
      countryCode: "IR",
      members: { create: { userId: demoUser.id, role: HouseholdRole.OWNER } },
    },
  });

  const buddy = await prisma.pet.create({
    data: {
      householdId: household.id,
      name: "Buddy",
      species: PetSpecies.DOG,
      breed: "Labrador Retriever",
      birthDate: new Date("2021-06-01"),
      lifecycleStatus: "ACTIVE",
    },
  });

  await prisma.petAccessGrant.create({
    data: {
      petId: buddy.id,
      userId: demoUser.id,
      canViewIdentity: true,
      canEditIdentity: true,
      canViewHealth: true,
      canEditHealth: true,
      canBookCare: true,
      canViewCareProfile: true,
      canEditCareProfile: true,
      canViewLocation: true,
      canManageAccess: true,
      source: "HOUSEHOLD",
    },
  });

  await prisma.activePetPreference.create({
    data: { userId: demoUser.id, householdId: household.id, petId: buddy.id },
  });

  await prisma.onboardingProgress.create({
    data: {
      userId: demoUser.id,
      householdId: household.id,
      petId: buddy.id,
      chapter: "READY",
      step: "ready",
      status: "COMPLETED",
      completedSteps: ["welcome", "account", "household", "pet-identity", "personalization", "ready"],
      lastCompletedAt: new Date(),
    },
  });

  console.log(`Seeded demo account: username=${DEMO_USERNAME} password=${DEMO_PASSWORD} household=${household.id} pet=Buddy:${buddy.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
