# Board brief: גלריית הקסם ("The Magic Gallery")

## The idea

- What it is: a Hebrew magic and mentalism app (a PWA, installed from the browser) that disguises itself as the phone's own Photos gallery, calculator, notes, Safari, stopwatch, lock screen and incoming call, so a performer can reveal a spectator's thought "inside" ordinary phone screens.
- Who it is for: Hebrew-speaking people who want to perform impressive phone magic for friends and family; also hobby and professional magicians. The founder has not yet decided between "anyone" and "magicians only", or between Israel only and worldwide.
- What it sells, at what price: lifetime access to the full app for 99 ₪, one payment (some tricks are free; the rest are behind a license code).
- Where and how: online only. Live at a github.io address; sold from a landing page (buy.html) with a card-payment terminal being set up. Delivered instantly in the browser; works on iPhone and Android, offline.
- Budget and constraints: solo founder; the app is built with an AI coding assistant. Free hosting (GitHub Pages) and a free notification relay (ntfy.sh, about 250 messages a day per IP on the free tier). No own domain yet. Marketing budget: not stated. Goal: 100,000 ₪ a month in sales (about 1,010 sales a month at 99 ₪).

## What exists today (built and live)
- **Gallery trick (the core):** the home screen looks like the phone's Photos app. A pre-recorded video plays and the spectator's freely chosen number, word or drawing appears inside the video (secret input methods, motion tracking, perspective, blend modes). Also card, mosaic and "shattering gallery" effects.
- **Fake system apps, styled 1:1 on iOS 26 and Android:** calculator with a forced result, notes with an "old" locked note that contains the prediction (Face ID animation), Safari search peek, stopwatch that stops on a chosen number, lock-screen notification, incoming call whose caller name is the prediction.
- **Spectator's own phone + smartwatch:** the performer sends a link (WhatsApp/AirDrop, or QR). The spectator searches on their own phone (Google, Wikipedia, Maps, YouTube or Images) and lands on real results; the search word is sent silently to the performer's smartwatch (Apple Watch, Wear OS, Galaxy, Garmin via the free ntfy app) and into all the app's tricks.
- **Wikipedia trick (similar in mechanism to an existing commercial product called WikiTest):** a decoy "Wiki-Stat" statistics site; the spectator reads two numbers aloud, the performer multiplies them in the fake calculator, which secretly pairs the two phones; then every Wikipedia article the spectator opens (plus its first line) reaches the performer's watch.
- Free tier vs paid: license codes; a paywall on the strongest tricks. Price 99 ₪ one time.
- Landing page, privacy and terms pages exist. Payment terminal: in progress.

## Known limits (stated honestly by the builder)
- The spectator sees a technical web address (sccs1298.github.io/...), which can look suspicious; a short own domain has not been bought.
- A web app cannot control the real phone (cannot turn on the real flashlight, the real status bar shows the real time).
- The ntfy free tier is limited to roughly 250 messages per day per IP.
- No sales data, no marketing budget, no customer acquisition cost known yet.
- Competitors were not mapped in this brief (run /founder-competitors). Do not assume their prices.

## The founder's stated ambition
"Be the best magic app in the world in every parameter", reach 100,000 ₪ a month, every trick must look identical to the real phone and must never look suspicious. Open questions the founder raised: sell to everyone or to magicians; Israel only or worldwide.
