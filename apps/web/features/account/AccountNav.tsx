"use client";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import type { RouteLocale } from "@/lib/i18n/config";
import "./account-visual.css";

/** The canonical Account sections, in order. Membership lives here too, so the account area answers "what do I have?" in one place. */
export const ACCOUNT_SECTIONS = [
  { suffix: "", fa: "نمای کلی", en: "Overview", de: "Übersicht", es: "Resumen", ar: "نظرة عامة", nl: "Overzicht", hint: { fa: "", en: "", de: "", es: "", ar: "", nl: "" } },
  { suffix: "/personal", fa: "اطلاعات و ترجیحات", en: "Profile & preferences", de: "Profil und Einstellungen", es: "Perfil y preferencias", ar: "الملف الشخصي والتفضيلات", nl: "Profiel en voorkeuren", hint: { fa: "نام، راه‌های تماس، زبان و ظاهر", en: "Name, contacts, language and appearance", de: "Name, Kontakte, Sprache und Darstellung", es: "Nombre, contactos, idioma y apariencia", ar: "الاسم ووسائل التواصل واللغة والمظهر", nl: "Naam, contactgegevens, taal en weergave" } },
  { suffix: "/household", fa: "خانواده و دسترسی", en: "Household & access", de: "Haushalt und Zugriff", es: "Hogar y acceso", ar: "الأسرة والوصول", nl: "Huishouden en toegang", hint: { fa: "اعضا، دعوت‌ها و دسترسی به حیوانات", en: "Members, invitations and pet access", de: "Mitglieder, Einladungen und Tierzugriff", es: "Miembros, invitaciones y acceso a mascotas", ar: "الأعضاء والدعوات والوصول إلى الحيوانات الأليفة", nl: "Leden, uitnodigingen en toegang tot huisdieren" } },
  { suffix: "/membership", fa: "عضویت", en: "Membership", de: "Mitgliedschaft", es: "Membresía", ar: "العضوية", nl: "Lidmaatschap", hint: { fa: "طرح، دورهٔ فعلی، سهمیه‌ها و پرداخت‌ها", en: "Plan, current period, limits and payments", de: "Tarif, aktueller Zeitraum, Limits und Zahlungen", es: "Plan, periodo actual, límites y pagos", ar: "الخطة والفترة الحالية والحدود والمدفوعات", nl: "Plan, huidige periode, limieten en betalingen" } },
  { suffix: "/notifications", fa: "اعلان‌ها", en: "Notifications", de: "Benachrichtigungen", es: "Notificaciones", ar: "الإشعارات", nl: "Meldingen", hint: { fa: "چه پیامی، از چه راهی", en: "Which messages, through which channel", de: "Welche Nachrichten über welchen Kanal", es: "Qué mensajes recibes y por qué canal", ar: "أي رسائل، وعبر أي قناة", nl: "Welke berichten, via welk kanaal" } },
  { suffix: "/security", fa: "امنیت", en: "Security", de: "Sicherheit", es: "Seguridad", ar: "الأمان", nl: "Beveiliging", hint: { fa: "روش‌های ورود، دستگاه‌ها و رمز عبور", en: "Sign-in methods, devices and password", de: "Anmeldemethoden, Geräte und Passwort", es: "Métodos de acceso, dispositivos y contraseña", ar: "طرق تسجيل الدخول والأجهزة وكلمة المرور", nl: "Inlogmethoden, apparaten en wachtwoord" } },
  { suffix: "/privacy", fa: "حریم خصوصی", en: "Privacy", de: "Datenschutz", es: "Privacidad", ar: "الخصوصية", nl: "Privacy", hint: { fa: "رضایت‌ها، اشتراک‌گذاری، دریافت و حذف داده", en: "Consents, sharing, export and deletion", de: "Einwilligungen, Freigaben, Export und Löschung", es: "Consentimientos, uso compartido, exportación y eliminación", ar: "الموافقات والمشاركة والتصدير والحذف", nl: "Toestemmingen, delen, exporteren en verwijderen" } },
  { suffix: "/activity", fa: "فعالیت‌ها", en: "Activity", de: "Aktivitäten", es: "Actividad", ar: "النشاط", nl: "Activiteit", hint: { fa: "ورودها و تغییرات مهم", en: "Sign-ins and important changes", de: "Anmeldungen und wichtige Änderungen", es: "Accesos y cambios importantes", ar: "عمليات تسجيل الدخول والتغييرات المهمة", nl: "Inlogs en belangrijke wijzigingen" } },
] as const;

/**
 * Desktop: a sticky section sidebar (inline-start in both directions).
 * Mobile: the overview is the settings index (a full-width section list) and
 * each section page shows a back link instead of a squeezed tab strip.
 */
export function AccountNav() {
  const locale = useLocale() as RouteLocale;
  const clinic=useTranslations("clinicCustomerExtras");
  const pathname = usePathname() ?? "";
  const base = `/${locale}/profile`;
  const onOverview = pathname === base || pathname === `${base}/`;
  const fa = locale === "fa";
  return (
    <div className={onOverview ? "account-rail account-rail--index" : "account-rail"}>
      <nav className={onOverview ? "account-nav account-nav--index" : "account-nav"} aria-label={({ fa: "مدیریت حساب", en: "Account settings", de: "Kontoeinstellungen", es: "Configuración de la cuenta", ar: "إعدادات الحساب", nl: "Accountinstellingen" })[locale]}>
        <p>{({ fa: "حساب کاربری", en: "ACCOUNT", de: "KONTO", es: "CUENTA", ar: "الحساب", nl: "ACCOUNT" })[locale]}</p>
        {ACCOUNT_SECTIONS.map((section) => {
          const href = `${base}${section.suffix}`;
          const active = section.suffix ? pathname.startsWith(href) : onOverview;
          return (
            <Link key={section.suffix || "overview"} href={href} aria-current={active ? "page" : undefined} className={section.suffix ? undefined : "account-nav__overview"}>
              <span>{section[locale]}</span>
              {section.hint.en ? <small>{section.hint[locale]}</small> : null}
            </Link>
          );
        })}
        <Link href={`${base}/clinic-notes`} aria-current={pathname===`${base}/clinic-notes`?"page":undefined}><span>{clinic("sharedNotesTitle")}</span><small>{clinic("navHint")}</small></Link>
      </nav>
      {!onOverview ? (
        <Link href={base} className="account-back">
          <span aria-hidden>{fa ? "→" : "←"}</span> {({ fa: "حساب کاربری", en: "Account", de: "Konto", es: "Cuenta", ar: "الحساب", nl: "Account" })[locale]}
        </Link>
      ) : null}
    </div>
  );
}

export function AccountPageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <header className="account-page-header">
      <p>{eyebrow}</p>
      <h1>{title}</h1>
      <span>{description}</span>
    </header>
  );
}
