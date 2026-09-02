import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AdminAuthedRequest, ResolvedAdminContext } from "./admin-context.types";

export const CurrentAdmin = createParamDecorator((_: unknown, ctx: ExecutionContext): ResolvedAdminContext => {
  const request = ctx.switchToHttp().getRequest<AdminAuthedRequest>();
  // AdminAuthGuard runs first and throws if adminContext is unset, so this is safe.
  return request.adminContext as ResolvedAdminContext;
});
