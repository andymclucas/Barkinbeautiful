# groomigo.com.au

The public Groomigo site. Plain static files with no build step: whatever
serves this folder as the site root serves the site (Render static site
`groomigo-website`, deploying from `main`, root directory `website/`).

Nothing here is part of the staff app's build: `pnpm run build` does not read
this folder.

## Pages

| Path | File | What it is |
| --- | --- | --- |
| `/` | `index.html` | Home |
| `/features/` | `features/index.html` | Every feature, by area |
| `/workflow/` | `workflow/index.html` | The floor: the live workflow board |
| `/plans/` | `plans/index.html` | Plans and prices |
| `/switch/` | `switch/index.html` | Switching to Groomigo |
| `/about/` | `about/index.html` | Our story |
| — | `coming-soon.html` | The old one-screen coming-soon page, kept so it can be put back at `/` |

## Hidden until Andy says otherwise (21/11/2026)

Every page carries `<meta name="robots" content="noindex, nofollow">`, set in
one place in `scripts/stamp-website.mjs`. Delete that line there and re-run the
script to open the site to search engines. Keep the pages out of `robots.txt`:
a Disallow line there would publish the addresses.

## Shared parts

- `assets/site.css` is the whole design system. The stage colours are the
  staff app's own (`shared/workflowStageColours.ts`).
- `assets/site.js` is optional polish (fade-ins, the moving board on the home
  page, closing the phone menu). Every page works without it.
- The `<head>` tags, header and footer are stamped into each page by
  `node scripts/stamp-website.mjs`. Edit them there, never in a page, then
  re-run it. Each page marks where they go with `<!--META-->`,
  `<!--HEAD:<key>-->` and `<!--FOOT-->`.
- When `site.css` or `site.js` changes, bump the `?v=` on both in the stamp
  script so browsers fetch the new file.

## Rules for the words on this site

- Claim only what the product does today. The feature list was checked
  against the code on 21/11/2026. Not claimed, because they don't exist or
  aren't reachable: tips, payroll or commission, rosters, a self-serve MoeGo
  import, automatic tracker or waitlist texts, a retail sales report, AI that
  books. Online bookings are requests the salon confirms.
- The product illustrations are HTML drawings with made-up dogs and names.
  Never use a real client's name or a screenshot with real client data.
- No customer counts, testimonials or ratings until there are real ones.
- The plan names, features and text allowances copy
  `shared/planEntitlements.ts` and `shared/smsMetering.ts` by hand. Prices
  ($99 / $179 / $299 AUD a month plus GST) are Andy's, from his subscription
  concept of 21/11/2026; what a salon is charged lives in Stripe, so keep the
  two the same. The client portal is listed under Complete at his request; the
  app does not yet tie it to a plan.
- One-off setup fees, $500 / $750 / $990 plus GST by plan, waived for founding
  salons: agreed in the team chat on 21/11/2026 and added at Andy's request on
  22/11/2026. Nothing in the app or Stripe charges them yet.
- Yearly prices, $1,150 / $2,110 / $3,550 plus GST, with no setup fee: Andy,
  22/11/2026. The app has no yearly billing yet.
- No mention of memberships anywhere on the site (Andy, 22/11/2026): what a
  salon sells its own clients is the salon's business, not Groomigo's. The
  feature still exists in the app.
- The logo is always the stacked lockup, wordmark under the dog.

## Logo and icons

- `groomigo-logo-on-dark-v1.png` is the standard logo, drawn by
  `LOGO_WIDTH=900 LOGO_OUT=website LOGO_TONES=on-dark node scripts/make-logo.mjs "$PWD"`.
- The icons are copies of the staff app's (`client/public/icon-*-v3.png`).

## Looking at it locally

`node scripts/serve-website.mjs` serves this folder on http://localhost:4173.
