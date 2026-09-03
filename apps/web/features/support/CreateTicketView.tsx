"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, ContextSurface, Select } from "@petlife/ui";
import { SupportCaseCategory } from "@petlife/types";
import { supportService } from "@/services/support.service";
import { ApiError } from "@/lib/api/client";

/**
 * Create Ticket. Contextual entry points ("Get support" on Order/Booking
 * Detail) prefill via query params — relatedEntityType/relatedEntityId are
 * only ever accepted from links this app itself generates (see
 * OrderDetailView/BookingDetailView), never typed by hand, but the backend
 * still validates ownership regardless (see SupportCaseService.
 * assertUserOwnsReferences) so a tampered link can't attach someone else's
 * order/booking to this user's case.
 */
export function CreateTicketView() {
  const t = useTranslations("support");
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();

  const relatedEntityType = searchParams.get("relatedEntityType");
  const relatedEntityId = searchParams.get("relatedEntityId");
  const prefillCategory = searchParams.get("category");

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<SupportCaseCategory>(
    prefillCategory && Object.values(SupportCaseCategory).includes(prefillCategory as SupportCaseCategory) ? (prefillCategory as SupportCaseCategory) : SupportCaseCategory.OTHER,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!subject.trim() || !description.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await supportService.create({
        subject,
        description,
        category,
        relatedEntityType: relatedEntityType === "ORDER" || relatedEntityType === "BOOKING" ? relatedEntityType : undefined,
        relatedEntityId: relatedEntityId ?? undefined,
      });
      router.push(`/${locale}/support/tickets/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("create.failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title text-text-primary">{t("create.title")}</h1>

      <ContextSurface className="flex flex-col gap-3">
        {relatedEntityType ? <p className="text-metadata text-text-secondary">{t("create.linkedContext", { type: t(`relatedEntityType.${relatedEntityType}`) })}</p> : null}

        <Select
          label={t("create.category")}
          value={category}
          onChange={(e) => setCategory(e.target.value as SupportCaseCategory)}
          options={Object.values(SupportCaseCategory).map((c) => ({ value: c, label: t(`category.${c}`) }))}
        />

        <label className="flex flex-col gap-1">
          <span className="text-metadata text-text-secondary">{t("create.subject")}</span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="rounded-md border border-border-strong bg-surface-elevated p-2 text-body text-text-primary"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-metadata text-text-secondary">{t("create.description")}</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            className="rounded-md border border-border-strong bg-surface-elevated p-2 text-body text-text-primary"
          />
        </label>

        {error ? (
          <p role="alert" className="text-metadata text-state-urgent">
            {error}
          </p>
        ) : null}

        <Button isLoading={submitting} onClick={submit}>
          {t("create.submit")}
        </Button>
      </ContextSurface>
    </div>
  );
}
