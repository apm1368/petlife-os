import { Prisma, PrismaClient, TravelBookingStatus } from "@prisma/client";
import { createHash } from "node:crypto";
import { priceStay, type PolicyTerms, type RatePlanTerms } from "../src/modules/travel-marketplace/travel-pricing.util";
import { PetAccessService } from "../src/modules/pet-access/pet-access.service";

/**
 * Batch 5 QA scenarios — travel, trip hub, insurance and places.
 *
 * Exactly five travel listings (four published, one awaiting PET LIFE review)
 * with repository-owned illustrations under /images/travel, from three demo
 * partners. One demo traveller household with three pets (a dog with a
 * weight, a cat, a dog without a recorded weight) and bookings in the states
 * the UI must handle: a confirmed upcoming stay, a request awaiting the
 * property, a completed stay with a verified review, and a cancelled one.
 * One rich trip ties a stay, readiness rows with provenance, an insurance
 * application and destination places together. An insurer with two products
 * and a portal member; six places with PostGIS points.
 *
 * Honesty rules for demo data:
 * - No payment is recorded as captured: seeded stays use pay-at-property rates.
 * - Requirement-library rows are labelled as QA samples, not official rules.
 * - Everything is marked (نمایشی) / demo; e-mail domains are example.test.
 *
 * Idempotent (deterministic ids + upserts). Runs only against a *_test
 * database, or a staging database named in PETLIFE_QA_SEED_DATABASE.
 */
