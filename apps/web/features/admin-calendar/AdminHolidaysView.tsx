"use client";

import "./admin-holidays.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import type { RouteLocale } from "@/lib/i18n/config";
import { useAdminStore } from "@/stores/admin-store";
import { adminCalendarService, type CalendarDayDto, type CalendarYearDto } from "@/services/admin-calendar.service";
import { holidayNameKeys } from "./holiday-names";

const DATE_LOCALE: Record<RouteLocale, string> = { fa: "fa-IR-u-ca-persian-nu-arabext", en: "en-GB", de: "de-DE", es: "es-ES" };

function currentPersianYear(): number {
  const part = new Intl.DateTimeFormat("en-u-ca-persian-nu-latn", { year: "numeric", timeZone: "Asia/Tehran" }).formatToParts(new Date()).find((p) => p.type === "year");
  return Number.parseInt(part?.value ?? "1405", 10);
}

type Pending = { kind: "open"; day: CalendarDayDto } | { kind: "clear"; day: CalendarDayDto } | null;

/** /admin/settings/holidays — Iran's official holidays per Persian year, and staff closures or openings on top. */
export function AdminHolidaysView() {
  const t = useTranslations("adminHolidays");
  const locale = useLocale() as RouteLocale;
  const canManage = !!useAdminStore((s) => s.context?.permissions.includes("settings.manage"));
  const thisYear = useMemo(() => currentPersianYear(), []);
  const [year, setYear] = useState(thisYear);
  const [data, setData] = useState<CalendarYearDto | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState("");
  const [closure, setClosure] = useState({ date: "", title: "", reason: "" });

  const load = useCallback(async (y: number) => {
    setData(null);
    try {
      setData(await adminCalendarService.year(y));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);
  useEffect(() => void load(year), [load, year]);

  const fmt = useMemo(() => new Intl.DateTimeFormat(DATE_LOCALE[locale] ?? "en-GB", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" }), [locale]);
  const dateLabel = (d: string) => fmt.format(new Date(`${d}T00:00:00Z`));
  const name = (title: string) =>
    locale === "fa"
      ? title
      : holidayNameKeys(title)
          .map((k) => (typeof k === "string" && t.has(`names.${k}`) ? t(`names.${k}`) : typeof k === "string" ? k : k.raw))
          .join(" · ");
  const describe = (e: unknown) => {
    if (e instanceof ApiError && e.code === "ADMIN_GOVERNANCE_RULE" && typeof e.details?.rule === "string" && t.has(`rules.${e.details.rule}`)) return t(`rules.${e.details.rule}`);
    return t("errors.generic");
  };
  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(done);
      setPending(null);
      setReason("");
      await load(year);
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(false);
    }
  };
  const closedCount = data?.days.filter((d) => d.closed).length ?? 0;

  return (
    <div className="gx-page">
      <header className="gx-pagehead">
        <div className="gx-pagehead__text">
          <p className="gx-kicker">{t("kicker")}</p>
          <h1>{t("title")}</h1>
          <p className="gx-muted">{t("intro")}</p>
        </div>
        <div className="gx-pagehead__actions">
          <div className="gx-seg" role="group" aria-label={t("yearLabel")}>
            {[thisYear - 1, thisYear, thisYear + 1].map((y) => (
              <button key={y} type="button" aria-pressed={y === year} onClick={() => setYear(y)}>
                {new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-GB", { useGrouping: false }).format(y)}
              </button>
            ))}
          </div>
        </div>
      </header>
      {notice ? <p role="status" className="gx-inline-note">{notice}</p> : null}
      {loadError ? (
        <div className="gx-inline-alert" role="alert">
          <p>{t("errors.generic")}</p>
          <button type="button" className="gx-btn" onClick={() => void load(year)}>{t("retry")}</button>
        </div>
      ) : !data ? (
        <div className="gx-card gx-skel" style={{ minHeight: 240 }} aria-busy="true" />
      ) : (
        <>
          <p className={data.coverage === "official" ? "gx-muted" : "gx-inline-alert"}>
            {data.coverage === "official" ? t("coverage.official", { count: closedCount }) : data.coverage === "provisional" ? t("coverage.provisional") : t("coverage.none")}
          </p>

          {canManage ? (
            <form
              className="gx-card gx-holidays-add"
              noValidate
              aria-labelledby="holidays-add-title"
              onSubmit={(e) => {
                e.preventDefault();
                if (!closure.date || closure.title.trim().length < 2 || closure.reason.trim().length < 5) return setError(t("errors.closureFields"));
                void run(() => adminCalendarService.change(closure.date, { closed: true, title: closure.title.trim(), reason: closure.reason.trim() }), t("done.closed")).then(() => setClosure({ date: "", title: "", reason: "" }));
              }}
            >
              <h2 id="holidays-add-title" className="gx-section-title"><CalendarDays size={18} aria-hidden="true" /> {t("add.title")}</h2>
              <p className="gx-muted">{t("add.help")}</p>
              <div className="gx-holidays-fields">
                <label className="gx-field">{t("add.date")}<input type="date" value={closure.date} onChange={(e) => setClosure({ ...closure, date: e.target.value })} /></label>
                <label className="gx-field">{t("add.name")}<input value={closure.title} maxLength={120} placeholder={t("add.namePlaceholder")} onChange={(e) => setClosure({ ...closure, title: e.target.value })} /></label>
                <label className="gx-field">{t("reason")}<input value={closure.reason} maxLength={500} placeholder={t("reasonPlaceholder")} onChange={(e) => setClosure({ ...closure, reason: e.target.value })} /></label>
              </div>
              {error && !pending ? <p role="alert" className="gx-inline-alert">{error}</p> : null}
              <div><button type="submit" className="gx-btn gx-btn--primary" disabled={busy}>{t("add.submit")}</button></div>
            </form>
          ) : null}

          <section className="gx-card" aria-labelledby="holidays-list-title">
            <h2 id="holidays-list-title" className="gx-section-title">{t("list.title")}</h2>
            {data.days.length === 0 ? (
              <p className="gx-empty">{t("list.empty")}</p>
            ) : (
              <div className="gx-table-wrap">
                <table className="gx-table">
                  <thead>
                    <tr>
                      <th scope="col">{t("list.date")}</th>
                      <th scope="col">{t("list.name")}</th>
                      <th scope="col">{t("list.status")}</th>
                      {canManage ? <th scope="col"><span className="sr-only">{t("list.actions")}</span></th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {data.days.map((d) => {
                      const past = d.date < data.today;
                      return (
                        <tr key={d.date} className={past ? "gx-holidays-past" : undefined}>
                          <td className="gx-num">{dateLabel(d.date)}</td>
                          <td>
                            <span lang={locale === "fa" || d.staff ? undefined : "en"}>{d.staff ? d.staff.title : name(d.official?.title ?? d.title)}</span>
                            {d.staff ? <small className="gx-muted gx-holidays-reason">{d.staff.reason}</small> : null}
                          </td>
                          <td>
                            <span className={`gx-tag ${d.closed ? "gx-tag--AT_RISK" : "gx-tag--ACTIVE"}`}>{d.closed ? t("status.closed") : t("status.open")}</span>{" "}
                            <span className="gx-tag">{d.staff ? (d.official ? t("source.staffOpened") : t("source.staffClosure")) : t("source.official")}</span>
                          </td>
                          {canManage ? (
                            <td>
                              {past ? null : d.staff ? (
                                <button type="button" className="gx-btn" onClick={() => { setPending({ kind: "clear", day: d }); setReason(""); setError(null); }}>{t("actions.undo")}</button>
                              ) : d.official ? (
                                <button type="button" className="gx-btn" onClick={() => { setPending({ kind: "open", day: d }); setReason(""); setError(null); }}>{t("actions.open")}</button>
                              ) : null}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {pending ? (
            <form
              className="gx-card gx-holidays-confirm"
              noValidate
              aria-labelledby="holidays-confirm-title"
              onSubmit={(e) => {
                e.preventDefault();
                if (reason.trim().length < 5) return setError(t("errors.reason"));
                const day = pending.day;
                void run(
                  () => (pending.kind === "open" ? adminCalendarService.change(day.date, { closed: false, title: (day.official?.title ?? day.title).slice(0, 120), reason: reason.trim() }) : adminCalendarService.clear(day.date, reason.trim())),
                  pending.kind === "open" ? t("done.opened") : t("done.undone"),
                );
              }}
            >
              <h2 id="holidays-confirm-title" className="gx-section-title">{pending.kind === "open" ? t("confirm.openTitle", { date: dateLabel(pending.day.date) }) : t("confirm.undoTitle", { date: dateLabel(pending.day.date) })}</h2>
              <p className="gx-muted">{pending.kind === "open" ? t("confirm.openBody") : t("confirm.undoBody")}</p>
              <label className="gx-field">{t("reason")}<input value={reason} autoFocus maxLength={500} placeholder={t("reasonPlaceholder")} onChange={(e) => setReason(e.target.value)} /></label>
              {error ? <p role="alert" className="gx-inline-alert">{error}</p> : null}
              <div className="gx-holidays-actions">
                <button type="submit" className="gx-btn gx-btn--primary" disabled={busy}>{pending.kind === "open" ? t("actions.open") : t("actions.undo")}</button>
                <button type="button" className="gx-btn" onClick={() => { setPending(null); setError(null); }}>{t("cancel")}</button>
              </div>
            </form>
          ) : null}
        </>
      )}
    </div>
  );
}
