"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import { Button, Dialog, EmptyState, ErrorRecovery, Input, Skeleton } from "@petlife/ui";
import type { AdminCommerceAnalyticsDto, AdminCommerceOrderDetailDto, AdminCommerceOrderRowDto, AdminInventoryRowDto, AdminProductReviewRowDto, AdminProductRowDto, AdminRefundRequestDto, AdminSellerRowDto, PaginatedDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import { adminCommerceService } from "@/services/admin-commerce.service";
import { PromotionManager, type PromotionApi } from "@/features/commerce/PromotionManager";
import { DetailRow, EmptyRow, FilterBar, FilterField, Kpi, Panel, PanelTitle, SelectFilter, TableWrap, Tag, Td, TextFilter, Th } from "../console-ui";

type Lang = "fa" | "en";
type LoadError = "forbidden" | "notFound" | "error" | null;

function useLang(): { lang: Lang; fa: boolean } {
  const lang = useLocale() as Lang;
  return { lang, fa: lang === "fa" };
}

function num(value: number, lang: Lang) {
  return value.toLocaleString(lang === "fa" ? "fa-IR" : "en-US");
}

function when(value: string, lang: Lang) {
  return new Intl.DateTimeFormat(lang === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function errorOf(e: unknown): LoadError {
  if (e instanceof ApiError && e.status === 403) return "forbidden";
  if (e instanceof ApiError && e.status === 404) return "notFound";
  return "error";
}

const ORDER_STATUS: Record<string, { fa: string; en: string }> = {
  PENDING: { fa: "در انتظار", en: "Pending" },
  CONFIRMED: { fa: "تأییدشده", en: "Confirmed" },
  CANCELLED: { fa: "لغوشده", en: "Cancelled" },
  PARTIALLY_REFUNDED: { fa: "بازپرداخت جزئی", en: "Partially refunded" },
  REFUNDED: { fa: "بازپرداخت‌شده", en: "Refunded" },
};

const FULFILLMENT: Record<string, { fa: string; en: string }> = {
  PENDING: { fa: "در صف", en: "Queued" },
  AWAITING_SELLER_PREPARATION: { fa: "در حال آماده‌سازی", en: "Preparing" },
  READY_FOR_PICKUP: { fa: "آماده تحویل به پیک", en: "Ready for pickup" },
  PICKUP_REQUESTED: { fa: "درخواست پیک", en: "Pickup requested" },
  PICKUP_ASSIGNED: { fa: "پیک تعیین شد", en: "Courier assigned" },
  PICKED_UP: { fa: "تحویل پیک شد", en: "Picked up" },
  IN_TRANSIT: { fa: "در مسیر", en: "In transit" },
  OUT_FOR_DELIVERY: { fa: "در حال تحویل", en: "Out for delivery" },
  DELIVERED: { fa: "تحویل شد", en: "Delivered" },
  FAILED: { fa: "ناموفق", en: "Failed" },
  CANCELED: { fa: "لغو شد", en: "Cancelled" },
};

const REFUND_REASON: Record<string, { fa: string; en: string }> = {
  DAMAGED: { fa: "آسیب‌دیده", en: "Damaged" },
  WRONG_ITEM: { fa: "کالای اشتباه", en: "Wrong item" },
  NOT_AS_DESCRIBED: { fa: "مغایر با توضیحات", en: "Not as described" },
  MISSING_ITEMS: { fa: "کسری اقلام", en: "Missing items" },
  NOT_DELIVERED: { fa: "تحویل نشده", en: "Not delivered" },
  PET_REACTION: { fa: "واکنش حیوان", en: "Pet reaction" },
  OTHER: { fa: "سایر", en: "Other" },
};

const REQUEST_STATUS: Record<string, { fa: string; en: string }> = {
  PENDING_REVIEW: { fa: "در انتظار بررسی", en: "Pending review" },
  APPROVED: { fa: "تأیید و ارسال به مالی", en: "Approved → finance" },
  REJECTED: { fa: "رد شد", en: "Rejected" },
  WITHDRAWN: { fa: "انصراف مشتری", en: "Withdrawn" },
};

const PRODUCT_STATUS: Record<string, { fa: string; en: string }> = {
  DRAFT: { fa: "پیش‌نویس", en: "Draft" },
  ACTIVE: { fa: "فعال", en: "Active" },
  INACTIVE: { fa: "غیرفعال", en: "Inactive" },
  ARCHIVED: { fa: "بایگانی", en: "Archived" },
};

function label(map: Record<string, { fa: string; en: string }>, key: string | null | undefined, lang: Lang) {
  if (!key) return "—";
  return map[key]?.[lang] ?? key;
}

/** Sub-navigation for the admin Commerce area. */
export function AdminCommerceNav() {
  const { lang, fa } = useLang();
  const pathname = usePathname();
  const base = `/${lang}/admin/commerce`;
  const items = [
    { href: base, fa: "نمای کلی", en: "Overview" },
    { href: `${base}/orders`, fa: "سفارش‌ها", en: "Orders" },
    { href: `${base}/refund-requests`, fa: "درخواست‌های بازگشت وجه", en: "Refund requests" },
    { href: `${base}/products`, fa: "کالاها", en: "Products" },
    { href: `${base}/reviews`, fa: "نظرات", en: "Reviews" },
    { href: `${base}/inventory`, fa: "موجودی", en: "Inventory" },
    { href: `${base}/sellers`, fa: "فروشندگان", en: "Sellers" },
    { href: `${base}/promotions`, fa: "تخفیف‌ها", en: "Promotions" },
  ];
  return (
    <nav aria-label={fa ? "بخش فروشگاه" : "Commerce section"} className="mb-4 flex gap-1 overflow-x-auto border-b border-border-subtle">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={pathname === i.href ? "page" : undefined} className={`whitespace-nowrap px-3 py-2 text-sm ${pathname === i.href ? "border-b-2 border-brand-natural font-bold" : "text-text-secondary"}`}>
          {fa ? i.fa : i.en}
        </Link>
      ))}
    </nav>
  );
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="mb-3 text-page-title">{title}</h1>
      <AdminCommerceNav />
      {children}
    </div>
  );
}

