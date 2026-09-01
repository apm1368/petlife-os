import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { ProviderAuthedRequest, ResolvedProviderContext } from "./provider-context.types";

export const CurrentProviderContext = createParamDecorator((_: unknown, ctx: ExecutionContext): ResolvedProviderContext => {
  const request = ctx.switchToHttp().getRequest<ProviderAuthedRequest>();
  // ProviderAuthGuard runs first and throws if request.providerContext is unset, so this is safe.
  return request.providerContext as ResolvedProviderContext;
});
