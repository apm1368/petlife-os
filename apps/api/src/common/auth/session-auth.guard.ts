import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { UnauthenticatedException } from "../errors/api-exception";
import { SessionService } from "../session/session.service";
import type { AuthedRequest } from "./current-user.decorator";

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const cookieValue = this.sessions.readCookie(request);
    const user = await this.sessions.resolveUser(cookieValue);
    if (!user) throw new UnauthenticatedException();
    request.user = user;
    return true;
  }
}
