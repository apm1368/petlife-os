"use client";

import { useMemo, useState } from "react";
import { CA_AGENTS, CHANGE_LOG, caAgentName, relativeHours } from "../ca-sample-data";
import { EmptyRow, FilterBar, FilterField, Panel, PanelTitle, SelectFilter, TableWrap, Td, TextFilter, Th, formatNumber } from "../../console-ui";

/**
 * لاگ تغییرات — who changed what, and what the value was before.
 *
 * Recording the previous value is the whole point: "priority changed" answers
 * nothing, "بالا → بحرانی" answers the question a supervisor is actually asking.
 */
export function ChangeLogPanel() {
  const [query, setQuery] = useState("");
  const [actor, setActor] = useState<string>("all");
  const [entity, setEntity] = useState<string>("all");

  const entities = useMemo(() => Array.from(new Set(CHANGE_LOG.map((e) => e.entity))), []);

  const rows = useMemo(() => {
    const q = query.trim();
    return CHANGE_LOG.filter((e) => {
      if (actor !== "all" && e.actorId !== actor) return false;
      if (entity !== "all" && e.entity !== entity) return false;
      if (q && !`${e.action} ${e.recordId} ${e.after ?? ""} ${e.before ?? ""}`.includes(q)) return false;
      return true;
    });
  }, [query, actor, entity]);

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <PanelTitle title="لاگ تغییرات" hint={`${formatNumber(rows.length)} رکورد`} />
        <FilterBar>
          <FilterField label="جست‌وجو">
            <TextFilter value={query} onChange={setQuery} placeholder="اقدام، شناسه یا مقدار" />
          </FilterField>
          <FilterField label="کاربر">
            <SelectFilter value={actor} onChange={setActor} options={[{ value: "all", label: "همه کاربران" }, ...CA_AGENTS.map((a) => ({ value: a.id, label: a.name }))]} />
          </FilterField>
          <FilterField label="موجودیت">
            <SelectFilter value={entity} onChange={setEntity} options={[{ value: "all", label: "همه موجودیت‌ها" }, ...entities.map((e) => ({ value: e, label: e }))]} />
          </FilterField>
        </FilterBar>

        <TableWrap>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>زمان</Th>
                <Th>کاربر</Th>
                <Th>موجودیت</Th>
                <Th>رکورد</Th>
                <Th>اقدام</Th>
                <Th>مقدار قبلی</Th>
                <Th>مقدار جدید</Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={7} label="رکوردی با این فیلترها نیست." />
              ) : (
                rows.map((e) => (
                  <tr key={e.id} className="hover:bg-surface-subtle">
                    <Td className="text-text-secondary">{relativeHours(e.hoursAgo)} پیش</Td>
                    <Td>{caAgentName(e.actorId)}</Td>
                    <Td className="text-text-secondary">{e.entity}</Td>
                    <Td className="text-text-secondary">{e.recordId}</Td>
                    <Td>{e.action}</Td>
                    <Td className="text-text-secondary">{e.before ?? "—"}</Td>
                    <Td>{e.after ?? "—"}</Td>
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
