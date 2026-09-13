# PET LIFE OS — LANDING IMPLEMENTATION PROMPT

## Interactive 100dvh Spatial Hero World — Cookie / Spitz Edition

Implement the PET LIFE OS public landing page based on the approved visual and interaction direction below.

IMPORTANT REFERENCE ASSET:

I will provide a real reference photo of my dog, Cookie.

Cookie is a Spitz dog.

The dog shown throughout the landing must visually match the provided Cookie reference photo as closely as possible.

Use the supplied Cookie photo as the visual identity reference for:

* face shape
* fur color
* fur pattern
* coat volume
* ears
* eyes
* muzzle
* body proportions
* tail
* overall appearance
* distinctive visual characteristics

Do NOT replace Cookie with a generic Spitz.

Do NOT invent another dog.

Do NOT use a random stock Spitz.

Whenever Cookie appears in the landing world, the character should look like the dog in the supplied reference image.

The reference photo defines Cookie's visual identity.

If the scene artwork is generated or illustrated, preserve Cookie's recognizable appearance while adapting it naturally into the approved premium cinematic 2.5D / 3D-like art direction.

---

# 1. CORE CONCEPT

PET LIFE OS is a Pet Life Operating System.

The landing should visually communicate:

Pet Identity
→ Context
→ Health
→ Care
→ Vet
→ Services
→ Shop
→ Travel
→ Animal Support
→ Memories

All of these exist inside one persistent spatial world.

The main character and emotional anchor of the entire landing is:

Cookie

Breed:

Spitz

Cookie is not a decorative mascot.

Cookie represents the persistent Pet Identity that the entire PET LIFE OS world understands.

The user should feel:

“I am entering Cookie's world.”

Not:

“I am browsing a list of PET LIFE features.”

---

# 2. ABSOLUTE INTERACTION RULE

Do not redesign the concept.

Do not turn this into a traditional scrolling website.

Do not create vertical page sections.

Do not build a slider.

Do not build a carousel.

Do not use Swiper.

Do not create an auto-rotating hero.

Do not create horizontal promotional slides.

Do not use pagination dots.

Do not create a generic SaaS landing page with floating feature cards.

The landing is ONE persistent interactive world.

---

# 3. PAGE ARCHITECTURE

The entire landing page must live inside one fixed viewport.

Required:

```css
html,
body,
#__next,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
}

body {
  overflow: hidden;
}
```

Main landing container:

```css
height: 100dvh;
overflow: hidden;
position: relative;
```

There must be NO normal document scrolling.

The browser scrollbar should not represent the narrative.

Instead:

Mouse Wheel / Trackpad
→ changes focus inside the world
→ moves the virtual camera

The page itself never moves vertically as a document.

---

# 4. REQUIRED LAYER ARCHITECTURE

Do not mix every movement into a single DOM transform.

Use this conceptual architecture:

```text
LandingRoot
├─ AmbientLayer
├─ CameraViewport
│  └─ CameraLayer
│     └─ ParallaxLayer
│        └─ World
├─ ContextEffectsLayer
└─ UIOverlay
```

Each layer has a different responsibility.

---

# 5. AMBIENT LAYER

AmbientLayer contains independent environmental animation.

Examples:

* tree leaves moving gently
* grass movement
* pond shimmer
* water ripple
* soft moving clouds
* occasional birds
* subtle people movement
* subtle pet movement
* distant traffic
* Pet Taxi movement
* gentle changes in natural light

Ambient animation must NOT be directly tied to scroll progress.

The world should feel alive even when the user is not interacting.

However, do not animate everything simultaneously.

At any moment, approximately 20–30% of the environment may contain subtle motion.

Avoid visual noise.

---

# 6. CAMERA LAYER

CameraLayer controls narrative movement through the world.

Maintain:

```ts
worldProgress: number // 0 → 1
```

Camera can control:

* translateX
* translateY
* scale
* optional subtle depth shift

Avoid aggressive camera rotation.

Avoid game-like orbit controls.

The result should feel cinematic and directed.

---

# 7. PARALLAX LAYER

Pointer movement may create restrained depth.

Example:

```ts
pointerX: -1 → 1
pointerY: -1 → 1
```

Recommended maximum movement:

```text
foreground: 8–16px
midground: 4–8px
background: 2–4px
```

This is atmosphere, not a gameplay mechanic.

Never allow strong mouse-driven camera movement.

Disable pointer parallax for:

