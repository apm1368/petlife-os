"use client";
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Avatar, Button, ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import { accountService, type AccountOverviewDto } from "@/services/account.service";
import { AccountPageHeader } from "./AccountNav";
import { formatCount } from "@/lib/number/format-number";
import { statusLabel } from "@/lib/status/status-labels";
import { householdsService, type IncomingHouseholdInvitation } from "@/services/households.service";
import type { RouteLocale } from "@/lib/i18n/config";
import { ApiError } from "@/lib/api/client";

export const accountOverviewCopy = {
  fa: { title: "حساب کاربری", retry: "تلاش دوباره", loading: "در حال بارگذاری", loadError: "اطلاعات حساب بارگیری نشد. دوباره تلاش کنید.", eyebrow: "مرکز حساب", hello: (name: string) => `سلام ${name}`, description: "هویت، امنیت و دسترسی‌های خانواده را یک‌جا و شفاف مدیریت کنید.", noContact: "راه ارتباطی ثبت نشده", edit: "ویرایش اطلاعات", needsAttention: "نیازمند توجه", attention: (invites: string, sessions: string) => `${invites} دعوت باز و ${sessions} نشست فعال دارید.`, security: "بررسی امنیت", myHousehold: "خانواده من", members: "عضو", pets: "حیوان", noHousehold: "هنوز خانواده‌ای ثبت نشده", organizer: "مدیر", member: "عضو", invite: "دعوت به خانواده", inviteHint: "عضو جدید را با دسترسی شفاف به حیوان‌ها اضافه کنید", careMembership: "عضویت اپت لایف Care", seePlans: "مشاهده طرح‌ها و مزایا", recentActivity: "فعالیت‌های اخیر", activityHint: "ورودها و تغییرات مهم حساب", invitationTitle: "دعوت‌های خانواده برای شما", someone: "یکی از نزدیکانتان", invited: (name: string) => `${name} از شما برای عضویت در یک خانواده درخواست کرده است`, invitedMobile: "شمارهٔ دعوت:", requestNotice: "ثبت درخواست به‌معنای تأیید شماره نیست. مدیر خانواده باید درخواست را تأیید کند؛ تا آن زمان اطلاعات پت و سلامت در دسترس نیست.", request: "درخواست عضویت", decline: "رد کردن", requestSent: "درخواست ثبت شد؛ تا تأیید مدیر خانواده دسترسی‌ای فعال نمی‌شود.", loadInvitationsError: "دعوت‌های خانواده بارگیری نشد.", updateInvitationError: "تغییر دعوت انجام نشد؛ دوباره تلاش کنید.", invitationsLoading: "دعوت‌های خانواده در حال بارگیری هستند", noInvitations: "دعوت خانوادگی در انتظار ندارید.", invitationsOffline: "اتصال اینترنت در دسترس نیست. پس از اتصال دوباره تلاش کنید.", invitationsNoAccess: "دسترسی به دعوت‌های خانواده ممکن نیست.", retryInvitations: "بارگیری دوبارهٔ دعوت‌ها" },
  en: { title: "Account", retry: "Retry", loading: "Loading", loadError: "Your account could not be loaded. Please try again.", eyebrow: "ACCOUNT CENTER", hello: (name: string) => `Hello, ${name}`, description: "Manage identity, security and household access in one clear place.", noContact: "No contact method", edit: "Edit profile", needsAttention: "Needs attention", attention: (invites: string, sessions: string) => `${invites} pending invites and ${sessions} active sessions.`, security: "Review security", myHousehold: "My household", members: "members", pets: "pets", noHousehold: "No household yet", organizer: "Organizer", member: "Member", invite: "Invite family", inviteHint: "Add a member with clear pet access", careMembership: "opetlife Care membership", seePlans: "See plans and benefits", recentActivity: "Recent activity", activityHint: "Sign-ins and important account changes", invitationTitle: "Family invitations for you", someone: "Someone you know", invited: (name: string) => `${name} invited you to request household membership`, invitedMobile: "Invited mobile:", requestNotice: "Submitting does not verify your mobile. The household owner must approve; pet and health information stays unavailable until then.", request: "Request membership", decline: "Decline", requestSent: "Request submitted; no access starts until the household owner approves.", loadInvitationsError: "Family invitations could not be loaded.", updateInvitationError: "That invitation could not be updated. Please try again.", invitationsLoading: "Loading household invitations", noInvitations: "You have no pending household invitations.", invitationsOffline: "You are offline. Reconnect and try again.", invitationsNoAccess: "You cannot access household invitations.", retryInvitations: "Reload invitations" },
  de: { title: "Konto", retry: "Erneut versuchen", loading: "Wird geladen", loadError: "Kontodaten konnten nicht geladen werden. Bitte versuchen Sie es erneut.", eyebrow: "KONTOZENTRUM", hello: (name: string) => `Hallo, ${name}`, description: "Verwalten Sie Identität, Sicherheit und Haushaltszugriff an einem Ort.", noContact: "Keine Kontaktmöglichkeit hinterlegt", edit: "Profil bearbeiten", needsAttention: "Benötigt Aufmerksamkeit", attention: (invites: string, sessions: string) => `${invites} offene Einladungen und ${sessions} aktive Sitzungen.`, security: "Sicherheit prüfen", myHousehold: "Mein Haushalt", members: "Mitglieder", pets: "Tiere", noHousehold: "Noch kein Haushalt angelegt", organizer: "Verwalter", member: "Mitglied", invite: "Familie einladen", inviteHint: "Fügen Sie Mitglieder mit klar geregeltem Tierzugriff hinzu.", careMembership: "opetlife-Care-Mitgliedschaft", seePlans: "Tarife und Leistungen ansehen", recentActivity: "Letzte Aktivitäten", activityHint: "Anmeldungen und wichtige Kontoänderungen", invitationTitle: "Einladungen in Ihre Haushalte", someone: "Eine Person aus Ihrem Umfeld", invited: (name: string) => `${name} bittet Sie, die Mitgliedschaft in einem Haushalt anzufragen.`, invitedMobile: "Eingeladene Mobilnummer:", requestNotice: "Mit Ihrer Anfrage wird Ihre Mobilnummer nicht verifiziert. Die zuständige Person muss sie bestätigen; bis dahin bleiben Tier- und Gesundheitsdaten gesperrt.", request: "Mitgliedschaft anfragen", decline: "Ablehnen", requestSent: "Anfrage gesendet. Zugriff wird erst nach Freigabe durch die zuständige Person aktiviert.", loadInvitationsError: "Haushaltseinladungen konnten nicht geladen werden.", updateInvitationError: "Die Einladung konnte nicht aktualisiert werden. Bitte versuchen Sie es erneut.", invitationsLoading: "Haushaltseinladungen werden geladen", noInvitations: "Sie haben keine offenen Haushaltseinladungen.", invitationsOffline: "Keine Internetverbindung. Stellen Sie die Verbindung wieder her und versuchen Sie es erneut.", invitationsNoAccess: "Sie können nicht auf Haushaltseinladungen zugreifen.", retryInvitations: "Einladungen erneut laden" },
  es: { title: "Cuenta", retry: "Reintentar", loading: "Cargando", loadError: "No se pudieron cargar los datos de la cuenta. Inténtalo de nuevo.", eyebrow: "CENTRO DE CUENTA", hello: (name: string) => `Hola, ${name}`, description: "Administra tu identidad, seguridad y acceso al hogar desde un mismo lugar.", noContact: "No hay un medio de contacto registrado", edit: "Editar perfil", needsAttention: "Requiere atención", attention: (invites: string, sessions: string) => `${invites} invitaciones pendientes y ${sessions} sesiones activas.`, security: "Revisar seguridad", myHousehold: "Mi hogar", members: "miembros", pets: "mascotas", noHousehold: "Aún no hay un hogar registrado", organizer: "Administrador", member: "Miembro", invite: "Invitar a la familia", inviteHint: "Añade miembros con permisos claros para las mascotas.", careMembership: "Suscripción opetlife Care", seePlans: "Ver planes y ventajas", recentActivity: "Actividad reciente", activityHint: "Inicios de sesión y cambios importantes de la cuenta", invitationTitle: "Invitaciones a hogares", someone: "Una persona cercana", invited: (name: string) => `${name} te ha invitado a solicitar la membresía de un hogar.`, invitedMobile: "Móvil invitado:", requestNotice: "Enviar la solicitud no verifica tu número. La persona responsable del hogar debe aprobarla; hasta entonces, los datos de mascotas y salud no estarán disponibles.", request: "Solicitar membresía", decline: "Rechazar", requestSent: "Solicitud enviada. El acceso solo se activa cuando la apruebe la persona responsable del hogar.", loadInvitationsError: "No se pudieron cargar las invitaciones del hogar.", updateInvitationError: "No se pudo actualizar la invitación. Inténtalo de nuevo.", invitationsLoading: "Cargando invitaciones del hogar", noInvitations: "No tienes invitaciones pendientes para ningún hogar.", invitationsOffline: "No hay conexión a internet. Conéctate e inténtalo de nuevo.", invitationsNoAccess: "No tienes acceso a las invitaciones del hogar.", retryInvitations: "Volver a cargar las invitaciones" },
  ar: { title: "الحساب", retry: "إعادة المحاولة", loading: "جارٍ التحميل", loadError: "تعذّر تحميل حسابك. حاول مرة أخرى.", eyebrow: "مركز الحساب", hello: (name: string) => `مرحبًا، ${name}`, description: "أدِر هويتك وأمانك وصلاحيات الوصول إلى الأسرة في مكان واحد واضح.", noContact: "لا توجد وسيلة تواصل", edit: "تعديل الملف الشخصي", needsAttention: "يحتاج إلى انتباه", attention: (invites: string, sessions: string) => `دعوات معلّقة: ${invites}، جلسات نشطة: ${sessions}.`, security: "مراجعة الأمان", myHousehold: "أسرتي", members: "أعضاء", pets: "حيوانات أليفة", noHousehold: "لا توجد أسرة بعد", organizer: "المنظِّم", member: "عضو", invite: "دعوة العائلة", inviteHint: "أضف عضوًا بصلاحيات واضحة للوصول إلى الحيوانات الأليفة", careMembership: "عضوية opetlife Care", seePlans: "عرض الخطط والمزايا", recentActivity: "النشاط الأخير", activityHint: "عمليات تسجيل الدخول والتغييرات المهمة في الحساب", invitationTitle: "دعوات عائلية لك", someone: "شخص تعرفه", invited: (name: string) => `دعاك ${name} إلى طلب الانضمام إلى أسرة`, invitedMobile: "رقم الجوال المدعو:", requestNotice: "إرسال الطلب لا يؤكد رقم جوالك. يجب أن يوافق صاحب الأسرة، وحتى ذلك الحين تبقى معلومات الحيوانات الأليفة والصحة غير متاحة.", request: "طلب العضوية", decline: "رفض", requestSent: "تم إرسال الطلب، ولن يبدأ أي وصول حتى يوافق صاحب الأسرة.", loadInvitationsError: "تعذّر تحميل الدعوات العائلية.", updateInvitationError: "تعذّر تحديث هذه الدعوة. حاول مرة أخرى.", invitationsLoading: "جارٍ تحميل دعوات الأسرة", noInvitations: "ليست لديك دعوات أسرة معلّقة.", invitationsOffline: "أنت غير متصل بالإنترنت. أعد الاتصال وحاول مرة أخرى.", invitationsNoAccess: "لا يمكنك الوصول إلى دعوات الأسرة.", retryInvitations: "إعادة تحميل الدعوات" },
  nl: { title: "Account", retry: "Opnieuw proberen", loading: "Laden", loadError: "Je account kon niet worden geladen. Probeer het opnieuw.", eyebrow: "ACCOUNTCENTRUM", hello: (name: string) => `Hallo, ${name}`, description: "Beheer je identiteit, beveiliging en toegang tot je huishouden op één overzichtelijke plek.", noContact: "Geen contactgegevens", edit: "Profiel bewerken", needsAttention: "Vraagt aandacht", attention: (invites: string, sessions: string) => `${invites} openstaande uitnodigingen en ${sessions} actieve sessies.`, security: "Beveiliging controleren", myHousehold: "Mijn huishouden", members: "leden", pets: "huisdieren", noHousehold: "Nog geen huishouden", organizer: "Beheerder", member: "Lid", invite: "Familie uitnodigen", inviteHint: "Voeg een lid toe met duidelijke toegang tot huisdieren", careMembership: "opetlife Care-lidmaatschap", seePlans: "Bekijk abonnementen en voordelen", recentActivity: "Recente activiteit", activityHint: "Aanmeldingen en belangrijke accountwijzigingen", invitationTitle: "Familie-uitnodigingen voor jou", someone: "Iemand die je kent", invited: (name: string) => `${name} heeft je uitgenodigd om lidmaatschap van een huishouden aan te vragen`, invitedMobile: "Uitgenodigd mobiel nummer:", requestNotice: "Met je aanvraag wordt je mobiele nummer niet geverifieerd. De eigenaar van het huishouden moet goedkeuren; tot die tijd blijven huisdier- en gezondheidsgegevens niet beschikbaar.", request: "Lidmaatschap aanvragen", decline: "Weigeren", requestSent: "Aanvraag verstuurd; je krijgt pas toegang als de eigenaar van het huishouden goedkeurt.", loadInvitationsError: "Familie-uitnodigingen konden niet worden geladen.", updateInvitationError: "Deze uitnodiging kon niet worden bijgewerkt. Probeer het opnieuw.", invitationsLoading: "Uitnodigingen voor huishoudens laden", noInvitations: "Je hebt geen openstaande uitnodigingen voor een huishouden.", invitationsOffline: "Je bent offline. Maak opnieuw verbinding en probeer het nog eens.", invitationsNoAccess: "Je hebt geen toegang tot uitnodigingen voor huishoudens.", retryInvitations: "Uitnodigingen opnieuw laden" },
} as const;

