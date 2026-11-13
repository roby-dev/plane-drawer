# PlaneDrawer

A local 2D floor plan sketchpad built with plain JavaScript and SVG. No packages, account, build step, or cloud service.

## Start drawing

1. Double-click `index.html` (it opens in your browser; no server or install needed).
2. Choose **Rectangle**, then drag across the canvas. The four walls form one room.

## Edit your plan

- **Select & move (V):** drag a room to move it as one; drag its corner handles to resize it. Alt+click a wall to select just that wall (then drag it or its endpoints). Rooms also have Width/Height fields in Properties.
- **Copy (Ctrl+drag):** hold Ctrl while dragging a room, wall or symbol to leave the original in place and drag a copy.
- **Symbols:** pick one from the left panel (door, window, toilet, sink, shower, kitchen sink, laundry sink, washing machine, garage door, car (top view), cold/hot water connection, drain) and click to place; keep clicking to place more. Doors and windows snap onto the nearest wall and open toward the side you click. While placing or dragging, a symbol snaps into line with other symbols and wall corners (a purple dashed guide shows the match), so two doors can face each other exactly. Select a symbol to drag it; **Q** rotates it 90°, Delete removes it, Esc finishes.
- **Measure (hold Ctrl):** hover a corner, then slide along a wall: a dashed line and the distance in meters from that corner follow your cursor. Click (with the Wall tool) to start a line exactly there.
- **Rectangle (R):** drag to create four walls with visible measurements.
- **Wall (W):** drag to draw a single wall. Hold Shift (even mid-drag) to force a perfectly horizontal or vertical line; the orange marker then shows where that line reaches an endpoint or crosses another wall, and the end snaps there.
- **Pan (H):** drag the canvas. From any tool, hold the middle mouse button (wheel) and drag to pan temporarily; releasing it restores the tool cursor. Scroll or use the +/− controls to zoom.
- **Wall references:** when drawing a wall or rectangle, an orange marker identifies a nearby endpoint or a point on an existing wall. Starting or ending there uses that exact point, ahead of grid snapping or Shift alignment. The same markers appear while editing: dragging a wall endpoint, a room corner, or moving a wall snaps onto other walls (Shift also works when dragging an endpoint). Detection uses a 12-pixel radius at any zoom level; existing walls remain independent.
- Select a wall and use **Properties** to set length, angle and thickness. Click **Apply dimensions**.
- Delete removes the selected wall. Ctrl/Cmd+Z undoes; Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z redoes. Escape cancels a drag.

Measurements use meters along wall centerlines. Grid snapping uses 10 cm steps. Positive angles turn clockwise on screen. Separate walls are independent: moving one does not reconnect its neighbors. Plans saved before rooms existed keep their walls independent. This is a first-draft tool, not a construction document.

## Keep your work

Changes save automatically in localStorage for this browser and address. Use the same address each time. Clearing browser data, private browsing, or changing browsers can lose access to a plan. **Export plan** saves a JSON backup; **Import plan** restores it after confirmation. Undo history lasts only for the current page session.

If storage cannot be read or written, the app warns instead of claiming the plan was saved. Invalid saved content is not overwritten automatically. Export your current work before explicitly starting or importing a replacement plan.

## Check the code

Optional, only if you have Node.js: run `node --test app.test.cjs model.test.cjs`.

- `model.js`: geometry and versioned, validated plan serialization (pure, no DOM).
- `shapes.js`: how each plan symbol is drawn.
- `editor.js`: editor state, selection, undo history, plan commands and browser storage.
- `render.js`: SVG drawing, overlays, the Properties panel and the camera.
- `gestures.js`: pointer input, snapping and drag handlers per gesture kind.
- `ui.js`: toolbar, forms, import/export, keyboard shortcuts and startup.
- `index.html` / `style.css`: accessible controls and responsive workspace.

The scripts are classic (not ES modules) so `index.html` keeps working from a double-click; they share globals and load in the order listed in `index.html`.

The app has no runtime network dependencies and sends no drawing data to a server.
