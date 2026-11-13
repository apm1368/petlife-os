import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AdminMembershipStatus, AdminRole, type Prisma } from "@prisma/client";
import type { AppEnv } from "../../../config/env";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AdminGovernanceRuleException, ApiException, NotFoundApiException } from "../../../common/errors/api-exception";
import type { SessionUser } from "../../../common/session/session.service";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { evaluateTwoStep, type TwoStepGate, twoStepEnforcementAvailable } from "./two-step-gate";
import { base32Encode, hashRecoveryCode, matchTotp, newRecoveryCode, newTotpSecret, otpauthUri, RECOVERY_CODE_COUNT } from "./totp";
import { openSecret, sealSecret } from "./two-step-secret";

/** After this many wrong codes in a row the check locks; each further lock-out before a success lasts longer. */
export const TWO_STEP_MAX_FAILURES = 5;
export const TWO_STEP_LOCK_MINUTES = [15, 60, 24 * 60] as const;
// What authenticator apps show above the code; a domain reads the same in every language.
const ISSUER = "opetlife.ir";

/** `attemptsLeft` only where wrong codes count toward the lock (signing in, not while setting up). */
export class TwoStepCodeInvalidException extends ApiException {
  constructor(attemptsLeft?: number) {
    super("TWO_STEP_CODE_INVALID", "That code is not valid.", HttpStatus.BAD_REQUEST, attemptsLeft === undefined ? {} : { attemptsLeft });
  }
}
export class TwoStepLockedException extends ApiException {
  constructor(retryAt: Date) {
    super("TWO_STEP_LOCKED", "Too many wrong codes. Try again later.", HttpStatus.TOO_MANY_REQUESTS, { retryAt: retryAt.toISOString() });
  }
}

export interface TwoStepCodeInput {
  code?: string;
  recoveryCode?: string;
}

function gateDto(gate: TwoStepGate) {
  return {
    enrolled: gate.enrolled,
    verified: gate.verified,
    verifiedUntil: gate.verifiedUntil?.toISOString() ?? null,
    enforced: gate.enforced,
    graceEndsAt: gate.graceEndsAt?.toISOString() ?? null,
    required: gate.required,
  };
}

/**
 * Admin two-step sign-in (TOTP, RFC 6238 — market-readiness Q75). Rollout agreed with QA:
 * - off for everyone until an admin enrols; enrolled admins are asked for a code once per session (and every
 *   TWO_STEP_VERIFIED_HOURS);
 * - recovery codes are single-use and stored hashed;
 * - a SUPER_ADMIN may enforce it for every admin, only after enrolling themselves; admins who haven't enrolled keep
 *   working for the grace window, then must enrol before any admin page answers;
 * - an SMS fallback is deliberately not offered until real SMS delivery is live.
 */
