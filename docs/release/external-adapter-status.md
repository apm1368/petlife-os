# External adapter release status

This matrix is the release source of truth. A UI or API must never present a
successful live operation for an adapter whose status is not `LIVE`.

| Integration | Release status | Blocking state | Production behavior |
| --- | --- | --- | --- |
| Google OAuth/OIDC | `NOT_CONFIGURED` | `BLOCKED_EXTERNAL` until credentials are supplied | Disabled; startup validates a deliberately enabled but incomplete configuration |
| OTP delivery | `NOT_IMPLEMENTED` | `BLOCKED_EXTERNAL` on a production SMS/email provider | Development codes only; codes are never logged in production |
| Faraz SMS | `NOT_IMPLEMENTED` | `BLOCKED_EXTERNAL` on official merchant access and implementation | Explicit permanent failure; never reports a fake send |
| Standard payment gateway | `NOT_CONFIGURED` | `BLOCKED_EXTERNAL` on merchant credentials and live network implementation | `SANDBOX` outside production; explicit failure in production |
| SnappPay | `NOT_IMPLEMENTED` | `BLOCKED_EXTERNAL` on merchant/API access | `SANDBOX` outside production; explicit decline in production |
| DigiPay | `NOT_IMPLEMENTED` | `BLOCKED_EXTERNAL` on merchant/API access | `SANDBOX` outside production; explicit decline in production |
| AloPeyk | `NOT_IMPLEMENTED` | `BLOCKED_EXTERNAL` on official API documentation and credentials | `SANDBOX` outside production; explicit unavailable result in production |
| SnappBox | `NOT_IMPLEMENTED` | `BLOCKED_EXTERNAL` on official API documentation and credentials | `SANDBOX` outside production; explicit unavailable result in production |
| Torob | `NOT_IMPLEMENTED` | `BLOCKED_EXTERNAL` on official seller API access | `SANDBOX` outside production; explicit rejected/failed result in production |
| Digikala | `NOT_IMPLEMENTED` | `BLOCKED_EXTERNAL` on official seller API access | `SANDBOX` outside production; explicit rejected/failed result in production |
| S3-compatible storage | `NOT_CONFIGURED` by default; `LIVE` with credentials | `BLOCKED_EXTERNAL` until bucket and credentials are supplied | Production refuses to boot with the local storage driver |

Definitions:

- `LIVE`: backed by a configured real provider and safe for production use.
- `SANDBOX`: deterministic simulation, labelled as sandbox, never represented as live.
- `NOT_CONFIGURED`: implementation exists but required environment/credentials are absent.
- `NOT_IMPLEMENTED`: no complete live network integration exists.
- `BLOCKED_EXTERNAL`: completion requires provider documentation, approval, account, or credentials outside this repository.

Promotion rule: only `LIVE` adapters may be enabled in production. `SANDBOX`
is valid in local/test/staging only. Every other state must fail closed or be
disabled, while the rest of PET LIFE OS remains operational.
