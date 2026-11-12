import { Suspense } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { Skeleton } from "@petlife/ui";
import { ProviderDiscoveryView } from "@/features/discovery/ProviderDiscoveryView";
import { serviceCategoryFromSlug, serviceCategoryPath, serviceCategorySlug } from "@/lib/services/category-slug";

/** /{locale}/services/{slug}: lowercase hyphenated slugs (grooming, pet-taxi) are the canonical form; other spellings 308. */
export default async function ServiceResultsPage({ params }: { params: Promise<{ locale: string; category: string }> }) {
  const { locale, category } = await params;
  const code = serviceCategoryFromSlug(category);
  if (!code) notFound();
  if (category !== serviceCategorySlug(code)) permanentRedirect(serviceCategoryPath(locale, code));
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ProviderDiscoveryView category={code} />
    </Suspense>
  );
}
