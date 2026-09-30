import { PrismaClient, type BookingStatus, type LocationMode, type ProviderServiceType, type ProviderType, type ServiceCategory } from "@prisma/client";
import { createHash } from "node:crypto";
import { PetAccessService } from "../src/modules/pet-access/pet-access.service";

/**
 * Batch 3 QA scenarios — five realistic Tehran providers with teams, services, options, weekly
 * availability, verified reviews and bookings in every lifecycle state. Idempotent: deterministic
 * ids + upserts, users keyed by email. Runs only against a *_test database, or a staging database
 * named explicitly in PETLIFE_QA_SEED_DATABASE. Media are repository-owned files under /images.
 */
const db = new PrismaClient();
const id = (key: string) => {
  const h = createHash("sha256").update(`petlife-batch3-qa:${key}`).digest("hex").slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20)}`;
};
const DAY = 86400_000;
/** 09:00 Tehran on a day offset from today (Iran is UTC+03:30 with no DST). */
const tehran = (dayOffset: number, hour = 9, minute = 0) => {
  const now = new Date(Date.now() + 3.5 * 3600_000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffset, hour, minute) - 3.5 * 3600_000);
};

interface ServiceSeed {
  key: string;
  name: string;
  type: ProviderServiceType;
  category: ServiceCategory;
  minutes: number;
  price: number;
  locationMode?: LocationMode;
  bookingMode?: "INSTANT" | "REQUEST";
  paymentMode?: "PAY_AT_PROVIDER" | "FULL_PREPAYMENT" | "DEPOSIT";
  deposit?: number;
  maxPets?: number;
  prep?: string;
  policy?: string;
  variants?: { key: string; name: string; minutes: number; price: number }[];
  resource?: "EXAM_ROOM" | "GROOMING_STATION";
}

interface ProviderSeed {
  key: string;
  name: string;
  type: ProviderType;
  description: string;
  specialties: string[];
  cover: string;
  region: string;
  address: string;
  lat: number;
  lng: number;
  policies: string;
  faqs: { question: string; answer: string }[];
  staff: { key: string; name: string; title: string; bio: string; role: "OWNER" | "VET" | "STAFF" }[];
  services: ServiceSeed[];
  hours: [string, string];
  resources?: { key: string; name: string; type: "EXAM_ROOM" | "GROOMING_STATION" }[];
}

const PROVIDERS: ProviderSeed[] = [
  {
    key: "clinic",
    name: "درمانگاه دامپزشکی مهر",
    type: "VET_CLINIC",
    description: "درمانگاه شبانه‌روزی با بخش تصویربرداری، آزمایشگاه داخلی و دندانپزشکی حیوانات کوچک. تمرکز ما بر پیشگیری و پیگیری منظم است.",
    specialties: ["دندانپزشکی", "تصویربرداری", "آزمایشگاه", "واکسیناسیون"],
    cover: "/images/experience/vet-hero.png",
    region: "ونک",
    address: "تهران، ونک، خیابان ملاصدرا، پلاک ۴۲",
    lat: 35.7575,
    lng: 51.4101,
    policies: "لطفاً ۱۰ دقیقه زودتر مراجعه کنید. همراه داشتن کارت واکسن الزامی است.",
    faqs: [
      { question: "آیا نوبت اورژانسی دارید؟", answer: "بله؛ برای موارد اورژانسی مستقیم با شماره درمانگاه تماس بگیرید." },
      { question: "نتیجه آزمایش کی آماده می‌شود؟", answer: "بیشتر آزمایش‌های خون همان روز و در پرونده سلامت حیوان ثبت می‌شود." },
    ],
    staff: [
      { key: "owner", name: "دکتر سارا احمدی", title: "مدیر فنی و دامپزشک", bio: "دکترای عمومی دامپزشکی، ۱۲ سال تجربه در حیوانات کوچک.", role: "OWNER" },
      { key: "vet2", name: "دکتر امیر صادقی", title: "دامپزشک — دندانپزشکی", bio: "دوره تخصصی دندانپزشکی حیوانات کوچک.", role: "VET" },
      { key: "reception", name: "نیلوفر کریمی", title: "پذیرش", bio: "", role: "STAFF" },
    ],
    hours: ["09:00", "20:00"],
    resources: [
      { key: "room1", name: "اتاق معاینه ۱", type: "EXAM_ROOM" },
      { key: "room2", name: "اتاق معاینه ۲", type: "EXAM_ROOM" },
    ],
    services: [
      {
        key: "general",
        name: "ویزیت عمومی",
        type: "GENERAL_VET_VISIT",
        category: "VET",
        minutes: 30,
        price: 12_000_000,
        resource: "EXAM_ROOM",
        prep: "اگر آزمایش خون لازم است، ۸ ساعت ناشتا باشد.",
        policy: "لغو رایگان تا ۲۴ ساعت قبل؛ پس از آن ۵۰٪ بازگشت وجه پیش‌پرداخت.",
        paymentMode: "DEPOSIT",
        deposit: 3_000_000,
        variants: [
          { key: "first", name: "ویزیت اول", minutes: 45, price: 15_000_000 },
          { key: "followup", name: "ویزیت پیگیری", minutes: 30, price: 9_000_000 },
        ],
      },
      { key: "dental", name: "جرم‌گیری و معاینه دندان", type: "DENTAL_CARE", category: "VET", minutes: 60, price: 45_000_000, bookingMode: "REQUEST", resource: "EXAM_ROOM", prep: "۱۲ ساعت ناشتا برای بیهوشی." },
      { key: "vaccine", name: "واکسیناسیون", type: "VACCINATION", category: "VET", minutes: 20, price: 7_500_000, resource: "EXAM_ROOM" },
    ],
  },
  {
    key: "homevet",
    name: "دکتر رضا موسوی — ویزیت در منزل",
    type: "VETERINARIAN",
    description: "دامپزشک سیار برای معاینه، واکسیناسیون و نمونه‌گیری در منزل؛ مناسب حیوانات مسن یا مضطرب.",
    specialties: ["ویزیت در منزل", "حیوانات سالمند"],
    cover: "/images/landing/pet-portrait.png",
    region: "سعادت‌آباد",
    address: "تهران، سعادت‌آباد (محدوده خدمت: شمال و غرب تهران)",
    lat: 35.7797,
    lng: 51.3781,
    policies: "محدوده خدمت شمال و غرب تهران. هزینه ایاب‌وذهاب در قیمت لحاظ شده است.",
    faqs: [{ question: "در منزل آزمایش خون می‌گیرید؟", answer: "بله؛ نمونه به آزمایشگاه همکار ارسال و نتیجه در پرونده ثبت می‌شود." }],
    staff: [{ key: "owner", name: "دکتر رضا موسوی", title: "دامپزشک سیار", bio: "۸ سال تجربه ویزیت در منزل و مراقبت سالمندی.", role: "OWNER" }],
    hours: ["10:00", "18:00"],
    services: [{ key: "home", name: "ویزیت در منزل", type: "HOME_VISIT", category: "VET", minutes: 60, price: 25_000_000, locationMode: "AT_CUSTOMER", bookingMode: "REQUEST" }],
  },
  {
    key: "groomer",
    name: "استودیو پت‌آرا",
    type: "GROOMER",
    description: "آرایش و شست‌وشوی سگ و گربه با محصولات ملایم و فضای آرام.",
    specialties: ["اصلاح نژادی", "حمام دارویی"],
    cover: "/images/experience/grooming-hero.png",
    region: "زعفرانیه",
    address: "تهران، زعفرانیه، خیابان آصف، پلاک ۷",
    lat: 35.8043,
    lng: 51.4146,
    policies: "حیوان باید واکسن هاری معتبر داشته باشد.",
    faqs: [],
    staff: [
      { key: "owner", name: "مهسا رحیمی", title: "آرایشگر ارشد", bio: "گواهی آرایش نژادی، ۶ سال تجربه.", role: "OWNER" },
      { key: "g2", name: "کامران نوری", title: "آرایشگر", bio: "متخصص گربه‌ها.", role: "STAFF" },
    ],
    hours: ["10:00", "19:00"],
    resources: [{ key: "table1", name: "میز آرایش ۱", type: "GROOMING_STATION" }],
    services: [
      {
        key: "groom",
        name: "حمام و اصلاح کامل",
        type: "GROOMING_SESSION",
        category: "GROOMING",
        minutes: 60,
        price: 18_500_000,
        resource: "GROOMING_STATION",
        maxPets: 2,
        variants: [
          { key: "small", name: "نژاد کوچک", minutes: 60, price: 18_500_000 },
          { key: "medium", name: "نژاد متوسط", minutes: 90, price: 24_000_000 },
          { key: "large", name: "نژاد بزرگ", minutes: 120, price: 32_000_000 },
        ],
      },
    ],
  },
  {
    key: "walker",
    name: "همراه پت — پیاده‌روی و نگهداری",
    type: "WALKER",
    description: "پیاده‌روی روزانه و نگهداری در منزل با گزارش کوتاه بعد از هر نوبت.",
    specialties: ["پیاده‌روی گروهی کوچک", "نگهداری شبانه"],
    cover: "/images/landing/cookie-world-day-clean.png",
    region: "پاسداران",
    address: "تهران، پاسداران (خدمت در محل مشتری)",
    lat: 35.7722,
    lng: 51.4697,
    policies: "در صورت باران شدید، زمان پیاده‌روی با هماهنگی جابه‌جا می‌شود.",
    faqs: [],
    staff: [{ key: "owner", name: "آرش جعفری", title: "پیاده‌روی‌بر و پرستار", bio: "گواهی کمک‌های اولیه حیوانات.", role: "OWNER" }],
    hours: ["07:00", "21:00"],
    services: [
      { key: "walk", name: "پیاده‌روی", type: "DOG_WALK", category: "WALKING", minutes: 30, price: 3_500_000, locationMode: "AT_CUSTOMER", maxPets: 2, variants: [{ key: "30", name: "۳۰ دقیقه", minutes: 30, price: 3_500_000 }, { key: "60", name: "۶۰ دقیقه", minutes: 60, price: 6_000_000 }] },
      { key: "sit", name: "نگهداری در منزل", type: "PET_SITTING", category: "SITTING", minutes: 1440, price: 20_000_000, locationMode: "AT_CUSTOMER", bookingMode: "REQUEST" },
    ],
  },
  {
    key: "trainer",
    name: "آکادمی رفتار سگ نیک‌رفتار",
    type: "TRAINER",
    description: "آموزش اطاعت پایه و اصلاح رفتار با روش تقویت مثبت.",
    specialties: ["اطاعت پایه", "اصلاح رفتار"],
    cover: "/images/landing/cookie-taxi.png",
    region: "شهرک غرب",
    address: "تهران، شهرک غرب، بلوار دادمان، پارک آموزشی",
    lat: 35.7596,
    lng: 51.3706,
    policies: "جلسه اول ارزیابی رفتار است؛ برنامه بعدی بر اساس آن پیشنهاد می‌شود.",
    faqs: [{ question: "صاحب حیوان هم باید در جلسه باشد؟", answer: "بله؛ حضور شما برای تمرین در خانه ضروری است." }],
    staff: [{ key: "owner", name: "بهرام شکیبا", title: "مربی رفتار", bio: "۱۰ سال تجربه آموزش سگ‌های خانگی.", role: "OWNER" }],
    hours: ["08:00", "17:00"],
    services: [
      { key: "train", name: "جلسه آموزش", type: "TRAINING_SESSION", category: "TRAINING", minutes: 60, price: 9_000_000, paymentMode: "FULL_PREPAYMENT", variants: [{ key: "single", name: "جلسه تکی", minutes: 60, price: 9_000_000 }, { key: "assessment", name: "ارزیابی رفتار", minutes: 90, price: 12_000_000 }] },
    ],
  },
];

async function user(email: string, name: string) {
  return db.user.upsert({ where: { email }, create: { id: id(`user:${email}`), email, displayName: name, locale: "fa" }, update: {} });
}

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "").pathname;
  if (!database.endsWith("_test") && process.env.PETLIFE_QA_SEED_DATABASE !== database.slice(1)) {
    throw new Error("This QA seed runs against a *_test database, or a staging database named in PETLIFE_QA_SEED_DATABASE.");
  }

  // Customers: one household with two dogs and a cat (reviewers and bookers).
  const customer = await user("batch3-customer@example.test", "نگار حسینی (حساب نمایشی)");
  const reviewers = await Promise.all(["batch3-reviewer-1@example.test", "batch3-reviewer-2@example.test"].map((e, i) => user(e, i ? "حامد" : "پریسا")));
  const householdId = id("household");
  await db.household.upsert({ where: { id: householdId }, create: { id: householdId, name: "خانواده حسینی (نمایشی)", countryCode: "IR", city: "تهران" }, update: {} });
  await db.householdMember.upsert({ where: { householdId_userId: { householdId, userId: customer.id } }, create: { householdId, userId: customer.id, role: "OWNER" }, update: {} });
  const pets = [
    { key: "dog1", name: "رکس", species: "DOG" as const, age: 30, weight: 18 },
    { key: "dog2", name: "هاپو", species: "DOG" as const, age: 96, weight: 9 },
    { key: "cat1", name: "نازی", species: "CAT" as const, age: 40, weight: 4 },
  ];
  for (const p of pets) {
    await db.pet.upsert({ where: { id: id(`pet:${p.key}`) }, create: { id: id(`pet:${p.key}`), householdId, name: p.name, species: p.species, approximateAgeMonths: p.age, latestWeightValue: p.weight, latestWeightUnit: "KG" }, update: {} });
    await db.petAccessGrant.upsert({
      where: { id: id(`grant:${p.key}`) },
      create: { id: id(`grant:${p.key}`), petId: id(`pet:${p.key}`), userId: customer.id, canViewIdentity: true, canEditIdentity: true, canViewHealth: true, canEditHealth: true, canBookCare: true, canViewCareProfile: true, canEditCareProfile: true, canManageAccess: true },
      update: {},
    });
  }
  // Reviewers need their own household/pet so their completed bookings are genuine.
  for (const [i, r] of reviewers.entries()) {
    const hh = id(`reviewer-household:${i}`);
    await db.household.upsert({ where: { id: hh }, create: { id: hh, name: `خانواده نمایشی ${i + 1}`, countryCode: "IR", city: "تهران" }, update: {} });
    await db.householdMember.upsert({ where: { householdId_userId: { householdId: hh, userId: r.id } }, create: { householdId: hh, userId: r.id, role: "OWNER" }, update: {} });
    await db.pet.upsert({ where: { id: id(`reviewer-pet:${i}`) }, create: { id: id(`reviewer-pet:${i}`), householdId: hh, name: i ? "پیشی" : "بونی", species: i ? "CAT" : "DOG", approximateAgeMonths: 24 }, update: {} });
    // Same household-default grants the product creates with a pet (the owner reaches the pet through a grant, not household membership).
    await new PetAccessService(db as never).applyHouseholdDefaults(id(`reviewer-pet:${i}`), hh);
  }

  let number = 900000;
  const nextNumber = () => `PL-B-QA${String(++number).slice(-4)}`;

  for (const p of PROVIDERS) {
    const orgId = id(`org:${p.key}`);
    await db.providerOrganization.upsert({
      where: { id: orgId },
      create: { id: orgId, name: p.name, type: p.type, verificationStatus: "VERIFIED", description: p.description, specialties: p.specialties, coverImageUrl: p.cover, galleryUrls: [p.cover], policiesText: p.policies, faqs: p.faqs, phone: "021-88000000" },
      update: { description: p.description, specialties: p.specialties, coverImageUrl: p.cover, policiesText: p.policies, faqs: p.faqs },
    });
    const locationId = id(`loc:${p.key}`);
    await db.providerLocation.upsert({
      where: { id: locationId },
      create: { id: locationId, providerOrganizationId: orgId, name: p.region, addressLine: p.address, city: "تهران", region: p.region, countryCode: "IR", latitude: p.lat, longitude: p.lng, timezone: "Asia/Tehran" },
      update: {},
    });
    const staffIds: Record<string, string> = {};
    for (const s of p.staff) {
      const u = await user(`batch3-${p.key}-${s.key}@example.test`, s.name);
      const puId = id(`pu:${p.key}:${s.key}`);
      await db.providerUser.upsert({ where: { id: puId }, create: { id: puId, userId: u.id, providerOrganizationId: orgId, role: s.role, displayTitle: s.title, publicBio: s.bio || null, isBookable: s.role !== "STAFF" || p.key === "groomer" }, update: {} });
      staffIds[s.key] = puId;
    }
    for (const r of p.resources ?? []) {
      await db.providerResource.upsert({ where: { id: id(`res:${p.key}:${r.key}`) }, create: { id: id(`res:${p.key}:${r.key}`), providerOrganizationId: orgId, locationId, name: r.name, type: r.type }, update: {} });
    }
    const bookable = p.staff.filter((s) => s.role !== "STAFF" || p.key === "groomer");
    for (const s of bookable) {
      for (let dow = 0; dow < 7; dow++) {
        if (dow === 5) continue; // Friday closed.
        const ruleId = id(`rule:${p.key}:${s.key}:${dow}`);
        await db.providerAvailabilityRule.upsert({ where: { id: ruleId }, create: { id: ruleId, providerOrganizationId: orgId, locationId, providerUserId: staffIds[s.key], dayOfWeek: dow, startLocalTime: p.hours[0], endLocalTime: p.hours[1], timezone: "Asia/Tehran" }, update: {} });
      }
    }
    const serviceIds: Record<string, string> = {};
    for (const s of p.services) {
      const sid = id(`svc:${p.key}:${s.key}`);
      serviceIds[s.key] = sid;
      await db.providerService.upsert({
        where: { id: sid },
        create: {
          id: sid,
          providerOrganizationId: orgId,
          locationId,
          name: s.name,
          type: s.type,
          category: s.category,
          durationMinutes: s.minutes,
          priceAmount: s.price,
          currency: "IRR",
          locationMode: s.locationMode ?? "AT_PROVIDER",
          bookingMode: s.bookingMode ?? "INSTANT",
          paymentMode: s.paymentMode ?? "PAY_AT_PROVIDER",
          depositAmount: s.deposit ?? null,
          maxPetsPerBooking: s.maxPets ?? 1,
          preparationNotes: s.prep ?? null,
          cancellationPolicy: s.policy ?? null,
          lateCancellationRefundPercent: s.paymentMode ? 50 : 0,
          requiredResourceType: s.resource ?? null,
          supportsCat: s.category !== "WALKING",
        },
        update: {},
      });
      for (const [i, v] of (s.variants ?? []).entries()) {
        await db.providerServiceVariant.upsert({ where: { id: id(`var:${p.key}:${s.key}:${v.key}`) }, create: { id: id(`var:${p.key}:${s.key}:${v.key}`), serviceId: sid, name: v.name, durationMinutes: v.minutes, priceAmount: v.price, sortOrder: i }, update: {} });
      }
      if (p.key === "clinic") {
        // Dental is delivered only by the dental vet; other services by both vets.
        const qualified = s.key === "dental" ? ["vet2"] : ["owner", "vet2"];
        for (const q of qualified) await db.providerUserService.upsert({ where: { providerUserId_serviceId: { providerUserId: staffIds[q]!, serviceId: sid } }, create: { providerUserId: staffIds[q]!, serviceId: sid }, update: {} });
      }
    }

    // Bookings in every state. Direct inserts keep the seed deterministic; they respect the same
    // snapshot fields the booking engine writes. Times avoid each other per staff member.
    const firstService = p.services[0]!;
    const firstVariant = firstService.variants?.[0];
    const staffId = staffIds[bookable[0]!.key]!;
    const serviceId = serviceIds[firstService.key]!;
    const minutes = firstVariant?.minutes ?? firstService.minutes;
    const price = firstVariant?.price ?? firstService.price;
    const seedBooking = async (key: string, status: BookingStatus, start: Date, userId: string, petId: string, hh: string, extra: Record<string, unknown> = {}) => {
      const bid = id(`booking:${p.key}:${key}`);
      await db.booking.upsert({
        where: { id: bid },
        create: {
          id: bid,
          householdId: hh,
          petId,
          userId,
          providerOrganizationId: orgId,
          providerLocationId: locationId,
          providerUserId: staffId,
          providerServiceId: serviceId,
          variantId: firstVariant ? id(`var:${p.key}:${firstService.key}:${firstVariant.key}`) : null,
          category: firstService.category,
          locationMode: firstService.locationMode ?? "AT_PROVIDER",
          startAt: start,
          endAt: new Date(start.getTime() + minutes * 60_000),
          timezone: "Asia/Tehran",
          bookingStatus: status,
          bookingNumber: nextNumber(),
          bookingMode: firstService.bookingMode ?? "INSTANT",
          paymentMode: "PAY_AT_PROVIDER",
          priceAmount: price,
          currency: "IRR",
          durationMinutes: minutes,
          serviceNameSnapshot: firstService.name,
          variantNameSnapshot: firstVariant?.name ?? null,
          cancellationPolicySnapshot: firstService.policy ?? null,
          freeCancellationHours: 24,
          lateCancellationRefundPercent: 0,
          preparationSnapshot: firstService.prep ?? null,
          ...extra,
        },
        update: {},
      });
      await db.bookingStatusEvent.upsert({ where: { id: id(`event:${p.key}:${key}`) }, create: { id: id(`event:${p.key}:${key}`), bookingId: bid, toStatus: status, actorType: "SYSTEM", reason: "QA_SEED" }, update: {} });
      return bid;
    };
    const dog = id("pet:dog1");
    await seedBooking("confirmed", "CONFIRMED", tehran(3, 10), customer.id, dog, householdId);
    await seedBooking("requested", "REQUESTED", tehran(4, 11), customer.id, dog, householdId, { requestExpiresAt: tehran(1, 20) });
    await seedBooking("cancelled", "CANCELLED_BY_USER", tehran(5, 12), customer.id, dog, householdId, { cancelledAt: new Date(), cancelledReason: "تغییر برنامه سفر" });
    const completed = await seedBooking("completed", "COMPLETED", tehran(-7, 10), customer.id, dog, householdId, { completedAt: tehran(-7, 11), completionNote: "انجام شد؛ حیوان آرام بود." });
    for (const [i, r] of reviewers.entries()) {
      const b = await seedBooking(`reviewer-${i}`, "COMPLETED", tehran(-14 - i, 12), r.id, id(`reviewer-pet:${i}`), id(`reviewer-household:${i}`), { completedAt: tehran(-14 - i, 13) });
      await db.providerReview.upsert({
        where: { bookingId: b },
        create: { id: id(`review:${p.key}:${i}`), bookingId: b, providerOrganizationId: orgId, userId: r.id, rating: i ? 4 : 5, body: i ? "کار تمیز و به‌موقع بود؛ فقط کمی منتظر ماندیم." : "بسیار دقیق و مهربان؛ همه چیز را توضیح دادند." },
        update: {},
      });
    }
    await db.providerReview.upsert({
      where: { bookingId: completed },
      create: { id: id(`review:${p.key}:customer`), bookingId: completed, providerOrganizationId: orgId, userId: customer.id, rating: 5, body: "دوباره رزرو می‌کنم.", providerResponse: "ممنون از اعتماد شما!", respondedAt: tehran(-6, 10) },
      update: {},
    });
    // An open waitlist entry for a busy day.
    await db.bookingWaitlistEntry.upsert({
      where: { id: id(`waitlist:${p.key}`) },
      create: { id: id(`waitlist:${p.key}`), householdId, userId: customer.id, petId: id("pet:dog2"), providerOrganizationId: orgId, serviceId, windowStart: tehran(3, 0), windowEnd: tehran(3, 23) },
      update: {},
    });
  }

  console.log(JSON.stringify({ customer: customer.email, providers: PROVIDERS.map((p) => ({ name: p.name, id: id(`org:${p.key}`) })) }, null, 2));
}

main().finally(() => db.$disconnect());
