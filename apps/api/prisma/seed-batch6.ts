/**
 * Batch 6 QA scenarios — Lost Pet, Animal Support, Donations, NGO/Shelter,
 * Community and Trust & Safety.
 *
 * Static records (organizations, staff, needs, offers, incidents, sightings,
 * community content, reports) are upserted with deterministic ids. Anything
 * with side effects that must be *real* goes through the production services
 * inside a Nest application context: donations are charged through the
 * sandbox gateway (so the cash/clearing and donation ledgers balance), the
 * refund goes through the gateway refund path, and moderation effects
 * (organization suspension, a removed-then-restored listing) are applied by
 * TrustActionService. Background workers do not start (NODE_ENV=test).
 *
 * Honesty rules: every name is marked (نمایشی)/demo, e-mails are
 * example.test, payments are sandbox only. Idempotent: re-running finds the
 * existing rows, reuses donation idempotency keys and skips moderation that
 * already happened. Runs only against a *_test database, or a staging
 * database named in PETLIFE_QA_SEED_DATABASE.
 */
import { createHash } from "node:crypto";

const database = new URL(process.env.DATABASE_URL ?? "").pathname;
if (!database.endsWith("_test") && process.env.PETLIFE_QA_SEED_DATABASE !== database.slice(1)) {
  throw new Error("This QA seed runs against a *_test database, or a staging database named in PETLIFE_QA_SEED_DATABASE.");
}
// Workers never start under test; the seed drives every side effect explicitly.
process.env.NODE_ENV = "test";

