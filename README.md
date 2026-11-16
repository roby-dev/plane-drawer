# PlaneDrawer

A local 2D floor plan sketchpad built with plain JavaScript and SVG. No packages, account, build step, or cloud service.

## Landing page

The Astro landing introduces PlaneDrawer as a sketchpad for everyday spaces, not professional CAD. The editor remains independent: opening the root `index.html` still needs no installation or build.

The landing keeps electric blue, lime and charcoal, using one self-hosted Manrope font family. Its SIL Open Font License ships in `landing/public/fonts/`; Phosphor icons include their MIT license in `landing/public/licenses/`. Named typography classes and spacing tokens live in `landing/src/styles/landing.css`. The SVG sketch, section reveals, modal mobile navigation and word reveal respect reduced-motion settings. The complete content remains visible without JavaScript; demo controls enable only when their handlers are ready.

The site includes factual privacy and usage notes, a branded 404 page, and a local social sharing image. There are no account forms, analytics, tracking cookies, customer claims or invented testimonials. Functional checks cover the modal state, sequential word reveal, motion preference, static pages and real dev/preview routes. Visual browser checks, including the final 390px layout, remain pending when browser access is unavailable.

With Node.js 22.23.4 or newer (Node 24 recommended):

```sh
npm ci
npm run dev
```

Open the local URL printed by Astro, including `/plane-drawer/`. The landing links to the unchanged editor at `/plane-drawer/app/`.

```sh
npm run build
npm test
npm run preview
```

The static site is generated in `dist/`. `scripts/prepare-editor.mjs` copies only the editor's eight runtime files into the ignored `landing/public/app/` directory before dev or build; edit the originals at the repository root, never the generated copies. Restart dev after editing the original editor files.

### GitHub Pages

`landing/astro.config.mjs` targets `https://roby-dev.github.io/plane-drawer/`. Change `site` and `base` if the owner, repository name, or domain changes. For a root-domain deployment, build with `npm run build -- --base /` and run landing checks with `TEST_BASE=/`.