@Injectable()
export class AdminTwoStepService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly audit: AdminAuditLogService,
  ) {}

  private get keyMaterial(): string {
    return this.config.get("ADMIN_TWO_STEP_KEY", { infer: true }) ?? this.config.get("SESSION_SECRET", { infer: true });
  }

  /** A sealed secret this key can't open (the key was rotated) is reported as such, never as a 500. */
  private secretOf(sealed: string): Buffer {
    try {
      return openSecret(sealed, this.keyMaterial);
    } catch {
      throw new AdminGovernanceRuleException({ rule: "TWO_STEP_KEY_CHANGED" });
    }
  }

  gate(userId: string, sessionId: string | null) {
    return evaluateTwoStep(this.prisma, userId, sessionId);
  }

  async status(admin: ResolvedAdminContext, sessionId: string | null) {
    const [gate, factor, left] = await Promise.all([
      this.gate(admin.userId, sessionId),
      this.prisma.adminTwoStepFactor.findUnique({ where: { userId: admin.userId }, select: { confirmedAt: true } }),
      this.prisma.adminTwoStepRecoveryCode.count({ where: { userId: admin.userId, usedAt: null } }),
    ]);
    return { ...gateDto(gate), enrolledAt: factor?.confirmedAt?.toISOString() ?? null, recoveryCodesLeft: gate.enrolled ? left : null, pendingEnrolment: !!factor && !factor.confirmedAt };
  }

  /** A new (unconfirmed) authenticator secret. Starting again replaces an unconfirmed one; a confirmed one stays until disabled or reset. */
  async startEnrolment(admin: ResolvedAdminContext, user: SessionUser) {
    const existing = await this.prisma.adminTwoStepFactor.findUnique({ where: { userId: admin.userId }, select: { confirmedAt: true } });
    if (existing?.confirmedAt) throw new AdminGovernanceRuleException({ rule: "TWO_STEP_ALREADY_ON" });
    const secret = newTotpSecret();
    const sealed = sealSecret(secret, this.keyMaterial);
    await this.prisma.adminTwoStepFactor.upsert({
      where: { userId: admin.userId },
      create: { userId: admin.userId, secretCiphertext: sealed },
      update: { secretCiphertext: sealed, lastUsedStep: 0, failedAttempts: 0, lockedUntil: null },
    });
    const account = user.email ?? user.phone ?? admin.displayName;
    const key = base32Encode(secret);
    return { secret: key.match(/.{1,4}/g)!.join(" "), otpauthUri: otpauthUri(secret, ISSUER, account), issuer: ISSUER, account };
  }

  /** Proves the authenticator works, turns two-step on, unlocks this session and returns the recovery codes (shown once). */
  async confirmEnrolment(admin: ResolvedAdminContext, sessionId: string | null, code: string) {
    const factor = await this.prisma.adminTwoStepFactor.findUnique({ where: { userId: admin.userId } });
    if (!factor || factor.confirmedAt) throw new AdminGovernanceRuleException({ rule: factor ? "TWO_STEP_ALREADY_ON" : "TWO_STEP_NO_PENDING_ENROLMENT" });
    const step = matchTotp(this.secretOf(factor.secretCiphertext), code, factor.lastUsedStep);
    if (step === null) throw new TwoStepCodeInvalidException();
    const now = new Date();
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => newRecoveryCode());
    await this.prisma.$transaction(async (tx) => {
      const won = await tx.adminTwoStepFactor.updateMany({ where: { userId: admin.userId, confirmedAt: null, secretCiphertext: factor.secretCiphertext }, data: { confirmedAt: now, lastUsedStep: step, failedAttempts: 0, lockedUntil: null } });
      if (won.count !== 1) throw new AdminGovernanceRuleException({ rule: "TWO_STEP_NO_PENDING_ENROLMENT" });
      await tx.adminTwoStepRecoveryCode.deleteMany({ where: { userId: admin.userId } });
      await tx.adminTwoStepRecoveryCode.createMany({ data: codes.map((c) => ({ userId: admin.userId, codeHash: hashRecoveryCode(c) })) });
      if (sessionId) await tx.session.updateMany({ where: { id: sessionId, userId: admin.userId }, data: { twoStepVerifiedAt: now } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "admin_two_step.enrolled", entityType: "AdminUser", entityId: admin.adminUserId, afterSummary: { twoStep: "ON" }, tx });
    });
    return { recoveryCodes: codes };
  }

  /** The sign-in challenge: a current authenticator code, or one unused recovery code. */
  async verify(admin: ResolvedAdminContext, sessionId: string | null, input: TwoStepCodeInput) {
    await this.checkCode(admin, input);
    if (sessionId) await this.prisma.session.updateMany({ where: { id: sessionId, userId: admin.userId }, data: { twoStepVerifiedAt: new Date() } });
    const left = await this.prisma.adminTwoStepRecoveryCode.count({ where: { userId: admin.userId, usedAt: null } });
    return { ok: true as const, recoveryCodesLeft: left };
  }

  async regenerateRecoveryCodes(admin: ResolvedAdminContext, code: string) {
    await this.checkCode(admin, { code });
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => newRecoveryCode());
    await this.prisma.$transaction(async (tx) => {
      await tx.adminTwoStepRecoveryCode.deleteMany({ where: { userId: admin.userId } });
      await tx.adminTwoStepRecoveryCode.createMany({ data: codes.map((c) => ({ userId: admin.userId, codeHash: hashRecoveryCode(c) })) });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "admin_two_step.recovery_codes_regenerated", entityType: "AdminUser", entityId: admin.adminUserId, tx });
    });
    return { recoveryCodes: codes };
  }

  /** Turning it off yourself needs a current code, and is refused while enforcement is on. */
  async disable(admin: ResolvedAdminContext, code: string) {
    const policy = await this.prisma.adminTwoStepPolicy.findUnique({ where: { id: 1 } });
    if (policy?.enforcedAt && twoStepEnforcementAvailable()) throw new AdminGovernanceRuleException({ rule: "TWO_STEP_ENFORCED" });
    await this.checkCode(admin, { code });
    await this.removeFactor(admin.userId, async (tx) => {
      await this.audit.record({ adminUserId: admin.adminUserId, action: "admin_two_step.disabled", entityType: "AdminUser", entityId: admin.adminUserId, beforeSummary: { twoStep: "ON" }, afterSummary: { twoStep: "OFF" }, tx });
    });
    return { ok: true as const };
  }

  /** Lost phone: a SUPER_ADMIN clears another admin's authenticator so they enrol again. */
  async reset(actor: ResolvedAdminContext, adminUserId: string, reason: string) {
    if (actor.adminUserId === adminUserId) throw new AdminGovernanceRuleException({ rule: "TWO_STEP_SELF_RESET" });
    await this.assertActorEnrolled(actor);
    const target = await this.prisma.adminUser.findUnique({ where: { id: adminUserId }, select: { id: true, userId: true } });
    if (!target) throw new NotFoundApiException("AdminUser");
    const factor = await this.prisma.adminTwoStepFactor.findUnique({ where: { userId: target.userId }, select: { confirmedAt: true } });
    if (!factor) throw new AdminGovernanceRuleException({ rule: "TWO_STEP_NOT_ON" });
    await this.removeFactor(target.userId, async (tx) => {
      await this.audit.record({ adminUserId: actor.adminUserId, action: "admin_two_step.reset", entityType: "AdminUser", entityId: target.id, reason, beforeSummary: { twoStep: factor.confirmedAt ? "ON" : "PENDING" }, afterSummary: { twoStep: "OFF" }, tx });
    });
    return { ok: true as const };
  }

  async policy() {
    const [policy, admins] = await Promise.all([
      this.prisma.adminTwoStepPolicy.findUnique({ where: { id: 1 } }),
      this.prisma.adminUser.findMany({
        where: { status: AdminMembershipStatus.ACTIVE },
        orderBy: { createdAt: "asc" },
        select: { id: true, role: true, createdAt: true, user: { select: { displayName: true, adminTwoStepFactor: { select: { confirmedAt: true } } } } },
      }),
    ]);
    const enforcedAt = policy?.enforcedAt ?? null;
    const graceDays = policy?.graceDays ?? 7;
    const members = admins.map((a) => {
      const enrolledAt = a.user.adminTwoStepFactor?.confirmedAt ?? null;
      const graceEndsAt = enforcedAt && !enrolledAt ? new Date(Math.max(enforcedAt.getTime(), a.createdAt.getTime()) + graceDays * 24 * 60 * 60 * 1000) : null;
      return { adminUserId: a.id, displayName: a.user.displayName, role: a.role, enrolled: !!enrolledAt, enrolledAt: enrolledAt?.toISOString() ?? null, graceEndsAt: graceEndsAt?.toISOString() ?? null };
    });
    return { enforced: !!enforcedAt && twoStepEnforcementAvailable(), enforcementAvailable: twoStepEnforcementAvailable(), enforcedAt: enforcedAt?.toISOString() ?? null, graceDays, enrolledCount: members.filter((m) => m.enrolled).length, members };
  }

  /** SUPER_ADMIN only (admin.manage), and only once the actor's own account is protected. */
  async setPolicy(actor: ResolvedAdminContext, input: { enforced: boolean; graceDays: number; reason: string }) {
    if (actor.role !== AdminRole.SUPER_ADMIN) throw new AdminGovernanceRuleException({ rule: "TWO_STEP_POLICY_SUPER_ADMIN_ONLY" });
    if (input.enforced && !twoStepEnforcementAvailable()) throw new AdminGovernanceRuleException({ rule: "TWO_STEP_ENFORCEMENT_NOT_AVAILABLE" });
    if (input.enforced) await this.assertActorEnrolled(actor);
    const before = await this.prisma.adminTwoStepPolicy.findUnique({ where: { id: 1 } });
    const enforcedAt = input.enforced ? before?.enforcedAt ?? new Date() : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.adminTwoStepPolicy.upsert({
        where: { id: 1 },
        create: { id: 1, enforcedAt, graceDays: input.graceDays, updatedByUserId: actor.userId },
        update: { enforcedAt, graceDays: input.graceDays, updatedByUserId: actor.userId },
      });
      await this.audit.record({
        adminUserId: actor.adminUserId, action: "admin_two_step.policy_changed", entityType: "AdminTwoStepPolicy", reason: input.reason,
        beforeSummary: { enforced: !!before?.enforcedAt, graceDays: before?.graceDays ?? 7 }, afterSummary: { enforced: input.enforced, graceDays: input.graceDays }, tx,
      });
    });
    return this.policy();
  }

  private async assertActorEnrolled(actor: ResolvedAdminContext) {
    const factor = await this.prisma.adminTwoStepFactor.findUnique({ where: { userId: actor.userId }, select: { confirmedAt: true } });
    if (!factor?.confirmedAt) throw new AdminGovernanceRuleException({ rule: "TWO_STEP_SELF_ENROLMENT_REQUIRED" });
  }

  private async removeFactor(userId: string, inTx: (tx: Prisma.TransactionClient) => Promise<void>) {
    await this.prisma.$transaction(async (tx) => {
      await tx.adminTwoStepFactor.deleteMany({ where: { userId } });
      await tx.session.updateMany({ where: { userId, twoStepVerifiedAt: { not: null } }, data: { twoStepVerifiedAt: null } });
      await inTx(tx);
    });
  }

  /**
   * Accepts a code at most once: a TOTP step only if it is later than the last accepted one (claimed atomically), a
   * recovery code only while unused (claimed atomically). Wrong codes count toward a temporary lock.
   */
  private async checkCode(admin: ResolvedAdminContext, input: TwoStepCodeInput) {
    const factor = await this.prisma.adminTwoStepFactor.findUnique({ where: { userId: admin.userId } });
    if (!factor?.confirmedAt) throw new AdminGovernanceRuleException({ rule: "TWO_STEP_NOT_ON" });
    const now = new Date();
    if (factor.lockedUntil && factor.lockedUntil > now) throw new TwoStepLockedException(factor.lockedUntil);
    let accepted = false;
    if (input.recoveryCode) {
      const used = await this.prisma.adminTwoStepRecoveryCode.updateMany({ where: { userId: admin.userId, codeHash: hashRecoveryCode(input.recoveryCode), usedAt: null }, data: { usedAt: now } });
      accepted = used.count === 1;
      if (accepted) {
        const left = await this.prisma.adminTwoStepRecoveryCode.count({ where: { userId: admin.userId, usedAt: null } });
        await this.audit.record({ adminUserId: admin.adminUserId, action: "admin_two_step.recovery_code_used", entityType: "AdminUser", entityId: admin.adminUserId, afterSummary: { recoveryCodesLeft: left } });
      }
    } else if (input.code) {
      const step = matchTotp(this.secretOf(factor.secretCiphertext), input.code, factor.lastUsedStep, now);
      if (step !== null) {
        const won = await this.prisma.adminTwoStepFactor.updateMany({ where: { userId: admin.userId, lastUsedStep: { lt: step } }, data: { lastUsedStep: step } });
        accepted = won.count === 1;
      }
    }
    if (accepted) {
      if (factor.failedAttempts > 0 || factor.lockedUntil || factor.lockouts > 0) await this.prisma.adminTwoStepFactor.update({ where: { userId: admin.userId }, data: { failedAttempts: 0, lockedUntil: null, lockouts: 0 } });
      return;
    }
    const after = await this.prisma.adminTwoStepFactor.update({ where: { userId: admin.userId }, data: { failedAttempts: { increment: 1 } }, select: { failedAttempts: true, lockouts: true } });
    if (after.failedAttempts >= TWO_STEP_MAX_FAILURES) {
      // 15 minutes, then 1 hour, then 24 hours: an honest typo costs little, a guessing run gets a few hundred tries a month.
      const minutes = TWO_STEP_LOCK_MINUTES[Math.min(after.lockouts, TWO_STEP_LOCK_MINUTES.length - 1)]!;
      const retryAt = new Date(now.getTime() + minutes * 60 * 1000);
      await this.prisma.adminTwoStepFactor.update({ where: { userId: admin.userId }, data: { failedAttempts: 0, lockedUntil: retryAt, lockouts: { increment: 1 } } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "admin_two_step.locked", entityType: "AdminUser", entityId: admin.adminUserId, afterSummary: { lockedMinutes: minutes, lockout: after.lockouts + 1 } });
      throw new TwoStepLockedException(retryAt);
    }
    throw new TwoStepCodeInvalidException(TWO_STEP_MAX_FAILURES - after.failedAttempts);
  }
}
