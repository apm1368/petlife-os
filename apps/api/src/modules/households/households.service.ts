import { Injectable } from "@nestjs/common";
import { HouseholdRole } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException } from "../../common/errors/api-exception";
import { DomainEventsService } from "../../common/events/domain-events.service";
import type { CreateHouseholdDto } from "./dto/create-household.dto";
import type { UpdateHouseholdDto } from "./dto/update-household.dto";

@Injectable()
export class HouseholdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  async create(userId: string, dto: CreateHouseholdDto) {
    return this.prisma.$transaction(async (tx) => {
      const household = await tx.household.create({
        data: {
          ...dto,
          members: {
            create: { userId, role: HouseholdRole.OWNER },
          },
        },
      });

      await this.events.publish(
        "HouseholdCreated",
        { householdId: household.id, ownerId: userId },
        { tx, aggregateType: "Household", aggregateId: household.id },
      );
      return household;
    });
  }

  async getById(id: string) {
    const household = await this.prisma.household.findUnique({ where: { id } });
    if (!household) throw new NotFoundApiException("Household");
    return household;
  }

  async update(id: string, dto: UpdateHouseholdDto) {
    return this.prisma.household.update({ where: { id }, data: dto });
  }

  async listForUser(userId: string) {
    return this.prisma.household.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: "asc" },
    });
  }
}
