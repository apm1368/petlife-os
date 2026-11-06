"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { Button, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { helpCenterService, type HelpArticle, type HelpArticleSummary, type HelpCategory, type LegalDocument, type LegalIndexEntry, type PublicIncident, type PublicStatus } from "@/services/help-center.service";

const legalSlugs = ["terms", "privacy", "cookies", "community-guidelines", "animal-welfare", "ai-and-safety", "payment-and-refund", "delivery", "installment-help", "accessibility"] as const;
const legalKinds = ["TERMS_OF_SERVICE", "PRIVACY_POLICY", "COOKIE_CONSENT", "COMMUNITY_GUIDELINES", "ANIMAL_WELFARE", "AI_AND_SAFETY", "PAYMENT_AND_REFUND", "DELIVERY", "INSTALLMENT_HELP", "ACCESSIBILITY"];
const faLegalTitles = ["شرایط استفاده از خدمات", "سیاست حفظ حریم خصوصی", "رضایت کوکی‌ها", "راهنمای جامعه", "رفاه حیوانات", "هوش مصنوعی و ایمنی", "پرداخت و بازپرداخت", "ارسال و تحویل", "راهنمای پرداخت قسطی", "دسترس‌پذیری"];
const enLegalTitles = ["Terms of Service", "Privacy Policy", "Cookie Consent", "Community Guidelines", "Animal Welfare", "AI and Safety", "Payment and Refund", "Delivery", "Installment Help", "Accessibility"];

function Shell({ title, children, subtitle }: { title: string; subtitle?: string; children: ReactNode }) {
  return <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8"><header className="flex flex-col gap-2"><h1 className="text-page-title text-text-primary">{title}</h1>{subtitle ? <p className="text-body text-text-secondary">{subtitle}</p> : null}</header>{children}</main>;
}
function Failure({ title, retry, fa }: { title: string; retry: () => void; fa: boolean }) {
  return <ErrorRecovery title={title} message={fa ? "اتصال به سرویس برقرار نشد. دوباره تلاش کنید." : "The service could not be reached. Please try again."} retryLabel={fa ? "تلاش دوباره" : "Try again"} onRetry={retry} />;
}
function ArticleLinks({ articles, locale, empty }: { articles: HelpArticleSummary[]; locale: string; empty: string }) {
  if (!articles.length) return <EmptyState title={empty} />;
  return <ul className="grid gap-3 sm:grid-cols-2">{articles.map((article) => <li key={article.id}><Link href={`/${locale}/help/articles/${encodeURIComponent(article.slug)}`} className="block h-full rounded-2xl border border-border-subtle bg-surface-elevated p-4 hover:border-border-strong"><span className="font-semibold text-text-primary">{article.title}</span>{article.summary || article.excerpt ? <span className="mt-2 block text-metadata text-text-secondary">{article.summary || article.excerpt}</span> : null}</Link></li>)}</ul>;
}

