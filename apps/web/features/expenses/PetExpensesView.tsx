"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { Button, EmptyState, Input, Select, Skeleton } from "@petlife/ui";
import { PET_EXPENSE_CATEGORIES, type PetExpenseCategory, type PetExpenseEntryDto, type PetExpensesDto } from "@petlife/types";
import { petExpensesService } from "@/services/pet-expenses.service";
import { LoadFailure } from "@/features/system/LoadFailure";
import { DateField } from "@/features/shared/date-picker/DateField";
import { apiErrorText } from "@/lib/errors/api-error-text";
import { formatCurrency } from "@/lib/currency/format-currency";
import { calendarFromIso, formatDay, localizeDigits, monthName, todayIso } from "@/lib/date/jalali";
import { formatCount } from "@/lib/number/format-number";
import { CATEGORY_LABELS, SOURCE_LABELS, currentYear, monthlyTotals, parseTomanToIrr, systemFor, yearRange, type Locale } from "./expense-model";

const copy = {
  fa: {
    title: "هزینه‌ها",
    intro: "هر چه برای این حیوان خرج می‌شود، یک‌جا. رزروها و خریدهای فروشگاه پت‌لایف خودکار حساب می‌شوند؛ بقیه را خودتان اضافه کنید.",
    prevYear: "سال قبل",
    nextYear: "سال بعد",
    year: "سال",
    total: "جمع هزینه‌ها",
    monthlyAverage: "میانگین ماهانه",
    entriesCount: "تعداد هزینه",
    byCategory: "بر اساس دسته",
    byMonth: "ماه به ماه",
    entries: "فهرست هزینه‌ها",
    add: "افزودن هزینه",
    edit: "ویرایش",
    remove: "حذف",
    confirmRemove: "این هزینه حذف شود؟",
    yes: "بله، حذف شود",
    no: "انصراف",
    save: "ذخیره",
    close: "بستن",
    amount: "مبلغ (تومان)",
    amountHint: "مثلاً ۲۵۰٬۰۰۰",
    amountError: "مبلغ را به تومان و به‌صورت عدد صحیح وارد کنید.",
    category: "دسته",
    date: "تاریخ",
    note: "یادداشت (اختیاری)",
    emptyTitle: "هنوز هزینه‌ای در این سال ثبت نشده",
    emptyBody: "خرید غذا، ویزیت بیرون از پت‌لایف یا هر هزینه‌ی دیگر را اضافه کنید تا تصویر واقعی خرج‌ها را ببینید.",
    openBooking: "مشاهده رزرو",
    openOrder: "مشاهده سفارش",
    loading: "در حال بارگذاری هزینه‌ها",
    householdOnly: "هزینه‌ها فقط برای اعضای خانواده‌ای که این حیوان در آن است نمایش داده می‌شود.",
    share: "سهم",
  },
  en: {
    title: "Expenses",
    intro: "Everything spent on this pet, in one place. PET LIFE bookings and shop purchases count automatically; add the rest yourself.",
    prevYear: "Previous year",
    nextYear: "Next year",
    year: "Year",
    total: "Total spent",
    monthlyAverage: "Monthly average",
    entriesCount: "Expenses",
    byCategory: "By category",
    byMonth: "Month by month",
    entries: "All expenses",
    add: "Add expense",
    edit: "Edit",
    remove: "Delete",
    confirmRemove: "Delete this expense?",
    yes: "Yes, delete",
    no: "Cancel",
    save: "Save",
    close: "Close",
    amount: "Amount (Toman)",
    amountHint: "e.g. 250,000",
    amountError: "Enter a whole amount in Toman.",
    category: "Category",
    date: "Date",
    note: "Note (optional)",
    emptyTitle: "No expenses recorded for this year yet",
    emptyBody: "Add food, a vet visit outside PET LIFE or anything else to see where the money really goes.",
    openBooking: "View booking",
    openOrder: "View order",
    loading: "Loading expenses",
    householdOnly: "Expenses are visible only to members of the household this pet belongs to.",
    share: "Share",
  },
} as const;

