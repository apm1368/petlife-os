"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { sellerOsService } from "@/services/seller-os.service";
import { useSellerStore } from "@/stores/seller-store";

/** Seller pages require a real organization ID. Never substitute a sample ID or fake balances. */
export function SellerPreviewContent({ children }: { children: React.ReactNode }) {
  const locale = useLocale();
  const [ready, setReady] = useState(false);
  const active = useSellerStore(s => s.context?.active);
  useEffect(() => {
    let cancelled = false;
    sellerOsService.getContext().then(context => {
      if (!cancelled) useSellerStore.getState().setContext(context);
    }).catch(() => {
      if (!cancelled) useSellerStore.setState({ context: null, status: "idle" });
    }).finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);
  if (ready && active) return <>{children}</>;
  return <section className="rounded-xl border border-border-subtle p-6" role="status">
    <h1 className="text-section-title">{locale === "fa" ? "پنل فروشنده" : "Seller workspace"}</h1>
    <p className="mt-2 text-body text-text-secondary">{locale === "fa"
      ? (ready ? "منوهای پنل باز هستند. نمایش موجودی، سفارش‌ها و امور مالی به اتصال دیتابیس و سازمان فروشندهٔ واقعی نیاز دارد؛ هنوز داده‌ای بارگذاری نشده است." : "در حال بررسی اتصال داده‌های محلی…")
      : (ready ? "Portal navigation is available. Inventory, orders and finance need a connected database and a real seller organization; data has not loaded." : "Checking local data connection…")}</p>
  </section>;
}
