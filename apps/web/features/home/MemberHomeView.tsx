"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import type { OrderSummaryDto, PetOverviewDto, SubscriptionDto, TravelBookingDto } from "@petlife/types";
import { Avatar, CalendarDays, ChevronLeft, ChevronRight, HeartPulse, Images, MapPin, PackageCheck, Plane, Plus, Scissors, ShoppingBag, Skeleton, Sparkles, StatusLabel, Stethoscope, Users } from "@petlife/ui";
import { petsService } from "@/services/pets.service";
import { bookingsService } from "@/services/bookings.service";
import { careRemindersService } from "@/services/care-reminders.service";
import { careTitle } from "@/features/care/care-labels";
import { GlassMemberHome } from "./GlassMemberHome";
import { commerceService } from "@/services/commerce.service";
import { travelMarketService } from "@/services/travel-marketplace.service";
import { subscriptionService } from "@/services/subscription.service";
import { usePetStore } from "@/stores/pet-store";
import { statusLabel } from "@/lib/status/status-labels";
import { formatCurrency } from "@/lib/currency/format-currency";
import { formatDay } from "@/lib/date/jalali";
import { usePetAccess } from "@/hooks/use-pet-access";
import { useActivePet } from "@/hooks/use-active-pet";
import { useSessionStore } from "@/stores/session-store";
import { LoadFailure } from "@/features/system/LoadFailure";
import { formatAppointmentDateTime } from "@/lib/date/appointment-date";
import type { RouteLocale } from "@/lib/i18n/config";

import { eventTitle, eventSourceLabel, formatOverviewDate, mergeCareIntoOverview } from "@/features/pets/overview-labels";
import "./member-home.css";
import { LocationNudge } from "@/features/maps/LocationNudge";

type Booking = Awaited<ReturnType<typeof bookingsService.list>>[number];

