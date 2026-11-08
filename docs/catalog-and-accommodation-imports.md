# Catalog and accommodation imports

## Product catalog import

`/admin/commerce/catalog-imports` queues bounded Digikala imports. The admin supplies a source product/category URL and maps the destination to an existing PET LIFE category; optional brand mapping is an explicit admin choice. Requests are idempotent and persisted as jobs with progress, cancellation, retry/backoff, per-item results and restart recovery. A job is limited to 20 URLs, 10 pages and 100 products (the admin screen currently uses 5 pages/50 products).

The parser consumes only public Schema.org `Product` JSON-LD from HTML. It does not call Digikala's unofficial seller or internal APIs. It records product name, any explicitly supplied alternate name, brand/category text, description, structured specifications, canonical URL and gallery candidates. No machine translation is fabricated. Since the catalog decision C-03 requires exactly three images, import requires three validated images; insufficient media remains in `NEEDS_REVIEW` and does not create a catalog product.

Imported items create a `Product` with `DRAFT` status, exactly three repository-owned `ProductMedia` rows and no `ProductVariant`, seller offer, price, inventory, order, or transaction. Source image bytes are type/signature/size checked, fetched only from allow-listed Digikala hosts over the existing SSRF-safe fetcher, and copied to the existing storage driver. The source media URLs remain on the media/source observation for attribution; the image is not transformed, so any source watermark is preserved. Repeated source observations do not mutate the product. A changed source snapshot stays pending until an admin explicitly applies or rejects it with a reason and an audit record.

The source's live terms and detailed product-page layout were not established by this implementation pass. The one read-only request made was `GET https://www.digikala.com/robots.txt` on 2026-11-06; it disallows query-string URLs (`*?*`) and `/product/dkpi-*`. The importer fails closed for query URLs and honors robots rules on product/category pages and images. It does not retry access denials, 429s, disallowed paths, or private/unsafe URLs. No real product/category import was run, so no real Digikala payload compatibility or media reuse rights are claimed. The parser's evidence is its synthetic unit fixtures only.

## Selected accommodation source: Jajiga

The owner selected Jajiga as the accommodation source in PL-10 (`docs/decisions.md`), superseding the earlier open source choice in PL-03. Jajiga is the intended source and outbound destination; this selection does not establish that its listings are accessible, that it provides nationwide coverage, or that its content and images may be reused.

The following safe, read-only probes from 2026-11-06 are historical access evidence only:

| Source | Public access evidence | What it does not prove |
| --- | --- | --- |
| Jajiga | `robots.txt` returned 200, allows `/` except `/i/*`, tracking parameters, and declares a public sitemap index. The index returned 200 and listed main/search/rooms sitemap chunks. | The sitemap chunks were not crawled or counted, nationwide coverage was not measured, and no listing payload, pet policy, availability, or daily sync was tested. Content/image reuse rights were not established. |
| Jabama | `robots.txt` returned 200 with only `User-Agent: *` in the observed body; the conventional `/sitemap.xml` returned 410. The homepage returned 200 but exceeded the 1 MB probe cap. | This is retained only as historical comparison evidence; Jabama was not selected. No public listing count, nationwide coverage, pet-policy field or listing payload was confirmed. No bypass or deeper crawl was attempted. |

The source selection is settled; the integration is not. The existing `travel-external` module is the source-neutral boundary: it models sources, sync runs, snapshots, source-vs-admin overrides, pet-policy evidence, stale/removal states, outbound URL safety, pacing and operator alerts. The Jajiga adapter remains `PENDING_DISCOVERY` and currently has only a robots health check, not a listing parser. No Jajiga data import or destination link is enabled. Before describing the connector as operational, verify permitted listing access and content-use conditions, run a read-only field-mapping pilot, then implement and test the adapter and daily synchronization. Keep pricing and availability snapshots explicitly non-live and link to the exact Jajiga listing for final confirmation.

## Operational boundary

- The importer is admin-only (`commerce.view` to read, `commerce.manage` to queue/cancel/review).
- Rejected or blocked source access is surfaced as job/item error or an operator task after terminal job failure; no proxy, identity rotation, undocumented endpoint, or synthetic source result is used.
- Empty product categories and import queues remain genuinely empty. A no-result job is a failure/partial result, not a simulated success.
- Accommodation links remain original-source outbound links. No booking, payment, live availability or guaranteed pet acceptance is represented by these imports.
