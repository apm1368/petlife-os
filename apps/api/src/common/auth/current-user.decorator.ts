import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { SessionUser } from "../session/session.service";
import type { RequestWithId } from "../middleware/request-id.middleware";

export interface AuthedRequest extends RequestWithId {
  user?: SessionUser;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): SessionUser => {
  const request = ctx.switchToHttp().getRequest<AuthedRequest>();
  // SessionAuthGuard runs first and throws if request.user is unset, so this is safe.
  return request.user as SessionUser;
});

/** Pairs with OptionalSessionAuthGuard — request.user may genuinely be undefined for an anonymous caller. */
export const OptionalCurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): SessionUser | undefined => {
  const request = ctx.switchToHttp().getRequest<AuthedRequest>();
  return request.user;
});
