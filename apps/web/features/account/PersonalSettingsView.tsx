"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, ContextSurface, ErrorRecovery, Input, OtpInput, Select, Skeleton, StatusLabel } from "@petlife/ui";
import type { UserDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { usersService } from "@/services/users.service";
import { useSessionStore } from "@/stores/session-store";
import { useThemeStore } from "@/stores/theme-store";
import { useLocale } from "next-intl";
import { AccountPageHeader } from "./AccountNav";
import { useAccountCopy } from "./account-copy";
import { apiErrorText } from "@/lib/errors/api-error-text";

type ContactKind = "email" | "phone";

/**
 * Personal profile + preferences. Name, language and theme save explicitly;
 * email and phone only change through a code sent to the new contact, and
 * their badge reflects whether the contact was actually proven.
 */
export function PersonalSettingsView() {
  const { t } = useAccountCopy();
  const [user, setUser] = useState<UserDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState("");
  // Language and theme start from what is on screen (URL locale, applied theme) — never from the
  // account's stored values — so saving one never silently changes the other.
  const uiLocale = useLocale() === "en" ? "en" : "fa";
  const appliedTheme = useThemeStore((s) => s.theme);
  const applyTheme = useThemeStore((s) => s.setTheme);
  const [language, setLanguage] = useState<"fa" | "en">(uiLocale);
  const [theme, setTheme] = useState<"SYSTEM" | "LIGHT" | "DARK">(appliedTheme);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ContactKind | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const me = await usersService.getMe();
      setUser(me);
      setName(me.displayName);
      setLanguage(uiLocale);
      setTheme(appliedTheme);
    } catch {
      setFailed(true);
    }
    // Initial values only; later theme/locale changes must not reset unsaved edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function applyUser(updated: UserDto) {
    setUser(updated);
    useSessionStore.getState().setUser(updated);
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      const updated = await usersService.updateMe({ displayName: name.trim(), locale: language, themePreference: theme });
      applyUser(updated);
      applyTheme(theme);
      setSaved(true);
      // Only an explicit language change moves the app; a theme-only save stays on this locale.
      if (language !== uiLocale) window.location.assign(window.location.pathname.replace(/^\/(fa|en)(?=\/|$)/, `/${language}`));
    } catch (err) {
      setSaveError(apiErrorText(err, undefined, t("ذخیره انجام نشد. دوباره تلاش کنید.", "Could not save. Try again.")));
    } finally {
      setSaving(false);
    }
  }

  if (failed) return <ErrorRecovery title={t("اطلاعات شخصی", "Personal")} message={t("اطلاعات حساب بارگذاری نشد.", "Your account details didn't load.")} retryLabel={t("تلاش دوباره", "Retry")} onRetry={load} />;
  if (!user) return <Skeleton className="h-80 w-full" aria-label={t("در حال بارگذاری", "Loading")} />;

  const dirty = name.trim() !== user.displayName || language !== uiLocale || theme !== appliedTheme;

  return (
    <div className="account-stack">
      <AccountPageHeader eyebrow={t("شخصی", "PERSONAL")} title={t("اطلاعات و ترجیحات", "Profile & preferences")} description={t("نامی که دیگران در PET LIFE می‌بینند، راه‌های تماس تأییدشده و زبان و ظاهر حساب.", "The name others see in PET LIFE, your verified contact methods, and how the app looks and speaks.")} />

      <form
        className="account-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Input label={t("نام نمایشی", "Display name")} hint={t("در خانواده، انجمن و رزروها نمایش داده می‌شود.", "Shown in your household, the community and bookings.")} value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required />
        <div className="account-form-grid">
          <Select label={t("زبان", "Language")} value={language} onChange={(event) => setLanguage(event.target.value as "fa" | "en")} options={[{ value: "fa", label: "فارسی" }, { value: "en", label: "English" }]} />
          <Select
            label={t("ظاهر", "Appearance")}
            value={theme}
            onChange={(event) => setTheme(event.target.value as typeof theme)}
            options={[
              { value: "SYSTEM", label: t("مطابق دستگاه", "Match device") },
              { value: "LIGHT", label: t("روشن", "Light") },
              { value: "DARK", label: t("تیره", "Dark") },
            ]}
          />
        </div>
        <p className="text-metadata text-text-secondary">{t("تاریخ‌ها در فارسی به تقویم شمسی و در انگلیسی به تقویم میلادی نمایش داده می‌شوند.", "Dates show in the Solar Hijri calendar in Persian and the Gregorian calendar in English.")}</p>
        {saveError ? <p role="alert" className="text-body text-state-urgent">{saveError}</p> : null}
        <div className="flex items-center gap-3">
          <Button type="submit" isLoading={saving} disabled={!name.trim() || !dirty}>{t("ذخیره تغییرات", "Save changes")}</Button>
          {saved && !dirty ? <span role="status" className="text-metadata text-state-success">{t("ذخیره شد", "Saved")}</span> : null}
        </div>
      </form>

      <section aria-labelledby="contact-title">
        <div className="account-section-title">
          <div>
            <h2 id="contact-title">{t("راه‌های تماس", "Contact methods")}</h2>
            <p>{t("برای ورود، بازیابی و پیام‌های مهم استفاده می‌شوند. هر تغییر فقط با کدی که به راه جدید فرستاده می‌شود انجام می‌شود.", "Used to sign in, recover your account and receive important messages. A change only takes effect with a code sent to the new contact.")}</p>
          </div>
        </div>
        <div className="security-list">
          {(["phone", "email"] as const).map((kind) => (
            <ContactRow
              key={kind}
              kind={kind}
              user={user}
              editing={editing === kind}
              onEdit={() => setEditing(kind)}
              onDone={(updated) => {
                if (updated) applyUser(updated);
                setEditing(null);
              }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function ContactRow({ kind, user, editing, onEdit, onDone }: { kind: ContactKind; user: UserDto; editing: boolean; onEdit: () => void; onDone: (updated?: UserDto) => void }) {
  const { t } = useAccountCopy();
  const value = kind === "email" ? user.email : user.phone;
  const verified = kind === "email" ? user.emailVerified : user.phoneVerified;
  const label = kind === "email" ? t("ایمیل", "Email") : t("موبایل", "Mobile");
  const status = !value ? t("ثبت نشده", "Not added") : verified ? t("تأییدشده", "Verified") : t("تأییدنشده", "Not verified");

  return (
    <div className="contact-row">
      <div className="security-row">
        <div className="security-row__icon" aria-hidden>{kind === "email" ? "@" : "☏"}</div>
        <div>
          <b>{label}</b>
          <p dir="ltr" className="contact-row__value">{value ?? "—"}</p>
        </div>
        <div className="contact-row__actions">
          <StatusLabel tone={value && verified ? "success" : value ? "attention" : "neutral"}>{status}</StatusLabel>
          {!editing ? (
            <Button variant="ghost" size="sm" onClick={onEdit}>
              {!value ? t("افزودن", "Add") : verified ? t("تغییر", "Change") : t("تأیید", "Verify")}
            </Button>
          ) : null}
        </div>
      </div>
      {editing ? <ContactChangeForm kind={kind} initial={value && !verified ? value : ""} onDone={onDone} /> : null}
    </div>
  );
}

function ContactChangeForm({ kind, initial, onDone }: { kind: ContactKind; initial: string; onDone: (updated?: UserDto) => void }) {
  const { t } = useAccountCopy();
  const [value, setValue] = useState(initial);
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"enter" | "code">("enter");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function explain(err: unknown): string {
    if (!(err instanceof ApiError)) return t("انجام نشد. دوباره تلاش کنید.", "That didn't work. Please try again.");
    if (err.code === "OTP_RATE_LIMITED") return t("کمی صبر کنید و دوباره کد بخواهید.", "Please wait a moment before asking for another code.");
    if (err.code === "OTP_INVALID") return t("کد درست نیست یا منقضی شده است.", "That code is wrong or has expired.");
    if (err.code === "CONTACT_UNAVAILABLE") return t("این راه تماس را نمی‌توان برای حساب شما استفاده کرد.", "This contact can't be used for your account.");
    if (err.code === "CONTACT_UNCHANGED") return t("این همان راه تماس تأییدشدهٔ فعلی شماست.", "That's already your verified contact.");
    return err.message;
  }

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      await usersService.requestContactChange(kind, value.trim());
      setStep("code");
    } catch (err) {
      setError(explain(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      onDone(await usersService.confirmContactChange(kind, value.trim(), code));
    } catch (err) {
      setError(explain(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ContextSurface className="contact-change">
      {step === "enter" ? (
        <>
          <Input
            label={kind === "email" ? t("ایمیل جدید", "New email") : t("شمارهٔ موبایل جدید", "New mobile number")}
            type={kind === "email" ? "email" : "tel"}
            inputMode={kind === "email" ? "email" : "tel"}
            autoComplete={kind === "email" ? "email" : "tel"}
            dir="ltr"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <p className="text-metadata text-text-secondary">{t("یک کد به این راه تماس فرستاده می‌شود. تا زمان تأیید، راه تماس فعلی شما تغییری نمی‌کند.", "We'll send a code to this contact. Your current contact stays in place until you confirm.")}</p>
        </>
      ) : (
        <>
          <p className="text-body text-text-primary">
            {t("کد فرستاده‌شده به", "Enter the code sent to")} <span dir="ltr">{value}</span>
          </p>
          <OtpInput value={code} onChange={setCode} disabled={busy} />
        </>
      )}
      {error ? <p role="alert" className="text-body text-state-urgent">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => onDone()} disabled={busy}>{t("انصراف", "Cancel")}</Button>
        {step === "enter" ? (
          <Button isLoading={busy} disabled={value.trim().length < 5} onClick={sendCode}>{t("ارسال کد", "Send code")}</Button>
        ) : (
          <>
            <Button variant="secondary" disabled={busy} onClick={sendCode}>{t("ارسال دوباره", "Resend")}</Button>
            <Button isLoading={busy} disabled={code.length < 4} onClick={confirm}>{t("تأیید و ذخیره", "Confirm & save")}</Button>
          </>
        )}
      </div>
    </ContextSurface>
  );
}
