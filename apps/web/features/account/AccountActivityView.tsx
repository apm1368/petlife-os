"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Skeleton } from "@petlife/ui";
import { accountService, type AccountActivityItemDto, type ActivityGroupValue } from "@/services/account.service";
import { SystemState } from "@/features/system/SystemState";
import { AccountPageHeader } from "./AccountNav";
import { formatAccountDate, useAccountCopy } from "./account-copy";

const PAGE_SIZE = 25;

const FILTERS: Array<{ value: ActivityGroupValue | "ALL"; fa: string; en: string; de: string; es: string; ar: string; nl: string }> = [
  { value: "ALL", fa: "همه", en: "All", de: "Alle", es: "Todo", ar: "الكل", nl: "Alle" },
  { value: "SECURITY", fa: "امنیت", en: "Security", de: "Sicherheit", es: "Seguridad", ar: "الأمان", nl: "Beveiliging" },
  { value: "PRIVACY", fa: "حریم خصوصی", en: "Privacy", de: "Datenschutz", es: "Privacidad", ar: "الخصوصية", nl: "Privacy" },
  { value: "HOUSEHOLD", fa: "خانواده", en: "Household", de: "Haushalt", es: "Hogar", ar: "الأسرة", nl: "Huishouden" },
  { value: "MEMBERSHIP", fa: "عضویت", en: "Membership", de: "Mitgliedschaft", es: "Membresía", ar: "العضوية", nl: "Lidmaatschap" },
];

