"""Render HTML motion-graphics scenes to PNG frame sequences with Playwright.
Usage: python3 capture_scenes.py <scene.html> <out_dir> <json: [[scene, duration], ...]> <subs json>"""
import json, os, sys
from playwright.sync_api import sync_playwright
html, out, plan, subs = sys.argv[1], sys.argv[2], json.loads(sys.argv[3]), json.loads(sys.argv[4])
src = open(html).read()
for k, v in subs.items():
    src = src.replace(k, v)
tmp = os.path.join(out, "_scene.html"); os.makedirs(out, exist_ok=True); open(tmp, "w").write(src)
FPS = 30
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1080, "height": 1920})
    pg.goto("file://" + tmp); pg.wait_for_timeout(800)
    for name, dur in plan:
        d = os.path.join(out, name); os.makedirs(d, exist_ok=True)
        for i in range(int(dur * FPS) + 1):
            pg.evaluate(f"setT('{name}', {i / FPS}, {dur})")
            pg.screenshot(path=os.path.join(d, f"{i:05d}.jpg"), type="jpeg", quality=92)
        print(name, int(dur * FPS) + 1, "frames", flush=True)
    b.close()
