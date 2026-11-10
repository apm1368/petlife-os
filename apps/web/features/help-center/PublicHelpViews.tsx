"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { formatLocaleDate } from "@/lib/i18n/format";
import type { RouteLocale } from "@/lib/i18n/config";
import { Button, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { helpCenterService, type HelpArticle, type HelpArticleSummary, type HelpCategory, type LegalDocument, type LegalIndexEntry, type PublicIncident, type PublicStatus } from "@/services/help-center.service";

const legalSlugs = ["terms", "privacy", "cookies", "community-guidelines", "animal-welfare", "ai-and-safety", "payment-and-refund", "delivery", "installment-help", "accessibility"] as const;
const legalKinds = ["TERMS_OF_SERVICE", "PRIVACY_POLICY", "COOKIE_CONSENT", "COMMUNITY_GUIDELINES", "ANIMAL_WELFARE", "AI_AND_SAFETY", "PAYMENT_AND_REFUND", "DELIVERY", "INSTALLMENT_HELP", "ACCESSIBILITY"];

function Shell({ title, children, subtitle, titleLang }: { title: string; subtitle?: string; children: ReactNode; titleLang?: "fa" | "en" }) {
  const titleId = useId();
  const locale = useLocale();
  const t = useTranslations("publicHelp");
  return <section aria-labelledby={titleId} className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8"><header className="flex flex-col gap-2"><h1 id={titleId} lang={titleLang} className="text-page-title text-text-primary">{title}</h1>{subtitle ? <p lang={titleLang} className="text-body text-text-secondary">{subtitle}</p> : null}</header>{locale === "de" || locale === "es" ? <p className="text-metadata text-text-secondary">{t("sourceNotice")}</p> : null}{children}</section>;
}
function Failure({ title, retry }: { title: string; retry: () => void }) {
  const t = useTranslations("publicHelp");
  return <ErrorRecovery title={title} message={t("failureDescription")} retryLabel={t("retry")} onRetry={retry} />;
}
function ArticleLinks({ articles, locale, empty }: { articles: HelpArticleSummary[]; locale: string; empty: string }) {
  if (!articles.length) return <EmptyState title={empty} />;
  return <ul className="grid gap-3 sm:grid-cols-2">{articles.map((article) => <li key={article.id}><Link href={`/${locale}/help/articles/${encodeURIComponent(article.slug)}`} className="block h-full rounded-2xl border border-border-subtle bg-surface-elevated p-4 hover:border-border-strong"><span lang={locale === "fa" ? "fa" : "en"} dir="auto" className="font-semibold text-text-primary">{article.title}</span>{article.summary || article.excerpt ? <span lang={locale === "fa" ? "fa" : "en"} dir="auto" className="mt-2 block text-metadata text-text-secondary">{article.summary || article.excerpt}</span> : null}</Link></li>)}</ul>;
}

export function HelpCenterHomeView() {
  const locale = useLocale() as RouteLocale; const t = useTranslations("publicHelp");
  const [categories, setCategories] = useState<HelpCategory[] | null>(null); const [articles, setArticles] = useState<HelpArticleSummary[] | null>(null);
  const [query, setQuery] = useState(""); const [searched, setSearched] = useState(false); const [error, setError] = useState(false); const [busy, setBusy] = useState(false);
  async function load() { setError(false); setCategories(null); setArticles(null); try { const [cats, recent] = await Promise.all([helpCenterService.categories(locale), helpCenterService.articles(locale)]); setCategories(cats); setArticles(recent); } catch { setError(true); } }
  useEffect(() => { void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);
  async function search(event: FormEvent) { event.preventDefault(); const q = query.trim(); if (!q) { setSearched(false); void load(); return; } setBusy(true); setError(false); setSearched(true); try { setArticles(await helpCenterService.search(locale, q)); } catch { setError(true); } finally { setBusy(false); } }
  return <Shell title={t("helpTitle")} subtitle={t("helpSubtitle")}>
    <form role="search" onSubmit={search} className="flex flex-col gap-3 sm:flex-row"><label className="sr-only" htmlFor="help-search">{t("searchLabel")}</label><input id="help-search" value={query} onChange={(e) => setQuery(e.target.value)} className="min-h-11 flex-1 rounded-xl border border-border-strong bg-surface-elevated px-4 text-body text-text-primary" placeholder={t("searchPlaceholder")} /><Button type="submit" isLoading={busy}>{t("search")}</Button></form>
    {error ? <Failure title={t("helpFailure")} retry={() => void load()} /> : null}
    {!error && (!categories || !articles) ? <Skeleton className="h-56 w-full" aria-label={t("loading")} /> : null}
    {!error && categories && articles ? <>
      {!searched && <section className="flex flex-col gap-3"><h2 className="text-section-title text-text-primary">{t("topics")}</h2>{categories.length ? <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{categories.map((category) => <li key={category.slug}><Link className="block rounded-2xl border border-border-subtle bg-surface-elevated p-4" href={`/${locale}/help/categories/${encodeURIComponent(category.slug)}`}><strong className="text-text-primary">{category.title}</strong>{category.description ? <p className="mt-2 text-metadata text-text-secondary">{category.description}</p> : null}<span className="mt-2 block text-metadata text-text-secondary">{t("articleCount", { count: category.articleCount })}</span></Link></li>)}</ul> : <EmptyState title={t("noTopics")} />}</section>}
      <section className="flex flex-col gap-3"><h2 className="text-section-title text-text-primary">{searched ? (t("searchResults")) : (t("publishedArticles"))}</h2><ArticleLinks articles={articles} locale={locale} empty={t("noMatches")} /></section>
      {!searched && <div className="flex flex-wrap gap-3"><Link className="text-brand-natural underline" href={`/${locale}/help/faq`}>{t("faq")}</Link><Link className="text-brand-natural underline" href={`/${locale}/support`}>{t("contactSupport")}</Link></div>}
    </> : null}
  </Shell>;
}

export function HelpCategoryView({ slug }: { slug: string }) {
  const locale = useLocale() as RouteLocale; const t = useTranslations("publicHelp"); const [items, setItems] = useState<HelpArticleSummary[] | null>(null); const [error, setError] = useState(false);
  const load = () => { setError(false); void helpCenterService.articles(locale, { category: slug }).then(setItems).catch(() => setError(true)); };
  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, slug]);
  return <Shell title={t("topicTitle")}><Link className="text-brand-natural underline" href={`/${locale}/help`}>{t("backHelp")}</Link>{error ? <Failure title={t("articlesFailure")} retry={load} /> : !items ? <Skeleton aria-label={t("loading")} className="h-48 w-full" /> : <ArticleLinks articles={items} locale={locale} empty={t("noTopicArticles")} />}</Shell>;
}

