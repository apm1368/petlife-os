# Writing brief — opetlife.ir article set (20 keywords × 4 languages)

opetlife.ir (Persian name «اپت‌لایف») is a Persian-first platform for people living with dogs and cats in Iran, with English, German and Spanish versions of the site. You are writing long-form, SEO- and AI-answer-ready articles for its magazine. Authorship is "opetlife editorial team" — never invent a named author, vet, clinic, study, statistic or quote.

## Inputs
- `keywords.json` (scratchpad root): one row per article id — Persian keyword, secondary keywords, real user questions, Persian SEO title/description suggestions and the angle that should beat current results.
- `articles/plan.json`: the per-locale slug of every article in the set (use it for the front-matter slug AND for internal links), tags, pillar.

## Output
For each of your article ids write four files: `articles/<id>/fa.md`, `en.md`, `de.md`, `es.md` in the format documented at the top of `tools/md2rich.py` (read it first). After writing each file run `python3 -I tools/md2rich.py articles/<id>/<locale>.md` (paths relative to the scratchpad) and fix it until it prints OK. Write Persian first, then the other three.

## Content rules
- **Answer first.** The first block is `:::summary` — 2–3 sentences that directly answer the main query and contain the focus keyword. AI answer engines quote this, so make it self-contained and factual.
- Then a short intro paragraph (keyword in the first 100 words), then `[[VIDEO]]`, then 5–8 `##` sections (with `###` where useful). Include at least one numbered step list, at least one bulleted checklist, a `:::warning` box (when to go to the vet urgently for health topics; the most harmful mistakes for training topics), `[[INFOGRAPHIC]]` inside the most practical section, a `## ` FAQ heading followed by one `:::faq` with 4–6 questions (use the keyword row's questions for Persian; natural equivalents in the other languages), and a short closing paragraph.
- **Length:** Persian 1,400–2,000 words; English/German/Spanish 1,100–1,600 words each (check the converter's word count).
- **Internal links:** 3–5 links to other articles of this set in the same language, written as `/<locale>/blog/<that article's slug for this locale from plan.json>`, placed where they genuinely help. Optionally one link to a site section where natural: `/<locale>/vet/find` (find a vet), `/<locale>/lost-pets`, `/<locale>/community`, `/<locale>/travel`. External links: at most 2, only to the home page of an authority you are sure exists (e.g. https://wsava.org/, https://catvets.com/, https://www.aspca.org/, https://www.who.int/) — never deep links you have not verified.
- **Medical safety:** mainstream veterinary consensus only (WSAVA/AAHA/AAFP style). No drug names with doses, no human medicines, no home remedies that can harm. Say plainly when something is an emergency. Note that vaccine schedules and products depend on the local vet and country.
- **SEO:** exact primary keyword in `seoTitle` (≤ 60 chars, keyword near the start, no brand name), in `seoDescription` (120–160 chars, written to earn the click), in the title, the summary, the first paragraph and one H2. Use the secondary keywords naturally; never stuff. Headings should read like the questions people search.
- **Languages:**
  - Persian: fluent, warm, modern standard Persian — not translated-sounding. Correct نیم‌فاصله (U+200C) everywhere it belongs (می‌شود، سگ‌ها، توله‌سگ، بچه‌گربه، دام‌پزشک is written دامپزشک). Persian digits (۰–۹) in Persian text. Context: Iranian homes and apartments, what is available in Iran.
  - English / German / Spanish: write natively for searchers in that language, not a literal translation. Choose that language's real equivalent of the primary keyword (put it in `focusKeyword`, e.g. "Hund stubenrein machen", "enseñar a un perro a hacer sus necesidades"), metric units, international context. German uses "du"; Spanish uses "tú" and neutral Spanish. Slugs come from plan.json, never your own.
- `coverAlt`: one plain sentence "Illustration: <who> <doing what> <with what>" describing a simple flat illustration that would fit (the illustrator will adjust it). `infographicAlt`: describe the infographic as "Infographic: <the scene headings in one sentence>" in the article's language.
- `@@scenes`: 5 lines `Heading | line` for a ~25-second motion graphic and a matching infographic: line 1 a hook question, lines 2–5 the key steps/tips, optional line 6 the key warning. Headings ≤ 30 characters, lines ≤ 80 characters, in the article's language. These are displayed as on-screen text, so they must be short, concrete and readable.
- `videoTitle` / `videoDescription`: in the article's language; the description is one sentence of what the video shows.

## Report back
A table per article id: locale, OK/FAIL from the converter, word count, focusKeyword. Plus any doubts about medical accuracy you could not resolve. Do not paste the articles.