export function HelpCenterHomeView() {
  const locale = useLocale(); const fa = locale === "fa";
  const [categories, setCategories] = useState<HelpCategory[] | null>(null); const [articles, setArticles] = useState<HelpArticleSummary[] | null>(null);
  const [query, setQuery] = useState(""); const [searched, setSearched] = useState(false); const [error, setError] = useState(false); const [busy, setBusy] = useState(false);
  async function load() { setError(false); setCategories(null); setArticles(null); try { const [cats, recent] = await Promise.all([helpCenterService.categories(locale), helpCenterService.articles(locale)]); setCategories(cats); setArticles(recent); } catch { setError(true); } }
  useEffect(() => { void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);
  async function search(event: FormEvent) { event.preventDefault(); const q = query.trim(); if (!q) { setSearched(false); void load(); return; } setBusy(true); setError(false); setSearched(true); try { setArticles(await helpCenterService.search(locale, q)); } catch { setError(true); } finally { setBusy(false); } }
  return <Shell title={fa ? "مرکز راهنمای پت‌لایف" : "PET LIFE Help Center"} subtitle={fa ? "راهنماها و پاسخ‌های منتشرشده را جست‌وجو کنید." : "Search published guides and answers."}>
    <form role="search" onSubmit={search} className="flex flex-col gap-3 sm:flex-row"><label className="sr-only" htmlFor="help-search">{fa ? "جست‌وجو در راهنما" : "Search help"}</label><input id="help-search" value={query} onChange={(e) => setQuery(e.target.value)} className="min-h-11 flex-1 rounded-xl border border-border-strong bg-surface-elevated px-4 text-body text-text-primary" placeholder={fa ? "چه کمکی از دستمان برمی‌آید؟" : "How can we help?"} /><Button type="submit" isLoading={busy}>{fa ? "جست‌وجو" : "Search"}</Button></form>
    {error ? <Failure fa={fa} title={fa ? "بارگذاری راهنما انجام نشد" : "Help could not be loaded"} retry={() => void load()} /> : null}
    {!error && (!categories || !articles) ? <Skeleton className="h-56 w-full" aria-label={fa ? "در حال بارگذاری" : "Loading"} /> : null}
    {!error && categories && articles ? <>
      {!searched && <section className="flex flex-col gap-3"><h2 className="text-section-title text-text-primary">{fa ? "دسته‌بندی‌ها" : "Browse by topic"}</h2>{categories.length ? <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{categories.map((category) => <li key={category.slug}><Link className="block rounded-2xl border border-border-subtle bg-surface-elevated p-4" href={`/${locale}/help/categories/${encodeURIComponent(category.slug)}`}><strong className="text-text-primary">{category.title}</strong>{category.description ? <p className="mt-2 text-metadata text-text-secondary">{category.description}</p> : null}<span className="mt-2 block text-metadata text-text-secondary">{category.articleCount} {fa ? "مقاله" : "articles"}</span></Link></li>)}</ul> : <EmptyState title={fa ? "هنوز راهنمایی منتشر نشده است." : "No help topics have been published yet."} />}</section>}
      <section className="flex flex-col gap-3"><h2 className="text-section-title text-text-primary">{searched ? (fa ? "نتایج جست‌وجو" : "Search results") : (fa ? "راهنماهای منتشرشده" : "Published articles")}</h2><ArticleLinks articles={articles} locale={locale} empty={fa ? "موردی پیدا نشد." : "No matching articles found."} /></section>
      {!searched && <div className="flex flex-wrap gap-3"><Link className="text-brand-natural underline" href={`/${locale}/help/faq`}>{fa ? "پرسش‌های پرتکرار" : "Frequently asked questions"}</Link><Link className="text-brand-natural underline" href={`/${locale}/support`}>{fa ? "تماس با پشتیبانی" : "Contact support"}</Link></div>}
    </> : null}
  </Shell>;
}

export function HelpCategoryView({ slug }: { slug: string }) {
  const locale = useLocale(); const fa = locale === "fa"; const [items, setItems] = useState<HelpArticleSummary[] | null>(null); const [error, setError] = useState(false);
  const load = () => { setError(false); void helpCenterService.articles(locale, { category: slug }).then(setItems).catch(() => setError(true)); };
  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, slug]);
  return <Shell title={fa ? "مقالات دسته‌بندی" : "Help topic"}><Link className="text-brand-natural underline" href={`/${locale}/help`}>{fa ? "بازگشت به مرکز راهنما" : "Back to Help Center"}</Link>{error ? <Failure title={fa ? "مقالات بارگذاری نشدند" : "Articles could not be loaded"} retry={load} fa={fa} /> : !items ? <Skeleton className="h-48 w-full" /> : <ArticleLinks articles={items} locale={locale} empty={fa ? "در این دسته مقاله‌ای منتشر نشده است." : "No articles are published in this topic yet."} />}</Shell>;
}

export function HelpFaqView() {
  const locale = useLocale(); const fa = locale === "fa"; const [items, setItems] = useState<HelpArticleSummary[] | null>(null); const [error, setError] = useState(false);
  const load = () => { setError(false); void helpCenterService.articles(locale, { faq: true }).then(setItems).catch(() => setError(true)); };
  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);
  return <Shell title={fa ? "پرسش‌های پرتکرار" : "Frequently asked questions"}>{error ? <Failure title={fa ? "پرسش‌ها بارگذاری نشدند" : "Questions could not be loaded"} retry={load} fa={fa} /> : !items ? <Skeleton className="h-48 w-full" /> : <ArticleLinks articles={items} locale={locale} empty={fa ? "هنوز پرسش پرتکراری منتشر نشده است." : "No frequently asked questions have been published yet."} />}</Shell>;
}

