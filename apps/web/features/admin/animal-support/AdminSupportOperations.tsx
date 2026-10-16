"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, EmptyState, ErrorRecovery, Input, Select, Skeleton } from "@petlife/ui";
import {
  CampaignFundType,
  RescueCaseStatus,
  SupportCampaignStatus,
  type AnimalSupportOrganizationDto,
  type DonationFundBalanceDto,
  type PaginatedDto,
  type RescueCaseDto,
  type SupportCampaignDto,
  type SupportCampaignUpdateDto,
} from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import { formatDay } from "@/lib/date/jalali";
import { LocalDateTimeField } from "@/features/shared/date-picker/LocalDateTimeField";
import {
  adminAnimalSupportService,
  type UpdateSupportOrganizationInput,
} from "@/services/admin-animal-support.service";
import { Panel, PanelTitle, DetailRow } from "../console-ui";
import { AdminAnimalSupportNav } from "./AdminAnimalSupportNav";
import { useSupportPermissions } from "./use-support-permissions";

/** Persian/Arabic digits are accepted, but money crosses the API as integer IRR. */
export function tomanToIrr(value: string): number | undefined {
  const ascii = value
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
    .trim();
  if (!/^\d+$/.test(ascii)) return undefined;
  const amount = Number(ascii) * 10;
  return Number.isSafeInteger(amount) && amount > 0 ? amount : undefined;
}

function useCopy() {
  const locale = useLocale() as "fa" | "en";
  const t = useTranslations("supportOps");
  return {
    t,
    locale,
    money: (v: number) => formatCurrency(v, locale),
    date: (v: string | null) => (v ? formatDay(v, locale) : t("unknown")),
  };
}

function Failure({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useCopy();
  if (error instanceof ApiError && error.status === 403) return <EmptyState title={t("forbidden")} />;
  if (error instanceof ApiError && error.status === 404) return <EmptyState title={t("notFound")} />;
  return <ErrorRecovery title={t("loadFailed")} message="" retryLabel={t("retry")} onRetry={retry} />;
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-4 break-words">
      <AdminAnimalSupportNav />
      {children}
    </div>
  );
}

function ConfirmAction({
  label,
  onRun,
  children,
  disabled = false,
}: {
  label: string;
  onRun: () => Promise<void>;
  children?: ReactNode;
  disabled?: boolean;
}) {
  const { t } = useCopy();
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [saved, setSaved] = useState(false);
  return (
    <div className="space-y-3">
      {children}
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy}
          onChange={(e) => {
            setConfirmed(e.target.checked);
            setSaved(false);
          }}
        />
        {t("confirmAction")}
      </label>
      {error && (
        <p role="alert" className="text-state-urgent">
          {t("saveFailed")}
        </p>
      )}
      {saved && <p role="status">{t("saved")}</p>}
      <Button
        disabled={!confirmed || disabled || busy}
        isLoading={busy}
        onClick={async () => {
          setBusy(true);
          setError(false);
          setSaved(false);
          try {
            await onRun();
            setConfirmed(false);
            setSaved(true);
          } catch {
            setError(true);
          } finally {
            setBusy(false);
          }
        }}
      >
        {label}
      </Button>
    </div>
  );
}

type Kind = "rescue-cases" | "campaigns";
const statuses = (kind: Kind): string[] =>
  kind === "rescue-cases" ? Object.values(RescueCaseStatus) : Object.values(SupportCampaignStatus);

