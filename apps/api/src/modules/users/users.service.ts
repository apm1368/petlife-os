import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import type { UpdateMeDto } from "./dto/update-me.dto";
import { toUserDto } from "./user.mapper";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundApiException("User");
    return toUserDto(user);
  }

  async update(id: string, dto: UpdateMeDto) {
    // A profile picture is shown to other members (community, chat, household, provider teams). There is no member
    // upload slot for it, so a member may keep or clear the current one but not point it at an outside address,
    // which would make other people's browsers fetch from a third party.
    if (dto.avatarUrl) {
      const current = await this.prisma.user.findUnique({ where: { id }, select: { avatarUrl: true } });
      if (dto.avatarUrl !== current?.avatarUrl) throw new ValidationApiException({ field: "avatarUrl", reason: "NOT_ISSUED_BY_THIS_SITE" });
    }
    return toUserDto(await this.prisma.user.update({ where: { id }, data: { ...dto, displayName: dto.displayName?.trim() } }));
  }
}