export function HelpArticleView({ slug }: { slug: string }) {
  const locale = useLocale(); const fa = locale === "fa"; const [article, setArticle] = useState<HelpArticle | null>(null); const [error, setError] = useState(false); const [voted, setVoted] = useState(false); const [voteError, setVoteError] = useState(false);
  const load = () => { setError(false); setArticle(null); void helpCenterService.article(locale, slug).then(setArticle).catch(() => setError(true)); };
  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, slug]);
  async function vote(helpful: boolean) { setVoteError(false); try { await helpCenterService.vote(locale, slug, helpful); setVoted(true); } catch { setVoteError(true); } }
  if (error) return <Shell title={fa ? "مقاله در دسترس نیست" : "Article unavailable"}><p role="alert" className="text-text-secondary">{fa ? "این مقاله منتشر نشده یا در دسترس نیست." : "This article is unpublished or unavailable."}</p><Link href={`/${locale}/help`} className="underline">{fa ? "مرکز راهنما" : "Help Center"}</Link></Shell>;
  if (!article) return <main className="mx-auto max-w-4xl px-4 py-8"><Skeleton className="h-72 w-full" aria-label={fa ? "در حال بارگذاری" : "Loading"} /></main>;
  return <Shell title={article.title} subtitle={article.summary ?? undefined}><Link className="text-brand-natural underline" href={`/${locale}/help/categories/${encodeURIComponent(article.category.slug)}`}>{article.category.title}</Link><article className="whitespace-pre-wrap rounded-2xl border border-border-subtle bg-surface-elevated p-5 text-body leading-8 text-text-primary">{article.body}</article><p className="text-metadata text-text-secondary">{fa ? `نسخه ${article.version}` : `Version ${article.version}`} · {new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : "en", { dateStyle: "medium" }).format(new Date(article.updatedAt))}</p><section className="flex flex-wrap items-center gap-3"><span>{fa ? "این راهنما مفید بود؟" : "Was this helpful?"}</span>{voted ? <span role="status">{fa ? "ممنون از بازخوردتان." : "Thanks for your feedback."}</span> : <><Button variant="secondary" onClick={() => void vote(true)}>{fa ? "بله" : "Yes"}</Button><Button variant="secondary" onClick={() => void vote(false)}>{fa ? "خیر" : "No"}</Button></>}{voteError ? <span role="alert">{fa ? "ثبت بازخورد انجام نشد." : "Feedback could not be recorded."}</span> : null}</section><Link href={`/${locale}/support/new`} className="text-brand-natural underline">{fa ? "هنوز به کمک نیاز دارید؟ با پشتیبانی تماس بگیرید" : "Still need help? Contact support"}</Link></Shell>;
}

export function LegalIndexView() {
  const locale = useLocale(); const fa = locale === "fa"; const [entries, setEntries] = useState<LegalIndexEntry[] | null>(null); const [error, setError] = useState(false);
  const load = () => { setError(false); setEntries(null); void helpCenterService.legalIndex(locale).then(setEntries).catch(() => setError(true)); };
  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);
  return <Shell title={fa ? "اسناد و سیاست‌ها" : "Policies and legal documents"} subtitle={fa ? "نسخه‌های منتشرشده در این صفحه نمایش داده می‌شوند." : "Only published versions are shown here."}>{error ? <Failure title={fa ? "اسناد بارگذاری نشدند" : "Documents could not be loaded"} retry={load} fa={fa} /> : !entries ? <Skeleton className="h-64 w-full" /> : <ul className="grid gap-3 sm:grid-cols-2">{legalSlugs.map((slug, index) => { const entry = entries.find((e) => e.kind === legalKinds[index]); return <li key={slug}><Link className="flex h-full items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface-elevated p-4" href={`/${locale}/legal/${slug}`}><span className="text-text-primary">{entry?.title || (fa ? faLegalTitles[index] : enLegalTitles[index])}</span><StatusLabel tone={entry?.available ? "success" : "neutral"}>{entry?.available ? (fa ? "منتشرشده" : "Published") : (fa ? "هنوز منتشر نشده" : "Not yet published")}</StatusLabel></Link></li>; })}</ul>}</Shell>;
}

