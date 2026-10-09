import { UserAccountStatus } from "@prisma/client";
import { AccountSuspendedException } from "../errors/api-exception";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import type { AppEnv } from "../../config/env";
import { ValidationApiException } from "../errors/api-exception";
import { PrismaService } from "../prisma/prisma.service";
import { signSessionCookie, verifySessionCookie } from "./session-cookie.util";
import { deviceLabel } from "./device-label.util";

export interface SessionUser {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string;
  locale: "fa" | "en";
  themePreference: "SYSTEM" | "LIGHT" | "DARK";
}

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService<AppEnv, true>) {}

  private get cookieName(): string { return this.config.get("SESSION_COOKIE_NAME", { infer: true }); }
  private get ttlMs(): number { return this.config.get("SESSION_TTL_DAYS", { infer: true }) * 24 * 60 * 60 * 1000; }

  async issueSession(userId: string, res: Response, meta: { userAgent?: string; ipAddress?: string }): Promise<string> {
    // Every sign-in path (password, OTP, Google, signup) ends here, so this is the one suspension check for logins.
    const account = await this.prisma.user.findUnique({ where: { id: userId }, select: { accountStatus: true } });
    if (account?.accountStatus === UserAccountStatus.SUSPENDED) throw new AccountSuspendedException();
    const session = await this.prisma.session.create({ data: { userId, userAgent: meta.userAgent, ipAddress: meta.ipAddress, expiresAt: new Date(Date.now() + this.ttlMs) } });
    const cookieValue = signSessionCookie(session.id, this.config.get("SESSION_SECRET", { infer: true }));
    const isProduction = this.config.get("NODE_ENV", { infer: true }) === "production";
    res.cookie(this.cookieName, cookieValue, { httpOnly: true, secure: isProduction, sameSite: "lax", path: "/", maxAge: this.ttlMs });
    return session.id;
  }

  async resolveUser(cookieValue: string | undefined): Promise<SessionUser | null> {
    const sessionId = this.getSessionId(cookieValue);
    if (!sessionId) return null;
    const session = await this.prisma.session.findUnique({ where: { id: sessionId }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
    if (session.user.accountStatus === UserAccountStatus.SUSPENDED) return null;
    if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
      void this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
    }
    return { id: session.user.id, email: session.user.email, phone: session.user.phone, displayName: session.user.displayName, locale: session.user.locale, themePreference: session.user.themePreference };
  }

  async revokeByCookie(cookieValue: string | undefined, res: Response): Promise<void> {
    const sessionId = this.getSessionId(cookieValue);
    if (sessionId) await this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
    res.clearCookie(this.cookieName, { path: "/" });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  getSessionId(cookieValue: string | undefined): string | null {
    return verifySessionCookie(cookieValue, this.config.get("SESSION_SECRET", { infer: true }));
  }

  async listForUser(userId: string, currentSessionId: string | null) {
    // Bounded: an account with a runaway number of sessions still renders; "sign out other devices" clears them all.
    const sessions = await this.prisma.session.findMany({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" }, take: 50 });
    return sessions.map((session) => ({ id: session.id, userAgent: session.userAgent, device: deviceLabel(session.userAgent), createdAt: session.createdAt, lastSeenAt: session.lastSeenAt, expiresAt: session.expiresAt, current: session.id === currentSessionId }));
  }

  async revokeForUser(userId: string, sessionId: string, currentSessionId: string | null): Promise<void> {
    if (sessionId === currentSessionId) throw new ValidationApiException({ field: "sessionId", reason: "Use sign out to end the current session." });
    const result = await this.prisma.session.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (result.count === 0) throw new ValidationApiException({ field: "sessionId", reason: "Session is not active." });
  }

  async revokeOthers(userId: string, currentSessionId: string | null): Promise<number> {
    const result = await this.prisma.session.updateMany({ where: { userId, revokedAt: null, ...(currentSessionId ? { id: { not: currentSessionId } } : {}) }, data: { revokedAt: new Date() } });
    return result.count;
  }

  /** Ends every session of the user, this one included, and clears the cookie on this response. */
  async revokeAllAndClear(userId: string, res: Response): Promise<number> {
    const result = await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    res.clearCookie(this.cookieName, { path: "/" });
    return result.count;
  }

  readCookie(req: { cookies?: Record<string, string> }): string | undefined { return req.cookies?.[this.cookieName]; }
}
