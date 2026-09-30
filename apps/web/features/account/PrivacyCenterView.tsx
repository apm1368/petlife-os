"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, ContextSurface, Dialog, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import type { StatusTone } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { accountService, type DeletionPreviewDto, type PrivacyCenterDto, type PrivacyRequestStatusValue, type SharingSummaryDto } from "@/services/account.service";
import { PasswordInput } from "@/features/auth/PasswordInput";
import { AccountPageHeader } from "./AccountNav";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { formatAccountDate, useAccountCopy } from "./account-copy";

const EXPORT_STATUS: Record<PrivacyRequestStatusValue, { fa: string; en: string; tone: StatusTone }> = {
  PENDING: { fa: "در صف", en: "Queued", tone: "neutral" },
  PROCESSING: { fa: "در حال آماده‌سازی", en: "Preparing", tone: "neutral" },
  READY: { fa: "آمادهٔ دریافت", en: "Ready", tone: "success" },
  COMPLETED: { fa: "انجام شد", en: "Done", tone: "success" },
  CANCELLED: { fa: "لغو شد", en: "Cancelled", tone: "neutral" },
  FAILED: { fa: "ناموفق", en: "Failed", tone: "urgent" },
  EXPIRED: { fa: "منقضی شد", en: "Expired", tone: "neutral" },
};

const SCOPE_LABELS: Record<string, [string, string]> = {
  ACCOUNT: ["حساب", "Account"],
  HOUSEHOLDS: ["خانواده‌ها", "Households"],
  PETS: ["حیوانات", "Pets"],
  HEALTH_WHERE_PERMITTED: ["سلامت (در حد دسترسی شما)", "Health (as far as you may see it)"],
  MEMORIES_YOU_WROTE: ["خاطراتی که خودتان نوشته‌اید", "Memories you wrote"],
  BOOKINGS: ["رزروها", "Bookings"],
  ORDERS: ["سفارش‌ها", "Orders"],
  TRAVEL: ["سفرها", "Travel"],
  SUPPORT: ["گفت‌وگوهای پشتیبانی", "Support conversations"],
  PRIVACY_SETTINGS: ["رضایت‌ها و تنظیمات اعلان", "Consents & notification settings"],
  ACTIVITY: ["فعالیت حساب", "Account activity"],
};

const SHARE_KIND: Record<string, [string, string]> = {
  HOUSEHOLD: ["عضو خانواده", "Household member"],
  TEMPORARY: ["دسترسی موقت", "Temporary access"],
  PROVIDER_BOOKING: ["ارائه‌دهندهٔ رزرو", "Booking provider"],
  VET_SHARE: ["اشتراک با دامپزشک", "Shared with a vet"],
};

const BLOCKER_COPY: Record<string, { fa: string; en: string; href?: string }> = {
  UPCOMING_BOOKINGS: { fa: "رزروهای پیش‌رو دارید؛ آن‌ها را انجام یا لغو کنید.", en: "You have upcoming bookings; complete or cancel them.", href: "/bookings" },
  OPEN_ORDERS: { fa: "سفارش‌های باز دارید که هنوز تحویل یا لغو نشده‌اند.", en: "You have open orders that aren't delivered or cancelled yet.", href: "/orders" },
  OPEN_REFUND_REQUESTS: { fa: "درخواست بازپرداخت در حال بررسی دارید.", en: "A refund request is still being reviewed.", href: "/orders" },
  OPEN_DISPUTES: { fa: "یک اختلاف باز دارید.", en: "You have an open dispute.", href: "/support" },
  ACTIVE_TRAVEL_BOOKINGS: { fa: "رزرو سفر فعال دارید.", en: "You have an active travel booking.", href: "/travel/bookings" },
  PARTNER_ROLES: { fa: "در یک کسب‌وکار (ارائه‌دهنده یا فروشنده) نقش دارید؛ ابتدا مسئولیت را منتقل کنید.", en: "You hold a role in a partner business (provider or seller); hand it over first." },
  ONLY_OWNER_OF_SHARED_HOUSEHOLD: { fa: "تنها مدیر خانواده‌ای با اعضای دیگر هستید؛ ابتدا عضو دیگری را مدیر کنید.", en: "You're the only owner of a household others share; make someone else an owner first.", href: "/profile/household" },
};

function formatSize(bytes: number | null, fa: boolean): string {
  if (!bytes) return "";
  const kb = bytes / 1024;
  return kb < 1024 ? `${Math.max(1, Math.round(kb))} ${fa ? "کیلوبایت" : "KB"}` : `${(kb / 1024).toFixed(1)} ${fa ? "مگابایت" : "MB"}`;
}

/**
 * Privacy Center: what you agreed to, who can see your pets, getting a copy
 * of your data, and asking for account deletion. Descriptions are product
 * facts, not legal promises — the legal text itself lives in the CMS.
 */