export function AdminSupportOperationsList({ kind }: { kind: Kind }) {
  const { t, locale, money, date } = useCopy(),
    permissions = useSupportPermissions();
  const [status, setStatus] = useState(""),
    [organizationId, setOrganizationId] = useState(""),
    [page, setPage] = useState(1);
  const [rows, setRows] = useState<PaginatedDto<RescueCaseDto | SupportCampaignDto> | null>(null),
    [error, setError] = useState<unknown>(null),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!permissions.view) return;
    setLoading(true);
    setError(null);
    try {
      setRows(
        await (
          kind === "rescue-cases"
            ? adminAnimalSupportService.listRescueCases
            : adminAnimalSupportService.listCampaigns
        )({
          status: status || undefined,
          organizationId: organizationId || undefined,
          page,
          pageSize: 20,
        }),
      );
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [kind, status, organizationId, page, permissions.view]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <Frame>
      <h1 className="text-page-title">{t(kind === "rescue-cases" ? "rescues" : "campaigns")}</h1>
      {!permissions.view ? (
        <EmptyState title={t("forbidden")} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label={t("status")}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              options={[
                { value: "", label: t("all") },
                ...statuses(kind).map((value) => ({ value, label: t(`statuses.${value}`) })),
              ]}
            />
            <OrganizationPicker
              value={organizationId}
              onChange={(value) => {
                setOrganizationId(value);
                setPage(1);
              }}
              all
            />
          </div>
          {error ? (
            <Failure error={error} retry={load} />
          ) : loading ? (
            <Skeleton className="h-40 w-full" aria-label={t("loading")} />
          ) : (
            rows && (
              <>
                <div className="grid gap-3 lg:grid-cols-2">
                  {rows.items.length === 0 ? (
                    <EmptyState title={t("empty")} />
                  ) : (
                    rows.items.map((row) => (
                      <Panel key={row.id}>
                        <Link
                          className="text-section-title text-brand-natural underline"
                          href={`/${locale}/admin/animal-support/${kind}/${row.id}`}
                        >
                          {row.title}
                        </Link>
                        <p>{row.organizationName}</p>
                        <DetailRow label={t("status")}>{t(`statuses.${row.status}`)}</DetailRow>
                        <DetailRow label={t("created")}>{date(row.createdAt)}</DetailRow>
                        <DetailRow label={t("amount")}>
                          {"raisedAmountIrr" in row
                            ? money(row.raisedAmountIrr)
                            : row.estimatedNeedIrr === null
                              ? t("unknown")
                              : money(row.estimatedNeedIrr)}
                        </DetailRow>
                      </Panel>
                    ))
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    {t("previous")}
                  </Button>
                  <span>{t("page", { page, total: rows.total })}</span>
                  <Button
                    variant="secondary"
                    disabled={page * rows.pageSize >= rows.total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {t("next")}
                  </Button>
                </div>
              </>
            )
          )}
          {permissions.manage && <CreateSupportRecord kind={kind} onCreated={load} />}
        </>
      )}
    </Frame>
  );
}

function OrganizationPicker({
  value,
  onChange,
  all = false,
}: {
  value: string;
  onChange: (value: string) => void;
  all?: boolean;
}) {
  const { t } = useCopy();
  const [rows, setRows] = useState<Array<{ id: string; name: string }>>([]),
    [page, setPage] = useState(1),
    [more, setMore] = useState(false),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    setBusy(true);
    setError(false);
    adminAnimalSupportService
      .listOrganizations({ page, pageSize: 100 })
      .then((result) => {
        if (alive) {
          setRows((prev) =>
            page === 1
              ? result.items
              : [...prev, ...result.items.filter((item) => !prev.some((p) => p.id === item.id))],
          );
          setMore(page * result.pageSize < result.total);
        }
      })
      .catch(() => {
        if (alive) setError(true);
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [page, revision]);
  return (
    <div className="space-y-2">
      <Select
        label={t("organization")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        options={[
          { value: "", label: t(all ? "all" : "chooseOrganization") },
          ...rows.map((row) => ({ value: row.id, label: row.name })),
        ]}
      />
      {busy && <p role="status">{t("loading")}</p>}
      {error && (
        <div role="alert">
          {t("loadFailed")}{" "}
          <Button variant="secondary" onClick={() => setRevision((v) => v + 1)}>
            {t("retry")}
          </Button>
        </div>
      )}
      {more && !busy && !error && (
        <Button variant="secondary" onClick={() => setPage((v) => v + 1)}>
          {t("moreOrganizations")}
        </Button>
      )}
    </div>
  );
}

function CreateSupportRecord({ kind, onCreated }: { kind: Kind; onCreated: () => Promise<void> }) {
  const { t, locale } = useCopy();
  const [org, setOrg] = useState(""),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [amount, setAmount] = useState(""),
    [fund, setFund] = useState(CampaignFundType.GENERAL),
    [animal, setAnimal] = useState(""),
    [location, setLocation] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const parsed = amount ? tomanToIrr(amount) : undefined;
  const validDates =
    (!start || Number.isFinite(new Date(start).getTime())) &&
    (!end || Number.isFinite(new Date(end).getTime())) &&
    (!start || !end || new Date(end) > new Date(start));
  return (
    <Panel>
      <PanelTitle title={t(kind === "rescue-cases" ? "createRescue" : "createCampaign")} />
      <div className="space-y-3">
        <OrganizationPicker value={org} onChange={setOrg} />
        <Input label={t("title")} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} />
        <label className="block">
          {t("description")}
          <textarea
            className="mt-1 block min-h-28 w-full rounded-md border border-border-subtle bg-surface-elevated p-3"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <Input
          label={t(kind === "rescue-cases" ? "estimatedToman" : "targetToman")}
          inputMode="numeric"
          dir="ltr"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        {kind === "rescue-cases" ? (
          <>
            <Input label={t("animalType")} value={animal} onChange={(e) => setAnimal(e.target.value)} />
            <Input label={t("location")} value={location} onChange={(e) => setLocation(e.target.value)} />
          </>
        ) : (
          <>
            <Select
              label={t("fundType")}
              value={fund}
              onChange={(e) => setFund(e.target.value as CampaignFundType)}
              options={Object.values(CampaignFundType).map((value) => ({
                value,
                label: t(`funds.${value}`),
              }))}
            />
            <p>{t("immutableFund")}</p>
            <LocalDateTimeField label={t("start")} value={start} onChange={setStart} />
            <LocalDateTimeField label={t("end")} value={end} onChange={setEnd} />
            {!validDates && <p role="alert">{t("invalidDates")}</p>}
          </>
        )}
        <ConfirmAction
          label={t("create")}
          disabled={
            !org || !title.trim() || !description.trim() || (!!amount && !parsed) || !validDates || !!created
          }
          onRun={async () => {
            const common = { title: title.trim(), description: description.trim() };
            const result =
              kind === "rescue-cases"
                ? await adminAnimalSupportService.createRescueCase(org, {
                    ...common,
                    ...(animal.trim() ? { animalType: animal.trim() } : {}),
                    ...(location.trim() ? { location: location.trim() } : {}),
                    ...(parsed !== undefined ? { estimatedNeedIrr: parsed } : {}),
                  })
                : await adminAnimalSupportService.createCampaign(org, {
                    ...common,
                    fundType: fund,
                    ...(parsed !== undefined ? { targetAmountIrr: parsed } : {}),
                    ...(start ? { startsAt: new Date(start).toISOString() } : {}),
                    ...(end ? { endsAt: new Date(end).toISOString() } : {}),
                  });
            setCreated(result.id);
            await onCreated();
          }}
        />
        {created && (
          <Link
            className="text-brand-natural underline"
            href={`/${locale}/admin/animal-support/${kind}/${created}`}
          >
            {t("openCreated")}
          </Link>
        )}
      </div>
    </Panel>
  );
}

export function AdminRescueDetail({ id }: { id: string }) {
  const { t, locale, money, date } = useCopy(),
    permissions = useSupportPermissions();
  const [row, setRow] = useState<RescueCaseDto | null>(null),
    [error, setError] = useState<unknown>(null),
    [status, setStatus] = useState(RescueCaseStatus.OPEN);
  const load = useCallback(async () => {
    if (!permissions.view) return;
    setError(null);
    try {
      const result = await adminAnimalSupportService.getRescueCase(id);
      setRow(result);
      setStatus(result.status);
    } catch (e) {
      setError(e);
    }
  }, [id, permissions.view]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <Frame>
      {!permissions.view ? (
        <EmptyState title={t("forbidden")} />
      ) : error ? (
        <Failure error={error} retry={load} />
      ) : !row ? (
        <Skeleton className="h-40 w-full" aria-label={t("loading")} />
      ) : (
        <>
          <h1 className="text-page-title">{row.title}</h1>
          <Panel>
            <p className="whitespace-pre-wrap">{row.description}</p>
            <DetailRow label={t("organization")}>
              <Link
                className="underline"
                href={`/${locale}/admin/animal-support/organizations/${row.organizationId}`}
              >
                {row.organizationName}
              </Link>
            </DetailRow>
            <DetailRow label={t("status")}>{t(`statuses.${row.status}`)}</DetailRow>
            <DetailRow label={t("animalType")}>{row.animalType ?? t("unknown")}</DetailRow>
            <DetailRow label={t("location")}>{row.location ?? t("unknown")}</DetailRow>
            <DetailRow label={t("estimatedToman")}>
              {row.estimatedNeedIrr === null ? t("unknown") : money(row.estimatedNeedIrr)}
            </DetailRow>
            <DetailRow label={t("created")}>{date(row.createdAt)}</DetailRow>
            <DetailRow label={t("closed")}>{date(row.closedAt)}</DetailRow>
            <h2 className="mt-4 text-section-title">{t("evidence")}</h2>
            {row.evidenceUrls.length ? (
              row.evidenceUrls.map((url, i) => (
                <a className="block underline" key={url} href={url} target="_blank" rel="noopener noreferrer">
                  {t("evidenceNumber", { number: i + 1 })}
                </a>
              ))
            ) : (
              <p>{t("noEvidence")}</p>
            )}
          </Panel>
          {permissions.manage && <RescueEvidenceForm id={id} onSaved={setRow} />}
          {permissions.manage && (
            <Panel>
              <Select
                label={t("newStatus")}
                value={status}
                onChange={(e) => setStatus(e.target.value as RescueCaseStatus)}
                options={Object.values(RescueCaseStatus).map((value) => ({
                  value,
                  label: t(`statuses.${value}`),
                }))}
              />
              <ConfirmAction
                label={t("saveStatus")}
                disabled={status === row.status}
                onRun={async () => {
                  setRow(await adminAnimalSupportService.setRescueStatus(id, status));
                }}
              />
            </Panel>
          )}
        </>
      )}
    </Frame>
  );
}

export function AdminCampaignDetail({ id }: { id: string }) {
  const { t, locale, money, date } = useCopy(),
    permissions = useSupportPermissions();
  const [row, setRow] = useState<SupportCampaignDto | null>(null),
    [error, setError] = useState<unknown>(null),
    [status, setStatus] = useState(SupportCampaignStatus.DRAFT);
  const [updates, setUpdates] = useState<SupportCampaignUpdateDto[] | null>(null),
    [updatesError, setUpdatesError] = useState<unknown>(null),
    [share, setShare] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!permissions.view) return;
    setError(null);
    try {
      const result = await adminAnimalSupportService.getCampaign(id);
      setRow(result);
      setStatus(result.status);
    } catch (e) {
      setError(e);
    }
  }, [id, permissions.view]);
  const loadUpdates = useCallback(async () => {
    if (!permissions.view) return;
    setUpdatesError(null);
    try {
      setUpdates(await adminAnimalSupportService.listCampaignUpdates(id));
    } catch (e) {
      setUpdatesError(e);
    }
  }, [id, permissions.view]);
  useEffect(() => {
    void load();
    void loadUpdates();
  }, [load, loadUpdates]);
  return (
    <Frame>
      {!permissions.view ? (
        <EmptyState title={t("forbidden")} />
      ) : error ? (
        <Failure error={error} retry={load} />
      ) : !row ? (
        <Skeleton className="h-40 w-full" aria-label={t("loading")} />
      ) : (
        <>
          <h1 className="text-page-title">{row.title}</h1>
          <Panel>
            <p className="whitespace-pre-wrap">{row.description}</p>
            <DetailRow label={t("organization")}>
              <Link
                className="underline"
                href={`/${locale}/admin/animal-support/organizations/${row.organizationId}`}
              >
                {row.organizationName}
              </Link>
            </DetailRow>
            <DetailRow label={t("status")}>{t(`statuses.${row.status}`)}</DetailRow>
            <DetailRow label={t("fundType")}>{t(`funds.${row.fundType}`)}</DetailRow>
            <DetailRow label={t("raised")}>{money(row.raisedAmountIrr)}</DetailRow>
            <DetailRow label={t("targetToman")}>
              {row.targetAmountIrr === null ? t("unknown") : money(row.targetAmountIrr)}
            </DetailRow>
            <DetailRow label={t("start")}>{date(row.startsAt)}</DetailRow>
            <DetailRow label={t("end")}>{date(row.endsAt)}</DetailRow>
            {row.rescueCaseId && (
              <Link
                className="underline"
                href={`/${locale}/admin/animal-support/rescue-cases/${row.rescueCaseId}`}
              >
                {t("linkedRescue")}
              </Link>
            )}
          </Panel>
          {permissions.manage && (
            <Panel>
              <Select
                label={t("newStatus")}
                value={status}
                onChange={(e) => setStatus(e.target.value as SupportCampaignStatus)}
                options={Object.values(SupportCampaignStatus).map((value) => ({
                  value,
                  label: t(`statuses.${value}`),
                }))}
              />
              <ConfirmAction
                label={t("saveStatus")}
                disabled={status === row.status}
                onRun={async () => {
                  setRow(await adminAnimalSupportService.setCampaignStatus(id, status));
                }}
              />
              <div className="mt-5">
                <ConfirmAction
                  label={t("share")}
                  disabled={!!share}
                  onRun={async () => {
                    const post = await adminAnimalSupportService.shareCampaign(id);
                    setShare(post.id);
                  }}
                />
                {share && (
                  <Link className="underline" href={`/${locale}/community/posts/${share}`}>
                    {t("openPost")}
                  </Link>
                )}
              </div>
            </Panel>
          )}
          <Panel>
            <PanelTitle title={t("updates")} />
            {updatesError ? (
              <Failure error={updatesError} retry={loadUpdates} />
            ) : !updates ? (
              <Skeleton className="h-20 w-full" aria-label={t("loading")} />
            ) : updates.length === 0 ? (
              <p>{t("noUpdates")}</p>
            ) : (
              updates.map((update) => (
                <article key={update.id} className="space-y-2 border-b border-border-subtle py-3">
                  <h3 className="font-bold">{update.title}</h3>
                  <p className="whitespace-pre-wrap">{update.body}</p>
                  <time>{date(update.createdAt)}</time>
                  {update.evidenceUrls.map((url, index) => (
                    <a
                      className="block underline"
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("evidenceNumber", { number: index + 1 })}
                    </a>
                  ))}
                </article>
              ))
            )}
          </Panel>
          {permissions.manage && (
            <CampaignUpdateForm
              id={id}
              onCreated={async (update) => {
                setUpdates((prev) => [update, ...(prev ?? [])]);
              }}
            />
          )}
        </>
      )}
    </Frame>
  );
}

