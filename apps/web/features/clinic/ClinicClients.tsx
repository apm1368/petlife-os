"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, Input, Select, StatusLabel } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { LocalDateTimeField } from "@/features/shared/date-picker/LocalDateTimeField";
import { useInstantFormat } from "@/lib/date/use-instant-format";
import {
  clinicClientsService,
  type ClinicClient,
  type ClinicClientDetail,
  type ClinicSmsMode,
} from "@/services/clinic-clients.service";

const KINDS = ["CHECKUP", "VACCINATION", "MEDICATION", "FOLLOW_UP", "MESSAGE"] as const;
type PetDraft = { name: string; species: string; birthDate: string };
const emptyPet = (): PetDraft => ({ name: "", species: "", birthDate: "" });

/** Says plainly whether texts really reach phones: LIVE, SANDBOX (recorded, not delivered) or OFF. */
export function ClinicSmsModeNotice({ mode }: { mode: ClinicSmsMode }) {
  const t = useTranslations("clinicClients");
  if (mode === "LIVE") return <p role="status" className="clinic-sms-mode clinic-sms-mode--live">{t("sms.live")}</p>;
  return (
    <p role="status" className="clinic-sms-mode clinic-sms-mode--sandbox">
      <b>{t(mode === "OFF" ? "sms.offTitle" : "sms.sandboxTitle")}</b> {t(mode === "OFF" ? "sms.off" : "sms.sandbox")}
    </p>
  );
}

/**
 * The clinic's own clients: add an owner with their pets, text them, invite them to opetlife, and set reminders for
 * their pets — including owners who are not on the platform yet.
 */
