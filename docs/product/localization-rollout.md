# Localization rollout status

The public landing route is available in Persian, English, German and Spanish. Persian uses RTL; the other three use LTR. The German and Spanish landing copy includes the public navigation, service descriptions, partner entry, trust/privacy copy, footer and image-credit disclosures. The existing approved landing composition and source images are unchanged; the German and Spanish hero use the existing English-labelled artwork because the pavilion labels are baked into the image.

This is not full application localization. Account language preferences persist fa/en/de/es. Explicit German/Spanish page-family slices have been merged for auth, account, pet identity/care, shop discovery/cart, customer support, notification center, provider discovery/profile and selected booking/travel surfaces. English fallback remains for keys and routes outside those reviewed slices, and those routes remain partial. Persian keeps RTL/Jalali; en/de/es use LTR and locale formatting where implemented. User-entered and third-party data stays in its authored language. German/Spanish SMS templates and delivery are unavailable and are not simulated.


Personal settings, account, pet identity/care, shop discovery/cart, customer support, notification center, provider discovery/profile and selected booking/travel screens have explicit translations for their scoped page families. Pet health records, documents, reminder agenda, memories, remaining account/profile, checkout/orders, seller, provider console, clinical, admin/ERP, community, legal and remaining travel pages are still partial. Untranslated route keys can fall back to English; they are not marked complete. No SMS provider templates or delivery are claimed.

## Personal settings (PR #119 — merged)

German and Spanish cover personal settings, appearance, contact methods, verification state and existing OTP flow. This is UI-only; it does not change provider or delivery contracts.

### Public service-provider discovery and profiles (PR #149 — current)

Discovery and public provider profiles have fa/en/de/es copy for search, categories, filters, sorting, verification, counts, prices, availability, empty/error states, favorites, map-unavailable notice, profile anchors, service and booking-mode labels, duration, provider/team roles, about/location/review/policy/FAQ chrome, loading states and booking-panel actions. Week availability dates use selected Gregorian locale for en/de/es and Persian Jalali for fa. Counts and prices use locale-aware formatting; route locale is preserved. Search, availability, favorites, booking links, ranking and APIs are unchanged.

The map remains unavailable until a real provider is connected. Provider-authored descriptions, FAQs, policy text, reviews, service names, staff names, city/address remain source data. Provider console, booking creation/rescheduling forms, and API-generated error details remain incomplete in German/Spanish. No fake providers, prices, ratings, availability or map results are introduced; SMS templates/delivery remain unavailable.

### Customer booking creation and calendar (PR #150 — synchronized, CI pending)

German and Spanish strings cover the multi-step booking flow, validation, date controls, review/confirmation and state feedback. Persian remains RTL with Jalali behavior; English/German/Spanish use LTR and locale-aware formatting. The branch includes merged #149. Focused booking and care regression tests pass (24 combined); exact-head hosted CI, responsive browser inspection and production verification are pending. Booking details/rescheduling and provider console remain partial; source-authored provider/pet text is unchanged and SMS delivery is not simulated.
Account settings page bodies (outside the language/calendar copy), pet/health, booking, provider, seller, shop checkout/orders/repeat delivery/favorites, admin, support and legal copy remain partially or mostly Persian/English only. German and Spanish message catalogs translate auth, household, landing, personal settings, pet profile/care, and the shop discovery/cart branches documented below; other keys fall back to English to avoid missing-key errors. Notification and trip-checklist copy also falls back to English for German and Spanish; German/Spanish SMS templates are not implemented and must not be simulated. Outside the components named above, do not present fallback text as a completed translation.

### Current localization slices


## Personal settings follow-up (PR #119 — merged)

- German and Spanish copy covers personal settings, appearance, contact methods, verification state, OTP flow and success/error/loading states. This changes no verification/provider contract; SMS delivery is not simulated.
- Exact-head CI passed on PR #119 before its merge to main at d12fb4ed.

### Customer support center and tickets (PR #147 — merged to main)

The support home, ticket lists, creation form, ticket detail/conversation controls, statuses, categories and linked-context labels have explicit German and Spanish copy. Conversation timestamps use locale-aware formatting (`fa-IR` remains unchanged; English/German/Spanish use their locale formats). User/staff-authored subjects, descriptions and message bodies remain source content and are not translated. Admin support tooling, legal/help articles, backend-generated error details, notifications and German/Spanish SMS templates remain outside this slice or may still fall back to English. No support, messaging or delivery business behavior changed.
### Shop discovery and cart (PR #146 — merged)

