# Approved PET LIFE frontend rollout

Owner approved the visual directions and authorized implementation on 2026-10-14. This is a staged delivery ledger, not a claim that the whole application has been redesigned.

## Delivery order and status

| Area | Existing implementation | Approved redesign status |
| --- | --- | --- |
| Member home, profile, health, care, memories, account | Existing APIs and screens | Glass shell + member home implemented on `codex/stab-member-glass`; verification in `../member-glass` |
| Shop home, product results, product detail | Existing catalog, facets, offers, stock and compatibility | Implemented in `codex/stab-shop-design`; pending verification/review publication |
| Cart, checkout, order confirmation | Existing cart; address/review/shipping/payment; multi-seller shipping | Implemented in `codex/stab-shop-design`; actual checkout states retained |
| Vet/clinic/service/taxi discovery and profiles | Existing discovery APIs, filters and provider details | Pending separate discovery PR |
| Reservations and booking details | Existing slot, date-range, transport and travel flows | Pending separate booking PR; never unify different booking semantics |
| Animal support classifieds and detail | Existing support needs/offers/donations | Pending separate support PR; temporary-home ads are not commercial nightly bookings |
| Blog, category/tag listings and article | Existing public content APIs and rich text | Pending separate content PR; related articles can use same-category API data |
| Contact | Authenticated support cases exist; no anonymous contact endpoint found | Pending contact frontend linked to existing sign-in/support flow; anonymous delivery is optional backend scope |
| Admin home | Existing permission-gated operational summary and queues | Pending admin content PR; protected AdminShell navigation changes go to Claude |
| Provider, seller, clinical and other existing features | Existing screens across the wider application | Included in coverage audit; not implicitly claimed visually redesigned |

The member frame remains glass through internal profile/health/care/memory/account navigation. Transactional service, booking and commerce destinations use their own approved opaque warm theme.

Fresh branches must start at the latest `origin/stabilization/wave-1`. PRs target that branch, Automatic checks are required. The owner waived separate QA sign-off for this release; only the owner/Claude merges. After merge, the next task starts from the updated main line. No direct pushes to mainline or `main`; deployment needs the owner's explicit approval.

## Coverage evidence

`ui-coverage-audit.json` inventories 289 route files and 704 exported service methods. Static consumers were found for 624 methods; 80 are flagged for manual review. These are method-level scan results, not a count of missing product features. Alias calls, replacement APIs, permissions and generic actions require manual verification before building new UI.

Read `CODEX-HANDOFF.md` for focused prompts. Do not create empty pages or enable controls against nonexistent APIs just to close the ledger. Do not change the deferred owner decisions for pet expenses/year-in-review.

## Backend endpoint audit (2026-10-15)

The follow-up inventory now starts at the actual Nest controller declarations, rather than only frontend wrappers. See [BACKEND-COVERAGE.md](BACKEND-COVERAGE.md) and `backend-ui-coverage.json` for endpoint → client → UI references, exact source lines and unresolved review candidates. A static match does not certify permissions, successful live requests or complete UX. Infrastructure/webhook endpoints are recorded but do not imply a public screen. Shop-specific verified contract gaps and a backend prompt are in `../shop-design/BACKEND-GAPS.fa.md`.

`route-design-status.json` tracks each inventoried route separately. Shared glass/commerce framing is explicitly distinguished from redesign of the inner feature forms; pending routes are not marked finished by a global theme change.
