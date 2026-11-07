# Localization rollout status

The public landing route is available in Persian, English, German and Spanish. Persian uses RTL; the other three use LTR. The German and Spanish landing copy includes the public navigation, service descriptions, partner entry, trust/privacy copy, footer and image-credit disclosures. The existing approved landing composition and source images are unchanged; the German and Spanish hero use the existing English-labelled artwork because the pavilion labels are baked into the image.

This is not full application localization. The account preference API and database support saving all four locales (fa/en/de/es). The shared member navigation (desktop, mobile and Explore sheet), Explore index and Account navigation now have explicit copy in all four locales; links retain the active locale. Registration, password login, phone/OTP login, forgot/reset password, auth-shell copy and household collaboration copy also have German/Spanish translations. Household copy covers members, invitations, pet permissions, access presets, confirmation actions and access history. Account dates use the selected locale (fa retains Jalali) and account counts use locale-specific number formatting. The DE/ES auth catalogs overlay the English catalog so unfinished message keys remain readable instead of raising missing-key errors. These page families have focused component tests. The landing and personal-settings locale selector/calendar explanation were already localized in all four languages.

## Personal settings (PR #119 — merged)

German and Spanish cover the personal settings page, including display name, appearance, contact methods, verification state and existing OTP flow. This UI-only change preserves the existing provider contract; it does not implement or simulate SMS delivery.

## Pet profile (PR #120 — current)

German and Spanish copy covers the pet identity shell, overview, identity editor, lifecycle/access labels, and derived care-kind labels. User-entered pet names, breeds, provider names and custom reminder titles remain source data. en/de/es use locale-aware dates and numbers; Persian keeps Jalali behavior. Health records, documents, care-calendar bodies, memories and activity remain untranslated in this slice.

## Shop discovery and cart (PR #146 — current)

German and Spanish copy covers customer shop home, catalog search/results and filters, product details, compatibility guidance, cart, stock/rating labels, and shared commerce navigation/feedback. Prices retain the Rial-to-Toman display conversion; digit grouping is locale-aware. Product titles, seller names, brands and offer values remain server-provided data.

Checkout, order history/details, repeat-delivery, favorites, seller operations and commerce backoffice remain fallback areas. German/Spanish SMS templates and delivery are not implemented.

Next slices: health/documents/care calendar; checkout and orders; seller operations; provider/booking; support/legal; travel/community/partner; backoffice and notifications. Preserve route switching, RTL/LTR, locale dates/numbers, accessibility and Jalali behavior; track fallbacks explicitly.
