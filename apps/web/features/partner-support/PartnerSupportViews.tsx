"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Select, Skeleton, StatusLabel } from "@petlife/ui";
import type { PartnerSupportCategory, SupportCasePartnerDetailDto, SupportCasePartnerSummaryDto } from "@petlife/types";
import { partnerSupportService, type PartnerSupportClient } from "@/services/partner-support.service";
import { useSellerStore } from "@/stores/seller-store";
import { apiErrorText } from "@/lib/errors/api-error-text";
import { supportStatusTone } from "@/features/support/support-status-tone";

/**
 * Support inside the partner panels (provider and shop). Cases belong to the
 * business: the owner (and a shop's admins and support role) see every case
 * of the team, other members the ones they opened. They land in admin
 * support under Partners.
 */
export type PartnerPanel = "provider" | "seller";

/** Topics per panel: the business's own topic first, then what that side of the platform actually asks about. */
export const PARTNER_TOPICS: Record<PartnerPanel, PartnerSupportCategory[]> = {
  provider: ["PROVIDER", "ACCOUNT", "PAYMENT", "BOOKING", "SERVICE", "OTHER"],
  seller: ["SELLER", "ACCOUNT", "PAYMENT", "ORDER", "DELIVERY", "MARKETPLACE", "OTHER"],
};

function topicKey(category: string): string {
  return category === "PROVIDER" || category === "SELLER" ? "BUSINESS" : category;
}