* touch devices
* reduced-motion mode
* appropriate low-power situations

---

# 8. CONTEXT EFFECTS LAYER

This layer communicates PET LIFE intelligence.

Examples:

* subtle contextual light path
* softly illuminated destination
* temporary environmental emphasis
* restrained violet AI connection
* focus transitions

Example:

Cookie
→ Vaccination Context
→ Vet

A restrained light path can visually connect Cookie with the Vet clinic.

AI is NOT a building.

AI is NOT a robot character.

AI is NOT a glowing orb.

AI is NOT a giant floating icon.

AI is the invisible intelligence layer orchestrating Cookie's world.

---

# 9. UI OVERLAY

UIOverlay remains visually stable above the spatial scene.

It may contain:

* PET LIFE logo / identity
* public navigation
* Persian / English switch
* Light / Dark / System theme switch where appropriate
* headline
* short contextual copy
* CTA
* current Cookie identity
* contextual destination label
* accessibility controls where required

Do not cover the world with UI.

The world remains the hero.

---

# 10. COOKIE — VISUAL IDENTITY RULE

Cookie is the primary pet and protagonist.

Cookie is a Spitz.

A reference image of Cookie will be supplied separately.

Treat that image as the source of truth for Cookie's appearance.

Every representation of Cookie should preserve identifiable traits from the reference image.

Especially preserve:

* Cookie's real fur color
* face
* eyes
* muzzle
* ear shape
* coat density
* chest fur
* tail shape
* proportions
* any distinctive markings visible in the supplied photograph

Do not assume all Spitz dogs look the same.

Do not turn Cookie into an exaggerated cartoon.

Do not create a puppy if Cookie does not look like a puppy in the supplied photo.

Do not recolor Cookie for visual convenience.

Do not simplify Cookie into a generic white/orange Spitz unless that actually matches the supplied photo.

Cookie's image reference has priority over generic breed assumptions.

---

# 11. WORLD VISUAL CONTENT

The landing world should feel like a premium living Pet Park / Pet City designed around Cookie's life.

The environment can contain dogs and cats naturally, but Cookie remains the main pet identity.

Required spaces within the SAME physical world:

* central landscaped park
* natural walking paths
* mature trees
* grass and vegetation
* pond / water feature
* Cookie
* Cookie's human companion where compositionally useful
* other subtle pets and people
* dog walker / care context
* veterinary clinic
* pet shop
* grooming studio
* training area
* sitter / daily care context
* boarding / pet hotel
* pharmacy
* pet-friendly cafe / lifestyle place
* road
* moving Pet Taxi
* travel / Pet Passport area
* shelter / Animal Support area
* memories / emotional life environment

Do not make these locations look like isolated feature buttons.

They must appear as believable places inside one sophisticated environment.

---

# 12. LANDING ART DIRECTION

Target:

premium
cinematic
editorial
warm
alive
spatial
high-end
sophisticated
2.5D / 3D-like
campaign-quality

The world should feel closer to premium campaign artwork than a product sitemap.

Increase:

* visual realism
* cinematic depth
* natural landscaping
* architectural sophistication
* realistic material treatment
* soft natural shadows
* atmospheric perspective
* foreground / midground / background separation
* believable scale
* human and pet activity
* depth haze
* restrained depth of field
* warm environmental storytelling

Avoid:

* isometric game map
* theme park map
* amusement park layout
* toy buildings
* childish world
* cheap low-poly game aesthetic
* generic flat vectors
* feature icons disguised as buildings
* CSS primitive architecture
* neon
* cyberpunk
* crypto aesthetic
* excessive gradient backgrounds
* generic paw decorations

The user should feel:

“I am entering Cookie's world.”

Not:

“I am looking at a map of product features.”

---

# 13. LANDING NARRATIVE CAMERA STATES

Everything happens in ONE persistent world.

Required narrative states:

```text
0. Overview
1. Cookie
2. Health
3. Vet
4. Care / Walker
5. Shop
6. Grooming / Lifestyle
7. Taxi / Mobility
8. Travel
9. Animal Support
10. Memories / Life
11. Reconnect / Overview
```

These are not slides.

These are not sections.

These are semantic camera destinations.

The physical environment remains present during the entire journey.

---

# 14. WORLD PROGRESS

Maintain normalized progress:

```ts
let targetProgress = 0;
let currentProgress = 0;
```

Range:

```text
0.0 → 1.0
```

Mouse wheel and trackpad update `targetProgress`.

