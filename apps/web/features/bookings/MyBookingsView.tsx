"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { BookingDto, PetDto } from "@petlife/types";
import { formatDateTimeRange } from "@/lib/date/appointment-date";
import { bookingsService, type WaitlistEntry } from "@/services/bookings.service";
import { householdsService } from "@/services/households.service";
import { bookingStatusTone } from "@/features/discovery/labels";
import { BookingFrame } from "./BookingFrame";

type Tab = "upcoming" | "requested" | "past" | "cancelled" | "waitlist";
type Locale = "fa" | "en" | "de" | "es" | "ar" | "nl";
const TAB_KEYS: Tab[] = ["upcoming", "requested", "past", "cancelled", "waitlist"];

const COPY = {
  fa: { title: "نوبت‌های من", bookService: "رزرو خدمت تازه", tabsLabel: "دسته نوبت‌ها", pet: "حیوان", allPets: "همه", tabs: { upcoming: "پیش رو", requested: "درخواست‌ها و پرداخت", past: "انجام‌شده", cancelled: "لغو و منقضی", waitlist: "لیست انتظار" }, loadError: "نوبت‌ها بارگیری نشد", retry: "تلاش دوباره", loading: "در حال بارگیری", noWaitlist: "در هیچ لیست انتظاری نیستید", waitlistHelp: "وقتی روزی پر است، می‌توانید از صفحه رزرو به لیست انتظار بپیوندید.", openedNotHeld: "زمانی آزاد شد؛ برای رزرو اقدام کنید (برایتان نگه داشته نشده است).", waiting: "در انتظار", booked: "رزرو شد", closed: "بسته شد", book: "رزرو", leaveWaitlist: "خروج از لیست", noBookings: "نوبتی در این بخش نیست", findService: "پیدا کردن خدمت" },
  en: { title: "My bookings", bookService: "Book a service", tabsLabel: "Booking tabs", pet: "Pet", allPets: "All pets", tabs: { upcoming: "Upcoming", requested: "Requested", past: "Completed", cancelled: "Cancelled", waitlist: "Waitlist" }, loadError: "Bookings could not load", retry: "Retry", loading: "Loading", noWaitlist: "You are not on any waitlist", waitlistHelp: "When a day is full you can join its waitlist from the booking page.", openedNotHeld: "A time opened — book it (it is not held for you).", waiting: "Waiting", booked: "Booked", closed: "Closed", book: "Book", leaveWaitlist: "Leave", noBookings: "No bookings here", findService: "Find a service", bookingTabs: { requested: "Requested", completed: "Completed", cancelled: "Cancelled" } },
  de: { title: "Meine Buchungen", bookService: "Service buchen", tabsLabel: "Buchungsbereiche", pet: "Tier", allPets: "Alle Tiere", tabs: { upcoming: "Bevorstehend", requested: "Angefragt", past: "Abgeschlossen", cancelled: "Storniert", waitlist: "Warteliste" }, loadError: "Buchungen konnten nicht geladen werden", retry: "Erneut versuchen", loading: "Wird geladen", noWaitlist: "Du stehst auf keiner Warteliste", waitlistHelp: "Wenn ein Tag ausgebucht ist, kannst du dich auf der Buchungsseite auf die Warteliste setzen lassen.", openedNotHeld: "Ein Termin ist frei geworden – buche ihn (er wird nicht für dich reserviert).", waiting: "Wartend", booked: "Gebucht", closed: "Geschlossen", book: "Buchen", leaveWaitlist: "Verlassen", noBookings: "Keine Buchungen in diesem Bereich", findService: "Service suchen", bookingTabs: { requested: "Angefragt", completed: "Abgeschlossen", cancelled: "Storniert" } },
  es: { title: "Mis reservas", bookService: "Reservar un servicio", tabsLabel: "Secciones de reservas", pet: "Mascota", allPets: "Todas las mascotas", tabs: { upcoming: "Próximas", requested: "Solicitadas", past: "Completadas", cancelled: "Canceladas", waitlist: "Lista de espera" }, loadError: "No se pudieron cargar las reservas", retry: "Reintentar", noWaitlist: "No estás en ninguna lista de espera", waitlistHelp: "Cuando un día está completo, puedes unirte a la lista de espera desde la página de reserva.", openedNotHeld: "Se ha liberado una hora: resérvala (no queda apartada para ti).", waiting: "En espera", booked: "Reservada", closed: "Cerrada", book: "Reservar", leaveWaitlist: "Salir", noBookings: "No hay reservas en esta sección", findService: "Buscar un servicio", bookingTabs: { requested: "Solicitadas", completed: "Completadas", cancelled: "Canceladas" }, loading: "Cargando" },
  ar: { title: "حجوزاتي", bookService: "احجز خدمة", tabsLabel: "أقسام الحجوزات", pet: "الحيوان الأليف", allPets: "كل الحيوانات الأليفة", tabs: { upcoming: "القادمة", requested: "المطلوبة", past: "المكتملة", cancelled: "الملغاة", waitlist: "قائمة الانتظار" }, loadError: "تعذّر تحميل الحجوزات", retry: "إعادة المحاولة", loading: "جارٍ التحميل", noWaitlist: "لست في أي قائمة انتظار", waitlistHelp: "عندما يكون اليوم ممتلئًا، يمكنك الانضمام إلى قائمة الانتظار من صفحة الحجز.", openedNotHeld: "توفّر موعد — احجزه (لا يُحتفظ به لك).", waiting: "قيد الانتظار", booked: "تم الحجز", closed: "مغلق", book: "احجز", leaveWaitlist: "مغادرة", noBookings: "لا توجد حجوزات هنا", findService: "ابحث عن خدمة", bookingTabs: { requested: "المطلوبة", completed: "المكتملة", cancelled: "الملغاة" } },
  nl: { title: "Mijn boekingen", bookService: "Boek een dienst", tabsLabel: "Boekingstabbladen", pet: "Huisdier", allPets: "Alle huisdieren", tabs: { upcoming: "Komend", requested: "Aangevraagd", past: "Voltooid", cancelled: "Geannuleerd", waitlist: "Wachtlijst" }, loadError: "Boekingen konden niet worden geladen", retry: "Opnieuw proberen", loading: "Laden", noWaitlist: "Je staat op geen enkele wachtlijst", waitlistHelp: "Als een dag vol is, kun je je via de boekingspagina op de wachtlijst zetten.", openedNotHeld: "Er is een tijd vrijgekomen — boek die (hij wordt niet voor je vastgehouden).", waiting: "Wachtend", booked: "Geboekt", closed: "Gesloten", book: "Boeken", leaveWaitlist: "Verlaten", noBookings: "Geen boekingen hier", findService: "Zoek een dienst", bookingTabs: { requested: "Aangevraagd", completed: "Voltooid", cancelled: "Geannuleerd" } },
} as const;

