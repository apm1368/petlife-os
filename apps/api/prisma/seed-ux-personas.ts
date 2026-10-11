import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/**
 * Stable UX-QA owner personas (Product Experience Hardening 2026). Automated browser QA may read AND write
 * these — unlike owner.review / showcase accounts, which no script touches.
 *   OWNER_NEW        qa-ux-owner-new@example.test    account only: no household, no pet (first-run flow)
 *   OWNER_RICH       qa-ux-owner-rich@example.test   one cat (نیلو) with a full record, care, visits, bookings,
 *                                                    memories, a trip and notifications
 *   OWNER_MULTI_PET  qa-ux-owner-multi@example.test  three pets (dog, cat, bird) with light records
 * No passwords: QA sessions are minted by the QA scripts. Deterministic ids + upserts with `update: {}` —
 * reruns never duplicate and never undo what a QA flow changed.
 */
const db = new PrismaClient();
const id = (key: string) => {
  const h = createHash("sha256").update(`petlife-ux-personas:${key}`).digest("hex").slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20)}`;
};
const batch2 = (key: string) => {
  const h = createHash("sha256").update(`petlife-batch2-qa:${key}`).digest("hex").slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20)}`;
};
const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY);
const FULL = { canViewIdentity: true, canEditIdentity: true, canViewHealth: true, canEditHealth: true, canBookCare: true, canViewCareProfile: true, canEditCareProfile: true, canViewLocation: true, canManageAccess: true };

async function user(key: string, email: string, displayName: string) {
  const existing = await db.user.findUnique({ where: { email } });
  return existing ?? db.user.create({ data: { id: id(`user:${key}`), email, emailVerifiedAt: new Date(), displayName, locale: "fa" } });
}

async function household(key: string, userId: string, name: string) {
  const householdId = id(`household:${key}`);
  await db.household.upsert({ where: { id: householdId }, create: { id: householdId, name, city: "تهران", countryCode: "IR" }, update: {} });
  await db.householdMember.upsert({ where: { householdId_userId: { householdId, userId } }, create: { householdId, userId, role: "OWNER" }, update: {} });
  return householdId;
}

