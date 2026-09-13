"use client";

import { useMemo, useState } from "react";
import {
  CA_AGENTS,
  CA_CALLS,
  CA_COMPLAINTS,
  CA_CUSTOMERS,
  CA_ESCALATIONS,
  CA_SURVEYS,
  CA_TICKETS,
  CALL_OUTCOME_LABEL,
  COMPLAINT_STATUS_LABEL,
  CX_QUESTIONS,
  ESCALATION_STATUS_LABEL,
  ESCALATION_UNIT_LABEL,
  OPEN_TICKET_STATUSES,
  PRIORITY_LABEL,
  TICKET_STATUS_LABEL,
  type CaCustomer,
  caAgentName,
  formatClock,
  formatIrr,
  relativeDays,
  relativeHours,
  slaState,
  surveyAverage,
} from "../ca-sample-data";
import {
  DetailDrawer,
  DetailRow,
  EmptyRow,
  FilterBar,
  FilterField,
  Kpi,
  Panel,
  PanelTitle,
  SelectFilter,
  TableWrap,
  Tag,
  Td,
  TextFilter,
  Th,
  formatNumber,
  type Tone,
} from "../../console-ui";

type Tab = "timeline" | "tickets" | "calls" | "surveys" | "complaints";

const TAB_LABEL: Record<Tab, string> = {
  timeline: "تایم‌لاین",
  tickets: "تیکت‌ها",
  calls: "تماس‌ها",
  surveys: "رضایتمندی",
  complaints: "شکایات و ارجاعات",
};

const PLAN_TONE: Record<CaCustomer["plan"], Tone> = { رایگان: "neutral", پلاس: "brand", پرمیوم: "success" };

