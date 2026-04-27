# Wall Picture Planner — Project Knowledge Base v2

**Repo:** `markpiekarz/wall-pics`
**Deployment:** GitHub Pages (main branch, root)
**Status:** v2 active — bug fixes applied, tap-to-edit UX rebuilt
**Replaces:** v1 knowledge base (which described an aspirational spec that has, in fact, mostly already been built)

---

## 1. Why this document exists

The v1 knowledge base described many features as missing or broken — the multi-family layout search, install-ready placement coordinates, custom photo upload, compact mode, and others. Reading the actual codebase, almost all of those features are already built and working. The v1 doc had become a wishlist disconnected from reality.

This v2 document describes the project as it actually is, after the v2 patches, and is the working source of truth for future development.

---

## 2. Product

### 2.1 Vision

A practical, install-ready gallery planner. Given a wall's dimensions and a set of framed photos, produce a ranked set of visually balanced layouts and the precise top-left placement coordinates needed to mark and hang each frame.

This is not a mood-board tool. The deliverable to the user is a set of pencil-mark coordinates for the physical wall.

### 2.2 Promise

> Enter your wall, your frames, and your spacing. Pick a layout. We'll tell you exactly where on the wall to mark each frame's top-left corner.

### 2.3 Out of scope

- Cloud storage, accounts, or multi-device sync. The app is single-device, single-browser.
- Cross-wall projects. The app stores one wall plan at a time.
- Hanger/wire offset calculation. The app gives top-left coordinates only; the user handles the "how to hang from the wire" step manually.

---

## 3. Tech stack (final, do not relitigate)

| Concern | Choice | Why |
|---|---|---|
| Markup | Hand-written HTML | Static hosting, zero build step. |
| Styling | Hand-written CSS, custom properties | Mobile-first; no framework needed at this size. |
| Logic | Vanilla JS in one `app.js` file | ~2,100 lines. Single-file is easy to grep, deploy, and reason about. |
| Persistence | `localStorage` JSON, version-tagged storage key | Simple, works offline, no server. |
| Image handling | `<canvas>`, `FileReader`, `<input capture>` | Native phone camera and gallery without dependencies. |
| Hosting | GitHub Pages | Auto-deploy on push to `main`. |

There is no React, no TypeScript, no build pipeline. **Do not propose introducing one.** The app is the right size for vanilla; the constraint is real and intentional.

---

## 4. Measurement model

### 4.1 Internal unit

Millimetres only. All state, all layout math, all stored values. Pixels appear only inside `renderWall()` at draw time.

### 4.2 Coordinate system

```
Origin: top-left corner of the full wall area
X: increases rightward
Y: increases downward
Reported coordinates: top-left corner of the outer frame edge
```

### 4.3 Wall area vs. inner margin vs. usable area

```
wallArea:    the rectangle the user enters (e.g. 2400 × 1400 mm)
innerMargin: a uniform inset on all four sides
usableArea:  wallArea minus margin — frames must fit entirely inside this
```

All reported placement coordinates are measured from the **outer wall area edge**, never from the margin line. A person standing at the wall measures from the wall's actual edge.

### 4.4 Frame dimensions

The numbers a user enters for a frame are the **total outside dimensions**, frame included.

```
600 × 400 mm with frameThickness = 20 mm
→ outer rendered box: 600 × 400 mm
→ inner photo (matte) area: 560 × 360 mm
```

Never add frame thickness on top of the entered dimensions in any code path.

### 4.5 Spacing semantics

Spacing is the **minimum edge-to-edge gap** between any two neighbouring frames, **applied uniformly** in both axes. The current engine treats this as the exact gap. With uniform minimum spacing the bounding-box-diagonal gaps in alternating layouts come out at √2 × spacing, which is visually consistent with the orthogonal gaps. This is the intended behaviour: every frame is the same minimum distance from each of its neighbours.

**Recommended default:** `frameThickness × 3`, clamped to 50–75 mm. For a 20 mm frame this gives 60 mm.

### 4.6 Visual rendering rule

```
visible wood band thickness on screen
  = frameThickness mm × min(scaleX, scaleY)
  clamped to ≤ (half the smaller frame side − 1 px)
  with a floor of 1 px
```

That gives an honest, scaled-to-real-life depiction. The clamp prevents the wood band from eating the entire interior of a tiny frame on screen.

---

## 5. Architecture (file-by-file)

### `index.html` (~290 lines)

Three sections, top to bottom on mobile:

