# Static route inventory — 2026-11-10

[Machine-readable backlog](route-coverage-inventory-2026-11-10.json), source SHA `1a5b2c3b8d14615b18fdd613e6b0956d6fe9a31b`. **348 tracked page sources: 340 regular page templates, six intercepted navigation views and two parallel-slot pages. These are not 348 verified public URLs.** Locale parameters are distinguished from record/token parameters; no real identifiers are resolved.

This discovery matrix explicitly leaves functional/localization/responsive/theme/design/accessibility/security acceptance unknown. It does not overwrite or invalidate the existing narrower PASS evidence. Read the linked dated records first, perform change-impact analysis, then attach route/role/state evidence; don't repeat unchanged tests blindly or upgrade a source-presence result to PASS. A path-group role is a hint, not evidence that authorization exists or that `(public)` permits anonymous access to every action.

Each row retains its page source, route template (only for regular pages), family/group/slot hints, permission/API/action investigation backlog, four language fields, three viewport families, light/dark/simple coverage, evidence and exact next action. No user data, route parameter values, environment secrets or source bodies are collected.

## Reproduce and verify

```sh
PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s docs/qa/tools -p test_route_coverage_inventory.py -v
python docs/qa/tools/route-coverage-inventory.py --sha "$(git rev-parse HEAD)" --output /tmp/route-matrix.json
```

Eight unit contracts cover grouped routes, intercepted/parallel routes, catchalls, unknown acceptance, wrong SHA and dirty app-source refusal. The generator reads tracked files only and refuses to label dirty app sources with a clean SHA. CI now runs those small stdlib-only contracts before dependency installation; no new provider, database or parallel permission system.

## Priority mapping

- Release-critical auth/account, household/pet/health, cart/checkout/payment, clinic and backoffice: reuse isolated CI evidence where applicable, then extend controlled authenticated browser fixtures. Private production acceptance still requires authorized safe accounts.
- Public Help/legal/status/header/landing: fresh scoped #241 release evidence is recorded in [PR #242](https://github.com/apm1368/petlife-os/pull/242). Do not expand empty-state coverage into published/error-state or whole-page completeness.
- Support/community design #215/#217: CI green after current-base update, controlled visual/state acceptance outstanding. Existing HERO remains unchanged.
- External source rights, original memorial/CDN and finance/accounting decisions remain distinct blockers; this inventory does not connect providers or fabricate records.

No application/schema change, no production mutation and no new LIVE_VERIFIED claim from generating this file. The exact-source matrix is historical; regenerate for changed routes and reconcile evidence before subsequent releases.
