#!/usr/bin/env python3
"""Write out/manifest/33.json for the Set Pet guide: shared cover, and per language the 90 s reel (16:9 site file,
1280x720) with its poster plus the measuring infographic. Fails if any file is missing."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
S = os.path.join(HERE, "out", "setpet")
m = {"cover": {"file": os.path.join(S, "cover-33.webp"), "width": 1920, "height": 1080}, "locales": {}}
missing = [m["cover"]["file"]] if not os.path.exists(m["cover"]["file"]) else []
for l in ["fa", "en", "de", "es", "ar", "nl"]:
    v, p, i = (os.path.join(S, f"setpet-{l}-site.webm"), os.path.join(S, f"poster-{l}-16x9.webp"), os.path.join(S, f"info-33-{l}.webp"))
    missing += [f for f in (v, p, i) if not os.path.exists(f)]
    m["locales"][l] = {"video": {"file": v, "poster": p, "width": 1280, "height": 720, "durationSeconds": 90}, "infographic": {"file": i, "width": 1080, "height": 1350}}
if missing:
    sys.exit("missing: " + ", ".join(missing))
json.dump(m, open(os.path.join(HERE, "out", "manifest", "33.json"), "w", encoding="utf-8"), indent=1)
print("manifest 33 ok")
