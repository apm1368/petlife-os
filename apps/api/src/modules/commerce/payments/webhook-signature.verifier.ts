/**
 * Signature-validation slot (spec section 41) — a real gateway integration
 * implements this against its own HMAC/signature scheme; DEV_SIMULATED has
 * no real secret to check (spec: "Do not create fake production secrets"),
 * so it always accepts. The interface's existence, not its dev
 * implementation, is what proves the architecture is ready for a real
 * provider later.
 */
export interface WebhookSignatureVerifier {
  verify(rawBody: unknown, signatureHeader: string | undefined): boolean;
}

export class DevWebhookSignatureVerifier implements WebhookSignatureVerifier {
  verify(_rawBody: unknown, _signatureHeader: string | undefined): boolean {
    return true;
  }
}
