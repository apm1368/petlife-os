"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, EmptyState, ErrorRecovery, Input, Select, Skeleton } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { useAdminStore } from "@/stores/admin-store";
import { formatDateLabel } from "@/lib/date/appointment-date";
import {
  adminSettingsService,
  type PlatformSetting,
  type SettingChange,
  type SettingChangeStatus,
  type SettingValue,
} from "@/services/admin-settings.service";
import { Panel, PanelTitle, DetailRow } from "../console-ui";

const knownKeys = [
  "platform.announcement",
  "booking.holdTtlSeconds",
  "commerce.refundApprovalThresholdIrr",
  "commerce.settlementApprovalThresholdIrr",
  "support.firstResponseSlaHours",
  "trust.highSeveritySlaHours",
  "trust.standardSlaHours",
  "privacy.exportsPerDay",
];
const statuses: SettingChangeStatus[] = ["PENDING", "APPLIED", "REJECTED", "CANCELLED", "SUPERSEDED"];
const isMoney = (key: string) => key.endsWith("Irr");
const nameKey = (key: string) => key.replaceAll(".", "_");
const ascii = (value: string) =>
  value
    .replace(/[۰-۹]/g, (char) => String(char.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (char) => String(char.charCodeAt(0) - 1632))
    .replace(/٫/g, ".")
    .trim();
/** Toman permits one decimal, so every integer IRR threshold can be edited without rounding. */
export function parseSettingNumber(value: string, money: boolean): number | undefined {
  const raw = ascii(value);
  if (!(money ? /^\d+(?:\.\d)?$/ : /^\d+$/).test(raw)) return undefined;
  const [whole, fraction = "0"] = raw.split(".");
  const result = money ? Number(whole) * 10 + Number(fraction) : Number(whole);
  return Number.isSafeInteger(result) ? result : undefined;
}
function useCopy() {
  const t = useTranslations("adminSettings"),
    locale = useLocale() as "fa" | "en";
  const number = (value: number) =>
    new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US", { maximumFractionDigits: 1 }).format(value);
  return {
    t,
    locale,
    number,
    label: (key: string) => (knownKeys.includes(key) ? t(`names.${nameKey(key)}`) : key),
  };
}
function DisplayValue({ value, settingKey }: { value: SettingValue; settingKey: string }) {
  const { t, number } = useCopy();
  if (value === null) return <span>{t("none")}</span>;
  if (typeof value === "number")
    return (
      <span>
        {number(isMoney(settingKey) ? value / 10 : value)}{" "}
        {isMoney(settingKey)
          ? t("units.toman")
          : settingKey === "booking.holdTtlSeconds"
            ? t("units.seconds")
            : settingKey === "privacy.exportsPerDay"
              ? t("units.perDay")
              : t("units.hours")}
      </span>
    );
  if (typeof value === "boolean") return <span>{t(value ? "enabled" : "disabled")}</span>;
  return (
    <div className="space-y-1">
      {value.fa && (
        <p dir="rtl" lang="fa">
          {value.fa}
        </p>
      )}
      {value.en && (
        <p dir="ltr" lang="en">
          {value.en}
        </p>
      )}
    </div>
  );
}
function LoadFailure({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useCopy();
  if (error instanceof ApiError && error.status === 403) return <EmptyState title={t("forbidden")} />;
  return <ErrorRecovery title={t("loadFailed")} message="" retryLabel={t("retry")} onRetry={retry} />;
}
function Confirmation({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
}) {
  const { t } = useCopy();
  return (
    <label className="flex items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      {t("confirm")}
    </label>
  );
}

export function AdminSettingsView() {
  const { t, label, number } = useCopy(),
    context = useAdminStore((s) => s.context);
  const view = !!context?.permissions.includes("settings.view"),
    manage = !!context?.permissions.includes("settings.manage"),
    approve = !!context?.permissions.includes("settings.approve");
  const [rows, setRows] = useState<PlatformSetting[] | null>(null),
    [error, setError] = useState<unknown>(null),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!view) return;
    const controller = new AbortController();
    setError(null);
    adminSettingsService
      .list(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setRows(result);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e);
      });
    return () => controller.abort();
  }, [view, revision]);
  const refresh = () => setRevision((value) => value + 1);
  return (
    <div className="min-w-0 space-y-4 break-words">
      <h1 className="text-page-title">{t("title")}</h1>
      <p className="text-text-secondary">{t("intro")}</p>
      {!view ? (
        <EmptyState title={t("forbidden")} />
      ) : (
        <>
          {error && <LoadFailure error={error} retry={refresh} />}
          {!rows && !error ? (
            <Skeleton className="h-40 w-full" aria-label={t("loading")} />
          ) : (
            rows && (
              <>
                <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                  {rows.length === 0 ? (
                    <EmptyState title={t("empty")} />
                  ) : (
                    rows.map((row) => (
                      <Panel key={row.key}>
                        <PanelTitle
                          title={label(row.key)}
                          hint={t(row.highImpact ? "secondApproval" : "immediate")}
                        />
                        <DetailRow label={t("current")}>
                          <DisplayValue value={row.value} settingKey={row.key} />
                        </DetailRow>
                        <DetailRow label={t("source")}>
                          {t(row.source === "DEFAULT" ? "default" : "override")}
                        </DetailRow>
                        <DetailRow label={t("pending")}>{number(row.pendingChanges)}</DetailRow>
                        {manage && knownKeys.includes(row.key) && (
                          <SettingEditor row={row} refresh={refresh} />
                        )}
                      </Panel>
                    ))
                  )}
                </div>
                <SettingsHistory
                  settings={rows}
                  manage={manage}
                  approve={approve}
                  adminId={context?.adminUserId ?? ""}
                  revision={revision}
                  refresh={refresh}
                />
              </>
            )
          )}
        </>
      )}
    </div>
  );
}

