"""Build the designed guide (HTML -> PDF) for "הוואטסאפ שלי נעול".

Usage:
  python3 build.py sample   # cover + intro + chapter 1, for style approval
  python3 build.py full     # the whole guide + the parents' bonus as a separate PDF
Output: <repo>/out/guide-*.pdf (out/ is git-ignored). Screenshots, when they exist,
are read from design/shots/<shot id>.png|jpg (e.g. 1-1א.png).
"""
import html
import os
import re
import subprocess
import sys

import markdown

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
REPO = os.path.abspath(os.path.join(SRC, "..", ".."))
OUT = os.path.join(REPO, "out")

CHAPTERS = ["00-intro.md", "01-whatsapp.md", "03-gmail.md", "04-instagram-facebook.md", "05-phone.md",
            "06-passwords.md", "07-hacked.md", "08-checklist.md"]


def shot_html(ids):
    cells = []
    for i in ids:
        img = next((os.path.join(HERE, "shots", i + ext) for ext in (".png", ".jpg", ".jpeg")
                    if os.path.exists(os.path.join(HERE, "shots", i + ext))), None)
        if img:
            cells.append(f'<div class="shot real"><img src="file://{img}"></div>')
        else:
            label = "אייפון" if i.endswith("א") else "אנדרואיד" if i.endswith("ב") else "צילום מסך"
            cells.append(f'<div class="shot"><b>{html.escape(i)}</b>{label}</div>')
    return '<div class="shots">' + "".join(cells) + "</div>"


def md_to_html(text):
    # screenshot placeholders -> phone frames (before markdown, so they are not blockquotes)
    text = re.sub(r"^> 📷 \*צילום ([^*]+)\*\s*$",
                  lambda m: "\n" + shot_html([s.strip() for s in m.group(1).split("·")]) + "\n", text, flags=re.M)
    # chapter number badge in h2: "## פרק 3: ..." -> span
    text = re.sub(r"^## פרק (\d+): (.*)$", r'<h2><span class="num">\1</span>\2</h2>', text, flags=re.M)
    # a list right after a text line needs a blank line for markdown to see it
    text = re.sub(r"(^(?!\s*$)(?!\s*(?:\d+\.|-) ).*\n)(?=\d+\. |- )", r"\1\n", text, flags=re.M)
    h = markdown.markdown(text, extensions=["tables"])
    # callouts: paragraphs / blockquotes that start with an emoji marker
    kinds = {"⚠️": "warn", "💡": "tip", "🔁": "tip", "🆘": "warn"}

    def callout(m):
        body = m.group(1)
        for k, cls in kinds.items():
            if body.lstrip().startswith(k):
                return f'<div class="callout {cls}">{body}</div>'
        return m.group(0)
    h = re.sub(r"<p>(.*?)</p>", callout, h, flags=re.S)
    h = re.sub(r"<blockquote>\s*<p>(🎬.*?)</p>\s*</blockquote>", r'<div class="callout video">\1</div>', h, flags=re.S)
    # checklist boxes
    h = re.sub(r"<td>☐</td>", '<td class="box">☐</td>', h)
    # every h2 (a new chapter inside the same file) starts a new page
    chunks = re.split(r"(?=<h2>)", h)
    return "".join((('<div class="chapter">' if i else '<div>') + cards(c) + "</div>") for i, c in enumerate(chunks) if c.strip())


def cards(h):
    # wrap every h3 section in a card
    parts = re.split(r"(?=<h3>)", h)
    out = [parts[0]]
    for p in parts[1:]:
        title = re.match(r"<h3>(.*?)</h3>", p, re.S).group(1)
        cls = "card"
        if "עוקץ" in title or "עוקצים" in title:
            cls += " scam"
        if "סיכום" in title or "✅" in title:
            cls += " sum"
        if "🛑" in title:
            cls += " stop"
        out.append(f'<section class="{cls}">{p}</section>')
    return "".join(out)


def cover(title, kicker, promise, bonus=False):
    img = os.path.join(HERE, "cover.jpg")
    return (f'<section class="cover{" bonus" if bonus else ""}"><img src="file://{img}"><div class="shade"></div>'
            f'<div class="txt"><span class="kicker">{kicker}</span><h1>{title}</h1>'
            f'<div class="promise">{promise}</div><div class="by">מאת ההאקר עם המסכה</div></div></section>')


def page(body, big=False):
    css = os.path.join(HERE, "guide.css")
    return (f'<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">'
            f'<link rel="stylesheet" href="file://{css}"></head><body class="{"big" if big else ""}">{body}</body></html>')


def chapter_html(fname):
    text = open(os.path.join(SRC, fname), encoding="utf-8").read()
    text = re.sub(r"^# הוואטסאפ שלי נעול\s*$", "", text, flags=re.M)        # the cover carries the title
    text = re.sub(r"^## פתיחה\s*$", "", text, flags=re.M)
    return md_to_html(text)


def render(html_text, name):
    os.makedirs(OUT, exist_ok=True)
    hp = os.path.join(OUT, name + ".html")
    pdf = os.path.join(OUT, name + ".pdf")
    open(hp, "w", encoding="utf-8").write(html_text)
    subprocess.run(["node", os.path.join(HERE, "to_pdf.js"), hp, pdf], check=True)
    print(pdf)
    return pdf


def main(mode):
    main_cover = cover("הוואטסאפ שלי נעול", "מדריך הגנה",
                       "תוך 30 דקות, הוואטסאפ וכל החשבונות שלכם נעולים")
    chapters = CHAPTERS[:2] if mode == "sample" else CHAPTERS
    body = main_cover + "".join(chapter_html(c) for c in chapters)
    render(page(body), "guide-sample" if mode == "sample" else "guide")
    if mode == "full":
        text = open(os.path.join(SRC, "bonus-parents.md"), encoding="utf-8").read()
        text = re.sub(r"^# .*$", "", text, count=1, flags=re.M)
        card_split = text.split("## ✂️")
        body_html = md_to_html(card_split[0])
        if len(card_split) > 1:
            body_html += ('<div class="cut"><div class="scissors">✂️ גזרו לאורך הקו</div>'
                          + md_to_html("## " + card_split[1].split("\n", 1)[1]) + "</div>")
        bonus = cover("אמא לא נופלת בעוקץ", "בונוס", "המדריך להורים: 6 העוקצים, מילת הקוד, וכרטיס ליד הטלפון",
                      bonus=True)
        render(page(bonus + body_html, big=True), "bonus-parents")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "sample")
