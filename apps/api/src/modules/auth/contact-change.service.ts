import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { ContactUnavailableException, ContactUnchangedException } from "../../common/errors/api-exception";
import { toUserDto } from "../users/user.mapper";
import { classifyIdentifier } from "./identifier.util";
import { OtpService } from "./otp/otp.service";

/**
 * Batch 8 — changing the account email or phone. A new contact only takes
 * effect once a code sent to it is entered, so a verified contact is never
 * silently overwritten. Requesting a code never reveals whether the address
 * belongs to another account (that would let anyone probe for members); the
 * clash is only reported when the signed-in owner confirms with a valid code.
 */
@Injectable()
export class ContactChangeService {
  constructor(
    private readonly otp: OtpService,
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  async request(userId: string, kind: "email" | "phone", rawValue: string): Promise<{ ok: true }> {
    const value = this.normalize(kind, rawValue);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, phone: true, emailVerifiedAt: true, phoneVerifiedAt: true } });
    const current = kind === "email" ? user.email : user.phone;
    const verified = kind === "email" ? user.emailVerifiedAt : user.phoneVerifiedAt;
    if (current === value && verified) throw new ContactUnchangedException();
    // Same cooldown and hourly send budget as sign-in codes, and a code that only confirms this account's change.
    await this.otp.send(value, { purpose: "contact-change", userId });
    return { ok: true };
  }

  async confirm(userId: string, kind: "email" | "phone", rawValue: string, code: string) {
    const value = this.normalize(kind, rawValue);
    await this.otp.verify(value, code, { purpose: "contact-change", userId });
    const before = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, phone: true } });
    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: kind === "email" ? { email: value, emailVerifiedAt: new Date() } : { phone: value, phoneVerifiedAt: new Date() },
      });
      await this.events.publish(
        "ContactChanged",
        { userId, kind, hadPrevious: Boolean(kind === "email" ? before.email : before.phone) },
        { aggregateType: "User", aggregateId: userId },
      );
      return toUserDto(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ContactUnavailableException();
      throw error;
    }
  }

  private normalize(kind: "email" | "phone", raw: string): string {
    const { kind: detected, value } = classifyIdentifier(raw);
    if (detected !== kind) throw new ContactUnavailableException();
    return value;
  }
}