const db = new PrismaClient();
const id = (key: string) => {
  const h = createHash("sha256").update(`petlife-batch5-qa:${key}`).digest("hex").slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20)}`;
};
const DAY = 86_400_000;
const midnight = (offsetDays: number) => {
  const d = new Date(Date.now() + offsetDays * DAY);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};
const nightsOf = (checkIn: Date, checkOut: Date) => {
  const out: Date[] = [];
  for (let t = checkIn.getTime(); t < checkOut.getTime(); t += DAY) out.push(new Date(t));
  return out;
};

async function user(email: string, name: string) {
  return db.user.upsert({ where: { email }, create: { id: id(`user:${email}`), email, displayName: name, locale: "fa" }, update: {} });
}

interface PlanSeed extends Omit<RatePlanTerms, "id" | "activeFrom" | "activeUntil" | "isActive" | "includedItems"> { key: string }
interface ListingSeed {
  key: string;
  partner: "A" | "B" | "C";
  type: "VILLA" | "HOTEL" | "ECO_LODGE" | "PET_HOTEL" | "GUESTHOUSE";
  title: string;
  description: string;
  city: string;
  province: string;
  lat: number;
  lng: number;
  image: string;
  status: "PUBLISHED" | "PENDING_REVIEW";
  bookingMode: "INSTANT_BOOKING" | "REQUEST_TO_BOOK";
  verified: boolean;
  amenities: string[];
  checkInFrom: string;
  checkOutUntil: string;
  houseRules?: string;
  policy: (PolicyTerms & { vaccinationRequired?: boolean; leashRequired?: boolean; notes?: string }) | null;
  unit: { name: string; quantity: number; maxOccupancy: number; price: number; maxPets?: number; bedInfo?: string };
  plans: PlanSeed[];
}

const PLAN_DEFAULTS = { priceModifierPercent: 0, freeCancellationDays: null, lateRefundPercent: null, depositPercent: null, includesBreakfast: false, minNights: null } as const;

const LISTINGS: ListingSeed[] = [
  {
    key: "ramsar", partner: "A", type: "VILLA", title: "ویلای باغ رامسر (نمایشی)", city: "رامسر", province: "مازندران", lat: 36.9031, lng: 50.6583, image: "/images/travel/villa-ramsar.svg",
    description: "ویلای دوخوابه با حیاط محصور و دسترسی پیاده به ساحل. برای سگ‌های متوسط و گربه‌ها مناسب است؛ ظرف آب و غذا و جای خواب حیوان آماده است.",
    status: "PUBLISHED", bookingMode: "INSTANT_BOOKING", verified: true, amenities: ["FENCED_YARD", "PARKING", "WIFI", "PET_BED", "PET_BOWLS", "KITCHEN"], checkInFrom: "14:00", checkOutUntil: "12:00", houseRules: "حیوان در اتاق خواب روی تخت نرود. سروصدا بعد از ساعت ۲۳ ممنوع.",
    policy: { dogsAllowed: true, catsAllowed: true, otherAllowed: false, maxPets: 2, maxWeightKg: 25, minWeightKg: null, petFeeIrr: 5_000_000, depositIrr: null, vaccinationRequired: true, leashRequired: true, notes: "در فضای مشترک باغ، قلاده الزامی است." },
    unit: { name: "کل ویلا", quantity: 1, maxOccupancy: 5, price: 45_000_000, maxPets: 2, bedInfo: "۲ تخت دونفره" },
    plans: [
      { key: "flex", name: "انعطاف‌پذیر — پرداخت در محل", ...PLAN_DEFAULTS, cancellationType: "FREE_UNTIL", freeCancellationDays: 3, lateRefundPercent: 0, paymentTiming: "PAY_AT_PROPERTY" },
      { key: "saver", name: "اقتصادی — غیرقابل استرداد", ...PLAN_DEFAULTS, priceModifierPercent: -15, cancellationType: "NON_REFUNDABLE", paymentTiming: "PAY_NOW", minNights: 2 },
    ],
  },
  {
    key: "shiraz", partner: "B", type: "HOTEL", title: "هتل باغ ارم شیراز (نمایشی)", city: "شیراز", province: "فارس", lat: 29.6363, lng: 52.5250, image: "/images/travel/hotel-shiraz.svg",
    description: "هتل سنتی با اتاق‌های ویژهٔ مهمانان همراه حیوان در طبقهٔ همکف و دسترسی به حیاط. درخواست‌ها ظرف ۲۴ ساعت بررسی می‌شوند.",
    status: "PUBLISHED", bookingMode: "REQUEST_TO_BOOK", verified: true, amenities: ["BREAKFAST", "WIFI", "RESTAURANT", "AIR_CONDITIONING", "YARD"], checkInFrom: "15:00", checkOutUntil: "11:00",
    policy: { dogsAllowed: true, catsAllowed: true, otherAllowed: false, maxPets: 1, maxWeightKg: 15, minWeightKg: null, petFeeIrr: 3_000_000, depositIrr: 10_000_000, vaccinationRequired: true, leashRequired: true },
    unit: { name: "اتاق دوتخته همکف (حیوان‌پذیر)", quantity: 3, maxOccupancy: 2, price: 28_000_000, maxPets: 1, bedInfo: "۱ تخت دونفره" },
    plans: [
      { key: "bb", name: "با صبحانه — پرداخت در محل", ...PLAN_DEFAULTS, includesBreakfast: true, cancellationType: "PARTIAL", lateRefundPercent: 50, paymentTiming: "PAY_AT_PROPERTY" },
    ],
  },
  {
    key: "kashan", partner: "B", type: "ECO_LODGE", title: "اقامتگاه بوم‌گردی خانهٔ خشتی کاشان (نمایشی)", city: "کاشان", province: "اصفهان", lat: 33.9850, lng: 51.4100, image: "/images/travel/ecolodge-kashan.svg",
    description: "خانهٔ خشتی بازسازی‌شده با حیاط مرکزی. فقط گربه‌ها و سگ‌های کوچک؛ محدودیت وزن اعلام نشده است، پیش از سفر با اقامتگاه هماهنگ کنید.",
    status: "PUBLISHED", bookingMode: "INSTANT_BOOKING", verified: false, amenities: ["YARD", "BREAKFAST", "HEATING"], checkInFrom: "14:00", checkOutUntil: "12:00",
    policy: { dogsAllowed: true, catsAllowed: true, otherAllowed: false, maxPets: null, maxWeightKg: null, minWeightKg: null, petFeeIrr: 0, depositIrr: null },
    unit: { name: "اتاق حیاطی", quantity: 2, maxOccupancy: 3, price: 18_000_000 },
    plans: [{ key: "std", name: "استاندارد — پرداخت در محل", ...PLAN_DEFAULTS, cancellationType: "FREE_UNTIL", freeCancellationDays: 2, lateRefundPercent: 0, paymentTiming: "PAY_AT_PROPERTY" }],
  },
  {
    key: "tehran-pethotel", partner: "C", type: "PET_HOTEL", title: "پانسیون و هتل حیوانات شمال تهران (نمایشی)", city: "تهران", province: "تهران", lat: 35.8030, lng: 51.4350, image: "/images/travel/pet-hotel-tehran.svg",
    description: "هتل ویژهٔ حیوانات خانگی با اتاقک‌های جداگانه، پیاده‌روی روزانه و گزارش تصویری. دامپزشک آنکال.",
    status: "PUBLISHED", bookingMode: "INSTANT_BOOKING", verified: true, amenities: ["VET_ON_CALL", "PET_SITTING", "GROOMING", "AIR_CONDITIONING"], checkInFrom: "09:00", checkOutUntil: "18:00",
    policy: { dogsAllowed: true, catsAllowed: true, otherAllowed: true, maxPets: 3, maxWeightKg: 40, minWeightKg: null, petFeeIrr: 0, depositIrr: null, vaccinationRequired: true },
    unit: { name: "اتاقک استاندارد", quantity: 6, maxOccupancy: 1, price: 6_000_000, maxPets: 1 },
    plans: [{ key: "std", name: "پرداخت در محل", ...PLAN_DEFAULTS, cancellationType: "FREE_UNTIL", freeCancellationDays: 1, lateRefundPercent: 0, paymentTiming: "PAY_AT_PROPERTY" }],
  },
  {
    key: "rasht", partner: "A", type: "GUESTHOUSE", title: "مهمان‌خانهٔ سبز رشت (نمایشی — در انتظار بررسی)", city: "رشت", province: "گیلان", lat: 37.2808, lng: 49.5832, image: "/images/travel/guesthouse-rasht.svg",
    description: "مهمان‌خانهٔ کوچک نزدیک بازار رشت. قوانین حیوانات هنوز ثبت نشده و اقامتگاه برای بررسی PET LIFE ارسال شده است.",
    status: "PENDING_REVIEW", bookingMode: "INSTANT_BOOKING", verified: false, amenities: ["WIFI"], checkInFrom: "14:00", checkOutUntil: "12:00",
    policy: null,
    unit: { name: "اتاق دونفره", quantity: 2, maxOccupancy: 2, price: 12_000_000 },
    plans: [],
  },
  // Showcase additions — enough published stays for the search and destination screens to read as a real catalogue.
  {
    key: "isfahan", partner: "B", type: "HOTEL", title: "هتل نقش جهان اصفهان (نمایشی)", city: "اصفهان", province: "اصفهان", lat: 32.6575, lng: 51.6776, image: "/images/travel/hotel-shiraz.svg",
    description: "هتل چهارستاره در فاصلهٔ پیاده تا میدان نقش جهان. دو طبقهٔ مخصوص مهمانان همراه حیوان با کف‌پوش قابل شست‌وشو.",
    status: "PUBLISHED", bookingMode: "INSTANT_BOOKING", verified: true, amenities: ["BREAKFAST", "WIFI", "ELEVATOR", "AIR_CONDITIONING", "PARKING"], checkInFrom: "14:00", checkOutUntil: "12:00",
    policy: { dogsAllowed: true, catsAllowed: true, otherAllowed: false, maxPets: 1, maxWeightKg: 12, minWeightKg: null, petFeeIrr: 4_000_000, depositIrr: null, vaccinationRequired: true, leashRequired: true },
    unit: { name: "اتاق دبل حیوان‌پذیر", quantity: 4, maxOccupancy: 2, price: 32_000_000, maxPets: 1, bedInfo: "۱ تخت دونفره" },
    plans: [{ key: "flex", name: "انعطاف‌پذیر — پرداخت در محل", ...PLAN_DEFAULTS, includesBreakfast: true, cancellationType: "FREE_UNTIL", freeCancellationDays: 2, lateRefundPercent: 0, paymentTiming: "PAY_AT_PROPERTY" }],
  },
  {
    key: "tabriz", partner: "A", type: "GUESTHOUSE", title: "خانهٔ قدیمی تبریز (نمایشی)", city: "تبریز", province: "آذربایجان شرقی", lat: 38.0800, lng: 46.2919, image: "/images/travel/guesthouse-rasht.svg",
    description: "مهمان‌خانهٔ خانوادگی در بافت تاریخی با حیاط آجری. گربه‌ها پذیرفته می‌شوند؛ سگ فقط با هماهنگی قبلی.",
    status: "PUBLISHED", bookingMode: "REQUEST_TO_BOOK", verified: true, amenities: ["YARD", "BREAKFAST", "HEATING", "WIFI"], checkInFrom: "13:00", checkOutUntil: "11:00",
    policy: { dogsAllowed: false, catsAllowed: true, otherAllowed: false, maxPets: 2, maxWeightKg: null, minWeightKg: null, petFeeIrr: 0, depositIrr: null },
    unit: { name: "اتاق حیاطی", quantity: 3, maxOccupancy: 3, price: 14_000_000, maxPets: 2 },
    plans: [{ key: "std", name: "استاندارد — پرداخت در محل", ...PLAN_DEFAULTS, cancellationType: "FREE_UNTIL", freeCancellationDays: 3, lateRefundPercent: 0, paymentTiming: "PAY_AT_PROPERTY" }],
  },
  {
    key: "chalus", partner: "A", type: "VILLA", title: "ویلای جنگلی چالوس (نمایشی)", city: "چالوس", province: "مازندران", lat: 36.6550, lng: 51.4200, image: "/images/travel/villa-ramsar.svg",
    description: "ویلای سه‌خوابه در دل جنگل با حیاط بزرگ محصور؛ مناسب سگ‌های بزرگ‌جثه. نزدیک‌ترین دامپزشکی ۱۵ دقیقه فاصله دارد.",
    status: "PUBLISHED", bookingMode: "INSTANT_BOOKING", verified: true, amenities: ["FENCED_YARD", "PARKING", "KITCHEN", "HEATING", "PET_BED"], checkInFrom: "15:00", checkOutUntil: "12:00", houseRules: "حیوان در جنگل اطراف همیشه با قلاده باشد.",
    policy: { dogsAllowed: true, catsAllowed: true, otherAllowed: false, maxPets: 3, maxWeightKg: 45, minWeightKg: null, petFeeIrr: 6_000_000, depositIrr: 15_000_000, vaccinationRequired: true, leashRequired: true },
    unit: { name: "کل ویلا", quantity: 1, maxOccupancy: 7, price: 62_000_000, maxPets: 3, bedInfo: "۳ تخت دونفره و ۱ کاناپه" },
    plans: [
      { key: "flex", name: "انعطاف‌پذیر — پرداخت در محل", ...PLAN_DEFAULTS, cancellationType: "FREE_UNTIL", freeCancellationDays: 5, lateRefundPercent: 30, paymentTiming: "PAY_AT_PROPERTY" },
      { key: "saver", name: "اقتصادی — غیرقابل استرداد", ...PLAN_DEFAULTS, priceModifierPercent: -12, cancellationType: "NON_REFUNDABLE", paymentTiming: "PAY_NOW", minNights: 2 },
    ],
  },
  {
    key: "mashhad", partner: "B", type: "HOTEL", title: "هتل آپارتمان مشهد (نمایشی)", city: "مشهد", province: "خراسان رضوی", lat: 36.2972, lng: 59.6067, image: "/images/travel/hotel-shiraz.svg",
    description: "سوئیت‌های آشپزخانه‌دار با پارکینگ اختصاصی. فقط حیوانات کوچک‌جثه؛ پیاده‌روی در فضای سبز مجاور.",
    status: "PUBLISHED", bookingMode: "INSTANT_BOOKING", verified: false, amenities: ["KITCHEN", "PARKING", "WIFI", "AIR_CONDITIONING"], checkInFrom: "14:00", checkOutUntil: "12:00",
    policy: { dogsAllowed: true, catsAllowed: true, otherAllowed: false, maxPets: 1, maxWeightKg: 8, minWeightKg: null, petFeeIrr: 2_500_000, depositIrr: null },
    unit: { name: "سوئیت یک‌خوابه", quantity: 5, maxOccupancy: 3, price: 22_000_000, maxPets: 1 },
    plans: [{ key: "std", name: "پرداخت در محل", ...PLAN_DEFAULTS, cancellationType: "PARTIAL", lateRefundPercent: 50, paymentTiming: "PAY_AT_PROPERTY" }],
  },
  {
    key: "karaj-pethotel", partner: "C", type: "PET_HOTEL", title: "هتل حیوانات کرج — شعبهٔ مهرشهر (نمایشی)", city: "کرج", province: "البرز", lat: 35.8150, lng: 50.9300, image: "/images/travel/pet-hotel-tehran.svg",
    description: "نگهداری روزانه و شبانه با حیاط بازی، دوربین آنلاین و گزارش روزانه به صاحب حیوان.",
    status: "PUBLISHED", bookingMode: "REQUEST_TO_BOOK", verified: true, amenities: ["PET_SITTING", "GROOMING", "VET_ON_CALL"], checkInFrom: "08:00", checkOutUntil: "20:00",
    policy: { dogsAllowed: true, catsAllowed: true, otherAllowed: true, maxPets: 2, maxWeightKg: 50, minWeightKg: null, petFeeIrr: 0, depositIrr: null, vaccinationRequired: true },
    unit: { name: "اتاقک بزرگ", quantity: 8, maxOccupancy: 1, price: 5_000_000, maxPets: 1 },
    plans: [{ key: "std", name: "پرداخت در محل", ...PLAN_DEFAULTS, cancellationType: "FREE_UNTIL", freeCancellationDays: 1, lateRefundPercent: 0, paymentTiming: "PAY_AT_PROPERTY" }],
  },
  {
    key: "yazd", partner: "B", type: "ECO_LODGE", title: "اقامتگاه بوم‌گردی بادگیر یزد (نمایشی)", city: "یزد", province: "یزد", lat: 31.8974, lng: 54.3569, image: "/images/travel/ecolodge-kashan.svg",
    description: "خانهٔ سنتی با بادگیر و حوض. سگ‌ها فقط در حیاط؛ گربه‌ها در اتاق هم پذیرفته می‌شوند.",
    status: "PUBLISHED", bookingMode: "INSTANT_BOOKING", verified: true, amenities: ["YARD", "BREAKFAST", "AIR_CONDITIONING"], checkInFrom: "14:00", checkOutUntil: "12:00",
    policy: { dogsAllowed: true, catsAllowed: true, otherAllowed: false, maxPets: 2, maxWeightKg: 20, minWeightKg: null, petFeeIrr: 1_500_000, depositIrr: null, notes: "سگ‌ها شب را در حیاط سرپوشیده می‌گذرانند." },
    unit: { name: "اتاق شاه‌نشین", quantity: 2, maxOccupancy: 4, price: 20_000_000, maxPets: 2 },
    plans: [{ key: "std", name: "با صبحانه — پرداخت در محل", ...PLAN_DEFAULTS, includesBreakfast: true, cancellationType: "FREE_UNTIL", freeCancellationDays: 2, lateRefundPercent: 0, paymentTiming: "PAY_AT_PROPERTY" }],
  },
];

const PLACES = [
  { key: "ramsar-beach", name: "ساحل حیوان‌پذیر رامسر (نمایشی)", category: "BEACH", city: "رامسر", province: "مازندران", lat: 36.9105, lng: 50.6700, leash: true, water: false, area: true },
  { key: "ramsar-cafe", name: "کافه باغ چای رامسر (نمایشی)", category: "CAFE", city: "رامسر", province: "مازندران", lat: 36.9000, lng: 50.6550, leash: true, water: true, area: null },
  { key: "shiraz-park", name: "بوستان آزادی شیراز — بخش حیوانات (نمایشی)", category: "PARK", city: "شیراز", province: "فارس", lat: 29.6330, lng: 52.5300, leash: true, water: true, area: true },
  { key: "shiraz-cafe", name: "کافه نارنجستان شیراز (نمایشی)", category: "CAFE", city: "شیراز", province: "فارس", lat: 29.6200, lng: 52.5450, leash: null, water: null, area: null },
  { key: "tehran-park", name: "پارک سگ‌های شمال تهران (نمایشی)", category: "PARK", city: "تهران", province: "تهران", lat: 35.8000, lng: 51.4300, leash: false, water: true, area: true },
  { key: "tehran-store", name: "فروشگاه لوازم سفر حیوانات تهران (نمایشی)", category: "STORE", city: "تهران", province: "تهران", lat: 35.7600, lng: 51.4100, leash: true, water: null, area: false },
  { key: "isfahan-park", name: "پارک ناژوان اصفهان — مسیر سگ‌گردانی (نمایشی)", category: "PARK", city: "اصفهان", province: "اصفهان", lat: 32.6290, lng: 51.6180, leash: true, water: true, area: false },
  { key: "isfahan-cafe", name: "کافه چهارباغ اصفهان (نمایشی)", category: "CAFE", city: "اصفهان", province: "اصفهان", lat: 32.6480, lng: 51.6690, leash: true, water: true, area: null },
  { key: "tehran-cafe", name: "کافه پاتوق حیوانات تجریش (نمایشی)", category: "CAFE", city: "تهران", province: "تهران", lat: 35.8040, lng: 51.4270, leash: null, water: true, area: null },
  { key: "chalus-beach", name: "ساحل نمک‌آبرود — بخش حیوان‌پذیر (نمایشی)", category: "BEACH", city: "چالوس", province: "مازندران", lat: 36.6900, lng: 51.3300, leash: true, water: false, area: true },
  { key: "karaj-store", name: "فروشگاه پت‌شاپ گوهردشت کرج (نمایشی)", category: "STORE", city: "کرج", province: "البرز", lat: 35.8300, lng: 50.9500, leash: true, water: null, area: false },
] as const;

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "").pathname;
  if (!database.endsWith("_test") && process.env.PETLIFE_QA_SEED_DATABASE !== database.slice(1)) {
    throw new Error("This QA seed runs against a *_test database, or a staging database named in PETLIFE_QA_SEED_DATABASE.");
  }

  // ---- Partners (travel accommodation providers)
  const partners = {
    A: { name: "گروه اقامتی شمال (نمایشی)", owner: "batch5-partner-a@example.test", ownerName: "سارا کیانی" },
    B: { name: "هتل‌داران فارس و اصفهان (نمایشی)", owner: "batch5-partner-b@example.test", ownerName: "رضا معینی" },
    C: { name: "پانسیون حیوانات البرز (نمایشی)", owner: "batch5-partner-c@example.test", ownerName: "نگار طاهری" },
  } as const;
  const orgId: Record<string, string> = {};
  for (const [key, p] of Object.entries(partners)) {
    orgId[key] = id(`org:${key}`);
    await db.providerOrganization.upsert({ where: { id: orgId[key] }, create: { id: orgId[key], name: p.name, type: "TRAVEL_ACCOMMODATION", verificationStatus: "VERIFIED" }, update: {} });
    const owner = await user(p.owner, p.ownerName);
    await db.providerUser.upsert({ where: { id: id(`provider-user:${key}`) }, create: { id: id(`provider-user:${key}`), userId: owner.id, providerOrganizationId: orgId[key]!, role: "OWNER" }, update: {} });
  }

  // ---- Listings, pet policies, units, rate plans, media
  const unitIds: Record<string, string> = {};
  const planIds: Record<string, string> = {};
  for (const [i, l] of LISTINGS.entries()) {
    const listingId = id(`listing:${l.key}`);
    await db.travelListing.upsert({
      where: { id: listingId },
      create: {
        id: listingId, organizationId: orgId[l.partner]!, type: l.type, title: l.title, description: l.description, country: "IR", province: l.province, city: l.city, latitude: l.lat, longitude: l.lng,
        amenities: l.amenities, bookingMode: l.bookingMode, status: l.status, isVerified: l.verified, isPubliclyListed: l.status === "PUBLISHED", checkInFrom: l.checkInFrom, checkOutUntil: l.checkOutUntil, houseRules: l.houseRules ?? null,
        cancellationPolicy: l.plans.length ? null : "لغو رایگان تا ۲ روز پیش از ورود.", submittedAt: new Date(Date.now() - (10 - i) * DAY), reviewedAt: l.status === "PUBLISHED" ? new Date(Date.now() - (9 - i) * DAY) : null,
      },
      update: {},
    });
    if (l.policy) {
      await db.travelPetPolicy.upsert({
        where: { listingId },
        create: { listingId, dogsAllowed: l.policy.dogsAllowed, catsAllowed: l.policy.catsAllowed, otherAllowed: l.policy.otherAllowed, maxPets: l.policy.maxPets, maxWeightKg: l.policy.maxWeightKg, minWeightKg: l.policy.minWeightKg, petFeeIrr: l.policy.petFeeIrr, depositIrr: l.policy.depositIrr, vaccinationRequired: l.policy.vaccinationRequired ?? false, leashRequired: l.policy.leashRequired ?? false, notes: l.policy.notes ?? null },
        update: {},
      });
    }
    const unitId = id(`unit:${l.key}`);
    unitIds[l.key] = unitId;
    await db.travelInventoryUnit.upsert({ where: { id: unitId }, create: { id: unitId, listingId, name: l.unit.name, quantity: l.unit.quantity, maxOccupancy: l.unit.maxOccupancy, basePriceIrr: l.unit.price, maxPets: l.unit.maxPets ?? null, bedInfo: l.unit.bedInfo ?? null }, update: {} });
    for (const p of l.plans) {
      const planId = id(`plan:${l.key}:${p.key}`);
      planIds[`${l.key}:${p.key}`] = planId;
      const { key: _key, ...terms } = p;
      void _key;
      await db.travelRatePlan.upsert({ where: { id: planId }, create: { id: planId, unitId, ...terms }, update: {} });
    }
    await db.travelMedia.upsert({ where: { id: id(`media:${l.key}`) }, create: { id: id(`media:${l.key}`), listingId, url: l.image, alt: l.title, sortOrder: 0 }, update: {} });
  }

  // ---- Demo traveller household and pets
  const traveller = await user("batch5-traveler@example.test", "پریسا امینی (حساب نمایشی)");
  const householdId = id("household");
  await db.household.upsert({ where: { id: householdId }, create: { id: householdId, name: "خانواده امینی (نمایشی)", countryCode: "IR", city: "تهران" }, update: {} });
  await db.householdMember.upsert({ where: { householdId_userId: { householdId, userId: traveller.id } }, create: { householdId, userId: traveller.id, role: "OWNER" }, update: {} });
  const pets = {
    cookie: await db.pet.upsert({ where: { id: id("pet:cookie") }, create: { id: id("pet:cookie"), householdId, name: "کوکی", species: "DOG", approximateAgeMonths: 36, latestWeightValue: 12, latestWeightUnit: "KG" }, update: {} }),
    nazi: await db.pet.upsert({ where: { id: id("pet:nazi") }, create: { id: id("pet:nazi"), householdId, name: "نازی", species: "CAT", approximateAgeMonths: 48, latestWeightValue: 4, latestWeightUnit: "KG" }, update: {} }),
    bamby: await db.pet.upsert({ where: { id: id("pet:bamby") }, create: { id: id("pet:bamby"), householdId, name: "بامبی", species: "DOG", approximateAgeMonths: 14 }, update: {} }),
  };
  // Same household-default grants the product creates with a pet (the owner reaches the pet through a grant, not household membership).
  for (const pet of Object.values(pets)) await new PetAccessService(db as never).applyHouseholdDefaults(pet.id, householdId);
  const vaccineDoc = await db.medicalDocument.upsert({
    where: { id: id("doc:cookie-vaccine") },
    create: { id: id("doc:cookie-vaccine"), petId: pets.cookie.id, householdId, documentType: "VACCINATION_CERTIFICATE", title: "کارت واکسن کوکی (نمایشی)", sourceType: "OWNER", sourceUserId: traveller.id, fileObjectKey: `qa/batch5/${id("doc:cookie-vaccine")}.pdf`, mimeType: "application/pdf", fileSizeBytes: 12_000, recordedAt: new Date(Date.now() - 60 * DAY) },
    update: {},
  });

  // ---- Bookings (server-priced with the same pricing function; pay-at-property so no captured payment is faked)
  async function booking(key: string, listingKey: string, planKey: string | null, checkInDays: number, nights: number, petIds: string[], status: TravelBookingStatus, extras: Partial<Prisma.TravelBookingUncheckedCreateInput> = {}) {
    const l = LISTINGS.find((x) => x.key === listingKey)!;
    const plan = planKey ? l.plans.find((p) => p.key === planKey)! : null;
    const planTerms: RatePlanTerms | null = plan ? { ...plan, id: planIds[`${listingKey}:${planKey}`]!, activeFrom: null, activeUntil: null, isActive: true, includedItems: [] } : null;
    const checkIn = midnight(checkInDays);
    const checkOut = midnight(checkInDays + nights);
    const nightList = nightsOf(checkIn, checkOut);
    const bd = priceStay({ nights: nightList, nightlyPriceIrr: new Map(), basePriceIrr: l.unit.price, plan: planTerms, policy: l.policy, petCount: petIds.length });
    const bookingId = id(`booking:${key}`);
    const existing = await db.travelBooking.findUnique({ where: { id: bookingId }, select: { id: true } });
    if (existing) return bookingId;
    const holds = status === "CONFIRMED" || status === "AWAITING_PROVIDER" || status === "IN_PROGRESS";
    await db.travelBooking.create({
      data: {
        id: bookingId,
        reference: `TR-QA5${key.slice(0, 4).toUpperCase().padEnd(4, "X")}`,
        listingId: id(`listing:${listingKey}`),
        unitId: unitIds[listingKey]!,
        householdId,
        bookedByUserId: traveller.id,
        status,
        checkIn,
        checkOut,
        nights: nightList.length,
        guests: 2,
        baseAmountIrr: bd.staySubtotalIrr + bd.rateAdjustmentIrr,
        petFeeAmountIrr: bd.petFeeIrr,
        depositAmountIrr: bd.petDepositIrr,
        totalAmountIrr: bd.totalIrr,
        payNowAmountIrr: bd.payNowIrr,
        ratePlanId: planTerms?.id ?? null,
        ratePlanSnapshot: planTerms ? ({ id: planTerms.id, name: planTerms.name, priceModifierPercent: planTerms.priceModifierPercent, cancellationType: planTerms.cancellationType, freeCancellationDays: planTerms.freeCancellationDays, lateRefundPercent: planTerms.lateRefundPercent, paymentTiming: planTerms.paymentTiming, depositPercent: planTerms.depositPercent, includesBreakfast: planTerms.includesBreakfast, includedItems: [], minNights: planTerms.minNights } as Prisma.InputJsonValue) : Prisma.JsonNull,
        petPolicySnapshot: l.policy ? ({ ...l.policy, breedRestrictions: [], vaccinationRequired: l.policy.vaccinationRequired ?? false, healthCertificateRequired: false, carrierRequired: false, leashRequired: l.policy.leashRequired ?? false, restrictedAreas: null, notes: l.policy.notes ?? null } as Prisma.InputJsonValue) : Prisma.JsonNull,
        priceBreakdownSnapshot: bd as unknown as Prisma.InputJsonValue,
        paymentStatus: bd.payNowIrr === 0 ? (bd.totalIrr > 0 ? "PAY_AT_PROPERTY" : "NOT_REQUIRED") : "NOT_REQUIRED",
        requestedAt: new Date(Date.now() - 5 * DAY),
        ...extras,
        pets: { create: petIds.map((petId) => ({ petId })) },
        statusEvents: {
          create: [
            { fromStatus: null, toStatus: "HELD", actorType: "TRAVELER", actorId: traveller.id, createdAt: new Date(Date.now() - 5 * DAY) },
            { fromStatus: "HELD", toStatus: status === "CANCELLED" || status === "COMPLETED" ? "CONFIRMED" : status, actorType: "TRAVELER", actorId: traveller.id, createdAt: new Date(Date.now() - 5 * DAY + 60_000) },
            ...(status === "COMPLETED" ? [{ fromStatus: "CONFIRMED" as const, toStatus: "COMPLETED" as const, actorType: "PROVIDER", createdAt: checkOut }] : []),
            ...(status === "CANCELLED" ? [{ fromStatus: "CONFIRMED" as const, toStatus: "CANCELLED" as const, actorType: "TRAVELER", actorId: traveller.id, reason: "تغییر برنامهٔ سفر", createdAt: new Date(Date.now() - 2 * DAY) }] : []),
          ],
        },
      },
    });
    if (holds) {
      // One slot per night — the same inventory rows the booking service writes.
      for (const night of nightList) {
        const used = await db.travelBookedNight.count({ where: { unitId: unitIds[listingKey]!, night } });
        await db.travelBookedNight.create({ data: { unitId: unitIds[listingKey]!, bookingId, night, slot: used } });
      }
    }
    return bookingId;
  }

  const confirmed = await booking("ramsar-up", "ramsar", "flex", 21, 3, [pets.cookie.id], "CONFIRMED", { confirmedAt: new Date(Date.now() - 5 * DAY) });
  await booking("shiraz-req", "shiraz", "bb", 40, 2, [pets.cookie.id], "AWAITING_PROVIDER", { requestExpiresAt: new Date(Date.now() + 20 * 3_600_000) });
  const past = await booking("kashan-done", "kashan", "std", -30, 2, [pets.nazi.id], "COMPLETED", { confirmedAt: new Date(Date.now() - 40 * DAY), completedAt: midnight(-28) });
  await booking("tehran-cxl", "tehran-pethotel", "std", 10, 4, [pets.bamby.id], "CANCELLED", { cancelledAt: new Date(Date.now() - 2 * DAY), cancelledBy: "TRAVELER", cancelReason: "تغییر برنامهٔ سفر" });

  await db.travelReview.upsert({
    where: { bookingId: past },
    create: { id: id("review:kashan"), bookingId: past, listingId: id("listing:kashan"), userId: traveller.id, overall: 5, petFriendliness: 5, cleanliness: 4, location: 5, body: "حیاط آرام و میزبان صبور؛ نازی از روز دوم راحت بود. (نظر نمایشی)", status: "PUBLISHED", providerResponse: "ممنون از اقامت شما و نازی! (نمایشی)", respondedAt: new Date(Date.now() - 20 * DAY) },
    update: {},
  });
  await db.travelListingFavorite.upsert({ where: { userId_listingId: { userId: traveller.id, listingId: id("listing:shiraz") } }, create: { userId: traveller.id, listingId: id("listing:shiraz") }, update: {} });

  // ---- Requirement library (QA samples — clearly not official)
  const admin = await db.adminUser.findFirst({ select: { id: true } });
  for (const r of [
    { key: "rabies", type: "RABIES", title: "واکسن هاری معتبر (نمونهٔ QA)", description: "نمونهٔ آزمایشی برای QA: برای سفر بین‌شهری مدرک واکسن هاری معتبر همراه داشته باشید. این یک الزام رسمی نیست." },
    { key: "microchip", type: "MICROCHIP", title: "میکروچیپ ثبت‌شده (نمونهٔ QA)", description: "نمونهٔ آزمایشی برای QA: شمارهٔ میکروچیپ در پروفایل حیوان ثبت شده باشد. این یک الزام رسمی نیست." },
  ] as const) {
    await db.travelRequirementRule.upsert({
      where: { id: id(`rule:${r.key}`) },
      create: { id: id(`rule:${r.key}`), country: "IR", requirementType: r.type, title: r.title, description: r.description, source: "داده‌ی نمونهٔ QA — منبع رسمی نیست", verifiedAt: new Date(Date.now() - 20 * DAY), status: "ACTIVE", updatedByAdminId: admin?.id ?? null },
      update: {},
    });
  }

  // ---- One rich trip: Ramsar stay + readiness with provenance + insurance + places
  const tripId = id("trip:ramsar");
  await db.trip.upsert({
    where: { id: tripId },
    create: { id: tripId, householdId, petId: pets.cookie.id, createdByUserId: traveller.id, originCountry: "IR", originCity: "تهران", destinationCountry: "IR", destinationCity: "رامسر", departAt: new Date(midnight(21).getTime() + 8 * 3_600_000), returnAt: midnight(24), travelMode: "ROAD", status: "PLANNING", notes: "سفر خانوادگی شمال با کوکی (نمایشی)" },
    update: {},
  });
  await db.travelBooking.update({ where: { id: confirmed }, data: { tripId } });
  await db.travelRequirement.upsert({
    where: { id: id("req:vaccination") },
    create: { id: id("req:vaccination"), tripId, requirementType: "VACCINATION", status: "READY", source: "خواستهٔ اقامتگاه (قوانین اعلام‌شدهٔ ویلای باغ رامسر)", jurisdiction: "IR", verifiedAt: new Date(Date.now() - 3 * DAY), validUntil: new Date(Date.now() + 300 * DAY), linkedMedicalDocumentId: vaccineDoc.id },
    update: {},
  });
  await db.travelRequirement.upsert({
    where: { id: id("req:rabies") },
    create: { id: id("req:rabies"), tripId, requirementType: "RABIES", status: "REQUIRED", source: "داده‌ی نمونهٔ QA — منبع رسمی نیست", jurisdiction: "IR", verifiedAt: new Date(Date.now() - 20 * DAY), notes: "واکسن هاری معتبر (نمونهٔ QA)" },
    update: {},
  });
  await db.travelRequirement.upsert({
    where: { id: id("req:carrier") },
    create: { id: id("req:carrier"), tripId, requirementType: "CARRIER", status: "UNKNOWN", notes: "آیا در مسیر به باکس حمل نیاز است؟ هنوز مشخص نیست." },
    update: {},
  });

  // Showcase additions: trips across every state so "My trips" and each pet's travel tab read as real history.
  const TRIPS: { key: string; pet: keyof typeof pets; to: string; from?: string; depart: number; back: number | null; mode: "AIR" | "ROAD" | "RAIL"; status: "DRAFT" | "PLANNING" | "READY" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"; note: string }[] = [
    { key: "isfahan", pet: "nazi", to: "اصفهان", depart: 9, back: 12, mode: "RAIL", status: "READY", note: "دیدار با خانواده (نمایشی)" },
    { key: "mashhad", pet: "cookie", to: "مشهد", depart: 40, back: 45, mode: "AIR", status: "PLANNING", note: "سفر هوایی؛ باکس حمل لازم است (نمایشی)" },
    { key: "chalus", pet: "bamby", to: "چالوس", depart: 2, back: 4, mode: "ROAD", status: "READY", note: "آخر هفتهٔ جنگل (نمایشی)" },
    { key: "yazd-draft", pet: "nazi", to: "یزد", depart: 70, back: null, mode: "ROAD", status: "DRAFT", note: "هنوز تاریخ قطعی نیست (نمایشی)" },
    { key: "tabriz-now", pet: "cookie", to: "تبریز", depart: -1, back: 3, mode: "ROAD", status: "IN_PROGRESS", note: "در راه تبریز (نمایشی)" },
    { key: "kashan-done", pet: "cookie", to: "کاشان", depart: -30, back: -27, mode: "ROAD", status: "COMPLETED", note: "سفر کوتاه به کاشان (نمایشی)" },
    { key: "shiraz-done", pet: "nazi", to: "شیراز", depart: -90, back: -84, mode: "AIR", status: "COMPLETED", note: "تعطیلات نوروز (نمایشی)" },
    { key: "rasht-cancel", pet: "bamby", to: "رشت", depart: -12, back: -10, mode: "ROAD", status: "CANCELLED", note: "به‌خاطر بیماری بامبی لغو شد (نمایشی)" },
    { key: "karaj", pet: "bamby", to: "کرج", depart: 15, back: 16, mode: "ROAD", status: "PLANNING", note: "سپردن بامبی به هتل حیوانات (نمایشی)" },
  ];
  for (const t of TRIPS) {
    await db.trip.upsert({
      where: { id: id(`trip:${t.key}`) },
      create: { id: id(`trip:${t.key}`), householdId, petId: pets[t.pet].id, createdByUserId: traveller.id, originCountry: "IR", originCity: t.from ?? "تهران", destinationCountry: "IR", destinationCity: t.to, departAt: new Date(midnight(t.depart).getTime() + 8 * 3_600_000), returnAt: t.back === null ? null : midnight(t.back), travelMode: t.mode, status: t.status, notes: t.note },
      update: {},
    });
  }

  // ---- Insurer, products, member, applications
  const insurerId = id("insurer");
  await db.insuranceProvider.upsert({ where: { id: insurerId }, create: { id: insurerId, name: "بیمهٔ همراه پت (نمایشی)", country: "IR", status: "VERIFIED", isPubliclyListed: true, description: "بیمه‌گر نمایشی برای QA." }, update: {} });
  const productBasic = id("product:basic");
  const productPlus = id("product:plus");
  await db.insuranceProduct.upsert({
    where: { id: productBasic },
    create: { id: productBasic, providerId: insurerId, name: "طرح حوادث سفر (نمایشی)", country: "IR", speciesEligibility: ["DOG", "CAT"], coverageTypes: ["ACCIDENT", "EMERGENCY"], coverageSummary: "هزینهٔ درمان حوادث و فوریت‌ها در طول سفر تا سقف سالانه.", exclusions: ["بیماری‌های پیشین", "واکسیناسیون و مراقبت پیشگیرانه", "حوادث ناشی از بی‌احتیاطی عمدی"], annualLimitIrr: 300_000_000, waitingPeriodDays: 7, premiumMinIrr: 4_000_000, premiumMaxIrr: 7_000_000, maxAgeMonths: 120, status: "VERIFIED", isPubliclyListed: true },
    update: {},
  });
  await db.insuranceProduct.upsert({
    where: { id: productPlus },
    create: { id: productPlus, providerId: insurerId, name: "طرح جامع سگ (نمایشی)", country: "IR", speciesEligibility: ["DOG"], coverageTypes: ["ACCIDENT", "ILLNESS", "SURGERY", "HOSPITALIZATION"], coverageSummary: "حوادث، بیماری، جراحی و بستری با فرانشیز ۲۰٪.", exclusions: ["بیماری‌های پیشین", "دندان‌پزشکی زیبایی", "نژادهای دارای بیماری ارثی شناخته‌شده (طبق فهرست بیمه‌گر)"], annualLimitIrr: 900_000_000, coinsurancePercent: 20, waitingPeriodDays: 30, premiumMinIrr: 12_000_000, premiumMaxIrr: 20_000_000, maxAgeMonths: 96, status: "VERIFIED", isPubliclyListed: true },
    update: {},
  });
  // Showcase additions: a second insurer and enough plans for the comparison list to be meaningful.
  const insurer2 = id("insurer:asayesh");
  await db.insuranceProvider.upsert({ where: { id: insurer2 }, create: { id: insurer2, name: "بیمهٔ آسایش حیوانات (نمایشی)", country: "IR", status: "VERIFIED", isPubliclyListed: true, description: "بیمه‌گر نمایشی دوم برای QA." }, update: {} });
  const PLANS: { key: string; provider: string; name: string; species: ("DOG" | "CAT")[]; types: ("ACCIDENT" | "ILLNESS" | "SURGERY" | "DIAGNOSTICS" | "MEDICATION" | "DENTAL" | "PREVENTIVE" | "HOSPITALIZATION" | "EMERGENCY")[]; summary: string; exclusions: string[]; limit: number; wait: number; min: number; max: number; maxAge: number; co?: number }[] = [
    { key: "cat-basic", provider: insurerId, name: "طرح پایهٔ گربه (نمایشی)", species: ["CAT"], types: ["ACCIDENT", "ILLNESS"], summary: "بیماری‌ها و حوادث رایج گربه با سقف سالانهٔ متوسط.", exclusions: ["بیماری‌های پیشین", "عقیم‌سازی"], limit: 250_000_000, wait: 21, min: 5_000_000, max: 8_000_000, maxAge: 120 },
    { key: "senior", provider: insurerId, name: "طرح حیوانات مسن (نمایشی)", species: ["DOG", "CAT"], types: ["ILLNESS", "DIAGNOSTICS", "MEDICATION"], summary: "تمرکز بر آزمایش‌ها و داروهای دورهٔ سالمندی.", exclusions: ["بیماری‌های پیشین", "جراحی‌های انتخابی"], limit: 400_000_000, wait: 45, min: 15_000_000, max: 26_000_000, maxAge: 168, co: 30 },
    { key: "preventive", provider: insurerId, name: "بستهٔ مراقبت پیشگیرانه (نمایشی)", species: ["DOG", "CAT"], types: ["PREVENTIVE", "DENTAL"], summary: "واکسن‌ها، معاینهٔ سالانه و جرم‌گیری دندان.", exclusions: ["درمان بیماری", "جراحی"], limit: 60_000_000, wait: 0, min: 3_000_000, max: 4_500_000, maxAge: 180 },
    { key: "asayesh-dog", provider: insurer2, name: "طرح جامع سگ آسایش (نمایشی)", species: ["DOG"], types: ["ACCIDENT", "ILLNESS", "SURGERY", "HOSPITALIZATION", "MEDICATION"], summary: "پوشش کامل درمان و جراحی با فرانشیز ۱۵٪.", exclusions: ["بیماری‌های پیشین", "رفتار درمانی", "تغذیهٔ درمانی"], limit: 1_200_000_000, wait: 30, min: 16_000_000, max: 28_000_000, maxAge: 96, co: 15 },
    { key: "asayesh-cat", provider: insurer2, name: "طرح جامع گربه آسایش (نمایشی)", species: ["CAT"], types: ["ACCIDENT", "ILLNESS", "SURGERY", "HOSPITALIZATION"], summary: "درمان، جراحی و بستری گربه با شبکهٔ کلینیک‌های طرف قرارداد.", exclusions: ["بیماری‌های پیشین", "عقیم‌سازی"], limit: 700_000_000, wait: 30, min: 10_000_000, max: 17_000_000, maxAge: 120, co: 15 },
    { key: "asayesh-accident", provider: insurer2, name: "طرح فقط حوادث آسایش (نمایشی)", species: ["DOG", "CAT"], types: ["ACCIDENT", "EMERGENCY"], summary: "اقتصادی‌ترین طرح؛ فقط حوادث و فوریت‌ها.", exclusions: ["بیماری", "واکسیناسیون"], limit: 150_000_000, wait: 3, min: 2_500_000, max: 4_000_000, maxAge: 144 },
    { key: "asayesh-surgery", provider: insurer2, name: "طرح جراحی و بستری آسایش (نمایشی)", species: ["DOG", "CAT"], types: ["SURGERY", "HOSPITALIZATION"], summary: "فقط هزینه‌های جراحی و بستری؛ مکمل مناسب برای طرح پایه.", exclusions: ["جراحی‌های زیبایی", "بیماری‌های پیشین"], limit: 500_000_000, wait: 60, min: 7_000_000, max: 12_000_000, maxAge: 108, co: 20 },
    { key: "asayesh-diag", provider: insurer2, name: "طرح تشخیص و آزمایش آسایش (نمایشی)", species: ["DOG", "CAT"], types: ["DIAGNOSTICS", "MEDICATION"], summary: "آزمایش خون، تصویربرداری و داروهای تجویزی.", exclusions: ["جراحی", "بیماری‌های پیشین"], limit: 200_000_000, wait: 14, min: 4_500_000, max: 7_500_000, maxAge: 156 },
  ];
  for (const p of PLANS) {
    const planProductId = id(`product:${p.key}`);
    await db.insuranceProduct.upsert({
      where: { id: planProductId },
      create: { id: planProductId, providerId: p.provider, name: p.name, country: "IR", speciesEligibility: p.species, coverageTypes: p.types, coverageSummary: p.summary, exclusions: p.exclusions, annualLimitIrr: p.limit, coinsurancePercent: p.co ?? null, waitingPeriodDays: p.wait, premiumMinIrr: p.min, premiumMaxIrr: p.max, maxAgeMonths: p.maxAge, status: "VERIFIED", isPubliclyListed: true },
      update: {},
    });
  }
  const underwriter = await user("batch5-insurer@example.test", "کارشناس بیمه (نمایشی)");
  await db.insurerMembership.upsert({ where: { providerId_userId: { providerId: insurerId, userId: underwriter.id } }, create: { providerId: insurerId, userId: underwriter.id, role: "UNDERWRITING" }, update: {} });
  const consentText = "I agree that PET LIFE shares this application, my contact details and my pet's species, breed, age and weight with the insurer so it can review the application. This is not an insurance policy; cover starts only if the insurer issues one.";
  await db.insuranceApplication.upsert({
    where: { id: id("app:cookie-basic") },
    create: { id: id("app:cookie-basic"), productId: productBasic, householdId, petId: pets.cookie.id, applicantUserId: traveller.id, status: "SUBMITTED", eligibilityStatus: "ELIGIBLE", submittedAt: new Date(Date.now() - 2 * DAY), consentAt: new Date(Date.now() - 2 * DAY), consentText, events: { create: [{ fromStatus: null, toStatus: "DRAFT", actorType: "APPLICANT", actorId: traveller.id, createdAt: new Date(Date.now() - 3 * DAY) }, { fromStatus: "DRAFT", toStatus: "SUBMITTED", actorType: "APPLICANT", actorId: traveller.id, createdAt: new Date(Date.now() - 2 * DAY) }] } },
    update: {},
  });
  await db.insuranceApplication.upsert({
    where: { id: id("app:nazi-basic") },
    create: { id: id("app:nazi-basic"), productId: productBasic, householdId, petId: pets.nazi.id, applicantUserId: traveller.id, status: "NEEDS_INFORMATION", eligibilityStatus: "POSSIBLY_ELIGIBLE", submittedAt: new Date(Date.now() - 6 * DAY), consentAt: new Date(Date.now() - 6 * DAY), consentText, insurerMessage: "لطفاً تاریخ آخرین معاینهٔ دامپزشکی نازی را در توضیحات بنویسید. (پیام نمایشی)", events: { create: [{ fromStatus: "DRAFT", toStatus: "SUBMITTED", actorType: "APPLICANT", actorId: traveller.id, createdAt: new Date(Date.now() - 6 * DAY) }, { fromStatus: "SUBMITTED", toStatus: "UNDER_REVIEW", actorType: "INSURER", actorId: underwriter.id, createdAt: new Date(Date.now() - 5 * DAY) }, { fromStatus: "UNDER_REVIEW", toStatus: "NEEDS_INFORMATION", actorType: "INSURER", actorId: underwriter.id, note: "لطفاً تاریخ آخرین معاینه را بنویسید.", createdAt: new Date(Date.now() - 4 * DAY) }] } },
    update: {},
  });

  // ---- Places with PostGIS points
  for (const p of PLACES) {
    const placeId = id(`place:${p.key}`);
    await db.petFriendlyPlace.upsert({
      where: { id: placeId },
      create: { id: placeId, name: p.name, category: p.category, country: "IR", city: p.city, province: p.province, latitude: p.lat, longitude: p.lng, speciesAllowed: ["DOG", "CAT"], outdoorAllowed: true, indoorAllowed: p.category === "CAFE" || p.category === "STORE", leashRequired: p.leash, waterAvailable: p.water, petArea: p.area, status: "VERIFIED", isPubliclyListed: true, verificationSource: "بازدید تیم QA (نمایشی)", verifiedAt: new Date(Date.now() - 15 * DAY), openingHours: p.category === "CAFE" ? ([0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: "09:00", close: "22:00" })) as Prisma.InputJsonValue) : Prisma.JsonNull },
      update: {},
    });
    await db.$executeRaw`UPDATE pet_friendly_places SET location = ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)::geography WHERE id = ${placeId}::uuid`;
  }
  await db.petFriendlyPlaceFavorite.upsert({ where: { placeId_userId: { placeId: id("place:ramsar-beach"), userId: traveller.id } }, create: { userId: traveller.id, placeId: id("place:ramsar-beach") }, update: {} });

  const counts = await Promise.all([
    db.travelListing.count({ where: { id: { in: LISTINGS.map((l) => id(`listing:${l.key}`)) } } }),
    db.travelBooking.count({ where: { householdId } }),
    db.petFriendlyPlace.count({ where: { id: { in: PLACES.map((p) => id(`place:${p.key}`)) } } }),
  ]);
  console.log(`Batch 5 QA seed ready: ${counts[0]} listings, ${counts[1]} bookings, ${counts[2]} places. Traveller: batch5-traveler@example.test`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
