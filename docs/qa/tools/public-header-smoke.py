"""Read-only public navigation check; --candidate-css is NOT live verification."""
import argparse
import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
from urllib.request import urlopen
from playwright.async_api import async_playwright

BASE = "https://opetlife.ir"
ROOT = Path(__file__).resolve().parents[3]


def version():
    with urlopen(BASE + "/api/health/version", timeout=20) as response:
        return json.loads(response.read()).get("sha")


async def run(args):
    if version() != args.expected_sha:
        raise SystemExit("NOT TESTED: unexpected production SHA")
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    css = None
    if args.candidate_css:
        source = (ROOT / "apps/web/app/globals.css").read_text()
        start = source.index("/* Public header mobile reflow:")
        end = source.index("/* End public header mobile reflow. */", start)
        css = source[start:end]
        css += "\n" + (ROOT / "apps/web/features/app-shell/public-footer.css").read_text()
    results = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox", "--disable-dev-shm-usage"])
        for locale, width, theme, simple in [("fa", 320, "LIGHT", False), ("es", 390, "DARK", True),
                ("de", 390, "LIGHT", False), ("en", 768, "DARK", False),
                ("fa", 1440, "LIGHT", False), ("de", 1440, "DARK", False)]:
            catalog = json.loads((ROOT / f"apps/web/messages/{locale}.json").read_text())
            context = await browser.new_context(viewport={"width": width, "height": 900}, reduced_motion="reduce")
            await context.add_init_script(f"localStorage.setItem('petlife-theme','{theme}')")
            if simple:
                await context.add_init_script("localStorage.setItem('petlife-display-mode','simple')")
            page = await context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)[:180]))
            response = await page.goto(f"{BASE}/{locale}/services", wait_until="networkidle")
            if css:
                await page.add_style_tag(content=css)
                await page.locator("footer.park-footer").evaluate("el=>el.classList.add('public-route-footer')")
            await page.wait_for_timeout(700)
            header = page.locator("header.public-site-header")
            controls = await header.evaluate("""header => [...header.querySelectorAll('button,select,a')].map(el=>{
                const r=el.getBoundingClientRect(), top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
                return {tag:el.tagName,label:el.getAttribute('aria-label')||el.textContent.trim(),
                    width:r.width,height:r.height,reachable:top===el||el.contains(top)};
            }).filter(c=>c.width>0&&c.height>0)""")
            overflow = await page.evaluate("document.documentElement.scrollWidth>innerWidth")
            initial = f"{locale}-{width}-initial.png"
            await page.screenshot(path=str(out / initial))
            current_theme = await header.locator(".public-header-actions button").first.get_attribute("aria-label")
            next_key = "dark" if theme == "LIGHT" else "system"
            expected_theme = catalog["theme"][theme.lower()] + " → " + catalog["theme"][next_key]
            menu_opened = menu_closed = None
            links = []
            menu_image = None
            if width < 1024:
                # Fresh header DOM/geometry above identifies the visible button;
                # do not force a click through another control.
                await page.get_by_role("button", name=catalog["publicNavigation"]["main"], exact=True).click(timeout=5000)
                dialog = page.get_by_role("dialog")
                await dialog.wait_for(state="visible")
                menu_opened = True
                links = await dialog.locator("a").evaluate_all("nodes=>nodes.map(n=>n.getAttribute('href'))")
                menu_image = f"{locale}-{width}-menu.png"
                await page.screenshot(path=str(out / menu_image))
                # Inspect the visible dialog before keyboard dismissal.
                await dialog.inner_text()
                await page.keyboard.press("Escape")
                await dialog.wait_for(state="hidden")
                menu_closed = True
            hit_pass = all(control["reachable"] for control in controls)
            touch_pass = all(control["width"] >= 44 and control["height"] >= 44 for control in controls if control["tag"] in ["BUTTON", "SELECT"])
            menu_pass = width >= 1024 or (menu_opened and menu_closed and bool(links) and all(link.startswith(f"/{locale}") for link in links))
            translation_pass = None if css else current_theme == expected_theme
            footer = page.locator("footer.public-route-footer")
            await footer.scroll_into_view_if_needed()
            footer_info = await footer.evaluate("""el=>({columns:getComputedStyle(el.querySelector('.park-footer__main')).gridTemplateColumns,
                links:[...el.querySelectorAll('a')].map(a=>({href:a.getAttribute('href'),height:a.getBoundingClientRect().height})),
                overflow:document.documentElement.scrollWidth>innerWidth})""")
            footer_image = f"{locale}-{width}-footer.png"
            # A tall footer element screenshot can contain the sticky header
            # over its first rows. Capture the actual whole page from the top.
            await page.evaluate("scrollTo(0,0)")
            await page.screenshot(path=str(out / footer_image), full_page=True)
            footer_pass = footer_info["columns"] != "none" and not footer_info["overflow"] and all(link["height"] >= 44 for link in footer_info["links"])
            passed = response.status == 200 and hit_pass and touch_pass and menu_pass and footer_pass and not overflow and not errors and translation_pass is not False
            results.append({"testId": f"QA-NAV-01-{locale}-{width}", "sha": args.expected_sha,
                "environment": "production frontend + local candidate CSS" if css else "production",
                "liveStatus": "NOT LIVE" if css else "LIVE_VERIFIED" if passed else "FAIL",
                "dateUtc": datetime.now(timezone.utc).isoformat(), "browser": browser.version, "role": "anonymous",
                "viewport": [width, 900], "theme": theme, "simple": simple, "status": "PASS" if passed else "FAIL",
                "controls": controls, "menuOpened": menu_opened, "escapeClosed": menu_closed, "links": links,
                "themeLabel": current_theme, "expectedThemeLabel": expected_theme, "translationVerified": translation_pass,
                "overflow": overflow, "pageErrors": errors, "footer": footer_info, "evidence": [initial, menu_image, footer_image]})
            await context.close()
        await browser.close()
    if version() != args.expected_sha:
        raise SystemExit("BLOCKED: production version changed during capture")
    (out / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2))
    failed = sum(row["status"] != "PASS" for row in results)
    print(json.dumps({"cases": len(results), "failed": failed, "candidateOnly": bool(css), "output": str(out)}))
    return 1 if failed else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--expected-sha", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--candidate-css", action="store_true")
    raise SystemExit(asyncio.run(run(parser.parse_args())))
