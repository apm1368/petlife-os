"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, Input, Select, Skeleton } from "@petlife/ui";
import { usersService } from "@/services/users.service";
import { useSessionStore } from "@/stores/session-store";
import type { UserDto } from "@petlife/types";
import { AccountPageHeader } from "./AccountNav";

export function PersonalSettingsView() {
  const locale = useLocale(); const common = useTranslations("common");
  const [user, setUser] = useState<UserDto | null>(null); const [name, setName] = useState("");
  const [language, setLanguage] = useState<"fa" | "en">("fa"); const [theme, setTheme] = useState<"SYSTEM" | "LIGHT" | "DARK">("SYSTEM");
  const [saving, setSaving] = useState(false); const [saved, setSaved] = useState(false); const [error, setError] = useState(false);
  useEffect(() => { void usersService.getMe().then((value) => { setUser(value); setName(value.displayName); setLanguage(value.locale); setTheme(value.themePreference); }); }, []);
  async function save() {
    setSaving(true); setSaved(false); setError(false);
    try { const updated = await usersService.updateMe({ displayName: name.trim(), locale: language, themePreference: theme }); setUser(updated); useSessionStore.getState().setUser(updated); setSaved(true); }
    catch { setError(true); } finally { setSaving(false); }
  }
  if (!user) return <Skeleton className="h-80 w-full" aria-label={common("loading")} />;
  return <div className="account-stack">
    <AccountPageHeader eyebrow={locale === "fa" ? "شخصی" : "PERSONAL"} title={locale === "fa" ? "اطلاعات و ترجیحات" : "Profile & preferences"} description={locale === "fa" ? "چیزهایی که دیگران در PET LIFE از شما می‌بینند و تجربهٔ نمایش حساب." : "What PET LIFE shows about you and how your account feels."} />
    <form className="account-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <Input label={locale === "fa" ? "نام نمایشی" : "Display name"} value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required />
      <div className="account-form-grid">
        <Select label={locale === "fa" ? "زبان" : "Language"} value={language} onChange={(event) => setLanguage(event.target.value as "fa" | "en")} options={[{ value: "fa", label: "فارسی" }, { value: "en", label: "English" }]} />
        <Select label={locale === "fa" ? "پوسته" : "Theme"} value={theme} onChange={(event) => setTheme(event.target.value as typeof theme)} options={[{ value: "SYSTEM", label: locale === "fa" ? "مطابق دستگاه" : "System" }, { value: "LIGHT", label: locale === "fa" ? "روشن" : "Light" }, { value: "DARK", label: locale === "fa" ? "تیره" : "Dark" }]} />
      </div>
      {error && <p role="alert" className="text-state-urgent">{locale === "fa" ? "ذخیره انجام نشد. دوباره تلاش کنید." : "Could not save. Try again."}</p>}
      <div className="flex items-center gap-3"><Button type="submit" isLoading={saving} disabled={!name.trim()}>{locale === "fa" ? "ذخیره تغییرات" : "Save changes"}</Button>{saved && <span role="status" className="text-state-success">{locale === "fa" ? "ذخیره شد" : "Saved"}</span>}</div>
    </form>
    <ContextSurface className="account-contact-card"><div><b>{locale === "fa" ? "راه‌های ارتباطی تأییدشده" : "Verified contact methods"}</b><p>{locale === "fa" ? "تغییر ایمیل یا موبایل تنها پس از تأیید راه ارتباطی جدید انجام می‌شود." : "Email or phone changes only take effect after the new contact is verified."}</p></div><dl><div><dt>{locale === "fa" ? "ایمیل" : "Email"}</dt><dd>{user.email ?? "—"}</dd></div><div><dt>{locale === "fa" ? "موبایل" : "Phone"}</dt><dd>{user.phone ?? "—"}</dd></div></dl></ContextSurface>
  </div>;
}