function CampaignUpdateForm({
  id,
  onCreated,
}: {
  id: string;
  onCreated: (update: SupportCampaignUpdateDto) => Promise<void>;
}) {
  const { t } = useCopy();
  const [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [uploaded, setUploaded] = useState<{ key: string; file: File } | null>(null),
    [fileRevision, setFileRevision] = useState(0);
  const validFile =
    !file ||
    (["image/jpeg", "image/png", "image/webp"].includes(file.type) &&
      file.size > 0 &&
      file.size <= 10 * 1024 * 1024);
  return (
    <Panel>
      <PanelTitle title={t("postUpdate")} />
      <div className="space-y-3">
        <Input label={t("title")} value={title} onChange={(e) => setTitle(e.target.value)} />
        <label className="block">
          {t("updateBody")}
          <textarea
            className="mt-1 block min-h-28 w-full rounded-md border border-border-subtle bg-surface-elevated p-3"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <Input
          key={fileRevision}
          type="file"
          label={t("publicEvidence")}
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setUploaded(null);
          }}
        />
        <p>{t("publicEvidenceHint")}</p>
        {!validFile && <p role="alert">{t("invalidFile")}</p>}
        <ConfirmAction
          label={t("postUpdate")}
          disabled={!title.trim() || !body.trim() || !validFile}
          onRun={async () => {
            let key = uploaded?.file === file ? uploaded.key : undefined;
            if (file && !key) {
              const target = await adminAnimalSupportService.campaignEvidenceUpload(id, file.type, file.size);
              const response = await fetch(target.uploadUrl, {
                method: "PUT",
                headers: target.headers,
                body: file,
                credentials: "omit",
              });
              if (!response.ok) throw new Error("Upload failed");
              key = target.key;
              setUploaded({ key, file });
            }
            const result = await adminAnimalSupportService.postCampaignUpdate(id, {
              title: title.trim(),
              body: body.trim(),
              ...(key ? { evidenceObjectKeys: [key] } : {}),
            });
            await onCreated(result);
            setTitle("");
            setBody("");
            setFile(null);
            setUploaded(null);
            setFileRevision((value) => value + 1);
          }}
        />
      </div>
    </Panel>
  );
}

