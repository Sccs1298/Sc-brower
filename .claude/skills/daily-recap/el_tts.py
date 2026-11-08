"""ElevenLabs TTS עם שומר תקציב.  python3 el_tts.py VOICE_ID "טקסט" out.mp3 [--with-timestamps out.json]

- מפתח: מוזרק ע"י ה-proxy לכותרת xi-api-key (או ELEVEN_KEY_FILE לקובץ מקומי – לעולם לא ב-git).
- מנוי Starter: ~38.6K תווים/חודש, אין חריגה בתשלום (can_extend_character_limit=false).
- שומר: עוצר אם הבקשה תעבור 80% מהמכסה החודשית, או אם בקשה אחת > 1500 תווים.
- מודל: eleven_v3 (תומך עברית), language_code=he.
"""
import base64
import json
import os
import sys
import urllib.request

API = "https://api.elevenlabs.io/v1"
key = open(os.environ["ELEVEN_KEY_FILE"]).read().strip() if os.environ.get("ELEVEN_KEY_FILE") else "proxy"
H = {"xi-api-key": key, "Content-Type": "application/json"}


def req(url, body=None):
    r = urllib.request.Request(url, data=json.dumps(body).encode() if body else None, headers=H)
    return urllib.request.urlopen(r, timeout=120).read()


def main():
    voice, text, out = sys.argv[1], sys.argv[2], sys.argv[3]
    ts = sys.argv[5] if len(sys.argv) > 5 and sys.argv[4] == "--with-timestamps" else None
    sub = json.loads(req(API + "/user/subscription"))
    used, limit = sub["character_count"], sub["character_limit"]
    if len(text) > 1500 or used + len(text) > 0.8 * limit:
        sys.exit(f"BUDGET STOP: used {used}/{limit}, request {len(text)} chars")
    body = {"text": text, "model_id": "eleven_v3", "language_code": "he"}
    if ts:
        d = json.loads(req(f"{API}/text-to-speech/{voice}/with-timestamps?output_format=mp3_44100_128", body))
        open(out, "wb").write(base64.b64decode(d["audio_base64"]))
        json.dump(d.get("alignment"), open(ts, "w"), ensure_ascii=False)
    else:
        open(out, "wb").write(req(f"{API}/text-to-speech/{voice}?output_format=mp3_44100_128", body))
    print(f"ok {len(text)} chars; month used ~{used + len(text)}/{limit}")


if __name__ == "__main__":
    main()
