import Link from "next/link";
import type { AppLocale } from "@/lib/i18n/config";
import { landingCopy } from "./copy";
import { ParkHeader } from "./ParkHeader";
import { ParkHero } from "./ParkHero";
import { parkCopy } from "./park-copy";
import { LandingReveal } from "./LandingReveal";

/** Approved Tehran park hero with the existing product story below it. */
const COPY = {
  fa: {
    bar: "هر خانواده‌ی تازه ۷ روز دسترسی کامل و رایگان دارد", barCta: "شروع کنید",
    heroTitle: ["هوشمندترین", "همراهِ زندگیِ", "حیوانِ شما."],
    heroBody: "سلامت، مراقبت، خدمات و سفرِ کوکی؛ همه در یک برنامه، حول هویت خود او.",
    heroCta: "شروع کنید", heroCta2: "مشاهده خدمات",
    cookieCard: { name: "کوکی", meta: "سگ · ۳ سال", facts: ["واکسن‌ها به‌روز", "میکروچیپ ثبت شده"], sample: "نمونه" },
    cardsTitle: "برای کوکی، هر چه لازم دارد.",
    cards: [
      { img: "vet", title: "سلامت", tagline: "پرونده‌ی کامل و امن", points: ["واکسن، دارو و آزمایش در یک خط زمانی", "منبع هر مورد مشخص", "اشتراک زمان‌دار با دامپزشک"], fit: "برای سگ، گربه و حیوانات دیگر", cta: "/pets/active?view=health", more: "/vet/find" },
      { img: "care", title: "مراقبت", tagline: "به‌موقع، بی‌دردسر", points: ["یادآور واکسن، دارو و نظافت", "تقویم مشترک خانواده", "تکرار با انتخاب خودتان"], fit: "برای همه‌ی اعضای خانواده", cta: "/care-calendar", more: "/guides" },
      { img: "grooming", title: "خدمات", tagline: "متخصص تأییدشده، نزدیک خانه", points: ["دامپزشک، آرایش، آموزش و نگهداری", "زمان آزاد واقعی و نظر مشتری‌ها", "رزرو برای حیوان خودتان"], fit: "در تهران و شهرهای دیگر", cta: "/services", more: "/services/GROOMING" },
      { img: "travel", title: "سفر", tagline: "سفر، بدون حدس زدن", points: ["اقامتگاه‌هایی که حیوان را می‌پذیرند", "منبع و زمان آخرین بررسی", "چک‌لیست آمادگی سفر"], fit: "از شمال تا کویر", cta: "/travel", more: "/places" },
    ],
    start: "شروع کنید", more: "بیشتر",
    appTag: "پرونده‌ی هوشمند", appTitle: ["یک برنامه.", "آرامش کامل برای کوکی."],
    appBody: "پرونده‌ی سلامت، یادآورها، نوبت‌ها و خاطره‌ها؛ هر روز و هر جا، در دسترس شما و هر کسی که اجازه داده‌اید.",
    appCta: "ساخت پرونده‌ی رایگان",
    activeTag: "زندگی فعال", activeTitle: ["حیواناتی که بیشتر بازی می‌کنند،", "سالم‌تر می‌مانند."],
    activeBody: "پیاده‌روی و مراقبت روزانه را برنامه‌ریزی کنید و برای روزهای شلوغ، پیاده‌روی سپرده‌شده رزرو کنید.",
    activeCta: "خدمات پیاده‌روی",
    insightTitle: "نگاه دقیق به سلامت کوکی.",
    insights: [
      { img: "nose", title: "صادق درباره‌ی نامعلوم‌ها", body: "اگر چیزی ثبت نشده، همان را می‌بینید؛ نامشخص هرگز «سالم» نیست." },
      { img: "vet", title: "اشتراک امن با دامپزشک", body: "پیوند زمان‌دار، فقط همان بخش‌هایی که خودتان انتخاب می‌کنید." },
      { img: "care", title: "یادآورهای به‌موقع", body: "واکسن، دارو و نظافت؛ همه‌ی اعضای خانواده هماهنگ." },
    ],
    communityTag: "جامعه و حمایت", communityTitle: ["تنها نیستید."],
    communityBody: "از صاحبان دیگر بپرسید، به پناهگاه‌های تأییدشده کمک کنید و اگر حیوانی گم شد، خبر را به اطرافیان برسانید.",
    communityCta: "رفتن به جامعه", communityCta2: "حمایت از حیوانات",
    finalTitle: "از هویت کوکی شروع کنید.", finalBody: "چند دقیقه برای ثبت مشخصات؛ بعد همه‌چیز سر جای خودش است.", finalCta: "شروع کنید", finalCta2: "ورود به حساب",
    credits: "اعتبار عکس‌ها",
  },
  en: {
    bar: "Every new household gets 7 days of full access, free", barCta: "Get started",
    heroTitle: ["The smartest", "companion for", "your pet's life."],
    heroBody: "Cookie's health, care, services and travel — in one app, organized around who she is.",
    heroCta: "Get started", heroCta2: "Browse services",
    cookieCard: { name: "Cookie", meta: "Dog · 3 years", facts: ["Vaccines up to date", "Microchip on file"], sample: "Example" },
    cardsTitle: "Everything Cookie needs.",
    cards: [
      { img: "vet", title: "Health", tagline: "A complete, private record", points: ["Vaccines, medication and labs on one timeline", "Every entry shows its source", "Time-limited sharing with your vet"], fit: "For dogs, cats and more", cta: "/pets/active?view=health", more: "/vet/find" },
      { img: "care", title: "Care", tagline: "On time, without the hassle", points: ["Vaccine, medication and grooming reminders", "A shared household calendar", "Repeats on your schedule"], fit: "For the whole household", cta: "/care-calendar", more: "/guides" },
      { img: "grooming", title: "Services", tagline: "Verified pros, close to home", points: ["Vets, grooming, training and sitting", "Real open times and reviews", "Book for your own pet"], fit: "In Tehran and beyond", cta: "/services", more: "/services/GROOMING" },
      { img: "travel", title: "Travel", tagline: "Travel without guessing", points: ["Stays that accept pets", "Source and last-checked time", "A trip readiness checklist"], fit: "From the Caspian to the desert", cta: "/travel", more: "/places" },
    ],
    start: "Get started", more: "Learn more",
    appTag: "SMART RECORD", appTitle: ["One app.", "Total peace of mind."],
    appBody: "Health record, reminders, bookings and memories — any time, anywhere, for you and whoever you allow.",
    appCta: "Create a free record",
    activeTag: "ACTIVE LIFE", activeTitle: ["Pets who play more", "stay healthier."],
    activeBody: "Plan daily walks and care, and book a trusted walker for the busy days.",
    activeCta: "Walking services",
    insightTitle: "A close look at Cookie's health.",
    insights: [
      { img: "nose", title: "Honest about unknowns", body: "If something was never recorded, you see exactly that. Unknown is never 'healthy'." },
      { img: "vet", title: "Safe sharing with your vet", body: "Time-limited links, only the parts you choose." },
      { img: "care", title: "Reminders on time", body: "Vaccines, medication and grooming — the whole household in sync." },
    ],
    communityTag: "COMMUNITY", communityTitle: ["You're not alone."],
    communityBody: "Ask other owners, help verified shelters, and if a pet goes missing, get the word out nearby.",
    communityCta: "Go to community", communityCta2: "Animal support",
    finalTitle: "Start with who Cookie is.", finalBody: "A few minutes to add the details. Then everything has its place.", finalCta: "Get started", finalCta2: "Sign in",
    credits: "Photo credits",
  },
} as const;

