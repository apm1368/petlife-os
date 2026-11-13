"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, ContextSurface, Dialog, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import type { StatusTone } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { accountService, type DeletionPreviewDto, type PrivacyCenterDto, type PrivacyRequestStatusValue, type SharingSummaryDto } from "@/services/account.service";
import {ConsentHistory} from "./ConsentHistory";
import { PasswordInput } from "@/features/auth/PasswordInput";
import { AccountPageHeader } from "./AccountNav";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { formatAccountDate, useAccountCopy } from "./account-copy";
import { formatDay } from "@/lib/date/jalali";

const EXPORT_STATUS: Record<PrivacyRequestStatusValue, { fa: string; en: string; de: string; es: string; ar: string; nl: string; tone: StatusTone }> = {
  PENDING: { fa: "در صف", en: "Queued", de: "In der Warteschlange", es: "En espera", ar: "في قائمة الانتظار", nl: "In de wachtrij", tone: "neutral" },
  PROCESSING: { fa: "در حال آماده‌سازی", en: "Preparing", de: "Wird vorbereitet", es: "Preparando", ar: "قيد التحضير", nl: "Wordt voorbereid", tone: "neutral" },
  READY: { fa: "آمادهٔ دریافت", en: "Ready", de: "Bereit", es: "Listo", ar: "جاهز", nl: "Klaar", tone: "success" },
  COMPLETED: { fa: "انجام شد", en: "Done", de: "Abgeschlossen", es: "Completado", ar: "تم", nl: "Afgerond", tone: "success" },
  CANCELLED: { fa: "لغو شد", en: "Cancelled", de: "Abgebrochen", es: "Cancelado", ar: "ملغى", nl: "Geannuleerd", tone: "neutral" },
  FAILED: { fa: "ناموفق", en: "Failed", de: "Fehlgeschlagen", es: "Error", ar: "فشل", nl: "Mislukt", tone: "urgent" },
  EXPIRED: { fa: "منقضی شد", en: "Expired", de: "Abgelaufen", es: "Caducado", ar: "منتهي الصلاحية", nl: "Verlopen", tone: "neutral" },
};

const SCOPE_LABELS: Record<string, [string, string, string, string, string, string]> = {
  ACCOUNT: ["حساب", "Account", "Konto", "Cuenta", "الحساب", "Account"],
  HOUSEHOLDS: ["خانواده‌ها", "Households", "Haushalte", "Hogares", "الأسر", "Huishoudens"],
  PETS: ["حیوانات", "Pets", "Tiere", "Mascotas", "الحيوانات الأليفة", "Huisdieren"],
  HEALTH_WHERE_PERMITTED: ["سلامت (در حد دسترسی شما)", "Health (as far as you may see it)", "Gesundheit (im Rahmen Ihrer Berechtigung)", "Salud (según tus permisos)", "الصحة (بقدر ما يُسمح لك برؤيته)", "Gezondheid (voor zover jij die mag zien)"],
  MEMORIES_YOU_WROTE: ["خاطراتی که خودتان نوشته‌اید", "Memories you wrote", "Von Ihnen verfasste Erinnerungen", "Recuerdos que escribiste", "الذكريات التي كتبتها", "Herinneringen die jij schreef"],
  BOOKINGS: ["رزروها", "Bookings", "Buchungen", "Reservas", "الحجوزات", "Boekingen"],
  ORDERS: ["سفارش‌ها", "Orders", "Bestellungen", "Pedidos", "الطلبات", "Bestellingen"],
  TRAVEL: ["سفرها", "Travel", "Reisen", "Viajes", "السفر", "Reizen"],
  SUPPORT: ["گفت‌وگوهای پشتیبانی", "Support conversations", "Support-Unterhaltungen", "Conversaciones de soporte", "محادثات الدعم", "Supportgesprekken"],
  PRIVACY_SETTINGS: ["رضایت‌ها و تنظیمات اعلان", "Consents & notification settings", "Einwilligungen und Benachrichtigungseinstellungen", "Consentimientos y preferencias de notificación", "الموافقات وإعدادات الإشعارات", "Toestemmingen en meldingsinstellingen"],
  ACTIVITY: ["فعالیت حساب", "Account activity", "Kontoaktivität", "Actividad de la cuenta", "نشاط الحساب", "Accountactiviteit"],
};

const MEMBERSHIP_STATUS: Record<string, [string, string, string, string, string, string]> = {
  TRIALING: ["آزمایشی", "trial", "Testphase", "prueba", "تجريبي", "proefperiode"], ACTIVE: ["فعال", "active", "aktiv", "activa", "نشط", "actief"],
  PAST_DUE: ["پرداخت معوق", "payment overdue", "Zahlung überfällig", "pago pendiente", "الدفع متأخر", "betaling achterstallig"],
  GRACE_PERIOD: ["مهلت پرداخت", "grace period", "Kulanzzeitraum", "periodo de gracia", "فترة سماح", "respijtperiode"],
  CANCEL_AT_PERIOD_END: ["لغو در پایان دوره", "ending at period end", "Endet zum Laufzeitende", "finaliza al terminar el periodo", "ينتهي في نهاية الفترة", "stopt aan het einde van de periode"],
  CANCELLED: ["لغوشده", "cancelled", "gekündigt", "cancelada", "ملغى", "geannuleerd"], EXPIRED: ["پایان‌یافته", "ended", "abgelaufen", "finalizada", "منتهٍ", "beëindigd"],
};

const SHARE_KIND: Record<string, [string, string, string, string, string, string]> = {
  HOUSEHOLD: ["عضو خانواده", "Household member", "Haushaltsmitglied", "Miembro del hogar", "عضو الأسرة", "Lid van het huishouden"],
  TEMPORARY: ["دسترسی موقت", "Temporary access", "Vorübergehender Zugriff", "Acceso temporal", "وصول مؤقت", "Tijdelijke toegang"],
  PROVIDER_BOOKING: ["ارائه‌دهندهٔ رزرو", "Booking provider", "Anbieter einer Buchung", "Proveedor de la reserva", "مقدم خدمة الحجز", "Boekingsaanbieder"],
  VET_SHARE: ["اشتراک با دامپزشک", "Shared with a vet", "Mit einer Tierarztpraxis geteilt", "Compartido con un veterinario", "مُشارك مع طبيب بيطري", "Gedeeld met een dierenarts"],
};

