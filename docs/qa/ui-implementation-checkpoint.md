# UI implementation checkpoint

Starting branch: codex/ci-vps-deploy; staging branch: integration/local.
Starting/deployed SHA before this batch: 180cf5838a9527689014bacc5fbe40c44386f8ef.

## Scope
149 of 154 routes in scope. 17 unique reference images, 33 supplied files. No route has final visual acceptance yet. See design-route-inventory.json for explicit unverified fields.

## First implementation increment
- Full-width workspace shell with desktop side navigation; preserve consumer and portal overview dashboards.
- Auth: flatter ivory composition, restrained form treatment, theme-aware form surfaces. Existing local photo reused; it differs from the reference photograph and requires further alignment.
- Password visibility in login/register/reset.
- OTP resend blocked during submission.
- Password recovery: network failure no longer displays false success.
- Onboarding: grouped progress and genuine retry without full reload.

## Verification
Web typecheck passed. 12 auth/onboarding/portal return tests and password recovery regression test passed. 11 shell tests passed in previous increment. Changed-file lint had only an unused import warning, removed. Local browser: Persian welcome, navigation to password form, visibility toggle verified. Other widths, English, authenticated operations and screenshot comparison remain unverified.

## Remaining
This is not batch-1 acceptance and not full-site completion. Complete reference comparison, responsive checks, auth states, shared components, and all subsequent batches. Do not mark routes accepted from source-only inspection.
