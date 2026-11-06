"""קריינות עברית (אברי, Microsoft) עם תזמון מילים בפורמט של newsreel.py.

    SSL_CERT_FILE=/root/.ccr/ca-bundle.crt python3 .claude/skills/daily-recap/tts_avri.py segments.json OUT_DIR

segments.json = רשימת משפטים (סצנה לכל משפט). פלט: OUT_DIR/vo.mp3 + vo.json.
⚠️ ערוץ edge-tts לא רשמי – לטיוטות בלבד. לפרסום: Azure Speech F0 (אותו קול).
"""
import asyncio, json, os, sys
import edge_tts
SEG = json.load(open(sys.argv[1], encoding="utf-8")) if len(sys.argv) > 1 else [
 "יותר ממאה שלושים מיליארד דולר נמחקו מהקריפטו ביממה אחת.",
 "ביטקוין צנח לשבעים ושישה אלף דולר. ואקס אר פי? מינוס תשעה אחוזים.",
 "האשם? וול סטריט. מניות הבינה המלאכותית קרסו, והנאסדק גרר את כולם.",
 "מי שישב על מינוף? יותר ממיליארד דולר בפוזיציות חוסלו. אבל רגע, זה רק תיקון בריא.",
 "קרנות הביטקוין? ארבע מאות שלושים מיליון דולר יצאו ביום אחד.",
 "אז תיקון בריא, או רק ההתחלה? כתבו בתגובות.",
]
OUT = sys.argv[2] if len(sys.argv) > 2 else "."


async def main():
    text = " ".join(SEG)
    c = edge_tts.Communicate(text, "he-IL-AvriNeural", rate="+20%", boundary="WordBoundary", proxy=os.environ["HTTPS_PROXY"])
    audio, bounds = bytearray(), []
    async for ch in c.stream():
        if ch["type"] == "audio": audio += ch["data"]
        elif ch["type"] == "WordBoundary": bounds.append((ch["offset"]/1e7, (ch["offset"]+ch["duration"])/1e7, ch["text"]))
    os.makedirs(OUT, exist_ok=True); open(os.path.join(OUT,"vo.mp3"),"wb").write(audio)
    st = [None]*len(text); en=[None]*len(text); pos=0
    for s,e,w in bounds:
        i = text.find(w, pos)
        if i < 0: print("miss", w); continue
        for k in range(len(w)):
            st[i+k] = s+(e-s)*k/len(w); en[i+k] = s+(e-s)*(k+1)/len(w)
        pos = i+len(w)
    last = 0.0
    for k in range(len(text)):
        if st[k] is None: st[k]=en[k]=last
        last = en[k]
    json.dump({"text":text,"sentences":SEG,"alignment":{"characters":list(text),"character_start_times_seconds":st,"character_end_times_seconds":en}}, open(os.path.join(OUT,"vo.json"),"w"), ensure_ascii=False)
    print(len(bounds), "words; end", round(en[-1],2), [b[2] for b in bounds[:12]])
asyncio.run(main())
