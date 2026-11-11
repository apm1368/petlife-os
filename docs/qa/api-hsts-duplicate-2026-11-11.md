# API duplicate HSTS finding — 2026-11-11

## Reproduction

- Environment: production, anonymous read-only HTTPS `HEAD` to `/api/health/ready`.
- Deployed SHA at reproduction: `fa6367cf35ce5947ff749a79c09a67afcd1a73ce`.
- Observed two `Strict-Transport-Security` response fields: edge `max-age=31536000; includeSubDomains` and API Helmet `max-age=31536000`.
- The alternate `api.opetlife.ir` health URL redirects to the canonical site; production API usage documented in this repository is through `opetlife.ir/api`.

## Fix and verification

- The API now disables only Helmet's HSTS field because the canonical production edge already owns and emits HSTS. All other Helmet defaults remain enabled.
- A regression test exercises the shared API Helmet middleware with a trusted HTTPS-forwarded request and asserts HSTS is absent while nosniff, frame, CSP and referrer protections remain.
- This change is not live until exact-head CI, normal merge and deployment pass. After deployment, verify `/api/health/ready` returns exactly one HSTS field from the edge.

## Limitation

No production proxy/CDN configuration was changed. The direct origin is not exposed or independently inspected; if a separately supported public API origin is added, its HSTS responsibility must be verified there before relying on the canonical edge.
