# PlaneDrawer

A local 2D floor plan sketchpad built with plain JavaScript and SVG. No packages, account, build step, or cloud service.

## Start drawing

1. Install Node.js if it is not already available.
2. Double-click `start.cmd`, or run `node server.cjs` from this folder.
3. Open http://127.0.0.1:4173 and keep the terminal open.
4. Choose **Rectangle**, then drag across the canvas. Each side becomes an independent wall.

## Edit your plan

- **Select & move (V):** drag a wall; drag its round endpoints to resize or rotate it.
- **Rectangle (R):** drag to create four walls with visible measurements.
- **Wall (W):** drag to draw a single wall. Hold Shift for horizontal/vertical alignment.
- **Pan (H):** drag the canvas. Scroll or use the +/− controls to zoom.
- Select a wall and use **Properties** to set length, angle and thickness. Click **Apply dimensions**.
- Delete removes the selected wall. Ctrl/Cmd+Z undoes; Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z redoes. Escape cancels a drag.

Measurements use meters along wall centerlines. Grid snapping uses 10 cm steps. Positive angles turn clockwise on screen. Walls are independent: moving one does not reconnect its neighbors. This is a first-draft tool, not a construction document.

## Keep your work

Changes save automatically in localStorage for this browser and address. Use the same address each time. Clearing browser data, private browsing, or changing browsers can lose access to a plan. **Export plan** saves a JSON backup; **Import plan** restores it after confirmation. Undo history lasts only for the current page session.

If storage cannot be read or written, the app warns instead of claiming the plan was saved. Invalid saved content is not overwritten automatically. Export your current work before explicitly starting or importing a replacement plan.

## Check the code

Run `node --test model.test.cjs`, `node --check app.js` and `node --check server.cjs`.

- `model.js`: geometry and versioned, validated plan serialization.
- `app.js`: SVG drawing, pointer interactions, history and browser storage.
- `index.html` / `style.css`: accessible controls and responsive workspace.
- `server.cjs`: optional loopback-only static preview with an explicit asset list.

The app has no runtime network dependencies and sends no drawing data to a server. The local preview server only serves the application files.
