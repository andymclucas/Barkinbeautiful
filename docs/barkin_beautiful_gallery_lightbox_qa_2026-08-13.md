# Gallery Full-Size Image Lightbox QA — 13 August 2026

The published Gallery redesign review page at `https://barkinbeautiful.com.au/gallery-redesign-draft-barkin-beautiful/` now adds a page-scoped lightbox to every image inside the Gallery component. Each image presents a clear full-size action to assistive technology and opens in a centred, darkened overlay.

An authenticated browser check confirmed that a gallery image opens at its full available size and that the **Close** control returns the visitor to the image grid. The enhancement also supports mouse or touch activation, keyboard Enter or Space activation, Escape to close, and click-outside closing. It is scoped to `.bb-gallery`, so the original live Gallery page at `/gallery/` is unchanged.

The original public Gallery page was opened separately after the lightbox update. It remains at `https://barkinbeautiful.com.au/gallery/` and does not expose the review-page image button semantics or lightbox overlay, confirming the implementation is isolated from the live page.

## Mobile mosaic alignment correction

The client reported a blank tile and uneven photo placement in the Gallery redesign review page on a handset. The cause was the desktop mosaic’s mixed `tall` and `wide` grid spans persisting in the two-column mobile layout. On 14 August 2026, a review-page-only mobile override reset all tile rows to one consistent 145px height, retained intentional full-width `wide` images, and enabled dense row placement to eliminate blank cells. The lightbox selectors and desktop mosaic were not modified. A final handset confirmation remains pending.

## Face-centred mobile crops and completed row

The same review page now applies mobile-only crop positions that favour each dog’s face and adds a final, existing Pomeranian image tile to complete the sparse small-screen row. The additional tile uses the same existing lightbox interaction as the original Gallery images. A fresh public source check confirmed the review page still retains the Gallery content and booking path; the final handset crop-and-grid confirmation remains pending.

After the handset review showed the completion tile below the next full-width image rather than in the visible empty slot, a persistent ordering routine was added on 14 August 2026. It creates the Pomeranian tile if needed, then places it immediately before the next full-width Gallery tile. A public rendered-page check confirms the additional dog image is part of the Gallery mosaic; final handset confirmation of its mobile position remains pending.

## Full-bleed face-safe masonry refinement

The earlier padded image-fit treatment was rejected during review. On 14 August 2026, it was superseded by a review-page-only full-bleed masonry layout. The Gallery now uses natural image heights in responsive three-column, two-column and phone-width columns, retaining full photographs and their visible dog faces without letterboxing. The client confirmed that the revised Gallery looks much better. The original live Gallery page remains isolated, and the existing full-size image controls remain available on every review-page image.

## Face-preserving tile refinement

On 14 August 2026, the client reported that fixed mosaic crops were still cutting off dog faces. The Gallery redesign review page now adds a review-page-scoped face-preserving layout: each tile centres its image with `object-fit: contain` against the existing soft neutral background, avoiding destructive face crops while retaining the established tile grid and lightbox interaction. The updated public review page retains its original dog images and the added Pomeranian tile. Final handset approval remains pending.

## Full-bleed masonry refinement

The padded image-fit treatment was rejected during handset review. On 14 August 2026, it was superseded by a review-page-only full-bleed masonry layout. The Gallery now uses natural image heights in responsive three-column, two-column and phone-width columns, retaining full photographs and their visible dog faces without letterboxing. The original Gallery page remains isolated and the existing full-size image controls remain present on the published review page. Final handset approval of the visual result remains pending.
