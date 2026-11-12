import type { RouteLocale } from "@/lib/i18n/config";

/** A sentence with a default form and a form that names the visitor's pet ({name}). */
export type NameAware = { d: string; n: string };
export const withName = (t: NameAware, name: string) => (name ? t.n.replace("{name}", name) : t.d);
export const fillVars = (template: string, vars: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");

export type WorldKey = "health" | "daily" | "travel" | "safe" | "together";
export const worldOrder: WorldKey[] = ["health", "daily", "travel", "safe", "together"];
export const worldRoutes: Record<WorldKey, { cta: string; feats: [string, string, string, string] }> = {
  health: { cta: "/register", feats: ["/pets", "/care-calendar", "/vet/find", "/pets"] },
  daily: { cta: "/shop", feats: ["/shop", "/repeat-delivery", "/services/GROOMING", "/services/BOARDING"] },
  travel: { cta: "/travel", feats: ["/travel/search", "/travel/compare", "/travel/trips", "/pets"] },
  safe: { cta: "/insurance", feats: ["/insurance", "/lost-pets", "/pets", "/support"] },
  together: { cta: "/community", feats: ["/community", "/animal-support/needs", "/pets", "/pets"] },
};

type World = { q: string; name: string; desc: string; cta: NameAware; feats: [Feat, Feat, Feat, Feat]; ck: string };
type Feat = { n: string; d: string };

const fa = {
  brand: "اپت لایف",
  header: { services: "خدمات", allServices: "همهٔ خدمات", allServicesHint: "فهرست کامل ارائه‌دهنده‌ها", partners: "همکاران", theme: "تغییر حالت روشن و تیره" },
  world: {
    eyebrow: "یک هویت، برای تمام دنیای او",
    title: { d: "دنیای همراهت، از همین‌جا", n: "دنیای {name}، از همین‌جا" } as NameAware,
    lede: "پرسشت را انتخاب کن تا ببینی اپت لایف کجا کنار شماست. هر چیزی که ثبت می‌کنی در پروندهٔ او می‌ماند.",
    defaultName: "همراهت",
    nameLabel: "اسم همراهت چیه؟",
    namePlaceholder: "مثلاً کوکی",
    speciesLabel: "نوع همراه",
    species: { dog: "سگ", cat: "گربه", bird: "پرنده", rabbit: "خرگوش", other: "دیگر" },
    coreSub: "یک پرونده برای همه‌چیز",
    worldsLabel: "پنج دنیای اپت لایف",
    worlds: {
      health: { q: "حالش خوبه؟", name: "سلامت و مراقبت", ck: "سلامتش مهمه", desc: "پروندهٔ سلامت، یادآور مراقبت و نوبت دامپزشک کنار هم هستند؛ هر چیزی که ثبت می‌کنی یک‌جا می‌ماند و هر وقت لازم شد آن را با دامپزشک به اشتراک می‌گذاری.", cta: { d: "ساخت پروندهٔ همراهت", n: "ساخت پروندهٔ {name}" }, feats: [{ n: "پروندهٔ سلامت", d: "واکسن، دارو، آلرژی و ویزیت‌ها" }, { n: "تقویم مراقبت", d: "یادآور کارهای منظم هر روز و هر ماه" }, { n: "پیدا کردن دامپزشک", d: "دیدن ارائه‌دهنده‌ها و رزرو نوبت" }, { n: "اشتراک پرونده", d: "لینک موقت و قابل لغو برای دامپزشک" }] },
      daily: { q: "امروز چی لازم داره؟", name: "خرید و خدمات", ck: "بریم خرید؟", desc: "غذا و لوازم روزانه از پت‌شاپ، و خدماتی مثل آرایش، اقامت و تاکسی از ارائه‌دهنده‌ها؛ با رزرو و پیگیری در همین برنامه.", cta: { d: "رفتن به پت‌شاپ", n: "رفتن به پت‌شاپ" }, feats: [{ n: "پت‌شاپ", d: "غذا، لوازم و محصولات مراقبتی" }, { n: "ارسال دوره‌ای", d: "سفارش تکراری در فاصلهٔ دلخواه تو" }, { n: "آرایش و شست‌وشو", d: "رزرو نوبت از ارائه‌دهنده‌ها" }, { n: "اقامت و تاکسی", d: "وقتی خودت نیستی یا باید جابه‌جا شوید" }] },
      travel: { q: "کجا با هم بریم؟", name: "سفر و اقامت", ck: "بریم سفر؟", desc: "اقامتگاه‌های پذیرای حیوانات را جست‌وجو و مقایسه کن و برنامهٔ سفر و مدارک همراهت را کنار هم نگه دار.", cta: { d: "برنامه‌ریزی سفر", n: "برنامه‌ریزی سفر" }, feats: [{ n: "جست‌وجوی اقامتگاه", d: "جاهایی که حیوان خانگی را می‌پذیرند" }, { n: "مقایسهٔ اقامتگاه‌ها", d: "شرایط و امکانات کنار هم" }, { n: "برنامهٔ سفر", d: "سفرها و رزروهایشان در یک‌جا" }, { n: "گذرنامهٔ سفر", d: "مدارک سفر در پروندهٔ همراهت" }] },
      safe: { q: "اگه اتفاقی بیفته؟", name: "آرامش خاطر", ck: "با خیال راحت", desc: "طرح‌های بیمه را مقایسه کن و اگر همراهت گم شد، از پرونده‌اش گزارش بساز تا آگهی و پیگیری از یک‌جا انجام شود.", cta: { d: "مقایسهٔ بیمه‌ها", n: "مقایسهٔ بیمه‌ها" }, feats: [{ n: "بیمهٔ حیوان خانگی", d: "دیدن و مقایسهٔ طرح‌ها" }, { n: "گزارش گم‌شدن", d: "آگهی عمومی و پیگیری از پروندهٔ او" }, { n: "کارت شناسایی", d: "کارت قابل‌اشتراک برای پیدا شدن سریع‌تر" }, { n: "پشتیبانی", d: "ثبت درخواست و پیگیری پاسخ" }] },
      together: { q: "با بقیه چطور؟", name: "جامعه و مهربانی", ck: "دوست‌های جدید", desc: "تجربه‌ها را با صاحبان دیگر در میان بگذار، به حیوانات نیازمند کمک کن و خاطره‌های مشترک را نگه دار.", cta: { d: "پیوستن به جامعه", n: "پیوستن به جامعه" }, feats: [{ n: "جامعه", d: "پرسش، تجربه و گفت‌وگو" }, { n: "حمایت از حیوانات", d: "نیازهای ثبت‌شدهٔ مراکز حمایتی" }, { n: "خاطره‌ها", d: "آلبوم لحظه‌هایی که با هم داشتید" }, { n: "مرور سال", d: "خلاصهٔ یک سال زندگی کنار هم" }] },
    } as Record<WorldKey, World>,
  },
  reel: {
    eyebrow: "بی‌کلام، با موسیقی و زیرنویس", title: "اپت لایف در ۳۰ ثانیه", lede: "همهٔ خدمات در یک ریلز کوتاه. صدا را روشن کن و از هر فصل که خواستی شروع کن.",
    label: "ریلز معرفی خدمات", play: "پخش با موسیقی", replay: "دوباره ببین", pause: "مکث", resume: "پخش", mute: "بی‌صدا کردن", unmute: "صدادار کردن", music: "موسیقی بی‌کلام", chapters: "فصل‌های ریلز", end: "پایان",
  },
  path: {
    sample: "نمونه", name: "نام", type: "نوع", photo: "عکس", added: "اضافه شد",
    chips: ["دامپزشکی", "آرایش", "اقامت", "تاکسی"], timeline: ["ثبت درخواست", "تأیید ارائه‌دهنده", "روز نوبت"],
  },
  share: {
    title: { d: "اشتراک پروندهٔ سلامت همراهت", n: "اشتراک پروندهٔ سلامت {name}" } as NameAware,
    sectionsLabel: "کدام بخش‌ها دیده شوند؟", durationLabel: "تا کی باز باشد؟", previewLabel: "آنچه دامپزشک می‌بیند",
    sections: { vaccination: "واکسیناسیون", allergies: "آلرژی‌ها", medications: "داروها", conditions: "بیماری‌ها" },
    durations: ["۲۴ ساعت", "۳ روز", "۷ روز"],
    recorded3: "۳ مورد ثبت‌شده", recorded1: "۱ مورد ثبت‌شده", unknown: "نامشخص؛ هنوز ثبت نشده",
    fromClinic: "از کلینیک", fromYou: "از شما", notRecorded: "ثبت نشده", hidden: "پنهان",
    foot: "لینک تا {d} دیگر باز است · هر زمان قابل لغو · تعداد بازدیدها را می‌بینی",
  },
  lost: { title: "اگر روزی گم شد، هر دقیقه مهم است", body: { d: "از پروندهٔ همراهت گزارش گم‌شدن بساز تا آگهی عمومی و پیگیری از یک‌جا انجام شود.", n: "از پروندهٔ {name} گزارش گم‌شدن بساز تا آگهی عمومی و پیگیری از یک‌جا انجام شود." } as NameAware, cta: "دیدن آگهی‌های گمشده" },
  memorial: { lightCandle: "روشن کردن شمع", candleLit: "شمع روشن است", lightFor: "روشن کردن شمع برای {name}", putOut: "خاموش کردن شمع {name}", newArch: "جای یاد همراه تو", newArchCaption: "یادبود تو", ctaBody: "برای همراهی که دیگر کنارت نیست، جایی برای ماندن بساز؛ عکس‌ها و خاطره‌هایش در پرونده‌اش می‌مانند.", cta: "ساخت یادبود" },
  kindness: { hint: "نشانگر را روی تصویر ببر", alt: "تصویرسازی: دستی که برای یک سگ و یک گربهٔ بی‌سرپناه کنار یک لانهٔ چوبی ظرف غذا می‌آورد" },
  partners: { roles: [{ title: "کلینیک و دامپزشک", body: "نوبت‌ها، بیماران و پرونده‌هایی که صاحبان حیوانات با شما به اشتراک می‌گذارند." }, { title: "ارائه‌دهندهٔ خدمات", body: "خدمات، تقویم کاری، رزروها و نظرهای مشتریان؛ از آرایش تا اقامت و سفر." }, { title: "فروشنده", body: "محصولات، موجودی، سفارش‌ها و تسویه‌حساب در یک پنل." }, { title: "مرکز حمایتی", body: "ثبت نیازهای مرکز، پیگیری کمک‌ها و مدیریت تیم." }] },
  final: { title: { d: "دنیای همراهت، از کنار تو شروع می‌شود", n: "دنیای {name}، از کنار تو شروع می‌شود" } as NameAware, body: { d: "اولین قدم، ساختن یک پرونده برای همراهت است.", n: "اولین قدم، ساختن یک پرونده برای {name} است." } as NameAware },
  hook: { text: { d: "پروندهٔ همراهت را بساز", n: "پروندهٔ {name} را بساز" } as NameAware, start: "شروع", close: "بستن" },
  cookie: { show: "نمایش کوکی", hide: "پنهان کردن کوکی", hello: "سلام {name}", play: "بازی؟", input: "اسمش چیه؟", go: "بزن بریم" },
  scenes: {
    s: ["یک جهان برای سگ، گربه، پرنده و همهٔ همراه‌ها.", "پروندهٔ سلامت همراهت، همیشه در دسترس.", "یادآور مراقبت، درست سر وقت.", "دامپزشک نزدیک را پیدا کن و نوبت بگیر.", "غذا و لوازم روزانه، با ارسال دوره‌ای.", "آرایش، شست‌وشو و اقامت؛ با رزرو آنلاین.", "اقامتگاه‌های پذیرای حیوان، برای سفر بعدی.", "بیمه و گزارش گم‌شدن، برای روزهای سخت.", "جامعه‌ای مهربان، و کمک به حیوانات نیازمند.", "دنیای او، از کنار تو شروع می‌شود."],
    k: ["اپت لایف", "پروندهٔ سلامت", "تقویم مراقبت", "دامپزشکی", "پت‌شاپ", "آرایش و اقامت", "سفر", "آرامش خاطر", "جامعه و حمایت", ""],
    tagline: "یک جهان برای حیوانات خانگی", healthTitle: "پروندهٔ سلامت", healthSub: "یک پرونده برای همه‌چیز", calendarTitle: "تقویم مراقبت",
    reminderMed: "داروی صبح، ساعت ۸", reminderVaccine: "یادآور واکسن سالانه", nearestClinic: "نزدیک‌ترین کلینیک", booked: "نوبت ثبت شد",
    repeat: "ارسال دوره‌ای", shop: "پت‌شاپ", grooming: "آرایش و شست‌وشو", boarding: "اقامت و نگهداری", petFriendly: "پذیرای حیوان",
    insurance: "بیمهٔ حیوان", lost: "گزارش گم‌شدن", support: "حمایت از حیوانات نیازمند", start: "از همین امروز شروع کن",
  },
};

export type OplCopy = typeof fa;

const en: OplCopy = {
  brand: "opetlife",
  header: { services: "Services", allServices: "All services", allServicesHint: "The full list of providers", partners: "Partners", theme: "Switch light and dark mode" },
  world: {
    eyebrow: "One identity for their whole world",
    title: { d: "Your companion's world starts here", n: "{name}'s world starts here" },
    lede: "Pick your question to see where opetlife can help. Everything you record stays in their record.",
    defaultName: "your companion",
    nameLabel: "What's your companion's name?",
    namePlaceholder: "For example, Cookie",
    speciesLabel: "Kind of companion",
    species: { dog: "Dog", cat: "Cat", bird: "Bird", rabbit: "Rabbit", other: "Other" },
    coreSub: "One record for everything",
    worldsLabel: "The five worlds of opetlife",
    worlds: {
      health: { q: "Are they doing well?", name: "Health and care", ck: "Health first", desc: "Health records, care reminders and vet appointments live side by side. Everything you record stays in one place, ready to share with a vet when you need to.", cta: { d: "Create your companion's record", n: "Create {name}'s record" }, feats: [{ n: "Health record", d: "Vaccines, medicines, allergies and visits" }, { n: "Care calendar", d: "Reminders for daily and monthly routines" }, { n: "Find a vet", d: "See providers and book an appointment" }, { n: "Share the record", d: "A temporary, revocable link for your vet" }] },
      daily: { q: "What do they need today?", name: "Shopping and services", ck: "Shopping time?", desc: "Food and supplies from the pet shop, and services like grooming, boarding and pet taxi from providers, booked and tracked in the same app.", cta: { d: "Go to the pet shop", n: "Go to the pet shop" }, feats: [{ n: "Pet shop", d: "Food, supplies and care products" }, { n: "Repeat delivery", d: "Recurring orders at the interval you choose" }, { n: "Grooming", d: "Book with providers" }, { n: "Boarding and taxi", d: "For when you're away or need to travel" }] },
      travel: { q: "Where shall we go together?", name: "Travel and stays", ck: "Trip time?", desc: "Search and compare pet-friendly stays, and keep travel plans and your companion's documents together.", cta: { d: "Plan a trip", n: "Plan a trip" }, feats: [{ n: "Find a stay", d: "Places that welcome pets" }, { n: "Compare stays", d: "Rules and amenities side by side" }, { n: "Trip plans", d: "Trips and their bookings in one place" }, { n: "Travel passport", d: "Travel documents in your companion's record" }] },
      safe: { q: "What if something happens?", name: "Peace of mind", ck: "Worry less", desc: "Compare insurance plans, and if your companion goes missing, create a report from their record so the public listing and follow-up happen in one place.", cta: { d: "Compare insurance", n: "Compare insurance" }, feats: [{ n: "Pet insurance", d: "See and compare plans" }, { n: "Lost pet report", d: "A public listing and follow-up from their record" }, { n: "ID card", d: "A shareable card to help them get home" }, { n: "Support", d: "Open a request and follow the reply" }] },
      together: { q: "What about everyone else?", name: "Community and kindness", ck: "New friends", desc: "Share experiences with other owners, help animals in need and keep the memories you share.", cta: { d: "Join the community", n: "Join the community" }, feats: [{ n: "Community", d: "Questions, experiences and conversations" }, { n: "Animal support", d: "Registered needs of support centres" }, { n: "Memories", d: "An album of the moments you shared" }, { n: "Year in review", d: "A summary of a year together" }] },
    },
  },
  reel: {
    eyebrow: "Wordless, with music and subtitles", title: "opetlife in 30 seconds", lede: "Every service in one short reel. Turn the sound on and start from any chapter.",
    label: "Service reel", play: "Play with music", replay: "Watch again", pause: "Pause", resume: "Play", mute: "Mute", unmute: "Unmute", music: "Instrumental music", chapters: "Reel chapters", end: "The end",
  },
  path: { sample: "Example", name: "Name", type: "Kind", photo: "Photo", added: "Added", chips: ["Vet", "Grooming", "Boarding", "Taxi"], timeline: ["Request sent", "Provider confirms", "Appointment day"] },
  share: {
    title: { d: "Share your companion's health record", n: "Share {name}'s health record" },
    sectionsLabel: "Which parts can they see?", durationLabel: "How long does it stay open?", previewLabel: "What your vet sees",
    sections: { vaccination: "Vaccinations", allergies: "Allergies", medications: "Medicines", conditions: "Conditions" },
    durations: ["24 hours", "3 days", "7 days"],
    recorded3: "3 records", recorded1: "1 record", unknown: "Unknown; not recorded yet",
    fromClinic: "From the clinic", fromYou: "From you", notRecorded: "Not recorded", hidden: "Hidden",
    foot: "The link stays open for {d} · revocable at any time · you can see how many times it was opened",
  },
  lost: { title: "If they ever go missing, every minute counts", body: { d: "Create a lost pet report from your companion's record so the public listing and follow-up happen in one place.", n: "Create a lost pet report from {name}'s record so the public listing and follow-up happen in one place." }, cta: "See lost pet listings" },
  memorial: { lightCandle: "Light a candle", candleLit: "Candle lit", lightFor: "Light a candle for {name}", putOut: "Put out the candle for {name}", newArch: "A place for your companion", newArchCaption: "Your memorial", ctaBody: "For a companion who is no longer by your side, make a place to stay; their photos and memories stay in their record.", cta: "Create a memorial" },
  kindness: { hint: "Move your pointer over the picture", alt: "Illustration: a hand bringing a bowl of food to a stray dog and cat beside a wooden kennel" },
  partners: { roles: [{ title: "Clinics and vets", body: "Appointments, patients and the records owners share with you." }, { title: "Service providers", body: "Services, working calendar, bookings and reviews, from grooming to boarding and travel." }, { title: "Sellers", body: "Products, inventory, orders and settlements in one panel." }, { title: "Support centres", body: "Post your centre's needs, follow donations and manage your team." }] },
  final: { title: { d: "Your companion's world starts by your side", n: "{name}'s world starts by your side" }, body: { d: "Take the first step: a record for your companion.", n: "Take the first step: a record for {name}." } },
  hook: { text: { d: "Create your companion's record", n: "Create {name}'s record" }, start: "Start", close: "Close" },
  cookie: { show: "Show Cookie", hide: "Hide Cookie", hello: "Hi {name}", play: "Play?", input: "What's their name?", go: "Let's go" },
  scenes: {
    s: ["One world for dogs, cats, birds and every companion.", "Your companion's health record, always at hand.", "Care reminders, right on time.", "Find a nearby vet and book an appointment.", "Food and supplies, with repeat delivery.", "Grooming, bathing and boarding, booked online.", "Pet-friendly stays for your next trip.", "Insurance and lost pet reports, for hard days.", "A kind community, and help for animals in need.", "Their world starts by your side."],
    k: ["opetlife", "Health record", "Care calendar", "Vets", "Pet shop", "Grooming and stays", "Travel", "Peace of mind", "Community", ""],
    tagline: "A world for pets", healthTitle: "Health record", healthSub: "One record for everything", calendarTitle: "Care calendar",
    reminderMed: "Morning medicine, 8:00", reminderVaccine: "Yearly vaccine reminder", nearestClinic: "Nearest clinic", booked: "Appointment booked",
    repeat: "Repeat delivery", shop: "Pet shop", grooming: "Grooming and bathing", boarding: "Boarding and care", petFriendly: "Pet-friendly",
    insurance: "Pet insurance", lost: "Lost pet report", support: "Help animals in need", start: "Start today",
  },
};

const de: OplCopy = {
  brand: "opetlife",
  header: { services: "Angebote", allServices: "Alle Angebote", allServicesHint: "Die vollständige Anbieterliste", partners: "Partner", theme: "Hellen und dunklen Modus wechseln" },
  world: {
    eyebrow: "Eine Identität für ihre ganze Welt",
    title: { d: "Die Welt deines Tieres beginnt hier", n: "Die Welt von {name} beginnt hier" },
    lede: "Wähle deine Frage und sieh, wo opetlife dir hilft. Alles, was du einträgst, bleibt in seinem Profil.",
    defaultName: "dein Tier",
    nameLabel: "Wie heißt dein Tier?",
    namePlaceholder: "Zum Beispiel Cookie",
    speciesLabel: "Tierart",
    species: { dog: "Hund", cat: "Katze", bird: "Vogel", rabbit: "Kaninchen", other: "Andere" },
    coreSub: "Ein Profil für alles",
    worldsLabel: "Die fünf Welten von opetlife",
    worlds: {
      health: { q: "Geht es ihm gut?", name: "Gesundheit und Pflege", ck: "Gesundheit zuerst", desc: "Gesundheitsakte, Pflegeerinnerungen und Tierarzttermine liegen nebeneinander. Alles, was du einträgst, bleibt an einem Ort und lässt sich bei Bedarf mit der Tierarztpraxis teilen.", cta: { d: "Profil für dein Tier erstellen", n: "Profil für {name} erstellen" }, feats: [{ n: "Gesundheitsakte", d: "Impfungen, Medikamente, Allergien und Besuche" }, { n: "Pflegekalender", d: "Erinnerungen für tägliche und monatliche Routinen" }, { n: "Tierarzt finden", d: "Anbieter ansehen und Termin buchen" }, { n: "Akte teilen", d: "Ein befristeter, widerrufbarer Link für die Praxis" }] },
      daily: { q: "Was braucht es heute?", name: "Einkauf und Dienste", ck: "Einkaufen?", desc: "Futter und Zubehör aus dem Shop sowie Dienste wie Pflege, Betreuung und Tiertaxi von Anbietern, gebucht und verfolgt in derselben App.", cta: { d: "Zum Shop", n: "Zum Shop" }, feats: [{ n: "Tiershop", d: "Futter, Zubehör und Pflegeprodukte" }, { n: "Wiederkehrende Lieferung", d: "Bestellungen im gewünschten Abstand" }, { n: "Fellpflege", d: "Termine bei Anbietern buchen" }, { n: "Betreuung und Taxi", d: "Wenn du weg bist oder ihr unterwegs seid" }] },
      travel: { q: "Wohin reisen wir zusammen?", name: "Reisen und Unterkünfte", ck: "Auf Reisen?", desc: "Tierfreundliche Unterkünfte suchen und vergleichen und Reisepläne sowie Dokumente deines Tieres zusammen aufbewahren.", cta: { d: "Reise planen", n: "Reise planen" }, feats: [{ n: "Unterkunft suchen", d: "Orte, an denen Tiere willkommen sind" }, { n: "Unterkünfte vergleichen", d: "Regeln und Ausstattung nebeneinander" }, { n: "Reisepläne", d: "Reisen und Buchungen an einem Ort" }, { n: "Reisepass", d: "Reisedokumente im Profil deines Tieres" }] },
      safe: { q: "Was, wenn etwas passiert?", name: "Sicherheit", ck: "Ganz entspannt", desc: "Versicherungen vergleichen und, falls dein Tier vermisst wird, aus seinem Profil eine Meldung erstellen, damit Aushang und Nachverfolgung an einem Ort laufen.", cta: { d: "Versicherungen vergleichen", n: "Versicherungen vergleichen" }, feats: [{ n: "Tierversicherung", d: "Tarife ansehen und vergleichen" }, { n: "Vermisstenmeldung", d: "Öffentlicher Aushang und Nachverfolgung" }, { n: "Ausweiskarte", d: "Eine teilbare Karte für den Heimweg" }, { n: "Hilfe", d: "Anfrage stellen und Antwort verfolgen" }] },
      together: { q: "Und die anderen?", name: "Gemeinschaft und Hilfe", ck: "Neue Freunde", desc: "Erfahrungen mit anderen Haltern teilen, Tieren in Not helfen und gemeinsame Erinnerungen bewahren.", cta: { d: "Der Gemeinschaft beitreten", n: "Der Gemeinschaft beitreten" }, feats: [{ n: "Gemeinschaft", d: "Fragen, Erfahrungen und Gespräche" }, { n: "Tierhilfe", d: "Gemeldeter Bedarf von Hilfszentren" }, { n: "Erinnerungen", d: "Ein Album eurer gemeinsamen Momente" }, { n: "Jahresrückblick", d: "Ein Jahr Zusammenleben im Überblick" }] },
    },
  },
  reel: {
    eyebrow: "Ohne Worte, mit Musik und Untertiteln", title: "opetlife in 30 Sekunden", lede: "Alle Angebote in einem kurzen Reel. Ton an und bei jedem Kapitel einsteigen.",
    label: "Angebots-Reel", play: "Mit Musik abspielen", replay: "Noch einmal ansehen", pause: "Pause", resume: "Abspielen", mute: "Stumm schalten", unmute: "Ton an", music: "Instrumentalmusik", chapters: "Kapitel", end: "Ende",
  },
  path: { sample: "Beispiel", name: "Name", type: "Art", photo: "Foto", added: "Hinzugefügt", chips: ["Tierarzt", "Fellpflege", "Betreuung", "Taxi"], timeline: ["Anfrage gesendet", "Anbieter bestätigt", "Termintag"] },
  share: {
    title: { d: "Gesundheitsakte deines Tieres teilen", n: "Gesundheitsakte von {name} teilen" },
    sectionsLabel: "Welche Bereiche sind sichtbar?", durationLabel: "Wie lange bleibt der Link offen?", previewLabel: "Das sieht die Tierarztpraxis",
    sections: { vaccination: "Impfungen", allergies: "Allergien", medications: "Medikamente", conditions: "Erkrankungen" },
    durations: ["24 Stunden", "3 Tage", "7 Tage"],
    recorded3: "3 Einträge", recorded1: "1 Eintrag", unknown: "Unbekannt; noch nicht eingetragen",
    fromClinic: "Von der Praxis", fromYou: "Von dir", notRecorded: "Nicht eingetragen", hidden: "Verborgen",
    foot: "Der Link bleibt {d} offen · jederzeit widerrufbar · du siehst, wie oft er geöffnet wurde",
  },
  lost: { title: "Wenn es einmal verschwindet, zählt jede Minute", body: { d: "Erstelle aus dem Profil deines Tieres eine Vermisstenmeldung, damit Aushang und Nachverfolgung an einem Ort laufen.", n: "Erstelle aus dem Profil von {name} eine Vermisstenmeldung, damit Aushang und Nachverfolgung an einem Ort laufen." }, cta: "Vermisstenmeldungen ansehen" },
  memorial: { lightCandle: "Kerze anzünden", candleLit: "Kerze brennt", lightFor: "Kerze für {name} anzünden", putOut: "Kerze für {name} löschen", newArch: "Ein Platz für dein Tier", newArchCaption: "Deine Erinnerung", ctaBody: "Für ein Tier, das nicht mehr bei dir ist: ein Ort zum Bleiben. Fotos und Erinnerungen bleiben in seinem Profil.", cta: "Erinnerung anlegen" },
  kindness: { hint: "Bewege den Zeiger über das Bild", alt: "Illustration: eine Hand bringt einem herrenlosen Hund und einer Katze neben einer Holzhütte eine Futterschale" },
  partners: { roles: [{ title: "Praxen und Tierärzte", body: "Termine, Patienten und die Akten, die Halter mit euch teilen." }, { title: "Dienstleister", body: "Angebote, Kalender, Buchungen und Bewertungen, von Pflege bis Betreuung und Reisen." }, { title: "Händler", body: "Produkte, Bestand, Bestellungen und Abrechnungen in einem Bereich." }, { title: "Hilfszentren", body: "Bedarf melden, Spenden verfolgen und das Team verwalten." }] },
  final: { title: { d: "Die Welt deines Tieres beginnt an deiner Seite", n: "Die Welt von {name} beginnt an deiner Seite" }, body: { d: "Der erste Schritt: ein Profil für dein Tier.", n: "Der erste Schritt: ein Profil für {name}." } },
  hook: { text: { d: "Profil für dein Tier erstellen", n: "Profil für {name} erstellen" }, start: "Los", close: "Schließen" },
  cookie: { show: "Cookie zeigen", hide: "Cookie ausblenden", hello: "Hallo {name}", play: "Spielen?", input: "Wie heißt es?", go: "Los geht's" },
  scenes: {
    s: ["Eine Welt für Hunde, Katzen, Vögel und alle Tiere.", "Die Gesundheitsakte deines Tieres, immer zur Hand.", "Pflegeerinnerungen, genau zur richtigen Zeit.", "Tierarzt in der Nähe finden und Termin buchen.", "Futter und Zubehör, mit wiederkehrender Lieferung.", "Pflege, Baden und Betreuung, online gebucht.", "Tierfreundliche Unterkünfte für die nächste Reise.", "Versicherung und Vermisstenmeldung für schwere Tage.", "Eine freundliche Gemeinschaft und Hilfe für Tiere in Not.", "Ihre Welt beginnt an deiner Seite."],
    k: ["opetlife", "Gesundheitsakte", "Pflegekalender", "Tierärzte", "Tiershop", "Pflege und Betreuung", "Reisen", "Sicherheit", "Gemeinschaft", ""],
    tagline: "Eine Welt für Haustiere", healthTitle: "Gesundheitsakte", healthSub: "Ein Profil für alles", calendarTitle: "Pflegekalender",
    reminderMed: "Morgenmedikament, 8:00", reminderVaccine: "Jährliche Impferinnerung", nearestClinic: "Nächste Praxis", booked: "Termin gebucht",
    repeat: "Wiederkehrende Lieferung", shop: "Tiershop", grooming: "Pflege und Baden", boarding: "Betreuung", petFriendly: "Tierfreundlich",
    insurance: "Tierversicherung", lost: "Vermisstenmeldung", support: "Tieren in Not helfen", start: "Heute starten",
  },
};

const es: OplCopy = {
  brand: "opetlife",
  header: { services: "Servicios", allServices: "Todos los servicios", allServicesHint: "La lista completa de proveedores", partners: "Socios", theme: "Cambiar entre modo claro y oscuro" },
  world: {
    eyebrow: "Una identidad para todo su mundo",
    title: { d: "El mundo de tu compañero empieza aquí", n: "El mundo de {name} empieza aquí" },
    lede: "Elige tu pregunta y descubre dónde te ayuda opetlife. Todo lo que registras se queda en su ficha.",
    defaultName: "tu compañero",
    nameLabel: "¿Cómo se llama tu compañero?",
    namePlaceholder: "Por ejemplo, Cookie",
    speciesLabel: "Tipo de compañero",
    species: { dog: "Perro", cat: "Gato", bird: "Ave", rabbit: "Conejo", other: "Otro" },
    coreSub: "Una ficha para todo",
    worldsLabel: "Los cinco mundos de opetlife",
    worlds: {
      health: { q: "¿Está bien?", name: "Salud y cuidado", ck: "Su salud primero", desc: "La ficha de salud, los recordatorios de cuidado y las citas veterinarias están juntos. Todo lo que registras queda en un solo lugar, listo para compartirlo con tu veterinario cuando haga falta.", cta: { d: "Crear la ficha de tu compañero", n: "Crear la ficha de {name}" }, feats: [{ n: "Ficha de salud", d: "Vacunas, medicamentos, alergias y visitas" }, { n: "Calendario de cuidado", d: "Recordatorios de rutinas diarias y mensuales" }, { n: "Buscar veterinario", d: "Ver proveedores y reservar cita" }, { n: "Compartir la ficha", d: "Un enlace temporal y revocable para tu veterinario" }] },
      daily: { q: "¿Qué necesita hoy?", name: "Compras y servicios", ck: "¿Vamos de compras?", desc: "Comida y accesorios de la tienda, y servicios como peluquería, alojamiento y taxi de proveedores, reservados y seguidos en la misma app.", cta: { d: "Ir a la tienda", n: "Ir a la tienda" }, feats: [{ n: "Tienda de mascotas", d: "Comida, accesorios y productos de cuidado" }, { n: "Envío periódico", d: "Pedidos repetidos cada cuanto quieras" }, { n: "Peluquería", d: "Reserva con proveedores" }, { n: "Alojamiento y taxi", d: "Para cuando no estás o tenéis que moveros" }] },
      travel: { q: "¿Adónde vamos juntos?", name: "Viajes y alojamiento", ck: "¿Nos vamos de viaje?", desc: "Busca y compara alojamientos que admiten mascotas y guarda juntos los planes de viaje y los documentos de tu compañero.", cta: { d: "Planear un viaje", n: "Planear un viaje" }, feats: [{ n: "Buscar alojamiento", d: "Lugares que admiten mascotas" }, { n: "Comparar alojamientos", d: "Normas y servicios lado a lado" }, { n: "Planes de viaje", d: "Viajes y reservas en un solo lugar" }, { n: "Pasaporte de viaje", d: "Documentos de viaje en su ficha" }] },
      safe: { q: "¿Y si pasa algo?", name: "Tranquilidad", ck: "Sin preocupaciones", desc: "Compara seguros y, si tu compañero se pierde, crea un aviso desde su ficha para que la publicación y el seguimiento estén en un solo lugar.", cta: { d: "Comparar seguros", n: "Comparar seguros" }, feats: [{ n: "Seguro para mascotas", d: "Ver y comparar planes" }, { n: "Aviso de pérdida", d: "Publicación y seguimiento desde su ficha" }, { n: "Tarjeta de identidad", d: "Una tarjeta para compartir y volver a casa antes" }, { n: "Ayuda", d: "Abrir una solicitud y seguir la respuesta" }] },
      together: { q: "¿Y los demás?", name: "Comunidad y ayuda", ck: "Nuevos amigos", desc: "Comparte experiencias con otros dueños, ayuda a animales que lo necesitan y guarda los recuerdos compartidos.", cta: { d: "Unirse a la comunidad", n: "Unirse a la comunidad" }, feats: [{ n: "Comunidad", d: "Preguntas, experiencias y conversaciones" }, { n: "Ayuda animal", d: "Necesidades registradas de los centros" }, { n: "Recuerdos", d: "Un álbum de los momentos compartidos" }, { n: "Resumen del año", d: "Un año de vida juntos" }] },
    },
  },
  reel: {
    eyebrow: "Sin palabras, con música y subtítulos", title: "opetlife en 30 segundos", lede: "Todos los servicios en un reel corto. Activa el sonido y empieza por cualquier capítulo.",
    label: "Reel de servicios", play: "Reproducir con música", replay: "Ver de nuevo", pause: "Pausa", resume: "Reproducir", mute: "Silenciar", unmute: "Activar sonido", music: "Música instrumental", chapters: "Capítulos", end: "Fin",
  },
  path: { sample: "Ejemplo", name: "Nombre", type: "Tipo", photo: "Foto", added: "Añadida", chips: ["Veterinario", "Peluquería", "Alojamiento", "Taxi"], timeline: ["Solicitud enviada", "El proveedor confirma", "Día de la cita"] },
  share: {
    title: { d: "Compartir la ficha de salud de tu compañero", n: "Compartir la ficha de salud de {name}" },
    sectionsLabel: "¿Qué partes pueden ver?", durationLabel: "¿Cuánto tiempo sigue abierto?", previewLabel: "Lo que ve tu veterinario",
    sections: { vaccination: "Vacunas", allergies: "Alergias", medications: "Medicamentos", conditions: "Enfermedades" },
    durations: ["24 horas", "3 días", "7 días"],
    recorded3: "3 registros", recorded1: "1 registro", unknown: "Desconocido; aún sin registrar",
    fromClinic: "De la clínica", fromYou: "Tuyo", notRecorded: "Sin registrar", hidden: "Oculto",
    foot: "El enlace sigue abierto {d} · revocable en cualquier momento · ves cuántas veces se abrió",
  },
  lost: { title: "Si alguna vez se pierde, cada minuto cuenta", body: { d: "Crea un aviso de pérdida desde la ficha de tu compañero para que la publicación y el seguimiento estén en un solo lugar.", n: "Crea un aviso de pérdida desde la ficha de {name} para que la publicación y el seguimiento estén en un solo lugar." }, cta: "Ver avisos de mascotas perdidas" },
  memorial: { lightCandle: "Encender una vela", candleLit: "Vela encendida", lightFor: "Encender una vela por {name}", putOut: "Apagar la vela de {name}", newArch: "Un lugar para tu compañero", newArchCaption: "Tu recuerdo", ctaBody: "Para un compañero que ya no está a tu lado, crea un lugar donde quedarse; sus fotos y recuerdos siguen en su ficha.", cta: "Crear un recuerdo" },
  kindness: { hint: "Pasa el puntero por la imagen", alt: "Ilustración: una mano lleva un cuenco de comida a un perro y un gato sin hogar junto a una caseta de madera" },
  partners: { roles: [{ title: "Clínicas y veterinarios", body: "Citas, pacientes y las fichas que los dueños comparten contigo." }, { title: "Proveedores de servicios", body: "Servicios, agenda, reservas y opiniones, de peluquería a alojamiento y viajes." }, { title: "Vendedores", body: "Productos, inventario, pedidos y liquidaciones en un solo panel." }, { title: "Centros de ayuda", body: "Publica las necesidades del centro, sigue las donaciones y gestiona tu equipo." }] },
  final: { title: { d: "El mundo de tu compañero empieza a tu lado", n: "El mundo de {name} empieza a tu lado" }, body: { d: "El primer paso: una ficha para tu compañero.", n: "El primer paso: una ficha para {name}." } },
  hook: { text: { d: "Crear la ficha de tu compañero", n: "Crear la ficha de {name}" }, start: "Empezar", close: "Cerrar" },
  cookie: { show: "Mostrar a Cookie", hide: "Ocultar a Cookie", hello: "Hola, {name}", play: "¿Jugamos?", input: "¿Cómo se llama?", go: "¡Vamos!" },
  scenes: {
    s: ["Un mundo para perros, gatos, aves y todos los compañeros.", "La ficha de salud de tu compañero, siempre a mano.", "Recordatorios de cuidado, justo a tiempo.", "Encuentra un veterinario cercano y reserva cita.", "Comida y accesorios, con envío periódico.", "Peluquería, baño y alojamiento, reservados en línea.", "Alojamientos que admiten mascotas para tu próximo viaje.", "Seguro y avisos de pérdida, para los días difíciles.", "Una comunidad amable y ayuda para animales que lo necesitan.", "Su mundo empieza a tu lado."],
    k: ["opetlife", "Ficha de salud", "Calendario", "Veterinarios", "Tienda", "Peluquería y alojamiento", "Viajes", "Tranquilidad", "Comunidad", ""],
    tagline: "Un mundo para las mascotas", healthTitle: "Ficha de salud", healthSub: "Una ficha para todo", calendarTitle: "Calendario de cuidado",
    reminderMed: "Medicina de la mañana, 8:00", reminderVaccine: "Recordatorio de vacuna anual", nearestClinic: "Clínica más cercana", booked: "Cita reservada",
    repeat: "Envío periódico", shop: "Tienda", grooming: "Peluquería y baño", boarding: "Alojamiento", petFriendly: "Admite mascotas",
    insurance: "Seguro para mascotas", lost: "Aviso de pérdida", support: "Ayuda a animales", start: "Empieza hoy",
  },
};

export const oplCopy: Record<RouteLocale, OplCopy> = { fa, en, de, es };
