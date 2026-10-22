import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, UserAccountStatus } from "@prisma/client";
import type { Response } from "express";
import type Redis from "ioredis";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { REDIS_CLIENT } from "../../../common/redis/redis.module";
import { deviceLabel } from "../../../common/session/device-label.util";
import { SessionService, type SessionUser } from "../../../common/session/session.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import {
  AccountSuspendedException,
  CurrentPasswordIncorrectException,
  AuthRateLimitedException,
  InvalidCredentialsException,
  LoginChallengeInvalidException,
  LoginPhoneRequiredException,
  OtpRateLimitedException,
  PhoneTakenException,
  UsernameTakenException,
} from "../../../common/errors/api-exception";
import { hashPassword, verifyPassword } from "../../../common/password/password-hash.util";
import type { AppEnv } from "../../../config/env";
import { maskPhone, normalizeUsername, requireIranianMobile } from "../identifier.util";
import type { RegisterDto } from "../dto/register.dto";
import type { LoginPasswordDto } from "../dto/login-password.dto";
import { IDENTIFIER_LIMITS, IdentifierRateLimiter } from "../../../common/rate-limit/identifier-rate-limiter.service";
import type { ChangePasswordDto } from "../dto/change-password.dto";
import { OtpGateService } from "../otp/otp-gate.service";

