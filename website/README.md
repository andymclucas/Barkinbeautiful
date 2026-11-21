# groomigo.com.au

The public Groomigo site. For now the public part is one page: the logo, "coming soon" and
one line, on black (Andy, 21/11/2026).

It is plain static files with no build step. Whatever serves this folder as
the site root serves the site.

- `index.html` is the page.
- `plans/index.html` is the plans page at `/plans`. It is HIDDEN (Andy,
  21/11/2026): nothing links to it and it carries `noindex`. Keep it out of
  `robots.txt`, which would publish the address. It shows no prices: Andy sets
  those, and they live in Stripe. Its plan names, features and text allowances
  copy `shared/planEntitlements.ts` and `shared/smsMetering.ts` by hand.
- `groomigo-logo-on-dark-v1.png` is the standard logo, drawn by
  `LOGO_WIDTH=900 LOGO_OUT=website LOGO_TONES=on-dark node scripts/make-logo.mjs "$PWD"`.
- The icons are copies of the staff app's (`client/public/icon-*-v3.png`).

Nothing here is part of the staff app's build: `pnpm run build` does not read
this folder.
