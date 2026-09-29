import { Injectable } from "@nestjs/common";
import { AnimalSupportOrgRole } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";

const MANAGERS: AnimalSupportOrgRole[] = [AnimalSupportOrgRole.OWNER, AnimalSupportOrgRole.COORDINATOR];

/**
 * Batch 6 — the one place that answers "may this user act for this organization?". Membership
 * is always read from the database for the organization in question; a client-supplied
 * organization id is only a selector, never a grant (organization isolation).
 */
@Injectable()
export class AnimalSupportOrgAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async roleFor(userId: string, organizationId: string): Promise<AnimalSupportOrgRole | null> {
    const m = await this.prisma.animalSupportOrgMembership.findUnique({ where: { organizationId_userId: { organizationId, userId } }, select: { role: true, isActive: true } });
    return m?.isActive ? m.role : null;
  }

  async canManageOrg(userId: string, organizationId: string): Promise<boolean> {
    const role = await this.roleFor(userId, organizationId);
    return role !== null && MANAGERS.includes(role);
  }

  /** A listing is managed by its creator, or — for an organization listing — by that organization's owners/coordinators. */
  async canManageListing(userId: string, listing: { creatorUserId: string | null; organizationId: string | null }): Promise<boolean> {
    if (listing.creatorUserId === userId) return true;
    return listing.organizationId ? this.canManageOrg(userId, listing.organizationId) : false;
  }

  async managerUserIds(organizationId: string): Promise<string[]> {
    const rows = await this.prisma.animalSupportOrgMembership.findMany({ where: { organizationId, isActive: true, role: { in: MANAGERS } }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }
}
