import { AdminMembershipStatus, AdminRole, ConsentKind, HouseholdRole, PetAccessSource, PetSpecies, PrismaClient, SubscriptionBillingInterval, SubscriptionEntitlementType, SubscriptionPeriodStatus, SubscriptionStatus } from "@prisma/client";
import { createHash } from "node:crypto";

/**
 * Batch 8 QA scenarios — account, household access, security and membership.
 *
 * Accounts (all example.test, Persian locale, verified e-mail; sign in with
 * the dev OTP on the preview):
 *  1. batch8-owner       — active household owner, 2 pets, ACTIVE membership, marketing consent.
 *  2. batch8-family      — owner of a shared household: member batch8-member holds a view-only
 *                          household grant on one pet and an active TEMPORARY grant on the other;
 *                          a PENDING invitation to batch8-invitee.
 *  3. batch8-trial       — TRIALING membership (trial ends in 5 days).
 *  4. batch8-expired / batch8-cancelled / batch8-pastdue / batch8-grace — one household per state.
 *  5. batch8-security    — three active sessions + one revoked; its pet was shared with
 *                          batch8-sitter through one EXPIRED and one REVOKED grant.
 *  6. batch8-comp        — complimentary access: there is no "complimentary" subscription status
 *                          in this architecture, so it is modelled as an admin entitlement override
 *                          (pets.max = 20) on a FREE household, created by batch8-qa-admin.
 *
 * Honesty rules: no payment is recorded as captured (no billing attempts are seeded);
 * membership rows only describe state. Idempotent (deterministic ids + upserts). Runs only
 * against a *_test database, or a staging database named in PETLIFE_QA_SEED_DATABASE.
 */
