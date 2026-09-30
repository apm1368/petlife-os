"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { PasswordInput } from "@/features/auth/PasswordInput";
import { accountService, type AccountSessionDto, type SecurityCenterDto } from "@/services/account.service";
import { authService, type AuthMethodsDto } from "@/services/auth.service";
import { AccountPageHeader } from "./AccountNav";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { formatAccountDate, useAccountCopy } from "./account-copy";
import { useSignOut } from "./use-sign-out";

const SECURITY_EVENT_LABELS: Record<string, [string, string]> = {
  UserAuthenticated: ["ورود به حساب", "Signed in"],
  PasswordChanged: ["رمز عبور تغییر کرد", "Password changed"],
  PasswordResetCompleted: ["رمز عبور بازیابی شد", "Password reset"],
  SessionRevoked: ["یک دستگاه خارج شد", "A device was signed out"],
  OtherSessionsRevoked: ["سایر دستگاه‌ها خارج شدند", "Other devices signed out"],
  AllSessionsRevoked: ["خروج از همهٔ دستگاه‌ها", "Signed out everywhere"],
  ContactChanged: ["راه تماس تغییر کرد", "Contact method changed"],
  UnverifiedCredentialsCleared: ["رمز تأییدنشده حذف شد", "Unverified password removed"],
};

type Confirm = { kind: "session"; session: AccountSessionDto } | { kind: "others" } | { kind: "all" } | null;

/**
 * Security Center: how you sign in, where you're signed in, and what changed.
 * Only real data — device labels come from the browser's own user-agent,
 * and nothing (location, IP) is invented or shown beyond that.
 */