const CATEGORY_COPY: Record<string, Record<Locale, string>> = {
  VET: { fa: "دامپزشکی", en: "Veterinary", de: "Tiermedizin", es: "Veterinaria", ar: "طب بيطري", nl: "Dierenarts" }, GROOMING: { fa: "آرایش و شست‌وشو", en: "Grooming", de: "Fellpflege", es: "Peluquería", ar: "التجميل", nl: "Vachtverzorging" },
  TRAINING: { fa: "آموزش", en: "Training", de: "Training", es: "Adiestramiento", ar: "التدريب", nl: "Training" }, WALKING: { fa: "پیاده‌روی", en: "Dog walking", de: "Gassi-Service", es: "Paseo de perros", ar: "تمشية الكلاب", nl: "Honden uitlaten" },
  SITTING: { fa: "نگهداری در منزل", en: "Pet sitting", de: "Betreuung zu Hause", es: "Cuidado a domicilio", ar: "مجالسة الحيوانات الأليفة", nl: "Huisdieroppas" }, BOARDING: { fa: "پانسیون", en: "Boarding", de: "Tierpension", es: "Residencia", ar: "الإيواء", nl: "Dierenpension" },
  PET_TAXI: { fa: "تاکسی حیوانات", en: "Pet taxi", de: "Tiertransport", es: "Taxi para mascotas", ar: "تاكسي الحيوانات الأليفة", nl: "Dierentaxi" }, OTHER: { fa: "سایر خدمات", en: "Other service", de: "Weiterer Service", es: "Otro servicio", ar: "خدمة أخرى", nl: "Andere dienst" },
};
const OTHER_CATEGORY: Record<Locale, string> = { fa: "سایر خدمات", en: "Other service", de: "Weiterer Service", es: "Otro servicio", ar: "خدمة أخرى", nl: "Andere dienst" };
const STATUS_COPY: Record<string, Record<Locale, string>> = {
  HOLD: { fa: "در حال رزرو", en: "Holding", de: "Wird reserviert", es: "En reserva", ar: "قيد الحجز", nl: "Wordt gereserveerd" }, PENDING_CONFIRMATION: { fa: "در انتظار تأیید", en: "Pending confirmation", de: "Wartet auf Bestätigung", es: "Pendiente de confirmación", ar: "بانتظار التأكيد", nl: "Wacht op bevestiging" },
  REQUESTED: { fa: "درخواست ارسال شد", en: "Requested", de: "Angefragt", es: "Solicitada", ar: "تم الطلب", nl: "Aangevraagd" }, AWAITING_PAYMENT: { fa: "در انتظار پرداخت", en: "Awaiting payment", de: "Zahlung ausstehend", es: "Pendiente de pago", ar: "بانتظار الدفع", nl: "Wacht op betaling" },
  REJECTED: { fa: "پذیرفته نشد", en: "Declined", de: "Abgelehnt", es: "Rechazada", ar: "مرفوض", nl: "Afgewezen" }, EXPIRED: { fa: "منقضی شد", en: "Expired", de: "Abgelaufen", es: "Caducada", ar: "منتهي الصلاحية", nl: "Verlopen" }, RESCHEDULED: { fa: "منتقل شد", en: "Rescheduled", de: "Verschoben", es: "Reprogramada", ar: "أُعيدت جدولته", nl: "Verzet" },
  CONFIRMED: { fa: "قطعی", en: "Confirmed", de: "Bestätigt", es: "Confirmada", ar: "مؤكد", nl: "Bevestigd" }, CHECKED_IN: { fa: "پذیرش شد", en: "Checked in", de: "Eingecheckt", es: "Registrada", ar: "تم تسجيل الوصول", nl: "Ingecheckt" }, IN_PROGRESS: { fa: "در حال انجام", en: "In progress", de: "In Bearbeitung", es: "En curso", ar: "قيد التنفيذ", nl: "Bezig" }, COMPLETED: { fa: "انجام شد", en: "Completed", de: "Abgeschlossen", es: "Completada", ar: "مكتمل", nl: "Voltooid" },
  CANCELLED_BY_USER: { fa: "لغو توسط شما", en: "Cancelled by you", de: "Von dir storniert", es: "Cancelada por ti", ar: "ألغيته أنت", nl: "Door jou geannuleerd" }, CANCELLED_BY_PROVIDER: { fa: "لغو توسط ارائه‌دهنده", en: "Cancelled by provider", de: "Vom Anbieter storniert", es: "Cancelada por el proveedor", ar: "ألغاه مقدم الخدمة", nl: "Door aanbieder geannuleerd" }, NO_SHOW: { fa: "عدم حضور", en: "No-show", de: "Nicht erschienen", es: "No presentada", ar: "عدم الحضور", nl: "Niet verschenen" },
};
const waitlistCopy = (status: string, copy: (typeof COPY)[Locale]) => status === "NOTIFIED" ? copy.openedNotHeld : status === "ACTIVE" ? copy.waiting : status === "BOOKED" ? copy.booked : copy.closed;
const statusLabel = (status: string, locale: Locale) => STATUS_COPY[status]?.[locale] ?? ({ fa: "وضعیت به‌روزرسانی شد", en: "Status updated", de: "Status aktualisiert", es: "Estado actualizado", ar: "تم تحديث الحالة", nl: "Status bijgewerkt" } as const)[locale];
const categoryLabel = (category: string, locale: Locale) => CATEGORY_COPY[category]?.[locale] ?? OTHER_CATEGORY[locale];

