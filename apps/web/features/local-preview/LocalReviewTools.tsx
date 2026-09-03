"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useLocalPreview } from "./LocalPreviewGate";
import { reviewRoutes } from "./routes";
import { sanitizeReturnTo } from "@/lib/auth/return-to";

const authRoutes = ["/welcome", "/register", "/account", "/account/forgot", "/account/reset", "/auth/complete"];

/** Local-only navigation aid, not a role switcher or an authentication mechanism. */
export function LocalReviewTools({ children }: { children: React.ReactNode }) {
  const preview = useLocalPreview();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const relative = pathname.slice(locale.length + 1);
  const authPage = authRoutes.includes(relative);
  useEffect(() => {
    if (!preview || !authPage) return;
    const destination = sanitizeReturnTo(new URLSearchParams(window.location.search).get("returnTo"), `/${locale}/home`);
    const targetPath = destination.split("?")[0] ?? "";
    const isAuthTarget = authRoutes.some(path => targetPath === `/${locale}${path}`);
    router.replace(isAuthTarget ? `/${locale}/home` : destination);
  }, [preview, authPage, locale, router]);

  if (preview === null) return null;
  if (!preview) return <>{children}</>;
  const groups = [
    { label: locale === "fa" ? "عمومی و برنامه" : "Public & app", prefix: "" },
    { label: locale === "fa" ? "ارائه‌دهنده" : "Provider", prefix: "/provider" },
    { label: locale === "fa" ? "فروشنده" : "Seller", prefix: "/seller" },
    { label: locale === "fa" ? "ادمین" : "Admin", prefix: "/admin" },
  ];
  return <>
    {authPage ? <p className="p-6" role="status">{locale === "fa" ? "در حال باز کردن صفحه بدون ورود…" : "Opening page without sign-in…"}</p> : children}
    <details key={pathname} className="fixed bottom-3 end-3 z-[200] max-w-[calc(100vw-1.5rem)] rounded-xl border border-border-subtle bg-surface-base p-3 text-text-primary shadow-lg">
      <summary className="cursor-pointer text-metadata font-medium">{locale === "fa" ? "صفحات · پیش‌نمایش محلی" : "Pages · Local preview"}</summary>
      <nav aria-label={locale === "fa" ? "تمام صفحات محلی" : "All local pages"} className="mt-3 grid max-h-[65dvh] w-[620px] max-w-full grid-cols-1 gap-4 overflow-y-auto overscroll-contain sm:grid-cols-2">
        {groups.map(group => <section key={group.prefix}>
          <h2 className="mb-2 text-body font-medium">{group.label}</h2>
          <div className="flex flex-col gap-1">
            {reviewRoutes.filter(path => !authRoutes.includes(path) && (group.prefix ? path === group.prefix || path.startsWith(`${group.prefix}/`) : !/^\/(admin|provider|seller)(\/|$)/.test(path))).map(path => (
              <Link key={path} href={`/${locale}${path}`} aria-current={relative === path ? "page" : undefined} className="rounded-lg px-2 py-2 text-metadata hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2">
                <bdi>{path || "PET LIFE OS"}</bdi>
              </Link>
            ))}
          </div>
        </section>)}
      </nav>
    </details>
  </>;
}
