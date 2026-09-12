"use client";

import { useMemo, useState } from "react";
import {
  AGENTS,
  TICKETS,
  TICKET_CATEGORY_LABEL,
  TICKET_PRIORITY_LABEL,
  TICKET_STATUS_LABEL,
  type Ticket,
  type TicketPriority,
  type TicketStatus,
  agentName,
  formatNumber,
  householdName,
} from "../crm-sample-data";
import {
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
  type Tone,
} from "../crm-ui";

const STATUS_TONE: Record<TicketStatus, Tone> = { open: "concern", waiting: "attention", resolved: "success", closed: "neutral" };
const PRIORITY_TONE: Record<TicketPriority, Tone> = { low: "neutral", normal: "brand", high: "attention", urgent: "urgent" };

/** Anything older than two days and still open is past the target response window. */
const SLA_HOURS = 48;

function ageLabel(hours: number): string {
  if (hours < 24) return `${formatNumber(hours)} ساعت`;
  return `${formatNumber(Math.floor(hours / 24))} روز`;
}

/**
 * تیکت‌ها — a sales-side view of support load.
 *
 * This is deliberately read-only and does not replace the existing admin
 * support workspace (`/admin/support`), which remains the single place a
 * case is actually worked. Here a ticket is context on the relationship:
 * an account with three open billing tickets is not an upgrade candidate.
 */
export function TicketsPanel() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<TicketStatus | "all">("all");
  const [priority, setPriority] = useState<TicketPriority | "all">("all");
  const [category, setCategory] = useState<Ticket["category"] | "all">("all");
  const [owner, setOwner] = useState<string>("all");

  const rows = useMemo(() => {
    const q = query.trim();
    return TICKETS.filter((t) => {
      if (status !== "all" && t.status !== status) return false;
      if (priority !== "all" && t.priority !== priority) return false;
      if (category !== "all" && t.category !== category) return false;
      if (owner !== "all" && t.ownerId !== owner) return false;
      if (q && !`${t.subject} ${householdName(t.householdId)} ${t.id}`.includes(q)) return false;
      return true;
    });
  }, [query, status, priority, category, owner]);

  const live = TICKETS.filter((t) => t.status === "open" || t.status === "waiting");
  const breached = live.filter((t) => t.ageHours > SLA_HOURS);
  const responded = TICKETS.filter((t) => t.firstResponseMins !== null);
  const avgFirstResponse = responded.length === 0 ? 0 : Math.round(responded.reduce((s, t) => s + (t.firstResponseMins as number), 0) / responded.length);

  const byCategory = (Object.keys(TICKET_CATEGORY_LABEL) as Ticket["category"][])
    .map((c) => ({ category: c, count: live.filter((t) => t.category === c).length }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="تیکت‌های باز" value={formatNumber(live.length)} />
        <Kpi label="خارج از مهلت پاسخ" value={formatNumber(breached.length)} sub={`بیش از ${formatNumber(SLA_HOURS)} ساعت`} tone={breached.length > 0 ? "urgent" : "success"} />
        <Kpi label="میانگین اولین پاسخ" value={`${formatNumber(avgFirstResponse)} دقیقه`} tone={avgFirstResponse <= 45 ? "success" : "attention"} />
        <Kpi label="فوری" value={formatNumber(live.filter((t) => t.priority === "urgent").length)} tone="urgent" />
      </div>

      <Panel>
        <PanelTitle title="تیکت‌های باز به تفکیک دسته" hint="نشان می‌دهد فشار پشتیبانی از کجا می‌آید" />
        <ul className="flex flex-col gap-2">
          {byCategory.map(({ category: c, count }) => (
            <li key={c} className="flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-surface-subtle px-2.5 py-2">
              <span className="text-metadata text-text-primary">{TICKET_CATEGORY_LABEL[c]}</span>
              <span className="text-metadata tabular-nums text-text-secondary">{formatNumber(count)}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel>
        <PanelTitle title="فهرست تیکت‌ها" hint={`${formatNumber(rows.length)} مورد`} />
        <FilterBar>
          <FilterField label="جست‌وجو">
            <TextFilter value={query} onChange={setQuery} placeholder="موضوع، خانوار یا کد" />
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
              options={[{ value: "all", label: "همه اولویت‌ها" }, ...(Object.keys(TICKET_PRIORITY_LABEL) as TicketPriority[]).map((p) => ({ value: p, label: TICKET_PRIORITY_LABEL[p] }))]}
            />
          </FilterField>
          <FilterField label="دسته">
            <SelectFilter
              value={category}
              onChange={setCategory}
              options={[{ value: "all", label: "همه دسته‌ها" }, ...(Object.keys(TICKET_CATEGORY_LABEL) as Ticket["category"][]).map((c) => ({ value: c, label: TICKET_CATEGORY_LABEL[c] }))]}
            />
          </FilterField>
          <FilterField label="کارشناس">
            <SelectFilter value={owner} onChange={setOwner} options={[{ value: "all", label: "همه کارشناسان" }, ...AGENTS.map((a) => ({ value: a.id, label: a.name }))]} />
          </FilterField>
        </FilterBar>

        <TableWrap>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>کد</Th>
                <Th>موضوع</Th>
                <Th>خانوار</Th>
                <Th>دسته</Th>
                <Th>وضعیت</Th>
                <Th>اولویت</Th>
                <Th>عمر</Th>
                <Th>اولین پاسخ</Th>
                <Th>کارشناس</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={9} label="تیکتی با این فیلترها پیدا نشد." />
              ) : (
                rows.map((t) => {
                  const isBreached = (t.status === "open" || t.status === "waiting") && t.ageHours > SLA_HOURS;
                  return (
                    <tr key={t.id} className="hover:bg-surface-subtle">
                      <Td className="text-text-secondary">{t.id}</Td>
                      <Td className="max-w-[18rem] truncate whitespace-normal">{t.subject}</Td>
                      <Td className="text-text-secondary">{householdName(t.householdId)}</Td>
                      <Td className="text-text-secondary">{TICKET_CATEGORY_LABEL[t.category]}</Td>
                      <Td>
                        <Tag tone={STATUS_TONE[t.status]}>{TICKET_STATUS_LABEL[t.status]}</Tag>
                      </Td>
                      <Td>
                        <Tag tone={PRIORITY_TONE[t.priority]}>{TICKET_PRIORITY_LABEL[t.priority]}</Tag>
                      </Td>
                      <Td>{isBreached ? <Tag tone="urgent">{ageLabel(t.ageHours)}</Tag> : <span className="tabular-nums text-text-secondary">{ageLabel(t.ageHours)}</span>}</Td>
                      <Td className="tabular-nums text-text-secondary">{t.firstResponseMins === null ? "—" : `${formatNumber(t.firstResponseMins)} دقیقه`}</Td>
                      <Td className="text-text-secondary">{agentName(t.ownerId)}</Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </TableWrap>
        <p className="mt-3 text-metadata text-text-secondary">
          این نما فقط برای دیدن بار پشتیبانی است. رسیدگی به تیکت همچنان در «پشتیبانی» پنل ادمین انجام می‌شود تا دو جای جداگانه برای یک پرونده وجود نداشته باشد.
        </p>
      </Panel>
    </div>
  );
}