German and Spanish now have explicit copy for customer shop home, catalog search/results and filters, product details, compatibility guidance, cart, stock/rating labels, and shared commerce navigation/feedback. Shop-facing prices retain the Rial-to-Toman display conversion; only digit grouping follows fa/en/de/es locale. Persian stays RTL with Jalali behavior unchanged. Product titles, seller names, brands, catalog data and offer values remain server-provided data, not translated or fabricated.

PR #146 merged to main at `ea0f74a7` after hosted CI run 42489821177 passed on final head `f38e7f3f`. The six focused shop/currency suites passed 39 tests; typecheck and lint passed. Responsive browser inspection and production behavior are not verified. Checkout, order history/details, repeat-delivery management, favorites, seller onboarding/catalog/offer management, and commerce backoffice remain partial. German/Spanish SMS templates and delivery are not implemented.

German and Spanish message catalogs still use the documented English source catalog for untranslated keys. Such routes remain PARTIAL; SMS templates and delivery are not implemented and are not simulated.
## Personal settings (PR #119 — merged)

German and Spanish cover the personal settings page, including display name, appearance, contact methods, verification state and existing OTP flow. This UI-only change preserves the existing provider contract; it does not implement or simulate SMS delivery.
The personal account settings page (`PersonalSettingsView`) has German and Spanish copy for its display name, appearance, save/error/loading states, contact methods and OTP-based contact-change flow. This is a focused UI translation only: changing a contact still depends on the existing verification provider flow, and no SMS delivery is simulated. Pet profile shell, overview and identity editor also have German and Spanish copy. Pet health, documents, care calendar, memories, activity, travel and expenses page bodies, plus other account settings, booking, provider, seller, shop, admin, support and legal copy remain partially or mostly Persian/English only. German and Spanish message catalogs currently translate auth-specific branches; other keys may fall back to English to avoid missing-key errors. Notification and trip-checklist copy also falls back to English; German/Spanish SMS templates are not implemented and must not be simulated. Outside the components named above, do not present fallback text as a completed translation.


Next slices: customer health/documents and care reminder agenda; commerce and provider/seller workflows; support/legal; travel/community/partner; backoffice and notifications. Each slice must include locale-aware date/number formats where relevant, route-preserving language switching, accessibility, tests and a missing-key check before it is reported complete. Account language persistence remains covered by the existing #118 API/database implementation; these UI-only slices do not alter that contract.

## Route/component coverage matrix (owner correction: full-page, not header-only)

Status is per page family, not per shared header. `COMPLETE` means all application-owned states in that page family were translated and tested. User-entered and third-party content remains original; it is not silently translated. A family marked `PARTIAL` must not be advertised as localized.

