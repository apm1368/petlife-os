import { SellerOfferService } from "./seller-offer.service";
import type { PrismaService } from "../../common/prisma/prisma.service";
import type { DomainEventsService } from "../../common/events/domain-events.service";
import type { SellerAccessService } from "./seller-access.service";
import type { ResolvedSellerContext } from "./auth/seller-context.types";
import { ValidationApiException } from "../../common/errors/api-exception";

describe("seller catalog selection boundary", () => {
  it("rejects unavailable catalog variants before creating an offer or inventory", async () => {
    const tx = { productVariant: { findFirst: jest.fn().mockResolvedValue(null) }, sellerOffer: { create: jest.fn() } };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    const events = { publish: jest.fn() };
    const sellerAccess = { assertOperational: jest.fn() };
    const service = new SellerOfferService(prisma as unknown as PrismaService, events as unknown as DomainEventsService, sellerAccess as unknown as SellerAccessService);
    const ctx = { sellerOrganizationId: "seller-a", verificationStatus: "VERIFIED" } as ResolvedSellerContext;
    await expect(service.create(ctx, { productVariantId: "variant", priceAmount: 1000, initialOnHand: 2 })).rejects.toBeInstanceOf(ValidationApiException);
    expect(tx.productVariant.findFirst).toHaveBeenCalledWith({ where: { id: "variant", isActive: true, product: { status: "ACTIVE" } }, select: { id: true } });
    expect(tx.sellerOffer.create).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });
});