export function ClinicClients({ canRemind }: { canRemind: boolean }) {
  const t = useTranslations("clinicClients");
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ smsMode: ClinicSmsMode; items: ClinicClient[] } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setFailed(null);
      clinicClientsService
        .list(q.trim(), controller.signal)
        .then((value) => !controller.signal.aborted && setData(value))
        .catch((e: unknown) => !controller.signal.aborted && setFailed(e instanceof ApiError && e.status === 403 ? "forbidden" : "loadFailed"));
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, revision]);

  return (
    <div className="clinic-clients">
      <header className="clinic-clients__head">
        <div>
          <h2 className="text-section-title">{t("title")}</h2>
          <p className="text-text-secondary">{t("intro")}</p>
        </div>
        <Button onClick={() => setAdding((v) => !v)} aria-expanded={adding}>{adding ? t("cancel") : t("add")}</Button>
      </header>
      {data ? <ClinicSmsModeNotice mode={data.smsMode} /> : null}
      {adding ? <ClientForm onSaved={(client) => { setAdding(false); setRevision((v) => v + 1); setOpenId(client.id); }} /> : null}
      <Input label={t("search")} value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} />
      {failed ? (
        <div role="alert">
          <p>{t(failed)}</p>
          {failed !== "forbidden" ? <Button variant="secondary" onClick={() => setRevision((v) => v + 1)}>{t("retry")}</Button> : null}
        </div>
      ) : !data ? (
        <p role="status">{t("loading")}</p>
      ) : data.items.length === 0 ? (
        <ContextSurface><p>{q ? t("noMatch") : t("empty")}</p></ContextSurface>
      ) : (
        <ul className="clinic-clients__list">
          {data.items.map((client) => (
            <li key={client.id}>
              <ContextSurface className="clinic-client">
                <button type="button" className="clinic-client__row" aria-expanded={openId === client.id} onClick={() => setOpenId(openId === client.id ? null : client.id)}>
                  <span className="clinic-client__who">
                    <b>{client.name}</b>
                    <small>{client.pets.map((p) => p.name).join(" · ") || t("noPets")}</small>
                  </span>
                  <span className="clinic-client__meta">
                    {client.phone ? <bdi dir="ltr">{client.phone}</bdi> : <span>{t("noPhone")}</span>}
                    <StatusLabel tone={client.status === "JOINED" ? "success" : client.status === "INVITED" ? "attention" : "neutral"}>{t(`status.${client.status}`)}</StatusLabel>
                  </span>
                </button>
                {openId === client.id ? <ClientDetail id={client.id} canRemind={canRemind} onChanged={() => setRevision((v) => v + 1)} /> : null}
              </ContextSurface>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function errorKey(e: unknown) {
  const reason = e instanceof ApiError ? (e.details?.reason as string | undefined) : undefined;
  return reason && ["CLIENT_EXISTS", "INVALID_PHONE", "INVALID_EMAIL", "NO_PHONE", "OPTED_OUT", "CLIENT_DAILY_LIMIT", "CLINIC_DAILY_LIMIT", "ALREADY_JOINED", "LENGTH", "TOO_MANY_OPEN_REMINDERS"].includes(reason)
    ? `errors.${reason}`
    : e instanceof ApiError && e.status === 403
      ? "errors.PLAN"
      : "errors.GENERIC";
}

function ClientForm({ onSaved }: { onSaved: (client: ClinicClient) => void }) {
  const t = useTranslations("clinicClients");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [pets, setPets] = useState<PetDraft[]>([emptyPet()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (busy || name.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const client = await clinicClientsService.create({
        name: name.trim(),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        pets: pets.filter((p) => p.name.trim()).map((p) => ({ name: p.name.trim(), ...(p.species.trim() ? { species: p.species.trim() } : {}), ...(p.birthDate ? { birthDate: p.birthDate } : {}) })),
      });
      onSaved(client);
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ContextSurface>
      <form className="clinic-client-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <h3 className="text-section-title">{t("newClient")}</h3>
        <div className="clinic-client-form__grid">
          <Input label={t("name")} required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          <Input label={t("phone")} inputMode="tel" dir="ltr" maxLength={20} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0912…" />
          <Input label={t("email")} type="email" dir="ltr" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label={t("notes")} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <fieldset className="clinic-client-form__pets">
          <legend>{t("pets")}</legend>
          {pets.map((pet, index) => (
            <div key={index} className="clinic-client-form__pet">
              <Input label={t("petName")} maxLength={60} value={pet.name} onChange={(e) => setPets((all) => all.map((p, i) => (i === index ? { ...p, name: e.target.value } : p)))} />
              <Input label={t("species")} maxLength={40} value={pet.species} onChange={(e) => setPets((all) => all.map((p, i) => (i === index ? { ...p, species: e.target.value } : p)))} />
              <Input label={t("birthDate")} type="date" value={pet.birthDate} onChange={(e) => setPets((all) => all.map((p, i) => (i === index ? { ...p, birthDate: e.target.value } : p)))} />
              {pets.length > 1 ? <Button type="button" variant="secondary" onClick={() => setPets((all) => all.filter((_, i) => i !== index))}>{t("removePet")}</Button> : null}
            </div>
          ))}
          {pets.length < 10 ? <Button type="button" variant="secondary" onClick={() => setPets((all) => [...all, emptyPet()])}>{t("addPet")}</Button> : null}
        </fieldset>
        {error ? <p role="alert">{error}</p> : null}
        <Button type="submit" isLoading={busy} disabled={name.trim().length < 2}>{t("save")}</Button>
      </form>
    </ContextSurface>
  );
}

function ClientDetail({ id, canRemind, onChanged }: { id: string; canRemind: boolean; onChanged: () => void }) {
  const t = useTranslations("clinicClients");
  const tr = useTranslations("clinicReminders");
  const locale = useLocale();
  const format = useInstantFormat();
  const [detail, setDetail] = useState<ClinicClientDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [petDraft, setPetDraft] = useState<PetDraft>(emptyPet());
  const [reminder, setReminder] = useState({ petId: "", kind: "VACCINATION" as (typeof KINDS)[number], title: "", dueAt: "" });

  const load = useMemo(
    () => (signal?: AbortSignal) =>
      clinicClientsService
        .get(id, signal)
        .then((value) => !signal?.aborted && setDetail(value))
        .catch(() => !signal?.aborted && setFailed(true)),
    [id],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function run(key: string, action: () => Promise<unknown>, done: string) {
    if (busy) return;
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(done);
      await load();
      onChanged();
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setBusy(null);
    }
  }

  if (failed) return <p role="alert">{t("loadFailed")}</p>;
  if (!detail) return <p role="status">{t("loading")}</p>;
  const realPets = detail.pets.filter((p) => !p.id.startsWith("legacy-"));
  const canText = !!detail.phone && !detail.smsOptOut && detail.smsMode !== "OFF";
  const statusText = (status: string) => t(`messageStatus.${status}`);

  return (
    <div className="clinic-client__detail">
      <dl className="clinic-client__facts">
        <div><dt>{t("phone")}</dt><dd>{detail.phone ? <bdi dir="ltr">{detail.phone}</bdi> : t("noPhone")}</dd></div>
        {detail.email ? <div><dt>{t("email")}</dt><dd><bdi dir="ltr">{detail.email}</bdi></dd></div> : null}
        <div><dt>{t("statusLabel")}</dt><dd>{t(`status.${detail.status}`)}{detail.joinedAt ? ` · ${format.dateTime(detail.joinedAt)}` : detail.invitedAt ? ` · ${format.dateTime(detail.invitedAt)}` : ""}</dd></div>
        {detail.notes ? <div><dt>{t("notes")}</dt><dd>{detail.notes}</dd></div> : null}
      </dl>
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert">{error}</p> : null}

      <section aria-label={t("pets")}>
        <h4>{t("pets")}</h4>
        <ul className="clinic-client__pets">
          {detail.pets.map((pet) => (
            <li key={pet.id}>
              <b>{pet.name}</b>
              <small>{[pet.species, pet.birthDate].filter(Boolean).join(" · ")}</small>
              {!pet.id.startsWith("legacy-") ? (
                <Button variant="secondary" size="sm" disabled={!!busy} onClick={() => void run(`pet-${pet.id}`, () => clinicClientsService.removePet(id, pet.id), t("petRemoved"))}>{t("removePet")}</Button>
              ) : null}
            </li>
          ))}
        </ul>
        <form className="clinic-client-form__pet" onSubmit={(e) => { e.preventDefault(); if (petDraft.name.trim()) void run("pet", () => clinicClientsService.addPet(id, { name: petDraft.name.trim(), ...(petDraft.species.trim() ? { species: petDraft.species.trim() } : {}), ...(petDraft.birthDate ? { birthDate: petDraft.birthDate } : {}) }).then(() => setPetDraft(emptyPet())), t("petAdded")); }}>
          <Input label={t("petName")} maxLength={60} value={petDraft.name} onChange={(e) => setPetDraft({ ...petDraft, name: e.target.value })} />
          <Input label={t("species")} maxLength={40} value={petDraft.species} onChange={(e) => setPetDraft({ ...petDraft, species: e.target.value })} />
          <Input label={t("birthDate")} type="date" value={petDraft.birthDate} onChange={(e) => setPetDraft({ ...petDraft, birthDate: e.target.value })} />
          <Button type="submit" variant="secondary" disabled={!!busy || !petDraft.name.trim()}>{t("addPet")}</Button>
        </form>
      </section>

      <section aria-label={t("sms.title")}>
        <h4>{t("sms.title")}</h4>
        <ClinicSmsModeNotice mode={detail.smsMode} />
        {!detail.phone ? <p>{t("errors.NO_PHONE")}</p> : detail.smsOptOut ? <p>{t("errors.OPTED_OUT")}</p> : null}
        <div className="clinic-client__compose">
          <span aria-hidden="true">{t("sms.label")}</span>
          <textarea aria-label={t("sms.label")} maxLength={420} value={text} disabled={!canText} onChange={(e) => setText(e.target.value)} placeholder={t("sms.placeholder")} />
          <small>{t("sms.count", { count: text.length })}</small>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!canText || text.trim().length < 2 || !!busy} isLoading={busy === "sms"} onClick={() => void run("sms", () => clinicClientsService.message(id, text.trim()).then(() => setText("")), t(detail.smsMode === "LIVE" ? "sms.sent" : "sms.recorded"))}>{t("sms.send")}</Button>
          {detail.status !== "JOINED" ? (
            <Button variant="secondary" disabled={!canText || !!busy} isLoading={busy === "invite"} onClick={() => void run("invite", () => clinicClientsService.invite(id, locale === "fa" ? "fa" : "en"), t(detail.smsMode === "LIVE" ? "invite.sent" : "invite.recorded"))}>
              {detail.invitedAt ? t("invite.again") : t("invite.send")}
            </Button>
          ) : null}
          <Button variant="secondary" disabled={!!busy} onClick={() => void run("optout", () => clinicClientsService.update(id, { name: detail.name, smsOptOut: !detail.smsOptOut }), t("saved"))}>
            {detail.smsOptOut ? t("sms.optIn") : t("sms.optOut")}
          </Button>
        </div>
        <p className="text-text-secondary">{t("invite.help")}</p>
      </section>

      {canRemind ? (
        <section aria-label={t("reminders")}>
          <h4>{t("reminders")}</h4>
          <form className="clinic-client-form__grid" onSubmit={(e) => { e.preventDefault(); if (reminder.title.trim()) void run("reminder", () => clinicClientsService.remind({ contactId: id, ...(reminder.petId ? { clientPetId: reminder.petId } : {}), kind: reminder.kind, title: reminder.title.trim(), ...(reminder.dueAt ? { dueAt: new Date(reminder.dueAt).toISOString() } : {}) }).then(() => setReminder({ ...reminder, title: "", dueAt: "" })), t("reminderSaved")); }}>
            <Select label={tr("pet")} value={reminder.petId} onChange={(e) => setReminder({ ...reminder, petId: e.target.value })} options={[{ value: "", label: t("anyPet") }, ...realPets.map((p) => ({ value: p.id, label: p.name }))]} />
            <Select label={tr("kind")} value={reminder.kind} onChange={(e) => setReminder({ ...reminder, kind: e.target.value as (typeof KINDS)[number] })} options={KINDS.map((k) => ({ value: k, label: tr(`kinds.${k}`) }))} />
            <Input label={tr("messageTitle")} maxLength={120} value={reminder.title} onChange={(e) => setReminder({ ...reminder, title: e.target.value })} />
            <LocalDateTimeField label={tr("dueAt")} value={reminder.dueAt} onChange={(value) => setReminder({ ...reminder, dueAt: value })} />
            <Button type="submit" disabled={!!busy || !reminder.title.trim()}>{reminder.dueAt ? tr("schedule") : tr("sendNow")}</Button>
          </form>
          {detail.reminders.length ? (
            <ul className="clinic-client__history">
              {detail.reminders.map((r) => (
                <li key={r.id}><b>{r.title}</b>{r.petName ? ` · ${r.petName}` : ""} <small>{format.dateTime(r.dueAt)} · {tr.has(`statuses.${r.status}`) ? tr(`statuses.${r.status}`) : r.status}</small></li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section aria-label={t("history")}>
        <h4>{t("history")}</h4>
        {detail.messages.length === 0 ? <p className="text-text-secondary">{t("noMessages")}</p> : (
          <ul className="clinic-client__history">
            {detail.messages.map((m) => (
              <li key={m.id}>
                <StatusLabel tone={m.status === "SENT" ? "success" : m.status === "SIMULATED" ? "attention" : m.status === "FAILED" ? "urgent" : "neutral"}>{statusText(m.status)}</StatusLabel>{" "}
                <small>{t(`messageKind.${m.kind}`)} · {format.dateTime(m.createdAt)}</small>
                <p>{m.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