Animation frame gradually interpolates toward it:

```ts
currentProgress +=
  (targetProgress - currentProgress) * damping;
```

Recommended damping:

```text
0.06–0.12
```

Tune based on actual rendering.

Always clamp:

```ts
targetProgress = Math.min(1, Math.max(0, targetProgress));
```

---

# 15. WHEEL / TRACKPAD INTERACTION

The wheel never scrolls the page.

Instead:

```text
Wheel / Trackpad
→ normalize input
→ change worldProgress
→ move camera
```

Trackpad must remain smooth.

Mouse wheel should not create large jumps.

Suggested conceptual behavior:

```ts
targetProgress += normalizedDelta * 0.0005;
```

Tune according to device input.

Do not map raw `deltaY` directly to large movement.

---

# 16. CAMERA STOPS

Represent semantic stops as data.

Example:

```ts
const cameraStops = [
  { id: "overview", progress: 0.00 },
  { id: "cookie", progress: 0.10 },
  { id: "health", progress: 0.20 },
  { id: "vet", progress: 0.30 },
  { id: "care", progress: 0.41 },
  { id: "shop", progress: 0.52 },
  { id: "taxi", progress: 0.62 },
  { id: "travel", progress: 0.72 },
  { id: "support", progress: 0.84 },
  { id: "memories", progress: 0.94 },
  { id: "overviewReturn", progress: 1.00 },
];
```

Exact values can be adjusted to composition.

Do not hard-snap the camera after every small input.

Use soft magnetic settling after wheel interaction ends.

---

# 17. CAMERA IMPLEMENTATION

Camera state should be data-driven.

Example:

```ts
type CameraState = {
  id: string;
  progress: number;
  x: number;
  y: number;
  scale: number;
  overlay?:
    | "overview"
    | "cookie"
    | "health"
    | "vet"
    | "care"
    | "shop"
    | "taxi"
    | "travel"
    | "support"
    | "memories";
};
```

Interpolate camera values between surrounding states.

Do not write a giant chain of conditional camera logic.

---

# 18. CLICKABLE WORLD

Important areas in the world must be interactive.

Examples:

Click Cookie
→ focus Cookie.

Click Vet
→ focus Vet.

Click Shop
→ focus Shop.

Click Grooming
→ focus Grooming.

Click Taxi
→ focus Taxi.

Click Travel area
→ focus Travel.

Click Shelter
→ focus Animal Support.

Click should:

1. update `targetProgress`
2. animate camera
3. update contextual UI
4. reveal a contextual label
5. reveal the relevant action
6. remain inside the same landing world

Do not immediately route away when a destination is clicked.

Actual product navigation happens only after the user chooses a contextual CTA.

---

# 19. LABEL BEHAVIOR

Do not permanently display labels above every destination.

At Overview:

labels should be minimal or absent.

When a location becomes relevant through:

* camera proximity
* hover
* keyboard focus
* click
* recommended action

its label may appear.

Example when Vet receives focus:

```text
دامپزشکی
مراقبت پزشکی برای کوکی
```

As the user moves away, the label fades.

Do not make the world look like an attraction map.

---

# 20. ACTIVE PET STATE

Landing context:

```ts
activePet = {
  id: "cookie",
  name: "کوکی",
  species: "dog",
  breed: "Spitz"
};
```

Cookie is the default active pet throughout this implementation.

Do not use Luna.

Do not use Milo as the active pet.

Do not include Luna-specific copy anywhere.

The entire landing context is built around Cookie.

---

# 21. COOKIE IDENTITY IN UI

Cookie should remain emotionally identifiable across the landing.

At Overview, Cookie should appear naturally inside the scene.

Do not place Cookie only in an avatar chip.

When camera approaches Pet focus, Cookie becomes more visually prominent.

Context UI:

```text
کوکی
اشپیتز
```

If age is not explicitly provided, do not invent an age.

If any additional identity information is needed, use only values explicitly supplied later.

Reference image should drive the visual appearance.

---

# 22. COOKIE REFERENCE IMAGE IN IMPLEMENTATION

I will send an actual image of Cookie together with this implementation prompt.

The developer should:

1. load the supplied Cookie image as a reference asset
2. use it to establish Cookie's appearance
3. preserve Cookie's recognizability across all scene representations
4. use the same visual identity across Light and Dark themes
5. avoid substituting Cookie with stock imagery
6. avoid using unrelated Spitz images
7. keep Cookie visually consistent between camera states