| Page family / representative routes | fa | en | de | es | States verified / outstanding |
|---|---|---|---|---|---|
| Public landing `/[locale]` | Complete | Complete | Complete | Complete | Main public sections and language-aware navigation; HERO composition/image unchanged. |
| Member dashboard `/[locale]/home` | Complete | Complete | Complete | Complete | Dashboard body, cards, empty/loading/failure states, access error, retry, event/status labels, locale dates/numbers and dashboard links tested. User-entered names/titles and provider/plan content are preserved; plan name is explicitly identified as English in de/es because the source has only fa/en fields. |
| Global navigation and account navigation | Complete | Complete | Complete | Complete | Desktop/mobile navigation tests exist; dashboard link locale remains in the current route. |
| Authentication and registration | Complete | Complete | Complete | Complete | Existing auth page tests cover translated copy; external SMS delivery/templates remain provider-dependent and are not claimed active. |
| Household membership and invitations | Partial | Partial | Partial | Partial | PR #158 includes German/Spanish owner controls, invitation-request route and pet-access management; fresh hosted CI after syncing #149 is pending. Visual browser inspection and remaining household lifecycle states are still open. |
| Personal account settings `/profile/settings/personal` | Complete | Complete | Complete | Complete | Existing #119 translation slice covers loading/save/contact/appearance states; verification delivery remains external. |
| Account overview `/[locale]/profile` | Complete | Complete | Complete | Complete | Overview, loading/failure recovery, session/invitation metrics, household summary and invitation request/decline/error copy tested. Invite text clearly says phone matching does not verify the phone and access begins only after owner approval. |
| Account activity `/[locale]/profile/activity` | Complete | Complete | Complete | Complete | Event names and summaries, filters, safe unknown-event fallback, empty/loading/error/retry and older-page control; locale-specific dates and numbers tested. Event detail values such as device names remain source content. |
| Account security `/[locale]/profile/security` | Complete | Complete | Complete | Complete | PR #154 merged to main after green CI; not production-verified. |
| Account privacy `/[locale]/profile/privacy` | Complete | Complete | Complete | Complete | PR #155 merged to main at `61f99041` after green CI and focused tests; not production-verified. |
| Other account settings and profile | Partial | Partial | Partial | Partial | Some settings are localized; route-by-route form/dialog/error coverage remains open. |
| Pet overview `/[locale]/pets/[petId]` and identity edit | Complete | Complete | Complete | Complete | PR #120 merged to main at `084ee787`; exact-head CI and 44 focused tests plus typecheck/lint passed. Deploy workflow succeeded; authenticated in-product flow has not yet been production-verified. |
| Pet lifecycle `/[locale]/profile/household/pets/[petId]/lifecycle` | Partial | Partial | Partial | Partial | Lifecycle actions, confirmation dialog, load/save errors and retry now have fa/en/de/es copy; lifecycle status codes have German/Spanish labels. After synchronizing main through #150, 9 focused tests, typecheck and lint pass; fresh hosted CI and responsive browser inspection remain open. Other status domains and linked flows are not completed by this slice. |
| Care profile `/[locale]/pets/[petId]/care` | Partial | Partial | Partial | Partial | View/edit, read-only, empty/loading/load-error and save-error copy/tests cover all four locales (24 tests); responsive browser inspection is outstanding. |
| Care calendar `/[locale]/pets/[petId]/care/calendar` | Partial | Partial | Partial | Partial | Calendar controls, month/agenda view, pet/day selection, empty/loading/retryable-error states and event dates are translated; Persian Jalali behavior retained; 14 state/render tests pass. Fresh CI passed after sync; responsive browser inspection remains open. |
| Health records, documents, memories, activity and expenses | Partial | Partial | Partial | Partial | Medical record, documents, memory, activity and expenses page bodies/forms/states remain open. |
| Shop discovery, product detail and cart | Partial | Partial | Partial | Partial | PR #146 merged to main at `ea0f74a7` after green CI and 39 focused tests plus typecheck/lint. Responsive browser inspection and production behavior remain unverified, so this family is not marked complete. |
| Checkout/orders, seller and commerce backoffice | Partial | Partial | Partial | Partial | Page content, validation and transaction/operational states remain open; separate dependent PRs require retargeting after #146. |
| Customer support `/[locale]/support` and tickets | Partial | Partial | Partial | Partial | German/Spanish copy covers customer support home, list/create/detail, statuses, categories and linked-context labels; 18 focused support tests passed with typecheck/lint. PR #147 merged to main at `eb5c68ea` after exact-head CI passed; admin support/help/legal remain partial. |
| Provider discovery and profiles `/[locale]/services/search`, `/[locale]/services/[category]`, `/[locale]/providers/[providerId]` | Partial | Partial | Partial | Partial | PR #149 merged to main at `f64e794c`; provider console, booking forms and responsive browser inspection remain open. Map-unavailable state is honest. |
| Customer booking creation `/[locale]/bookings/new` | Partial | Partial | Partial | Partial | PR #150 merged to main at `85c91982` after exact-head CI and 24 focused booking/care tests passed. Booking details/rescheduling, API errors and provider console remain partial. |
| Bookings, provider and clinical | Partial | Partial | Partial | Partial | Dashboard event/date/status vocabulary is translated; booking details/rescheduling, provider console and clinical screens/dialogs remain partial. |
| Travel and accommodation | Partial | Partial | Partial | Partial | Dashboard links and trip summary labels are localized; marketplace/booking details and stale/error states remain open. |
| Community, shelter and animal support | Partial | Partial | Partial | Partial | Full feed, forms, moderation and empty/error states remain open. |
| Help Center, support and legal | Partial | Partial | Partial | Partial | Help/support workflow and published legal copy require separate verification; legal body content must remain authoritative, not machine-fabricated. |
| Admin, backoffice and ERP | Partial | Partial | Partial | Partial | Shared navigation is localized; tables, charts, permissions, operational dialogs and state copy remain open. |
| Admin audit `/[locale]/admin/audit` and shared admin shell | Partial | Partial | Partial | Partial | PR #156 merged to main at `b0ec95c4`; CI passed on its exact head. Audit labels, empty/loading/error/retry, role/access shell, navigation groups and links have 19 focused tests. Responsive inspection remains pending; other admin routes remain partial. |
| Notifications and message templates | Partial | Partial | Partial | Partial | PR #148 merged to main at `afefa932`; CI passed on exact head `615f6350`. Notification-center/preferences chrome, controls and timestamps are translated; server-provided titles/bodies stay unchanged. Backend errors and other surfaces remain partial. German/Spanish SMS templates and provider delivery are not implemented or simulated. |

