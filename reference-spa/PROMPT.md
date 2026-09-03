# CEO goal — paste this into PixelCrew

Build **MoodLedger** — a standalone browser SPA (static `index.html` + `styles.css` + `app.js` only). No React, Vue, Tailwind, Chart.js, Bootstrap, or backend.

## Product
MoodLedger is a personal mood & energy ledger for developers: log how you feel, see a live risk score, browse history, and export your data.

## Must ship (acceptance)

### Shell
- Dark app chrome (not a marketing page). Background: deep slate `#0c1117` with subtle radial wash.
- Top bar: brand **MoodLedger** (left), nav tabs **Check-in · History · Insights** (center or right), small “local only” pill.
- Brand must be the strongest text on first paint. No PixelCrew branding. No Contact Us / Privacy Policy footer.

### Check-in tab (default)
- Card titled “Today’s check-in”.
- Controls:
  1. Mood slider `1–10` with live label (e.g. “Mood · 7 — Steady”)
  2. Energy slider `1–10`
  3. Focus hours number input `0–16`
  4. Meeting hours number input `0–12`
  5. Tag chips (multi-select): Deep work · Meetings · On-call · Blocked · Shipping
- Primary button **Log entry**.
- On submit: append to `localStorage` key `moodledger.entries` (JSON **array**), show inline confirmation exactly:
  `Logged — mood M · energy E · risk R`
  (R = burnout risk 0–100 from your formula). Do not use `alert()`.

### Live meter (always visible on Check-in)
- Large circular or arc **Burnout risk** gauge (SVG or canvas) showing 0–100.
- Formula (document in a code comment):
  `risk = clamp(0,100, round( (11-mood)*4 + (11-energy)*3 + meetings*3.5 + max(0, focus-8)*2 ))`
- Color: mint `<35`, amber `35–65`, coral `>65`.
- Beside gauge: “Effective velocity” = `clamp(0,100, round(mood*5 + energy*4 - meetings*2))`.

### History tab
- Table or list of last 30 entries: timestamp, mood, energy, focus h, meetings h, tags, risk.
- Filter by tag chip.
- Buttons: **Export JSON** (download) and **Clear all** (confirm via in-page dialog, not `window.confirm` if easy — otherwise `confirm` is OK).

### Insights tab
- 7-day average mood + energy (text stats).
- Simple SVG or canvas bar chart of last 7 days’ risk scores (no Chart.js).
- One sentence insight that changes with data (e.g. “Meetings are pushing risk up” / “Energy looks strong”).

### Visual bar (required — not optional polish)
- Fonts: **Fraunces** for the brand wordmark, **DM Sans** for UI (Google Fonts link OK).
- One composition: left check-in card, right gauge panel on desktop; stack on mobile.
- No browser-default unstyled white inputs — custom dark fields, rounded 10px, teal accent `#2dd4bf`.
- Soft panel borders `rgba(255,255,255,0.08)`, no purple gradients, no emoji.
- Seed **5 demo entries** on first load if storage is empty so charts aren’t blank.

### Hard bans
- Do not build PixelCrew, portfolios, ColorVision, NeuralArt, or marketing landing pages.
- Do not add Contact / Privacy footers.
- Do not leave placeholder copy (John Doe, Lorem, Project One).

Ship complete runnable files. Title the document `MoodLedger`.
