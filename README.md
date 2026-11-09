# Jaya — Bridal & Festive Couture

Single-page website with a cinematic, scroll-driven hero:

1. **The Silk** — close-up of a red Banarasi silk saree.
2. **The Veil** — the camera pulls back to reveal the saree standing in front of the Jaya storefront; it falls at the glass doors.
3. **The House** — the scroll continues straight through the doors into the boutique.

The saree frames are pre-composited (the silk is cut out of its original scene and placed over the store's first frame), so the last saree frame matches the first store frame exactly and the hand-off is seamless.

## Run locally

```bash
python -m http.server 5173
```

Then open http://localhost:5173.

## Structure

- `index.html` — page markup
- `assets/css/style.css` — styles
- `assets/js/hero.js` — canvas frame-scrubbing engine, captions, HUD
- `assets/frames/{saree,store}/{lg,sm}/` — WebP frame sequences (lg 1440px, sm 900px)
- `assets/img/` — stills for the content sections
- `*.mp4` — original source clips
