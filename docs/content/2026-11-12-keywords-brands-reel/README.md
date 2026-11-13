# Content batch 2026-11-12: keywords, brands, one-minute reel

Text sources for 12 blog articles in fa/en/de/es, published on opetlife.ir under `/{locale}/blog/{slug}` (slugs are in `plan-b.json`):

- 10 keyword guides (ids 21–30)
- a guide to 10 world pet food and gear brands (31)
- the hub article for the one-minute reel "10 searches of dog and cat owners" (32)

Text-free covers, infographics and motion clips are rendered from `pipeline/media` and stored only on the server and in the site's media storage. They are not in git.

- `brief.md`: keyword and brand research (Google Trends Iran plus autocomplete) and QA's brief. `BRIEF-base.md` and `BRIEF-b.md` are the writing briefs.
- `articles/<id>/<locale>.md`: article sources. Validate with `pipeline/tools/md2rich.py`.
- `pipeline/media`: original vector art (`art.js`, `scenes-b.js`), the renderer, the reel, and a WebCodecs encoder with a minimal WebM muxer (`encoder.js`, `webm.js`). These need no ffmpeg; output is VP9 + Opus.
- `PLATFORM-COPY.md`: titles, descriptions and hashtags for Instagram, YouTube Shorts and Aparat. `MUSIC-LICENSE.md` covers the reel's CC0 soundtrack, which is credited on /credits.
- Health topics (21, 23, 24) are general information and still need review by a veterinarian.

Server copy, with renders and the music source: `/root/opetlife-content-pipeline/batches/2026-11-12-keywords-brands-reel/`.
