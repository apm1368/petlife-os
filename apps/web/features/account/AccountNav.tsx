"use client";
import Link from "next/link";
import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";

/** The canonical Account sections, in order. Membership lives here too, so the account area answers "what do I have?" in one place. */
export const ACCOUNT_SECTIONS = [
  { suffix: "", fa: "نمای کلی", en: "Overview", hint: { fa: "", en: "" } },
  { suffix: "/personal", fa: "اطلاعات و ترجیحات", en: "Profile & preferences", hint: { fa: "نام، راه‌های تماس، زبان و ظاهر", en: "Name, contacts, language and appearance" } },
  { suffix: "/household", fa: "خانواده و دسترسی", en: "Household & access", hint: { fa: "اعضا، دعوت‌ها و دسترسی به حیوانات", en: "Members, invitations and pet access" } },
  { suffix: "/membership", fa: "عضویت", en: "Membership", hint: { fa: "طرح، دورهٔ فعلی، سهمیه‌ها و پرداخت‌ها", en: "Plan, current period, limits and payments" } },
  { suffix: "/notifications", fa: "اعلان‌ها", en: "Notifications", hint: { fa: "چه پیامی، از چه راهی", en: "Which messages, through which channel" } },
  { suffix: "/security", fa: "امنیت", en: "Security", hint: { fa: "روش‌های ورود، دستگاه‌ها و رمز عبور", en: "Sign-in methods, devices and password" } },
  { suffix: "/privacy", fa: "حریم خصوصی", en: "Privacy", hint: { fa: "رضایت‌ها، اشتراک‌گذاری، دریافت و حذف داده", en: "Consents, sharing, export and deletion" } },
  { suffix: "/activity", fa: "فعالیت‌ها", en: "Activity", hint: { fa: "ورودها و تغییرات مهم", en: "Sign-ins and important changes" } },
] as const;

/**
 * Desktop: a sticky section sidebar (inline-start in both directions).
 * Mobile: the overview is the settings index (a full-width section list) and
 * each section page shows a back link instead of a squeezed tab strip.
 */
export function AccountNav() {
  const locale = useLocale();
  const pathname = usePathname() ?? "";
  const base = `/${locale}/profile`;
  const onOverview = pathname === base || pathname === `${base}/`;
  const fa = locale === "fa";
  return (
    <div className={onOverview ? "account-rail account-rail--index" : "account-rail"}>
      <nav className={onOverview ? "account-nav account-nav--index" : "account-nav"} aria-label={fa ? "مدیریت حساب" : "Account settings"}>
        <p>{fa ? "حساب کاربری" : "ACCOUNT"}</p>
        {ACCOUNT_SECTIONS.map((section) => {
          const href = `${base}${section.suffix}`;
          const active = section.suffix ? pathname.startsWith(href) : onOverview;
          return (
            <Link key={section.suffix || "overview"} href={href} aria-current={active ? "page" : undefined} className={section.suffix ? undefined : "account-nav__overview"}>
              <span>{fa ? section.fa : section.en}</span>
              {section.hint.en ? <small>{fa ? section.hint.fa : section.hint.en}</small> : null}
            </Link>
          );
        })}
      </nav>
      {!onOverview ? (
        <Link href={base} className="account-back">
          <span aria-hidden>{fa ? "→" : "←"}</span> {fa ? "حساب کاربری" : "Account"}
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
