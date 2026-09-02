import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Response } from "express";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { SessionService, type SessionUser } from "../../../common/session/session.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { GoogleAuthFailedException } from "../../../common/errors/api-exception";
import type { GoogleProfile } from "./google-profile.types";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function toSessionUser(user: { id: string; email: string | null; phone: string | null; displayName: string; locale: "fa" | "en"; themePreference: "SYSTEM" | "LIGHT" | "DARK" }): SessionUser {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    displayName: user.displayName,
    locale: user.locale,
    themePreference: user.themePreference,
  };
}

/**
 * Resolves a verified Google identity to exactly one User — never a
 * duplicate — via the AuthIdentity table. Shared by the real OAuth callback
 * (AuthGoogleController, which reaches here only after GoogleOAuthClient has
 * verified the id_token) and the dev-only simulate endpoint
 * (AuthGoogleDevController), which hands this the same GoogleProfile shape
 * without a real Google round trip.
 */
@Injectable()
export class AuthGoogleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly events: DomainEventsService,
  ) {}

  async signIn(
    profile: GoogleProfile,
    res: Response,
    meta: { userAgent?: string; ipAddress?: string },
  ): Promise<SessionUser> {
    const { user, isNewUser } = await this.resolveUser(profile);

    await this.sessions.issueSession(user.id, res, meta);
    if (isNewUser) await this.events.publish("UserRegistered", { userId: user.id, method: "GOOGLE" });
    await this.events.publish("UserAuthenticated", { userId: user.id });

    return toSessionUser(user);
  }

  private async resolveUser(profile: GoogleProfile) {
    const existingIdentity = await this.prisma.authIdentity.findUnique({
      where: { provider_providerAccountId: { provider: "GOOGLE", providerAccountId: profile.sub } },
      include: { user: true },
    });
    if (existingIdentity) {
      if (profile.email && existingIdentity.email !== profile.email) {
        await this.prisma.authIdentity.update({ where: { id: existingIdentity.id }, data: { email: profile.email } });
      }
      return { user: existingIdentity.user, isNewUser: false };
    }

    // A verified email is required to either link to an existing account or
    // seed a new one — an unverified email must never be trusted for either,
    // since that would let anyone claim an account via a spoofable address.
    if (!profile.email || !profile.emailVerified) {
      throw new GoogleAuthFailedException();
    }

    const existingUserByEmail = await this.prisma.user.findUnique({ where: { email: profile.email } });
    if (existingUserByEmail) {
      const linked = await this.linkIdentity(existingUserByEmail.id, profile);
      return { user: linked, isNewUser: false };
    }

    return this.createUserWithIdentity(profile);
  }

  /** Handles the race where two concurrent logins try to link the same (provider, providerAccountId) at once — the loser re-reads the winner's row instead of erroring. */
  private async linkIdentity(userId: string, profile: GoogleProfile) {
    try {
      await this.prisma.authIdentity.create({
        data: { userId, provider: "GOOGLE", providerAccountId: profile.sub, email: profile.email },
      });
      return await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) throw error;
      const winner = await this.prisma.authIdentity.findUnique({
        where: { provider_providerAccountId: { provider: "GOOGLE", providerAccountId: profile.sub } },
        include: { user: true },
      });
      if (!winner) throw error;
      return winner.user;
    }
  }

  private async createUserWithIdentity(profile: GoogleProfile) {
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: profile.email,
            displayName: profile.name ?? profile.email!.split("@")[0]!,
            avatarUrl: profile.picture,
            locale: "en",
          },
        });
        await tx.authIdentity.create({
          data: { userId: created.id, provider: "GOOGLE", providerAccountId: profile.sub, email: profile.email },
        });
        return created;
      });
      return { user, isNewUser: true };
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) throw error;
      // Concurrent duplicate signup for the same brand-new Google account —
      // re-resolve rather than surface an error for a race the user did nothing wrong to cause.
      const winner = await this.prisma.authIdentity.findUnique({
        where: { provider_providerAccountId: { provider: "GOOGLE", providerAccountId: profile.sub } },
        include: { user: true },
      });
      if (!winner) throw error;
      return { user: winner.user, isNewUser: false };
    }
  }
}
