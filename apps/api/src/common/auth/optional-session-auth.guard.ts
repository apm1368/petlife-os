import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { SessionService } from "../session/session.service";
import type { AuthedRequest } from "./current-user.decorator";

/**
 * For public discovery endpoints (vet/service/product search & detail —
 * Handoff 12) that use the caller's identity only to personalize a result
 * (e.g. pet-compatibility checks), never to gate access to it. Unlike
 * SessionAuthGuard, a missing/invalid session cookie is not an error: the
 * request proceeds with `request.user` simply left unset, exactly as if no
 * cookie had ever been sent. Never use this where the *response itself*
 * should differ by authorization, only where personalization is optional.
 */
@Injectable()
export class OptionalSessionAuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const cookieValue = this.sessions.readCookie(request);
    const user = await this.sessions.resolveUser(cookieValue);
    if (user) request.user = user;
    return true;
  }
}
