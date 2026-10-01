import { describe, it, expect } from "vitest";
import {
  clientFacingPortalError,
  isClientReadableMessage,
  PORTAL_LINK_FALLBACK,
  PORTAL_SIGNIN_FALLBACK,
} from "@shared/clientFacingError";

// The exact string a client was shown after successfully saving their card.
const ZOD_BLOB =
  '[ { "origin": "string", "code": "too_small", "minimum": 32, "inclusive": true, "path": [ "token" ], "message": "Too small: expected string to have >=32 characters" } ]';

describe("isClientReadableMessage", () => {
  it("rejects the zod blob a client actually saw", () => {
    expect(isClientReadableMessage(ZOD_BLOB)).toBe(false);
  });

  it("rejects serialised objects, stack traces and validation chatter", () => {
    expect(isClientReadableMessage('{"code":"BAD_REQUEST"}')).toBe(false);
    expect(isClientReadableMessage("TypeError: x is not a function")).toBe(false);
    expect(isClientReadableMessage('Invalid input: expected string')).toBe(false);
    expect(isClientReadableMessage("boom\n    at Object.<anonymous>")).toBe(false);
  });

  it("rejects nothing at all", () => {
    expect(isClientReadableMessage("")).toBe(false);
    expect(isClientReadableMessage("   ")).toBe(false);
    expect(isClientReadableMessage(null)).toBe(false);
    expect(isClientReadableMessage(undefined)).toBe(false);
  });

  it("accepts messages we wrote for people", () => {
    expect(isClientReadableMessage("This portal link has expired.")).toBe(true);
    expect(isClientReadableMessage("Please sign in to your client portal")).toBe(true);
  });
});

describe("clientFacingPortalError", () => {
  it("replaces machine output with something a client can act on", () => {
    expect(clientFacingPortalError(ZOD_BLOB, true)).toBe(PORTAL_LINK_FALLBACK);
    expect(clientFacingPortalError(ZOD_BLOB, false)).toBe(PORTAL_SIGNIN_FALLBACK);
  });

  it("keeps a message we wrote ourselves", () => {
    expect(clientFacingPortalError("This portal link has expired.", true)).toBe(
      "This portal link has expired.",
    );
  });

  it("picks the fallback that matches how they arrived", () => {
    expect(clientFacingPortalError(null, true)).toBe(PORTAL_LINK_FALLBACK);
    expect(clientFacingPortalError(null, false)).toBe(PORTAL_SIGNIN_FALLBACK);
  });
});
