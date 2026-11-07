# Localization rollout status

The public landing route is available in Persian, English, German and Spanish. Persian uses RTL; the other three use LTR. The German and Spanish landing copy includes the public navigation, service descriptions, partner entry, trust/privacy copy, footer and image-credit disclosures. The existing approved landing composition and source images are unchanged; the German and Spanish hero use the existing English-labelled artwork because the pavilion labels are baked into the image.

This is not full application localization. The account preference API and database support saving fa/en/de/es. Shared member navigation, Explore and account navigation, authentication, household collaboration, and the landing are localized with route preservation. Persian is RTL/Jalali; en/de/es are LTR with locale-aware formatting.

## Personal settings (PR #119 — merged)

German and Spanish cover personal settings, appearance, contact methods, verification state and existing OTP flow. This UI-only change does not alter provider delivery.

## Travel localization (PR #152 — current)

Travel hub, trip creation, detail, readiness/passport, external stays, discovery/search results, and trip hub/editor surfaces are being localized into German and Spanish. The core `travel` and `externalTravel` namespaces have structural parity across fa/en/de/es. Persian keeps Jalali dates and digits; other locales use locale-aware dates/numbers.

External-stay prices and availability remain observations, not reservations; source listings remain the final confirmation path. No partner/provider data, price, availability, SMS delivery or booking is simulated. The Jajiga integration is not made production-ready by this translation work.

Still incomplete: other account pages; health records/documents/care calendar; checkout/orders/seller operations; provider console and booking details; support/admin/legal; community/backoffice; generic API errors and notification content. Fallbacks remain visible in those areas, and German/Spanish SMS templates are not implemented. Continue responsive, RTL/LTR, accessibility and visual checks by page family.
