# PET LIFE OS sitemap

## Route audit

The App Router contains **153 source page routes**: 32 public, 59 consumer app, 12 provider, 12 seller, 31 admin, and 7 authentication routes. Dynamic paths are counted once. Locale expansion produces Persian and English URLs at runtime.

### Product route matrix

| Domain | Public routes | Private routes | Indexing policy |
| --- | --- | --- | --- |
| Home | `/` | `/home` | public landing indexable; dashboard excluded |
| Health & vet | `/vet/find`, `/vet/[providerId]` | `/pets/[id]/health/**`, `/provider/**` | provider discovery indexable; records excluded |
| Services | `/services`, `/services/[category]` | booking step, `/bookings/**` | hubs/details indexable; booking records excluded |
| Shop | `/shop`, `/shop/products`, `/shop/products/[id]` | `/cart`, `/checkout/**`, `/orders/**`, `/seller/**` | catalogue indexable; transaction/operations excluded |
| Places | `/places`, `/places/[placeId]` | `/places/favorites` | public detail indexable; favorites excluded |
| Insurance | `/insurance`, `/insurance/compare`, `/insurance/[productId]` | `/pets/[id]/insurance` | product discovery indexable; pet policy data excluded |
| Animal support | `/animal-support`, campaigns, needs, organization details | create/mine operations require auth | public listings indexable subject to safety moderation |
| Lost pets | `/lost-pets`, `/lost-pets/[incidentId]` | `/pets/[id]/lost/**` | approved public incidents indexable; owner tools excluded |
| Community | `/community`, `/community/posts/[postId]` | `/community/new` | approved posts indexable; authoring excluded |
| Guides | `/blog`, categories, tags, articles | `/admin/content/**` | published articles/taxonomies indexable; CMS excluded |
| Pet workspace | — | `/pets/**`, care, travel, memories | excluded |
| Account | — | notifications, subscription, support | excluded |
| Operations | — | `/admin/**`, `/provider/**`, `/seller/**` | excluded |
| Authentication | welcome/auth/register/recovery | session completion | excluded |

### Duplicate and orphan review

- `/shop` and `/shop/products` are both intentional: the first is the curated commerce hub; the second is the complete catalogue.
- `/pets/active?view=health|care` is a stable navigation resolver, while canonical records remain under `/pets/[id]`; it is not duplicate content.
- `/services/[category]/[serviceId]/book` and `/vet/[providerId]/book` are public route files with a private final action. They preserve `returnTo` when authentication is needed.
- `/animal-support/needs/new` and `/animal-support/needs/mine` live under the public route group for shell consistency but are private actions and must remain `noindex` and auth-gated.
- No route is deleted in this pass. The standalone public Travel and Memories hubs remain intentionally absent because their privacy and anonymous behavior are not defined.

## SEO XML sitemap policy

The generated XML sitemap should include only canonical localized URLs that return a public 200 response:

- landing, domain hubs, category pages, approved public detail pages, and published articles;
- one entry per supported locale with hreflang alternates;
- canonical product/provider/place/article identifiers or slugs;
- `lastmod` only from trustworthy persisted publish/update timestamps.

Exclude auth, account, household, pet record, checkout, booking, order, notification, support, admin, provider, seller, preview, draft, filtered query, and internal operation URLs. Exclude private action routes even when their file is located in the public route group. Robots rules and page metadata must agree with this matrix.
