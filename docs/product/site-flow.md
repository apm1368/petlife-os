# PET LIFE OS site flow

## Product loop

PET LIFE OS uses one continuous loop: **pet identity → current context → need → discovery or action → transaction or outcome → updated pet context**. The active pet stays visible when a signed-in user moves between health, services, commerce, travel, support, and memories. Public exploration never requires authentication. Authentication is requested only when an action writes private data, starts a booking or checkout, or opens a household record; the requested URL is retained in `returnTo`.

## Primary consumer journeys

1. **Discover care:** Explore → Health & vet or Services → filter by pet/location/need → provider profile → book → sign in if needed → confirmation → care calendar and pet timeline.
2. **Shop for a pet:** Shop → product → compatibility for active pet → cart → sign in if needed → checkout → order status → purchase recorded against the pet when applicable.
3. **Manage health:** Home → active pet → Health → medications, vaccinations, labs, imaging, documents, dental, nutrition, referrals, rehabilitation, observations, estimates, and discharge summaries → reminders/calendar.
4. **Prepare travel:** Explore → Travel (signed-in pet workspace) → trip → passport and requirements → linked medical records → readiness status.
5. **Find or support an animal:** Explore → Animal Support → campaigns, needs, organizations, or lost pets → public detail → authenticated contribution/report/management action.
6. **Keep memories:** Home → active pet → Memories → timeline → create or edit a memory. Public sharing is excluded until privacy and revocation behavior are explicit.
7. **Learn and participate:** Explore → Guides or Community → article/post detail → authenticated create/react actions.

## Surface responsibilities

| Surface | Purpose | Entry | Exit/outcome |
| --- | --- | --- | --- |
| Public | discovery, comparison, trust, education | landing, search, deep link | profile/detail, sign-in handoff, booking/cart |
| Consumer | household and pet operations | Home or preserved `returnTo` | updated record, booking, order, reminder, memory |
| Provider | clinical and service delivery | provider dashboard | visit, record, estimate, discharge, availability |
| Seller | catalogue, order and settlement operations | seller dashboard | fulfilled order, stock update, settlement |
| Admin | support, trust, content and financial control | admin dashboard | audited operational change |

## Cross-domain discovery

- The global Explore menu exposes domain hubs; it does not flatten every task into the header.
- Details can suggest adjacent actions only when context supports them: a vet can lead to booking, a product to cart, a place to services, a guide to a relevant hub.
- Search results may expose public titles, categories, availability summaries, prices, ratings, and public organization/provider profiles.
- Search must never expose medical records, household membership, private memories, access grants, messages, internal support notes, admin data, or provider clinical notes.
- Signed-in personalization uses the active pet as a filter and explanation, never as an invisible redirect.

## Authentication boundary

Public: landing, shop and product details, vet search and profiles, service discovery, places, insurance discovery, guides, community reading, campaigns, needs and organizations, and lost-pet public reports.

Private: pet and household records, health data, memories, care calendar, bookings, orders, checkout, cart persistence, notifications, support cases, travel records, authoring, provider, seller, and admin tools. Local preview can render private page shells without fabricated identity; writes and payments remain disabled.

## Research decisions

- Booking.com keeps broad travel domains visible while making search the action entry; PET LIFE uses the same separation between global domains and contextual search.
- Tripadvisor groups discovery by intent and interest, then relies on reviews and detail pages; PET LIFE groups Explore by a pet need and keeps trust signals near results.
- Rover starts from service type, location, dates, and pet fit, then moves through profile, contact/meet, booking, and payment. PET LIFE preserves this staged flow and pet context.
- Classified patterns support category-first discovery, but PET LIFE separates animal welfare and lost-pet safety from commerce.
- Editorial content is a discovery layer that links into product hubs; it is not a parallel product navigation tree.

Sources: [Booking.com](https://www.booking.com/), [Tripadvisor](https://www.tripadvisor.com/), [Rover services](https://support.rover.com/hc/en-us/articles/205979666-What-services-are-offered-on-Rover), [Rover discovery flow](https://www.rover.com/).

## Known ambiguity

The implementation has no standalone public Travel hub. Travel currently exists inside a selected pet at `/pets/[id]/travel`; the navigation therefore opens the active-pet workspace and does not invent anonymous itinerary behavior. Memories are also private until a public sharing policy exists.
