import { Global, Module } from "@nestjs/common";
import { KavenegarSmsClient } from "./kavenegar-sms.client";

@Global()
@Module({ providers: [KavenegarSmsClient], exports: [KavenegarSmsClient] })
export class KavenegarSmsModule {}
