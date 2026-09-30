"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button, Input, Select } from "@petlife/ui";
import { CommunityReportReason } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { useSessionStore } from "@/stores/session-store";

const REASONS: CommunityReportReason[] = [
  CommunityReportReason.SCAM,
  CommunityReportReason.SPAM,
  CommunityReportReason.HARASSMENT,
  CommunityReportReason.ABUSE,
  CommunityReportReason.ANIMAL_WELFARE,
  CommunityReportReason.PERSONAL_INFORMATION,
  CommunityReportReason.DANGEROUS_CONTENT,
  CommunityReportReason.MISINFORMATION,
  CommunityReportReason.INAPPROPRIATE,
  CommunityReportReason.OTHER,
];

/**
 * One report affordance for every public surface (community posts, support
 * listings, lost-pet pages, organizations). Submission goes to the single
 * moderation queue; a repeat report while the first is under review is shown
 * as "already reported", not as an error.
 */
export function ReportContentPanel({ submit, successMessage }: { submit: (reason: CommunityReportReason, details?: string) => Promise<unknown>; successMessage?: string }) {
  const t = useTranslations("report");
  const tReason = useTranslations("community.reportReason");
  const tCommon = useTranslations("common");
  const status = useSessionStore((s) => s.status);
  const router = useRouter();
  const locale = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState<CommunityReportReason>(CommunityReportReason.SCAM);
  const [details, setDetails] = useState("");
  const [outcome, setOutcome] = useState<"sent" | "duplicate" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function open() {
    if (status !== "authenticated") {
      router.push(`/${locale}/welcome?returnTo=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setIsOpen((v) => !v);
  }

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      await submit(reason, details.trim() || undefined);
      setOutcome("sent");
    } catch (err) {
      if (err instanceof ApiError && err.code === "DUPLICATE_REPORT") setOutcome("duplicate");
      else if (err instanceof ApiError && err.code === "REPORT_LIMIT_REACHED") setError(t("limitReached"));
      else setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button variant="ghost" size="sm" onClick={open} aria-expanded={isOpen}>
          {t("action")}
        </Button>
      </div>
      {isOpen ? (
        <div className="flex flex-col gap-3 border-t border-border-subtle pt-3">
          {outcome ? (
            <p className="text-body text-state-success" role="status">
              {outcome === "sent" ? successMessage ?? t("success") : t("duplicate")}
            </p>
          ) : (
            <>
              <p className="text-metadata text-text-secondary">{t("hint")}</p>
              <Select label={t("reasonLabel")} value={reason} onChange={(e) => setReason(e.target.value as CommunityReportReason)} options={REASONS.map((value) => ({ value, label: tReason(value) }))} />
              <Input label={t("detailsLabel")} hint={tCommon("optional")} value={details} maxLength={1000} onChange={(e) => setDetails(e.target.value)} />
              {error ? <p className="text-body text-state-urgent">{error}</p> : null}
              <div>
                <Button variant="secondary" isLoading={isSubmitting} onClick={handleSubmit}>
                  {t("submit")}
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
