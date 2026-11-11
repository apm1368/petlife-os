# API duplicate HSTS finding — 2026-11-11

## Reproduction

- Environment: production, anonymous read-only HTTPS `HEAD` to `/api/health/ready`.
- Deployed SHA at reproduction: `fa6367cf35ce5947ff749a79c09a67afcd1a73ce`.
- Observed two `Strict-Transport-Security` response fields: edge `max-age=31536000; includeSubDomains` and API Helmet `max-age=31536000`.
- The alternate `api.opetlife.ir` health URL redirects to the canonical site; production API usage documented in this repository is through `opetlife.ir/api`.

## Fix and verification

- The API now disables only Helmet's HSTS field because the canonical production edge was observed emitting HSTS. All other Helmet defaults remain enabled.
- A regression test exercises the shared API Helmet middleware with a trusted HTTPS-forwarded request and asserts HSTS is absent while nosniff, frame, CSP and referrer protections remain.
- PR #249 head `1fedac7f3c44b5735b63af942db51f9d009b86c6` passed exact-head CI `43004365503`; normal merge commit is `c8de48c205797a192f8c72d803ac9604b47aedcc`. Deployment `43006047882` succeeded. At 2026-11-11 11:05 UTC, `/api/health/version` and `/api/health/ready` returned HTTP 200 and production SHA `c8de48c205797a192f8c72d803ac9604b47aedcc` (`github-43006047882-1`); DB and Redis were up. Read-only responses from `/api/health/version`, `/api/health/ready`, and `/api/shop/products` each exposed exactly one HSTS field (`max-age=31536000`) and retained CSP, referrer-policy, nosniff, and frame headers. The public shop still returned zero products.

## Limitation

No production proxy/CDN configuration was changed. The duplicate-field behavior is `LIVE_VERIFIED` as of `c8de48c…`, based on the deployed SHA, successful pipeline and read-only production response checks. The returned single HSTS value is now `max-age=31536000`; unlike the earlier observed edge value, it does not include `includeSubDomains`. A public response alone does not identify whether the single field came from the edge or application, and the direct origin/proxy configuration was not accessible. Confirm the intended HSTS scope with infrastructure configuration owners before asserting subdomain coverage or adding another API origin.
