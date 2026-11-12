"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Mail, MessageSquare, Send, ShieldCheck, CircleAlert, Check, KeyRound } from "@petlife/ui";
import Link from "@/features/navigation/localized-link";
import { ApiError } from "@/lib/api/client";
import { adminMessagingService, type MessagingDelivery, type MessagingStatus, type TestResult } from "@/services/admin-messaging.service";
import { useAdminStore } from "@/stores/admin-store";
import { asLocale, fmtDateTime, fmtNumber } from "../reports/report-format";
import "../admin-glass.css";

const STATUSES = ["", "SENT", "DELIVERED", "PENDING", "QUEUED", "FAILED", "SKIPPED"] as const;

/** Messaging console: SMS (Faraz pattern API or Kavenegar) and email (Gmail/SMTP) status, audited test sends and the delivery log. */
export function AdminMessagingView() {
  const t = useTranslations("adminMessaging");
  const locale = asLocale(useLocale());
  const context = useAdminStore((s) => s.context);
  const canView = !!context?.permissions.includes("system.view");
  const canManage = !!context?.permissions.includes("settings.manage");
  const [status, setStatus] = useState<MessagingStatus | null>(null);
  const [failed, setFailed] = useState<"forbidden" | "failed" | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!canView) return;
    const controller = new AbortController();
    setFailed(null);
    adminMessagingService.status(controller.signal).then((v) => { if (!controller.signal.aborted) setStatus(v); }).catch((e: unknown) => {
      if (!controller.signal.aborted) setFailed(e instanceof ApiError && e.status === 403 ? "forbidden" : "failed");
    });
    return () => controller.abort();
  }, [canView, reload]);

  if (!context) return <div className="gx-skel" style={{ height: 240 }} aria-label={t("loading")} />;
  if (!canView || failed === "forbidden") return <section className="gx-card" role="alert"><h1>{t("title")}</h1><p className="gx-muted">{t("forbidden")}</p></section>;
  const num = (v: number) => fmtNumber(v, locale);
  const kavenegar = status?.sms.setupProvider === "kavenegar";
  const stat = (channel: string, s: string) => status?.last7Days.filter((r) => r.channel === channel && (s === "*" || r.status === s)).reduce((a, r) => a + r.count, 0) ?? 0;

  return (
    <div className="gx-page">
      <header className="gx-head">
        <div>
          <p className="gx-kicker"><Send size={16} aria-hidden="true" />{t("kicker")}</p>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
        <div className="gx-toolbar">
          <Link href="/admin/sms-patterns" className="gx-btn"><KeyRound size={16} aria-hidden="true" />{t("patterns")}</Link>
          <button type="button" className="gx-btn" onClick={() => setReload((n) => n + 1)}>{t("refresh")}</button>
        </div>
      </header>

      {failed ? <div className="gx-card" role="alert"><p>{t("failed")}</p><button type="button" className="gx-btn" onClick={() => setReload((n) => n + 1)}>{t("retry")}</button></div> : !status ? <div className="gx-skel" style={{ height: 260 }} aria-label={t("loading")} /> : (
        <>
          <div className="gx-grid gx-grid--2">
            <section className="gx-card">
              <header>
                <h2><MessageSquare size={18} aria-hidden="true" style={{ display: "inline", marginInlineEnd: 8 }} />{t("sms.title")}</h2>
                <Badge live={status.sms.live} sandbox={status.sms.mode === "sandbox"} />
              </header>
              <dl className="gx-grid gx-grid--2" style={{ gap: 10 }}>
                <Fact label={t("sms.provider")} value={status.sms.provider === "faraz" ? "Faraz" : status.sms.provider === "kavenegar" ? t("sms.kavenegarProvider") : t("sms.devProvider")} />
                <Fact label={t("sms.mode")} value={t(`sms.modes.${status.sms.mode}`)} />
                <Fact label={t("sms.sender")} value={status.sms.senderMasked ? <bdi dir="ltr">{status.sms.senderMasked}</bdi> : t("notSet")} />
                <Fact label={t("sms.otp")} value={status.sms.otpLive ? t("on") : t("devOnly")} />
                <Fact label={t("sms.bindings")} value={num(status.sms.activePatternBindings)} />
                <Fact label={t("lastSent")} value={status.sms.lastSentAt ? fmtDateTime(status.sms.lastSentAt, locale) : t("never")} />
                <Fact label={t("sent7")} value={num(stat("SMS", "SENT") + stat("SMS", "DELIVERED"))} />
                <Fact label={t("failed7")} value={num(stat("SMS", "FAILED"))} />
              </dl>
              <Checklist items={kavenegar ? [
                // Kavenegar notifications are plain text, so there is no notification pattern to check.
                { ok: status.sms.apiKeyConfigured, label: t("sms.check.apiKeyKavenegar") },
                { ok: Boolean(status.sms.senderMasked), label: t("sms.check.sender") },
                { ok: status.sms.otpPatternConfigured, label: t("sms.check.otpPattern") },
                { ok: status.sms.live, label: t("sms.check.production") },
              ] : [
                { ok: status.sms.apiKeyConfigured, label: t("sms.check.apiKey") },
                { ok: Boolean(status.sms.senderMasked), label: t("sms.check.sender") },
                { ok: status.sms.otpPatternConfigured, label: t("sms.check.otpPattern") },
                { ok: status.sms.notificationPatternConfigured || status.sms.activePatternBindings > 0, label: t("sms.check.notificationPattern") },
                { ok: status.sms.live, label: t("sms.check.production") },
              ]} />
              {canManage ? <TestSms /> : null}
            </section>

            <section className="gx-card">
              <header>
                <h2><Mail size={18} aria-hidden="true" style={{ display: "inline", marginInlineEnd: 8 }} />{t("email.title")}</h2>
                <Badge live={status.email.live} sandbox={status.email.provider === "dev"} />
              </header>
              <dl className="gx-grid gx-grid--2" style={{ gap: 10 }}>
                <Fact label={t("email.provider")} value={t(`email.providers.${status.email.provider}`)} />
                <Fact label={t("email.from")} value={status.email.fromAddress ? <bdi dir="ltr">{status.email.fromName} · {status.email.fromAddress}</bdi> : t("notSet")} />
                <Fact label={t("lastSent")} value={status.email.lastSentAt ? fmtDateTime(status.email.lastSentAt, locale) : t("never")} />
                <Fact label={t("sent7")} value={num(stat("EMAIL", "SENT"))} />
                <Fact label={t("failed7")} value={num(stat("EMAIL", "FAILED"))} />
                <Fact label={t("skipped7")} value={num(stat("EMAIL", "SKIPPED"))} />
              </dl>
              <Checklist items={[
                { ok: status.email.provider === "gmail" || status.email.provider === "smtp", label: t("email.check.provider") },
                { ok: status.email.live, label: t("email.check.credentials") },
              ]} />
              {canManage ? <TestEmail live={status.email.live || status.email.provider === "dev"} /> : null}
            </section>
          </div>

          {!status.sms.live || !status.email.live ? (
            <section className="gx-card">
              <header><h2><ShieldCheck size={18} aria-hidden="true" style={{ display: "inline", marginInlineEnd: 8 }} />{t("setup.title")}</h2><p>{t("setup.hint")}</p></header>
              <div className="gx-grid gx-grid--2">
                {!status.sms.live ? (kavenegar
                  ? <SetupSteps title={t("setup.kavenegarTitle")} steps={[t("setup.kavenegar1"), t("setup.kavenegar2"), t("setup.kavenegar3"), t("setup.sms4")]} env={["KAVENEGAR_ENABLED=true", "KAVENEGAR_API_KEY", "KAVENEGAR_SENDER", "KAVENEGAR_OTP_TEMPLATE", "OTP_PROVIDER=kavenegar", "MESSAGING_PROVIDER=kavenegar", "MESSAGING_SANDBOX_MODE=production"]} />
                  : <SetupSteps title={t("setup.smsTitle")} steps={[t("setup.sms1"), t("setup.sms2"), t("setup.sms3"), t("setup.sms4")]} env={["FARAZ_SMS_API_KEY", "FARAZ_SMS_SENDER", "FARAZ_SMS_OTP_PATTERN_CODE", "FARAZ_SMS_NOTIFICATION_PATTERN_CODE"]} />) : null}
                {!status.email.live ? <SetupSteps title={t("setup.emailTitle")} steps={[t("setup.email1"), t("setup.email2"), t("setup.email3")]} env={["EMAIL_PROVIDER=gmail", "GMAIL_USER", "GMAIL_APP_PASSWORD", "EMAIL_FROM_NAME"]} /> : null}
              </div>
              <p className="gx-muted" style={{ marginTop: 12 }}>{t("setup.secrets")}</p>
            </section>
          ) : null}

          <DeliveryLog />
        </>
      )}
    </div>
  );
}

