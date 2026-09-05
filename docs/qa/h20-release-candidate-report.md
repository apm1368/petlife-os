# H20 final sync and release-candidate QA

## Executive status

- Branch: `integration/local`
- Claude H20: `1ab38c2` is merged by `edee43a`.
- Codex visual batch: `be9255d` is preserved.
- Source page routes: 139 `page.tsx` files.
- Production build: passed with explicit local API origin; 155 generated route entries.
- Runtime recommendation: **NO-GO until local PostgreSQL is replaced/upgraded with PostGIS and the failed migration is recovered.**

## Runtime

PostgreSQL, Redis, MinIO, API and Web are reachable. `/health/live`, `/fa`, `/en`, `/fa/shop`, and `/en/shop` return 200. Anonymous catalog and H18 public APIs (`lost-pets`, animal support, community) return 200. Private admin API returns 401 without a session.

H18 migration `20260907000000_lost_pet_animal_support_community_memories` applied successfully. Migration `20260908000000_travel_insurance_pet_friendly_places` stopped at `CREATE EXTENSION postgis` because the active PostgreSQL server does not ship PostGIS. Prisma recorded the failed migration without rolling it back as resolved. The final notification-category migration remains pending. No reset or reseed was performed.

Consequences: insurance list/compare and places list render their recovery state in both locales; their APIs return 500 because the H19 tables do not exist. This is an infrastructure blocker rather than a frontend routing defect.

## Route and browser QA

Every static page route was requested in both locales: 152 requests total. 150 returned 200; `/fa/` and `/en/` returned the expected canonical 308 redirect. All 76 static route surfaces were then rendered in a browser in Persian and English (152 renders). The only repeated runtime failures were insurance, insurance comparison, and places, all explained by the PostGIS migration blocker. Dynamic routes exist in source and compile, but only product detail has a previously verified real database ID; other dynamic detail pages were not certified without valid records.

## Header, landing, footer

The primary navigation is centered inside one desktop header and collapses to an accessible sheet at tablet/mobile widths. The active state, compact locale control, icon theme cycle, focus labels and persisted theme behavior are present. Cookie appears as an image-only identity.

The landing world now includes cats, visibly different vet/shop/grooming/travel/support/training locations, a prominent photo-journal memories pavilion, mountains, varied houses, Milad Tower and Azadi Tower. It contains no written city name. Desktop and 360 px Persian renders were manually reviewed.

The compact footer includes Contact, FAQ, Privacy, trust, Instagram, Facebook, WhatsApp and Bale labels. They remain non-interactive because no verified destinations exist in repository configuration; fabricated links were not added.

## Access and behavior

Local preview intentionally permits viewing portal pages without login and blocks preview mutations. This is not evidence of production authorization. H20 API auth remains active: an anonymous admin request returned 401. Auth, portal returnTo, checkout gates, support privacy and RequireAuth behavior are covered by passing frontend tests. Full production-session login/logout and authenticated final mutations were not executed because no release test identity was supplied.

## Quality gates

- Frontend: 106 files, 328/328 tests passed.
- Workspace typecheck: 9/9 tasks passed after Prisma regeneration.
- Workspace lint: passed with four existing Next image optimization warnings in CMS/blog renderers.
- Workspace build: 4/4 tasks passed with explicit `NEXT_PUBLIC_API_ORIGIN=http://localhost:4000`.
- Backend e2e: not rerun against the partially migrated database; PostGIS recovery is required first.

## Changes after sync

Seller transaction pagination now deduplicates rows by transaction ID, eliminating unstable duplicate React keys on repeated pages.

## Remaining priority

P0: install/use PostgreSQL with PostGIS, recover the failed H19 migration through Prisma's documented migration procedure, apply the remaining migration, restart API, and rerun H19 routes plus backend e2e.

P1: none found in the header/landing/mobile surfaces reviewed.

P2/P3: footer destinations need verified product URLs; CMS/blog `<img>` warnings remain; dynamic pages without real record IDs need data-backed browser certification.

## Development gaps

- Admin branding controls for site name/logo variants were not found during this pass and remain a Claude development gap.
- No features or fake financial/product state were added to cover absent capabilities.
