# Consult America — Enterprise Website

A premium, single-file enterprise website for **Consult America** (Innovative Technology
Consulting Services) — engineering, AI, cloud, and enterprise transformation.

Built as one self-contained `index.html` with inline CSS/JS (no build step, no dependencies),
plus static assets in `img/`. Designed to feel like a top-tier technology consultancy
(Infosys / Accenture / Deloitte tier): cinematic video hero, editorial typography, and a
Stripe-class full-width mega-menu navigation.

## Highlights

- **Cinematic hero** — AI-generated brand film assembled and color-graded with ffmpeg
  (`.mp4` + `.webm`, poster fallback, reduced-motion aware)
- **Stripe-class navbar** — full-width mega-menus with grouped columns, per-item
  descriptions, featured insight cards, and a gradient "Ask AI" command palette (⌘K)
- **Scroll-reveal, parallax, animated counters, marquee** of real client logos
- **Fully responsive** — desktop mega-nav collapses to a mobile drawer
- **Theme/brand system** via CSS custom properties

## Run locally

```bash
python3 -m http.server 4200
# open http://localhost:4200
```

## Deploy

Static deploy on Vercel. `.vercelignore` keeps source clips (`vid/`) and scratch
(`work/`) out of the deployment.

## Structure

```
index.html        # the entire site (markup + styles + scripts)
img/              # images, client logos, hero video, poster
logo-*.png        # brand lockup assets
```

---

Contact: info@consultamerica.com · HQ: Ashburn, VA · Branch: Hagerstown, MD
