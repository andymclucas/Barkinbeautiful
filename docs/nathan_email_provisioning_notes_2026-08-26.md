# Nathan Branded Mailbox Provisioning Notes

- Date: 2026-08-26.
- User-authorised action: create `nathan@barkinbeautiful.com.au` through the existing hosting control panel, without changing DNS.
- Authenticated cPanel endpoint: `https://barkinbeautiful.com.au:2083/`.
- cPanel account context: primary domain `barkinbeautiful.com.au`; cPanel user `barkinbeautiful`.
- cPanel exposes **Email Accounts** and reports an available mail-account allowance (`1 / ∞` before the requested creation).
- No DNS, mail-routing, forwarder, autoresponder or existing-mailbox change is authorised by this task.
- The requested mailbox must receive a unique secret password. The password will not be stored in project files or sent in this note.