export function AdminOrganizationFunds({ organizationId }: { organizationId: string }) {
  const { t, money } = useCopy(),
    permissions = useSupportPermissions();
  const [balance, setBalance] = useState<DonationFundBalanceDto | null>(null),
    [error, setError] = useState<unknown>(null),
    [amount, setAmount] = useState(""),
    [reason, setReason] = useState(""),
    [fund, setFund] = useState(CampaignFundType.GENERAL),
    [uncertain, setUncertain] = useState(false),
    [recorded, setRecorded] = useState(false);
  const load = useCallback(async () => {
    if (!permissions.view) return;
    setError(null);
    try {
      setBalance(await adminAnimalSupportService.getFundBalance(organizationId));
    } catch (e) {
      setError(e);
    }
  }, [organizationId, permissions.view]);
  useEffect(() => {
    void load();
  }, [load]);
  const parsed = tomanToIrr(amount),
    available = balance
      ? fund === CampaignFundType.GENERAL
        ? balance.generalAvailableIrr
        : balance.restrictedAvailableIrr
      : 0;
  if (!permissions.view) return null;
  return (
    <Panel>
      <PanelTitle title={t("organizationFunds")} />
      {error ? (
        <Failure error={error} retry={load} />
      ) : !balance ? (
        <Skeleton className="h-20 w-full" aria-label={t("loading")} />
      ) : (
        <>
          <DetailRow label={t("funds.GENERAL")}>{money(balance.generalAvailableIrr)}</DetailRow>
          <DetailRow label={t("funds.RESTRICTED")}>{money(balance.restrictedAvailableIrr)}</DetailRow>
          <Button variant="secondary" onClick={() => void load()}>
            {t("refreshBalance")}
          </Button>
          {permissions.payout && (
            <div className="mt-4 space-y-3">
              <h3 className="text-section-title">{t("recordPayout")}</h3>
              <p>{t("payoutHint")}</p>
              <Select
                label={t("fundType")}
                value={fund}
                onChange={(e) => setFund(e.target.value as CampaignFundType)}
                options={Object.values(CampaignFundType).map((value) => ({
                  value,
                  label: t(`funds.${value}`),
                }))}
              />
              <Input
                label={t("amountToman")}
                inputMode="numeric"
                dir="ltr"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <Input label={t("reason")} value={reason} onChange={(e) => setReason(e.target.value)} />
              {uncertain && <p role="alert">{t("payoutUncertain")}</p>}
              {recorded && <p role="status">{t("payoutRecorded")}</p>}
              <ConfirmAction
                label={t("recordPayout")}
                disabled={uncertain || recorded || !parsed || parsed > available || reason.trim().length < 5}
                onRun={async () => {
                  if (!parsed) return;
                  try {
                    await adminAnimalSupportService.recordPayout(organizationId, {
                      amountIrr: parsed,
                      fundType: fund,
                      reason: reason.trim(),
                    });
                  } catch (e) {
                    if (!(e instanceof ApiError) || e.status >= 500) setUncertain(true);
                    throw e;
                  }
                  setRecorded(true);
                  await load();
                }}
              />
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

export function AdminSupportOrganizationEditor({
  organization,
  onSaved,
}: {
  organization: AnimalSupportOrganizationDto;
  onSaved: (org: AnimalSupportOrganizationDto) => void;
}) {
  const { t } = useCopy();
  const [draft, setDraft] = useState({
    name: organization.name,
    description: organization.description ?? "",
    location: organization.location ?? "",
    contactEmail: organization.contactEmail ?? "",
    contactPhone: organization.contactPhone ?? "",
  });
  const [logo, setLogo] = useState<File | null>(null),
    [uploadedLogo, setUploadedLogo] = useState<string | null>(null),
    [logoRevision, setLogoRevision] = useState(0);
  const validLogo =
    !logo ||
    (["image/jpeg", "image/png", "image/webp"].includes(logo.type) &&
      logo.size > 0 &&
      logo.size <= 10 * 1024 * 1024);
  const fields = ["name", "description", "location", "contactEmail", "contactPhone"] as const;
  const changed = fields.some((field) => draft[field] !== (organization[field] ?? ""));
  const validEmail = !draft.contactEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.contactEmail);
  return (
    <Panel>
      <PanelTitle title={t("editOrganization")} />
      <div className="space-y-3">
        {fields.map((field) => (
          <Input
            key={field}
            label={t(`orgFields.${field}`)}
            value={draft[field]}
            dir={field === "contactEmail" || field === "contactPhone" ? "ltr" : "auto"}
            onChange={(event) => setDraft((prev) => ({ ...prev, [field]: event.target.value }))}
          />
        ))}
        <Input
          key={logoRevision}
          type="file"
          label={t("organizationLogo")}
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            setLogo(event.target.files?.[0] ?? null);
            setUploadedLogo(null);
          }}
        />
        {logo && !validLogo && <p role="alert">{t("invalidFile")}</p>}
        <p>{t("clearOptional")}</p>
        <ConfirmAction
          label={t("saveOrganization")}
          disabled={(!changed && !logo) || !draft.name.trim() || !validEmail || !validLogo}
          onRun={async () => {
            const patch: UpdateSupportOrganizationInput = {};
            for (const field of fields) {
              if (draft[field] !== (organization[field] ?? "")) {
                if (field === "name") patch.name = draft.name.trim();
                else patch[field] = draft[field].trim() || null;
              }
            }
            if (logo) {
              let key = uploadedLogo;
              if (!key) {
                const target = await adminAnimalSupportService.organizationLogoUpload(
                  organization.id,
                  logo.type,
                  logo.size,
                );
                const response = await fetch(target.uploadUrl, {
                  method: "PUT",
                  headers: target.headers,
                  body: logo,
                  credentials: "omit",
                });
                if (!response.ok) throw Error("Upload failed");
                key = target.key;
                setUploadedLogo(key);
              }
              patch.logoObjectKey = key;
            }
            onSaved(await adminAnimalSupportService.updateOrganization(organization.id, patch));
            setLogo(null);
            setUploadedLogo(null);
            setLogoRevision((value) => value + 1);
          }}
        />
      </div>
    </Panel>
  );
}

function RescueEvidenceForm({ id, onSaved }: { id: string; onSaved: (row: RescueCaseDto) => void }) {
  const { t } = useCopy();
  const [file, setFile] = useState<File | null>(null),
    [key, setKey] = useState<string | null>(null),
    [revision, setRevision] = useState(0);
  const valid =
    file &&
    ["image/jpeg", "image/png", "image/webp"].includes(file.type) &&
    file.size > 0 &&
    file.size <= 10 * 1024 * 1024;
  return (
    <Panel>
      <PanelTitle title={t("attachEvidence")} />
      <Input
        key={revision}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        label={t("publicEvidence")}
        onChange={(event) => {
          setFile(event.target.files?.[0] ?? null);
          setKey(null);
        }}
      />
      <p>{t("publicEvidenceHint")}</p>
      {file && !valid && <p role="alert">{t("invalidFile")}</p>}
      <ConfirmAction
        label={t("attachEvidence")}
        disabled={!valid}
        onRun={async () => {
          if (!file) return;
          let objectKey = key;
          if (!objectKey) {
            const target = await adminAnimalSupportService.rescueEvidenceUpload(id, file.type, file.size);
            const response = await fetch(target.uploadUrl, {
              method: "PUT",
              body: file,
              headers: target.headers,
              credentials: "omit",
            });
            if (!response.ok) throw Error("Upload failed");
            objectKey = target.key;
            setKey(objectKey);
          }
          onSaved(await adminAnimalSupportService.registerRescueEvidence(id, [objectKey]));
          setFile(null);
          setKey(null);
          setRevision((v) => v + 1);
        }}
      />
    </Panel>
  );
}
