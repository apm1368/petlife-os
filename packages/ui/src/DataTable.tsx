import type { ReactNode } from "react";
import { cn } from "./cn";
import { ComponentStateView, type ComponentState } from "./ComponentState";

export interface DataTableColumn<Row> {
  id: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  className?: string;
}

/** DS-16 dense, horizontally-scrollable backoffice/partner table. */
export interface DataTableProps<Row> {
  columns: readonly DataTableColumn<Row>[];
  rows: readonly Row[];
  getRowKey: (row: Row) => string;
  caption: string;
  state?: ComponentState;
  className?: string;
}

export function DataTable<Row>({ columns, rows, getRowKey, caption, state, className }: DataTableProps<Row>) {
  return (
    <ComponentStateView state={state ?? (rows.length ? "ready" : "empty")} empty={{ title: "موردی برای نمایش نیست" }} skeletonClassName="h-56 w-full">
      <div className={cn("overflow-x-auto border-y border-border-subtle", className)}>
        <table className="w-full min-w-max border-collapse text-start text-metadata text-text-primary">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-surface-subtle text-text-secondary">
            <tr>{columns.map((column) => <th key={column.id} scope="col" className={cn("px-3 py-3 text-start font-semibold", column.className)}>{column.header}</th>)}</tr>
          </thead>
          <tbody>{rows.map((row) => <tr key={getRowKey(row)} className="border-t border-border-subtle hover:bg-surface-subtle">{columns.map((column) => <td key={column.id} className={cn("px-3 py-3", column.className)}>{column.cell(row)}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </ComponentStateView>
  );
}
