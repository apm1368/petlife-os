"use client";

import { useMemo, useState } from "react";
import {
  CA_AGENTS,
  CA_ESCALATIONS,
  CA_FOLLOW_UPS,
  CA_TICKETS,
  CHANNEL_LABEL,
  ESCALATION_UNIT_LABEL,
  OPEN_TICKET_STATUSES,
  PRIORITY_LABEL,
  SLA_STATE_LABEL,
  TICKET_STATUS_LABEL,
  caAgentName,
  caCustomerName,
  dueInLabel,
  reasonLabel,
  slaState,
} from "../ca-sample-data";
import { EmptyRow, FilterBar, FilterField, Kpi, Panel, PanelTitle, SelectFilter, TableWrap, Tag, Td, TextFilter, Th, formatNumber, type Tone } from "../../console-ui";

type Kind = "all" | "ticket" | "followUp" | "escalation";
type Scope = "all" | "mine" | "unassigned";

const SLA_TONE: Record<ReturnType<typeof slaState>, Tone> = { breached: "urgent", at_risk: "attention", on_time: "success", done: "neutral" };

interface Row {
  id: string;
  kind: Exclude<Kind, "all">;
  title: string;
  customerId: string;
  ownerId: string | null;
  meta: string;
  dueHours: number;
  tone: Tone;
  dueLabel: string;
}

/**
 * اینباکس — tickets, follow-ups and escalations in one queue ordered by
 * deadline, because an agent's real question is "what is closest to breaching",
 * not "what type of record is this".
 */
