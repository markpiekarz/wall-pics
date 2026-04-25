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
- Layouts are generated from dimensions rather than add order.
- Layouts are deduplicated by visual geometry, so swaps between same-size frames are not shown as different layouts.
- Layouts are saved locally with browser `localStorage`, including wall size, photo, frame sizes, frame names, selected layout, spacing, compact mode, and draft input values.

## Layout behavior

The layout engine uses the supplied spacing value as the minimum distance between photo frames. It now searches several arrangement families:

- row shelves with exact spacing
- aligned matrix grids
- vertical column stacks
- staggered grid masks with intentional empty cells
- reference-style alternating galleries for mixed wide/narrow frame sets

For repeated frame sizes, frames with identical dimensions are treated as visually interchangeable. This keeps the layout list useful: two layouts that only swap same-size photos are considered the same and only one is shown.

For a set like 4 frames at `436 × 336 mm` and 4 frames at `286 × 336 mm`, the search explicitly includes the alternating reference layout:

```text
wide / narrow / wide / narrow
narrow / wide / narrow / wide
```

The layout toolbar shows how many row patterns, grid masks, and visual size-order permutations were checked.

## Compact mode

When compact mode is enabled, the app filters layouts down to those whose overall bounding box uses the least area while still respecting the wall, inner margin, and frame spacing rules. This can exclude looser gallery-wall arrangements because they intentionally use more space.

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


## Placement instructions

The active layout includes a placement-instructions panel. Measurements are expressed from the top-left corner of the full measured wall area, not from the inner-margin boundary. The panel shows the first frame top-left coordinate, row-start coordinates, top-left deltas to neighbouring frames, clear edge gaps, and a full coordinate table for every frame.
