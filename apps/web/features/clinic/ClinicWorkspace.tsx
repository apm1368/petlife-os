"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, Input, ContextSurface } from "@petlife/ui";
import { clinicOsService, type ClinicSubscription, type ClinicTask, type ClinicCustomer, type ClinicQueueRow } from "@/services/clinic-os.service";
import { useProviderStore } from "@/stores/provider-store";
import { ClinicCustomerNotes } from "./ClinicCustomerNotes";
const taskTypes = ["CALL_CUSTOMER", "FOLLOW_UP_LAB", "CONFIRM_APPOINTMENT", "COLLECT_PAYMENT", "OTHER"] as const;
const buckets = ["SCHEDULED", "WAITING", "IN_CONSULTATION", "COMPLETED", "NO_SHOW", "CANCELLED"] as const;
export function ClinicWorkspace() {
    const organization = useProviderStore(s => s.context?.active?.providerOrganizationId);
    return <ClinicWorkspaceContent key={organization}/>;
}
function ClinicWorkspaceContent() {
    const t = useTranslations("clinicWorkspace"), locale = useLocale();
    const organization = useProviderStore(s => s.context?.active?.providerOrganizationId);
    const [tab, setTab] = useState("queue"), [status, setStatus] = useState("OPEN"), [query, setQuery] = useState(""), [page, setPage] = useState(1);
    const [date, setDate] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()));
    const [subscription, setSubscription] = useState<ClinicSubscription | null>(null), [tasks, setTasks] = useState<ClinicTask[]>([]), [customers, setCustomers] = useState<ClinicCustomer[]>([]), [queue, setQueue] = useState<Record<string, ClinicQueueRow[]>>({}), [total, setTotal] = useState(0);
    const [subscriptionError, setSubscriptionError] = useState(false);
    const [loading, setLoading] = useState(true), [error, setError] = useState(false), [saveError, setSaveError] = useState(false), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
    const [title, setTitle] = useState(""), [type, setType] = useState<string>("OTHER"), [dueAt, setDueAt] = useState("");
    useEffect(() => { const controller = new AbortController(); setSubscription(null); setSubscriptionError(false); clinicOsService.subscription(controller.signal).then(r => { if (!controller.signal.aborted)
        setSubscription(r); }).catch(() => { if (!controller.signal.aborted)
        setSubscriptionError(true); }); return () => controller.abort(); }, [organization, revision]);
    const canCustomers = subscription?.plan.entitlements.some(e => e.key === "clinic.customers" && e.enabled);
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError(false);
        setTasks([]);
        setCustomers([]);
        setQueue({});
        const request = tab === "queue" ? clinicOsService.queue(date, controller.signal).then(r => { if (!controller.signal.aborted)
            setQueue(r.buckets); }) : tab === "tasks" ? clinicOsService.tasks(status, controller.signal).then(r => { if (!controller.signal.aborted)
            setTasks(r); }) : tab === "customers" && canCustomers ? clinicOsService.customers(query, page, controller.signal).then(r => { if (!controller.signal.aborted) {
            setCustomers(r.items);
            setTotal(r.total);
        } }) : Promise.resolve();
        request.catch(() => { if (!controller.signal.aborted)
            setError(true); }).finally(() => { if (!controller.signal.aborted)
            setLoading(false); });
        return () => controller.abort();
    }, [organization, tab, date, status, query, page, revision, canCustomers]);
    async function mutate(action: () => Promise<unknown>, clear = false) { setBusy(true); setSaveError(false); try {
        await action();
        if (clear) {
            setTitle("");
            setDueAt("");
        }
        setRevision(r => r + 1);
    }
    catch {
        setSaveError(true);
    }
    finally {
        setBusy(false);
    } }
    const number = (n: number) => new Intl.NumberFormat(locale).format(n);
    const timestamp = (value: string) => new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
    return <div className="space-y-6"><header><h1 className="text-page-title">{t("title")}</h1><p className="text-text-secondary">{t("intro")}</p></header>
 <nav className="flex flex-wrap gap-2" aria-label={t("title")}>{["queue", "tasks", ...(canCustomers ? ["customers"] : []), "plan"].map(item => <Button key={item} variant={tab === item ? "primary" : "secondary"} onClick={() => { setTab(item); setSaveError(false); }}>{t(item)}</Button>)}</nav>
 {saveError && <p role="alert" className="text-status-danger">{t("saveError")}</p>}
 {error || subscriptionError ? <ContextSurface><p role="alert">{t("loadError")}</p><Button onClick={() => setRevision(r => r + 1)}>{t("retry")}</Button></ContextSurface> : loading ? <p role="status">{t("loading")}</p> : <>
 {tab === "queue" && <><div><Input label={t("date")} type="date" value={date} onChange={e => setDate(e.target.value)}/></div><div className="grid gap-4 lg:grid-cols-3">{buckets.map(bucket => <ContextSurface key={bucket}><h2 className="text-section-title">{t(`buckets.${bucket}`)} · {number(queue[bucket]?.length ?? 0)}</h2>{!queue[bucket]?.length && <p>{t("empty")}</p>}{queue[bucket]?.map(row => <article key={row.bookingId} className="my-3 border-t border-border-subtle pt-3"><h3>{row.pet.name} · {row.serviceName}</h3><p>{row.ownerDisplayName ?? t("unnamed")}</p><p>{timestamp(row.startAt)}</p>{row.assignedTo && <p>{row.assignedTo.name}</p>}<Link className="underline" href={`/${locale}/provider/bookings/${row.bookingId}`}>{t("openBooking")}</Link></article>)}</ContextSurface>)}</div></>}
 {tab === "tasks" && <><ContextSurface><form className="grid gap-3 md:grid-cols-2" onSubmit={e => { e.preventDefault(); void mutate(() => clinicOsService.createTask({ title: title.trim(), type, ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}) }), true); }}><div><Input label={t("taskTitle")} required maxLength={200} value={title} onChange={e => setTitle(e.target.value)}/></div><label>{t("taskType")}<select className="w-full" value={type} onChange={e => setType(e.target.value)}>{taskTypes.map(item => <option key={item} value={item}>{t(`types.${item}`)}</option>)}</select></label><div><Input label={t("dueAt")} type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)}/></div><Button type="submit" disabled={busy || !title.trim()}>{t("create")}</Button></form></ContextSurface><label>{t("filter")}<select value={status} onChange={e => setStatus(e.target.value)}>{["OPEN", "DONE", "CANCELLED"].map(item => <option key={item} value={item}>{t(`statuses.${item}`)}</option>)}</select></label><p className="text-text-secondary">{t("taskLimit")}</p>{!tasks.length && <p>{t("empty")}</p>}{tasks.map(task => <ContextSurface key={task.id}><h2>{task.title}</h2><p>{t(`types.${task.type}`)}</p>{task.dueAt && <p>{timestamp(task.dueAt)}</p>}{task.overdue && <p>{t("overdue")}</p>}{task.status === "OPEN" && <div className="flex gap-2"><Button disabled={busy} onClick={() => void mutate(() => clinicOsService.completeTask(task.id))}>{t("done")}</Button><Button variant="secondary" disabled={busy} onClick={() => void mutate(() => clinicOsService.cancelTask(task.id))}>{t("cancel")}</Button></div>}</ContextSurface>)}</>}
 {tab === "customers" && canCustomers && <><div><Input label={t("search")} value={query} maxLength={100} onChange={e => { setPage(1); setQuery(e.target.value); }}/></div>{!customers.length && <p>{t("empty")}</p>}{customers.map(customer => <ContextSurface key={customer.householdId}><h2>{customer.ownerDisplayName ?? t("unnamed")}</h2><p>{customer.pets.map(p => p.name).join(" · ")}</p><ClinicCustomerNotes key={`${organization}-${customer.householdId}`} householdId={customer.householdId}/><p>{t("visits", { count: number(customer.completedVisitCount) })}</p>{customer.lastVisitAt && <p>{timestamp(customer.lastVisitAt)}</p>}</ContextSurface>)}<div className="flex gap-3"><Button disabled={page === 1} onClick={() => setPage(p => p - 1)}>{t("previous")}</Button><span>{number(page)}</span><Button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}>{t("next")}</Button></div></>}
 {tab === "plan" && subscription && <ContextSurface><h2 className="text-section-title">{locale === "fa" ? subscription.plan.nameFa : subscription.plan.nameEn}</h2><p>{locale === "fa" ? subscription.plan.descriptionFa : subscription.plan.descriptionEn}</p><p>{t("reminderUsage", { count: number(subscription.usage.remindersThisMonth) })}</p>{subscription.currentPeriodEndsAt && <p>{t("expires")} {timestamp(subscription.currentPeriodEndsAt)}</p>}<p>{t("planNote")}</p></ContextSurface>}
 </>}
 </div>;
}
