# Localization rollout status

The public landing route is available in Persian, English, German and Spanish. Persian uses RTL; the other three use LTR. The German and Spanish landing copy includes the public navigation, service descriptions, partner entry, trust/privacy copy, footer and image-credit disclosures. The existing approved landing composition and source images are unchanged; the German and Spanish hero use the existing English-labelled artwork because the pavilion labels are baked into the image.

This is not full application localization. The locale router and language selector accept all four route prefixes, but most signed-in, provider, seller, admin, support and legal page copy is still Persian/English only. German and Spanish message catalogs currently fall back to English to avoid missing-key failures, and account locale persistence remains limited to Persian/English. Do not market those page families as translated until each family has complete copy, formatting and RTL/LTR tests.

Next slices: account/auth and navigation; customer pet/health/booking; commerce and provider/seller workflows; support/legal; backoffice. Each slice must include date/number formats, route-preserving language switching, accessibility, tests and a missing-key check before it is reported complete.