/** مشتریان — the 360 file: every touch this household has had, in one place. */
export function CustomersPanel() {
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState<string>("all");
  const [segment, setSegment] = useState<"all" | "priority" | "open_ticket" | "no_orders">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("timeline");

  const withOpenTicket = useMemo(
    () => new Set(CA_TICKETS.filter((t) => OPEN_TICKET_STATUSES.includes(t.status)).map((t) => t.customerId)),
    [],
  );

  const rows = useMemo(() => {
    const q = query.trim();
    return CA_CUSTOMERS.filter((c) => {
      if (owner !== "all" && c.ownerId !== owner) return false;
      if (segment === "priority" && !c.isPriority) return false;
      if (segment === "open_ticket" && !withOpenTicket.has(c.id)) return false;
      if (segment === "no_orders" && c.orders > 0) return false;
      if (q && !`${c.name} ${c.phone} ${c.id} ${c.city} ${c.pets.map((p) => p.name).join(" ")}`.includes(q)) return false;
      return true;
    });
  }, [query, owner, segment, withOpenTicket]);

  const selected = openId ? CA_CUSTOMERS.find((c) => c.id === openId) : undefined;
  const sTickets = selected ? CA_TICKETS.filter((t) => t.customerId === selected.id) : [];
  const sCalls = selected ? CA_CALLS.filter((c) => c.customerId === selected.id) : [];
  const sSurveys = selected ? CA_SURVEYS.filter((s) => s.customerId === selected.id) : [];
  const sComplaints = selected ? CA_COMPLAINTS.filter((c) => c.customerId === selected.id) : [];
  const sEscalations = selected ? CA_ESCALATIONS.filter((e) => e.customerId === selected.id) : [];

  /** One merged, newest-first stream so the drawer opens on the story, not a table. */
  const timeline = selected
    ? [
        ...sTickets.map((t) => ({ at: t.createdHoursAgo, label: `تیکت: ${t.title}`, meta: TICKET_STATUS_LABEL[t.status], tone: "brand" as Tone })),
        ...sCalls.map((c) => ({ at: c.daysAgo * 24, label: `تماس ${c.direction === "in" ? "ورودی" : "خروجی"} · ${caAgentName(c.agentId)}`, meta: CALL_OUTCOME_LABEL[c.outcome], tone: "neutral" as Tone })),
        ...sSurveys.map((s) => ({ at: s.daysAgo * 24, label: `نظرسنجی · ${formatNumber(surveyAverage(s))} از ۵`, meta: s.comment, tone: (surveyAverage(s) >= 4 ? "success" : "attention") as Tone })),
        ...sComplaints.map((c) => ({ at: c.daysAgo * 24, label: `شکایت: ${c.summary}`, meta: COMPLAINT_STATUS_LABEL[c.status], tone: "urgent" as Tone })),
      ].sort((a, b) => a.at - b.at)
    : [];

  const priorityCount = CA_CUSTOMERS.filter((c) => c.isPriority).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="مشتریان" value={formatNumber(CA_CUSTOMERS.length)} />
        <Kpi label="مشتری ویژه" value={formatNumber(priorityCount)} tone="brand" />
        <Kpi label="دارای تیکت باز" value={formatNumber(withOpenTicket.size)} tone={withOpenTicket.size > 0 ? "attention" : "neutral"} />
        <Kpi label="بدون سفارش" value={formatNumber(CA_CUSTOMERS.filter((c) => c.orders === 0).length)} />
      </div>

      <Panel>
        <PanelTitle title="فهرست مشتریان" hint={`${formatNumber(rows.length)} مورد`} />
        <FilterBar>
          <FilterField label="جست‌وجو">
            <TextFilter value={query} onChange={setQuery} placeholder="نام، موبایل، شهر یا نام حیوان" />
          </FilterField>
          <FilterField label="کارشناس مسئول">
            <SelectFilter value={owner} onChange={setOwner} options={[{ value: "all", label: "همه کارشناسان" }, ...CA_AGENTS.map((a) => ({ value: a.id, label: a.name }))]} />
          </FilterField>
          <FilterField label="بخش‌بندی">
            <SelectFilter
              value={segment}
              onChange={setSegment}
              options={[
                { value: "all", label: "همه مشتریان" },
                { value: "priority", label: "مشتری ویژه" },
                { value: "open_ticket", label: "دارای تیکت باز" },
                { value: "no_orders", label: "بدون سفارش" },
              ]}
            />
          </FilterField>
        </FilterBar>

        <TableWrap>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>نام</Th>
                <Th>موبایل</Th>
                <Th>شهر</Th>
                <Th>حیوانات</Th>
                <Th>پلن</Th>
                <Th>سفارش</Th>
                <Th>نوبت</Th>
                <Th>آخرین خرید</Th>
                <Th>کارشناس</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={9} label="مشتری‌ای با این فیلترها پیدا نشد." />
              ) : (
                rows.map((c) => (
                  <tr
                    key={c.id}
                    tabIndex={0}
                    role="button"
                    onClick={() => {
                      setOpenId(c.id);
                      setTab("timeline");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpenId(c.id);
                        setTab("timeline");
                      }
                    }}
                    className="cursor-pointer outline-none hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    <Td>
                      <span className="flex items-center gap-1.5">
                        {c.name}
                        {c.isPriority ? <Tag tone="brand">ویژه</Tag> : null}
                      </span>
                    </Td>
                    <Td className="tabular-nums text-text-secondary">{c.phone}</Td>
                    <Td className="text-text-secondary">{c.city}</Td>
                    <Td className="text-text-secondary">{c.pets.map((p) => p.name).join("، ")}</Td>
                    <Td>
                      <Tag tone={PLAN_TONE[c.plan]}>{c.plan}</Tag>
                    </Td>
                    <Td className="tabular-nums">{formatNumber(c.orders)}</Td>
                    <Td className="tabular-nums">{formatNumber(c.bookings)}</Td>
                    <Td className="tabular-nums text-text-secondary">{c.lastPurchaseIrr === null ? "بدون خرید" : formatIrr(c.lastPurchaseIrr)}</Td>
                    <Td className="text-text-secondary">{caAgentName(c.ownerId)}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableWrap>
      </Panel>

      {selected ? (
        <DetailDrawer title={selected.name} subtitle={`${selected.id} · ${selected.city} · ${selected.phone}`} onClose={() => setOpenId(null)}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Tag tone={PLAN_TONE[selected.plan]}>{selected.plan}</Tag>
              {selected.isPriority ? <Tag tone="brand">مشتری ویژه</Tag> : null}
              {selected.pets.map((p) => (
                <Tag key={p.name} tone="neutral">
                  {p.name} · {p.species}
                </Tag>
              ))}
            </div>

            <div>
              <DetailRow label="ایمیل">{selected.email ?? "بدون ایمیل"}</DetailRow>
              <DetailRow label="کارشناس مسئول">{caAgentName(selected.ownerId)}</DetailRow>
              <DetailRow label="عضویت">{formatNumber(selected.joinedMonthsAgo)} ماه پیش</DetailRow>
              <DetailRow label="سفارش‌ها">{formatNumber(selected.orders)}</DetailRow>
              <DetailRow label="نوبت‌ها">{formatNumber(selected.bookings)}</DetailRow>
              <DetailRow label="آخرین خرید">{selected.lastPurchaseIrr === null ? "خریدی ثبت نشده است." : formatIrr(selected.lastPurchaseIrr)}</DetailRow>
            </div>

            <div className="flex flex-wrap gap-1 border-b border-border-subtle pb-1.5">
              {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  aria-pressed={tab === t}
                  className={
                    "rounded-full px-2.5 py-1 text-metadata outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
                    (tab === t ? "bg-surface-subtle text-text-primary" : "text-text-secondary hover:bg-surface-subtle")
                  }
                >
                  {TAB_LABEL[t]}
                </button>
              ))}
            </div>

            {tab === "timeline" ? (
              timeline.length === 0 ? (
                <p className="text-metadata text-text-secondary">رویدادی ثبت نشده است.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {timeline.map((e, i) => (
                    <li key={`${e.label}-${i}`} className="rounded-md border border-border-subtle bg-surface-subtle p-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0 text-metadata text-text-primary">{e.label}</span>
                        <Tag tone={e.tone}>{relativeHours(e.at)} پیش</Tag>
                      </div>
                      <p className="mt-1 text-metadata text-text-secondary">{e.meta}</p>
                    </li>
                  ))}
                </ul>
              )
            ) : null}

            {tab === "tickets" ? (
              sTickets.length === 0 ? (
                <p className="text-metadata text-text-secondary">تیکتی ندارد.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {sTickets.map((t) => (
                    <li key={t.id} className="rounded-md border border-border-subtle bg-surface-subtle p-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0 text-metadata text-text-primary">{t.title}</span>
                        <Tag tone={slaState(t) === "breached" ? "urgent" : slaState(t) === "at_risk" ? "attention" : "neutral"}>{TICKET_STATUS_LABEL[t.status]}</Tag>
                      </div>
                      <p className="mt-1 text-metadata text-text-secondary">
                        {t.id} · {PRIORITY_LABEL[t.priority]} · {caAgentName(t.ownerId)}
                      </p>
                    </li>
                  ))}
                </ul>
              )
            ) : null}

            {tab === "calls" ? (
              sCalls.length === 0 ? (
                <p className="text-metadata text-text-secondary">تماسی ثبت نشده است.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {sCalls.map((c) => (
                    <li key={c.id} className="rounded-md border border-border-subtle bg-surface-subtle p-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-metadata text-text-primary">
                          {c.direction === "in" ? "ورودی" : "خروجی"} · {caAgentName(c.agentId)}
                        </span>
                        <span className="text-metadata text-text-secondary">{relativeDays(c.daysAgo)}</span>
                      </div>
                      <p className="mt-1 text-metadata text-text-secondary">
                        {CALL_OUTCOME_LABEL[c.outcome]} · مدت {formatClock(c.talkSeconds)}
                      </p>
                      {c.wrapUp ? <p className="mt-1 text-metadata text-text-secondary">{c.wrapUp}</p> : null}
                    </li>
                  ))}
                </ul>
              )
            ) : null}

            {tab === "surveys" ? (
              sSurveys.length === 0 ? (
                <p className="text-metadata text-text-secondary">نظرسنجی ثبت نشده است.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {sSurveys.map((s) => (
                    <li key={s.id} className="rounded-md border border-border-subtle bg-surface-subtle p-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-metadata text-text-primary">{formatNumber(surveyAverage(s))} از ۵</span>
                        <span className="text-metadata text-text-secondary">{relativeDays(s.daysAgo)}</span>
                      </div>
                      <ul className="mt-1.5 flex flex-col gap-1">
                        {CX_QUESTIONS.map((q) => (
                          <li key={q.key} className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-metadata text-text-secondary">{q.label}</span>
                            <span className="shrink-0 text-metadata tabular-nums text-text-primary">{formatNumber(s.answers[q.key] ?? 0)}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1.5 text-metadata text-text-secondary">{s.comment}</p>
                    </li>
                  ))}
                </ul>
              )
            ) : null}

            {tab === "complaints" ? (
              <div className="flex flex-col gap-3">
                <div>
                  <p className="mb-1.5 text-metadata text-text-secondary">شکایات</p>
                  {sComplaints.length === 0 ? (
                    <p className="text-metadata text-text-secondary">شکایتی ثبت نشده است.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {sComplaints.map((c) => (
                        <li key={c.id} className="rounded-md border border-border-subtle bg-surface-subtle p-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="min-w-0 text-metadata text-text-primary">{c.summary}</span>
                            <Tag tone={c.status === "accepted" ? "urgent" : "attention"}>{COMPLAINT_STATUS_LABEL[c.status]}</Tag>
                          </div>
                          <p className="mt-1 text-metadata text-text-secondary">علیه {c.againstLabel} · شدت {PRIORITY_LABEL[c.severity]}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="mb-1.5 text-metadata text-text-secondary">ارجاعات</p>
                  {sEscalations.length === 0 ? (
                    <p className="text-metadata text-text-secondary">ارجاعی ثبت نشده است.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {sEscalations.map((e) => (
                        <li key={e.id} className="rounded-md border border-border-subtle bg-surface-subtle p-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="min-w-0 text-metadata text-text-primary">{e.requestedAction}</span>
                            <Tag tone={e.status === "done" ? "success" : e.dueInHours < 0 ? "urgent" : "attention"}>{ESCALATION_STATUS_LABEL[e.status]}</Tag>
                          </div>
                          <p className="mt-1 text-metadata text-text-secondary">
                            {ESCALATION_UNIT_LABEL[e.unit]}
                            {e.amountIrr !== null ? ` · ${formatIrr(e.amountIrr)}` : ""}
                          </p>
                          {e.reply ? <p className="mt-1 text-metadata text-text-secondary">پاسخ: {e.reply}</p> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </DetailDrawer>
      ) : null}
    </div>
  );
}