const TITLES: Record<string, [string, string, string, string, string, string]> = {
  UserAuthenticated: ["ورود به حساب", "Signed in", "Angemeldet", "Sesión iniciada", "تسجيل الدخول", "Ingelogd"], PasswordChanged: ["رمز عبور تغییر کرد", "Password changed", "Passwort geändert", "Contraseña cambiada", "تم تغيير كلمة المرور", "Wachtwoord gewijzigd"],
  PasswordResetCompleted: ["رمز عبور بازیابی شد", "Password reset", "Passwort zurückgesetzt", "Contraseña restablecida", "تمت إعادة تعيين كلمة المرور", "Wachtwoord hersteld"], SessionRevoked: ["یک دستگاه خارج شد", "A device was signed out", "Ein Gerät wurde abgemeldet", "Se cerró la sesión de un dispositivo", "تم تسجيل خروج جهاز", "Een apparaat is uitgelogd"],
  OtherSessionsRevoked: ["خروج از سایر دستگاه‌ها", "Other devices signed out", "Andere Geräte abgemeldet", "Sesión cerrada en otros dispositivos", "تم تسجيل خروج الأجهزة الأخرى", "Andere apparaten uitgelogd"], AllSessionsRevoked: ["خروج از همهٔ دستگاه‌ها", "Signed out everywhere", "Überall abgemeldet", "Sesión cerrada en todos los dispositivos", "تم تسجيل الخروج من كل الأجهزة", "Overal uitgelogd"],
  ContactChanged: ["راه تماس تغییر کرد", "Contact method changed", "Kontaktmethode geändert", "Medio de contacto actualizado", "تم تغيير وسيلة التواصل", "Contactmethode gewijzigd"], UnverifiedCredentialsCleared: ["رمز تأییدنشده حذف شد", "Unverified password removed", "Unbestätigtes Passwort entfernt", "Se eliminó la contraseña no verificada", "أُزيلت كلمة مرور غير مُتحقق منها", "Niet-geverifieerd wachtwoord verwijderd"], UnprovenContactReleased: ["راه تماس تأییدنشده از حساب برداشته شد", "Unverified contact removed from this account", "Unbestätigter Kontakt aus dem Konto entfernt", "Se quitó un contacto no verificado de la cuenta", "أُزيلت وسيلة تواصل غير مُتحقق منها من هذا الحساب", "Niet-geverifieerd contact verwijderd uit dit account"],
  ConsentChanged: ["رضایت تغییر کرد", "Consent changed", "Einwilligung geändert", "Consentimiento actualizado", "تم تغيير الموافقة", "Toestemming gewijzigd"], DataExportRequested: ["درخواست نسخهٔ داده", "Data copy requested", "Datenkopie angefordert", "Copia de datos solicitada", "طُلبت نسخة من البيانات", "Kopie van gegevens aangevraagd"],
  DataExportReady: ["نسخهٔ داده آماده شد", "Data copy ready", "Datenkopie bereit", "Copia de datos lista", "نسخة البيانات جاهزة", "Kopie van gegevens klaar"], DataExportDownloaded: ["نسخهٔ داده دریافت شد", "Data copy downloaded", "Datenkopie heruntergeladen", "Copia de datos descargada", "تم تنزيل نسخة البيانات", "Kopie van gegevens gedownload"],
  AccountDeletionRequested: ["درخواست حذف حساب", "Account deletion requested", "Kontolöschung angefordert", "Eliminación de cuenta solicitada", "طُلب حذف الحساب", "Verwijdering van account aangevraagd"], AccountDeletionCancelled: ["درخواست حذف لغو شد", "Deletion request cancelled", "Löschanfrage zurückgezogen", "Solicitud de eliminación cancelada", "أُلغي طلب الحذف", "Verwijderverzoek geannuleerd"],
  HouseholdInvitationAccepted: ["پذیرش دعوت خانواده", "Joined a household", "Haushalt beigetreten", "Se unió a un hogar", "انضممت إلى أسرة", "Lid geworden van een huishouden"], HouseholdInvitationDeclined: ["رد دعوت خانواده", "Declined a household invitation", "Haushaltseinladung abgelehnt", "Se rechazó una invitación al hogar", "رفضت دعوة إلى أسرة", "Uitnodiging voor huishouden afgewezen"],
  HouseholdMembershipRequested: ["درخواست عضویت خانوادگی", "Requested household membership", "Haushaltsmitgliedschaft angefragt", "Se solicitó unirse al hogar", "طلبت عضوية في أسرة", "Lidmaatschap van huishouden aangevraagd"], HouseholdMembershipApproved: ["عضویت خانوادگی تأیید شد", "Household membership approved", "Haushaltsmitgliedschaft bestätigt", "Membresía del hogar aprobada", "تمت الموافقة على عضوية الأسرة", "Lidmaatschap van huishouden goedgekeurd"],
  HouseholdMembershipRejected: ["درخواست عضویت خانوادگی رد شد", "Household membership request declined", "Anfrage zur Haushaltsmitgliedschaft abgelehnt", "Solicitud de membresía del hogar rechazada", "رُفض طلب عضوية الأسرة", "Verzoek om lidmaatschap van huishouden afgewezen"], HouseholdMemberLeft: ["ترک خانواده", "Left a household", "Haushalt verlassen", "Se salió del hogar", "غادرت أسرة", "Huishouden verlaten"],
  SubscriptionStarted: ["عضویت آغاز شد", "Membership started", "Mitgliedschaft begonnen", "Suscripción iniciada", "بدأت العضوية", "Lidmaatschap gestart"], SubscriptionRenewed: ["عضویت تمدید شد", "Membership renewed", "Mitgliedschaft verlängert", "Suscripción renovada", "تم تجديد العضوية", "Lidmaatschap verlengd"],
  SubscriptionRenewalFailed: ["پرداخت تمدید انجام نشد", "Renewal payment failed", "Verlängerungszahlung fehlgeschlagen", "Falló el pago de renovación", "فشل دفع التجديد", "Betaling voor verlenging mislukt"], SubscriptionGraceStarted: ["مهلت پرداخت آغاز شد", "Payment grace period started", "Zahlungsfrist begonnen", "Comenzó el periodo de gracia de pago", "بدأت فترة السماح للدفع", "Respijtperiode voor betaling gestart"],
  SubscriptionExpired: ["عضویت پایان یافت", "Membership ended", "Mitgliedschaft beendet", "Suscripción finalizada", "انتهت العضوية", "Lidmaatschap beëindigd"], SubscriptionPlanChanged: ["طرح عضویت تغییر کرد", "Membership plan changed", "Mitgliedschaftstarif geändert", "Plan de suscripción cambiado", "تم تغيير خطة العضوية", "Lidmaatschapsplan gewijzigd"],
  SubscriptionDowngradeScheduled: ["تغییر طرح برای پایان دوره", "Plan change scheduled", "Tarifwechsel vorgemerkt", "Cambio de plan programado", "تمت جدولة تغيير الخطة", "Planwijziging ingepland"], SubscriptionCancelRequested: ["لغو عضویت ثبت شد", "Membership cancellation requested", "Kündigung der Mitgliedschaft angefragt", "Cancelación de suscripción solicitada", "طُلب إلغاء العضوية", "Opzegging van lidmaatschap aangevraagd"],
  SubscriptionCancelReversed: ["عضویت ادامه یافت", "Membership resumed", "Mitgliedschaft fortgesetzt", "Suscripción reanudada", "استُؤنفت العضوية", "Lidmaatschap hervat"],
};