If Cookie is rendered as a separate layered asset, use the supplied image or a derived approved visual asset based on it.

If Cookie is integrated into generated scene art, the generated dog must visibly resemble the supplied photograph.

---

# 23. PET CONTEXT RELEVANCE

Because Cookie is a Spitz dog, relevant destinations may receive subtle contextual prioritization.

Potentially relevant:

* Grooming
* Daily Care
* Walking
* Training
* Vet
* Travel
* Shop

Do not turn breed into deterministic medical or behavioral claims.

Do not invent health needs simply because Cookie is a Spitz.

Relevance should remain contextual and plausible.

---

# 24. AI VISUAL LANGUAGE

AI connects Cookie's context to actions.

Example narrative:

```text
کوکی
↓
وضعیت سلامت
↓
دامپزشکی
```

The connection may be represented by:

* soft path illumination
* temporary violet accent
* contextual architecture emphasis
* subtle environmental focus

Do not use a giant AI panel.

Do not use a huge purple glow.

Do not create an AI building.

AI should feel intelligent and nearly invisible.

---

# 25. OVERVIEW — PERSIAN COPY

Persian is primary.

RTL.

Keep text short.

Hero:

```text
زندگی با آن‌ها،
منظم حول خودشان.
```

Supporting copy:

```text
سلامت، مراقبت و زندگی روزمره؛
همه در یک سیستم.
```

Primary CTA:

```text
شروع کنید
```

Secondary CTA:

```text
دنیای PET LIFE را کشف کنید
```

Optional Cookie-specific line:

```text
PET LIFE OS
همه‌چیز برای زندگی بهتر کوکی،
در یک جریان متصل.
```

Avoid long paragraphs.

---

# 26. ENGLISH COPY

LTR.

Hero:

```text
Life with them,
organized around who they are.
```

Supporting:

```text
Health, care and everyday life —
connected in one system.
```

Cookie-specific contextual line:

```text
Everything around Cookie,
connected in one living system.
```

Primary:

```text
Get Started
```

Secondary:

```text
Explore PET LIFE
```

Same world.
Same Cookie.
Same visual hierarchy.

---

# 27. HEALTH CONTEXT

When focusing Health:

```text
سلامت کوکی

آنچه الان برای سلامت کوکی مهم است،
در یک نگاه.
```

If using a vaccine example:

```text
واکسن هاری کوکی ۱۲ روز دیگر سررسید می‌شود.
```

CTA:

```text
بررسی سلامت کوکی
```

Important:

The vaccine information is illustrative landing content only unless connected to real application data.

Do not present fabricated health data as a real user record in production.

If real contextual data is unavailable, use a clearly demo/static presentation context.

---

# 28. VET CONTEXT

When moving to Vet:

```text
مراقبت دامپزشکی برای کوکی

اطلاعات لازم از قبل در زمینه کوکی وجود دارد.
فقط چیزی را که لازم است تأیید کنید.
```

CTA:

```text
پیدا کردن دامپزشک
```

The animation can gently connect Cookie's position to the Vet.

---

# 29. CARE / WALKER CONTEXT

Example:

```text
مراقبت برای کوکی

مراقبت روزمره، با توجه به زمینه و برنامه کوکی.
```

Primary CTA:

```text
پیدا کردن مراقبت
```

If Walker is explicitly relevant:

```text
پیدا کردن واکر
```

Do not invent a precise routine unless it is part of demo data.

---

# 30. GROOMING CONTEXT

Because Cookie is a Spitz, Grooming can be visually relevant.

However, do not invent medical or grooming requirements.

Copy:

```text
رسیدگی به کوکی

خدماتی متناسب با مشخصات و نیازهای ثبت‌شده کوکی.
```

CTA:

```text
دیدن خدمات گرومینگ
```

---

# 31. SHOP CONTEXT

Shop should remain contextual, not promotional.

Example:

```text
برای کوکی

محصول‌هایی که با اطلاعات ثبت‌شده کوکی هماهنگ‌ترند.
```

CTA:

```text
مشاهده محصولات
```

If actual compatible product information exists:

```text
با اطلاعات فعلی،
این محصول با پروفایل کوکی سازگار است.
```

Never let the landing independently invent safety compatibility.

Any real compatibility state must come from the central Product Compatibility system.

---

# 32. TAXI / MOBILITY CONTEXT

Pet Taxi moves naturally through the world road.

