"use client";

import { useMemo, useState } from "react";
import {
  CA_AGENTS,
  CA_COMPLAINTS,
  CA_ESCALATIONS,
  CA_FOLLOW_UPS,
  CA_TICKETS,
  CHANNEL_LABEL,
  COMPLAINT_STATUS_LABEL,
  CONTACT_REASONS,
  ESCALATION_STATUS_LABEL,
  ESCALATION_UNIT_LABEL,
  OPEN_TICKET_STATUSES,
  PRIORITY_LABEL,
  RESOLUTION_LABEL,
  ROOT_CAUSE_LABEL,
  SLA_STATE_LABEL,
  TICKET_STATUS_LABEL,
  type CaTicket,
  type Priority,
  type TicketStatus,
  caAgentName,
  caCustomerName,
  dueInLabel,
  formatIrr,
  relativeDays,
  relativeHours,
  reasonLabel,
  slaState,
} from "../ca-sample-data";
import {
  DetailDrawer,
  DetailRow,
  EmptyRow,
  FilterBar,
  FilterField,
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

type Tab = "tickets" | "followUps" | "complaints" | "escalations";

const TAB_LABEL: Record<Tab, string> = { tickets: "تیکت‌ها", followUps: "پیگیری‌ها", complaints: "شکایات", escalations: "ارجاعات" };

const SLA_TONE: Record<ReturnType<typeof slaState>, Tone> = { breached: "urgent", at_risk: "attention", on_time: "success", done: "neutral" };
const PRIORITY_TONE: Record<Priority, Tone> = { critical: "urgent", high: "attention", normal: "brand", low: "neutral" };

/** پرونده‌ها — ticket, follow-up, complaint and escalation share one shell but keep their own columns. */
export function CasesPanel() {
  const [tab, setTab] = useState<Tab>("tickets");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<TicketStatus | "all">("all");
  const [priority, setPriority] = useState<Priority | "all">("all");
  const [reason, setReason] = useState<string>("all");
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);

  const tickets = useMemo(() => {
    const q = query.trim();
    return CA_TICKETS.filter((t) => {
      if (status !== "all" && t.status !== status) return false;
      if (priority !== "all" && t.priority !== priority) return false;
      if (reason !== "all" && t.reasonKey !== reason) return false;
      if (q && !`${t.title} ${caCustomerName(t.customerId)} ${t.id}`.includes(q)) return false;
      return true;
    }).sort((a, b) => a.slaRemainingHours - b.slaRemainingHours);
  }, [query, status, priority, reason]);

  const selected: CaTicket | undefined = openTicketId ? CA_TICKETS.find((t) => t.id === openTicketId) : undefined;

  const openCount = CA_TICKETS.filter((t) => OPEN_TICKET_STATUSES.includes(t.status)).length;
  const counts: Record<Tab, number> = {
    tickets: openCount,
    followUps: CA_FOLLOW_UPS.filter((f) => !f.done).length,
    complaints: CA_COMPLAINTS.filter((c) => c.status !== "closed").length,
    escalations: CA_ESCALATIONS.filter((e) => e.status !== "done").length,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-metadata outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
              (tab === t ? "border-brand-mint bg-brand-mint/10 text-brand-mint-strong" : "border-border-subtle text-text-secondary hover:bg-surface-subtle")
            }
          >
            {TAB_LABEL[t]}
            {counts[t] > 0 ? <span className="rounded-full bg-border-subtle px-1.5 tabular-nums text-text-secondary">{formatNumber(counts[t])}</span> : null}
          </button>
        ))}
      </div>

      {tab === "tickets" ? (
        <Panel>
          <PanelTitle title="تیکت‌ها" hint={`${formatNumber(tickets.length)} مورد · مرتب بر اساس نزدیک‌ترین مهلت`} />
          <FilterBar>
            <FilterField label="جست‌وجو">
              <TextFilter value={query} onChange={setQuery} placeholder="عنوان، مشتری یا شناسه" />
            </FilterField>
            <FilterField label="وضعیت">
              <SelectFilter
                value={status}
                onChange={setStatus}
                options={[{ value: "all", label: "همه وضعیت‌ها" }, ...(Object.keys(TICKET_STATUS_LABEL) as TicketStatus[]).map((s) => ({ value: s, label: TICKET_STATUS_LABEL[s] }))]}
              />
            </FilterField>
            <FilterField label="اولویت">
              <SelectFilter
                value={priority}
                onChange={setPriority}
                options={[{ value: "all", label: "همه اولویت‌ها" }, ...(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))]}
              />
            </FilterField>
            <FilterField label="دلیل تماس">
              <SelectFilter value={reason} onChange={setReason} options={[{ value: "all", label: "همه دلایل" }, ...CONTACT_REASONS.map((r) => ({ value: r.key, label: r.label }))]} />
            </FilterField>
          </FilterBar>

          <TableWrap>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>شناسه</Th>
                  <Th>عنوان</Th>
                  <Th>مشتری</Th>
                  <Th>دسته</Th>
                  <Th>کانال</Th>
                  <Th>اولویت</Th>
                  <Th>وضعیت</Th>
                  <Th>مهلت</Th>
                  <Th>مسئول</Th>
                </tr>
              </thead>
              <tbody>
                {tickets.length === 0 ? (
                  <EmptyRow colSpan={9} label="تیکتی با این فیلترها پیدا نشد." />
                ) : (
                  tickets.map((t) => {
                    const state = slaState(t);
                    return (
                      <tr
                        key={t.id}
                        tabIndex={0}
                        role="button"
                        onClick={() => setOpenTicketId(t.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setOpenTicketId(t.id);
                          }
                        }}
                        className="cursor-pointer outline-none hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-focus-ring"
                      >
                        <Td className="text-text-secondary">{t.id}</Td>
                        <Td className="max-w-[16rem] truncate whitespace-normal">{t.title}</Td>
                        <Td className="text-text-secondary">{caCustomerName(t.customerId)}</Td>
                        <Td className="text-text-secondary">{reasonLabel(t.reasonKey)}</Td>
                        <Td className="text-text-secondary">{CHANNEL_LABEL[t.channel]}</Td>
                        <Td>
                          <Tag tone={PRIORITY_TONE[t.priority]}>{PRIORITY_LABEL[t.priority]}</Tag>
                        </Td>
                        <Td className="text-text-secondary">{TICKET_STATUS_LABEL[t.status]}</Td>
                        <Td>
                          <Tag tone={SLA_TONE[state]}>{state === "done" ? SLA_STATE_LABEL.done : dueInLabel(t.slaRemainingHours)}</Tag>
                        </Td>
                        <Td className="text-text-secondary">{caAgentName(t.ownerId)}</Td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </TableWrap>
        </Panel>
      ) : null}

      {tab === "followUps" ? (
        <Panel>
          <PanelTitle title="پیگیری‌ها" hint="تعهدات زمان‌دار به مشتری" />
          <TableWrap>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>شناسه</Th>
                  <Th>شرح</Th>
                  <Th>مشتری</Th>
                  <Th>تیکت مرتبط</Th>
                  <Th>مسئول</Th>
                  <Th>سررسید</Th>
                  <Th>وضعیت</Th>
                </tr>
              </thead>
              <tbody>
                {CA_FOLLOW_UPS.map((f) => (
                  <tr key={f.id} className="hover:bg-surface-subtle">
                    <Td className="text-text-secondary">{f.id}</Td>
                    <Td className="max-w-[18rem] truncate whitespace-normal">{f.title}</Td>
                    <Td className="text-text-secondary">{caCustomerName(f.customerId)}</Td>
                    <Td className="text-text-secondary">{f.ticketId ?? "—"}</Td>
                    <Td className="text-text-secondary">{caAgentName(f.ownerId)}</Td>
                    <Td>
                      <Tag tone={f.done ? "neutral" : f.dueInHours < 0 ? "urgent" : f.dueInHours <= 4 ? "attention" : "success"}>{dueInLabel(f.dueInHours)}</Tag>
                    </Td>
                    <Td>{f.done ? <Tag tone="success">انجام‌شده</Tag> : <Tag tone="attention">باز</Tag>}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Panel>
      ) : null}

      {tab === "complaints" ? (
        <Panel>
          <PanelTitle title="شکایات" hint="ثبت، ریشه‌یابی و اقدام اصلاحی" />
          <div className="flex flex-col gap-2">
            {CA_COMPLAINTS.map((c) => (
              <article key={c.id} className="rounded-md border border-border-subtle bg-surface-subtle p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-metadata text-text-primary">{c.summary}</p>
                    <p className="mt-0.5 text-metadata text-text-secondary">
                      {c.id} · {caCustomerName(c.customerId)} · علیه {c.againstLabel} · {relativeDays(c.daysAgo)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Tag tone={PRIORITY_TONE[c.severity]}>شدت {PRIORITY_LABEL[c.severity]}</Tag>
                    <Tag tone={c.status === "accepted" ? "urgent" : c.status === "closed" ? "neutral" : "attention"}>{COMPLAINT_STATUS_LABEL[c.status]}</Tag>
                  </div>
                </div>
                <dl className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  <div className="flex gap-1.5">
                    <dt className="shrink-0 text-metadata text-text-secondary">علت ریشه‌ای:</dt>
                    <dd className="text-metadata text-text-primary">{c.rootCause ? ROOT_CAUSE_LABEL[c.rootCause] : "هنوز تعیین نشده"}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="shrink-0 text-metadata text-text-secondary">اقدام اصلاحی:</dt>
                    <dd className="text-metadata text-text-primary">{c.correctiveAction ?? "ثبت نشده"}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </Panel>
      ) : null}

      {tab === "escalations" ? (
        <Panel>
          <PanelTitle title="ارجاعات بین‌واحدی" hint="درخواست از مالی، ارائه‌دهندگان، فنی یا سرپرست" />
          <TableWrap>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>شناسه</Th>
                  <Th>واحد مقصد</Th>
                  <Th>مشتری</Th>
                  <Th>اقدام درخواستی</Th>
                  <Th>مبلغ</Th>
                  <Th>مهلت</Th>
                  <Th>وضعیت</Th>
                  <Th>ارجاع‌دهنده</Th>
                </tr>
              </thead>
              <tbody>
                {CA_ESCALATIONS.map((e) => (
                  <tr key={e.id} className="hover:bg-surface-subtle">
                    <Td className="text-text-secondary">{e.id}</Td>
                    <Td>{ESCALATION_UNIT_LABEL[e.unit]}</Td>
                    <Td className="text-text-secondary">{caCustomerName(e.customerId)}</Td>
                    <Td className="max-w-[16rem] truncate whitespace-normal">{e.requestedAction}</Td>
                    <Td className="tabular-nums text-text-secondary">{e.amountIrr === null ? "—" : formatIrr(e.amountIrr)}</Td>
                    <Td>
                      <Tag tone={e.status === "done" ? "neutral" : e.dueInHours < 0 ? "urgent" : "attention"}>{dueInLabel(e.dueInHours)}</Tag>
                    </Td>
                    <Td>
                      <Tag tone={e.status === "done" ? "success" : e.status === "answered" ? "brand" : "attention"}>{ESCALATION_STATUS_LABEL[e.status]}</Tag>
                    </Td>
                    <Td className="text-text-secondary">{caAgentName(e.raisedById)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Panel>
      ) : null}

      {selected ? (
        <DetailDrawer title={selected.title} subtitle={`${selected.id} · ${caCustomerName(selected.customerId)}`} onClose={() => setOpenTicketId(null)}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Tag tone={PRIORITY_TONE[selected.priority]}>{PRIORITY_LABEL[selected.priority]}</Tag>
              <Tag tone={SLA_TONE[slaState(selected)]}>{SLA_STATE_LABEL[slaState(selected)]}</Tag>
              <Tag tone="neutral">{TICKET_STATUS_LABEL[selected.status]}</Tag>
            </div>

            <div>
              <DetailRow label="دسته">{reasonLabel(selected.reasonKey)} · {selected.subReason}</DetailRow>
              <DetailRow label="کانال">{CHANNEL_LABEL[selected.channel]}</DetailRow>
              <DetailRow label="مسئول">{caAgentName(selected.ownerId)}</DetailRow>
              <DetailRow label="عمر تیکت">{relativeHours(selected.createdHoursAgo)}</DetailRow>
              <DetailRow label="مهلت">{dueInLabel(selected.slaRemainingHours)}</DetailRow>
              <DetailRow label="نوع رفع">{selected.resolution ? RESOLUTION_LABEL[selected.resolution] : "هنوز ثبت نشده"}</DetailRow>
              <DetailRow label="علت ریشه‌ای">{selected.rootCause ? ROOT_CAUSE_LABEL[selected.rootCause] : "هنوز تعیین نشده"}</DetailRow>
            </div>

            <div>
              <p className="mb-1 text-metadata text-text-secondary">خلاصه</p>
              <p className="rounded-md border border-border-subtle bg-surface-subtle p-2.5 text-metadata leading-relaxed text-text-primary">{selected.summary}</p>
            </div>

            <div>
              <p className="mb-1.5 text-metadata text-text-secondary">پیگیری‌ها و ارجاعات این تیکت</p>
              <ul className="flex flex-col gap-1.5">
                {CA_FOLLOW_UPS.filter((f) => f.ticketId === selected.id).map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-surface-subtle px-2.5 py-2">
                    <span className="min-w-0 truncate text-metadata text-text-primary">{f.title}</span>
                    <Tag tone={f.done ? "success" : f.dueInHours < 0 ? "urgent" : "attention"}>{dueInLabel(f.dueInHours)}</Tag>
                  </li>
                ))}
                {CA_ESCALATIONS.filter((e) => e.ticketId === selected.id).map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-surface-subtle px-2.5 py-2">
                    <span className="min-w-0 truncate text-metadata text-text-primary">{ESCALATION_UNIT_LABEL[e.unit]} · {e.requestedAction}</span>
                    <Tag tone={e.status === "done" ? "success" : "attention"}>{ESCALATION_STATUS_LABEL[e.status]}</Tag>
                  </li>
                ))}
                {CA_FOLLOW_UPS.filter((f) => f.ticketId === selected.id).length === 0 && CA_ESCALATIONS.filter((e) => e.ticketId === selected.id).length === 0 ? (
                  <li className="text-metadata text-text-secondary">موردی ثبت نشده است.</li>
                ) : null}
              </ul>
            </div>

            <p className="text-metadata text-text-secondary">
              کارشناسان: {CA_AGENTS.filter((a) => a.role === "agent").map((a) => a.name).join("، ")}
            </p>
          </div>
        </DetailDrawer>
      ) : null}
    </div>
  );
}