### Dashboard batch on `codex/i18n-dashboard`

- `MemberHomeView` and `GlassMemberHome` now retain the selected route locale instead of coercing every non-English locale to Persian. All dashboard-owned copy, welcome/account area, dashboard navigation, care/health summaries, action labels, empty/error messages, and recovery controls have German and Spanish entries.
- Shared dashboard presentation helpers now localize system-derived care/event names, severity, species, pet age, date/number/currency display and common order/subscription statuses in fa/en/de/es. Persian remains RTL/Jalali; de/es use LTR and locale-specific Gregorian formatting.
- The shared retry/access error page (`SystemState`) now has German and Spanish copy for its supported states, preventing a Persian or English-only error page when the dashboard's primary request fails.
- Content boundary: pet names, owner-created reminder/memory titles, provider/city names and catalog-managed plan title remain source content. The plan model supplies only Persian/English names, so German/Spanish dashboard labels explicitly say the plan name is shown in English. No translated version is fabricated.
- Focused tests cover populated and empty dashboard states, locale-specific labels/date output, no known Persian UI fallback in de/es, shared error/retry copy, calendar date output and currency/status formatting. This is a dashboard slice only; it does not localize linked pages or mark those page families complete.

The same reviewable batch now includes the account overview route (`/[locale]/profile`): profile summary, security attention counts, household card/actions, invitation inbox, membership and activity links, loading/error/retry states, invitation errors, request confirmation, and phone-verification/owner-approval explanation are fully translated. Number grouping follows the selected locale. This does not mark the other account settings routes or the household management route complete.

Account activity (`/[locale]/profile/activity`) is also covered in this reviewable account slice: filter names, every known event title, method/consent summaries, empty/loading/error, pagination action and date display are translated in all four locales and exercised in German/Spanish rendering tests. Unknown event codes are shown as a localized generic event rather than the raw code. Device/browser descriptions are source values and remain unchanged.

### Account security and privacy follow-ups

- `/[locale]/profile/security` in PR #154 translates sign-in methods, recovery, sessions, security activity, password instructions/errors, success notices, confirmations, loading and error states in fa/en/de/es. It tests de/es page/dialog rendering and rejects Persian UI and missing-key markers. CI was green before merge; merged to main, not production-verified.
- `/[locale]/profile/privacy` in PR #155 translates consents, sharing, export, deletion impact/reauthentication, statuses and expandable consent history in fa/en/de/es. Tests cover full-page rendering, deletion dialog, consent history, loading/error/empty states and reject Persian UI/missing-key markers. Focused 11-test slice, combined 48-test account/dashboard slice, typecheck and lint passed; merged to main at `61f99041`, not production-verified.
- Source/user values (pet names, contacts, household labels, dates and consent version identifiers) remain unmodified. German/Spanish provider messages are not simulated.

### Audit rule

Before marking any additional route complete, record its route/component, all four locale catalogs, and tested loading/empty/error/offline/forbidden/dialog/success states. The dashboard result is not evidence that a linked pet, shop, booking, or admin page is localized. Missing DE/ES application strings must be added explicitly; English or Persian fallback is not a completion criterion. The presence of authored content in another language is a content-provenance question, not a translation key.
## Account settings follow-up (PR #119)

