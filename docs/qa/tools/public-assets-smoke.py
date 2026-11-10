"""Bounded, anonymous owned-asset check. Never prints cookies or page bodies."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit
from urllib.request import urlopen

BASE = "https://opetlife.ir"


def version():
    with urlopen(BASE + "/api/health/version", timeout=20) as response:
        return json.loads(response.read()).get("sha")


def run(args):
    if version() != args.expected_sha:
        raise SystemExit("BLOCKED: production SHA differs before asset check")
    rows = []
    assets = {}
    for locale in ["fa", "en", "de", "es"]:
        for route in ["help", "legal", "status"]:
            path = f"/{locale}/{route}"
            with urlopen(BASE + path, timeout=20) as response:
                html = response.read(3_000_000).decode()
                cache = response.headers.get("Cache-Control", "")
            references = re.findall(r'<script[^>]+src="([^"]+)"', html)
            references += re.findall(r'<link(?=[^>]*rel="stylesheet")[^>]*href="([^"]+)"', html)
            owned = []
            for reference in references:
                url = urljoin(BASE, reference)
                parsed = urlsplit(url)
                if parsed.scheme != "https" or parsed.hostname != "opetlife.ir" or not parsed.path.startswith("/_next/static/"):
                    continue
                owned.append(url)
                if url in assets:
                    continue
                try:
                    with urlopen(url, timeout=20) as asset:
                        asset.read(1)
                        content_type = asset.headers.get("Content-Type", "").split(";")[0]
                        expected = ["text/css"] if parsed.path.endswith(".css") else ["application/javascript", "text/javascript"]
                        passed = asset.status == 200 and asset.geturl() == url and content_type in expected
                        assets[url] = {"http": asset.status, "contentType": content_type, "direct": asset.geturl() == url, "status": "PASS" if passed else "FAIL"}
                except HTTPError as error:
                    assets[url] = {"http": error.code, "status": "FAIL"}
            passed = bool(owned) and all(assets[url]["status"] == "PASS" for url in owned) and "no-store" in cache.lower()
            rows.append({"testId": f"QA-PUBLIC-ASSETS-{locale}-{route}", "route": path, "sha": args.expected_sha, "environment": "production, anonymous read-only", "dateUtc": datetime.now(timezone.utc).isoformat(), "cacheControl": cache, "ownedReferences": len(owned), "failedAssetPaths": [urlsplit(url).path for url in owned if assets[url]["status"] != "PASS"], "freshHtml": "no-store" in cache.lower(), "status": "PASS" if passed else "FAIL", "limitations": "No browser hydration, private record or content/publication verification"})
    if version() != args.expected_sha:
        raise SystemExit("BLOCKED: production SHA changed during asset check")
    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    (output / "results.json").write_text(json.dumps({"routes": rows, "assets": assets}, ensure_ascii=False, indent=2))
    failed = sum(row["status"] != "PASS" for row in rows)
    print(json.dumps({"routes": len(rows), "uniqueAssets": len(assets), "failed": failed, "output": str(output)}))
    return 1 if failed else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--expected-sha", required=True)
    parser.add_argument("--output-dir", required=True)
    raise SystemExit(run(parser.parse_args()))
