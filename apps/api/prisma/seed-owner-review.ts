import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { chmod, copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { hashPassword } from "../src/common/password/password-hash.util";

/**
 * Owner manual-review persona — `owner.review` (owner-review@example.test). Not a smoke account: no automated
 * script writes to it. One household with one rich dog (کوکی), health record, care plan, memories, visits and
 * bookings at the batch-2 demo clinic, a trip, favourites and notifications. Deterministic ids + upserts: reruns
 * never duplicate anything and never overwrite what the owner changed (update: {}).
 *
 * Login: username + password through the product's normal /auth/login/password. A password is generated only when
 * the account has none, written to OWNER_REVIEW_CREDENTIAL_FILE (chmod 600) and never printed.
 * Full feature access is granted separately as admin entitlement overrides (scripts/ops/provision-owner-access.js),
 * never by a fake subscription or payment.
 */
const db = new PrismaClient();
const id = (key: string) => {
  const h = createHash("sha256").update(`petlife-owner-review:${key}`).digest("hex").slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20)}`;
};
/** The batch-2 demo clinic (seed-batch2.ts) is reused for visits, vitals and bookings. */
const batch2 = (key: string) => {
  const h = createHash("sha256").update(`petlife-batch2-qa:${key}`).digest("hex").slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20)}`;
};
const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY);
const USERNAME = "owner.review";
const EMAIL = "owner-review@example.test";

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "").pathname;
  if (!database.endsWith("_test") && process.env.PETLIFE_QA_SEED_DATABASE !== database.slice(1)) {
    throw new Error("This seed runs against a *_test database, or the database named in PETLIFE_QA_SEED_DATABASE.");
  }
  const summary: Record<string, string> = {};

  // ---------------------------------------------------------------- account
  const existing = await db.user.findUnique({ where: { email: EMAIL } });
  const user = existing ?? (await db.user.create({ data: { id: id("user"), email: EMAIL, emailVerifiedAt: new Date(), username: USERNAME, normalizedUsername: USERNAME, displayName: "بازبین مالک (حساب بازبینی)", locale: "fa" } }));
  summary.user = existing ? "ALREADY_PRESENT" : "CREATED";
  const credentialFile = process.env.OWNER_REVIEW_CREDENTIAL_FILE;
  if (!user.passwordHash && credentialFile) {
    const password = randomBytes(18).toString("base64url");
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
    const origin = process.env.OWNER_PUBLIC_ORIGIN ?? "http://185.231.112.154";
    await writeFile(credentialFile, `USER_URL=${origin}/fa/account\nIDENTIFIER=${USERNAME}\nTEMP_PASSWORD=${password}\n# Change it after sign-in: Account → Security.\n`, { mode: 0o600 });
    await chmod(credentialFile, 0o600);
    summary.password = "SET (written to credential file)";
  } else summary.password = user.passwordHash ? "ALREADY_SET (unchanged)" : "NOT_SET (no OWNER_REVIEW_CREDENTIAL_FILE)";

  // ---------------------------------------------------------------- household + pet
  const householdId = id("household");
  await db.household.upsert({ where: { id: householdId }, create: { id: householdId, name: "خانواده‌ی بازبین (بازبینی مالک)", city: "تهران", countryCode: "IR" }, update: {} });
  await db.householdMember.upsert({ where: { householdId_userId: { householdId, userId: user.id } }, create: { householdId, userId: user.id, role: "OWNER" }, update: {} });
  const petId = id("pet:cookie");
  await db.pet.upsert({
    where: { id: petId },
    create: {
      id: petId, householdId, name: "کوکی", species: "DOG", breed: "گلدن رتریور", sex: "FEMALE", birthDate: new Date("2022-03-14"),
      photoUrl: "/images/landing/cookie-reference.jpg", latestWeightValue: 27.4, latestWeightUnit: "KG", colorMarkings: "طلایی روشن، لکه‌ی سفید روی سینه",
      neuteredStatus: "NEUTERED", microchipNumber: "985112009876543", microchipNormalized: "985112009876543",
    },
    update: {},
  });
  const FULL = { canViewIdentity: true, canEditIdentity: true, canViewHealth: true, canEditHealth: true, canBookCare: true, canViewCareProfile: true, canEditCareProfile: true, canViewLocation: true, canManageAccess: true };
  await db.petAccessGrant.upsert({ where: { id: id("grant:owner") }, create: { id: id("grant:owner"), petId, userId: user.id, source: "HOUSEHOLD", ...FULL }, update: {} });
  await db.petEmergencyInfo.upsert({ where: { petId }, create: { petId, contactName: "سارا (خواهر)", contactPhone: "09120000001", contactRelation: "خواهر", criticalNotes: "به پروتئین مرغ حساسیت دارد.", updatedByUserId: user.id }, update: {} });

  // ---------------------------------------------------------------- health
  const org = batch2("clinic"), staff = batch2("staff"), location = batch2("location"), service = batch2("service");
  const clinic = await db.providerOrganization.findUnique({ where: { id: org } });
  await db.vaccinationSummary.upsert({ where: { petId }, create: { petId, status: "UP_TO_DATE", lastKnownDate: at(-120), nextDueDate: at(245), notes: "واکسن‌های هاری و چندگانه طبق کارت واکسن.", sourceType: "OWNER" }, update: {} });
  await db.allergy.upsert({ where: { id: id("allergy") }, create: { id: id("allergy"), petId, name: "حساسیت به پروتئین مرغ", reaction: "خارش و قرمزی پوست", severity: "MODERATE", sourceType: "OWNER", recordedByUserId: user.id }, update: {} });
  await db.condition.upsert({ where: { id: id("condition") }, create: { id: id("condition"), petId, name: "درماتیت آتوپیک", status: "ACTIVE", sourceType: "OWNER" }, update: {} });
  await db.medication.upsert({ where: { id: id("medication") }, create: { id: id("medication"), petId, name: "Apoquel (oclacitinib)", dosage: 16, unit: "mg", frequencyText: "روزی یک‌بار همراه غذا", route: "خوراکی", status: "ACTIVE", startDate: at(-40), sourceType: "OWNER" }, update: {} });
  const labs: [string, string, string, string, number, number, "NORMAL" | "ABNORMAL"][] = [
    ["wbc", "گلبول سفید (WBC)", "WBC", "12.1", 6, 17, "NORMAL"], ["hgb", "هموگلوبین (HGB)", "HGB", "15.8", 12, 18, "NORMAL"],
    ["alt", "آنزیم کبدی (ALT)", "ALT", "58", 10, 100, "NORMAL"], ["alp", "آلکالین فسفاتاز (ALP)", "ALP", "171", 20, 150, "ABNORMAL"],
  ];
  for (const [key, testName, testCode, value, low, high, flag] of labs) {
    await db.labResult.upsert({ where: { id: id(`lab:${key}`) }, create: { id: id(`lab:${key}`), petId, testName, testCode, sampleDate: at(-14), resultDate: at(-13), value, referenceRangeLow: low, referenceRangeHigh: high, flag, status: "FINAL" }, update: {} });
  }
  if (clinic) {
    await db.imagingStudy.upsert({ where: { id: id("imaging") }, create: { id: id("imaging"), petId, studyType: "XRAY", providerOrganizationId: org, performedByProviderUserId: staff, bodyRegion: "قفسه‌ی سینه", report: "رادیوگرافی قفسه‌ی سینه؛ یافته‌ی غیرطبیعی دیده نشد." }, update: {} });
    const visitId = id("visit");
    await db.clinicalVisit.upsert({ where: { id: visitId }, create: { id: visitId, petId, householdId, providerOrganizationId: org, providerUserId: staff, status: "COMPLETED", startedAt: at(-14), completedAt: at(-14), reasonForVisit: "خارش پوست و آزمایش خون دوره‌ای", assessmentText: "درماتیت آتوپیک کنترل‌شده.", planText: "ادامه‌ی دارو، کنترل دوباره‌ی آنزیم کبدی پس از دو ماه." }, update: {} });
    // Weight history: clinic-recorded vitals over the last year.
    for (const [key, days, kg] of [["w1", -330, 24.9], ["w2", -210, 26.1], ["w3", -100, 26.8], ["w4", -14, 27.4]] as const) {
      await db.patientVitalsRecord.upsert({ where: { id: id(`vitals:${key}`) }, create: { id: id(`vitals:${key}`), petId, providerOrganizationId: org, providerUserId: staff, clinicalVisitId: key === "w4" ? visitId : null, recordedAt: at(days), weightValue: kg, weightUnit: "KG", temperatureC: 38.5, heartRateBpm: 96, bodyConditionScore: 5 }, update: {} });
    }
    // Booking history: one completed (with a structured review), one upcoming.
    const past = at(-14), next = at(9);
    await db.booking.upsert({ where: { id: id("booking:past") }, create: { id: id("booking:past"), petId, householdId, userId: user.id, providerOrganizationId: org, providerLocationId: location, providerServiceId: service, providerUserId: staff, category: "VET", locationMode: "AT_PROVIDER", startAt: past, endAt: new Date(past.getTime() + 1800_000), timezone: "Asia/Tehran", bookingStatus: "COMPLETED", completedAt: new Date(past.getTime() + 1800_000) }, update: {} });
    await db.booking.upsert({ where: { id: id("booking:next") }, create: { id: id("booking:next"), petId, householdId, userId: user.id, providerOrganizationId: org, providerLocationId: location, providerServiceId: service, providerUserId: staff, category: "VET", locationMode: "AT_PROVIDER", startAt: next, endAt: new Date(next.getTime() + 1800_000), timezone: "Asia/Tehran", bookingStatus: "CONFIRMED" }, update: {} });
    await db.providerReview.upsert({ where: { bookingId: id("booking:past") }, create: { id: id("review"), bookingId: id("booking:past"), providerOrganizationId: org, userId: user.id, rating: 5, quality: 5, communication: 5, timeliness: 4, body: "معاینه‌ی دقیق و توضیح کامل نتایج آزمایش." }, update: {} });
    await db.providerFavorite.upsert({ where: { userId_providerOrganizationId: { userId: user.id, providerOrganizationId: org } }, create: { userId: user.id, providerOrganizationId: org }, update: {} });
    summary.clinic = "batch-2 demo clinic linked";
  } else summary.clinic = "MISSING (run seed-batch2.ts) — visits/vitals/bookings skipped";
  const docKey = `health-documents/${petId}/owner-review-skin.jpg`;
  const source = resolve(__dirname, "../../web/public/images/landing/cookie-reference.jpg");
  const destination = resolve(process.env.STORAGE_LOCAL_DIR ?? "./local-storage", docKey);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  await db.medicalDocument.upsert({ where: { id: id("document") }, create: { id: id("document"), petId, householdId, title: "عکس ضایعه‌ی پوستی — پیوست ویزیت", documentType: "OTHER", sourceType: "OWNER", sourceUserId: user.id, fileObjectKey: docKey, mimeType: "image/jpeg", fileSizeBytes: (await stat(source)).size }, update: {} });

  // ---------------------------------------------------------------- care + memories
  const care: [string, string, string, number, "UPCOMING" | "COMPLETED"][] = [
    ["rabies", "واکسن هاری سالانه", "VACCINATION", 245, "UPCOMING"], ["deworm", "قرص ضدانگل سه‌ماهه", "DEWORMING", 6, "UPCOMING"],
    ["refill", "تهیه‌ی دوباره‌ی آپوکوئل", "MEDICATION_REFILL", 3, "UPCOMING"], ["groom", "حمام و کوتاه‌کردن ناخن", "GROOMING", 12, "UPCOMING"],
    ["weight", "کنترل وزن ماهانه", "WEIGHT_CHECK", -20, "COMPLETED"],
  ];
  for (const [key, title, type, days, state] of care) {
    await db.careReminder.upsert({ where: { id: id(`care:${key}`) }, create: { id: id(`care:${key}`), petId, createdByUserId: user.id, title, type, dueAt: at(days), originalDueAt: at(days), state, completedAt: state === "COMPLETED" ? at(days) : null, completedByUserId: state === "COMPLETED" ? user.id : null } as never, update: {} });
  }
  const memories: [string, "FIRST_DAY" | "BIRTHDAY" | "TRAVEL" | "ACHIEVEMENT" | "STORY", string, number][] = [
    ["first-day", "FIRST_DAY", "اولین روز در خانه", -900], ["birthday", "BIRTHDAY", "تولد سه‌سالگی", -210],
    ["sea", "TRAVEL", "اولین سفر به شمال", -120], ["trick", "ACHIEVEMENT", "یاد گرفت بنشیند و صبر کند", -45], ["park", "STORY", "دوستی تازه در پارک", -6],
  ];
  for (const [key, type, title, days] of memories) {
    await db.petMemory.upsert({ where: { id: id(`memory:${key}`) }, create: { id: id(`memory:${key}`), petId, householdId, createdByUserId: user.id, type, title, description: "خاطره‌ی بازبینی مالک.", occurredAt: at(days) }, update: {} });
  }

  // ---------------------------------------------------------------- travel, favourites, notifications
  const tripId = id("trip");
  await db.trip.upsert({ where: { id: tripId }, create: { id: tripId, householdId, petId, createdByUserId: user.id, originCountry: "IR", originCity: "تهران", destinationCountry: "IR", destinationCity: "رامسر", departAt: at(18), returnAt: at(22), travelMode: "ROAD" }, update: {} });
  for (const [i, [category, label, done]] of ([["DOCUMENTS", "کارت واکسن و شناسنامه‌ی پت", true], ["FOOD", "غذا برای پنج روز", false], ["CARRIER", "باکس حمل", false]] as const).entries()) {
    await db.tripChecklistItem.upsert({ where: { id: id(`trip:item:${i}`) }, create: { id: id(`trip:item:${i}`), tripId, category, label, done, doneAt: done ? new Date() : null, sortOrder: i }, update: {} });
  }
  const place = await db.petFriendlyPlace.findFirst({ where: { isPubliclyListed: true }, orderBy: { createdAt: "asc" } });
  if (place) await db.petFriendlyPlaceFavorite.upsert({ where: { placeId_userId: { placeId: place.id, userId: user.id } }, create: { userId: user.id, placeId: place.id }, update: {} });
  const notes: [string, string, "HEALTH" | "BOOKING" | "TRAVEL", string, string, string][] = [
    ["n-care", "care.reminder_due", "HEALTH", "یادآور مراقبت", "تهیه‌ی دوباره‌ی آپوکوئل تا سه روز دیگر.", `/pets/${petId}/care`],
    ["n-booking", "booking.confirmed", "BOOKING", "نوبت شما تأیید شد", "نوبت ویزیت کوکی در درمانگاه مهر تأیید شد.", `/bookings/${id("booking:next")}`],
    ["n-trip", "travel.trip_approaching", "TRAVEL", "سفر نزدیک است", "دو مورد از چک‌لیست سفر رامسر باز است.", `/travel/trips/${tripId}`],
  ];
  for (const [key, type, category, title, body, deepLink] of notes) {
    await db.notification.upsert({ where: { id: id(key) }, create: { id: id(key), userId: user.id, householdId, petId, type, category, title, body, locale: "fa", deepLink }, update: {} });
  }

  console.log(JSON.stringify({ identifier: USERNAME, userId: user.id, householdId, petId, ...summary }));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
