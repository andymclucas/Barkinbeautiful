# Barkin Beautiful Website Audit Notes

**Audit started:** 12 August 2026

## Home page, desktop observation

- The current home page has a top navigation for Home, Services, Gallery, About Us, VIP Membership and Book Online Here.
- The hero uses dog photography with the headline “Dog Groomers Who Truly Care.” and a booking call to action.
- Existing core content to preserve includes the Capalaba/Brisbane location message, the care-first positioning, premium grooming-service categories, founder story, gallery, FAQs, phone number, playgroup and pickup/delivery information.
- The desktop hero has an excessive blank header area and small, loosely aligned navigation/CTA elements. The hierarchy, typography and vertical rhythm make the presentation feel dated rather than premium.
- The planned redesign should establish a fixed responsive header, a stronger hero action, a contained content grid, consistent service cards, readable body typography, an accessible FAQ pattern and a clear booking path.

## Audit limitation

- The first browser session confirmed an authenticated WordPress admin session, but the subsequent page-navigation action could not connect to the browser. Additional public-page inspection will use text extraction or a restored browser connection.

## Core-page content inventory and redesign requirements

| Page | Essential content to retain | Main redesign requirement |
|---|---|---|
| Services | Small-dog grooming, full grooms, deshedding, styled grooms, tidy-ups, nail clippings, booking links, address, hours and contact details. | Convert long repetitive copy into scannable service sections, a calm consultation-led booking journey, consistent cards and obvious mobile calls to action. |
| Gallery | Small dog, styling and tidy-up imagery, with a booking call to action. | Rebuild as a responsive editorial image grid with intentional image crops, caption hierarchy and a booking action that does not interrupt the browsing experience. |
| About | Lauren’s founder story, the care-first business philosophy, team credibility and local community position. | Turn the dense copy into a more personal story with team portrait moments, short proof points and clear readability on phones. Correct visible proofreading defects. |
| VIP Membership | Five tiers, grooming cadence, benefits, weight bands, weekly prices, direct-debit and 12-month term information, and contact-only sign-up path. | Retain exact membership terms and prices, but use a clearer tier navigator, accessible tables and compact expandable details on mobile. Do not add online membership checkout. |

The existing service and membership pages use the MoeGo booking journey for ordinary appointment calls to action. The redesign must preserve that destination until Groomigo online booking is deliberately enabled.

## Visual inspection findings

The Services page repeats the home-page header treatment, including the unusually large empty white region above the hero and navigation that wraps into a second line. The hero text, image and booking button sit in the middle of the image rather than within a deliberate text-safe column, reducing contrast and making the booking action feel incidental. The service content then relies on long text blocks and repeated capitalised booking buttons rather than a coherent, modern service-navigation system.

The Memberships page is visually stronger than the other public pages but still inherits the same detached header and wrap behaviour. Its long pricing presentation requires a more compact comparison pattern, with a simple tier navigator, accessible desktop table or card matrix, and expandable details for mobile. The contact-only membership call to action must remain, since online membership sign-up was intentionally removed.

## Live editing access

The existing authenticated WordPress administration route successfully loaded on 12 August 2026. The browser’s page-artifact collection failed while rendering dashboard controls, so the next editing attempt will use the WordPress page list directly. Live changes are authorised by the user, but no content has been modified at this point.

The Home page is confirmed as a Divi layout (page ID 1534), and the authenticated visual builder is available at `/?et_fb=1`. The pre-edit hero uses the existing logo, dog imagery, care-first headline and MoeGo booking call to action. It will be retained as a content baseline but restructured for a modern responsive presentation.

The WordPress Customizer exposes an existing Additional CSS block that forces `overflow: visible` broadly and forces all Divi text blocks to centre. Those overrides are contributing to inconsistent alignment and responsive behaviour. The redesign will replace them with scoped global styles for the header, containers, typography, calls to action, cards and mobile navigation, while preserving page-specific content.

The new global responsive CSS has now been published to the live site. It replaces the unsafe overflow rule and forced global centring with consistent typography, container widths, modern action styling, accessible FAQ treatment and responsive menu rules. Live verification confirms the shared visual system is active, but the current header uses a selector structure different from the expected Divi Theme Builder header, so its large logo region and wrapped navigation still need a targeted header refinement.

