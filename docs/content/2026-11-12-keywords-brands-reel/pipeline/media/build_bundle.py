#!/usr/bin/env python3
"""Builds bundle/bundle.json for apps/api/scripts/import-article-bundle.ts from the articles, plan and renders."""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(HERE, "out")
LOCALES = ["fa", "en", "de", "es"]

PLAN_FILE = sys.argv[sys.argv.index("--plan") + 1] if "--plan" in sys.argv else os.path.join(ROOT, "articles", "plan.json")
BUNDLE_DIR = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else "bundle"
plan = json.load(open(PLAN_FILE, encoding="utf-8"))
scene_alts = json.loads(subprocess.check_output(["node", "-e", "const s=Object.assign({},require('./scenes'),require('./scenes-b'));const o={};for(const k in s)o[k]=s[k].alt;console.log(JSON.stringify(o))"], cwd=HERE))

CATEGORIES = [
    {"key": "training", "locales": [
        {"locale": "fa", "name": "آموزش و رفتار", "slug": "training-and-behaviour", "description": "آموزش توله‌سگ و سگ بالغ، تربیت گربه و حل مشکلات رفتاری با روش‌های تشویقی و بدون تنبیه."},
        {"locale": "en", "name": "Training & behaviour", "slug": "training-and-behaviour", "description": "Reward-based training for puppies, adult dogs and cats, and calm fixes for common behaviour problems."},
        {"locale": "de", "name": "Erziehung & Verhalten", "slug": "erziehung-und-verhalten", "description": "Belohnungsbasierte Erziehung für Welpen, Hunde und Katzen und ruhige Lösungen für typische Verhaltensprobleme."},
        {"locale": "es", "name": "Educación y comportamiento", "slug": "educacion-y-comportamiento", "description": "Educación en positivo para cachorros, perros y gatos, y soluciones tranquilas a problemas de conducta comunes."}]},
    {"key": "care", "locales": [
        {"locale": "fa", "name": "مراقبت و سلامت", "slug": "care-and-health", "description": "تغذیه، واکسن، انگل‌ها و نشانه‌های بیماری در سگ و گربه؛ و اینکه چه زمانی باید به دامپزشک مراجعه کنید."},
        {"locale": "en", "name": "Care and health", "slug": "care-and-health", "description": "Feeding, vaccines, parasites and signs of illness in dogs and cats, and when to see a vet."},
        {"locale": "de", "name": "Pflege & Gesundheit", "slug": "pflege-und-gesundheit", "description": "Ernährung, Impfungen, Parasiten und Krankheitszeichen bei Hund und Katze – und wann du zum Tierarzt solltest."},
        {"locale": "es", "name": "Cuidado y salud", "slug": "cuidado-y-salud", "description": "Alimentación, vacunas, parásitos y señales de enfermedad en perros y gatos, y cuándo ir al veterinario."}]},
    {"key": "services", "locales": [
        {"locale": "fa", "name": "خرید و خدمات", "slug": "shopping-and-services", "description": "راهنمای خرید غذا و لوازم و انتخاب خدمات سگ و گربه: دامپزشک، پانسیون، آرایشگاه، مربی، پت تاکسی و بیمه."},
        {"locale": "en", "name": "Shopping & services", "slug": "shopping-and-services", "description": "How to buy food and gear and choose services for dogs and cats: vets, boarding, grooming, trainers, pet taxis and insurance."},
        {"locale": "de", "name": "Einkauf & Services", "slug": "einkauf-und-services", "description": "Futter und Zubehör kaufen und Services für Hund und Katze auswählen: Tierarzt, Pension, Hundefriseur, Training, Tiertaxi, Versicherung."},
        {"locale": "es", "name": "Compras y servicios", "slug": "compras-y-servicios", "description": "Cómo comprar comida y accesorios y elegir servicios para perros y gatos: veterinario, residencia, peluquería, adiestrador, taxi y seguro."}]},
]

