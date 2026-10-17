"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@petlife/ui";
import { useProviderStore } from "@/stores/provider-store";
import { clinicOsService, type ClinicNote } from "@/services/clinic-os.service";
export function ClinicCustomerNotes({ householdId }: {
    householdId: string;
}) {
    const t = useTranslations("clinicWorkspace.notes"), locale = useLocale();
    const active = useProviderStore(s => s.context?.active);
    const [open, setOpen] = useState(false), [notes, setNotes] = useState<ClinicNote[]>([]), [body, setBody] = useState(""), [visible, setVisible] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(false), [loading, setLoading] = useState(false), [revision, setRevision] = useState(0), [remove, setRemove] = useState<string | null>(null);
    useEffect(() => { if (!open)
        return; const controller = new AbortController(); setLoading(true); setError(false); clinicOsService.notes(householdId, controller.signal).then(rows => { if (!controller.signal.aborted)
        setNotes(rows); }).catch(() => { if (!controller.signal.aborted)
        setError(true); }).finally(() => { if (!controller.signal.aborted)
        setLoading(false); }); return () => controller.abort(); }, [open, householdId, revision]);
    async function save() { setBusy(true); setError(false); try {
        setNotes(await clinicOsService.addNote(householdId, { body: body.trim(), visibleToOwner: visible }));
        setBody("");
        setVisible(false);
    }
    catch {
        setError(true);
    }
    finally {
        setBusy(false);
    } }
    async function confirmRemove() { if (!remove)
        return; setBusy(true); setError(false); try {
        setNotes(await clinicOsService.removeNote(householdId, remove));
        setRemove(null);
    }
    catch {
        setError(true);
    }
    finally {
        setBusy(false);
    } }
    return <div className="space-y-3"><Button variant="secondary" aria-expanded={open} onClick={() => setOpen(v => !v)}>{t("title")}</Button>{open && <>
 {loading ? <p role="status">{t("loading")}</p> : <>{notes.length === 0 && !error && <p>{t("empty")}</p>}{notes.map(note => <article key={note.id} className="border-t border-border-subtle py-3"><p className="whitespace-pre-wrap break-words">{note.body}</p><p>{note.authorName}</p><time dateTime={note.createdAt}>{new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium" }).format(new Date(note.createdAt))}</time><p>{t(note.visibleToOwner ? "shared" : "internal")}</p>{(active?.role === "OWNER" || active?.providerUserId === note.authorProviderUserId) && <Button variant="secondary" disabled={busy} onClick={() => setRemove(note.id)}>{t("remove")}</Button>}</article>)}</>}
 {error && <div role="alert"><p>{t("error")}</p><Button variant="secondary" onClick={() => setRevision(v => v + 1)}>{t("retry")}</Button></div>}
 <form className="space-y-3" onSubmit={e => { e.preventDefault(); void save(); }}><label className="block">{t("body")}<textarea className="block w-full" required maxLength={2000} value={body} onChange={e => setBody(e.target.value)}/></label><label className="flex items-center gap-2"><input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)}/>{t("share")}</label><p className="text-text-secondary">{t("privacy")}</p><Button type="submit" disabled={busy || !body.trim()}>{t("save")}</Button></form>
 {remove && <section role="alertdialog" aria-label={t("confirm")} className="rounded-lg border border-border-subtle p-4"><p>{t("confirm")}</p><Button disabled={busy} onClick={() => void confirmRemove()}>{t("remove")}</Button><Button variant="secondary" disabled={busy} onClick={() => setRemove(null)}>{t("keep")}</Button></section>}
 </>}</div>;
}
