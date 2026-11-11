# Flora — Interactive 3D Flower Showcase

A full-screen, cinematic flower showcase built with **Three.js** and **GSAP**. It has three real-time 3D flowers (Dahlia, Gerbera, Chrysanthemum) on a black stage, with an editorial three-column layout.

## Run locally

ES modules need an HTTP server. Opening `index.html` straight from disk (`file://`) won't work.

```bash
# any static server works, e.g.
npx serve .
# or
python -m http.server 5173
```

Then open http://localhost:5173 (or the URL `serve` prints). Or double-click `start.bat` on Windows.

To deploy, upload the folder as-is to any static host (Netlify, Vercel, GitHub Pages, cPanel…). There is no build step.

## Structure

```
index.html          markup, overlays, import map
css/style.css       layout, typography, responsive rules, cursor, overlays
js/data.js          all flower content, colours and lighting palettes  ← edit text here
js/flowers.js       procedural 3D flowers (petal geometry, shaders, bloom animation)
js/stage.js         renderer, lights, layout fitting, flower-to-flower transitions
js/fallback.js      photo-based stage used when WebGL is unavailable
js/main.js          UI orchestration: GSAP timelines, input, overlays, loader
assets/img/         optimised photo crops (thumbnails, detail view, fallback)
vendor/             self-hosted three.js r160 + GSAP 3.12.5 (no third-party CDN at runtime)
reference/          the original brief material (not loaded by the site)
```

## Interactions

| Input | Action |
|---|---|
| Mouse move | flower and camera follow the pointer (parallax) |
| Drag on the flower | rotate it; it springs back when released |
| Quick horizontal flick / swipe | next or previous flower |
| Mouse wheel / trackpad (desktop) | next or previous flower |
| ← → ↑ ↓ keys | next or previous flower; ← → also page through the detail view |
| Dots, small preview thumbnail | jump to a flower or go to the next one |
| View Detail, large thumbnail | full detail page with specs and care notes |
| About / Blog | animated overlay pages (blog cards open that flower's details) |
| Esc / Close | close the overlay |

## Customising

- **Text, specs and colours:** edit `js/data.js`. `accent` tints the UI, and `light` tints the 3D key, rim and fill lights.
- **Flower shapes:** each flower in `CONFIGS` (`js/flowers.js`) is a list of petal layers. Each layer sets a petal count, a petal shape (`width`, `roll` = how cupped it is, `curl`/`curlTip` = bend along its length) and a placement function (tilt, radius, size).
- **Swapping in GLB models:** load the model with `GLTFLoader` in `Stage` and put it inside a `Flower`-like group that exposes `root`, `tilt`, `setFade()` and `setOpen()`. The transitions only use those.

## Performance and fallbacks

- Shaders are pre-compiled behind the loader, so the first transition doesn't stutter.
- On slow GPUs the pixel ratio drops automatically, and pixel ratio is capped at 2×.
- If the 3D engine isn't ready within 12 s (very slow network or GPU), the site opens with the photo stage instead of waiting.
- Rendering pauses while an overlay covers the stage or the tab is hidden.
- Without WebGL, the stage switches to the photographs and keeps the same transition choreography.
- Users with `prefers-reduced-motion` get faster, shorter transitions.
