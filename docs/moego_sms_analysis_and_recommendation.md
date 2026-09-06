# MoeGo SMS Usage Analysis and Groomigo Messaging Recommendation

**Prepared:** 12 August 2026  
**Business:** Barkin Beautiful Grooming Studio & Playgroup  
**Scope:** MoeGo message-report cycles from **16 January to 16 August 2026**, stopping at the requested beginning-of-2026 boundary.

## Executive conclusion

The most practical path for Groomigo is to **retain Twilio as the production messaging provider** when the salon is ready to go live. The application already has a working Twilio integration, delivery-status webhook endpoint, inbound-message webhook endpoint, message log, and an appointment-reminder workflow. Moving to a different provider now would create avoidable replacement work without resolving the principal product gap: reliable in-platform visibility of sent, delivered, failed, and inbound messages.

For Australian production, the next operational step is to upgrade the trial account and provision a dedicated Australian mobile number. This permits genuine two-way conversations and keeps the number identifiable to customers. The platform should remain in prototype mode, with all client sending disabled, until the salon approves a controlled go-live.

> **Important reporting limitation:** MoeGo’s report does not disclose an inbound-received SMS count or a true sent-versus-received message export. It shows billing-cycle consumption fields. Accordingly, the figures below are a dependable **usage-credit and automation-volume analysis**, not a defensible count of customer replies or individual SMS segments.

## Billing-cycle usage breakdown

MoeGo uses billing cycles running from the **16th of one month to the 16th of the next**, rather than calendar months. The report also treats message length and encoding as relevant to billing, so a credit total should not be treated as an exact count of human-readable texts.[1]

| MoeGo billing cycle | Total SMS credits | Used-message credits | Unlimited auto SMS | Cycle status |
|---|---:|---:|---:|---|
| 16 Jan–16 Feb 2026 | 509 | 487 | 3,259 | Complete |
| 16 Feb–16 Mar 2026 | 472 | 405 | 2,703 | Complete |
| 16 Mar–16 Apr 2026 | 472 | 455 | 2,709 | Complete |
| 16 Apr–16 May 2026 | 967 | 598 | 2,803 | Complete |
| 16 May–16 Jun 2026 | 819 | 623 | 2,526 | Complete |
| 16 Jun–16 Jul 2026 | 646 | 580 | 2,278 | Complete |
| 16 Jul–16 Aug 2026 | 516 | 412 | 1,906 | **Partial; excluded from averages** |

Across the **six complete cycles**, the salon had **3,885 total SMS credits**, of which **3,148 were used-message credits**. This is an average of **647.5 total credits** and **524.7 used-message credits per billing cycle**, representing approximately **81.0%** utilisation of available credits. MoeGo recorded **16,278 unlimited automatic messages**, averaging **2,713 per complete cycle**. Automatic messages are the dominant operational communication volume and should therefore be preserved as first-class, auditable templates in Groomigo.

| Measure across complete cycles | Result | Interpretation |
|---|---:|---|
| Average used-message credits | 524.7 per cycle | Baseline for manual/two-way usage capacity planning; not a sent/received split. |
| Peak used-message credits | 623 in 16 May–16 Jun | Sensible initial allowance should accommodate at least 650 credits plus growth headroom. |
| Lowest used-message credits | 405 in 16 Feb–16 Mar | Confirms material month-to-month variation. |
| Average unlimited auto SMS | 2,713 per cycle | Appointment reminders, confirmations and other automated notices are the principal volume driver. |
| Inbound client replies | Not available in MoeGo report | Cannot be reconstructed from this report alone. |

## What the source can and cannot tell us

The Message Centre report identifies total credits, used-message credits, 2-way-message usage, auto-message usage, unlimited-auto-message usage, and auto-call usage. However, it does **not** give an inbound-count field, and it offers no suitable direct sent/received CSV export in the available interface. For the future Groomigo dashboard, the system should record message direction, provider ID, status, template, appointment/client link, segments and price at the time each event occurs. That will eliminate this reporting gap.

## Provider assessment

