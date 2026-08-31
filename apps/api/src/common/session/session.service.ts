import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import type { AppEnv } from "../../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { signSessionCookie, verifySessionCookie } from "./session-cookie.util";

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  private get cookieName(): string {
    return this.config.get("SESSION_COOKIE_NAME", { infer: true });
  }

  private get ttlMs(): number {
    return this.config.get("SESSION_TTL_DAYS", { infer: true }) * 24 * 60 * 60 * 1000;
  }

  /** Creates a fresh session row (used at login, and to rotate after auth) and sets the cookie. */
  async issueSession(userId: string, res: Response, meta: { userAgent?: string; ipAddress?: string }): Promise<string> {
    const session = await this.prisma.session.create({
      data: {
        userId,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
        expiresAt: new Date(Date.now() + this.ttlMs),
      },
    });

    const secret = this.config.get("SESSION_SECRET", { infer: true });
    const cookieValue = signSessionCookie(session.id, secret);
    const isProduction = this.config.get("NODE_ENV", { infer: true }) === "production";

    res.cookie(this.cookieName, cookieValue, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: this.ttlMs,
    });

    return session.id;
  }

  async resolveUser(cookieValue: string | undefined): Promise<SessionUser | null> {
    const secret = this.config.get("SESSION_SECRET", { infer: true });
    const sessionId = verifySessionCookie(cookieValue, secret);
    if (!sessionId) return null;

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) return null;

    return {
      id: session.user.id,
      email: session.user.email,
      phone: session.user.phone,
      displayName: session.user.displayName,
      locale: session.user.locale,
      themePreference: session.user.themePreference,
    };
  }

  async revokeByCookie(cookieValue: string | undefined, res: Response): Promise<void> {
    const secret = this.config.get("SESSION_SECRET", { infer: true });
    const sessionId = verifySessionCookie(cookieValue, secret);
    if (sessionId) {
      await this.prisma.session.deleteMany({ where: { id: sessionId } });
    }
    res.clearCookie(this.cookieName, { path: "/" });
  }

  readCookie(req: { cookies?: Record<string, string> }): string | undefined {
    return req.cookies?.[this.cookieName];
  }
}
