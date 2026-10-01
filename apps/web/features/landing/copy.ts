import type { AppLocale } from "@/lib/i18n/config";

export type DestinationKey = "health" | "services" | "shop" | "travel" | "animalSupport" | "community";

/** Every destination is a shipped public route; the building that stands for it is drawn in TehranScene. */
export const DESTINATIONS: { key: DestinationKey; href: string }[] = [
  { key: "health", href: "vet/find" },
  { key: "services", href: "services" },
  { key: "shop", href: "shop" },
  { key: "travel", href: "travel" },
  { key: "animalSupport", href: "animal-support" },
  { key: "community", href: "community" },
];

export const MORE_LINKS = [
  { key: "lostPets", href: "lost-pets" },
  { key: "places", href: "places" },
  { key: "insurance", href: "insurance" },
  { key: "guides", href: "blog" },
] as const;

const fa = {
  title: "زندگی با آن‌ها،\nمنظم حول خودشان.",
  intro: "سلامت، خدمات، خرید و سفرِ حیوانتان — همه در یک شهر.",
  start: "شروع کنید",
  signIn: "ورود",
  language: "English",
  languageLabel: "تغییر زبان به انگلیسی",
  theme: "ظاهر",
  cityLabel: "بخش‌های PET LIFE",
  hint: "هر ساختمان یک بخش است؛ برای رفتن، رویش بزنید.",
  moreLabel: "بیشتر در PET LIFE",
  destinations: {
    health: ["سلامت", "دامپزشک‌ها و کلینیک‌های تأییدشده"],
    services: ["خدمات", "آرایش، آموزش، پیاده‌روی و نگهداری"],
    shop: ["فروشگاه", "غذا و لوازم از فروشندگان معتبر"],
    travel: ["سفر", "اقامتگاه‌هایی که حیوانتان را می‌پذیرند"],
    animalSupport: ["حمایت از حیوانات", "پناهگاه‌ها و نیازهای امروز"],
    community: ["جامعه", "پرسش و تجربهٔ صاحبان حیوانات"],
  } satisfies Record<DestinationKey, [string, string]>,
  more: { lostPets: "حیوانات گم‌شده", places: "مکان‌های دوستدار حیوان", insurance: "بیمهٔ حیوانات", guides: "راهنماها" },
};

const en: typeof fa = {
  title: "Life with them,\norganized around them.",
  intro: "Health, services, shopping and travel for your pet — in one city.",
  start: "Get started",
  signIn: "Sign in",
  language: "فارسی",
  languageLabel: "Switch language to Persian",
  theme: "Appearance",
  cityLabel: "Parts of PET LIFE",
  hint: "Each building is a part of PET LIFE — tap one to go in.",
  moreLabel: "More in PET LIFE",
  destinations: {
    health: ["Health", "Verified vets and clinics"],
    services: ["Services", "Grooming, training, walking and sitting"],
    shop: ["Shop", "Food and supplies from trusted sellers"],
    travel: ["Travel", "Stays that welcome your pet"],
    animalSupport: ["Animal support", "Shelters and today's needs"],
    community: ["Community", "Questions and stories from owners"],
  },
  more: { lostPets: "Lost pets", places: "Pet-friendly places", insurance: "Pet insurance", guides: "Guides" },
};

export const landingCopy: Record<AppLocale, typeof fa> = { fa, en };
