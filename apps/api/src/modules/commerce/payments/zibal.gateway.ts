import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PaymentProvider } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { ProviderCapabilities } from "@petlife/types";
import type { AppEnv } from "../../../config/env";
import { PROVIDER_CAPABILITIES } from "./payment-provider-registry";
import type { PaymentChargeInput, PaymentChargeResult, PaymentGateway, PaymentRefundInput, PaymentRefundResult, PaymentStatusResult } from "./payment-gateway.interface";
import { devSimulationAllowed } from "../../../common/dev/dev-simulation";
import { PaymentProviderUnavailableException } from "../../../common/errors/api-exception";

export interface ZibalRequestResult { trackId: string; redirectUrl: string; }
export interface ZibalVerifyResult { verified: boolean; trackId: string; failureCode?: string; failureMessage?: string; }

/**
 * Zibal's request/verify protocol. Network failure is deliberately surfaced
 * as an error to the caller: it leaves the local payment INITIATED/UNKNOWN,
 * never turns it into a successful order. Operations can reconcile it using
 * Zibal's dashboard and retry verify; the documented manual fallback is the
 * separate card-transfer rail.
 */
@Injectable()
export class ZibalGateway implements PaymentGateway {
  readonly provider = PaymentProvider.ZIBAL;
  readonly capabilities: ProviderCapabilities = PROVIDER_CAPABILITIES.ZIBAL;
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  private get sandbox() { return this.config.get("PAYMENT_SANDBOX_MODE", { infer: true }) !== "production"; }

  /** Zibal's sandbox answers "paid" for any track id: only usable where dev simulation is explicitly on. */
  private assertSandboxAllowed() {
    if (this.sandbox && !devSimulationAllowed(this.config)) throw new PaymentProviderUnavailableException({ provider: PaymentProvider.ZIBAL, reason: "SIMULATED_PAYMENTS_DISABLED" });
  }

  async request(amount: number, callbackUrl: string, reference: string): Promise<ZibalRequestResult> {
    this.assertSandboxAllowed();
    if (this.sandbox) {
      const trackId = `zibal_sandbox_${randomUUID()}`;
      return { trackId, redirectUrl: `https://gateway.zibal.ir/start/${trackId}` };
    }
    const response = await fetch(`${this.config.get("ZIBAL_API_BASE_URL", { infer: true })}/v1/request`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ merchant: this.config.get("ZIBAL_MERCHANT", { infer: true }), amount, callbackUrl, orderId: reference }),
    });
    if (!response.ok) throw new Error(`ZIBAL_REQUEST_HTTP_${response.status}`);
    const body = await response.json() as { result?: number; trackId?: string; message?: string };
    if (body.result !== 100 || !body.trackId) throw new Error(`ZIBAL_REQUEST_REJECTED:${body.message ?? body.result ?? "UNKNOWN"}`);
    return { trackId: body.trackId, redirectUrl: `https://gateway.zibal.ir/start/${body.trackId}` };
  }

  async verify(trackId: string): Promise<ZibalVerifyResult> {
    this.assertSandboxAllowed();
    if (this.sandbox) return { verified: true, trackId };
    const response = await fetch(`${this.config.get("ZIBAL_API_BASE_URL", { infer: true })}/v1/verify`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ merchant: this.config.get("ZIBAL_MERCHANT", { infer: true }), trackId }),
    });
    if (!response.ok) throw new Error(`ZIBAL_VERIFY_HTTP_${response.status}`);
    const body = await response.json() as { result?: number; message?: string };
    return body.result === 100 || body.result === 201
      ? { verified: true, trackId }
      : { verified: false, trackId, failureCode: `ZIBAL_${body.result ?? "UNKNOWN"}`, failureMessage: body.message };
  }

  // The generic interface remains usable by existing reconciliation code,
  // but new checkout code must use request()+verify() above.
  async charge(input: PaymentChargeInput): Promise<PaymentChargeResult> {
    const providerReference = `zibal_${randomUUID()}`;
    if (input.mode === "FAILURE") return { status: "FAILED", providerReference, failureCode: "ZIBAL_DECLINED" };
    return { status: "PENDING", providerReference };
  }
  async getStatus(providerReference: string): Promise<PaymentStatusResult> { return { status: "UNKNOWN", providerReference }; }
  async refund(_input: PaymentRefundInput): Promise<PaymentRefundResult> { return { status: "FAILED", failureMessage: "Zibal refund is reconciled manually; credit the customer wallet only after verification." }; }
  verifyWebhookSignature(_rawBody: unknown, _signatureHeader: string | undefined): boolean { return false; }
}
