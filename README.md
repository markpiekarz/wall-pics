# Wall Picture Planner

A mobile-first static web app for planning picture-frame layouts on a measured wall.

## Features

- All measurements are in millimetres.
- Enter wall width, wall height, and inner wall margin.
- Enter a photo-to-photo spacing value, defaulting to 10 mm.
- Optional compact mode: only show arrangements that consume the minimum overall frame bounding area.
- Take a wall photo from a phone camera or choose one from the gallery.
- Select the part of the photo that corresponds to the measured wall.
- Add many same-size picture frames at once.
- Frame descriptions default to `Picture`; batches are named automatically, such as `Picture 1`, `Picture 2`, etc.
- Layout search enumerates unique visual size-order permutations, then deduplicates layouts by visual geometry so identical same-size-frame swaps are not shown as separate layouts.
- Layouts are saved locally with browser `localStorage`, including wall size, photo, frame sizes, frame names, selected layout, spacing, compact mode, and draft input values.

## Layout behavior

The layout engine no longer relies on add order. It builds arrangements from the frame dimensions and checks row, matrix, and column groupings using the supplied spacing value.

For repeated frame sizes, frames with identical dimensions are treated as visually interchangeable. This keeps the layout list useful: two layouts that only swap same-size photos are considered the same and only one is shown.

For a set like 4 frames at 436 × 336 mm and 4 frames at 286 × 336 mm, the search includes alternating two-row gallery arrangements such as wide/narrow/wide/narrow over narrow/wide/narrow/wide.

## Hosting on GitHub Pages

This project is plain HTML, CSS, and JavaScript. No build step is required.

1. Put `index.html`, `styles.css`, `app.js`, `README.md`, and `LICENSE` in the repository root.
2. In GitHub, open **Settings → Pages**.
3. Select **Deploy from a branch**.
4. Choose the `main` branch and `/ (root)` folder.
5. Save.

The app will be served from your GitHub Pages URL.

## Privacy

All photo handling and saved state remain local to the browser. The app does not upload wall photos or frame data anywhere.
