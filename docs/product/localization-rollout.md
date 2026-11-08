# Localization rollout status

The public landing route is available in Persian, English, German and Spanish. Persian uses RTL; the other three use LTR. The German and Spanish landing copy includes the public navigation, service descriptions, partner entry, trust/privacy copy, footer and image-credit disclosures. The existing approved landing composition and source images are unchanged; the German and Spanish hero use the existing English-labelled artwork because the pavilion labels are baked into the image.

This is not full application localization. The account preference API and database support saving all four locales (fa/en/de/es). The shared member navigation (desktop, mobile and Explore sheet), Explore index and Account navigation now have explicit copy in all four locales; links retain the active locale. Registration, password login, phone/OTP login, forgot/reset password, auth-shell copy and household collaboration copy also have German/Spanish translations. Household copy covers members, invitations, pet permissions, access presets, confirmation actions and access history. Account dates use the selected locale (fa retains Jalali) and account counts use locale-specific number formatting. The DE/ES auth catalogs overlay the English catalog so unfinished message keys remain readable instead of raising missing-key errors. These page families have focused component tests. The landing and personal-settings locale selector/calendar explanation were already localized in all four languages.

The personal account settings page (`PersonalSettingsView`) has German and Spanish copy for its display name, appearance, save/error/loading states, contact methods and OTP-based contact-change flow. This is a focused UI translation only: changing a contact still depends on the existing verification provider flow, and no SMS delivery is simulated. German and Spanish message catalogs currently translate auth-specific branches; other keys may still fall back to English where not yet covered. Notification and trip-checklist copy also falls back to English for German and Spanish; German/Spanish SMS templates are not implemented and must not be simulated. Outside the explicitly complete route rows below, do not present fallback text as a completed translation.

Next slices: remaining account settings; customer pet/health/care calendar; commerce and provider/seller workflows; support/legal; travel/community/partner; backoffice and notifications. Each slice must include locale-aware date/number formats where relevant, route-preserving language switching, accessibility, tests and a missing-key check before it is reported complete. Account language persistence remains covered by the existing #118 API/database implementation; this batch does not alter that contract.

## Route-family coverage matrix (updated 2026-11-08)

“Complete” applies to all application-owned strings and relevant loading, empty, error and dialog states in that route family. User-entered and third-party content remains unchanged; it is not automatically translated. A page is not counted complete because its navigation or header is translated.

| Route / page family | fa | en | de | es | Status and evidence |
| --- | --- | --- | --- | --- | --- |
| Public landing | Complete | Complete | Complete | Complete | Existing four-locale landing; preserve approved hero composition and image. |
| Shared member navigation, Explore index, account navigation | Complete | Complete | Complete | Complete | Route-locale-preserving navigation coverage and tests on main. |
| Authentication and household collaboration | Complete | Complete | Complete | Complete | Existing message catalog branches and focused tests. |
| `/profile/personal` | Complete | Complete | Complete | Complete | Prior PR #119; settings/contact flow UI translated, SMS delivery remains provider-dependent and is not simulated. |
| `/home` member dashboard | Complete | Complete | Complete | Complete | PR #153 open; dashboard body and key data cards/states tested. Current CI green; review/merge pending. Not live. |
| `/profile` account overview and `/profile/activity` | Complete | Complete | Complete | Complete | PR #153 open; complete page bodies and activity labels tested. Current CI green; review/merge pending. Not live. |
| `/profile/security` | Complete | Complete | Complete | Complete | PR #154 open; full page, dialogs, error state and no-Persian/missing-key tests. CI green; review pending. Not live. |
| `/profile/privacy` privacy center and consent-history expansion | Complete | Complete | Complete | Complete | This PR; consent, sharing, export, account deletion and confirmation steps; consent history empty/error states. Focused tests reject Persian UI and missing markers in de/es; CI/review pending. Not live. |
| Remaining account/household routes; pet profile, health/documents/care; shop/seller/cart/checkout; bookings/provider/clinical; support/travel/community; admin/backoffice/ERP | Partial / untranslated | Partial / untranslated | Partial / untranslated | Partial / untranslated | Not covered by the complete rows above. Related open PRs may cover selected slices; verify each exact head and all states before upgrading a route family. No whole-product localization claim. |

The privacy and security slices use explicit German/Spanish dictionaries with a visible `[Missing …]` marker rather than Persian UI fallback. Persian date formatting remains Jalali; other locales use locale-aware Gregorian formatting. `ConsentHistory` now has dedicated German and Spanish message branches. SMS/email delivery templates are not represented as implemented by these UI translations.

## Account settings follow-up (PR #119)

- `PersonalSettingsView` has explicit German and Spanish translations for its user-facing settings, loading/error/success, appearance, contact verification status and contact-change/OTP steps. Tests assert translated labels and the unverified-contact state in both locales.
- Persian and English strings and behavior are unchanged. Locale selection continues to use the saved account preference and existing locale-aware route behavior; this slice changes no API, persistence, verification or notification contract.
- PR #118 has merged to `main`; this change has been replayed onto that merged base. The new head must pass fresh CI before it can merge. No production behavior is claimed from this PR yet.
- This follow-up only translates the personal settings page and updates this rollout note. It changes no API, persistence, verification or notification contract. The four-locale preference foundation is supplied by #118 on `main`.
