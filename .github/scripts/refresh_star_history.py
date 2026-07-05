"""Fetch the star-history chart and inline the title avatar.

GitHub renders README images in an <img> context where SVGs cannot load
external resources, so the external icon star-history now emits shows up
broken. We swap it for the repo owner's avatar as a base64 data URI and
commit the result to docs/star-history.svg.
"""
import base64
import re
import sys
import urllib.request

CHART_URL = "https://api.star-history.com/svg?repos=YzYhhhstudy/leetlog&type=Date"
AVATAR_URL = "https://avatars.githubusercontent.com/u/102305583?s=64"
OUT = "docs/star-history.svg"


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return urllib.request.urlopen(req, timeout=30).read()


try:
    svg = get(CHART_URL).decode("utf-8")
except Exception as e:  # keep the previous chart on any fetch hiccup
    print(f"chart fetch failed, keeping previous file: {e}")
    sys.exit(0)

if "<svg" not in svg:
    print("unexpected response, keeping previous file")
    sys.exit(0)

try:
    avatar = base64.b64encode(get(AVATAR_URL)).decode("ascii")
    svg, n = re.subn(
        r'(<image[^>]*clip-path="url\(#clip-circle-title\)"[^>]*href=")[^"]*(")',
        r"\1data:image/png;base64," + avatar + r"\2",
        svg,
    )
    print(f"avatar inlined ({n} replacement)")
except Exception as e:
    print(f"avatar inline skipped: {e}")

with open(OUT, "w") as f:
    f.write(svg)
print(f"wrote {OUT} ({len(svg)} bytes)")