const BLOCKER_COPY: Record<string, { fa: string; en: string; de: string; es: string; ar: string; nl: string; href?: string }> = {
  UPCOMING_BOOKINGS: { fa: "رزروهای پیش‌رو دارید؛ آن‌ها را انجام یا لغو کنید.", en: "You have upcoming bookings; complete or cancel them.", de: "Sie haben anstehende Buchungen. Schließen Sie diese ab oder stornieren Sie sie.", es: "Tienes reservas próximas; complétalas o cancélalas.", ar: "لديك حجوزات قادمة؛ أكملها أو ألغها.", nl: "Je hebt komende boekingen; rond ze af of annuleer ze.", href: "/bookings" },
  OPEN_ORDERS: { fa: "سفارش‌های باز دارید که هنوز تحویل یا لغو نشده‌اند.", en: "You have open orders that aren't delivered or cancelled yet.", de: "Es gibt offene Bestellungen, die noch nicht geliefert oder storniert wurden.", es: "Tienes pedidos abiertos que aún no se han entregado ni cancelado.", ar: "لديك طلبات مفتوحة لم تُسلَّم أو تُلغَ بعد.", nl: "Je hebt openstaande bestellingen die nog niet zijn geleverd of geannuleerd.", href: "/orders" },
  OPEN_REFUND_REQUESTS: { fa: "درخواست بازپرداخت در حال بررسی دارید.", en: "A refund request is still being reviewed.", de: "Ein Erstattungsantrag wird noch geprüft.", es: "Aún se está revisando una solicitud de reembolso.", ar: "لا يزال طلب استرداد قيد المراجعة.", nl: "Een terugbetalingsverzoek wordt nog beoordeeld." , href: "/orders" },
  OPEN_DISPUTES: { fa: "یک اختلاف باز دارید.", en: "You have an open dispute.", de: "Sie haben einen offenen Streitfall.", es: "Tienes una disputa abierta.", ar: "لديك نزاع مفتوح.", nl: "Je hebt een openstaand geschil.", href: "/support" },
  ACTIVE_TRAVEL_BOOKINGS: { fa: "رزرو سفر فعال دارید.", en: "You have an active travel booking.", de: "Sie haben eine aktive Reisebuchung.", es: "Tienes una reserva de viaje activa.", ar: "لديك حجز سفر نشط.", nl: "Je hebt een actieve reisboeking.", href: "/travel/trips" },
  PARTNER_ROLES: { fa: "در یک کسب‌وکار (ارائه‌دهنده یا فروشنده) نقش دارید؛ ابتدا مسئولیت را منتقل کنید.", en: "You hold a role in a partner business (provider or seller); hand it over first.", de: "Sie haben eine Rolle in einem Partnerunternehmen (Anbieter oder Verkäufer). Übertragen Sie diese zuerst.", es: "Tienes un cargo en un negocio asociado (proveedor o vendedor); transfiérelo primero.", ar: "لديك دور في نشاط تجاري شريك (مقدم خدمة أو بائع)؛ سلّمه أولًا.", nl: "Je hebt een rol bij een partnerbedrijf (aanbieder of verkoper); draag die eerst over." },
  ONLY_OWNER_OF_SHARED_HOUSEHOLD: { fa: "تنها مدیر خانواده‌ای با اعضای دیگر هستید؛ ابتدا عضو دیگری را مدیر کنید.", en: "You're the only owner of a household others share; make someone else an owner first.", de: "Sie sind alleinige Leitung eines Haushalts mit weiteren Mitgliedern. Ernennen Sie zuerst eine andere Person zur Leitung.", es: "Eres la única persona administradora de un hogar con más miembros; nombra primero a otra persona administradora.", ar: "أنت المالك الوحيد لأسرة يشاركها آخرون؛ اجعل شخصًا آخر مالكًا أولًا.", nl: "Je bent de enige eigenaar van een huishouden dat je met anderen deelt; maak eerst iemand anders eigenaar.", href: "/profile/household" },
};

