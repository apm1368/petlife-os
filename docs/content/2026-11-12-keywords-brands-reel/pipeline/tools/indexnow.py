#!/usr/bin/env python3
"""Submit a plan's article URLs (every locale) to IndexNow after publishing outside the admin editor.

Usage: python3 -I tools/indexnow.py articles/plan-b.json [--ids 21,22] [--dry-run]
Only URLs that answer 200 on the live site are submitted.
"""
import json
import sys
import urllib.request

HOST = "opetlife.ir"
KEY = "4a0befe853050c1497b259da2760af9f"
LOCALES = ["fa", "en", "de", "es"]


def status(url):
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": "opetlife-pipeline/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return 0


def main():
    plan = json.load(open(sys.argv[1], encoding="utf-8"))
    only = set(int(x) for x in sys.argv[sys.argv.index("--ids") + 1].split(",")) if "--ids" in sys.argv else None
    urls, skipped = [], []
    for a in plan["articles"]:
        if only and a["id"] not in only:
            continue
        for l in LOCALES:
            u = f"https://{HOST}/{l}/blog/{a['slugs'][l]}"
            (urls if status(u) == 200 else skipped).append(u)
    for l in LOCALES:
        urls.append(f"https://{HOST}/{l}/blog")
    urls.append(f"https://{HOST}/sitemap.xml")
    print(f"{len(urls)} urls live, {len(skipped)} not live: {skipped}")
    if "--dry-run" in sys.argv:
        return
    body = json.dumps({"host": HOST, "key": KEY, "keyLocation": f"https://{HOST}/{KEY}.txt", "urlList": urls}).encode()
    req = urllib.request.Request("https://api.indexnow.org/indexnow", data=body, method="POST", headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print("IndexNow", r.status)
    except urllib.error.HTTPError as e:
        print("IndexNow", e.code, e.read()[:200])


if __name__ == "__main__":
    main()