/** One list for every category — vet and marketplace bookings are the same Booking entity. */
export function MyBookingsView() {
  const locale = useLocale() as Locale;
  const c = COPY[locale];
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = (TAB_KEYS.find((key) => key === params.get("tab")) ?? "upcoming") as Tab;
  const petId = params.get("petId") ?? "";
  const [bookings, setBookings] = useState<BookingDto[] | null>(null);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[] | null>(null);
  const [pets, setPets] = useState<PetDto[]>([]);
  const [error, setError] = useState(false);

  const setParam = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  const load = useCallback(async () => {
    setError(false);
    setBookings(null);
    setWaitlist(null);
    try {
      if (tab === "waitlist") setWaitlist(await bookingsService.listWaitlist());
      else setBookings(await bookingsService.list({ [tab]: true, petId: petId || undefined }));
    } catch {
      setError(true);
    }
  }, [tab, petId]);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    void householdsService
      .listMine()
      .then((hh) => Promise.all(hh.map((h) => householdsService.listPets(h.id))))
      .then((lists) => setPets(lists.flat()))
      .catch(() => setPets([]));
  }, []);

  async function leaveWaitlist(id: string) {
    await bookingsService.cancelWaitlist(id);
    await load();
  }

  return (
    <BookingFrame>
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-page-title text-text-primary">{c.title}</h1>
        <Link href={`/${locale}/services`} className="inline-flex min-h-11 items-center text-sm font-bold text-brand-natural">{c.bookService}</Link>
      </header>
      <nav aria-label={c.tabsLabel} className="-mx-1 flex gap-2 overflow-x-auto border-b border-border-subtle pb-2">
        {TAB_KEYS.map((key) => (
          <button key={key} type="button" aria-pressed={tab === key} onClick={() => setParam({ tab: key })} className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-3 py-2 text-sm ${tab === key ? "bg-brand-solid text-on-brand" : "text-text-secondary"}`}>
            {c.tabs[key]}
          </button>
        ))}
      </nav>
      {tab !== "waitlist" && pets.length > 1 ? (
        <label className="flex max-w-xs flex-col gap-1 text-sm">
          <span className="text-text-secondary">{c.pet}</span>
          <select className="min-h-11 rounded border border-border-subtle bg-surface-base p-2" value={petId} onChange={(e) => setParam({ petId: e.target.value || undefined })}>
            <option value="">{c.allPets}</option>
            {pets.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      ) : null}

      {error ? <ErrorRecovery title={c.loadError} message="" retryLabel={c.retry} onRetry={load} /> : null}

      {tab === "waitlist" ? (
        !waitlist && !error ? (
          <Skeleton className="h-40 w-full" aria-label={c.loading} />
        ) : waitlist?.length === 0 ? (
          <EmptyState title={c.noWaitlist} description={c.waitlistHelp} />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {waitlist?.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <p className="font-bold">{w.serviceName} · {w.providerName}</p>
                  <p className="text-sm text-text-secondary">{w.petName} · {formatDateTimeRange(w.windowStart, w.windowEnd, locale, "Asia/Tehran")}</p>
                  <p className="text-sm">{waitlistCopy(w.status, c)}</p>
                </div>
                <div className="flex gap-2">
                  {w.status === "NOTIFIED" ? (
                    <Link className="inline-flex min-h-11 items-center rounded-md bg-brand-solid px-3 py-2 text-sm text-on-brand" href={`/${locale}/providers/${w.providerOrganizationId}/book?serviceId=${w.serviceId}${w.variantId ? `&variantId=${w.variantId}` : ""}&date=${w.windowStart.slice(0, 10)}`}>
                      {c.book}
                    </Link>
                  ) : null}
                  {w.status === "ACTIVE" || w.status === "NOTIFIED" ? (
                    <Button variant="ghost" size="sm" onClick={() => void leaveWaitlist(w.id)}>{c.leaveWaitlist}</Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : !error && !bookings ? (
        <Skeleton className="h-48 w-full" aria-label={c.loading} />
      ) : bookings?.length === 0 ? (
        <EmptyState
          title={c.noBookings}
          actionLabel={tab === "upcoming" ? c.findService : undefined}
          onAction={tab === "upcoming" ? () => router.push(`/${locale}/services`) : undefined}
        />
      ) : (
        <ul className="divide-y divide-border-subtle">
          {bookings?.map((b) => (
            <li key={b.id}>
              <Link href={`/${locale}/bookings/${b.id}`} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <p className="font-bold text-text-primary">{b.serviceName ?? b.service?.name ?? categoryLabel(b.category, locale)}{b.variantName ? ` — ${b.variantName}` : ""}</p>
                  <p className="text-sm text-text-secondary">{b.provider?.name}{b.bookingNumber ? <> · <span dir="ltr">{b.bookingNumber}</span></> : null}</p>
                  <p className="text-sm text-text-secondary">{formatDateTimeRange(b.startAt, b.endAt, locale, b.timezone)}</p>
                </div>
                <StatusLabel tone={bookingStatusTone(b.bookingStatus)}>{statusLabel(b.bookingStatus, locale)}</StatusLabel>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
    </BookingFrame>
  );
}
