"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Button, ContextSurface, Dialog, EmptyState, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import type { HouseholdDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { householdsService } from "@/services/households.service";
import type { HouseholdCollaborationDto } from "@/services/account.service";
import { useSessionStore } from "@/stores/session-store";
import { AccountPageHeader } from "./AccountNav";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
import { formatAccountDate, useAccountCopy } from "./account-copy";

type Preset = "NONE" | "VIEW_ONLY" | "CARE_HELPER" | "FULL";
type Member = HouseholdCollaborationDto["members"][number];
type PendingConfirm = { kind: "remove"; member: Member } | { kind: "demote"; member: Member } | { kind: "promote"; member: Member } | { kind: "leave" } | null;

/** Plain-language summary of each invite preset — mirrors the exact flags the API grants (households.service PRESETS). */
const PRESET_COPY: Record<Preset, { fa: string; en: string; faHint: string; enHint: string }> = {
  NONE: { fa: "بدون دسترسی", en: "No access", faHint: "این حیوان به او نشان داده نمی‌شود.", enHint: "This pet isn't shared with them." },
  VIEW_ONLY: { fa: "فقط مشاهده", en: "View only", faHint: "هویت و پروفایل مراقبت را می‌بیند؛ سلامت و موقعیت را نه.", enHint: "Sees identity and care profile; not health or location." },
  CARE_HELPER: { fa: "همیار مراقبت", en: "Care helper", faHint: "سلامت را می‌بیند، پروفایل مراقبت را ویرایش و رزرو می‌کند.", enHint: "Sees health, edits the care profile and can book care." },
  FULL: { fa: "دسترسی کامل خانوادگی", en: "Full household access", faHint: "همه‌چیز به‌جز مدیریت دسترسی دیگران.", enHint: "Everything except managing other people's access." },
};

const HISTORY_LABELS: Record<string, [string, string]> = {
  HouseholdInvitationCreated: ["دعوت ارسال شد", "Invitation sent"],
  HouseholdInvitationResent: ["دعوت دوباره ارسال شد", "Invitation resent"],
  HouseholdInvitationCancelled: ["دعوت لغو شد", "Invitation cancelled"],
  HouseholdInvitationAccepted: ["دعوت پذیرفته شد", "Invitation accepted"],
  HouseholdInvitationDeclined: ["دعوت رد شد", "Invitation declined"],
  PetAccessGranted: ["دسترسی داده شد", "Access granted"],
  PetAccessChanged: ["دسترسی تغییر کرد", "Access changed"],
  PetAccessRevoked: ["دسترسی لغو شد", "Access revoked"],
  TemporaryPetAccessExpired: ["دسترسی موقت پایان یافت", "Temporary access ended"],
  HouseholdMemberRemoved: ["عضوی حذف شد", "A member was removed"],
  HouseholdMemberLeft: ["عضوی خانواده را ترک کرد", "A member left"],
  HouseholdMemberRoleChanged: ["نقش یک عضو تغییر کرد", "A member's role changed"],
};

function isActive(grant: { startsAt: string | null; expiresAt: string | null }, now: number) {
  return (!grant.startsAt || new Date(grant.startsAt).getTime() <= now) && (!grant.expiresAt || new Date(grant.expiresAt).getTime() > now);
}

/**
 * Household & access. Membership and pet permissions are shown side by side
 * but stay separate: a member's role says who manages the household, each
 * pet's grants say what they can see and do.
 */
