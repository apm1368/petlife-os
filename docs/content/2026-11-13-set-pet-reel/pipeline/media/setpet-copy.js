// On-screen copy for the 90 s "Set Pet" reel (matching custom-printed outfits for a person and their pet) and the
// landing-section copy. Owner request 2026-11-13 via QA; reworked to the owner's answers in issue #368 (comment
// 2026-11-13 12:28 UTC, scope in #374). Six site languages; ar/fa are RTL. The flow shown:
// 1 garment (T-shirt, hoodie or sweatshirt: P6), one of six base colours (P12) and a size S–3XL →
// 2 upload photos or designs, no fixed number (P21) →
// 3 place them on the front centre, back or upper arms of a flat front/back mockup (zones decided before #368; the
//   3D viewer P31 waits on the owner's dependency OK, so nothing says "3D") →
// 4 the pet's outfit: a size letter chosen with the size guide (P17), the design printed on its back (pet zone) →
// 5 order: a print proof always comes first (F5) and the member pays after approving it (F2). Price comes from a fixed
//   table, shown as a range while building (F1/P35): staff do NOT quote the price.
const L = ["fa", "en", "de", "es", "ar", "nl"];

module.exports = {
  locales: L,
  // Product name as shown on screen. Latin "Set Pet" outside Persian (ar follows the site's Latin-brand rule).
  name: { fa: "ست پت", en: "Set Pet", de: "Set Pet", es: "Set Pet", ar: "Set Pet", nl: "Set Pet" },
  hook: {
    fa: { q: "یک طرح، دو لباس", sub: "برای تو و پتت" },
    en: { q: "One design. Two outfits.", sub: "For you and your pet" },
    de: { q: "Ein Motiv. Zwei Outfits.", sub: "Für dich und dein Haustier" },
    es: { q: "Un diseño. Dos prendas.", sub: "Para ti y tu mascota" },
    ar: { q: "تصميم واحد، لباسان", sub: "لك ولحيوانك الأليف" },
    nl: { q: "Eén ontwerp. Twee outfits.", sub: "Voor jou en je huisdier" },
  },
  tagline: {
    fa: "لباس ست تو و پتت، با طرح خودت",
    en: "Matching outfits for you and your pet, with your own design",
    de: "Partnerlook für dich und dein Haustier – mit deinem eigenen Motiv",
    es: "Ropa a juego para ti y tu mascota, con tu propio diseño",
    ar: "ملابس متطابقة لك ولحيوانك الأليف، بتصميمك أنت",
    nl: "Matchende outfits voor jou en je huisdier, met je eigen ontwerp",
  },
  stepOf: { fa: (n) => `مرحلهٔ ${n} از ۵`, en: (n) => `Step ${n} of 5`, de: (n) => `Schritt ${n} von 5`, es: (n) => `Paso ${n} de 5`, ar: (n) => `الخطوة ${n} من 5`, nl: (n) => `Stap ${n} van 5` },
  steps: [
    {
      title: { fa: "نوع لباس، رنگ و سایز", en: "Garment, colour and size", de: "Modell, Farbe und Größe", es: "Prenda, color y talla", ar: "النوع واللون والمقاس", nl: "Model, kleur en maat" },
      subs: [{ fa: "تی‌شرت، هودی یا سویشرت؛ بعد رنگ و سایزش را انتخاب کن.", en: "T-shirt, hoodie or sweatshirt: pick one, then its colour and size.", de: "T-Shirt, Hoodie oder Sweatshirt – dann Farbe und Größe wählen.", es: "Camiseta, hoodie o sudadera; luego elige color y talla.", ar: "تيشيرت أو هودي أو سويتشيرت، ثم اختر اللون والمقاس.", nl: "T-shirt, hoodie of sweater; kies daarna kleur en maat." }],
      ui: {
        garment: { fa: "نوع", en: "Garment", de: "Modell", es: "Prenda", ar: "النوع", nl: "Model" },
        types: { fa: ["تی‌شرت", "هودی", "سویشرت"], en: ["T-shirt", "Hoodie", "Sweatshirt"], de: ["T-Shirt", "Hoodie", "Sweatshirt"], es: ["Camiseta", "Hoodie", "Sudadera"], ar: ["تيشيرت", "هودي", "سويتشيرت"], nl: ["T-shirt", "Hoodie", "Sweater"] },
        colour: { fa: "رنگ", en: "Colour", de: "Farbe", es: "Color", ar: "اللون", nl: "Kleur" },
        size: { fa: "سایز", en: "Size", de: "Größe", es: "Talla", ar: "المقاس", nl: "Maat" },
      },
    },
    {
      title: { fa: "عکس‌ها و طرح‌ها", en: "Photos and designs", de: "Fotos und Motive", es: "Fotos y diseños", ar: "الصور والتصاميم", nl: "Foto's en ontwerpen" },
      subs: [{ fa: "عکس‌ها یا طرح‌های خودت و پتت را بارگذاری کن.", en: "Upload photos or designs of you and your pet.", de: "Lade Fotos oder Motive von dir und deinem Tier hoch.", es: "Sube fotos o diseños tuyos y de tu mascota.", ar: "ارفع صورًا أو تصاميم لك ولحيوانك.", nl: "Upload foto's of ontwerpen van jou en je huisdier." }],
      ui: {
        head: { fa: "عکس‌ها و طرح‌ها", en: "Photos & designs", de: "Fotos & Motive", es: "Fotos y diseños", ar: "الصور والتصاميم", nl: "Foto's & ontwerpen" },
        // A running count, no maximum (owner P21: no limit on designs).
        count: { fa: (n) => `${n} فایل`, en: (n) => `${n} added`, de: (n) => `${n} hochgeladen`, es: (n) => `${n} subidos`, ar: (n) => `تم رفع ${n}`, nl: (n) => `${n} geüpload` },
        cards: { fa: ["پتِ من", "من و پتم", "طرح من"], en: ["My pet", "Me & my pet", "My design"], de: ["Mein Tier", "Ich & mein Tier", "Mein Motiv"], es: ["Mi mascota", "Yo y mi mascota", "Mi diseño"], ar: ["حيواني", "أنا وحيواني", "تصميمي"], nl: ["Mijn huisdier", "Ik & mijn huisdier", "Mijn ontwerp"] },
      },
    },
    {
      title: { fa: "چیدمان روی تی‌شرت", en: "Place them on the T-shirt", de: "Platzieren auf dem T-Shirt", es: "Colócalos en la camiseta", ar: "ضعها على التيشيرت", nl: "Plaats ze op het T-shirt" },
      subs: [
        { fa: "طرح‌ها را روی سینه، پشت یا آستین بچین.", en: "Put them on the chest, back or sleeves.", de: "Setz sie auf Brust, Rücken oder Ärmel.", es: "Ponlos en el pecho, la espalda o las mangas.", ar: "ضعها على الصدر أو الظهر أو الأكمام.", nl: "Zet ze op de borst, rug of mouwen." },
        { fa: "بین جلو و پشت جابه‌جا شو و هر دو طرف را ببین.", en: "Switch between front and back to check both sides.", de: "Wechsle zwischen vorne und hinten und prüf beide Seiten.", es: "Cambia entre delante y detrás y revisa los dos lados.", ar: "بدّل بين الأمام والخلف وشاهد الجهتين.", nl: "Wissel tussen voor- en achterkant en bekijk beide kanten." },
      ],
      ui: { chest: { fa: "سینه", en: "Chest", de: "Brust", es: "Pecho", ar: "الصدر", nl: "Borst" }, back: { fa: "پشت", en: "Back", de: "Rücken", es: "Espalda", ar: "الظهر", nl: "Rug" }, sleeve: { fa: "آستین", en: "Sleeve", de: "Ärmel", es: "Manga", ar: "الكُم", nl: "Mouw" }, viewFront: { fa: "جلو", en: "Front", de: "Vorne", es: "Delante", ar: "الأمام", nl: "Voorkant" }, viewBack: { fa: "پشت", en: "Back", de: "Hinten", es: "Detrás", ar: "الخلف", nl: "Achterkant" } },
    },
    {
      title: { fa: "لباس پت و سایزش", en: "Your pet's outfit and size", de: "Outfit und Größe deines Tiers", es: "La prenda y la talla de tu mascota", ar: "لباس حيوانك ومقاسه", nl: "Outfit en maat van je huisdier" },
      subs: [
        { fa: "با جدول راهنما اندازه بگیر و سایز پتت را انتخاب کن.", en: "Measure with the size guide and pick your pet's size.", de: "Miss mit der Größentabelle und wähl die Größe.", es: "Mide con la guía de tallas y elige su talla.", ar: "قِس حيوانك بمساعدة جدول المقاسات واختر مقاسه.", nl: "Meet met de maattabel en kies de maat." },
        { fa: "طرحت روی پشت لباس پتت می‌نشیند.", en: "Your design goes on the back of their outfit.", de: "Dein Motiv kommt auf den Rücken seines Outfits.", es: "Tu diseño va en la espalda de su prenda.", ar: "ويُطبع تصميمك على ظهر لباسه.", nl: "Je ontwerp komt op de rug van de outfit." },
      ],
      // What the size guide asks you to measure (no numbers: the pet garment is ordered by size letter, owner P17).
      ui: {
        neck: { fa: "دور گردن", en: "Neck", de: "Hals", es: "Cuello", ar: "الرقبة", nl: "Nek" },
        chest: { fa: "دور سینه", en: "Chest", de: "Brust", es: "Pecho", ar: "الصدر", nl: "Borst" },
        back: { fa: "طول پشت", en: "Back length", de: "Rückenlänge", es: "Largo del lomo", ar: "طول الظهر", nl: "Ruglengte" },
        size: { fa: "سایز پت", en: "Pet size", de: "Größe", es: "Talla", ar: "المقاس", nl: "Maat" },
        // Label of the small card that shows the pet garment from behind with the print (the pet print zone is the back only).
        backLabel: { fa: "روی پشت لباس پت", en: "On the back", de: "Auf dem Rücken", es: "En la espalda", ar: "على الظهر", nl: "Op de rug" },
      },
    },
    {
      title: { fa: "تأیید نمونهٔ چاپ", en: "Approve your print proof", de: "Druckvorschau freigeben", es: "Aprueba la prueba de impresión", ar: "وافق على نموذج الطباعة", nl: "Keur je drukproef goed" },
      subs: [{ fa: "سفارشت را ثبت کن؛ نمونهٔ چاپ را برایت می‌فرستیم و بعد از تأییدش پرداخت می‌کنی.", en: "Place your order. We send you a print proof, and you pay once you approve it.", de: "Bestell dein Set. Du bekommst eine Druckvorschau und zahlst erst nach deiner Freigabe.", es: "Haz tu pedido. Te enviamos una prueba de impresión y pagas cuando la apruebes.", ar: "اطلب طقمك، فنرسل لك نموذج الطباعة وتدفع بعد موافقتك عليه.", nl: "Plaats je bestelling. Je krijgt een drukproef en betaalt pas als je hem goedkeurt." }],
      ui: {
        card: { fa: "سفارش ست پت", en: "Set Pet order", de: "Set Pet Bestellung", es: "Pedido de Set Pet", ar: "طلب Set Pet", nl: "Set Pet-bestelling" },
        rows: {
          fa: ["تی‌شرت · L", "۳ طرح", "لباس پت · M"], en: ["T-shirt · L", "3 designs", "Pet outfit · M"], de: ["T-Shirt · L", "3 Motive", "Tier-Outfit · M"],
          es: ["Camiseta · L", "3 diseños", "Prenda mascota · M"], ar: ["تيشيرت · L", "3 تصاميم", "لباس الحيوان · M"], nl: ["T-shirt · L", "3 ontwerpen", "Outfit huisdier · M"],
        },
        send: { fa: "ثبت سفارش", en: "Place order", de: "Bestellen", es: "Hacer pedido", ar: "إرسال الطلب", nl: "Bestellen" },
        sent: { fa: "سفارش ثبت شد", en: "Order placed", de: "Bestellt", es: "Pedido hecho", ar: "تم إرسال الطلب", nl: "Besteld" },
        design: { fa: "نمونهٔ چاپ آماده شد", en: "Print proof ready", de: "Druckvorschau bereit", es: "Prueba de impresión lista", ar: "نموذج الطباعة جاهز", nl: "Drukproef klaar" },
        price: { fa: "تأیید کردی؛ حالا پرداخت", en: "Approved, now pay", de: "Freigegeben, jetzt bezahlen", es: "Aprobada: ahora pagas", ar: "تمت الموافقة، والآن الدفع", nl: "Goedgekeurd, nu betalen" },
        note: { fa: "سفارشی است: پرداخت بعد از تأیید نمونهٔ چاپ", en: "Made to order: you pay after approving the proof", de: "Auf Bestellung: Zahlung erst nach Freigabe", es: "Por encargo: pagas tras aprobar la prueba", ar: "حسب الطلب: الدفع بعد الموافقة على النموذج", nl: "Op bestelling: betalen na goedkeuring van de proef" },
      },
    },
  ],
  reveal: {
    fa: { big: "ست شدید!", sub: "حالا با پتت هم‌تیپ شو و عکس بگیر." },
    en: { big: "Now you match!", sub: "Twin up with your pet and grab a photo." },
    de: { big: "Jetzt im Partnerlook!", sub: "Partnerlook mit deinem Tier – und ab aufs Foto." },
    es: { big: "¡Ya vais a juego!", sub: "Combina con tu mascota y haceos una foto." },
    ar: { big: "أصبحتما متطابقين!", sub: "تطابق مع حيوانك والتقطا صورة معًا." },
    nl: { big: "Nu matchen jullie!", sub: "Match met je huisdier en maak een foto." },
  },
  // End card: line = the owner's landing CTA wording (issue #368, P2), button = the /set-pet URL. The order flow is not
  // live yet, so nothing promises a date.
  cta: {
    fa: { line: "ست خودت و پتت را بساز", button: "opetlife.ir/set-pet", share: "ذخیره کن و برای رفیق پت‌دارت بفرست" },
    en: { line: "Make a set for you and your pet", button: "opetlife.ir/set-pet", share: "Save it and send it to a fellow pet parent" },
    de: { line: "Gestalte dein Set mit deinem Tier", button: "opetlife.ir/set-pet", share: "Speichern und an Tierfreunde schicken" },
    es: { line: "Crea tu set con tu mascota", button: "opetlife.ir/set-pet", share: "Guárdalo y compártelo con quien tenga mascota" },
    ar: { line: "اصنع طقمك أنت وحيوانك", button: "opetlife.ir/set-pet", share: "احفظه وأرسله لصاحب حيوان أليف" },
    nl: { line: "Maak een set voor jou en je huisdier", button: "opetlife.ir/set-pet", share: "Bewaar het en stuur het naar een baasje" },
  },
  // Landing section (16:9 video slot): headline + four short lines + button + video label. Follows the owner's #368
  // answers: garment types (P6), no design limit (P21), pet size letter with the guide (P17), price range while building
  // (P35), print proof always and payment after approving it (F5/F2).
  landing: {
    fa: {
      eyebrow: "تازه در اپت‌لایف", title: "ست پت: لباس ست تو و پتت",
      lede: "لباس تو و لباس پتت با یک طرح؛ طرحی که خودت می‌سازی.",
      lines: ["تی‌شرت، هودی یا سویشرت؛ رنگ و سایزش را انتخاب کن.", "عکس‌ها یا طرح‌های خودت و پتت را بارگذاری کن و روی سینه، پشت یا آستینِ لباست و پشت لباس پتت بچین.", "سایز پتت را با جدول راهنما انتخاب کن؛ لباسش همان طرح را می‌گیرد.", "بازهٔ قیمت را هنگام ساخت می‌بینی. قبل از چاپ، نمونهٔ چاپ را برایت می‌فرستیم و بعد از تأییدت پرداخت می‌کنی."],
      cta: "ست خودت و پتت را بساز", videoLabel: "ویدیوی معرفی ست پت", navLabel: "ست پت",
    },
    en: {
      eyebrow: "New on opetlife", title: "Set Pet: matching outfits for you and your pet",
      lede: "Your outfit and your pet's in one design, and you make the design.",
      lines: ["Pick a T-shirt, hoodie or sweatshirt, then its colour and size.", "Upload photos or designs of you and your pet and place them on the chest, back or sleeves of your garment and on the back of your pet's.", "Pick your pet's size with the size guide, and their outfit gets the same design.", "You see a price range as you build. Before printing we send you a print proof, and you pay once you approve it."],
      cta: "Make a set for you and your pet", videoLabel: "Set Pet introduction video", navLabel: "Set Pet",
    },
    de: {
      eyebrow: "Neu bei opetlife", title: "Set Pet: Partnerlook für dich und dein Haustier",
      lede: "Dein Outfit und das deines Tiers in einem Motiv – und das Motiv gestaltest du.",
      lines: ["Wähle T-Shirt, Hoodie oder Sweatshirt, dann Farbe und Größe.", "Lade Fotos oder Motive von dir und deinem Tier hoch und platziere sie auf Brust, Rücken oder Ärmeln deines Kleidungsstücks und auf dem Rücken des Tier-Outfits.", "Wähle die Größe deines Tiers mit der Größentabelle – sein Outfit bekommt dasselbe Motiv.", "Eine Preisspanne siehst du schon beim Gestalten. Vor dem Druck bekommst du eine Druckvorschau und zahlst erst nach deiner Freigabe."],
      cta: "Gestalte dein Set mit deinem Tier", videoLabel: "Vorstellungsvideo zu Set Pet", navLabel: "Set Pet",
    },
    es: {
      eyebrow: "Novedad en opetlife", title: "Set Pet: ropa a juego para ti y tu mascota",
      lede: "Tu prenda y la de tu mascota con un mismo diseño, y el diseño lo creas tú.",
      lines: ["Elige camiseta, hoodie o sudadera, y después el color y la talla.", "Sube fotos o diseños tuyos y de tu mascota y colócalos en el pecho, la espalda o las mangas de tu prenda y en la espalda de la de tu mascota.", "Elige la talla de tu mascota con la guía de tallas, y su prenda lleva el mismo diseño.", "Ves un rango de precio mientras lo creas. Antes de imprimir te enviamos una prueba de impresión y pagas cuando la apruebes."],
      cta: "Crea tu set con tu mascota", videoLabel: "Vídeo de presentación de Set Pet", navLabel: "Set Pet",
    },
    ar: {
      eyebrow: "جديد في opetlife", title: "Set Pet: ملابس متطابقة لك ولحيوانك الأليف",
      lede: "لباسك ولباس حيوانك بتصميم واحد، وأنت من يصنع التصميم.",
      lines: ["اختر تيشيرت أو هودي أو سويتشيرت، ثم لونه ومقاسه.", "ارفع صورًا أو تصاميم لك ولحيوانك، وضعها على الصدر أو الظهر أو الأكمام في لباسك وعلى ظهر لباس حيوانك.", "اختر مقاس حيوانك من جدول المقاسات، ويحمل لباسه التصميم نفسه.", "ترى نطاق السعر أثناء التصميم. وقبل الطباعة نرسل لك نموذج الطباعة، وتدفع بعد موافقتك عليه."],
      cta: "اصنع طقمك أنت وحيوانك", videoLabel: "فيديو تعريفي بـ Set Pet", navLabel: "Set Pet",
    },
    nl: {
      eyebrow: "Nieuw bij opetlife", title: "Set Pet: matchende outfits voor jou en je huisdier",
      lede: "Jouw outfit en die van je huisdier in één ontwerp, en dat ontwerp maak je zelf.",
      lines: ["Kies een T-shirt, hoodie of sweater, en daarna de kleur en maat.", "Upload foto's of ontwerpen van jou en je huisdier en plaats ze op de borst, rug of mouwen van je kledingstuk en op de rug van de outfit van je huisdier.", "Kies de maat van je huisdier met de maattabel; de outfit krijgt hetzelfde ontwerp.", "Je ziet al een prijsindicatie tijdens het ontwerpen. Voor het drukken krijg je een drukproef en je betaalt pas na je goedkeuring."],
      cta: "Maak een set voor jou en je huisdier", videoLabel: "Introductievideo van Set Pet", navLabel: "Set Pet",
    },
  },
};
