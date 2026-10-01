import type { AppLocale } from "@/lib/i18n/config";

export type DestinationKey = "health" | "services" | "shop" | "travel" | "animalSupport" | "community" | "memories";

/** Every destination is a shipped route; the building (or, for memories, the photo board in the park) is drawn in TehranScene. Memories is the one signed-in destination — visitors pass through sign-in first. */
export const DESTINATIONS: { key: DestinationKey; href: string }[] = [
  { key: "health", href: "vet/find" },
  { key: "services", href: "services" },
  { key: "shop", href: "shop" },
  { key: "travel", href: "travel" },
  { key: "animalSupport", href: "animal-support" },
  { key: "community", href: "community" },
  { key: "memories", href: "pets/active?view=memories" },
];

export const MORE_LINKS = [
  { key: "lostPets", href: "lost-pets" },
  { key: "places", href: "places" },
  { key: "insurance", href: "insurance" },
  { key: "blog", href: "blog" },
] as const;

const fa = {
  title: "زندگی با آن‌ها،\nمنظم حول خودشان.",
  intro: "سلامت، خدمات، خرید و سفرِ حیوانتان — همه در یک شهر.",
  start: "شروع کنید",
  signIn: "ورود",
  language: "انگلیسی",
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
    memories: ["خاطره‌ها", "عکس‌ها و لحظه‌های زندگی حیوانتان"],
  } satisfies Record<DestinationKey, [string, string]>,
  more: { lostPets: "حیوانات گم‌شده", places: "مکان‌های دوستدار حیوان", insurance: "بیمهٔ حیوانات", blog: "وبلاگ" },
};

const en: typeof fa = {
  title: "Life with them,\norganized around them.",
  intro: "Health, services, shopping and travel for your pet — in one city.",
  start: "Get started",
  signIn: "Sign in",
  language: "Persian",
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
    memories: ["Memories", "Photos and moments from your pet's life"],
  },
  more: { lostPets: "Lost pets", places: "Pet-friendly places", insurance: "Pet insurance", blog: "Blog" },
};

export const landingCopy: Record<AppLocale, typeof fa> = { fa, en };
