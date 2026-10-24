/**
 * Demo content: five Persian (with English) dog/cat care articles — three guides (/guides) and two blog
 * posts (/blog). Idempotent (deterministic ids, upserts), non-destructive, and refuses any database that is
 * not *_test unless PETLIFE_QA_SEED_DATABASE names it. Cover images are the project's own illustrations,
 * recorded as demo media assets. Wording is deliberately cautious: general information, never a diagnosis.
 */
import { createHash } from "node:crypto";
import { AdminMembershipStatus, AdminRole, ArticleLifecycleStatus, Locale, PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const id = (key: string) => {
  const h = createHash("sha1").update(`content-demo:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

type Inline = { type: "text"; text: string; marks?: ("bold" | "italic")[] };
const t = (text: string, bold = false): Inline => (bold ? { type: "text", text, marks: ["bold"] } : { type: "text", text });
const p = (...content: Inline[]) => ({ type: "paragraph", content });
const h = (text: string) => ({ type: "heading", level: 2, content: [t(text)] });
const ul = (...items: string[]) => ({ type: "list", style: "bulleted", items: items.map((i) => [t(i)]) });
const warn = (text: string) => ({ type: "callout", tone: "warning", content: [t(text)] });
const info = (text: string) => ({ type: "callout", tone: "info", content: [t(text)] });

const VET_NOTE_FA = "این مطلب اطلاعات عمومی است و جای معاینه و تشخیص دامپزشک را نمی‌گیرد. برای تصمیم دربارهٔ حیوان خودتان با دامپزشک مشورت کنید.";
const VET_NOTE_EN = "This is general information, not a diagnosis or a substitute for a veterinary examination. Ask your vet about your own pet.";

interface DemoArticle {
  key: string;
  section: "guides" | "care";
  cover: { file: string; bytes: number; altFa: string; altEn: string };
  tags: string[];
  fa: { title: string; slug: string; excerpt: string; seoTitle: string; seoDescription: string; body: unknown[] };
  en: { title: string; slug: string; excerpt: string; seoTitle: string; seoDescription: string; body: unknown[] };
  publishedDaysAgo: number;
}

const ARTICLES: DemoArticle[] = [
  {
    key: "dog-vaccination",
    section: "guides",
    cover: { file: "/images/experience/vet-hero.png", bytes: 1955609, altFa: "دامپزشک در حال معاینهٔ سگ", altEn: "A vet examining a dog" },
    tags: ["dog", "vaccination", "puppy"],
    publishedDaysAgo: 3,
    fa: {
      title: "برنامهٔ واکسیناسیون سگ: از توله‌سگی تا بزرگسالی",
      slug: "dog-vaccination-schedule",
      excerpt: "واکسن‌های اصلی سگ، زمان‌بندی معمول برای توله‌ها و یادآورهای سالانه — و اینکه چرا برنامهٔ دقیق را باید دامپزشک تعیین کند.",
      seoTitle: "برنامه واکسیناسیون سگ و توله سگ | راهنمای پت‌لایف",
      seoDescription: "واکسن‌های ضروری سگ، زمان‌بندی معمول واکسن توله سگ، واکسن هاری و یادآور سالانه؛ راهنمای عمومی پت‌لایف.",
      body: [
        p(t("واکسیناسیون یکی از مؤثرترین راه‌های پیشگیری از بیماری‌های جدی در سگ‌هاست. برنامهٔ دقیق به سن، سابقهٔ سلامت، سبک زندگی و الزامات محلی بستگی دارد؛ این راهنما فقط تصویر کلی را نشان می‌دهد.")),
        h("واکسن‌های پایه (اصلی)"),
        ul("دیستمپر (Distemper)", "پاروویروس (Parvovirus)", "هپاتیت عفونی سگ (Adenovirus)", "هاری (Rabies) — در بسیاری از مناطق الزامی است"),
        h("زمان‌بندی معمول برای توله‌ها"),
        p(t("بسیاری از دامپزشکان واکسن‌های پایه را از حدود "), t("۶ تا ۸ هفتگی", true), t(" شروع می‌کنند و هر ۳ تا ۴ هفته تا حدود ۱۶ هفتگی تکرار می‌کنند. واکسن هاری معمولاً از حدود ۱۲ هفتگی تزریق می‌شود.")),
        h("بزرگسالی"),
        p(t("پس از دورهٔ اولیه، یادآورها معمولاً سالانه یا هر چند سال یک‌بار انجام می‌شوند؛ فاصلهٔ دقیق را دامپزشک بر اساس نوع واکسن تعیین می‌کند.")),
        info("در پت‌لایف می‌توانید سابقهٔ واکسن را در پروندهٔ سلامت ثبت کنید تا موعد بعدی به‌صورت خودکار یادآوری شود."),
        warn(VET_NOTE_FA),
      ],
    },
    en: {
      title: "Dog vaccination schedule: from puppy to adult",
      slug: "dog-vaccination-schedule",
      excerpt: "Core vaccines, a typical puppy timeline and annual boosters — and why your vet sets the exact plan.",
      seoTitle: "Dog and puppy vaccination schedule | PET LIFE guide",
      seoDescription: "Core dog vaccines, a typical puppy vaccination timeline, rabies and boosters — a general PET LIFE guide.",
      body: [
        p(t("Vaccination is one of the most effective ways to prevent serious disease in dogs. The exact plan depends on age, health history, lifestyle and local requirements; this guide gives the general picture.")),
        h("Core vaccines"),
        ul("Distemper", "Parvovirus", "Canine adenovirus (infectious hepatitis)", "Rabies — required in many places"),
        h("A typical puppy timeline"),
        p(t("Many vets start core vaccines at around "), t("6–8 weeks", true), t(", repeating every 3–4 weeks until about 16 weeks. Rabies is usually given from about 12 weeks.")),
        warn(VET_NOTE_EN),
      ],
    },
  },
  {
    key: "cat-nutrition-ages",
    section: "care",
    cover: { file: "/images/experience/shop-hero.png", bytes: 2438480, altFa: "غذا و لوازم حیوان خانگی", altEn: "Pet food and supplies" },
    tags: ["cat", "nutrition", "kitten"],
    publishedDaysAgo: 6,
    fa: {
      title: "تغذیهٔ گربه در سنین مختلف: بچه‌گربه، بالغ و سالمند",
      slug: "cat-nutrition-by-age",
      excerpt: "نیاز غذایی گربه با سن تغییر می‌کند. از تعداد وعده‌های بچه‌گربه تا کنترل وزن در سالمندی، نکات کلیدی را مرور کنید.",
      seoTitle: "تغذیه گربه در سنین مختلف | بچه گربه، گربه بالغ و سالمند",
      seoDescription: "غذای مناسب بچه گربه، گربه بالغ و گربه سالمند، تعداد وعده‌ها، آب کافی و کنترل وزن؛ راهنمای تغذیه گربه.",
      body: [
        p(t("گربه‌ها گوشت‌خوار اجباری‌اند و به پروتئین حیوانی باکیفیت نیاز دارند. مقدار و نوع غذا با سن، وزن و میزان فعالیت تغییر می‌کند.")),
        h("بچه‌گربه (تا حدود ۱۲ ماهگی)"),
        ul("غذای مخصوص رشد (Kitten) با انرژی و پروتئین بیشتر", "وعده‌های کوچک و متعدد در روز", "آب تازه همیشه در دسترس"),
        h("گربهٔ بالغ"),
        ul("غذای کامل و متعادل متناسب با وزن ایده‌آل", "ترکیب غذای خشک و تر می‌تواند به دریافت آب کمک کند", "اندازه‌گیری دقیق وعده‌ها برای پیشگیری از چاقی"),
        h("گربهٔ سالمند"),
        p(t("تغییر اشتها، وزن یا میزان آب‌خوردن در سالمندی را جدی بگیرید؛ این تغییرات گاهی نشانهٔ مشکلی است که باید بررسی شود.")),
        warn(VET_NOTE_FA),
      ],
    },
    en: {
      title: "Feeding your cat at every age: kitten, adult and senior",
      slug: "cat-nutrition-by-age",
      excerpt: "A cat's needs change with age — from frequent kitten meals to weight control in later years.",
      seoTitle: "Cat nutrition by age | kitten, adult and senior cats",
      seoDescription: "What to feed a kitten, adult and senior cat, meal frequency, hydration and weight control.",
      body: [
        p(t("Cats are obligate carnivores and need good-quality animal protein. How much and what they eat changes with age, weight and activity.")),
        h("Kittens"),
        ul("A growth (kitten) food with more energy and protein", "Small, frequent meals", "Fresh water always available"),
        h("Seniors"),
        p(t("Take changes in appetite, weight or drinking seriously in older cats; they can be a sign of something to check.")),
        warn(VET_NOTE_EN),
      ],
    },
  },
  {
    key: "vet-warning-signs",
    section: "guides",
    cover: { file: "/images/experience/auth-hero.png", bytes: 2000805, altFa: "حیوان خانگی در آغوش صاحبش", altEn: "A pet with its owner" },
    tags: ["dog", "cat", "emergency"],
    publishedDaysAgo: 9,
    fa: {
      title: "علائمی که نشان می‌دهد باید به دامپزشک مراجعه کنید",
      slug: "signs-to-see-a-vet",
      excerpt: "بعضی نشانه‌ها نیاز به مراجعهٔ فوری دارند و بعضی را می‌توان چند ساعت زیر نظر گرفت. فهرست علائم هشدار را بشناسید.",
      seoTitle: "علائم خطر در سگ و گربه | چه زمانی به دامپزشک مراجعه کنیم",
      seoDescription: "علائم اورژانسی در سگ و گربه، نشانه‌هایی که نیاز به مراجعه دامپزشک دارند و نکات پایش در خانه.",
      body: [
        warn("اگر حیوان شما در تنفس مشکل دارد، بیهوش شده، تشنج دارد یا خونریزی شدید دارد، بدون معطلی با نزدیک‌ترین درمانگاه شبانه‌روزی تماس بگیرید."),
        h("نیاز به مراجعهٔ فوری"),
        ul("تنفس دشوار یا با دهان باز در گربه", "استفراغ یا اسهال مکرر، به‌خصوص همراه با خون", "شکم متورم و دردناک در سگ", "ناتوانی در ادرار کردن", "خوردن مادهٔ سمی، دارو یا جسم خارجی"),
        h("مراجعه در اولین فرصت"),
        ul("بی‌اشتهایی بیش از یک روز", "لنگیدن یا درد هنگام لمس", "تغییر ناگهانی در رفتار یا میزان آب‌خوردن", "خارش یا ریزش شدید مو"),
        info("ثبت زمان شروع علائم، تغییر وزن و داروهای مصرفی در پروندهٔ سلامت پت‌لایف، گفت‌وگو با دامپزشک را دقیق‌تر می‌کند."),
        p(t(VET_NOTE_FA)),
      ],
    },
    en: {
      title: "Signs your pet needs to see a vet",
      slug: "signs-to-see-a-vet",
      excerpt: "Some signs need urgent care, others can be watched for a few hours. Know the warning list.",
      seoTitle: "Warning signs in dogs and cats | when to see a vet",
      seoDescription: "Emergency signs in dogs and cats, symptoms that need a vet visit and what to monitor at home.",
      body: [
        warn("If your pet struggles to breathe, collapses, has a seizure or is bleeding heavily, contact the nearest 24-hour clinic now."),
        h("Go now"),
        ul("Laboured or open-mouth breathing in a cat", "Repeated vomiting or diarrhoea, especially with blood", "A swollen, painful belly in a dog", "Unable to urinate", "Swallowed poison, medicine or an object"),
        p(t(VET_NOTE_EN)),
      ],
    },
  },
  {
    key: "dog-home-alone",
    section: "care",
    cover: { file: "/images/landing/pet-portrait.png", bytes: 1924489, altFa: "سگ آرام در خانه", altEn: "A calm dog at home" },
    tags: ["dog", "behaviour", "training"],
    publishedDaysAgo: 12,
    fa: {
      title: "آموزش تنها ماندن سگ در خانه، قدم‌به‌قدم",
      slug: "teaching-dog-to-stay-alone",
      excerpt: "تنها ماندن مهارتی است که باید آرام و تدریجی آموخته شود. یک برنامهٔ ساده برای شروع، و نشانه‌هایی که کمک تخصصی لازم دارند.",
      seoTitle: "آموزش تنها ماندن سگ در خانه | کاهش اضطراب جدایی",
      seoDescription: "روش تدریجی آموزش تنها ماندن سگ، آماده‌سازی محیط، اسباب‌بازی‌های سرگرم‌کننده و نشانه‌های اضطراب جدایی.",
      body: [
        p(t("بیشتر سگ‌ها می‌توانند یاد بگیرند مدتی تنها بمانند، به شرط اینکه تمرین از زمان‌های بسیار کوتاه شروع شود و به‌تدریج طولانی‌تر شود.")),
        h("برنامهٔ تدریجی"),
        ul("از چند ثانیه بیرون رفتن شروع کنید و قبل از بروز بی‌قراری برگردید", "زمان را آرام‌آرام بیشتر کنید", "رفتن و برگشتن را بی‌هیجان و عادی برگزار کنید", "قبل از رفتن، پیاده‌روی و بازی کافی داشته باشد"),
        h("محیط امن و سرگرم‌کننده"),
        p(t("یک فضای آرام با آب، جای خواب راحت و اسباب‌بازی‌های جویدنی یا پازل غذایی آماده کنید.")),
        warn("پارس یا زوزهٔ طولانی، تخریب، یا ادرار در خانه هنگام تنهایی ممکن است نشانهٔ اضطراب جدایی باشد. در این صورت با دامپزشک یا مربی رفتاری مشورت کنید."),
      ],
    },
    en: {
      title: "Teaching your dog to stay home alone, step by step",
      slug: "teaching-dog-to-stay-alone",
      excerpt: "Being alone is a skill learned slowly. A simple plan to start, and the signs that need expert help.",
      seoTitle: "Teaching a dog to be home alone | easing separation anxiety",
      seoDescription: "A gradual plan for leaving your dog alone, setting up the space, enrichment toys and signs of separation anxiety.",
      body: [
        p(t("Most dogs can learn to spend time alone if practice starts with very short absences that grow gradually.")),
        ul("Start with seconds and come back before restlessness begins", "Lengthen the time slowly", "Keep leaving and returning calm and ordinary"),
        warn("Long barking, destruction or house-soiling when alone can be separation anxiety — talk to your vet or a behaviour trainer."),
      ],
    },
  },
  {
    key: "dental-care",
    section: "guides",
    cover: { file: "/images/experience/grooming-hero.png", bytes: 1982677, altFa: "مراقبت و نظافت حیوان خانگی", altEn: "Pet grooming and care" },
    tags: ["dog", "cat", "dental"],
    publishedDaysAgo: 15,
    fa: {
      title: "مراقبت از دهان و دندان سگ و گربه",
      slug: "dog-cat-dental-care",
      excerpt: "جرم دندان و بیماری لثه در سگ و گربه رایج است. مسواک زدن، معاینهٔ منظم و نشانه‌هایی که نباید نادیده بگیرید.",
      seoTitle: "مراقبت از دندان سگ و گربه | مسواک، جرم‌گیری و بوی بد دهان",
      seoDescription: "آموزش مسواک زدن دندان سگ و گربه، پیشگیری از جرم و بیماری لثه، علائم مشکل دندان و زمان جرم‌گیری.",
      body: [
        p(t("بیماری‌های دهان و لثه در سگ‌ها و گربه‌ها، به‌ویژه با بالا رفتن سن، شایع‌اند و می‌توانند دردناک باشند.")),
        h("مراقبت در خانه"),
        ul("مسواک زدن منظم با خمیردندان مخصوص حیوانات — هرگز خمیردندان انسان", "شروع تدریجی و همراه با تشویق", "اسباب‌بازی یا تشویقی‌های دندانی به‌عنوان کمک، نه جایگزین مسواک"),
        h("نشانه‌های هشدار"),
        ul("بوی بد و مداوم دهان", "قرمزی یا خونریزی لثه", "جویدن یک‌طرفه یا بی‌میلی به غذای خشک", "دندان لق یا شکسته"),
        p(t("جرم‌گیری حرفه‌ای را دامپزشک بر اساس معاینه پیشنهاد می‌کند.")),
        warn(VET_NOTE_FA),
      ],
    },
    en: {
      title: "Dental care for dogs and cats",
      slug: "dog-cat-dental-care",
      excerpt: "Tartar and gum disease are common in dogs and cats. Brushing, regular checks and signs not to ignore.",
      seoTitle: "Dog and cat dental care | brushing, tartar and bad breath",
      seoDescription: "How to brush a dog's or cat's teeth, preventing tartar and gum disease, signs of dental problems.",
      body: [
        p(t("Mouth and gum disease are common in dogs and cats, especially as they age, and can be painful.")),
        ul("Brush regularly with pet toothpaste — never human toothpaste", "Start gradually, with praise", "Dental chews help but don't replace brushing"),
        warn(VET_NOTE_EN),
      ],
    },
  },
];

const TAGS: Record<string, [string, string]> = {
  dog: ["سگ", "Dogs"], cat: ["گربه", "Cats"], vaccination: ["واکسیناسیون", "Vaccination"], puppy: ["توله‌سگ", "Puppies"], nutrition: ["تغذیه", "Nutrition"],
  kitten: ["بچه‌گربه", "Kittens"], emergency: ["اورژانس", "Emergencies"], behaviour: ["رفتار", "Behaviour"], training: ["آموزش", "Training"], dental: ["دندان", "Dental"],
};

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "").pathname;
  if (!database.endsWith("_test") && process.env.PETLIFE_QA_SEED_DATABASE !== database.slice(1)) {
    throw new Error("This demo seed runs against a *_test database, or a staging database named in PETLIFE_QA_SEED_DATABASE.");
  }
  // Content rows need an authoring admin. This demo editor is SUSPENDED: it can author seed rows but can
  // never act as an admin — no hidden access. Real admins are untouched.
  const editorUser = await db.user.upsert({ where: { email: "content-demo-editor@example.test" }, create: { id: id("editor-user"), email: "content-demo-editor@example.test", displayName: "تحریریهٔ پت‌لایف (نمایشی)", locale: "fa" }, update: {} });
  const editor = await db.adminUser.upsert({ where: { userId: editorUser.id }, create: { id: id("editor-admin"), userId: editorUser.id, role: AdminRole.CONTENT, status: AdminMembershipStatus.SUSPENDED }, update: { status: AdminMembershipStatus.SUSPENDED } });
  const author = await db.contentAuthor.upsert({ where: { id: id("author") }, create: { id: id("author"), name: "تحریریهٔ پت‌لایف", bio: "مطالب عمومی مراقبت؛ بازبینی‌شده برای لحن محتاطانه. جای مشاورهٔ دامپزشکی را نمی‌گیرد." }, update: {} });

  const categories = { guides: { fa: ["راهنماها", "guides"], en: ["Guides", "guides"] }, care: { fa: ["مراقبت و سلامت", "care-and-health"], en: ["Care and health", "care-and-health"] } } as const;
  for (const [key, loc] of Object.entries(categories)) {
    await db.category.upsert({ where: { id: id(`category:${key}`) }, create: { id: id(`category:${key}`) }, update: {} });
    for (const locale of [Locale.fa, Locale.en] as const) {
      const [name, slug] = loc[locale];
      await db.categoryLocale.upsert({ where: { categoryId_locale: { categoryId: id(`category:${key}`), locale } }, create: { categoryId: id(`category:${key}`), locale, name, slug }, update: { name, slug } });
    }
  }
  for (const [key, [fa, en]] of Object.entries(TAGS)) {
    await db.tag.upsert({ where: { id: id(`tag:${key}`) }, create: { id: id(`tag:${key}`) }, update: {} });
    await db.tagLocale.upsert({ where: { tagId_locale: { tagId: id(`tag:${key}`), locale: Locale.fa } }, create: { tagId: id(`tag:${key}`), locale: Locale.fa, name: fa, slug: key }, update: { name: fa } });
    await db.tagLocale.upsert({ where: { tagId_locale: { tagId: id(`tag:${key}`), locale: Locale.en } }, create: { tagId: id(`tag:${key}`), locale: Locale.en, name: en, slug: key }, update: { name: en } });
  }

  for (const a of ARTICLES) {
    const mediaId = id(`media:${a.key}`);
    await db.mediaAsset.upsert({
      where: { id: mediaId },
      create: { id: mediaId, key: `demo/${a.key}${a.cover.file.slice(a.cover.file.lastIndexOf("."))}`, url: a.cover.file, mimeType: "image/png", fileSizeBytes: a.cover.bytes, altText: a.cover.altFa, createdByAdminId: editor.id },
      update: { url: a.cover.file, altText: a.cover.altFa },
    });
    const articleId = id(`article:${a.key}`);
    await db.article.upsert({
      where: { id: articleId },
      create: { id: articleId, authorId: author.id, categoryId: id(`category:${a.section}`), coverMediaAssetId: mediaId, createdByAdminId: editor.id },
      update: { authorId: author.id, categoryId: id(`category:${a.section}`), coverMediaAssetId: mediaId },
    });
    const publishedAt = new Date(Date.now() - a.publishedDaysAgo * 86_400_000);
    for (const locale of [Locale.fa, Locale.en] as const) {
      const c = a[locale];
      const data = { title: c.title, slug: c.slug, excerpt: c.excerpt, body: c.body as never, seoTitle: c.seoTitle, seoDescription: c.seoDescription, status: ArticleLifecycleStatus.VISIBLE, lastEditedByAdminId: editor.id };
      await db.articleLocale.upsert({ where: { articleId_locale: { articleId, locale } }, create: { articleId, locale, ...data, publishedAt }, update: data });
    }
    for (const tag of a.tags) {
      await db.articleTag.upsert({ where: { articleId_tagId: { articleId, tagId: id(`tag:${tag}`) } }, create: { articleId, tagId: id(`tag:${tag}`) }, update: {} });
    }
  }
  console.log(`Seeded ${ARTICLES.length} demo articles (${ARTICLES.filter((a) => a.section === "guides").length} guides).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