export function PetExpensesView({ petId }: { petId: string }) {
  const locale = (useLocale() === "fa" ? "fa" : "en") as Locale;
  const c = copy[locale];
  const system = systemFor(locale);
  const today = todayIso();
  const [year, setYear] = useState(() => currentYear(system, today));
  const [data, setData] = useState<PetExpensesDto | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [form, setForm] = useState<PetExpenseEntryDto | "new" | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const range = useMemo(() => yearRange(system, year), [system, year]);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await petExpensesService.list(petId, range.from, range.to));
    } catch (err) {
      setError(err);
    }
  }, [petId, range.from, range.to]);

  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  async function remove(id: string) {
    setActionError(null);
    try {
      await petExpensesService.remove(petId, id);
      setConfirmId(null);
      await load();
    } catch (err) {
      setActionError(apiErrorText(err, locale));
    }
  }

  if (error) return <LoadFailure error={error} onRetry={load} />;

  const months = data ? monthlyTotals(data.entries, system, year) : [];
  const maxMonth = Math.max(1, ...months);
  const thisYear = currentYear(system, today);
  // The average divides by months that have happened: all twelve for a past year, so far for this one.
  const elapsedMonths = year < thisYear ? 12 : year > thisYear ? 0 : calendarFromIso(system, today).month;
  const n = (value: number) => formatCount(value, locale);
  const money = (irr: number) => formatCurrency(irr, locale);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-section-title text-text-primary">{c.title}</h1>
          <p className="mt-1 text-sm leading-7 text-text-secondary">{c.intro}</p>
        </div>
        <div className="flex items-center gap-2" role="group" aria-label={c.year}>
          <Button variant="ghost" size="sm" onClick={() => setYear((y) => y - 1)} aria-label={c.prevYear}>
            {locale === "fa" ? "›" : "‹"}
          </Button>
          <span className="min-w-16 text-center font-semibold text-text-primary" aria-live="polite">{localizeDigits(year, locale)}</span>
          <Button variant="ghost" size="sm" onClick={() => setYear((y) => y + 1)} aria-label={c.nextYear} disabled={year >= thisYear}>
            {locale === "fa" ? "‹" : "›"}
          </Button>
          <Button size="sm" onClick={() => setForm("new")}>{c.add}</Button>
        </div>
      </header>

      {form ? <ExpenseForm petId={petId} locale={locale} entry={form === "new" ? null : form} defaultDay={today >= range.from && today <= range.to ? today : range.to} onClose={() => setForm(null)} onSaved={async () => { setForm(null); await load(); }} /> : null}

      {!data ? (
        <Skeleton className="h-64 w-full" aria-label={c.loading} />
      ) : data.entries.length === 0 ? (
        <EmptyState title={c.emptyTitle} description={c.emptyBody} actionLabel={c.add} onAction={() => setForm("new")} />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            <Stat label={c.total} value={money(data.totalIrr)} strong className="col-span-2 sm:col-span-1" />
            <Stat label={c.monthlyAverage} value={money(elapsedMonths > 0 ? Math.round(data.totalIrr / elapsedMonths) : 0)} />
            <Stat label={c.entriesCount} value={n(data.entries.length)} />
          </dl>

          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="exp-cat" className="split-panel">
              <h2 id="exp-cat" className="mb-3 font-semibold text-text-primary">{c.byCategory}</h2>
              <ul className="flex flex-col gap-3">
                {data.byCategory.map((row) => {
                  const pct = data.totalIrr ? Math.round((row.amountIrr / data.totalIrr) * 100) : 0;
                  return (
                    <li key={row.category}>
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="text-text-primary">{CATEGORY_LABELS[row.category][locale]}</span>
                        <span className="text-text-secondary">{money(row.amountIrr)} · {localizeDigits(pct, locale)}٪</span>
                      </div>
                      <div className="mt-1 h-2 w-full bg-surface-subtle" aria-hidden="true">
                        <div className="h-2 bg-brand-solid" style={{ width: `${Math.max(pct, 2)}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section aria-labelledby="exp-month" className="split-panel">
              <h2 id="exp-month" className="mb-3 font-semibold text-text-primary">{c.byMonth}</h2>
              <ol className="flex h-40 items-end gap-1" aria-label={c.byMonth}>
                {months.map((amount, i) => (
                  <li key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1" aria-label={`${monthName(system, i + 1, locale)}: ${money(amount)}`}>
                    <div className="w-full bg-brand-solid opacity-80" style={{ height: `${amount === 0 ? 0 : Math.max(4, Math.round((amount / maxMonth) * 100))}%` }} title={money(amount)} />
                    <span className="text-[10px] leading-none text-text-secondary" aria-hidden="true"><span className="hidden lg:inline">{monthName(system, i + 1, locale)}</span><span className="lg:hidden">{localizeDigits(i + 1, locale)}</span></span>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <section aria-labelledby="exp-list">
            <h2 id="exp-list" className="mb-3 font-semibold text-text-primary">{c.entries}</h2>
            {actionError ? <p role="alert" className="mb-3 text-sm text-state-urgent">{actionError}</p> : null}
            <ul className="divide-y divide-border-subtle border-y border-border-subtle">
              {data.entries.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-text-primary">
                      {CATEGORY_LABELS[entry.category][locale]}
                      {entry.label ? <span className="font-normal text-text-secondary"> · {entry.label}</span> : null}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {formatDay(entry.spentOn, locale)} · {SOURCE_LABELS[entry.source][locale]}
                      {entry.note ? <> · {entry.note}</> : null}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-text-primary">{money(entry.amountIrr)}</span>
                    {entry.source === "MANUAL" ? (
                      confirmId === entry.id ? (
                        <span className="flex items-center gap-2" role="group" aria-label={c.confirmRemove}>
                          <span className="text-xs text-text-secondary">{c.confirmRemove}</span>
                          <Button size="sm" variant="danger" onClick={() => void remove(entry.id)}>{c.yes}</Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>{c.no}</Button>
                        </span>
                      ) : (
                        <span className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setForm(entry)}>{c.edit}</Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirmId(entry.id)}>{c.remove}</Button>
                        </span>
                      )
                    ) : entry.sourceRecordId ? (
                      <Link className="text-sm underline" href={`/${locale}/${entry.source === "BOOKING" ? "bookings" : "orders"}/${entry.sourceRecordId}`}>
                        {entry.source === "BOOKING" ? c.openBooking : c.openOrder}
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
      <p className="text-xs text-text-secondary">{c.householdOnly}</p>
    </div>
  );
}

function Stat({ label, value, strong, className = "" }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <div className={"split-panel " + className}>
      <dt className="text-sm text-text-secondary">{label}</dt>
      <dd className={strong ? "mt-1 text-2xl font-bold text-text-primary" : "mt-1 text-xl font-semibold text-text-primary"}>{value}</dd>
    </div>
  );
}

function ExpenseForm({ petId, locale, entry, defaultDay, onClose, onSaved }: {
  petId: string;
  locale: Locale;
  entry: PetExpenseEntryDto | null;
  defaultDay: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const c = copy[locale];
  const [amount, setAmount] = useState(entry ? String(Math.round(entry.amountIrr / 10)) : "");
  const [category, setCategory] = useState<PetExpenseCategory>(entry?.category ?? "FOOD");
  const [day, setDay] = useState(entry?.spentOn ?? defaultDay);
  const [note, setNote] = useState(entry?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amountIrr = parseTomanToIrr(amount);
    if (amountIrr === null) {
      setError(c.amountError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const input = { category, amountIrr, spentOn: day, note: note.trim() };
      if (entry) await petExpensesService.update(petId, entry.id, input);
      else await petExpensesService.create(petId, { ...input, note: input.note || undefined });
      await onSaved();
    } catch (err) {
      setError(apiErrorText(err, locale));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="split-panel" aria-label={entry ? c.edit : c.add}>
      <form onSubmit={(e) => void submit(e)} className="grid gap-4 sm:grid-cols-2">
        <Input label={c.amount} inputMode="numeric" placeholder={c.amountHint} value={amount} onChange={(e) => setAmount(e.target.value)} required errorMessage={error === c.amountError ? error : undefined} />
        <Select label={c.category} value={category} onChange={(e) => setCategory(e.target.value as PetExpenseCategory)} options={PET_EXPENSE_CATEGORIES.map((key) => ({ value: key, label: CATEGORY_LABELS[key][locale] }))} />
        <DateField label={c.date} value={day} onChange={setDay} max={todayIso()} />
        <Input label={c.note} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        {error && error !== c.amountError ? <p role="alert" className="text-sm text-state-urgent sm:col-span-2">{error}</p> : null}
        <div className="flex gap-3 sm:col-span-2">
          <Button type="submit" isLoading={busy} disabled={busy}>{c.save}</Button>
          <Button type="button" variant="ghost" onClick={onClose}>{c.close}</Button>
        </div>
      </form>
    </section>
  );
}
