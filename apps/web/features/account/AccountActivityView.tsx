"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Skeleton } from "@petlife/ui";
import { accountService, type AccountActivityItemDto, type ActivityGroupValue } from "@/services/account.service";
import { SystemState } from "@/features/system/SystemState";
import { AccountPageHeader } from "./AccountNav";
import { formatAccountDate, useAccountCopy } from "./account-copy";

const PAGE_SIZE = 25;

const FILTERS: Array<{ value: ActivityGroupValue | "ALL"; fa: string; en: string }> = [
  { value: "ALL", fa: "همه", en: "All" },
  { value: "SECURITY", fa: "امنیت", en: "Security" },
  { value: "PRIVACY", fa: "حریم خصوصی", en: "Privacy" },
  { value: "HOUSEHOLD", fa: "خانواده", en: "Household" },
  { value: "MEMBERSHIP", fa: "عضویت", en: "Membership" },
];

const TITLES: Record<string, [string, string]> = {
  UserAuthenticated: ["ورود به حساب", "Signed in"],
  PasswordChanged: ["رمز عبور تغییر کرد", "Password changed"],
  PasswordResetCompleted: ["رمز عبور بازیابی شد", "Password reset"],
  SessionRevoked: ["یک دستگاه خارج شد", "A device was signed out"],
  OtherSessionsRevoked: ["خروج از سایر دستگاه‌ها", "Other devices signed out"],
  AllSessionsRevoked: ["خروج از همهٔ دستگاه‌ها", "Signed out everywhere"],
  ContactChanged: ["راه تماس تغییر کرد", "Contact method changed"],
  UnverifiedCredentialsCleared: ["رمز تأییدنشده حذف شد", "Unverified password removed"],
  ConsentChanged: ["رضایت تغییر کرد", "Consent changed"],
  DataExportRequested: ["درخواست نسخهٔ داده", "Data copy requested"],
  DataExportReady: ["نسخهٔ داده آماده شد", "Data copy ready"],
  DataExportDownloaded: ["نسخهٔ داده دریافت شد", "Data copy downloaded"],
  AccountDeletionRequested: ["درخواست حذف حساب", "Account deletion requested"],
  AccountDeletionCancelled: ["درخواست حذف لغو شد", "Deletion request cancelled"],
  HouseholdInvitationAccepted: ["پذیرش دعوت خانواده", "Joined a household"],
  HouseholdInvitationDeclined: ["رد دعوت خانواده", "Declined a household invitation"],
  HouseholdMemberLeft: ["ترک خانواده", "Left a household"],
  SubscriptionStarted: ["عضویت آغاز شد", "Membership started"],
  SubscriptionRenewed: ["عضویت تمدید شد", "Membership renewed"],
  SubscriptionRenewalFailed: ["پرداخت تمدید انجام نشد", "Renewal payment failed"],
  SubscriptionGraceStarted: ["مهلت پرداخت آغاز شد", "Payment grace period started"],
  SubscriptionExpired: ["عضویت پایان یافت", "Membership ended"],
  SubscriptionPlanChanged: ["طرح عضویت تغییر کرد", "Membership plan changed"],
  SubscriptionDowngradeScheduled: ["تغییر طرح برای پایان دوره", "Plan change scheduled"],
  SubscriptionCancelRequested: ["لغو عضویت ثبت شد", "Membership cancellation requested"],
  SubscriptionCancelReversed: ["عضویت ادامه یافت", "Membership resumed"],
};

const METHOD: Record<string, [string, string]> = { OTP: ["با کد یک‌بارمصرف", "with a one-time code"], PASSWORD: ["با رمز عبور", "with a password"], GOOGLE: ["با Google", "with Google"] };
const CONSENT: Record<string, [string, string]> = { TERMS: ["شرایط استفاده", "Terms of use"], PRIVACY: ["سیاست حریم خصوصی", "Privacy policy"], MARKETING: ["پیام‌های تبلیغاتی", "Marketing messages"] };

/**
 * Account activity — a bounded reference view over the person's own events
 * (the source records stay in their domains). Summaries use only the
 * whitelisted detail the API returns; dates follow the locale's calendar.
 */
export function AccountActivityView() {
  const { t, fa, locale, num } = useAccountCopy();
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
    if (item.type === "UserAuthenticated") return [d.method && METHOD[d.method] ? t(METHOD[d.method]![0], METHOD[d.method]![1]) : null, d.device].filter(Boolean).join(" · ") || null;
    if (item.type === "ConsentChanged" && d.kind) return `${CONSENT[d.kind] ? t(CONSENT[d.kind]![0], CONSENT[d.kind]![1]) : d.kind}: ${d.granted ? t("پذیرفته شد", "given") : t("پس گرفته شد", "withdrawn")}`;
    if (item.type === "ContactChanged" && d.kind) return d.kind === "email" ? t("ایمیل", "Email") : t("موبایل", "Mobile");
    if ((item.type === "OtherSessionsRevoked" || item.type === "AllSessionsRevoked") && typeof d.count === "number") return t(`${num(d.count)} دستگاه`, `${num(d.count)} device(s)`);
    if (item.type === "SubscriptionStarted" && d.isTrial) return t("دورهٔ آزمایشی", "Trial");
    if (item.type === "SubscriptionCancelRequested" && d.effectiveAt) return t(`پایان در ${formatAccountDate(d.effectiveAt, locale)}`, `Ends ${formatAccountDate(d.effectiveAt, locale)}`);
    if (item.type === "SubscriptionRenewed" && d.recovered) return t("پس از تأخیر در پرداخت", "After a late payment");
    return null;
  }

  return (
    <div className="account-stack">
      <AccountPageHeader eyebrow={t("تاریخچه", "ACTIVITY")} title={t("فعالیت‌های حساب", "Account activity")} description={t("ورودها، تغییرهای امنیتی، حریم خصوصی، خانواده و عضویت — فقط رویدادهای مربوط به خود شما.", "Sign-ins and changes to security, privacy, households and membership — only events about you.")} />

      <div className="activity-filters" role="group" aria-label={t("نوع فعالیت", "Activity type")}>
        {FILTERS.map((option) => (
          <button key={option.value} type="button" aria-pressed={filter === option.value} className="activity-filter" onClick={() => setFilter(option.value)}>
            {fa ? option.fa : option.en}
          </button>
        ))}
      </div>

      {failed ? (
        <SystemState kind="GENERIC_RETRYABLE_ERROR" onRetry={() => void load(filter)} />
      ) : !items ? (
        <Skeleton className="h-72 w-full" aria-label={t("در حال بارگذاری", "Loading")} />
      ) : items.length === 0 ? (
        <EmptyState title={t("فعالیتی برای نمایش نیست", "Nothing to show here yet")} description={t("رویدادهای مهم حساب شما اینجا نمایش داده می‌شوند.", "Important events on your account will appear here.")} />
      ) : (
        <>
          <ol className="activity-list">
            {items.map((item) => {
              const title = TITLES[item.type];
              const extra = summary(item);
              return (
                <li key={item.id}>
                  <span aria-hidden />
                  <p>
                    <b>{title ? t(title[0], title[1]) : t("رویداد حساب", "Account event")}</b>
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
              <Button variant="secondary" isLoading={loadingMore} onClick={loadMore}>{t("نمایش موارد قدیمی‌تر", "Show older")}</Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
