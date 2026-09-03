import type { Locale as ContentLocale } from "@petlife/types";
import { AdminContentVersionHistoryView } from "@/features/content/AdminContentVersionHistoryView";

export default async function AdminContentVersionsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ locale?: string }> }) {
  const { id } = await params;
  const { locale } = await searchParams;
  return <AdminContentVersionHistoryView articleId={id} locale={(locale as ContentLocale | undefined) ?? "fa"} />;
}
