import { Global, Module } from "@nestjs/common";
import { FarazSmsClient } from "./faraz-sms.client";

@Global()
@Module({ providers: [FarazSmsClient], exports: [FarazSmsClient] })
export class FarazSmsModule {}
