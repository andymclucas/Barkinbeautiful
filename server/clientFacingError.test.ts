import { describe, it, expect } from "vitest";
import {
  clientFacingPortalError,
  GENERIC_FAILURE,
  isClientReadableMessage,
  PORTAL_LINK_FALLBACK,
  PORTAL_SIGNIN_FALLBACK,
  readableValidationMessage,
  staffFacingError,
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

describe("readableValidationMessage", () => {
  // The exact toast Andy was shown on the staff edit form: a full email
  // regex, with the one useful sentence buried at the end.
  const STAFF_FORM_BLOB = JSON.stringify([{
    origin: "string",
    code: "invalid_format",
    format: "email",
    pattern: "/^(?!\\.)(?!.*\\.\\.)([A-Za-z0-9_'+\\-\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$/",
    path: ["email"],
    message: "Invalid email address",
  }]);

  it("pulls the sentence out and names the field", () => {
    expect(readableValidationMessage(STAFF_FORM_BLOB)).toBe("Email: Invalid email address");
  });

  it("never leaks the pattern", () => {
    expect(readableValidationMessage(STAFF_FORM_BLOB)).not.toContain("A-Za-z");
  });

  it("lists several complaints rather than showing one wall", () => {
    const blob = JSON.stringify([
      { path: ["email"], message: "Invalid email address" },
      { path: ["phone"], message: "Too short" },
    ]);
    expect(readableValidationMessage(blob)).toBe("Email: Invalid email address · Phone: Too short");
  });

  it("makes an unmapped field read as English", () => {
    const blob = JSON.stringify([{ path: ["emergencyContact"], message: "Required" }]);
    expect(readableValidationMessage(blob)).toBe("Emergency contact: Required");
  });

  it("drops a duplicate complaint on the same field", () => {
    const blob = JSON.stringify([
      { path: ["email"], message: "Invalid email address" },
      { path: ["email"], message: "Invalid email address" },
    ]);
    expect(readableValidationMessage(blob)).toBe("Email: Invalid email address");
  });

  it("copes with a single object rather than an array", () => {
    expect(readableValidationMessage(JSON.stringify({ path: ["name"], message: "Required" })))
      .toBe("Name: Required");
  });

  it("gives the bare sentence when there is no path", () => {
    expect(readableValidationMessage(JSON.stringify([{ message: "Required" }]))).toBe("Required");
  });

  it("returns null for anything that is not validation output", () => {
    expect(readableValidationMessage("Client not found")).toBeNull();
    expect(readableValidationMessage("[not json")).toBeNull();
    expect(readableValidationMessage(JSON.stringify([{ code: "custom" }]))).toBeNull();
    expect(readableValidationMessage(null)).toBeNull();
    expect(readableValidationMessage("")).toBeNull();
  });
});

describe("staffFacingError", () => {
  it("passes our own written messages straight through", () => {
    expect(staffFacingError("This email is already assigned to another client portal account"))
      .toBe("This email is already assigned to another client portal account");
  });

  it("unpacks validation output", () => {
    const blob = JSON.stringify([{ path: ["email"], message: "Invalid email address" }]);
    expect(staffFacingError(blob)).toBe("Email: Invalid email address");
  });

  it("replaces machine output with something a person can read", () => {
    expect(staffFacingError("TypeError: x is not a function")).toBe(GENERIC_FAILURE);
    expect(staffFacingError("")).toBe(GENERIC_FAILURE);
    expect(staffFacingError(null)).toBe(GENERIC_FAILURE);
  });

  it("takes a caller's own fallback", () => {
    expect(staffFacingError(null, "Could not save this staff member.")).toBe("Could not save this staff member.");
  });
});
