import { Module } from "@nestjs/common";
import { SessionModule } from "../../common/session/session.module";
import { AccountController } from "./account.controller";
import { AccountService } from "./account.service";

@Module({
  imports: [SessionModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