- `PersonalSettingsView` has explicit German and Spanish translations for its user-facing settings, loading/error/success, appearance, contact verification status and contact-change/OTP steps. Tests assert translated labels and the unverified-contact state in both locales.
- Persian and English strings and behavior are unchanged. Locale selection continues to use the saved account preference and existing locale-aware route behavior; this slice changes no API, persistence, verification or notification contract.
- PR #119 merged to `main` at `d12fb4ed`. Exact-head CI run 42476941501 passed; focused account tests passed locally. This UI-only slice changes no API, persistence, verification or notification contract.

## Pet lifecycle (localization slice)

- The pet lifecycle screen now has explicit German and Spanish copy for lost-pet guidance, deceased/memorial descriptions, confirmation dialog, optional note, loading, load retry and save failure. User-entered pet names and notes stay unchanged.
- The locale-bound status hook now respects fa/en/de/es. German and Spanish labels were added for all known lifecycle states; unknown codes remain explicitly localized as unknown rather than being shown as English/Persian UI.
- Focused status and route tests cover German lost-state presentation, Spanish memorial confirmation/save failure and localized retry. Responsive browser inspection remains open, so the route is PARTIAL. This does not translate lost-pet reporting or public memorial workflows.

## Pet profile follow-up

- `PetContextShell`, `PetProfileView`, `EditPetIdentity`, the shared birth-date field, pet identity formatting, overview labels and derived care-kind labels include German and Spanish copy. User-entered pet names, breeds, provider names and custom reminder titles are retained as data and are not machine-translated.
- Overview dates use locale-aware Gregorian formatting for en/de/es and preserve the Persian Jalali calendar for fa. Age, weight, species and lab-panel counts use locale-aware labels and number formatting. Persian and English strings remain intact.

## Shop discovery and cart (PR #146)
- Pet overview PR #120 merged to `main` at `084ee787`; its 44 focused tests, typecheck, lint and exact-head CI passed. Deployment status is being checked separately. Care-profile/calendar code is localized, with responsive browser inspection still required before completion.
- Health records, documents, memories, activity, travel and expenses remain partial, as do SMS templates and locale-specific delivery.

## Care profile and calendar (PR #157 — merged to main)

- Added German and Spanish translations for the care profile view and edit form, including field labels, read-only/empty/loading states, and common save/cancel actions. Existing Persian/English copy, authorization, persisted user-entered care notes and form behavior are unchanged.
- Added German and Spanish labels for the care calendar, month navigation, agenda/month controls, day selection, empty state and pet selector. Date/month/day labels use the selected locale, while the Persian calendar calculation remains unchanged; the care reminder agenda and medical record pages are not included.
- Focused care profile/calendar tests passed (38 tests across 2 files) on the final PR head; typecheck/lint and hosted CI passed. Responsive browser inspection remains open. PR #157 merged to main at `3a61edef`; it is not yet production-verified.

German and Spanish copy covers customer shop home, catalog search/results and filters, product details, compatibility guidance, cart, stock/rating labels, and shared commerce navigation/feedback. Prices retain the Rial-to-Toman display conversion; digit grouping is locale-aware. Product titles, seller names, brands and offer values remain server-provided data.
## Customer notification center and preferences (PR #148 — merged, production verification pending)

The notification-center chrome, category labels, empty/loading/retry actions, unread accessibility prefix, preference page, category/channel labels, required-category note, consent state, quiet-hours controls, save feedback and SMS channel-status copy have German and Spanish translations. Center timestamps use locale-aware formatting (`fa-IR` remains unchanged). Dynamic titles and bodies remain exactly as supplied by the server; this UI slice does not translate user/server content.

SMS sandbox remains explicitly labelled as not delivered. This work adds no SMS templates, provider configuration or send simulation; email and push channels remain absent. Backend error details and other notification pages may still fall back to English. Responsive browser inspection and production verification remain pending.

## Pet lifecycle (`/[locale]/profile/household/pets/[petId]/lifecycle`, PR #159)

Lifecycle actions, status labels, confirmation dialog, owner note, loading/retry and save-error content have German and Spanish copy; user-entered pet names/notes remain unchanged. After syncing with current main through #150 (`85c91982`), lifecycle/status tests pass (9 total), and web typecheck/lint pass. Hosted CI and responsive browser verification remain pending. This route remains PARTIAL; lost-pet reporting and public memorial workflows are not covered here.
