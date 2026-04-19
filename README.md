# Wall Picture Planner

Wall Picture Planner is a static browser app for planning framed pictures on a wall using real dimensions in millimetres (mm). The current build is mobile-first and designed to work in portrait orientation on phones.

## What it does

- asks for wall width, wall height, and an inner keep-clear margin in millimetres (mm)
- accepts a photo of an existing blank wall and uses it as the wall background
- offers two primary phone-friendly photo paths: take a photo now or choose one from the gallery
- keeps the live browser camera as an advanced fallback tool
- adds an interactive shaded wall-area overlay so the user can define which rectangle in the photo corresponds to the supplied wall dimensions
- draws the wall with an outer scene margin and a visible inner margin boundary
- lets the user add picture frames by entering their dimensions
- automatically redistributes all frames evenly within the usable wall area every time a frame is added or removed
- prevents additional frames from being added when no valid layout remains

## Photo alignment workflow

1. Upload or capture the blank wall photo.
2. A shaded overlay editor opens automatically.
3. Drag the bright selection rectangle or its corner handles so it covers only the real wall area.
4. Apply the selected wall area.
5. The cropped selection becomes the wall background used by the planner.

This is the best approach for this app because it stays simple on phones, keeps the main page compact by using a modal editor, makes the wall bounds obvious, and avoids forcing the user to type photo offsets manually.

## Camera notes

- the file input uses `capture="environment"` so phones can open the rear camera directly when supported
- the **Open live camera** button uses the browser camera API for live preview and capture
- camera use requires browser permission and a secure origin such as GitHub Pages over HTTPS
- all captured or uploaded images stay local in the browser

## How layout works

The app treats all dimensions as millimetres (mm) and uses them as the real coordinate system.

1. The usable area is the wall size minus the inner margin on all four sides.
2. Frames are sorted largest-first for more stable packing.
3. The layout engine searches for a row-based partition that:
   - keeps every frame inside the usable area
   - keeps frames from overlapping
   - distributes leftover space as evenly as possible between rows and between frames in each row
4. When a valid layout no longer exists, the next frame is rejected.

## Local use

Because the app is fully static, you can open `index.html` directly in a browser.

## Publish on GitHub Pages

1. Create a new public GitHub repository.
2. Upload the contents of this folder to the repository root.
3. Commit to the default branch.
4. In the repository settings, open **Pages**.
5. Set the source to deploy from the default branch and the repository root.
6. Save. GitHub will publish the app as a static site.

## Suggested repository settings

- public repository
- MIT license
- GitHub Pages enabled
- repository description: `Plan picture-frame layouts on a wall using real dimensions and a photo background.`

## Files

- `index.html` — application structure
- `styles.css` — layout and visual styling
- `app.js` — wall model, placement engine, camera capture, and wall-area overlay logic
- `LICENSE` — MIT license

## License

MIT
