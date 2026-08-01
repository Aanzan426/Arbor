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
src/capture/types.ts    the Capture format — the seam between walking and drawing
src/capture/walk.ts     walks a live Document, reads back geometry
src/capture/fromHtml.ts adapter: HTML string -> Capture, via a real iframe
src/render/build.ts     Capture -> three.js geometry
src/render/scene.ts     camera, orbit controls, raycast hover
src/render/palette.ts   colour, spent on depth and nothing else
```

## Not built yet

- Capture adapters beyond paste: bookmarklet, Playwright-for-any-URL, extension
- The other trees. A browser doesn't have *a* tree — it has the DOM tree, the CSSOM, the
  render/box tree (which contains `::before` nodes that aren't in the DOM, and omits
  `display:none` nodes that are), stacking contexts, compositing layers, and the
  accessibility tree. They disagree with each other, and the disagreements are the
  interesting part.
- Live mutation view via `MutationObserver` — the DOM is a *live* tree, so watching a subtree
  grow as an app boots is the fourth dimension.
- Textured planes showing real page pixels rather than outlines.

## Performance note

Every node currently becomes two objects (a filled plane and its edges). Fine into the low
thousands; a large real page will want instancing or merged geometry.
