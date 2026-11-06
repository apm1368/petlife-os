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

export function AccountOverviewView() {
  const locale = useLocale(); const router = useRouter();
  const [data, setData] = useState<AccountOverviewDto | null>(null); const [failed, setFailed] = useState(false);
  const load = useCallback(async () => { setFailed(false); try { setData(await accountService.overview()); } catch { setFailed(true); } }, []);
  useEffect(() => { void load(); }, [load]);
  if (failed) return <ErrorRecovery title={locale === "fa" ? "حساب کاربری" : "Account"} message="" retryLabel={locale === "fa" ? "تلاش دوباره" : "Retry"} onRetry={load} />;
  if (!data) return <Skeleton className="h-96 w-full" aria-label={locale==="fa"?"در حال بارگذاری":"Loading"} />;
  const home = data.households[0];
  return <div className="account-stack">
    <AccountPageHeader eyebrow={locale === "fa" ? "مرکز حساب" : "ACCOUNT CENTER"} title={locale === "fa" ? `سلام ${data.user.displayName}` : `Hello, ${data.user.displayName}`} description={locale === "fa" ? "هویت، امنیت و دسترسی‌های خانواده را یک‌جا و شفاف مدیریت کنید." : "Manage identity, security and household access in one clear place."} />
    <section className="account-identity-band">
      <Avatar name={data.user.displayName} src={data.user.avatarUrl} size="lg" />
      <div><h2>{data.user.displayName}</h2><p>{data.user.email || data.user.phone ? <span dir="ltr">{data.user.email ?? data.user.phone}</span> : locale === "fa" ? "راه ارتباطی ثبت نشده" : "No contact method"}</p></div>
      <Button variant="secondary" onClick={() => router.push(`/${locale}/profile/personal`)}>{locale === "fa" ? "ویرایش اطلاعات" : "Edit profile"}</Button>
    </section>
    <HouseholdInvitationInbox locale={locale} />
    {(data.attention.pendingInvitations > 0 || data.security.activeSessions > 1) && <ContextSurface className="account-attention">
      <div><p className="text-label font-semibold">{locale === "fa" ? "نیازمند توجه" : "Needs attention"}</p><p className="text-metadata text-text-secondary">{locale === "fa" ? `${formatCount(data.attention.pendingInvitations, locale)} دعوت باز و ${formatCount(data.security.activeSessions, locale)} نشست فعال دارید.` : `${data.attention.pendingInvitations} pending invites and ${data.security.activeSessions} active sessions.`}</p></div>
      <Button size="sm" onClick={() => router.push(`/${locale}/profile/security`)}>{locale === "fa" ? "بررسی امنیت" : "Review security"}</Button>
    </ContextSurface>}
    <section className="account-summary-list">
      <button onClick={() => router.push(`/${locale}/profile/household`)}>
        <span><b>{home?.name || (locale === "fa" ? "خانواده من" : "My household")}</b><small>{home ? `${formatCount(home._count.members, locale)} ${locale === "fa" ? "عضو" : "members"} · ${formatCount(home._count.pets, locale)} ${locale === "fa" ? "حیوان" : "pets"}` : (locale === "fa" ? "هنوز خانواده‌ای ثبت نشده" : "No household yet")}</small></span>
        <StatusLabel tone={home ? "success" : "neutral"}>{home?.role === "OWNER" ? (locale === "fa" ? "مدیر" : "Organizer") : (locale === "fa" ? "عضو" : "Member")}</StatusLabel>
      </button>
      {home?.role === "OWNER" ? <button onClick={() => router.push(`/${locale}/profile/household?invite=1`)}>
        <span><b>{locale === "fa" ? "دعوت به خانواده" : "Invite family"}</b><small>{locale === "fa" ? "عضو جدید را با دسترسی شفاف به حیوان‌ها اضافه کنید" : "Add a member with clear pet access"}</small></span><span aria-hidden className="dir-flip">←</span>
      </button> : null}
      <button onClick={() => router.push(`/${locale}/subscription`)}>
        <span><b>{locale === "fa" ? "عضویت opetlife Care" : "opetlife Care membership"}</b><small>{home?.subscription?.status ? statusLabel(home.subscription.status, locale === "en" ? "en" : "fa", "subscription") : (locale === "fa" ? "مشاهده طرح‌ها و مزایا" : "See plans and benefits")}</small></span><span aria-hidden className="dir-flip">←</span>
      </button>
      <button onClick={() => router.push(`/${locale}/profile/activity`)}>
        <span><b>{locale === "fa" ? "فعالیت‌های اخیر" : "Recent activity"}</b><small>{locale === "fa" ? "ورودها و تغییرات مهم حساب" : "Sign-ins and important account changes"}</small></span><span aria-hidden className="dir-flip">←</span>
      </button>
    </section>
  </div>;
}

