"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { isLocalPreview } from "@/lib/local-preview";
import { ProductNavigation } from "@/features/navigation/ProductNavigation";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import { LocaleSwitcher } from "@/features/locale/LocaleSwitcher";

export function useLocalPreview() {
  const [preview, setPreview] = useState<boolean | null>(process.env.NEXT_PUBLIC_LOCAL_PREVIEW === "1" ? null : false);
  useEffect(() => setPreview(isLocalPreview()), []);
  return preview;
}

/** The real shell is not mounted in preview: no auth redirect, no fabricated role/session. */
export function LocalPreviewGate({ children, live, title, items = [] }: {
  children: React.ReactNode;
  live: React.ReactNode;
  title: string;
  items?: { href: string; label: string }[];
}) {
  const preview = useLocalPreview();
  const locale = useLocale();
  if (preview === null) return null;
  if (!preview) return <>{live}</>;
  return (
    <div className="min-h-screen bg-surface-base">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
        <Link href={`/${locale}`} className="text-section-title">PET LIFE OS · {title}</Link>
        <div className="flex items-center gap-2"><LocaleSwitcher /><ThemeToggle /></div>
      </header>
      <ProductNavigation audience="consumer" />
      {items.length > 0 && <nav aria-label={title} className="flex flex-wrap gap-2 border-b border-border-subtle px-4 py-2">
        {items.map(item => <Link key={item.href} href={item.href} className="rounded-full px-3 py-2 text-metadata hover:bg-surface-subtle">{item.label}</Link>)}
      </nav>}
      <main className="mx-auto max-w-4xl px-4 py-6 pb-24">
        <p className="mb-4 rounded-xl border border-border-subtle bg-surface-subtle p-3 text-metadata text-text-secondary" role="status">
          {locale === "fa" ? "پیش‌نمایش محلی بدون ورود. اطلاعات خصوصی به اتصال API و نشست معتبر نیاز دارد؛ عملیات ذخیره و پرداخت در این حالت غیرفعال است." : "Local preview without sign-in. Private data requires a connected API and valid session; saving and payments are disabled in this mode."}
        </p>
        {children}
      </main>
    </div>
  );
}
