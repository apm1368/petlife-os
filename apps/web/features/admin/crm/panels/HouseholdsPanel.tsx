"use client";

import { useMemo, useState } from "react";
import {
  AGENTS,
  CALLS,
  HOUSEHOLDS,
  PLAN_LABEL,
  TICKETS,
  TICKET_STATUS_LABEL,
  UPGRADES,
  UPGRADE_STAGE_LABEL,
  type Household,
  type PlanCode,
  agentName,
  formatIrr,
  formatNumber,
  relativeDays,
} from "../crm-sample-data";
import {
  DetailDrawer,
  DetailRow,
  EmptyRow,
  FilterBar,
  FilterField,
  Kpi,
  Meter,
  Panel,
  PanelTitle,
  SelectFilter,
  TableWrap,
  Tag,
  Td,
  TextFilter,
  Th,
  type Tone,
} from "../../console-ui";

const PLAN_TONE: Record<PlanCode, Tone> = { free: "neutral", plus: "brand", premium: "success" };

/** NPS convention: 9-10 promoter, 7-8 passive, 0-6 detractor. */
function npsTone(score: number | null): Tone {
  if (score === null) return "neutral";
  if (score >= 9) return "success";
  if (score >= 7) return "attention";
  return "urgent";
}

function npsLabel(score: number | null): string {
  if (score === null) return "نظرسنجی نشده";
  if (score >= 9) return `ترویج‌کننده (${formatNumber(score)})`;
  if (score >= 7) return `خنثی (${formatNumber(score)})`;
  return `منتقد (${formatNumber(score)})`;
}

