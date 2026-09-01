import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import type { SessionUser } from "../../../common/session/session.service";
import { CartService } from "./cart.service";
import { AddCartItemDto, UpdateCartItemDto } from "./dto/cart-item.dto";

@Controller("cart")
@UseGuards(SessionAuthGuard)
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@CurrentUser() user: SessionUser) {
    return this.cart.getCart(user.id);
  }

  @Post("items")
  addItem(@CurrentUser() user: SessionUser, @Body() dto: AddCartItemDto) {
    return this.cart.addItem(user.id, dto);
  }

  @Patch("items/:id")
  updateItem(@CurrentUser() user: SessionUser, @Param("id") id: string, @Body() dto: UpdateCartItemDto) {
    return this.cart.updateItem(user.id, id, dto);
  }

  @Delete("items/:id")
  removeItem(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.cart.removeItem(user.id, id);
  }

  @Delete()
  clear(@CurrentUser() user: SessionUser) {
    return this.cart.clear(user.id);
  }
}