At Taxi focus:

```text
رفت‌وآمد برای کوکی

جابجایی امن‌تر و هماهنگ‌تر برای مراقبت،
دامپزشکی یا سفر.
```

CTA:

```text
بررسی رفت‌وآمد
```

---

# 33. TRAVEL CONTEXT

Example:

```text
سفر با کوکی

مدارک، الزامات و آمادگی سفر،
همه در یک مسیر مشخص.
```

CTA:

```text
بررسی آمادگی سفر
```

Avoid inventing missing requirements unless explicitly marked as demo data.

---

# 34. ANIMAL SUPPORT CONTEXT

Animal Support is part of the same ecosystem but should not steal focus from Cookie.

Copy:

```text
مراقبت فقط به حیوان‌های خانه محدود نمی‌شود.
```

Supporting:

```text
نیازهای تأییدشده، پناهگاه‌ها و حمایت از حیوانات.
```

CTA:

```text
دیدن حمایت از حیوانات
```

Use respectful imagery.

---

# 35. MEMORIES CONTEXT

Memories should become quieter and warmer.

Use:

* Cookie with owner
* a warm everyday moment
* a photo-memory motif integrated naturally into the environment
* less interface
* softer movement

Copy:

```text
چیزهایی که فقط یک کار نیستند،
بخشی از زندگی با کوکی‌اند.
```

CTA:

```text
دیدن خاطرات
```

Then allow the camera to reconnect naturally to Overview.

---

# 36. PERSIAN / RTL IMPLEMENTATION

Persian:

```css
direction: rtl;
```

Use logical layout properties:

```css
margin-inline-start
margin-inline-end
padding-inline-start
padding-inline-end
inset-inline-start
inset-inline-end
```

Avoid unnecessary fixed left/right values in UI layers.

Do not mirror the world artwork itself.

The physical PET LIFE world remains geographically consistent.

Only interface direction changes.

---

# 37. MIXED LANGUAGE CONTENT

Must correctly support examples such as:

```text
کوکی
Spitz
```

or:

```text
کوکی
Spitz · PET LIFE
```

or medical/product examples:

```text
Apoquel 16 mg
```

Use bidi isolation:

```html
<bdi>Spitz</bdi>
```

or appropriate CSS:

```css
unicode-bidi: isolate;
```

English brand names, medical names, IDs and units must not visually break RTL content.

---

# 38. LIGHT MODE

Primary presentation:

* warm daylight
* warm ivory atmosphere
* mature natural greens
* subtle mint
* premium architecture
* realistic soft shadows
* gentle sky
* warm rendering
* bright but not washed out
* elegant environmental photography/render quality

Cookie must retain the same recognizable real appearance as the supplied photo.

Do not change Cookie's fur color to fit the theme.

---

# 39. DARK MODE

Same physical world.

Same Cookie.

Same architecture.

Dark Mode becomes:

* warm evening
* blue hour
* soft building lights
* warm interior illumination
* deep warm charcoal
* subdued foliage
* controlled highlights

Never:

* neon city
* cyber landscape
* purple sci-fi world
* pure black environment

Cookie must remain clearly recognizable and naturally lit.

Do not recolor Cookie unnaturally.

---

# 40. NAVIGATION

Public navigation remains restrained.

Persian RTL:

```text
خانه
محصول
وبلاگ
درباره ما
تماس
```

Actions:

```text
ورود
شروع کنید
```

Navigation may use a subtle translucent / atmospheric surface if necessary for legibility.

Do not turn it into an enterprise navigation bar.

---

# 41. OVERVIEW UI

At initial state show only:

* PET LIFE identity
* public navigation
* hero headline
* short support line
* Get Started
* Explore PET LIFE
* optional language selector
* optional theme selector

Cookie and the world remain visually dominant.

Do not surround Cookie with floating cards.

---

# 42. CONTEXT UI TRANSITIONS

When camera enters another context, replace Overview messaging with contextual copy.

Do not stack all copy on screen.

For example:

Overview copy fades.

Health copy enters.

Health copy fades.

Vet copy enters.

The scene stays persistent throughout.

---

# 43. MOTION TOKENS

Micro interaction:

```text
160–220ms
```

Context UI transition:

```text
280–360ms
```

Standard camera movement:

```text
600–1200ms
```

Long cinematic camera move:

```text
1200–1800ms
```

Recommended easing:

```css
cubic-bezier(0.22, 1, 0.36, 1)
```

