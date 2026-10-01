/**
 * Choosing who a mass text goes to.
 *
 * There is no undo on a text message, and the salon has a finite SMS
 * balance, so the recipient set is a decision worth making explicitly
 * rather than defaulting to "everyone". The audience is described here as
 * data, so the same definition drives the preview count the sender is
 * shown and the send itself — the two cannot disagree.
 */

export const MASS_TEXT_AUDIENCES = [
  { key: "booked_between", label: "Clients booked in a date range" },
  { key: "membership_tier", label: "Members on a tier" },
  { key: "hand_picked", label: "Hand-picked clients" },
  { key: "all_active", label: "Every active client" },
] as const;

export type MassTextAudienceKey = (typeof MASS_TEXT_AUDIENCES)[number]["key"];

export type MassTextAudience =
  | { kind: "booked_between"; from: string; to: string }
  | { kind: "membership_tier"; tier: string }
  | { kind: "hand_picked"; clientIds: number[] }
  | { kind: "all_active" };

/** Above this, the sender types the number to confirm. */
export const TYPED_CONFIRM_THRESHOLD = 25;

export const MAX_BODY_LENGTH = 480;

/** The membership tiers that exist. A typo must not silently match nobody. */
export const MEMBERSHIP_TIERS = ["diamond", "platinum", "gold", "silver", "bronze"] as const;

/** Above this, refuse outright rather than tie up one request for minutes. */
export const MAX_RECIPIENTS_PER_SEND = 500;

export type AudienceValidation =
  | { ok: true; audience: MassTextAudience }
  | { ok: false; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateAudience(input: unknown): AudienceValidation {
  const a = input as MassTextAudience | null | undefined;
  if (!a || typeof a !== "object") return { ok: false, error: "Choose who this goes to." };

  switch (a.kind) {
    case "booked_between": {
      if (!ISO_DATE.test(a.from ?? "") || !ISO_DATE.test(a.to ?? "")) {
        return { ok: false, error: "Choose a start and end date." };
      }
      // 2026-02-30 matches the pattern and is not a day.
      for (const value of [a.from, a.to]) {
        const d = new Date(`${value}T00:00:00Z`);
        if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
          return { ok: false, error: `${value} isn't a real date.` };
        }
      }
      if (a.from > a.to) return { ok: false, error: "The end date is before the start date." };
      return { ok: true, audience: { kind: "booked_between", from: a.from, to: a.to } };
    }
    case "membership_tier": {
      const tier = (a.tier ?? "").trim().toLowerCase();
      if (!tier) return { ok: false, error: "Choose a membership tier." };
      if (!(MEMBERSHIP_TIERS as readonly string[]).includes(tier)) {
        // A typo used to match zero rows and read as "nobody qualifies".
        return { ok: false, error: `Unknown tier "${tier}".` };
      }
      return { ok: true, audience: { kind: "membership_tier", tier } };
    }
    case "hand_picked": {
      const ids = Array.from(new Set((a.clientIds ?? []).filter((n) => Number.isInteger(n) && n > 0)));
      if (ids.length === 0) return { ok: false, error: "Pick at least one client." };
      return { ok: true, audience: { kind: "hand_picked", clientIds: ids } };
    }
    case "all_active":
      return { ok: true, audience: { kind: "all_active" } };
    default:
      return { ok: false, error: "Choose who this goes to." };
  }
}

/** "Clients booked 6–10 Oct", for the confirmation the sender reads. */
export function describeAudience(audience: MassTextAudience): string {
  switch (audience.kind) {
    case "booked_between":
      return `Clients booked between ${audience.from} and ${audience.to}`;
    case "membership_tier":
      return `Members on the ${audience.tier} tier`;
    case "hand_picked":
      return `${audience.clientIds.length} hand-picked client${audience.clientIds.length === 1 ? "" : "s"}`;
    case "all_active":
      return "Every active client";
  }
}

export type SendGuard =
  | { ok: true }
  | { ok: false; error: string };

/**
 * The last check before real messages go out.
 *
 * `confirmedCount` is what the sender was shown and agreed to. If the
 * audience has grown since the preview — someone booked in meanwhile —
 * the send is refused rather than quietly reaching more people than the
 * person authorised.
 */
export function guardSend(input: {
  body: string;
  recipientCount: number;
  confirmedCount: number;
  smsBalance?: number | null;
}): SendGuard {
  const body = (input.body ?? "").trim();
  if (!body) return { ok: false, error: "Write the message first." };
  if (body.length > MAX_BODY_LENGTH) {
    return { ok: false, error: `That message is ${body.length} characters; the limit is ${MAX_BODY_LENGTH}.` };
  }
  if (input.recipientCount <= 0) return { ok: false, error: "Nobody matches that selection." };
  if (input.recipientCount > MAX_RECIPIENTS_PER_SEND) {
    return {
      ok: false,
      error: `That reaches ${input.recipientCount} people. The limit for one send is ${MAX_RECIPIENTS_PER_SEND} — narrow the audience.`,
    };
  }
  if (input.recipientCount !== input.confirmedCount) {
    return {
      ok: false,
      error: `This now reaches ${input.recipientCount} people, not the ${input.confirmedCount} you confirmed. Check the preview again.`,
    };
  }
  if (typeof input.smsBalance === "number" && input.smsBalance >= 0 && input.recipientCount > input.smsBalance) {
    return {
      ok: false,
      error: `That needs ${input.recipientCount} messages and only ${input.smsBalance} remain.`,
    };
  }
  return { ok: true };
}

export function needsTypedConfirmation(recipientCount: number): boolean {
  return recipientCount > TYPED_CONFIRM_THRESHOLD;
}
