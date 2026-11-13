"use client";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import type { ApprovalModeValue, PartnerApprovalModeDto, PartnerApprovalModesDto } from "@petlife/types";
import { adminApprovalsService, type ApprovalPartnerKind } from "@/services/admin-approvals.service";
import { useAdminStore } from "@/stores/admin-store";
import { intlLocale } from "@/features/admin/admin-copy";

type Choice = "INHERIT" | ApprovalModeValue;
const CHOICES: Choice[] = ["INHERIT", "INSTANT", "NEEDS_APPROVAL"];
const MIN_REASON = 5;

/**
 * Approval mode on a partner profile: per flow (care-service bookings and stays for a service business, shop orders
 * for a shop), inherit the platform setting or force Instant / Needs approval for this partner. Changing it needs
 * settings.manage; everyone who can open the profile sees what applies and why.
 */
export function PartnerApprovalModePanel({ kind, organizationId }: { kind: ApprovalPartnerKind; organizationId: string }) {
  const t = useTranslations("adminApprovalModes");
  const canManage = !!useAdminStore((s) => s.context?.permissions)?.includes("settings.manage");
  const [data, setData] = useState<PartnerApprovalModesDto | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    setFailed(false);
    try {
      setData(await adminApprovalsService.get(kind, organizationId));
    } catch {
      setFailed(true);
    }
  }, [kind, organizationId]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ContextSurface className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-section-title text-text-primary">
          {t("title")}
        </h2>
        <p className="text-metadata text-text-secondary">{t("hint")}</p>
      </div>
      {failed ? (
        <ErrorRecovery title={t("loadFailed")} message="" retryLabel={t("retry")} onRetry={() => void load()} />
      ) : !data ? (
        <Skeleton className="h-24 w-full" aria-label={t("loading")} />
      ) : (
        <ul className="flex flex-col gap-4">
          {data.items.map((item) => (
            <li key={item.scope} className="border-t border-border-subtle pt-3 first:border-t-0 first:pt-0">
              <ScopeRow kind={kind} organizationId={organizationId} item={item} canManage={canManage} onSaved={setData} />
            </li>
          ))}
        </ul>
      )}
      {data && !canManage ? <p className="text-metadata text-text-secondary">{t("readOnly")}</p> : null}
    </ContextSurface>
  );
}

function ScopeRow({ kind, organizationId, item, canManage, onSaved }: { kind: ApprovalPartnerKind; organizationId: string; item: PartnerApprovalModeDto; canManage: boolean; onSaved: (data: PartnerApprovalModesDto) => void }) {
  const t = useTranslations("adminApprovalModes");
  const locale = useLocale();
  const current: Choice = item.override?.mode ?? "INHERIT";
  const [choice, setChoice] = useState<Choice>(current);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<"saved" | "saveFailed" | "reasonRequired" | null>(null);
  useEffect(() => setChoice(current), [current]);
  const when = (iso: string) => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  const fieldId = `approval-${organizationId}-${item.scope}`;

  async function save() {
    if (reason.trim().length < MIN_REASON) return setMessage("reasonRequired");
    setBusy(true);
    setMessage(null);
    try {
      const next = choice === "INHERIT" ? await adminApprovalsService.clear(kind, organizationId, item.scope, reason.trim()) : await adminApprovalsService.set(kind, organizationId, item.scope, choice, reason.trim());
      setReason("");
      setMessage("saved");
      onSaved(next);
    } catch {
      setMessage("saveFailed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-body font-medium text-text-primary">{t(`scopes.${item.scope}`)}</h3>
        <StatusLabel tone={item.effective === "NEEDS_APPROVAL" ? "pending" : item.effective === "INSTANT" ? "success" : "neutral"}>{t(`modes.${item.effective}`)}</StatusLabel>
      </div>
      <dl className="grid gap-1 text-metadata sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-text-secondary">{t("platform")}</dt>
          <dd className="break-words text-text-primary">{t(`modes.${item.vertical}`)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-text-secondary">{t("source")}</dt>
          <dd className="break-words text-text-primary">{item.override ? t("overridden") : t("inherited")}</dd>
        </div>
      </dl>
      {item.override ? (
        <p className="break-words text-metadata text-text-secondary">
          {t("overrideReason", { reason: item.override.reason })} · {t("overrideBy", { name: item.override.updatedByName ?? t("unknownAdmin"), when: when(item.override.updatedAt) })}
        </p>
      ) : null}
      {canManage ? (
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <Select
            id={`${fieldId}-choice`}
            label={t("choice")}
            value={choice}
            options={CHOICES.map((c) => ({ value: c, label: t(`choices.${c}`) }))}
            onChange={(e) => {
              setChoice(e.target.value as Choice);
              setMessage(null);
            }}
          />
          <Input
            id={`${fieldId}-reason`}
            label={t("reason")}
            hint={t("reasonHint")}
            dir="auto"
            maxLength={500}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setMessage(null);
            }}
          />
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <Button size="sm" variant="secondary" isLoading={busy} disabled={busy || choice === current} onClick={() => void save()}>
              {t("save")}
            </Button>
            {message ? (
              <p role={message === "saved" ? "status" : "alert"} className={`text-metadata ${message === "saved" ? "text-state-success" : "text-state-urgent"}`}>
                {t(message)}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