export function HomeLanding({ locale }: { locale: AppLocale }) {
  const c = COPY[locale];
  const park = parkCopy[locale];
  const base = landingCopy[locale];
  const href = (p: string) => `/${locale}${p}`;
  const img = (k: string) => `/images/landing/home/${k}.webp`;

  return (
    <div className="hl park-landing">
      <ParkHeader locale={locale} />
      <LandingReveal />
      <main id="lp-main" tabIndex={-1}>
        <ParkHero locale={locale} />

        <section id="park-about" className="hl-section" data-reveal aria-labelledby="hl-cards">
          <div className="hl-wrap"><h2 id="hl-cards" className="hl-h2">{c.cardsTitle}</h2></div>
          <ul className="hl-cards">
            {c.cards.map((card) => (
              <li key={card.title} className="hl-card">
                <img src={img(card.img)} alt="" loading="lazy" />
                <div className="hl-card__body">
                  <h3>{card.title}</h3>
                  <p className="hl-card__tagline">{card.tagline}</p>
                  <ul>{card.points.map((p) => <li key={p}>{p}</li>)}</ul>
                  <p className="hl-card__fit">{card.fit}</p>
                  <div className="hl-card__actions">
                    <Link href={href(card.cta)} className="hl-btn hl-btn--yellow hl-btn--sm">{c.start}</Link>
                    <Link href={href(card.more)} className="hl-btn hl-btn--white hl-btn--sm">{c.more}</Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="hl-split" data-reveal aria-labelledby="hl-app">
          <div className="hl-wrap hl-split__inner">
            <div className="hl-split__copy">
              <span className="hl-tag">{c.appTag}</span>
              <h2 id="hl-app" className="hl-h2 hl-h2--light">{c.appTitle.map((l) => <span key={l}>{l}</span>)}</h2>
              <p>{c.appBody}</p>
              <Link href={href("/register")} className="hl-btn hl-btn--yellow">{c.appCta}</Link>
            </div>
            <div className="hl-phone"><img src={img("app-screen")} alt={locale === "fa" ? "داشبورد واقعی PET LIFE روی گوشی" : "The real PET LIFE dashboard on a phone"} loading="lazy" /></div>
          </div>
        </section>

        <section className="hl-band" data-reveal aria-labelledby="hl-active">
          <img src={img("activity")} alt="" loading="lazy" />
          <div className="hl-band__shade" aria-hidden="true" />
          <div className="hl-wrap hl-band__copy">
            <span className="hl-tag">{c.activeTag}</span>
            <h2 id="hl-active" className="hl-h2 hl-h2--light">{c.activeTitle.map((l) => <span key={l}>{l}</span>)}</h2>
            <p>{c.activeBody}</p>
            <Link href={href("/services/WALKING")} className="hl-btn hl-btn--yellow">{c.activeCta}</Link>
          </div>
        </section>

        <section className="hl-section" data-reveal aria-labelledby="hl-insights">
          <div className="hl-wrap">
            <h2 id="hl-insights" className="hl-h2 hl-h2--center">{c.insightTitle}</h2>
            <ul className="hl-insights">
              {c.insights.map((i) => (
                <li key={i.title}>
                  <img src={img(i.img)} alt="" loading="lazy" />
                  <div><h3>{i.title}</h3><p>{i.body}</p></div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="hl-band hl-band--community" data-reveal aria-labelledby="hl-community">
          <img src={img("community")} alt="" loading="lazy" />
          <div className="hl-band__shade" aria-hidden="true" />
          <div className="hl-wrap hl-band__copy">
            <span className="hl-tag">{c.communityTag}</span>
            <h2 id="hl-community" className="hl-h2 hl-h2--light">{c.communityTitle.map((l) => <span key={l}>{l}</span>)}</h2>
            <p>{c.communityBody}</p>
            <div className="hl-actions">
              <Link href={href("/community")} className="hl-btn hl-btn--yellow">{c.communityCta}</Link>
              <Link href={href("/animal-support/needs")} className="hl-btn hl-btn--ghost">{c.communityCta2}</Link>
            </div>
          </div>
        </section>

        <section className="hl-final" data-reveal aria-labelledby="hl-final">
          <div className="hl-wrap">
            <h2 id="hl-final" className="hl-h2 hl-h2--light hl-h2--center">{c.finalTitle}</h2>
            <p>{c.finalBody}</p>
            <div className="hl-actions hl-actions--center">
              <Link href={href("/register")} className="hl-btn hl-btn--yellow">{c.finalCta}</Link>
              <Link href={href("/auth")} className="hl-btn hl-btn--ghost">{c.finalCta2}</Link>
            </div>
          </div>
        </section>
        <section id="park-partners" className="park-partners" aria-labelledby="park-partners-title">
          <h2 id="park-partners-title">{base.ecosystem.title}</h2>
          <p>{base.ecosystem.body}</p>
          <div className="hl-actions hl-actions--center">
            <Link href={`${href("/auth")}?returnTo=${encodeURIComponent(href("/provider"))}`} className="park-primary">{park.partnerSignIn}</Link>
            <Link href={`${href("/register")}?returnTo=${encodeURIComponent(href("/provider"))}`} className="park-primary">{park.partnerJoin}</Link>
          </div>
        </section>
      </main>

      <footer className="hl-footer">
        <div className="hl-wrap hl-footer__inner">
          <div><bdi className="hl-footer__name">PET LIFE OS</bdi><p>{base.footer.tagline}</p><p className="hl-footer__demo">{base.footer.demo}</p></div>
          {base.footer.groups.map((g) => (
            <nav key={g.title} aria-label={g.title}><p className="hl-footer__title">{g.title}</p><ul>{g.links.map((l) => <li key={l.href}><Link href={href(l.href)}>{l.label}</Link></li>)}</ul></nav>
          ))}
        </div>
        <div className="hl-wrap hl-footer__legal"><Link href={href("/credits")}>{park.photoCredits}</Link><bdi>PET LIFE OS</bdi></div>
      </footer>
    </div>
  );
}
