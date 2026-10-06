/**
 * Reading, checking and repairing a VAPID keypair.
 *
 * Split out of webPush.ts so it can be tested without pulling in a
 * database connection, and because getting a keypair into a hosting
 * dashboard by hand turns out to be the single most error-prone step in
 * the whole feature — three failed deploys on 06/10/2026, each with a
 * message that said what the key should be and nothing about what
 * arrived.
 */
import crypto from "node:crypto";

export const VAPID_PUBLIC_BYTES = 65;
export const VAPID_PRIVATE_BYTES = 32;

/** Decoded byte length, or -1 when the value is not valid base64url. */
export function decodedBytes(key: string | undefined): number {
  if (!key) return -1;
  try {
    return Buffer.from(key, "base64url").length;
  } catch {
    return -1;
  }
}

/**
 * The public half of a VAPID keypair, computed from the private half.
 *
 * A VAPID keypair is an ordinary P-256 keypair, so the public key is
 * `private × G` and never needs to be transcribed separately. Deriving it
 * removes a whole class of failure permanently: it cannot be truncated by
 * a double-click, pasted into the wrong box, swapped with its partner, or
 * — the worst one — be a valid key belonging to a DIFFERENT pair, which
 * fails silently with subscriptions that succeed and then never deliver.
 *
 * Returns null when the private key is not a usable P-256 scalar.
 */
export function derivePublicKey(privateKey: string): string | null {
  try {
    const raw = Buffer.from(privateKey, "base64url");
    if (raw.length !== VAPID_PRIVATE_BYTES) return null;
    const ecdh = crypto.createECDH("prime256v1");
    ecdh.setPrivateKey(raw);
    return ecdh.getPublicKey().toString("base64url");
  } catch {
    return null;
  }
}

/**
 * A key's shape for a log line — never the key itself. A private key in a
 * hosting log is a private key on every screen that log reaches.
 */
export function describeKey(name: string, key: string | undefined, expected: number): string {
  if (!key) return `${name} not set`;
  const bytes = decodedBytes(key);
  return `${name} ${key.length} chars / ${bytes} bytes${bytes === expected ? " (ok)" : ` (expected ${expected})`}`;
}

/**
 * What is wrong with this pair, in words someone can act on.
 *
 * Returns null when nothing is wrong. The named causes are the three that
 * actually happened, in order of how often: the values in each other's
 * boxes, a value pasted with its own `VAPID_...=` prefix, and a clipboard
 * that was empty because the command that filled it ran in the wrong
 * directory.
 */
export function diagnoseVapidPair(publicKey: string | undefined, privateKey: string | undefined): string | null {
  if (!privateKey) return "VAPID_PRIVATE_KEY is not set.";

  if (decodedBytes(privateKey) === VAPID_PUBLIC_BYTES && decodedBytes(publicKey) === VAPID_PRIVATE_BYTES) {
    return "The two values are in each other's boxes — the public key is in VAPID_PRIVATE_KEY and vice versa.";
  }
  if (privateKey.includes("=") || publicKey?.includes("=")) {
    return "A value contains '=', which usually means the VAPID_... name was pasted along with it.";
  }
  if (privateKey.trim() === "") {
    return "VAPID_PRIVATE_KEY is empty — if it was filled from a clipboard, the copy command may have found nothing.";
  }
  // 65 bytes is the length of a PUBLIC key. Calling that "truncated" sends
  // someone looking for a copy-paste error that is not there; the value is
  // simply the wrong half of the pair.
  if (decodedBytes(privateKey) === VAPID_PUBLIC_BYTES) {
    return "VAPID_PRIVATE_KEY holds a public key — it is 65 bytes, and a private key is 32. The 43-character value is the private one.";
  }
  if (decodedBytes(privateKey) !== VAPID_PRIVATE_BYTES) {
    return `VAPID_PRIVATE_KEY decodes to ${decodedBytes(privateKey)} bytes, not ${VAPID_PRIVATE_BYTES}. It looks truncated or incomplete.`;
  }
  return null;
}
