/**
 * Demo data for Clinic OS and community chat. Idempotent (deterministic ids, upserts), non-destructive, demo
 * accounts only (…@example.test), and refuses any database that is not *_test unless PETLIFE_QA_SEED_DATABASE
 * names it. No prices, payments or SMS are invented: the demo clinic gets an admin-style plan assignment
 * (recorded in its change history as a seed), its customer has completed and upcoming bookings, and its
 * reminders are future SCHEDULED rows the real worker will deliver in-app.
 */
import { createHash } from "node:crypto";
import { BookingStatus, ClinicReminderKind, ClinicReminderStatus, PrismaClient, ProviderType, ProviderUserRole, ProviderVerificationStatus, SubscriptionChangeType } from "@prisma/client";

const db = new PrismaClient();
const id = (key: string) => {
  const h = createHash("sha1").update(`clinic-chat-demo:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const DAY = 86400e3;

async function demoUser(email: string, displayName: string) {
  if (!email.endsWith("@example.test")) throw new Error("demo accounts only");
  return db.user.upsert({ where: { email }, create: { id: id(`user:${email}`), email, displayName, locale: "fa" }, update: {} });
}

async function clinic() {
  // Prefer the existing demo clinic (its owner is a demo account); otherwise create one.
  const existing = await db.providerUser.findFirst({ where: { role: ProviderUserRole.OWNER, user: { email: "batch3-clinic-owner@example.test" } }, select: { providerOrganizationId: true } });
  if (existing) return existing.providerOrganizationId;
  const owner = await demoUser("batch3-clinic-owner@example.test", "مدیر درمانگاه مهر (نمایشی)");
  const org = await db.providerOrganization.upsert({ where: { id: id("org") }, create: { id: id("org"), name: "درمانگاه دامپزشکی مهر (نمایشی)", type: ProviderType.VET_CLINIC, verificationStatus: ProviderVerificationStatus.VERIFIED }, update: {} });
  await db.providerUser.upsert({ where: { id: id("org-owner") }, create: { id: id("org-owner"), userId: owner.id, providerOrganizationId: org.id, role: ProviderUserRole.OWNER }, update: {} });
  return org.id;
}

async function seedClinic() {
  const orgId = await clinic();
  const location = (await db.providerLocation.findFirst({ where: { providerOrganizationId: orgId } })) ?? (await db.providerLocation.create({ data: { id: id("location"), providerOrganizationId: orgId, name: "شعبه‌ی مرکزی", addressLine: "خیابان ولیعصر (نمایشی)", city: "تهران", countryCode: "IR", timezone: "Asia/Tehran" } }));
  const service = (await db.providerService.findFirst({ where: { providerOrganizationId: orgId, category: "VET" } })) ?? (await db.providerService.create({ data: { id: id("service"), providerOrganizationId: orgId, locationId: location.id, name: "معاینه‌ی عمومی", type: "GENERAL_VET_VISIT", category: "VET", durationMinutes: 30, priceAmount: 1_500_000 } }));

  // A demo customer household with one cat, two completed visits and one upcoming appointment.
  const customer = await demoUser("clinic-demo-customer@example.test", "نگار (مشتری نمایشی)");
  const household = await db.household.upsert({ where: { id: id("household") }, create: { id: id("household"), name: "خانواده‌ی نگار (نمایشی)", city: "تهران", countryCode: "IR" }, update: {} });
  await db.householdMember.upsert({ where: { householdId_userId: { householdId: household.id, userId: customer.id } }, create: { householdId: household.id, userId: customer.id, role: "OWNER" }, update: {} });
  const pet = await db.pet.upsert({ where: { id: id("pet") }, create: { id: id("pet"), householdId: household.id, name: "پیشی (نمایشی)", species: "CAT", approximateAgeMonths: 30 }, update: {} });
  const now = Date.now();
  const visits: [string, number, BookingStatus][] = [["visit-1", -60, BookingStatus.COMPLETED], ["visit-2", -12, BookingStatus.COMPLETED], ["visit-3", 9, BookingStatus.CONFIRMED]];
  for (const [key, offsetDays, status] of visits) {
    const startAt = new Date(Math.floor((now + offsetDays * DAY) / 3600e3) * 3600e3);
    await db.booking.upsert({
      where: { id: id(key) },
      create: {
        id: id(key), householdId: household.id, petId: pet.id, userId: customer.id, providerOrganizationId: orgId, providerLocationId: location.id, providerServiceId: service.id,
        category: "VET", locationMode: "AT_PROVIDER", startAt, endAt: new Date(startAt.getTime() + 1800e3), timezone: "Asia/Tehran", bookingStatus: status,
        priceAmount: service.priceAmount ?? 1_500_000, currency: "IRR", paymentMode: "PAY_AT_PROVIDER", serviceNameSnapshot: service.name,
        ...(status === BookingStatus.COMPLETED ? { completedAt: new Date(startAt.getTime() + 1800e3), completionNote: "معاینه‌ی دوره‌ای انجام شد." } : {}),
      },
      update: {},
    });
  }

  // Plan: the demo clinic is on CLINIC_PRO, recorded once in its history as a seed assignment.
  const pro = await db.clinicPlan.findUniqueOrThrow({ where: { code: "CLINIC_PRO" } });
  const before = await db.clinicSubscription.findUnique({ where: { providerOrganizationId: orgId }, include: { plan: true } });
  const sub = await db.clinicSubscription.upsert({ where: { providerOrganizationId: orgId }, create: { providerOrganizationId: orgId, planId: pro.id }, update: { planId: pro.id, status: "ACTIVE", currentPeriodEndsAt: null } });
  if (before?.plan.code !== "CLINIC_PRO") {
    await db.clinicSubscriptionChange.create({ data: { subscriptionId: sub.id, type: SubscriptionChangeType.UPGRADE, fromPlanCode: before?.plan.code ?? "CLINIC_BASIC", toPlanCode: "CLINIC_PRO", reason: "demo seed" } });
  }

  const creator = await db.providerUser.findFirstOrThrow({ where: { providerOrganizationId: orgId, role: ProviderUserRole.OWNER } });
  await db.clinicReminder.upsert({ where: { id: id("reminder-vaccine") }, create: { id: id("reminder-vaccine"), providerOrganizationId: orgId, petId: pet.id, createdByProviderUserId: creator.id, kind: ClinicReminderKind.VACCINATION, title: "واکسن سه‌گانه‌ی سالانه", note: "لطفاً کارت واکسن را همراه بیاورید.", dueAt: new Date(now + 14 * DAY) }, update: {} });
  await db.clinicReminder.upsert({ where: { id: id("reminder-cancelled") }, create: { id: id("reminder-cancelled"), providerOrganizationId: orgId, petId: pet.id, createdByProviderUserId: creator.id, kind: ClinicReminderKind.FOLLOW_UP, title: "پیگیری بعد از ویزیت", dueAt: new Date(now + 3 * DAY), status: ClinicReminderStatus.CANCELLED, cancelledAt: new Date(now) }, update: {} });
  return orgId;
}

async function seedChat() {
  const a = await demoUser("batch2-review@example.test", "بازبین نمایشی");
  const b = await demoUser("clinic-demo-customer@example.test", "نگار (مشتری نمایشی)");
  const pairKey = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
  const conversation = await db.chatConversation.upsert({ where: { pairKey }, create: { id: id("chat"), pairKey }, update: {} });
  for (const userId of [a.id, b.id]) {
    await db.chatParticipant.upsert({ where: { conversationId_userId: { conversationId: conversation.id, userId } }, create: { conversationId: conversation.id, userId }, update: {} });
  }
  const start = Date.now() - 2 * 3600e3;
  const lines: [string, string, number][] = [
    ["m1", b.id, 0],
    ["m2", a.id, 1],
    ["m3", b.id, 2],
  ];
  const bodies: Record<string, string> = {
    m1: "سلام! پستتان درباره‌ی غذای گربه‌ی مسن را دیدم. چه برندی استفاده می‌کنید؟",
    m2: "سلام، دامپزشک‌مان یک غذای مخصوص سن بالا پیشنهاد داد؛ بهتر است قبلش با دامپزشک خودتان مشورت کنید.",
    m3: "ممنون، حتماً. نوبت ماه بعد را گرفته‌ام.",
  };
  let last = new Date(start);
  for (const [key, senderUserId, i] of lines) {
    last = new Date(start + i * 10 * 60e3);
    await db.chatMessage.upsert({ where: { id: id(`chat:${key}`) }, create: { id: id(`chat:${key}`), conversationId: conversation.id, senderUserId, body: bodies[key]!, createdAt: last }, update: {} });
  }
  await db.chatConversation.update({ where: { id: conversation.id }, data: { lastMessageAt: last } });
  // The reviewer has read up to their own reply; the last message stays unread for them.
  await db.chatParticipant.update({ where: { conversationId_userId: { conversationId: conversation.id, userId: a.id } }, data: { lastReadAt: new Date(start + 15 * 60e3) } });
  return conversation.id;
}

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "").pathname;
  if (!database.endsWith("_test") && process.env.PETLIFE_QA_SEED_DATABASE !== database.slice(1)) {
    throw new Error("This demo seed runs against a *_test database, or a staging database named in PETLIFE_QA_SEED_DATABASE.");
  }
  const orgId = await seedClinic();
  const chatId = await seedChat();
  console.log(`Seeded clinic demo (org ${orgId}, CLINIC_PRO) and chat demo (conversation ${chatId}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
