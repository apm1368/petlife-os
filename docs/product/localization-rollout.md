# Localization rollout status

The public landing route is available in Persian, English, German and Spanish. Persian uses RTL; the other three use LTR. The German and Spanish landing copy includes the public navigation, service descriptions, partner entry, trust/privacy copy, footer and image-credit disclosures. The existing approved landing composition and source images are unchanged; the German and Spanish hero use the existing English-labelled artwork because the pavilion labels are baked into the image.

This is not full application localization. The account preference API and database support saving all four locales (fa/en/de/es). The shared member navigation (desktop, mobile and Explore sheet), Explore index and Account navigation now have explicit copy in all four locales; links retain the active locale. Registration, password login, phone/OTP login, forgot/reset password, auth-shell copy and household collaboration copy also have German/Spanish translations. Household copy covers members, invitations, pet permissions, access presets, confirmation actions and access history. Account dates use the selected locale (fa retains Jalali) and account counts use locale-specific number formatting. The DE/ES auth catalogs overlay the English catalog so unfinished message keys remain readable instead of raising missing-key errors. These page families have focused component tests. The landing and personal-settings locale selector/calendar explanation were already localized in all four languages.

Account settings page bodies (outside the language/calendar copy), pet/health, booking, provider, seller, shop checkout/orders/repeat delivery/favorites, admin, support and legal copy remain partially or mostly Persian/English only. German and Spanish message catalogs translate auth, household, landing, personal settings, pet profile/care, and the shop discovery/cart branches documented below; other keys fall back to English to avoid missing-key errors. Notification and trip-checklist copy also falls back to English for German and Spanish; German/Spanish SMS templates are not implemented and must not be simulated. Outside the components named above, do not present fallback text as a completed translation.

### Shop discovery and cart (PR #146 — merged)

German and Spanish now have explicit copy for customer shop home, catalog search/results and filters, product details, compatibility guidance, cart, stock/rating labels, and shared commerce navigation/feedback. Shop-facing prices retain the Rial-to-Toman display conversion; only digit grouping follows fa/en/de/es locale. Persian stays RTL with Jalali behavior unchanged. Product titles, seller names, brands, catalog data and offer values remain server-provided data, not translated or fabricated.

PR #146 merged to main at `ea0f74a7` after hosted CI run 42489821177 passed on final head `f38e7f3f`. The six focused shop/currency suites passed 39 tests; typecheck and lint passed. Responsive browser inspection and production behavior are not verified. Checkout, order history/details, repeat-delivery management, favorites, seller onboarding/catalog/offer management, and commerce backoffice remain partial. German/Spanish SMS templates and delivery are not implemented.

German and Spanish message catalogs still use the documented English source catalog for untranslated keys. Such routes remain PARTIAL; SMS templates and delivery are not implemented and are not simulated.
## Personal settings (PR #119 — merged)

German and Spanish cover the personal settings page, including display name, appearance, contact methods, verification state and existing OTP flow. This UI-only change preserves the existing provider contract; it does not implement or simulate SMS delivery.
The personal account settings page (`PersonalSettingsView`) has German and Spanish copy for its display name, appearance, save/error/loading states, contact methods and OTP-based contact-change flow. This is a focused UI translation only: changing a contact still depends on the existing verification provider flow, and no SMS delivery is simulated. Pet profile shell, overview and identity editor also have German and Spanish copy. Pet health, documents, care calendar, memories, activity, travel and expenses page bodies, plus other account settings, booking, provider, seller, shop, admin, support and legal copy remain partially or mostly Persian/English only. German and Spanish message catalogs currently translate auth-specific branches; other keys may fall back to English to avoid missing-key errors. Notification and trip-checklist copy also falls back to English; German/Spanish SMS templates are not implemented and must not be simulated. Outside the components named above, do not present fallback text as a completed translation.

Next slices: customer health/documents/care calendar; commerce and provider/seller workflows; support/legal; travel/community/partner; backoffice and notifications. Each slice must include locale-aware date/number formats where relevant, route-preserving language switching, accessibility, tests and a missing-key check before it is reported complete. Account language persistence remains covered by the existing #118 API/database implementation; these UI-only slices do not alter that contract.

## Route/component coverage matrix (owner correction: full-page, not header-only)

Status is per page family, not per shared header. `COMPLETE` means all application-owned states in that page family were translated and tested. User-entered and third-party content remains original; it is not silently translated. A family marked `PARTIAL` must not be advertised as localized.

