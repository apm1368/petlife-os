import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PetAccessFlags } from "@petlife/types";
import { PrismaService } from "../prisma/prisma.service";
import { NotFoundApiException, PetAccessDeniedException } from "../errors/api-exception";
import { PetAccessService } from "../../modules/pet-access/pet-access.service";
import { PET_ACCESS_KEY } from "./require-pet-access.decorator";
import type { AuthedRequest } from "./current-user.decorator";

/**
 * Every pet endpoint goes through this guard rather than ad-hoc checks in
 * controllers — it is the single place that can produce PET_ACCESS_DENIED,
 * which keeps authorization auditable and prevents IDOR.
 *
 * Authorization is resolved as the union of every currently active,
 * non-revoked PetAccessGrant the user holds for this pet (see
 * PetAccessService.getEffectivePermissions) — never a single row, since a
 * user may simultaneously hold a standing household grant and a temporary
 * one (e.g. a vet visit).
 */
@Injectable()
export class PetAccessGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly petAccessService: PetAccessService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest & { body?: { petId?: string } }>();
    // Route params first (the common case); falls back to a body-carried petId
    // for create endpoints where the pet being acted on isn't part of the URL
    // (e.g. POST /booking-holds, POST /bookings).
    const petId = String(request.params.petId ?? request.params.id ?? request.body?.petId ?? "");
    const user = request.user;
    if (!user || !petId) throw new PetAccessDeniedException();

    const pet = await this.prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) throw new NotFoundApiException("Pet");

    const effective = await this.petAccessService.getEffectivePermissions(petId, user.id);
    if (!effective) throw new PetAccessDeniedException({ petId });

    const requiredFlag = this.reflector.get<keyof PetAccessFlags | undefined>(PET_ACCESS_KEY, context.getHandler());
    if (requiredFlag && !effective[requiredFlag]) {
      throw new PetAccessDeniedException({ petId, requiredFlag });
    }

    (request as AuthedRequest & { pet?: typeof pet; petAccess?: PetAccessFlags }).pet = pet;
    (request as AuthedRequest & { pet?: typeof pet; petAccess?: PetAccessFlags }).petAccess = effective;
    return true;
  }
}