export function LegalDocumentView({ slug }: { slug: string }) {
  const locale = useLocale(); const fa = locale === "fa"; const [document, setDocument] = useState<LegalDocument | null>(null); const [error, setError] = useState(false);
  const load = () => { setError(false); setDocument(null); void helpCenterService.legalDocument(locale, slug).then(setDocument).catch((e) => { if (e instanceof ApiError && e.status === 404) setDocument({ kind: "TERMS_OF_SERVICE", locale: fa ? "fa" : "en", available: false, title: null, body: null, version: null, effectiveAt: null }); else setError(true); }); };
  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, slug]);
  const index = legalSlugs.indexOf(slug as (typeof legalSlugs)[number]);
  if (error) return <Shell title={fa ? "سند در دسترس نیست" : "Document unavailable"}><Failure title={fa ? "بارگذاری سند ممکن نشد" : "Document could not be loaded"} retry={load} fa={fa} /></Shell>;
  if (!document) return <main className="mx-auto max-w-4xl px-4 py-8"><Skeleton className="h-64 w-full" /></main>;
  const title = document.title ?? (index >= 0 ? (fa ? faLegalTitles[index] : enLegalTitles[index]) : undefined) ?? (fa ? "سند حقوقی" : "Legal document");
  return <Shell title={title}>{document.available && document.body ? <><p className="text-metadata text-text-secondary">{fa ? `نسخه ${document.version}` : `Version ${document.version}`} · {fa ? "تاریخ اجرا" : "Effective"}: {document.effectiveAt ? new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : "en", { dateStyle: "long" }).format(new Date(document.effectiveAt)) : "—"}</p><article className="whitespace-pre-wrap rounded-2xl border border-border-subtle bg-surface-elevated p-5 text-body leading-8 text-text-primary">{document.body}</article></> : <EmptyState title={fa ? "این سند هنوز منتشر نشده است." : "This document has not been published yet."} />}<Link href={`/${locale}/legal`} className="text-brand-natural underline">{fa ? "بازگشت به اسناد" : "All legal documents"}</Link></Shell>;
}

function IncidentList({ incidents, locale, fa }: { incidents: PublicIncident[]; locale: string; fa: boolean }) {
  if (!incidents.length) return <EmptyState title={fa ? "حادثه‌ای برای نمایش ثبت نشده است." : "No incidents have been reported."} />;
  return <ul className="grid gap-3">{incidents.map((incident) => <li key={incident.id}><Link className="block rounded-2xl border border-border-subtle bg-surface-elevated p-4" href={`/${locale}/status/incidents/${incident.id}`}><strong className="text-text-primary">{incident.title}</strong><span className="mt-2 block text-metadata text-text-secondary">{fa ? incident.status : incident.status.replaceAll("_", " ")} · {new Intl.DateTimeFormat(fa ? "fa-IR-u-ca-persian" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(incident.startedAt))}</span></Link></li>)}</ul>;
}

