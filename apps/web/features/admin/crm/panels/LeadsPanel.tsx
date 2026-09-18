"use client";

import { useMemo, useState } from "react";
import {
  AGENTS,
  LEADS,
  LEAD_KIND_LABEL,
  LEAD_PIPELINE,
  LEAD_SOURCES,
  LEAD_STAGE_LABEL,
  type Lead,
  type LeadKind,
  type LeadStage,
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
  Pipeline,
  SelectFilter,
  TableWrap,
  Tag,
  Td,
  TextFilter,
  Th,
  type Tone,
} from "../../console-ui";

const STAGE_TONE: Record<LeadStage, Tone> = {
  new: "neutral",
  contacted: "brand",
  demo: "attention",
  negotiation: "concern",
  won: "success",
  lost: "urgent",
};

/** A lead's score drives how it is triaged, so it is coloured, not just printed. */
function scoreTone(score: number): Tone {
  if (score >= 80) return "success";
  if (score >= 60) return "brand";
  if (score >= 40) return "attention";
  return "urgent";
}

/** لیدها — acquiring clinics, groomers, pet shops and boarding onto the platform. */
export function LeadsPanel() {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<LeadStage | "all">("all");
  const [kind, setKind] = useState<LeadKind | "all">("all");
  const [owner, setOwner] = useState<string>("all");
  const [source, setSource] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim();
    return LEADS.filter((l) => {
      if (stage !== "all" && l.stage !== stage) return false;
      if (kind !== "all" && l.kind !== kind) return false;
      if (owner !== "all" && l.ownerId !== owner) return false;
      if (source !== "all" && l.source !== source) return false;
      if (q && !`${l.name} ${l.contactName} ${l.city} ${l.id}`.includes(q)) return false;
      return true;
    });
  }, [query, stage, kind, owner, source]);

  const open = rows.filter((l) => l.stage !== "won" && l.stage !== "lost");
  const pipelineValue = open.reduce((sum, l) => sum + l.potentialMonthlyIrr, 0);
  const won = LEADS.filter((l) => l.stage === "won").length;
  const closed = LEADS.filter((l) => l.stage === "won" || l.stage === "lost").length;
  const winRate = closed === 0 ? 0 : Math.round((won / closed) * 100);

  const selected: Lead | undefined = openId ? LEADS.find((l) => l.id === openId) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="لیدهای باز" value={formatNumber(open.length)} />
        <Kpi label="ارزش ماهانه قیف" value={formatIrr(pipelineValue)} tone="brand" />
        <Kpi label="نرخ تبدیل" value={`${formatNumber(winRate)}٪`} sub={`${formatNumber(won)} از ${formatNumber(closed)} پرونده بسته‌شده`} tone={winRate >= 50 ? "success" : "attention"} />
        <Kpi label="میانگین امتیاز" value={formatNumber(open.length === 0 ? 0 : Math.round(open.reduce((s, l) => s + l.score, 0) / open.length))} />
      </div>

      <Panel>
        <PanelTitle title="قیف فروش" hint="بر اساس فیلترهای فعلی" />
        <Pipeline stages={LEAD_PIPELINE.map((s) => ({ label: LEAD_STAGE_LABEL[s], count: rows.filter((l) => l.stage === s).length }))} />
      </Panel>

      <Panel>
        <PanelTitle title="فهرست لیدها" hint={`${formatNumber(rows.length)} مورد`} />
        <FilterBar>
          <FilterField label="جست‌وجو">
            <TextFilter value={query} onChange={setQuery} placeholder="نام کسب‌وکار، شهر یا کد" />
          </FilterField>
          <FilterField label="مرحله">
            <SelectFilter
              value={stage}
              onChange={setStage}
              options={[{ value: "all", label: "همه مراحل" }, ...(Object.keys(LEAD_STAGE_LABEL) as LeadStage[]).map((s) => ({ value: s, label: LEAD_STAGE_LABEL[s] }))]}
            />
          </FilterField>
          <FilterField label="نوع کسب‌وکار">
            <SelectFilter
              value={kind}
              onChange={setKind}
              options={[{ value: "all", label: "همه انواع" }, ...(Object.keys(LEAD_KIND_LABEL) as LeadKind[]).map((k) => ({ value: k, label: LEAD_KIND_LABEL[k] }))]}
            />
          </FilterField>
          <FilterField label="کارشناس">
            <SelectFilter value={owner} onChange={setOwner} options={[{ value: "all", label: "همه کارشناسان" }, ...AGENTS.map((a) => ({ value: a.id, label: a.name }))]} />
          </FilterField>
          <FilterField label="منبع">
            <SelectFilter value={source} onChange={setSource} options={[{ value: "all", label: "همه منابع" }, ...LEAD_SOURCES.map((s) => ({ value: s, label: s }))]} />
          </FilterField>
        </FilterBar>

        <TableWrap>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>کسب‌وکار</Th>
                <Th>نوع</Th>
                <Th>شهر</Th>
                <Th>مرحله</Th>
                <Th>امتیاز</Th>
                <Th>ارزش ماهانه</Th>
                <Th>کارشناس</Th>
                <Th>آخرین تماس</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={8} label="لیدی با این فیلترها پیدا نشد." />
              ) : (
                rows.map((l) => (
                  <tr
                    key={l.id}
                    tabIndex={0}
                    role="button"
                    onClick={() => setOpenId(l.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setOpenId(l.id);
                      }
                    }}
                    className="cursor-pointer outline-none hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    <Td>{l.name}</Td>
                    <Td className="text-text-secondary">{LEAD_KIND_LABEL[l.kind]}</Td>
                    <Td className="text-text-secondary">{l.city}</Td>
                    <Td>
                      <Tag tone={STAGE_TONE[l.stage]}>{LEAD_STAGE_LABEL[l.stage]}</Tag>
                    </Td>
                    <Td>
                      <div className="flex w-20 flex-col gap-1">
                        <span className="tabular-nums">{formatNumber(l.score)}</span>
                        <Meter value={l.score} max={100} tone={scoreTone(l.score)} />
                      </div>
                    </Td>
                    <Td className="tabular-nums">{formatIrr(l.potentialMonthlyIrr)}</Td>
                    <Td className="text-text-secondary">{agentName(l.ownerId)}</Td>
                    <Td className="text-text-secondary">{relativeDays(l.lastTouchDays)}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableWrap>
      </Panel>

      {selected ? (
        <DetailDrawer title={selected.name} subtitle={`${LEAD_KIND_LABEL[selected.kind]} · ${selected.city}`} onClose={() => setOpenId(null)}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Tag tone={STAGE_TONE[selected.stage]}>{LEAD_STAGE_LABEL[selected.stage]}</Tag>
              <Tag tone={scoreTone(selected.score)}>امتیاز {formatNumber(selected.score)}</Tag>
            </div>

            <div>
              <DetailRow label="کد لید">{selected.id}</DetailRow>
              <DetailRow label="شخص رابط">{selected.contactName}</DetailRow>
              <DetailRow label="تلفن">{selected.phone}</DetailRow>
              <DetailRow label="منبع">{selected.source}</DetailRow>
              <DetailRow label="کارشناس">{agentName(selected.ownerId)}</DetailRow>
              <DetailRow label="ارزش ماهانه برآوردی">{formatIrr(selected.potentialMonthlyIrr)}</DetailRow>
              <DetailRow label="عمر لید">{relativeDays(selected.ageDays)}</DetailRow>
              <DetailRow label="آخرین تماس">{relativeDays(selected.lastTouchDays)}</DetailRow>
              {selected.lostReason ? <DetailRow label="دلیل از دست رفتن">{selected.lostReason}</DetailRow> : null}
            </div>

            <div>
              <p className="mb-1 text-metadata text-text-secondary">یادداشت</p>
              <p className="rounded-md border border-border-subtle bg-surface-subtle p-2.5 text-metadata leading-relaxed text-text-primary">{selected.note}</p>
            </div>

            <p className="text-metadata text-text-secondary">
              این پرونده نمونه است و به API متصل نیست، بنابراین دکمه ثبت اقدام عمداً گذاشته نشده — تا وقتی بک‌اند CRM ساخته شود، هیچ نوشتنی در کار نیست.
            </p>
          </div>
        </DetailDrawer>
      ) : null}
    </div>
  );
}
