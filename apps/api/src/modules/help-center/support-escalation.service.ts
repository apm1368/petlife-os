import { Injectable } from "@nestjs/common";
import { SupportCaseStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ValidationApiException } from "../../common/errors/api-exception";
import { SupportCaseService } from "../admin/support/support-case.service";

export interface SupportEscalationDto {
  referenceNumber: string;
  caseId: string;
  caseNumber: string;
  confirmedAt: string;
}

/**
 * "Reach a person" on an existing support ticket.
 *
 * This is a thin layer ON the existing SupportCase, not a second ticketing system: it records that the
 * member asked for a human and hands them a reference number to quote. It does not alter SupportCase and it
 * invents no automated reply — the existing admin queue (and its first-response and red-ticket rules,
 * AD-08/AD-09) is what actually answers.
 *
 * Two rules the server enforces rather than trusting the client with:
 *  - the member must have explicitly confirmed (`confirm: true`): "with confirmation" is a server contract,
 *    so a script that skips the confirmation step cannot create an escalation;
 *  - the ticket must be the caller's own and still open: ownership comes from SupportCaseService.getForUser,
 *    which answers "not found" and "not yours" identically.
 */
@Injectable()
export class SupportEscalationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cases: SupportCaseService,
  ) {}

  async escalate(userId: string, caseId: string, input: { reason: string; confirm: boolean }): Promise<SupportEscalationDto> {
    if (input.confirm !== true) throw new ValidationApiException({ field: "confirm", reason: "CONFIRMATION_REQUIRED" });

    // Throws the standard not-found for a ticket that is not the caller's (or does not exist).
    const supportCase = await this.cases.getForUser(userId, caseId);
    if (supportCase.status === SupportCaseStatus.CLOSED || supportCase.status === SupportCaseStatus.RESOLVED) {
      throw new ValidationApiException({ field: "caseId", reason: "CASE_NOT_OPEN", status: supportCase.status });
    }

    // One live hand-off per ticket: a second tap returns the first reference instead of creating a duplicate,
    // so a double-submit (or a retry after a dropped response) is safe and the member keeps one number to quote.
    const existing = await this.prisma.supportEscalation.findFirst({ where: { caseId, requesterUserId: userId }, orderBy: { createdAt: "desc" } });
    if (existing) return this.toDto(existing, supportCase.caseNumber);

    const created = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('support_escalation_number_seq') AS nextval`;
      const referenceNumber = `ESC-${rows[0]!.nextval.toString().padStart(6, "0")}`;
      return tx.supportEscalation.create({ data: { referenceNumber, caseId, requesterUserId: userId, reason: input.reason, confirmedAt: new Date() } });
    });
    return this.toDto(created, supportCase.caseNumber);
  }

  private toDto(e: { referenceNumber: string; caseId: string; confirmedAt: Date }, caseNumber: string): SupportEscalationDto {
    return { referenceNumber: e.referenceNumber, caseId: e.caseId, caseNumber, confirmedAt: e.confirmedAt.toISOString() };
  }
}
