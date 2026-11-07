# Localization rollout status

The public landing route is available in Persian, English, German and Spanish. Persian uses RTL; the other three use LTR. The German and Spanish landing copy includes the public navigation, service descriptions, partner entry, trust/privacy copy, footer and image-credit disclosures. The existing approved landing composition and source images are unchanged; the German and Spanish hero use the existing English-labelled artwork because the pavilion labels are baked into the image.

This is not full application localization. The account preference API and database support fa/en/de/es. Shared member navigation, Explore/account navigation, authentication, household collaboration, landing and personal settings are localized in the covered surfaces. Persian is RTL/Jalali; en/de/es are LTR with locale-aware formatting.

## Personal settings (PR #119 — merged)

German and Spanish cover personal settings, appearance, contact methods, verification state and existing OTP flow. This UI-only change does not alter provider delivery.

## Travel localization (PR #152 — current)

The core `travel` namespace has 93/93 keys in fa/en/de/es, including hub, trip creation/detail, readiness, passport, requirements and transitions. External stays have 72/72 keys, marketplace home/search has 34/34 keys, and the legacy trip editor has 9/9 keys. Persian keeps Jalali dates/digits; en/de/es use locale-aware dates/numbers.

External prices/availability are source observations, not reservations; source listing links remain the final confirmation path. No partner data, price, availability, SMS delivery or booking is simulated. This translation does not establish a working Jajiga connector.

Trip hub and remaining marketplace results/listings/booking are being finalized in this PR. Other internal page families remain incomplete; generic API errors and any unlisted keys may fall back to English. German/Spanish SMS templates are unavailable. Continue responsive, RTL/LTR, accessibility and visual checks by family.
