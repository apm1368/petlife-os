"use client";

import { useRouter } from "next/navigation";
import { EmptyState } from "@petlife/ui";

export function PlaceholderView({ title, description }: { title: string; description: string }) {
  const router = useRouter();
  return (
    <EmptyState title={title} description={description} actionLabel="Back" onAction={() => router.back()} />
  );
}