The output is static and can be hosted on GitHub Pages. Publication is separate from the local build; no deployment has been triggered. See the [Astro GitHub Pages guide](https://docs.astro.build/en/guides/deploy/github/) for the deployment workflow and Pages settings.

Plans remain in browser localStorage, not in the hosting service. Export a JSON backup before switching between the local file, localhost, or the published site: each origin has separate browser storage. SVG exports are drawings, not editable backups.

## Start drawing

1. Double-click `index.html` (it opens in your browser; no server or install needed).
2. Choose **Room**, then drag across the canvas. The four walls form one room.

The editor keeps the canvas in view: tools and grouped symbols sit on the left, and **Properties** appears only when you select a room, wall or symbol. Closing Properties clears the selection without changing the drawing or its camera. On a narrow screen, open **Symbols** to browse the library; choosing an item closes the library so you can place it on the canvas.

Symbols are grouped into **Doors & windows**, **Kitchen & bathroom**, **Utilities**, and **Stairs & details**. **Files** contains **Import plan** and **New plan**. **Export plan** still saves an editable JSON backup; **Export SVG** still saves a drawing.

Manrope and its SIL Open Font License are embedded in `style.css`. Phosphor icon definitions and their MIT license are embedded in `index.html`. The standalone editor still needs only its original eight runtime files, with no font or icon service requests. Its interface matches the landing while the canvas stays neutral; drawing geometry, saved format and SVG export rendering are unchanged.

## Edit your plan

- **Select & move (V):** drag a room to move it as one; drag its corner handles to resize it. Alt+click a wall to select just that wall (then drag it or its endpoints). Rooms also have Width/Height fields in Properties.
- **Area select (A):** the cursor turns into a crosshair; drag a box to select every wall and symbol fully inside it (selected items turn blue). Drag any of them, with this tool or Select, to move them all together; it undoes in one step. Delete removes the whole selection, Esc clears it, and **Ctrl+A** selects the whole plan.
- **Copy and paste (Ctrl+C / Ctrl+V):** copies the selected room, wall, symbol or area selection; each paste lands 50 cm further down and right, as new rooms that keep their names, and is selected so you can drag it into place. The copy stays inside the editor (not the system clipboard). Ctrl+drag on an area selection drags a copy of the whole group.
- **Room area:** while dimensions are shown, each room displays its area in m² under its name, measured to wall centerlines like every other measurement. The status bar adds up every room (**Rooms … m²**); overlapping rooms are counted twice.
- **Trace a reference image:** in **Files**, choose **Add image to trace** (PNG, JPEG or WebP, under 4 MB), such as a photo of a paper plan. It appears under the plan at half opacity and never gets in the way of drawing. Use **Set scale**: click two points on the image whose real distance you know (for example both ends of a wall) and type that distance in meters; the image resizes around the first point. Then draw walls on top. The **Opacity** slider fades it, and **Remove image** takes it away. The image is kept in this browser only, apart from the plan: it is not part of **Export plan** or **Export SVG**, and it does not move to another device. If the browser cannot store it, it lasts until you close or reload the page.
- **Nudge (arrow keys):** move the selection (symbol, wall, room or area selection) 10 cm per press, or 1 cm with Shift. Each press is one undo step.
- **Copy (Ctrl+drag):** hold Ctrl while dragging a room, wall or symbol to leave the original in place and drag a copy.
- **Symbols:** pick one from the left panel (door, window, toilet, sink, shower, kitchen sink, laundry sink, washing machine, garage door, sliding glass door, stairs up, stairs down, car (top view), cold/hot water connection, drain) and click to place; keep clicking to place more. Doors and windows snap onto the nearest wall and open toward the side you click. Otherwise a symbol goes exactly where you put it. To line it up with other symbols and wall corners, hold **left Ctrl + left Alt** while placing or dragging (a purple dashed guide shows the match), so two doors can face each other exactly; the right Alt (AltGr) does not count, and Ctrl+Alt does not copy. Select a symbol to drag it; **Q** rotates it 90°, Delete removes it, Esc finishes.
- **Rotate and resize with the mouse:** a selected symbol shows handles. Drag the knob above it to rotate (15° steps); drag the side, bottom or corner dot to change its width, depth or both around its center. Its Width and Depth fields in Properties do the same by typing (0.10–20 m); copies keep the size.
- **Text:** pick **Text** in the symbol list and click anywhere to place a label; the Text field is ready to type into (up to 60 characters). Its Letter height (0.10–2 m) is set in Properties or by dragging its bottom handle; it moves, rotates, copies, aligns and exports like any symbol.
- **Room names:** select a room and type a Name (up to 40 characters) in Properties; it shows in the middle of the room and is kept by Ctrl+drag copies. Clear the field to remove it.
- **Measure (hold Ctrl):** hover a corner, then slide along a wall: a dashed line and the distance in meters from that corner follow your cursor. Click (with the Wall tool) to start a line exactly there.
- **Room (R):** drag to create four walls with visible measurements.
- **Wall (W):** drag to draw a single wall. Hold Shift (even mid-drag) to force a perfectly horizontal or vertical line; the orange marker then shows where that line reaches an endpoint or crosses another wall, and the end snaps there.
- **Pan (H):** drag the canvas. From any tool, hold the middle mouse button (wheel) and drag to pan temporarily; releasing it restores the tool cursor. Scroll or use the +/− controls to zoom.
- **Wall references:** when drawing a wall or rectangle, an orange marker identifies a nearby endpoint or a point on an existing wall. Starting or ending there uses that exact point, ahead of grid snapping or Shift alignment. The same markers appear while editing: dragging a wall endpoint, a room corner, or moving a wall snaps onto other walls (Shift also works when dragging an endpoint). Detection uses a 12-pixel radius at any zoom level; existing walls remain independent.
- Select a wall and use **Properties** to set length, angle and thickness. Click **Apply dimensions**.
- Delete removes the selected wall. Ctrl/Cmd+Z undoes; Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z redoes. Escape cancels a drag.

Measurements use meters along wall centerlines. Grid snapping uses 10 cm steps. Positive angles turn clockwise on screen. Separate walls are independent: moving one does not reconnect its neighbors. Plans saved before rooms existed keep their walls independent. This is a first-draft tool, not a construction document.

## Keep your work

Changes save automatically in localStorage for this browser and address. Use the same address each time. Clearing browser data, private browsing, or changing browsers can lose access to a plan. **Export plan** saves a JSON backup; **Import plan** restores it after confirmation. **Export SVG** downloads the whole plan as a drawing (walls, dimensions if shown, symbols and room names on white, 1 m = 55 px) to open or print elsewhere; it cannot be imported back. Undo history lasts only for the current page session.

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

## Credits

Built with [gentle-ai](https://github.com/Gentleman-Programming/gentle-ai) by Gentleman Programming.
