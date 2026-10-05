/**
 * End-to-end check of the push chain against a LOCAL mock push service.
 * Proves: event bus -> fanout -> pushForEvent -> web-push encryption ->
 * HTTP POST with the right TTL/Urgency -> prune-on-410, keep-on-500.
 */
import "dotenv/config";
import https from "node:https";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../server/db";
import { pushSubscriptions } from "../drizzle/schema";
import { emitCallRinging, emitMissedCall } from "../server/eventBus";
import { startPushFanout } from "../server/pushFanout";
import { endpointHash } from "../server/webPush";

type Hit = { ttl: string | undefined; urgency: string | undefined; bytes: number };
const hits: Hit[] = [];
let respondWith = 201;

/**
 * A throwaway self-signed cert for the mock.
 *
 * web-push refuses a plain-http endpoint — real push services are always
 * TLS — so the mock has to speak HTTPS. The cert is trusted by re-execing
 * with NODE_EXTRA_CA_CERTS rather than by setting
 * NODE_TLS_REJECT_UNAUTHORIZED=0, which would also switch off certificate
 * checking on this process's connection to the production database.
 */
const certDir = fs.mkdtempSync(path.join(os.tmpdir(), "gsos-push-verify-"));
const KEY = path.join(certDir, "key.pem");
const CERT = path.join(certDir, "cert.pem");
execFileSync("openssl", [
  "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
  "-keyout", KEY, "-out", CERT, "-subj", "/CN=127.0.0.1",
  "-addext", "subjectAltName=IP:127.0.0.1",
], { stdio: "ignore" });

if (!process.env.NODE_EXTRA_CA_CERTS) {
  // Node reads NODE_EXTRA_CA_CERTS once at startup, so the only way to
  // trust a cert we just generated is to start again with it set.
  // execArgv carries tsx's own --import flag; without it the child
  // re-runs this TypeScript file under plain node and cannot resolve it.
  const { status } = spawnSync(
    process.execPath, [...process.execArgv, ...process.argv.slice(1)],
    { stdio: "inherit", env: { ...process.env, NODE_EXTRA_CA_CERTS: CERT, GSOS_MOCK_KEY: KEY, GSOS_MOCK_CERT: CERT } },
  );
  process.exit(status ?? 1);
}

const server = https.createServer({
  key: fs.readFileSync(process.env.GSOS_MOCK_KEY ?? KEY),
  cert: fs.readFileSync(process.env.GSOS_MOCK_CERT ?? CERT),
}, (req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    hits.push({
      ttl: req.headers["ttl"] as string | undefined,
      urgency: req.headers["urgency"] as string | undefined,
      bytes: Buffer.concat(chunks).length,
    });
    res.writeHead(respondWith); res.end();
  });
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let ok = true;
const check = (label: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "  PASS" : "  FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!cond) ok = false;
};

(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as import("node:net").AddressInfo).port;
  const endpoint = `https://127.0.0.1:${port}/push/verification-only`;
  const hash = endpointHash(endpoint);

  // A real P-256 point, so web-push's encryption runs for real rather
  // than throwing before it gets to the network.
  const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
  const p256dh = ecdh.getPublicKey().toString("base64url");
  const auth = crypto.randomBytes(16).toString("base64url");

  const db = await getDb();
  if (!db) throw new Error("no db");

  try {
    await db.insert(pushSubscriptions).values({
      tenantId: 1, userId: 999999, endpoint, endpointHash: hash,
      p256dh, auth, userAgent: "verification-script",
    });
    console.log("inserted a throwaway subscription pointing at the mock\n");

    startPushFanout();

    console.log("1. a ringing call reaches a closed device");
    emitCallRinging(1, "CA-verify", "+61400111222", "Simone Yates", []);
    await wait(1200);
    check("one push was sent", hits.length === 1, `${hits.length} hit(s)`);
    check("TTL expires with the ring", hits[0]?.ttl === "45", `TTL=${hits[0]?.ttl}`);
    check("urgency is high enough to wake a phone", hits[0]?.urgency === "high", `Urgency=${hits[0]?.urgency}`);
    check("payload was encrypted, not sent in clear", (hits[0]?.bytes ?? 0) > 50, `${hits[0]?.bytes} bytes`);

    console.log("\n2. a missed call persists instead of expiring");
    hits.length = 0;
    emitMissedCall(1, { id: 1, fromNumber: "+61400111222", clientName: "Simone Yates", transcriptText: null });
    await wait(1200);
    check("one push was sent", hits.length === 1, `${hits.length} hit(s)`);
    check("TTL is a day, not 45s", hits[0]?.ttl === "86400", `TTL=${hits[0]?.ttl}`);
    check("urgency is normal", hits[0]?.urgency === "normal", `Urgency=${hits[0]?.urgency}`);

    console.log("\n3. a transient failure KEEPS the subscription");
    respondWith = 500; hits.length = 0;
    emitCallRinging(1, "CA-verify-2", "+61400111222", "Simone Yates", []);
    await wait(1500);
    let rows = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpointHash, hash));
    check("row survived a 500", rows.length === 1);
    check("failure was counted", (rows[0]?.failureCount ?? 0) >= 1, `failureCount=${rows[0]?.failureCount}`);

    console.log("\n4. a 410 Gone prunes it");
    respondWith = 410; hits.length = 0;
    emitCallRinging(1, "CA-verify-3", "+61400111222", "Simone Yates", []);
    await wait(1500);
    rows = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpointHash, hash));
    check("row was deleted", rows.length === 0, `${rows.length} row(s) left`);
  } finally {
    const left = await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpointHash, hash));
    console.log("\ncleanup: removed any leftover verification row");
    server.close();
  }

  console.log(ok ? "\nALL CHECKS PASSED" : "\nSOME CHECKS FAILED");
  process.exit(ok ? 0 : 1);
})();
