"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorRecovery, Input, Skeleton } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { useAdminStore } from "@/stores/admin-store";
import {
  adminFeatureFlagsService,
  type FeatureFlag,
  type FeatureFlagChange,
  type FeatureFlagPayload,
} from "@/services/admin-feature-flags.service";
import { EmptyRow, Panel, PanelTitle, TableWrap, Tag, Td, Th } from "../console-ui";

const split = (value: string) => [
  ...new Set(
    value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean),
  ),
];
const keyPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

export function AdminFeatureFlagsView() {
  const t = useTranslations("adminFeatureFlags");
  const context = useAdminStore((state) => state.context);
  const view = !!context?.permissions.includes("settings.view");
  const manage = !!context?.permissions.includes("settings.manage");
  const approve = !!context?.permissions.includes("settings.approve");
  const [rows, setRows] = useState<FeatureFlag[] | null>(null);
  const [changes, setChanges] = useState<FeatureFlagChange[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision((value) => value + 1);

  useEffect(() => {
    if (!view) return;
    const controller = new AbortController();
    setError(null);
    Promise.all([
      adminFeatureFlagsService.list(controller.signal),
      adminFeatureFlagsService.changes(1, controller.signal),
    ])
      .then(([flags, history]) => {
        if (!controller.signal.aborted) {
          setRows(flags);
          setChanges(history.items);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause);
      });
    return () => controller.abort();
  }, [view, revision]);

  if (!view) return <EmptyState title={t("forbidden")} />;
  return (
    <div className="min-w-0 space-y-5 break-words">
      <header>
        <h1 className="text-page-title">{t("title")}</h1>
        <p className="mt-1 text-text-secondary">{t("intro")}</p>
      </header>
      {error ? (
        <ErrorRecovery title={t("loadFailed")} message="" retryLabel={t("retry")} onRetry={refresh} />
      ) : null}
      {!rows && !error ? <Skeleton className="h-52 w-full" aria-label={t("loading")} /> : null}
      {rows ? (
        <>
          {manage ? (
            <FlagEditor
              title={t("createTitle")}
              submitLabel={t("submitForApproval")}
              onSubmit={async (key, body) => {
                await adminFeatureFlagsService.create(key, body);
                refresh();
              }}
            />
          ) : null}
          <Panel>
            <PanelTitle title={t("activeTitle")} hint={t("activeHint")} />
            <TableWrap>
              <table className="w-full min-w-[740px]">
                <thead>
                  <tr>
                    <Th>{t("key")}</Th>
                    <Th>{t("state")}</Th>
                    <Th>{t("rollout")}</Th>
                    <Th>{t("cities")}</Th>
                    <Th>{t("betaUsers")}</Th>
                    <Th>{t("version")}</Th>
                    <Th>{t("pending")}</Th>
                    <Th>{t("actions")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <EmptyRow colSpan={8} label={t("empty")} />
                  ) : (
                    rows.map((flag) => (
                      <FlagRow key={flag.key} flag={flag} manage={manage} t={t} refresh={refresh} />
                    ))
                  )}
                </tbody>
              </table>
            </TableWrap>
          </Panel>
          <ChangesPanel
            changes={changes}
            approve={approve}
            adminId={context?.adminUserId ?? ""}
            refresh={refresh}
            t={t}
          />
        </>
      ) : null}
    </div>
  );
}

