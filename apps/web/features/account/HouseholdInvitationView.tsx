"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, Skeleton } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { householdsService } from "@/services/households.service";
import { SystemState, type SystemStateKind } from "@/features/system/SystemState";
import { formatAccountDate, useAccountCopy } from "./account-copy";

type Invitation = Awaited<ReturnType<typeof householdsService.inspectInvitation>>;
type Failure = { kind: SystemStateKind; title?: [string, string, string, string, string, string]; body?: [string, string, string, string, string, string] };

/** Maps the invitation API's codes to a safe, specific state — never its raw message. */
function invitationFailure(error: unknown): Failure {
  const code = error instanceof ApiError ? error.code : null;
  switch (code) {
    case "INVITATION_EXPIRED":
      return { kind: "LINK_EXPIRED", title: ["این دعوت منقضی شده است", "This invitation has expired", "Diese Einladung ist abgelaufen", "Esta invitación ha caducado", "انتهت صلاحية هذه الدعوة", "Deze uitnodiging is verlopen"], body: ["دعوت‌ها ۷ روز اعتبار دارند. از کسی که شما را دعوت کرده بخواهید دعوت تازه‌ای بفرستد.", "Invitations last 7 days. Ask the person who invited you to send a new one.", "Einladungen sind 7 Tage gültig. Bitte die einladende Person um einen neuen Link.", "Las invitaciones duran 7 días. Pide a quien te invitó que envíe una nueva.", "تبقى الدعوات صالحة 7 أيام. اطلب من الشخص الذي دعاك إرسال دعوة جديدة.", "Uitnodigingen zijn 7 dagen geldig. Vraag degene die je heeft uitgenodigd om een nieuwe te sturen."] };
    case "INVITATION_ALREADY_USED":
      return { kind: "LINK_EXPIRED", title: ["به این دعوت قبلاً پاسخ داده شده است", "This invitation was already answered", "Diese Einladung wurde bereits beantwortet", "Esta invitación ya tiene una respuesta", "تم الرد على هذه الدعوة بالفعل", "Deze uitnodiging is al beantwoord"], body: ["اگر آن را پذیرفته‌اید، خانواده را در بخش حساب می‌بینید.", "If you accepted it, you'll find the household in your account.", "Wenn Sie sie angenommen haben, finden Sie den Haushalt in Ihrem Konto.", "Si la aceptaste, encontrarás el hogar en tu cuenta.", "إذا قبلتها، فستجد الأسرة في حسابك.", "Als je hem hebt geaccepteerd, vind je het huishouden in je account."] };
    case "INVITATION_REVOKED":
      return { kind: "ACCESS_REVOKED", title: ["این دعوت لغو شده است", "This invitation was cancelled", "Diese Einladung wurde zurückgezogen", "Esta invitación se ha cancelado", "أُلغيت هذه الدعوة", "Deze uitnodiging is geannuleerd"], body: ["خانواده این دعوت را پس گرفته است.", "The household withdrew this invitation.", "Der Haushalt hat diese Einladung zurückgezogen.", "El hogar retiró esta invitación.", "سحبت الأسرة هذه الدعوة.", "Het huishouden heeft deze uitnodiging ingetrokken."] };
    case "INVITATION_NOT_FOR_YOU":
      return { kind: "FORBIDDEN", title: ["این دعوت برای حساب دیگری است", "This invitation is for a different account", "Diese Einladung ist für ein anderes Konto", "Esta invitación es para otra cuenta", "هذه الدعوة لحساب آخر", "Deze uitnodiging is voor een ander account"], body: ["دعوت به ایمیل یا موبایل دیگری فرستاده شده است. با همان ایمیل یا موبایل وارد شوید.", "It was sent to another email or phone number. Sign in with that one to open it.", "Sie wurde an eine andere E-Mail-Adresse oder Telefonnummer gesendet. Melden Sie sich mit diesen Daten an.", "Se envió a otro correo o número de teléfono. Inicia sesión con esos datos.", "أُرسلت إلى بريد إلكتروني أو رقم هاتف آخر. سجّل الدخول به لفتحها.", "Hij is naar een ander e-mailadres of telefoonnummer gestuurd. Log daarmee in om hem te openen."] };
    case "NOT_FOUND":
      return { kind: "NOT_FOUND", title: ["این دعوت پیدا نشد", "We couldn't find this invitation", "Diese Einladung wurde nicht gefunden", "No encontramos esta invitación", "لم نعثر على هذه الدعوة", "We konden deze uitnodiging niet vinden"], body: ["پیوند ممکن است ناقص باشد. پیوند کامل را دوباره باز کنید یا دعوت تازه بخواهید.", "The link may be incomplete. Open the full link again or ask for a new invitation.", "Der Link ist möglicherweise unvollständig. Öffnen Sie den vollständigen Link oder bitten Sie um eine neue Einladung.", "Puede que el enlace esté incompleto. Abre el enlace completo o pide una invitación nueva.", "قد يكون الرابط غير مكتمل. افتح الرابط الكامل مرة أخرى أو اطلب دعوة جديدة.", "De link is mogelijk onvolledig. Open de volledige link opnieuw of vraag om een nieuwe uitnodiging."] };
    default:
      if (error instanceof ApiError && error.status === 401) return { kind: "AUTH_REQUIRED" };
      return { kind: "GENERIC_RETRYABLE_ERROR" };
  }
}

