# Wall Picture Planner

Mobile-first static web app for planning picture frames on a wall using real wall dimensions in millimetres.

## Features

- wall size setup in **mm only**
- visible inner keep-clear margin boundary
- take a wall photo directly from the phone camera or choose one from the gallery
- drag a bright crop overlay to mark which part of the photo matches the measured wall
- add multiple picture frames by width and height
- automatic layout engine that generates multiple balanced gallery-wall arrangements
- explicit reference-style 8-frame alternating layout for four wide and four narrow frames
- instant **Previous layout / Next layout** switching so the user can compare alternatives quickly
- local persistence of wall sizes, frame sizes, frame names, selected layout, and saved wall photo data using browser storage

## Layout behaviour

The app does not rely on the order that frames were added. It now builds a wider set of gallery-wall arrangements by mixing three ideas:

- row and column count patterns such as `4-4`, `3-2-3`, `2-4-2`, `1-3-3-1`, and `2-2-2-2`
- size-aware ordering so large and small frames are mixed across the composition rather than grouped by add order
- scoring for spacing, centering, and symmetry, followed by a diversity pass so the visible options are not all near-duplicates

For example, if the user adds four `436 × 336 mm` frames and four `286 × 336 mm` frames, the layout switcher now puts a reference-style `4 × 2` alternating gallery option first. It uses aligned columns and alternates wide/narrow frames across the top and bottom rows, similar to common living-room gallery-wall examples. Other options such as centered showcase bands, salon-style staggered rows, diamond-like stacks, and column-pair arrangements remain available.

## Hosting

This project is static HTML, CSS, and JavaScript and is suitable for GitHub Pages.

## Persistence

The app stores its data locally in the browser for the same site origin using `localStorage`. This is useful for testing, because after a refresh or redeploy the saved wall setup and frames remain available unless browser storage is cleared.


## Duplicate visual layout filtering

Layout options are deduplicated by their visible geometry, not by frame ID. If several frames have the same dimensions, the app will not keep multiple layout options that only swap those same-size frames into different positions.

## Batch frame entry

The frame form includes a default description of `Picture` and a quantity field. Adding 4 frames with description `Picture` creates `Picture 1`, `Picture 2`, `Picture 3`, and `Picture 4`; future batches continue the numbering.
