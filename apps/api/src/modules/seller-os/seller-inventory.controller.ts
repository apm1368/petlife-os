import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { SellerMembershipRole } from "@prisma/client";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { SellerAuthGuard } from "./auth/seller-auth.guard";
import { RequireSellerRole } from "./auth/require-seller-role.decorator";
import { CurrentSellerContext } from "./auth/current-seller-context.decorator";
import type { ResolvedSellerContext } from "./auth/seller-context.types";
import { SellerInventoryService } from "./seller-inventory.service";
import { AdjustInventoryDto, ListInventoryMovementsQueryDto, ListSellerInventoryQueryDto } from "./dto/seller-inventory.dto";

/** Seller Inventory management (spec section 7-8, 41, 52) — adjustments require OPERATIONS or CATALOG_MANAGER (or ADMIN/OWNER). */
@Controller("seller-organizations/:sellerId/inventory")
@UseGuards(SessionAuthGuard, SellerAuthGuard)
export class SellerInventoryController {
  constructor(private readonly inventory: SellerInventoryService) {}

  @Get()
  list(@CurrentSellerContext() ctx: ResolvedSellerContext, @Query() query: ListSellerInventoryQueryDto) {
    return this.inventory.list(ctx, query);
  }

  @Patch(":inventoryItemId")
  @RequireSellerRole(SellerMembershipRole.OPERATIONS, SellerMembershipRole.CATALOG_MANAGER)
  adjust(@CurrentSellerContext() ctx: ResolvedSellerContext, @Param("inventoryItemId") inventoryItemId: string, @Body() dto: AdjustInventoryDto) {
    return this.inventory.adjust(ctx, inventoryItemId, dto);
  }

  @Get(":inventoryItemId/history")
  history(@CurrentSellerContext() ctx: ResolvedSellerContext, @Param("inventoryItemId") inventoryItemId: string, @Query() query: ListInventoryMovementsQueryDto) {
    return this.inventory.history(ctx, inventoryItemId, query);
  }
}