/** خانوارها — PET LIFE's real customer unit is a household, not an individual. */
export function HouseholdsPanel() {
  const [query, setQuery] = useState("");
  const [plan, setPlan] = useState<PlanCode | "all">("all");
  const [owner, setOwner] = useState<string>("all");
  const [risk, setRisk] = useState<"all" | "at_risk" | "healthy">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim();
    return HOUSEHOLDS.filter((h) => {
      if (plan !== "all" && h.plan !== plan) return false;
      if (owner !== "all" && h.ownerId !== owner) return false;
      if (risk === "at_risk" && h.healthScore >= 60) return false;
      if (risk === "healthy" && h.healthScore < 60) return false;
      if (q && !`${h.name} ${h.city} ${h.id} ${h.pets.map((p) => p.name).join(" ")}`.includes(q)) return false;
      return true;
    });
  }, [query, plan, owner, risk]);

  const atRisk = HOUSEHOLDS.filter((h) => h.healthScore < 60);
  const totalLifetime = HOUSEHOLDS.reduce((s, h) => s + h.lifetimeIrr, 0);
  const rated = HOUSEHOLDS.filter((h) => h.npsScore !== null);
  const promoters = rated.filter((h) => (h.npsScore as number) >= 9).length;
  const detractors = rated.filter((h) => (h.npsScore as number) <= 6).length;
  const nps = rated.length === 0 ? 0 : Math.round(((promoters - detractors) / rated.length) * 100);

  const selected: Household | undefined = openId ? HOUSEHOLDS.find((h) => h.id === openId) : undefined;
  const selectedTickets = selected ? TICKETS.filter((t) => t.householdId === selected.id) : [];
  const selectedUpgrades = selected ? UPGRADES.filter((u) => u.householdId === selected.id) : [];
  const selectedCalls = selected ? CALLS.filter((c) => c.householdId === selected.id) : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="خانوارها" value={formatNumber(HOUSEHOLDS.length)} />
        <Kpi label="ارزش کل عمر مشتری" value={formatIrr(totalLifetime)} tone="brand" />
        <Kpi label="امتیاز خالص ترویج" value={formatNumber(nps)} sub={`${formatNumber(rated.length)} پاسخ`} tone={nps >= 30 ? "success" : "attention"} />
        <Kpi label="در معرض ریزش" value={formatNumber(atRisk.length)} sub="امتیاز سلامت زیر ۶۰" tone={atRisk.length > 0 ? "concern" : "neutral"} />
      </div>

      <Panel>
        <PanelTitle title="فهرست خانوارها" hint={`${formatNumber(rows.length)} مورد`} />
        <FilterBar>
          <FilterField label="جست‌وجو">
            <TextFilter value={query} onChange={setQuery} placeholder="نام خانوار، شهر یا نام حیوان" />
          </FilterField>
          <FilterField label="پلن">
            <SelectFilter
              value={plan}
              onChange={setPlan}
              options={[{ value: "all", label: "همه پلن‌ها" }, ...(Object.keys(PLAN_LABEL) as PlanCode[]).map((p) => ({ value: p, label: PLAN_LABEL[p] }))]}
            />
          </FilterField>
          <FilterField label="کارشناس">
            <SelectFilter value={owner} onChange={setOwner} options={[{ value: "all", label: "همه کارشناسان" }, ...AGENTS.map((a) => ({ value: a.id, label: a.name }))]} />
          </FilterField>
          <FilterField label="وضعیت">
            <SelectFilter
              value={risk}
              onChange={setRisk}
              options={[
                { value: "all", label: "همه" },
                { value: "at_risk", label: "در معرض ریزش" },
                { value: "healthy", label: "سالم" },
              ]}
            />
          </FilterField>
        </FilterBar>

        <TableWrap>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>خانوار</Th>
                <Th>شهر</Th>
                <Th>حیوانات</Th>
                <Th>پلن</Th>
                <Th>سلامت رابطه</Th>
                <Th>رزرو</Th>
                <Th>سفارش</Th>
                <Th>ارزش عمر</Th>
                <Th>رضایت</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={9} label="خانواری با این فیلترها پیدا نشد." />
              ) : (
                rows.map((h) => (
                  <tr
                    key={h.id}
                    tabIndex={0}
                    role="button"
                    onClick={() => setOpenId(h.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpenId(h.id);
                      }
                    }}
                    className="cursor-pointer outline-none hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    <Td>{h.name}</Td>
                    <Td className="text-text-secondary">{h.city}</Td>
                    <Td className="text-text-secondary">{h.pets.map((p) => p.name).join("، ")}</Td>
                    <Td>
                      <Tag tone={PLAN_TONE[h.plan]}>{PLAN_LABEL[h.plan]}</Tag>
                    </Td>
                    <Td>
                      <div className="flex w-20 flex-col gap-1">
                        <span className="tabular-nums">{formatNumber(h.healthScore)}</span>
                        <Meter value={h.healthScore} max={100} tone={h.healthScore >= 75 ? "success" : h.healthScore >= 60 ? "attention" : "urgent"} />
                      </div>
                    </Td>
                    <Td className="tabular-nums">{formatNumber(h.bookings)}</Td>
                    <Td className="tabular-nums">{formatNumber(h.orders)}</Td>
                    <Td className="tabular-nums">{formatIrr(h.lifetimeIrr)}</Td>
                    <Td>
                      <Tag tone={npsTone(h.npsScore)}>{npsLabel(h.npsScore)}</Tag>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableWrap>
      </Panel>

      {selected ? (
        <DetailDrawer title={selected.name} subtitle={`${selected.city} · ${selected.id}`} onClose={() => setOpenId(null)}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Tag tone={PLAN_TONE[selected.plan]}>{PLAN_LABEL[selected.plan]}</Tag>
              <Tag tone={npsTone(selected.npsScore)}>{npsLabel(selected.npsScore)}</Tag>
            </div>

            <div>
              <p className="mb-1.5 text-metadata text-text-secondary">حیوانات</p>
              <ul className="flex flex-wrap gap-2">
                {selected.pets.map((p) => (
                  <li key={p.name} className="rounded-md border border-border-subtle bg-surface-subtle px-2.5 py-1 text-metadata text-text-primary">
                    {p.name} · {p.species}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <DetailRow label="کارشناس موفقیت">{agentName(selected.ownerId)}</DetailRow>
              <DetailRow label="عضویت">{formatNumber(selected.joinedMonthsAgo)} ماه پیش</DetailRow>
              <DetailRow label="رزروها">{formatNumber(selected.bookings)}</DetailRow>
              <DetailRow label="سفارش‌ها">{formatNumber(selected.orders)}</DetailRow>
              <DetailRow label="ارزش عمر">{formatIrr(selected.lifetimeIrr)}</DetailRow>
              <DetailRow label="امتیاز سلامت رابطه">{formatNumber(selected.healthScore)} از ۱۰۰</DetailRow>
            </div>

            <div>
              <p className="mb-1.5 text-metadata text-text-secondary">تیکت‌ها ({formatNumber(selectedTickets.length)})</p>
              {selectedTickets.length === 0 ? (
                <p className="text-metadata text-text-secondary">تیکتی ثبت نشده.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {selectedTickets.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-surface-subtle px-2.5 py-2">
                      <span className="min-w-0 truncate text-metadata text-text-primary">{t.subject}</span>
                      <Tag tone={t.status === "open" ? "concern" : t.status === "waiting" ? "attention" : "success"}>{TICKET_STATUS_LABEL[t.status]}</Tag>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-metadata text-text-secondary">ارتقاها ({formatNumber(selectedUpgrades.length)})</p>
              {selectedUpgrades.length === 0 ? (
                <p className="text-metadata text-text-secondary">پیشنهاد ارتقایی ثبت نشده.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {selectedUpgrades.map((u) => (
                    <li key={u.id} className="flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-surface-subtle px-2.5 py-2">
                      <span className="text-metadata text-text-primary">
                        {PLAN_LABEL[u.fromPlan]} ← {PLAN_LABEL[u.toPlan]}
                      </span>
                      <Tag tone={u.stage === "converted" ? "success" : u.stage === "declined" ? "urgent" : "brand"}>{UPGRADE_STAGE_LABEL[u.stage]}</Tag>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-metadata text-text-secondary">تماس‌ها ({formatNumber(selectedCalls.length)})</p>
              {selectedCalls.length === 0 ? (
                <p className="text-metadata text-text-secondary">تماسی ثبت نشده.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {selectedCalls.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-surface-subtle px-2.5 py-2">
                      <span className="text-metadata text-text-primary">
                        {c.direction === "in" ? "ورودی" : "خروجی"} · {agentName(c.agentId)}
                      </span>
                      <span className="text-metadata text-text-secondary">{relativeDays(c.daysAgo)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </DetailDrawer>
      ) : null}
    </div>
  );
}
