# Barkin Beautiful Protected Redesign Drafts QA — 13 August 2026

## Services draft

The protected Services redesign draft, page `2233`, was opened through its authenticated WordPress preview at `https://barkinbeautiful.com.au/?page_id=2233&preview=true`. It remains a draft and was not published.

The desktop review confirmed that the header, logo, direct navigation links, hero content, two booking pathways, services introduction, six services, comfort-and-trust section and concluding booking/contact block all render. The hero image initially appeared as a dark placeholder while its assets loaded, then rendered normally as the intended dog image. The page’s retained original service imagery therefore appears to be loading correctly on desktop.

Device-level mobile review remains outstanding for this and the other protected drafts. A follow-up browser visit on 13 August again showed the standard navigation, service copy and booking paths. The hero panel initially presented as its dark image container during the captured load state, so that image should be given a final settled-load check before the Services image-verification checklist is closed.

## Gallery draft

The protected Gallery redesign draft, page `2238`, was opened through its authenticated preview. Its desktop view renders the standard logo/navigation treatment, the gallery hero, the small-dog grooming section, styled-groom section, real guest gallery content and the final booking invitation. The draft remains unpublished. A follow-up desktop capture showed the hero image container before its imagery had visibly settled, while the real guest-photo grid below was present; this should receive a final settled-load check before visual QA is closed.

## About draft

The protected About redesign draft, page `2241`, was opened through its authenticated preview. The desktop review shows the logo/navigation treatment, hero image, Lauren’s founder content and portrait, team content, care/community section and booking call to action. The draft remains unpublished. A follow-up desktop capture showed the hero and founder-image containers before imagery had visibly settled, so final asset-load confirmation remains appropriate before closing its visual QA.

## VIP Membership draft

The protected VIP Membership redesign draft, page `2244`, was opened through its authenticated preview. It retains the contact-led joining route with telephone and email links rather than online signup buttons. The inspected content includes all five tiers, the requested Giant band for Diamond, Platinum and Gold, and contact-led closing guidance. A follow-up desktop inspection confirmed the contact-led hero, visible tier content and the retained Giant pricing bands; the page remains unpublished. Device-level mobile QA remains required before delivery.

## Shareable review-only URLs

On 13 August 2026, the client approved publication of four clearly labelled review copies so they can be opened on a phone without WordPress authentication. Each received its own unique public URL while the existing live Services, Gallery, About and VIP Membership URLs were not modified:

| Review page | Review-only URL | Public accessibility check |
|---|---|---|
| Services | `https://barkinbeautiful.com.au/services-redesign-draft-barkin-beautiful/` | Confirmed reachable with the six services, retained image slots and existing booking links. |
| Gallery | `https://barkinbeautiful.com.au/gallery-redesign-draft-barkin-beautiful/` | Confirmed reachable with the gallery image slots and existing booking link. |
| About | `https://barkinbeautiful.com.au/about-redesign-draft-barkin-beautiful/` | Confirmed reachable with the founder narrative, image slots and existing booking link. |
| VIP Membership | `https://barkinbeautiful.com.au/vip-membership-redesign-draft-barkin-beautiful/` | Confirmed reachable with contact-led joining, all tiers and the Giant pricing bands. |

These pages are public review copies, not replacements for the live primary pages. Handset visual confirmation remains the next quality-assurance step.

## Live-page safeguard check

After publishing the four review-only copies, the original public routes were checked directly. The live `services/`, `gallery/`, `about-us/` and `memberships/` pages each remained reachable at their existing URLs with their pre-existing page content and booking or membership paths. The review copies therefore did not replace or redirect the live primary pages.

## Services duplicate-image correction — 13 August 2026

The client identified that the Nail clippings card image was repeated in the **Every appointment starts with comfort and trust** section of the Services review page. The repeated image was traced to the `.bb-care-photo` wrapper. The review-only page now uses a distinct, verified August 2026 Barkin Beautiful dog photograph for that section, with a scoped background-image fallback to ensure the replacement reliably renders. The original `/services/` page was not modified.

During the first public verification pass, assets briefly displayed as blank placeholders. A follow-up loaded check confirmed the original Corgi hero image rendered again; final feature-section confirmation remains tracked separately.

The completed visual check confirmed all six service-card photographs are distinct and the comfort-and-trust section now shows a different long-haired dog image. It no longer repeats the bandana-dog Nail clippings image.
