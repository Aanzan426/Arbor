# Arbor

Explodes a web page into 3D layers by DOM depth — showing the tree the browser actually
built, not the one you wrote.

## The point

Take this:

```html
<html> <head> </head> <body> <p> Hello World! </p> </body> </html>
```

Four elements, one string. The browser builds **ten nodes**, and five of them are whitespace
you didn't know you wrote. One of those whitespace text nodes is a direct child of `<html>`,
sitting *between* `<head>` and `<body>` — `document.documentElement.childNodes` is genuinely
`[head, #text, body]`. And with no doctype, that page is in **quirks mode**, which silently
changes the box model.

None of that is visible by reading the source. Arbor makes it visible: every node becomes a
plane at its real laid-out position, pushed back along z by its depth in the tree.

## Running

```bash
npm install
npm run dev
```

Paste HTML, hit **Explode**, drag to orbit, scroll to zoom, hover a plane for its details.

## Two trees, and they disagree

A browser does not have *a* tree. Arbor shows two of them and the gap between:

| mode | what it shows |
|---|---|
| **DOM** | everything the parser produced, boxes or not |
| **Render** | only nodes that generate a box — including `::before` / `::after` |
| **Diff** | both at once, coloured by which tree each node belongs to |

The interesting part is what falls out of each:

**In the DOM, absent from the render tree** — `display: none` elements *and their entire
subtree*; everything inside `<head>`, because the UA stylesheet sets it to `display: none`;
`<script>` and `<style>` for the same reason; whitespace text that layout collapsed away.

**In the render tree, absent from the DOM** — `::before` and `::after`. These are real boxes
that get painted, participate in layout, and are nodes in no DOM anywhere. You cannot select
them, query them, or attach a listener to them.

**In both, despite looking hidden** — `visibility: hidden`. It still generates a box and
still occupies space; it merely isn't painted. This is the single most common confusion
between the two properties, and here it's just visible.

Measured on a small test page with a `<head>`, a `<script>`, a `display:none` subtree, a
`visibility:hidden` block and two cards each carrying a `::before` and an `::after`:
**38 nodes total, 34 in the DOM, 18 in the render tree — 20 DOM-only, 4 render-only.**
Barely half the document survives into the thing you actually see.

### This is a reconstruction, not the engine's box tree

Browsers do not expose their internal render tree to JavaScript. Arbor rebuilds it from what
*is* observable — `getComputedStyle`, `getClientRects()`, and pseudo-element styles. That is
accurate for every case above, and it is not the engine's actual data structure.

Two known gaps, stated plainly:

- **Anonymous boxes** — when the engine wraps stray inline content in a generated block box —
  are genuinely unobservable from JS and are not reconstructed.
- **Pseudo-element geometry** is inferred. There is no API that returns a rect for `::before`,
  so its position is derived from the host element's box and flagged *position approximated*
  in the hover readout.

## Reading depth

Translucent planes in perspective give the eye nothing to measure against — you cannot tell
small-and-near from large-and-far. Three pieces of reference geometry fix that:

- **the page outline at z = 0** — a fixed, known rectangle: the page as it actually appears
- **a faint frame at every depth** — so each level reads as a discrete plane
- **a numbered ruler along z** — turning distance into an actual figure

All of it is one flat colour on purpose. Reference must never compete with the data.

## How it works

The geometry is not computed here. **The browser already did the layout** — Arbor just reads
it back. `getBoundingClientRect()` hands over x, y, width and height for every element; text
nodes need a `Range`, since a text node is not an `Element` and has no such method.

The only invented coordinate is depth:

```
x =  rect.x + rect.w / 2 - viewport.w / 2
y = -rect.y - rect.h / 2 + viewport.h / 2     // screen y grows down, world y grows up
z =  depth * gap                              // the only thing being made up
```

### Capture is separate from rendering

`src/capture/` walks a DOM and emits a plain JSON `Capture`. `src/render/` draws a `Capture`
and knows nothing about where it came from. New capture adapters — a bookmarklet, a
Playwright script for arbitrary live URLs, a browser extension — plug in without the renderer
changing.

This split is not decoration. A naive "paste a URL and explode it" build dies immediately:
the same-origin policy forbids reading a cross-origin iframe's DOM, and most real sites send
`X-Frame-Options` and refuse to load in an iframe at all.

### Why `document.write` and not `srcdoc`

The obvious way to render pasted HTML is `frame.srcdoc = html`. It is wrong, and wrong
silently.

The HTML spec exempts iframe srcdoc documents from the quirks-mode rule, so a doctype-less
document that is *quirks mode* as a real page becomes *standards mode* inside `srcdoc`.
Measured on the sample above:

| method | `document.compatMode` | |
|---|---|---|
| as a top-level page | `BackCompat` | quirks |
| via `srcdoc` | `CSS1Compat` | standards — **wrong** |
| via `document.write` | `BackCompat` | quirks — correct |

Quirks mode changes the box model, so every rect downstream would be subtly wrong for exactly
the documents most worth inspecting. Writing into an `about:blank` document reproduces
top-level parsing faithfully.

A `data:` URL parses correctly too, but modern browsers give `data:` URLs an opaque origin,
so `contentDocument` would be unreadable.

## Layout

```
src/capture/types.ts     the Capture format — the seam between walking and drawing
src/capture/walk.ts      walks a live Document, reads geometry, reconstructs the render tree
src/capture/fromHtml.ts  adapter: HTML string -> Capture, via a real iframe
src/render/build.ts      Capture -> three.js geometry, per tree mode
src/render/reference.ts  page outline, depth planes, numbered z ruler
src/render/scene.ts      camera fitting, orbit controls, raycast hover
src/render/palette.ts    colour — depth in DOM/render modes, membership in diff mode
```

## Not built yet

- Capture adapters beyond paste: bookmarklet, Playwright-for-any-URL, extension
- **The remaining trees.** DOM and render are in. Still missing: the CSSOM, stacking
  contexts (a tree formed by `z-index`, `opacity`, `transform` — and the one that's genuinely
  about depth), compositing layers, and the accessibility tree. Each disagrees with the
  others, and the disagreements are the interesting part.
- Anonymous boxes — see the reconstruction caveat above.
- Live mutation view via `MutationObserver` — the DOM is a *live* tree, so watching a subtree
  grow as an app boots is the fourth dimension.
- Textured planes showing real page pixels rather than outlines.

## Performance note

Every node currently becomes two objects (a filled plane and its edges). Fine into the low
thousands; a large real page will want instancing or merged geometry.
