import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CardTransferDestinationStatus, type CardTransferDestination } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { AppEnv } from "../../../config/env";
import { formatCardNumber, maskCardNumber } from "./card-transfer-destination.policy";

/** The account a member pays into: the full details are only for the active card-to-card payment screen. */
export interface CompanyAccount {
  /** The destination row, or null when it came from the server environment (before the owner set one in admin). */
  destinationId: string | null;
  cardNumber: string | null;
  /** "6037-9912-3456-7893" */
  cardNumberFormatted: string | null;
  cardNumberMasked: string | null;
  sheba: string | null;
  holderName: string;
  bankName: string | null;
}

export const toCompanyAccount = (row: Pick<CardTransferDestination, "id" | "cardNumber" | "sheba" | "holderName" | "bankName">): CompanyAccount => ({
  destinationId: row.id,
  cardNumber: row.cardNumber,
  cardNumberFormatted: row.cardNumber ? formatCardNumber(row.cardNumber) : null,
  cardNumberMasked: maskCardNumber(row.cardNumber),
  sheba: row.sheba,
  holderName: row.holderName,
  bankName: row.bankName,
});

/** Rows that were ever the live account: ACTIVE now, or CLOSED after being active. A proposal never counts. */
export const EVER_ACTIVE_STATUSES: CardTransferDestinationStatus[] = [CardTransferDestinationStatus.ACTIVE, CardTransferDestinationStatus.CLOSED];

/**
 * Resolves the company card-to-card account. The owner's admin-managed destination wins; the server environment
 * (CARD_TRANSFER_ACCOUNT_NUMBER/HOLDER) is used only while no destination has ever been active in admin. Once the
 * owner manages it there, switching it off in admin really switches card-to-card off. A change waiting for its second
 * super admin (BO-14) is never shown to members nor used by a payment.
 */
@Injectable()
export class CardTransferDestinationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  envAccount(): CompanyAccount | null {
    const digits = (this.config.get("CARD_TRANSFER_ACCOUNT_NUMBER", { infer: true }) ?? "").replace(/\D/g, "");
    const holder = this.config.get("CARD_TRANSFER_ACCOUNT_HOLDER", { infer: true })?.trim();
    if (digits.length !== 16 || !holder) return null;
    return { destinationId: null, cardNumber: digits, cardNumberFormatted: formatCardNumber(digits), cardNumberMasked: maskCardNumber(digits), sheba: null, holderName: holder, bankName: null };
  }

  /** The account new card-to-card payments go to, or null when none is configured. */
  async current(): Promise<CompanyAccount | null> {
    const active = await this.prisma.cardTransferDestination.findFirst({ where: { active: true, status: CardTransferDestinationStatus.ACTIVE }, orderBy: { createdAt: "desc" } });
    if (active) return toCompanyAccount(active);
    const everActive = await this.prisma.cardTransferDestination.count({ where: { status: { in: EVER_ACTIVE_STATUSES } } });
    return everActive ? null : this.envAccount();
  }

  /** The account a given payment was started against (it may since have been replaced), else the current one. */
  async forPayment(destinationId: string | null): Promise<CompanyAccount | null> {
    if (destinationId) {
      const row = await this.prisma.cardTransferDestination.findUnique({ where: { id: destinationId } });
      // Only an account that really was live; a proposal's id can never stand behind a payment.
      if (row && EVER_ACTIVE_STATUSES.includes(row.status)) return toCompanyAccount(row);
    }
    return destinationId ? null : this.envAccount();
  }
}
