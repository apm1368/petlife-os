"use client";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import type { RouteLocale } from "@/lib/i18n/config";
import "./account-visual.css";

/** The canonical Account sections, in order. Membership lives here too, so the account area answers "what do I have?" in one place. */
export const ACCOUNT_SECTIONS = [
  { suffix: "", fa: "نمای کلی", en: "Overview", de: "Übersicht", es: "Resumen", hint: { fa: "", en: "", de: "", es: "" } },
  { suffix: "/personal", fa: "اطلاعات و ترجیحات", en: "Profile & preferences", de: "Profil und Einstellungen", es: "Perfil y preferencias", hint: { fa: "نام، راه‌های تماس، زبان و ظاهر", en: "Name, contacts, language and appearance", de: "Name, Kontakte, Sprache und Darstellung", es: "Nombre, contactos, idioma y apariencia" } },
  { suffix: "/household", fa: "خانواده و دسترسی", en: "Household & access", de: "Haushalt und Zugriff", es: "Hogar y acceso", hint: { fa: "اعضا، دعوت‌ها و دسترسی به حیوانات", en: "Members, invitations and pet access", de: "Mitglieder, Einladungen und Tierzugriff", es: "Miembros, invitaciones y acceso a mascotas" } },
  { suffix: "/membership", fa: "عضویت", en: "Membership", de: "Mitgliedschaft", es: "Membresía", hint: { fa: "طرح، دورهٔ فعلی، سهمیه‌ها و پرداخت‌ها", en: "Plan, current period, limits and payments", de: "Tarif, aktueller Zeitraum, Limits und Zahlungen", es: "Plan, periodo actual, límites y pagos" } },
  { suffix: "/notifications", fa: "اعلان‌ها", en: "Notifications", de: "Benachrichtigungen", es: "Notificaciones", hint: { fa: "چه پیامی، از چه راهی", en: "Which messages, through which channel", de: "Welche Nachrichten über welchen Kanal", es: "Qué mensajes recibes y por qué canal" } },
  { suffix: "/security", fa: "امنیت", en: "Security", de: "Sicherheit", es: "Seguridad", hint: { fa: "روش‌های ورود، دستگاه‌ها و رمز عبور", en: "Sign-in methods, devices and password", de: "Anmeldemethoden, Geräte und Passwort", es: "Métodos de acceso, dispositivos y contraseña" } },
  { suffix: "/privacy", fa: "حریم خصوصی", en: "Privacy", de: "Datenschutz", es: "Privacidad", hint: { fa: "رضایت‌ها، اشتراک‌گذاری، دریافت و حذف داده", en: "Consents, sharing, export and deletion", de: "Einwilligungen, Freigaben, Export und Löschung", es: "Consentimientos, uso compartido, exportación y eliminación" } },
  { suffix: "/activity", fa: "فعالیت‌ها", en: "Activity", de: "Aktivitäten", es: "Actividad", hint: { fa: "ورودها و تغییرات مهم", en: "Sign-ins and important changes", de: "Anmeldungen und wichtige Änderungen", es: "Accesos y cambios importantes" } },
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
      <nav className={onOverview ? "account-nav account-nav--index" : "account-nav"} aria-label={({ fa: "مدیریت حساب", en: "Account settings", de: "Kontoeinstellungen", es: "Configuración de la cuenta" })[locale]}>
        <p>{({ fa: "حساب کاربری", en: "ACCOUNT", de: "KONTO", es: "CUENTA" })[locale]}</p>
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
          <span aria-hidden>{fa ? "→" : "←"}</span> {({ fa: "حساب کاربری", en: "Account", de: "Konto", es: "Cuenta" })[locale]}
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
