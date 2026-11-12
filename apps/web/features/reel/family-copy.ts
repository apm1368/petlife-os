import type { RouteLocale } from "@/lib/i18n/config";

/** Section reels (docs/design/pattern-2026-11/pages.md): one reel per page family, on public and member pages. */
export type Family = "care" | "services" | "shop" | "travel" | "safe" | "together" | "learn";

/**
 * Member pages join the family of what they do; personal records and the dashboard have their own "care" reel.
 * Flows that must stay quiet get none: checkout, onboarding, invitations, and the NGO and insurer workspaces.
 */
export function familyForPath(pathname: string): Family | null {
  const path = pathname.replace(/^\/(fa|en|de|es)(?=\/|$)/, "");
  if (/^\/(home|pets|care-calendar|notifications|profile|subscription|ai)(\/|$)/.test(path)) return "care";
  if (/^\/(services|vet|providers|places|bookings|explore)(\/|$)/.test(path)) return "services";
  if (/^\/(shop|cart|orders|repeat-delivery|favorites)(\/|$)/.test(path)) return "shop";
  if (/^\/travel(\/|$)/.test(path)) return "travel";
  if (/^\/(insurance|lost-pets)(\/|$)/.test(path)) return "safe";
  if (/^\/(community|animal-support|donations)(\/|$)/.test(path)) return "together";
  if (/^\/(blog|guides|help|contact|status|legal|credits|support)(\/|$)/.test(path)) return "learn";
  return null;
}

type Scene = { k: string; s: string };
type FamilyText = { eyebrow: string; title: string; lede: string; cta: string; a: Scene; b: Scene; labels: Record<string, string> };
type FamilyCopy = Record<Family, FamilyText>;

const fa: FamilyCopy = {
  care: { eyebrow: "پروندهٔ همراهت در یک نگاه", title: "همهٔ مراقبت‌ها، یک‌جا", lede: "سلامت، یادآورها و کارهای روزانهٔ همراهت را با خانواده‌ات یک‌جا نگه دار.", cta: "دیدن پرونده",
    a: { k: "کارهای امروز", s: "غذا، پیاده‌روی و دارو؛ هر کار که انجام شد، تیک می‌خورد." }, b: { k: "با خانواده", s: "اعضای خانواده یک پرونده را می‌بینند و کارها را بین خودشان تقسیم می‌کنند." },
    labels: { today: "امروز", feed: "غذا", walk: "پیاده‌روی", meds: "دارو", family: "خانواده", shared: "پروندهٔ مشترک", done: "انجام شد" } },
  services: { eyebrow: "خدمات و دامپزشکی در یک نگاه", title: "از جست‌وجو تا نوبت، در ۲۰ ثانیه", lede: "ببین پیدا کردن ارائه‌دهنده و رزرو نوبت در اپت لایف چطور کار می‌کند.", cta: "رزرو نوبت",
    a: { k: "جست‌وجو", s: "خدمت و محدوده را انتخاب کن، ارائه‌دهنده‌ها را ببین." }, b: { k: "رزرو", s: "روز و ساعت را انتخاب کن و نوبتت ثبت می‌شود." },
    labels: { search: "آرایش، دامپزشکی، اقامت…", vet: "دامپزشکی", grooming: "آرایش", boarding: "اقامت", verified: "تأییدشده", provider: "ارائه‌دهنده", month: "تقویم نوبت", confirm: "ثبت نوبت" } },
  shop: { eyebrow: "پت‌شاپ در یک نگاه", title: "خرید روزانه، بی‌دردسر", lede: "از انتخاب محصول تا رسیدن سفارش و ارسال دوره‌ای.", cta: "دیدن محصولات",
    a: { k: "محصولات", s: "غذا، لوازم و اسباب‌بازی را کنار هم ببین." }, b: { k: "ارسال", s: "سفارشت را تا در خانه دنبال کن." },
    labels: { food: "غذا", bowl: "ظرف", toy: "اسباب‌بازی", care: "مراقبتی", cart: "سبد خرید", onTheWay: "در راه", delivered: "تحویل شد" } },
  travel: { eyebrow: "سفر در یک نگاه", title: "هم‌سفر همیشگی", lede: "اقامتگاه‌های پذیرای حیوان را پیدا و مقایسه کن و مدارک سفر را همراه داشته باش.", cta: "جست‌وجوی اقامتگاه",
    a: { k: "مقایسه", s: "اقامتگاه‌ها را کنار هم مقایسه کن." }, b: { k: "گذرنامه", s: "مدارک سفر همراهت، در پرونده‌اش." },
    labels: { stayA: "اقامتگاه کوهستان", stayB: "اقامتگاه ساحل", dogs: "پذیرای سگ", cats: "پذیرای گربه", yard: "حیاط", passport: "گذرنامهٔ سفر", vaccine: "واکسن", microchip: "میکروچیپ" } },
  safe: { eyebrow: "آرامش خاطر در یک نگاه", title: "برای روزهای سخت آماده باش", lede: "طرح‌های بیمه را مقایسه کن و اگر همراهت گم شد، آگهی‌اش را سریع منتشر کن.", cta: "مقایسهٔ بیمه‌ها",
    a: { k: "طرح‌ها", s: "طرح‌های بیمه را کنار هم ببین." }, b: { k: "آگهی گمشده", s: "آگهی را بساز و با همه به اشتراک بگذار." },
    labels: { basic: "پایه", plus: "کامل", accident: "حادثه", lost: "گمشده", share: "اشتراک", seen: "دیده شد؟" } },
  together: { eyebrow: "جامعه و حمایت در یک نگاه", title: "مهربانی، بیرون از خانه هم ادامه دارد", lede: "گفت‌وگو با صاحبان دیگر، کمک به مراکز حمایتی و نگه‌داشتن خاطره‌ها.", cta: "پیوستن به جامعه",
    a: { k: "نیازها", s: "نیازهای ثبت‌شدهٔ مراکز را ببین و کمک کن." }, b: { k: "خاطره‌ها", s: "لحظه‌های مشترک، در یک آلبوم." },
    labels: { food: "غذا", medicine: "دارو", shelter: "سرپناه", album: "خاطره‌ها" } },
  learn: { eyebrow: "راهنما و پشتیبانی در یک نگاه", title: "هر پرسشی، یک پاسخ روشن", lede: "مقاله‌های تأییدشده، پرسش‌های پرتکرار و پشتیبانی، کنار هم.", cta: "دیدن راهنماها",
    a: { k: "مقاله‌ها", s: "راهنمای مراقبت را بخوان و ذخیره کن." }, b: { k: "پشتیبانی", s: "پرسشت را بفرست و پاسخ را دنبال کن." },
    labels: { guide: "راهنما", journal: "مجله", faq: "پرسش‌های پرتکرار", ticket: "درخواست پشتیبانی", answered: "پاسخ داده شد" } },
};

