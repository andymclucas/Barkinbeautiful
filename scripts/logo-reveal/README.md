# The Groomigo logo reveal

Everything here regenerates the animated logo from the artwork. Nothing
in the app imports it — these are brand assets and the pipeline that
makes them.

## What comes out

| Output | Made by | Where it lands |
| ------ | ------- | -------------- |
| `groomigo-animated-{dark,light,transparent}.svg` | `build-svg.cjs` | `client/public/` |
| the reveal, in three cuts | `render-frames.cjs` + `encode.swift` | wherever you run it |

```bash
corepack pnpm exec node scripts/logo-reveal/build-svg.cjs        # the SVGs
corepack pnpm exec node scripts/logo-reveal/render-frames.cjs    # 225 PNGs, ~40s
swift scripts/logo-reveal/encode.swift scripts/logo-reveal/frames out.mp4 30
```

Three cuts, all from the same timeline — `--format landscape`
(1920x1080, the default), `square` (1080x1080) and `portrait`
(1080x1920). Each writes to its own `frames-*` directory; pass that
directory to the encoder.

`--at 3.6` renders a single frame, which is how you look at a change
without waiting for the whole sequence. `--format` and `--at` combine.

A cut is a **layout**, not a crop. `FORMATS` gives the lockup's width
as a fraction of the frame — the artwork is 1.69:1 and wider than any
of these, so width is always what constrains it — plus how far above
geometric centre it sits. The atmosphere is scaled as well, and in two
different ways: bloom follows the mark, motes follow the frame. Scale
both by the frame and the square cut gets landscape-sized glow on a
smaller logo.

There is no `ffmpeg` on the build machine, so `encode.swift` does the
encoding through AVFoundation. It is macOS-only; on Linux, point ffmpeg
at the same `frames/` directory instead.

## `art/` — the traced master

`art/groomigo_logo_hd.png` is the only source of truth for the shape of
the logo. Everything else in `art/` is derived from it:

| File | What it is |
| ---- | ---------- |
| `groomigo_logo.clean.svg` | the dog, traced — also what `client/public/groomigo_logo.svg` holds |
| `word-traced.svg` | the wordmark, traced |
| `centreline.json` | the dog's skeleton: the line the pen travels when it draws itself |
| `lockup.json` | where the dog and the word sit in the artwork, measured |

**The word is white on transparent**, so a luminance threshold finds
nothing — `wordmark.cjs` classifies on alpha, then splits teal from
white on the red channel. The dog is `r=18`, the word is `r=255`.

Re-tracing needs `potrace`, which is **not** a project dependency
(`corepack pnpm dlx potrace`, or add it temporarily). It should not be
needed again unless the logo itself changes.

## Things that were got wrong, so they are not got wrong again

- **It is a stacked lockup.** Dog above, one white `groomigo` below. An
  early version set the word in Quicksand beside the dog, split it
  white/teal and added a "GROOMING SALON SOFTWARE" tagline. None of
  that is the brand.
- **Read the dog from `art/`, never from `client/public/`.** The repo
  copy is whatever branch is checked out; switching branches silently
  swapped it for an old 100x100 hand-drawn version and the dog rendered
  as a speck in the corner. `build-svg.cjs` now asserts the path's
  bounds match `lockup.json`.
- **The pen's weight is 24 units, measured.** Ink area divided by
  skeleton length. It was 40, which drew a dog visibly fatter than the
  finished mark it handed over to.
- **Nothing is raster and nothing is a composited layer.** In the SVG,
  the flash is a SMIL-animated gradient rather than a moving element:
  gradient coordinates re-render at full resolution each frame, a
  moving `transform` gets promoted to a layer and resampled. A fixed
  size HTML version of this read as "pixelated" for four rounds.
- **A tight bloom puts a second line round every stroke.** This is what
  "the double line around the logo" actually was, and it survived two
  fixes aimed at the geometry because the geometry was never wrong: the
  mark matches the artwork to 0.35%, and a scanline across any stroke
  is a single clean run. A glow blurred at about 10px at 1080p hugs the
  line and gets its own edge against the dark ground, which reads as a
  softer line drawn around the real one. `render-frames.cjs` now keeps
  ONE wide, edgeless lift and no tight pass. If atmosphere is ever
  turned back up, check a 2x crop of a held frame, not the whole frame
  — at 100% the halo looks like intent.
- **Reveal the mark through a mask. Never draw a pen over it.** The
  centreline is an approximation of the artwork's spine, so a stroke
  along it is a different shape from the fill: at width 24 it covers
  80% of the mark and 38% of it falls outside. Drawing the pen and then
  cross-fading to the fill therefore put two differently-shaped teal
  shapes on screen together for about a second — the **double line**
  that was reported three times. At width 72 the stroke covers the
  artwork completely, so it is used as a mask and only one shape is
  ever visible. `render-frames.cjs` asserts the coverage at startup
  rather than trusting the 72.
- **SVG `<mask>` contents DO animate.** An earlier version of this file
  said browsers cache them and that two cross-fading layers were the
  only way. That was wrong, and it was wrong because it was measured
  with the broken frame-stepping below. A mask whose strokes animate
  `stroke-dashoffset` re-renders correctly in Chrome, driven by CSS or
  by SMIL.
- **`animation-delay` does not seek a paused animation.** Chrome keeps
  the hold time, so stepping frames by changing the delay shows the
  wrong moment. This is the most expensive mistake in this file: it
  invented bugs that were not there, and it produced the false
  conclusion about masks above, which then cost three rounds of the
  real one. Use `getAnimations()` and set `currentTime`.
