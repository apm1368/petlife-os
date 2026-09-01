import { Injectable } from "@nestjs/common";
import type { ProviderTeamMemberDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { ResolvedProviderContext } from "./auth/provider-context.types";

/** Read-only team roster (spec section 26) — no invitation/deactivation flow this phase; every row is implicitly "ACTIVE". */
@Injectable()
export class ProviderTeamService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: ResolvedProviderContext): Promise<ProviderTeamMemberDto[]> {
    const members = await this.prisma.providerUser.findMany({
      where: { providerOrganizationId: ctx.organizationId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });

    return members.map((m) => ({
      providerUserId: m.id,
      displayName: m.user.displayName,
      role: m.role as unknown as ProviderTeamMemberDto["role"],
      displayTitle: m.displayTitle,
      status: "ACTIVE",
      createdAt: m.createdAt.toISOString(),
    }));
  }
}
