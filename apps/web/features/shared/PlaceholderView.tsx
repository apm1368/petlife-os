"use client";

import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { EmptyState } from "@petlife/ui";

export function PlaceholderView({ title, description }: { title: string; description: string }) {
  const router = useRouter();
  const locale = useLocale();
  return (
    <EmptyState title={title} description={description} actionLabel={locale === "fa" ? "بازگشت" : "Back"} onAction={() => router.back()} />
  );
}