/**
 * Household invitation. The household and inviter are only shown once the
 * API confirms the invitation is live and addressed to this account; every
 * failure (expired, already answered, cancelled, someone else's, unknown)
 * has its own plain explanation, and accept/decline errors are never
 * swallowed.
 */
export function HouseholdInvitationView({ token }: { token: string }) {
  const { t, locale } = useAccountCopy();
  const router = useRouter();
  const [data, setData] = useState<Invitation | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState<"request" | "decline" | null>(null);
  const [requestSubmitted, setRequestSubmitted] = useState(false);

  const load = useCallback(async () => {
    setFailure(null);
    try {
      setData(await householdsService.inspectInvitation(token));
    } catch (err) {
      setFailure(invitationFailure(err));
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(kind: "request" | "decline") {
    setBusy(kind);
    try {
      if (kind === "request") {
        await householdsService.requestMembership(token);
        setRequestSubmitted(true);
      } else {
        await householdsService.declineInvitation(token);
        router.replace(`/${locale}/profile`);
      }
    } catch (err) {
      setData(null);
      setFailure(invitationFailure(err));
    } finally {
      setBusy(null);
    }
  }

  if (failure) {
    return (
      <SystemState
        kind={failure.kind}
        title={failure.title ? t(...failure.title) : undefined}
        description={failure.body ? t(...failure.body) : undefined}
        onRetry={failure.kind === "GENERIC_RETRYABLE_ERROR" ? () => void load() : undefined}
        returnTo={`/${locale}/invitations/${token}`}
        secondary={{ label: t("رفتن به حساب", "Go to your account", "Zum Konto", "Ir a tu cuenta", "انتقل إلى حسابك", "Naar je account"), href: `/${locale}/profile` }}
      />
    );
  }
  if (!data) return <Skeleton className="h-72 w-full" aria-label={t("در حال بارگذاری", "Loading", "Wird geladen", "Cargando", "جارٍ التحميل", "Laden")} />;

  const pending = requestSubmitted || data.requestPending;

  return (
    <div className="mx-auto max-w-2xl">
      <ContextSurface className="flex flex-col gap-5">
        <p className="experience-eyebrow">{t("درخواست عضویت خانوادگی", "HOUSEHOLD MEMBERSHIP REQUEST", "ANFRAGE AUF FAMILIENMITGLIEDSCHAFT", "SOLICITUD DE ADHESIÓN FAMILIAR", "طلب عضوية في أسرة", "VERZOEK OM LIDMAATSCHAP VAN HUISHOUDEN")}</p>
        <h1 className="text-page-title">{pending ? t("درخواست شما در انتظار بررسی مدیر خانواده است", "Your request is waiting for the household owner", "Ihre Anfrage wartet auf die Entscheidung der haushaltsverantwortlichen Person", "Tu solicitud está pendiente de la aprobación de la persona responsable del hogar", "طلبك بانتظار مالك الأسرة", "Je verzoek wacht op de eigenaar van het huishouden") : t("درخواست پیوستن به یک خانواده", "Request to join a household", "Einem Haushalt beitreten", "Solicitar unirse a un hogar", "طلب الانضمام إلى أسرة", "Verzoek om lid te worden van een huishouden")}</h1>
        <p className="text-body text-text-secondary">{t("شمارهٔ واردشده در دعوت: ", "Invited mobile: ", "Eingeladene Telefonnummer: ", "Teléfono invitado: ", "رقم الهاتف المدعو: ", "Uitgenodigd mobiel nummer: ")}<bdi dir="ltr">{data.contactMasked}</bdi></p>
        <p className="text-body text-text-secondary">{data.phoneVerified
          ? t("شمارهٔ این حساب تأیید شده است؛ با این حال عضویت و دسترسی به پت‌ها فقط پس از تأیید مدیر خانواده فعال می‌شود.", "This account's mobile is verified. Household membership and pet access still begin only after the owner approves.", "Die Telefonnummer dieses Kontos ist bestätigt. Die Mitgliedschaft und der Zugriff auf Tierdaten beginnen dennoch erst nach Freigabe durch die haushaltsverantwortliche Person.", "El teléfono de esta cuenta está verificado. Aun así, la adhesión y el acceso a las mascotas solo comienzan cuando lo aprueba la persona responsable del hogar.", "تم التحقق من رقم الهاتف المحمول لهذا الحساب. ومع ذلك لا تبدأ عضوية الأسرة والوصول إلى الحيوانات الأليفة إلا بعد موافقة المالك.", "Het mobiele nummer van dit account is geverifieerd. Lidmaatschap van het huishouden en toegang tot huisdieren beginnen nog steeds pas na goedkeuring door de eigenaar.")
          : t("این شماره در حساب شما تأیید نشده است. تطبیق شماره اثبات مالکیت آن نیست؛ این پیوند فقط درخواست عضویت می‌سازد و تا تأیید مدیر هیچ دسترسی خانوادگی یا اطلاعات پت فعال نمی‌شود.", "This account's mobile is not verified. A matching number does not prove ownership; this link only submits a request, and no household access or pet information is available before owner approval.", "Die Telefonnummer dieses Kontos ist nicht bestätigt. Eine Übereinstimmung beweist nicht, wem die Nummer gehört. Dieser Link übermittelt nur eine Anfrage; ohne Freigabe gibt es keinen Haushaltszugriff und keine Tierdaten.", "El teléfono de esta cuenta no está verificado. Que coincida no demuestra quién es su titular. Este enlace solo envía una solicitud; sin aprobación no hay acceso al hogar ni a los datos de las mascotas.", "لم يتم التحقق من رقم الهاتف المحمول لهذا الحساب. تطابق الرقم لا يثبت ملكيته؛ هذا الرابط يرسل طلبًا فقط، ولا يتوفر أي وصول إلى الأسرة أو معلومات الحيوانات الأليفة قبل موافقة المالك.", "Het mobiele nummer van dit account is niet geverifieerd. Een overeenkomend nummer bewijst niet van wie het is; deze link dient alleen om een verzoek in te dienen en vóór goedkeuring door de eigenaar is er geen toegang tot het huishouden of huisdiergegevens.")}</p>
        <p className="text-metadata text-text-secondary">
          {t("انقضا", "Expires", "Läuft ab", "Caduca", "ينتهي في", "Verloopt")}: <time dateTime={data.expiresAt}>{formatAccountDate(data.expiresAt, locale, true)}</time>
        </p>
        {pending ? <p role="status" className="rounded-xl border border-border-subtle p-3 text-body">{t("درخواست ثبت شده است. پس از تصمیم مدیر خانواده، نتیجه در همین حساب قابل پیگیری است.", "Your request was submitted. You can follow the owner's decision in your account.", "Ihre Anfrage wurde übermittelt. Sie können die Entscheidung der verantwortlichen Person in Ihrem Konto verfolgen.", "Tu solicitud se ha enviado. Puedes consultar la decisión de la persona responsable en tu cuenta.", "تم إرسال طلبك. يمكنك متابعة قرار المالك في حسابك.", "Je verzoek is ingediend. Je kunt de beslissing van de eigenaar volgen in je account.")}</p> : <div className="flex flex-wrap gap-2">
          <Button isLoading={busy === "request"} disabled={busy !== null} onClick={() => act("request")}>{t("درخواست عضویت", "Request membership", "Mitgliedschaft anfragen", "Solicitar adhesión", "طلب العضوية", "Lidmaatschap aanvragen")}</Button>
          <Button variant="secondary" isLoading={busy === "decline"} disabled={busy !== null} onClick={() => act("decline")}>{t("رد کردن دعوت", "Decline invitation", "Einladung ablehnen", "Rechazar invitación", "رفض الدعوة", "Uitnodiging afwijzen")}</Button>
        </div>}
      </ContextSurface>
    </div>
  );
}