Markup inspection identified the actual header as `header.et-l--header`, with the key Divi elements `.et_pb_section_0_tb_header`, `.et_pb_row_0_tb_header`, `.et_pb_column_0_tb_header`, `.et_pb_column_1_tb_header`, `.et_pb_image_0_tb_header` and `.et_pb_menu_0_tb_header`. A targeted CSS override for that four-column header is now staged in the WordPress Additional CSS editor, along with consistent mobile navigation, content-width, typography, button and FAQ rules. It must be committed through the Customizer’s publish control and then rechecked on the public site.

The second targeted CSS revision has been published. The Customizer’s mobile preview identifies a remaining critical defect: the existing homepage hero keeps desktop-style column proportions at phone width, causing the headline and supporting copy to compress into a narrow column. The next revision must force the existing hero’s internal columns to stack at the Divi mobile breakpoint and make its text and call to action full width.

The approved responsive stylesheet has now been committed successfully to the active WCD Divi Child Theme. It contains the global visual system, exact header selectors, responsive menu styling and a homepage-hero mobile stack override. The Customizer proved unreliable at retaining this amount of CSS, so the child-theme stylesheet is the authoritative deployment location. Desktop and mobile public-page verification is still required.

Subsequent verification showed the WordPress theme-file editor does not retain the child stylesheet change on this host. The reliable configuration location is the existing WPCode Header and Footer settings, which is already used for the Meta Pixel. A direct `<style>` tag in the Body field was sanitised on save, so the final deployment needs to use an allowed header/body script that programmatically inserts the scoped style element. No tracking configuration will be removed or altered.

The WPCode Body field also sanitises script tags when saved, confirming it cannot be used for the deployment. The Header field already permits a script and a style block, so the remaining safe approach is to read its complete existing content, append the responsive CSS inside its permitted style block and save it back intact. This will retain the existing Meta Pixel and prior admin-only styling.

The complete permitted Header content was read and restored with the Meta Pixel, its `noscript` fallback and prior admin-only CSS intact. The responsive style block has now been appended in that allowed Header field and saved successfully. The next step is live desktop and mobile verification after cache refresh.

Live desktop verification confirms the responsive style block is loading, but the Divi header’s outer wrapper is not a semantic `header` element. The current rules target `header.et-l--header` and therefore do not yet reduce the excessive blank header space. The final refinement must use the actual `.et-l--header` wrapper selector while retaining the existing responsive styling.

The Divi Theme Options panel exposes the site’s native persistent Custom CSS editor and its save control. It currently holds prior header and menu overrides, including a broad `body, div { overflow: visible !important; }` rule that undermines responsive overflow control. This field is the correct authoritative location for the rebuilt, scoped responsive styles.

The outdated Divi custom CSS overrides have now been replaced through the native editor with the scoped responsive public-site refresh, and the settings display a successful save confirmation. Existing tracking code is separate from this field and was not changed. Live desktop and mobile verification is now required.

The prior save attempts updated the hidden form mirror rather than Divi’s visible code-editor surface. The responsive CSS has now been entered directly into that visible editor and saved with Divi’s confirmation indicator. This is the first update expected to alter the public theme output; desktop and mobile checks follow.

Divi’s Builder → Advanced panel confirmed that static CSS file generation was enabled. Its generated stylesheet cache has now been cleared successfully after the native CSS update, so the next public request should trigger regenerated styles.

The common WordPress `duplicate_post_as_draft` action did not return a usable editor or redirect on this installation, so it cannot be relied on as the safe draft mechanism. The fallback is to create a new unpublished page titled for the homepage redesign and build it independently, leaving the current live homepage untouched.

An unpublished WordPress page titled `Homepage Redesign Draft — Barkin Beautiful` has been created successfully as post ID 2227. Its draft-only state is confirmed by WordPress, and it is the protected review surface for the new homepage; the live Home page remains untouched.

The protected draft now contains a complete responsive homepage layout built in a WordPress Custom HTML block. The design includes a boutique grooming hero, service cards, care promise, membership invitation and booking/call calls to action, while retaining the current site header and live booking path. Desktop preview at `?page_id=2227` confirms the draft content renders correctly and is materially more modern than the current homepage. The page remains a WordPress draft and has not been published or assigned as the live homepage.

The existing live booking calls both resolve to `https://booking.moego.pet/ol/landing?name=BarkinBeautifulGroomingStudioPlaygroup`. This verified destination must replace the temporary homepage-relative booking links in the protected redesign draft before it is presented for approval.

