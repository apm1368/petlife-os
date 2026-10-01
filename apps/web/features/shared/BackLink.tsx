"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { ChevronLeft, ChevronRight } from "@petlife/ui";

/** "Back to …" — the arrow points backwards in the reading direction (right in Persian, left in English). */
export function BackLink({ href, label }: { href: string; label: string }) {
  const fa = useLocale() === "fa";
  const Back = fa ? ChevronRight : ChevronLeft;
  return (
    <Link href={href} className="back-link">
      <Back size={16} aria-hidden="true" />
      {label}
    </Link>
  );
}