export const dashboardCopy = {
  fa: {
    dashboard: "داشبورد",
    startHere: "از اینجا شروع کنید",
    firstStep: "اولین قدم، آشنایی با حیوان شماست.",
    healthIntro: "پرونده، سوابق و مدارک سلامت در کنار هم.",
    careIntro: "نوبت‌ها و مراقبت‌های پیش‌رو، در زمان مناسب.",
    memoriesIntro: "جایی برای لحظه‌هایی که می‌خواهید نگه دارید.",
    account: "حساب شما",
    accountIntro: "اطلاعات شخصی و خانواده را از همین‌جا مدیریت کنید.",
    personal: "اطلاعات شخصی",
    household: "خانواده و دسترسی‌ها",
    recentActivity: "تازه‌های پرونده",
    noActivity: "با ثبت مراقبت، مراجعه یا خاطره، تاریخچهٔ حیوانتان اینجا شکل می‌گیرد.",
    hello: (name: string) => `سلام، ${name}`,
    todayIs: "امروز",
    addPet: "افزودن حیوان",
    profile: "پروفایل کامل",
    attention: "نیازمند توجه",
    noAttention: "بر اساس آنچه ثبت شده، کار فوری‌ای در انتظار نیست.",
    noAttentionHint: "این به معنی کامل بودن پرونده نیست؛ هرچه بیشتر ثبت کنید، یادآوری‌ها دقیق‌تر می‌شوند.",
    next: "نوبت بعدی",
    noNext: "نوبتی در پیش ندارید.",
    findVet: "یافتن دامپزشک",
    findService: "خدمات",
    details: "جزئیات نوبت",
    upcoming: "پیش‌رو",
    noUpcoming: "یادآور یا رویداد زمان‌داری ثبت نشده است.",
    calendar: "تقویم مراقبت",
    shortcuts: "میان‌برها",
    health: "پرونده سلامت",
    care: "مراقبت‌ها",
    memories: "خاطرات",
    shop: "فروشگاه",
    welcomeTitle: "به اپت لایف خوش آمدید",
    welcomeBody: "با افزودن اولین حیوان، سلامت، مراقبت و خاطراتش را یک‌جا دنبال کنید.",
    welcomeCta: "افزودن اولین حیوان",
    unknownAge: "سن نامشخص",
    switchPet: "انتخاب حیوان",
    sections: "بخش‌های پروفایل",
    lastHealth: "آخرین ثبت سلامت",
    documents: "اسناد",
    travel: "سفر",
    weight: "وزن",
    microchip: "میکروچیپ",
    registered: "ثبت شده",
    notRecorded: "ثبت نشده",
    recentHealth: "سوابق اخیر سلامت",
    noRecentHealth: "هنوز سابقه‌ای ثبت نشده است.",
    allHealth: "همهٔ پرونده",
    membership: "اشتراک",
    noMembership: "اشتراکی فعال نیست. مزایا و پلن‌ها را ببینید.",
    seePlans: "مشاهدهٔ پلن‌ها",
    manage: "مدیریت",
    trialUntil: "دورهٔ آزمایشی تا",
    renewsOn: "تمدید در",
    orders: "سفارش‌ها",
    noOrders: "هنوز سفارشی ثبت نکرده‌اید.",
    allOrders: "همهٔ سفارش‌ها",
    trips: "سفرهای پیش‌رو",
    noTrips: "رزرو اقامتی در پیش ندارید.",
    findStay: "یافتن اقامتگاه",
    explore: "برای حیوانتان",
    services: "خدمات",
    vets: "دامپزشک",
    shopLink: "فروشگاه",
    stays: "سفر و اقامت",
    community: "جامعه",
    unavailable: "این بخش الان بارگیری نشد.",
    retry: "تلاش دوباره",
    loadingDashboard: "در حال بارگذاری داشبورد",
    loadingMembership: "در حال بارگذاری اشتراک",
    loadingOrders: "در حال بارگذاری سفارش‌ها",
    loadingTrips: "در حال بارگذاری سفرها",
    planNameInEnglish: "نام طرح به انگلیسی",
  },
  en: {
    dashboard: "Dashboard",
    startHere: "Start here",
    firstStep: "First, let's get to know your pet.",
    healthIntro: "Health records, history and documents, together.",
    careIntro: "Appointments and upcoming care, at the right time.",
    memoriesIntro: "A place for the moments you want to keep.",
    account: "Your account",
    accountIntro: "Manage your personal details and household from here.",
    personal: "Personal details",
    household: "Household and access",
    recentActivity: "Latest in their record",
    noActivity: "Care, visits and memories will build your pet's history here.",
    hello: (name: string) => `Hello, ${name}`,
    todayIs: "Today",
    addPet: "Add a pet",
    profile: "Full profile",
    attention: "Needs attention",
    noAttention: "Based on what's recorded, nothing urgent is waiting.",
    noAttentionHint: "That doesn't mean the record is complete — the more you add, the better the reminders.",
    next: "Next appointment",
    noNext: "You have no upcoming appointment.",
    findVet: "Find a vet",
    findService: "Services",
    details: "Appointment details",
    upcoming: "Coming up",
    noUpcoming: "No dated reminder or event is recorded.",
    calendar: "Care calendar",
    shortcuts: "Shortcuts",
    health: "Health record",
    care: "Care",
    memories: "Memories",
    shop: "Shop",
    welcomeTitle: "Welcome to opetlife",
    welcomeBody: "Add your first pet to keep their health, care and memories in one place.",
    welcomeCta: "Add your first pet",
    unknownAge: "Age unknown",
    switchPet: "Choose a pet",
    sections: "Profile sections",
    lastHealth: "Last health entry",
    documents: "Documents",
    travel: "Travel",
    weight: "Weight",
    microchip: "Microchip",
    registered: "Registered",
    notRecorded: "Not recorded",
    recentHealth: "Recent health",
    noRecentHealth: "Nothing recorded yet.",
    allHealth: "Full record",
    membership: "Membership",
    noMembership: "No active membership. See the plans and what they include.",
    seePlans: "See plans",
    manage: "Manage",
    trialUntil: "Trial until",
    renewsOn: "Renews on",
    orders: "Orders",
    noOrders: "You haven't ordered anything yet.",
    allOrders: "All orders",
    trips: "Upcoming stays",
    noTrips: "No upcoming stay booked.",
    findStay: "Find a stay",
    explore: "For your pet",
    services: "Services",
    vets: "Vets",
    shopLink: "Shop",
    stays: "Travel and stays",
    community: "Community",
    unavailable: "This section could not load right now.",
    retry: "Retry",
    loadingDashboard: "Loading dashboard",
    loadingMembership: "Loading membership",
    loadingOrders: "Loading orders",
    loadingTrips: "Loading upcoming stays",
    planNameInEnglish: "Plan name in English",
  },
  de: {
    dashboard: "Übersicht", startHere: "Hier starten", firstStep: "Lernen Sie zuerst Ihr Tier kennen.",
    healthIntro: "Gesundheitsakte, Verlauf und Dokumente an einem Ort.", careIntro: "Termine und anstehende Pflege zur richtigen Zeit.",
    memoriesIntro: "Ein Ort für die Momente, die Sie festhalten möchten.", account: "Ihr Konto", accountIntro: "Verwalten Sie hier Ihre persönlichen Daten und Ihren Haushalt.",
    personal: "Persönliche Daten", household: "Haushalt und Zugriffsrechte", recentActivity: "Neues in der Akte",
    noActivity: "Mit Pflegeeinträgen, Besuchen und Erinnerungen entsteht hier der Verlauf Ihres Tieres.", hello: (name: string) => `Hallo, ${name}`,
    todayIs: "Heute", addPet: "Tier hinzufügen", profile: "Vollständiges Profil", attention: "Benötigt Aufmerksamkeit",
    noAttention: "Laut den bisherigen Einträgen steht nichts Dringendes an.", noAttentionHint: "Das bedeutet nicht, dass die Akte vollständig ist. Mehr Angaben machen Erinnerungen genauer.",
    next: "Nächster Termin", noNext: "Sie haben keinen anstehenden Termin.", findVet: "Tierarzt finden", findService: "Services", details: "Termindetails",
    upcoming: "Demnächst", noUpcoming: "Es sind keine terminierten Erinnerungen oder Ereignisse eingetragen.", calendar: "Pflegekalender", shortcuts: "Direktzugriffe",
    health: "Gesundheitsakte", care: "Pflege", memories: "Erinnerungen", shop: "Shop", welcomeTitle: "Willkommen bei opetlife",
    welcomeBody: "Fügen Sie Ihr erstes Tier hinzu, um Gesundheit, Pflege und Erinnerungen an einem Ort zu verwalten.", welcomeCta: "Erstes Tier hinzufügen",
    unknownAge: "Alter unbekannt", switchPet: "Tier auswählen", sections: "Profilbereiche", lastHealth: "Letzter Gesundheitseintrag",
    documents: "Dokumente", travel: "Reisen", weight: "Gewicht", microchip: "Mikrochip", registered: "Erfasst", notRecorded: "Nicht erfasst",
    recentHealth: "Letzte Gesundheitseinträge", noRecentHealth: "Bisher wurden keine Einträge erfasst.", allHealth: "Gesamte Akte", membership: "Mitgliedschaft",
    noMembership: "Keine aktive Mitgliedschaft. Entdecken Sie die verfügbaren Tarife und Leistungen.", seePlans: "Tarife ansehen", manage: "Verwalten",
    trialUntil: "Testphase bis", renewsOn: "Verlängerung am", orders: "Bestellungen", noOrders: "Sie haben noch nichts bestellt.", allOrders: "Alle Bestellungen",
    trips: "Bevorstehende Aufenthalte", noTrips: "Sie haben keinen bevorstehenden Aufenthalt gebucht.", findStay: "Unterkunft finden", explore: "Für Ihr Tier",
    services: "Services", vets: "Tierärzte", shopLink: "Shop", stays: "Reisen und Unterkünfte", community: "Community",
    unavailable: "Dieser Bereich konnte gerade nicht geladen werden.", retry: "Erneut versuchen",
    loadingDashboard: "Übersicht wird geladen",
    loadingMembership: "Mitgliedschaft wird geladen",
    loadingOrders: "Bestellungen werden geladen",
    loadingTrips: "Bevorstehende Aufenthalte werden geladen",
    planNameInEnglish: "Tarifname auf Englisch",
  },
  es: {
    dashboard: "Panel", startHere: "Empieza aquí", firstStep: "Primero, conozcamos a tu mascota.",
    healthIntro: "Historial, visitas y documentos de salud en un solo lugar.", careIntro: "Citas y próximos cuidados en el momento adecuado.",
    memoriesIntro: "Un lugar para guardar los momentos que quieres conservar.", account: "Tu cuenta", accountIntro: "Administra aquí tus datos personales y tu hogar.",
    personal: "Datos personales", household: "Hogar y permisos", recentActivity: "Novedades del historial",
    noActivity: "Los cuidados, las visitas y los recuerdos crearán aquí el historial de tu mascota.", hello: (name: string) => `Hola, ${name}`,
    todayIs: "Hoy", addPet: "Añadir mascota", profile: "Perfil completo", attention: "Requiere atención",
    noAttention: "Según lo registrado, no hay nada urgente pendiente.", noAttentionHint: "Esto no significa que el historial esté completo; cuanto más registres, mejores serán los recordatorios.",
    next: "Próxima cita", noNext: "No tienes citas próximas.", findVet: "Buscar veterinario", findService: "Servicios", details: "Detalles de la cita",
    upcoming: "Próximamente", noUpcoming: "No hay recordatorios ni eventos con fecha registrados.", calendar: "Calendario de cuidados", shortcuts: "Accesos directos",
    health: "Historial de salud", care: "Cuidados", memories: "Recuerdos", shop: "Tienda", welcomeTitle: "Te damos la bienvenida a opetlife",
    welcomeBody: "Añade tu primera mascota para tener su salud, cuidados y recuerdos en un solo lugar.", welcomeCta: "Añadir mi primera mascota",
    unknownAge: "Edad desconocida", switchPet: "Elegir mascota", sections: "Secciones del perfil", lastHealth: "Último registro de salud",
    documents: "Documentos", travel: "Viajes", weight: "Peso", microchip: "Microchip", registered: "Registrado", notRecorded: "Sin registrar",
    recentHealth: "Registros de salud recientes", noRecentHealth: "Aún no hay registros.", allHealth: "Historial completo", membership: "Suscripción",
    noMembership: "No tienes una suscripción activa. Consulta los planes y sus ventajas.", seePlans: "Ver planes", manage: "Administrar",
    trialUntil: "Prueba hasta", renewsOn: "Se renueva el", orders: "Pedidos", noOrders: "Aún no has realizado ningún pedido.", allOrders: "Todos los pedidos",
    trips: "Próximas estancias", noTrips: "No tienes ninguna estancia reservada próximamente.", findStay: "Buscar alojamiento", explore: "Para tu mascota",
    services: "Servicios", vets: "Veterinarios", shopLink: "Tienda", stays: "Viajes y alojamientos", community: "Comunidad",
    unavailable: "No se pudo cargar esta sección en este momento.", retry: "Reintentar",
    loadingDashboard: "Cargando el panel",
    loadingMembership: "Cargando la suscripción",
    loadingOrders: "Cargando pedidos",
    loadingTrips: "Cargando próximas estancias",
    planNameInEnglish: "Nombre del plan en inglés",
  },
  ar: {
    dashboard: "لوحة التحكم", startHere: "ابدأ من هنا", firstStep: "أولًا، لنتعرّف على حيوانك الأليف.",
    healthIntro: "السجلات الصحية والتاريخ والمستندات في مكان واحد.", careIntro: "المواعيد والرعاية القادمة في الوقت المناسب.",
    memoriesIntro: "مكان للذكريات التي تريد الاحتفاظ بها.", account: "حسابك", accountIntro: "أدِر بياناتك الشخصية وأسرتك من هنا.",
    personal: "البيانات الشخصية", household: "الأسرة والصلاحيات", recentActivity: "أحدث ما في سجله",
    noActivity: "ستبني الرعاية والزيارات والذكريات تاريخ حيوانك الأليف هنا.", hello: (name: string) => `مرحبًا، ${name}`,
    todayIs: "اليوم", addPet: "أضف حيوانًا أليفًا", profile: "الملف الكامل", attention: "يحتاج إلى انتباه",
    noAttention: "بناءً على ما هو مسجّل، لا يوجد شيء عاجل بانتظارك.", noAttentionHint: "هذا لا يعني أن السجل مكتمل — كلما أضفت أكثر، تحسّنت التذكيرات.",
    next: "الموعد التالي", noNext: "ليس لديك موعد قادم.", findVet: "ابحث عن طبيب بيطري", findService: "الخدمات", details: "تفاصيل الموعد",
    upcoming: "قريبًا", noUpcoming: "لا يوجد تذكير أو حدث مسجّل بتاريخ.", calendar: "تقويم الرعاية", shortcuts: "اختصارات",
    health: "السجل الصحي", care: "الرعاية", memories: "الذكريات", shop: "المتجر", welcomeTitle: "مرحبًا بك في opetlife",
    welcomeBody: "أضف أول حيوان أليف لديك لتجمع صحته ورعايته وذكرياته في مكان واحد.", welcomeCta: "أضف أول حيوان أليف",
    unknownAge: "العمر غير معروف", switchPet: "اختر حيوانًا أليفًا", sections: "أقسام الملف الشخصي", lastHealth: "آخر سجل صحي",
    documents: "المستندات", travel: "السفر", weight: "الوزن", microchip: "الشريحة الإلكترونية", registered: "مسجّل", notRecorded: "غير مسجّل",
    recentHealth: "السجلات الصحية الأخيرة", noRecentHealth: "لم يُسجَّل شيء بعد.", allHealth: "السجل الكامل", membership: "العضوية",
    noMembership: "لا توجد عضوية نشطة. اطّلع على الخطط وما تتضمنه.", seePlans: "عرض الخطط", manage: "إدارة",
    trialUntil: "الفترة التجريبية حتى", renewsOn: "يتجدد في", orders: "الطلبات", noOrders: "لم تطلب أي شيء بعد.", allOrders: "كل الطلبات",
    trips: "الإقامات القادمة", noTrips: "لا توجد إقامة قادمة محجوزة.", findStay: "ابحث عن إقامة", explore: "لحيوانك الأليف",
    services: "الخدمات", vets: "الأطباء البيطريون", shopLink: "المتجر", stays: "السفر والإقامة", community: "المجتمع",
    unavailable: "تعذّر تحميل هذا القسم الآن.", retry: "إعادة المحاولة",
    loadingDashboard: "جارٍ تحميل لوحة التحكم",
    loadingMembership: "جارٍ تحميل العضوية",
    loadingOrders: "جارٍ تحميل الطلبات",
    loadingTrips: "جارٍ تحميل الإقامات القادمة",
    planNameInEnglish: "اسم الخطة بالإنجليزية",
  },
  nl: {
    dashboard: "Dashboard", startHere: "Begin hier", firstStep: "Laten we eerst kennismaken met je huisdier.",
    healthIntro: "Gezondheidsdossier, geschiedenis en documenten bij elkaar.", careIntro: "Afspraken en komende verzorging, op het juiste moment.",
    memoriesIntro: "Een plek voor de momenten die je wilt bewaren.", account: "Je account", accountIntro: "Beheer hier je persoonlijke gegevens en je huishouden.",
    personal: "Persoonlijke gegevens", household: "Huishouden en toegang", recentActivity: "Nieuw in het dossier",
    noActivity: "Verzorging, bezoeken en momenten vormen hier de geschiedenis van je huisdier.", hello: (name: string) => `Hallo, ${name}`,
    todayIs: "Vandaag", addPet: "Huisdier toevoegen", profile: "Volledig profiel", attention: "Vraagt aandacht",
    noAttention: "Op basis van wat is vastgelegd, wacht er niets dringends.", noAttentionHint: "Dat betekent niet dat het dossier compleet is — hoe meer je toevoegt, hoe beter de herinneringen.",
    next: "Volgende afspraak", noNext: "Je hebt geen komende afspraak.", findVet: "Zoek een dierenarts", findService: "Diensten", details: "Afspraakdetails",
    upcoming: "Binnenkort", noUpcoming: "Er is geen herinnering of gebeurtenis met een datum vastgelegd.", calendar: "Verzorgingskalender", shortcuts: "Snelkoppelingen",
    health: "Gezondheidsdossier", care: "Verzorging", memories: "Momenten", shop: "Winkel", welcomeTitle: "Welkom bij opetlife",
    welcomeBody: "Voeg je eerste huisdier toe om gezondheid, verzorging en momenten op één plek te bewaren.", welcomeCta: "Voeg je eerste huisdier toe",
    unknownAge: "Leeftijd onbekend", switchPet: "Kies een huisdier", sections: "Profielonderdelen", lastHealth: "Laatste gezondheidsnotitie",
    documents: "Documenten", travel: "Reizen", weight: "Gewicht", microchip: "Microchip", registered: "Geregistreerd", notRecorded: "Niet vastgelegd",
    recentHealth: "Recente gezondheid", noRecentHealth: "Nog niets vastgelegd.", allHealth: "Volledig dossier", membership: "Lidmaatschap",
    noMembership: "Geen actief lidmaatschap. Bekijk de abonnementen en wat ze bevatten.", seePlans: "Bekijk abonnementen", manage: "Beheren",
    trialUntil: "Proefperiode tot", renewsOn: "Wordt verlengd op", orders: "Bestellingen", noOrders: "Je hebt nog niets besteld.", allOrders: "Alle bestellingen",
    trips: "Komende verblijven", noTrips: "Geen komend verblijf geboekt.", findStay: "Zoek een verblijf", explore: "Voor je huisdier",
    services: "Diensten", vets: "Dierenartsen", shopLink: "Winkel", stays: "Reizen en verblijven", community: "Community",
    unavailable: "Dit onderdeel kon nu niet worden geladen.", retry: "Opnieuw proberen",
    loadingDashboard: "Dashboard laden",
    loadingMembership: "Lidmaatschap laden",
    loadingOrders: "Bestellingen laden",
    loadingTrips: "Komende verblijven laden",
    planNameInEnglish: "Plannaam in het Engels",
  },
} as const;