function StateBlock({ error, permission, onRetry }: { error: LoadError; permission: string; onRetry: () => void }) {
  const { fa } = useLang();
  if (error === "forbidden") return <EmptyState title={fa ? `دسترسی ${permission} لازم است` : `${permission} permission required`} />;
  if (error === "notFound") return <EmptyState title={fa ? "پیدا نشد" : "Not found"} />;
  if (error) return <ErrorRecovery title={fa ? "بارگیری نشد" : "Could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Retry"} onRetry={onRetry} />;
  return null;
}

function Pager<T>({ data, page, onPage }: { data: PaginatedDto<T>; page: number; onPage: (p: number) => void }) {
  const { lang, fa } = useLang();
  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      <span>
        {num(data.total, lang)} {fa ? "مورد" : "items"}
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" disabled={page === 1} onClick={() => onPage(page - 1)}>
          {fa ? "قبلی" : "Previous"}
        </Button>
        <Button size="sm" variant="ghost" disabled={page * data.pageSize >= data.total} onClick={() => onPage(page + 1)}>
          {fa ? "بعدی" : "Next"}
        </Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ overview

export function AdminCommerceOverviewView() {
  const { lang, fa } = useLang();
  const [days, setDays] = useState("30");
  const [data, setData] = useState<AdminCommerceAnalyticsDto | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await adminCommerceService.analytics(Number(days)));
    } catch (e) {
      setError(errorOf(e));
    }
  }, [days]);
  useEffect(() => void load(), [load]);

  const maxDay = useMemo(() => Math.max(1, ...(data?.byDay.map((d) => d.grossSales) ?? [1])), [data]);

  return (
    <Frame title={fa ? "فروشگاه" : "Commerce"}>
      <Panel>
        <FilterBar>
          <FilterField label={fa ? "بازه" : "Period"}>
            <SelectFilter value={days} onChange={setDays} options={[{ value: "7", label: fa ? "۷ روز" : "7 days" }, { value: "30", label: fa ? "۳۰ روز" : "30 days" }, { value: "90", label: fa ? "۹۰ روز" : "90 days" }]} />
          </FilterField>
        </FilterBar>
        <StateBlock error={error} permission="commerce.view" onRetry={load} />
        {!data && !error ? <Skeleton className="h-40 w-full" /> : null}
        {data ? (
          <>
            <p className="mb-3 text-metadata text-text-secondary">{fa ? "فقط سفارش‌های پرداخت‌شده در پت‌لایف؛ سفارش‌های لغو یا بازپرداخت‌شده در فروش حساب نمی‌شوند." : "PET LIFE checkout orders only; cancelled or refunded orders are excluded from sales."}</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi label={fa ? "سفارش" : "Orders"} value={num(data.orderCount, lang)} />
              <Kpi label={fa ? "فروش" : "Gross sales"} value={formatCurrency(data.grossSales, lang)} tone="brand" />
              <Kpi label={fa ? "میانگین سفارش" : "Average order"} value={data.averageOrderValue !== null ? formatCurrency(data.averageOrderValue, lang) : "—"} />
              <Kpi label={fa ? "تخفیف داده‌شده" : "Discount given"} value={formatCurrency(data.discountGiven, lang)} />
              <Kpi label={fa ? "لغوشده" : "Cancelled"} value={num(data.cancelledCount, lang)} tone={data.cancelledCount ? "attention" : "neutral"} />
              <Kpi label={fa ? "بازپرداخت‌شده" : "Refunded"} value={num(data.refundedCount, lang)} tone={data.refundedCount ? "attention" : "neutral"} />
              <Kpi label={fa ? "درخواست بازگشت وجه" : "Refund requests"} value={num(data.refundRequestCount, lang)} />
              <Kpi label={fa ? "ارسال دوره‌ای فعال" : "Active repeat deliveries"} value={num(data.repeatDeliveryActive, lang)} />
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div className="min-w-0">
                <PanelTitle title={fa ? "فروش روزانه" : "Daily sales"} />
                {data.byDay.length === 0 ? (
                  <p className="text-metadata text-text-secondary">{fa ? "در این بازه سفارشی ثبت نشده است." : "No orders in this period."}</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {data.byDay.map((d) => (
                      <li key={d.date} className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-2 text-metadata">
                        <span className="text-text-secondary">{new Intl.DateTimeFormat(lang === "fa" ? "fa-IR" : "en-US", { month: "short", day: "numeric" }).format(new Date(d.date))}</span>
                        <span className="block min-w-0" aria-hidden="true">
                          <span className="block h-2 rounded-full bg-brand-solid" style={{ width: `${Math.max(2, (d.grossSales / maxDay) * 100)}%` }} />
                        </span>
                        <span className="whitespace-nowrap">{formatCurrency(d.grossSales, lang)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="min-w-0">
                <PanelTitle title={fa ? "پرفروش‌ترین کالاها" : "Top products"} />
                <TableWrap>
                  <table className="w-full">
                    <thead>
                      <tr>
                        <Th>{fa ? "کالا" : "Product"}</Th>
                        <Th>{fa ? "تعداد" : "Units"}</Th>
                        <Th>{fa ? "فروش" : "Sales"}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topProducts.length === 0 ? (
                        <EmptyRow colSpan={3} label={fa ? "هنوز فروشی نیست" : "No sales yet"} />
                      ) : (
                        data.topProducts.map((p) => (
                          <tr key={p.productId}>
                            <Td>{p.title}</Td>
                            <Td>{num(p.units, lang)}</Td>
                            <Td>{formatCurrency(p.grossSales, lang)}</Td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </TableWrap>
              </div>
            </div>
          </>
        ) : null}
      </Panel>
    </Frame>
  );
}

// -------------------------------------------------------------------- orders

export function AdminCommerceOrdersView() {
  const { lang, fa } = useLang();
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [refundRequested, setRefundRequested] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedDto<AdminCommerceOrderRowDto> | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await adminCommerceService.listOrders({ status: status === "all" ? undefined : status, q: q.trim() || undefined, refundRequested: refundRequested === "yes" || undefined, page }));
    } catch (e) {
      setError(errorOf(e));
    }
  }, [status, q, refundRequested, page]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <Frame title={fa ? "سفارش‌های فروشگاه" : "Shop orders"}>
      <Panel>
        <FilterBar>
          <FilterField label={fa ? "شماره سفارش" : "Order number"}>
            <TextFilter value={q} placeholder="PL-…" onChange={(v) => { setQ(v); setPage(1); }} />
          </FilterField>
          <FilterField label={fa ? "وضعیت" : "Status"}>
            <SelectFilter value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "all", label: fa ? "همه" : "All" }, ...Object.keys(ORDER_STATUS).map((s) => ({ value: s, label: label(ORDER_STATUS, s, lang) }))]} />
          </FilterField>
          <FilterField label={fa ? "درخواست بازگشت وجه باز" : "Open refund request"}>
            <SelectFilter value={refundRequested} onChange={(v) => { setRefundRequested(v); setPage(1); }} options={[{ value: "all", label: fa ? "همه" : "All" }, { value: "yes", label: fa ? "دارد" : "Yes" }]} />
          </FilterField>
        </FilterBar>
        <StateBlock error={error} permission="commerce.view" onRetry={load} />
        {!data && !error ? <Skeleton className="h-64 w-full" /> : null}
        {data ? (
          <>
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>{fa ? "شماره" : "Number"}</Th>
                    <Th>{fa ? "زمان" : "Placed"}</Th>
                    <Th>{fa ? "مشتری" : "Customer"}</Th>
                    <Th>{fa ? "فروشنده" : "Seller"}</Th>
                    <Th>{fa ? "وضعیت" : "Status"}</Th>
                    <Th>{fa ? "ارسال" : "Fulfillment"}</Th>
                    <Th>{fa ? "مبلغ" : "Total"}</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.length === 0 ? (
                    <EmptyRow colSpan={7} label={fa ? "سفارشی یافت نشد" : "No orders found"} />
                  ) : (
                    data.items.map((o) => (
                      <tr key={o.id}>
                        <Td>
                          <Link className="text-brand-natural" href={`/${lang}/admin/commerce/orders/${o.id}`} dir="ltr">
                            {o.orderNumber}
                          </Link>
                          {o.hasOpenRefundRequest ? <Tag tone="attention">{fa ? "درخواست بازگشت" : "Refund request"}</Tag> : null}
                        </Td>
                        <Td>{when(o.createdAt, lang)}</Td>
                        <Td>{o.customerName}</Td>
                        <Td>{o.sellerOrganization.name}</Td>
                        <Td>
                          <Tag tone={o.cancelledAt || o.status === "REFUNDED" ? "concern" : o.status === "CONFIRMED" ? "success" : "neutral"}>{o.cancelledAt ? (fa ? "لغو و بازپرداخت" : "Cancelled & refunded") : label(ORDER_STATUS, o.status, lang)}</Tag>
                        </Td>
                        <Td>{label(FULFILLMENT, o.fulfillmentStatus, lang)}</Td>
                        <Td>{formatCurrency(o.totalAmount, lang)}</Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TableWrap>
            <Pager data={data} page={page} onPage={setPage} />
          </>
        ) : null}
      </Panel>
    </Frame>
  );
}

export function AdminCommerceOrderDetailView({ orderId }: { orderId: string }) {
  const { lang, fa } = useLang();
  const [o, setO] = useState<AdminCommerceOrderDetailDto | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setO(await adminCommerceService.getOrder(orderId));
    } catch (e) {
      setError(errorOf(e));
    }
  }, [orderId]);
  useEffect(() => void load(), [load]);

  return (
    <Frame title={o ? `${fa ? "سفارش" : "Order"} ${o.orderNumber}` : fa ? "سفارش" : "Order"}>
      <StateBlock error={error} permission="commerce.view" onRetry={load} />
      {!o && !error ? <Skeleton className="h-64 w-full" /> : null}
      {o ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel>
            <PanelTitle title={fa ? "خلاصه" : "Summary"} />
            <DetailRow label={fa ? "وضعیت" : "Status"}>{o.cancelledAt ? (fa ? "لغو و بازپرداخت" : "Cancelled & refunded") : label(ORDER_STATUS, o.status, lang)}</DetailRow>
            <DetailRow label={fa ? "ارسال" : "Fulfillment"}>{label(FULFILLMENT, o.fulfillmentStatus, lang)}</DetailRow>
            <DetailRow label={fa ? "مشتری" : "Customer"}>{o.customerName}</DetailRow>
            <DetailRow label={fa ? "شهر" : "City"}>{o.shippingCity ?? "—"}</DetailRow>
            <DetailRow label={fa ? "فروشنده" : "Seller"}>{o.sellerOrganization.name}</DetailRow>
            <DetailRow label={fa ? "ثبت" : "Placed"}>{when(o.createdAt, lang)}</DetailRow>
            {o.cancelReason ? <DetailRow label={fa ? "دلیل لغو" : "Cancel reason"}>{o.cancelReason}</DetailRow> : null}
            <DetailRow label={fa ? "جمع کالاها" : "Subtotal"}>{formatCurrency(o.subtotalAmount, lang)}</DetailRow>
            {o.discountAmount ? <DetailRow label={fa ? "تخفیف" : "Discount"}>− {formatCurrency(o.discountAmount, lang)}</DetailRow> : null}
            <DetailRow label={fa ? "ارسال" : "Delivery"}>{formatCurrency(o.deliveryAmount, lang)}</DetailRow>
            <DetailRow label={fa ? "مبلغ کل" : "Total"}>{formatCurrency(o.totalAmount, lang)}</DetailRow>
          </Panel>
          <Panel>
            <PanelTitle title={fa ? "اقلام" : "Items"} />
            <ul className="flex flex-col gap-2">
              {o.items.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-3 border-b border-border-subtle pb-2 text-sm last:border-b-0">
                  <span>
                    {i.productTitleSnapshot}
                    {i.variantTitleSnapshot ? ` · ${i.variantTitleSnapshot}` : ""} × {num(i.quantity, lang)}
                    {i.promotionName ? <span className="block text-metadata text-state-success">{i.promotionName}</span> : null}
                  </span>
                  <span>{formatCurrency(i.totalPrice, lang)}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel>
            <PanelTitle title={fa ? "تاریخچه وضعیت" : "Status timeline"} />
            <ol className="flex flex-col gap-1.5 text-sm">
              {o.timeline.map((e, idx) => (
                <li key={`${e.createdAt}-${idx}`} className="flex justify-between gap-3">
                  <span>
                    {label(ORDER_STATUS, e.toStatus, lang)} <span className="text-text-secondary">· {e.actorType}</span>
                    {e.reason ? <span className="block text-metadata text-text-secondary">{e.reason}</span> : null}
                  </span>
                  <span className="text-text-secondary">{when(e.createdAt, lang)}</span>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel>
            <PanelTitle title={fa ? "بازپرداخت‌ها و درخواست‌ها" : "Refunds & requests"} />
            {o.refundRequests.length === 0 && o.refunds.length === 0 ? <p className="text-metadata text-text-secondary">{fa ? "موردی نیست" : "None"}</p> : null}
            {o.refundRequests.map((r) => (
              <DetailRow key={r.id} label={`${label(REFUND_REASON, r.reason, lang)} · ${when(r.createdAt, lang)}`}>
                {label(REQUEST_STATUS, r.status, lang)}
              </DetailRow>
            ))}
            {o.refunds.map((r) => (
              <DetailRow key={r.id} label={`${fa ? "بازپرداخت" : "Refund"} · ${when(r.createdAt, lang)}`}>
                {r.status} · {formatCurrency(r.amount, lang)}
              </DetailRow>
            ))}
          </Panel>
        </div>
      ) : null}
    </Frame>
  );
}

// ----------------------------------------------------------- refund requests

export function AdminRefundRequestsView() {
  const { lang, fa } = useLang();
  const [status, setStatus] = useState("PENDING_REVIEW");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedDto<AdminRefundRequestDto> | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const [deciding, setDeciding] = useState<{ request: AdminRefundRequestDto; action: "approve" | "reject" } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await adminCommerceService.listRefundRequests({ status: status === "all" ? undefined : status, page }));
    } catch (e) {
      setError(errorOf(e));
    }
  }, [status, page]);
  useEffect(() => void load(), [load]);

  async function decide() {
    if (!deciding) return;
    setBusy(true);
    setActionError(null);
    try {
      if (deciding.action === "approve") {
        const approved = await adminCommerceService.approveRefundRequest(deciding.request.id, note.trim() || undefined);
        setNotice(fa ? `تأیید شد؛ تأییدیه مالی ${approved.adminRefundApprovalId?.slice(0, 8)} برای پرداخت ساخته شد.` : `Approved; finance approval ${approved.adminRefundApprovalId?.slice(0, 8)} was opened for payout.`);
      } else {
        await adminCommerceService.rejectRefundRequest(deciding.request.id, note.trim());
        setNotice(fa ? "درخواست رد شد و به مشتری اطلاع داده شد." : "Request rejected; the customer was notified.");
      }
      setDeciding(null);
      setNote("");
      await load();
    } catch (e) {
      setActionError(e instanceof ApiError && e.status === 403 ? (fa ? "دسترسی finance.refund.request لازم است" : "finance.refund.request permission required") : e instanceof ApiError ? e.message : fa ? "انجام نشد" : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Frame title={fa ? "درخواست‌های بازگشت وجه" : "Refund requests"}>
      <Panel>
        <p className="mb-3 text-metadata text-text-secondary">
          {fa
            ? "تأیید در اینجا پولی جابه‌جا نمی‌کند؛ یک تأییدیه مالی ساخته می‌شود که واحد مالی آن را از بخش تراکنش‌ها اجرا می‌کند (بالاتر از سقف، تأیید نفر دوم لازم است)."
            : "Approving here moves no money: it opens a finance approval, which finance executes from Transactions (two-person approval above the threshold)."}
        </p>
        <FilterBar>
          <FilterField label={fa ? "وضعیت" : "Status"}>
            <SelectFilter value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "all", label: fa ? "همه" : "All" }, ...Object.keys(REQUEST_STATUS).map((s) => ({ value: s, label: label(REQUEST_STATUS, s, lang) }))]} />
          </FilterField>
        </FilterBar>
        {notice ? <p role="status" className="mb-3 rounded-md bg-surface-subtle p-2 text-sm">{notice}</p> : null}
        <StateBlock error={error} permission="commerce.view" onRetry={load} />
        {!data && !error ? <Skeleton className="h-64 w-full" /> : null}
        {data ? (
          <>
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>{fa ? "سفارش" : "Order"}</Th>
                    <Th>{fa ? "مشتری / فروشنده" : "Customer / seller"}</Th>
                    <Th>{fa ? "دلیل" : "Reason"}</Th>
                    <Th>{fa ? "مبلغ" : "Amount"}</Th>
                    <Th>{fa ? "وضعیت" : "Status"}</Th>
                    <Th>{fa ? "اقدام" : "Action"}</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.length === 0 ? (
                    <EmptyRow colSpan={6} label={fa ? "درخواستی نیست" : "No requests"} />
                  ) : (
                    data.items.map((r) => (
                      <tr key={r.id}>
                        <Td>
                          <Link className="text-brand-natural" href={`/${lang}/admin/commerce/orders/${r.orderId}`} dir="ltr">
                            {r.orderNumber}
                          </Link>
                          <span className="block text-metadata text-text-secondary">{when(r.createdAt, lang)}</span>
                        </Td>
                        <Td>
                          {r.customerName}
                          <span className="block text-metadata text-text-secondary">{r.sellerName}</span>
                        </Td>
                        <Td>
                          {label(REFUND_REASON, r.reason, lang)}
                          {r.description ? <span className="block max-w-xs text-metadata text-text-secondary">{r.description}</span> : null}
                        </Td>
                        <Td>{formatCurrency(r.requestedAmount, lang)}</Td>
                        <Td>
                          <Tag tone={r.status === "PENDING_REVIEW" ? "attention" : r.status === "APPROVED" ? "success" : "neutral"}>{label(REQUEST_STATUS, r.status, lang)}</Tag>
                          {r.decisionReason ? <span className="block text-metadata text-text-secondary">{r.decisionReason}</span> : null}
                        </Td>
                        <Td>
                          {r.status === "PENDING_REVIEW" ? (
                            <div className="flex gap-1">
                              <Button size="sm" onClick={() => { setDeciding({ request: r, action: "approve" }); setNote(""); setActionError(null); }}>
                                {fa ? "تأیید" : "Approve"}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { setDeciding({ request: r, action: "reject" }); setNote(""); setActionError(null); }}>
                                {fa ? "رد" : "Reject"}
                              </Button>
                            </div>
                          ) : null}
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TableWrap>
            <Pager data={data} page={page} onPage={setPage} />
          </>
        ) : null}
      </Panel>
      <Dialog open={Boolean(deciding)} onClose={() => setDeciding(null)} title={deciding?.action === "approve" ? (fa ? "تأیید درخواست" : "Approve request") : fa ? "رد درخواست" : "Reject request"}>
        <div className="flex flex-col gap-3">
          {deciding ? <p className="text-sm">{deciding.request.orderNumber} · {formatCurrency(deciding.request.requestedAmount, lang)}</p> : null}
          <Input label={deciding?.action === "approve" ? (fa ? "یادداشت (اختیاری)" : "Note (optional)") : fa ? "دلیل رد (به مشتری نمایش داده می‌شود)" : "Reason (shown to the customer)"} value={note} onChange={(e) => setNote(e.target.value)} />
          {actionError ? <p role="alert" className="text-metadata text-state-urgent">{actionError}</p> : null}
          <Button isLoading={busy} disabled={deciding?.action === "reject" && note.trim().length < 3} variant={deciding?.action === "reject" ? "danger" : "primary"} onClick={decide}>
            {deciding?.action === "approve" ? (fa ? "تأیید و ارسال به مالی" : "Approve and send to finance") : fa ? "رد درخواست" : "Reject request"}
          </Button>
        </div>
      </Dialog>
    </Frame>
  );
}

// ------------------------------------------------------------------ products

export function AdminProductsView() {
  const { lang, fa } = useLang();
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedDto<AdminProductRowDto> | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const [editing, setEditing] = useState<AdminProductRowDto | null>(null);
  const [nextStatus, setNextStatus] = useState("INACTIVE");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await adminCommerceService.listProducts({ status: status === "all" ? undefined : status, q: q.trim() || undefined, page }));
    } catch (e) {
      setError(errorOf(e));
    }
  }, [status, q, page]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250);
    return () => clearTimeout(timer);
  }, [load]);

  async function save() {
    if (!editing) return;
    setBusy(true);
    setActionError(null);
    try {
      await adminCommerceService.setProductStatus(editing.id, nextStatus, reason.trim());
      setEditing(null);
      await load();
    } catch (e) {
      setActionError(e instanceof ApiError && e.status === 403 ? (fa ? "دسترسی commerce.manage لازم است" : "commerce.manage permission required") : fa ? "انجام نشد" : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Frame title={fa ? "کالاها" : "Products"}>
      <Panel>
        <FilterBar>
          <FilterField label={fa ? "جست‌وجو (نام یا SKU)" : "Search (title or SKU)"}>
            <TextFilter value={q} onChange={(v) => { setQ(v); setPage(1); }} />
          </FilterField>
          <FilterField label={fa ? "وضعیت" : "Status"}>
            <SelectFilter value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "all", label: fa ? "همه" : "All" }, ...Object.keys(PRODUCT_STATUS).map((s) => ({ value: s, label: label(PRODUCT_STATUS, s, lang) }))]} />
          </FilterField>
        </FilterBar>
        <StateBlock error={error} permission="commerce.view" onRetry={load} />
        {!data && !error ? <Skeleton className="h-64 w-full" /> : null}
        {data ? (
          <>
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>{fa ? "کالا" : "Product"}</Th>
                    <Th>{fa ? "دسته" : "Category"}</Th>
                    <Th>{fa ? "پیشنهاد فعال / فروشنده" : "Active offers / sellers"}</Th>
                    <Th>{fa ? "امتیاز" : "Rating"}</Th>
                    <Th>{fa ? "تصویر" : "Media"}</Th>
                    <Th>{fa ? "وضعیت" : "Status"}</Th>
                    <Th>{fa ? "اقدام" : "Action"}</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.length === 0 ? (
                    <EmptyRow colSpan={7} label={fa ? "کالایی یافت نشد" : "No products"} />
                  ) : (
                    data.items.map((p) => (
                      <tr key={p.id}>
                        <Td>
                          <Link className="text-brand-natural" href={`/${lang}/shop/products/${p.id}`}>
                            {p.title}
                          </Link>
                          {p.brandName ? <span className="block text-metadata text-text-secondary">{p.brandName}</span> : null}
                        </Td>
                        <Td>{p.categoryName}</Td>
                        <Td>
                          {num(p.activeOfferCount, lang)} / {num(p.sellerCount, lang)}
                        </Td>
                        <Td>{p.rating.count ? `${p.rating.average?.toLocaleString(lang === "fa" ? "fa-IR" : "en-US")} (${num(p.rating.count, lang)})` : "—"}</Td>
                        <Td>{p.hasMedia ? (fa ? "دارد" : "Yes") : <Tag tone="attention">{fa ? "ندارد" : "Missing"}</Tag>}</Td>
                        <Td>
                          <Tag tone={p.status === "ACTIVE" ? "success" : "neutral"}>{label(PRODUCT_STATUS, p.status, lang)}</Tag>
                        </Td>
                        <Td>
                          <Button size="sm" variant="ghost" onClick={() => { setEditing(p); setNextStatus(p.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"); setReason(""); setActionError(null); }}>
                            {fa ? "تغییر وضعیت" : "Change status"}
                          </Button>
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TableWrap>
            <Pager data={data} page={page} onPage={setPage} />
          </>
        ) : null}
      </Panel>
      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.title ?? ""}>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-secondary">{fa ? "وضعیت جدید" : "New status"}</span>
            <select className="h-11 rounded-md border border-border-strong bg-surface-elevated px-3" value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}>
              {["ACTIVE", "INACTIVE", "ARCHIVED"].map((s) => (
                <option key={s} value={s}>
                  {label(PRODUCT_STATUS, s, lang)}
                </option>
              ))}
            </select>
          </label>
          <Input label={fa ? "دلیل (در گزارش ممیزی ثبت می‌شود)" : "Reason (recorded in the audit log)"} value={reason} onChange={(e) => setReason(e.target.value)} />
          {actionError ? <p role="alert" className="text-metadata text-state-urgent">{actionError}</p> : null}
          <Button isLoading={busy} disabled={reason.trim().length < 3} onClick={save}>
            {fa ? "ذخیره" : "Save"}
          </Button>
        </div>
      </Dialog>
    </Frame>
  );
}

// ------------------------------------------------------------------- reviews

export function AdminProductReviewsView() {
  const { fa } = useLang();
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedDto<AdminProductReviewRowDto> | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const [target, setTarget] = useState<AdminProductReviewRowDto | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await adminCommerceService.listReviews({ status: status === "all" ? undefined : status, page }));
    } catch (e) {
      setError(errorOf(e));
    }
  }, [status, page]);
  useEffect(() => void load(), [load]);

  async function toggle() {
    if (!target) return;
    setBusy(true);
    setActionError(null);
    try {
      await adminCommerceService.setReviewVisibility(target.id, target.status === "PUBLISHED", reason.trim());
      setTarget(null);
      await load();
    } catch (e) {
      setActionError(e instanceof ApiError && e.status === 403 ? (fa ? "دسترسی commerce.manage لازم است" : "commerce.manage permission required") : fa ? "انجام نشد" : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Frame title={fa ? "نظرات کالا" : "Product reviews"}>
      <Panel>
        <FilterBar>
          <FilterField label={fa ? "وضعیت" : "Status"}>
            <SelectFilter value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "all", label: fa ? "همه" : "All" }, { value: "PUBLISHED", label: fa ? "منتشرشده" : "Published" }, { value: "HIDDEN", label: fa ? "پنهان" : "Hidden" }]} />
          </FilterField>
        </FilterBar>
        <StateBlock error={error} permission="commerce.view" onRetry={load} />
        {!data && !error ? <Skeleton className="h-64 w-full" /> : null}
        {data ? (
          <>
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>{fa ? "کالا" : "Product"}</Th>
                    <Th>{fa ? "امتیاز" : "Rating"}</Th>
                    <Th>{fa ? "متن" : "Text"}</Th>
                    <Th>{fa ? "نویسنده" : "Author"}</Th>
                    <Th>{fa ? "وضعیت" : "Status"}</Th>
                    <Th>{fa ? "اقدام" : "Action"}</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.length === 0 ? (
                    <EmptyRow colSpan={6} label={fa ? "نظری نیست" : "No reviews"} />
                  ) : (
                    data.items.map((r) => (
                      <tr key={r.id}>
                        <Td>{r.productTitle}</Td>
                        <Td>{"★".repeat(r.rating)}</Td>
                        <Td>
                          <span className="block max-w-sm">{r.body ?? "—"}</span>
                          {r.hiddenReason ? <span className="block text-metadata text-text-secondary">{r.hiddenReason}</span> : null}
                        </Td>
                        <Td>{r.authorName}</Td>
                        <Td>
                          <Tag tone={r.status === "PUBLISHED" ? "success" : "neutral"}>{r.status === "PUBLISHED" ? (fa ? "منتشرشده" : "Published") : fa ? "پنهان" : "Hidden"}</Tag>
                        </Td>
                        <Td>
                          <Button size="sm" variant="ghost" onClick={() => { setTarget(r); setReason(""); setActionError(null); }}>
                            {r.status === "PUBLISHED" ? (fa ? "پنهان کردن" : "Hide") : fa ? "بازگرداندن" : "Restore"}
                          </Button>
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TableWrap>
            <Pager data={data} page={page} onPage={setPage} />
          </>
        ) : null}
      </Panel>
      <Dialog open={Boolean(target)} onClose={() => setTarget(null)} title={target?.status === "PUBLISHED" ? (fa ? "پنهان کردن نظر" : "Hide review") : fa ? "بازگرداندن نظر" : "Restore review"}>
        <div className="flex flex-col gap-3">
          <Input label={fa ? "دلیل (در گزارش ممیزی ثبت می‌شود)" : "Reason (recorded in the audit log)"} value={reason} onChange={(e) => setReason(e.target.value)} />
          {actionError ? <p role="alert" className="text-metadata text-state-urgent">{actionError}</p> : null}
          <Button isLoading={busy} disabled={reason.trim().length < 3} onClick={toggle}>
            {fa ? "تأیید" : "Confirm"}
          </Button>
        </div>
      </Dialog>
    </Frame>
  );
}

// ----------------------------------------------------------------- inventory

export function AdminInventoryView() {
  const { lang, fa } = useLang();
  const [lowStock, setLowStock] = useState("yes");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedDto<AdminInventoryRowDto> | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await adminCommerceService.listInventory({ lowStock: lowStock === "yes" || undefined, page }));
    } catch (e) {
      setError(errorOf(e));
    }
  }, [lowStock, page]);
  useEffect(() => void load(), [load]);

  return (
    <Frame title={fa ? "موجودی" : "Inventory"}>
      <Panel>
        <p className="mb-3 text-metadata text-text-secondary">{fa ? "فقط مشاهده؛ موجودی را فروشنده در پنل خود تنظیم می‌کند." : "Read-only; sellers adjust stock in their own console."}</p>
        <FilterBar>
          <FilterField label={fa ? "نمایش" : "Show"}>
            <SelectFilter value={lowStock} onChange={(v) => { setLowStock(v); setPage(1); }} options={[{ value: "yes", label: fa ? "کم‌موجود و ناموجود (≤۵)" : "Low and out of stock (≤5)" }, { value: "all", label: fa ? "همه پیشنهادهای فعال" : "All active offers" }]} />
          </FilterField>
        </FilterBar>
        <StateBlock error={error} permission="commerce.view" onRetry={load} />
        {!data && !error ? <Skeleton className="h-64 w-full" /> : null}
        {data ? (
          <>
            <TableWrap>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>{fa ? "کالا" : "Product"}</Th>
                    <Th>SKU</Th>
                    <Th>{fa ? "فروشنده" : "Seller"}</Th>
                    <Th>{fa ? "موجود" : "On hand"}</Th>
                    <Th>{fa ? "رزرو" : "Reserved"}</Th>
                    <Th>{fa ? "قابل فروش" : "Available"}</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.length === 0 ? (
                    <EmptyRow colSpan={6} label={fa ? "موردی نیست" : "Nothing to show"} />
                  ) : (
                    data.items.map((r) => (
                      <tr key={r.sellerOfferId}>
                        <Td>
                          {r.productTitle}
                          {r.variantTitle ? <span className="block text-metadata text-text-secondary">{r.variantTitle}</span> : null}
                        </Td>
                        <Td>
                          <span dir="ltr">{r.sku}</span>
                        </Td>
                        <Td>{r.sellerOrganization.name}</Td>
                        <Td>{num(r.onHand, lang)}</Td>
                        <Td>{num(r.reserved, lang)}</Td>
                        <Td>
                          <Tag tone={r.available === 0 ? "urgent" : r.available <= 5 ? "attention" : "success"}>{num(r.available, lang)}</Tag>
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TableWrap>
            <Pager data={data} page={page} onPage={setPage} />
          </>
        ) : null}
      </Panel>
    </Frame>
  );
}

// ------------------------------------------------------------------- sellers

export function AdminCommerceSellersView() {
  const { lang, fa } = useLang();
  const [data, setData] = useState<AdminSellerRowDto[] | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await adminCommerceService.listSellers());
    } catch (e) {
      setError(errorOf(e));
    }
  }, []);
  useEffect(() => void load(), [load]);

  return (
    <Frame title={fa ? "فروشندگان" : "Sellers"}>
      <Panel>
        <StateBlock error={error} permission="commerce.view" onRetry={load} />
        {!data && !error ? <Skeleton className="h-64 w-full" /> : null}
        {data ? (
          <TableWrap>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>{fa ? "فروشنده" : "Seller"}</Th>
                  <Th>{fa ? "احراز" : "Verification"}</Th>
                  <Th>{fa ? "پیشنهاد فعال" : "Active offers"}</Th>
                  <Th>{fa ? "سفارش ۳۰ روز" : "Orders (30d)"}</Th>
                  <Th>{fa ? "فروش ۳۰ روز" : "Sales (30d)"}</Th>
                  <Th>{fa ? "درخواست بازگشت باز" : "Open refund requests"}</Th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <EmptyRow colSpan={6} label={fa ? "فروشنده‌ای نیست" : "No sellers"} />
                ) : (
                  data.map((s) => (
                    <tr key={s.id}>
                      <Td>{s.name}</Td>
                      <Td>
                        <Tag tone={s.verificationStatus === "VERIFIED" ? "success" : "attention"}>{s.verificationStatus}</Tag>
                      </Td>
                      <Td>{num(s.activeOfferCount, lang)}</Td>
                      <Td>{num(s.orderCount30d, lang)}</Td>
                      <Td>{formatCurrency(s.grossSales30d, lang)}</Td>
                      <Td>{s.openRefundRequests ? <Tag tone="attention">{num(s.openRefundRequests, lang)}</Tag> : "—"}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TableWrap>
        ) : null}
      </Panel>
    </Frame>
  );
}

// ---------------------------------------------------------------- promotions

export function AdminPromotionsView() {
  const { fa } = useLang();
  const [sellers, setSellers] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    void adminCommerceService
      .listSellers()
      .then((rows) => setSellers(rows.filter((s) => s.verificationStatus === "VERIFIED").map((s) => ({ id: s.id, label: s.name }))))
      .catch(() => setSellers([]));
  }, []);
  const api = useMemo<PromotionApi>(
    () => ({
      list: () => adminCommerceService.listPromotions(),
      create: (input) => adminCommerceService.createPromotion(input),
      update: (id, input) => adminCommerceService.updatePromotion(id, input),
      transition: (id, status) => adminCommerceService.transitionPromotion(id, status),
    }),
    [],
  );
  return (
    <div>
      <h1 className="sr-only">{fa ? "تخفیف‌ها" : "Promotions"}</h1>
      <AdminCommerceNav />
      <PromotionManager api={api} mode="PLATFORM" sellerOptions={sellers} />
    </div>
  );
}