const METHOD: Record<string, [string, string, string, string, string, string]> = { OTP: ["با کد یک‌بارمصرف", "with a one-time code", "mit einem Einmalcode", "con un código de un solo uso", "برمز لمرة واحدة", "met een eenmalige code"], PASSWORD: ["با رمز عبور", "with a password", "mit einem Passwort", "con una contraseña", "بكلمة مرور", "met een wachtwoord"], GOOGLE: ["با Google", "with Google", "mit Google", "con Google", "عبر Google", "met Google"] };
const CONSENT: Record<string, [string, string, string, string, string, string]> = { TERMS: ["شرایط استفاده", "Terms of use", "Nutzungsbedingungen", "Términos de uso", "شروط الاستخدام", "Gebruiksvoorwaarden"], PRIVACY: ["سیاست حریم خصوصی", "Privacy policy", "Datenschutzerklärung", "Política de privacidad", "سياسة الخصوصية", "Privacybeleid"], MARKETING: ["پیام‌های تبلیغاتی", "Marketing messages", "Werbenachrichten", "Mensajes promocionales", "الرسائل التسويقية", "Marketingberichten"] };

/**
 * Account activity — a bounded reference view over the person's own events
 * (the source records stay in their domains). Summaries use only the
 * whitelisted detail the API returns; dates follow the locale's calendar.
 */