function Badge({ live, sandbox }: { live: boolean; sandbox: boolean }) {
  const t = useTranslations("adminMessaging");
  return <span className={`gx-tag ${live ? "gx-tag--ACTIVE" : sandbox ? "gx-tag--AT_RISK" : "gx-tag--NEVER_PURCHASED"}`}>{t(live ? "live" : sandbox ? "sandbox" : "off")}</span>;
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return <div style={{ padding: "10px 12px", borderRadius: 14, background: "var(--glass-input)", border: "1px solid var(--glass-edge)" }}><dt className="gx-muted">{label}</dt><dd style={{ margin: "4px 0 0", fontWeight: 700, fontSize: ".86rem" }}>{value}</dd></div>;
}

function Checklist({ items }: { items: { ok: boolean; label: string }[] }) {
  return <ul style={{ display: "grid", gap: 6, margin: "14px 0", padding: 0, listStyle: "none", fontSize: ".82rem" }}>
    {items.map((i) => <li key={i.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>{i.ok ? <Check size={16} aria-hidden="true" color="var(--chart-3)" /> : <CircleAlert size={16} aria-hidden="true" color="var(--chart-5)" />}<span>{i.label}</span></li>)}
  </ul>;
}

function SetupSteps({ title, steps, env }: { title: string; steps: string[]; env: string[] }) {
  const t = useTranslations("adminMessaging");
  return <div>
    <h3 style={{ margin: "0 0 8px", fontSize: ".92rem", fontWeight: 800 }}>{title}</h3>
    <ol style={{ margin: 0, paddingInlineStart: 20, display: "grid", gap: 6, fontSize: ".82rem", lineHeight: 1.8 }}>{steps.map((s) => <li key={s}>{s}</li>)}</ol>
    <p className="gx-muted" style={{ marginTop: 10 }}>{t("setup.envKeys")}</p>
    <div className="gx-chips" style={{ marginTop: 6 }}>{env.map((k) => <code key={k} dir="ltr" className="gx-tag">{k}</code>)}</div>
  </div>;
}

function ResultLine({ result, error }: { result: TestResult | null; error: string | null }) {
  const t = useTranslations("adminMessaging");
  if (error) return <p role="alert" className="gx-muted" style={{ color: "var(--chart-5)" }}>{error}</p>;
  if (!result) return null;
  return result.status === "SENT"
    ? <p role="status" className="gx-muted" style={{ color: "var(--chart-3)" }}>{t("test.sent")}</p>
    : <p role="alert" className="gx-muted" style={{ color: "var(--chart-5)" }}>{t("test.failedWith", { code: result.failureCode ?? "—" })}{result.failureMessage ? ` · ${result.failureMessage}` : ""}</p>;
}

function TestSms() {
  const t = useTranslations("adminMessaging");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  return <form className="gx-toolbar" style={{ alignItems: "flex-end" }} onSubmit={async (e) => {
    e.preventDefault(); if (busy || phone.trim().length < 8) return;
    setBusy(true); setResult(null); setError(null);
    try { setResult(await adminMessagingService.testSms(phone.trim())); } catch (err) { setError(err instanceof ApiError && err.code === "PHONE_INVALID" ? t("test.phoneInvalid") : t("test.error")); } finally { setBusy(false); }
  }}>
    <label className="gx-field" style={{ flex: 1, minWidth: 180 }}><span>{t("test.phone")}</span><input dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xxxxxxxxx" /></label>
    <button type="submit" className="gx-btn gx-btn--primary" disabled={busy || phone.trim().length < 8}><Send size={16} aria-hidden="true" />{busy ? t("test.sending") : t("test.sendSms")}</button>
    <div style={{ flexBasis: "100%" }}><ResultLine result={result} error={error} /></div>
  </form>;
}

function TestEmail({ live }: { live: boolean }) {
  const t = useTranslations("adminMessaging");
  const uiLocale = useLocale();
  const [to, setTo] = useState("");
  const [lang, setLang] = useState(uiLocale);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verify, setVerify] = useState<string | null>(null);
  return <div className="space-y-2">
    <form className="gx-toolbar" style={{ alignItems: "flex-end" }} onSubmit={async (e) => {
      e.preventDefault(); if (busy || !to.includes("@")) return;
      setBusy(true); setResult(null); setError(null);
      try { setResult(await adminMessagingService.testEmail(to.trim(), lang)); } catch { setError(t("test.error")); } finally { setBusy(false); }
    }}>
      <label className="gx-field" style={{ flex: 1, minWidth: 180 }}><span>{t("test.email")}</span><input dir="ltr" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" /></label>
      <label className="gx-field"><span>{t("test.language")}</span><select value={lang} onChange={(e) => setLang(e.target.value)}>{["fa", "en", "de", "es"].map((l) => <option key={l} value={l}>{t(`languages.${l}`)}</option>)}</select></label>
      <button type="submit" className="gx-btn gx-btn--primary" disabled={busy || !live || !to.includes("@")}><Send size={16} aria-hidden="true" />{busy ? t("test.sending") : t("test.sendEmail")}</button>
      <button type="button" className="gx-btn" disabled={busy} onClick={async () => { setVerify(null); try { const r = await adminMessagingService.verifyEmail(); setVerify(r.ok ? t("test.verifyOk") : t("test.verifyFailed", { message: r.message ?? "" })); } catch { setVerify(t("test.error")); } }}>{t("test.verify")}</button>
    </form>
    <ResultLine result={result} error={error} />
    {verify ? <p role="status" className="gx-muted">{verify}</p> : null}
  </div>;
}

