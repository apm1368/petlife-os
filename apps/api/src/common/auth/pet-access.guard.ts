import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PetAccessFlags } from "@petlife/types";
import { PrismaService } from "../prisma/prisma.service";
import { NotFoundApiException, PetAccessDeniedException } from "../errors/api-exception";
import { PET_ACCESS_KEY } from "./require-pet-access.decorator";
import type { AuthedRequest } from "./current-user.decorator";

/**
 * Every pet endpoint goes through this guard rather than ad-hoc checks in
 * controllers — it is the single place that can produce PET_ACCESS_DENIED,
 * which keeps authorization auditable and prevents IDOR.
 */
@Injectable()
export class PetAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const petId = String(request.params.petId ?? request.params.id ?? "");
    const user = request.user;
    if (!user || !petId) throw new PetAccessDeniedException();

    const pet = await this.prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) throw new NotFoundApiException("Pet");

    const access = await this.prisma.petAccess.findUnique({
      where: { petId_userId: { petId, userId: user.id } },
    });

    const now = new Date();
    const isActive =
      access && (!access.startsAt || access.startsAt <= now) && (!access.expiresAt || access.expiresAt > now);

    if (!isActive) throw new PetAccessDeniedException({ petId });

    const requiredFlag = this.reflector.get<keyof PetAccessFlags | undefined>(PET_ACCESS_KEY, context.getHandler());
    if (requiredFlag && !access[requiredFlag]) {
      throw new PetAccessDeniedException({ petId, requiredFlag });
    }

    (request as AuthedRequest & { pet?: typeof pet }).pet = pet;
    return true;
  }
}
