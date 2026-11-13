"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { Button, EmptyState, ErrorRecovery, Input, Skeleton } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { adminCommerceService } from "@/services/admin-commerce.service";
import { Panel, PanelTitle, Tag } from "../console-ui";
import { copyFor } from "@/features/admin/admin-copy";
import { DigikalaFactsImportPanel } from "./DigikalaFactsImportPanel";

type Lang = "fa" | "en" | "de" | "es" | "ar" | "nl";
type Category = { id: string; name: string; slug: string };
type Brand = { id: string; name: string; slug: string };
type ImportRow = Awaited<ReturnType<typeof adminCommerceService.listCatalogImports>>[number];
type ImportAvailability = Awaited<ReturnType<typeof adminCommerceService.catalogImportAvailability>>;
const FIELD = "w-full rounded-md border border-border-subtle bg-surface-base px-3 py-2 text-body text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";

export function AdminCatalogImportsView() {
  const lang = useLocale() as Lang;
  const { tr, trf } = copyFor(lang);
  const [urls, setUrls] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState("");
  const [jobs, setJobs] = useState<ImportRow[] | null>(null);
  const [availability, setAvailability] = useState<ImportAvailability | null>(null);
  const [error, setError] = useState<"forbidden" | "load" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [state, rows, cats, brandRows] = await Promise.all([adminCommerceService.catalogImportAvailability(), adminCommerceService.listCatalogImports(), adminCommerceService.listProductCategories(), adminCommerceService.listProductBrands()]);
      setAvailability(state);
      setJobs(rows);
      setCategories(cats);
      setBrands(brandRows);
      setCategoryId((current) => current || cats[0]?.id || "");
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? "forbidden" : "load");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const active = useMemo(() => jobs?.some((job) => job.status === "QUEUED" || job.status === "RUNNING") ?? false, [jobs]);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [active, load]);

  async function submit() {
    const submitted = urls.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
    if (!submitted.length || !categoryId) return;
    setBusy(true); setActionError(null); setNotice(null);
    try {
      await adminCommerceService.createCatalogImport({ urls: submitted, categoryId, ...(brandId ? { brandId } : {}), maxPages: 5, maxProducts: 50, idempotencyKey: crypto.randomUUID() });
      setUrls("");
      setNotice(tr("درخواست واردسازی در صف قرار گرفت.", "Import job queued."));
      await load();
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : (tr("درخواست ارسال نشد.", "Could not submit the import.")));
    } finally { setBusy(false); }
  }

  async function cancel(id: string) {
    setActionError(null);
    try { await adminCommerceService.cancelCatalogImport(id); await load(); }
    catch (e) { setActionError(e instanceof ApiError ? e.message : (tr("لغو انجام نشد.", "Could not cancel the job."))); }
  }

  async function decide(itemId: string, accept: boolean) {
    if (reason.trim().length < 3) { setActionError(tr("برای تصمیم، دلیل کوتاهی وارد کنید.", "Enter a short reason for this decision.")); return; }
    setActionError(null);
    try {
      if (accept) await adminCommerceService.applyCatalogSourceUpdate(itemId, reason.trim());
      else await adminCommerceService.rejectCatalogSourceUpdate(itemId, reason.trim());
      setReason(""); await load();
    } catch (e) { setActionError(e instanceof ApiError ? e.message : (tr("تصمیم ثبت نشد.", "Could not save the decision."))); }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-page-title">{tr("واردسازی کاتالوگ", "Catalog importer")}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary">
          {tr("فقط محتوای کالای مرتبط با پت را وارد کنید. محصول در کاتالوگ مرکزی و به شکل پیش‌نویس ساخته می‌شود؛ قیمت، موجودی، فروشنده و پیشنهاد فروش وارد نمی‌شود.", "Import only pet-relevant catalog content. Products are created as central-catalog drafts; source prices, stock, sellers and offers are never imported.")}
        </p>
      </div>

      {!availability && !error ? <Skeleton className="h-36 w-full" /> : null}
      {availability?.enabled ? <Panel>
        <PanelTitle title={tr("ساخت کار واردسازی", "Create an import job")} hint={tr("هر آدرس در یک خط؛ حداکثر ۲۰ پیوند و سقف ۵ صفحه / ۵۰ کالا", "One URL per line; up to 20 links, capped at 5 pages / 50 products")} />
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-metadata text-text-secondary md:col-span-2">
            {tr("پیوند کالای دیجی‌کالا یا دسته‌بندی تمیز", "Digikala product or clean category URLs")}
            <textarea dir="ltr" value={urls} onChange={(event) => setUrls(event.target.value)} rows={4} className={FIELD} placeholder="https://www.digikala.com/product/dkp-…/" />
          </label>
          <label className="flex flex-col gap-1 text-metadata text-text-secondary">
            {tr("دستهٔ مقصد در کاتالوگ پت", "PET LIFE destination category")}
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className={FIELD}>
              <option value="">{tr("انتخاب دسته", "Select a category")}</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-metadata text-text-secondary">
            {tr("برند مقصد (اختیاری؛ بدون تطبیق خودکار)", "Destination brand (optional; no automatic matching)")}
            <select value={brandId} onChange={(event) => setBrandId(event.target.value)} className={FIELD}>
              <option value="">{tr("بدون انتخاب", "No brand mapping")}</option>
              {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
            </select>
          </label>
          <p className="self-end text-metadata text-text-secondary">
            {tr("فقط صفحه‌های مجاز طبق robots.txt خوانده می‌شوند؛ اگر منبع دسترسی را ببندد، واردسازی متوقف می‌شود.", "Only pages allowed by robots.txt are read. If the source blocks access, the importer stops.")}
          </p>
        </div>
        {actionError ? <p role="alert" className="mt-3 text-metadata text-state-urgent">{actionError}</p> : null}
        {notice ? <p role="status" className="mt-3 text-metadata text-state-success">{notice}</p> : null}
        <Button className="mt-3" isLoading={busy} disabled={!urls.trim() || !categoryId} onClick={() => void submit()}>
          {tr("شروع واردسازی", "Start import")}
        </Button>
      </Panel> : availability ? <Panel>
        <PanelTitle title={tr("واردسازی دیجی‌کالا در دسترس نیست", "Digikala import unavailable")} />
        <p className="text-sm leading-relaxed text-text-secondary">
          {tr("تا وقتی دسترسی منبع و مجوز استفاده از متن و تصاویر به‌طور معتبر بررسی و تأیید نشود، واردسازی خاموش می‌ماند. روشن‌شدن قابلیت باید از پنل پرچم‌ها و با تأیید مدیر دوم انجام شود.", "Import remains off until source access and permission to use its text and images are verified. Enabling it requires the feature-flag workflow and approval by a second administrator.")}
        </p>
        <p className="mt-2 text-metadata text-text-secondary" dir="ltr">{availability.key}</p>
      </Panel> : null}

      {error !== "forbidden" ? <DigikalaFactsImportPanel categories={categories} jobs={jobs} onStarted={() => void load()} /> : null}

      <Panel>
        <PanelTitle title={tr("کارها و بازبینی تغییرات", "Jobs and incoming changes")} />
        {error === "forbidden" ? <EmptyState title={tr("دسترسی commerce.view لازم است", "commerce.view permission required")} /> : null}
        {error === "load" ? <ErrorRecovery title={tr("بارگیری نشد", "Could not load")} message={tr("ارتباط با سامانه برقرار نشد.", "The service could not be reached.")} retryLabel={tr("تلاش دوباره", "Retry")} onRetry={() => void load()} /> : null}
        {!jobs && !error ? <Skeleton className="h-48 w-full" /> : null}
        {jobs?.length === 0 ? <EmptyState title={tr("هنوز کاری ثبت نشده است", "No import jobs yet")} description={tr("پس از ثبت پیوند، نتیجهٔ واقعی در اینجا نمایش داده می‌شود.", "After you submit a source link, its real result will appear here.")} /> : null}
        <div className="flex flex-col gap-3">
          {jobs?.map((job) => (
            <article key={job.id} className="rounded-md border border-border-subtle p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2"><Tag tone={job.status === "COMPLETED" ? "success" : job.status === "FAILED" ? "concern" : "attention"}>{job.status}</Tag><span className="text-sm">{job.targetCategory.name}</span></div>
                {job.status === "QUEUED" || job.status === "RUNNING" ? <Button size="sm" variant="ghost" onClick={() => void cancel(job.id)}>{tr("لغو", "Cancel")}</Button> : null}
              </div>
              <p className="mt-2 text-metadata text-text-secondary" dir="ltr">{job.submittedUrls.join(" · ")}</p>
              <p className="mt-2 text-metadata text-text-secondary">{tr("صفحه / دیده‌شده / پیش‌نویس / خطا", "Pages / seen / drafts / failed")}: {job.pagesVisited} / {job.productsSeen} / {job.productsImported} / {job.productsFailed}</p>
              {job.lastError ? <p role="alert" className="mt-1 text-metadata text-state-urgent">{job.lastError}</p> : null}
              {job.items.map((item) => (
                <div key={item.id} className="mt-3 border-t border-border-subtle pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag tone={item.status === "IMPORTED" ? "success" : item.status === "FAILED" ? "concern" : "attention"}>{item.status}</Tag>
                    <span className="text-sm">{item.pendingSnapshot?.title ?? item.sourceSnapshot.title ?? item.sourceItemId}</span>
                    {item.sourceSnapshot.brandName ? <span className="text-metadata text-text-secondary">{tr("برند منبع", "Source brand")}: {item.sourceSnapshot.brandName}</span> : null}
                    {item.product ? <a className="text-metadata text-brand-natural" href={`/${lang}/admin/commerce/products`}>{trf("پیش‌نویس {id}", "Draft {id}", { id: item.product.id.slice(0, 8) })}</a> : null}
                  </div>
                  {item.pendingSnapshot ? <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" onClick={() => void decide(item.id, true)}>{tr("اعمال نسخهٔ منبع", "Apply source version")}</Button><Button size="sm" variant="ghost" onClick={() => void decide(item.id, false)}>{tr("رد تغییر", "Reject change")}</Button></div> : null}
                  {item.errorDetail ? <p className="mt-1 text-metadata text-state-attention">{item.errorDetail}</p> : null}
                </div>
              ))}
            </article>
          ))}
        </div>
        {jobs?.some((job) => job.items.some((item) => item.pendingSnapshot)) ? <Input className="mt-3" label={tr("دلیل اعمال یا رد تغییر منبع", "Reason for applying or rejecting source changes")} value={reason} onChange={(event) => setReason(event.target.value)} /> : null}
      </Panel>
    </div>
  );
}