const en: FamilyCopy = {
  care: { eyebrow: "Your companion's record at a glance", title: "All of their care, in one place", lede: "Keep health, reminders and daily tasks together, and share them with your family.", cta: "Open the record",
    a: { k: "Today", s: "Food, walk and medicine; each task gets a tick when it is done." }, b: { k: "With family", s: "Everyone at home sees the same record and shares the tasks." },
    labels: { today: "Today", feed: "Food", walk: "Walk", meds: "Medicine", family: "Family", shared: "Shared record", done: "Done" } },
  services: { eyebrow: "Services and vets at a glance", title: "From search to booking in 20 seconds", lede: "See how finding a provider and booking an appointment works on opetlife.", cta: "Book an appointment",
    a: { k: "Search", s: "Pick a service and area, then see the providers." }, b: { k: "Booking", s: "Choose a day and time and your booking is in." },
    labels: { search: "Grooming, vets, boarding…", vet: "Vet", grooming: "Grooming", boarding: "Boarding", verified: "Verified", provider: "Provider", month: "Booking calendar", confirm: "Book" } },
  shop: { eyebrow: "The pet shop at a glance", title: "Everyday shopping, made easy", lede: "From choosing products to delivery and repeat orders.", cta: "See products",
    a: { k: "Products", s: "See food, supplies and toys side by side." }, b: { k: "Delivery", s: "Follow your order to your door." },
    labels: { food: "Food", bowl: "Bowl", toy: "Toy", care: "Care", cart: "Cart", onTheWay: "On the way", delivered: "Delivered" } },
  travel: { eyebrow: "Travel at a glance", title: "Your favourite travel companion", lede: "Find and compare pet-friendly stays and keep travel documents at hand.", cta: "Find a stay",
    a: { k: "Compare", s: "Compare stays side by side." }, b: { k: "Passport", s: "Travel documents, kept in their record." },
    labels: { stayA: "Mountain stay", stayB: "Seaside stay", dogs: "Dogs welcome", cats: "Cats welcome", yard: "Garden", passport: "Travel passport", vaccine: "Vaccine", microchip: "Microchip" } },
  safe: { eyebrow: "Peace of mind at a glance", title: "Ready for hard days", lede: "Compare insurance plans and, if your companion goes missing, publish a listing fast.", cta: "Compare insurance",
    a: { k: "Plans", s: "See insurance plans side by side." }, b: { k: "Lost listing", s: "Create a listing and share it with everyone." },
    labels: { basic: "Basic", plus: "Complete", accident: "Accident", lost: "Missing", share: "Share", seen: "Seen them?" } },
  together: { eyebrow: "Community and support at a glance", title: "Kindness goes beyond our homes", lede: "Talk with other owners, help support centres and keep your memories.", cta: "Join the community",
    a: { k: "Needs", s: "See the registered needs of centres and help." }, b: { k: "Memories", s: "Shared moments, in one album." },
    labels: { food: "Food", medicine: "Medicine", shelter: "Shelter", album: "Memories" } },
  learn: { eyebrow: "Guides and support at a glance", title: "Every question, a clear answer", lede: "Reviewed articles, frequent questions and support, side by side.", cta: "See guides",
    a: { k: "Articles", s: "Read and save care guides." }, b: { k: "Support", s: "Send your question and follow the answer." },
    labels: { guide: "Guide", journal: "Journal", faq: "FAQ", ticket: "Support request", answered: "Answered" } },
};

