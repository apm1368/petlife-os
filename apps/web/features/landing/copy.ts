import type { AppLocale } from "@/lib/i18n/config";

/**
 * Landing copy. Every `href` is a shipped route (locale-less); member-only routes
 * (/pets/new, /pets/active, /care-calendar, /support) send an anonymous visitor
 * through sign-in with a returnTo, so none of them is a dead end.
 */
export interface LandingCopy {
  meta: { title: string; description: string };
  nav: { label: string; menu: string; close: string; items: { href: string; label: string }[] };
  actions: { start: string; signIn: string; dashboard: string; language: string; languageLabel: string; skip: string };
  hero: { title: string; body: string; primary: string; secondary: string; note: string; sceneLabel: string };
  identity: {
    eyebrow: string; title: string; body: string; cta: string; sample: string;
    pet: { name: string; detail: string; chip: string; vaccines: string; allergies: string };
    links: { href: string; label: string; hint: string }[];
  };
  health: {
    eyebrow: string; title: string; body: string; primary: string; secondary: string; sample: string;
    rows: { label: string; value: string; tone: "done" | "soon" | "unknown" | "info" }[];
  };
  services: {
    eyebrow: string; title: string; body: string; primary: string; secondary: string;
    categories: { href: string; label: string; hint: string; icon: ServiceIcon }[];
  };
  travel: {
    eyebrow: string; title: string; body: string; primary: string; sample: string; sceneLabel: string;
    facts: { label: string; value: string }[];
  };
  memories: { eyebrow: string; title: string; body: string; primary: string; sceneLabel: string };
  community: {
    eyebrow: string; title: string; body: string; sceneLabel: string;
    links: { href: string; label: string; hint: string }[];
  };
  ecosystem: { eyebrow: string; title: string; body: string; primary: string; points: string[] };
  trust: { eyebrow: string; title: string; points: { title: string; body: string }[] };
  final: { title: string; body: string; primary: string; secondary: string };
  footer: { tagline: string; groups: { title: string; links: { href: string; label: string }[] }[]; demo: string };
}

export type ServiceIcon = "vet" | "groom" | "train" | "walk" | "sit" | "board" | "taxi";

