/**
 * Sprint demo coverage so design work has every real state to draw against. Run after seed-clinic-chat-demo.ts.
 * Idempotent (deterministic ids, stable donation idempotency keys), non-destructive, demo accounts only
 * (…@example.test), and refuses any database that is not *_test unless PETLIFE_QA_SEED_DATABASE names it.
 *
 * - Animal support: cash-only, item-only, mixed, partially funded and fully fulfilled needs; an active pledge
 *   and a received in-kind contribution. Cash goes through the real DonationService sandbox path, so the
 *   donation ledger balances exactly as for a real donation.
 * - Pet taxi: requested/confirmed/completed rides with a route snapshot priced by an explicit QA_DEMO_TARIFF.
 *   The service's live tariff row stays INACTIVE, so real quotes keep saying NOT_CONFIGURED.
 * - Chat: a third member, a reported message and a block.
 * - Clinic: a vet seat, an access grant from the booking, a completed visit with vitals.
 */
import { createHash } from "node:crypto";

const id = (key: string) => {
  const h = createHash("sha1").update(`sprint-demo-extras:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const DAY = 86400e3;

/** QA/demo only — NOT a business price. Real tariffs are a product decision (PRODUCT_DECISION_LATER). */
const QA_DEMO_TARIFF = { baseFareIrr: 400_000, perKmRateIrr: 50_000, serviceAdjustmentIrr: 0, minimumFareIrr: 600_000 } as const;

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "").pathname;
  if (!database.endsWith("_test") && process.env.PETLIFE_QA_SEED_DATABASE !== database.slice(1)) {
    throw new Error("This demo seed runs against a *_test database, or a staging database named in PETLIFE_QA_SEED_DATABASE.");
  }
  const { NestFactory } = await import("@nestjs/core");
  const { AppModule } = await import("../src/app.module");
  const { PrismaService } = await import("../src/common/prisma/prisma.service");
  const { DonationService } = await import("../src/modules/animal-support/donation.service");
  const { computeTransportFare, straightLineMeters } = await import("../src/modules/booking/transport/transport-fare.util");
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error"] });
  try {
    const db = app.get(PrismaService);
    const donations = app.get(DonationService);

    const user = async (email: string, displayName: string) => {
      if (!email.endsWith("@example.test")) throw new Error("demo accounts only");
      return db.user.upsert({ where: { email }, create: { id: id(`user:${email}`), email, displayName, locale: "fa" }, update: {} });
    };
    const helperA = await user("support-helper-a@example.test", "مینا (داوطلب نمایشی)");
    const helperB = await user("support-helper-b@example.test", "آرش (داوطلب نمایشی)");
    const donor = await user("support-donor@example.test", "حامی نمایشی");

    // ---------------------------------------------------------------- Animal support
    const campaign = await db.supportCampaign.findFirst({ where: { status: "ACTIVE", organization: { verificationStatus: "VERIFIED", name: { contains: "(نمایشی)" } } }, orderBy: { createdAt: "asc" } })
      ?? (await (async () => {
        const org = await db.animalSupportOrganization.upsert({ where: { id: id("org") }, create: { id: id("org"), type: "SHELTER", name: "پناهگاه نمونه (نمایشی)", verificationStatus: "VERIFIED" }, update: {} });
        return db.supportCampaign.upsert({ where: { id: id("campaign") }, create: { id: id("campaign"), organizationId: org.id, title: "کمپین درمان (نمایشی)", description: "کمپین نمونه برای درمان حیوانات پناهگاه.", status: "ACTIVE" }, update: {} });
      })());
    const base = { organizationId: campaign.organizationId, campaignId: campaign.id, province: "تهران", city: "تهران", animalType: "سگ", publishedAt: new Date(), expiresAt: new Date(Date.now() + 60 * DAY) };
    type Need = { key: string; title: string; description: string; category: "VETERINARY_CARE" | "FOOD" | "MEDICINE" | "EQUIPMENT"; contactMode: "DONATE" | "OFFER_HELP" | "BOTH"; targetAmountIrr?: number; neededQuantity?: number; quantityUnit?: string; urgency?: "NORMAL" | "URGENT" };
    const needs: Need[] = [
      { key: "cash-only", title: "هزینهٔ جراحی پای «رعنا» (نمایشی)", description: "فقط کمک نقدی: هزینهٔ جراحی و بستری سه‌روزه.", category: "VETERINARY_CARE", contactMode: "DONATE", targetAmountIrr: 80_000_000, urgency: "URGENT" },
      { key: "item-only", title: "۲۰ کیلو غذای خشک سگ (نمایشی)", description: "فقط کمک کالایی: غذای خشک سگ بالغ برای یک ماه.", category: "FOOD", contactMode: "OFFER_HELP", neededQuantity: 20, quantityUnit: "کیلوگرم" },
      { key: "mixed", title: "دارو و هزینهٔ درمان پوستی (نمایشی)", description: "هم دارو (۱۰ بسته) و هم کمک نقدی برای ویزیت‌های پیگیری.", category: "MEDICINE", contactMode: "BOTH", targetAmountIrr: 40_000_000, neededQuantity: 10, quantityUnit: "بسته" },
      { key: "fulfilled", title: "قفس حمل برای انتقال (نمایشی) — تکمیل شد", description: "۵ قفس حمل و هزینهٔ انتقال؛ همه تأمین شد.", category: "EQUIPMENT", contactMode: "BOTH", targetAmountIrr: 20_000_000, neededQuantity: 5, quantityUnit: "عدد" },
    ];
    const ids: Record<string, string> = {};
    for (const n of needs) {
      const row = await db.supportNeedListing.upsert({
        where: { id: id(`need:${n.key}`) },
        create: { id: id(`need:${n.key}`), ...base, title: n.title, description: n.description, category: n.category, contactMode: n.contactMode, urgency: n.urgency ?? "NORMAL", status: "PUBLISHED", targetAmountIrr: n.targetAmountIrr ?? null, neededQuantity: n.neededQuantity ?? null, quantityUnit: n.quantityUnit ?? null },
        update: {},
      });
      ids[n.key] = row.id;
    }
    // Cash through the real sandbox path (idempotent keys). Donations land while the need is live.
    const give = async (key: string, listing: string, amountIrr: number) => {
      const live = await db.supportNeedListing.findUniqueOrThrow({ where: { id: ids[listing]! } });
      if (!["PUBLISHED", "PARTIALLY_FULFILLED"].includes(live.status)) return;
      await donations.donate(campaign.id, donor.id, { amountIrr, supportNeedListingId: ids[listing]!, idempotencyKey: `sprint-demo-${key}` });
    };
    await give("cash-only-1", "cash-only", 30_000_000); // partially funded: 30M of 80M
    await give("mixed-1", "mixed", 15_000_000);
    await give("fulfilled-1", "fulfilled", 20_000_000); // fully funded

    const offer = (key: string, listing: string, helperUserId: string, status: "PENDING" | "ACCEPTED" | "COMPLETED", quantity: number, helpType: Need["category"], message: string) =>
      db.helpOffer.upsert({
        where: { id: id(`offer:${key}`) },
        create: { id: id(`offer:${key}`), listingId: ids[listing]!, helperUserId, status, quantity, helpType, message, respondedAt: status === "PENDING" ? null : new Date(), fulfilledQuantity: status === "COMPLETED" ? quantity : null },
        update: {},
      });
    await offer("item-received", "item-only", helperA.id, "COMPLETED", 8, "FOOD", "۸ کیلو غذا را تحویل پناهگاه دادم."); // received in-kind
    await offer("item-pledge", "item-only", helperB.id, "ACCEPTED", 5, "FOOD", "۵ کیلو غذا تا آخر هفته می‌آورم."); // active pledge
    await offer("item-pending", "item-only", donor.id, "PENDING", 3, "FOOD", "می‌توانم ۳ کیلو تهیه کنم.");
    await offer("mixed-received", "mixed", helperA.id, "COMPLETED", 4, "MEDICINE", "۴ بسته دارو تحویل شد.");
    await offer("fulfilled-received", "fulfilled", helperB.id, "COMPLETED", 5, "EQUIPMENT", "۵ قفس حمل تحویل شد.");
    await db.supportNeedListing.update({ where: { id: ids["item-only"]! }, data: { status: "PARTIALLY_FULFILLED", fulfilledQuantity: 8 } });
    await db.supportNeedListing.update({ where: { id: ids["mixed"]! }, data: { status: "PARTIALLY_FULFILLED", fulfilledQuantity: 4 } });
    await db.supportNeedListing.updateMany({ where: { id: ids["fulfilled"]!, fulfilledAt: null }, data: { status: "FULFILLED", fulfilledQuantity: 5, fulfilledAt: new Date() } });

    // Engagement: a progress update, a follower, a saved need and volunteer interest.
    await db.supportNeedUpdate.upsert({ where: { id: id("need-update") }, create: { id: id("need-update"), listingId: ids["cash-only"]!, authorUserId: donor.id, body: "رعنا امروز جراحی شد و حالش خوب است. ممنون از همه‌ی حامیان (به‌روزرسانی نمایشی)." }, update: {} });
    await db.animalSupportOrgFollow.upsert({ where: { userId_organizationId: { userId: helperA.id, organizationId: campaign.organizationId } }, create: { userId: helperA.id, organizationId: campaign.organizationId }, update: {} });
    await db.supportNeedBookmark.upsert({ where: { userId_listingId: { userId: helperB.id, listingId: ids["mixed"]! } }, create: { userId: helperB.id, listingId: ids["mixed"]! }, update: {} });
    await db.volunteerInterest.upsert({ where: { userId_organizationId: { userId: helperB.id, organizationId: campaign.organizationId } }, create: { userId: helperB.id, organizationId: campaign.organizationId, kinds: ["TRANSPORT", "DELIVERY"], city: "تهران", availability: "آخر هفته‌ها", shareContact: true }, update: {} });

    // ---------------------------------------------------------------- Pet taxi
    const customer = await db.user.findUniqueOrThrow({ where: { email: "clinic-demo-customer@example.test" } });
    const membership = await db.householdMember.findFirstOrThrow({ where: { userId: customer.id, role: "OWNER" } });
    const pet = await db.pet.findFirstOrThrow({ where: { householdId: membership.householdId }, orderBy: { createdAt: "asc" } });
    const pickup = await db.customerAddress.upsert({ where: { id: id("addr:home") }, create: { id: id("addr:home"), householdId: membership.householdId, label: "خانه", addressLine: "سعادت‌آباد، خیابان سرو (نمایشی)", city: "تهران", countryCode: "IR", latitude: 35.7797, longitude: 51.3714 }, update: {} });
    const dropoff = await db.customerAddress.upsert({ where: { id: id("addr:clinic") }, create: { id: id("addr:clinic"), householdId: membership.householdId, label: "درمانگاه", addressLine: "ونک، خیابان ملاصدرا (نمایشی)", city: "تهران", countryCode: "IR", latitude: 35.7575, longitude: 51.4094 }, update: {} });
    const taxi = await db.providerService.findFirst({ where: { locationMode: "TRANSPORT", isActive: true }, include: { location: true } });
    let rides = 0;
    if (taxi) {
      const location = taxi.location ?? (await db.providerLocation.findFirstOrThrow({ where: { providerOrganizationId: taxi.providerOrganizationId } }));
      const meters = straightLineMeters({ lat: pickup.latitude!, lng: pickup.longitude! }, { lat: dropoff.latitude!, lng: dropoff.longitude! });
      const fare = computeTransportFare({ ...QA_DEMO_TARIFF, distanceMeters: meters });
      const ridesDef: [string, number, "REQUESTED" | "CONFIRMED" | "COMPLETED"][] = [["ride-requested", 2, "REQUESTED"], ["ride-confirmed", 4, "CONFIRMED"], ["ride-completed", -6, "COMPLETED"]];
      for (const [key, offsetDays, status] of ridesDef) {
        const startAt = new Date(Math.floor((Date.now() + offsetDays * DAY) / 3600e3) * 3600e3);
        await db.booking.upsert({
          where: { id: id(key) },
          create: {
            id: id(key), householdId: membership.householdId, petId: pet.id, userId: customer.id, providerOrganizationId: taxi.providerOrganizationId, providerLocationId: location.id, providerServiceId: taxi.id,
            category: taxi.category, locationMode: "TRANSPORT", customerAddressId: pickup.id, dropoffAddressId: dropoff.id, startAt, endAt: new Date(startAt.getTime() + 45 * 60e3), timezone: "Asia/Tehran",
            bookingStatus: status, bookingMode: status === "REQUESTED" ? "REQUEST" : "INSTANT", requestExpiresAt: status === "REQUESTED" ? new Date(Date.now() + 2 * DAY) : null,
            priceAmount: fare.estimatedFareIrr, currency: "IRR", paymentMode: "PAY_AT_PROVIDER", serviceNameSnapshot: taxi.name,
            ...(status === "COMPLETED" ? { completedAt: new Date(startAt.getTime() + 45 * 60e3), completionNote: "پت سالم به مقصد رسید." } : {}),
            transportRoute: {
              create: {
                pickupAddressText: `${pickup.addressLine}، ${pickup.city}`, pickupLat: pickup.latitude, pickupLng: pickup.longitude,
                dropoffAddressText: `${dropoff.addressLine}، ${dropoff.city}`, dropoffLat: dropoff.latitude, dropoffLng: dropoff.longitude,
                distanceMeters: meters, distanceSource: "STRAIGHT_LINE_DEMO",
                baseFareIrr: fare.baseFareIrr, perKmRateIrr: QA_DEMO_TARIFF.perKmRateIrr, serviceAdjustmentIrr: fare.serviceAdjustmentIrr, minimumFareIrr: fare.minimumFareIrr, estimatedFareIrr: fare.estimatedFareIrr, distancePricingApplied: true,
              },
            },
          },
          update: {},
        });
        rides++;
      }
      // Declared ride needs and the manual (no-GPS) timeline for the demo rides.
      await db.bookingTransportRoute.updateMany({ where: { bookingId: { in: [id("ride-confirmed"), id("ride-completed")] } }, data: { requirements: ["CRATE_REQUIRED"] } });
      const driver = await db.providerUser.findFirstOrThrow({ where: { providerOrganizationId: taxi.providerOrganizationId, removedAt: null } });
      const rideEvents: [string, ("DRIVER_ASSIGNED" | "ARRIVING" | "PICKED_UP" | "DROPPED_OFF")[]][] = [["ride-confirmed", ["DRIVER_ASSIGNED"]], ["ride-completed", ["DRIVER_ASSIGNED", "ARRIVING", "PICKED_UP", "DROPPED_OFF"]]];
      for (const [key, types] of rideEvents) {
        const b = await db.booking.findUniqueOrThrow({ where: { id: id(key) } });
        for (const [i, type] of types.entries()) {
          await db.bookingRideEvent.upsert({ where: { bookingId_type: { bookingId: b.id, type } }, create: { bookingId: b.id, type, actorProviderUserId: driver.id, occurredAt: new Date(b.startAt.getTime() + (i - 1) * 10 * 60e3) }, update: {} });
        }
      }
    }

    // ---------------------------------------------------------------- Chat: report + block
    const reviewer = await user("batch2-review@example.test", "بازبین نمایشی");
    const spammer = await user("chat-demo-seller@example.test", "فروشندهٔ ناشناس (نمایشی)");
    const pairKey = reviewer.id < spammer.id ? `${reviewer.id}:${spammer.id}` : `${spammer.id}:${reviewer.id}`;
    const conv = await db.chatConversation.upsert({ where: { pairKey }, create: { id: id("chat:spam"), pairKey, lastMessageAt: new Date(Date.now() - 3600e3) }, update: {} });
    for (const u of [reviewer.id, spammer.id]) await db.chatParticipant.upsert({ where: { conversationId_userId: { conversationId: conv.id, userId: u } }, create: { conversationId: conv.id, userId: u, lastReadAt: u === reviewer.id ? new Date() : null }, update: {} });
    const bad = await db.chatMessage.upsert({ where: { id: id("chat:spam:m1") }, create: { id: id("chat:spam:m1"), conversationId: conv.id, senderUserId: spammer.id, body: "تخفیف ویژه! برای خرید کارت‌به‌کارت کنید (نمونهٔ پیام مشکوک).", createdAt: new Date(Date.now() - 3600e3) }, update: {} });
    await db.communityReport.upsert({ where: { id: id("chat:spam:report") }, create: { id: id("chat:spam:report"), reporterUserId: reviewer.id, reason: "SCAM", details: "درخواست کارت‌به‌کارت در پیام خصوصی (نمایشی)", chatMessageId: bad.id }, update: {} });
    await db.userBlock.upsert({ where: { blockerUserId_blockedUserId: { blockerUserId: reviewer.id, blockedUserId: spammer.id } }, create: { blockerUserId: reviewer.id, blockedUserId: spammer.id }, update: {} });

    // ---------------------------------------------------------------- Community: topics, city, a reply thread, a saved post
    const cpost = (key: string, data: Record<string, unknown>) => db.communityPost.upsert({ where: { id: id(`post:${key}`) }, create: { id: id(`post:${key}`), type: "GENERAL", ...data } as never, update: {} });
    const p1 = await cpost("vaccine-q", { authorUserId: reviewer.id, title: "واکسن سالانه‌ی سگ‌ها را کجا بزنیم؟", body: "در تهران کدام درمانگاه‌ها نوبت آخر هفته دارند؟ (پست نمایشی)", topics: ["DOGS", "HEALTH"], city: "تهران" });
    await cpost("cat-food", { authorUserId: helperA.id, title: "غذای گربه‌ی مسن", body: "برای گربه‌ی ۱۲ ساله چه غذایی مناسب است؟ (پست نمایشی)", topics: ["CATS", "NUTRITION"], city: "اصفهان" });
    await cpost("training", { authorUserId: helperB.id, body: "تمرین «بمان» را با جایزه‌های کوچک شروع کردیم و جواب داد. (پست نمایشی)", topics: ["DOGS", "TRAINING"] });
    const top = await db.communityComment.upsert({ where: { id: id("comment:top") }, create: { id: id("comment:top"), postId: p1.id, authorUserId: helperA.id, body: "درمانگاه مهر جمعه‌ها هم نوبت می‌دهد. (نظر نمایشی)" }, update: {} });
    await db.communityComment.upsert({ where: { id: id("comment:reply") }, create: { id: id("comment:reply"), postId: p1.id, authorUserId: reviewer.id, body: "ممنون، امتحان می‌کنم. (پاسخ نمایشی)", parentCommentId: top.id }, update: {} });
    await db.communityPostBookmark.upsert({ where: { userId_postId: { userId: helperB.id, postId: p1.id } }, create: { userId: helperB.id, postId: p1.id }, update: {} });

    // Chat controls for the reviewer: the support conversation archived, the spam one muted, a third deleted-for-self.
    const helperPair = reviewer.id < helperA.id ? `${reviewer.id}:${helperA.id}` : `${helperA.id}:${reviewer.id}`;
    const hiddenConv = await db.chatConversation.upsert({ where: { pairKey: helperPair }, create: { id: id("chat:hidden"), pairKey: helperPair, lastMessageAt: new Date(Date.now() - 5 * DAY) }, update: {} });
    for (const u of [reviewer.id, helperA.id]) await db.chatParticipant.upsert({ where: { conversationId_userId: { conversationId: hiddenConv.id, userId: u } }, create: { conversationId: hiddenConv.id, userId: u }, update: {} });
    await db.chatMessage.upsert({ where: { id: id("chat:hidden:m1") }, create: { id: id("chat:hidden:m1"), conversationId: hiddenConv.id, senderUserId: helperA.id, body: "سلام، برای انتقال غذا هماهنگ کنیم؟ (پیام نمایشی)", createdAt: new Date(Date.now() - 5 * DAY) }, update: {} });
    await db.chatParticipant.update({ where: { conversationId_userId: { conversationId: hiddenConv.id, userId: reviewer.id } }, data: { hiddenAt: new Date(Date.now() - 4 * DAY), clearedAt: new Date(Date.now() - 4 * DAY) } });
    await db.chatParticipant.update({ where: { conversationId_userId: { conversationId: conv.id, userId: reviewer.id } }, data: { mutedUntil: new Date("9999-12-31T00:00:00Z") } });
    const customerConv = await db.chatConversation.findUnique({ where: { id: "25eca4b0-2b66-4361-8e88-59c54571265f" } });
    if (customerConv) await db.chatParticipant.updateMany({ where: { conversationId: customerConv.id, userId: { not: reviewer.id } }, data: { archivedAt: new Date() } });

    // Content feedback on a demo guide (one helpful, one not helpful with a reason).
    const guide = await db.articleLocale.findFirst({ where: { slug: "dog-vaccination-schedule" }, select: { articleId: true } });
    if (guide) {
      await db.articleFeedback.upsert({ where: { articleId_userId: { articleId: guide.articleId, userId: helperA.id } }, create: { articleId: guide.articleId, userId: helperA.id, helpful: true }, update: {} });
      await db.articleFeedback.upsert({ where: { articleId_userId: { articleId: guide.articleId, userId: helperB.id } }, create: { articleId: guide.articleId, userId: helperB.id, helpful: false, reason: "جدول واکسن گربه هم لازم است." }, update: {} });
    }

    // ---------------------------------------------------------------- Clinic: vet seat, grant, visit + vitals
    const owner = await db.providerUser.findFirstOrThrow({ where: { role: "OWNER", removedAt: null, user: { email: "batch3-clinic-owner@example.test" } } });
    const vetUser = await user("clinic-demo-vet@example.test", "دکتر نیلوفر (دامپزشک نمایشی)");
    const vet = (await db.providerUser.findFirst({ where: { providerOrganizationId: owner.providerOrganizationId, userId: vetUser.id, removedAt: null } }))
      ?? (await db.providerUser.create({ data: { id: id("clinic:vet"), providerOrganizationId: owner.providerOrganizationId, userId: vetUser.id, role: "VET", displayTitle: "دامپزشک" } }));
    // A pending invitation so the invitation states can be designed against real data.
    const invitee = await user("clinic-demo-invitee@example.test", "سارا (دعوت‌شدهٔ نمایشی)");
    const pendingExists = await db.clinicInvitation.count({ where: { providerOrganizationId: owner.providerOrganizationId, invitedUserId: invitee.id, status: "PENDING" } });
    if (!pendingExists) {
      await db.clinicInvitation.create({ data: { providerOrganizationId: owner.providerOrganizationId, invitedUserId: invitee.id, role: "STAFF", displayTitle: "پذیرش", invitedByProviderUserId: owner.id, expiresAt: new Date(Date.now() + 7 * DAY) } });
    }
    // An intake form on the demo clinic's first service.
    const clinicService = await db.providerService.findFirst({ where: { providerOrganizationId: owner.providerOrganizationId, isActive: true }, orderBy: { createdAt: "asc" } });
    if (clinicService && !(await db.serviceIntakeForm.count({ where: { providerServiceId: clinicService.id } }))) {
      await db.serviceIntakeForm.create({ data: { providerServiceId: clinicService.id, version: 1, createdByProviderUserId: owner.id, questions: [
        { key: "symptoms", type: "LONG_TEXT", label: "علت مراجعه و علائم", required: true },
        { key: "vaccinated", type: "YES_NO", label: "واکسن‌ها به‌روز است؟", required: true },
        { key: "temperament", type: "SINGLE_CHOICE", label: "رفتار در معاینه", required: false, options: ["آرام", "مضطرب", "پرخاشگر"] },
      ] } });
    }
    const clinicPet = await db.pet.findFirstOrThrow({ where: { bookings: { some: { providerOrganizationId: owner.providerOrganizationId, user: { email: "clinic-demo-customer@example.test" } } } } });
    for (const [key, uid] of [["owner", owner.userId], ["vet", vetUser.id]] as const) {
      await db.petAccessGrant.upsert({ where: { id: id(`grant:${key}`) }, create: { id: id(`grant:${key}`), petId: clinicPet.id, userId: uid, canViewIdentity: true, canViewHealth: true, canRecordClinicalData: true, source: "TEMPORARY", reason: "DEMO_CLINIC_CARE", expiresAt: new Date(Date.now() + 30 * DAY) }, update: {} });
    }
    const visitAt = new Date(Date.now() - 12 * DAY);
    await db.clinicalVisit.upsert({
      where: { id: id("clinic:visit") },
      create: { id: id("clinic:visit"), petId: clinicPet.id, householdId: clinicPet.householdId, providerOrganizationId: owner.providerOrganizationId, providerUserId: vet.id, status: "COMPLETED", startedAt: visitAt, completedAt: new Date(visitAt.getTime() + 1800e3), reasonForVisit: "معاینهٔ دوره‌ای", observationsText: "وضعیت عمومی خوب، دندان‌ها نیاز به جرم‌گیری در سه ماه آینده.", assessmentText: "سالم", planText: "واکسن سالانه در دو هفتهٔ آینده." },
      update: {},
    });
    // Clinic operations: a CRM note (one shared with the owner), tags, tasks and a few imported contacts.
    const org = owner.providerOrganizationId;
    await db.clinicCustomerNote.upsert({ where: { id: id("note:private") }, create: { id: id("note:private"), providerOrganizationId: org, householdId: clinicPet.householdId, authorProviderUserId: vet.id, body: "صاحب پت نوبت‌های صبح را ترجیح می‌دهد (یادداشت داخلی نمایشی)." }, update: {} });
    await db.clinicCustomerNote.upsert({ where: { id: id("note:shared") }, create: { id: id("note:shared"), providerOrganizationId: org, householdId: clinicPet.householdId, authorProviderUserId: vet.id, body: "لطفاً جواب آزمایش قبلی را در ویزیت بعد همراه بیاورید.", visibleToOwner: true }, update: {} });
    for (const name of ["VIP", "پیگیری", "پیگیری پرداخت"]) {
      await db.clinicCustomerTag.upsert({ where: { providerOrganizationId_name: { providerOrganizationId: org, name } }, create: { id: id(`tag:${name}`), providerOrganizationId: org, name }, update: {} });
    }
    const followTag = await db.clinicCustomerTag.findUniqueOrThrow({ where: { providerOrganizationId_name: { providerOrganizationId: org, name: "پیگیری" } } });
    await db.clinicCustomerTagAssignment.upsert({ where: { tagId_householdId: { tagId: followTag.id, householdId: clinicPet.householdId } }, create: { tagId: followTag.id, householdId: clinicPet.householdId }, update: {} });
    const task = (key: string, data: Record<string, unknown>) => db.clinicTask.upsert({ where: { id: id(`task:${key}`) }, create: { id: id(`task:${key}`), providerOrganizationId: org, createdByProviderUserId: owner.id, ...data } as never, update: {} });
    await task("call", { type: "CALL_CUSTOMER", title: "تماس برای نتیجه‌ی آزمایش خون", dueAt: new Date(Date.now() - 3600e3), assigneeProviderUserId: vet.id, householdId: clinicPet.householdId });
    await task("confirm", { type: "CONFIRM_APPOINTMENT", title: "تأیید نوبت هفته‌ی بعد", dueAt: new Date(Date.now() + 2 * DAY) });
    await task("done", { type: "FOLLOW_UP_LAB", title: "پیگیری جواب آزمایش", status: "DONE", completedAt: new Date(Date.now() - DAY), completedByProviderUserId: vet.id });
    const batch = id("import-batch");
    for (const [key, name, phone, petName, species] of [["c1", "مهسا (مخاطب واردشده‌ی نمایشی)", "09121230001", "لونا", "CAT"], ["c2", "کامران (مخاطب واردشده‌ی نمایشی)", "09121230002", "رکس", "DOG"]] as const) {
      await db.clinicImportedContact.upsert({ where: { id: id(`contact:${key}`) }, create: { id: id(`contact:${key}`), providerOrganizationId: org, name, phone, petName, species, importBatchId: batch }, update: {} });
    }
    await db.patientVitalsRecord.upsert({ where: { id: id("clinic:vitals") }, create: { id: id("clinic:vitals"), petId: clinicPet.id, providerOrganizationId: owner.providerOrganizationId, providerUserId: vet.id, recordedAt: visitAt, weightValue: 4.2, temperatureC: 38.6, heartRateBpm: 150, bodyConditionScore: 5 }, update: {} });

    // ---------------------------------------------------------------- Pet safety + shared care (rich-profile owner)
    const rich = await db.user.findUniqueOrThrow({ where: { email: "batch2-review@example.test" } });
    const richHome = (await db.householdMember.findFirst({ where: { userId: rich.id, role: "OWNER" } }))
      ?? (await (async () => {
        const hh = await db.household.upsert({ where: { id: id("rich:household") }, create: { id: id("rich:household"), name: "خانواده‌ی بازبین (نمایشی)", city: "تهران", countryCode: "IR" }, update: {} });
        return db.householdMember.upsert({ where: { householdId_userId: { householdId: hh.id, userId: rich.id } }, create: { householdId: hh.id, userId: rich.id, role: "OWNER" }, update: {} });
      })());
    const richPet = (await db.pet.findFirst({ where: { householdId: richHome.householdId, lifecycleStatus: "ACTIVE" }, orderBy: { createdAt: "asc" } }))
      ?? (await db.pet.create({ data: { id: id("rich:pet"), householdId: richHome.householdId, name: "کوکی (نمایشی)", species: "DOG", approximateAgeMonths: 36 } }));
    await db.petEmergencyInfo.upsert({ where: { petId: richPet.id }, create: { petId: richPet.id, contactName: "نگار (نمایشی)", contactPhone: "09120000000", contactRelation: "خواهر", bloodType: "DEA 1.1 منفی", criticalNotes: "به پنی‌سیلین حساسیت دارد (نمایشی).", updatedByUserId: rich.id }, update: {} });
    // A deterministic demo-only ID tag token so the public card page can be designed (/pet-card/<token>).
    const demoToken = `demo-${id("id-tag").replace(/-/g, "")}`;
    const tokenHash = createHash("sha256").update(demoToken).digest("hex");
    if (!(await db.petShareCard.findUnique({ where: { tokenHash } }))) {
      await db.petShareCard.updateMany({ where: { petId: richPet.id, kind: "ID_TAG", revokedAt: null }, data: { revokedAt: new Date() } });
      await db.petShareCard.create({ data: { id: id("card:id-tag"), petId: richPet.id, kind: "ID_TAG", tokenHash, tokenHint: demoToken.slice(-4), includeContact: true, createdByUserId: rich.id } });
    }
    const helperMember = await user("household-helper@example.test", "علی (عضو خانواده‌ی نمایشی)");
    await db.householdMember.upsert({ where: { householdId_userId: { householdId: richHome.householdId, userId: helperMember.id } }, create: { householdId: richHome.householdId, userId: helperMember.id, role: "FAMILY" }, update: {} });
    await db.petAccessGrant.upsert({ where: { id: id("grant:helper") }, create: { id: id("grant:helper"), petId: richPet.id, userId: helperMember.id, canViewIdentity: true, canViewCareProfile: true, canEditCareProfile: true, grantedByUserId: rich.id }, update: {} });
    const careAt = (d: number) => new Date(Math.floor((Date.now() + d * DAY) / 3600e3) * 3600e3);
    const care = (key: string, data: Record<string, unknown>) => db.careReminder.upsert({ where: { id: id(`care:${key}`) }, create: { id: id(`care:${key}`), petId: richPet.id, createdByUserId: rich.id, ...data } as never, update: {} });
    await care("walk-assigned", { title: "پیاده‌روی عصر", type: "CUSTOM", dueAt: careAt(0.3), originalDueAt: careAt(0.3), recurrence: "DAILY", assignedToUserId: helperMember.id });
    await care("brush-weekdays", { title: "مسواک زدن", type: "DENTAL", dueAt: careAt(1), originalDueAt: careAt(1), recurrence: "WEEKDAYS", weekdays: [0, 2, 4] });
    await care("course", { title: "دوره‌ی آنتی‌بیوتیک", type: "MEDICATION", dueAt: careAt(0.5), originalDueAt: careAt(0.5), recurrence: "DAILY", maxOccurrences: 7, occurrenceIndex: 3 });
    await care("done-1", { title: "حمام", type: "GROOMING", dueAt: careAt(-5), originalDueAt: careAt(-5), state: "COMPLETED", completedAt: careAt(-5), completedByUserId: helperMember.id });
    await care("skipped-1", { title: "کنترل وزن", type: "WEIGHT_CHECK", dueAt: careAt(-3), originalDueAt: careAt(-3), state: "SKIPPED", skippedAt: careAt(-3), completedByUserId: rich.id });
    await care("overdue-1", { title: "ضدکک و کنه", type: "PARASITE_PREVENTION", dueAt: careAt(-2), originalDueAt: careAt(-2), recurrence: "MONTHLY" });

    // Activity feed: a few real-shaped events for the rich household's pet (deterministic ids; read by /activity).
    const ev = (key: string, type: string, payload: Record<string, unknown>, hoursAgo: number) =>
      db.domainEvent.upsert({ where: { id: id(`event:${key}`) }, create: { id: id(`event:${key}`), type, aggregateType: "Pet", aggregateId: richPet.id, payload: { petId: richPet.id, ...payload } as never, occurredAt: new Date(Date.now() - hoursAgo * 3600e3), processedAt: new Date() }, update: {} });
    await ev("memory", "PetMemoryAdded", { householdId: richHome.householdId, memoryId: id("memory"), type: "MILESTONE" }, 30);
    await ev("care-done", "CareReminderCompleted", { careItemId: id("care:done-1"), actorUserId: helperMember.id, action: "COMPLETE" }, 20);
    await ev("allergy", "AllergyAdded", { allergyId: id("allergy") }, 10);
    await ev("profile", "PetProfileUpdated", {}, 2);

    // ---------------------------------------------------------------- Places attributes, a suggestion, trip checklist, claim prep
    await db.petFriendlyPlace.updateMany({ where: { isPubliclyListed: true, category: "PARK", fencedArea: null }, data: { fencedArea: true, shadeAvailable: true, wasteBins: true, entryFeeIrr: 0, petFriendlyLevel: "FULL" } });
    await db.placeSuggestion.upsert({ where: { id: id("suggestion") }, create: { id: id("suggestion"), userId: rich.id, name: "پارک ساحلی سگ‌ها (پیشنهاد نمایشی)", category: "PARK", city: "رشت", latitude: 37.28, longitude: 49.59, notes: "محوطه‌ی محصور و سایه‌دار" }, update: {} });
    const trip = await db.trip.upsert({ where: { id: id("trip") }, create: { id: id("trip"), householdId: richHome.householdId, petId: richPet.id, createdByUserId: rich.id, originCountry: "IR", originCity: "تهران", destinationCountry: "IR", destinationCity: "رامسر", departAt: new Date(Date.now() + 21 * DAY), returnAt: new Date(Date.now() + 25 * DAY), travelMode: "ROAD" }, update: {} });
    const checklist: [string, string, boolean][] = [["DOCUMENTS", "کارت واکسن و شناسنامه‌ی پت", true], ["FOOD", "غذا برای ۵ روز", false], ["CARRIER", "باکس حمل", false], ["EMERGENCY", "شماره‌ی دامپزشک رامسر", false]];
    for (const [i, [category, label, done]] of checklist.entries()) {
      await db.tripChecklistItem.upsert({ where: { id: id(`trip:item:${i}`) }, create: { id: id(`trip:item:${i}`), tripId: trip.id, category, label, done, doneAt: done ? new Date() : null, sortOrder: i }, update: {} });
    }
    await db.insuranceClaimPrep.upsert({ where: { id: id("claim-prep") }, create: { id: id("claim-prep"), petId: richPet.id, householdId: richHome.householdId, createdByUserId: rich.id, title: "جراحی پای عقب (پوشه‌ی نمایشی)", incidentDate: new Date(Date.now() - 20 * DAY), notes: "فاکتور و گزارش جراحی برای ادعای بعدی." }, update: {} });

    // ---------------------------------------------------------------- Trust, structured review, saved + recently viewed
    if (taxi) {
      const review = await db.providerReview.upsert({ where: { bookingId: id("ride-completed") }, create: { id: id("review:ride"), bookingId: id("ride-completed"), providerOrganizationId: taxi.providerOrganizationId, userId: customer.id, rating: 4, quality: 5, communication: 4, timeliness: 3, body: "راننده مهربان بود ولی کمی دیر رسید (نظر نمایشی)." }, update: {} });
      const replier = await db.providerUser.findFirst({ where: { providerOrganizationId: taxi.providerOrganizationId, role: "OWNER", removedAt: null } });
      if (!review.providerResponse && replier) await db.providerReview.update({ where: { id: review.id }, data: { providerResponse: "ممنون از بازخوردتان؛ زمان‌بندی را بهتر می‌کنیم (پاسخ نمایشی).", respondedAt: new Date(), respondedByUserId: replier.userId } });
    }
    const admin = await db.adminUser.findFirst({ where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
    if (admin) {
      const trustCase = await db.trustCase.upsert({ where: { id: id("trust:case") }, create: { id: id("trust:case"), subjectType: "USER", subjectId: rich.id, reason: "گزارش رفتار نامناسب در گفتگو (نمایشی)", status: "CLOSED", openedByAdminId: admin.id, closedAt: new Date() }, update: {} });
      const action = await db.trustAction.upsert({ where: { id: id("trust:action") }, create: { id: id("trust:action"), trustCaseId: trustCase.id, actionType: "WARNING", reason: "هشدار به‌خاطر پیام نامناسب (نمایشی)", performedByAdminId: admin.id }, update: {} });
      await db.appeal.upsert({ where: { trustActionId: action.id }, create: { id: id("trust:appeal"), trustActionId: action.id, appellantUserId: rich.id, reason: "پیام من سوءتفاهم بود و قصد توهین نداشتم (اعتراض نمایشی)." }, update: {} });
    }
    const place = await db.petFriendlyPlace.findFirst({ where: { isPubliclyListed: true }, orderBy: { createdAt: "asc" } });
    if (place) {
      await db.petFriendlyPlaceFavorite.upsert({ where: { placeId_userId: { placeId: place.id, userId: rich.id } }, create: { userId: rich.id, placeId: place.id }, update: {} });
      await db.recentlyViewed.upsert({ where: { userId_entityType_entityId: { userId: rich.id, entityType: "PLACE", entityId: place.id } }, create: { userId: rich.id, entityType: "PLACE", entityId: place.id }, update: {} });
    }
    const verifiedProvider = await db.providerOrganization.findFirst({ where: { verificationStatus: "VERIFIED" }, orderBy: { createdAt: "asc" } });
    if (verifiedProvider) await db.recentlyViewed.upsert({ where: { userId_entityType_entityId: { userId: rich.id, entityType: "PROVIDER", entityId: verifiedProvider.id } }, create: { userId: rich.id, entityType: "PROVIDER", entityId: verifiedProvider.id }, update: {} });

    console.log(`Sprint demo extras: 4 support needs (${Object.keys(ids).join(", ")}), ${rides} taxi rides (QA tariff snapshot), chat report+block, clinic vet/visit/vitals, pet safety (ID tag /pet-card/${demoToken}) and shared care.`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