const PRIVACY_DE: Record<string, string> = {
  Privacy: "Datenschutz", "Privacy details didn't load.": "Die Datenschutzinformationen konnten nicht geladen werden.", Retry: "Erneut versuchen", Loading: "Wird geladen",
  "PRIVACY CENTER": "DATENSCHUTZ", "Data, consents & sharing": "Daten, Einwilligungen und Freigaben", "See what's required and what's optional, who can see your pets, and how to get a copy of your data or delete it.": "Erfahren Sie, was erforderlich und freiwillig ist, wer Ihre Tiere sehen kann und wie Sie eine Kopie Ihrer Daten erhalten oder deren Löschung beantragen.",
  Consents: "Einwilligungen", "Terms of use": "Nutzungsbedingungen", "Privacy policy": "Datenschutzerklärung", "Current version": "Aktuelle Version", "Accepted on": "Angenommen am", "A newer version hasn't been accepted yet.": "Eine neuere Version wurde noch nicht angenommen.", "Your acceptance of this version isn't on record.": "Ihre Annahme dieser Version ist nicht gespeichert.", "Required to use opetlife; to stop, request account deletion.": "Für die Nutzung von opetlife erforderlich. Wenn Sie dies beenden möchten, beantragen Sie die Kontolöschung.", Accepted: "Angenommen", "Accept current version": "Aktuelle Version annehmen",
  "Offers & marketing messages": "Angebote und Marketingnachrichten", "Optional and off by default. Turning it off never affects security, order, booking or health messages.": "Freiwillig und standardmäßig deaktiviert. Das Deaktivieren betrifft niemals Sicherheits-, Bestell-, Buchungs- oder Gesundheitsnachrichten.", "On since": "Aktiv seit", "Marketing messages are off.": "Marketingnachrichten sind deaktiviert.", "Marketing messages are on.": "Marketingnachrichten sind aktiviert.",
  Sharing: "Freigaben", "People who can currently reach pets you manage, and your access to other people's pets.": "Personen mit aktuellem Zugriff auf die von Ihnen verwalteten Tiere sowie Ihr Zugriff auf Tiere anderer Personen.", "Manage access": "Zugriff verwalten", "The sharing summary didn't load.": "Die Freigabeübersicht konnte nicht geladen werden.", "Nothing is shared with anyone right now.": "Derzeit ist nichts für andere freigegeben.", "sees health": "kann Gesundheitsdaten sehen", until: "bis", Manage: "Verwalten",
  "Get a copy of your data": "Kopie Ihrer Daten erhalten", "We prepare a JSON file that stays available for": "Wir erstellen eine JSON-Datei, die für", "days. Each download link works for a few minutes and every download is recorded.": "Tage verfügbar ist. Jeder Download-Link ist nur wenige Minuten gültig und jeder Download wird protokolliert.", "Requested — your file will be ready in a moment.": "Angefordert – Ihre Datei wird in Kürze bereitgestellt.", "Preparing…": "Wird vorbereitet …", "Request my data": "Meine Daten anfordern", Requested: "Angefordert", "Available until": "Verfügbar bis", "Preparing failed; please request again.": "Die Vorbereitung ist fehlgeschlagen. Bitte fordern Sie die Datei erneut an.", "Download": "Herunterladen",
  "Delete your account": "Konto löschen", "Your deletion request was recorded on": "Ihr Löschantrag wurde am", ". It waits until the data-retention rules are published, your account keeps working meanwhile, and you can cancel it until then.": " gespeichert. Er bleibt offen, bis die Regeln zur Datenaufbewahrung veröffentlicht sind. Ihr Konto bleibt bis dahin aktiv und Sie können den Antrag stornieren.", "Deletion is a recorded request, not an instant wipe. You'll see what it affects, confirm it's you, and can cancel it until it's processed.": "Die Löschung wird zunächst beantragt und erfolgt nicht sofort. Sie sehen die Auswirkungen, bestätigen Ihre Identität und können den Antrag bis zur Bearbeitung stornieren.", "Cancel deletion request": "Löschantrag stornieren", "Request account deletion": "Kontolöschung beantragen", "Your deletion request was recorded.": "Ihr Löschantrag wurde gespeichert.", "Cancel the deletion request": "Löschantrag stornieren", "The request is cancelled and your account stays exactly as it is.": "Der Antrag wird storniert und Ihr Konto bleibt unverändert.", "Cancel request": "Antrag stornieren", "The deletion request was cancelled.": "Der Löschantrag wurde storniert.",
  "That didn't work.": "Das hat nicht funktioniert.", "This file is no longer available; request a fresh copy.": "Diese Datei ist nicht mehr verfügbar. Fordern Sie eine neue Kopie an.", "You've requested several exports today; try again tomorrow.": "Sie haben heute bereits mehrere Datenexporte angefordert. Versuchen Sie es morgen erneut.", "Request recorded; your file will be ready in a moment.": "Antrag gespeichert. Ihre Datei wird in Kürze bereitgestellt.",
  "The preview didn't load.": "Die Vorschau konnte nicht geladen werden.", "What this affects": "Welche Auswirkungen dies hat", "Unnamed household": "Haushalt ohne Namen", owner: "verantwortliche Person", member: "Mitglied", "After processing, you won't be able to sign in to this account.": "Nach der Bearbeitung können Sie sich nicht mehr bei diesem Konto anmelden.", "Data-retention rules (e.g. for financial records) aren't published yet; the request waits until they are and can be cancelled meanwhile.": "Die Regeln zur Datenaufbewahrung (z. B. für Finanzunterlagen) sind noch nicht veröffentlicht. Der Antrag bleibt bis dahin offen und kann storniert werden.", "Resolve these first": "Zuerst erledigen", "Something else is still open.": "Es ist noch ein weiterer Vorgang offen.", View: "Ansehen", "We suggest getting a copy of your data before deleting.": "Wir empfehlen, vor der Löschung eine Kopie Ihrer Daten anzufordern.", Cancel: "Abbrechen", Continue: "Weiter", "To confirm it's you:": "Bitte bestätigen Sie Ihre Identität:", Password: "Passwort", "Resend code": "Code erneut senden", "Reason (optional)": "Begründung (optional)", "Type DELETE to confirm": "Geben Sie DELETE zur Bestätigung ein", Back: "Zurück", "Request deletion": "Löschung beantragen",
  "Wait a moment before asking for another code.": "Warten Sie kurz, bevor Sie einen neuen Code anfordern.", "The code wasn't sent.": "Der Code wurde nicht gesendet.", "That password or code isn't right.": "Das Passwort oder der Code ist nicht korrekt.", "Some things are still open; see the list above.": "Einige Vorgänge sind noch offen. Prüfen Sie die Liste oben.", "The request wasn't recorded.": "Der Antrag wurde nicht gespeichert.", "Code sent to": "Code gesendet an", "Send a code to": "Code senden an",
};

