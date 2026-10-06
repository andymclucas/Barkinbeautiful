import { describe, expect, it } from "vitest";
import webpush from "web-push";
import {
  derivePublicKey, decodedBytes, describeKey, diagnoseVapidPair,
  VAPID_PUBLIC_BYTES, VAPID_PRIVATE_BYTES,
} from "./vapidKeys";

describe("deriving the public key from the private one", () => {
  it("reproduces exactly what web-push generated", () => {
    // The whole point: the public half never has to be transcribed, so it
    // cannot be truncated, swapped, or left over from an older pair.
    for (let i = 0; i < 5; i += 1) {
      const pair = webpush.generateVAPIDKeys();
      expect(derivePublicKey(pair.privateKey)).toBe(pair.publicKey);
    }
  });

  it("produces a key web-push itself accepts", () => {
    const pair = webpush.generateVAPIDKeys();
    const derived = derivePublicKey(pair.privateKey)!;
    expect(() => webpush.setVapidDetails("mailto:a@b.c", derived, pair.privateKey)).not.toThrow();
    expect(decodedBytes(derived)).toBe(VAPID_PUBLIC_BYTES);
  });

  it("refuses anything that is not a 32-byte scalar", () => {
    const pair = webpush.generateVAPIDKeys();
    expect(derivePublicKey(pair.publicKey)).toBeNull();      // the halves swapped
    expect(derivePublicKey(pair.privateKey.slice(0, 20))).toBeNull(); // truncated
    expect(derivePublicKey("")).toBeNull();
    expect(derivePublicKey("not a key at all!!!")).toBeNull();
  });
});

describe("naming what went wrong", () => {
  const pair = webpush.generateVAPIDKeys();

  it("spots the two values in each other's boxes", () => {
    expect(diagnoseVapidPair(pair.privateKey, pair.publicKey))
      .toMatch(/each other's boxes/);
  });

  it("spots a value pasted with its own name in front", () => {
    expect(diagnoseVapidPair(pair.publicKey, `VAPID_PRIVATE_KEY=${pair.privateKey}`))
      .toMatch(/name was pasted/);
  });

  it("spots an empty value from a clipboard that never filled", () => {
    expect(diagnoseVapidPair(pair.publicKey, "   ")).toMatch(/copy command may have found nothing/);
  });

  it("spots a truncated private key", () => {
    expect(diagnoseVapidPair(pair.publicKey, pair.privateKey.slice(0, 20)))
      .toMatch(/truncated or incomplete/);
  });

  it("says nothing when the pair is fine", () => {
    expect(diagnoseVapidPair(pair.publicKey, pair.privateKey)).toBeNull();
    // And a missing public key is not a fault, because it is derived.
    expect(diagnoseVapidPair(undefined, pair.privateKey)).toBeNull();
  });
});

describe("describing a key without leaking it", () => {
  it("reports shape only, never the value", () => {
    const pair = webpush.generateVAPIDKeys();
    const line = describeKey("private", pair.privateKey, VAPID_PRIVATE_BYTES);
    expect(line).toBe("private 43 chars / 32 bytes (ok)");
    // The guard that matters: the key itself must never reach a log.
    expect(line).not.toContain(pair.privateKey);
  });

  it("flags a wrong length with what was expected", () => {
    expect(describeKey("public", "abc", VAPID_PUBLIC_BYTES)).toBe("public 3 chars / 2 bytes (expected 65)");
    expect(describeKey("public", undefined, VAPID_PUBLIC_BYTES)).toBe("public not set");
  });
});
