import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { IsUUID } from "class-validator";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { CreateAddressDto } from "./dto/create-address.dto";
import { AddressesService } from "./addresses.service";

class ListAddressesDto {
  @IsUUID()
  householdId!: string;
}

@Controller("addresses")
@UseGuards(SessionAuthGuard)
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Post()
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateAddressDto) {
    return this.addressesService.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: SessionUser, @Query() query: ListAddressesDto) {
    return this.addressesService.listForHousehold(user.id, query.householdId);
  }
}