TAGS = {
    "dog": [("سگ", "dog"), ("Dogs", "dog"), ("Hunde", "hunde"), ("Perros", "perros")],
    "cat": [("گربه", "cat"), ("Cats", "cat"), ("Katzen", "katzen"), ("Gatos", "gatos")],
    "puppy": [("توله‌سگ", "puppy"), ("Puppies", "puppy"), ("Welpen", "welpen"), ("Cachorros", "cachorros")],
    "kitten": [("بچه‌گربه", "kitten"), ("Kittens", "kitten"), ("Kitten", "kitten"), ("Gatitos", "gatitos")],
    "training": [("آموزش", "training"), ("Training", "training"), ("Erziehung", "erziehung"), ("Adiestramiento", "adiestramiento")],
    "behaviour": [("رفتار", "behaviour"), ("Behaviour", "behaviour"), ("Verhalten", "verhalten"), ("Comportamiento", "comportamiento")],
    "nutrition": [("تغذیه", "nutrition"), ("Nutrition", "nutrition"), ("Ernährung", "ernaehrung"), ("Alimentación", "alimentacion")],
    "vaccination": [("واکسیناسیون", "vaccination"), ("Vaccination", "vaccination"), ("Impfung", "impfung"), ("Vacunación", "vacunacion")],
    "health": [("سلامت", "health"), ("Health", "health"), ("Gesundheit", "gesundheit"), ("Salud", "salud")],
    "parasites": [("انگل‌ها", "parasites"), ("Parasites", "parasites"), ("Parasiten", "parasiten"), ("Parásitos", "parasitos")],
    "emergency": [("اورژانس", "emergency"), ("Emergencies", "emergency"), ("Notfälle", "notfaelle"), ("Urgencias", "urgencias")],
    "shopping": [("خرید", "shopping"), ("Shopping", "shopping"), ("Einkauf", "einkauf"), ("Compras", "compras")],
    "services": [("خدمات", "services"), ("Services", "services"), ("Services", "services"), ("Servicios", "servicios")],
    "grooming": [("آرایش و نظافت", "grooming"), ("Grooming", "grooming"), ("Fellpflege", "fellpflege"), ("Peluquería", "peluqueria")],
    "travel": [("سفر", "travel"), ("Travel", "travel"), ("Reisen", "reisen"), ("Viajes", "viajes")],
    "brands": [("برندها", "brands"), ("Brands", "brands"), ("Marken", "marken"), ("Marcas", "marcas")],
}


def load(article_id, locale):
    path = os.path.join(ROOT, "articles", str(article_id), f"{locale}.md")
    return json.loads(subprocess.check_output(["python3", "-I", os.path.join(ROOT, "tools", "md2rich.py"), path, "--json"], encoding="utf-8"))


def main():
    require_media = "--allow-missing-media" not in sys.argv
    articles = []
    missing = []
    only = set(int(x) for x in sys.argv[sys.argv.index("--ids") + 1].split(",")) if "--ids" in sys.argv else None
    for item in plan["articles"]:
        aid = item["id"]
        if only and aid not in only:
            continue
        manifest_path = os.path.join(OUT, "manifest", f"{aid}.json")
        manifest = json.load(open(manifest_path, encoding="utf-8")) if os.path.exists(manifest_path) else {"locales": {}}
        cover = manifest.get("cover")
        locales = {}
        for locale in LOCALES:
            a = load(aid, locale)
            m = a["meta"]
            media = manifest["locales"].get(locale, {})
            video = media.get("video")
            info = media.get("infographic")
            if not video or not info or not cover:
                missing.append(f"{aid}/{locale}")
            entry = {"title": m["title"], "slug": m["slug"], "excerpt": m["excerpt"], "seoTitle": m["seoTitle"], "seoDescription": m["seoDescription"], "body": a["body"]}
            if m["slug"] != item["slugs"][locale]:
                raise SystemExit(f"slug mismatch {aid}/{locale}: {m['slug']} != {item['slugs'][locale]}")
            if video:
                entry["video"] = {"file": video["file"], "poster": video["poster"], "width": video["width"], "height": video["height"], "durationSeconds": video["durationSeconds"], "title": m["videoTitle"], "description": m["videoDescription"]}
            if info:
                entry["infographic"] = {"file": info["file"], "width": info["width"], "height": info["height"], "alt": m["infographicAlt"]}
            locales[locale] = entry
        articles.append({
            "key": f"seo-2026-11-{aid:02d}-{item['slugs']['en']}",
            "category": item["pillar"],
            "tags": item["tags"],
            # The cover is shared by every language, so its alt stays empty and each page falls back to its own title.
            "cover": {"file": cover["file"], "width": cover["width"], "height": cover["height"], "alt": None} if cover else None,
            "locales": locales,
        })
    if "--only-complete" in sys.argv:
        incomplete = {m.split("/")[0] for m in missing}
        articles = [a for a, item in zip(articles, plan["articles"]) if str(item["id"]) not in incomplete]
        missing = []
    if missing and require_media:
        raise SystemExit(f"media not rendered yet for: {', '.join(missing)}")
    bundle = {
        "author": {"name": "تحریریهٔ اپت‌لایف · opetlife editorial", "bio": "Practical, vet-informed guides for living with dogs and cats."},
        "categories": CATEGORIES,
        "tags": [{"key": k, "locales": [{"locale": l, "name": n, "slug": s} for l, (n, s) in zip(LOCALES, v)]} for k, v in TAGS.items()],
        "articles": articles,
        "coverAlts": scene_alts,
    }
    os.makedirs(os.path.join(HERE, BUNDLE_DIR), exist_ok=True)
    with open(os.path.join(HERE, BUNDLE_DIR, "bundle.json"), "w", encoding="utf-8") as f:
        json.dump(bundle, f, ensure_ascii=False, indent=1)
    print(f"bundle: {len(articles)} articles, {sum(len(a['locales']) for a in articles)} locales, missing media: {len(missing)}")


if __name__ == "__main__":
    main()
