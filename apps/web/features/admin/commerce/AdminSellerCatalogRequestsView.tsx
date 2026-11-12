"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Button, EmptyState, ErrorRecovery, Input, Skeleton } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { adminCommerceService } from "@/services/admin-commerce.service";
import { Panel, PanelTitle, Tag } from "../console-ui";
import { copyFor } from "@/features/admin/admin-copy";

type Row = Awaited<ReturnType<typeof adminCommerceService.listCatalogProductRequests>>[number];
export function AdminSellerCatalogRequestsView() {
  const locale = useLocale();
  const { tr } = copyFor(locale);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [reason, setReason] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState<"forbidden" | "load" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [duplicateReviewed, setDuplicateReviewed] = useState<Record<string, boolean>>({});
  const load = useCallback(async () => {
    setError(null);
    try {
      const [pending, cats] = await Promise.all([adminCommerceService.listCatalogProductRequests(), adminCommerceService.listProductCategories()]);
      setRows(pending); setCategories(cats); setCategoryId(current => current || cats[0]?.id || "");
    } catch (e) { setError(e instanceof ApiError && e.status === 403 ? "forbidden" : "load"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(id: string, action: "approve" | "reject") {
    if (reason.trim().length < 3) { setActionError(tr("برای تصمیم دلیل کوتاهی وارد کنید.", "Enter a short reason for the decision.")); return; }
    if (action === "approve" && !categoryId) { setActionError(tr("دسته‌بندی را انتخاب کنید.", "Select a category.")); return; }
    setBusyId(id); setActionError(null); setDone(false);
    try {
      if (action === "reject") await adminCommerceService.rejectCatalogProductRequest(id, reason.trim());
      else await adminCommerceService.approveCatalogProductRequest(id, categoryId, reason.trim(), rows?.find(row => row.id === id)?.duplicateCandidates.map(candidate => candidate.id) ?? []);
      setReason(""); setDone(true); await load();
    } catch (e) { setActionError(e instanceof ApiError ? e.message : (tr("تصمیم ثبت نشد.", "Could not save the decision."))); }
    finally { setBusyId(null); }
  }
  async function match(id: string, productId: string) {
    if (reason.trim().length < 3) { setActionError(tr("برای تطبیق دلیل کوتاهی وارد کنید.", "Enter a short reason for matching.")); return; }
    setBusyId(id); setActionError(null); setDone(false);
    try { await adminCommerceService.matchCatalogProductRequest(id, productId, reason.trim()); setReason(""); setDone(true); await load(); }
    catch (e) { setActionError(e instanceof ApiError ? e.message : (tr("تطبیق ثبت نشد.", "Could not match the request."))); }
    finally { setBusyId(null); }
  }

  return <div className="flex flex-col gap-4">
    <header><h1 className="text-page-title">{tr("درخواست‌های افزودن کالا", "Seller catalog requests")}</h1><p className="mt-2 text-sm text-text-secondary">{tr("ابتدا موارد مشابه را بررسی کنید. تأیید فقط هویت کالا را در کاتالوگ مرکزی می‌سازد؛ پیشنهاد، قیمت و موجودی ایجاد نمی‌شود.", "Review possible duplicates first. Approval creates central product identity only; it does not create an offer, price, or inventory.")}</p></header>
    <Panel><PanelTitle title={tr("صف بررسی", "Review queue")} hint={tr("دسترسی: commerce.view؛ تصمیم: commerce.manage", "Access: commerce.view; decisions: commerce.manage")} />
      {error === "forbidden" ? <EmptyState title={tr("دسترسی لازم است", "Permission required")} description="commerce.view" /> : null}
      {error === "load" ? <ErrorRecovery title={tr("بارگیری انجام نشد", "Could not load")} message={tr("ارتباط با سامانه برقرار نشد.", "The service could not be reached.")} retryLabel={tr("تلاش دوباره", "Retry")} onRetry={() => void load()} /> : null}
      {!rows && !error ? <Skeleton className="h-48 w-full" /> : null}
      {rows?.length === 0 ? <EmptyState title={tr("درخواستی در صف نیست", "No pending requests")} description={tr("درخواست‌های تازهٔ فروشندگان پس از ثبت در اینجا نمایش داده می‌شوند.", "New seller requests will appear here.")} /> : null}
      {rows?.map(row => <article key={row.id} className="mt-3 rounded-md border border-border-subtle p-4">
        <div className="flex flex-wrap items-center gap-2"><Tag tone="attention">{tr("در انتظار بررسی", "Pending review")}</Tag><strong>{row.requestedTitle}</strong><span className="text-metadata text-text-secondary">{row.sellerOrganization.name}</span></div>
        <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2"><div><dt className="text-text-secondary">{tr("برند درخواستی", "Requested brand")}</dt><dd>{row.brandName || "—"}</dd></div><div><dt className="text-text-secondary">{tr("دستهٔ پیشنهادی", "Suggested category")}</dt><dd>{row.category?.name || "—"}</dd></div><div className="md:col-span-2"><dt className="text-text-secondary">{tr("توضیحات", "Description")}</dt><dd className="whitespace-pre-wrap">{row.description || "—"}</dd></div></dl>
        {row.sourceUrl ? <a className="mt-2 inline-block text-metadata text-brand-natural underline" href={row.sourceUrl} target="_blank" rel="noreferrer">{tr("پیوند منبع", "Source reference")}</a> : null}
        <section className="mt-3 rounded-md bg-surface-subtle p-3"><h2 className="font-semibold">{tr("بررسی موارد مشابه", "Possible duplicates")}</h2>{row.duplicateCandidates.length ? <div className="mt-2 flex flex-col gap-2">{row.duplicateCandidates.map(candidate => <div key={candidate.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border-subtle p-2"><span>{candidate.title} <small className="text-text-secondary">({candidate.status})</small></span><Button size="sm" variant="ghost" disabled={busyId === row.id} onClick={() => void match(row.id, candidate.id)}>{tr("تطبیق با این کالا", "Match existing")}</Button></div>)}</div> : <p className="mt-2 text-sm text-text-secondary">{tr("مورد مشابه دقیقی پیدا نشد؛ بررسی دستی همچنان لازم است.", "No exact candidate found; manual duplicate review is still required.")}</p>}<label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={duplicateReviewed[row.id] ?? false} onChange={e => setDuplicateReviewed(current => ({ ...current, [row.id]: e.target.checked }))} /><span>{tr("موارد مشابه را بررسی کردم؛ ساخت کالای جدید تکراری نیست.", "I reviewed possible duplicates; creating a new product will not be a duplicate.")}</span></label></section>
        <div className="mt-3 grid gap-3 md:grid-cols-2"><label className="flex flex-col gap-1 text-metadata text-text-secondary">{tr("دسته‌بندی برای کالای جدید", "Category for a new product")}<select className="rounded-md border border-border-subtle bg-surface-base p-2 text-text-primary" value={categoryId} onChange={e => setCategoryId(e.target.value)}><option value="">{tr("انتخاب دسته", "Select category")}</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><Input label={tr("دلیل تصمیم", "Decision reason")} value={reason} onChange={e => setReason(e.target.value)} /></div>
        <div className="mt-3 flex flex-wrap gap-2"><Button disabled={busyId === row.id || !categoryId || !duplicateReviewed[row.id]} isLoading={busyId === row.id} onClick={() => void act(row.id, "approve")}>{tr("بررسی و ساخت کالای مرکزی", "Approve and create central product")}</Button><Button variant="ghost" disabled={busyId === row.id} onClick={() => void act(row.id, "reject")}>{tr("رد درخواست", "Reject request")}</Button></div>
      </article>)}
      {actionError ? <p role="alert" className="mt-3 text-metadata text-state-urgent">{actionError}</p> : null}{done ? <p role="status" className="mt-3 text-metadata text-state-success">{tr("تصمیم ثبت شد.", "Decision saved.")}</p> : null}
    </Panel>
  </div>;
}