Both primary booking actions in the protected homepage redesign draft now use the verified MoeGo booking destination. The updated draft has been saved successfully and remains unpublished.

The protected homepage draft has been enhanced with original Barkin Beautiful image assets: real dog photography across the hero, services and gallery, plus Lauren’s original Director and Founder portrait. The page now retains the requested original content concepts in a modern structure: the twenty-years message, Book Online Here calls to action, full groom, small dog grooming, deshedding and styled groom information, photo-gallery link, Meet the Founder story, Our Difference content and FAQs. The enhanced draft is saved but remains unpublished pending visual review.

Live draft verification confirms that the original hero dog photograph renders correctly after the page assets finish loading. The modern hero now keeps the requested personal dog imagery alongside the retained twenty-years message and Book Online Here action.

Further visual verification confirms that real dog photographs now render in the modern service cards and gallery feature, while Lauren’s original founder portrait renders beside the founder story. The retained Our Difference panel and FAQ area are present below the founder content. The page remains unpublished and ready for the user’s second review.

The protected draft now includes a second scoped CSS block for interaction feedback. On pointer devices it slightly expands and lifts primary buttons, service cards, gallery photos, the hero and founder images, difference cards, and FAQ rows. It also provides visible keyboard-focus outlines and honours reduced-motion preferences. The hover layer has been saved in the draft and requires final preview review.

The protected draft continues to render correctly after adding the interaction layer. A live hover check of the primary Book Online Here action confirms the subtle expansion and lift effect appears as intended without changing the layout.

Services-page audit: retain the Dog Grooming Services hero and Book Online Here call to action, then preserve the six existing service categories and their care-led descriptions: Small Dogs Grooming, Full Grooms, Deshedding, Styled Grooms, Tidy Ups and Nail Clippings. The live page’s existing dog hero image and service pathways should remain represented in the protected draft. The original page also presents experience, dedicated groomer and dogs-groomed statistics, but the numeric values were not surfaced in the page extract and should not be recreated without verification.

An unpublished WordPress draft titled “Services Redesign Draft — Barkin Beautiful” has been created as page ID 2233. It uses the standard WordPress editor and remains isolated from the existing live Services page.

The protected Services draft now contains a modern responsive layout with the retained Dog Grooming Services message, the verified Book Online Here destination, original Barkin Beautiful dog imagery, and all six original service categories. It includes a care-led section with no unsourced statistics or pricing, mobile stacking rules, keyboard focus feedback and desktop hover treatment. The draft is saved and unpublished pending visual verification.

Visual verification confirms that the Services draft loads correctly after its image assets complete loading. The hero dog image, service-category content and primary booking action all display on the draft; the existing live Services page remains unchanged.

Live source verification confirms that the Services-page primary booking CTA points to `https://booking.moego.pet/ol/landing?name=BarkinBeautifulGroomingStudioPlaygroup`, which matches every booking action in the protected draft. The original Services-page visual asset inventory includes `Corgi-header.jpg` for the hero and six service portraits named `800-x-1029.jpg` through `800-x-1029-5.jpg`. The protected draft is being aligned to use those original Services-page assets rather than substitute homepage imagery.

The Services draft now includes a scoped image-alignment layer that renders the original `Corgi-header.jpg` hero and the six original `800-x-1029` service photographs in the modern layout. All booking calls in the draft continue to use the verified live MoeGo destination. The aligned draft is saved, unpublished and ready for final visual review.

Final hero verification confirms that the original Services-page Corgi image now renders in the protected draft. The existing live Services page remains unchanged.

Each image `src` in the primary Services draft markup has now been replaced directly with the verified live Services-page media URLs: the Corgi hero plus the six `800-x-1029` service portraits. The previously added CSS image-alignment block is now redundant but points to the same verified assets. A full draft verification remains required before the image task can be closed.

After the direct-source replacement, the original Corgi hero asset successfully renders in the protected Services draft. The six service-card images still require visual verification further down the page.

Visual review of the complete service grid confirms that all six original Services-page images render directly in the protected draft: Small Dog Grooming, Full Grooms, Deshedding, Styled Grooms, Tidy Ups and Nail Clippings. The direct-source replacement resolves the prior image-alignment gap on desktop.

