export type Sample = { name: string; html: string }

/** The one from the README. Four tags in, ten nodes out. */
const HELLO = `<html> <head> </head> <body> <p> Hello World! </p> </body> </html>`

const STRUCTURE = `<!doctype html>
<html><head><title>Structure</title><style>
body{font:14px system-ui;margin:0;background:#fff}
header{padding:24px;background:#eee}
nav ul{display:flex;gap:16px;list-style:none;padding:12px 24px;margin:0}
main{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:24px}
.card{border:1px solid #ccc;padding:16px}
.card::before{content:"\\25B8";color:#c33;display:inline-block;width:18px;height:18px}
.hidden{display:none}
.invisible{visibility:hidden}
footer{padding:32px 24px;background:#222;color:#fff}
</style></head>
<body>
  <header><h1>Arbor test page</h1><p>A document with actual structure.</p></header>
  <nav><ul><li><a href="#">One</a></li><li><a href="#">Two</a></li><li><a href="#">Three</a></li></ul></nav>
  <main>
    <section class="card"><h3>First</h3><p>Body text long enough to wrap onto a second line so the text node has real height.</p></section>
    <section class="card"><h3>Second</h3><ul><li>alpha</li><li>beta</li><li>gamma</li></ul></section>
    <section class="card hidden"><h3>Hidden</h3><p>display:none — this whole subtree leaves the render tree.</p></section>
    <section class="card invisible"><h3>Invisible</h3><p>visibility:hidden — still has a box.</p></section>
  </main>
  <footer><p>footer text</p></footer>
  <script>var x = 1;</script>
</body></html>`

/**
 * The z-index bug, reproduced. Open this in Stacking mode.
 *
 * `.trap` sets `opacity: .99` — which does nothing visible and silently creates a
 * stacking context. Everything inside it is now sealed in: `.boosted` carries
 * `z-index: 9999` and still paints below `.rival`, which only has `z-index: 1`, because
 * z-index orders siblings within a context and never across them.
 */
const STACKING = `<!doctype html>
<html><head><title>Stacking</title><style>
body{font:14px system-ui;margin:0;padding:24px;background:#f4f4f4}
.panel{position:relative;padding:16px;margin-bottom:12px;border:1px solid #bbb;background:#fff}

.trap{opacity:.99}

.boosted{position:absolute;top:44px;left:40px;z-index:9999;
         width:260px;height:70px;background:#c33;color:#fff;padding:10px}
.rival{position:relative;z-index:1;height:110px;background:#38c;color:#fff;padding:10px}

/* position:static is the default, but .panel above sets relative — so it has to be
   restated here, or the z-index would actually apply and create a context. */
.static-z{position:static;z-index:500}
.transformed{transform:translateZ(0)}
.filtered{filter:blur(0px)}
.stuck{position:sticky;top:0;padding:10px;background:#ffe}
.isolated{isolation:isolate}
.willchange{will-change:opacity}
</style></head>
<body>
  <div class="panel trap">
    <p>opacity: .99 &mdash; invisible change, creates a stacking context</p>
    <div class="boosted">z-index: 9999, still painted below</div>
  </div>
  <div class="rival">z-index: 1 &mdash; paints above all of the above</div>
  <div class="panel static-z">z-index: 500 on a static element &mdash; inert, does nothing</div>
  <div class="panel transformed">transform &mdash; stacking context</div>
  <div class="panel filtered">filter &mdash; stacking context</div>
  <div class="panel isolated">isolation: isolate &mdash; stacking context, and nothing else</div>
  <div class="panel willchange">will-change: opacity &mdash; stacking context before anything animates</div>
  <div class="stuck">position: sticky &mdash; stacking context</div>
</body></html>`

export const SAMPLES: Sample[] = [
  { name: 'Hello World (10 nodes)', html: HELLO },
  { name: 'Real structure', html: STRUCTURE },
  { name: 'Stacking contexts / the z-index bug', html: STACKING },
]