1. **Wall setup.** Wall dimensions, inner margin, frame thickness, spacing, compact toggle, wall-photo controls. Two camera paths: the `<input capture="environment">` button (which opens the OS camera and returns a file) and a "live preview camera" advanced option using `getUserMedia`.
2. **Wall preview.** The layout toolbar (name, count, prev/next, search-stats line), the wall-canvas viewport, the new frame quick-access strip, and the placement-instructions panel.
3. **Add picture frames.** The form for adding frames, status banner, and the placed-frames list with per-frame actions.

Three modals:

- **camera-modal** for the live preview camera.
- **crop-modal** for the wall-area selection on the captured photo.
- **frame-action-modal** (new in v2) — a bottom-sheet action sheet for the per-frame actions.

On desktop the modals centre as cards. On mobile they fill the screen, except the action sheet, which docks to the bottom edge.

### `styles.css` (~1,100 lines)

Mobile-first. Design tokens in `:root`. The breakpoints are:

- `< 720 px` mobile defaults.
- `≥ 720 px` enables two-column form grids and centres modal cards.
- `≥ 960 px` switches to a three-area grid: controls, preview, frames.

Tap targets are at least 52 px (`--tap-min-height`). Safe-area-insets are honoured for notched devices.

The wall-frame is now a single layer: a brown-gradient `<button>` element whose `::before` pseudo-element is a cream "matte" inset by `--frame-inner-inset`. JS sets `--frame-inner-inset` to the computed thickness in pixels. There is no CSS border on the wall-frame, which is what was previously double-counting and making the wood band look 2× too thick.

### `app.js` (~2,100 lines)

Single global state object. Pure functions for the layout engine; render functions are imperative and update DOM directly. All listeners are wired in `init()`.

Key sections in source order:

1. Constants and state.
2. Element refs (`els`).
3. Utilities (formatNumber, clamp, escapeHtml, modal open/close, crop-selection helpers).
4. Frame-draft helpers, recommended-spacing helper.
5. Persistence (`persistState`, `restoreState`).
6. Image resizing for storage.
7. Layout engine (Section 6 below).
8. Wall-form submission, photo capture and crop, frame management.
9. Action sheet (new in v2).
10. Render functions: summary, frame list, frame strip, layout toolbar, placement instructions, wall.
11. `init()` listener wiring.

---

## 6. Layout engine

### 6.1 Pipeline

```
1. Validate wall and frames fit at all.
2. Generate visual size-order permutations of the frames.
   Frames with identical (width, height) are treated as one
   bucket, dedupe-by-construction.
3. Generate row partitions (compositions) of the frame count
   bounded by max-rows.
4. For each (sequence, composition) build candidates with:
     - placeRowsExactSpacing       (centre-aligned rows)
     - placeMatrixExactSpacing     (rectangular grid, equal-length rows)
     - placeColumnsExactSpacing    (vertical columns)
5. For each sequence and grid spec build:
     - placeGridExactSpacing on every grid mask that puts a
       frame in every row and every column
6. Always inject the alternating WNWN/NWNW reference candidate
   for any 2-bucket frame set with equal counts (the screenshot
   pattern). Mark these as `referenceStyle` and `mustKeep`.
7. Score, dedupe by placement signature, sort.
8. Pick a diverse selection up to MAX_CANDIDATES_TO_SHOW = 48
   while preserving family diversity.
```

Search caps:

- `MAX_VISUAL_SEQUENCES = 50000` (truncates at this many permutations).
- `MAX_CANDIDATES_TO_SHOW = 48`.
- Per-search work cap: 600 k checks at n ≤ 8, 280 k at n ≤ 10, 140 k otherwise.

The user sees a stats line: "Search checked X arrangements from Y permutations, Z row patterns, W grid masks; kept N unique geometries." If the search was truncated, that's also reported.

### 6.2 Scoring

`scoreCandidate` is a weighted sum that favours:

- Reference-style alternating layouts (very large bonus, treated as must-keep).
- Grid layouts and intentionally staggered grids (medium bonuses).
- Matrix and column layouts (small bonuses).
- Common pleasing row patterns (`4-4`, `3-2-3`, `2-4-2`).

…and penalises:

- Row-width imbalance (`standardDeviation / usableWidth`).
- Row-count imbalance.
- Aspect mismatch between the cluster and the usable area.
- Over-filling or under-filling the usable area.

The reference-style bonus is large enough that the screenshot pattern reliably appears at rank 1 when the input frames support it.

### 6.3 Diversity selection

`selectCandidates` picks reference + must-keep first, then layouts from each unseen family, then a second pass to fill remaining slots without producing 10 near-identical arrangements. Compact mode is a filter applied first: it keeps only candidates whose `groupArea` is within 0.2 % of the minimum.

---