const PRIVACY_ES: Record<string, string> = {
  Privacy: "Privacidad", "Privacy details didn't load.": "No se pudo cargar la información de privacidad.", Retry: "Reintentar", Loading: "Cargando",
  "PRIVACY CENTER": "CENTRO DE PRIVACIDAD", "Data, consents & sharing": "Datos, consentimientos y accesos", "See what's required and what's optional, who can see your pets, and how to get a copy of your data or delete it.": "Consulta qué es obligatorio y qué es opcional, quién puede ver a tus mascotas y cómo obtener una copia de tus datos o solicitar su eliminación.",
  Consents: "Consentimientos", "Terms of use": "Condiciones de uso", "Privacy policy": "Política de privacidad", "Current version": "Versión actual", "Accepted on": "Aceptado el", "A newer version hasn't been accepted yet.": "Aún no has aceptado una versión más reciente.", "Your acceptance of this version isn't on record.": "No consta que hayas aceptado esta versión.", "Required to use opetlife; to stop, request account deletion.": "Es necesario para usar opetlife. Para dejar de usarlo, solicita la eliminación de tu cuenta.", Accepted: "Aceptado", "Accept current version": "Aceptar la versión actual",
  "Offers & marketing messages": "Ofertas y mensajes comerciales", "Optional and off by default. Turning it off never affects security, order, booking or health messages.": "Es opcional y está desactivado de forma predeterminada. Desactivarlo nunca afecta a los mensajes de seguridad, pedidos, reservas o salud.", "On since": "Activado desde", "Marketing messages are off.": "Los mensajes comerciales están desactivados.", "Marketing messages are on.": "Los mensajes comerciales están activados.",
  Sharing: "Accesos compartidos", "People who can currently reach pets you manage, and your access to other people's pets.": "Personas que actualmente pueden acceder a las mascotas que gestionas y tu acceso a mascotas de otras personas.", "Manage access": "Gestionar accesos", "The sharing summary didn't load.": "No se pudo cargar el resumen de accesos.", "Nothing is shared with anyone right now.": "Ahora mismo no compartes acceso con nadie.", "sees health": "puede ver los datos de salud", until: "hasta", Manage: "Gestionar",
  "Get a copy of your data": "Obtener una copia de tus datos", "We prepare a JSON file that stays available for": "Preparamos un archivo JSON que estará disponible durante", "days. Each download link works for a few minutes and every download is recorded.": "días. Cada enlace de descarga funciona durante unos minutos y cada descarga queda registrada.", "Requested — your file will be ready in a moment.": "Solicitud registrada. El archivo estará listo en breve.", "Preparing…": "Preparando…", "Request my data": "Solicitar mis datos", Requested: "Solicitado", "Available until": "Disponible hasta", "Preparing failed; please request again.": "No se pudo preparar el archivo. Solicítalo de nuevo.", Download: "Descargar",
  "Delete your account": "Eliminar tu cuenta", "Your deletion request was recorded on": "Tu solicitud de eliminación se registró el", ". It waits until the data-retention rules are published, your account keeps working meanwhile, and you can cancel it until then.": " y quedará pendiente hasta que se publiquen las reglas de conservación de datos. Tu cuenta seguirá funcionando y podrás cancelar la solicitud hasta entonces.", "Deletion is a recorded request, not an instant wipe. You'll see what it affects, confirm it's you, and can cancel it until it's processed.": "La eliminación comienza con una solicitud, no es inmediata. Verás sus efectos, confirmarás tu identidad y podrás cancelarla hasta que se procese.", "Cancel deletion request": "Cancelar la solicitud de eliminación", "Request account deletion": "Solicitar la eliminación de la cuenta", "Your deletion request was recorded.": "Se registró tu solicitud de eliminación.", "Cancel the deletion request": "Cancelar la solicitud de eliminación", "The request is cancelled and your account stays exactly as it is.": "La solicitud se cancelará y tu cuenta seguirá sin cambios.", "Cancel request": "Cancelar solicitud", "The deletion request was cancelled.": "Se canceló la solicitud de eliminación.",
  "That didn't work.": "No se pudo completar.", "This file is no longer available; request a fresh copy.": "Este archivo ya no está disponible. Solicita una copia nueva.", "You've requested several exports today; try again tomorrow.": "Hoy has solicitado varias exportaciones. Inténtalo de nuevo mañana.", "The preview didn't load.": "No se pudo cargar la vista previa.", "What this affects": "Qué se verá afectado", "Unnamed household": "Hogar sin nombre", owner: "administrador/a", member: "miembro", "After processing, you won't be able to sign in to this account.": "Después del proceso, no podrás iniciar sesión en esta cuenta.", "Data-retention rules (e.g. for financial records) aren't published yet; the request waits until they are and can be cancelled meanwhile.": "Las reglas de conservación de datos (por ejemplo, de registros financieros) aún no están publicadas. La solicitud quedará pendiente y podrás cancelarla mientras tanto.", "Resolve these first": "Resuelve primero estos asuntos", "Something else is still open.": "Hay otro asunto pendiente.", View: "Ver", "We suggest getting a copy of your data before deleting.": "Te recomendamos obtener una copia de tus datos antes de eliminarlos.", Cancel: "Cancelar", Continue: "Continuar", "To confirm it's you:": "Confirma que eres tú:", Password: "Contraseña", "Resend code": "Reenviar código", "Reason (optional)": "Motivo (opcional)", "Type DELETE to confirm": "Escribe DELETE para confirmar", Back: "Atrás", "Request deletion": "Solicitar eliminación",
  "Wait a moment before asking for another code.": "Espera un momento antes de solicitar otro código.", "The code wasn't sent.": "No se pudo enviar el código.", "That password or code isn't right.": "La contraseña o el código no son correctos.", "Some things are still open; see the list above.": "Aún hay asuntos pendientes; consulta la lista anterior.", "The request wasn't recorded.": "No se registró la solicitud.", "Code sent to": "Código enviado a", "Send a code to": "Enviar un código a",
};

function usePrivacyCopy() {
  const { locale, num } = useAccountCopy();
  const base = useAccountCopy().t;
  const t = (faText: string, enText: string, deText?: string, esText?: string, arText?: string, nlText?: string) =>
    locale === "de" ? deText ?? PRIVACY_DE[enText] ?? `[Missing de: ${enText}]` : locale === "es" ? esText ?? PRIVACY_ES[enText] ?? `[Missing es: ${enText}]` : base(faText, enText, deText, esText, arText, nlText);
  return { locale, num, t };
}

