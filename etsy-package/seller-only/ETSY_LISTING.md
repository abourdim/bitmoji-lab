# Bitmoji Lab — Etsy Listing Package

> Everything you need to publish Bitmoji Lab on Etsy: titles, descriptions, tags, images, video script, pricing, and seller notes.

---

## 1. Listing title (140 char max)

```
Bitmoji Lab — Paint Emoji Pixel Art on BBC micro:bit V2 | NeoPixel LED Matrix 8x8 & 16x16 | No Install | STEAM Digital Download
```

Alternate titles to A/B test:

- `Bitmoji Lab — Emoji Pixel Painter for micro:bit V2 | NeoPixel Matrix | 100+ Emojis | Chrome & Edge`
- `Emoji Pixel Lab — Paint, Glow, Share | micro:bit V2 + NeoPixel LED Matrix | Lifetime Updates`

## 2. Short description (first 160 characters — shows in search)

Paint emoji pixel art in your browser and send it live to a NeoPixel LED matrix on a BBC micro:bit V2. 100+ emojis, 10 demos, save and share. No install.

## 3. Full description

```
🎨 Bitmoji Lab — paint emoji pixel art and send it live to a NeoPixel LED matrix on the BBC micro:bit V2.

Open one HTML file in Chrome or Edge, connect over USB, and turn every emoji on your keyboard into glowing pixel light — no install, no account, no backend, no tracking.

── WHAT YOU GET ──
• 😄 100+ emoji library in 7 categories (faces, robots, vehicles, tools, symbols, flags, road signs)
• 🖌️ Magic Paintbrush — 8 color presets + custom picker, click-drag to paint, Shift-click to erase
• 🔳 Auto-switch between 8×8 (64 LED) and 16×16 (256 LED) NeoPixel matrices
• 💡 Brightness slider (10–255), Simple Mode for flat colors
• 🎬 10 demo animations: Waving Flag, Traffic Light, Heart Beat, Spinning Star, Rainbow Wave, Happy Face, Loading Bar, Fireworks, Racing Car, Blinking Eye
• 💾 Save designs by name — "My Saved Designs" gallery in your browser
• 📜 Communication Log with TX / RX, chunked transfer, checksum verification
• 🧪 Test 0..1000 throughput button

── WHAT'S IN THE ZIP ──
• index.html — the full app
• script.js + style.css — pure web, no build, no dependencies
• makecode.ts — micro:bit receiver firmware (flash once from MakeCode)
• logo.svg + assets/ — emoji library
• USERGUIDE.html / USERGUIDE.md — complete walkthrough + troubleshooting
• Printable: quick-start card (A4), quick-actions cheat sheet (A4 landscape), A3 classroom poster, 30 achievement stickers, 45-minute lesson plan
• LICENSE — personal / classroom single-user license

── REQUIREMENTS ──
• BBC micro:bit V2 (V1 works but slower for 256-LED matrices)
• NeoPixel / WS2812B LED matrix, 8×8 or 16×16
• External power pack for 64+ LEDs (battery pack or USB power bank)
• Chrome 90+ or Edge 90+ on desktop (Web Serial)
• USB data cable (not a charge-only cable)

── WHO IT'S FOR ──
Teachers running STEAM + digital art workshops • home-schooling families • maker-space hosts • robotics clubs • kids who love emoji and want to see them come alive on real hardware.

── PRIVACY FIRST ──
Nothing leaves your computer. No analytics, no logins, no cloud. Saved designs live in your browser's localStorage. Safe for school networks.

── LIFETIME UPDATES ──
Every v1.x version shipped from this listing is yours forever. Re-download the latest ZIP from your Etsy Purchases page anytime.

Happy painting! 🎨✨🚀
```

## 4. 13 Etsy tags (20 chars each max)

1. micro:bit
2. neopixel
3. pixel art
4. emoji
5. LED
6. STEAM
7. kids coding
8. teacher resource
9. digital art
10. classroom
11. home school
12. makerspace
13. web serial

## 5. Materials / technologies

HTML5 • JavaScript • Web Serial • Canvas • NeoPixel • WS2812B • MakeCode • TypeScript

## 6. Price tiers

