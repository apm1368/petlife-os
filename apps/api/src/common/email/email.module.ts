import { Module } from "@nestjs/common";
import { EmailGatewayService } from "./email-gateway.service";

/** Transactional email (Gmail App Password or any SMTP relay). Imported by notifications, auth and admin. */
@Module({ providers: [EmailGatewayService], exports: [EmailGatewayService] })
export class EmailModule {}
