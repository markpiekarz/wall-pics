# Wall Picture Planner

Mobile-first static web app for planning picture frames on a wall using real wall dimensions in millimetres.

## Features

- wall size setup in **mm only**
- visible inner keep-clear margin boundary
- take a wall photo directly from the phone camera or choose one from the gallery
- drag a bright crop overlay to mark which part of the photo matches the measured wall
- add multiple picture frames by width and height
- automatic layout engine that generates multiple balanced gallery-wall arrangements
- instant **Previous layout / Next layout** switching so the user can compare alternatives quickly
- local persistence of wall sizes, frame sizes, frame names, and saved wall photo data using browser storage

## Layout behaviour

The app no longer relies on the order that frames were added. It generates several alternative layouts that aim for:

- even distribution inside the usable wall area
- centred compositions
- symmetry when possible, usually on at least one axis
- balanced spacing between rows and columns

## Hosting

This project is static HTML, CSS, and JavaScript and is suitable for GitHub Pages.

## Persistence

The app stores its data locally in the browser for the same site origin. This is useful for testing, because after a refresh or redeploy the saved wall setup and frames remain available unless browser storage is cleared.
