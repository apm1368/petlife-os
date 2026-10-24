import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { IsUUID } from "class-validator";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { CreateAddressDto, UpdateAddressDto } from "./dto/create-address.dto";
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

  @Patch(":id")
  update(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateAddressDto) {
    return this.addressesService.update(user.id, id, dto);
  }
}
