# Landing button revision

Owner selected the second displayed concept, the rectangular editorial direction. [Selected image](selected-option-2.webp). Existing palette, photos and navigation are preserved.

Primary actions use 6px corners, a directional arrow, a copper lower rule on hover and a visible focus outline. Secondary actions are unboxed underlined links. Arrows reverse with locale and respect reduced motion; touch targets remain at least 48px high.

Before: [Persian desktop](../landing-complete/signs-fa-1440.webp), [Persian mobile](../landing-complete/signs-fa-390.webp).
After: [Persian desktop](hero-fa-1440.webp), [Persian mobile](hero-fa-390.webp), [partner desktop](partners-fa-1440.webp), [partner mobile](partners-fa-390.webp).

طرح دوم انتخاب‌شده روی دکمه‌ها و لینک‌های لندینگ پیاده شد.
رنگ‌های فعلی، جهت فلش فارسی و انگلیسی و دسترسی با کیبورد حفظ شده‌اند.
تغییرات برای بررسی است؛ انتشار نیازمند CI و QA و تأیید مالک است.

PR and board #4 update remain pending GitHub API access. Existing repository-wide Prisma typecheck blocker remains; no merge or deployment performed.

## Hero interaction and reference correction

Pavilion icons brighten with a gentle pulse on hover and keyboard focus. One brief staggered entrance sequence runs when the hero becomes visible; it does not capture scrolling. Reduced-motion users receive a steady highlight. Mobile retains the eight service shortcuts below the image.

Both Persian and English park assets now show the rescued terrier beside Pedram with a short healed tail, visually approximating the owner's description (about 10cm); the golden dog's tail remains unchanged.

Validation: repository lint passed with five existing warnings; final changed-file lint and web typecheck passed; two landing suites / 16 tests passed after adding the pavilion component. Repository-wide Prisma typecheck and GitHub API/board access remain blocked as previously documented.