export function HouseholdCenterView() {
  const { t, locale, num } = useAccountCopy();
  const router = useRouter();
  const currentUserId = useSessionStore((s) => s.user?.id);
  const [households, setHouseholds] = useState<HouseholdDto[] | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [data, setData] = useState<HouseholdCollaborationDto | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirm, setConfirm] = useState<PendingConfirm>(null);
  const [busyInvitation, setBusyInvitation] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setFailed(false);
    try {
      const list = await householdsService.listMine();
      setHouseholds(list);
      setSelectedId((current) => (list.some((h) => h.id === current) ? current : list[0]?.id ?? ""));
    } catch {
      setFailed(true);
    }
  }, []);

  const loadDetail = useCallback(async () => {
    if (!selectedId) {
      setData(null);
      return;
    }
    setFailed(false);
    try {
      setData(await householdsService.collaboration(selectedId));
    } catch {
      setFailed(true);
    }
  }, [selectedId]);

  useEffect(() => {
    void loadList();
  }, [loadList]);
  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const accessByMember = useMemo(() => {
    const map = new Map<string, { pets: string[]; temporary: number }>();
    if (!data) return map;
    const now = Date.now();
    for (const member of data.members) {
      const grants = data.grants.filter((g) => g.userId === member.userId && isActive(g, now));
      const pets = data.pets.filter((pet) => grants.some((g) => g.petId === pet.id)).map((pet) => pet.name);
      map.set(member.userId, { pets, temporary: grants.filter((g) => g.source === "TEMPORARY").length });
    }
    return map;
  }, [data]);

  if (failed) return <ErrorRecovery title={t("خانواده و دسترسی", "Household & access")} message={t("اطلاعات خانواده بارگذاری نشد.", "Your household didn't load.")} retryLabel={t("تلاش دوباره", "Retry")} onRetry={() => (households ? loadDetail() : loadList())} />;
  if (!households) return <Skeleton className="h-96 w-full" aria-label={t("در حال بارگذاری", "Loading")} />;

  if (!households.length) {
    return (
      <div className="account-stack">
        <AccountPageHeader eyebrow={t("خانواده", "HOUSEHOLD")} title={t("همکاری امن برای مراقبت", "Care together, securely")} description={t("هر فرد حساب خودش را دارد و دسترسی هر حیوان جداگانه تعیین می‌شود.", "Everyone keeps their own account and each pet's access is explicit.")} />
        <EmptyState title={t("هنوز خانواده‌ای ندارید", "No household yet")} description={t("خانهٔ شما هنگام افزودن اولین حیوان ساخته می‌شود.", "Your household is created when you add your first pet.")} actionLabel={t("شروع راه‌اندازی", "Start setup")} onAction={() => router.push(`/${locale}/onboarding`)} />
      </div>
    );
  }
  if (!data) return <Skeleton className="h-96 w-full" aria-label={t("در حال بارگذاری", "Loading")} />;

  const isOwner = data.currentUserRole === "OWNER";
  const ownerCount = data.members.filter((m) => m.role === "OWNER").length;
  const householdName = data.name || t("خانهٔ من", "My household");

  async function invitationAction(id: string, action: "resend" | "cancel") {
    if (!data) return;
    setBusyInvitation(id);
    setNotice(null);
    try {
      if (action === "resend") await householdsService.resendInvitation(data.id, id);
      else await householdsService.cancelInvitation(data.id, id);
      setNotice(action === "resend" ? t("دعوت دوباره ارسال شد و مهلت آن تمدید شد.", "The invitation was resent with a fresh expiry.") : t("دعوت لغو شد.", "The invitation was cancelled."));
      await loadDetail();
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : t("انجام نشد.", "That didn't work."));
    } finally {
      setBusyInvitation(null);
    }
  }

  return (
    <div className="account-stack">
      <AccountPageHeader eyebrow={t("خانواده و دسترسی", "HOUSEHOLD & ACCESS")} title={householdName} description={t("عضویت در خانواده به معنی دسترسی کامل به اطلاعات حیوان نیست؛ هر دسترسی جداگانه، شفاف و قابل لغو است.", "Being in a household never means automatic full pet access; every grant is separate, visible and reversible.")} />
      {notice ? <div className="account-notice" role="status">{notice}</div> : null}
      {households.length > 1 ? <Select label={t("خانواده", "Household")} value={selectedId} onChange={(e) => setSelectedId(e.target.value)} options={households.map((h) => ({ value: h.id, label: h.name || t("خانهٔ بدون نام", "Unnamed household") }))} /> : null}

      <section aria-labelledby="members-title">
        <div className="account-section-title">
          <div>
            <h2 id="members-title">{t("اعضا", "Members")}</h2>
            <p>{t("مدیران، خانواده و دعوت‌ها را مدیریت می‌کنند؛ اعضا فقط به حیوان‌هایی که با آن‌ها به اشتراک گذاشته شده دسترسی دارند.", "Owners manage the household and invitations; members only reach the pets shared with them.")}</p>
          </div>
          {isOwner ? <Button onClick={() => setInviteOpen(true)}>{t("دعوت عضو", "Invite member")}</Button> : null}
        </div>
        <div className="member-list">
          {data.members.map((member) => {
            const access = accessByMember.get(member.userId);
            const isSelf = member.userId === currentUserId;
            return (
              <div className="member-row member-row--actions" key={member.id}>
                <Avatar name={member.user.displayName} src={member.user.avatarUrl} size="sm" />
                <div>
                  <b>
                    {member.user.displayName}
                    {isSelf ? <span className="text-text-secondary"> · {t("شما", "you")}</span> : null}
                  </b>
                  <p>
                    {access?.pets.length ? t(`دسترسی به ${access.pets.join("، ")}`, `Access to ${access.pets.join(", ")}`) : t("بدون دسترسی فعال به حیوان", "No active pet access")}
                    {access?.temporary ? ` · ${t(`${num(access.temporary)} دسترسی موقت`, `${num(access.temporary)} temporary`)}` : ""}
                  </p>
                  <p className="text-metadata text-text-secondary">{t("عضو از", "Joined")} {formatAccountDate(member.createdAt, locale)}</p>
                </div>
                <div className="member-row__actions">
                  <StatusLabel tone={member.role === "OWNER" ? "success" : "neutral"}>{member.role === "OWNER" ? t("مدیر", "Owner") : t("عضو", "Member")}</StatusLabel>
                  {isOwner && !isSelf && member.role === "FAMILY" ? <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: "promote", member })}>{t("مدیر کردن", "Make owner")}</Button> : null}
                  {isOwner && member.role === "OWNER" && ownerCount > 1 ? <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: "demote", member })}>{t("عضو عادی", "Make member")}</Button> : null}
                  {isOwner && !isSelf ? <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: "remove", member })}>{t("حذف", "Remove")}</Button> : null}
                </div>
              </div>
            );
          })}
        </div>
        <div className="member-leave">
          <Button variant="ghost" size="sm" onClick={() => setConfirm({ kind: "leave" })}>{t("ترک این خانواده", "Leave this household")}</Button>
          {isOwner && ownerCount === 1 ? <p className="text-metadata text-text-secondary">{t("شما تنها مدیر هستید؛ برای ترک خانواده ابتدا عضو دیگری را مدیر کنید.", "You're the only owner; make someone else an owner before leaving.")}</p> : null}
        </div>
      </section>

      {data.invitations.length > 0 ? (
        <section aria-labelledby="invites-title">
          <div className="account-section-title">
            <div>
              <h2 id="invites-title">{t("دعوت‌های در انتظار", "Pending invitations")}</h2>
              <p>{t("هر دعوت فقط یک بار و فقط توسط همان ایمیل یا موبایل قابل پذیرش است و پس از ۷ روز منقضی می‌شود.", "Each invitation works once, only for that email or phone, and expires after 7 days.")}</p>
            </div>
          </div>
          <div className="security-list">
            {data.invitations.map((invite) => (
              <div className="security-row" key={invite.id}>
                <div className="security-row__icon" aria-hidden>✉</div>
                <div>
                  <b dir="ltr" className="contact-row__value">{invite.contactMasked}</b>
                  <p>{t("انقضا", "Expires")}: {formatAccountDate(invite.expiresAt, locale)}</p>
                </div>
                {isOwner ? (
                  <div className="member-row__actions">
                    <Button variant="ghost" size="sm" isLoading={busyInvitation === invite.id} onClick={() => invitationAction(invite.id, "resend")}>{t("ارسال دوباره", "Resend")}</Button>
                    <Button variant="ghost" size="sm" disabled={busyInvitation === invite.id} onClick={() => invitationAction(invite.id, "cancel")}>{t("لغو", "Cancel")}</Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="pets-title">
        <div className="account-section-title">
          <div>
            <h2 id="pets-title">{t("دسترسی حیوانات", "Pet access")}</h2>
            <p>{t("مجوزهای سلامت، مراقبت، رزرو و دسترسی موقت را برای هر حیوان جداگانه مدیریت کنید.", "Manage health, care, booking and temporary access per pet.")}</p>
          </div>
        </div>
        {data.pets.length === 0 ? (
          <p className="text-body text-text-secondary">{t("هنوز حیوانی در این خانواده ثبت نشده است.", "No pets in this household yet.")}</p>
        ) : (
          <div className="pet-access-cards">
            {data.pets.map((pet) => (
              <ContextSurface key={pet.id} className="pet-access-card">
                <div className="pet-access-avatar">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {pet.photoUrl ? <img src={pet.photoUrl} alt="" /> : pet.name.slice(0, 1)}
                </div>
                <div>
                  <b>{pet.name}</b>
                  <p>{t(`${num(data.grants.filter((g) => g.petId === pet.id && isActive(g, Date.now())).length)} دسترسی فعال`, `${num(data.grants.filter((g) => g.petId === pet.id && isActive(g, Date.now())).length)} active grants`)}</p>
                </div>
                {isOwner ? <Button variant="secondary" size="sm" onClick={() => router.push(`/${locale}/profile/household/pets/${pet.id}/access`)}>{t("مدیریت دسترسی", "Manage access")}</Button> : <span />}
                <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/profile/household/pets/${pet.id}/lifecycle`)}>{t("وضعیت زندگی", "Lifecycle")}</Button>
              </ContextSurface>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="history-title">
        <div className="account-section-title">
          <div>
            <h2 id="history-title">{t("تاریخچهٔ دسترسی", "Access history")}</h2>
            <p>{t("دعوت‌ها، تغییر نقش و مجوز، حذف اعضا و پایان دسترسی موقت.", "Invitations, role and permission changes, removals and temporary access ending.")}</p>
          </div>
        </div>
        {data.history.length ? (
          <div className="activity-list">
            {data.history.map((event) => (
              <div key={event.id}>
                <span aria-hidden />
                <p>
                  <b>{HISTORY_LABELS[event.type] ? t(HISTORY_LABELS[event.type]![0], HISTORY_LABELS[event.type]![1]) : event.type}</b>
                  <small>{formatAccountDate(event.occurredAt, locale, true)}</small>
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-body text-text-secondary">{t("هنوز رویدادی ثبت نشده است.", "No access events yet.")}</p>
        )}
      </section>

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        household={data}
        onSent={async (message) => {
          setInviteOpen(false);
          setNotice(message);
          await loadDetail();
        }}
      />

      {confirm?.kind === "remove" ? (
        <ConfirmActionDialog
          open
          onClose={() => setConfirm(null)}
          title={t(`حذف ${confirm.member.user.displayName} از خانواده`, `Remove ${confirm.member.user.displayName}`)}
          consequences={[t("دسترسی‌های خانوادگی، دستی و موقت او به حیوان‌های این خانواده فوراً پایان می‌یابد.", "Their household, manual and temporary access to this household's pets ends immediately."), t("به او اطلاع داده می‌شود که دسترسی‌اش پایان یافته است.", "They're told their access has ended.")]}
          keeps={[t("حساب شخصی او و هر چیزی که خودش ثبت کرده حذف نمی‌شود.", "Their own account and what they recorded stay intact."), t("تاریخچهٔ دسترسی حفظ می‌شود.", "The access history is kept.")]}
          confirmLabel={t("حذف عضو", "Remove member")}
          onConfirm={async () => {
            await householdsService.removeMember(data.id, confirm.member.id);
            await loadDetail();
          }}
        />
      ) : null}
      {confirm?.kind === "promote" || confirm?.kind === "demote" ? (
        <ConfirmActionDialog
          open
          destructive={confirm.kind === "demote"}
          onClose={() => setConfirm(null)}
          title={confirm.kind === "promote" ? t(`${confirm.member.user.displayName} مدیر شود؟`, `Make ${confirm.member.user.displayName} an owner?`) : t(`${confirm.member.user.displayName} عضو عادی شود؟`, `Make ${confirm.member.user.displayName} a member?`)}
          consequences={
            confirm.kind === "promote"
              ? [t("می‌تواند اعضا را دعوت یا حذف کند و دسترسی همهٔ حیوان‌ها را مدیریت کند.", "They can invite or remove members and manage every pet's access."), t("به همهٔ حیوان‌های این خانواده دسترسی کامل می‌گیرد.", "They get full access to every pet in this household.")]
              : [t("دیگر نمی‌تواند اعضا یا دعوت‌ها را مدیریت کند.", "They can no longer manage members or invitations."), t("دسترسی فعلی او به حیوان‌ها تغییر نمی‌کند؛ در صورت نیاز آن را جداگانه تنظیم کنید.", "Their current pet access doesn't change; adjust it separately if needed.")]
          }
          confirmLabel={confirm.kind === "promote" ? t("مدیر شود", "Make owner") : t("عضو عادی شود", "Make member")}
          onConfirm={async () => {
            await householdsService.changeMemberRole(data.id, confirm.member.id, confirm.kind === "promote" ? "OWNER" : "FAMILY");
            await loadDetail();
          }}
        />
      ) : null}
      {confirm?.kind === "leave" ? (
        <ConfirmActionDialog
          open
          onClose={() => setConfirm(null)}
          title={t(`ترک ${householdName}`, `Leave ${householdName}`)}
          consequences={[t("دسترسی شما به حیوان‌های این خانواده فوراً پایان می‌یابد.", "Your access to this household's pets ends immediately."), t("برای بازگشت به دعوت تازه نیاز دارید.", "You'll need a new invitation to come back.")]}
          keeps={[t("حساب شما و خانواده‌های دیگرتان تغییری نمی‌کنند.", "Your account and any other households stay as they are.")]}
          confirmLabel={t("ترک خانواده", "Leave household")}
          onConfirm={async () => {
            await householdsService.leave(data.id);
            setData(null);
            await loadList();
          }}
        />
      ) : null}
    </div>
  );
}

function InviteDialog({ open, onClose, household, onSent }: { open: boolean; onClose: () => void; household: HouseholdCollaborationDto; onSent: (message: string) => Promise<void> }) {
  const { t, fa } = useAccountCopy();
  const [contact, setContact] = useState("");
  const [presets, setPresets] = useState<Record<string, Preset>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const initialAccess = household.pets
        .map((pet) => ({ petId: pet.id, preset: presets[pet.id] ?? "VIEW_ONLY" }))
        .filter((item): item is { petId: string; preset: Exclude<Preset, "NONE"> } => item.preset !== "NONE");
      const result = await householdsService.invite(household.id, { contact: contact.trim(), initialAccess });
      setContact("");
      setPresets({});
      await onSent(
        result.delivery === "DELIVERED"
          ? t("دعوت امن داخل PET LIFE برای او ارسال شد.", "A secure in-app invitation was delivered.")
          : t("دعوت ذخیره شد، اما ارسال پیامک و ایمیل هنوز متصل نیست؛ از او بخواهید با همین ایمیل یا موبایل وارد PET LIFE شود تا دعوت را ببیند.", "Invitation saved, but SMS and email delivery isn't connected yet. Ask them to sign in to PET LIFE with this email or phone to see it."),
      );
    } catch (err) {
      setError(err instanceof ApiError && err.code === "ALREADY_HOUSEHOLD_MEMBER" ? t("این فرد همین حالا عضو خانواده است.", "This person is already in your household.") : err instanceof ApiError ? err.message : t("دعوت ارسال نشد.", "The invitation wasn't sent."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t("دعوت به خانواده", "Invite to household")}>
      <div className="flex flex-col gap-4">
        <Input label={t("ایمیل یا موبایل", "Email or phone")} dir="ltr" value={contact} onChange={(e) => setContact(e.target.value)} autoFocus />
        <p className="text-metadata text-text-secondary">{t("برای هر حیوان دسترسی اولیه را انتخاب کنید. دعوت‌شونده پیش از پذیرش همین خلاصه را می‌بیند و بعداً می‌توانید آن را دقیق‌تر تنظیم کنید.", "Choose starting access for each pet. The invitee sees this summary before accepting, and you can fine-tune it later.")}</p>
        {household.pets.map((pet) => {
          const value = presets[pet.id] ?? "VIEW_ONLY";
          return (
            <div key={pet.id} className="flex flex-col gap-1">
              <Select label={pet.name} value={value} onChange={(e) => setPresets({ ...presets, [pet.id]: e.target.value as Preset })} options={(Object.keys(PRESET_COPY) as Preset[]).map((key) => ({ value: key, label: fa ? PRESET_COPY[key].fa : PRESET_COPY[key].en }))} />
              <p className="text-metadata text-text-secondary">{fa ? PRESET_COPY[value].faHint : PRESET_COPY[value].enHint}</p>
            </div>
          );
        })}
        {error ? <p role="alert" className="text-body text-state-urgent">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t("انصراف", "Cancel")}</Button>
          <Button isLoading={busy} disabled={contact.trim().length < 5} onClick={send}>{t("ارسال دعوت", "Send invitation")}</Button>
        </div>
      </div>
    </Dialog>
  );
}
