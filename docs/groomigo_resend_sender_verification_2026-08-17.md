# Groomigo Resend Sender Verification

## Current state

The Barkin Beautiful Resend workspace has no previously verified domains. A sender-verification request for `barkinbeautiful.com.au` has now been created in Resend. No invitation, client email, invoice or payment message was sent during this setup.

## Required DNS verification

Resend is waiting for the domain’s DNS provider to publish the following records shown in the Resend domain screen:

| Purpose | DNS record types |
|---|---|
| Domain identity | DKIM TXT record at `resend._domainkey` |
| Outbound delivery | SPF MX and TXT records at `send` |
| Policy, optional but recommended | DMARC TXT record at `_dmarc` |

The exact DKIM public key and regional MX host are available in the active Resend domain-verification screen and should be copied directly into the DNS provider rather than duplicated in project source or documentation.

## Safety

Groomigo remains prototype-safe. Staff invitations are administrator initiated and invitation-email delivery should not be treated as ready until Resend confirms the domain as verified.
