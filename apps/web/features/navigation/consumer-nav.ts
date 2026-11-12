import {
  BookOpen, CalendarDays, Compass, Heart, HandHeart, HeartPulse, House, Images, MapPin, PackageCheck, Plane, Repeat, Scissors, ShieldPlus,
  ShoppingBag, Siren, Stethoscope, Users, Newspaper, PawPrint, UserRound,
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
  de: string;
  es: string;
  ar: string;
  nl: string;
  icon: NavIcon;
  /** Slot in the five-item mobile bar (Memories lives in the Explore sheet on mobile). */
  mobile: boolean;
  match: (path: string) => boolean;
}

const starts = (...prefixes: string[]) => (path: string) => prefixes.some((p) => path === p || path.startsWith(`${p}/`));
const petSection = (...sections: string[]) => (path: string) => sections.some((s) => new RegExp(`^/pets/[^/]+/${s}(?:/|$)`).test(path));

export const PRIMARY_DESTINATIONS: PrimaryDestination[] = [
  { key: "home", href: "/home", fa: "داشبورد", en: "Dashboard", de: "Übersicht", es: "Inicio", ar: "لوحة التحكم", nl: "Dashboard", icon: House, mobile: true, match: (p) => p === "/home" || p === "/pets" || p === "/pets/new" || /^\/pets\/[^/]+$/.test(p) || petSection("activity", "documents", "lost", "insurance")(p) },
  { key: "explore", href: "/explore", fa: "کاوش", en: "Explore", de: "Entdecken", es: "Explorar", ar: "استكشاف", nl: "Ontdekken", icon: Compass, mobile: true, match: (p) => starts("/explore", "/travel", "/places", "/insurance", "/animal-support", "/donations", "/community", "/lost-pets", "/guides", "/blog", "/support", "/invitations")(p) || petSection("travel")(p) },
  { key: "health", href: "/pets/active?view=health", fa: "سلامت", en: "Health", de: "Gesundheit", es: "Salud", ar: "الصحة", nl: "Gezondheid", icon: HeartPulse, mobile: true, match: (p) => starts("/vet", "/care-calendar")(p) || petSection("health", "care")(p) },
  { key: "services", href: "/services", fa: "خدمات", en: "Services", de: "Dienstleistungen", es: "Servicios", ar: "الخدمات", nl: "Diensten", icon: Scissors, mobile: true, match: starts("/services", "/bookings", "/providers") },
  { key: "shop", href: "/shop", fa: "فروشگاه", en: "Shop", de: "Shop", es: "Tienda", ar: "المتجر", nl: "Winkel", icon: ShoppingBag, mobile: true, match: starts("/shop", "/cart", "/checkout", "/orders", "/repeat-delivery", "/favorites") },
  { key: "memories", href: "/pets/active?view=memories", fa: "خاطرات", en: "Memories", de: "Erinnerungen", es: "Recuerdos", ar: "الذكريات", nl: "Herinneringen", icon: Images, mobile: false, match: petSection("memories", "life-timeline") },
];

export interface ExploreLink { href: string; icon: NavIcon; fa: [string, string]; en: [string, string]; de: [string, string]; es: [string, string]; ar: [string, string]; nl: [string, string] }
export interface ExploreGroup { key: string; fa: string; en: string; de: string; es: string; ar: string; nl: string; links: ExploreLink[] }