Avoid:

* bounce
* elastic
* overshoot
* confetti
* flashing
* constant pulsing

---

# 44. COOKIE AMBIENT ANIMATION

Cookie should feel alive without becoming cartoon-like.

Possible subtle animation:

* small head movement
* natural breathing
* restrained ear movement
* brief gaze change
* subtle posture shift
* tail movement only when appropriate to the reference and pose

Do not make Cookie bounce.

Do not create exaggerated tail wagging loops.

Do not animate the face unnaturally.

The real reference image should guide what looks plausible.

---

# 45. PET TAXI ANIMATION

Pet Taxi:

* moves slowly on road
* independent from camera
* subtle wheel motion
* natural velocity
* no bounce
* no arcade movement

At Taxi focus:

Taxi can slow or become more visually prominent.

---

# 46. ENVIRONMENTAL MOTION

Examples:

Walker:
slow natural movement.

Other dog:
occasional natural movement.

Cat:
small idle shift.

Trees:
slow wind.

Water:
gentle ripple.

Cafe:
quiet ambient activity.

Buildings:
very subtle signs of life, such as soft interior movement/light changes.

Avoid excessive simultaneous motion.

---

# 47. SCROLL PROGRESS

Do not display browser-like scroll indicators.

Optional:

A subtle semantic progress indicator.

Do not show:

```text
1 / 10
```

Do not show carousel dots.

Do not suggest slides.

---

# 48. KEYBOARD ACCESSIBILITY

Required:

Arrow Down / Arrow Right:
next camera state.

Arrow Up / Arrow Left:
previous camera state.

Home:
Overview.

End:
last narrative state.

Enter / Space:
activate focused destination.

Escape:
return to Overview or dismiss context.

Every interactive destination needs accessible semantic controls.

---

# 49. REDUCED MOTION

Respect:

```css
@media (prefers-reduced-motion: reduce)
```

In Reduced Motion:

* disable continuous camera movement
* disable pointer parallax
* reduce environmental animation
* jump directly to target framing
* use approximately 150ms opacity/context transition
* preserve all functionality

Do not remove content.

---

# 50. ACCESSIBILITY

Minimum WCAG AA.

Required:

* visible focus states
* semantic controls
* keyboard access
* meaningful aria labels
* reduced motion
* sufficient contrast
* color-independent communication

Example accessible destination:

```html
<button aria-label="Explore veterinary care for Cookie">
```

Do not make the world just an inaccessible image or canvas.

---

# 51. RESPONSIVE DESKTOP

Primary target:

```text
1440×900
```

Also optimize:

```text
1280×720
1366×768
1920×1080
2560×1440
```

Do not uniformly scale the scene.

Adapt:

* camera crop
* world framing
* Cookie position within safe composition
* headline width
* UI placement
* peripheral objects
* foreground visibility
* background depth

---

# 52. 1440×900 COMPOSITION

Suggested composition:

Top:
light public navigation.

Logical content side:
headline and CTA.

Central visual area:
Cookie inside the living park.

Midground:
Vet + Care + paths.

Further area:
Shop + Grooming.

Road:
natural diagonal/curved route through scene.

Pet Taxi:
visible but secondary.

Travel:
a more distant visual destination.

Animal Support:
integrated naturally, not like an attraction.

Memories:
warmer quieter environment.

Cookie should be immediately identifiable.

Use the supplied reference image when designing Cookie's visual form.

---

# 53. 1920×1080

Do not stretch the 1440 composition.

Use the extra canvas for:

* atmosphere
* natural landscaping
* wider depth
* environmental breathing room
* richer foreground/background separation

Keep Cookie and primary destinations inside a controlled composition safe zone.

---

# 54. 1280×720

Reduce:

* secondary characters
* peripheral foliage
* decorative environmental content

Keep:

* Cookie
* main destination architecture
* navigation
* headline
* CTA
* core camera journey

Nothing critical should overlap.

---

# 55. MOBILE

Use the same PET LIFE world and Cookie identity.

Do not show a tiny desktop map.

Use tighter camera crops.

Recommended:

* Cookie more prominent
* fewer destinations simultaneously visible
* swipe gesture can move between camera states
* optional direct destination menu
* bottom-safe CTA
* no normal long document scroll if preserving spatial concept

The experience should feel designed for mobile, not scaled down.

---

# 56. PERFORMANCE

Target smooth 60fps where realistic.

Use:

