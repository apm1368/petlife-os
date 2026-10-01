import {
  BookOpen, CalendarDays, Compass, Heart, HandHeart, HeartPulse, House, Images, MapPin, PackageCheck, Plane, Repeat, Scissors, ShieldPlus,
  ShoppingBag, Siren, Stethoscope, Users,
} from "@petlife/ui";

export type NavIcon = typeof House;

/**
 * The member IA. Six primary destinations (Account is the avatar menu, not a tab); everything else is
 * grouped under Explore. One definition drives the desktop header + mega menu, the mobile bottom bar
 * + Explore sheet, and the /explore page, so the three can never drift apart. Every href is an
 * existing route — nothing is added just to fill a column.
 */
export interface PrimaryDestination {
  key: "home" | "explore" | "health" | "services" | "shop" | "memories";
  href: string;
  fa: string;
  en: string;
  icon: NavIcon;
  /** Slot in the five-item mobile bar (Memories lives in the Explore sheet on mobile). */
  mobile: boolean;
  match: (path: string) => boolean;
}

const starts = (...prefixes: string[]) => (path: string) => prefixes.some((p) => path === p || path.startsWith(`${p}/`));
const petSection = (...sections: string[]) => (path: string) => sections.some((s) => new RegExp(`^/pets/[^/]+/${s}(?:/|$)`).test(path));

export const PRIMARY_DESTINATIONS: PrimaryDestination[] = [
  { key: "home", href: "/home", fa: "خانه", en: "Home", icon: House, mobile: true, match: (p) => p === "/home" || p === "/pets" || p === "/pets/new" || /^\/pets\/[^/]+$/.test(p) || petSection("activity", "documents", "lost", "insurance")(p) },
  { key: "explore", href: "/explore", fa: "کاوش", en: "Explore", icon: Compass, mobile: true, match: (p) => starts("/explore", "/travel", "/places", "/insurance", "/animal-support", "/donations", "/community", "/lost-pets", "/blog", "/support", "/invitations")(p) || petSection("travel")(p) },
  { key: "health", href: "/pets/active?view=health", fa: "سلامت", en: "Health", icon: HeartPulse, mobile: true, match: (p) => starts("/vet", "/care-calendar")(p) || petSection("health", "care")(p) },
  { key: "services", href: "/services", fa: "خدمات", en: "Services", icon: Scissors, mobile: true, match: starts("/services", "/bookings", "/providers") },
  { key: "shop", href: "/shop", fa: "فروشگاه", en: "Shop", icon: ShoppingBag, mobile: true, match: starts("/shop", "/cart", "/checkout", "/orders", "/repeat-delivery", "/favorites") },
  { key: "memories", href: "/pets/active?view=memories", fa: "خاطرات", en: "Memories", icon: Images, mobile: false, match: petSection("memories", "life-timeline") },
];

export interface ExploreLink { href: string; icon: NavIcon; fa: [string, string]; en: [string, string] }
export interface ExploreGroup { key: string; fa: string; en: string; links: ExploreLink[] }

export const EXPLORE_GROUPS: ExploreGroup[] = [
  {
    key: "care", fa: "مراقبت", en: "Care",
    links: [
      { href: "/pets/active?view=health", icon: HeartPulse, fa: ["سلامت", "پرونده، واکسن‌ها و داروها"], en: ["Health", "Record, vaccines and medications"] },
      { href: "/vet/find", icon: Stethoscope, fa: ["دامپزشک", "کلینیک‌ها و دامپزشکان نزدیک"], en: ["Vets", "Clinics and vets nearby"] },
      { href: "/services", icon: Scissors, fa: ["خدمات", "آرایش، آموزش، پیاده‌روی و نگهداری"], en: ["Services", "Grooming, training, walking, sitting"] },
      { href: "/care-calendar", icon: CalendarDays, fa: ["تقویم مراقبت", "یادآورها و نوبت‌ها در یک نگاه"], en: ["Care calendar", "Reminders and visits at a glance"] },
    ],
  },
  {
    key: "life", fa: "زندگی", en: "Life",
    links: [
      { href: "/travel", icon: Plane, fa: ["سفر و اقامت", "اقامتگاه‌هایی که حیوان شما را می‌پذیرند"], en: ["Travel and stays", "Stays that welcome your pet"] },
      { href: "/insurance", icon: ShieldPlus, fa: ["بیمه", "مقایسهٔ طرح‌ها و درخواست"], en: ["Insurance", "Compare plans and apply"] },
      { href: "/places", icon: MapPin, fa: ["مکان‌ها", "پارک، کافه و رستوران دوستدار حیوان"], en: ["Places", "Pet-friendly parks, cafés, restaurants"] },
    ],
  },
  {
    key: "shop", fa: "خرید", en: "Shop",
    links: [
      { href: "/shop", icon: ShoppingBag, fa: ["فروشگاه", "غذا و لوازم از فروشندگان معتبر"], en: ["Shop", "Food and supplies from trusted sellers"] },
      { href: "/favorites", icon: Heart, fa: ["علاقه‌مندی‌ها", "آنچه نشان کرده‌اید"], en: ["Favorites", "What you saved"] },
      { href: "/repeat-delivery", icon: Repeat, fa: ["تحویل دوره‌ای", "غذا و لوازم مصرفی، بی‌دغدغه"], en: ["Repeat delivery", "Regular supplies without the hassle"] },
      { href: "/orders", icon: PackageCheck, fa: ["سفارش‌ها", "پیگیری و تاریخچهٔ خرید"], en: ["Orders", "Tracking and purchase history"] },
    ],
  },
  {
    key: "community", fa: "جامعه و کمک", en: "Community and support",
    links: [
      { href: "/lost-pets", icon: Siren, fa: ["حیوانات گم‌شده", "گزارش‌های اطراف و ثبت مشاهده"], en: ["Lost pets", "Reports nearby and sightings"] },
      { href: "/animal-support/needs", icon: HandHeart, fa: ["حمایت از حیوانات", "نیازهای پناهگاه‌ها و افراد"], en: ["Animal support", "Needs from shelters and people"] },
      { href: "/animal-support", icon: House, fa: ["سازمان‌ها و پناهگاه‌ها", "سازمان‌های تأییدشده و کمپین‌ها"], en: ["Shelters and NGOs", "Verified organizations and campaigns"] },
      { href: "/community", icon: Users, fa: ["جامعه", "پرسش و تجربهٔ صاحبان حیوانات"], en: ["Community", "Questions and stories from owners"] },
    ],
  },
  {
    key: "stories", fa: "خاطره و مقاله", en: "Stories and articles",
    links: [
      { href: "/pets/active?view=memories", icon: Images, fa: ["خاطرات", "لحظه‌ها و خط زمانی زندگی"], en: ["Memories", "Moments and the life timeline"] },
      { href: "/blog", icon: BookOpen, fa: ["وبلاگ", "مقاله‌های مراقبت و سلامت"], en: ["Blog", "Care and health articles"] },
    ],
  },
];

/** Locale-less path ("/pets/x/health") → the primary destination it belongs to, or null (e.g. Account). */
export function currentDestination(path: string): PrimaryDestination["key"] | null {
  return PRIMARY_DESTINATIONS.find((d) => d.match(path))?.key ?? null;
}
