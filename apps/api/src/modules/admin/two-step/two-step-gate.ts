import { HttpStatus, SetMetadata } from "@nestjs/common";
import { ApiException } from "../../../common/errors/api-exception";
import type { PrismaService } from "../../../common/prisma/prisma.service";

/** How long one successful two-step check keeps an admin session unlocked before it asks again. */
export const TWO_STEP_VERIFIED_HOURS = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

export type TwoStepRequirement = "NONE" | "CHALLENGE" | "ENROL";

export interface TwoStepGate {
  /** The account has a confirmed authenticator. */
  enrolled: boolean;
  /** This session passed the check recently enough (always false while not enrolled). */
  verified: boolean;
  verifiedUntil: Date | null;
  /** A SUPER_ADMIN switched enforcement on. */
  enforced: boolean;
  /** While enforced and not enrolled: the moment admin routes stop working until the admin enrols. */
  graceEndsAt: Date | null;
  /** What the admin must do before admin routes answer: nothing, enter a code, or enrol. */
  required: TwoStepRequirement;
}

/** Handlers an admin can reach before passing two-step (status, enrol, verify) — everything else is behind it. */
export const ADMIN_TWO_STEP_EXEMPT_KEY = "adminTwoStepExempt";
export const AllowBeforeTwoStep = () => SetMetadata(ADMIN_TWO_STEP_EXEMPT_KEY, true);

export class AdminTwoStepRequiredException extends ApiException {
  constructor(details: { reason: Exclude<TwoStepRequirement, "NONE">; graceEndsAt?: string | null }) {
    super("ADMIN_TWO_STEP_REQUIRED", "This admin session needs two-step sign-in first.", HttpStatus.FORBIDDEN, details);
  }
}

/** Whether team enforcement may be switched on at all (server setting; off by default, see docs/ops/admin-two-step.md). */
export function twoStepEnforcementAvailable(): boolean {
  return process.env.ADMIN_TWO_STEP_ENFORCEMENT === "on";
}

/**
 * The one place that decides whether an admin session is through two-step. Read by AdminAuthGuard on every admin
 * request and by /admin/me for the shell, so they can never disagree. Takes PrismaService directly (it is global)
 * so the guard keeps working in every module that uses it without new wiring.
 */
export async function evaluateTwoStep(prisma: PrismaService, userId: string, sessionId: string | null, now: Date = new Date()): Promise<TwoStepGate> {
  const [factor, session, policy] = await Promise.all([
    prisma.adminTwoStepFactor.findUnique({ where: { userId }, select: { confirmedAt: true } }),
    sessionId ? prisma.session.findUnique({ where: { id: sessionId }, select: { userId: true, twoStepVerifiedAt: true } }) : Promise.resolve(null),
    prisma.adminTwoStepPolicy.findUnique({ where: { id: 1 }, select: { enforcedAt: true, graceDays: true } }),
  ]);
  const confirmedAt = factor?.confirmedAt ?? null;
  const enrolled = !!confirmedAt;
  const verifiedAt = session && session.userId === userId ? session.twoStepVerifiedAt : null;
  // A check from before the current authenticator was confirmed (e.g. before a reset) never counts.
  const verifiedUntil = enrolled && verifiedAt && verifiedAt >= confirmedAt ? new Date(verifiedAt.getTime() + TWO_STEP_VERIFIED_HOURS * 60 * 60 * 1000) : null;
  const verified = !!verifiedUntil && verifiedUntil > now;
  // Owner (2026-11-13): two-step is opt-in for now; team enforcement waits for live SMS and email. Until the server
  // sets ADMIN_TWO_STEP_ENFORCEMENT=on, a stored policy never locks anyone out.
  const enforced = twoStepEnforcementAvailable() && !!policy?.enforcedAt;
  let graceEndsAt: Date | null = null;
  if (enforced && !enrolled) {
    const admin = await prisma.adminUser.findUnique({ where: { userId }, select: { createdAt: true } });
    const from = Math.max(policy!.enforcedAt!.getTime(), admin?.createdAt.getTime() ?? 0);
    graceEndsAt = new Date(from + policy!.graceDays * DAY_MS);
  }
  const required: TwoStepRequirement = enrolled ? (verified ? "NONE" : "CHALLENGE") : graceEndsAt && now >= graceEndsAt ? "ENROL" : "NONE";
  return { enrolled, verified, verifiedUntil: verified ? verifiedUntil : null, enforced, graceEndsAt, required };
}