function HouseholdInvitationInbox({ locale }: { locale: string }) {
  const fa = locale === "fa";
  const [invitations, setInvitations] = useState<IncomingHouseholdInvitation[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    let active = true;
    void householdsService.incomingInvitations().then((items) => { if (active) setInvitations(items); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);

  async function respond(invitation: IncomingHouseholdInvitation, action: "request" | "decline") {
    setBusyId(invitation.id);
    setError(false);
    try {
      if (action === "request") await householdsService.requestIncomingMembership(invitation.id);
      else await householdsService.declineIncomingInvitation(invitation.id);
      setInvitations((current) => current?.filter((item) => item.id !== invitation.id) ?? []);
      if (action === "request") setSubmitted(true);
    } catch {
      setError(true);
    } finally {
      setBusyId(null);
    }
  }

  if (invitations === null || invitations.length === 0) return <>
    {submitted ? <p role="status" className="text-sm text-text-secondary">{fa ? "درخواست ثبت شد؛ تا تأیید مدیر خانواده دسترسی‌ای فعال نمی‌شود." : "Request submitted; no access starts until the household owner approves."}</p> : null}
    {error ? <p role="status" className="text-sm text-text-secondary">{fa ? "دعوت‌های خانواده بارگیری نشد." : "Family invitations could not be loaded."}</p> : null}
  </>;
  return (
    <section className="account-stack" aria-labelledby="incoming-household-invitations">
      <h2 id="incoming-household-invitations" className="text-section-title">{fa ? "دعوت‌های خانواده برای شما" : "Family invitations for you"}</h2>
      {invitations.map((invitation) => (
        <ContextSurface key={invitation.id} className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-semibold text-text-primary">{fa ? `${invitation.inviter.displayName || "یکی از نزدیکانتان"} از شما برای عضویت در یک خانواده درخواست کرده است` : `${invitation.inviter.displayName || "Someone you know"} invited you to request household membership`}</p>
            <p className="mt-1 text-sm text-text-secondary">{fa ? "شمارهٔ دعوت: " : "Invited mobile: "}<bdi dir="ltr">{invitation.contactMasked}</bdi></p>
            <p className="mt-1 text-xs text-text-secondary">{fa ? "ثبت درخواست به‌معنای تأیید شماره نیست. مدیر خانواده باید درخواست را تأیید کند؛ تا آن زمان اطلاعات پت و سلامت در دسترس نیست." : "Submitting does not verify your mobile. The household owner must approve; pet and health information stays unavailable until then."}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busyId !== null} isLoading={busyId === invitation.id} onClick={() => void respond(invitation, "request")}>{fa ? "درخواست عضویت" : "Request membership"}</Button>
            <Button variant="secondary" disabled={busyId !== null} onClick={() => void respond(invitation, "decline")}>{fa ? "رد کردن" : "Decline"}</Button>
          </div>
        </ContextSurface>
      ))}
      {error ? <p role="alert" className="text-sm text-state-urgent">{fa ? "تغییر دعوت انجام نشد؛ دوباره تلاش کنید." : "That invitation could not be updated. Please try again."}</p> : null}
    </section>
  );
}