function formatSize(bytes: number | null, locale: string): string {
  if (!bytes) return "";
  const kb = bytes / 1024;
  const n = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : locale, { maximumFractionDigits: 1 });
  return kb < 1024 ? `${n.format(Math.max(1, Math.round(kb)))} ${locale === "fa" ? "کیلوبایت" : "KB"}` : `${n.format(kb / 1024)} ${locale === "fa" ? "مگابایت" : "MB"}`;
}

/**
 * Privacy Center: what you agreed to, who can see your pets, getting a copy
 * of your data, and asking for account deletion. Descriptions are product
 * facts, not legal promises — the legal text itself lives in the CMS.
 */
export function PrivacyCenterView() {
  const { t, locale, num } = usePrivacyCopy();
  const [data, setData] = useState<PrivacyCenterDto | null>(null);
  const [sharing, setSharing] = useState<SharingSummaryDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [privacy, shares] = await Promise.all([accountService.privacy(), accountService.sharing().catch(() => null)]);
      setData(privacy);
      setSharing(shares);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // While an export is being built, check back every few seconds.
  useEffect(() => {
    if (pollRef.current) clearTimeout(pollRef.current);
    if (data?.exports.some((e) => e.status === "PENDING" || e.status === "PROCESSING")) pollRef.current = setTimeout(() => void load(), 4000);
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [data, load]);

  if (failed) return <ErrorRecovery title={t("حریم خصوصی", "Privacy")} message={t("اطلاعات حریم خصوصی بارگذاری نشد.", "Privacy details didn't load.")} retryLabel={t("تلاش دوباره", "Retry")} onRetry={load} />;
  if (!data) return <Skeleton className="h-96 w-full" aria-label={t("در حال بارگذاری", "Loading")} />;

  const consent = (kind: string) => data.consents.find((c) => c.kind === kind);
  const marketing = consent("MARKETING");
  const activeExport = data.exports.find((e) => e.status === "PENDING" || e.status === "PROCESSING");
  const pendingDeletion = data.deletionRequests.find((d) => d.status === "PENDING" || d.status === "PROCESSING");

  async function run(key: string, action: () => Promise<unknown>, success?: string) {
    setBusy(key);
    setNotice(null);
    try {
      await action();
      if (success) setNotice(success);
      await load();
    } catch (err) {
      setNotice(err instanceof ApiError && err.code === "EXPORT_LIMIT_REACHED" ? t("امروز چند بار دریافت داده درخواست داده‌اید؛ فردا دوباره تلاش کنید.", "You've requested several exports today; try again tomorrow.") : t("انجام نشد.", "That didn't work."));
    } finally {
      setBusy(null);
    }
  }

  async function download(id: string) {
    setBusy(`download-${id}`);
    setNotice(null);
    try {
      const link = await accountService.downloadExport(id);
      window.location.assign(link.downloadUrl);
      await load();
    } catch {
      setNotice(t("این فایل دیگر در دسترس نیست؛ یک نسخهٔ تازه درخواست کنید.", "This file is no longer available; request a fresh copy."));
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="account-stack">
      <AccountPageHeader eyebrow={t("مرکز حریم خصوصی", "PRIVACY CENTER")} title={t("داده‌ها، رضایت‌ها و اشتراک‌گذاری", "Data, consents & sharing")} description={t("ببینید چه چیزی ضروری است، چه چیزی انتخابی است، چه کسی حیوان‌هایتان را می‌بیند و چگونه داده‌هایتان را دریافت یا حذف کنید.", "See what's required and what's optional, who can see your pets, and how to get a copy of your data or delete it.")} />
      {notice ? <div className="account-notice" role="status">{notice}</div> : null}

      <ConsentHistory />
      <section aria-labelledby="consents-title">
        <div className="account-section-title">
          <div>
            <h2 id="consents-title">{t("رضایت‌ها", "Consents")}</h2>
            {data.consentVersion ? <p>{t(`نسخهٔ فعلی: ${formatDay(data.consentVersion, "fa")}`, `Current version: ${formatAccountDate(`${data.consentVersion}T12:00:00`, locale)}`, `Aktuelle Version: ${formatAccountDate(`${data.consentVersion}T12:00:00`, locale)}`, `Versión actual: ${formatAccountDate(`${data.consentVersion}T12:00:00`, locale)}`)}</p> : null}
          </div>
        </div>
        <div className="security-list">
          {(["TERMS", "PRIVACY"] as const).map((kind) => {
            const c = consent(kind);
            return (
              <div className="security-row" key={kind}>
                <div className="security-row__icon" aria-hidden>§</div>
                <div>
                  <b>{kind === "TERMS" ? t("شرایط استفاده", "Terms of use") : t("سیاست حریم خصوصی", "Privacy policy")}</b>
                  <p>{c?.granted && c.grantedAt ? t(`پذیرفته‌شده در ${formatAccountDate(c.grantedAt, locale)}`, `Accepted on ${formatAccountDate(c.grantedAt, locale)}`, `Angenommen am ${formatAccountDate(c.grantedAt, locale)}`, `Aceptado el ${formatAccountDate(c.grantedAt, locale)}`) : c?.lastRecordedVersion ? t("نسخهٔ جدیدی منتشر شده که هنوز نپذیرفته‌اید.", "A newer version hasn't been accepted yet.") : t("پذیرش شما برای این نسخه ثبت نشده است.", "Your acceptance of this version isn't on record.")}</p>
                  <p className="text-metadata text-text-secondary">{t("لازم برای استفاده از اپت لایف؛ برای توقف، درخواست حذف حساب بدهید.", "Required to use opetlife; to stop, request account deletion.")}</p>
                </div>
                {c?.granted ? <StatusLabel tone="success">{t("پذیرفته", "Accepted")}</StatusLabel> : <Button variant="secondary" size="sm" isLoading={busy === kind} onClick={() => run(kind, () => accountService.setConsent(kind, true))}>{t("پذیرش نسخهٔ فعلی", "Accept current version")}</Button>}
              </div>
            );
          })}
          <div className="security-row">
            <div className="security-row__icon" aria-hidden>✦</div>
            <div>
              <b id="marketing-label">{t("پیام‌های تبلیغاتی و پیشنهادها", "Offers & marketing messages")}</b>
              <p>{t("انتخابی است و به‌صورت پیش‌فرض خاموش است. خاموش کردن آن هیچ اثری روی پیام‌های امنیتی، سفارش، رزرو و سلامت ندارد.", "Optional and off by default. Turning it off never affects security, order, booking or health messages.")}</p>
              {marketing?.granted && marketing.grantedAt ? <p className="text-metadata text-text-secondary">{t(`روشن از ${formatAccountDate(marketing.grantedAt, locale)}`, `On since ${formatAccountDate(marketing.grantedAt, locale)}`, `Aktiv seit ${formatAccountDate(marketing.grantedAt, locale)}`, `Activado desde ${formatAccountDate(marketing.grantedAt, locale)}`)}</p> : null}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(marketing?.granted)}
              aria-labelledby="marketing-label"
              className="account-switch"
              disabled={busy === "MARKETING"}
              onClick={() => run("MARKETING", () => accountService.setConsent("MARKETING", !marketing?.granted), marketing?.granted ? t("پیام‌های تبلیغاتی خاموش شد.", "Marketing messages are off.") : t("پیام‌های تبلیغاتی روشن شد.", "Marketing messages are on."))}
            >
              <span aria-hidden />
            </button>
          </div>
        </div>
      </section>

      <section aria-labelledby="sharing-title">
        <div className="account-section-title">
          <div>
            <h2 id="sharing-title">{t("اشتراک‌گذاری", "Sharing")}</h2>
            <p>{t("افرادی که الان به حیوان‌هایی که مدیریت می‌کنید دسترسی دارند، و دسترسی شما به حیوان‌های دیگران.", "People who can currently reach pets you manage, and your access to other people's pets.")}</p>
          </div>
          <Link className="inline-flex min-h-11 items-center text-metadata text-brand-natural" href={`/${locale}/profile/household`}>{t("مدیریت دسترسی‌ها", "Manage access")}</Link>
        </div>
        {!sharing ? (
          <p className="text-body text-text-secondary">{t("خلاصهٔ اشتراک‌گذاری بارگذاری نشد.", "The sharing summary didn't load.")}</p>
        ) : sharing.sharedByYou.length === 0 && sharing.sharedWithYou.length === 0 ? (
          <p className="text-body text-text-secondary">{t("هیچ دسترسی فعالی به دیگران داده نشده است.", "Nothing is shared with anyone right now.")}</p>
        ) : (
          <div className="security-list">
            {sharing.sharedByYou.map((share) => (
              <div className="security-row" key={share.grantId}>
                <div className="security-row__icon" aria-hidden>⇄</div>
                <div>
                  <b>{t(`${share.pet.name} — با ${share.person}`, `${share.pet.name} — with ${share.person}`, `${share.pet.name} — geteilt mit ${share.person}`, `${share.pet.name} — compartido con ${share.person}`)}</b>
                  <p>
                    {t(...SHARE_KIND[share.kind]!)}
                    {share.canViewHealth ? ` · ${t("سلامت را می‌بیند", "sees health")}` : ""}
                    {share.expiresAt ? ` · ${t("تا", "until")} ${formatAccountDate(share.expiresAt, locale)}` : ""}
                  </p>
                </div>
                <Link className="text-metadata text-brand-natural" href={`/${locale}/profile/household/pets/${share.pet.id}/access`}>{t("مدیریت", "Manage")}</Link>
              </div>
            ))}
            {sharing.sharedWithYou.map((share, index) => (
              <div className="security-row" key={`with-${share.pet.id}-${index}`}>
                <div className="security-row__icon" aria-hidden>↘</div>
                <div>
                  <b>{t(`دسترسی شما به ${share.pet.name}`, `Your access to ${share.pet.name}`, `Ihr Zugriff auf ${share.pet.name}`, `Tu acceso a ${share.pet.name}`)}</b>
                  <p>{t(...SHARE_KIND[share.kind]!)}{share.expiresAt ? ` · ${t("تا", "until")} ${formatAccountDate(share.expiresAt, locale)}` : ""}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <ContextSurface className="privacy-export">
        <div>
          <h2>{t("دریافت یک نسخه از داده‌ها", "Get a copy of your data")}</h2>
          <p>{t(`یک فایل JSON آماده می‌شود و ${num(data.exportAvailableDays)} روز برای دریافت در دسترس است. پیوند دریافت فقط چند دقیقه اعتبار دارد و هر دریافت ثبت می‌شود.`, `We prepare a JSON file that stays available for ${num(data.exportAvailableDays)} days. Each download link works for a few minutes and every download is recorded.`, `Wir erstellen eine JSON-Datei, die ${num(data.exportAvailableDays)} Tage verfügbar bleibt. Jeder Download-Link ist nur wenige Minuten gültig und jeder Download wird protokolliert.`, `Preparamos un archivo JSON que estará disponible durante ${num(data.exportAvailableDays)} días. Cada enlace de descarga funciona durante unos minutos y cada descarga queda registrada.`)}</p>
          <div className="experience-pills">
            {data.exportIncludes.map((item) => (
              <span className="experience-pill" key={item}>{SCOPE_LABELS[item] ? t(...SCOPE_LABELS[item]!) : t("بخش داده", "Data category", "Datenkategorie", "Categoría de datos", "فئة البيانات", "Gegevenscategorie")}</span>
            ))}
          </div>
        </div>
        <Button isLoading={busy === "export"} disabled={Boolean(activeExport)} onClick={() => run("export", () => accountService.requestExport(), t("درخواست ثبت شد؛ فایل چند لحظهٔ دیگر آماده می‌شود.", "Requested — your file will be ready in a moment."))}>
          {activeExport ? t("در حال آماده‌سازی…", "Preparing…") : t("درخواست فایل", "Request my data")}
        </Button>
      </ContextSurface>
      {data.exports.length > 0 ? (
        <div className="security-list">
          {data.exports.map((request) => {
            const status = EXPORT_STATUS[request.status];
            return (
              <div className="security-row" key={request.id}>
                <div className="security-row__icon" aria-hidden>⇩</div>
                <div>
                  <b>{t("درخواست", "Requested")} {formatAccountDate(request.requestedAt, locale, true)}</b>
                  <p>
                    {request.status === "READY" && request.expiresAt ? t(`تا ${formatAccountDate(request.expiresAt, locale)} قابل دریافت`, `Available until ${formatAccountDate(request.expiresAt, locale)}`, `Verfügbar bis ${formatAccountDate(request.expiresAt, locale)}`, `Disponible hasta ${formatAccountDate(request.expiresAt, locale)}`) : request.status === "FAILED" ? t("آماده‌سازی ناموفق بود؛ دوباره درخواست دهید.", "Preparing failed; please request again.") : ""}
                    {request.fileSizeBytes ? ` · ${formatSize(request.fileSizeBytes, locale)}` : ""}
                    {request.downloadCount ? ` · ${t(`${num(request.downloadCount)} بار دریافت شده`, `downloaded ${num(request.downloadCount)}×`, `${num(request.downloadCount)}× heruntergeladen`, `descargado ${num(request.downloadCount)}×`)}` : ""}
                  </p>
                </div>
                <div className="member-row__actions">
                  <StatusLabel tone={status.tone}>{locale === "fa" ? status.fa : locale === "de" ? status.de : locale === "es" ? status.es : status.en}</StatusLabel>
                  {request.status === "READY" ? <Button variant="secondary" size="sm" isLoading={busy === `download-${request.id}`} onClick={() => download(request.id)}>{t("دریافت", "Download")}</Button> : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <section className="danger-zone" aria-labelledby="delete-title">
        <div>
          <h2 id="delete-title">{t("حذف حساب", "Delete your account")}</h2>
          {pendingDeletion ? (
            <p>{t(`درخواست حذف شما در ${formatAccountDate(pendingDeletion.requestedAt, locale)} ثبت شده است. تا زمان انتشار قواعد نگهداری داده، درخواست در انتظار می‌ماند و حساب شما همچنان کار می‌کند؛ تا آن زمان می‌توانید آن را لغو کنید.`, `Your deletion request was recorded on ${formatAccountDate(pendingDeletion.requestedAt, locale)}. It waits until the data-retention rules are published, your account keeps working meanwhile, and you can cancel it until then.`, `Ihr Löschantrag wurde am ${formatAccountDate(pendingDeletion.requestedAt, locale)} gespeichert. Er bleibt offen, bis die Regeln zur Datenaufbewahrung veröffentlicht sind. Ihr Konto bleibt bis dahin aktiv und Sie können den Antrag stornieren.`, `Tu solicitud de eliminación se registró el ${formatAccountDate(pendingDeletion.requestedAt, locale)} y quedará pendiente hasta que se publiquen las reglas de conservación de datos. Tu cuenta seguirá funcionando y podrás cancelarla hasta entonces.`)}</p>
          ) : (
            <p>{t("حذف یک درخواست ثبت‌شده است، نه پاک شدن فوری. ابتدا پیامدها را می‌بینید، هویت خود را تأیید می‌کنید و تا زمان پردازش می‌توانید آن را لغو کنید.", "Deletion is a recorded request, not an instant wipe. You'll see what it affects, confirm it's you, and can cancel it until it's processed.")}</p>
          )}
        </div>
        {pendingDeletion ? (
          <Button variant="secondary" onClick={() => setCancelId(pendingDeletion.id)}>{t("لغو درخواست حذف", "Cancel deletion request")}</Button>
        ) : (
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>{t("درخواست حذف حساب", "Request account deletion")}</Button>
        )}
      </section>

      {deleteOpen ? (
        <DeleteAccountDialog
          onClose={() => setDeleteOpen(false)}
          onDone={async () => {
            setDeleteOpen(false);
            setNotice(t("درخواست حذف ثبت شد.", "Your deletion request was recorded."));
            await load();
          }}
        />
      ) : null}
      {cancelId ? (
        <ConfirmActionDialog
          open
          destructive={false}
          onClose={() => setCancelId(null)}
          title={t("لغو درخواست حذف", "Cancel the deletion request")}
          consequences={[t("درخواست حذف لغو می‌شود و حساب شما بدون تغییر باقی می‌ماند.", "The request is cancelled and your account stays exactly as it is.")]}
          confirmLabel={t("لغو درخواست", "Cancel request")}
          onConfirm={async () => {
            await accountService.cancelDeletion(cancelId);
            setNotice(t("درخواست حذف لغو شد.", "The deletion request was cancelled."));
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function DeleteAccountDialog({ onClose, onDone }: { onClose: () => void; onDone: () => Promise<void> }) {
  const { t, locale, num } = usePrivacyCopy();
  const [preview, setPreview] = useState<DeletionPreviewDto | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [step, setStep] = useState<"impact" | "confirm">("impact");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    accountService.deletionPreview().then(setPreview).catch(() => setLoadError(true));
  }, []);

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      setCodeSentTo((await accountService.sendDeletionCode()).sentTo);
    } catch (err) {
      setError(err instanceof ApiError && err.code === "OTP_RATE_LIMITED" ? t("کمی صبر کنید و دوباره کد بخواهید.", "Wait a moment before asking for another code.") : t("کد ارسال نشد.", "The code wasn't sent."));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await accountService.requestDeletion({ confirmation: typed.trim(), password: password || undefined, code: code || undefined, reason: reason.trim() || undefined });
      await onDone();
    } catch (err) {
      if (err instanceof ApiError && err.code === "REAUTHENTICATION_REQUIRED") setError(t("رمز یا کد درست نیست.", "That password or code isn't right."));
      else if (err instanceof ApiError && err.code === "DELETION_BLOCKED") setError(t("هنوز مواردی باز است؛ فهرست بالا را ببینید.", "Some things are still open; see the list above."));
      else setError(t("درخواست ثبت نشد.", "The request wasn't recorded."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={() => (busy ? undefined : onClose())} title={t("درخواست حذف حساب", "Request account deletion")}>
      <div className="confirm-action">
        {loadError ? <p role="alert" className="text-body text-state-urgent">{t("پیش‌نمایش بارگذاری نشد.", "The preview didn't load.")}</p> : null}
        {!preview && !loadError ? <Skeleton className="h-40 w-full" aria-label={t("در حال بارگذاری", "Loading")} /> : null}
        {preview && step === "impact" ? (
          <>
            <div>
              <p className="confirm-action__label">{t("چه چیزی تحت تأثیر قرار می‌گیرد", "What this affects")}</p>
              <ul>
                {preview.households.map((h) => (
                  <li key={h.id}>
                    {h.name || t("خانهٔ بدون نام", "Unnamed household")}: {h.role === "OWNER" ? t("مدیر", "owner", "verantwortliche Person", "administrador/a", "المالك", "eigenaar") : t("عضو", "member")}, {t(`${num(h.pets)} حیوان`, `${num(h.pets)} pet(s)`, `${num(h.pets)} ${h.pets === 1 ? "Tier" : "Tiere"}`, `${num(h.pets)} ${h.pets === 1 ? "mascota" : "mascotas"}`)}
                    {h.otherMembers ? t(`، ${num(h.otherMembers)} عضو دیگر دسترسی خود را حفظ می‌کنند`, `; ${num(h.otherMembers)} other member(s) keep their access`, `; ${num(h.otherMembers)} weitere Mitglieder behalten ihren Zugriff`, `; ${num(h.otherMembers)} miembros más conservarán el acceso`) : ""}
                    {h.membershipStatus && MEMBERSHIP_STATUS[h.membershipStatus] ? t(`، عضویت: ${MEMBERSHIP_STATUS[h.membershipStatus]![0]}`, `; membership: ${MEMBERSHIP_STATUS[h.membershipStatus]![1]}`, `; Mitgliedschaft: ${MEMBERSHIP_STATUS[h.membershipStatus]![2]}`, `; estado de membresía: ${MEMBERSHIP_STATUS[h.membershipStatus]![3]}`) : ""}
                  </li>
                ))}
                <li>{t("پس از پردازش، ورود به این حساب ممکن نخواهد بود.", "After processing, you won't be able to sign in to this account.")}</li>
                <li>{t("قواعد نگهداری داده (مثلاً سوابق مالی) هنوز منتشر نشده است؛ درخواست تا آن زمان در انتظار می‌ماند و قابل لغو است.", "Data-retention rules (e.g. for financial records) aren't published yet; the request waits until they are and can be cancelled meanwhile.")}</li>
              </ul>
            </div>
            {preview.blockers.length > 0 ? (
              <div>
                <p className="confirm-action__label">{t("پیش از درخواست باید حل شوند", "Resolve these first")}</p>
                <ul>
                  {preview.blockers.map((b) => {
                    const copy = BLOCKER_COPY[b.code];
                    return (
                      <li key={b.code}>
                        {copy ? (locale === "fa" ? copy.fa : locale === "de" ? copy.de : locale === "es" ? copy.es : copy.en) : t("مورد باز دیگری وجود دارد.", "Something else is still open.")} {b.count > 1 ? `(${num(b.count)})` : ""}
                        {copy?.href ? <> · <Link href={`/${locale}${copy.href}`} className="text-brand-natural">{t("مشاهده", "View")}</Link></> : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
            <p className="text-metadata text-text-secondary">{t("پیشنهاد می‌کنیم پیش از حذف، یک نسخه از داده‌های خود را دریافت کنید.", "We suggest getting a copy of your data before deleting.")}</p>
            <div className="confirm-action__buttons">
              <Button variant="ghost" onClick={onClose}>{t("انصراف", "Cancel")}</Button>
              <Button variant="danger" disabled={!preview.canRequest} onClick={() => setStep("confirm")}>{t("ادامه", "Continue")}</Button>
            </div>
          </>
        ) : null}
        {preview && step === "confirm" ? (
          <>
            <p className="text-body text-text-secondary">{t("برای اطمینان از اینکه خودتان هستید:", "To confirm it's you:")}</p>
            {preview.reauth.password ? <PasswordInput label={t("رمز عبور", "Password")} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /> : null}
            {preview.reauth.code ? (
              <div className="flex flex-col gap-2">
                {codeSentTo ? <Input label={t(`کد ارسال‌شده به ${codeSentTo}`, `Code sent to ${codeSentTo}`, `Code gesendet an ${codeSentTo}`, `Código enviado a ${codeSentTo}`)} inputMode="numeric" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} /> : null}
                <div>
                  <Button variant="secondary" size="sm" isLoading={busy && !codeSentTo} onClick={sendCode}>{codeSentTo ? t("ارسال دوبارهٔ کد", "Resend code") : t(`ارسال کد به ${preview.reauth.code}`, `Send a code to ${preview.reauth.code}`, `Code senden an ${preview.reauth.code}`, `Enviar un código a ${preview.reauth.code}`)}</Button>
                </div>
              </div>
            ) : null}
            <Input label={t("دلیل (اختیاری)", "Reason (optional)")} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
            <Input label={t("برای تأیید DELETE را بنویسید", "Type DELETE to confirm")} dir="ltr" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
            {error ? <p role="alert" className="text-body text-state-urgent">{error}</p> : null}
            <div className="confirm-action__buttons">
              <Button variant="ghost" onClick={() => setStep("impact")} disabled={busy}>{t("بازگشت", "Back")}</Button>
              <Button variant="danger" isLoading={busy && Boolean(typed)} disabled={typed.trim() !== "DELETE" || (!password && !code)} onClick={submit}>{t("ثبت درخواست حذف", "Request deletion")}</Button>
            </div>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
