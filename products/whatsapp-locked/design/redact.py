"""Copy a user screenshot into design/shots/<id>.png, blurring personal details.

Usage: python3 redact.py <src.png> <shot id> [x0,y0,x1,y1 ...] [--avatar]
Boxes are in the screenshot's own pixels. --avatar blurs the profile photo in the
WhatsApp bottom tab bar ("את/ה"), which sits at the same place on every iPhone screen.
"""
import os
import sys

import cv2

HERE = os.path.dirname(os.path.abspath(__file__))


def blur(img, x0, y0, x1, y1):
    roi = img[y0:y1, x0:x1]
    small = cv2.resize(roi, (max(1, (x1 - x0) // 28), max(1, (y1 - y0) // 28)), interpolation=cv2.INTER_AREA)
    img[y0:y1, x0:x1] = cv2.GaussianBlur(cv2.resize(small, (x1 - x0, y1 - y0), interpolation=cv2.INTER_NEAREST), (0, 0), 6)


def main():
    src, sid, *rest = sys.argv[1:]
    img = cv2.imread(src)
    h, w = img.shape[:2]
    for r in rest:
        if r == "--avatar":
            # profile photo in the tab bar, relative to a 1179x2556 screenshot
            sx, sy = w / 1179, h / 2556
            blur(img, int(130 * sx), int(2320 * sy), int(240 * sx), int(2430 * sy))
        else:
            blur(img, *[int(v) for v in r.split(",")])
    os.makedirs(os.path.join(HERE, "shots"), exist_ok=True)
    out = os.path.join(HERE, "shots", sid + ".png")
    cv2.imwrite(out, img)
    print(out)


if __name__ == "__main__":
    main()
