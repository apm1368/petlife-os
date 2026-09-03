import { Injectable } from "@nestjs/common";
import { Prisma, type SellerFinancialAccount } from "@prisma/client";
import type { SellerFinancialAccountDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";

type QueryClient = PrismaService | Prisma.TransactionClient;

export function toSellerFinancialAccountDto(row: SellerFinancialAccount): SellerFinancialAccountDto {
  return {
    id: row.id,
    sellerOrganizationId: row.sellerOrganizationId,
    currency: row.currency,
    status: row.status as unknown as SellerFinancialAccountDto["status"],
    settlementSchedule: row.settlementSchedule as unknown as SellerFinancialAccountDto["settlementSchedule"],
    payoutMethodType: row.payoutMethodType,
    payoutReferenceMasked: row.payoutReferenceMasked,
    minimumPayoutIrr: row.minimumPayoutIrr,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * A seller's financial identity (spec: "explicit seller financial
 * identity/accounting relationship") — created lazily on first access
 * rather than at seller onboarding, so H09's SellerOrganization creation
 * never had to know about Handoff 14. `@@unique([sellerOrganizationId])`
 * makes `getOrCreate` safe under a concurrent double-call (P2002 caught and
 * replayed with a read, same pattern as every other lazy-create in this
 * codebase).
 */
@Injectable()
export class SellerFinancialAccountService {
  constructor(private readonly prisma: PrismaService) {}

  /** Read-only lookup for list views (spec: admin seller finance browse) — never creates, so browsing a list of sellers never silently provisions accounts for ones with no financial activity yet. */
  async find(sellerOrganizationId: string, client: QueryClient = this.prisma): Promise<SellerFinancialAccount | null> {
    return client.sellerFinancialAccount.findUnique({ where: { sellerOrganizationId } });
  }

  async getOrCreate(sellerOrganizationId: string, client: QueryClient = this.prisma): Promise<SellerFinancialAccount> {
    const existing = await client.sellerFinancialAccount.findUnique({ where: { sellerOrganizationId } });
    if (existing) return existing;
    try {
      return await client.sellerFinancialAccount.create({ data: { sellerOrganizationId } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return client.sellerFinancialAccount.findUniqueOrThrow({ where: { sellerOrganizationId } });
      }
      throw error;
    }
  }
}