| Tier | Who | Price |
|------|-----|-------|
| Launch | First 100 buyers | $9.99 |
| Standard | Single user after launch | $14.99 |
| Bundle | App + printables + stickers | $24.99 |
| Tripwire | Single printable upsell | $3 |
| Site | Up to 30 teachers at one school | $149 |
| District | Multiple sites in a district | $399 |
| Promo code `BITMOJI5` | All buyers | $5 off |

## 7. Seven-image upload order

| # | Image | Notes |
|---|-------|-------|
| 1 | Hero — laptop + lit NeoPixel matrix split-screen, "Paint · Glow · Share" overlay | Center-cropped safe zone |
| 2 | Emoji library screenshot with ❤️ mirrored on real matrix | Shows the core loop |
| 3 | Magic Paintbrush close-up | Swatches + paintbrush in action |
| 4 | 8×8 vs 16×16 side-by-side photo | Both matrices glowing the same design |
| 5 | Demo animation long-exposure photo | Rainbow Wave or Fireworks |
| 6 | Printable flat-lay | A3 poster + quick-start + stickers |
| 7 | Text card on dark gradient | "Lifetime updates · No cloud · Chrome / Edge" |

## 8. 60-second listing video script

| Time | Visual | Voice / overlay |
|------|--------|-----------------|
| 0:00 – 0:03 | Dark NeoPixel matrix; a heart lights up | "What if every emoji could glow on a real LED matrix?" |
| 0:03 – 0:10 | Screen recording: double-click `index.html`, Connect, green status | "Open one HTML file. Chrome. Connect. Done." |
| 0:10 – 0:20 | Scrolling the emoji grid; tap ❤️ → SEND → matrix glows; tap 🌈, 🏴 | "100+ emojis ready to send." |
| 0:20 – 0:35 | Expand Magic Paintbrush, paint a rocket, Shift-click to erase | "Or paint your own, pixel by pixel." |
| 0:35 – 0:45 | Hit SEND; close-up of matrix glowing the rocket in blue | "Your drawing becomes light. For real." |
| 0:45 – 0:55 | Name "My Rocket", Save, reopen from gallery; run Fireworks demo | "Name it, save it. Or run one of 10 demos." |
| 0:55 – 1:00 | Logo + handle overlay held still | "Full kit — link in description." |

## 9. Thumbnail / compat badge rules

- Always include the "Chrome & Edge only" sticker on image 1. iPhone/Safari buyers will refund.
- Bump in-app brightness to 30–60% before filming; the default 5% looks dim on video.
- Always show the external power pack in shots with the matrix — buyers notice.

## 10. FAQ (to paste into Etsy FAQs section)

**Q: Does this work on iPhone / iPad / Safari?**
No — Web Serial is only available on desktop Chrome and Edge (and Chrome on Android). Paint on a laptop; the matrix doesn't care.

**Q: Do I need a NeoPixel matrix?**
Yes. The app sends RGB pixel data. Any 8×8 or 16×16 WS2812B-compatible NeoPixel matrix works.

**Q: Can I power 256 LEDs from the micro:bit?**
No — use a battery pack or USB power bank. 256 LEDs at full brightness can pull up to 15 A.

**Q: What's the license?**
Single user (or one classroom, with the Site tier). No redistribution. Lifetime updates for the v1.x line.

**Q: Does it run offline?**
Yes — it's a single HTML file and a JavaScript file. No server, no internet needed after download.

## 11. Launch promo

- Code: `BITMOJI5`
- Discount: $5 off
- Limit: first 100 redemptions
- Valid 30 days from publish

## 12. Post-launch content calendar (first 30 days)

| Day | Asset | Platform |
|-----|-------|----------|
| 1 | 60-sec listing video | Etsy video slot |
| 2 | Pinterest pin #1 (Hero) | Pinterest |
| 4 | Reel — painting a rocket | Instagram / TikTok |
| 7 | Pin #2 (Teacher angle) | Pinterest |
| 10 | Reel — 10 demos highlight | Instagram / TikTok |
| 14 | Pin #3 (What's in the ZIP) | Pinterest |
| 21 | Pin #4 (10 demos) | Pinterest |
| 30 | Recap post + first buyer quote | All |

---

*Bitmoji Lab v1.0.0 — Etsy Listing Package. Keep this file private.*
