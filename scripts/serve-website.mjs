// Serves the website/ folder on http://localhost:4173 for looking at it
// locally. Not used in production: the site is plain static files.
//   node scripts/serve-website.mjs
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "website");
const types = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".css": "text/css", ".js": "text/javascript", ".ico": "image/x-icon", ".txt": "text/plain" };
const port = Number(process.env.PORT) || 4173;
http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const file = path.join(root, urlPath.endsWith("/") ? urlPath + "index.html" : urlPath);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end("Not found"); return; }
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`website on http://localhost:${port}`));
