# Admin capability contract and dashboard privacy

`GET /admin/me/capabilities` returns the shared `AdminCapabilitiesDto`: current role and permission names from the same server map used by protected routes. Anonymous requests get 401; non-admin or suspended memberships get 403. Role changes apply to the existing session immediately. The friendly `GET /admin/me` bootstrap contract remains unchanged.

Dashboard counters are now queried only when the caller has the corresponding permission: support.view, dispute.view, trust.view, finance.view, or task.manage. Other fields return null, not a fabricated zero. The web dashboard omits inaccessible cards even when stale data is supplied. This fixes cross-section count disclosure in the old all-admin summary.

No database migration or role grants are needed. This is the first W2-4 contract/security increment, **not completion of vertical-scoped roles**. CONTENT_ADMIN / SHOP_ADMIN / SERVICE_ADMIN / SUPPORT_AGENT and service-type row-level constraints remain separate follow-up work; existing role permissions are unchanged.

Tests cover anonymous/non-admin/suspended users, immediate role changes, actual HTTP counter disclosure, forbidden underlying queries, and hidden versus zero frontend counts.

## Scoped role management follow-up

`serviceScopes` is included in admin membership list/detail responses. `POST /admin/access/admins` and `POST /admin/access/admins/:id/role` accept it when assigning `SERVICE_ADMIN`; a non-empty set drawn only from CLINIC, GROOMING, ACCOMMODATION and INSURANCE is mandatory. `POST /admin/access/admins/:id/scopes` changes the scopes of an existing service administrator. Every change requires `admin.manage`, an audited reason, emits `AdminMembershipChanged`, and applies on the next request. Leaving SERVICE_ADMIN clears stale scopes. Other roles cannot carry service scopes.