const fa: LandingCopy = {
  meta: {
    title: "زندگی حیوان شما، در یک جا",
    description: "سلامت، مراقبت، خدمات، سفر و خاطرات حیوان خانگی‌تان، همه حول هویت خود او.",
  },
  nav: {
    label: "ناوبری اصلی",
    menu: "باز کردن منو",
    close: "بستن منو",
    items: [
      { href: "/services", label: "خدمات" },
      { href: "/vet/find", label: "دامپزشک" },
      { href: "/travel", label: "سفر" },
      { href: "/shop", label: "فروشگاه" },
      { href: "/community", label: "جامعه" },
      { href: "/guides", label: "راهنما" },
    ],
  },
  actions: {
    start: "شروع کنید",
    signIn: "ورود",
    dashboard: "داشبورد من",
    language: "English",
    languageLabel: "تغییر زبان به انگلیسی",
    skip: "رفتن به محتوای اصلی",
  },
  hero: {
    title: "زندگی حیوان شما،\nدر یک جا.",
    body: "پرونده سلامت، یادآورهای مراقبت، نوبت دامپزشک، سفر و خاطره‌ها؛ همه حول هویت خود او، نه پراکنده در چند برنامه.",
    primary: "شروع کنید",
    secondary: "مشاهده خدمات",
    note: "ساخت حساب رایگان است. برای دیدن خدمات و راهنماها حساب لازم نیست.",
    sceneLabel: "تصویرسازی پارکی در تهران با برج آزادی و برج میلاد، دو گربه روی نیمکت و کسی که سگش را قدم می‌زند.",
  },
  identity: {
    eyebrow: "هویت پت",
    title: "همه‌چیز از خود او شروع می‌شود.",
    body: "یک بار مشخصات حیوانتان را ثبت می‌کنید. از آن به بعد سلامت، نوبت‌ها، خرید و سفر همه به همین هویت وصل‌اند و لازم نیست چیزی را دوباره توضیح بدهید.",
    cta: "افزودن پت",
    sample: "نمونه",
    pet: { name: "نیلو", detail: "گربه · بریتیش شورت‌هیر · ۳ سال", chip: "میکروچیپ ثبت شده", vaccines: "واکسن‌ها به‌روز", allergies: "حساسیت: ثبت نشده" },
    links: [
      { href: "/pets/active?view=health", label: "سلامت", hint: "واکسن، دارو، آزمایش" },
      { href: "/care-calendar", label: "مراقبت", hint: "یادآور و برنامه" },
      { href: "/services", label: "خدمات", hint: "نوبت و رزرو" },
      { href: "/travel", label: "سفر", hint: "اقامت و آمادگی" },
      { href: "/pets/active?view=memories", label: "خاطرات", hint: "لحظه‌ها و خط زمانی" },
    ],
  },
  health: {
    eyebrow: "سلامت و مراقبت",
    title: "آرام، دقیق، و صادق درباره‌ی آنچه نمی‌دانیم.",
    body: "واکسن‌ها، داروها، آزمایش‌ها و مدارک در یک خط زمانی می‌آیند و منبع هر مورد مشخص است. اگر اطلاعاتی ثبت نشده، همان را می‌بینید؛ نامشخص هرگز «سالم» نشان داده نمی‌شود.",
    primary: "پرونده سلامت",
    secondary: "تقویم مراقبت",
    sample: "نمونه‌ی نمایشی",
    rows: [
      { label: "واکسن هاری", value: "انجام شد · ۱۲ مهر", tone: "done" },
      { label: "قرص ضدانگل", value: "۳ روز دیگر", tone: "soon" },
      { label: "وزن", value: "۴٫۲ کیلوگرم · ثبت دامپزشک", tone: "info" },
      { label: "حساسیت دارویی", value: "ثبت نشده", tone: "unknown" },
    ],
  },
  services: {
    eyebrow: "خدمات",
    title: "کمک درست، نزدیک خانه.",
    body: "دامپزشک، آرایش، آموزش و نگهداری را با اطلاعات واقعی ارائه‌دهنده، نظر مشتری‌ها و زمان خالی پیدا کنید و همان‌جا برای حیوان خودتان نوبت بگیرید.",
    primary: "مشاهده خدمات",
    secondary: "پیدا کردن دامپزشک",
    categories: [
      { href: "/services/VET", label: "دامپزشکی", hint: "معاینه، واکسن، ویزیت در خانه", icon: "vet" },
      { href: "/services/GROOMING", label: "آرایش و نظافت", hint: "حمام، اصلاح، ناخن", icon: "groom" },
      { href: "/services/TRAINING", label: "آموزش", hint: "رفتار و فرمان‌پذیری", icon: "train" },
      { href: "/services/WALKING", label: "پیاده‌روی", hint: "روزانه یا گاه‌به‌گاه", icon: "walk" },
      { href: "/services/SITTING", label: "نگهداری در خانه", hint: "وقتی شما نیستید", icon: "sit" },
      { href: "/services/BOARDING", label: "پانسیون", hint: "اقامت کوتاه و بلند", icon: "board" },
      { href: "/services/PET_TAXI", label: "تاکسی حیوانات", hint: "رفت‌وآمد امن", icon: "taxi" },
    ],
  },
  travel: {
    eyebrow: "سفر",
    title: "سفر، بدون حدس زدن.",
    body: "اقامتگاه‌هایی را ببینید که حیوان را می‌پذیرند، همراه با منبع اطلاعات و زمان آخرین بررسی. اگر سیاست پذیرش روشن نیست، صریح می‌گوییم «نامشخص».",
    primary: "دیدن اقامتگاه‌ها",
    sample: "نمونه‌ی نمایشی",
    sceneLabel: "تصویرسازی یک اقامتگاه چوبی در جنگل‌های شمال.",
    facts: [
      { label: "پذیرش حیوان", value: "تأییدشده از منبع" },
      { label: "قیمت", value: "بر اساس تاریخ سفر" },
      { label: "آخرین بررسی", value: "امروز" },
    ],
  },
  memories: {
    eyebrow: "خاطرات",
    title: "لحظه‌هایی که می‌مانند.",
    body: "اولین روز در خانه، اولین برف، تولدها. عکس‌ها و یادداشت‌ها کنار پرونده‌ی او می‌مانند و فقط خودتان تصمیم می‌گیرید با چه کسی به اشتراک بگذارید.",
    primary: "شروع آلبوم",
    sceneLabel: "سه قاب عکس: گربه‌ای کنار پنجره، سگی در پارک و جشن تولد.",
  },
  community: {
    eyebrow: "جامعه و حمایت",
    title: "تنها نیستید.",
    body: "پرسش‌هایتان را از صاحبان دیگر بپرسید، به پناهگاه‌های تأییدشده کمک کنید و اگر حیوانی گم شد، گزارشش را به اطرافیان برسانید.",
    sceneLabel: "تصویرسازی دو نفر با حیواناتشان روی نیمکت پارک.",
    links: [
      { href: "/community", label: "جامعه", hint: "پرسش و تجربه‌ی صاحبان حیوانات" },
      { href: "/animal-support/needs", label: "حمایت از حیوانات", hint: "نیازهای شفاف پناهگاه‌ها" },
      { href: "/lost-pets", label: "حیوانات گم‌شده", hint: "گزارش‌ها و ثبت مشاهده" },
    ],
  },
  ecosystem: {
    eyebrow: "برای کلینیک‌ها و ارائه‌دهندگان",
    title: "یک شبکه، نه چند جزیره.",
    body: "کلینیک‌ها، آرایشگاه‌ها و فروشندگان پنل مخصوص خودشان را دارند: نوبت، پرونده‌ی بیمار با اجازه‌ی صاحب، و موجودی. اطلاعات فقط با رضایت و برای مدت لازم به اشتراک گذاشته می‌شود.",
    primary: "دامپزشک‌های فعال",
    points: ["دسترسی زمان‌دار به پرونده با اجازه‌ی صاحب", "نوبت‌دهی و یادآور برای مراجعان", "نظر واقعی مشتری‌ها پس از خدمت"],
  },
  trust: {
    eyebrow: "اعتماد و حریم خصوصی",
    title: "اطلاعات او، تصمیم شما.",
    points: [
      { title: "اشتراک با اجازه", body: "دامپزشک فقط وقتی پرونده را می‌بیند که شما لینک یا دسترسی بدهید، و دسترسی خودکار تمام می‌شود." },
      { title: "منبع روشن", body: "کنار هر داده نوشته می‌شود از کجا آمده: شما، کلینیک، یا یک منبع بیرونی." },
      { title: "بدون ادعای جعلی", body: "قیمت، موجودی و سیاست پذیرش هرگز حدس زده نمی‌شوند. اگر نمی‌دانیم، همین را می‌گوییم." },
    ],
  },
  final: {
    title: "از هویت او شروع کنید.",
    body: "چند دقیقه برای ثبت مشخصات؛ بعد همه‌چیز سر جای خودش است.",
    primary: "شروع کنید",
    secondary: "ورود به حساب",
  },
  footer: {
    tagline: "سیستم زندگی حیوان خانگی",
    demo: "این نسخه‌ی آزمایشی است و داده‌ها نمایشی‌اند.",
    groups: [
      { title: "مراقبت", links: [{ href: "/vet/find", label: "دامپزشک" }, { href: "/services", label: "خدمات" }, { href: "/insurance", label: "بیمه" }] },
      { title: "زندگی", links: [{ href: "/travel", label: "سفر و اقامت" }, { href: "/places", label: "مکان‌های دوستدار حیوان" }, { href: "/shop", label: "فروشگاه" }] },
      { title: "جامعه", links: [{ href: "/community", label: "جامعه" }, { href: "/animal-support", label: "حمایت از حیوانات" }, { href: "/lost-pets", label: "حیوانات گم‌شده" }] },
      { title: "یادگیری", links: [{ href: "/guides", label: "راهنماها" }, { href: "/blog", label: "وبلاگ" }, { href: "/support", label: "پشتیبانی" }] },
    ],
  },
};

