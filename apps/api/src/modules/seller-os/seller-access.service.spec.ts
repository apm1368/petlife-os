import { SellerMembershipRole, SellerMembershipStatus, SellerStatus, SellerVerificationStatus } from "@prisma/client";
import { SellerAccessService } from "./seller-access.service";

const userId = "b50d6b0e-b6fb-4431-8bce-5a9fce0601cd";
const sellerId = "07203e1d-b449-4e6e-955a-953b6f8520ff";

function membership(overrides: Record<string, unknown> = {}) {
  return {
    id: "72f58647-a814-49c2-8f21-bdcb4e005e35",
    userId,
    sellerOrganizationId: sellerId,
    role: SellerMembershipRole.CATALOG_MANAGER,
    status: SellerMembershipStatus.ACTIVE,
    sellerOrganization: {
      id: sellerId,
      name: "Pet Life Shop",
      status: SellerStatus.ACTIVE,
      verificationStatus: SellerVerificationStatus.VERIFIED,
    },
    ...overrides,
  };
}

function setup() {
  const tx = { sellerContextPreference: { upsert: jest.fn() } };
  const prisma = {
    sellerMembership: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    sellerContextPreference: { findUnique: jest.fn() },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const events = { publish: jest.fn() };
  return { service: new SellerAccessService(prisma as never, events as never), prisma, tx, events };
}

describe("SellerAccessService tenant boundary", () => {
  it("resolves membership only through the seller id in the current route", async () => {
    const { service, prisma } = setup();
    prisma.sellerMembership.findUnique.mockResolvedValue(membership());

    await expect(service.resolveMembership(userId, sellerId)).resolves.toMatchObject({
      sellerOrganizationId: sellerId,
      userId,
      role: SellerMembershipRole.CATALOG_MANAGER,
    });
    expect(prisma.sellerMembership.findUnique).toHaveBeenCalledWith({
      where: { sellerOrganizationId_userId: { sellerOrganizationId: sellerId, userId } },
      include: { sellerOrganization: true },
    });
  });

  it("fails closed before persisting a context preference for an organization the user cannot use", async () => {
    const { service, prisma, tx, events } = setup();
    prisma.sellerMembership.findUnique.mockResolvedValue(null);

    await expect(service.setContext(userId, sellerId)).rejects.toMatchObject({
      code: "SELLER_ACCESS_DENIED",
      details: { reason: "NOT_A_MEMBER", sellerOrganizationId: sellerId },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.sellerContextPreference.upsert).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it("rejects inactive memberships even when the organization id is known", async () => {
    const { service, prisma } = setup();
    prisma.sellerMembership.findUnique.mockResolvedValue(membership({ status: SellerMembershipStatus.DEACTIVATED }));

    await expect(service.resolveMembership(userId, sellerId)).rejects.toMatchObject({
      code: "SELLER_ACCESS_DENIED",
      details: { reason: "MEMBERSHIP_INACTIVE", sellerOrganizationId: sellerId },
    });
  });
});