async function pet(key: string, householdId: string, userId: string, data: Record<string, unknown>) {
  const petId = id(`pet:${key}`);
  await db.pet.upsert({ where: { id: petId }, create: { id: petId, householdId, ...data } as never, update: {} });
  await db.petAccessGrant.upsert({ where: { id: id(`grant:${key}`) }, create: { id: id(`grant:${key}`), petId, userId, source: "HOUSEHOLD", ...FULL }, update: {} });
  return petId;
}

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "").pathname;
  if (!database.endsWith("_test") && process.env.PETLIFE_QA_SEED_DATABASE !== database.slice(1)) {
    throw new Error("This seed runs against a *_test database, or the database named in PETLIFE_QA_SEED_DATABASE.");
  }
  const out: Record<string, unknown> = {};

  // ---------------------------------------------------------------- OWNER_NEW
  const fresh = await user("new", "qa-ux-owner-new@example.test", "مالک تازه (QA)");
  out.ownerNew = fresh.id;

  // ---------------------------------------------------------------- OWNER_RICH
  const rich = await user("rich", "qa-ux-owner-rich@example.test", "سارا (QA)");
  const hh = await household("rich", rich.id, "خانه‌ی سارا (QA)");
  const petId = await pet("nilo", hh, rich.id, {
    name: "نیلو", species: "CAT", breed: "بریتیش شورت‌هیر", sex: "MALE", birthDate: new Date("2023-02-20"),
    photoUrl: "/images/pets/demo-cat-blue.svg", latestWeightValue: 4.2, latestWeightUnit: "KG", colorMarkings: "خاکستری آبی یکدست",
    neuteredStatus: "NEUTERED", microchipNumber: "985112004455667", microchipNormalized: "985112004455667",
  });
  await db.petEmergencyInfo.upsert({ where: { petId }, create: { petId, contactName: "علی (همسر)", contactPhone: "09120000002", contactRelation: "همسر", criticalNotes: "به داروهای ضدالتهاب غیراستروئیدی حساس است.", updatedByUserId: rich.id }, update: {} });
  await db.vaccinationSummary.upsert({ where: { petId }, create: { petId, status: "UP_TO_DATE", lastKnownDate: at(-60), nextDueDate: at(305), notes: "واکسن سه‌گانه و هاری طبق کارت واکسن.", sourceType: "OWNER" }, update: {} });
  await db.allergy.upsert({ where: { id: id("rich:allergy") }, create: { id: id("rich:allergy"), petId, name: "حساسیت به ملوکسیکام", reaction: "استفراغ", severity: "MODERATE", sourceType: "OWNER", recordedByUserId: rich.id }, update: {} });
  await db.condition.upsert({ where: { id: id("rich:condition") }, create: { id: id("rich:condition"), petId, name: "التهاب لثه‌ی خفیف", status: "ACTIVE", sourceType: "OWNER" }, update: {} });
  await db.medication.upsert({ where: { id: id("rich:medication") }, create: { id: id("rich:medication"), petId, name: "دهان‌شویه‌ی کلرهگزیدین", dosage: 1, unit: "ml", frequencyText: "روزی دو بار", route: "موضعی", status: "ACTIVE", startDate: at(-10), sourceType: "OWNER" }, update: {} });
  const labs: [string, string, string, string, number, number, "NORMAL" | "ABNORMAL"][] = [
    ["bun", "اوره‌ی خون (BUN)", "BUN", "24", 16, 36, "NORMAL"], ["crea", "کراتینین", "CREA", "1.9", 0.8, 2.4, "NORMAL"], ["glu", "قند خون", "GLU", "168", 71, 159, "ABNORMAL"],
  ];
  for (const [key, testName, testCode, value, low, high, flag] of labs) {
    await db.labResult.upsert({ where: { id: id(`rich:lab:${key}`) }, create: { id: id(`rich:lab:${key}`), petId, testName, testCode, sampleDate: at(-21), resultDate: at(-20), value, referenceRangeLow: low, referenceRangeHigh: high, flag, status: "FINAL" }, update: {} });
  }
  const org = batch2("clinic"), staff = batch2("staff"), location = batch2("location"), service = batch2("service");
  if (await db.providerOrganization.findUnique({ where: { id: org } })) {
    const visitId = id("rich:visit");
    await db.clinicalVisit.upsert({ where: { id: visitId }, create: { id: visitId, petId, householdId: hh, providerOrganizationId: org, providerUserId: staff, status: "COMPLETED", startedAt: at(-21), completedAt: at(-21), reasonForVisit: "معاینه‌ی سالانه و آزمایش خون", assessmentText: "سالم؛ قند خون کمی بالا، احتمالاً استرسی.", planText: "تکرار آزمایش قند پس از یک ماه." }, update: {} });
    for (const [key, days, kg] of [["w1", -300, 3.8], ["w2", -150, 4.0], ["w3", -21, 4.2]] as const) {
      await db.patientVitalsRecord.upsert({ where: { id: id(`rich:vitals:${key}`) }, create: { id: id(`rich:vitals:${key}`), petId, providerOrganizationId: org, providerUserId: staff, clinicalVisitId: key === "w3" ? visitId : null, recordedAt: at(days), weightValue: kg, weightUnit: "KG", temperatureC: 38.6, heartRateBpm: 170, bodyConditionScore: 5 }, update: {} });
    }
    const past = at(-21), next = at(11);
    await db.booking.upsert({ where: { id: id("rich:booking:past") }, create: { id: id("rich:booking:past"), petId, householdId: hh, userId: rich.id, providerOrganizationId: org, providerLocationId: location, providerServiceId: service, providerUserId: staff, category: "VET", locationMode: "AT_PROVIDER", startAt: past, endAt: new Date(past.getTime() + 1800_000), timezone: "Asia/Tehran", bookingStatus: "COMPLETED", completedAt: new Date(past.getTime() + 1800_000) }, update: {} });
    await db.booking.upsert({ where: { id: id("rich:booking:next") }, create: { id: id("rich:booking:next"), petId, householdId: hh, userId: rich.id, providerOrganizationId: org, providerLocationId: location, providerServiceId: service, providerUserId: staff, category: "VET", locationMode: "AT_PROVIDER", startAt: next, endAt: new Date(next.getTime() + 1800_000), timezone: "Asia/Tehran", bookingStatus: "CONFIRMED" }, update: {} });
    // A real booking projects into the care calendar (CareCalendarService.upsertForBooking); mirror that here.
    await db.careCalendarEvent.upsert({
      where: { sourceType_sourceId: { sourceType: "VET_APPOINTMENT", sourceId: id("rich:booking:next") } },
      create: { householdId: hh, petId, sourceType: "VET_APPOINTMENT", sourceId: id("rich:booking:next"), type: "VET_APPOINTMENT", status: "SCHEDULED", startAt: next, endAt: new Date(next.getTime() + 1800_000), timezone: "Asia/Tehran", titleKey: "careCalendar.event.vetAppointment", actionType: "VIEW_BOOKING" },
      update: {},
    });
    out.clinic = "linked";
  } else out.clinic = "MISSING (run seed-batch2.ts)";
  const docKey = `health-documents/${petId}/ux-rich-vaccine-card.png`;
  const source = resolve(__dirname, "../../web/public/images/landing/pet-portrait.png");
  const destination = resolve(process.env.STORAGE_LOCAL_DIR ?? "./local-storage", docKey);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  await db.medicalDocument.upsert({ where: { id: id("rich:document") }, create: { id: id("rich:document"), petId, householdId: hh, title: "کارت واکسن (اسکن)", documentType: "OTHER", sourceType: "OWNER", sourceUserId: rich.id, fileObjectKey: docKey, mimeType: "image/png", fileSizeBytes: (await stat(source)).size }, update: {} });
  const care: [string, string, string, number, "UPCOMING" | "COMPLETED"][] = [
    // No vaccine reminder: the care center derives it from the vaccination summary's next due date.
    ["deworm", "قطره‌ی ضدانگل", "DEWORMING", 3, "UPCOMING"],
    ["dental", "شست‌وشوی دهان", "MEDICATION_REFILL", 1, "UPCOMING"], ["weight", "کنترل وزن", "WEIGHT_CHECK", -14, "COMPLETED"],
  ];
  for (const [key, title, type, days, state] of care) {
    await db.careReminder.upsert({ where: { id: id(`rich:care:${key}`) }, create: { id: id(`rich:care:${key}`), petId, createdByUserId: rich.id, title, type, dueAt: at(days), originalDueAt: at(days), state, completedAt: state === "COMPLETED" ? at(days) : null, completedByUserId: state === "COMPLETED" ? rich.id : null } as never, update: {} });
  }
  const memories: [string, "FIRST_DAY" | "BIRTHDAY" | "STORY", string, number][] = [
    ["first-day", "FIRST_DAY", "اولین روز در خانه", -600], ["birthday", "BIRTHDAY", "تولد دوسالگی", -230], ["window", "STORY", "تماشای برف از پنجره", -40],
  ];
  for (const [key, type, title, days] of memories) {
    await db.petMemory.upsert({ where: { id: id(`rich:memory:${key}`) }, create: { id: id(`rich:memory:${key}`), petId, householdId: hh, createdByUserId: rich.id, type, title, description: "خاطره‌ی نمایشی QA.", occurredAt: at(days) }, update: {} });
  }
  const tripId = id("rich:trip");
  await db.trip.upsert({ where: { id: tripId }, create: { id: tripId, householdId: hh, petId, createdByUserId: rich.id, originCountry: "IR", originCity: "تهران", destinationCountry: "IR", destinationCity: "کاشان", departAt: at(25), returnAt: at(28), travelMode: "ROAD" }, update: {} });
  for (const [i, [category, label, done]] of ([["DOCUMENTS", "کارت واکسن", true], ["CARRIER", "باکس حمل", false]] as const).entries()) {
    await db.tripChecklistItem.upsert({ where: { id: id(`rich:trip:item:${i}`) }, create: { id: id(`rich:trip:item:${i}`), tripId, category, label, done, doneAt: done ? new Date() : null, sortOrder: i }, update: {} });
  }
  const notes: [string, string, "HEALTH" | "BOOKING" | "TRAVEL", string, string, string][] = [
    ["rich:n-care", "care.reminder_due", "HEALTH", "یادآور مراقبت", "قطره‌ی ضدانگل نیلو تا سه روز دیگر.", `/pets/${petId}/care`],
    ["rich:n-booking", "booking.confirmed", "BOOKING", "نوبت شما تأیید شد", "نوبت معاینه‌ی نیلو تأیید شد.", `/bookings/${id("rich:booking:next")}`],
    ["rich:n-trip", "travel.trip_approaching", "TRAVEL", "سفر نزدیک است", "یک مورد از چک‌لیست سفر کاشان باز است.", `/travel/trips/${tripId}`],
  ];
  for (const [key, type, category, title, body, deepLink] of notes) {
    await db.notification.upsert({ where: { id: id(key) }, create: { id: id(key), userId: rich.id, householdId: hh, petId, type, category, title, body, locale: "fa", deepLink }, update: {} });
  }
  out.ownerRich = { userId: rich.id, householdId: hh, petId };

  // ---------------------------------------------------------------- OWNER_MULTI_PET
  const multi = await user("multi", "qa-ux-owner-multi@example.test", "خانواده‌ی رضایی (QA)");
  const mh = await household("multi", multi.id, "خانه‌ی رضایی (QA)");
  const pets: [string, Record<string, unknown>][] = [
    ["tara", { name: "تارا", species: "DOG", breed: "ژرمن شپرد", sex: "FEMALE", birthDate: new Date("2020-06-01"), latestWeightValue: 31, latestWeightUnit: "KG" }],
    ["milo", { name: "میلو", species: "CAT", breed: "خانگی (مخلوط)", sex: "MALE", approximateAgeMonths: 30 }],
    ["kiwi", { name: "کیوی", species: "BIRD", breed: "مرغ عشق", sex: "UNKNOWN", approximateAgeMonths: 14 }],
  ];
  const multiPets: string[] = [];
  for (const [i, [key, data]] of pets.entries()) {
    const pid = await pet(`multi:${key}`, mh, multi.id, data);
    multiPets.push(pid);
    await db.vaccinationSummary.upsert({ where: { petId: pid }, create: { petId: pid, status: i === 2 ? "UNKNOWN" : "UP_TO_DATE", lastKnownDate: i === 2 ? null : at(-90), nextDueDate: i === 2 ? null : at(275), sourceType: "OWNER" } as never, update: {} });
    await db.careReminder.upsert({ where: { id: id(`multi:care:${key}`) }, create: { id: id(`multi:care:${key}`), petId: pid, createdByUserId: multi.id, title: i === 0 ? "پیاده‌روی عصر" : i === 1 ? "شانه‌کردن موها" : "تعویض آب و دانه", type: "CUSTOM", dueAt: at(i + 1), originalDueAt: at(i + 1), state: "UPCOMING" } as never, update: {} });
    await db.petMemory.upsert({ where: { id: id(`multi:memory:${key}`) }, create: { id: id(`multi:memory:${key}`), petId: pid, householdId: mh, createdByUserId: multi.id, type: "STORY", title: `یک روز خوب با ${(data as { name: string }).name}`, description: "خاطره‌ی نمایشی QA.", occurredAt: at(-30 - i * 10) }, update: {} });
  }
  out.ownerMulti = { userId: multi.id, householdId: mh, pets: multiPets };

  console.log(JSON.stringify(out));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