* transform
* opacity
* requestAnimationFrame
* responsive image formats
* AVIF / WebP
* preload critical scene
* GPU-friendly compositing
* lazy decoding/loading of secondary artwork

Avoid:

* layout thrashing
* animating top/left continuously
* huge unoptimized PNGs
* hundreds of independent animations
* excessive real-time blur
* expensive filters

---

# 57. ASSET STRATEGY

Recommended scene layers:

```text
background-sky
background-atmosphere
far-landscape
mid-landscape
architecture
roads-and-paths
secondary-characters
cookie
foreground-foliage
context-effects
```

Cookie should ideally remain its own controllable asset/layer where possible.

This improves:

* identity consistency
* focus animations
* responsive composition
* Light/Dark lighting adaptation
* future replacement of the Cookie visual

Use the provided Cookie reference image to create or select the Cookie scene asset.

---

# 58. COOKIE ASSET HANDLING

Do not distort the supplied Cookie image.

If using the photo directly:

* preserve aspect ratio
* use high-quality mask/cutout
* maintain natural fur edges
* avoid aggressive sharpening
* avoid artificial saturation

If creating a stylized/3D representation:

* use the reference photo as the visual source
* preserve facial identity
* preserve coat appearance
* obtain approval before replacing the reference-based appearance with a substantially different interpretation

---

# 59. IMAGE LOADING

Critical initial assets:

* world background
* Cookie
* central park
* initial UI
* primary architecture

Preload Cookie's asset.

Cookie must not appear late after the environment has already loaded.

Secondary distant locations can load progressively.

If loading state is required:

use a subtle scene readiness treatment.

No fake progress percentage.

---

# 60. CENTRAL LANDING CONTEXT

Use centralized state:

```ts
type LandingContext = {
  activePetId: "cookie";
  activeCameraState: string;
  worldProgress: number;
  theme: "light" | "dark" | "system";
  locale: "fa" | "en";
  reducedMotion: boolean;
};
```

Pet data:

```ts
const cookie = {
  id: "cookie",
  name: "کوکی",
  nameEn: "Cookie",
  species: "dog",
  breed: "Spitz",
  referenceImage: COOKIE_REFERENCE_IMAGE
};
```

Do not invent additional Cookie data unless supplied.

---

# 61. PRODUCT DEEP LINKS

Context CTAs may enter PET LIFE product.

Health:

```text
بررسی سلامت کوکی
```

Example destination:

```text
/app/health?pet=cookie
```

Vet:

```text
پیدا کردن دامپزشک
```

Care:

```text
پیدا کردن مراقبت برای کوکی
```

Shop:

```text
مشاهده محصولات برای کوکی
```

Travel:

```text
بررسی آمادگی سفر
```

Preserve Cookie context when routing.

---

# 62. AUTH REDIRECT

If visitor is unauthenticated and chooses an action:

Landing
→ Authentication
→ OTP / Google
→ return to intended PET LIFE destination

Preserve:

* destination
* relevant Cookie context
* requested action where safe

Do not always send the user to generic Home.

---

# 63. ANALYTICS

Track meaningful behavior only:

```text
landing_viewed
landing_camera_state_viewed
landing_destination_clicked
landing_primary_cta_clicked
landing_secondary_cta_clicked
landing_cookie_focused
landing_theme_changed
landing_language_changed
```

Do not record every wheel movement.

---

# 64. STRICT — NO SLIDER

Do not use:

* Swiper
* carousel
* slider
* horizontal feature rail
* auto-changing hero
* pagination dots
* slide-based narrative

Camera movement through one world is the only narrative interaction model.

---

# 65. STRICT — NO PAGE SCROLL

Do not implement:

```text
Hero
↓
Health
↓
Vet
↓
Care
↓
Shop
↓
Travel
```

There is no vertical landing document.

Everything exists simultaneously inside one persistent world.

---

# 66. OVERVIEW STATE

Initial view should communicate:

* this is one living pet ecosystem
* Cookie is at its center
* different parts of pet life are connected
* the world is interactive
* the visitor can explore

Without:

* permanent feature labels
* giant card grids
* obvious sitemap representation

Cookie must be visible and recognizable from the reference image.

---

# 67. COOKIE → HEALTH → VET MOTION

Example sequence:

1. camera moves closer to Cookie
2. environment softly reduces emphasis
3. health context appears
4. restrained AI path starts from Cookie's context
5. Vet architecture becomes visually clearer
6. camera moves toward Vet
7. contextual text changes
8. CTA becomes veterinary action

