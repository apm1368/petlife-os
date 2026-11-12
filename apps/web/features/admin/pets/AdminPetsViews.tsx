"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { PetSpecies, type AdminPet360Dto, type AdminPetDirectoryItemDto, type PaginatedDto } from "@petlife/types";
import { Dialog, PawPrint, Search } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import type { RouteLocale } from "@/lib/i18n/config";
import { adminPetsService } from "@/services/admin-pets.service";
import { useAdminStore } from "@/stores/admin-store";
import "./admin-pets.css";

const SPECIES = Object.values(PetSpecies);

function usePermissions() {
  const context = useAdminStore((s) => s.context);
  return { ready: !!context, has: (p: string) => !!context?.permissions?.includes(p as never) };
}

function useDate() {
  const locale = useLocale() as RouteLocale;
  return useCallback(
    (iso: string | null | undefined, withTime = false) =>
      iso
        ? new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : locale, withTime ? { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" } : { dateStyle: "medium", timeZone: "Asia/Tehran" }).format(new Date(iso))
        : "—",
    [locale],
  );
}

function Forbidden() {
  const t = useTranslations("adminPets");
  return (
    <section className="gx-card" role="alert">
      <h1>{t("title")}</h1>
      <p className="gx-muted">{t("forbidden")}</p>
    </section>
  );
}

/** /admin/pets — every pet, found by its own name, its owner's or a family member's name, an ID or a microchip. */
export function AdminPetsView() {
  const t = useTranslations("adminPets");
  const locale = useLocale();
  const date = useDate();
  const perms = usePermissions();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [species, setSpecies] = useState<PetSpecies | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedDto<AdminPetDirectoryItemDto> | null>(null);
  const [failed, setFailed] = useState<"forbidden" | "error" | null>(null);

  const load = useCallback(async () => {
    setFailed(null);
    setData(null);
    try {
      setData(await adminPetsService.list({ q: query || undefined, species: species === "ALL" ? undefined : species, page }));
    } catch (error) {
      setFailed(error instanceof ApiError && error.status === 403 ? "forbidden" : "error");
    }
  }, [query, species, page]);

  useEffect(() => {
    void load();
  }, [load]);

  if ((perms.ready && !perms.has("customer.view")) || failed === "forbidden") return <Forbidden />;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="gx-page">
      <header className="gx-head">
        <div>
          <p className="gx-kicker">
            <PawPrint size={16} aria-hidden="true" />
            {t("kicker")}
          </p>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
      </header>
      <section className="gx-card">
        <form
          className="gx-toolbar"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQuery(q.trim());
          }}
        >
          <label className="gx-field ap-search">
            <span>{t("search")}</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label className="gx-field">
            <span>{t("speciesFilter")}</span>
            <select
              value={species}
              onChange={(e) => {
                setPage(1);
                setSpecies(e.target.value as PetSpecies | "ALL");
              }}
            >
              <option value="ALL">{t("allSpecies")}</option>
              {SPECIES.map((s) => (
                <option key={s} value={s}>
                  {t(`species.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="gx-btn">
            <Search size={16} aria-hidden="true" />
            {t("searchButton")}
          </button>
        </form>
        {failed === "error" ? (
          <div className="gx-inline-alert" role="alert">
            <p>{t("failed")}</p>
            <button type="button" className="gx-btn" onClick={() => void load()}>
              {t("retry")}
            </button>
          </div>
        ) : !data ? (
          <div className="gx-skel" style={{ height: 240 }} aria-label={t("loading")} />
        ) : data.items.length === 0 ? (
          <p className="gx-empty">{query || species !== "ALL" ? t("emptySearch") : t("empty")}</p>
        ) : (
          <div className="gx-table-wrap">
            <table className="gx-table">
              <thead>
                <tr>
                  <th>{t("columns.pet")}</th>
                  <th>{t("columns.species")}</th>
                  <th>{t("columns.owner")}</th>
                  <th>{t("columns.household")}</th>
                  <th className="gx-num">{t("columns.family")}</th>
                  <th>{t("columns.status")}</th>
                  <th>{t("columns.created")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((pet) => (
                  <tr key={pet.id}>
                    <td>
                      <strong>{pet.name}</strong>
                    </td>
                    <td>
                      {t(`species.${pet.species}`)}
                      {pet.breed ? ` · ${pet.breed}` : ""}
                    </td>
                    <td>{pet.owner ? pet.owner.displayName : <span className="gx-tag ap-warn">{t("noOwner")}</span>}</td>
                    <td>{pet.household.name ?? t("detail.unnamedHousehold")}</td>
                    <td className="gx-num">{new Intl.NumberFormat(locale === "fa" ? "fa-IR" : locale).format(pet.familyMemberCount)}</td>
                    <td>
                      <span className={`gx-tag ap-life ap-life--${pet.deleted ? "deleted" : pet.lifecycleStatus}`}>{pet.deleted ? t("lifecycle.deleted") : t(`lifecycle.${pet.lifecycleStatus}`)}</span>
                    </td>
                    <td>{date(pet.createdAt)}</td>
                    <td>
                      <Link className="gx-btn" href={`/${locale}/admin/pets/${pet.id}`}>
                        {t("open")}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && pages > 1 ? (
          <nav className="gx-toolbar ap-pager" aria-label={t("pageOf", { page, pages })}>
            <button type="button" className="gx-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              {t("previous")}
            </button>
            <span className="gx-muted">{t("pageOf", { page, pages })}</span>
            <button type="button" className="gx-btn" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              {t("next")}
            </button>
          </nav>
        ) : null}
      </section>
    </div>
  );
}

/** A translated label for a status code, falling back to the code itself for a value added later. */
function useLabel() {
  const t = useTranslations("adminPets");
  return (group: string, code: string) => (t.has(`labels.${group}.${code}`) ? t(`labels.${group}.${code}`) : code);
}

function Counts({ items, label }: { items: Record<string, number>; label: (key: string) => string }) {
  const t = useTranslations("adminPets");
  const entries = Object.entries(items).filter(([, n]) => n > 0);
  if (!entries.length) return <p className="gx-muted">{t("detail.none")}</p>;
  return (
    <ul className="ap-chips">
      {entries.map(([key, n]) => (
        <li key={key} className="gx-tag">
          {label(key)}: {n}
        </li>
      ))}
    </ul>
  );
}

/** /admin/pets/[id] — the pet, then its owner and the rest of the household shown apart, then who can reach it. */
export function AdminPetDetailView({ petId }: { petId: string }) {
  const t = useTranslations("adminPets");
  const locale = useLocale();
  const date = useDate();
  const perms = usePermissions();
  const label = useLabel();
  const [data, setData] = useState<AdminPet360Dto | null>(null);
  const [failed, setFailed] = useState<"forbidden" | "error" | null>(null);
  const [revoking, setRevoking] = useState<AdminPet360Dto["accessGrants"][number] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(null);
    try {
      setData(await adminPetsService.get(petId));
    } catch (error) {
      setFailed(error instanceof ApiError && error.status === 403 ? "forbidden" : "error");
    }
  }, [petId]);

  useEffect(() => {
    void load();
  }, [load]);

  if ((perms.ready && !perms.has("customer.view")) || failed === "forbidden") return <Forbidden />;
  if (failed === "error")
    return (
      <div className="gx-inline-alert" role="alert">
        <p>{t("failed")}</p>
        <button type="button" className="gx-btn" onClick={() => void load()}>
          {t("retry")}
        </button>
      </div>
    );
  if (!data) return <div className="gx-skel" style={{ height: 360 }} aria-label={t("loading")} />;

  const { identity, household } = data;
  const owner = household.members.find((m) => m.role === "OWNER") ?? null;
  const family = household.members.filter((m) => m !== owner);
  const ownerIds = new Set(household.members.filter((m) => m.role === "OWNER").map((m) => m.userId));
  const canRevoke = perms.has("pet.access.manage");
  const canOpenCustomer = perms.has("customer.view");
  const fields: [string, string][] = [
    [t("detail.fields.species"), t(`species.${identity.species}`)],
    [t("detail.fields.breed"), identity.breed ?? "—"],
    [t("detail.fields.sex"), identity.sex && t.has(`detail.sex.${identity.sex}`) ? t(`detail.sex.${identity.sex}`) : "—"],
    [t("detail.fields.birthDate"), date(identity.birthDate)],
    [t("detail.fields.age"), identity.approximateAgeMonths != null ? t("detail.months", { months: identity.approximateAgeMonths }) : "—"],
    [t("detail.fields.neutered"), identity.neuteredStatus && t.has(`detail.neutered.${identity.neuteredStatus}`) ? t(`detail.neutered.${identity.neuteredStatus}`) : "—"],
    [t("detail.fields.microchip"), identity.microchipMasked ?? "—"],
    [t("detail.fields.status"), identity.deletedAt ? t("lifecycle.deleted") : t(`lifecycle.${identity.lifecycleStatus}`)],
    [t("detail.fields.created"), date(identity.createdAt)],
    [t("detail.fields.photo"), identity.hasPhoto ? t("detail.yes") : t("detail.no")],
  ];

  return (
    <div className="gx-page">
      <header className="gx-head">
        <div>
          <p className="gx-kicker">
            <PawPrint size={16} aria-hidden="true" />
            <Link href={`/${locale}/admin/pets`}>{t("detail.back")}</Link>
          </p>
          <h1>{identity.name}</h1>
          <p>{t("detail.household", { name: household.name ?? t("detail.unnamedHousehold") })}{household.city ? ` · ${household.city}` : ""}</p>
        </div>
      </header>
      {notice ? (
        <p className="gx-inline-note" role="status">
          {notice}
        </p>
      ) : null}

      {data.diagnostics.length ? (
        <section className="gx-card ap-diagnostics">
          <header>
            <h2>{t("detail.diagnostics")}</h2>
          </header>
          <ul className="ap-list">
            {data.diagnostics.map((d, i) => (
              <li key={`${d.code}-${d.entityId ?? i}`} className={d.severity === "WARNING" ? "ap-warn-row" : undefined}>
                {t(`detail.diagnosticCodes.${d.code}`)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="gx-grid ap-three">
        <section className="gx-card">
          <header>
            <h2>{t("detail.identity")}</h2>
          </header>
          <dl className="ap-facts">
            {fields.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="gx-card">
          <header>
            <h2>{t("detail.owner")}</h2>
          </header>
          {owner ? (
            <div className="ap-person">
              <strong>{owner.displayName}</strong>
              <span className={`gx-tag ${owner.accountStatus === "SUSPENDED" ? "ap-warn" : ""}`}>{t(`detail.accountStatus.${owner.accountStatus === "SUSPENDED" ? "SUSPENDED" : "ACTIVE"}`)}</span>
              {canOpenCustomer ? (
                <Link className="gx-btn" href={`/${locale}/admin/customers/${owner.userId}`}>
                  {t("detail.openCustomer")}
                </Link>
              ) : null}
            </div>
          ) : (
            <p className="gx-muted ap-warn-row">{t("detail.ownerMissing")}</p>
          )}
        </section>

        <section className="gx-card">
          <header>
            <h2>{t("detail.family")}</h2>
          </header>
          {family.length === 0 ? (
            <p className="gx-muted">{t("detail.familyEmpty")}</p>
          ) : (
            <ul className="ap-list">
              {family.map((m) => (
                <li key={m.userId} className="ap-person">
                  <strong>{m.displayName}</strong>
                  <span className="gx-tag">{t(`detail.roles.${m.role === "OWNER" ? "OWNER" : "FAMILY"}`)}</span>
                  {m.accountStatus === "SUSPENDED" ? <span className="gx-tag ap-warn">{t("detail.accountStatus.SUSPENDED")}</span> : null}
                  {canOpenCustomer ? (
                    <Link className="gx-link" href={`/${locale}/admin/customers/${m.userId}`}>
                      {t("detail.openCustomer")}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {household.pendingInvitations.length ? (
            <>
              <h3 className="ap-subhead">{t("detail.invitations")}</h3>
              <ul className="ap-list">
                {household.pendingInvitations.map((inv) => (
                  <li key={inv.id}>
                    <span dir="ltr">{inv.contactMasked}</span> · {t("detail.invitationExpires", { date: date(inv.expiresAt) })}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      </div>

      <section className="gx-card">
        <header>
          <h2>{t("detail.grants")}</h2>
          <p>{t("detail.ownerGrantNote")}</p>
        </header>
        {data.accessGrants.length === 0 ? (
          <p className="gx-empty">{t("detail.grantsEmpty")}</p>
        ) : (
          <div className="gx-table-wrap">
            <table className="gx-table">
              <thead>
                <tr>
                  <th>{t("detail.grantColumns.person")}</th>
                  <th>{t("detail.grantColumns.source")}</th>
                  <th>{t("detail.grantColumns.scope")}</th>
                  <th>{t("detail.grantColumns.period")}</th>
                  <th>{t("detail.grantColumns.state")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.accessGrants.map((g) => {
                  const state = g.revokedAt ? "revoked" : g.active ? "active" : "inactive";
                  const granted = Object.values(g.flags).filter(Boolean).length;
                  const isOwner = ownerIds.has(g.user.id);
                  return (
                    <tr key={g.id}>
                      <td>
                        {g.user.displayName}
                        {!g.isHouseholdMember ? <span className="gx-tag ap-muted-tag">{t("detail.notMember")}</span> : null}
                      </td>
                      <td>{t.has(`detail.sources.${g.source}`) ? t(`detail.sources.${g.source}`) : g.source}</td>
                      <td>{t("detail.scopeCount", { count: granted })}</td>
                      <td>
                        {date(g.startsAt ?? g.createdAt)} – {g.expiresAt ? date(g.expiresAt) : "∞"}
                      </td>
                      <td>
                        <span className={`gx-tag ap-grant ap-grant--${state}`}>{t(`detail.states.${state}`)}</span>
                      </td>
                      <td>
                        {canRevoke && !g.revokedAt && !isOwner ? (
                          <button type="button" className="gx-btn" onClick={() => setRevoking(g)}>
                            {t("detail.revoke")}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="gx-grid ap-three">
        <section className="gx-card">
          <header>
            <h2>{t("detail.health")}</h2>
          </header>
          <dl className="ap-facts">
            {(
              [
                ["documents", data.health.documents],
                ["visits", data.health.clinicalVisits],
                ["labs", data.health.labResults],
                ["conditions", data.health.conditions],
                ["allergies", data.health.allergies],
                ["medications", Object.values(data.health.medications).reduce((a, b) => a + b, 0)],
              ] as const
            ).map(([key, n]) => (
              <div key={key}>
                <dt>{t(`detail.healthFields.${key}`)}</dt>
                <dd>{n}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="gx-card">
          <header>
            <h2>{t("detail.care")}</h2>
          </header>
          <Counts items={data.care.reminders} label={(k) => label("reminderState", k)} />
          <h3 className="ap-subhead">{t("detail.insurance")}</h3>
          <Counts items={data.insurance.applications} label={(k) => label("insuranceStatus", k)} />
          {data.insurance.claimPreps ? <p className="gx-muted">{t("detail.claimPreps", { count: data.insurance.claimPreps })}</p> : null}
          <h3 className="ap-subhead">{t("detail.sharing")}</h3>
          <p className="gx-muted">
            {t("detail.shareCards", { count: data.sharing.activeShareCards })} · {t("detail.healthShares", { count: data.sharing.activeHealthShares })}
          </p>
        </section>
        <section className="gx-card">
          <header>
            <h2>{t("detail.bookings")}</h2>
          </header>
          {data.bookings.length === 0 ? (
            <p className="gx-muted">{t("detail.none")}</p>
          ) : (
            <ul className="ap-list">
              {data.bookings.map((b) => (
                <li key={b.id}>
                  {label("serviceCategory", b.category)} · <span className="gx-tag">{label("bookingStatus", b.bookingStatus)}</span> · {date(b.startAt, true)}
                </li>
              ))}
            </ul>
          )}
          <h3 className="ap-subhead">{t("detail.travel")}</h3>
          {data.travel.length === 0 ? (
            <p className="gx-muted">{t("detail.none")}</p>
          ) : (
            <ul className="ap-list">
              {data.travel.map((trip) => (
                <li key={trip.id}>
                  {[trip.destinationCity, trip.destinationCountry].filter(Boolean).join(", ") || "—"} · <span className="gx-tag">{label("tripStatus", trip.status)}</span> · {date(trip.departAt)}
                </li>
              ))}
            </ul>
          )}
          <h3 className="ap-subhead">{t("detail.lost")}</h3>
          {data.lostIncidents.length === 0 ? (
            <p className="gx-muted">{t("detail.none")}</p>
          ) : (
            <ul className="ap-list">
              {data.lostIncidents.map((l) => (
                <li key={l.id}>
                  <span className="gx-tag">{label("lostStatus", l.status)}</span> · {l.publicArea ?? "—"} · {date(l.createdAt)} · {t("detail.sightings", { count: l.sightings })}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="gx-card">
        <header>
          <h2>{t("detail.activity")}</h2>
        </header>
        {data.activity.length === 0 ? (
          <p className="gx-muted">{t("detail.none")}</p>
        ) : (
          <ul className="ap-list">
            {data.activity.map((a) => (
              <li key={a.id}>
                <code dir="ltr">{a.type}</code> · {date(a.at, true)}
                {a.changedFields?.length ? ` · ${t("detail.changed", { fields: a.changedFields.join(", ") })}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      {revoking ? (
        <RevokeDialog
          petId={petId}
          grant={revoking}
          onClose={() => setRevoking(null)}
          onDone={() => {
            setRevoking(null);
            setNotice(t("detail.revoked"));
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function RevokeDialog({ petId, grant, onClose, onDone }: { petId: string; grant: AdminPet360Dto["accessGrants"][number]; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("adminPets");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    if (reason.trim().length < 5) {
      setError(t("detail.reasonTooShort"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await adminPetsService.revokeGrant(petId, grant.id, reason.trim());
      onDone();
    } catch {
      setError(t("detail.revokeFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={t("detail.revokeTitle", { name: grant.user.displayName })}>
      <div className="ap-form">
        <label className="gx-field">
          <span>{t("detail.revokeReason")}</span>
          <input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </label>
        {error ? (
          <p className="ap-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="gx-toolbar">
          <button type="button" className="gx-btn gx-btn--primary" disabled={busy} onClick={() => void revoke()}>
            {t("detail.revokeConfirm")}
          </button>
          <button type="button" className="gx-btn" onClick={onClose}>
            {t("detail.revokeCancel")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
