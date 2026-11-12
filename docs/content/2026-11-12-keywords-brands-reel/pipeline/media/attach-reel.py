#!/usr/bin/env python3
"""Uses the reel's 1280x720 site file as article 32's video in every language that has one (manifest 32)."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
m_path = os.path.join(HERE, "out", "manifest", "32.json")
m = json.load(open(m_path))
for l in ["fa", "en", "de", "es"]:
    video = os.path.join(HERE, "out", "reel", f"reel-{l}-site.webm")
    poster = os.path.join(HERE, "out", "reel", f"poster-{l}-16x9.webp")
    if os.path.exists(video) and os.path.getsize(video) > 3_000_000 and os.path.exists(poster):
        m["locales"].setdefault(l, {})["video"] = {"file": video, "poster": poster, "width": 1280, "height": 720, "durationSeconds": 60}
        print("attached", l)
    else:
        print("missing", l)
json.dump(m, open(m_path, "w"), indent=1)
