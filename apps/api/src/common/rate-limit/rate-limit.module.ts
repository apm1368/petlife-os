import { Global, Module } from "@nestjs/common";
import { IdentifierRateLimiter } from "./identifier-rate-limiter.service";

@Global()
@Module({
  providers: [IdentifierRateLimiter],
  exports: [IdentifierRateLimiter],
})
export class RateLimitModule {}
