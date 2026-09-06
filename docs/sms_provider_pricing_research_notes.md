# SMS Provider Pricing Research Notes

**Collected:** 12 August 2026. All prices remain subject to message segmentation, carrier pass-through charges, applicable tax/GST, destination, sender-number requirements and vendor price changes.

## Official pricing pages

| Provider | Public pricing evidence | Relevance to Groomigo |
|---|---|---|
| Twilio | Australia pricing page lists **$0.0515 outbound** and **$0.0075 inbound** for mobile SMS, plus **$8.25/month** for a leased mobile number. SMS is billed per segment and carrier fees may apply. The Sinch comparison article describes the Twilio figures as **US dollars**, so model the public Twilio rate as USD unless Twilio confirms an AUD billing arrangement. | Existing integrated provider; supports two-way messaging and webhooks. |
| Sinch Engage / MessageMedia | Sinch’s Australian-provider comparison states plans run about **$42–$749/month**, with custom pricing above roughly **13,500 SMS/month**. It states inbound messages are free in Australia and no carrier pass-through fees are charged. | Australian enterprise/API alternative; requires quote for a line-item comparison. |
| SMSGlobal | Sinch’s comparison states SMSGlobal has monthly plans from **$39 to $179**, with rates falling to roughly **1.6¢ at the top tier**, plus a prepaid option. | Local platform; request a dedicated-number, API and inbound-reply quote before modelling. |
| ClickSend | Official Australian page states pay-as-you-go, no subscriptions, free inbound SMS and volume discounts. The visible page extraction did **not expose its AUD per-SMS price**, so use a vendor quote or in-product rate calculator rather than inventing a rate. | Self-service alternative; require an actual quote at projected volume. |
| Telnyx | Official messaging page has global pay-as-you-go pricing but the extracted public price table is not Australia-specific. It lists $0.004 outbound/inbound for one local-number category plus carrier fees, which should **not** be used to estimate Australian delivery without a quoted AU route rate. | Not a meaningful Australia-only cost comparison without an AU-specific quote. |

## Further verified pricing detail

| Provider | Verified public detail | How it is modelled |
|---|---|---|
| Sinch MessageMedia / Sinch Engage | The Australian MessageMedia price page lists **$45/month for 570 SMS**, **$115 for 1,600**, **$279 for 4,000**, **$439 for 7,300** and **$789 for 13,500**. It lists overage rates of **7.9c**, **7.3c**, **6.9c**, **6.0c** and **5.9c** respectively. One credit equals a standard-length SMS; prices exclude GST and a 1% card surcharge applies. The modern Sinch Engage page confirms inbound messages are free for Australia and that Australian plans include a local VMN number. | Direct public Australian plan comparison. For the high scenario, compare $279 Pro because it includes 4,000 credits. |
| SMSGlobal | SMSGlobal’s Australia knowledge-base page lists prepaid rates of **10c** (minimum $5 top-up), **8.5c** ($500), **7.5c** ($2,000), and **7c** ($5,000), with the tier active for six months. | Core case uses 10c; automation-inclusive case is shown as a 10c-to-8.5c range, since monthly usage alone does not require the $500 top-up. |
| ClickSend | ClickSend’s Australian marketing page states pricing starts at **$0.0720 per message** and messages over 160 characters can consume multiple message parts. Its two-way messaging page states incoming messages are free. | Public starting price is used; it is not necessarily the eventual volume-discount price. Number cost is excluded because the current official page extraction did not yield a stable Australian number fee. |
| Twilio | Twilio’s official Australia page is $0.0515 outbound and $0.0075 inbound per SMS segment, plus $8.25 monthly for a mobile number. The RBA quoted **AUD/USD 0.7056 at 4 pm 11 August 2026**, so USD figures are multiplied by **1.4172** to express a planning estimate in AUD. | Pricing in USD converted only for comparison; foreign-exchange movements, carrier fees and GST are excluded. |

## Sources

- Twilio Australia SMS pricing: https://www.twilio.com/en-us/sms/pricing/au
- ClickSend Australia pricing: https://www.clicksend.com/au/pricing/
- Sinch Engage Australian provider comparison (published 23 July 2026): https://sinch.com/engage/resources/business-messaging/sms-providers-australia/
- SMSGlobal gateway overview: https://www.smsglobal.com/sms-gateway/
- Telnyx messaging pricing: https://telnyx.com/pricing/messaging

## MoeGo usage baseline for modelling

The six complete MoeGo billing cycles (16 January–16 July 2026) averaged **524.7 used-message credits** and **2,713 unlimited automatic messages** per cycle. MoeGo does not provide a reliable outbound/inbound split or segment count, so calculations should show two scenarios:

1. **Core outbound scenario:** 525 billed outbound segments per month, representing the observed used-message baseline only.
2. **Automation-inclusive planning scenario:** 3,238 billed outbound segments per month, being 525 plus 2,713 automatic messages. This deliberately conservative scenario assumes the automated-message volume would become billable SMS with the new provider; actual consumption can be lower or higher depending on content length and channel use.
