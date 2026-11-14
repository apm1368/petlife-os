import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { isLiveDeployment } from "../../../common/http/deployment.util";
import type { AppEnv } from "../../../config/env";
import type { OtpPurpose } from "./otp-code-store";
import type { OtpProvider } from "./otp-provider.interface";

/**
 * Development-only OTP delivery: prints the code to the server log instead of sending an SMS/email.
 * OTP state (hash, attempts, cooldown) lives in OtpCodeStore, never here.
 */
@Injectable()
export class DevOtpProvider implements OtpProvider {
  private readonly logger = new Logger("DevOtpProvider");

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  async deliver(identifier: string, code: string, purpose: OtpPurpose): Promise<void> {
    // The code itself must never reach the log stream of a live deployment — anyone who can read those logs could
    // sign in as anyone. The canonical server runs NODE_ENV=development, so "live" is decided by the deploy
    // contract and the public https origin too (isLiveDeployment), not by NODE_ENV alone.
    if (isLiveDeployment(this.config)) {
      this.logger.warn(`[DEV OTP] the development OTP provider was invoked on a live deployment (purpose=${purpose}) — no code was logged or delivered. Configure OTP_PROVIDER=kavenegar or faraz.`);
      return;
    }
    const ttlSeconds = this.config.get("OTP_TTL_SECONDS", { infer: true });
    this.logger.log(`[DEV OTP] identifier=${identifier} code=${code} (expires in ${ttlSeconds}s, purpose=${purpose})`);
  }
}