const db = new PrismaClient();
const id = (key: string) => {
  const h = createHash("sha256").update(`petlife-batch8-qa:${key}`).digest("hex").slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20)}`;
};
const DAY = 86_400_000;
const days = (n: number) => new Date(Date.now() + n * DAY);

const FULL = { canViewIdentity: true, canEditIdentity: true, canViewHealth: true, canEditHealth: true, canBookCare: true, canViewCareProfile: true, canEditCareProfile: true, canViewLocation: true, canManageAccess: true, canRecordClinicalData: false };
const VIEW_ONLY = { canViewIdentity: true, canEditIdentity: false, canViewHealth: false, canEditHealth: false, canBookCare: false, canViewCareProfile: true, canEditCareProfile: false, canViewLocation: false, canManageAccess: false, canRecordClinicalData: false };
const CARE_HELPER = { ...VIEW_ONLY, canViewHealth: true, canBookCare: true, canEditCareProfile: true, canViewLocation: true };

async function user(key: string, name: string) {
  const email = `${key}@example.test`;
  return db.user.upsert({ where: { email }, create: { id: id(`user:${key}`), email, emailVerifiedAt: new Date(), displayName: name, locale: "fa" }, update: { displayName: name, emailVerifiedAt: new Date() } });
}

async function household(key: string, name: string, ownerId: string) {
  const row = await db.household.upsert({ where: { id: id(`household:${key}`) }, create: { id: id(`household:${key}`), name, city: "تهران", countryCode: "IR" }, update: { name, countryCode: "IR" } });
  await db.householdMember.upsert({ where: { householdId_userId: { householdId: row.id, userId: ownerId } }, create: { id: id(`member:${key}:${ownerId}`), householdId: row.id, userId: ownerId, role: HouseholdRole.OWNER }, update: { role: HouseholdRole.OWNER } });
  return row;
}

async function pet(key: string, householdId: string, ownerId: string, name: string, species: PetSpecies) {
  const row = await db.pet.upsert({ where: { id: id(`pet:${key}`) }, create: { id: id(`pet:${key}`), householdId, name, species, approximateAgeMonths: 30 }, update: { name } });
  await grant(`owner:${key}`, row.id, ownerId, FULL, { source: PetAccessSource.HOUSEHOLD });
  return row;
}

async function grant(key: string, petId: string, userId: string, flags: typeof FULL, extra: { source: PetAccessSource; startsAt?: Date | null; expiresAt?: Date | null; revokedAt?: Date | null; reason?: string; grantedByUserId?: string }) {
  const data = { petId, userId, ...flags, source: extra.source, startsAt: extra.startsAt ?? null, expiresAt: extra.expiresAt ?? null, revokedAt: extra.revokedAt ?? null, revokedByUserId: extra.revokedAt ? extra.grantedByUserId : null, reason: extra.reason ?? null, grantedByUserId: extra.grantedByUserId ?? null };
  return db.petAccessGrant.upsert({ where: { id: id(`grant:${key}`) }, create: { id: id(`grant:${key}`), ...data }, update: data });
}

async function membership(key: string, householdId: string, planId: string, priceId: string | null, status: SubscriptionStatus, fields: { periodStart: Date; periodEnd: Date; isTrial?: boolean; trialEndsAt?: Date; gracePeriodEndsAt?: Date; cancelRequestedAt?: Date; cancelEffectiveAt?: Date; expiredAt?: Date }) {
  const subscriptionId = id(`subscription:${key}`);
  const periodId = id(`period:${key}`);
  const ended = status === SubscriptionStatus.EXPIRED || status === SubscriptionStatus.CANCELLED;
  const base = { planId, priceId, status, trialEndsAt: fields.trialEndsAt ?? null, gracePeriodEndsAt: fields.gracePeriodEndsAt ?? null, cancelRequestedAt: fields.cancelRequestedAt ?? null, cancelEffectiveAt: fields.cancelEffectiveAt ?? null, expiredAt: fields.expiredAt ?? null };
  // A household has exactly one subscription row; replace whatever the app self-created for it.
  const existing = await db.subscription.findUnique({ where: { householdId } });
  if (existing && existing.id !== subscriptionId) {
    await db.subscription.update({ where: { id: existing.id }, data: { currentPeriodId: null } });
    await db.subscriptionPeriod.deleteMany({ where: { subscriptionId: existing.id } });
    await db.subscription.delete({ where: { id: existing.id } });
  }
  await db.subscription.upsert({ where: { id: subscriptionId }, create: { id: subscriptionId, householdId, ...base }, update: { ...base, currentPeriodId: null } });
  await db.subscriptionPeriod.upsert({
    where: { id: periodId },
    create: { id: periodId, subscriptionId, planId, priceId, status: ended ? SubscriptionPeriodStatus.ENDED : SubscriptionPeriodStatus.ACTIVE, startAt: fields.periodStart, endAt: fields.periodEnd, isTrial: fields.isTrial ?? false },
    update: { planId, priceId, status: ended ? SubscriptionPeriodStatus.ENDED : SubscriptionPeriodStatus.ACTIVE, startAt: fields.periodStart, endAt: fields.periodEnd, isTrial: fields.isTrial ?? false },
  });
  if (!ended) await db.subscription.update({ where: { id: subscriptionId }, data: { currentPeriodId: periodId } });
}

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "").pathname;
  if (!database.endsWith("_test") && process.env.PETLIFE_QA_SEED_DATABASE !== database.slice(1)) {
    throw new Error("This QA seed runs against a *_test database, or a staging database named in PETLIFE_QA_SEED_DATABASE.");
  }

  // ---- Membership plan (QA sample prices in IRR; one price per duration option)
  const plan = await db.subscriptionPlan.upsert({
    where: { code: "batch8-care-qa" },
    create: { id: id("plan:care"), code: "batch8-care-qa", nameFa: "مراقبت کامل (نمایشی)", nameEn: "Care Plus (demo)", sortOrder: 60, trialDays: 7, countryAvailability: { create: { countryCode: "IR" } } },
    update: { trialDays: 7 },
  });
  await db.subscriptionPlanEntitlement.deleteMany({ where: { planId: plan.id } });
  await db.subscriptionPlanEntitlement.createMany({
    data: [
      { planId: plan.id, key: "pets.max", type: SubscriptionEntitlementType.LIMIT, limitValue: 10 },
      { planId: plan.id, key: "household.members.max", type: SubscriptionEntitlementType.LIMIT, limitValue: 6 },
    ],
  });
  const prices: Record<SubscriptionBillingInterval, number> = { MONTHLY: 2_900_000, QUARTERLY: 7_900_000, SEMI_ANNUAL: 14_900_000, ANNUAL: 27_900_000 };
  const priceIds: Partial<Record<SubscriptionBillingInterval, string>> = {};
  for (const [interval, amount] of Object.entries(prices) as [SubscriptionBillingInterval, number][]) {
    const priceId = id(`price:${interval}`);
    await db.subscriptionPlanPrice.upsert({ where: { id: priceId }, create: { id: priceId, planId: plan.id, countryCode: "IR", billingInterval: interval, amount }, update: { amount } });
    priceIds[interval] = priceId;
  }
  const monthly = priceIds.MONTHLY!;

  // 1. Active household owner
  const owner = await user("batch8-owner", "مریم احمدی");
  const ownerHome = await household("owner", "خانهٔ احمدی (نمایشی)", owner.id);
  await pet("owner-dog", ownerHome.id, owner.id, "لوکا", PetSpecies.DOG);
  await pet("owner-cat", ownerHome.id, owner.id, "پیشی", PetSpecies.CAT);
  await membership("owner", ownerHome.id, plan.id, monthly, SubscriptionStatus.ACTIVE, { periodStart: days(-10), periodEnd: days(20) });
  await db.userConsent.upsert({ where: { userId_kind_version: { userId: owner.id, kind: ConsentKind.MARKETING, version: "2026-09-25" } }, create: { userId: owner.id, kind: ConsentKind.MARKETING, version: "2026-09-25", grantedAt: days(-5) }, update: { grantedAt: days(-5), revokedAt: null } });

  // 2. Shared household with granular access and a pending invitation
  const family = await user("batch8-family", "رضا کریمی");
  const member = await user("batch8-member", "نگار کریمی");
  const familyHome = await household("family", "خانهٔ کریمی (نمایشی)", family.id);
  await db.householdMember.upsert({ where: { householdId_userId: { householdId: familyHome.id, userId: member.id } }, create: { id: id("member:family:member"), householdId: familyHome.id, userId: member.id, role: HouseholdRole.FAMILY }, update: { role: HouseholdRole.FAMILY } });
  const dog = await pet("family-dog", familyHome.id, family.id, "بارون", PetSpecies.DOG);
  const cat = await pet("family-cat", familyHome.id, family.id, "ملوس", PetSpecies.CAT);
  await grant("member:dog", dog.id, member.id, VIEW_ONLY, { source: PetAccessSource.HOUSEHOLD, grantedByUserId: family.id });
  await grant("member:cat-temporary", cat.id, member.id, CARE_HELPER, { source: PetAccessSource.TEMPORARY, expiresAt: days(4), reason: "نگهداری در سفر (نمایشی)", grantedByUserId: family.id });
  await db.householdInvitation.upsert({
    where: { id: id("invitation:family") },
    create: { id: id("invitation:family"), householdId: familyHome.id, contact: "batch8-invitee@example.test", tokenHash: createHash("sha256").update("batch8-qa-invitation-token").digest("hex"), invitedByUserId: family.id, initialAccess: [{ petId: dog.id, preset: "VIEW_ONLY" }], expiresAt: days(6) },
    update: { status: "PENDING", expiresAt: days(6) },
  });
  await user("batch8-invitee", "سپیده رحیمی");

  // 3. Trial
  const trial = await user("batch8-trial", "امیر نوری");
  const trialHome = await household("trial", "خانهٔ نوری (نمایشی)", trial.id);
  await pet("trial-dog", trialHome.id, trial.id, "راکی", PetSpecies.DOG);
  await membership("trial", trialHome.id, plan.id, null, SubscriptionStatus.TRIALING, { periodStart: days(-2), periodEnd: days(5), isTrial: true, trialEndsAt: days(5) });

  // 4. Expired, cancelled, past due, grace period
  for (const [key, name, status] of [
    ["expired", "لیلا صادقی", SubscriptionStatus.EXPIRED],
    ["cancelled", "کاوه مرادی", SubscriptionStatus.CANCELLED],
    ["pastdue", "مینا فرهادی", SubscriptionStatus.PAST_DUE],
    ["grace", "بهرام یزدانی", SubscriptionStatus.GRACE_PERIOD],
  ] as const) {
    const u = await user(`batch8-${key}`, name);
    const home = await household(key, `خانهٔ ${name.split(" ")[1]} (نمایشی)`, u.id);
    await pet(`${key}-pet`, home.id, u.id, "کوکی", PetSpecies.CAT);
    if (status === SubscriptionStatus.EXPIRED) await membership(key, home.id, plan.id, monthly, status, { periodStart: days(-45), periodEnd: days(-15), expiredAt: days(-8) });
    if (status === SubscriptionStatus.CANCELLED) await membership(key, home.id, plan.id, monthly, status, { periodStart: days(-40), periodEnd: days(-10), cancelRequestedAt: days(-20), cancelEffectiveAt: days(-10) });
    if (status === SubscriptionStatus.PAST_DUE) await membership(key, home.id, plan.id, monthly, status, { periodStart: days(-31), periodEnd: days(-1) });
    if (status === SubscriptionStatus.GRACE_PERIOD) await membership(key, home.id, plan.id, monthly, status, { periodStart: days(-34), periodEnd: days(-4), gracePeriodEndsAt: days(3) });
  }

  // 5. Security-heavy user: several sessions, an expired and a revoked grant to a sitter
  const security = await user("batch8-security", "آرش قاسمی");
  const sitter = await user("batch8-sitter", "هانیه جلالی");
  const securityHome = await household("security", "خانهٔ قاسمی (نمایشی)", security.id);
  const securityPet = await pet("security-dog", securityHome.id, security.id, "زئوس", PetSpecies.DOG);
  const agents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
  ];
  for (const [index, agent] of agents.entries()) {
    const sessionId = id(`session:security:${index}`);
    const data = { userId: security.id, userAgent: agent, expiresAt: days(20), lastSeenAt: days(-index), revokedAt: index === 3 ? days(-1) : null };
    await db.session.upsert({ where: { id: sessionId }, create: { id: sessionId, ...data, createdAt: days(-10 - index) }, update: data });
  }
  await db.householdMember.upsert({ where: { householdId_userId: { householdId: securityHome.id, userId: sitter.id } }, create: { id: id("member:security:sitter"), householdId: securityHome.id, userId: sitter.id, role: HouseholdRole.FAMILY }, update: {} });
  await grant("sitter:expired", securityPet.id, sitter.id, CARE_HELPER, { source: PetAccessSource.TEMPORARY, startsAt: days(-10), expiresAt: days(-2), reason: "نگهداری آخر هفته (نمایشی)", grantedByUserId: security.id });
  await grant("sitter:revoked", securityPet.id, sitter.id, VIEW_ONLY, { source: PetAccessSource.MANUAL, revokedAt: days(-1), grantedByUserId: security.id });

  // 6. Complimentary access (admin entitlement override on a FREE household)
  const admin = await user("batch8-qa-admin", "مدیر آزمایشی");
  const adminUser = await db.adminUser.upsert({ where: { userId: admin.id }, create: { id: id("admin:qa"), userId: admin.id, role: AdminRole.ADMIN, status: AdminMembershipStatus.ACTIVE }, update: {} });
  const comp = await user("batch8-comp", "شیرین حسینی");
  const compHome = await household("comp", "خانهٔ حسینی (نمایشی)", comp.id);
  await pet("comp-dog", compHome.id, comp.id, "تارا", PetSpecies.DOG);
  await db.subscriptionEntitlementOverride.upsert({
    where: { id: id("override:comp") },
    create: { id: id("override:comp"), householdId: compHome.id, key: "pets.max", type: SubscriptionEntitlementType.LIMIT, limitValue: 20, reason: "دسترسی رایگان پناهگاه همکار (نمایشی)", createdByAdminId: adminUser.id, expiresAt: days(60) },
    update: { active: true, expiresAt: days(60) },
  });

  // Showcase: the owner's support history and the admin queue — every status, several categories and
  // priorities, each with the user's opening message (and a team reply where the case has progressed).
  const CASES: [string, "ACCOUNT" | "PET" | "HEALTH" | "BOOKING" | "PAYMENT" | "REFUND" | "ORDER" | "DELIVERY" | "OTHER", "LOW" | "NORMAL" | "HIGH" | "URGENT", "OPEN" | "IN_PROGRESS" | "WAITING_ON_USER" | "WAITING_ON_INTERNAL" | "RESOLVED" | "CLOSED", string, string, number][] = [
    ["login", "ACCOUNT", "HIGH", "OPEN", "کد ورود به موبایلم نمی‌رسد", "از دیروز کد یک‌بارمصرف دریافت نمی‌کنم.", -1],
    ["order-late", "DELIVERY", "NORMAL", "IN_PROGRESS", "سفارش غذای سگ هنوز نرسیده", "سفارش سه روز پیش ثبت شده و وضعیتش تغییری نکرده.", -3],
    ["refund", "REFUND", "NORMAL", "WAITING_ON_INTERNAL", "بازپرداخت سفارش لغوشده", "سفارش را لغو کردم ولی مبلغ هنوز برنگشته.", -6],
    ["booking-change", "BOOKING", "LOW", "WAITING_ON_USER", "تغییر ساعت نوبت آرایش", "می‌خواهم نوبت را یک ساعت جابه‌جا کنم.", -4],
    ["pet-transfer", "PET", "NORMAL", "OPEN", "انتقال پروفایل پیشی به خانوادهٔ دیگر", "پیشی را به خواهرم سپرده‌ام؛ پروفایل را چطور منتقل کنم؟", -2],
    ["health-record", "HEALTH", "NORMAL", "RESOLVED", "نتیجهٔ آزمایش در پرونده نیست", "کلینیک گفت نتیجه را فرستاده ولی در پرونده نمی‌بینم.", -15],
    ["payment-double", "PAYMENT", "URGENT", "IN_PROGRESS", "مبلغ دو بار کسر شده", "برای عضویت دو پیامک کسر مبلغ گرفتم.", -1],
    ["wrong-item", "ORDER", "NORMAL", "CLOSED", "کالای اشتباه ارسال شده", "به‌جای قلادهٔ متوسط، اندازهٔ کوچک رسید.", -40],
    ["suggestion", "OTHER", "LOW", "CLOSED", "پیشنهاد: یادآور خرید غذا", "کاش برنامه زمان تمام‌شدن غذا را یادآوری کند.", -60],
    ["email-change", "ACCOUNT", "NORMAL", "RESOLVED", "تغییر ایمیل حساب", "ایمیل قدیمی‌ام دیگر فعال نیست.", -25],
    ["vet-share", "HEALTH", "HIGH", "WAITING_ON_USER", "دامپزشک پرونده را نمی‌بیند", "اشتراک پرونده را فعال کردم ولی دامپزشک چیزی نمی‌بیند.", -5],
  ];
  for (const [i, [key, category, priority, status, subject, description, daysAgo]] of CASES.entries()) {
    const createdAt = days(daysAgo);
    const progressed = status !== "OPEN";
    const done = status === "RESOLVED" || status === "CLOSED";
    const supportCase = await db.supportCase.upsert({
      where: { id: id(`case:${key}`) },
      create: {
        id: id(`case:${key}`), caseNumber: `CASE-QA8-${String(i + 1).padStart(3, "0")}`, requesterUserId: owner.id, householdId: ownerHome.id, subject: `${subject} (نمایشی)`, description, category, priority, status,
        assignedAdminId: progressed ? adminUser.id : null, createdAt, firstResponseAt: progressed ? new Date(createdAt.getTime() + 3 * 3_600_000) : null, lastUserMessageAt: createdAt,
        lastAdminMessageAt: progressed ? new Date(createdAt.getTime() + 3 * 3_600_000) : null, resolvedAt: done ? new Date(createdAt.getTime() + 2 * 86_400_000) : null, closedAt: status === "CLOSED" ? new Date(createdAt.getTime() + 3 * 86_400_000) : null,
      },
      update: {},
    });
    await db.supportMessage.upsert({ where: { id: id(`case-msg:${key}:user`) }, create: { id: id(`case-msg:${key}:user`), caseId: supportCase.id, authorType: "USER", authorUserId: owner.id, body: description, visibility: "PUBLIC", createdAt }, update: {} });
    if (progressed) {
      await db.supportMessage.upsert({ where: { id: id(`case-msg:${key}:admin`) }, create: { id: id(`case-msg:${key}:admin`), caseId: supportCase.id, authorType: "ADMIN", authorAdminId: adminUser.id, body: done ? "مشکل برطرف شد. اگر دوباره رخ داد همین‌جا بنویسید. (پاسخ نمایشی)" : "پیام شما را دریافت کردیم و در حال بررسی هستیم. (پاسخ نمایشی)", visibility: "PUBLIC", createdAt: new Date(createdAt.getTime() + 3 * 3_600_000) }, update: {} });
    }
  }

  console.log("Batch 8 QA seed ready: owner, family(+member,+invitee), trial, expired, cancelled, pastdue, grace, security(+sitter), comp — all @example.test.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