export function SystemStatusView() {
  const locale = useLocale(); const fa = locale === "fa"; const [status, setStatus] = useState<PublicStatus | null>(null); const [error, setError] = useState(false);
  const load = () => { setError(false); setStatus(null); void helpCenterService.status().then(setStatus).catch(() => setError(true)); };
  useEffect(() => { load(); }, []);
  const indicatorLabel: Record<string, string> = fa ? { OPERATIONAL: "همه سامانه‌ها فعال‌اند", DEGRADED: "اختلال محدود", OUTAGE: "اختلال جدی", MAINTENANCE: "در حال نگهداری" } : { OPERATIONAL: "All systems operational", DEGRADED: "Degraded service", OUTAGE: "Major outage", MAINTENANCE: "Maintenance in progress" };
  return <Shell title={fa ? "وضعیت سامانه" : "System status"}>{error ? <Failure title={fa ? "وضعیت سامانه در دسترس نیست" : "System status is unavailable"} retry={load} fa={fa} /> : !status ? <Skeleton className="h-64 w-full" /> : <><div className="rounded-2xl border border-border-subtle bg-surface-elevated p-5"><StatusLabel tone={status.indicator === "OPERATIONAL" ? "success" : status.indicator === "DEGRADED" ? "attention" : "emergency"}>{indicatorLabel[status.indicator] ?? status.indicator}</StatusLabel><p className="mt-3 text-metadata text-text-secondary">{fa ? "آخرین بررسی" : "Last checked"}: {new Intl.DateTimeFormat(fa ? "fa-IR-u-ca-persian" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(status.generatedAt))}</p></div>{status.activeMaintenance ? <section className="rounded-2xl border border-border-subtle bg-surface-elevated p-4"><h2 className="text-section-title">{status.activeMaintenance.title}</h2>{status.activeMaintenance.message ? <p className="mt-2">{status.activeMaintenance.message}</p> : null}<p className="mt-2 text-metadata text-text-secondary">{fa ? "پایان مورد انتظار" : "Expected end"}: {new Intl.DateTimeFormat(fa ? "fa-IR-u-ca-persian" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(status.activeMaintenance.endsAt))}</p></section> : null}<section className="flex flex-col gap-3"><h2 className="text-section-title">{fa ? "حوادث جاری" : "Current incidents"}</h2><IncidentList incidents={status.openIncidents} locale={locale} fa={fa} /></section>{status.maintenance.length ? <section className="flex flex-col gap-3"><h2 className="text-section-title">{fa ? "بازه‌های نگهداری" : "Maintenance windows"}</h2><ul className="grid gap-2">{status.maintenance.map((window) => <li key={window.id} className="rounded-xl border border-border-subtle p-4"><strong>{window.title}</strong>{window.message ? <p className="mt-1">{window.message}</p> : null}<p className="text-metadata text-text-secondary">{new Intl.DateTimeFormat(fa ? "fa-IR-u-ca-persian" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(window.startsAt))} – {new Intl.DateTimeFormat(fa ? "fa-IR-u-ca-persian" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(window.endsAt))}</p></li>)}</ul></section> : null}<section className="flex flex-col gap-3"><h2 className="text-section-title">{fa ? "حوادث اخیر" : "Recent incidents"}</h2><IncidentList incidents={status.recentIncidents} locale={locale} fa={fa} /></section></>}</Shell>;
}

export function IncidentDetailView({ id }: { id: string }) {
  const locale = useLocale(); const fa = locale === "fa"; const [incident, setIncident] = useState<PublicIncident | null>(null); const [error, setError] = useState(false);
  const load = () => { setError(false); setIncident(null); void helpCenterService.incident(id).then(setIncident).catch(() => setError(true)); };
  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return <Shell title={fa ? "جزئیات حادثه" : "Incident details"}>{error ? <Failure title={fa ? "حادثه پیدا نشد یا در دسترس نیست" : "Incident not found or unavailable"} retry={load} fa={fa} /> : !incident ? <Skeleton className="h-64 w-full" /> : <><h2 className="text-section-title">{incident.title}</h2><StatusLabel tone={incident.status === "RESOLVED" ? "success" : "attention"}>{incident.status.replaceAll("_", " ")}</StatusLabel><p className="text-metadata text-text-secondary">{new Intl.DateTimeFormat(fa ? "fa-IR-u-ca-persian" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(incident.startedAt))}</p><ol className="grid gap-3">{incident.updates.map((update) => <li key={update.id} className="rounded-2xl border border-border-subtle bg-surface-elevated p-4"><p className="text-metadata text-text-secondary">{update.status.replaceAll("_", " ")} · {new Intl.DateTimeFormat(fa ? "fa-IR-u-ca-persian" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(update.createdAt))}</p><p className="mt-2 whitespace-pre-wrap">{update.body}</p></li>)}</ol></>}<Link href={`/${locale}/status`} className="text-brand-natural underline">{fa ? "بازگشت به وضعیت سامانه" : "Back to system status"}</Link></Shell>;
}
