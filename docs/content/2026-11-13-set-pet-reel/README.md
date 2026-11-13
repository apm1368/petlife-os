# Set Pet reel and landing copy (2026-11-13)

This is an owner request, routed by QA. A 90-second reel presents **Set Pet** (ست پت): matching custom-printed outfits for a person and their pet. It also includes landing-section copy and a draft guide article.

The reel and copy follow the owner's answers in issue #368 (comment of 2026-11-13 12:28 UTC; v2 scope in #374). QA holds Set Pet until it is reworked to those answers, and an "X8 setpet" agent owns it from here. The reel shows this flow:

1. **Garment, colour and size**
   - T-shirt, hoodie or sweatshirt (P6).
   - The site's six base colours (P12): white, black, heather grey, navy, cream and sage. The set in the reel is sage.
   - Sizes S–3XL.
2. **Photos and designs**
   - A running count with no maximum (P21).
3. **Placement on the T-shirt**
   - Zones: front centre, back and upper sleeves.
   - A flat front/back mockup with a Front/Back toggle. The 3D viewer (P31) waits on the owner's dependency OK (#374), so nothing says "3D".
4. **The pet's outfit and size**
   - What the size guide asks you to measure (neck, chest, back length), with no cm figures.
   - The size letter is tapped (P17). An "On the back" card shows the design on the back of the pet's outfit, because the pet print zone is the back only. The pets' fronts are plain.
5. **Approve the print proof**
   - Place the order, the print proof is ready, approve it, then pay (F5/F2).
   - There is no staff price quote: the price comes from a fixed table and shows as a range while building (F1/P35).

The end card carries the owner's CTA «ست خودت و پتت را بساز» (P2). The landing reel autoplays muted with a sound button (P3). Subtitles are burned in, and the hook reads silently from 0.1 s. No timing is promised, because the order flow is not live.

## What is where

**Landing copy:** `landing-copy.json`
- Shape: `{ locale: { setPet: { landing: { eyebrow, title, lede, line1–line4, cta, videoLabel, navLabel } } } }`.
- Lines 1–4 follow the owner's answers: garment types, no design limit, pet size letter with the guide, and a price range plus print proof before payment.
- X5 merged an earlier staff-quote version into #373. The owner of the landing section (X8) should take these lines.

**Reel copy:** `pipeline/media/setpet-copy.js`
- On-screen text for the hook, title card, five steps, reveal and end card, in six languages, plus the landing copy.
- The header comment maps each step to its #368 answer.
- Arabic and Persian are right-to-left. Persian uses Persian digits. Arabic uses Western digits and writes "Set Pet" and "opetlife" in Latin.

**Reel renderer:** `pipeline/media/setpet-reel.js`
- Same pipeline as the 2026-11-12 reel: original vector art, Chromium frames, and VP9 + Opus WebM through WebCodecs. No ffmpeg.
- Garment colours come from `apps/web/features/set-pet/set-pet-catalog.ts`.
- Nine scenes, each cut on a bar line of the 120 BPM track:

  | Time | Scene |
  |---|---|
  | 0–4 s | Hook |
  | 4–8 s | Title |
  | 8–18 s | Step 1 |
  | 18–30 s | Step 2 |
  | 30–46 s | Step 3 |
  | 46–60 s | Step 4 |
  | 60–70 s | Step 5 |
  | 70–80 s | Reveal |
  | 80–90 s | End card |

**Music:** "Happy Dance" by HoliznaCC0 (CC0 1.0), from 0:10. Its quiet break falls on step 5, and the reveal lands where the track builds back up. Licence: `MUSIC-LICENSE.md` in the 2026-11-12 batch.

**Article 33:** `articles/33/<locale>.md` and `plan-setpet.json`
- The draft Set Pet guide follows the same answers:
  - five steps
  - finding the pet's size with the guide
  - photos that print well (formats and the 50 MB limit)
  - FAQ: fixed-table price, payment after proof approval, free cancellation until printing starts, the human-only case for a pet that has passed away, and rejected designs
- It is imported **without `--publish`**, so it stays a draft. That registers the videos and posters as CMS media assets for the landing manifest. Publish it once `/set-pet` is live.
- X8 should check the facts against the shipped flow before publishing.

**Subtitles:** `subtitles/setpet-<locale>.srt`.

**Platform copy:** `PLATFORM-COPY.md`.

**Landing video manifest:** `set-pet-reel-manifest.json`
- Format: `{ locale: { video, poster, durationS, width, height } }`, with content-addressed CMS URLs `https://opetlife.ir/api/uploads/cms/media/bundle-<sha>.webm|.webp`.
- The hash is the first 32 hex characters of the file's sha256, so the URLs are known before the import and change only if a file changes. They return 200 once draft article 33 is imported.
- Sent to X8, who owns the Set Pet landing section (PR #388).

## Files on the server (not in git)

Server folder: `/root/opetlife-content-pipeline/batches/2026-11-13-set-pet-reel/deliverables/`
- `videos/`: 12 platform videos (6 languages × 9:16/16:9).
- `thumbnails/`: thumbnails.
- `subtitles/`: .srt files.

Renders: `/root/opetlife-content-pipeline/media/out/setpet/`.

## How to re-render

1. Run `pipeline/media/setpet-worker.sh`.
   - It renders one 10 s segment at a time through `lockrun.sh`.
   - It waits for the whole deploy pipeline and needs at least 2 GB free disk.
   - It assembles each language and format and keeps the segments (`KEEP_PARTS=1`), so a change to one scene only re-renders that scene's segments. Once every file is final, delete them with `rm -f out/setpet/parts/*.bin`.
2. Then run, in order:
   - `node setpet-stills.js`
   - `python3 attach-setpet.py`
   - `build_bundle.py --plan ../articles/plan-setpet.json --out bundle-setpet --ids 33 --locales fa,en,de,es,ar,nl`
   - the importer **without `--publish`**

## Review notes

- **Copy accuracy:** every claim maps to an owner decision in #368. Facts that could still change before launch:
  - the colour names
  - the 50 MB limit
  - the cancellation rule
  - the payment timing
- **No timing claims:** the 5-working-day production target (F4) is left out until the flow is live.
- **No health claims:** the measuring advice is general.
- **Third-party rights:** only your own photos and designs, or ones you may use, can be printed. Unsuitable designs are rejected with a reason (F9).
- **Original art:** no third-party brand assets. The only external asset is the CC0 track.
