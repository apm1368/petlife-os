"use client";

import { useMemo, useState } from "react";
import {
  AGENTS,
  HOUSEHOLDS,
  PLAN_LABEL,
  UPGRADES,
  UPGRADE_PIPELINE,
  UPGRADE_STAGE_LABEL,
  type PlanCode,
  type UpgradeStage,
  agentName,
  formatIrr,
  formatNumber,
  householdName,
  relativeDays,
} from "../crm-sample-data";
import {
  EmptyRow,
  FilterBar,
  FilterField,
  Kpi,
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
} from "../crm-ui";

const STAGE_TONE: Record<UpgradeStage, Tone> = {
  identified: "neutral",
  reached: "brand",
  trial: "attention",
  invoiced: "concern",
  converted: "success",
  declined: "urgent",
};

const PLAN_TONE: Record<PlanCode, Tone> = { free: "neutral", plus: "brand", premium: "success" };

/**
 * ارتقای اشتراک — households that have outgrown their plan.
 *
 * Every row states *why* the upgrade was suggested (a limit actually hit),
 * because an upgrade nudge without a reason is just a sales pitch.
 */
export function UpgradesPanel() {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState<UpgradeStage | "all">("all");
  const [target, setTarget] = useState<PlanCode | "all">("all");
  const [owner, setOwner] = useState<string>("all");

  const rows = useMemo(() => {
    const q = query.trim();
    return UPGRADES.filter((u) => {
      if (stage !== "all" && u.stage !== stage) return false;
      if (target !== "all" && u.toPlan !== target) return false;
      if (owner !== "all" && u.ownerId !== owner) return false;
      if (q && !`${householdName(u.householdId)} ${u.id}`.includes(q)) return false;
      return true;
    });
  }, [query, stage, target, owner]);

  const live = rows.filter((u) => u.stage !== "converted" && u.stage !== "declined");
  const converted = UPGRADES.filter((u) => u.stage === "converted");
  const decided = UPGRADES.filter((u) => u.stage === "converted" || u.stage === "declined").length;
  const conversionRate = decided === 0 ? 0 : Math.round((converted.length / decided) * 100);
  const mrrAtStake = live.reduce((sum, u) => sum + u.monthlyIrr, 0);
  const mrrWon = converted.reduce((sum, u) => sum + u.monthlyIrr, 0);

  // Plan mix across every household, so the upgrade queue sits next to the base it draws from.
  const planMix = (Object.keys(PLAN_LABEL) as PlanCode[]).map((p) => ({ plan: p, count: HOUSEHOLDS.filter((h) => h.plan === p).length }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="ارتقاهای در جریان" value={formatNumber(live.length)} />
        <Kpi label="درآمد ماهانه در انتظار" value={formatIrr(mrrAtStake)} tone="brand" />
        <Kpi label="نرخ تبدیل ارتقا" value={`${formatNumber(conversionRate)}٪`} sub={`${formatNumber(converted.length)} از ${formatNumber(decided)}`} tone={conversionRate >= 50 ? "success" : "attention"} />
        <Kpi label="درآمد ماهانه تحقق‌یافته" value={formatIrr(mrrWon)} tone="success" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <PanelTitle title="مسیر ارتقا" hint="بر اساس فیلترهای فعلی" />
          <Pipeline stages={UPGRADE_PIPELINE.map((s) => ({ label: UPGRADE_STAGE_LABEL[s], count: rows.filter((u) => u.stage === s).length }))} />
        </Panel>

        <Panel>
          <PanelTitle title="ترکیب پلن خانوارها" hint="پایه‌ای که ارتقا از آن می‌آید" />
          <ul className="flex flex-col gap-2">
            {planMix.map(({ plan, count }) => (
              <li key={plan} className="flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-surface-subtle px-2.5 py-2">
                <Tag tone={PLAN_TONE[plan]}>{PLAN_LABEL[plan]}</Tag>
                <span className="text-metadata tabular-nums text-text-primary">
                  {formatNumber(count)} خانوار · {formatNumber(HOUSEHOLDS.length === 0 ? 0 : Math.round((count / HOUSEHOLDS.length) * 100))}٪
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel>
        <PanelTitle title="صف ارتقا" hint={`${formatNumber(rows.length)} مورد`} />
        <FilterBar>
          <FilterField label="جست‌وجو">
            <TextFilter value={query} onChange={setQuery} placeholder="نام خانوار یا کد" />
          </FilterField>
          <FilterField label="مرحله">
            <SelectFilter
              value={stage}
              onChange={setStage}
              options={[{ value: "all", label: "همه مراحل" }, ...(Object.keys(UPGRADE_STAGE_LABEL) as UpgradeStage[]).map((s) => ({ value: s, label: UPGRADE_STAGE_LABEL[s] }))]}
            />
          </FilterField>
          <FilterField label="پلن مقصد">
            <SelectFilter
              value={target}
              onChange={setTarget}
              options={[{ value: "all", label: "همه پلن‌ها" }, ...(Object.keys(PLAN_LABEL) as PlanCode[]).map((p) => ({ value: p, label: PLAN_LABEL[p] }))]}
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
                <Th>خانوار</Th>
                <Th>از پلن</Th>
                <Th>به پلن</Th>
                <Th>مرحله</Th>
                <Th>دلیل پیشنهاد</Th>
                <Th>درآمد ماهانه</Th>
                <Th>کارشناس</Th>
                <Th>آخرین تماس</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={8} label="موردی با این فیلترها پیدا نشد." />
              ) : (
                rows.map((u) => (
                  <tr key={u.id} className="hover:bg-surface-subtle">
                    <Td>{householdName(u.householdId)}</Td>
                    <Td>
                      <Tag tone={PLAN_TONE[u.fromPlan]}>{PLAN_LABEL[u.fromPlan]}</Tag>
                    </Td>
                    <Td>
                      <Tag tone={PLAN_TONE[u.toPlan]}>{PLAN_LABEL[u.toPlan]}</Tag>
                    </Td>
                    <Td>
                      <Tag tone={STAGE_TONE[u.stage]}>{UPGRADE_STAGE_LABEL[u.stage]}</Tag>
                    </Td>
                    <Td className="max-w-[16rem] truncate whitespace-normal text-text-secondary">{u.reason}</Td>
                    <Td className="tabular-nums">{formatIrr(u.monthlyIrr)}</Td>
                    <Td className="text-text-secondary">{agentName(u.ownerId)}</Td>
                    <Td className="text-text-secondary">{relativeDays(u.lastTouchDays)}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TableWrap>
      </Panel>
    </div>
  );
}
