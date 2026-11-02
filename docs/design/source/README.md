# Design source

Copies of the approved design's artboards (`*.dc.html`) and `canvas.json` (frame sizes, titles, order).
They are the markup of a design canvas, not runnable pages: read the inline styles for exact colours,
spacing, radii, copy and states; `{{holes}}`, `sc-for` and `sc-if` are the canvas's own templating.
Desktop artboards are 1440px wide, phone artboards 390px. Names ending in `Phone` are the phone version
of the same screen (a few phone-only flows have no desktop twin). Artboard title → file is in `canvas.json`.
