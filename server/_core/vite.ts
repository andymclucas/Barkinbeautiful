import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // index.html must always be revalidated — it references the JS/CSS bundle
  // filenames from whatever the *current* deploy is, and those filenames
  // change on every build. If a browser caches an old index.html, it'll try
  // to fetch JS chunks that no longer exist on the server (removed by a
  // later deploy) and the app fails to load at all, showing a blank page.
  // The actual bundle files are safe to cache aggressively since their
  // filenames are content-hashed by the build — a new build never reuses an
  // old filename, so there's no staleness risk in caching them for a year.
  // The service worker and the manifest must NEVER be cached immutably.
  // Their filenames are fixed — they are not content-hashed like the
  // bundles — so an `immutable, max-age=31536000` response means the
  // browser keeps running whichever service worker it first saw, for a
  // year, and a fix to it can never be deployed. That is the classic way
  // to brick a PWA, and it is silent: the app looks fine and the
  // notifications are being handled by last year's code.
  const alwaysRevalidate = new Set(["index.html", "sw.js", "manifest.webmanifest"]);

  app.use(express.static(distPath, {
    index: false,
    setHeaders: (res, filePath) => {
      if (alwaysRevalidate.has(path.basename(filePath))) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      } else {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
      // A service worker is only allowed to control the whole origin if
      // it is served from the root with this header. Without it the scope
      // silently narrows and pushes stop being handled.
      if (path.basename(filePath) === "sw.js") {
        res.setHeader("Service-Worker-Allowed", "/");
      }
    },
  }));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