const id = (key: string) => {
  const h = createHash("sha256").update(`petlife-batch6-qa:${key}`).digest("hex").slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20)}`;
};
const DAY = 86_400_000;
const days = (n: number) => new Date(Date.now() + n * DAY);

async function main() {
  const { NestFactory } = await import("@nestjs/core");
  const { AppModule } = await import("../src/app.module");
  const { PrismaService } = await import("../src/common/prisma/prisma.service");
  const { DonationService } = await import("../src/modules/animal-support/donation.service");
  const { AdminDonationService } = await import("../src/modules/animal-support/admin-donation.service");
  const { TrustCaseService } = await import("../src/modules/admin/trust/trust-case.service");
  const { TrustActionService } = await import("../src/modules/admin/trust/trust-action.service");

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error"] });
  try {
    await seed(app, { PrismaService, DonationService, AdminDonationService, TrustCaseService, TrustActionService });
  } finally {
    await app.close();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seed(app: any, services: Record<string, any>) {
  const { PrismaService, DonationService, AdminDonationService, TrustCaseService, TrustActionService } = services;
  const db = app.get(PrismaService);
  const donations = app.get(DonationService);
  const adminDonations = app.get(AdminDonationService);
  const trustCases = app.get(TrustCaseService);
  const trustActions = app.get(TrustActionService);

  const user = (key: string, name: string) =>
    db.user.upsert({ where: { email: `${key}@example.test` }, create: { id: id(`user:${key}`), email: `${key}@example.test`, emailVerifiedAt: new Date(), displayName: name, locale: "fa" }, update: { displayName: name } });

  async function household(key: string, owner: { id: string }, petName: string, species: "DOG" | "CAT") {
    const home = await db.household.upsert({ where: { id: id(`household:${key}`) }, create: { id: id(`household:${key}`), name: `خانهٔ ${petName} (نمایشی)`, city: "تهران", countryCode: "IR" }, update: {} });
    await db.householdMember.upsert({ where: { householdId_userId: { householdId: home.id, userId: owner.id } }, create: { householdId: home.id, userId: owner.id, role: "OWNER" }, update: {} });
    const pet = await db.pet.upsert({ where: { id: id(`pet:${key}`) }, create: { id: id(`pet:${key}`), householdId: home.id, name: petName, species, approximateAgeMonths: 36 }, update: {} });
    await db.petAccessGrant.upsert({
      where: { id: id(`grant:${key}`) },
      create: { id: id(`grant:${key}`), petId: pet.id, userId: owner.id, source: "HOUSEHOLD", canViewIdentity: true, canEditIdentity: true, canViewHealth: true, canEditHealth: true, canBookCare: true, canViewCareProfile: true, canEditCareProfile: true, canViewLocation: true, canManageAccess: true },
      update: {},
    });
    return { home, pet };
  }

  // ---- People
  const dogOwner = await user("b6-dog-owner", "نرگس حیدری");
  const catOwner = await user("b6-cat-owner", "بابک سلیمانی");
  const individual = await user("b6-individual", "فرشته امینی");
  const helperA = await user("b6-helper-a", "پویا رستمی");
  const helperB = await user("b6-helper-b", "الهام نادری");
  const donorAnon = await user("b6-donor-anon", "حامد کاظمی");
  const donorPublic = await user("b6-donor-public", "سمیرا یوسفی");
  const reporter = await user("b6-reporter", "مهدی شریفی");
  const ngoOwner = await user("b6-ngo-owner", "لیلا اکبری");
  const ngoCoordinator = await user("b6-ngo-coordinator", "علی محمدی");
  const ngoViewer = await user("b6-ngo-viewer", "زهرا کریمی");
  const opsUser = await user("b6-qa-admin", "مدیر آزمایشی حمایت");
  const financeUser = await user("b6-qa-finance", "مالی آزمایشی");
  const ops = await db.adminUser.upsert({ where: { userId: opsUser.id }, create: { userId: opsUser.id, role: "ADMIN", status: "ACTIVE" }, update: {} });
  const finance = await db.adminUser.upsert({ where: { userId: financeUser.id }, create: { userId: financeUser.id, role: "FINANCE", status: "ACTIVE" }, update: {} });
  const opsCtx = { adminUserId: ops.id, userId: opsUser.id, displayName: opsUser.displayName, role: ops.role, status: ops.status };
  const financeCtx = { adminUserId: finance.id, userId: financeUser.id, displayName: financeUser.displayName, role: finance.role, status: finance.status };

  // ---- Organizations (five verification situations) with private verification documents
  const orgs = [
    { key: "verified", type: "SHELTER", name: "پناهگاه مهر (نمایشی)", status: "VERIFIED", listed: true, location: "کرج، البرز" },
    { key: "pending", type: "NGO", name: "انجمن یاران حیوانات (نمایشی)", status: "SUBMITTED", listed: false, location: "تهران" },
    { key: "needsinfo", type: "NGO", name: "خانهٔ امن گربه‌ها (نمایشی)", status: "NEEDS_INFORMATION", listed: false, location: "اصفهان" },
    { key: "suspended", type: "NGO", name: "گروه حمایت شمال (نمایشی)", status: "VERIFIED", listed: true, location: "رشت" },
    { key: "rescue", type: "RESCUE_GROUP", name: "تیم نجات جاده‌ای (نمایشی)", status: "VERIFIED", listed: true, location: "شیراز" },
  ] as const;
  const org: Record<string, { id: string }> = {};
  for (const o of orgs) {
    org[o.key] = await db.animalSupportOrganization.upsert({
      where: { id: id(`org:${o.key}`) },
      create: {
        id: id(`org:${o.key}`),
        type: o.type,
        name: o.name,
        description: "سازمان نمایشی برای آزمون؛ اطلاعات واقعی نیست.",
        location: o.location,
        verificationStatus: o.status,
        isPubliclyListed: o.listed,
        contactEmail: `contact-${o.key}@example.test`,
        verificationSubmittedAt: o.status === "VERIFIED" || o.status === "SUBMITTED" || o.status === "NEEDS_INFORMATION" ? days(-12) : null,
        verificationNote: o.status === "NEEDS_INFORMATION" ? "لطفاً تصویر پروانهٔ فعالیت را اضافه کنید." : null,
        // Canonical private prefix: never served by the public /uploads route.
        verificationDocumentKeys: [`animal-support-verification/${id(`org:${o.key}`)}/registration-qa.pdf`],
      },
      update: {},
    });
  }
  const staff = [
    ["verified", ngoOwner, "OWNER"],
    ["verified", ngoCoordinator, "COORDINATOR"],
    ["verified", ngoViewer, "VIEWER"],
    ["suspended", ngoOwner, "OWNER"],
    ["rescue", ngoCoordinator, "OWNER"],
    ["pending", ngoViewer, "OWNER"],
  ] as const;
  for (const [orgKey, member, role] of staff) {
    await db.animalSupportOrgMembership.upsert({
      where: { id: id(`membership:${orgKey}:${member.id}`) },
      create: { id: id(`membership:${orgKey}:${member.id}`), organizationId: org[orgKey]!.id, userId: member.id, role, isActive: true },
      update: { role, isActive: true },
    });
  }

  // ---- Campaigns (general + restricted) for the verified shelter
  const general = await db.supportCampaign.upsert({ where: { id: id("campaign:general") }, create: { id: id("campaign:general"), organizationId: org.verified!.id, title: "هزینه‌های جاری زمستان (نمایشی)", description: "غذا، دارو و گرمایش پناهگاه در زمستان.", fundType: "GENERAL", targetAmountIrr: 500_000_000, status: "ACTIVE", startsAt: days(-20) }, update: { status: "ACTIVE" } });
  const restricted = await db.supportCampaign.upsert({ where: { id: id("campaign:restricted") }, create: { id: id("campaign:restricted"), organizationId: org.verified!.id, title: "جراحی پای «ببری» (نمایشی)", description: "فقط برای هزینهٔ جراحی و درمان.", fundType: "RESTRICTED", targetAmountIrr: 120_000_000, status: "ACTIVE", startsAt: days(-10) }, update: { status: "ACTIVE" } });

  // ---- Support needs: five kinds, individual and organization publishers, every lifecycle state
  const base = { province: "تهران", city: "تهران", contactMode: "BOTH" as const, publishedAt: days(-8) };
  const needs = [
    { key: "food", title: "غذای خشک برای کلونی گربه‌ها (نمایشی)", category: "FOOD", urgency: "URGENT", status: "PARTIALLY_FULFILLED", orgKey: null, creator: individual, neighborhood: "یوسف‌آباد", lat: 35.7303, lng: 51.4062, needed: 10, fulfilled: 4, unit: "کیسه" },
    { key: "vet", title: "هزینهٔ درمان و جراحی «ببری» (نمایشی)", category: "VETERINARY_CARE", urgency: "CRITICAL", status: "PUBLISHED", orgKey: "verified", creator: ngoOwner, neighborhood: "مهرشهر", lat: 35.8342, lng: 50.9391, needed: null, fulfilled: 0, unit: null, campaign: restricted.id },
    { key: "foster", title: "خانهٔ موقت برای دو توله‌سگ (نمایشی)", category: "FOSTER", urgency: "IMPORTANT", status: "PAUSED", orgKey: "rescue", creator: ngoCoordinator, neighborhood: "قصردشت", lat: 29.6358, lng: 52.5024, needed: 2, fulfilled: 0, unit: "خانه" },
    { key: "transport", title: "انتقال سگ زخمی به کلینیک (نمایشی)", category: "TRANSPORT", urgency: "URGENT", status: "FULFILLED", orgKey: null, creator: individual, neighborhood: "تجریش", lat: 35.8043, lng: 51.4326, needed: 1, fulfilled: 1, unit: "سفر" },
    { key: "equipment", title: "پتو و قفس برای پناهگاه (نمایشی)", category: "SHELTER_SUPPLIES", urgency: "NORMAL", status: "EXPIRED", orgKey: "verified", creator: ngoCoordinator, neighborhood: "گوهردشت", lat: 35.8123, lng: 50.9712, needed: 20, fulfilled: 6, unit: "عدد" },
    // Published by the organization that is suspended below — the suspension pauses it.
    { key: "suspended-org", title: "دارو برای سگ‌های پناهگاه (نمایشی)", category: "MEDICINE", urgency: "IMPORTANT", status: "PUBLISHED", orgKey: "suspended", creator: ngoOwner, neighborhood: "گلسار", lat: 37.2915, lng: 49.5836, needed: 12, fulfilled: 0, unit: "بسته" },
  ] as const;
  const need: Record<string, { id: string }> = {};
  for (const n of needs) {
    const data = {
      ...base,
      creatorUserId: n.creator.id,
      organizationId: n.orgKey ? org[n.orgKey]!.id : null,
      campaignId: "campaign" in n ? n.campaign : null,
      title: n.title,
      description: "درخواست نمایشی برای آزمون کیفیت؛ نیاز واقعی نیست.",
      category: n.category,
      urgency: n.urgency,
      status: n.status,
      neighborhood: n.neighborhood,
      latitude: n.lat,
      longitude: n.lng,
      neededQuantity: n.needed,
      fulfilledQuantity: n.fulfilled,
      quantityUnit: n.unit,
      fulfilledAt: n.status === "FULFILLED" ? days(-2) : null,
      expiresAt: n.status === "EXPIRED" ? days(-1) : days(30),
      expiryWarnedAt: n.status === "EXPIRED" ? days(-4) : null,
    };
    // Create-only: a rerun must not undo moderation effects applied below.
    need[n.key] = await db.supportNeedListing.upsert({ where: { id: id(`need:${n.key}`) }, create: { id: id(`need:${n.key}`), ...data }, update: {} });
  }

  // ---- Help offers in every state
  const offers = [
    ["food:a", "food", helperA, "COMPLETED", 4, "FOOD", "چهار کیسه غذا تحویل داده شد."],
    ["food:b", "food", helperB, "IN_PROGRESS", null, "FOOD", "سه کیسه دیگر تا آخر هفته."],
    ["vet:a", "vet", helperA, "PENDING", null, "TRANSPORT", "می‌توانم برای ویزیت بعدی رفت‌وآمد را انجام دهم."],
    ["foster:b", "foster", helperB, "ACCEPTED", null, "FOSTER", "برای دو هفته جا دارم."],
    ["transport:a", "transport", helperA, "COMPLETED", 1, "TRANSPORT", "به کلینیک رسید."],
    ["equipment:b", "equipment", helperB, "DECLINED", null, "SHELTER_SUPPLIES", "دو پتوی قدیمی."],
  ] as const;
  for (const [key, needKey, helper, status, quantity, helpType, message] of offers) {
    const data = { listingId: need[needKey]!.id, helperUserId: helper.id, message, helpType, status, timing: "این هفته", fulfilledQuantity: status === "COMPLETED" ? quantity : null, respondedAt: status === "PENDING" ? null : days(-3) };
    await db.helpOffer.upsert({ where: { id: id(`offer:${key}`) }, create: { id: id(`offer:${key}`), ...data }, update: data });
  }

  // ---- Lost pets: active dog, active cat with several sightings, recovered, closed historical
  const dog = await household("dog", dogOwner, "راکی", "DOG");
  const cat = await household("cat", catOwner, "نازی", "CAT");
  const oldDog = await household("olddog", dogOwner, "جکی", "DOG");
  const recovered = await household("recovered", catOwner, "پیشی", "CAT");
  const incidents = [
    { key: "dog", pet: dog, owner: dogOwner, status: "SEARCHING", area: "پارک ملت، ولنجک", exact: "ولنجک، کوچهٔ ۱۲، پلاک ۴", lat: 35.8069, lng: 51.4053, seen: days(-1) },
    { key: "cat", pet: cat, owner: catOwner, status: "SIGHTING_REPORTED", area: "نزدیک میدان ونک", exact: "ونک، خیابان ملاصدرا، کوچهٔ شیراز", lat: 35.7572, lng: 51.4106, seen: days(-2) },
    { key: "recovered", pet: recovered, owner: catOwner, status: "REUNITED", area: "سعادت‌آباد", exact: "سعادت‌آباد، بلوار دریا", lat: 35.7786, lng: 51.3775, seen: days(-9) },
    { key: "closed", pet: oldDog, owner: dogOwner, status: "CLOSED", area: "شهرک غرب", exact: "شهرک غرب، فاز ۲", lat: 35.7563, lng: 51.3767, seen: days(-60) },
  ] as const;
  const incident: Record<string, { id: string }> = {};
  for (const i of incidents) {
    const data = {
      petId: i.pet.pet.id,
      householdId: i.pet.home.id,
      status: i.status,
      publicArea: i.area,
      lastKnownLocation: i.exact,
      lastKnownLatitude: i.lat,
      lastKnownLongitude: i.lng,
      lastSeenAt: i.seen,
      description: "گزارش نمایشی برای آزمون؛ حیوان واقعی گم نشده است.",
      privateNotes: "شمارهٔ میکروچیپ در پروندهٔ خصوصی (نمایشی).",
      contactPreference: "IN_APP_MESSAGE" as const,
      createdByUserId: i.owner.id,
      foundAt: i.status === "REUNITED" ? days(-7) : null,
      reunitedAt: i.status === "REUNITED" ? days(-7) : null,
      closedAt: i.status === "CLOSED" ? days(-50) : null,
    };
    // The DB forbids found/closed timestamps before the report itself, so historical incidents are created in the past.
    const createdAt = new Date(i.seen.getTime() + 60 * 60 * 1000);
    incident[i.key] = await db.lostPetIncident.upsert({ where: { id: id(`incident:${i.key}`) }, create: { id: id(`incident:${i.key}`), createdAt, ...data }, update: data });
  }
  await db.pet.update({ where: { id: dog.pet.id }, data: { lifecycleStatus: "LOST" } });
  await db.pet.update({ where: { id: cat.pet.id }, data: { lifecycleStatus: "LOST" } });
  const sightings = [
    ["cat:1", "cat", reporter.id, "SUBMITTED", "کنار ایستگاه مترو ونک", "گربهٔ خاکستری با قلادهٔ قرمز"],
    ["cat:2", "cat", null, "ACCEPTED", "پارکینگ مرکز خرید", "احتمالاً همان گربه"],
    ["cat:3", "cat", helperB.id, "REJECTED", "خیابان گاندی", "گربهٔ دیگری بود"],
    ["dog:1", "dog", helperA.id, "SUBMITTED", "ورودی پارک ملت", "سگ قهوه‌ای بدون قلاده"],
  ] as const;
  for (const [key, incidentKey, reporterId, status, location, description] of sightings) {
    const data = { incidentId: incident[incidentKey]!.id, reporterUserId: reporterId, status, location, description, seenAt: days(-1), latitude: 35.757, longitude: 51.41, reviewedAt: status === "SUBMITTED" ? null : days(-1) };
    await db.lostPetSighting.upsert({ where: { id: id(`sighting:${key}`) }, create: { id: id(`sighting:${key}`), ...data }, update: data });
  }

  // ---- Community: text, photo, question, lost-pet update, support update, comments and reactions
  const posts = [
    ["text", individual, "GENERAL", "تجربهٔ اولین هفته با گربهٔ نجات‌یافته (نمایشی)", "این هفته یاد گرفتم صبور باشم؛ اول فقط اتاق آرام.", [], "USER", null, null],
    ["photo", helperA, "GENERAL", "عکس بعد از حمام (نمایشی)", "بالاخره آرام شد!", ["/images/experience/grooming-hero.png"], "USER", null, null],
    ["question", catOwner, "QUESTION", "بهترین غذای گربهٔ سالمند؟ (نمایشی)", "گربهٔ ۱۲ ساله دارم، پیشنهادی دارید؟", [], "USER", null, null],
    ["lostpet", dogOwner, "LOST_PET_SHARE", "راکی گم شده — پارک ملت (نمایشی)", "آخرین بار حوالی پارک ملت دیده شده. اگر دیدید در برنامه گزارش دهید.", [], "LOST_PET_INCIDENT", incident.dog!.id, null],
    ["support", ngoOwner, "RESCUE", "به‌روزرسانی جراحی ببری (نمایشی)", "جراحی موفق بود؛ هنوز به هزینهٔ فیزیوتراپی نیاز داریم.", [], "SUPPORT_CAMPAIGN", null, restricted.id],
  ] as const;
  const post: Record<string, { id: string }> = {};
  for (const [key, author, type, title, body, media, sourceType, lostId, campaignId] of posts) {
    const data = { authorUserId: author.id, type, title, body, locale: "fa" as const, countryCode: "IR", mediaObjectKeys: [...media], status: "PUBLISHED" as const, sourceType, sourceLostPetIncidentId: lostId, sourceSupportCampaignId: campaignId };
    post[key] = await db.communityPost.upsert({ where: { id: id(`post:${key}`) }, create: { id: id(`post:${key}`), ...data }, update: data });
  }
  await db.communityComment.upsert({ where: { id: id("comment:question:1") }, create: { id: id("comment:question:1"), postId: post.question!.id, authorUserId: helperB.id, body: "غذای مخصوص سالمندان با پروتئین قابل هضم (نمایشی).", status: "PUBLISHED" }, update: {} });
  await db.communityComment.upsert({ where: { id: id("comment:text:1") }, create: { id: id("comment:text:1"), postId: post.text!.id, authorUserId: catOwner.id, body: "چه خوب! موفق باشید.", status: "PUBLISHED" }, update: {} });
  for (const [postKey, u, type] of [["photo", catOwner, "LOVE"], ["question", dogOwner, "HELPFUL"], ["support", donorPublic, "LIKE"]] as const) {
    await db.communityReaction.upsert({ where: { postId_userId: { postId: post[postKey]!.id, userId: u.id } }, create: { postId: post[postKey]!.id, userId: u.id, type }, update: { type } });
  }

  // ---- Donations through the real sandbox payment path (ledger-correct), then one real refund
  const general1 = await donations.donate(general.id, donorAnon.id, { amountIrr: 20_000_000, idempotencyKey: "b6-qa-general-anon" });
  await donations.donate(general.id, donorPublic.id, { amountIrr: 35_000_000, showDonorPublicly: true, publicDisplayName: "سمیرا", idempotencyKey: "b6-qa-general-public" });
  await donations.donate(restricted.id, donorPublic.id, { amountIrr: 50_000_000, showDonorPublicly: true, publicDisplayName: "سمیرا", supportNeedListingId: need.vet!.id, idempotencyKey: "b6-qa-restricted-public" });
  const toRefund = await donations.donate(restricted.id, donorAnon.id, { amountIrr: 10_000_000, supportNeedListingId: need.vet!.id, idempotencyKey: "b6-qa-restricted-refund" });
  void general1;
  const refundId = (toRefund as { donationIntentId?: string }).donationIntentId;
  if (refundId && (await db.donationIntent.findUniqueOrThrow({ where: { id: refundId } })).status === "SUCCEEDED") {
    await adminDonations.refundDonation(financeCtx, refundId, "درخواست اهداکننده برای لغو (نمایشی)");
  }

  // ---- Reports and Trust & Safety, with real effects
  const report = (key: string, data: Record<string, unknown>) => db.communityReport.upsert({ where: { id: id(`report:${key}`) }, create: { id: id(`report:${key}`), reporterUserId: reporter.id, ...data } as never, update: {} });
  await report("open-post", { postId: post.photo!.id, reason: "SPAM", details: "تبلیغ تکراری (نمایشی)", status: "OPEN" });
  await report("dismissed-question", { postId: post.question!.id, reason: "MISINFORMATION", details: "به نظرم اشتباه است (نمایشی)", status: "DISMISSED" });
  const escalatedNeed = await report("escalated-need", { supportNeedListingId: need.food!.id, reason: "SCAM", details: "درخواست کارت‌به‌کارت (نمایشی)", status: "OPEN" });
  const escalatedOrg = await report("escalated-org", { organizationId: org.suspended!.id, reason: "SCAM", details: "کمک‌ها به مقصد نمی‌رسد (نمایشی)", status: "OPEN" });

  async function caseFor(subjectType: "SUPPORT_NEED" | "ANIMAL_SUPPORT_ORGANIZATION", subjectId: string, reason: string, reportId: string) {
    const existing = await db.trustCase.findFirst({ where: { subjectType, subjectId } });
    if (existing) return { id: existing.id, fresh: false };
    const opened = await trustCases.open(opsCtx, { subjectType: subjectType as never, subjectId, reason, severity: "MEDIUM" as never });
    await db.communityReport.update({ where: { id: reportId }, data: { status: "ESCALATED", trustCaseId: opened.id } });
    return { id: opened.id, fresh: true };
  }
  // A listing removed on a report and then restored — the history keeps both actions.
  const needCase = await caseFor("SUPPORT_NEED", need.food!.id, "گزارش کلاهبرداری روی درخواست غذا (نمایشی)", escalatedNeed.id);
  if (needCase.fresh) {
    await trustActions.take(opsCtx, needCase.id, { actionType: "REMOVE_CONTENT" as never, reason: "بررسی اولیه: حذف موقت (نمایشی)" });
    await trustActions.take(opsCtx, needCase.id, { actionType: "RESTORE" as never, reason: "منتشرکننده مدارک ارائه داد (نمایشی)" });
  }
  // An organization suspended after a scam report: unlisted and its live requests paused.
  const orgCase = await caseFor("ANIMAL_SUPPORT_ORGANIZATION", org.suspended!.id, "گزارش‌های متعدد کلاهبرداری (نمایشی)", escalatedOrg.id);
  if (orgCase.fresh) await trustActions.take(opsCtx, orgCase.id, { actionType: "SUSPEND" as never, reason: "تعلیق تا بررسی مدارک (نمایشی)" });
  // An open case with an actionable subject and no decision yet.
  const escalatedIncident = await report("escalated-incident", { lostPetIncidentId: incident.cat!.id, reason: "MISINFORMATION", details: "عکس با توضیح نمی‌خواند (نمایشی)", status: "OPEN" });
  const openCase = await db.trustCase.findFirst({ where: { subjectType: "PET_INCIDENT", subjectId: incident.cat!.id } });
  if (!openCase) {
    const opened = await trustCases.open(opsCtx, { subjectType: "PET_INCIDENT" as never, subjectId: incident.cat!.id, reason: "بررسی گزارش مشاهدهٔ مشکوک (نمایشی)", severity: "LOW" as never });
    await db.communityReport.update({ where: { id: escalatedIncident.id }, data: { status: "ESCALATED", trustCaseId: opened.id } });
  }

  console.log("Batch 6 QA seed ready: 5 organizations (verified, pending, needs-info, suspended, rescue), 6 needs, 6 offers, 4 incidents, 4 sightings, 5 posts, 4 donations (1 refunded), 5 reports, 3 trust cases — all @example.test.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
