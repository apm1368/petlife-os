"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import type { SellerMembershipRole, SellerTeamMemberDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { sellerOsService } from "@/services/seller-os.service";
import { useSellerStore } from "@/stores/seller-store";

const ROLES: SellerMembershipRole[] = ["OWNER", "ADMIN", "OPERATIONS", "CATALOG_MANAGER", "ORDER_MANAGER", "FINANCE", "SUPPORT", "VIEWER"] as SellerMembershipRole[];

/** Seller Team management (spec section 48) — inviting requires an existing PET LIFE OS account (no email/SMS invite delivery exists yet, see README); the server enforces "cannot remove/demote the last active OWNER". */
export function SellerTeamView() {
  const t = useTranslations("seller.team");
  const sellerId = useSellerStore((s) => s.context?.active?.sellerOrganizationId);

  const [members, setMembers] = useState<SellerTeamMemberDto[] | null>(null);
  const [error, setError] = useState(false);
  const [inviteIdentifier, setInviteIdentifier] = useState("");
  const [inviteRole, setInviteRole] = useState<SellerMembershipRole>("VIEWER" as SellerMembershipRole);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    if (!sellerId) return;
    setError(false);
    try {
      setMembers(await sellerOsService.listTeam(sellerId));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId]);

  async function invite() {
    if (!sellerId || !inviteIdentifier) return;
    setInviting(true);
    setInviteError(null);
    try {
      const isEmail = inviteIdentifier.includes("@");
      const member = await sellerOsService.inviteTeamMember(sellerId, isEmail ? { email: inviteIdentifier, role: inviteRole } : { phone: inviteIdentifier, role: inviteRole });
      setMembers((prev) => [...(prev ?? []), member]);
      setInviteIdentifier("");
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : t("inviteFailed"));
    } finally {
      setInviting(false);
    }
  }

  async function updateRole(membershipId: string, role: SellerMembershipRole) {
    if (!sellerId) return;
    setBusyId(membershipId);
    try {
      const updated = await sellerOsService.updateTeamMemberRole(sellerId, membershipId, role);
      setMembers((prev) => prev?.map((m) => (m.sellerMembershipId === membershipId ? updated : m)) ?? null);
    } catch {
      // The last-owner safeguard rejects this — reload to show the server's true state rather than a stale optimistic one.
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(membershipId: string) {
    if (!sellerId) return;
    setBusyId(membershipId);
    try {
      const updated = await sellerOsService.removeTeamMember(sellerId, membershipId);
      setMembers((prev) => prev?.map((m) => (m.sellerMembershipId === membershipId ? updated : m)) ?? null);
    } catch {
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!members) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>

      <ContextSurface className="flex flex-col gap-3">
        <h2 className="text-section-title text-text-primary">{t("invite")}</h2>
        <div className="flex flex-wrap items-end gap-3">
          <Input label={t("inviteIdentifier")} value={inviteIdentifier} onChange={(e) => setInviteIdentifier(e.target.value)} hint={t("inviteHint")} className="w-56" />
          <Select label={t("role")} value={inviteRole} onChange={(e) => setInviteRole(e.target.value as SellerMembershipRole)} options={ROLES.map((r) => ({ value: r, label: t(`roles.${r}`) }))} className="w-48" />
          <Button size="sm" isLoading={inviting} disabled={!inviteIdentifier} onClick={invite}>
            {t("inviteAction")}
          </Button>
        </div>
        {inviteError ? <p className="text-metadata text-state-urgent">{inviteError}</p> : null}
      </ContextSurface>

      <div className="flex flex-col gap-2">
        {members.map((member) => (
          <ContextSurface key={member.sellerMembershipId} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col">
              <span className="text-body text-text-primary">{member.displayName}</span>
              <StatusLabel tone={member.status === "ACTIVE" ? "success" : "neutral"}>{t(`statusLabel.${member.status}`)}</StatusLabel>
            </div>
            <div className="flex items-center gap-2">
              <Select
                label={t("role")}
                value={member.role}
                onChange={(e) => updateRole(member.sellerMembershipId, e.target.value as SellerMembershipRole)}
                options={ROLES.map((r) => ({ value: r, label: t(`roles.${r}`) }))}
                disabled={busyId === member.sellerMembershipId}
                className="w-44"
              />
              <Button size="sm" variant="danger" isLoading={busyId === member.sellerMembershipId} disabled={member.status === "DEACTIVATED"} onClick={() => remove(member.sellerMembershipId)}>
                {t("remove")}
              </Button>
            </div>
          </ContextSurface>
        ))}
      </div>
    </div>
  );
}
