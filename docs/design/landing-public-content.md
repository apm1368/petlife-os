# Landing public content slice (PL-04/PL-05)

The localized landing already contains the approved park hero, product-area links, introduction,
partner invitation, and static explanatory sections. This slice adds a public-article section using
the existing anonymous-readable blog API and existing article card pattern.

The landing requests the first three published articles in the current locale, excluding the guides
category. It renders only API results, with explicit loading, empty, and retryable error states. It
does not fall back to sample cards when the API is empty or unavailable. The owner-approved hero
component and image sources are unchanged.

The public memorial slider from PL-05 is not implemented in this slice. The current pet-memory
contract is household-scoped and defaults to private; the public visibility bit alone is not the
owner-approved memorial publication/moderation workflow. That needs explicit memorial consent,
moderation state, and a public read contract before any real memorial can be listed. No private
memory data is read by the landing page.
