import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PetAccessGuard } from "../../common/auth/pet-access.guard";
import { RequirePetAccess } from "../../common/auth/require-pet-access.decorator";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { VetShareService } from "./vet-share.service";
import { VetShareDto } from "./vet-share.dto";
@Controller("pets/:petId/vet-shares")
@UseGuards(SessionAuthGuard,PetAccessGuard)
export class VetShareController {
  constructor(private readonly service:VetShareService){}
  @Get("providers") @RequirePetAccess("canManageAccess") providers(){return this.service.providers();}
  @Get() @RequirePetAccess("canManageAccess") list(@Param("petId",ParseUUIDPipe) petId:string,@CurrentUser() user:SessionUser){return this.service.list(petId,user.id);}
  @Post("preview") @RequirePetAccess("canManageAccess") preview(@Param("petId",ParseUUIDPipe) petId:string,@CurrentUser() user:SessionUser,@Body() dto:VetShareDto){return this.service.preview(petId,user.id,dto);}
  @Post() @RequirePetAccess("canManageAccess") create(@Param("petId",ParseUUIDPipe) petId:string,@CurrentUser() user:SessionUser,@Body() dto:VetShareDto){return this.service.create(petId,user.id,dto);}
  @Post(":shareId/revoke") @RequirePetAccess("canManageAccess") revoke(@Param("petId",ParseUUIDPipe) petId:string,@Param("shareId",ParseUUIDPipe) id:string,@CurrentUser() user:SessionUser){return this.service.revoke(petId,id,user.id);}
}
@Controller("vet-shares/received")
@UseGuards(SessionAuthGuard)
export class VetShareInboxController {
  constructor(private readonly service:VetShareService){}
  @Get() list(@CurrentUser() user:SessionUser){return this.service.received(user.id);}
}
@Controller("shared-pets/:petId/vet-shares")
@UseGuards(SessionAuthGuard)
export class VetShareReadController {
  constructor(private readonly service:VetShareService){}
  @Get(":shareId") read(@Param("petId",ParseUUIDPipe) petId:string,@Param("shareId",ParseUUIDPipe) id:string,@CurrentUser() user:SessionUser){return this.service.read(petId,id,user.id);}
  @Get(":shareId/documents/:documentId/download") download(@Param("petId",ParseUUIDPipe) petId:string,@Param("shareId",ParseUUIDPipe) id:string,@Param("documentId",ParseUUIDPipe) documentId:string,@CurrentUser() user:SessionUser){return this.service.download(petId,id,documentId,user.id);}
}