This transition should communicate:

PET LIFE already understands who Cookie is and connects health context to action.

No flashing.
No pulsing.
No dramatic emergency aesthetic.

---

# 68. COOKIE → CARE MOTION

Camera shifts from Cookie into Care environment.

Potential scene:

* Cookie near walking path
* walker visible in midground
* natural park continuity

UI:

```text
مراقبت برای کوکی

خدمات روزمره‌ای که با زمینه کوکی هماهنگ می‌شوند.
```

CTA:

```text
پیدا کردن مراقبت
```

---

# 69. COOKIE → GROOMING MOTION

Use Cookie's real Spitz visual characteristics as part of the emotional continuity.

The camera may move toward the Grooming environment while Cookie remains visible or contextually connected.

Do not exaggerate fur or create comedy.

The scene remains sophisticated and lifestyle-oriented.

---

# 70. COOKIE → SHOP MOTION

Camera approaches Shop.

Product display becomes visible as part of the physical environment.

Do not show a marketplace product grid.

Show only one intentional contextual commerce idea.

Example:

```text
برای کوکی

محصول‌هایی متناسب‌تر با اطلاعات ثبت‌شده کوکی.

مشاهده محصولات
```

Cookie's reference-based identity should remain present.

---

# 71. COOKIE → TRAVEL MOTION

Transition toward the travel environment.

Possible visual storytelling:

* road opening into broader landscape
* carrier/travel object subtly present
* travel architecture or departure context
* Pet Taxi connection

UI:

```text
سفر با کوکی

مدارک، آمادگی و مسیر سفر،
همه در یک جریان متصل.
```

CTA:

```text
بررسی سفر
```

---

# 72. COOKIE → MEMORIES MOTION

This is the emotional end-state.

Camera slows.

Environmental movement becomes quieter.

Lighting warms subtly.

Show Cookie in a more personal life moment.

Copy:

```text
بعضی چیزها فقط برنامه و مراقبت نیستند؛
بخشی از زندگی با کوکی‌اند.
```

CTA:

```text
دیدن خاطرات
```

From here, user can continue toward Overview.

---

# 73. LANDING SUCCESS CRITERIA

Implementation is accepted only if:

* landing remains exactly one 100dvh world
* no document scrolling exists
* no slider or carousel exists
* wheel/trackpad controls internal camera movement
* Cookie is the main pet
* Cookie is a Spitz
* Cookie visually matches the supplied reference photo
* Luna is not used
* active-pet copy uses Cookie / کوکی
* Cookie remains recognizable across camera states
* destinations exist in one physical world
* destinations do not look like theme-park attractions
* labels appear contextually
* AI is an orchestration layer, not a destination
* Light/Dark use the same world
* Dark is warm evening, not cyberpunk
* Persian RTL is native
* English LTR works correctly
* keyboard navigation works
* reduced-motion mode works
* responsive framing is designed, not uniformly scaled
* performance remains smooth
* CTA actions preserve Cookie context
* the result feels cinematic and editorial
* the result does not resemble a SaaS dashboard
* the result does not resemble an isometric game map

---

# 74. IMPLEMENTATION ORDER

Build in this order:

1. 100dvh fixed shell
2. load supplied Cookie reference image
3. establish Cookie visual asset
4. render persistent world
5. create camera state architecture
6. implement wheel/trackpad progress
7. implement camera interpolation
8. build Overview UI
9. add Cookie focus
10. add destination focus states
11. add contextual overlays
12. add contextual labels
13. add AI connection effects
14. add environmental motion
15. add Pet Taxi animation
16. add pointer parallax
17. add Persian RTL
18. add English LTR
19. add Dark/Evening theme
20. add keyboard control
21. add reduced-motion mode
22. tune responsive framing
23. optimize asset/performance
24. connect PET LIFE deep links
25. validate Cookie against supplied reference image

Do not begin by creating standard website sections or feature cards.

---

# 75. FINAL DESIGN INTENT

This landing should feel like:

a premium cinematic campaign
+
an explorable living Pet Life world
+
a spatial visualization of PET LIFE OS intelligence
+
Cookie's personal world

The supplied Cookie photograph is the identity anchor.

The user should not think:

“This website has Health, Shop, Vet and Services.”

The user should feel:

“This whole world already knows Cookie and connects everything around Cookie.”

That is the intended PET LIFE OS experience.
