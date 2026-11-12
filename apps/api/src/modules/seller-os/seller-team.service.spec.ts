import { SellerMembershipRole } from "@prisma/client";
import { SellerAccessDeniedException } from "../../common/errors/api-exception";
import { SellerTeamService } from "./seller-team.service";
import type { ResolvedSellerContext } from "./auth/seller-context.types";

const org = "org-1";
const ctx = (role: SellerMembershipRole) => ({ sellerMembershipId: "m-actor", userId: "actor", role, sellerOrganizationId: org }) as ResolvedSellerContext;

function setup(target: { role: SellerMembershipRole } | null) {
  const membership = target ? { id: "m-target", sellerOrganizationId: org, userId: "target", role: target.role, status: "ACTIVE", invitedAt: new Date(), acceptedAt: null, createdAt: new Date(), user: { id: "target", displayName: "T" } } : null;
  const prisma = {
    user: { findFirst: jest.fn().mockResolvedValue({ id: "target" }) },
    sellerMembership: {
      findUnique: jest.fn().mockResolvedValue(membership),
      update: jest.fn().mockImplementation(({ data }) => ({ ...membership, ...data, user: { id: "target", displayName: "T" }, createdAt: new Date(), updatedAt: new Date() })),
      upsert: jest.fn().mockImplementation(({ create }) => ({ id: "m-new", ...create, user: { id: "target", displayName: "T" }, createdAt: new Date(), updatedAt: new Date() })),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  const events = { publish: jest.fn() };
  const access = { countActiveOwners: jest.fn().mockResolvedValue(1) };
  return { service: new SellerTeamService(prisma as never, events as never, access as never), prisma };
}

describe("SellerTeamService ownership rules", () => {
  it("an ADMIN cannot make anyone an OWNER, by invite or by role change", async () => {
    await expect(setup(null).service.invite(ctx(SellerMembershipRole.ADMIN), { email: "x@example.com", role: SellerMembershipRole.OWNER })).rejects.toBeInstanceOf(SellerAccessDeniedException);
    await expect(setup({ role: SellerMembershipRole.VIEWER }).service.updateRole(ctx(SellerMembershipRole.ADMIN), "m-target", SellerMembershipRole.OWNER)).rejects.toBeInstanceOf(SellerAccessDeniedException);
  });

  it("an ADMIN cannot demote, remove or re-invite an existing OWNER", async () => {
    await expect(setup({ role: SellerMembershipRole.OWNER }).service.updateRole(ctx(SellerMembershipRole.ADMIN), "m-target", SellerMembershipRole.VIEWER)).rejects.toBeInstanceOf(SellerAccessDeniedException);
    await expect(setup({ role: SellerMembershipRole.OWNER }).service.remove(ctx(SellerMembershipRole.ADMIN), "m-target")).rejects.toBeInstanceOf(SellerAccessDeniedException);
    await expect(setup({ role: SellerMembershipRole.OWNER }).service.invite(ctx(SellerMembershipRole.ADMIN), { email: "owner@example.com", role: SellerMembershipRole.VIEWER })).rejects.toBeInstanceOf(SellerAccessDeniedException);
  });

  it("an ADMIN still manages non-owner roles, and an OWNER can hand over ownership", async () => {
    await expect(setup({ role: SellerMembershipRole.VIEWER }).service.updateRole(ctx(SellerMembershipRole.ADMIN), "m-target", SellerMembershipRole.FINANCE)).resolves.toBeDefined();
    await expect(setup({ role: SellerMembershipRole.ADMIN }).service.updateRole(ctx(SellerMembershipRole.OWNER), "m-target", SellerMembershipRole.OWNER)).resolves.toBeDefined();
  });
});