export function AccountOverviewView() {
  const locale = useLocale() as RouteLocale; const router = useRouter(); const c = accountOverviewCopy[locale];
  const [data, setData] = useState<AccountOverviewDto | null>(null); const [failed, setFailed] = useState(false);
  const load = useCallback(async () => { setFailed(false); try { setData(await accountService.overview()); } catch { setFailed(true); } }, []);
  useEffect(() => { void load(); }, [load]);
  if (failed) return <ErrorRecovery title={c.title} message={c.loadError} retryLabel={c.retry} onRetry={load} />;
  if (!data) return <Skeleton className="h-96 w-full" aria-label={c.loading} />;
  const home = data.households[0];
  return <div className="account-stack">
    <AccountPageHeader eyebrow={c.eyebrow} title={c.hello(data.user.displayName)} description={c.description} />
    <section className="account-identity-band">
      <Avatar name={data.user.displayName} src={data.user.avatarUrl} size="lg" />
      <div><h2>{data.user.displayName}</h2><p>{data.user.email || data.user.phone ? <span dir="ltr">{data.user.email ?? data.user.phone}</span> : c.noContact}</p></div>
      <Button variant="secondary" onClick={() => router.push(`/${locale}/profile/personal`)}>{c.edit}</Button>
    </section>
    <HouseholdInvitationInbox locale={locale} />
    {(data.attention.pendingInvitations > 0 || data.security.activeSessions > 1) && <ContextSurface className="account-attention">
      <div><p className="text-label font-semibold">{c.needsAttention}</p><p className="text-metadata text-text-secondary">{c.attention(formatCount(data.attention.pendingInvitations, locale), formatCount(data.security.activeSessions, locale))}</p></div>
      <Button size="sm" onClick={() => router.push(`/${locale}/profile/security`)}>{c.security}</Button>
    </ContextSurface>}
    <section className="account-summary-list">
      <button onClick={() => router.push(`/${locale}/profile/household`)}>
        <span><b>{home?.name || c.myHousehold}</b><small>{home ? `${formatCount(home._count.members, locale)} ${c.members} · ${formatCount(home._count.pets, locale)} ${c.pets}` : c.noHousehold}</small></span>
        <StatusLabel tone={home ? "success" : "neutral"}>{home?.role === "OWNER" ? c.organizer : c.member}</StatusLabel>
      </button>
      {home?.role === "OWNER" ? <button onClick={() => router.push(`/${locale}/profile/household?invite=1`)}>
        <span><b>{c.invite}</b><small>{c.inviteHint}</small></span><span aria-hidden className="dir-flip">←</span>
      </button> : null}
      <button onClick={() => router.push(`/${locale}/subscription`)}>
        <span><b>{c.careMembership}</b><small>{home?.subscription?.status ? statusLabel(home.subscription.status, locale, "subscription") : c.seePlans}</small></span><span aria-hidden className="dir-flip">←</span>
      </button>
      <button onClick={() => router.push(`/${locale}/profile/activity`)}>
        <span><b>{c.recentActivity}</b><small>{c.activityHint}</small></span><span aria-hidden className="dir-flip">←</span>
      </button>
    </section>
  </div>;
}