function FlagRow({
  flag,
  manage,
  t,
  refresh,
}: {
  flag: FeatureFlag;
  manage: boolean;
  t: ReturnType<typeof useTranslations>;
  refresh: () => void;
}) {
  const [edit, setEdit] = useState(false);
  return (
    <>
      <tr>
        <Td>
          <div>
            <strong dir="ltr">{flag.key}</strong>
            {flag.description ? (
              <p className="mt-1 max-w-64 whitespace-normal text-text-secondary">{flag.description}</p>
            ) : null}
          </div>
        </Td>
        <Td>
          <Tag tone={flag.isEnabled ? "success" : "neutral"}>
            {t(flag.isEnabled ? "enabled" : "disabled")}
          </Tag>
        </Td>
        <Td>{flag.rolloutPercentage}%</Td>
        <Td>{flag.cities.length || "—"}</Td>
        <Td>{flag.betaUserIds.length || "—"}</Td>
        <Td>{flag.version}</Td>
        <Td>{flag.pendingChanges || "—"}</Td>
        <Td>
          {manage ? (
            <Button variant="secondary" onClick={() => setEdit((value) => !value)}>
              {t(edit ? "close" : "edit")}
            </Button>
          ) : (
            "—"
          )}
        </Td>
      </tr>
      {edit ? (
        <tr>
          <td colSpan={8} className="p-3">
            <FlagEditor
              title={t("editTitle", { key: flag.key })}
              submitLabel={t("submitForApproval")}
              initial={flag}
              fixedKey
              onSubmit={async (_key, body) => {
                await adminFeatureFlagsService.update(flag.key, { ...body, baseVersion: flag.version });
                setEdit(false);
                refresh();
              }}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function FlagEditor({
  title,
  submitLabel,
  initial,
  fixedKey = false,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  initial?: FeatureFlag;
  fixedKey?: boolean;
  onSubmit: (key: string, body: FeatureFlagPayload) => Promise<void>;
}) {
  const t = useTranslations("adminFeatureFlags");
  const [key, setKey] = useState(initial?.key ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [enabled, setEnabled] = useState(initial?.isEnabled ?? false);
  const [rollout, setRollout] = useState(String(initial?.rolloutPercentage ?? 0));
  const [cities, setCities] = useState(initial?.cities.join(", ") ?? "");
  const [betaUserIds, setBetaUserIds] = useState(initial?.betaUserIds.join("\n") ?? "");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const percent = Number(rollout);
  const valid =
    keyPattern.test(key) &&
    Number.isInteger(percent) &&
    percent >= 0 &&
    percent <= 100 &&
    reason.trim().length >= 5;
  return (
    <Panel className="space-y-3">
      <PanelTitle title={title} hint={t("twoPersonHint")} />
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          label={t("key")}
          dir="ltr"
          value={key}
          disabled={fixedKey || busy}
          onChange={(event) => setKey(event.target.value)}
        />
        <Input
          label={t("description")}
          value={description}
          disabled={busy}
          maxLength={500}
          onChange={(event) => setDescription(event.target.value)}
        />
        <Input
          label={t("rollout")}
          dir="ltr"
          inputMode="numeric"
          value={rollout}
          disabled={busy}
          onChange={(event) => setRollout(event.target.value)}
        />
        <Input
          label={t("citiesHint")}
          value={cities}
          disabled={busy}
          onChange={(event) => setCities(event.target.value)}
        />
      </div>
      <label className="flex items-center gap-2 text-body">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        {t("enabled")}
      </label>
      <label className="block text-body">
        <span className="mb-1 block text-text-secondary">{t("betaUsersHint")}</span>
        <textarea
          className="min-h-20 w-full rounded-md border border-border-subtle bg-surface-base p-2 text-body text-text-primary"
          dir="ltr"
          value={betaUserIds}
          disabled={busy}
          onChange={(event) => setBetaUserIds(event.target.value)}
        />
      </label>
      <Input
        label={t("reason")}
        value={reason}
        disabled={busy}
        maxLength={500}
        onChange={(event) => setReason(event.target.value)}
      />
      <label className="flex items-start gap-2 text-body">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        {t("confirm")}
      </label>
      {message ? (
        <p role="alert" className="text-state-urgent">
          {message}
        </p>
      ) : null}
      <Button
        disabled={!valid || !confirmed || busy}
        isLoading={busy}
        onClick={async () => {
          setBusy(true);
          setMessage(null);
          try {
            await onSubmit(key.trim(), {
              ...(description.trim() ? { description: description.trim() } : {}),
              isEnabled: enabled,
              rolloutPercentage: percent,
              cities: split(cities),
              betaUserIds: split(betaUserIds),
              reason: reason.trim(),
            });
            setReason("");
            setConfirmed(false);
            setMessage(t("submitted"));
          } catch (error) {
            setMessage(error instanceof ApiError && error.status === 409 ? t("conflict") : t("saveFailed"));
          } finally {
            setBusy(false);
          }
        }}
      >
        {submitLabel}
      </Button>
    </Panel>
  );
}

function ChangesPanel({
  changes,
  approve,
  adminId,
  refresh,
  t,
}: {
  changes: FeatureFlagChange[] | null;
  approve: boolean;
  adminId: string;
  refresh: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!changes) return <Skeleton className="h-36 w-full" aria-label={t("loading")} />;
  return (
    <Panel>
      <PanelTitle title={t("history")} hint={t("historyHint")} />
      <TableWrap>
        <table className="w-full min-w-[720px]">
          <thead>
            <tr>
              <Th>{t("key")}</Th>
              <Th>{t("state")}</Th>
              <Th>{t("reason")}</Th>
              <Th>{t("requestedBy")}</Th>
              <Th>{t("actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {changes.length === 0 ? (
              <EmptyRow colSpan={5} label={t("noChanges")} />
            ) : (
              changes.map((change) => (
                <tr key={change.id}>
                  <Td>
                    <span dir="ltr">{change.key}</span>
                  </Td>
                  <Td>
                    <Tag
                      tone={
                        change.status === "APPLIED"
                          ? "success"
                          : change.status === "REJECTED"
                            ? "urgent"
                            : "attention"
                      }
                    >
                      {t(`statuses.${change.status}`)}
                    </Tag>
                  </Td>
                  <Td>
                    <span className="max-w-64 whitespace-normal">{change.reason}</span>
                  </Td>
                  <Td>
                    <span dir="ltr">{change.requestedByAdminId.slice(0, 8)}…</span>
                  </Td>
                  <Td>
                    {approve && change.status === "PENDING" && change.requestedByAdminId !== adminId ? (
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          disabled={busy === change.id}
                          onClick={async () => {
                            setBusy(change.id);
                            try {
                              await adminFeatureFlagsService.review(change.id, "REJECT");
                              refresh();
                            } finally {
                              setBusy(null);
                            }
                          }}
                        >
                          {t("reject")}
                        </Button>
                        <Button
                          disabled={busy === change.id}
                          onClick={async () => {
                            setBusy(change.id);
                            try {
                              await adminFeatureFlagsService.review(change.id, "APPROVE");
                              refresh();
                            } finally {
                              setBusy(null);
                            }
                          }}
                        >
                          {t("approve")}
                        </Button>
                      </div>
                    ) : (
                      "—"
                    )}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableWrap>
    </Panel>
  );
}
