# Consult America — Enterprise Website

A premium marketing site for **Consult America** (Innovative Technology Consulting
Services): engineering, AI, cloud, and enterprise transformation. Built to feel like a
top-tier consultancy (Infosys / Accenture / Deloitte tier): cinematic video hero,
editorial typography, and a Stripe-class full-width mega-menu.

**Live:** https://democonsult-ai.vercel.app

---

## TL;DR for a new developer

- The **entire site is one file: `index.html`** (HTML + CSS + JS inline). No build step,
  no framework, no `npm install`. Everything else is static assets.
- Open `index.html`, read the big comment block at the very top, it's a table of
  contents and a "where do I change X?" map. Every section in the file is labelled.
- To change **content** (words, services, logos), you almost always edit a **data array
  in the `<script>`**, not the markup.
- To change **look** (colors, spacing), edit the **`:root` design tokens** at the top of
  the `<style>`.

```bash
# run locally
python3 -m http.server 4200
# then open http://localhost:4200
```

---

## Project structure

```
consultamerica-enterprise/
├── index.html          ← THE ENTIRE SITE (markup + styles + scripts, all inline)
├── README.md           ← you are here
├── .gitignore          ← keeps source clips / scratch out of git
├── .vercelignore       ← keeps source clips / scratch out of deploys
├── img/                ← all images used by the live site
│   ├── consult-america-hero.mp4 / .webm   ← the hero brand film
│   ├── hero-poster.jpg                     ← hero still (shown before video / reduced-motion)
│   ├── clients/*.png                       ← real client logos (marquee)
│   ├── eco1..6.png                         ← technology-ecosystem card icons
│   └── *.jpg                               ← capability / industry / section photos
├── logo-word.png       ← the nav logo lockup (ribbon mark + wordmark + tagline)
├── logo-mark.png       ← ribbon mark only (used as the favicon)
└── logo-*.png          ← alternate brand lockups (not all in use)
```

Not in git / not deployed (local only): `vid/` (raw source video clips + logo sources)
and `work/` (scratch experiments). These are large and intentionally excluded.

---

## How `index.html` is laid out

Three parts, in order:

### 1. `<head><style>` — all the CSS
Labelled sections you can search for:

| Search for | What it styles |
|---|---|
| `DESIGN TOKENS` / `:root` | **colors, fonts, spacing** — edit brand colors here |
| `/* ============ NAV` | top navigation + the Stripe-style mega-menus |
| `/* ============ HERO` | full-screen video hero |
| `/* ============ SECTION SCAFFOLD` | shared section + typography helpers (`.reveal`, `.eyebrow`, `.btn`, etc.) |
| `/* ============ FOOTER` | footer |
| `/* ===== mobile refinements` | responsive overrides (`<=1040px` and `<=600px`) |

### 2. `<body>` — 13 numbered sections
Each starts with an HTML comment like `<!-- 3. CAPABILITIES -->`:

```
NAV + mega menus
 1. HERO              full-screen looping brand video
 2. BRAND THESIS      the editorial (serif) positioning statement
 2.5 CLIENTS          scrolling marquee of real client logos
 3. CAPABILITIES      hover switcher (service list ↔ image)
 4. IMMERSIVE AI      the "AI as a moment" dark section
 5. PROOF / SCALE     animated counters
 6. CLIENT IMPACT     outcome story
 7. INDUSTRIES        hover switcher (industry list ↔ image)
 8. TALENT            people / recruiting
 9. ECOSYSTEM         six technology-domain cards
10. INSIGHTS          articles / thought leadership
11. CAREERS           open-roles CTA
12. CTA               "talk to an expert" closer
13. FOOTER            offices, contact, legal, socials
(+ Ask-AI command-palette overlay)
```

### 3. `<script>` — two halves
- **PART 1 — DATA**: plain arrays holding the page's words + image paths
  (`CAPS`, `INDUSTRIES`, `COUNTERS`, `ECO`, `ANSWERS`, `CLIENTS`, `SUGGEST`). Each is
  documented inline with its column shape. **Edit content here.**
- **PART 2 — LOGIC**: small functions that render those arrays into HTML and wire up the
  interactions (mega-menus, switchers, marquee, Ask-AI palette, scroll-reveal, counters,
  parallax). Rarely needs changes for content edits.

---

## "Where do I change…?" cheat sheet

| I want to change… | Go to | Notes |
|---|---|---|
| **Brand colors** | `:root` tokens (top of `<style>`) | e.g. `--blue`, `--cyan`, `--grad` |
| **Fonts** | `<link>` to Google Fonts (`<head>`) + `body`/`h1` rules | Geist, Geist Mono, Fraunces |
| **Nav links** | `<nav class="nav-mid">` in `<body>` | add/remove `.nav-item` entries |
| **Mega-menu contents** | `megaCap` / `megaInd` blocks in `<script>` | group = `[header, [items]]` |
| **Hero video** | replace `img/consult-america-hero.mp4` + `.webm` | keep the names; update `hero-poster.jpg` too |
| **Client logos** | `CLIENTS` array + drop PNGs in `img/clients/` | filename must match the array key |
| **A service** | `CAPS` array | feeds mega-menu + Capabilities switcher |
| **An industry** | `INDUSTRIES` array | feeds mega-menu + Industries switcher |
| **The stat counters** | `COUNTERS` array | `[number, suffix, label]` |
| **Ask-AI answers** | `ANSWERS` + `SUGGEST` arrays | keys in both must match exactly |
| **Contact info / offices** | `13. FOOTER` section in `<body>` | HQ, branch, email, phone, socials |
| **Favicon** | `<link rel="icon">` in `<head>` | currently `logo-mark.png` |

---

## A few things worth knowing

- **Reduced motion is respected.** If the visitor's OS has "reduce motion" on, the hero
  video is never downloaded (poster image only) and parallax is disabled. See the
  `prefers-reduced-motion` checks in the script.
- **The mega-menu is full-width and `position: fixed`.** A transparent "bridge"
  (`.has-mega::after`) keeps the panel open while the cursor travels from the link down to
  the panel. If you change the nav height (currently `84px`), update the mega-menu `top`
  and that bridge to match.
- **Content integrity:** stats, clients, and claims on the page are real or clearly
  representative, don't add invented clients, awards, or metrics.
- **Fonts load from Google Fonts** over the network; everything else is self-contained.

---

## Deploy

Static hosting on Vercel. Any push / `vercel --prod` publishes `index.html` + `img/` +
`logo-*.png`. `.vercelignore` keeps `vid/` and `work/` out of the deployment.

```bash
vercel --prod --yes
vercel alias set <new-deployment-url> democonsult-ai.vercel.app
```

---

Contact: info@consultamerica.com · 703-496-7858
HQ: 20130 Lakeview Center Plaza, Suite 400, Ashburn, VA 20147 ·
Branch: 1101 Opal Court, Suite 211, Hagerstown, MD 21740
