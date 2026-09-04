# Shop runtime recovery — 2026-09-04

Root cause: web was running on 3000 but API 4000 was stopped. Once PostgreSQL became reachable, API startup failed in LedgerService.onModuleInit because LedgerAccountCode lacked MARKETPLACE_RECEIVABLE. Nine existing migrations from notifications through H17 clinical health were pending.

Applied existing migrations with prisma migrate deploy against local 127.0.0.1:5432/petlife_os. No database reset, data deletion or seed rerun. Final migrate status: all 21 migrations applied. Restarted compiled API (PID 1248) on 4000; /health/live returns 200. Redis/PostgreSQL/MinIO were already reachable; no privileged Docker workaround or supplied password was used/stored.

Live verification:

- /fa/shop and /en/shop: five existing seeded products and four categories render, with prices.
- /fa/shop/products and /en/shop/products: five products render without loading error or login redirect.
- Clicked Royal Canin Adult Dog Food from the actual product list: detail renders variants, two verified sellers, prices and inventory quantities 30/50 without crashing.
- Anonymous HTTP requests without session cookies: product list returns five products; offers endpoint for the first real product returns one offer; unmatched search returns an empty array. CORS allows http://localhost:3000.
- Current browser is local-preview mode; HTTP anonymity is verified separately. Private-action auth and payment/checkout were not exercised.

This recovery changed runtime/database state, not frontend design. Previous 288 frontend tests and successful typecheck/lint/build belong to the synchronized code baseline and were not rerun for database-only recovery. Full visual QA, public non-shop paths, error recovery under deliberate service interruption, and checkout remain outside this verification.

If API is stopped later, run `pnpm --filter @petlife/api start` from the project with local infrastructure running. Running the web server alone is insufficient for catalog data.