| Provider | Fit for Groomigo | Strengths | Principal trade-off | Recommendation |
|---|---|---|---|---|
| **Twilio** | Excellent | Already integrated; supports Australian two-way SMS; inbound and delivery webhooks fit the existing architecture; supports a dedicated AU mobile number and portable numbers.[2] | Requires production-account setup and active SMS compliance configuration. | **Choose for initial launch.** |
| **MessageMedia / Sinch Engage** | Strong alternative | Australian API offering REST/SMPP, delivery callbacks and enterprise-scale operational support.[3] | Requires replacing the established Twilio adapter, webhook handling and credentials. | Obtain a proposal only if local account-management or contracted pricing is a decisive requirement. |
| **SMSGlobal** | Strong alternative | Australian-focused API platform with dedicated virtual numbers, two-way conversations, delivery reporting and opt-out support.[4] | Same migration cost and operational revalidation as MessageMedia. | Keep as a pricing/commercial benchmark rather than a pre-launch replacement. |

Twilio’s official Australian pricing page lists a mobile-number price of **$0.0515 per outbound SMS segment**, **$0.0075 inbound**, plus **$8.25 per month** for a leased clean mobile number; carrier fees, message segmentation and price changes can affect the actual bill.[5] The MoeGo consumption fields do not allow an exact like-for-like cost conversion, so Groomigo should collect one or two complete production billing cycles before making a cost-based provider change.

## Recommended Groomigo rollout

The recommended design retains the existing Twilio implementation but treats messaging as an auditable operational subsystem, not merely a send button.

| Stage | Action | Safety control |
|---|---|---|
| 1. Prototype | Keep appointment reminders, campaigns and payment messages disabled for customers. | No automated client communications while the prototype is being reviewed. |
| 2. Production readiness | Upgrade the Twilio account and provision a dedicated **+61 mobile number** for two-way conversations. | Test only with salon-owned and explicitly verified internal numbers. |
| 3. Compliance configuration | Capture consent, business identification and opt-out events; support STOP/HELP handling. | Australian commercial SMS requires permission, sender identification and a low/no-cost unsubscribe path.[2] |
| 4. Operational launch | Enable a limited appointment-reminder pilot, monitor delivery statuses and review failures each day. | Begin with a small opt-in group; retain a manual override for every appointment. |
| 5. Two-way workflow | Map clear replies such as **Y/YES/CONFIRM** and **N/NO/CANCEL** to a review queue before any automatic appointment change. | Never cancel or alter an appointment solely from ambiguous free text. |
| 6. Measurement | Report outbound, inbound, delivered, failed, queued, opted-out and per-template costs monthly. | Use Groomigo’s own message log as the source of truth. |

## Implementation position in Groomigo

The platform already contains the necessary foundation: a Twilio adapter, SMS history table, messages screen, server-side message API, delivery-status webhook, inbound-message webhook and a 24-hour appointment-reminder handler. The outstanding work is deliberately **not enabled yet**: filters in the history screen, inbound confirmation/cancellation processing, and a calendar indicator for a successfully delivered reminder. These should be completed as a separate, controlled messaging activation phase.

## Decision

**Proceed with Twilio for Groomigo’s first production messaging release.** Keep MessageMedia/Sinch Engage and SMSGlobal as commercial alternatives to quote against once actual Groomigo delivery and usage data is available. This approach minimises build rework, preserves two-way messaging, and gives the salon the stronger reporting and workflow visibility that MoeGo’s report cannot provide.

## References

[1]: https://www.moego.pet/help/en/articles/11391937-message-purchase-sms-counting-messages "MoeGo: Message – Purchase SMS & Counting Messages"
[2]: https://www.twilio.com/en-us/guidelines/au/sms "Twilio: Australia SMS Guidelines"
[3]: https://messagemedia.com/au/sms-api-gateway/ "MessageMedia / Sinch Engage: Australian SMS API Gateway"
[4]: https://www.smsglobal.com/sms-gateway/ "SMSGlobal: MXT SMS Gateway"
[5]: https://www.twilio.com/en-us/sms/pricing/au "Twilio: Australia SMS Pricing"