## 7. Tap-to-edit UX (new in v2)

### 7.1 Problem

Small frames in dense layouts are hard to tap. The previous tap target was the frame element itself, and on small screens with many frames each frame could shrink to ~30 × 25 px, well below the tap-target minimum.

### 7.2 Solution

Three coordinated changes:

1. **Numbered badge** in the top-left corner of every placed frame in the preview. The badge is small (~22 px), high-contrast, always visible, layered above the photo and matte. It shows the frame's index in the user's frame list.

2. **Quick-access strip** below the preview. A horizontal-scroll list of cards, one per frame, each with the same number, the frame's name, and its dimensions. The cards are full-height tap targets even when the actual frame on the wall is microscopic.

3. **Action sheet** opened by tapping either the frame on the wall or its card in the strip. The sheet has four buttons: Add/Replace photo, Remove photo (only if a photo is set), Remove frame, Cancel. On mobile the sheet docks to the bottom of the screen with a drag-handle visual; on desktop it centres as a 480 px card.

The previous direct-to-file-picker tap on a frame is replaced by the action sheet for both clarity and safety. There's now a confirm step between tapping a frame and accidentally launching a destructive action.

---

## 8. Persistence

```
localStorage key: 'wall-picture-planner-v4'
Stored shape (version 7):
{
  version: 7,
  wall: {
    width, height, innerMargin, unit,
    backgroundImage,    // cropped JPEG data URL
    sourceImage,        // pre-crop JPEG data URL
    cropSelection: { x, y, w, h }  // 0–1 normalised
  },
  layoutSettings: { spacing, frameThickness, compact },
  frames: [
    { id, name, width, height,
      photoDataUrl, photoName }
  ],
  nextId,
  selectedLayoutKey,
  draftFrame: { name, width, height, quantity }
}
```

Images are resized to a 1600 px max dimension at JPEG quality 0.84 before storage. If the storage write throws, the app surfaces a non-blocking error message rather than crashing.

---

## 9. Bugs fixed in v2

### 9.1 Frame thickness silently reverted on every wall-form submit

`applyWallSettings` rebuilt `state.layoutSettings` without preserving `frameThickness`. After every "Apply wall settings" press, frame thickness fell back to the 20 mm default regardless of what the user had typed. Fix: read the incoming value, fall back to the previous state value, then to the default.

### 9.2 Visible wood band rendered roughly 2× the intended thickness

Two layered causes:

(a) The thickness clamp used `Math.max(1, halfFrame, computed)` where the halfFrame term acts as an inflating *minimum* on tiny frames. Should be `Math.max(1, Math.min(halfFrame, computed))` so it caps from above. Fixed.

(b) The CSS painted both a `border` (sized to thickness) and a `::before` matte inset by thickness. With `box-sizing: border-box`, the matte's `inset` measures from the padding edge, which is *inside* the border. The visible result was border + thickness inset = roughly 2× the intended depth. Fixed by removing the border entirely and letting the wall-frame's own gradient background show through the inset gap as the wood band. Single source of truth for visible thickness.

### 9.3 No way to identify a specific frame at small render sizes

Below ~50 × 40 px the frame label was hidden by the `frame-compact` class. There was no other affordance to identify which placed frame was which. Fixed by adding the persistent numbered badge plus the strip-card UI, both keyed to the same numbering.

### 9.4 Tapping a frame went straight to the file picker

Destructive workflow with no confirmation. Fixed by routing the tap through an action sheet that shows the frame name, dimensions, and explicit per-action buttons.

---

## 10. Regression tests

Manual tests to run after any layout-engine change. I'd recommend doing them on the deployed GitHub Pages URL on a real phone.

### 10.1 The screenshot pattern

Setup:

