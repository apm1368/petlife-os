# Localization rollout status

The public landing route is available in Persian, English, German and Spanish. Persian uses RTL; the other three use LTR. The German and Spanish landing copy includes the public navigation, service descriptions, partner entry, trust/privacy copy, footer and image-credit disclosures. The existing approved landing composition and source images are unchanged; the German and Spanish hero use the existing English-labelled artwork because the pavilion labels are baked into the image.

This is not full application localization. The account preference API and database support saving all four locales (fa/en/de/es). The shared member navigation (desktop, mobile and Explore sheet), Explore index and Account navigation now have explicit copy in all four locales; links retain the active locale. Registration, password login, phone/OTP login, forgot/reset password, auth-shell copy and household collaboration copy also have German/Spanish translations. Household copy covers members, invitations, pet permissions, access presets, confirmation actions and access history. Account dates use the selected locale (fa retains Jalali) and account counts use locale-specific number formatting. The DE/ES auth catalogs overlay the English catalog so unfinished message keys remain readable instead of raising missing-key errors. These page families have focused component tests. The landing and personal-settings locale selector/calendar explanation were already localized in all four languages.

The personal account settings page (`PersonalSettingsView`) now has German and Spanish copy for its display name, appearance, save/error/loading states, contact methods and OTP-based contact-change flow. This is a focused UI translation only: changing a contact still depends on the existing verification provider flow, and no SMS delivery is simulated. Other account settings pages and pet profile, health, booking, provider, seller, shop, admin, support and legal copy remain partially or mostly Persian/English only. German and Spanish message catalogs currently translate auth-specific branches; other keys fall back to English to avoid missing-key errors. Notification and trip-checklist copy also falls back to English for German and Spanish; German/Spanish SMS templates are not implemented and must not be simulated. Outside the components named above, do not present fallback text as a completed translation.

Next slices: remaining account settings; customer pet/health/care calendar; commerce and provider/seller workflows; support/legal; travel/community/partner; backoffice and notifications. Each slice must include locale-aware date/number formats where relevant, route-preserving language switching, accessibility, tests and a missing-key check before it is reported complete. Account language persistence remains covered by the existing #118 API/database implementation; this batch does not alter that contract.

## Full-page coverage matrix (2026-11-08)

“Complete” below means the application-owned interface in that page family—not user-entered or third-party content—has been translated and representative states were tested. It does not imply that every application route is localized.

| Page family / route scope | fa | en | de | es | Status and verification |
| --- | --- | --- | --- | --- | --- |
| Public landing | Complete | Complete | Complete | Complete | Existing locale copy and landing tests; hero artwork/composition unchanged. |
| Member dashboard (`/home`) | Complete | Complete | Complete | Complete | PR #153; cards, metrics, pet identities, health summaries, appointments, care items, actions and loading/empty/error/access states. Dashboard locale render tests. |
| Account overview (`/profile`) | Complete | Complete | Complete | Complete | PR #153; page copy, counts, summaries and states localized; dynamic account values remain user data. |
| Account activity (`/profile/activity`) | Complete | Complete | Complete | Complete | PR #153; event labels and timestamps localized; unknown event names use a localized generic label. |
| Account security (`/profile/security`) | Complete | Complete | Complete | Complete | This follow-up; methods, sessions, recovery, password form, errors, notices and confirmation dialogs. Representative de/es no-Persian and dialog tests. |
| Personal settings (`/profile/personal`) | Complete | Complete | Complete | Complete | Prior #119 implementation and tests; contact verification provider behavior is unchanged. |
| Remaining account, household, pet, health, commerce, booking, provider/clinical, support, travel, community, admin/backoffice and ERP pages | Partial / untranslated | Partial / untranslated | Partial / untranslated | Partial / untranslated | Not covered by the page slices above. Do not infer completeness from translated navigation or a translated header. Track each route and its loading, empty, error, dialog and access states as its own reviewable slice. |

User-generated and source content (pet names, device/user-agent labels, contact values, medical notes, product descriptions, messages and article bodies) is preserved as entered or received. It is not silently machine-translated. German/Spanish SMS templates and delivery are not implemented; no delivery is simulated. The security page uses a visible `[Missing …]` marker if a new German/Spanish key lacks a translation, and the page-level test rejects such markers and Persian-script UI in those locales.

### Account security follow-up

- `SecurityCenterView` now explicitly translates all application-owned static copy and status/action labels into fa/en/de/es, including loading/error, sign-in methods, recovery, devices, security activity, password guidance/errors, success notices and destructive confirmation dialogs.
- Activity event labels are localized; unrecognized event identifiers render a localized generic “Account event” label rather than exposing a raw internal identifier. Device labels, contact details and event timestamps remain actual account data, with locale-aware formatting.
- Tests cover de/es full-page rendering, absence of Persian UI and missing-key markers, confirmation-dialog content, and translated error states. The work is complete for `/profile/security` only after its own test and CI results pass; it is not a claim of whole-product localization.

## Account settings follow-up (PR #119)

- `PersonalSettingsView` has explicit German and Spanish translations for its user-facing settings, loading/error/success, appearance, contact verification status and contact-change/OTP steps. Tests assert translated labels and the unverified-contact state in both locales.
- Persian and English strings and behavior are unchanged. Locale selection continues to use the saved account preference and existing locale-aware route behavior; this slice changes no API, persistence, verification or notification contract.
- PR #118 has merged to `main`; this change has been replayed onto that merged base. The new head must pass fresh CI before it can merge. No production behavior is claimed from this PR yet.
- This follow-up only translates the personal settings page and updates this rollout note. It changes no API, persistence, verification or notification contract. The four-locale preference foundation is supplied by #118 on `main`.