export function HelpFaqView() {
  const locale = useLocale() as RouteLocale; const t = useTranslations("publicHelp"); const [items, setItems] = useState<HelpArticleSummary[] | null>(null); const [error, setError] = useState(false);
  const load = () => { setError(false); void helpCenterService.articles(locale, { faq: true }).then(setItems).catch(() => setError(true)); };
  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);
  return <Shell title={t("faq")}>{error ? <Failure title={t("faqFailure")} retry={load} /> : !items ? <Skeleton aria-label={t("loading")} className="h-48 w-full" /> : <ArticleLinks articles={items} locale={locale} empty={t("noFaq")} />}</Shell>;
}

export function HelpArticleView({ slug }: { slug: string }) {
  const locale = useLocale() as RouteLocale; const t = useTranslations("publicHelp"); const [article, setArticle] = useState<HelpArticle | null>(null); const [error, setError] = useState(false); const [voted, setVoted] = useState(false); const [voteError, setVoteError] = useState(false); const [voteBusy, setVoteBusy] = useState(false); const voteInFlight = useRef(false); const voteEpoch = useRef(0);
  const load = (signal?: AbortSignal) => { setError(false); setArticle(null); void helpCenterService.article(locale, slug, signal).then((data) => { if (!signal?.aborted) setArticle(data); }).catch(() => { if (!signal?.aborted) setError(true); }); };
  useEffect(() => { const controller = new AbortController(); const epoch = ++voteEpoch.current; voteInFlight.current = false; setVoted(false); setVoteError(false); setVoteBusy(false); load(controller.signal); return () => { controller.abort(); voteEpoch.current = epoch + 1; }; // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, slug]);
  async function vote(helpful: boolean) { if (voteInFlight.current) return; const epoch = voteEpoch.current; voteInFlight.current = true; setVoteBusy(true); setVoteError(false); try { await helpCenterService.vote(locale, slug, helpful); if (epoch === voteEpoch.current) setVoted(true); } catch { if (epoch === voteEpoch.current) setVoteError(true); } finally { if (epoch === voteEpoch.current) { voteInFlight.current = false; setVoteBusy(false); } } }
  if (error) return <Shell title={t("articleUnavailable")}><p role="alert" className="text-text-secondary">{t("articleUnavailableDescription")}</p><Link href={`/${locale}/help`} className="underline">{t("helpShort")}</Link></Shell>;
  if (!article) return <div className="mx-auto max-w-4xl px-4 py-8"><Skeleton className="h-72 w-full" aria-label={t("loading")} /></div>;
  return <Shell title={article.title} titleLang={locale === "fa" ? "fa" : "en"} subtitle={article.summary ?? undefined}><Link className="text-brand-natural underline" href={`/${locale}/help/categories/${encodeURIComponent(article.category.slug)}`}>{article.category.title}</Link><article lang={locale === "fa" ? "fa" : "en"} dir="auto" className="whitespace-pre-wrap rounded-2xl border border-border-subtle bg-surface-elevated p-5 text-body leading-8 text-text-primary">{article.body}</article><p className="text-metadata text-text-secondary">{t("version", { version: article.version })} · {formatLocaleDate(article.updatedAt, locale, { dateStyle: "medium" })}</p><section className="flex flex-wrap items-center gap-3"><span>{t("helpful")}</span>{voted ? <span role="status">{t("feedbackThanks")}</span> : <><Button variant="secondary" disabled={voteBusy} onClick={() => void vote(true)}>{t("yes")}</Button><Button variant="secondary" disabled={voteBusy} onClick={() => void vote(false)}>{t("no")}</Button></>}{voteError ? <span role="alert">{t("feedbackFailure")}</span> : null}</section><Link href={`/${locale}/support/new`} className="text-brand-natural underline">{t("stillNeedHelp")}</Link></Shell>;
}

export function LegalIndexView() {
  const locale = useLocale() as RouteLocale; const t = useTranslations("publicHelp"); const [entries, setEntries] = useState<LegalIndexEntry[] | null>(null); const [error, setError] = useState(false);
  const load = () => { setError(false); setEntries(null); void helpCenterService.legalIndex(locale).then(setEntries).catch(() => setError(true)); };
  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);
  return <Shell title={t("legalTitle")} subtitle={t("legalSubtitle")}>{error ? <Failure title={t("legalFailure")} retry={load} /> : !entries ? <Skeleton aria-label={t("loading")} className="h-64 w-full" /> : <ul className="grid gap-3 sm:grid-cols-2">{legalSlugs.map((slug, index) => { const entry = entries.find((e) => e.kind === legalKinds[index]); return <li key={slug}><Link className="flex h-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface-elevated p-4" href={`/${locale}/legal/${slug}`}><span className="text-text-primary">{entry?.title || (t(`legalTitles.${legalSlugs[index]}`))}</span><StatusLabel tone={entry?.available ? "success" : "neutral"}>{entry?.available ? (t("published")) : (t("unpublished"))}</StatusLabel></Link></li>; })}</ul>}</Shell>;
}

export function LegalDocumentView({ slug }: { slug: string }) {
  const locale = useLocale() as RouteLocale; const t = useTranslations("publicHelp"); const [document, setDocument] = useState<LegalDocument | null>(null); const [error, setError] = useState(false);
  const load = () => { setError(false); setDocument(null); void helpCenterService.legalDocument(locale, slug).then(setDocument).catch((e) => { if (e instanceof ApiError && e.status === 404) setDocument({ kind: "TERMS_OF_SERVICE", locale: locale === "fa" ? "fa" : "en", available: false, title: null, body: null, version: null, effectiveAt: null }); else setError(true); }); };
  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, slug]);
  const index = legalSlugs.indexOf(slug as (typeof legalSlugs)[number]);
  if (error) return <Shell title={t("documentUnavailable")}><Failure title={t("documentFailure")} retry={load} /></Shell>;
  if (!document) return <div className="mx-auto max-w-4xl px-4 py-8"><Skeleton aria-label={t("loading")} className="h-64 w-full" /></div>;
  const title = document.title ?? (index >= 0 ? (t(`legalTitles.${legalSlugs[index]}`)) : undefined) ?? (t("documentTitle"));
  return <Shell title={title} titleLang={document.title ? document.locale : undefined}>{document.available && document.body ? <><p className="text-metadata text-text-secondary">{t("version", { version: document.version ?? 0 })} · {t("effective")}: {document.effectiveAt ? formatLocaleDate(document.effectiveAt, locale, { dateStyle: "long" }) : "—"}</p><article className="whitespace-pre-wrap rounded-2xl border border-border-subtle bg-surface-elevated p-5 text-body leading-8 text-text-primary">{document.body}</article></> : <EmptyState title={t("documentUnpublished")} />}<Link href={`/${locale}/legal`} className="text-brand-natural underline">{t("allLegal")}</Link></Shell>;
}