function DeliveryLog() {
  const t = useTranslations("adminMessaging");
  const locale = asLocale(useLocale());
  const [channel, setChannel] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: MessagingDelivery[]; total: number } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (channel) params.set("channel", channel);
    if (status) params.set("status", status);
    setData(null); setFailed(false);
    adminMessagingService.deliveries(params, controller.signal).then((v) => { if (!controller.signal.aborted) setData(v); }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [channel, status, page]);
  const statusLabel = (s: string) => (t.has(`deliveryStatus.${s}`) ? t(`deliveryStatus.${s}`) : s);
  return <section className="gx-card">
    <header><h2>{t("log.title")}</h2><p>{t("log.hint")}</p></header>
    <div className="gx-toolbar" style={{ marginBottom: 12 }}>
      <div className="gx-seg" role="group" aria-label={t("log.channel")}>
        {["", "SMS", "EMAIL"].map((c) => <button key={c} type="button" aria-pressed={channel === c} onClick={() => { setChannel(c); setPage(1); }}>{c ? t(`log.channels.${c}`) : t("log.all")}</button>)}
      </div>
      <label className="gx-field"><span className="sr-only">{t("log.status")}</span>
        <select aria-label={t("log.status")} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>{STATUSES.map((s) => <option key={s} value={s}>{s ? statusLabel(s) : t("log.anyStatus")}</option>)}</select>
      </label>
    </div>
    {failed ? <p role="alert">{t("failed")}</p> : !data ? <div className="gx-skel" style={{ height: 180 }} /> : data.items.length === 0 ? <p className="gx-empty">{t("log.empty")}</p> : (
      <div className="gx-table-wrap">
        <table className="gx-table" style={{ minWidth: "52rem" }}>
          <thead><tr><th>{t("log.when")}</th><th>{t("log.channel")}</th><th>{t("log.template")}</th><th>{t("log.to")}</th><th>{t("log.status")}</th><th>{t("log.detail")}</th></tr></thead>
          <tbody>{data.items.map((d) => <tr key={d.id}>
            <td>{fmtDateTime(d.createdAt, locale)}</td>
            <td>{t(`log.channels.${d.channel}`)}</td>
            <td><bdi dir="ltr">{d.templateKey ?? "—"}</bdi></td>
            <td><bdi dir="ltr">{d.destinationMasked ?? "—"}</bdi></td>
            <td><span className={`gx-tag ${d.status === "SENT" || d.status === "DELIVERED" ? "gx-tag--ACTIVE" : d.status === "FAILED" ? "gx-tag--NEVER_PURCHASED" : d.status === "SKIPPED" ? "gx-tag--DORMANT" : "gx-tag--AT_RISK"}`}>{statusLabel(d.status)}</span></td>
            <td className="gx-muted"><bdi dir="ltr">{d.failureCode ?? (d.skipReason ? (t.has(`skip.${d.skipReason}`) ? t(`skip.${d.skipReason}`) : d.skipReason) : d.provider ?? "")}</bdi>{d.attemptCount > 1 ? ` · ${t("log.attempts", { count: fmtNumber(d.attemptCount, locale) })}` : ""}</td>
          </tr>)}</tbody>
        </table>
      </div>
    )}
    {data && data.total > 25 ? <nav className="gx-toolbar" style={{ marginTop: 12 }} aria-label={t("log.pages")}>
      <button type="button" className="gx-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t("log.previous")}</button>
      <span className="gx-muted">{t("log.page", { page: fmtNumber(page, locale), total: fmtNumber(Math.ceil(data.total / 25), locale) })}</span>
      <button type="button" className="gx-btn" disabled={page * 25 >= data.total} onClick={() => setPage((p) => p + 1)}>{t("log.next")}</button>
    </nav> : null}
  </section>;
}