- Wall: 2400 × 1400 mm
- Inner margin: 120 mm
- Frame thickness: 20 mm
- Spacing: 60 mm
- 4 frames at 436 × 336 mm (wide-landscape, the user's "large")
- 4 frames at 286 × 336 mm (tall-portrait when rotated, the user's "small")

Expected:

- Layout #1 in the candidate list is named "Reference-style alternating 4-column gallery".
- The pattern visually matches WNWN over NWNW (or NWNW over WNWN — both must-keep).
- The compact-mode toggle does not exclude the reference layout (it is mustKeep).

Verified by Node smoke test in `/tmp/smoke.js` during v2 development: the alternating reference layout ranks 1 of 48 with score ≈ 150 k, dominating all others.

### 10.2 Frame thickness is honoured on apply

Setup: change frame thickness from 20 → 60, press Apply wall settings.

Expected: the visible wood band on every placed frame approximately triples in screen depth. Before v2 it would silently revert to 20 mm.

### 10.3 Visible wood thickness matches reality

Setup: 1000 × 1000 mm wall, single 500 × 500 mm frame, frame thickness 50 mm.

Expected: the wood band occupies 50 mm out of 500 mm = 10 % of each side. Visually, the cream interior is 400 × 400 mm, centred. Before v2 the band looked like ~20 % of each side.

### 10.4 Tiny-frame badge legibility

Setup: enough frames at small sizes that one or more renders below 50 × 40 px on screen.

Expected: the numbered badge is still visible and legible. The `frame-tiny` class shrinks the badge slightly so it doesn't overflow the frame.

### 10.5 Tap routing

Setup: place at least one frame, tap it.

Expected: the frame-action sheet opens with the frame's name, dimensions, and four buttons. The file picker does not open until the user explicitly presses Add/Replace photo. Tapping the strip card opens the same sheet.

### 10.6 Persistence round-trip

Setup: set non-default values for every input, add 3 frames, attach a photo to one, refresh.

Expected: every value, including frame thickness, is restored. The selected layout is restored by key.

---

## 11. Known limitations and non-goals

- **Single saved wall.** The user explicitly said no extra features here, so this stays.
- **No undo.** "Remove all frames" is destructive. Manual workaround: don't press it.
- **No PDF export of the placement guide.** Out of scope for v2; the on-screen instructions and table cover the printed-pencil workflow.
- **No drag-to-adjust after generation.** The layout engine produces the final placements; the user picks one.
- **No hanger/wire offset calculation.** The app gives top-left coordinates; the user handles wire-to-mark offset themselves.
- **Compact mode is "smallest bounding box" only.** Tightest spacing was confirmed to be the same thing under uniform-minimum spacing semantics, so no separate option is needed.

---

## 12. Future enhancements (queued, not implemented)

In rough priority order if the project ever needs them:

1. **Frame numbering follows reading order, not add order.** Top-left to bottom-right within the active layout. Would require renumbering on every layout change, but more useful for installation.
2. **Hanger position calculator.** Given the hanger offset on the back of each frame, output mark coordinates for the hanger nail rather than the top-left corner.
3. **PDF or printable installation sheet.** A one-page output with the placement table, scaled diagram, and pencil-mark checklist.
4. **Multiple saved walls.** A dropdown or list of named projects, each with its own state blob.
5. **Drag-to-fine-tune mode.** After generation, allow nudging individual frames within the spacing minimum.
6. **Light/dark mode.** Currently light only.
7. **Loose-spacing variants.** A toggle that adds spacing-variant candidates at 1.4× and 1.8× the entered minimum, for users who want breathing room as alternative arrangements rather than tightest-pack.

None of these are in v2.

---

## 13. Glossary

- **Wall area** — the user-entered rectangle the project is designing within.
- **Inner margin** — the keep-clear inset; frames fit entirely inside `wallArea − margin`.
- **Usable area** — `wallArea − margin` on every side.
- **Frame thickness** — the visible wood-band depth, measured inward from the outer edge of the framed photo.
- **Outer frame dimensions** — the total outside size of the frame, including the wood band. This is what the user enters.
- **Inner photo area** — outer dimensions minus 2 × frame thickness on each axis.
- **Top-left coordinate** — `(x, y)` of the outer top-left corner of a frame, measured from the outer wall edge.
- **Top-left-to-top-left spacing** — the (Δx, Δy) between two frames' top-left coordinates.
- **Edge gap** — the empty distance between the outer edges of two adjacent frames; the spacing semantic of this app.
- **Reference style** — the WNWN/NWNW alternating four-column gallery from the user's screenshot. Always must-keep when the input supports it.
- **Compact mode** — keep only candidates whose group bounding box matches the minimum bounding-box area in the candidate set.

---

## 14. Style notes for future contributors

- Do not add a build step.
- Do not introduce a framework.
- Do not break the single-`app.js` discipline. If a function becomes too large, split it within the same file.
- Do escape all user-controllable strings before injecting into innerHTML (`escapeHtml`).
- Do prefer pointer events with `setPointerCapture` for any drag interaction, mirroring the crop selection.
- Do honour `--tap-min-height: 52px` for any new tappable element.
- Do honour `env(safe-area-inset-bottom)` for any element that sits at the bottom of a screen.
- Do treat all frame dimensions as outer-including-frame everywhere. If the model ever needs to change, change it explicitly with a state migration.
- Do bump the storage version (`STORAGE_KEY` and `version` in the persisted payload) for any breaking change to the saved shape.

---

End of v2 knowledge base.
