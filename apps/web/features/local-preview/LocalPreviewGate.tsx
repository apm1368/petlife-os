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
      {items.length === 0 && <ProductNavigation audience="consumer" />}
      <div className={items.length > 0 ? "lg:grid lg:grid-cols-[240px_minmax(0,1fr)]" : ""}>
      {items.length > 0 && <nav aria-label={title} className="flex gap-1 overflow-x-auto border-b border-border-subtle bg-surface-elevated p-3 lg:sticky lg:top-0 lg:h-[calc(100dvh-72px)] lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-e">
        {items.map(item => <Link key={item.href} href={item.href} className="shrink-0 rounded-md px-3 py-3 text-metadata text-text-secondary transition-colors hover:bg-surface-subtle hover:text-brand-natural focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">{item.label}</Link>)}
      </nav>}
      <main className="mx-auto w-full min-w-0 max-w-5xl px-4 py-6 pb-24 lg:px-8">
        <p className="mb-4 rounded-xl border border-border-subtle bg-surface-subtle p-3 text-metadata text-text-secondary" role="status">
          {locale === "fa" ? "پیش‌نمایش محلی بدون ورود. اطلاعات خصوصی به اتصال API و نشست معتبر نیاز دارد؛ عملیات ذخیره و پرداخت در این حالت غیرفعال است." : "Local preview without sign-in. Private data requires a connected API and valid session; saving and payments are disabled in this mode."}
        </p>
        {children}
      </main>
      </div>
    </div>
  );
}
