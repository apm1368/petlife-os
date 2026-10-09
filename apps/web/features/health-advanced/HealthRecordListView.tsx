"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ContextSurface, EmptyState, ErrorRecovery, Skeleton } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";

/**
 * Shared shell for the six provider-authored, read-only record lists (Labs,
 * Imaging, Referrals, Dental, Nutrition, Rehab) — each has its own route and
 * its own empty-state copy (spec: "No lab results recorded", never "Labs
 * normal"), but the same loading/error/empty/list shape, so this is the one
 * place that shape lives rather than six near-identical components.
 */
export function HealthRecordListView<T>({
  petId,
  title,
  emptyTitle,
  fetcher,
  renderItem,
  keyOf,
}: {
  petId: string;
  title: string;
  emptyTitle: string;
  fetcher: (petId: string) => Promise<T[]>;
  renderItem: (item: T) => ReactNode;
  keyOf: (item: T) => string;
}) {
  const tCommon = useTranslations("common");
  const pathname = usePathname();
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setItems(await fetcher(petId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  if (error) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!items) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title text-text-primary">{title}</h1>
      {items.length === 0 ? (
        <EmptyState title={emptyTitle} />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => {
            const key = keyOf(item);
            return <Link key={key} href={`${pathname}/${key}`} className="block rounded-lg outline-none ring-brand-natural focus-visible:ring-2">
              <ContextSurface className="flex flex-col gap-1 transition-colors hover:bg-surface-subtle">
                {renderItem(item)}
              </ContextSurface>
            </Link>;
          })}
        </div>
      )}
    </div>
  );
}
