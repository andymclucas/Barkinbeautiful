/**
 * Checks that outbound email actually works, without printing the key.
 *
 * Written after a stale RESEND_API_KEY sat in a local .env unnoticed: the app
 * does not throw when Resend rejects a key, it logs and returns false, so
 * every password reset, grooming card and staff invitation sent from that
 * environment silently went nowhere. `pnpm run test:integration` needs the
 * same key, so it fails for the same invisible reason.
 *
 *   corepack pnpm exec tsx scripts/verify-resend.ts
 *   corepack pnpm exec tsx scripts/verify-resend.ts --send you@example.com
 *
 * The first form only reads: it validates the key and lists the sending
 * domains. The second sends one real email, so it is opt-in and takes the
 * recipient explicitly rather than guessing.
 *
 * Never prints the key, only its length and prefix — enough to tell a
 * truncated paste from a revoked key, and safe to put in a terminal someone
 * else can see.
 */
import "dotenv/config";

const KEY = process.env.RESEND_API_KEY ?? "";
const FROM = process.env.RESEND_FROM_EMAIL ?? "";

function describeKey(key: string) {
  if (!key) return "(not set)";
  return `${key.slice(0, 3)}… ${key.length} chars`;
}

async function main() {
  const sendIndex = process.argv.indexOf("--send");
  const sendTo = sendIndex === -1 ? null : process.argv[sendIndex + 1];

  console.log("RESEND_API_KEY   :", describeKey(KEY));
  console.log("RESEND_FROM_EMAIL:", FROM || "(not set)");

  if (!KEY) {
    console.error("\nNo key set. Add RESEND_API_KEY to .env — see §9 of CLAUDE.md.");
    process.exitCode = 1;
    return;
  }
  if (!/^re_/.test(KEY)) {
    console.error("\nThat does not look like a Resend key (they start with 're_').");
    process.exitCode = 1;
    return;
  }

  // Listing domains is the cheapest authenticated call Resend has, so it
  // separates "key is wrong" from "sending is misconfigured" before anything
  // is sent.
  const res = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${KEY}` },
  });

  // Resend answers an invalid key with 400 on /domains and 401 on /emails, so
  // match on the message rather than the status or a bad key reads as a
  // malformed request.
  const rawBody = await res.clone().text();
  if (/api key is invalid/i.test(rawBody)) {
    console.error(`\n✗ Resend rejected the key (${res.status}). It is revoked, truncated, or from another account.`);
    console.error(`  The key here is ${describeKey(KEY)}; a live one is noticeably longer.`);
    console.error("  New key: https://resend.com/api-keys — then set RESEND_API_KEY in .env and re-run this.");
    process.exitCode = 1;
    return;
  }
  // A key scoped to "Sending access" cannot read account config, which is the
  // correct way to scope it. Listing domains then fails on permissions, and
  // that is a pass, not a problem — say so rather than crying wolf.
  if (res.status === 401 || res.status === 403 || /restricted|not allowed|permission/i.test(rawBody)) {
    console.log("\n✓ Key accepted, and scoped to sending only — it cannot read account config.");
    console.log("  That is the right scope, so the domain list below is unavailable by design.");
    console.log(`  To prove sending end to end: --send <email> (from ${FROM || "RESEND_FROM_EMAIL"}).`);
    return;
  }
  if (!res.ok) {
    console.error(`\n✗ Resend returned ${res.status}. Body: ${(await res.text()).slice(0, 300)}`);
    process.exitCode = 1;
    return;
  }

  const body = (await res.json()) as { data?: { name: string; status: string; region?: string }[] };
  const domains = body.data ?? [];
  console.log("\n✓ Key accepted. Sending domains:");
  if (domains.length === 0) {
    console.log("   (none — nothing can be sent until a domain is verified)");
  }
  for (const domain of domains) {
    const ok = domain.status === "verified";
    console.log(`   ${ok ? "✓" : "✗"} ${domain.name} — ${domain.status}${domain.region ? ` (${domain.region})` : ""}`);
  }

  // The from-address has to sit on a verified domain or every send 403s.
  const fromDomain = FROM.split("@")[1];
  if (fromDomain) {
    const match = domains.find((d) => d.name.toLowerCase() === fromDomain.toLowerCase());
    if (!match) {
      console.log(`\n! RESEND_FROM_EMAIL is on ${fromDomain}, which is not in that list.`);
    } else if (match.status !== "verified") {
      console.log(`\n! ${fromDomain} is ${match.status}, so sends from ${FROM} will fail.`);
    }
  }

  if (!sendTo) {
    console.log("\nRead-only check done. Add --send <email> to send one real test email.");
    return;
  }

  const { sendEmail } = await import("../server/email");
  const sent = await sendEmail({
    to: sendTo,
    subject: "Groomigo — Resend check",
    html: `<p>Outbound email is working.</p><p style="color:#6b7280;font-size:12px">Sent by scripts/verify-resend.ts at ${new Date().toISOString()}.</p>`,
  });
  console.log(sent ? `\n✓ Test email sent to ${sendTo}` : `\n✗ sendEmail returned false — see the error above`);
  if (!sent) process.exitCode = 1;
}

main().catch((err) => {
  console.error("verify-resend failed:", err);
  process.exitCode = 1;
});