function SettingEditor({ row, refresh }: { row: PlatformSetting; refresh: () => void }) {
  const { t, number } = useCopy();
  const [open, setOpen] = useState(false),
    [raw, setRaw] = useState(
      typeof row.value === "number" ? String(isMoney(row.key) ? row.value / 10 : row.value) : "",
    ),
    [bool, setBool] = useState(row.value === true),
    [fa, setFa] = useState(typeof row.value === "object" ? (row.value?.fa ?? "") : ""),
    [en, setEn] = useState(typeof row.value === "object" ? (row.value?.en ?? "") : ""),
    [baseVersion, setBaseVersion] = useState(row.version),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [result, setResult] = useState<SettingChangeStatus | null>(null);
  const parsed = row.type === "integer" ? parseSettingNumber(raw, isMoney(row.key)) : undefined;
  const value: SettingValue =
    row.type === "integer"
      ? (parsed ?? 0)
      : row.type === "boolean"
        ? bool
        : fa.trim() || en.trim()
          ? { ...(fa.trim() ? { fa: fa.trim() } : {}), ...(en.trim() ? { en: en.trim() } : {}) }
          : null;
  const valid =
    row.type !== "integer" ||
    (parsed !== undefined &&
      (row.constraints.min === null || parsed >= row.constraints.min) &&
      (row.constraints.max === null || parsed <= row.constraints.max));
  const stale = row.version !== baseVersion;
  return (
    <div className="mt-4 space-y-3">
      <Button variant="secondary" onClick={() => setOpen((v) => !v)}>
        {t(open ? "closeEditor" : "edit")}
      </Button>
      {open && (
        <>
          <div className="space-y-3">
            {row.type === "localizedText" ? (
              <>
                <Input
                  label={t("persianText")}
                  dir="rtl"
                  lang="fa"
                  maxLength={row.constraints.maxLength ?? 280}
                  value={fa}
                  onChange={(event) => {
                    setFa(event.target.value);
                    setResult(null);
                    setConfirmed(false);
                  }}
                />
                <Input
                  label={t("englishText")}
                  dir="ltr"
                  lang="en"
                  maxLength={row.constraints.maxLength ?? 280}
                  value={en}
                  onChange={(event) => {
                    setEn(event.target.value);
                    setResult(null);
                    setConfirmed(false);
                  }}
                />
                <p>{t("clearText")}</p>
              </>
            ) : row.type === "boolean" ? (
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={bool}
                  onChange={(event) => {
                    setBool(event.target.checked);
                    setConfirmed(false);
                    setResult(null);
                  }}
                />
                {t("enabled")}
              </label>
            ) : (
              <>
                <Input
                  label={t(isMoney(row.key) ? "tomanValue" : "numericValue")}
                  dir="ltr"
                  inputMode="decimal"
                  value={raw}
                  onChange={(event) => {
                    setRaw(event.target.value);
                    setConfirmed(false);
                    setResult(null);
                  }}
                />
                {row.constraints.min !== null && row.constraints.max !== null && (
                  <p>
                    {t("range", {
                      min: number(isMoney(row.key) ? row.constraints.min / 10 : row.constraints.min),
                      max: number(isMoney(row.key) ? row.constraints.max / 10 : row.constraints.max),
                    })}
                  </p>
                )}
              </>
            )}
          </div>
          <Input
            label={t("reason")}
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
          />
          <Confirmation checked={confirmed} onChange={setConfirmed} disabled={busy} />
          {error && (
            <p role="alert" className="text-state-urgent">
              {t(error)}
            </p>
          )}
          {stale && (
            <div role="alert">
              <p>{t("stale")}</p>
              <Button
                variant="secondary"
                onClick={() => {
                  setBaseVersion(row.version);
                  setConfirmed(false);
                  setError(null);
                }}
              >
                {t("reviewLatest")}
              </Button>
            </div>
          )}
          {result && <p role="status">{t(`statuses.${result}`)}</p>}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                busy ||
                !confirmed ||
                !valid ||
                stale ||
                reason.trim().length < 5 ||
                JSON.stringify(value) === JSON.stringify(row.value)
              }
              isLoading={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                setResult(null);
                try {
                  const change = await adminSettingsService.propose(row.key, {
                    value,
                    baseVersion,
                    reason: reason.trim(),
                  });
                  setResult(change.status);
                  setConfirmed(false);
                  refresh();
                } catch (e) {
                  setError(e instanceof ApiError && e.status === 409 ? "conflict" : "saveFailed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t(row.highImpact ? "propose" : "apply")}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={refresh}>
              {t("reloadCurrent")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function SettingsHistory({
  settings,
  manage,
  approve,
  adminId,
  revision,
  refresh,
}: {
  settings: PlatformSetting[];
  manage: boolean;
  approve: boolean;
  adminId: string;
  revision: number;
  refresh: () => void;
}) {
  const { t, label, number, locale } = useCopy();
  const [key, setKey] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [rows, setRows] = useState<{ items: SettingChange[]; total: number; pageSize: number } | null>(null),
    [error, setError] = useState<unknown>(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    setLoading(true);
    adminSettingsService
      .changes(
        { page, ...(key ? { key } : {}), ...(status ? { status: status as SettingChangeStatus } : {}) },
        controller.signal,
      )
      .then((result) => {
        if (!controller.signal.aborted) setRows(result);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, key, status, revision]);
  return (
    <Panel>
      <PanelTitle title={t("history")} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Select
          label={t("settingFilter")}
          value={key}
          onChange={(event) => {
            setKey(event.target.value);
            setPage(1);
          }}
          options={[
            { value: "", label: t("all") },
            ...settings.map((row) => ({ value: row.key, label: label(row.key) })),
          ]}
        />
        <Select
          label={t("statusFilter")}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          options={[
            { value: "", label: t("all") },
            ...statuses.map((value) => ({ value, label: t(`statuses.${value}`) })),
          ]}
        />
      </div>
      {error ? (
        <LoadFailure error={error} retry={refresh} />
      ) : loading ? (
        <Skeleton className="h-24 w-full" aria-label={t("loading")} />
      ) : (
        rows && (
          <>
            {rows.items.length === 0 ? (
              <EmptyState title={t("noChanges")} />
            ) : (
              rows.items.map((change) => (
                <article key={change.id} className="space-y-3 border-b border-border-subtle py-4">
                  <h3 className="font-bold">{label(change.key)}</h3>
                  <p>{t(`statuses.${change.status}`)}</p>
                  <DetailRow label={t("previousValue")}>
                    <DisplayValue value={change.previousValue} settingKey={change.key} />
                  </DetailRow>
                  <DetailRow label={t("proposedValue")}>
                    <DisplayValue value={change.proposedValue} settingKey={change.key} />
                  </DetailRow>
                  <DetailRow label={t("requestedBy")}>
                    {change.requestedBy?.displayName ?? t("unknown")}
                  </DetailRow>
                  <p dir="auto">{change.reason}</p>
                  <time>{formatDateLabel(change.createdAt, locale, "Asia/Tehran")}</time>
                  {change.reviewNote && <p dir="auto">{change.reviewNote}</p>}
                  {change.status === "PENDING" && (
                    <>
                      {change.requestedBy?.id === adminId && manage ? (
                        <ChangeAction change={change} mode="cancel" refresh={refresh} />
                      ) : change.requestedBy?.id !== adminId && approve ? (
                        <ChangeAction change={change} mode="review" refresh={refresh} />
                      ) : (
                        <p>{t(change.requestedBy?.id === adminId ? "noSelfApproval" : "waiting")}</p>
                      )}
                    </>
                  )}
                </article>
              ))
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((v) => v - 1)}>
                {t("previous")}
              </Button>
              <span>{t("page", { page: number(page), total: number(rows.total) })}</span>
              <Button
                variant="secondary"
                disabled={page * rows.pageSize >= rows.total}
                onClick={() => setPage((v) => v + 1)}
              >
                {t("next")}
              </Button>
            </div>
          </>
        )
      )}
    </Panel>
  );
}
function ChangeAction({
  change,
  mode,
  refresh,
}: {
  change: SettingChange;
  mode: "cancel" | "review";
  refresh: () => void;
}) {
  const { t } = useCopy();
  const [note, setNote] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [result, setResult] = useState<SettingChangeStatus | null>(null);
  async function act(decision?: "APPROVE" | "REJECT") {
    setBusy(true);
    setError(false);
    try {
      const updated = decision
        ? await adminSettingsService.review(change.id, decision, note)
        : await adminSettingsService.cancel(change.id);
      setResult(updated.status);
      setConfirmed(false);
      refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      {mode === "review" && (
        <Input
          label={t("reviewNote")}
          value={note}
          maxLength={500}
          onChange={(event) => setNote(event.target.value)}
        />
      )}
      <Confirmation checked={confirmed} onChange={setConfirmed} disabled={busy} />
      {error && (
        <p role="alert" className="text-state-urgent">
          {t("saveFailed")}
        </p>
      )}
      {result && <p role="status">{t(`statuses.${result}`)}</p>}
      <div className="flex flex-wrap gap-2">
        {mode === "cancel" ? (
          <Button variant="secondary" disabled={!confirmed || busy || !!result} onClick={() => void act()}>
            {t("cancel")}
          </Button>
        ) : (
          <>
            <Button disabled={!confirmed || busy || !!result} onClick={() => void act("APPROVE")}>
              {t("approve")}
            </Button>
            <Button
              variant="secondary"
              disabled={!confirmed || busy || !!result}
              onClick={() => void act("REJECT")}
            >
              {t("reject")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