function useIncidentStatusLabel() {
  const t = useTranslations("publicHelp");
  return (status: string) => t.has(`incidentStates.${status}`) ? t(`incidentStates.${status}`) : t("unknownState");
}

function IncidentList({ incidents, locale }: { incidents: PublicIncident[]; locale: RouteLocale }) {
  const t = useTranslations("publicHelp");
  const incidentLabel = useIncidentStatusLabel();
  if (!incidents.length) return <EmptyState title={t("noIncidents")} />;
  return <ul className="grid gap-3">{incidents.map((incident) => <li key={incident.id}><Link className="block rounded-2xl border border-border-subtle bg-surface-elevated p-4" href={`/${locale}/status/incidents/${incident.id}`}><strong className="text-text-primary">{incident.title}</strong><span className="mt-2 block text-metadata text-text-secondary">{incidentLabel(incident.status)} · {formatLocaleDate(incident.startedAt, locale, { dateStyle: "medium", timeStyle: "short" })}</span></Link></li>)}</ul>;
}

export function SystemStatusView() {
  const locale = useLocale() as RouteLocale; const t = useTranslations("publicHelp"); const [status, setStatus] = useState<PublicStatus | null>(null); const [error, setError] = useState(false);
  const load = () => { setError(false); setStatus(null); void helpCenterService.status().then(setStatus).catch(() => setError(true)); };
  useEffect(() => { load(); }, []);
  const indicatorLabel = (value: string) => t.has(`indicators.${value}`) ? t(`indicators.${value}`) : t("unknownState");
  return <Shell title={t("statusTitle")}>{error ? <Failure title={t("statusFailure")} retry={load} /> : !status ? <Skeleton aria-label={t("loading")} className="h-64 w-full" /> : <><div className="rounded-2xl border border-border-subtle bg-surface-elevated p-5"><StatusLabel tone={status.indicator === "OPERATIONAL" ? "success" : status.indicator === "DEGRADED" ? "attention" : "emergency"}>{indicatorLabel(status.indicator)}</StatusLabel><p className="mt-3 text-metadata text-text-secondary">{t("lastChecked")}: {formatLocaleDate(status.generatedAt, locale, { dateStyle: "medium", timeStyle: "short" })}</p></div>{status.activeMaintenance ? <section className="rounded-2xl border border-border-subtle bg-surface-elevated p-4"><h2 className="text-section-title">{status.activeMaintenance.title}</h2>{status.activeMaintenance.message ? <p className="mt-2">{status.activeMaintenance.message}</p> : null}<p className="mt-2 text-metadata text-text-secondary">{t("expectedEnd")}: {formatLocaleDate(status.activeMaintenance.endsAt, locale, { dateStyle: "medium", timeStyle: "short" })}</p></section> : null}<section className="flex flex-col gap-3"><h2 className="text-section-title">{t("currentIncidents")}</h2><IncidentList incidents={status.openIncidents} locale={locale} /></section>{status.maintenance.length ? <section className="flex flex-col gap-3"><h2 className="text-section-title">{t("maintenanceWindows")}</h2><ul className="grid gap-2">{status.maintenance.map((window) => <li key={window.id} className="rounded-xl border border-border-subtle p-4"><strong>{window.title}</strong>{window.message ? <p className="mt-1">{window.message}</p> : null}<p className="text-metadata text-text-secondary">{formatLocaleDate(window.startsAt, locale, { dateStyle: "medium", timeStyle: "short" })} – {formatLocaleDate(window.endsAt, locale, { dateStyle: "medium", timeStyle: "short" })}</p></li>)}</ul></section> : null}<section className="flex flex-col gap-3"><h2 className="text-section-title">{t("recentIncidents")}</h2><IncidentList incidents={status.recentIncidents} locale={locale} /></section></>}</Shell>;
}