/** Which unique column a P2002 hit, or null when the error is something else. */
function uniqueViolationTarget(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return null;
  const target = error.meta?.target;
  return Array.isArray(target) ? target.join(",") : String(target ?? "");
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

/** A sign-in whose password was right and which now waits for the SMS code. Lives in Redis only. */
interface LoginChallenge {
  userId: string;
  /** Where the code goes: the account's verified mobile, or one the person just gave (phoneVerified false). */
  phone: string | null;
  phoneVerified: boolean;
}

export type LoginStartResult =
  | { status: "OTP_REQUIRED"; challengeId: string; maskedPhone: string; resendAfterSeconds: number }
  | { status: "PHONE_REQUIRED"; challengeId: string };

/**
 * Username + password + SMS code, for sign-up and sign-in alike.
 *
 * Sign-up: the username is checked and a code is texted to the mobile; the account is created only
 * with that code, so every new account has a verified mobile. Sign-in: a correct password opens a
 * short-lived challenge and texts a code to the account's mobile; the session is issued only once
 * the code is entered. An older account with no verified mobile gives one inside the challenge and
 * it is saved, verified, when the code is entered.
 */
@Injectable()
export class AuthPasswordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly events: DomainEventsService,
    private readonly limiter: IdentifierRateLimiter,
    private readonly otp: OtpGateService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async requestRegisterOtp(username: string, rawPhone: string): Promise<{ ok: true; maskedPhone: string; resendAfterSeconds: number }> {
    const phone = requireIranianMobile(rawPhone);
    await this.assertUsernameFree(normalizeUsername(username));
    await this.otp.send(phone, "register");
    return { ok: true, maskedPhone: maskPhone(phone), resendAfterSeconds: this.config.get("OTP_RESEND_COOLDOWN_SECONDS", { infer: true }) };
  }

  async register(dto: RegisterDto, res: Response, meta: { userAgent?: string; ipAddress?: string }): Promise<SessionUser> {
    const phone = requireIranianMobile(dto.phone);
    const normalizedUsername = normalizeUsername(dto.username);
    // Checked before the code is consumed, so a taken username does not cost the person their code.
    await this.assertUsernameFree(normalizedUsername);
    await this.otp.verify(phone, dto.code, "register");
    const passwordHash = await hashPassword(dto.password);

    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          username: dto.username.trim(),
          normalizedUsername,
          passwordHash,
          phone,
          phoneVerifiedAt: new Date(),
          displayName: dto.displayName?.trim() || dto.username.trim(),
        },
      });
    } catch (error) {
      const target = uniqueViolationTarget(error);
      if (target === null) throw error;
      throw target.includes("phone") ? new PhoneTakenException() : new UsernameTakenException();
    }

    const sessionId = await this.sessions.issueSession(user.id, res, meta);
    await this.events.publish("UserRegistered", { userId: user.id, method: "PASSWORD" });
    await this.events.publish("UserAuthenticated", { userId: user.id, method: "PASSWORD", sessionId, device: deviceLabel(meta.userAgent), firstSignIn: true }, { aggregateType: "User", aggregateId: user.id });

    return toSessionUser(user);
  }

  /** Password step of sign-in. Never issues a session — see completeLogin. */
  async startLogin(dto: LoginPasswordDto): Promise<LoginStartResult> {
    const normalizedUsername = normalizeUsername(dto.username);
    // Per-username failure budget, applied identically to names that do not exist, so the 429 never
    // tells an attacker which usernames are real; spreading guesses across IPs does not reset it.
    const { bucket, limit, windowSeconds } = IDENTIFIER_LIMITS.passwordFail;
    const wait = await this.limiter.retryAfter(bucket, normalizedUsername, limit);
    if (wait > 0) throw new AuthRateLimitedException(wait);

    const user = await this.prisma.user.findUnique({ where: { normalizedUsername } });

    const isValid = await verifyPassword(user?.passwordHash ?? DUMMY_PASSWORD_HASH, dto.password);
    if (!user || !user.passwordHash || !isValid) {
      await this.limiter.hit(bucket, normalizedUsername, windowSeconds);
      throw new InvalidCredentialsException();
    }
    await this.limiter.reset(bucket, normalizedUsername);
    // Refused here, before a code is texted; issueSession re-checks at the end of every sign-in.
    if (user.accountStatus === UserAccountStatus.SUSPENDED) throw new AccountSuspendedException();

    const phone = user.phone && user.phoneVerifiedAt ? user.phone : null;
    const challengeId = randomBytes(24).toString("base64url");
    await this.saveChallenge(challengeId, { userId: user.id, phone, phoneVerified: Boolean(phone) });
    if (!phone) return { status: "PHONE_REQUIRED", challengeId };
    return this.sendLoginCode(challengeId, phone);
  }

  /** Gives a challenge for an account without a verified mobile the number to send its code to. */
  async setLoginPhone(challengeId: string, rawPhone: string): Promise<LoginStartResult> {
    const challenge = await this.loadChallenge(challengeId);
    if (challenge.phoneVerified) throw new LoginChallengeInvalidException();
    const phone = requireIranianMobile(rawPhone);
    await this.saveChallenge(challengeId, { ...challenge, phone });
    return this.sendLoginCode(challengeId, phone);
  }

  async resendLoginCode(challengeId: string): Promise<LoginStartResult> {
    const challenge = await this.loadChallenge(challengeId);
    if (!challenge.phone) throw new LoginPhoneRequiredException();
    return this.sendLoginCode(challengeId, challenge.phone, { strict: true });
  }

  async completeLogin(challengeId: string, code: string, res: Response, meta: { userAgent?: string; ipAddress?: string }): Promise<SessionUser> {
    const challenge = await this.loadChallenge(challengeId);
    if (!challenge.phone) throw new LoginPhoneRequiredException();
    await this.otp.verify(challenge.phone, code, "login");
    // One challenge, one session — even if the same correct code is submitted twice at once.
    if ((await this.redis.del(this.challengeKey(challengeId))) === 0) throw new LoginChallengeInvalidException();

    let user;
    if (challenge.phoneVerified) {
      user = await this.prisma.user.findUniqueOrThrow({ where: { id: challenge.userId } });
    } else {
      try {
        user = await this.prisma.user.update({ where: { id: challenge.userId }, data: { phone: challenge.phone, phoneVerifiedAt: new Date() } });
      } catch (error) {
        if (uniqueViolationTarget(error) !== null) throw new PhoneTakenException();
        throw error;
      }
      await this.events.publish("ContactChanged", { userId: user.id, kind: "phone", hadPrevious: false }, { aggregateType: "User", aggregateId: user.id });
    }

    const sessionId = await this.sessions.issueSession(user.id, res, meta);
    await this.events.publish("UserAuthenticated", { userId: user.id, method: "PASSWORD", sessionId, device: deviceLabel(meta.userAgent) }, { aggregateType: "User", aggregateId: user.id });

    return toSessionUser(user);
  }

  /** Handles both "set a password for the first time" (an account created without one, currentPassword omitted) and "change an existing password" (currentPassword required and verified). */
  /** Returns how many sessions other than the caller's were ended; the controller re-issues the caller's session so a password change never signs this device out (session id rotates). */
  async setOrChangePassword(userId: string, dto: ChangePasswordDto): Promise<number> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (user.passwordHash) {
      if (!dto.currentPassword || !(await verifyPassword(user.passwordHash, dto.currentPassword))) {
        throw new CurrentPasswordIncorrectException();
      }
    }

    const newHash = await hashPassword(dto.newPassword);
    const hadPassword = Boolean(user.passwordHash);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } });
    const active = await this.prisma.session.count({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } } });
    await this.sessions.revokeAllForUser(userId);
    // Outstanding reset links were issued for the old credential.
    await this.prisma.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
    await this.events.publish("PasswordChanged", { userId, firstPassword: !hadPassword }, { aggregateType: "User", aggregateId: userId });
    return Math.max(active - 1, 0);
  }

  private async assertUsernameFree(normalizedUsername: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { normalizedUsername }, select: { id: true } });
    if (existing) throw new UsernameTakenException();
  }

  /**
   * Texts the sign-in code. While the resend cooldown runs, the code sent moments ago is still valid,
   * so a repeated password submit just continues with it — unless the person explicitly asked for a
   * resend (`strict`), where the wait is reported.
   */
  private async sendLoginCode(challengeId: string, phone: string, options: { strict?: boolean } = {}): Promise<LoginStartResult> {
    let resendAfterSeconds = this.config.get("OTP_RESEND_COOLDOWN_SECONDS", { infer: true });
    try {
      await this.otp.send(phone, "login");
    } catch (error) {
      if (!(error instanceof OtpRateLimitedException) || options.strict) throw error;
      const retry = Number(error.details?.retryAfterSeconds);
      if (Number.isFinite(retry)) resendAfterSeconds = retry;
    }
    return { status: "OTP_REQUIRED", challengeId, maskedPhone: maskPhone(phone), resendAfterSeconds };
  }

  private challengeKey(challengeId: string) {
    return `auth:login-challenge:${challengeId}`;
  }

  private async saveChallenge(challengeId: string, challenge: LoginChallenge): Promise<void> {
    const ttl = this.config.get("AUTH_LOGIN_CHALLENGE_TTL_SECONDS", { infer: true });
    await this.redis.set(this.challengeKey(challengeId), JSON.stringify(challenge), "EX", ttl);
  }

  private async loadChallenge(challengeId: string): Promise<LoginChallenge> {
    const raw = await this.redis.get(this.challengeKey(challengeId));
    if (!raw) throw new LoginChallengeInvalidException();
    return JSON.parse(raw) as LoginChallenge;
  }
}