export const EXPLORE_GROUPS: ExploreGroup[] = [
  {
    key: "care", fa: "مراقبت", en: "Care", de: "Pflege", es: "Cuidados", ar: "الرعاية", nl: "Zorg",
    links: [
      { href: "/pets/active?view=health", icon: HeartPulse, fa: ["سلامت", "پرونده، واکسن‌ها و داروها"], en: ["Health", "Record, vaccines and medications"], de: ["Gesundheit", "Akte, Impfungen und Medikamente"], es: ["Salud", "Historial, vacunas y medicamentos"], ar: ["الصحة", "السجل واللقاحات والأدوية"], nl: ["Gezondheid", "Dossier, vaccinaties en medicatie"] },
      { href: "/vet/find", icon: Stethoscope, fa: ["دامپزشک", "کلینیک‌ها و دامپزشکان نزدیک"], en: ["Vets", "Clinics and vets nearby"], de: ["Tierärzte", "Kliniken und Tierärzte in der Nähe"], es: ["Veterinarios", "Clínicas y veterinarios cercanos"], ar: ["الأطباء البيطريون", "العيادات والأطباء البيطريون القريبون"], nl: ["Dierenartsen", "Klinieken en dierenartsen in de buurt"] },
      { href: "/services", icon: Scissors, fa: ["خدمات", "آرایش، آموزش، پیاده‌روی و نگهداری"], en: ["Services", "Grooming, training, walking, sitting"], de: ["Dienstleistungen", "Pflege, Training, Gassi gehen und Betreuung"], es: ["Servicios", "Peluquería, adiestramiento, paseo y cuidado"], ar: ["الخدمات", "التجميل والتدريب والتمشية والمجالسة"], nl: ["Diensten", "Vachtverzorging, training, uitlaten, oppassen"] },
      { href: "/care-calendar", icon: CalendarDays, fa: ["تقویم مراقبت", "یادآورها و نوبت‌ها در یک نگاه"], en: ["Care calendar", "Reminders and visits at a glance"], de: ["Pflegekalender", "Erinnerungen und Termine im Überblick"], es: ["Calendario de cuidados", "Recordatorios y citas de un vistazo"], ar: ["تقويم الرعاية", "التذكيرات والزيارات في لمحة"], nl: ["Zorgkalender", "Reminders en bezoeken in één oogopslag"] },
    ],
  },
  {
    key: "life", fa: "زندگی", en: "Life", de: "Leben", es: "Vida", ar: "الحياة", nl: "Leven",
    links: [
      { href: "/travel", icon: Plane, fa: ["سفر و اقامت", "اقامتگاه‌هایی که حیوان شما را می‌پذیرند"], en: ["Travel and stays", "Stays that welcome your pet"], de: ["Reisen und Unterkünfte", "Unterkünfte, die Haustiere willkommen heißen"], es: ["Viajes y alojamientos", "Alojamientos que reciben mascotas"], ar: ["السفر والإقامة", "أماكن إقامة ترحّب بحيوانك الأليف"], nl: ["Reizen en verblijven", "Verblijven waar je huisdier welkom is"] },
      { href: "/insurance", icon: ShieldPlus, fa: ["بیمه", "مقایسهٔ طرح‌ها و درخواست"], en: ["Insurance", "Compare plans and apply"], de: ["Versicherung", "Tarife vergleichen und Antrag stellen"], es: ["Seguro", "Compara planes y solicita"], ar: ["التأمين", "قارن الخطط وقدّم طلبًا"], nl: ["Verzekering", "Vergelijk polissen en vraag aan"] },
      { href: "/places", icon: MapPin, fa: ["مکان‌ها", "پارک، کافه و رستوران دوستدار حیوان"], en: ["Places", "Pet-friendly parks, cafés, restaurants"], de: ["Orte", "Haustierfreundliche Parks, Cafés und Restaurants"], es: ["Lugares", "Parques, cafés y restaurantes que admiten mascotas"], ar: ["الأماكن", "حدائق ومقاهٍ ومطاعم صديقة للحيوانات الأليفة"], nl: ["Plekken", "Huisdiervriendelijke parken, cafés, restaurants"] },
    ],
  },
  {
    key: "shop", fa: "خرید", en: "Shop", de: "Einkaufen", es: "Compras", ar: "المتجر", nl: "Winkel",
    links: [
      { href: "/shop", icon: ShoppingBag, fa: ["فروشگاه", "غذا و لوازم از فروشندگان معتبر"], en: ["Shop", "Food and supplies from trusted sellers"], de: ["Shop", "Futter und Zubehör von geprüften Verkäufern"], es: ["Tienda", "Alimentos y artículos de vendedores verificados"], ar: ["المتجر", "طعام ومستلزمات من بائعين موثوقين"], nl: ["Winkel", "Voer en benodigdheden van betrouwbare verkopers"] },
      { href: "/favorites", icon: Heart, fa: ["علاقه‌مندی‌ها", "آنچه نشان کرده‌اید"], en: ["Favorites", "What you saved"], de: ["Favoriten", "Deine gespeicherten Artikel"], es: ["Favoritos", "Lo que has guardado"], ar: ["المفضلة", "ما حفظته"], nl: ["Favorieten", "Wat je hebt bewaard"] },
      { href: "/repeat-delivery", icon: Repeat, fa: ["تحویل دوره‌ای", "غذا و لوازم مصرفی، بی‌دغدغه"], en: ["Repeat delivery", "Regular supplies without the hassle"], de: ["Regelmäßige Lieferung", "Verbrauchsartikel bequem nachbestellen"], es: ["Entrega recurrente", "Recibe tus artículos habituales sin complicaciones"], ar: ["التوصيل الدوري", "مستلزمات منتظمة دون عناء"], nl: ["Herhaalbezorging", "Vaste benodigdheden zonder gedoe"] },
      { href: "/orders", icon: PackageCheck, fa: ["سفارش‌ها", "پیگیری و تاریخچهٔ خرید"], en: ["Orders", "Tracking and purchase history"], de: ["Bestellungen", "Lieferung verfolgen und Käufe ansehen"], es: ["Pedidos", "Seguimiento e historial de compras"], ar: ["الطلبات", "التتبع وسجل المشتريات"], nl: ["Bestellingen", "Volgen en aankoopgeschiedenis"] },
    ],
  },
  {
    key: "community", fa: "جامعه و کمک", en: "Community and support", de: "Gemeinschaft und Hilfe", es: "Comunidad y ayuda", ar: "المجتمع والدعم", nl: "Community en ondersteuning",
    links: [
      { href: "/lost-pets", icon: Siren, fa: ["حیوانات گم‌شده", "گزارش‌های اطراف و ثبت مشاهده"], en: ["Lost pets", "Reports nearby and sightings"], de: ["Vermisste Tiere", "Meldungen aus der Nähe und Sichtungen"], es: ["Mascotas perdidas", "Avisos cercanos y avistamientos"], ar: ["الحيوانات الأليفة المفقودة", "بلاغات ومشاهدات قريبة"], nl: ["Vermiste huisdieren", "Meldingen en waarnemingen in de buurt"] },
      { href: "/animal-support/needs", icon: HandHeart, fa: ["حمایت از حیوانات", "نیازهای پناهگاه‌ها و افراد"], en: ["Animal support", "Needs from shelters and people"], de: ["Tierschutz", "Bedarf von Tierheimen und Helfenden"], es: ["Apoyo animal", "Necesidades de refugios y particulares"], ar: ["دعم الحيوانات", "احتياجات من الملاجئ والأفراد"], nl: ["Dierenhulp", "Behoeften van asielen en mensen"] },
      { href: "/animal-support", icon: House, fa: ["سازمان‌ها و پناهگاه‌ها", "سازمان‌های تأییدشده و کمپین‌ها"], en: ["Shelters and NGOs", "Verified organizations and campaigns"], de: ["Tierheime und Organisationen", "Geprüfte Organisationen und Kampagnen"], es: ["Refugios y organizaciones", "Organizaciones verificadas y campañas"], ar: ["الملاجئ والمنظمات غير الحكومية", "منظمات وحملات موثّقة"], nl: ["Asielen en ngo's", "Geverifieerde organisaties en campagnes"] },
      { href: "/community", icon: Users, fa: ["جامعه", "پرسش و تجربهٔ صاحبان حیوانات"], en: ["Community", "Questions and stories from owners"], de: ["Gemeinschaft", "Fragen und Erfahrungen von Tierhaltern"], es: ["Comunidad", "Preguntas y experiencias de otras personas"], ar: ["المجتمع", "أسئلة وقصص من المالكين"], nl: ["Community", "Vragen en verhalen van eigenaren"] },
    ],
  },
  {
    key: "stories", fa: "خاطره و مقاله", en: "Stories and articles", de: "Geschichten und Artikel", es: "Historias y artículos", ar: "القصص والمقالات", nl: "Verhalen en artikelen",
    links: [
      { href: "/pets/active?view=memories", icon: Images, fa: ["خاطرات", "لحظه‌ها و خط زمانی زندگی"], en: ["Memories", "Moments and the life timeline"], de: ["Erinnerungen", "Momente und die Lebensgeschichte"], es: ["Recuerdos", "Momentos y la historia de vida"], ar: ["الذكريات", "اللحظات والخط الزمني للحياة"], nl: ["Herinneringen", "Momenten en de tijdlijn van het leven"] },
      { href: "/guides", icon: BookOpen, fa: ["راهنماها", "راهنمای عملی مراقبت از سگ و گربه"], en: ["Guides", "Practical dog and cat care"], de: ["Ratgeber", "Praktische Pflegehinweise für Hunde und Katzen"], es: ["Guías", "Consejos prácticos para cuidar perros y gatos"], ar: ["الأدلة", "رعاية عملية للكلاب والقطط"], nl: ["Gidsen", "Praktische zorg voor honden en katten"] },
      { href: "/blog", icon: Newspaper, fa: ["وبلاگ", "مقاله‌ها و تجربه‌ها"], en: ["Blog", "Articles and stories"], de: ["Blog", "Artikel und Erfahrungsberichte"], es: ["Blog", "Artículos y experiencias"], ar: ["المدونة", "مقالات وقصص"], nl: ["Blog", "Artikelen en verhalen"] },
    ],
  },
];