export function IncidentDetailView({ id }: { id: string }) {
  const incidentLabel = useIncidentStatusLabel();
  const locale = useLocale() as RouteLocale; const t = useTranslations("publicHelp"); const [incident, setIncident] = useState<PublicIncident | null>(null); const [error, setError] = useState(false);
  const load = () => { setError(false); setIncident(null); void helpCenterService.incident(id).then(setIncident).catch(() => setError(true)); };
  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return <Shell title={t("incidentTitle")}>{error ? <Failure title={t("incidentFailure")} retry={load} /> : !incident ? <Skeleton aria-label={t("loading")} className="h-64 w-full" /> : <><h2 className="text-section-title">{incident.title}</h2><StatusLabel tone={incident.status === "RESOLVED" ? "success" : "attention"}>{incidentLabel(incident.status)}</StatusLabel><p className="text-metadata text-text-secondary">{formatLocaleDate(incident.startedAt, locale, { dateStyle: "medium", timeStyle: "short" })}</p><ol className="grid gap-3">{incident.updates.map((update) => <li key={update.id} className="rounded-2xl border border-border-subtle bg-surface-elevated p-4"><p className="text-metadata text-text-secondary">{incidentLabel(update.status)} · {formatLocaleDate(update.createdAt, locale, { dateStyle: "medium", timeStyle: "short" })}</p><p className="mt-2 whitespace-pre-wrap">{update.body}</p></li>)}</ol></>}<Link href={`/${locale}/status`} className="text-brand-natural underline">{t("backStatus")}</Link></Shell>;
}