| Page family / representative routes | fa | en | de | es | States verified / outstanding |
|---|---|---|---|---|---|
| Public landing `/[locale]` | Complete | Complete | Complete | Complete | Main public sections and language-aware navigation; HERO composition/image unchanged. |
| Member dashboard `/[locale]/home` | Complete | Complete | Complete | Complete | Dashboard body, cards, empty/loading/failure states, access error, retry, event/status labels, locale dates/numbers and dashboard links tested. User-entered names/titles and provider/plan content are preserved; plan name is explicitly identified as English in de/es because the source has only fa/en fields. |
| Global navigation and account navigation | Complete | Complete | Complete | Complete | Desktop/mobile navigation tests exist; dashboard link locale remains in the current route. |
| Authentication and registration | Complete | Complete | Complete | Complete | Existing auth page tests cover translated copy; external SMS delivery/templates remain provider-dependent and are not claimed active. |
| Household membership and invitations | Complete | Complete | Complete | Complete | Existing household copy and focused tests cover members, invite, permissions, confirmations and history. |
| Personal account settings `/profile/settings/personal` | Complete | Complete | Complete | Complete | Existing #119 translation slice covers loading/save/contact/appearance states; verification delivery remains external. |
| Account overview `/[locale]/profile` | Complete | Complete | Complete | Complete | Overview, loading/failure recovery, session/invitation metrics, household summary and invitation request/decline/error copy tested. Invite text clearly says phone matching does not verify the phone and access begins only after owner approval. |
| Account activity `/[locale]/profile/activity` | Complete | Complete | Complete | Complete | Event names and summaries, filters, safe unknown-event fallback, empty/loading/error/retry and older-page control; locale-specific dates and numbers tested. Event detail values such as device names remain source content. |
| Account security `/[locale]/profile/security` | Complete | Complete | Complete | Complete | PR #154 merged to main after green CI; not production-verified. |
| Account privacy `/[locale]/profile/privacy` | Complete | Complete | Complete | Complete | PR #155 merged to main at `61f99041` after green CI and focused tests; not production-verified. |
| Other account settings and profile | Partial | Partial | Partial | Partial | Some settings are localized; route-by-route form/dialog/error coverage remains open. |
| Pet overview `/[locale]/pets/[petId]` and identity edit | Complete | Complete | Complete | Complete | PR #120 merged to main at `084ee787`; exact-head CI and 44 focused tests plus typecheck/lint passed. Deploy workflow succeeded; authenticated in-product flow has not yet been production-verified. |
| Health records, documents, care calendar, memories, activity and expenses | Partial | Partial | Partial | Partial | Linked page bodies/forms/states remain open; pet overview alone does not complete health/calendar pages. |
| Shop discovery, product detail and cart | Partial | Partial | Partial | Partial | PR #146 merged to main at `ea0f74a7` after green exact-head CI and 39 focused tests plus typecheck/lint. Responsive browser inspection and production behavior remain unverified; checkout, orders, repeat delivery, favorites, seller and commerce backoffice remain open. |
| Checkout/orders, seller and commerce backoffice | Partial | Partial | Partial | Partial | Page content, validation and transaction/operational states remain open; separate dependent PRs require retargeting after #146. |
| Bookings, provider and clinical | Partial | Partial | Partial | Partial | Dashboard event/date/status vocabulary is translated; booking/provider/clinical screens and dialogs are not yet fully audited. |
| Travel and accommodation | Partial | Partial | Partial | Partial | Dashboard links and trip summary labels are localized; marketplace/booking details and stale/error states remain open. |
| Community, shelter and animal support | Partial | Partial | Partial | Partial | Full feed, forms, moderation and empty/error states remain open. |
| Help Center, support and legal | Partial | Partial | Partial | Partial | Help/support workflow and published legal copy require separate verification; legal body content must remain authoritative, not machine-fabricated. |
| Admin, backoffice and ERP | Partial | Partial | Partial | Partial | Shared navigation is localized; tables, charts, permissions, operational dialogs and state copy remain open. |
| Admin audit `/[locale]/admin/audit` and shared admin shell | Partial | Partial | Partial | Partial | PR #156 merged to main at `b0ec95c4`; CI passed on its exact head. Audit labels, empty/loading/error/retry, role/access shell, navigation groups and links have 19 focused tests. Responsive inspection remains pending; other admin routes remain partial. |
| Notifications and message templates | Partial | Partial | Partial | Partial | PR #148 translates notification-center/preferences chrome, controls and timestamps; CI on synchronized head `29682ca8` is pending. Server-provided titles/bodies stay as supplied; backend errors and other surfaces remain partial. German/Spanish SMS templates and provider delivery are not implemented or simulated. |

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

## Pet profile follow-up (stacked after the account settings slice)

- `PetContextShell`, `PetProfileView`, `EditPetIdentity`, the shared birth-date field, pet identity formatting, overview labels and derived care-kind labels include German and Spanish copy. User-entered pet names, breeds, provider names and custom reminder titles are retained as data and are not machine-translated.
- Overview dates use locale-aware Gregorian formatting for en/de/es and preserve the Persian Jalali calendar for fa. Age, weight, species and lab-panel counts use locale-aware labels and number formatting. Persian and English strings remain intact.
- PR #120 merged to `main` at `084ee787` after current-head CI passed. The pet identity shell, overview and editor passed 44 focused tests plus typecheck and lint; the merged page is not production-verified. Health records, documents, care-calendar bodies, memories and activity remain untranslated.

## Shop discovery and cart (PR #146)

German and Spanish copy covers customer shop home, catalog search/results and filters, product details, compatibility guidance, cart, stock/rating labels, and shared commerce navigation/feedback. Prices retain the Rial-to-Toman display conversion; digit grouping is locale-aware. Product titles, seller names, brands and offer values remain server-provided data.


## Customer notification center and preferences (PR #148 — pending CI)

The notification-center chrome, category labels, empty/loading/retry actions, unread accessibility prefix, preference page, category/channel labels, required-category note, consent state, quiet-hours controls, save feedback and SMS channel-status copy have German and Spanish translations. Center timestamps use locale-aware formatting (`fa-IR` remains unchanged). Dynamic titles and bodies remain exactly as supplied by the server; this UI slice does not translate user/server content.

SMS sandbox remains explicitly labelled as not delivered. This work adds no SMS templates, provider configuration or send simulation; email and push channels remain absent. Backend error details and other notification pages may still fall back to English. Exact-head CI is pending after syncing with current main.
