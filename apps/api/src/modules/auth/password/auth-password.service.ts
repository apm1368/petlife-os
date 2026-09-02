import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Response } from "express";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { SessionService, type SessionUser } from "../../../common/session/session.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { CurrentPasswordIncorrectException, InvalidCredentialsException, UsernameTakenException } from "../../../common/errors/api-exception";
import { hashPassword, verifyPassword } from "../../../common/password/password-hash.util";
import { normalizeUsername } from "../identifier.util";
import type { RegisterDto } from "../dto/register.dto";
import type { LoginPasswordDto } from "../dto/login-password.dto";
import type { ChangePasswordDto } from "../dto/change-password.dto";

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
 * A dummy Argon2id hash verified against on every "user not found" login
 * attempt, so a nonexistent username takes roughly the same time to reject
 * as a wrong password for a real one — timing side channels are as much an
 * enumeration vector as the response body itself.
 */
const DUMMY_PASSWORD_HASH = "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$V3iM0Z2xW1sQ2m8p1w0mQoR1yq9pQeS1oQm6mWq3n3E";

@Injectable()
export class AuthPasswordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly events: DomainEventsService,
  ) {}

  async register(dto: RegisterDto, res: Response, meta: { userAgent?: string; ipAddress?: string }): Promise<SessionUser> {
    const normalizedUsername = normalizeUsername(dto.username);
    const passwordHash = await hashPassword(dto.password);

    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          username: dto.username.trim(),
          normalizedUsername,
          passwordHash,
          email: dto.email?.toLowerCase(),
          displayName: dto.displayName?.trim() || dto.username.trim(),
        },
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) throw new UsernameTakenException();
      throw error;
    }

    await this.sessions.issueSession(user.id, res, meta);
    await this.events.publish("UserRegistered", { userId: user.id, method: "PASSWORD" });
    await this.events.publish("UserAuthenticated", { userId: user.id });

    return toSessionUser(user);
  }

  async login(dto: LoginPasswordDto, res: Response, meta: { userAgent?: string; ipAddress?: string }): Promise<SessionUser> {
    const normalizedUsername = normalizeUsername(dto.username);
    const user = await this.prisma.user.findUnique({ where: { normalizedUsername } });

    const isValid = await verifyPassword(user?.passwordHash ?? DUMMY_PASSWORD_HASH, dto.password);
    if (!user || !user.passwordHash || !isValid) {
      throw new InvalidCredentialsException();
    }

    await this.sessions.issueSession(user.id, res, meta);
    await this.events.publish("UserAuthenticated", { userId: user.id });

    return toSessionUser(user);
  }

  /** Handles both "set a password for the first time" (OTP-only/Google-only account, currentPassword omitted) and "change an existing password" (currentPassword required and verified). */
  async setOrChangePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (user.passwordHash) {
      if (!dto.currentPassword || !(await verifyPassword(user.passwordHash, dto.currentPassword))) {
        throw new CurrentPasswordIncorrectException();
      }
    }

    const newHash = await hashPassword(dto.newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } });
    await this.events.publish("PasswordChanged", { userId });
  }
}