export function InboxPanel({ meId }: { meId: string }) {
  const [kind, setKind] = useState<Kind>("all");
  const [scope, setScope] = useState<Scope>("all");
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState<string>("all");

  const rows = useMemo<Row[]>(() => {
    const tickets: Row[] = CA_TICKETS.filter((t) => OPEN_TICKET_STATUSES.includes(t.status)).map((t) => {
      const state = slaState(t);
      return {
        id: t.id,
        kind: "ticket",
        title: t.title,
        customerId: t.customerId,
        ownerId: t.ownerId,
        meta: `${reasonLabel(t.reasonKey)} · ${TICKET_STATUS_LABEL[t.status]} · ${CHANNEL_LABEL[t.channel]}`,
        dueHours: t.slaRemainingHours,
        tone: SLA_TONE[state],
        dueLabel: `${SLA_STATE_LABEL[state]} · ${dueInLabel(t.slaRemainingHours)}`,
      };
    });

    const follows: Row[] = CA_FOLLOW_UPS.filter((f) => !f.done).map((f) => ({
      id: f.id,
      kind: "followUp",
      title: f.title,
      customerId: f.customerId,
      ownerId: f.ownerId,
      meta: f.ticketId ? `پیگیری تیکت ${f.ticketId}` : "پیگیری مستقل",
      dueHours: f.dueInHours,
      tone: f.dueInHours < 0 ? "urgent" : f.dueInHours <= 4 ? "attention" : "neutral",
      dueLabel: dueInLabel(f.dueInHours),
    }));

    const escalations: Row[] = CA_ESCALATIONS.filter((e) => e.status !== "done").map((e) => ({
      id: e.id,
      kind: "escalation",
      title: e.requestedAction,
      customerId: e.customerId,
      ownerId: e.raisedById,
      meta: `${ESCALATION_UNIT_LABEL[e.unit]}${e.ticketId ? ` · تیکت ${e.ticketId}` : ""}`,
      dueHours: e.dueInHours,
      tone: e.dueInHours < 0 ? "urgent" : e.dueInHours <= 4 ? "attention" : "neutral",
      dueLabel: dueInLabel(e.dueInHours),
    }));

    const all = [...tickets, ...follows, ...escalations];
    const q = query.trim();

    return all
      .filter((r) => {
        if (kind !== "all" && r.kind !== kind) return false;
        if (scope === "mine" && r.ownerId !== meId) return false;
        if (scope === "unassigned" && r.ownerId !== null) return false;
        if (owner !== "all" && r.ownerId !== owner) return false;
        if (q && !`${r.title} ${caCustomerName(r.customerId)} ${r.id}`.includes(q)) return false;
        return true;
      })
      // Closest deadline first — a breached item sits at the top by construction.
      .sort((a, b) => a.dueHours - b.dueHours);
  }, [kind, scope, query, owner, meId]);

  const breached = rows.filter((r) => r.dueHours < 0);
  const mine = rows.filter((r) => r.ownerId === meId);
  const unassigned = rows.filter((r) => r.ownerId === null);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="در صف" value={formatNumber(rows.length)} />
        <Kpi label="عقب‌افتاده" value={formatNumber(breached.length)} tone={breached.length > 0 ? "urgent" : "success"} />
        <Kpi label="مال من" value={formatNumber(mine.length)} tone="brand" />
        <Kpi label="تخصیص‌نیافته" value={formatNumber(unassigned.length)} tone={unassigned.length > 0 ? "attention" : "neutral"} />
      </div>

      <Panel>
        <PanelTitle title="صف کاری یکپارچه" hint="تیکت، پیگیری و ارجاع — مرتب بر اساس نزدیک‌ترین مهلت" />
        <FilterBar>
          <FilterField label="جست‌وجو">
            <TextFilter value={query} onChange={setQuery} placeholder="عنوان، مشتری یا شناسه" />
          </FilterField>
          <FilterField label="نوع">
            <SelectFilter
              value={kind}
              onChange={setKind}
              options={[
                { value: "all", label: "همه انواع" },
                { value: "ticket", label: "تیکت" },
                { value: "followUp", label: "پیگیری" },
                { value: "escalation", label: "ارجاع" },
              ]}
            />
          </FilterField>
          <FilterField label="دامنه">
            <SelectFilter
              value={scope}
              onChange={setScope}
              options={[
                { value: "all", label: "همه پرونده‌ها" },
                { value: "mine", label: "فقط موارد من" },
                { value: "unassigned", label: "تخصیص‌نیافته" },
              ]}
            />
          </FilterField>
          <FilterField label="کارشناس">
            <SelectFilter value={owner} onChange={setOwner} options={[{ value: "all", label: "همه کارشناسان" }, ...CA_AGENTS.map((a) => ({ value: a.id, label: a.name }))]} />
          </FilterField>
        </FilterBar>

        <TableWrap>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>نوع</Th>
                <Th>شناسه</Th>
                <Th>عنوان</Th>
                <Th>مشتری</Th>
                <Th>جزئیات</Th>
                <Th>مسئول</Th>
                <Th>مهلت</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={7} label="موردی با این فیلترها در صف نیست." />
              ) : (
                rows.map((r) => (
                  <tr key={`${r.kind}-${r.id}`} className="hover:bg-surface-subtle">
                    <Td>
                      <Tag tone={r.kind === "ticket" ? "brand" : r.kind === "followUp" ? "attention" : "concern"}>
                        {r.kind === "ticket" ? "تیکت" : r.kind === "followUp" ? "پیگیری" : "ارجاع"}
                      </Tag>
                    </Td>
                    <Td className="text-text-secondary">{r.id}</Td>
                    <Td className="max-w-[18rem] truncate whitespace-normal">{r.title}</Td>
                    <Td className="text-text-secondary">{caCustomerName(r.customerId)}</Td>
                    <Td className="text-text-secondary">{r.meta}</Td>
                    <Td className="text-text-secondary">{caAgentName(r.ownerId)}</Td>
                    <Td>
                      <Tag tone={r.tone}>{r.dueLabel}</Tag>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableWrap>
      </Panel>

      <p className="text-metadata text-text-secondary">
        اولویت‌ها: {Object.values(PRIORITY_LABEL).join("، ")} — مهلت هر تیکت مستقیماً از همین اولویت در «تنظیمات» محاسبه می‌شود.
      </p>
    </div>
  );
}