/** Locale-less path ("/pets/x/health") → the primary destination it belongs to, or null (e.g. Account). */
export function currentDestination(path: string): PrimaryDestination["key"] | null {
  return PRIMARY_DESTINATIONS.find((d) => d.match(path))?.key ?? null;
}

/**
 * The phone/tablet bottom bar (below 1024px): the app's five tabs. Explore moves to the header's compass button there,
 * and Health lives inside My pets. Labels are short enough for a fifth of a 360px screen in every language.
 */
export interface MobileTab {
  key: "home" | "pets" | "services" | "shop" | "profile";
  href: string;
  fa: string;
  en: string;
  de: string;
  es: string;
  icon: NavIcon;
  match: (path: string) => boolean;
}

export const MOBILE_TABS: MobileTab[] = [
  { key: "home", href: "/home", fa: "خانه", en: "Home", de: "Start", es: "Inicio", icon: House, match: (p) => p === "/home" },
  { key: "pets", href: "/pets", fa: "حیوان‌های من", en: "My pets", de: "Meine Tiere", es: "Mis mascotas", icon: PawPrint, match: (p) => starts("/pets", "/vet", "/care-calendar")(p) },
  { key: "services", href: "/services", fa: "خدمات", en: "Services", de: "Dienste", es: "Servicios", icon: Scissors, match: starts("/services", "/bookings", "/providers") },
  { key: "shop", href: "/shop", fa: "فروشگاه", en: "Shop", de: "Shop", es: "Tienda", icon: ShoppingBag, match: starts("/shop", "/cart", "/checkout", "/orders", "/repeat-delivery", "/favorites") },
  { key: "profile", href: "/profile", fa: "پروفایل", en: "Profile", de: "Profil", es: "Perfil", icon: UserRound, match: starts("/profile", "/notifications") },
];

export function currentMobileTab(path: string): MobileTab["key"] | null {
  return MOBILE_TABS.find((tab) => tab.match(path))?.key ?? null;
}

/** Tab roots (and Explore) need no back button: the bottom bar is the way out. */
export function isMobileTabRoot(path: string): boolean {
  const bare = path.split("?")[0]!.replace(/\/$/, "") || "/";
  return bare === "/" || bare === "/explore" || MOBILE_TABS.some((tab) => tab.href === bare);
}