const de: FamilyCopy = {
  care: { eyebrow: "Die Akte deines Tieres auf einen Blick", title: "Die ganze Pflege an einem Ort", lede: "Gesundheit, Erinnerungen und tägliche Aufgaben zusammen, geteilt mit deiner Familie.", cta: "Akte öffnen",
    a: { k: "Heute", s: "Futter, Spaziergang und Medikament; jede erledigte Aufgabe wird abgehakt." }, b: { k: "Mit der Familie", s: "Alle zu Hause sehen dieselbe Akte und teilen sich die Aufgaben." },
    labels: { today: "Heute", feed: "Futter", walk: "Spaziergang", meds: "Medikament", family: "Familie", shared: "Geteilte Akte", done: "Erledigt" } },
  services: { eyebrow: "Angebote und Tierärzte auf einen Blick", title: "Von der Suche zum Termin in 20 Sekunden", lede: "So funktioniert die Suche nach Anbietern und die Terminbuchung bei opetlife.", cta: "Termin buchen",
    a: { k: "Suche", s: "Angebot und Gegend wählen, Anbieter ansehen." }, b: { k: "Buchung", s: "Tag und Uhrzeit wählen, schon ist der Termin da." },
    labels: { search: "Pflege, Tierarzt, Betreuung…", vet: "Tierarzt", grooming: "Pflege", boarding: "Betreuung", verified: "Geprüft", provider: "Anbieter", month: "Terminkalender", confirm: "Buchen" } },
  shop: { eyebrow: "Der Tiershop auf einen Blick", title: "Alltagseinkauf ganz einfach", lede: "Vom Produkt bis zur Lieferung und wiederkehrenden Bestellung.", cta: "Produkte ansehen",
    a: { k: "Produkte", s: "Futter, Zubehör und Spielzeug nebeneinander." }, b: { k: "Lieferung", s: "Verfolge deine Bestellung bis zur Tür." },
    labels: { food: "Futter", bowl: "Napf", toy: "Spielzeug", care: "Pflege", cart: "Warenkorb", onTheWay: "Unterwegs", delivered: "Zugestellt" } },
  travel: { eyebrow: "Reisen auf einen Blick", title: "Dein liebster Reisebegleiter", lede: "Tierfreundliche Unterkünfte finden und vergleichen, Reisedokumente immer dabei.", cta: "Unterkunft suchen",
    a: { k: "Vergleich", s: "Unterkünfte nebeneinander vergleichen." }, b: { k: "Reisepass", s: "Reisedokumente im Profil deines Tieres." },
    labels: { stayA: "Berghütte", stayB: "Am Meer", dogs: "Hunde willkommen", cats: "Katzen willkommen", yard: "Garten", passport: "Reisepass", vaccine: "Impfung", microchip: "Mikrochip" } },
  safe: { eyebrow: "Sicherheit auf einen Blick", title: "Bereit für schwere Tage", lede: "Versicherungen vergleichen und eine Vermisstenmeldung schnell veröffentlichen.", cta: "Versicherungen vergleichen",
    a: { k: "Tarife", s: "Versicherungstarife nebeneinander sehen." }, b: { k: "Vermisst", s: "Meldung erstellen und mit allen teilen." },
    labels: { basic: "Basis", plus: "Komplett", accident: "Unfall", lost: "Vermisst", share: "Teilen", seen: "Gesehen?" } },
  together: { eyebrow: "Gemeinschaft und Hilfe auf einen Blick", title: "Freundlichkeit reicht über das eigene Zuhause hinaus", lede: "Mit anderen Haltern sprechen, Hilfszentren unterstützen und Erinnerungen bewahren.", cta: "Der Gemeinschaft beitreten",
    a: { k: "Bedarf", s: "Gemeldeten Bedarf der Zentren sehen und helfen." }, b: { k: "Erinnerungen", s: "Gemeinsame Momente in einem Album." },
    labels: { food: "Futter", medicine: "Medizin", shelter: "Unterkunft", album: "Erinnerungen" } },
  learn: { eyebrow: "Ratgeber und Hilfe auf einen Blick", title: "Jede Frage, eine klare Antwort", lede: "Geprüfte Artikel, häufige Fragen und Hilfe an einem Ort.", cta: "Ratgeber ansehen",
    a: { k: "Artikel", s: "Pflegeratgeber lesen und speichern." }, b: { k: "Hilfe", s: "Frage senden und Antwort verfolgen." },
    labels: { guide: "Ratgeber", journal: "Magazin", faq: "Häufige Fragen", ticket: "Hilfeanfrage", answered: "Beantwortet" } },
};

