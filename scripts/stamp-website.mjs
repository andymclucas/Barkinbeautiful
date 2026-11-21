// Stamps the shared <head> tags, header and footer into every page of the
// groomigo.com.au site (website/). The site is plain static files with no
// build step, so the shared parts are copied into each page; this script
// keeps the copies identical. Run it after changing anything below:
//
//   node scripts/stamp-website.mjs
//
// Each page marks where the parts go:
//   <!--META:/-->              shared <head> tags (fonts, icons, styles)
//   <!--HEAD:<key>-->          the site header; <key> marks the current page
//   <!--FOOT-->                the site footer
// After stamping, each marker is kept with a matching closing marker
// (<!--/META-->, <!--/HEAD-->, <!--/FOOT-->) so the script can run again.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "website");
const SIGNUP = "https://staff.barkinbeautiful.com.au/signup";
const SIGNIN = "https://staff.barkinbeautiful.com.au/login";

const NAV = [
  ["features", "/features/", "Features"],
  ["workflow", "/workflow/", "The floor"],
  ["memberships", "/memberships/", "Memberships"],
  ["plans", "/plans/", "Plans"],
  ["switch", "/switch/", "Switching"],
  ["about", "/about/", "Our story"],
];

// HIDDEN SITE (Andy, 21/11/2026): every page carries noindex until he decides
// to publish. Delete the robots line here and re-run to open it to search.
const META = `
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#000000">
<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/assets/site.css?v=1">
<script src="/assets/site.js?v=1" defer></script>
`;

const header = (key) => {
  const links = NAV.map(([k, href, label]) =>
    `<a href="${href}"${k === key ? ' aria-current="page"' : ""}>${label}</a>`).join("");
  return `
<a class="skip" href="#main">Skip to content</a>
<header class="site-head">
  <div class="wrap">
    <a class="brand" href="/" aria-label="Groomigo home"><img src="/groomigo-logo-on-dark-v1.png" width="900" height="883" alt="Groomigo"></a>
    <nav class="nav" aria-label="Main">${links}</nav>
    <div class="head-cta"><a class="btn btn-ghost" href="${SIGNIN}">Sign in</a><a class="btn btn-primary" href="${SIGNUP}">Start free trial</a></div>
    <details class="menu">
      <summary aria-label="Menu"><span></span></summary>
      <div class="menu-panel">${links}<a href="${SIGNIN}">Sign in</a><a class="btn btn-primary btn-lg" href="${SIGNUP}">Start your free trial</a></div>
    </details>
  </div>
</header>
`;
};

const FOOT = `
<footer class="site-foot">
  <div class="wrap">
    <div class="foot-grid">
      <div class="foot-brand">
        <a href="/" aria-label="Groomigo home"><img src="/groomigo-logo-on-dark-v1.png" width="900" height="883" alt="Groomigo"></a>
        <p>Salon management software. Designed by groomers. For groomers.</p>
      </div>
      <div>
        <h4>Product</h4>
        <ul>
          <li><a href="/features/">Features</a></li>
          <li><a href="/workflow/">The floor</a></li>
          <li><a href="/memberships/">Memberships</a></li>
          <li><a href="/plans/">Plans</a></li>
        </ul>
      </div>
      <div>
        <h4>Company</h4>
        <ul>
          <li><a href="/about/">Our story</a></li>
          <li><a href="/switch/">Switching to Groomigo</a></li>
        </ul>
      </div>
      <div>
        <h4>Get started</h4>
        <ul>
          <li><a href="${SIGNUP}">Start free trial</a></li>
          <li><a href="${SIGNIN}">Sign in</a></li>
        </ul>
      </div>
    </div>
    <div class="foot-base"><span>© <span data-year>2026</span> Groomigo. Made in Australia.</span><span>Prices in AUD and exclude GST.</span></div>
  </div>
</footer>
`;

function stamp(html, open, close, body) {
  // Already stamped: replace what sits between the markers.
  const re = new RegExp(`${open.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${close.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  if (re.test(html)) return html.replace(re, `${open}${body}${close}`);
  return html;
}

const pages = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".html")) pages.push(p);
  }
})(root);

let changed = 0;
for (const file of pages) {
  let html = fs.readFileSync(file, "utf8");
  const before = html;
  // First run: turn the bare markers into open/close pairs.
  html = html.replace("<!--META:/-->", "<!--META--><!--/META-->");
  if (!html.includes("<!--/HEAD-->")) html = html.replace(/<!--HEAD:([a-z-]*)-->/, "<!--HEAD:$1--><!--/HEAD-->");
  if (!html.includes("<!--/FOOT-->")) html = html.replace("<!--FOOT-->", "<!--FOOT--><!--/FOOT-->");
  const key = (html.match(/<!--HEAD:([a-z-]*)-->/) || [])[1];
  html = stamp(html, "<!--META-->", "<!--/META-->", META);
  if (key !== undefined) html = stamp(html, `<!--HEAD:${key}-->`, "<!--/HEAD-->", header(key));
  html = stamp(html, "<!--FOOT-->", "<!--/FOOT-->", FOOT);
  if (html !== before) { fs.writeFileSync(file, html); changed++; console.log("stamped", path.relative(root, file)); }
}
console.log(`${changed} of ${pages.length} pages changed`);
