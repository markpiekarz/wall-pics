# Wall Picture Planner

A mobile-first static web app for planning framed-photo layouts on a measured wall, with install-ready placement coordinates.

## What's new in v2

- **Numbered badges** on every placed frame in the wall preview. Tiny frames stay identifiable.
- **Quick-access frame strip** below the wall preview. Horizontal scroll, one tap per frame.
- **Action sheet** for tap-to-edit. Tapping a frame on the wall, or its card in the strip, opens a bottom sheet with Add/Replace photo, Remove photo, Remove frame, and Cancel.
- **Bug fix:** frame thickness no longer reverts to the default after pressing **Apply wall settings**.
- **Bug fix:** the visible wood band of the frame now matches the entered frame thickness × scale. Previously it was rendered with a percentage-based inset plus a stacked CSS border, making frames look 2–3× thicker than reality at small scales.

## Features

- All measurements are in millimetres.
- Enter wall width, wall height, and inner wall margin.
- Enter the **outer frame dimensions** for every photo. The supplied width and height include the photo frame.
- Frame thickness defaults to `20 mm`.
- Photo-to-photo spacing defaults to `60 mm`, derived from the frame thickness and aligned with common gallery-wall guidance of roughly 50–75 mm between frames.
- Spacing is treated as the **uniform minimum gap** between every pair of neighbouring frames, applied identically as horizontal and vertical edge-to-edge spacing — so diagonally-offset frames in alternating layouts are still consistent with their orthogonal neighbours.
- Optional compact mode: only show arrangements that consume the smallest overall frame bounding area.
- Take a wall photo from a phone camera or choose one from the gallery.
- Select the part of the photo that corresponds to the measured wall.
- Add many same-size picture frames at once.
- Frame descriptions default to `Picture`; batches are named automatically, such as `Picture 1`, `Picture 2`, etc.
- Tap any placed frame (or its card in the strip below the preview) to open an action sheet for that frame.
- Uploaded frame images are treated as the full framed photo, because the dimensions already include the frame.
- Layouts are generated from dimensions rather than add order.
- Layouts are deduplicated by visual geometry, so swaps between same-size frames are not shown as different layouts.
- Layouts are saved locally with browser `localStorage`, including wall size, wall photo, frame sizes, frame names, selected layout, spacing, frame thickness, compact mode, draft input values, and custom frame photos when browser storage allows.

## Layout behavior

The layout engine uses the supplied spacing value as the minimum distance between the **outer edges** of framed photos and applies it uniformly. It searches several arrangement families:

- row shelves with exact spacing
- aligned matrix grids
- vertical column stacks
- staggered grid masks with intentional empty cells
- reference-style alternating galleries for mixed wide/narrow frame sets

For repeated frame sizes, frames with identical dimensions are treated as visually interchangeable. This keeps the layout list useful: two layouts that only swap same-size photos are considered the same and only one is shown.

For a set like 4 frames at `436 × 336 mm` and 4 frames at `286 × 336 mm`, the search explicitly includes the alternating reference layout:

```
wide / narrow / wide / narrow
narrow / wide / narrow / wide
```

The layout toolbar shows how many row patterns, grid masks, and visual size-order permutations were checked.

## Frame thickness and spacing

Frame thickness is used for two things:

1. the default visual placeholder frame when no custom photo has been uploaded; and
2. the recommended starting spacing between neighbouring framed-photo edges (thickness × 3, clamped to 50–75 mm).

The frame dimensions themselves are always the full outside dimensions. Changing frame thickness does not increase the layout footprint, because the frame is already included in the supplied width and height.

The wood-band thickness drawn in the wall preview equals `frameThickness mm × screen scale`, clamped down so it never exceeds half of the smaller side of any individual frame. This keeps tiny frames legible.

## Compact mode

When compact mode is enabled, the app filters layouts down to those whose overall bounding box uses the least area while still respecting the wall, inner margin, and frame spacing rules. This can exclude looser gallery-wall arrangements because they intentionally use more space.

## Numbered badges and the action sheet

Every placed frame on the wall preview is numbered with a small high-contrast badge. The number reflects the order the frame was added to the project. Below the preview, a horizontal scroll strip shows one card per frame with the same number, the frame name, and its dimensions. Tap a frame on the wall, or its card in the strip, to open the action sheet for that frame. The sheet is the only path that mutates a frame; tapping anywhere else does not change anything.

## Hosting on GitHub Pages

This project is plain HTML, CSS, and JavaScript. No build step is required.

1. Put `index.html`, `styles.css`, `app.js`, `README.md`, `KNOWLEDGE.md`, and `LICENSE` in the repository root.
2. In GitHub, open **Settings → Pages**.
3. Select **Deploy from a branch**.
4. Choose the `main` branch and `/ (root)` folder.
5. Save.

The app will be served from your GitHub Pages URL.

## Privacy

All photo handling and saved state remain local to the browser. The app does not upload wall photos, custom frame photos, or frame data anywhere. Large images are resized before saving to reduce local-storage pressure.

## Placement instructions

The active layout includes a placement-instructions panel. Measurements are expressed from the top-left corner of the full measured wall area, not from the inner-margin boundary. The panel shows the first frame top-left coordinate, row-start coordinates, top-left deltas to neighbouring frames, clear edge gaps, and a full coordinate table for every frame. To install the layout, mark the top-left corner of each frame on the wall in pencil, then hang each frame so its top-left corner aligns with its mark.
