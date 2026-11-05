"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorRecovery, Input, Select, Skeleton } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { useAdminStore } from "@/stores/admin-store";
import {
  adminSmsPatternsService,
  type SmsPatternPayload,
  type SmsPatternTemplate,
} from "@/services/admin-sms-patterns.service";
import { EmptyRow, Panel, PanelTitle, TableWrap, Tag, Td, Th } from "../console-ui";

const keyPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
export function AdminSmsPatternsView() {
  const t = useTranslations("adminSmsPatterns");
  const context = useAdminStore((state) => state.context);
  const view = !!context?.permissions.includes("system.view");
  const manage = !!context?.permissions.includes("settings.manage");
  const [rows, setRows] = useState<SmsPatternTemplate[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision((value) => value + 1);
  useEffect(() => {
    if (!view) return;
    const controller = new AbortController();
    setError(null);
    adminSmsPatternsService
      .list(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setRows(result);
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
      {!rows && !error ? <Skeleton className="h-48 w-full" aria-label={t("loading")} /> : null}
      {rows ? (
        <>
          {manage ? (
            <PatternEditor
              title={t("createTitle")}
              submitLabel={t("create")}
              onSubmit={async (key, locale, body) => {
                await adminSmsPatternsService.create({ key, locale, ...body });
                refresh();
              }}
            />
          ) : null}
          <Panel>
            <PanelTitle title={t("listTitle")} hint={t("listHint")} />
            <TableWrap>
              <table className="w-full min-w-[740px]">
                <thead>
                  <tr>
                    <Th>{t("key")}</Th>
                    <Th>{t("language")}</Th>
                    <Th>{t("name")}</Th>
                    <Th>{t("farazCode")}</Th>
                    <Th>{t("bodyAttribute")}</Th>
                    <Th>{t("state")}</Th>
                    <Th>{t("actions")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <EmptyRow colSpan={7} label={t("empty")} />
                  ) : (
                    rows.map((row) => <PatternRow key={row.id} row={row} manage={manage} refresh={refresh} />)
                  )}
                </tbody>
              </table>
            </TableWrap>
          </Panel>
        </>
      ) : null}
    </div>
  );
}
function PatternRow({
  row,
  manage,
  refresh,
}: {
  row: SmsPatternTemplate;
  manage: boolean;
  refresh: () => void;
}) {
  const t = useTranslations("adminSmsPatterns");
  const [editing, setEditing] = useState(false);
  return (
    <>
      <tr>
        <Td>
          <span dir="ltr">{row.key}</span>
        </Td>
        <Td>{row.locale.toUpperCase()}</Td>
        <Td>{row.displayName}</Td>
        <Td>
          <span dir="ltr">{row.farazPatternCode}</span>
        </Td>
        <Td>
          <span dir="ltr">{row.bodyAttributeKey}</span>
        </Td>
        <Td>
          <Tag tone={row.isActive ? "success" : "neutral"}>{t(row.isActive ? "active" : "inactive")}</Tag>
        </Td>
        <Td>
          {manage ? (
            <Button variant="secondary" onClick={() => setEditing((value) => !value)}>
              {t(editing ? "close" : "edit")}
            </Button>
          ) : (
            "—"
          )}
        </Td>
      </tr>
      {editing ? (
        <tr>
          <td colSpan={7} className="p-3">
            <PatternEditor
              title={t("editTitle", { key: row.key })}
              submitLabel={t("save")}
              initial={row}
              fixed
              onSubmit={async (_key, _locale, body) => {
                await adminSmsPatternsService.update(row.id, { ...body, baseVersion: row.version });
                setEditing(false);
                refresh();
              }}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}
function PatternEditor({
  title,
  submitLabel,
  initial,
  fixed = false,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  initial?: SmsPatternTemplate;
  fixed?: boolean;
  onSubmit: (key: string, locale: "fa" | "en", body: SmsPatternPayload) => Promise<void>;
}) {
  const t = useTranslations("adminSmsPatterns");
  const [key, setKey] = useState(initial?.key ?? "");
  const [locale, setLocale] = useState<"fa" | "en">(initial?.locale ?? "fa");
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [farazPatternCode, setFarazPatternCode] = useState(initial?.farazPatternCode ?? "");
  const [bodyAttributeKey, setBodyAttributeKey] = useState(initial?.bodyAttributeKey ?? "message");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const valid =
    keyPattern.test(key) &&
    displayName.trim().length > 0 &&
    /^[A-Za-z0-9_-]{1,128}$/.test(farazPatternCode.trim()) &&
    /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(bodyAttributeKey.trim());
  return (
    <Panel className="space-y-3">
      <PanelTitle title={title} hint={t("safeMetadata")} />
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          label={t("key")}
          dir="ltr"
          value={key}
          disabled={fixed || busy}
          onChange={(event) => setKey(event.target.value)}
        />
        <Select
          label={t("language")}
          value={locale}
          disabled={fixed || busy}
          onChange={(event) => setLocale(event.target.value as "fa" | "en")}
          options={[
            { value: "fa", label: "فارسی" },
            { value: "en", label: "English" },
          ]}
        />
        <Input
          label={t("name")}
          value={displayName}
          disabled={busy}
          maxLength={140}
          onChange={(event) => setDisplayName(event.target.value)}
        />
        <Input
          label={t("farazCode")}
          dir="ltr"
          value={farazPatternCode}
          disabled={busy}
          maxLength={128}
          onChange={(event) => setFarazPatternCode(event.target.value)}
        />
        <Input
          label={t("bodyAttribute")}
          dir="ltr"
          value={bodyAttributeKey}
          disabled={busy}
          maxLength={64}
          onChange={(event) => setBodyAttributeKey(event.target.value)}
        />
      </div>
      <label className="flex items-center gap-2 text-body">
        <input
          type="checkbox"
          checked={isActive}
          disabled={busy}
          onChange={(event) => setIsActive(event.target.checked)}
        />
        {t("active")}
      </label>
      {message ? (
        <p role="alert" className="text-state-urgent">
          {message}
        </p>
      ) : null}
      <Button
        disabled={!valid || busy}
        isLoading={busy}
        onClick={async () => {
          setBusy(true);
          setMessage(null);
          try {
            await onSubmit(key.trim(), locale, {
              displayName: displayName.trim(),
              farazPatternCode: farazPatternCode.trim(),
              bodyAttributeKey: bodyAttributeKey.trim(),
              isActive,
            });
            setMessage(t("saved"));
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
