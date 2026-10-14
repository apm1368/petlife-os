import type { AppLocale } from "@/lib/i18n/config";

const fa = {
  eyebrow: "زندگی کنار هم، ساده‌تر می‌شود",
  identityTitle: "یک هویت، برای تمام دنیای او",
  identityBody: "کوکی فقط یک نام در برنامه نیست. پرونده‌اش نقطهٔ شروع سلامت، مراقبت، نوبت‌ها و خاطره‌های اوست؛ اطلاعاتی که خودت ثبت می‌کنی و اختیارش را داری.",
  identityCta: "ساخت پروندهٔ همراه من", identityMore: "دیدن خدمات", cookie: "کوکی", example: "یک همراه واقعی، یک دنیای شخصی",
  cookieAlt: "عکس واقعی کوکی، سگ کوچک طلایی، در جای خوابش", appAlt: "نمای نمونهٔ داشبورد PET LIFE OS", appExample: "نمای نمونهٔ برنامه",
  identityFacts: ["مشخصات و هویت", "پروندهٔ سلامت", "برنامهٔ مراقبت", "خاطره‌های مشترک"],
  howEyebrow: "از آشنایی تا رسیدگی", howTitle: "یک مسیر روشن، برای خیال راحت‌تر",
  steps: [
    { title: "همراهت را معرفی کن", body: "نام و مشخصاتش را ثبت کن؛ پرونده از اطلاعات خودت شکل می‌گیرد." },
    { title: "خدمت مورد نیاز را پیدا کن", body: "خدمات و ارائه‌دهندگان را ببین و گزینهٔ مناسب را انتخاب کن." },
    { title: "رزرو و پیگیری کن", body: "جزئیات و وضعیت نوبت‌ها را در برنامه دنبال کن." },
  ],
  momentsEyebrow: "برای روزهای معمولی و اتفاق‌های مهم", momentsTitle: "زندگی، با همهٔ لحظه‌هایش",
  moments: [
    { title: "مراقبت، از همین امروز", body: "پروندهٔ سلامت و نوبت دامپزشک؛ برای وقت‌هایی که رسیدگی لازم است.", action: "پیدا کردن دامپزشک", image: "vet", href: "/vet/find" },
    { title: "وقت بیشتری برای با هم بودن", body: "پیاده‌روی، نظافت و مراقبت روزانه؛ برای روزهایی که دستت پر است.", action: "کشف خدمات مراقبتی", image: "activity", href: "/services" },
    { title: "هم‌سفر همیشگی تو", body: "اقامتگاه‌های پذیرای حیوانات و اطلاعات سفر را پیش از حرکت بررسی کن.", action: "برنامه‌ریزی سفر", image: "travel", href: "/travel" },
  ],
  trustEyebrow: "اعتماد، با شفافیت شروع می‌شود", trustTitle: "اطلاعات او، با اختیار تو",
  trust: [
    { title: "اشتراک با اجازهٔ تو", body: "دسترسی به پرونده را خودت تعیین می‌کنی؛ چه کسی، کدام بخش و تا چه زمانی." },
    { title: "منبع اطلاعات روشن است", body: "معلوم است هر اطلاعات از صاحب حیوان، مرکز درمانی یا منبع دیگری آمده است." },
    { title: "نامشخص، یعنی نامشخص", body: "اطلاعات ثبت‌نشده را سالم یا تأییدشده نشان نمی‌دهیم؛ چیزی را به جای واقعیت حدس نمی‌زنیم." },
  ],
  supportEyebrow: "مهربانی، بیرون از خانه هم ادامه دارد", supportTitle: "برای آن‌هایی که منتظر یک دست مهربان‌اند",
  supportBody: "نیازهای ثبت‌شدهٔ مراکز حمایتی را ببین و مسیر کمک را دنبال کن؛ سهم کوچکی از دنیای ما برای همراهانی که هنوز خانه‌ای ندارند.",
  supportCta: "دیدن نیازهای حمایتی", communityCta: "پیوستن به جامعه",
  partnerEyebrow: "برای کسانی که مراقبت را حرفه‌ای دنبال می‌کنند", partnerTitle: "تو هم بخشی از این دنیا باش",
  partnerBody: "دامپزشک، ارائه‌دهندهٔ خدمات یا فروشنده هستی؟ ورود به فضای کاری همکاران از اینجاست. داشتن حساب کاربری به‌تنهایی عضویت کسب‌وکار ایجاد نمی‌کند؛ دسترسی به فضای کاری به عضویت تأییدشدهٔ همان کسب‌وکار نیاز دارد.",
  partnerLogin: "ورود همکار", partnerJoin: "ساخت حساب همکار",
  finalTitle: "دنیای او، از کنار تو شروع می‌شود", finalBody: "اولین قدم، ساختن یک پرونده برای همراه توست.", join: "ساخت حساب", login: "ورود به حساب",
  footerDescription: "سلامت، مراقبت، خدمات و لحظه‌های مشترک؛ یک دنیا برای تو و همراه کوچکت.",
  footerPartners: "همکاران", footerLabel: "دسترسی‌های پایین صفحه", footerTop: "بازگشت به پارک", footerPrivacy: "تنظیمات حریم خصوصی", footerCredits: "اعتبار تصاویر", footerNotice: "نسخهٔ آزمایشی؛ اطلاعات نمایشی ممکن است نمونه باشند.",
  footerGroups: [
    { title: "خدمات", links: [{ label: "دامپزشکی", href: "/vet/find" }, { label: "پت‌شاپ", href: "/shop" }, { label: "آرایش و شست‌وشو", href: "/services/GROOMING" }, { label: "اقامت و مراقبت", href: "/services/BOARDING" }] },
    { title: "زندگی کنار هم", links: [{ label: "سفر", href: "/travel" }, { label: "تاکسی", href: "/services/PET_TAXI" }, { label: "بیمه", href: "/insurance" }, { label: "حمایت از حیوانات", href: "/animal-support/needs" }] },
    { title: "همراه شما", links: [{ label: "راهنما", href: "/guides" }, { label: "مجله", href: "/blog" }, { label: "جامعه", href: "/community" }, { label: "پشتیبانی", href: "/support" }] },
  ],
};
type StoryCopy = typeof fa;
const en: StoryCopy = {
  eyebrow: "A simpler life, together",
  identityTitle: "One identity. Their whole world.",
  identityBody: "Cookie is more than a name in an app. Her record connects health, care, appointments and memories, built from the information you choose to add and share.",
  identityCta: "Create my pet’s record", identityMore: "Explore services", cookie: "Cookie", example: "A real companion. A world of their own.",
  cookieAlt: "A real photograph of Cookie, a small golden dog, resting on her bed", appAlt: "Example PET LIFE OS dashboard", appExample: "App preview",
  identityFacts: ["Identity and details", "Health record", "Care planning", "Shared memories"],
  howEyebrow: "From getting acquainted to getting care", howTitle: "A clear path to more peace of mind",
  steps: [
    { title: "Introduce your companion", body: "Add their name and details. Their record starts with what you share." },
    { title: "Find the care they need", body: "Explore services and providers, and choose what works for you." },
    { title: "Book and follow along", body: "Keep appointment details and status together in the app." },
  ],
  momentsEyebrow: "For ordinary days and important moments", momentsTitle: "Life, with every moment included",
  moments: [
    { title: "Care starts today", body: "Health records and veterinary appointments for the moments they need care.", action: "Find a vet", image: "vet", href: "/vet/find" },
    { title: "More time together", body: "Walking, grooming and everyday care for the days your hands are full.", action: "Explore care services", image: "activity", href: "/services" },
    { title: "Your favourite travel companion", body: "Check pet-friendly stays and travel information before you leave.", action: "Plan a trip", image: "travel", href: "/travel" },
  ],
  trustEyebrow: "Trust starts with transparency", trustTitle: "Their information. Your choice.",
  trust: [
    { title: "Shared with your permission", body: "You decide who can access their record, which parts, and for how long." },
    { title: "Clear information sources", body: "See whether information came from you, a clinic or another source." },
    { title: "Unknown means unknown", body: "Missing information is never presented as healthy or verified. We do not replace facts with guesses." },
  ],
  supportEyebrow: "Kindness goes beyond our own homes", supportTitle: "For those waiting for a helping hand",
  supportBody: "Explore registered shelter needs and follow the path to helping. A small part of our world for companions still waiting for a home.",
  supportCta: "Explore support needs", communityCta: "Join the community",
  partnerEyebrow: "For the people who make care their profession", partnerTitle: "Be part of their world",
  partnerBody: "A vet, service provider or seller? Enter your partner workspace here. Creating an account alone does not create a business membership; workspace access requires approved membership of that business.",
  partnerLogin: "Partner sign in", partnerJoin: "Create a partner account",
  finalTitle: "Their world starts by your side", finalBody: "Take the first step: a record for your companion.", join: "Create an account", login: "Sign in",
  footerDescription: "Health, care, services and shared moments. A world for you and your little companion.",
  footerPartners: "Partners", footerLabel: "Footer navigation", footerTop: "Back to the park", footerPrivacy: "Privacy settings", footerCredits: "Image credits", footerNotice: "Test release; displayed information may include examples.",
  footerGroups: [
    { title: "Services", links: [{ label: "Veterinary", href: "/vet/find" }, { label: "Pet shop", href: "/shop" }, { label: "Grooming", href: "/services/GROOMING" }, { label: "Boarding and care", href: "/services/BOARDING" }] },
    { title: "Life together", links: [{ label: "Travel", href: "/travel" }, { label: "Taxi", href: "/services/PET_TAXI" }, { label: "Insurance", href: "/insurance" }, { label: "Animal support", href: "/animal-support/needs" }] },
    { title: "By your side", links: [{ label: "Guides", href: "/guides" }, { label: "Journal", href: "/blog" }, { label: "Community", href: "/community" }, { label: "Support", href: "/support" }] },
  ],
};
export const storyCopy: Record<AppLocale, StoryCopy> = { fa, en };
