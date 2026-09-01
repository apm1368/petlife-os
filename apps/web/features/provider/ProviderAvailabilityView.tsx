"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AvailabilityExceptionType } from "@petlife/types";
import { Button, ContextSurface, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import type { ProviderAvailabilityExceptionDto, ProviderAvailabilityRuleDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { providerOsService } from "@/services/provider-os.service";
import { formatAppointmentDateTime } from "@/lib/date/appointment-date";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * Availability management (spec sections 7-9) — reuses the existing
 * ProviderAvailabilityRule/Exception models and SlotGeneratorService; this
 * is CRUD over them, never a second availability engine. Creating a BLOCKED
 * exception that conflicts with confirmed bookings requires an explicit
 * "acknowledge and proceed" step rather than silently cancelling anything.
 */
export function ProviderAvailabilityView() {
  const t = useTranslations("provider.availability");
  const tDay = useTranslations("provider.availability.day");
  const locale = useLocale() as "fa" | "en";

  const [rules, setRules] = useState<ProviderAvailabilityRuleDto[] | null>(null);
  const [exceptions, setExceptions] = useState<ProviderAvailabilityExceptionDto[] | null>(null);
  const [error, setError] = useState(false);

  const [locationId, setLocationId] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [startLocalTime, setStartLocalTime] = useState("09:00");
  const [endLocalTime, setEndLocalTime] = useState("17:00");
  const [timezone, setTimezone] = useState("UTC");
  const [ruleError, setRuleError] = useState<string | null>(null);

  const [exceptionStart, setExceptionStart] = useState("");
  const [exceptionEnd, setExceptionEnd] = useState("");
  const [exceptionType, setExceptionType] = useState<AvailabilityExceptionType>(AvailabilityExceptionType.BLOCKED);
  const [exceptionReason, setExceptionReason] = useState("");
  const [conflictWarning, setConflictWarning] = useState<{ count: number } | null>(null);
  const [exceptionError, setExceptionError] = useState<string | null>(null);

  async function load() {
    setError(false);
    try {
      const [ruleRows, exceptionRows] = await Promise.all([providerOsService.listAvailabilityRules(), providerOsService.listAvailabilityExceptions()]);
      setRules(ruleRows);
      setExceptions(exceptionRows);
      if (!locationId && ruleRows[0]) setLocationId(ruleRows[0].locationId);
      if (ruleRows[0]) setTimezone(ruleRows[0].timezone);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createRule() {
    setRuleError(null);
    if (!locationId) {
      setRuleError(t("rules.locationRequired"));
      return;
    }
    try {
      await providerOsService.createAvailabilityRule({ locationId, dayOfWeek: Number(dayOfWeek), startLocalTime, endLocalTime, timezone });
      await load();
    } catch (err) {
      setRuleError(err instanceof ApiError ? err.message : t("rules.createFailed"));
    }
  }

  async function deleteRule(id: string) {
    await providerOsService.deleteAvailabilityRule(id);
    await load();
  }

  async function createException(acknowledgeConflict = false) {
    setExceptionError(null);
    setConflictWarning(null);
    if (!locationId || !exceptionStart || !exceptionEnd) {
      setExceptionError(t("exceptions.fieldsRequired"));
      return;
    }
    try {
      await providerOsService.createAvailabilityException({
        locationId,
        startAt: new Date(exceptionStart).toISOString(),
        endAt: new Date(exceptionEnd).toISOString(),
        type: exceptionType,
        reason: exceptionReason || undefined,
        acknowledgeConflict,
      });
      setExceptionStart("");
      setExceptionEnd("");
      setExceptionReason("");
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.code === "AVAILABILITY_CONFLICT") {
        setConflictWarning({ count: Number(err.details?.count ?? 0) });
        return;
      }
      setExceptionError(err instanceof ApiError ? err.message : t("exceptions.createFailed"));
    }
  }

  async function deleteException(id: string) {
    await providerOsService.deleteAvailabilityException(id);
    await load();
  }

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!rules || !exceptions) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>

      <ContextSurface className="flex flex-col gap-3">
        <h2 className="text-section-title text-text-primary">{t("rules.title")}</h2>
        {rules.length === 0 ? <p className="text-metadata text-text-secondary">{t("rules.empty")}</p> : null}
        {rules.map((rule) => (
          <div key={rule.id} className="flex items-center justify-between gap-2 border-t border-border-subtle pt-2">
            <span className="text-body text-text-primary">
              {tDay(DAY_KEYS[rule.dayOfWeek])} {rule.startLocalTime}–{rule.endLocalTime} ({rule.timezone})
            </span>
            <Button variant="ghost" size="sm" onClick={() => deleteRule(rule.id)}>
              {t("rules.delete")}
            </Button>
          </div>
        ))}

        <div className="mt-2 grid grid-cols-2 gap-2">
          <Input label={t("rules.locationId")} value={locationId} onChange={(e) => setLocationId(e.target.value)} />
          <Select
            label={t("rules.dayOfWeek")}
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(e.target.value)}
            options={DAY_KEYS.map((key, index) => ({ value: String(index), label: tDay(key) }))}
          />
          <Input label={t("rules.startLocalTime")} value={startLocalTime} onChange={(e) => setStartLocalTime(e.target.value)} />
          <Input label={t("rules.endLocalTime")} value={endLocalTime} onChange={(e) => setEndLocalTime(e.target.value)} />
          <Input label={t("rules.timezone")} value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </div>
        {ruleError ? <StatusLabel tone="attention">{ruleError}</StatusLabel> : null}
        <Button variant="secondary" onClick={createRule}>
          {t("rules.add")}
        </Button>
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-3">
        <h2 className="text-section-title text-text-primary">{t("exceptions.title")}</h2>
        {exceptions.length === 0 ? <p className="text-metadata text-text-secondary">{t("exceptions.empty")}</p> : null}
        {exceptions.map((exception) => (
          <div key={exception.id} className="flex items-center justify-between gap-2 border-t border-border-subtle pt-2">
            <div>
              <StatusLabel tone={exception.type === "BLOCKED" ? "attention" : "success"}>{t(`exceptions.type.${exception.type}`)}</StatusLabel>
              <p className="mt-1 text-metadata text-text-secondary">
                {formatAppointmentDateTime(exception.startAt, locale, "UTC")} – {formatAppointmentDateTime(exception.endAt, locale, "UTC")}
              </p>
              {exception.reason ? <p className="text-metadata text-text-secondary">{exception.reason}</p> : null}
            </div>
            <Button variant="ghost" size="sm" onClick={() => deleteException(exception.id)}>
              {t("exceptions.delete")}
            </Button>
          </div>
        ))}

        <div className="mt-2 grid grid-cols-2 gap-2">
          <Input label={t("exceptions.startAt")} type="datetime-local" value={exceptionStart} onChange={(e) => setExceptionStart(e.target.value)} />
          <Input label={t("exceptions.endAt")} type="datetime-local" value={exceptionEnd} onChange={(e) => setExceptionEnd(e.target.value)} />
          <Select
            label={t("exceptions.typeLabel")}
            value={exceptionType}
            onChange={(e) => setExceptionType(e.target.value as AvailabilityExceptionType)}
            options={[
              { value: AvailabilityExceptionType.BLOCKED, label: t("exceptions.type.BLOCKED") },
              { value: AvailabilityExceptionType.AVAILABLE_OVERRIDE, label: t("exceptions.type.AVAILABLE_OVERRIDE") },
            ]}
          />
          <Input label={t("exceptions.reason")} value={exceptionReason} onChange={(e) => setExceptionReason(e.target.value)} />
        </div>
        {exceptionError ? <StatusLabel tone="attention">{exceptionError}</StatusLabel> : null}

        {conflictWarning ? (
          <ContextSurface className="flex flex-col gap-2 border-state-attention">
            <p className="text-body text-text-primary">{t("exceptions.conflictWarning", { count: conflictWarning.count })}</p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setConflictWarning(null)}>
                {t("exceptions.conflictCancel")}
              </Button>
              <Button variant="primary" onClick={() => createException(true)}>
                {t("exceptions.conflictProceed")}
              </Button>
            </div>
          </ContextSurface>
        ) : (
          <Button variant="secondary" onClick={() => createException(false)}>
            {t("exceptions.add")}
          </Button>
        )}
      </ContextSurface>
    </div>
  );
}
