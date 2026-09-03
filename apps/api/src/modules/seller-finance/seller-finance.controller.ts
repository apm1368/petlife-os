import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { SellerMembershipRole } from "@prisma/client";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { SellerAuthGuard } from "../seller-os/auth/seller-auth.guard";
import { RequireSellerRole } from "../seller-os/auth/require-seller-role.decorator";
import { CurrentSellerContext } from "../seller-os/auth/current-seller-context.decorator";
import type { ResolvedSellerContext } from "../seller-os/auth/seller-context.types";
import { SellerFinanceReadService } from "./seller-finance-read.service";
import { ListSellerTransactionsQueryDto } from "./dto/seller-finance.dto";

/**
 * Seller-facing Finance surface (spec API section: GET .../finance/summary,
 * .../finance/transactions, .../settlements, .../settlements/:id) — entirely
 * read-only; no seller mutation exists for protected settlement accounting.
 * Gated by the pre-existing FINANCE seller role (OWNER/ADMIN always pass
 * per SellerAuthGuard), the same RBAC primitive every other Seller OS
 * controller already uses.
 */
@Controller("seller-organizations/:sellerId/finance")
@UseGuards(SessionAuthGuard, SellerAuthGuard)
@RequireSellerRole(SellerMembershipRole.FINANCE)
export class SellerFinanceController {
  constructor(private readonly financeRead: SellerFinanceReadService) {}

  @Get("summary")
  getSummary(@CurrentSellerContext() ctx: ResolvedSellerContext) {
    return this.financeRead.getSummary(ctx);
  }

  @Get("transactions")
  listTransactions(@CurrentSellerContext() ctx: ResolvedSellerContext, @Query() query: ListSellerTransactionsQueryDto) {
    return this.financeRead.listTransactions(ctx, query);
  }
}

@Controller("seller-organizations/:sellerId/settlements")
@UseGuards(SessionAuthGuard, SellerAuthGuard)
@RequireSellerRole(SellerMembershipRole.FINANCE)
export class SellerSettlementReadController {
  constructor(private readonly financeRead: SellerFinanceReadService) {}

  @Get()
  list(@CurrentSellerContext() ctx: ResolvedSellerContext) {
    return this.financeRead.listSettlements(ctx);
  }

  @Get(":id")
  get(@CurrentSellerContext() ctx: ResolvedSellerContext, @Param("id") id: string) {
    return this.financeRead.getSettlement(ctx, id);
  }
}
