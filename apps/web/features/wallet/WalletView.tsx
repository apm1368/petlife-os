"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { BusinessWalletDto, WalletEntryDto, WalletSummaryDto, WalletTopUpDto, WalletTopUpRailValue, WalletTopUpStartedDto } from "@petlife/types";
import { Button, Check, EmptyState, Input, Skeleton } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import type { RouteLocale } from "@/lib/i18n/config";
import { businessWalletService, businessWalletsService, walletService } from "@/services/wallet.service";
import { SystemState } from "@/features/system/SystemState";
import { SponsoredCampaignsPanel } from "@/features/sponsored/SponsoredCampaignsPanel";
import { AccountPageHeader } from "@/features/account/AccountNav";
import { formatAccountDate } from "@/features/account/account-copy";
import "./wallet.css";

const OPEN: WalletTopUpDto["status"][] = ["AWAITING_PAYMENT", "AWAITING_RECEIPT", "REVIEW_PENDING"];
const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp"];
const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

/** Persian and Arabic-Indic digits are typed as often as Latin ones; amounts are entered in Toman. */
export function parseToman(raw: string): number | null {
  const latin = raw
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[,\s٬،.]/g, "");
  if (!/^\d{1,12}$/.test(latin)) return null;
  return Number(latin);
}

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * The member's wallet: what they hold (two buckets), how to add money, open top-up requests and every movement.
 * Money only appears after it is confirmed (gateway verify or a finance-approved receipt); the page says so plainly.
 */
