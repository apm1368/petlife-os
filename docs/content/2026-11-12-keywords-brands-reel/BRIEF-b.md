# Writing brief — batch B (articles 21–31): service keywords + brand guide

Read `articles/BRIEF.md` first: format, length, languages, medical safety, FAQ, scenes, alts — all of it applies.
This file only lists what is **different** for batch B, plus one row per article.

## What changes from BRIEF.md
- **Slugs and focus keywords** come from `articles/plan-b.json` (not plan.json). Front-matter `slug` must equal the plan slug for that locale; put the plan's `focus` value for that locale in `focusKeyword`.
- **Search intent is commercial/service**, not only informational. Each article must help the reader choose or use a service well, and send them to the opetlife page that serves it. These are the "money pages" the article supports:
  - Every article links **2–3 times** to its `targets` from plan-b.json (replace `{l}` with the locale, e.g. `/de/services/BOARDING`). One of those links sits in the first third of the article, one in the closing paragraph as a clear call to action (e.g. "Find a 24-hour vet near you on opetlife" → `/en/vet/find`). Keep query strings exactly as given.
  - Plus **3–5 links to other articles** in the same language: either batch-B articles (plan-b.json slugs) or the 20 published articles (plan.json slugs). Pick where it genuinely helps; suggestions per row below.
- **Honesty about the platform.** opetlife is a young platform: never claim numbers of vets/shops/products, discounts, delivery times, "24/7 support", guarantees, rankings or prices on opetlife. Describe what the reader can do there in plain terms ("search vets by city and see opening hours", "compare boarding providers"), nothing more.
- **No prices or amounts of money.** Prices in Iran change fast. Explain what the cost depends on instead.
- **No named Iranian businesses** (clinics, shops, insurers, competitors, apps). For brands, only article 31, and only as described in its row.
- **Health topics** (rows marked vetReview): add a `:::warning` with emergency signs, and one sentence near the end in plain words that this article is general information and not a substitute for an examination by a veterinarian. Mainstream consensus only (WSAVA/AAHA/AAFP-style); no drug names or doses.
- Persian: Iranian reality (apartments, Tehran traffic, summer heat, imported vs. domestic products, counterfeit/repacked imported food, power/water cuts are fine to mention briefly). Other languages: write for that country's searchers natively (metric units, international context); do not mention Iran unless it is natural (it usually isn't), and keep the opetlife CTA.
- `@@scenes` (motion video + infographic): 5 lines. Line 1 a hook question that contains the focus keyword or its core noun. Headings ≤ 30 chars, lines ≤ 80 chars.
- `coverAlt`: language-neutral cover — describe only characters and objects, never text, logos or brand names.

## Rows