Gallery-page audit: retain the “Take A Look At Our Best Work” hero, the real Barkin Beautiful dog-photo collection, the “Small Dog Grooming” and “Stylings & Tidy Ups” groupings, the “Want to see your pup here? Join the family!” closing invitation, and all Book Online Here calls to action. The live Gallery page booking destination is `https://booking.moego.pet/ol/landing?name=BarkinBeautifulGroomingStudioPlaygroup`. The original media inventory includes `Header-copies-2.jpg` plus the gallery series `1.jpg`, `2.jpg`, `503s.jpg`, `503s-1.jpg`, `503s-2.jpg`, `512-x-360.jpg`, `512-x-512.jpg`, `512s-1.jpg`, `512s-1-1.jpg`, `512s-2.jpg`, `512s-4.jpg`, `512s-5.jpg` and `800-by-805.jpg` under the November 2025 uploads path.

An unpublished WordPress page, `Gallery Redesign Draft — Barkin Beautiful` (page ID 2238), has been created and saved. It uses direct URLs for the original hero and gallery photo collection, retains the live Gallery page’s two named groupings and closing invitation, and routes every booking call to the verified live MoeGo booking destination. The live Gallery page is unchanged pending preview verification.

About-page audit: retain the “Prioritising wellbeing on every groom” founder message, Lauren’s twenty-plus years of grooming experience, the safe and comfortable groom promise, the family-like team narrative, Megan’s role as lead groomer, the “Why Choose Us” health and community sections, and the dog-training-community message. The live About booking CTA uses `https://booking.moego.pet/ol/landing?name=BarkinBeautifulGroomingStudioPlaygroup`. Original image labels exposed by the live page are “Dog group”, “Megan lead groomer”, “Yorkshire terrier” and “Lauren founder and director”; those assets need exact URL confirmation before the draft is built.

Exact About-page source verification identifies `Header-copies-7.jpg` as the hero asset, `Lauren-Director-and-founder.png` as Lauren’s portrait, and the original supporting team and dog images `800-x-903-1.jpg`, `Non-transparent.jpg`, `Transparent-1-3.jpg`, and `Untitled-design-6.jpg`. These verified original URLs will be used directly in the protected About redesign draft.

An unpublished WordPress page, `About Redesign Draft — Barkin Beautiful` (page ID 2241), has been built and visually verified at the hero and founder-story level. It renders the original About hero asset, Lauren’s real founder portrait and Megan’s original team image, while retaining the wellbeing, team, health and community messages and the live MoeGo booking route. The original live About page remains unchanged.

VIP Membership audit: preserve the existing contact-led sign-up instruction, not online membership purchasing. The page currently presents Diamond (every 2 weeks), Platinum (every 3 weeks), Gold (every 4 weeks), Silver (every 6 weeks) and Bronze (every 8 weeks), weekly direct debit and a 12-month minimum term. It states the membership benefits of priority booking, price-lock guarantee, flexible service swaps, retail/daycare discounts and dedicated groomer continuity. The live page provides phone `07 3823 4567` and email `barkinbeautiful@gmail.com` for contact. The tier pricing and benefits captured in this audit must be carried across exactly in the protected draft, including Gold, Silver and Bronze Classic versus Styled ranges and the Giant size category where displayed.

An unpublished WordPress page, `VIP Membership Redesign Draft — Barkin Beautiful` (page ID 2244), has been built and visually verified at the hero and introductory tier level. It displays the preserved Diamond through Bronze intervals, verified weekly rates and Giant category, gives only phone and email routes to contact Lauren and the team, and contains no online membership purchase or self-service sign-up control. The live membership page is unchanged.

Header refinement verification: the inherited Divi header had a 200px-plus whitespace band, oversized logo spacing and a wrapped VIP Membership navigation item. The protected VIP Membership draft now contains a scoped `body:has(.bb-vip)` CSS layer that reduces the header height, aligns the logo and menu on one desktop row, retains a distinct VIP callout, and provides mobile menu sizing. This was visually confirmed on the protected draft without changing the live public site. The same scoped approach should be applied to the remaining protected drafts before they are presented as a unified redesign.

Visual preview confirms that the original Gallery hero image renders in the protected redesign, along with the first six real dog images in the Small Dog Grooming mosaic. The original image assets are displayed in a cleaner responsive grid without replacing the salon’s distinctive photography.

Final Gallery preview confirms that the remaining original dog-photo mosaic renders below the retained “Stylings & Tidy Ups” section and that the “Want to see your pup here? Join the Barkin Beautiful family” closing invitation and verified MoeGo booking action are present. The protected Gallery draft is saved and the original live Gallery page remains unchanged.