function HouseholdInvitationInbox({ locale }: { locale: RouteLocale }) {
  const c = accountOverviewCopy[locale];
  const [invitations, setInvitations] = useState<IncomingHouseholdInvitation[] | null>(null);
  const [loadFailure, setLoadFailure] = useState<"invitationsOffline" | "invitationsNoAccess" | "loadInvitationsError" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionFailed, setActionFailed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const loadInvitations = useCallback(async () => {
    setLoadFailure(null);
    setInvitations(null);
    try {
      setInvitations(await householdsService.incomingInvitations());
    } catch (error) {
      setLoadFailure(navigator.onLine === false ? "invitationsOffline" : error instanceof ApiError && (error.status === 401 || error.status === 403) ? "invitationsNoAccess" : "loadInvitationsError");
    }
  }, []);
  useEffect(() => { void loadInvitations(); }, [loadInvitations]);

  async function respond(invitation: IncomingHouseholdInvitation, action: "request" | "decline") {
    setBusyId(invitation.id);
    setActionFailed(false);
    try {
      if (action === "request") await householdsService.requestIncomingMembership(invitation.id);
      else await householdsService.declineIncomingInvitation(invitation.id);
      setInvitations((current) => current?.filter((item) => item.id !== invitation.id) ?? []);
      if (action === "request") setSubmitted(true);
    } catch {
      setActionFailed(true);
    } finally {
      setBusyId(null);
    }
  }

  if (loadFailure) return <section className="account-stack" aria-labelledby="incoming-household-invitations">
    <h2 id="incoming-household-invitations" className="text-section-title">{c.invitationTitle}</h2>
    <ErrorRecovery title={c.loadInvitationsError} message={c[loadFailure]} retryLabel={c.retryInvitations} onRetry={loadInvitations} />
  </section>;
  if (invitations === null) return <section className="account-stack" aria-labelledby="incoming-household-invitations">
    <h2 id="incoming-household-invitations" className="text-section-title">{c.invitationTitle}</h2>
    <Skeleton className="h-28 w-full" aria-label={c.invitationsLoading} />
  </section>;
  if (invitations.length === 0) return <section className="account-stack" aria-labelledby="incoming-household-invitations">
    <h2 id="incoming-household-invitations" className="text-section-title">{c.invitationTitle}</h2>
    {submitted ? <p role="status" className="text-sm text-text-secondary">{c.requestSent}</p> : null}
    <p className="text-sm text-text-secondary">{c.noInvitations}</p>
  </section>;
  return (
    <section className="account-stack" aria-labelledby="incoming-household-invitations">
      <h2 id="incoming-household-invitations" className="text-section-title">{c.invitationTitle}</h2>
      {invitations.map((invitation) => (
        <ContextSurface key={invitation.id} className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-semibold text-text-primary">{c.invited(invitation.inviter.displayName || c.someone)}</p>
            <p className="mt-1 text-sm text-text-secondary">{c.invitedMobile} <bdi dir="ltr">{invitation.contactMasked}</bdi></p>
            <p className="mt-1 text-xs text-text-secondary">{c.requestNotice}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busyId !== null} isLoading={busyId === invitation.id} onClick={() => void respond(invitation, "request")}>{c.request}</Button>
            <Button variant="secondary" disabled={busyId !== null} onClick={() => void respond(invitation, "decline")}>{c.decline}</Button>
          </div>
        </ContextSurface>
      ))}
      {actionFailed ? <p role="alert" className="text-sm text-state-urgent">{c.updateInvitationError}</p> : null}
    </section>
  );
}
