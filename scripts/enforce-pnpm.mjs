/**
 * Blocks `npm install` / `yarn install` in this repository.
 *
 * WHY
 *
 * This project genuinely requires pnpm; it is not a style preference:
 *
 *  - `patches/wouter@3.7.1.patch` is applied via pnpm's `patchedDependencies`.
 *    npm and yarn ignore that field entirely, so the patch silently never
 *    applies and `window.__WOUTER_ROUTES__` is never populated.
 *  - `pnpm-lock.yaml` pins wouter to the patched 3.7.1. npm ignores it and
 *    resolves 3.11.0 instead, which the patch does not match.
 *  - `npm install` fails outright anyway: @builder.io/vite-plugin-jsx-loc@0.1.1
 *    declares `peer vite@^4 || ^5` while this project runs Vite 7, so npm exits
 *    with ERESOLVE. Developers then reach for --legacy-peer-deps and end up with
 *    a subtly wrong tree (for example `sharp` missing, which breaks pet-photo
 *    uploads in server/uploadRoutes.ts).
 *
 * Render installs with pnpm, so production is unaffected by this guard.
 *
 * Escape hatch: set ALLOW_ANY_PACKAGE_MANAGER=1 if you genuinely need to bypass
 * it (for example while migrating package managers deliberately).
 */

if (process.env.ALLOW_ANY_PACKAGE_MANAGER === "1") {
  process.exit(0);
}

const userAgent = process.env.npm_config_user_agent ?? "";

// Empty user agent means this was not run by a package manager's install
// lifecycle (e.g. a direct `node scripts/enforce-pnpm.mjs`). Don't block.
if (!userAgent) {
  process.exit(0);
}

const manager = userAgent.split("/")[0]?.trim().toLowerCase();

if (manager === "pnpm") {
  process.exit(0);
}

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;

console.error(`
${red(bold("This project requires pnpm — detected: " + (manager || "unknown")))}

Use:

  ${cyan("corepack pnpm install --frozen-lockfile")}

corepack ships with Node and pins pnpm to the "packageManager" field in
package.json, so you do not need pnpm installed globally.

Why this is enforced, not just preferred:

  * patches/wouter@3.7.1.patch applies only via pnpm's patchedDependencies.
    npm and yarn ignore it, so the patch silently does not apply.
  * npm resolves wouter 3.11.0 instead of the pinned, patched 3.7.1.
  * npm install fails on a Vite peer conflict anyway, and working around it
    with --legacy-peer-deps produces a broken tree (e.g. missing "sharp",
    which breaks pet-photo uploads).

If a package-lock.json was created, delete it — it must never be committed.

Override (rarely correct): ALLOW_ANY_PACKAGE_MANAGER=1
`);

process.exit(1);