export function WalletView({ accountId }: { accountId?: string } = {}) {
  const t = useTranslations("wallet");
  // A business wallet (accountId) uses the same page; only where its balance, history and new top-ups come from differ.
  const api = useMemo(() => (accountId ? businessWalletService(accountId) : walletService), [accountId]);
  const [business, setBusiness] = useState<BusinessWalletDto[]>([]);
  const locale = useLocale() as RouteLocale;
  const money = useCallback((rial: number) => formatCurrency(rial, locale), [locale]);
  const [summary, setSummary] = useState<WalletSummaryDto | null>(null);
  const [topUps, setTopUps] = useState<WalletTopUpDto[]>([]);
  const [entries, setEntries] = useState<WalletEntryDto[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState<WalletTopUpStartedDto | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "info" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [s, list, page] = await Promise.all([api.summary(), api.topUps(), api.entries()]);
      setSummary(s);
      setTopUps(list);
      setEntries(page.items);
      setCursor(page.nextCursor);
    } catch {
      setFailed(true);
    }
    // The member's own wallet also lists the business wallets they manage (never fatal if it fails).
    if (!accountId) businessWalletsService.list().then(setBusiness).catch(() => setBusiness([]));
  }, [api, accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Back from the bank gateway: Zibal appends ?trackId=…; settle it once, then clean the address bar.
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const verified = useRef(false);
  useEffect(() => {
    const trackId = params?.get("trackId");
    if (!trackId || verified.current) return;
    verified.current = true;
    setNotice({ tone: "info", text: t("return.verifying") });
    walletService
      .verifyZibal(trackId)
      .then((row) => {
        if (row.status === "CREDITED") setNotice({ tone: "success", text: t("return.credited", { amount: money(row.receivedAmount ?? row.amount) }) });
        else if (row.status === "AWAITING_PAYMENT") setNotice({ tone: "info", text: t("return.unknown") });
        else setNotice({ tone: "error", text: t("return.failed") });
      })
      .catch(() => setNotice({ tone: "info", text: t("return.unknown") }))
      .finally(() => {
        router.replace(pathname ?? "/profile/wallet");
        void load();
      });
  }, [params, router, pathname, t, money, load]);

  async function loadMore() {
    if (!cursor) return;
    try {
      const page = await api.entries(cursor);
      setEntries((current) => [...(current ?? []), ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      setFailed(true);
    }
  }

  if (failed && !summary) return <SystemState kind="GENERIC_RETRYABLE_ERROR" title={t("failed")} onRetry={() => void load()} />;

  const open = topUps.filter((row) => OPEN.includes(row.status));
  const closed = topUps.filter((row) => !OPEN.includes(row.status)).slice(0, 5);

  return (
    <div className="wallet-page">
      {summary?.owner ? (
        <AccountPageHeader eyebrow={t("business.eyebrow")} title={t("business.title", { name: summary.owner.name })} description={t("business.description")} />
      ) : (
        <AccountPageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />
      )}
      {accountId ? (
        <p className="wallet-back">
          <Link href={`/${locale}/profile/wallet`}>{t("business.back")}</Link>
        </p>
      ) : null}
      {notice ? (
        <p role={notice.tone === "error" ? "alert" : "status"} className={`wallet-notice wallet-notice--${notice.tone}`}>
          {notice.text}
        </p>
      ) : null}

      {!summary ? (
        <div className="wallet-balance" aria-busy="true" aria-label={t("loading")}>
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <section className="wallet-balance" aria-labelledby="wallet-total">
          <div className="wallet-balance__total">
            <span id="wallet-total">{t("balance.total")}</span>
            <strong>{money(summary.balances.total)}</strong>
          </div>
          <div className="wallet-balance__parts">
            <div>
              <span>{t("balance.purchaseOnly")}</span>
              <strong>{money(summary.balances.purchaseOnly)}</strong>
              <small>{t("balance.purchaseOnlyHint")}</small>
            </div>
            <div>
              <span>{t("balance.withdrawable")}</span>
              <strong>{money(summary.balances.withdrawable)}</strong>
              <small>{t("balance.withdrawableHint")}</small>
            </div>
          </div>
          {summary.expiringSoon.map((e) => (
            <p key={e.expiresAt} className="wallet-balance__expiring">
              {t("balance.expiring", { amount: money(e.amount), date: formatAccountDate(e.expiresAt, locale) })}
            </p>
          ))}
        </section>
      )}

      {summary ? (
        active?.cardTransfer ? (
          <CardTransferPanel
            started={active}
            onDone={(row, message) => {
              setActive(null);
              setNotice(message);
              setTopUps((list) => list.map((r) => (r.id === row.id ? row : r)));
            }}
            onClose={() => setActive(null)}
          />
        ) : (
          <TopUpForm
            summary={summary}
            startTopUp={api.startTopUp}
            onStarted={(started) => {
              setTopUps((list) => [started.topUp, ...list.filter((r) => r.id !== started.topUp.id)]);
              if (started.redirectUrl) {
                setNotice({ tone: "info", text: t("topUp.redirecting") });
                window.location.assign(started.redirectUrl);
              } else {
                setActive(started);
              }
            }}
          />
        )
      ) : null}

      {/* A business wallet also runs the organisation's sponsored listings (paid per click from this wallet). */}
      {accountId && summary?.owner ? <SponsoredCampaignsPanel accountId={accountId} /> : null}

      {open.length || closed.length ? (
        <section aria-labelledby="wallet-requests" className="wallet-section">
          <div className="account-section-title">
            <h2 id="wallet-requests">{t("requests.title")}</h2>
          </div>
          <ul className="wallet-requests">
            {[...open, ...closed].map((row) => (
              <TopUpRow
                key={row.id}
                row={row}
                onShowCard={async () => {
                  try {
                    setActive(await walletService.topUp(row.id));
                  } catch {
                    setNotice({ tone: "error", text: t("topUp.errors.generic") });
                  }
                }}
                onCancel={async () => {
                  try {
                    const updated = await walletService.cancel(row.id);
                    setTopUps((list) => list.map((r) => (r.id === row.id ? updated : r)));
                    setNotice({ tone: "info", text: t("requests.cancelled") });
                  } catch {
                    setNotice({ tone: "error", text: t("topUp.errors.generic") });
                  }
                }}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {!accountId && business.length ? (
        <section aria-labelledby="wallet-business" className="wallet-section">
          <div className="account-section-title">
            <h2 id="wallet-business">{t("business.listTitle")}</h2>
          </div>
          <p className="wallet-business__hint">{t("business.listHint")}</p>
          <ul className="wallet-business">
            {business.map((w) => (
              <li key={w.owner.walletAccountId}>
                <Link href={`/${locale}/profile/wallet/business/${w.owner.walletAccountId}`}>
                  <strong>{w.owner.name}</strong>
                  <small>{t(`business.kind.${w.owner.type}`)}</small>
                </Link>
                <span className="wallet-amount" dir="ltr">
                  {money(w.balances.total)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="wallet-history" className="wallet-section">
        <div className="account-section-title">
          <h2 id="wallet-history">{t("history.title")}</h2>
        </div>
        {entries === null ? (
          <Skeleton className="h-16 w-full" />
        ) : entries.length === 0 ? (
          <EmptyState title={t("history.empty")} />
        ) : (
          <>
            <ul className="wallet-history">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <div>
                    <strong>{t(`history.purpose.${entry.purpose}`)}</strong>
                    <small>
                      {t(`history.bucket.${entry.balanceType}`)}
                      {entry.note ? ` · ${t.has(`history.reasons.${entry.note}`) ? t(`history.reasons.${entry.note}`) : ""}` : ""}
                      {" · "}
                      {formatAccountDate(entry.createdAt, locale, true)}
                    </small>
                  </div>
                  <span className={entry.signedAmount >= 0 ? "wallet-amount wallet-amount--in" : "wallet-amount wallet-amount--out"} dir="ltr">
                    {entry.signedAmount >= 0 ? "+" : "−"}
                    {money(Math.abs(entry.signedAmount))}
                  </span>
                </li>
              ))}
            </ul>
            {cursor ? (
              <Button variant="secondary" onClick={() => void loadMore()}>
                {t("history.more")}
              </Button>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

function TopUpForm({
  summary,
  startTopUp,
  onStarted,
}: {
  summary: WalletSummaryDto;
  startTopUp: (input: { amount: number; rail: WalletTopUpRailValue; locale: string }, idempotencyKey: string) => Promise<WalletTopUpStartedDto>;
  onStarted: (started: WalletTopUpStartedDto) => void;
}) {
  const t = useTranslations("wallet");
  const locale = useLocale() as RouteLocale;
  const { rails, minAmount, maxAmount, presets } = summary.topUp;
  const [amountText, setAmountText] = useState(String(presets[1] ? presets[1] / 10 : minAmount / 10));
  const [rail, setRail] = useState<WalletTopUpRailValue | null>(rails[0] ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newKey());
  const range = { min: formatCurrency(minAmount, locale), max: formatCurrency(maxAmount, locale) };

  if (!rails.length) {
    return (
      <section className="wallet-section wallet-topup wallet-topup--closed" aria-labelledby="wallet-topup">
        <h2 id="wallet-topup">{t("topUp.unavailableTitle")}</h2>
        <p>{t("topUp.unavailableBody")}</p>
      </section>
    );
  }

  const toman = parseToman(amountText);
  const rial = toman === null ? null : toman * 10;
  const valid = rial !== null && rial >= minAmount && rial <= maxAmount;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || !rail || rial === null) {
      setError(t("topUp.errors.OUT_OF_RANGE", range));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onStarted(await startTopUp({ amount: rial, rail, locale }, key.current));
      key.current = newKey();
    } catch (err) {
      const reason = err instanceof ApiError ? String((err.details as { reason?: string } | undefined)?.reason ?? "") : "";
      setError(t.has(`topUp.errors.${reason}`) ? t(`topUp.errors.${reason}`, range) : t("topUp.errors.generic"));
      key.current = newKey();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="wallet-section wallet-topup" aria-labelledby="wallet-topup" onSubmit={submit} noValidate>
      <h2 id="wallet-topup">{t("topUp.title")}</h2>
      <div className="wallet-presets" role="group" aria-label={t("topUp.amountLabel")}>
        {presets.map((preset) => (
          <button key={preset} type="button" aria-pressed={rial === preset} onClick={() => setAmountText(String(preset / 10))}>
            {formatCurrency(preset, locale)}
          </button>
        ))}
      </div>
      <Input
        label={t("topUp.amountLabel")}
        inputMode="numeric"
        value={amountText}
        onChange={(e) => setAmountText(e.target.value)}
        hint={t("topUp.amountHint", range)}
        errorMessage={amountText && !valid ? t("topUp.errors.OUT_OF_RANGE", range) : undefined}
      />
      <fieldset className="wallet-rails">
        <legend>{t("topUp.railLabel")}</legend>
        {rails.map((value) => (
          <label key={value} className={rail === value ? "is-selected" : undefined}>
            <input type="radio" name="wallet-rail" value={value} checked={rail === value} onChange={() => setRail(value)} />
            <span>{t(`topUp.rails.${value}`)}</span>
          </label>
        ))}
      </fieldset>
      {error ? (
        <p role="alert" className="wallet-error">
          {error}
        </p>
      ) : null}
      <Button type="submit" isLoading={busy} disabled={!valid || !rail}>
        {busy ? t("topUp.submitting") : t("topUp.submit")}
      </Button>
    </form>
  );
}

function CardTransferPanel({
  started,
  onDone,
  onClose,
}: {
  started: WalletTopUpStartedDto;
  onDone: (row: WalletTopUpDto, notice: { tone: "success" | "error" | "info"; text: string }) => void;
  onClose: () => void;
}) {
  const t = useTranslations("wallet");
  const locale = useLocale() as RouteLocale;
  const [copied, setCopied] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const card = started.cardTransfer!;
  const deadline = started.topUp.receiptDeadlineAt;
  const fileProblem = useMemo(() => {
    if (!file) return null;
    if (!RECEIPT_TYPES.includes(file.type) || file.size > RECEIPT_MAX_BYTES) return t("receipt.hint");
    return null;
  }, [file, t]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(card.cardNumber.replace(/-/g, ""));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard can be blocked; the number stays visible to copy by hand. */
    }
  }

  async function send() {
    if (!file || fileProblem) return;
    setBusy(true);
    setError(null);
    try {
      const target = await walletService.receiptUploadTarget(started.topUp.id, { contentType: file.type, fileSizeBytes: file.size });
      const put = await fetch(target.uploadUrl, { method: "PUT", body: file, headers: target.headers });
      if (!put.ok) throw new Error(`upload ${put.status}`);
      const row = await walletService.submitReceipt(started.topUp.id, target.key);
      onDone(row, { tone: "success", text: t("receipt.sent") });
    } catch (err) {
      const reason = err instanceof ApiError ? String((err.details as { reason?: string } | undefined)?.reason ?? "") : "";
      setError(reason === "RECEIPT_WINDOW_EXPIRED" ? t("receipt.expired") : t("receipt.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="wallet-section wallet-card" aria-labelledby="wallet-card-title">
      <h2 id="wallet-card-title">{t("card.title")}</h2>
      <dl className="wallet-card__facts">
        <div>
          <dt>{t("card.number")}</dt>
          <dd>
            <span dir="ltr" className="wallet-card__number">
              {card.cardNumber}
            </span>
            <Button variant="secondary" size="sm" onClick={() => void copy()}>
              {copied ? (
                <>
                  <Check aria-hidden size={16} /> {t("card.copied")}
                </>
              ) : (
                t("card.copy")
              )}
            </Button>
          </dd>
        </div>
        <div>
          <dt>{t("card.holder")}</dt>
          <dd>{card.cardHolderName}</dd>
        </div>
        {card.bankName ? (
          <div>
            <dt>{t("card.bank")}</dt>
            <dd>{card.bankName}</dd>
          </div>
        ) : null}
        {card.sheba ? (
          <div>
            <dt>{t("card.sheba")}</dt>
            <dd dir="ltr">{card.sheba}</dd>
          </div>
        ) : null}
        <div>
          <dt>{t("card.amount")}</dt>
          <dd>
            <strong>{formatCurrency(started.topUp.amount, locale)}</strong>
          </dd>
        </div>
      </dl>
      <ol className="wallet-card__steps">
        <li>{t("card.stepOne")}</li>
        <li>{t("card.stepTwo")}</li>
        <li>{t("card.stepThree")}</li>
      </ol>
      {deadline ? <p className="wallet-card__deadline">{t("card.deadline", { date: formatAccountDate(deadline, locale, true) })}</p> : null}
      <label className="wallet-file">
        <span>{t("receipt.choose")}</span>
        <input type="file" accept={RECEIPT_TYPES.join(",")} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <small>{fileProblem ?? (file ? file.name : t("receipt.hint"))}</small>
      </label>
      {error ? (
        <p role="alert" className="wallet-error">
          {error}
        </p>
      ) : null}
      <div className="wallet-card__actions">
        <Button onClick={() => void send()} isLoading={busy} disabled={!file || !!fileProblem}>
          {busy ? t("receipt.sending") : t("receipt.send")}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t("requests.title")}
        </Button>
      </div>
    </section>
  );
}

function TopUpRow({ row, onShowCard, onCancel }: { row: WalletTopUpDto; onShowCard: () => void; onCancel: () => void }) {
  const t = useTranslations("wallet");
  const locale = useLocale() as RouteLocale;
  const tone = row.status === "CREDITED" ? "success" : OPEN.includes(row.status) ? "attention" : "neutral";
  return (
    <li className="wallet-request">
      <div>
        <strong>{formatCurrency(row.amount, locale)}</strong>
        <small>
          {t(`requests.rails.${row.rail}`)} · {formatAccountDate(row.createdAt, locale, true)}
        </small>
        {row.status === "CREDITED" && row.receivedAmount !== null && row.receivedAmount !== row.amount ? (
          <small>{t("requests.received", { amount: formatCurrency(row.receivedAmount, locale) })}</small>
        ) : null}
        {row.rejectionReason ? <small>{t("requests.reason", { reason: row.rejectionReason })}</small> : null}
      </div>
      <div className="wallet-request__side">
        <span className={`wallet-chip wallet-chip--${tone}`}>{t(`requests.status.${row.status}`)}</span>
        {row.status === "AWAITING_RECEIPT" ? (
          <span className="wallet-request__actions">
            <Button size="sm" onClick={onShowCard}>
              {t("requests.showCard")}
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              {t("requests.cancel")}
            </Button>
          </span>
        ) : null}
      </div>
    </li>
  );
}
