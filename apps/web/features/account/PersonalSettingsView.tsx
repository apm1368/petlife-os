"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, ContextSurface, ErrorRecovery, Input, OtpInput, Select, Skeleton, StatusLabel } from "@petlife/ui";
import type { UserDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { usersService } from "@/services/users.service";
import { useSessionStore } from "@/stores/session-store";
import { useThemeStore } from "@/stores/theme-store";
import { DisplayModeToggle } from "@/features/display-mode/DisplayModeToggle";
import { useLocale } from "next-intl";
import { AccountPageHeader } from "./AccountNav";
import { useAccountCopy } from "./account-copy";
import type { RouteLocale } from "@/lib/i18n/config";

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
  // The language control reflects the saved account preference, while theme reflects what is applied.
  const locale = useLocale() as RouteLocale;
  const uiLocale = locale;
  const appliedTheme = useThemeStore((s) => s.theme);
  const applyTheme = useThemeStore((s) => s.setTheme);
  const [language, setLanguage] = useState<RouteLocale>(uiLocale);
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
      setLanguage(me.locale);
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
    if (!user) return;
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      const updated = await usersService.updateMe({ displayName: name.trim(), locale: language, themePreference: theme });
      applyUser(updated);
      applyTheme(theme);
      setSaved(true);
      // Only an explicit preference change moves the app. Preserve query and fragment state.
      if (language !== user.locale) {
        const path = window.location.pathname.replace(/^\/(fa|en|de|es)(?=\/|$)/, `/${language}`);
        window.location.assign(`${path}${window.location.search}${window.location.hash}`);
      }
    } catch {
      // API messages are not guaranteed to be translated into the selected
      // language. Keep failures in the page locale instead of leaking raw
      // backend copy into a German or Spanish screen.
      setSaveError(t("ذخیره انجام نشد. دوباره تلاش کنید.", "Could not save. Try again.", "Speichern fehlgeschlagen. Bitte versuchen Sie es erneut.", "No se pudo guardar. Inténtalo de nuevo.", "تعذّر الحفظ. حاول مرة أخرى.", "Opslaan is mislukt. Probeer het opnieuw."));
    } finally {
      setSaving(false);
    }
  }

  if (failed) return <ErrorRecovery title={t("اطلاعات شخصی", "Personal", "Persönliche Angaben", "Datos personales", "شخصي", "Persoonlijk")} message={t("اطلاعات حساب بارگذاری نشد.", "Your account details didn't load.", "Ihre Kontodaten konnten nicht geladen werden.", "No se pudieron cargar los datos de tu cuenta.", "لم يتم تحميل تفاصيل حسابك.", "Je accountgegevens zijn niet geladen.")} retryLabel={t("تلاش دوباره", "Retry", "Erneut versuchen", "Reintentar", "إعادة المحاولة", "Opnieuw proberen")} onRetry={load} />;
  if (!user) return <Skeleton className="h-80 w-full" aria-label={t("در حال بارگذاری", "Loading", "Wird geladen", "Cargando", "جارٍ التحميل", "Laden")} />;

  const dirty = name.trim() !== user.displayName || language !== user.locale || theme !== appliedTheme;

  return (
    <div className="account-stack">
      <AccountPageHeader eyebrow={t("شخصی", "PERSONAL", "PERSÖNLICH", "PERSONAL", "شخصي", "PERSOONLIJK")} title={t("اطلاعات و ترجیحات", "Profile & preferences", "Profil und Einstellungen", "Perfil y preferencias", "الملف الشخصي والتفضيلات", "Profiel en voorkeuren")} description={t("نامی که دیگران در اپت لایف می‌بینند، راه‌های تماس تأییدشده و زبان و ظاهر حساب.", "The name others see in opetlife, your verified contact methods, and how the app looks and speaks.", "Der Name, den andere bei opetlife sehen, Ihre bestätigten Kontaktwege sowie Sprache und Darstellung der App.", "El nombre que otras personas ven en opetlife, tus medios de contacto verificados y el idioma y aspecto de la aplicación.", "الاسم الذي يراه الآخرون في opetlife، ووسائل التواصل المُتحقق منها، وشكل التطبيق ولغته.", "De naam die anderen in opetlife zien, je geverifieerde contactmethoden en hoe de app eruitziet en spreekt.")} />

      <form
        className="account-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Input label={t("نام نمایشی", "Display name", "Anzeigename", "Nombre visible", "الاسم المعروض", "Weergavenaam")} hint={t("در خانواده، انجمن و رزروها نمایش داده می‌شود.", "Shown in your household, the community and bookings.", "Wird in Ihrem Haushalt, in der Community und bei Buchungen angezeigt.", "Se muestra en tu hogar, la comunidad y las reservas.", "يظهر في أسرتك والمجتمع والحجوزات.", "Zichtbaar in je huishouden, de community en boekingen.")} value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required />
        <div className="account-form-grid">
          <Select label={languageLabel(locale)} value={language} onChange={(event) => setLanguage(event.target.value as RouteLocale)} options={[{ value: "fa", label: "فارسی" }, { value: "en", label: "English" }, { value: "de", label: "Deutsch" }, { value: "es", label: "Español" }, { value: "ar", label: "العربية" }, { value: "nl", label: "Nederlands" }]} />
          <Select
            label={t("ظاهر", "Appearance", "Darstellung", "Aspecto", "المظهر", "Weergave")}
            value={theme}
            onChange={(event) => setTheme(event.target.value as typeof theme)}
            options={[
              { value: "SYSTEM", label: t("مطابق دستگاه", "Match device", "Wie auf dem Gerät", "Igual que el dispositivo", "مطابقة الجهاز", "Zoals apparaat") },
              { value: "LIGHT", label: t("روشن", "Light", "Hell", "Claro", "فاتح", "Licht") },
              { value: "DARK", label: t("تیره", "Dark", "Dunkel", "Oscuro", "داكن", "Donker") },
            ]}
          />
        </div>
        <p className="text-metadata text-text-secondary">{datePreferenceCopy(locale)}</p>
        <div className="security-row">
          <div>
            <b>{t("نمایش ساده", "Simple display")}</b>
            <p>{t(
              "متن خواناتر و کنترل‌های بزرگ‌تر؛ این انتخاب فقط روی همین دستگاه ذخیره می‌شود و به زبان یا پوسته وابسته نیست.",
              "Clearer text and larger controls. This choice is saved on this device and is independent of language and theme.",
              "Übersichtlichere Texte und größere Bedienelemente. Diese Einstellung wird nur auf diesem Gerät gespeichert und ist unabhängig von Sprache und Darstellung.",
              "Texto más claro y controles más grandes. Esta opción se guarda solo en este dispositivo y es independiente del idioma y del tema.", "نص أوضح وعناصر تحكم أكبر. يُحفظ هذا الاختيار على هذا الجهاز ولا يرتبط باللغة أو السمة.", "Duidelijkere tekst en grotere bedieningselementen. Deze keuze wordt op dit apparaat opgeslagen en staat los van taal en thema.",
            )}</p>
          </div>
          <DisplayModeToggle locale={uiLocale} />
        </div>
        {saveError ? <p role="alert" className="text-body text-state-urgent">{saveError}</p> : null}
        <div className="flex items-center gap-3">
          <Button type="submit" isLoading={saving} disabled={!name.trim() || !dirty}>{t("ذخیره تغییرات", "Save changes", "Änderungen speichern", "Guardar cambios", "حفظ التغييرات", "Wijzigingen opslaan")}</Button>
          {saved && !dirty ? <span role="status" className="text-metadata text-state-success">{t("ذخیره شد", "Saved", "Gespeichert", "Guardado", "تم الحفظ", "Opgeslagen")}</span> : null}
        </div>
      </form>

      <section aria-labelledby="contact-title">
        <div className="account-section-title">
          <div>
            <h2 id="contact-title">{t("راه‌های تماس", "Contact methods", "Kontaktwege", "Medios de contacto", "وسائل التواصل", "Contactmethoden")}</h2>
            <p>{t("برای ورود، بازیابی و پیام‌های مهم استفاده می‌شوند. هر تغییر فقط با کدی که به راه جدید فرستاده می‌شود انجام می‌شود.", "Used to sign in, recover your account and receive important messages. A change only takes effect with a code sent to the new contact.", "Sie dienen der Anmeldung, Kontowiederherstellung und wichtigen Mitteilungen. Änderungen gelten erst nach Eingabe eines Codes, der an den neuen Kontakt gesendet wird.", "Se usan para iniciar sesión, recuperar la cuenta y recibir avisos importantes. Los cambios solo se aplican con el código enviado al nuevo medio de contacto.", "تُستخدم لتسجيل الدخول واستعادة حسابك وتلقي الرسائل المهمة. لا يسري أي تغيير إلا برمز يُرسل إلى وسيلة التواصل الجديدة.", "Gebruikt om in te loggen, je account te herstellen en belangrijke berichten te ontvangen. Een wijziging gaat pas in met een code die naar het nieuwe contact wordt gestuurd.")}</p>
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

function languageLabel(locale: RouteLocale): string {
  return ({ fa: "زبان", en: "Language", de: "Sprache", es: "Idioma", ar: "اللغة", nl: "Taal" })[locale];
}

function datePreferenceCopy(locale: RouteLocale): string {
  return ({
    fa: "تاریخ‌ها در فارسی به تقویم شمسی و در انگلیسی، آلمانی و اسپانیایی به تقویم میلادی نمایش داده می‌شوند.",
    en: "Dates use the Solar Hijri calendar in Persian and the Gregorian calendar in English, German and Spanish.",
    de: "Datumsangaben verwenden auf Persisch den Solar-Hidschri-Kalender und auf Englisch, Deutsch und Spanisch den gregorianischen Kalender.",
    es: "Las fechas usan el calendario Solar Hiyri en persa y el calendario gregoriano en inglés, alemán y español.",
    ar: "تُعرض التواريخ بالتقويم الهجري الشمسي في الفارسية، وبالتقويم الميلادي في اللغات الأخرى.",
    nl: "Datums gebruiken de Iraanse zonnekalender in het Perzisch en de gregoriaanse kalender in de andere talen.",
  })[locale];
}

function ContactRow({ kind, user, editing, onEdit, onDone }: { kind: ContactKind; user: UserDto; editing: boolean; onEdit: () => void; onDone: (updated?: UserDto) => void }) {
  const { t } = useAccountCopy();
  const value = kind === "email" ? user.email : user.phone;
  const verified = kind === "email" ? user.emailVerified : user.phoneVerified;
  const label = kind === "email" ? t("ایمیل", "Email", "E-Mail", "Correo", "البريد الإلكتروني", "E-mail") : t("موبایل", "Mobile", "Mobiltelefon", "Móvil", "الهاتف المحمول", "Mobiel");
  const status = !value ? t("ثبت نشده", "Not added", "Nicht hinzugefügt", "No añadido", "غير مُضاف", "Niet toegevoegd") : verified ? t("تأییدشده", "Verified", "Verifiziert", "Verificado", "مُتحقق منه", "Geverifieerd") : t("تأییدنشده", "Not verified", "Nicht verifiziert", "No verificado", "غير مُتحقق منه", "Niet geverifieerd");

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
              {!value ? t("افزودن", "Add", "Hinzufügen", "Añadir", "إضافة", "Toevoegen") : verified ? t("تغییر", "Change", "Ändern", "Cambiar", "تغيير", "Wijzigen") : t("تأیید", "Verify", "Verifizieren", "Verificar", "تحقق", "Verifiëren")}
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
    if (!(err instanceof ApiError)) return t("انجام نشد. دوباره تلاش کنید.", "That didn't work. Please try again.", "Das hat nicht funktioniert. Bitte versuchen Sie es erneut.", "No se pudo completar. Inténtalo de nuevo.", "لم ينجح ذلك. يُرجى المحاولة مرة أخرى.", "Dat is niet gelukt. Probeer het opnieuw.");
    if (err.code === "OTP_RATE_LIMITED") return t("کمی صبر کنید و دوباره کد بخواهید.", "Please wait a moment before asking for another code.", "Bitte warten Sie kurz, bevor Sie einen neuen Code anfordern.", "Espera un momento antes de solicitar otro código.", "يُرجى الانتظار قليلًا قبل طلب رمز آخر.", "Wacht even voordat je een nieuwe code aanvraagt.");
    if (err.code === "OTP_INVALID") return t("کد درست نیست یا منقضی شده است.", "That code is wrong or has expired.", "Der Code ist falsch oder abgelaufen.", "El código es incorrecto o ha caducado.", "هذا الرمز خاطئ أو منتهي الصلاحية.", "Die code is onjuist of verlopen.");
    if (err.code === "CONTACT_UNAVAILABLE") return t("این راه تماس را نمی‌توان برای حساب شما استفاده کرد.", "This contact can't be used for your account.", "Dieser Kontakt kann nicht für Ihr Konto verwendet werden.", "No se puede usar este contacto en tu cuenta.", "لا يمكن استخدام وسيلة التواصل هذه لحسابك.", "Dit contact kan niet voor je account worden gebruikt.");
    if (err.code === "CONTACT_UNCHANGED") return t("این همان راه تماس تأییدشدهٔ فعلی شماست.", "That's already your verified contact.", "Das ist bereits Ihr bestätigter Kontakt.", "Ese ya es tu contacto verificado.", "هذه بالفعل وسيلة التواصل المُتحقق منها لديك.", "Dat is al je geverifieerde contact.");
    if (err.code === "MESSAGING_PROVIDER_UNAVAILABLE" || err.code === "MESSAGING_PROVIDER_DISABLED" || err.code === "MESSAGING_PROVIDER_NOT_CONFIGURED") {
      return t("ارسال کد فعلاً در دسترس نیست.", "Code delivery is not available right now.", "Der Codeversand ist derzeit nicht verfügbar.", "El envío del código no está disponible ahora.", "إرسال الرمز غير متاح حاليًا.", "Codes versturen is nu niet mogelijk.");
    }
    if (err.code === "MESSAGING_SEND_FAILED") {
      return t("کد ارسال نشد. دوباره تلاش کنید.", "The code could not be sent. Try again.", "Der Code konnte nicht gesendet werden. Bitte versuchen Sie es erneut.", "No se pudo enviar el código. Inténtalo de nuevo.", "تعذّر إرسال الرمز. حاول مرة أخرى.", "De code kon niet worden verstuurd. Probeer het opnieuw.");
    }
    return t("درخواست انجام نشد. دوباره تلاش کنید.", "That request didn't work. Please try again.", "Die Anfrage ist fehlgeschlagen. Bitte versuchen Sie es erneut.", "La solicitud no se completó. Inténtalo de nuevo.", "لم ينجح هذا الطلب. يُرجى المحاولة مرة أخرى.", "Dat verzoek is niet gelukt. Probeer het opnieuw.");
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
            label={kind === "email" ? t("ایمیل جدید", "New email", "Neue E-Mail-Adresse", "Correo nuevo", "بريد إلكتروني جديد", "Nieuw e-mailadres") : t("شمارهٔ موبایل جدید", "New mobile number", "Neue Mobiltelefonnummer", "Número de móvil nuevo", "رقم هاتف محمول جديد", "Nieuw mobiel nummer")}
            type={kind === "email" ? "email" : "tel"}
            inputMode={kind === "email" ? "email" : "tel"}
            autoComplete={kind === "email" ? "email" : "tel"}
            dir="ltr"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <p className="text-metadata text-text-secondary">{t("یک کد به این راه تماس فرستاده می‌شود. تا زمان تأیید، راه تماس فعلی شما تغییری نمی‌کند.", "We'll send a code to this contact. Your current contact stays in place until you confirm.", "Wir senden einen Code an diesen Kontakt. Ihr aktueller Kontakt bleibt bestehen, bis Sie den neuen bestätigen.", "Enviaremos un código a este contacto. El contacto actual seguirá activo hasta que confirmes el nuevo.", "سنرسل رمزًا إلى وسيلة التواصل هذه. تبقى وسيلة التواصل الحالية كما هي حتى تؤكد.", "We sturen een code naar dit contact. Je huidige contact blijft staan tot je bevestigt.")}</p>
        </>
      ) : (
        <>
          <p className="text-body text-text-primary">
            {t("کد فرستاده‌شده به", "Enter the code sent to", "Geben Sie den Code ein, der gesendet wurde an", "Introduce el código enviado a", "أدخل الرمز المرسل إلى", "Voer de code in die is verstuurd naar")} <span dir="ltr">{value}</span>
          </p>
          <OtpInput value={code} onChange={setCode} disabled={busy} label={t("کد یک‌بارمصرف", "One-time passcode", "Einmalcode", "Código de un solo uso", "رمز المرور لمرة واحدة", "Eenmalige code")} />
        </>
      )}
      {error ? <p role="alert" className="text-body text-state-urgent">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => onDone()} disabled={busy}>{t("انصراف", "Cancel", "Abbrechen", "Cancelar", "إلغاء", "Annuleren")}</Button>
        {step === "enter" ? (
          <Button isLoading={busy} disabled={value.trim().length < 5} onClick={sendCode}>{t("ارسال کد", "Send code", "Code senden", "Enviar código", "إرسال الرمز", "Code versturen")}</Button>
        ) : (
          <>
            <Button variant="secondary" disabled={busy} onClick={sendCode}>{t("ارسال دوباره", "Resend", "Erneut senden", "Reenviar", "إعادة الإرسال", "Opnieuw versturen")}</Button>
            <Button isLoading={busy} disabled={code.length < 4} onClick={confirm}>{t("تأیید و ذخیره", "Confirm & save", "Bestätigen und speichern", "Confirmar y guardar", "تأكيد وحفظ", "Bevestigen en opslaan")}</Button>
          </>
        )}
      </div>
    </ContextSurface>
  );
}