### 21 — دامپزشکی شبانه‌روزی (vetReview)
- Secondary: دامپزشکی شبانه روزی تهران، نزدیک‌ترین دامپزشکی شبانه روزی، اورژانس دامپزشکی، دامپزشک آنلاین
- Real questions (fa autocomplete): «نزدیکترین دامپزشکی شبانه روزی به من»، «دامپزشک آنلاین رایگان»؛ also: which signs can't wait until morning, what to do on the way, what to bring, is a phone/online consult enough.
- Angle: a calm decision guide for the night-time emergency: (1) red-flag list → go now (2) call ahead script (3) safe transport (4) what to bring (pet's records, the packet/plant they ate, a photo of vomit/stool) (5) when an online/phone consult is enough and when it isn't (6) prepare before it happens: save the number of the nearest 24-hour clinic today. Not a symptom encyclopaedia.
- Targets: vet finder (main CTA), pet taxi (getting there). Article links: toxic-foods-for-dogs, cat-vomiting-causes, dog-diarrhea-causes, orphan-kitten-care, pet-taxi-guide.
- Suggested fa seoTitle: «دامپزشکی شبانه‌روزی: کی فوراً برویم و چه ببریم؟»

### 22 — پت شاپ آنلاین
- Secondary: پت شاپ اینترنتی، خرید غذای گربه، خرید لوازم سگ، خرید آنلاین غذای سگ و گربه
- Questions: how to tell original from fake/repacked food, expiry and batch, what to check on delivery, return conditions, heat during shipping, buying big bags vs. small, auto-repeat delivery.
- Angle: a buyer's checklist for ordering food, litter and gear online safely; what a trustworthy online pet shop shows (seller identity, batch/expiry, photos of the actual product, return policy); opening and storing a big bag; when to buy from a local shop or vet instead (prescription diets).
- Targets: /{l}/shop, food category. Article links: best-dry-cat-food, best-dry-dog-food, cat-litter-types, top-pet-food-and-gear-brands, homemade-dog-food.

### 23 — غذای خشک گربه (vetReview)
- Secondary: بهترین غذای خشک گربه، غذای خشک گربه عقیم شده، غذای خشک کیتن، غذای خشک گربه ایرانی یا خارجی، چقدر غذای خشک به گربه بدهیم، غذای خشک گربه خیابانی
- Questions (fa autocomplete): «چقدر غذای خشک به گربه بدهیم»، «بهترین غذای خشک گربه ایرانی / خارجی»، «بهترین غذای خشک گربه عقیم شده»، «غذای خشک گربه برای سگ ضرر دارد»، «غذای خشک برای گربه ضرر دارد».
- Angle: how to choose, not a brand ranking: life stage (kitten / adult / senior), neutered, indoor; reading the label (complete & balanced statement, named animal protein first, guaranteed analysis, feeding guide); portions by weight and body condition, not by the bag alone; water intake and mixing in wet food; switching over 7–10 days; street cats (a small amount of complete food beats bread or leftovers); why dog food is not for cats (taurine). Prescription/urinary/kidney diets only via the vet.
- Targets: cat food in the shop. Article links: top-pet-food-and-gear-brands, online-pet-shop-guide, cat-vomiting-causes, orphan-kitten-care, cat-spay-neuter-guide.

### 24 — غذای خشک سگ (vetReview)
- Secondary: بهترین غذای خشک سگ، غذای خشک سگ نژاد کوچک (پامر، شیتزو)، غذای خشک توله سگ، چقدر غذای خشک به سگ بدهیم، غذای خشک سگ عقیم شده
- Questions: «چقدر غذای خشک به سگ بدهیم»، «بهترین غذای خشک سگ ایرانی / خارجی»، «غذای خشک برای سگ خوبه؟»، «غذای خشک سگ برای گربه ضرر دارد».
- Angle: choose by life stage and size (small/medium/large; large-breed puppy growth), activity, neutered; label reading; portions and body-condition score; switching; grain-free claims — stay neutral and say to ask the vet before choosing a grain-free diet (reported DCM concerns are still being studied); storage of a big bag; treats ≤10% of daily calories.
- Targets: dog food in the shop. Article links: homemade-dog-food, toxic-foods-for-dogs, top-pet-food-and-gear-brands, online-pet-shop-guide, puppy-training-by-age.

### 25 — خاک گربه
- Secondary: بهترین خاک گربه، خاک گربه کربن دار، خاک گربه بدون گرد و غبار، خاک گربه چند وقت یکبار عوض شود، خاک گربه گیاهی
- Questions: «کدام خاک گربه بهتر است»، «خاک گربه چند وقت یکبار عوض شود»، «خاک گربه کربن دار چیست»، how deep, which for a kitten, smell.
- Angle: comparison table-like sections of the main types (clumping bentonite, with activated carbon, silica crystals, plant-based: wood/corn/tofu/paper) — clumping, dust, smell, weight, disposal, kittens; scooping daily and full change routine; how many boxes (cats + 1); when litter problems are medical (straining, blood, peeing outside the box → vet).
- Targets: cat accessories in the shop. Article links: cat-litter-training, cat-peeing-outside-litter-box, online-pet-shop-guide, best-dry-cat-food.

### 26 — پانسیون سگ و گربه
- Secondary: پانسیون سگ تهران، پانسیون گربه، هزینه پانسیون سگ، هتل حیوانات خانگی، نگهداری سگ در سفر، پت سیتر
- Questions (fa autocomplete): «هزینه پانسیون سگ»، «پانسیون گربه در منزل»؛ also: what vaccines are required, how to check a boarding place, boarding vs. a sitter at home, cats and stress.
- Angle: a visit checklist (space, cleanliness, separation of dogs and cats, ventilation/heat, staff at night, vet on call, vaccination proof required from all guests), questions to ask, a trial night, what to pack, what the cost depends on (no numbers), and alternatives: a pet sitter at home (often better for cats) or taking the pet along to a pet-friendly stay.
- Targets: boarding, sitting, travel. Article links: cat-vaccination-schedule, flea-tick-prevention, stop-dog-barking, pet-taxi-guide, choose-dog-trainer.

### 27 — آرایشگاه سگ
- Secondary: اصلاح موی سگ، اصلاح موی سگ در منزل، حمام سگ چند وقت یکبار، گرومینگ سگ، ناخن گرفتن سگ، آرایشگاه سگ در منزل (سیار)
- Questions: «حمام سگ چند وقت یکبار»، «اصلاح موی سگ در منزل»، «قیمت آرایشگاه سگ» (→ explain what the price depends on), should you shave a double-coated dog in summer (no — it protects from heat and sun; brush the undercoat instead).
- Angle: what a professional groomer does (bath, blow-dry, brushing/de-shedding, haircut, nails, ears, sanitary trim), how to pick a good one (no sedation without a vet, calm handling, clean tools, dryer heat), how often by coat type, what you can do at home between visits, signs of skin problems to show the vet.
- Targets: grooming services, grooming products. Article links: dog-itching-causes, flea-tick-prevention, basic-dog-commands, pet-boarding-guide.

### 28 — پت تاکسی (تاکسی حیوانات خانگی)
- Secondary: تاکسی حیوانات خانگی، حمل حیوانات خانگی، باکس حمل گربه، باکس حمل سگ، حمل سگ با ماشین
- Questions: what a pet taxi is and how it differs from a normal taxi, must a cat travel in a carrier (yes), motion sickness and stress, summer heat in a car (never leave a pet in a parked car), a night ride to the 24-hour vet.
- Angle: when a pet taxi makes sense (vet visits, grooming, boarding, airport, no car), what to ask before booking (carrier/crate, seat belt/harness, AC, cleaning between rides, can an owner ride along), how to get a cat used to its carrier, packing list, emergencies.
- Targets: pet taxi service, vet finder, travel. Article links: 24-hour-vet-guide, pet-boarding-guide, dog-grooming-guide, cat-vomiting-causes.

### 29 — مربی سگ
- Secondary: آموزش سگ، مربی سگ تهران، هزینه مربی سگ، آموزش سگ در منزل، کلاس آموزش توله سگ
- Questions: «مربی سگ رایگان» (→ what you can learn free vs. why a good trainer is worth it), «هزینه مربی سگ» (→ what it depends on), what "reward-based" means, group vs. private, from what age, how many sessions, board-and-train risks.
- Angle: 10 questions to ask a trainer before you pay; red flags (choke/prong/shock collars, "dominance" talk, guarantees, no owner involvement); what a good first session looks like; what to practise at home; when you need a vet or a behaviour specialist instead (sudden aggression, pain).
- Targets: training services. Article links: basic-dog-commands, puppy-training-by-age, puppy-biting, stop-dog-barking, dog-potty-training.

### 30 — بیمه حیوانات خانگی
- Secondary: بیمه سگ، بیمه گربه، بیمه سگ و گربه، بیمه درمانی سگ، بیمه حیوانات خانگی در ایران
- Questions (fa autocomplete): «بیمه حیوانات خانگی چیست»، «بیمه سگ در ایران»؛ also: what is usually covered, what is usually excluded, waiting periods, what the premium depends on, is it worth it.
- Angle: plain-language explainer of the usual building blocks (accident, illness, surgery/hospital, third-party liability for dogs, sometimes death/theft), usual exclusions (pre-existing conditions, routine vaccines/check-ups, breeding, cosmetic), waiting periods, deductibles/limits, reimbursement process (keep invoices and records), a checklist to compare policies, alternatives (a monthly savings pot for the pet). Never name insurers or state what a specific policy covers. Say plainly to read the policy wording.
- Targets: insurance, insurance compare, vet finder. Article links: 24-hour-vet-guide, cat-vaccination-schedule, toxic-foods-for-dogs, pet-zoonoses-health-risks.

### 31 — 10 leading world brands: dry pet food + pet gear (brand guide)
- Format: ONE guide (not 10 short articles). Title idea fa: «۱۰ برند معتبر جهانی غذای خشک و لوازم سگ و گربه (و کدام‌ها در ایران پیدا می‌شوند)». Focus keyword per plan-b.json.
- Structure: summary → how we chose (long history, international presence, publicly known company facts; not paid, no partnership) → `## ` section "Dry food brands" with one `### ` per brand → "Pet gear brands" with one `### ` per brand → "How to tell an original imported product" checklist (seller, batch/expiry, intact packaging, importer label in Persian for fa; for other languages: buy from authorised retailers) → FAQ → close.
- Per brand, 70–130 words (Persian), neutral facts only: country of origin, owner/parent company if well known, what it is known for (e.g. breed/size-specific lines, veterinary diets, retractable leads, chew toys), and one line "In Iran: …" (fa only; other languages skip Iran availability or keep one short sentence in a final note). No logos, no ratings, no "best", no health claims (no "prevents kidney disease"), no prices, no claims of partnership.
- Brand list and Iran-availability notes are in the agent prompt you received (QA may refine it). Only state facts you are confident about; if unsure of a founding year or owner, leave it out.
- Targets: shop, food category, accessories category. Article links: best-dry-cat-food, best-dry-dog-food, online-pet-shop-guide, cat-litter-types.
