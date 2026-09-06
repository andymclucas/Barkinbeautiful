# Resend Domain Verification Working Notes — 26 August 2026

## Authenticated Resend inspection

- URL: `https://resend.com/domains`
- Account shown: `barkinbeautiful` / `barkinbeautiful@hotmail.com.au`
- Domain: `barkinbeautiful.com.au`
- Current status: **Not Started**

## Required records shown by Resend

Resend shows the following records for `barkinbeautiful.com.au`, all currently **Not Started**. No DNS record has been altered.

| Purpose | Type | Host/name | Value | TTL / priority | Status |
| --- | --- | --- | --- | --- | --- |
| DKIM | TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCdtUJDqAaigv9dmUaNsLb1Ftt3km0qB79hrc6/w+edvFQLgC9+FHLIpoKnrMzwMVEmSz2dDgvRqqD5OV96hFA2tqVqG5G6PnHlQHc/KudjppZa1tTllC6f+Huwmn/6PCKPWupXUuRn+1egjd+fJ0tB0ckYV3P00IdF5M48cjXJowIDAQAB` | Auto | Not Started |
| SPF mail-from | MX | `send` | `feedback-smtp.ap-northeast-1.amazonses.com` | Auto / 10 | Not Started |
| SPF mail-from | TXT | `send` | `v=spf1 include:amazonses.com ~all` | Auto | Not Started |
| DMARC (optional) | TXT | `_dmarc` | `v=DMARC1; p=none;` | Auto | Not Started |

The optional DMARC record must not be added until the existing `_dmarc` record is inspected, because a domain may only have one effective DMARC TXT record. The next read-only step is to identify the authoritative DNS provider and compare these hosts with existing records.

## Authoritative DNS lookup

Public DNS resolves the authoritative nameservers to `ns1.qldwebhosting.com.au` through `ns4.qldwebhosting.com.au`; the returned SOA identifies `servers.panthur.com` as the zone contact. No existing DNS record was found for `resend._domainkey`, `send` (MX or TXT) or `_dmarc`, so the three required non-optional Resend records do not presently conflict with those exact hosts. The Panthur website is the associated provider and its public login control is available, but the client-portal route has not yet been established. No DNS record has been changed.