export function PrivacyCenterView() {
  const { t, fa, locale } = useAccountCopy();
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
      setNotice(err instanceof ApiError && err.code === "EXPORT_LIMIT_REACHED" ? t("امروز چند بار دریافت داده درخواست داده‌اید؛ فردا دوباره تلاش کنید.", "You've requested several exports today; try again tomorrow.") : err instanceof ApiError ? err.message : t("انجام نشد.", "That didn't work."));
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

      <section aria-labelledby="consents-title">
        <div className="account-section-title">
          <div>
            <h2 id="consents-title">{t("رضایت‌ها", "Consents")}</h2>
            <p>{t(`نسخهٔ فعلی: ${data.consentVersion}`, `Current version: ${data.consentVersion}`)}</p>
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
                  <p>{c?.granted && c.grantedAt ? t(`پذیرفته‌شده در ${formatAccountDate(c.grantedAt, locale)}`, `Accepted on ${formatAccountDate(c.grantedAt, locale)}`) : c?.lastRecordedVersion ? t("نسخهٔ جدیدی منتشر شده که هنوز نپذیرفته‌اید.", "A newer version hasn't been accepted yet.") : t("پذیرش شما برای این نسخه ثبت نشده است.", "Your acceptance of this version isn't on record.")}</p>
                  <p className="text-metadata text-text-secondary">{t("لازم برای استفاده از PET LIFE؛ برای توقف، درخواست حذف حساب بدهید.", "Required to use PET LIFE; to stop, request account deletion.")}</p>
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
              {marketing?.granted && marketing.grantedAt ? <p className="text-metadata text-text-secondary">{t(`روشن از ${formatAccountDate(marketing.grantedAt, locale)}`, `On since ${formatAccountDate(marketing.grantedAt, locale)}`)}</p> : null}
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
          <Link className="text-metadata text-brand-natural" href={`/${locale}/profile/household`}>{t("مدیریت دسترسی‌ها", "Manage access")}</Link>
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
                  <b>{t(`${share.pet.name} — با ${share.person}`, `${share.pet.name} — with ${share.person}`)}</b>
                  <p>
                    {t(SHARE_KIND[share.kind]![0], SHARE_KIND[share.kind]![1])}
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
                  <b>{t(`دسترسی شما به ${share.pet.name}`, `Your access to ${share.pet.name}`)}</b>
                  <p>{t(SHARE_KIND[share.kind]![0], SHARE_KIND[share.kind]![1])}{share.expiresAt ? ` · ${t("تا", "until")} ${formatAccountDate(share.expiresAt, locale)}` : ""}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <ContextSurface className="privacy-export">
        <div>
          <h2>{t("دریافت یک نسخه از داده‌ها", "Get a copy of your data")}</h2>
          <p>{t(`یک فایل JSON آماده می‌شود و ${data.exportAvailableDays} روز برای دریافت در دسترس است. پیوند دریافت فقط چند دقیقه اعتبار دارد و هر دریافت ثبت می‌شود.`, `We prepare a JSON file that stays available for ${data.exportAvailableDays} days. Each download link works for a few minutes and every download is recorded.`)}</p>
          <div className="experience-pills">
            {data.exportIncludes.map((item) => (
              <span className="experience-pill" key={item}>{SCOPE_LABELS[item] ? t(SCOPE_LABELS[item]![0], SCOPE_LABELS[item]![1]) : item}</span>
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
                    {request.status === "READY" && request.expiresAt ? t(`تا ${formatAccountDate(request.expiresAt, locale)} قابل دریافت`, `Available until ${formatAccountDate(request.expiresAt, locale)}`) : request.status === "FAILED" ? t("آماده‌سازی ناموفق بود؛ دوباره درخواست دهید.", "Preparing failed; please request again.") : ""}
                    {request.fileSizeBytes ? ` · ${formatSize(request.fileSizeBytes, fa)}` : ""}
                    {request.downloadCount ? ` · ${t(`${request.downloadCount} بار دریافت شده`, `downloaded ${request.downloadCount}×`)}` : ""}
                  </p>
                </div>
                <div className="member-row__actions">
                  <StatusLabel tone={status.tone}>{fa ? status.fa : status.en}</StatusLabel>
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
            <p>{t(`درخواست حذف شما در ${formatAccountDate(pendingDeletion.requestedAt, locale)} ثبت شده است. تا زمان انتشار قواعد نگهداری داده، درخواست در انتظار می‌ماند و حساب شما همچنان کار می‌کند؛ تا آن زمان می‌توانید آن را لغو کنید.`, `Your deletion request was recorded on ${formatAccountDate(pendingDeletion.requestedAt, locale)}. It waits until the data-retention rules are published, your account keeps working meanwhile, and you can cancel it until then.`)}</p>
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
  const { t, fa, locale } = useAccountCopy();
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
      else setError(err instanceof ApiError ? err.message : t("درخواست ثبت نشد.", "The request wasn't recorded."));
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
                    {h.name || t("خانهٔ بدون نام", "Unnamed household")}: {h.role === "OWNER" ? t("مدیر", "owner") : t("عضو", "member")}, {t(`${h.pets} حیوان`, `${h.pets} pet(s)`)}
                    {h.otherMembers ? t(`، ${h.otherMembers} عضو دیگر دسترسی خود را حفظ می‌کنند`, `; ${h.otherMembers} other member(s) keep their access`) : ""}
                    {h.membershipStatus ? t(`، عضویت: ${h.membershipStatus}`, `; membership: ${h.membershipStatus}`) : ""}
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
                        {copy ? (fa ? copy.fa : copy.en) : b.code} {b.count > 1 ? `(${b.count})` : ""}
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
                {codeSentTo ? <Input label={t(`کد ارسال‌شده به ${codeSentTo}`, `Code sent to ${codeSentTo}`)} inputMode="numeric" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} /> : null}
                <div>
                  <Button variant="secondary" size="sm" isLoading={busy && !codeSentTo} onClick={sendCode}>{codeSentTo ? t("ارسال دوبارهٔ کد", "Resend code") : t(`ارسال کد به ${preview.reauth.code}`, `Send a code to ${preview.reauth.code}`)}</Button>
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