/**
 * The member home: the approved dashboard's hierarchy (pet identity → what needs attention →
 * next appointment → what's coming → shortcuts), filled with the member's own data. Every block
 * has an honest empty state; nothing is invented.
 */
export function MemberHomeView() {
  const locale = useLocale() as RouteLocale;
  const c = dashboardCopy[locale];
  const Forward = (locale === "fa" || locale === "ar") ? ChevronLeft : ChevronRight;
  const user = useSessionStore((s) => s.user);
  const { pets, activePetId, switchActivePet, isSwitching } = useActivePet();
  const [overview, setOverview] = useState<PetOverviewDto | null>(null);
  const [nextBooking, setNextBooking] = useState<Booking | "failed" | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [switchError, setSwitchError] = useState(false);
  const [careFailed, setCareFailed] = useState(false);
  const loadId = useRef(0);
  // Side panels load on their own: one failing never blanks the dashboard ("failed" shows an inline note).
  const [orders, setOrders] = useState<OrderSummaryDto[] | "failed" | null>(null);
  const [trips, setTrips] = useState<TravelBookingDto[] | "failed" | null>(null);
  const [membership, setMembership] = useState<SubscriptionDto | "none" | "failed" | null>(null);
  const householdId = usePetStore((s) => s.householdId);
  // No active pet recorded yet (e.g. a household created before active-pet existed): use the first pet.
  const petId = activePetId ?? pets[0]?.id ?? null;
  const permission = usePetAccess(petId);

  async function load() {
    const requestId = ++loadId.current;
    setError(null);
    setOverview(null);
    setNextBooking(undefined);
    if (!petId) return;
    try {
      const [ov, bookings, care] = await Promise.all([
        petsService.getOverview(petId),
        bookingsService.list({ upcoming: true }).catch(() => null),
        // The owner's care reminders count toward attention/upcoming exactly as on the pet profile.
        careRemindersService.list(petId).catch(() => null),
      ]);
      if (requestId !== loadId.current) return;
      setCareFailed(care === null);
      setOverview({ ...ov, ...mergeCareIntoOverview(ov, care ?? [], (item) => careTitle(item, locale)) });
      const sorted = [...(bookings ?? [])].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
      // The dashboard is scoped to the selected pet. Never fall back to a sibling pet's booking.
      setNextBooking(bookings === null ? "failed" : sorted.find((b) => b.petId === petId) ?? null);
    } catch (err) {
      if (requestId === loadId.current) setError(err);
    }
  }

  useEffect(() => {
    void load();
    return () => { loadId.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId, isSwitching]);

  useEffect(() => {
    void commerceService.listOrders().then(setOrders).catch(() => setOrders("failed"));
    void travelMarketService.listBookings({ scope: "upcoming" }).then((p) => setTrips(p.items)).catch(() => setTrips("failed"));
  }, []);
  useEffect(() => {
    if (!householdId) return;
    void subscriptionService
      .getCurrent(householdId)
      .then((sub) => setMembership(sub && ["ACTIVE", "TRIALING", "PAST_DUE", "GRACE_PERIOD", "CANCEL_AT_PERIOD_END"].includes(sub.status) ? sub : "none"))
      .catch((e: { status?: number }) => setMembership(e?.status === 404 ? "none" : "failed"));
  }, [householdId]);

  function retryMembership() {
    if (!householdId) return;
    setMembership(null);
    void subscriptionService
      .getCurrent(householdId)
      .then((sub) => setMembership(sub && ["ACTIVE", "TRIALING", "PAST_DUE", "GRACE_PERIOD", "CANCEL_AT_PERIOD_END"].includes(sub.status) ? sub : "none"))
      .catch((e: { status?: number }) => setMembership(e?.status === 404 ? "none" : "failed"));
  }

  function retryOrders() {
    setOrders(null);
    void commerceService.listOrders().then(setOrders).catch(() => setOrders("failed"));
  }

  function retryTrips() {
    setTrips(null);
    void travelMarketService.listBookings({ scope: "upcoming" }).then((p) => setTrips(p.items)).catch(() => setTrips("failed"));
  }

  const firstName = (user?.displayName ?? "").split(" ")[0] ?? "";
  const today = new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : locale === "ar" ? "ar" : locale === "nl" ? "nl-NL" : "en-US", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Tehran" }).format(new Date());

  if (!petId) {
    return (
      <div className="member-home member-home--new">
        <header className="member-home__greeting">
          <div>
            <p>{c.dashboard} <span aria-hidden="true"> / </span> {today}</p>
            <h1>{firstName ? c.hello(firstName) : c.welcomeTitle}</h1>
          </div>
        </header>
        <div className="member-home__welcome-layout">
          <section className="member-home__welcome" aria-labelledby="home-welcome">
            <span className="member-home__eyebrow">{c.startHere}</span>
            <h2 id="home-welcome">{c.firstStep}</h2>
            <p>{c.welcomeBody}</p>
            <Link className="member-home__primary" href={`/${locale}/onboarding`}><Plus size={18} aria-hidden="true" />{c.welcomeCta}</Link>
            <div className="member-home__welcome-details">
              {[
                { Icon: HeartPulse, title: c.health, description: c.healthIntro },
                { Icon: CalendarDays, title: c.care, description: c.careIntro },
                { Icon: Images, title: c.memories, description: c.memoriesIntro },
              ].map(({ Icon, title, description }) => (
                <div key={title}><Icon size={20} aria-hidden="true" /><div><h3>{title}</h3><p>{description}</p></div></div>
              ))}
            </div>
          </section>
          <aside className="member-home__welcome-account" aria-labelledby="home-account">
            <span className="member-home__account-avatar"><Avatar name={user?.displayName ?? c.account} size="lg" /></span>
            <h2 id="home-account">{c.account}</h2>
            <p>{c.accountIntro}</p>
            <nav aria-label={c.account}>
              {[["/profile", c.personal], ["/profile/household", c.household], ["/subscription", c.membership]].map(([href, label]) => (
                <Link key={href} href={`/${locale}${href}`}><span>{label}</span><Forward size={16} aria-hidden="true" /></Link>
              ))}
            </nav>
          </aside>
        </div>
        <DashboardExplore locale={locale} />
      </div>
    );
  }
  if (error) return <LoadFailure error={error} onRetry={load} />;
  if (!overview) return <Skeleton className="h-72 w-full" aria-label={c.loadingDashboard} />;

  const pet = overview.pet;
  const petBase = `/${locale}/pets/${pet.id}`;
  const shownHealth = new Set(overview.recentHealth.slice(0, 4).map((item) => `${item.type}-${item.id}`));
  const activity = overview.recentActivity.filter((item) => !shownHealth.has(`${item.type}-${item.id}`));
  return (
    <div className="member-home">
      <h1 className="sr-only">{firstName ? c.hello(firstName) : pet.name}</h1>
      {switchError ? <p role="alert">{c.unavailable}</p> : null}
      <LocationNudge />
      <GlassMemberHome locale={locale} userName={firstName ?? null} pet={pet} overview={overview} pets={pets} activePetId={petId} careFailed={careFailed} onRetryCare={load} permission={permission} isSwitching={isSwitching} onSwitch={(id) => { setSwitchError(false); void switchActivePet(id).catch(() => setSwitchError(true)); }} />

      <div className="member-home__layout">
        <div className="member-home__main">
          {permission.access?.canViewHealth ? <section className="member-home__card" aria-labelledby="home-health">
            <div className="member-home__card-head">
              <h2 id="home-health">{c.recentHealth}</h2>
              <Link href={`${petBase}/health`}>{c.allHealth}</Link>
            </div>
            {overview.recentHealth.length === 0 ? (
              <p className="member-home__empty">{c.noRecentHealth}</p>
            ) : (
              <ul className="member-home__list">
                {overview.recentHealth.slice(0, 4).map((item) => (
                  <li key={`${item.type}-${item.id}`}>
                    <Link href={petBase + item.href}>
                      <span className="member-home__item-text">
                        <strong>{eventTitle(item.title, locale)}</strong>
                        <span>{formatOverviewDate(item.occurredAt, locale)}{item.providerName ? ` · ${item.providerName}` : ""}</span>
                      </span>
                      <Forward size={16} aria-hidden="true" className="member-home__go" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section> : null}
          {/* Activity repeats nothing already listed under recent health — only care, memories and older records. */}
          {activity.length > 0 || overview.recentHealth.length === 0 ? <section className="member-home__card" aria-labelledby="home-activity">
            <div className="member-home__card-head"><h2 id="home-activity">{c.recentActivity}</h2></div>
            {activity.length === 0 ? <p className="member-home__empty">{c.noActivity}</p> : (
              <ul className="member-home__list member-home__timeline">
                {activity.slice(0, 4).map((item) => (
                  <li key={`${item.type}-${item.id}`}>
                    <Link href={item.href.startsWith("/bookings/") ? `/${locale}${item.href}` : petBase + item.href}>
                      <span className="member-home__timeline-dot" aria-hidden="true" />
                      <span className="member-home__item-text"><strong>{eventTitle(item.title, locale)}</strong><span>{formatOverviewDate(item.occurredAt, locale)} · {item.providerName ?? eventSourceLabel(item, locale)}</span></span>
                      <Forward size={16} aria-hidden="true" className="member-home__go" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section> : null}
        </div>

        <aside className="member-home__side">
          <section className="member-home__card" aria-labelledby="home-next">
            <h2 id="home-next">{c.next}</h2>
            {nextBooking === "failed" ? <div role="status"><p>{c.unavailable}</p><button type="button" onClick={load}>{c.retry}</button></div> : nextBooking ? (
              <Link href={`/${locale}/bookings/${nextBooking.id}`} className="member-home__next">
                <span className="member-home__next-icon"><Stethoscope size={20} aria-hidden="true" /></span>
                <span className="member-home__item-text">
                  <strong>{nextBooking.serviceName ?? nextBooking.provider?.name}</strong>
                  {nextBooking.provider?.name ? <span>{nextBooking.provider.name}</span> : null}
                  <span>{formatAppointmentDateTime(nextBooking.startAt, locale, nextBooking.location?.timezone ?? "Asia/Tehran")}</span>
                </span>
                <Forward size={18} aria-hidden="true" />
              </Link>
            ) : (
              <div className="member-home__calm">
                <p>{c.noNext}</p>
                <div className="member-home__actions">
                  <Link href={`/${locale}/vet/find`} className="account-link-button">{c.findVet}</Link>
                  <Link href={`/${locale}/services`} className="system-state__link">{c.findService}</Link>
                </div>
              </div>
            )}
          </section>

          <section className="member-home__card" aria-labelledby="home-membership">
            <div className="member-home__card-head">
              <h2 id="home-membership"><Sparkles size={16} aria-hidden="true" /> {c.membership}</h2>
              {membership && membership !== "failed" ? <Link href={`/${locale}/subscription`}>{membership === "none" ? c.seePlans : c.manage}</Link> : null}
            </div>
            {membership === null ? (
              <Skeleton className="h-10 w-full" aria-label={c.loadingMembership} />
            ) : membership === "failed" ? (
              <div role="status"><p className="member-home__empty">{c.unavailable}</p><button type="button" onClick={retryMembership}>{c.retry}</button></div>
            ) : membership === "none" ? (
              <p className="member-home__empty">{c.noMembership}</p>
            ) : (
              <div className="member-home__fact-row">
                <strong>{locale === "fa" ? membership.plan.nameFa : membership.plan.nameEn}</strong>
                {locale !== "fa" && locale !== "en" ? <small>{c.planNameInEnglish}</small> : null}
                <StatusLabel tone="success">{statusLabel(membership.status, locale, "subscription")}</StatusLabel>
                {membership.trialEndsAt && membership.status === "TRIALING" ? <span>{c.trialUntil} {formatDay(membership.trialEndsAt.slice(0, 10), locale)}</span> : membership.currentPeriod?.endAt ? <span>{c.renewsOn} {formatDay(membership.currentPeriod.endAt.slice(0, 10), locale)}</span> : null}
              </div>
            )}
          </section>

          <section className="member-home__card" aria-labelledby="home-orders">
            <div className="member-home__card-head">
              <h2 id="home-orders">{c.orders}</h2>
              {Array.isArray(orders) && orders.length ? <Link href={`/${locale}/orders`}>{c.allOrders}</Link> : null}
            </div>
            {orders === null ? (
              <Skeleton className="h-10 w-full" aria-label={c.loadingOrders} />
            ) : orders === "failed" ? (
              <div role="status"><p className="member-home__empty">{c.unavailable}</p><button type="button" onClick={retryOrders}>{c.retry}</button></div>
            ) : orders.length === 0 ? (
              <p className="member-home__empty">{c.noOrders} <Link href={`/${locale}/shop`} className="member-home__inline">{c.shopLink}</Link></p>
            ) : (
              <ul className="member-home__list">
                {[...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 2).map((o) => (
                  <li key={o.id}>
                    <Link href={`/${locale}/orders/${o.id}`}>
                      <span className="member-home__next-icon member-home__next-icon--sm"><PackageCheck size={18} aria-hidden="true" /></span>
                      <span className="member-home__item-text">
                        <strong>{o.previewTitles[0] ?? o.orderNumber}</strong>
                        <span>{statusLabel(o.status, locale, "order")} · {formatCurrency(o.totalAmount, locale)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="member-home__card" aria-labelledby="home-trips">
            <div className="member-home__card-head">
              <h2 id="home-trips">{c.trips}</h2>
              <Link href={`/${locale}/travel`}>{c.findStay}</Link>
            </div>
            {trips === null ? (
              <Skeleton className="h-10 w-full" aria-label={c.loadingTrips} />
            ) : trips === "failed" ? (
              <div role="status"><p className="member-home__empty">{c.unavailable}</p><button type="button" onClick={retryTrips}>{c.retry}</button></div>
            ) : trips.length === 0 ? (
              <p className="member-home__empty">{c.noTrips}</p>
            ) : (
              <ul className="member-home__list">
                {trips.slice(0, 2).map((t) => (
                  <li key={t.id}>
                    <Link href={`/${locale}/travel/bookings/${t.id}`}>
                      <span className="member-home__next-icon member-home__next-icon--sm"><Plane size={18} aria-hidden="true" /></span>
                      <span className="member-home__item-text">
                        <strong>{t.listingTitle}</strong>
                        <span>{t.listingCity} · {formatDay(t.checkIn.slice(0, 10), locale, { year: false })} · {statusLabel(t.status, locale, "travelBooking")}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      <DashboardExplore locale={locale} />
    </div>
  );
}

function DashboardExplore({ locale }: { locale: RouteLocale }) {
  const c = dashboardCopy[locale];
  return <nav className="member-home__explore" aria-label={c.explore}>
        <h2>{c.explore}</h2>
        <div>
          <Link href={`/${locale}/services`}><Scissors size={18} aria-hidden="true" />{c.services}</Link>
          <Link href={`/${locale}/vet/find`}><Stethoscope size={18} aria-hidden="true" />{c.vets}</Link>
          <Link href={`/${locale}/shop`}><ShoppingBag size={18} aria-hidden="true" />{c.shopLink}</Link>
          <Link href={`/${locale}/travel`}><MapPin size={18} aria-hidden="true" />{c.stays}</Link>
          <Link href={`/${locale}/community`}><Users size={18} aria-hidden="true" />{c.community}</Link>
        </div>
      </nav>;
}
