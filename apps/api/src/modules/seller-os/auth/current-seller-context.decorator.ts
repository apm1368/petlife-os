import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { ResolvedSellerContext, SellerAuthedRequest } from "./seller-context.types";

export const CurrentSellerContext = createParamDecorator((_: unknown, ctx: ExecutionContext): ResolvedSellerContext => {
  const request = ctx.switchToHttp().getRequest<SellerAuthedRequest>();
  // SellerAuthGuard runs first and throws if request.sellerContext is unset, so this is safe.
  return request.sellerContext as ResolvedSellerContext;
});