function formatDate(iso: string, locale: string) {
  const intlLocale = locale === "fa" ? "fa-IR" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : "en-US";
  return new Intl.DateTimeFormat(intlLocale, { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

/** The shop panel names its shop in every call; until the seller context loads there is no client yet. */
function usePartnerSupportClient(panel: PartnerPanel): PartnerSupportClient | null {
  const sellerId = useSellerStore((s) => s.context?.active?.sellerOrganizationId);
  return useMemo(() => (panel === "provider" ? partnerSupportService.provider() : sellerId ? partnerSupportService.seller(sellerId) : null), [panel, sellerId]);
}

export function PartnerSupportListView({ panel }: { panel: PartnerPanel }) {
  const t = useTranslations("partnerSupport");
  const router = useRouter();
  const locale = useLocale();
  const api = usePartnerSupportClient(panel);
  const [cases, setCases] = useState<SupportCasePartnerSummaryDto[] | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    if (!api) return;
    setError(false);
    try {
      setCases((await api.list()).items);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const base = `/${locale}/${panel}/support`;
  if (error) return <ErrorRecovery title={t("title")} message={t("loadFailed")} retryLabel={t("retry")} onRetry={load} />;
  if (!cases) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-page-title text-text-primary">{t("title")}</h1>
          <p className="text-metadata text-text-secondary">{t("intro")}</p>
        </div>
        <Button size="sm" onClick={() => router.push(`${base}/new`)}>
          {t("newCta")}
        </Button>
      </header>

      {cases.length === 0 ? <EmptyState title={t("empty")} actionLabel={t("newCta")} onAction={() => router.push(`${base}/new`)} /> : null}

      {cases.map((c) => (
        <button key={c.id} type="button" className="w-full text-start" onClick={() => router.push(`${base}/${c.id}`)}>
          <ContextSurface className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex flex-col">
              <span className="text-body font-medium text-text-primary">{c.caseNumber} · {c.subject}</span>
              <span className="text-metadata text-text-secondary">
                {t(`category.${topicKey(c.category)}`)} · {c.openedBy.isMe ? t("openedByYou") : t("openedBy", { name: c.openedBy.displayName })} · {formatDate(c.createdAt, locale)}
              </span>
            </div>
            <StatusLabel tone={supportStatusTone(c.status)}>{t(`status.${c.status}`)}</StatusLabel>
          </ContextSurface>
        </button>
      ))}
    </div>
  );
}

export function PartnerSupportCreateView({ panel }: { panel: PartnerPanel }) {
  const t = useTranslations("partnerSupport");
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const api = usePartnerSupportClient(panel);
  const topics = PARTNER_TOPICS[panel];
  const prefill = searchParams.get("category");

  const [category, setCategory] = useState<PartnerSupportCategory>(topics.includes(prefill as PartnerSupportCategory) ? (prefill as PartnerSupportCategory) : topics[0]!);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!api) return;
    if (!subject.trim() || !description.trim()) {
      setError(t("create.required"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.create({ subject: subject.trim(), description: description.trim(), category });
      router.push(`/${locale}/${panel}/support/${created.id}`);
    } catch (err) {
      setError(apiErrorText(err, locale, t("create.failed")));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/${panel}/support`)}>
        {t("detail.back")}
      </Button>
      <h1 className="text-page-title text-text-primary">{t("create.title")}</h1>
      <ContextSurface className="flex flex-col gap-3">
        <Select label={t("create.category")} value={category} onChange={(e) => setCategory(e.target.value as PartnerSupportCategory)} options={topics.map((c) => ({ value: c, label: t(`category.${topicKey(c)}`) }))} />
        <label className="flex flex-col gap-1">
          <span className="text-metadata text-text-secondary">{t("create.subject")}</span>
          <input value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} className="rounded-md border border-border-strong bg-surface-elevated p-2 text-body text-text-primary" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-metadata text-text-secondary">{t("create.description")}</span>
          <textarea value={description} maxLength={5000} onChange={(e) => setDescription(e.target.value)} rows={6} className="rounded-md border border-border-strong bg-surface-elevated p-2 text-body text-text-primary" />
        </label>
        {error ? (
          <p role="alert" className="text-metadata text-state-urgent">
            {error}
          </p>
        ) : null}
        <Button isLoading={submitting} disabled={!api} onClick={submit}>
          {t("create.submit")}
        </Button>
      </ContextSurface>
    </div>
  );
}

export function PartnerSupportDetailView({ panel, caseId }: { panel: PartnerPanel; caseId: string }) {
  const t = useTranslations("partnerSupport");
  const router = useRouter();
  const locale = useLocale();
  const api = usePartnerSupportClient(panel);
  const [data, setData] = useState<SupportCasePartnerDetailDto | null>(null);
  const [error, setError] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);

  async function load() {
    if (!api) return;
    setError(false);
    try {
      setData(await api.get(caseId));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, caseId]);

  async function send() {
    if (!api || !reply.trim()) return;
    setSending(true);
    setActionError(null);
    try {
      await api.postMessage(caseId, reply.trim());
      setReply("");
      await load();
    } catch (err) {
      setActionError(apiErrorText(err, locale, t("detail.sendFailed")));
    } finally {
      setSending(false);
    }
  }

  async function reopen() {
    if (!api) return;
    setReopening(true);
    setActionError(null);
    try {
      await api.reopen(caseId);
      await load();
    } catch (err) {
      setActionError(apiErrorText(err, locale, t("detail.reopenFailed")));
    } finally {
      setReopening(false);
    }
  }

  if (error) return <ErrorRecovery title={t("title")} message={t("loadFailed")} retryLabel={t("retry")} onRetry={load} />;
  if (!data) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  const canReply = data.status !== "CLOSED";
  const canReopen = data.status === "RESOLVED" || data.status === "CLOSED";

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/${panel}/support`)}>
        {t("detail.back")}
      </Button>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-page-title text-text-primary">{t("detail.caseNumber", { number: data.caseNumber })}</h1>
        <StatusLabel tone={supportStatusTone(data.status)}>{t(`status.${data.status}`)}</StatusLabel>
      </header>

      <ContextSurface className="flex flex-col gap-1">
        <span className="text-body font-medium text-text-primary">{data.subject}</span>
        <span className="text-metadata text-text-secondary">
          {t(`category.${topicKey(data.category)}`)} · {data.openedBy.isMe ? t("openedByYou") : t("openedBy", { name: data.openedBy.displayName })} · {formatDate(data.createdAt, locale)}
        </span>
        <p className="whitespace-pre-wrap text-body text-text-secondary">{data.description}</p>
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <h2 className="text-section-title text-text-primary">{t("detail.messages")}</h2>
        {data.messages.length === 0 ? <p className="text-metadata text-text-secondary">{t("detail.noMessages")}</p> : null}
        {data.messages.map((m) => (
          <div key={m.id} className="flex flex-col gap-0.5 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
            <span className="text-metadata text-text-secondary">
              {m.authorType === "USER" ? m.author?.displayName ?? t("detail.team") : t("detail.support")} · {formatDate(m.createdAt, locale)}
            </span>
            <span className="whitespace-pre-wrap text-body text-text-primary">{m.body}</span>
          </div>
        ))}

        {actionError ? (
          <p role="alert" className="text-metadata text-state-urgent">
            {actionError}
          </p>
        ) : null}
        {canReply ? (
          <div className="flex flex-col gap-2">
            <textarea aria-label={t("detail.composePlaceholder")} value={reply} maxLength={5000} onChange={(e) => setReply(e.target.value)} placeholder={t("detail.composePlaceholder")} rows={3} className="rounded-md border border-border-strong bg-surface-elevated p-2 text-body text-text-primary" />
            <Button disabled={!reply.trim()} isLoading={sending} onClick={send}>
              {t("detail.send")}
            </Button>
          </div>
        ) : null}
        {canReopen ? (
          <Button variant="secondary" isLoading={reopening} onClick={reopen}>
            {t("detail.reopen")}
          </Button>
        ) : null}
      </ContextSurface>
    </div>
  );
}
