"use client";
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Avatar, Button, ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import { accountService, type AccountOverviewDto } from "@/services/account.service";
import { AccountPageHeader } from "./AccountNav";
import { formatCount } from "@/lib/number/format-number";
import { statusLabel } from "@/lib/status/status-labels";

export function AccountOverviewView() {
  const locale = useLocale(); const router = useRouter();
  const [data, setData] = useState<AccountOverviewDto | null>(null); const [failed, setFailed] = useState(false);
  const load = useCallback(async () => { setFailed(false); try { setData(await accountService.overview()); } catch { setFailed(true); } }, []);
  useEffect(() => { void load(); }, [load]);
  if (failed) return <ErrorRecovery title={locale === "fa" ? "حساب کاربری" : "Account"} message="" retryLabel={locale === "fa" ? "تلاش دوباره" : "Retry"} onRetry={load} />;
  if (!data) return <Skeleton className="h-96 w-full" aria-label="loading" />;
  const home = data.households[0];
  return <div className="account-stack">
    <AccountPageHeader eyebrow={locale === "fa" ? "مرکز حساب" : "ACCOUNT CENTER"} title={locale === "fa" ? `سلام ${data.user.displayName}` : `Hello, ${data.user.displayName}`} description={locale === "fa" ? "هویت، امنیت و دسترسی‌های خانواده را یک‌جا و شفاف مدیریت کنید." : "Manage identity, security and household access in one clear place."} />
    <section className="account-identity-band">
      <Avatar name={data.user.displayName} src={data.user.avatarUrl} size="lg" />
      <div><h2>{data.user.displayName}</h2><p>{data.user.email ?? data.user.phone ?? (locale === "fa" ? "راه ارتباطی ثبت نشده" : "No contact method")}</p></div>
      <Button variant="secondary" onClick={() => router.push(`/${locale}/profile/personal`)}>{locale === "fa" ? "ویرایش اطلاعات" : "Edit profile"}</Button>
    </section>
    {(data.attention.pendingInvitations > 0 || data.security.activeSessions > 1) && <ContextSurface className="account-attention">
      <div><p className="text-label font-semibold">{locale === "fa" ? "نیازمند توجه" : "Needs attention"}</p><p className="text-metadata text-text-secondary">{locale === "fa" ? `${data.attention.pendingInvitations} دعوت باز و ${data.security.activeSessions} نشست فعال دارید.` : `${data.attention.pendingInvitations} pending invites and ${data.security.activeSessions} active sessions.`}</p></div>
      <Button size="sm" onClick={() => router.push(`/${locale}/profile/security`)}>{locale === "fa" ? "بررسی امنیت" : "Review security"}</Button>
    </ContextSurface>}
    <section className="account-summary-list">
      <button onClick={() => router.push(`/${locale}/profile/household`)}>
        <span><b>{home?.name || (locale === "fa" ? "خانواده من" : "My household")}</b><small>{home ? `${formatCount(home._count.members, locale)} ${locale === "fa" ? "عضو" : "members"} · ${formatCount(home._count.pets, locale)} ${locale === "fa" ? "حیوان" : "pets"}` : (locale === "fa" ? "هنوز خانواده‌ای ثبت نشده" : "No household yet")}</small></span>
        <StatusLabel tone={home ? "success" : "neutral"}>{home?.role === "OWNER" ? (locale === "fa" ? "مدیر" : "Organizer") : (locale === "fa" ? "عضو" : "Member")}</StatusLabel>
      </button>
      <button onClick={() => router.push(`/${locale}/subscription`)}>
        <span><b>{locale === "fa" ? "عضویت PET LIFE Care" : "PET LIFE Care membership"}</b><small>{home?.subscription?.status ? statusLabel(home.subscription.status, locale === "en" ? "en" : "fa", "subscription") : (locale === "fa" ? "مشاهده طرح‌ها و مزایا" : "See plans and benefits")}</small></span><span aria-hidden className="dir-flip">←</span>
      </button>
      <button onClick={() => router.push(`/${locale}/profile/activity`)}>
        <span><b>{locale === "fa" ? "فعالیت‌های اخیر" : "Recent activity"}</b><small>{locale === "fa" ? "ورودها و تغییرات مهم حساب" : "Sign-ins and important account changes"}</small></span><span aria-hidden className="dir-flip">←</span>
      </button>
    </section>
  </div>;
}
