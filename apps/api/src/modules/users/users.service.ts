import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException } from "../../common/errors/api-exception";
import type { UpdateMeDto } from "./dto/update-me.dto";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundApiException("User");
    return user;
  }

  async update(id: string, dto: UpdateMeDto) {
    return this.prisma.user.update({ where: { id }, data: dto });
  }
}
