"""Anonymous URL/body/theme/display persistence check; no saved-account claim."""
import argparse
import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
from urllib.request import urlopen
from playwright.async_api import async_playwright, expect

ROOT = Path(__file__).resolve().parents[3]
BASE = "https://opetlife.ir"


def version():
    with urlopen(BASE + "/api/health/version", timeout=20) as response:
        return json.loads(response.read()).get("sha")


async def run(args):
    if version() != args.expected_sha:
        raise SystemExit("BLOCKED: production SHA differs before test")
    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    results = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox", "--disable-dev-shm-usage"])
        context = await browser.new_context(viewport={"width": 390, "height": 844}, reduced_motion="reduce")
        page = await context.new_page()
        mutations = []
        page.on("request", lambda r: mutations.append(r.method) if r.method not in ["GET", "HEAD", "OPTIONS"] else None)
        await page.goto(BASE + "/fa/help/faq?q=qa-route-context", wait_until="networkidle")
        initial = json.loads((ROOT / "apps/web/messages/fa.json").read_text())
        await page.get_by_text(initial["publicHelp"]["noFaq"], exact=True).wait_for()
        theme_button = page.locator("header.public-site-header .public-header-actions button").first
        theme_keys = ["system", "light", "dark"]
        for _ in range(3):
            label = await theme_button.get_attribute("aria-label")
            current = next(key for key in theme_keys if label.split("→")[0].strip() == initial["theme"][key])
            if current == "dark":
                break
            next_index = (theme_keys.index(current) + 1) % 3
            await theme_button.click()
            await expect(theme_button).to_have_attribute("aria-label", initial["theme"][theme_keys[next_index]] + " → " + initial["theme"][theme_keys[(next_index + 1) % 3]])
        display_button = page.locator("header.public-site-header .public-header-actions button[aria-pressed]")
        if await display_button.get_attribute("aria-pressed") != "true":
            await display_button.click()
        await expect(display_button).to_have_attribute("aria-pressed", "true")
        for locale in ["de", "es", "en", "fa"]:
            copy = json.loads((ROOT / f"apps/web/messages/{locale}.json").read_text())["publicHelp"]
            # Inspect the real control before selecting; no forced click or URL rewrite.
            switcher = page.locator("header.public-site-header select")
            await switcher.evaluate("el=>({value:el.value,options:[...el.options].map(o=>o.value)})")
            await switcher.select_option(locale)
            await page.wait_for_url(f"**/{locale}/help/faq?q=qa-route-context", timeout=15000)
            await page.get_by_text(copy["noFaq"], exact=True).wait_for()
            response = await page.reload(wait_until="networkidle")
            await page.get_by_text(copy["noFaq"], exact=True).wait_for()
            info = await page.locator("html").evaluate("el=>({lang:el.lang,dir:el.dir,theme:el.dataset.theme,display:el.dataset.displayMode})")
            selected = await page.locator("header.public-site-header select").input_value()
            overflow = await page.evaluate("document.documentElement.scrollWidth>innerWidth")
            evidence = f"{locale}-after-switch-refresh.png"
            await page.screenshot(path=str(output / evidence), full_page=True)
            passed = response.status == 200 and info["lang"] == locale and info["dir"] == ("rtl" if locale == "fa" else "ltr") and info["theme"] == "dark" and info["display"] == "simple" and selected == locale and not overflow and not mutations
            results.append({"testId": f"QA-LOCALE-SWITCH-{locale}", "sha": args.expected_sha, "dateUtc": datetime.now(timezone.utc).isoformat(), "browser": browser.version, "environment": "production, anonymous read-only", "viewport": [390, 844], "route": f"/{locale}/help/faq?q=qa-route-context", "bodyState": copy["noFaq"], "observed": info, "selected": selected, "overflow": overflow, "mutationMethods": list(mutations), "status": "PASS" if passed else "FAIL", "evidence": evidence, "limitations": "URL/query and browser-local preferences only; no authenticated account preference saved, no private household/pet context tested"})
        display_button = page.locator("header.public-site-header .public-header-actions button[aria-pressed]")
        await display_button.click()
        await expect(display_button).to_have_attribute("aria-pressed", "false")
        after = await page.locator("html").evaluate("el=>({lang:el.lang,theme:el.dataset.theme,display:el.dataset.displayMode||null})")
        await page.screenshot(path=str(output / "fa-display-disabled.png"), full_page=True)
        results.append({"testId": "QA-DISPLAY-REVERSIBLE", "sha": args.expected_sha, "environment": "production, anonymous read-only", "dateUtc": datetime.now(timezone.utc).isoformat(), "observed": after, "status": "PASS" if after["lang"] == "fa" and after["theme"] == "dark" and after["display"] is None and not mutations else "FAIL", "evidence": "fa-display-disabled.png", "limitations": "Real UI controls used; no init script reset preferences during navigation/refresh"})
        await context.close()
        await browser.close()
    if version() != args.expected_sha:
        raise SystemExit("BLOCKED: production changed during test")
    (output / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2))
    failed = sum(row["status"] != "PASS" for row in results)
    print(json.dumps({"cases": len(results), "failed": failed, "output": str(output)}))
    return 1 if failed else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--expected-sha", required=True)
    parser.add_argument("--output-dir", required=True)
    raise SystemExit(asyncio.run(run(parser.parse_args())))
