import type { AppLocale } from "@/lib/i18n/config";

export const parkDestinations = [
  { key: "shop", href: "/shop", x: 9.4, y: 47, width: 10.4, tone: "plum" },
  { key: "vet", href: "/vet/find", x: 21.2, y: 48.5, width: 10.4, tone: "teal" },
  { key: "grooming", href: "/services/GROOMING", x: 31.1, y: 50, width: 10.4, tone: "rose" },
  { key: "boarding", href: "/services/BOARDING", x: 42.4, y: 50, width: 10.4, tone: "copper" },
  { key: "travel", href: "/travel", x: 56, y: 50, width: 10.4, tone: "green" },
  { key: "taxi", href: "/services/PET_TAXI", x: 71.2, y: 49.5, width: 10.4, tone: "gold" },
  { key: "support", href: "/animal-support/needs", x: 81.6, y: 48.5, width: 10.4, tone: "coral" },
  { key: "insurance", href: "/insurance", x: 92.1, y: 47.5, width: 10.4, tone: "blue" },
] as const;
export type ParkDestinationKey = typeof parkDestinations[number]["key"];
interface ParkCopy {
  imageSrc: string; title: string; description: string; subline: string; explore: string;
  imageAlt: string; destinationsLabel: string; introTitle: string; introBody: string;
  brandTagline: string; partnerSignIn: string; partnerJoin: string;
  memberJoin: string; home: string; about: string; partners: string; photoCredits: string;
  services: Record<ParkDestinationKey, { title: string; hint: string }>;
  creditsTitle: string; creditsBody: string; backdropCredit: string; shopCredit: string; processing: string; licence: string;
}
export const parkCopy: Record<AppLocale, ParkCopy> = {
  fa: {
    imageSrc: "/images/landing/tehran-park.webp",
    title: "یک دنیا برای تو و همراهت",
    description: "همهٔ خدمات مورد نیاز حیوانات خانگی، در یک اپلیکیشن",
    subline: "زندگی سالم‌تر، شادتر و همراه‌تر برای دوست کوچک شما",
    explore: "کشف خدمات",
    imageAlt: "تارا با موهای فر مسی و کوکی وارد پارکی در تهران می‌شوند؛ پدرام کنار تریر سفید و مشکی است. غرفه‌های خدمات، برج آزادی و برج میلاد در دورنما دیده می‌شوند. تصویر مفهومی تولیدشده با هوش مصنوعی.",
    destinationsLabel: "انتخاب خدمات پارک",
    introTitle: "کنار شما، در تمام لحظه‌ها",
    introBody: "از سلامت و زیبایی تا سفر و اقامت، همه‌چیز برای یک زندگی بهتر در کنار حیوان خانگی شما.",
    brandTagline: "یک جهان برای حیوانات خانگی",
    partnerSignIn: "ورود همکار", partnerJoin: "عضویت همکار",
    memberJoin: "عضویت", home: "خانه", about: "دربارهٔ ما", partners: "برای همکاران", photoCredits: "اعتبار تصاویر",
    services: {
      shop: { title: "پت‌شاپ", hint: "همهٔ نیازهای روزانه" },
      vet: { title: "دامپزشکی", hint: "سلامتی در اولویت" },
      grooming: { title: "آرایش و شست‌وشو", hint: "ظاهر زیبا، حال خوب" },
      boarding: { title: "اقامت", hint: "در نبود شما، با خیال راحت" },
      travel: { title: "سفر", hint: "سفرهای آسان و لذت‌بخش" },
      taxi: { title: "تاکسی", hint: "حمل‌ونقل امن و راحت" },
      support: { title: "حمایت", hint: "کنار حیوانات نیازمند" },
      insurance: { title: "بیمه", hint: "آرامش خاطر بیشتر" },
    },
    creditsTitle: "پارک تارا و کوکی",
    shopCredit: "تصویر اصلی فروشگاه: کانسپت عکس‌واقع‌گرای تولیدشده با هوش مصنوعی OpenAI؛ برش‌خورده و بازفشرده‌شده. تصویر فروشگاه یا محصول واقعی نیست.",
    backdropCredit: "پس‌زمینهٔ محو و گرم پنل کاربر نیز تصویر تولیدشده با هوش مصنوعی توسط OpenAI است و برای وب بازکدگذاری شده است؛ تصویر یک مکان واقعی نیست.",
    creditsBody: "این پارک یک تصویر مفهومی تولیدشده با هوش مصنوعی بر اساس طرح تأییدشده و تصاویر مرجع تارا، پدرام و کوکی است؛ عکس یک مکان واقعی یا مدرکی از وجود این غرفه‌ها نیست. تصاویر مرجع را صاحب پروژه برای همین طراحی ارائه کرده است.",
    processing: "برش و بازکدگذاری شده", licence: "مجوز و شرایط استفاده",
  },
  en: {
    // Both locales intentionally render the exact owner-approved park image.
    // Copy stays localized; a separately regenerated English scene must never
    // drift in characters, animals, or composition.
    imageSrc: "/images/landing/tehran-park.webp",
    title: "A whole world for you and your pet",
    description: "Everything your pet needs, in one app",
    subline: "A healthier, happier life with your little companion",
    explore: "Explore services",
    imageAlt: "Tara, with copper curls, walks Cookie into a Tehran park. Pedram pets a black-and-white terrier; service pavilions, Azadi Tower and Milad Tower appear beyond. AI-generated concept artwork.",
    destinationsLabel: "Explore park services",
    introTitle: "By your side, through every moment",
    introBody: "From health and grooming to travel and stays. Everything for a better life with your pet.",
    brandTagline: "A world for pets",
    partnerSignIn: "Partner sign in", partnerJoin: "Become a partner",
    memberJoin: "Join", home: "Home", about: "About us", partners: "For partners", photoCredits: "Image credits",
    services: {
      shop: { title: "Pet shop", hint: "Everyday essentials" },
      vet: { title: "Veterinary", hint: "Health comes first" },
      grooming: { title: "Grooming", hint: "Look good, feel good" },
      boarding: { title: "Boarding", hint: "Care while you’re away" },
      travel: { title: "Travel", hint: "Adventures together" },
      taxi: { title: "Taxi", hint: "Safe, comfortable rides" },
      support: { title: "Animal support", hint: "Help animals in need" },
      insurance: { title: "Insurance", hint: "More peace of mind" },
    },
    creditsTitle: "Tara and Cookie’s park",
    shopCredit: "Shop hero: AI-generated photorealistic concept by OpenAI; cropped and re-encoded. Not a real shop or product photograph.",
    backdropCredit: "The warm blurred member-panel backdrop is also OpenAI AI-generated artwork, re-encoded for the web; it does not depict a real location.",
    creditsBody: "This park is AI-generated concept artwork based on the approved design and reference images of Tara, Pedram and Cookie. It is not a photograph of a real location or evidence that these pavilions exist. Reference images were supplied by the project owner for this design.",
    processing: "Cropped/re-encoded", licence: "Licence and usage terms",
  },
};
