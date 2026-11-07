# Localization rollout status

The public landing route is available in Persian, English, German and Spanish. Persian uses RTL; the other three use LTR. The German and Spanish landing copy includes the public navigation, service descriptions, partner entry, trust/privacy copy, footer and image-credit disclosures. The existing approved landing composition and source images are unchanged; the German and Spanish hero use the existing English-labelled artwork because the pavilion labels are baked into the image.

This is not full application localization. The account preference API and database support fa/en/de/es. Shared member navigation, Explore/account navigation, authentication, household collaboration, landing and personal settings are localized in the covered surfaces. Persian is RTL/Jalali; en/de/es are LTR with locale-aware formatting.

## Personal settings (PR #119 — merged)

German and Spanish cover personal settings, appearance, contact methods, verification state and existing OTP flow. This UI-only change does not alter provider delivery.

## Travel localization (PR #152 — current)

Travel hub, trip creation/detail, readiness/passport, external stays, marketplace home/search, legacy trip editor and per-trip hub are localized across fa/en/de/es. Namespace parity: `travel` 93 keys, `externalTravel` 72, `travelMarketplace` 34, `rollout.trip` 9 and `travelHub` 74. Persian preserves Jalali dates and Persian digits; en/de/es use locale-aware Gregorian dates and numbers. API-supplied names, notes and activity content remain source data.

External prices/availability are source observations, not reservations; source listing links remain the final confirmation path. No partner data, price, availability, SMS delivery or booking is simulated. This translation does not establish a working Jajiga connector.

Remaining fallback: parts of travel browse/results/listing/booking, generic API errors and other internal page families. English fallback may remain there; German/Spanish SMS templates are unavailable. Continue responsive, RTL/LTR, accessibility and visual checks. This is not complete product localization.