export function SecurityCenterView() {
  const { t, locale, num } = useAccountCopy();
  const signOut = useSignOut();
  const [data, setData] = useState<SecurityCenterDto | null>(null);
  const [methods, setMethods] = useState<AuthMethodsDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [security, available] = await Promise.all([accountService.security(), authService.getMethods().catch(() => null)]);
      setData(security);
      setMethods(available);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed) return <ErrorRecovery title={t("امنیت", "Security")} message={t("اطلاعات امنیتی بارگذاری نشد.", "Security details didn't load.")} retryLabel={t("تلاش دوباره", "Retry")} onRetry={load} />;
  if (!data) return <Skeleton className="h-96 w-full" aria-label={t("در حال بارگذاری", "Loading")} />;

  const others = data.sessions.filter((s) => !s.current);
  const google = data.methods.providers.find((p) => p.provider === "GOOGLE");
  const recoveryReady = data.methods.phone.verified || data.methods.email.verified;

  return (
    <div className="account-stack">
      <AccountPageHeader eyebrow={t("مرکز امنیت", "SECURITY CENTER")} title={t("ورود، دستگاه‌ها و رمز عبور", "Sign-in, devices & password")} description={t("روش‌های ورود، همهٔ دستگاه‌هایی که با آن‌ها وارد شده‌اید و تغییرهای مهم امنیتی حساب.", "How you sign in, every device you're signed in on, and important security changes.")} />
      {notice ? <div className="account-notice" role="status">{notice}</div> : null}

      {!recoveryReady ? (
        <ContextSurface className="account-attention">
          <div>
            <p className="text-label font-semibold">{t("راه بازیابی ندارید", "No way to recover your account")}</p>
            <p className="text-metadata text-text-secondary">{t("یک ایمیل یا موبایل تأییدشده اضافه کنید تا در صورت فراموشی رمز یا گم‌شدن دستگاه بتوانید وارد شوید.", "Add a verified email or mobile so you can get back in if you forget a password or lose a device.")}</p>
          </div>
          <Link className="account-link-button" href={`/${locale}/profile/personal`}>{t("افزودن راه تماس", "Add a contact")}</Link>
        </ContextSurface>
      ) : null}

      <section aria-labelledby="methods-title">
        <div className="account-section-title">
          <div>
            <h2 id="methods-title">{t("روش‌های ورود", "Sign-in methods")}</h2>
            <p>{t("کد یک‌بارمصرف به ایمیل یا موبایل تأییدشده، رمز عبور، و در صورت فعال بودن، Google.", "A one-time code to a verified email or mobile, a password, and Google when it's available.")}</p>
          </div>
        </div>
        <div className="security-list">
          <MethodRow icon="☏" title={t("کد به موبایل", "Code to mobile")} detail={data.methods.phone.value ?? t("ثبت نشده", "Not added")} ltr={Boolean(data.methods.phone.value)} tone={data.methods.phone.verified ? "success" : "neutral"} status={data.methods.phone.verified ? t("فعال", "On") : data.methods.phone.value ? t("تأییدنشده", "Not verified") : t("خاموش", "Off")} />
          <MethodRow icon="@" title={t("کد به ایمیل", "Code to email")} detail={data.methods.email.value ?? t("ثبت نشده", "Not added")} ltr={Boolean(data.methods.email.value)} tone={data.methods.email.verified ? "success" : "neutral"} status={data.methods.email.verified ? t("فعال", "On") : data.methods.email.value ? t("تأییدنشده", "Not verified") : t("خاموش", "Off")} />
          <MethodRow icon="•••" title={t("رمز عبور", "Password")} detail={data.methods.password.connected ? t("برای ورود با نام کاربری یا ایمیل", "For signing in with username or email") : t("هنوز تنظیم نشده", "Not set")} tone={data.methods.password.connected ? "success" : "neutral"} status={data.methods.password.connected ? t("فعال", "On") : t("خاموش", "Off")} />
          <MethodRow
            icon="G"
            title="Google"
            detail={google ? google.email ?? t("متصل", "Connected") : methods?.google ? t("با ورود از طریق Google به همین ایمیل متصل می‌شود.", "Links when you sign in with Google using this email.") : t("ورود با Google هنوز در PET LIFE فعال نیست.", "Google sign-in isn't available in PET LIFE yet.")}
            ltr={Boolean(google?.email)}
            tone={google ? "success" : "neutral"}
            status={google ? t("متصل", "Connected") : methods?.google ? t("متصل نیست", "Not linked") : t("در دسترس نیست", "Unavailable")}
          />
        </div>
      </section>

      <PasswordForm hasPassword={data.methods.password.connected} onDone={async (count) => {
        setNotice(count > 0 ? t(`رمز ذخیره شد و ${num(count)} دستگاه دیگر خارج شد. این دستگاه همچنان وارد است.`, `Password saved and ${num(count)} other device(s) were signed out. You're still signed in here.`) : t("رمز ذخیره شد. این دستگاه همچنان وارد است.", "Password saved. You're still signed in here."));
        await load();
      }} />

      <section aria-labelledby="sessions-title">
        <div className="account-section-title">
          <div>
            <h2 id="sessions-title">{t("دستگاه‌های واردشده", "Signed-in devices")}</h2>
            <p>{t("اگر دستگاهی را نمی‌شناسید، آن را خارج کنید و رمز عبور را تغییر دهید.", "If you don't recognize a device, sign it out and change your password.")}</p>
          </div>
          <div className="member-row__actions">
            {others.length > 0 ? <Button variant="secondary" size="sm" onClick={() => setConfirm({ kind: "others" })}>{t("خروج از سایر دستگاه‌ها", "Sign out other devices")}</Button> : null}
            <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: "all" })}>{t("خروج از همه‌جا", "Sign out everywhere")}</Button>
          </div>
        </div>
        <div className="security-list">
          {data.sessions.map((session) => (
            <div className="security-row" key={session.id}>
              <div className="security-row__icon" aria-hidden>{session.current ? "◉" : "○"}</div>
              <div>
                <b>{session.device ?? t("دستگاه ناشناخته", "Unknown device")}</b>
                <p>
                  {t("ورود", "Signed in")} {formatAccountDate(session.createdAt, locale)} · {t("آخرین فعالیت", "last active")} {formatAccountDate(session.lastSeenAt, locale, true)}
                </p>
              </div>
              <div>
                {session.current ? <StatusLabel tone="success">{t("همین دستگاه", "This device")}</StatusLabel> : <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: "session", session })}>{t("خروج", "Sign out")}</Button>}
              </div>
            </div>
          ))}
        </div>
        <div className="member-leave">
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>{t("خروج از این دستگاه", "Sign out of this device")}</Button>
        </div>
      </section>

      <section aria-labelledby="recovery-title">
        <div className="account-section-title">
          <div>
            <h2 id="recovery-title">{t("بازیابی حساب", "Account recovery")}</h2>
            <p>{t("اگر رمز را فراموش کنید، با کد یک‌بارمصرف به موبایل یا ایمیل تأییدشده وارد می‌شوید، یا از «فراموشی رمز» پیوند بازیابی می‌گیرید. هر پیوند فقط یک بار و برای مدت کوتاهی کار می‌کند.", "If you forget your password, sign in with a one-time code to your verified mobile or email, or request a reset link from “Forgot password”. Each link works once, for a short time.")}</p>
          </div>
        </div>
      </section>

      {data.activity.length > 0 ? (
        <section aria-labelledby="security-activity-title">
          <div className="account-section-title">
            <div>
              <h2 id="security-activity-title">{t("فعالیت امنیتی اخیر", "Recent security activity")}</h2>
            </div>
            <Link className="text-metadata text-brand-natural" href={`/${locale}/profile/activity`}>{t("همهٔ فعالیت‌ها", "All activity")}</Link>
          </div>
          <div className="activity-list">
            {data.activity.slice(0, 8).map((event) => (
              <div key={event.id}>
                <span aria-hidden />
                <p>
                  <b>{SECURITY_EVENT_LABELS[event.type] ? t(SECURITY_EVENT_LABELS[event.type]![0], SECURITY_EVENT_LABELS[event.type]![1]) : event.type}</b>
                  <small>{formatAccountDate(event.occurredAt, locale, true)}</small>
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {confirm?.kind === "session" ? (
        <ConfirmActionDialog
          open
          destructive={false}
          onClose={() => setConfirm(null)}
          title={t("خروج این دستگاه", "Sign out this device")}
          consequences={[t(`${confirm.session.device ?? "این دستگاه"} فوراً از حساب خارج می‌شود.`, `${confirm.session.device ?? "That device"} is signed out immediately.`)]}
          confirmLabel={t("خروج دستگاه", "Sign out device")}
          onConfirm={async () => {
            await accountService.revokeSession(confirm.session.id);
            await load();
          }}
        />
      ) : null}
      {confirm?.kind === "others" ? (
        <ConfirmActionDialog
          open
          onClose={() => setConfirm(null)}
          title={t("خروج از سایر دستگاه‌ها", "Sign out other devices")}
          consequences={[t(`${num(others.length)} دستگاه دیگر فوراً خارج می‌شوند.`, `${num(others.length)} other device(s) are signed out immediately.`)]}
          keeps={[t("همین دستگاه وارد می‌ماند.", "You stay signed in on this device.")]}
          confirmLabel={t("خروج دستگاه‌ها", "Sign them out")}
          onConfirm={async () => {
            const result = await accountService.revokeOtherSessions();
            setNotice(t(`${num(result.count)} دستگاه خارج شد.`, `${num(result.count)} device(s) signed out.`));
            await load();
          }}
        />
      ) : null}
      {confirm?.kind === "all" ? (
        <ConfirmActionDialog
          open
          onClose={() => setConfirm(null)}
          title={t("خروج از همه‌جا", "Sign out everywhere")}
          consequences={[t("همهٔ دستگاه‌ها، از جمله همین دستگاه، فوراً خارج می‌شوند.", "Every device, including this one, is signed out immediately."), t("برای ادامه باید دوباره وارد شوید.", "You'll need to sign in again to continue.")]}
          confirmLabel={t("خروج از همه‌جا", "Sign out everywhere")}
          onConfirm={async () => {
            await accountService.revokeAllSessions();
            await signOut(true);
          }}
        />
      ) : null}
    </div>
  );
}

function MethodRow({ icon, title, detail, status, tone, ltr }: { icon: string; title: string; detail: string; status: string; tone: "success" | "neutral"; ltr?: boolean }) {
  return (
    <div className="security-row">
      <div className="security-row__icon" aria-hidden>{icon}</div>
      <div>
        <b>{title}</b>
        <p dir={ltr ? "ltr" : undefined} className={ltr ? "contact-row__value" : undefined}>{detail}</p>
      </div>
      <StatusLabel tone={tone}>{status}</StatusLabel>
    </div>
  );
}

function PasswordForm({ hasPassword, onDone }: { hasPassword: boolean; onDone: (otherSessionsSignedOut: number) => Promise<void> }) {
  const { t } = useAccountCopy();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const result = await authService.setOrChangePassword({ currentPassword: currentPassword || undefined, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      await onDone(result.otherSessionsSignedOut ?? 0);
    } catch (err) {
      setError(err instanceof ApiError && err.code === "CURRENT_PASSWORD_INCORRECT" ? t("رمز فعلی درست نیست.", "The current password is wrong.") : err instanceof ApiError && err.code === "WEAK_PASSWORD" ? t("رمز جدید خیلی ساده است؛ رمز طولانی‌تر یا متفاوت‌تری انتخاب کنید.", "That password is too weak; choose a longer or less common one.") : t("رمز ذخیره نشد. دوباره تلاش کنید.", "The password wasn't saved. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ContextSurface className="account-form">
      <div>
        <h2 className="text-section-title">{hasPassword ? t("تغییر رمز عبور", "Change password") : t("تنظیم رمز عبور", "Set a password")}</h2>
        <p className="mt-1 text-metadata text-text-secondary">{t("پس از ذخیره، همهٔ دستگاه‌های دیگر خارج می‌شوند و این دستگاه وارد می‌ماند. حداقل ۸ نویسه.", "After saving, every other device is signed out and this one stays signed in. At least 8 characters.")}</p>
      </div>
      {hasPassword ? <PasswordInput label={t("رمز فعلی", "Current password")} autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /> : null}
      <PasswordInput label={t("رمز جدید", "New password")} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
      {error ? <p role="alert" className="text-body text-state-urgent">{error}</p> : null}
      <div>
        <Button isLoading={busy} disabled={newPassword.length < 8 || (hasPassword && !currentPassword)} onClick={save}>{t("ذخیره رمز", "Save password")}</Button>
      </div>
    </ContextSurface>
  );
}