const es: FamilyCopy = {
  care: { eyebrow: "La ficha de tu compañero de un vistazo", title: "Todos sus cuidados, en un solo lugar", lede: "Salud, recordatorios y tareas diarias juntos, y compartidos con tu familia.", cta: "Abrir la ficha",
    a: { k: "Hoy", s: "Comida, paseo y medicina; cada tarea se marca cuando está hecha." }, b: { k: "En familia", s: "Todos en casa ven la misma ficha y se reparten las tareas." },
    labels: { today: "Hoy", feed: "Comida", walk: "Paseo", meds: "Medicina", family: "Familia", shared: "Ficha compartida", done: "Hecho" } },
  services: { eyebrow: "Servicios y veterinarios de un vistazo", title: "De la búsqueda a la cita en 20 segundos", lede: "Así funciona buscar un proveedor y reservar una cita en opetlife.", cta: "Reservar cita",
    a: { k: "Búsqueda", s: "Elige servicio y zona y mira los proveedores." }, b: { k: "Reserva", s: "Elige día y hora y tu cita queda registrada." },
    labels: { search: "Peluquería, veterinario, alojamiento…", vet: "Veterinario", grooming: "Peluquería", boarding: "Alojamiento", verified: "Verificado", provider: "Proveedor", month: "Calendario de citas", confirm: "Reservar" } },
  shop: { eyebrow: "La tienda de un vistazo", title: "Compras del día a día, sin complicaciones", lede: "De elegir productos a la entrega y los pedidos periódicos.", cta: "Ver productos",
    a: { k: "Productos", s: "Comida, accesorios y juguetes lado a lado." }, b: { k: "Entrega", s: "Sigue tu pedido hasta la puerta." },
    labels: { food: "Comida", bowl: "Cuenco", toy: "Juguete", care: "Cuidado", cart: "Carrito", onTheWay: "En camino", delivered: "Entregado" } },
  travel: { eyebrow: "Viajes de un vistazo", title: "Tu compañero de viaje favorito", lede: "Encuentra y compara alojamientos que admiten mascotas y lleva sus documentos contigo.", cta: "Buscar alojamiento",
    a: { k: "Comparar", s: "Compara alojamientos lado a lado." }, b: { k: "Pasaporte", s: "Documentos de viaje, guardados en su ficha." },
    labels: { stayA: "Casa de montaña", stayB: "Casa de playa", dogs: "Admite perros", cats: "Admite gatos", yard: "Jardín", passport: "Pasaporte de viaje", vaccine: "Vacuna", microchip: "Microchip" } },
  safe: { eyebrow: "Tranquilidad de un vistazo", title: "Preparados para los días difíciles", lede: "Compara seguros y, si tu compañero se pierde, publica un aviso enseguida.", cta: "Comparar seguros",
    a: { k: "Planes", s: "Mira los planes de seguro lado a lado." }, b: { k: "Aviso", s: "Crea un aviso y compártelo con todos." },
    labels: { basic: "Básico", plus: "Completo", accident: "Accidentes", lost: "Perdido", share: "Compartir", seen: "¿Lo has visto?" } },
  together: { eyebrow: "Comunidad y ayuda de un vistazo", title: "La amabilidad va más allá de casa", lede: "Habla con otros dueños, ayuda a los centros y guarda tus recuerdos.", cta: "Unirse a la comunidad",
    a: { k: "Necesidades", s: "Mira las necesidades de los centros y ayuda." }, b: { k: "Recuerdos", s: "Momentos compartidos, en un álbum." },
    labels: { food: "Comida", medicine: "Medicinas", shelter: "Refugio", album: "Recuerdos" } },
  learn: { eyebrow: "Guías y ayuda de un vistazo", title: "Cada pregunta, una respuesta clara", lede: "Artículos revisados, preguntas frecuentes y ayuda en un solo lugar.", cta: "Ver guías",
    a: { k: "Artículos", s: "Lee y guarda guías de cuidado." }, b: { k: "Ayuda", s: "Envía tu pregunta y sigue la respuesta." },
    labels: { guide: "Guía", journal: "Revista", faq: "Preguntas frecuentes", ticket: "Solicitud de ayuda", answered: "Respondida" } },
};

export const familyCopy: Record<RouteLocale, FamilyCopy> = { fa, en, de, es };
