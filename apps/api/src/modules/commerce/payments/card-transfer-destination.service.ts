import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { CardTransferDestination } from "@prisma/client";
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

/**
 * Resolves the company card-to-card account. The owner's admin-managed destination wins; the server environment
 * (CARD_TRANSFER_ACCOUNT_NUMBER/HOLDER) is used only while no destination has ever been set in admin. Once the owner
 * manages it there, switching it off in admin really switches card-to-card off.
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
    const active = await this.prisma.cardTransferDestination.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } });
    if (active) return toCompanyAccount(active);
    const everSet = await this.prisma.cardTransferDestination.count();
    return everSet ? null : this.envAccount();
  }

  /** The account a given payment was started against (it may since have been replaced), else the current one. */
  async forPayment(destinationId: string | null): Promise<CompanyAccount | null> {
    if (destinationId) {
      const row = await this.prisma.cardTransferDestination.findUnique({ where: { id: destinationId } });
      if (row) return toCompanyAccount(row);
    }
    return destinationId ? null : this.envAccount();
  }
}