const en: LandingCopy = {
  meta: {
    title: "Your pet's life, in one place",
    description: "Health, care, services, travel and memories, all organized around who your pet is.",
  },
  nav: {
    label: "Main navigation",
    menu: "Open menu",
    close: "Close menu",
    items: [
      { href: "/services", label: "Services" },
      { href: "/vet/find", label: "Vets" },
      { href: "/travel", label: "Travel" },
      { href: "/shop", label: "Shop" },
      { href: "/community", label: "Community" },
      { href: "/guides", label: "Guides" },
    ],
  },
  actions: {
    start: "Get started",
    signIn: "Sign in",
    dashboard: "My dashboard",
    language: "فارسی",
    languageLabel: "Switch language to Persian",
    skip: "Skip to main content",
  },
  hero: {
    title: "Your pet's life,\nin one place.",
    body: "Health records, care reminders, vet visits, travel and memories, organized around who they are instead of scattered across apps.",
    primary: "Get started",
    secondary: "Browse services",
    note: "Creating an account is free. Services and guides are open without one.",
    sceneLabel: "Illustration of a Tehran park with Azadi Tower and Milad Tower, two cats on a bench and someone walking a dog.",
  },
  identity: {
    eyebrow: "Pet identity",
    title: "Everything starts with them.",
    body: "Add your pet once. Health, bookings, shopping and travel all connect to that identity, so you never have to explain the basics again.",
    cta: "Add a pet",
    sample: "Example",
    pet: { name: "Nilo", detail: "Cat · British Shorthair · 3 years", chip: "Microchip on file", vaccines: "Vaccines up to date", allergies: "Allergies: not recorded" },
    links: [
      { href: "/pets/active?view=health", label: "Health", hint: "Vaccines, medication, labs" },
      { href: "/care-calendar", label: "Care", hint: "Reminders and routines" },
      { href: "/services", label: "Services", hint: "Visits and bookings" },
      { href: "/travel", label: "Travel", hint: "Stays and readiness" },
      { href: "/pets/active?view=memories", label: "Memories", hint: "Moments and timeline" },
    ],
  },
  health: {
    eyebrow: "Health and care",
    title: "Calm, precise, and honest about what we don't know.",
    body: "Vaccines, medication, labs and documents sit on one timeline, each with its source. If something was never recorded, you see exactly that. Unknown is never shown as healthy.",
    primary: "Health record",
    secondary: "Care calendar",
    sample: "Illustrative example",
    rows: [
      { label: "Rabies vaccine", value: "Done · 4 Oct", tone: "done" },
      { label: "Deworming tablet", value: "In 3 days", tone: "soon" },
      { label: "Weight", value: "4.2 kg · recorded by vet", tone: "info" },
      { label: "Drug allergies", value: "Not recorded", tone: "unknown" },
    ],
  },
  services: {
    eyebrow: "Services",
    title: "The right help, close to home.",
    body: "Find vets, groomers, trainers and sitters with real provider details, customer reviews and open times, then book for your own pet in the same place.",
    primary: "Browse services",
    secondary: "Find a vet",
    categories: [
      { href: "/services/VET", label: "Veterinary", hint: "Checkups, vaccines, home visits", icon: "vet" },
      { href: "/services/GROOMING", label: "Grooming", hint: "Bath, trim, nails", icon: "groom" },
      { href: "/services/TRAINING", label: "Training", hint: "Behavior and obedience", icon: "train" },
      { href: "/services/WALKING", label: "Walking", hint: "Daily or occasional", icon: "walk" },
      { href: "/services/SITTING", label: "Pet sitting", hint: "While you're away", icon: "sit" },
      { href: "/services/BOARDING", label: "Boarding", hint: "Short and long stays", icon: "board" },
      { href: "/services/PET_TAXI", label: "Pet taxi", hint: "Safe rides", icon: "taxi" },
    ],
  },
  travel: {
    eyebrow: "Travel",
    title: "Travel, without guessing.",
    body: "See stays that accept pets, with the source of every claim and when it was last checked. When a pet policy isn't clear, we say \"unknown\".",
    primary: "Explore stays",
    sample: "Illustrative example",
    sceneLabel: "Illustration of a wooden lodge in the northern forests.",
    facts: [
      { label: "Pets", value: "Confirmed by source" },
      { label: "Price", value: "Depends on your dates" },
      { label: "Last checked", value: "Today" },
    ],
  },
  memories: {
    eyebrow: "Memories",
    title: "The moments that stay.",
    body: "The first day home, the first snow, birthdays. Photos and notes live next to their record, and you decide who sees them.",
    primary: "Start an album",
    sceneLabel: "Three photo frames: a cat by a window, a dog in a park, and a birthday.",
  },
  community: {
    eyebrow: "Community and support",
    title: "You're not alone.",
    body: "Ask other owners, help verified shelters, and if a pet goes missing, get the word out to people nearby.",
    sceneLabel: "Illustration of two people with their pets on a park bench.",
    links: [
      { href: "/community", label: "Community", hint: "Questions and stories from owners" },
      { href: "/animal-support/needs", label: "Animal support", hint: "Transparent shelter needs" },
      { href: "/lost-pets", label: "Lost pets", hint: "Reports and sightings" },
    ],
  },
  ecosystem: {
    eyebrow: "For clinics and providers",
    title: "One network, not islands.",
    body: "Clinics, groomers and sellers get their own workspace: appointments, patient records shared with the owner's consent, and inventory. Data is shared only with consent and only for as long as needed.",
    primary: "Browse vets",
    points: ["Time-limited record access with owner consent", "Scheduling and reminders for clients", "Verified reviews after each visit"],
  },
  trust: {
    eyebrow: "Trust and privacy",
    title: "Their data, your decision.",
    points: [
      { title: "Shared with permission", body: "A vet sees the record only when you share a link or grant access, and access expires on its own." },
      { title: "Clear sources", body: "Every fact says where it came from: you, a clinic, or an external source." },
      { title: "No made-up claims", body: "Prices, stock and pet policies are never guessed. If we don't know, we say so." },
    ],
  },
  final: {
    title: "Start with who they are.",
    body: "A few minutes to add their details. Then everything has its place.",
    primary: "Get started",
    secondary: "Sign in",
  },
  footer: {
    tagline: "The operating system for pet life",
    demo: "This is a test release; data is for demonstration.",
    groups: [
      { title: "Care", links: [{ href: "/vet/find", label: "Vets" }, { href: "/services", label: "Services" }, { href: "/insurance", label: "Insurance" }] },
      { title: "Life", links: [{ href: "/travel", label: "Travel and stays" }, { href: "/places", label: "Pet-friendly places" }, { href: "/shop", label: "Shop" }] },
      { title: "Community", links: [{ href: "/community", label: "Community" }, { href: "/animal-support", label: "Animal support" }, { href: "/lost-pets", label: "Lost pets" }] },
      { title: "Learn", links: [{ href: "/guides", label: "Guides" }, { href: "/blog", label: "Blog" }, { href: "/support", label: "Support" }] },
    ],
  },
};

export const landingCopy: Record<AppLocale, LandingCopy> = { fa, en };