export function AccountActivityView() {
  const { t, locale, num } = useAccountCopy();
  const [filter, setFilter] = useState<ActivityGroupValue | "ALL">("ALL");
  const [items, setItems] = useState<AccountActivityItemDto[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (group: ActivityGroupValue | "ALL") => {
    setFailed(false);
    setItems(null);
    try {
      const page = await accountService.activity({ group: group === "ALL" ? undefined : group, limit: PAGE_SIZE });
      setItems(page.items);
      setCursor(page.nextCursor);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await accountService.activity({ group: filter === "ALL" ? undefined : filter, before: cursor, limit: PAGE_SIZE });
      setItems((current) => [...(current ?? []), ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      setFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  function summary(item: AccountActivityItemDto): string | null {
    const d = item.detail;
    if (item.type === "UserAuthenticated") return [d.method && METHOD[d.method] ? t(...METHOD[d.method]!) : null, d.device].filter(Boolean).join(" · ") || null;
    if (item.type === "ConsentChanged" && d.kind) return `${CONSENT[d.kind] ? t(...CONSENT[d.kind]!) : d.kind}: ${d.granted ? t("پذیرفته شد", "given", "erteilt", "concedido", "مُنحت", "gegeven") : t("پس گرفته شد", "withdrawn", "widerrufen", "retirado", "سُحبت", "ingetrokken")}`;
    if (item.type === "ContactChanged" && d.kind) return d.kind === "email" ? t("ایمیل", "Email", "E-Mail", "Correo electrónico", "البريد الإلكتروني", "E-mail") : t("موبایل", "Mobile", "Mobiltelefon", "Móvil", "الهاتف المحمول", "Mobiel");
    if ((item.type === "OtherSessionsRevoked" || item.type === "AllSessionsRevoked") && typeof d.count === "number") return t(`${num(d.count)} دستگاه`, `${num(d.count)} device(s)`, `${num(d.count)} Geräte`, `${num(d.count)} dispositivos`);
    if (item.type === "SubscriptionStarted" && d.isTrial) return t("دورهٔ آزمایشی", "Trial", "Testphase", "Prueba", "فترة تجريبية", "Proefperiode");
    if (item.type === "SubscriptionCancelRequested" && d.effectiveAt) return t(`پایان در ${formatAccountDate(d.effectiveAt, locale)}`, `Ends ${formatAccountDate(d.effectiveAt, locale)}`, `Endet am ${formatAccountDate(d.effectiveAt, locale)}`, `Finaliza el ${formatAccountDate(d.effectiveAt, locale)}`);
    if (item.type === "SubscriptionRenewed" && d.recovered) return t("پس از تأخیر در پرداخت", "After a late payment", "Nach verspäteter Zahlung", "Tras un pago atrasado", "بعد تأخر في الدفع", "Na een te late betaling");
    return null;
  }

  return (
    <div className="account-stack">
      <AccountPageHeader eyebrow={t("تاریخچه", "ACTIVITY", "AKTIVITÄTEN", "ACTIVIDAD", "النشاط", "ACTIVITEIT")} title={t("فعالیت‌های حساب", "Account activity", "Kontoaktivitäten", "Actividad de la cuenta", "نشاط الحساب", "Accountactiviteit")} description={t("ورودها، تغییرهای امنیتی، حریم خصوصی، خانواده و عضویت — فقط رویدادهای مربوط به خود شما.", "Sign-ins and changes to security, privacy, households and membership — only events about you.", "Anmeldungen und Änderungen an Sicherheit, Datenschutz, Haushalt und Mitgliedschaft – nur Ereignisse zu Ihrem Konto.", "Inicios de sesión y cambios de seguridad, privacidad, hogar y suscripción: solo eventos de tu cuenta.", "عمليات تسجيل الدخول والتغييرات في الأمان والخصوصية والأسر والعضوية — الأحداث المتعلقة بك فقط.", "Inlogs en wijzigingen in beveiliging, privacy, huishoudens en lidmaatschap — alleen gebeurtenissen over jou.")} />

      <div className="activity-filters" role="group" aria-label={t("نوع فعالیت", "Activity type", "Aktivitätstyp", "Tipo de actividad", "نوع النشاط", "Type activiteit")}>
        {FILTERS.map((option) => (
          <button key={option.value} type="button" aria-pressed={filter === option.value} className="activity-filter" onClick={() => setFilter(option.value)}>
            {option[locale]}
          </button>
        ))}
      </div>

      {failed ? (
        <SystemState kind="GENERIC_RETRYABLE_ERROR" onRetry={() => void load(filter)} />
      ) : !items ? (
        <Skeleton className="h-72 w-full" aria-label={t("در حال بارگذاری", "Loading", "Wird geladen", "Cargando", "جارٍ التحميل", "Laden")} />
      ) : items.length === 0 ? (
        <EmptyState title={t("فعالیتی برای نمایش نیست", "Nothing to show here yet", "Hier gibt es noch nichts zu sehen", "Todavía no hay actividad para mostrar", "لا شيء لعرضه هنا بعد", "Hier is nog niets te zien")} description={t("رویدادهای مهم حساب شما اینجا نمایش داده می‌شوند.", "Important events on your account will appear here.", "Wichtige Ereignisse zu Ihrem Konto werden hier angezeigt.", "Aquí aparecerán los eventos importantes de tu cuenta.", "ستظهر هنا الأحداث المهمة في حسابك.", "Belangrijke gebeurtenissen in je account verschijnen hier.")} />
      ) : (
        <>
          <ol className="activity-list">
            {items.map((item) => {
              const title = TITLES[item.type];
              const extra = summary(item);
              const titleIndex = ({ fa: 0, en: 1, de: 2, es: 3, ar: 4, nl: 5 } as const)[locale];
              return (
                <li key={item.id}>
                  <span aria-hidden />
                  <p>
                    <b>{title ? title[titleIndex] : t("رویداد حساب", "Account event", "Kontoereignis", "Evento de cuenta", "حدث في الحساب", "Accountgebeurtenis")}</b>
                    {extra ? <small className="activity-detail">{extra}</small> : null}
                    <small>
                      <time dateTime={item.occurredAt}>{formatAccountDate(item.occurredAt, locale, true)}</time>
                    </small>
                  </p>
                </li>
              );
            })}
          </ol>
          {cursor ? (
            <div>
              <Button variant="secondary" isLoading={loadingMore} onClick={loadMore}>{t("نمایش موارد قدیمی‌تر", "Show older", "Ältere Einträge anzeigen", "Mostrar anteriores", "عرض الأقدم", "Oudere tonen")}</Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
