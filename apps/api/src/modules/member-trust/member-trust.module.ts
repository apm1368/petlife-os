import { Module } from "@nestjs/common";
import { MemberTrustController } from "./member-trust.controller";
import { MemberAppealsService } from "./member-appeals.service";

/** The member side of Trust & Safety: decisions affecting me and my appeals. */
@Module({ controllers: [MemberTrustController], providers: [MemberAppealsService] })
export class MemberTrustModule {}
