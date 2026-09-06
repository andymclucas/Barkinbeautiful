import type { Express } from "express";
import { ENV } from "./env";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      // Stream the asset directly to the browser instead of redirecting.
      // This avoids the browser caching a stale signed URL that later expires.
      const assetResp = await fetch(url);
      if (!assetResp.ok) {
        res.status(502).send("Failed to fetch asset from storage");
        return;
      }

      const contentType = assetResp.headers.get("content-type") ?? "application/octet-stream";
      const contentLength = assetResp.headers.get("content-length");

      res.set("Content-Type", contentType);
      // Cache for 1 hour in the browser — the proxy always fetches a fresh signed URL
      res.set("Cache-Control", "public, max-age=3600");
      if (contentLength) res.set("Content-Length", contentLength);

      const body = assetResp.body;
      if (body) {
        const { Readable } = await import("stream");
        // @ts-ignore – ReadableStream → Node Readable
        Readable.fromWeb(body as any).pipe(res);
      } else {
        const buf = Buffer.from(await assetResp.arrayBuffer());
        res.send(buf);
      }
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
