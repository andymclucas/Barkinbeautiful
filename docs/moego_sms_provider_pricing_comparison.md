# Groomigo SMS Provider Pricing Comparison

**Prepared:** 12 August 2026  
**Purpose:** Estimate forward messaging costs for Barkin Beautiful/Groomigo using observed MoeGo SMS activity. This is a planning comparison, not a vendor quote.

## Executive conclusion

At the observed **core** volume, the public price inputs imply a similar range, approximately **A$38 to A$52 per month before GST and any applicable carrier or number charges**. If the high MoeGo automatic-message count becomes billable outbound SMS, the forward cost is more likely to sit around **A$233 to A$324 per month**, depending on provider and plan. **These are planning equivalents in Australian dollars, not a claim that every source page bills in AUD.**

For Groomigo, the commercial choice is not just the cheapest rate. **Twilio remains the lowest-change launch option** because it is already integrated and the existing message logs, delivery callbacks, inbound reply queue and tracker workflow are built around it. **Sinch MessageMedia/Engage** is the strongest Australian operational alternative if the salon values local support, a bundled two-way inbox and a predictable included-credit plan. **ClickSend** is the closest self-service cost competitor, while **SMSGlobal** is a credible Australian API option but its published prepaid rates are not cheaper at this volume.

> **Important data limitation:** MoeGo’s report does not disclose received inbound SMS or a true outbound/inbound split. The “used 2-way” figure is a credit-usage measure, not a count of both directions. Consequently, this report shows a narrow core case and a deliberately conservative automation-inclusive case rather than a single false-precision number.

## Usage baseline used for modelling

| Planning case | Monthly message basis | What it represents |
|---|---:|---|
| **Core outbound** | **525 SMS segments** | The six completed MoeGo cycles averaged 524.7 used-message credits. This is the best available comparable base, but it is not a verified sent-only count. |
| **Automation-inclusive** | **3,238 SMS segments** | Core volume plus the 2,713 average monthly “unlimited auto” messages. This assumes those auto messages would be billable outbound SMS in Groomigo, which is deliberately conservative. |

All figures assume standard-length, one-segment messages. Long messages, Unicode characters, media, international recipients, carrier pass-through fees, taxes and dedicated-number charges can increase the actual cost.

## Currency verification and correction

The original comparison should have labelled the currency basis more carefully. The provider pages use dollar symbols inconsistently, so the distinction below matters.

| Provider | What the source verifies | Treatment in this report |
|---|---|---|
| **Twilio** | Twilio says project balances and prices default to **USD, GBP or JPY** according to account currency. AUD is available only by request for eligible new accounts. | The Australia-rate page is modelled as **USD**, then translated into an **A$ planning equivalent** using the RBA 11 August 2026 AUD/USD rate. |
| **Sinch MessageMedia** | The price page is explicitly the Australian `messagemedia.com/au` page, uses Australian registration links and discloses GST and an Australian card surcharge, but the extracted page does not spell out “AUD” beside every dollar sign. | Treated as **A$ regional plan pricing**, but it should be confirmed in the written Australian quote before contracting. |
| **ClickSend** | ClickSend states that all accounts are managed in **AUD** behind the scenes; message fees and balances are held in AUD. Its public Australia marketing page quotes “$0.0720” without repeating the currency symbol. | Treated as **A$0.0720** for an Australian account, subject to the provider’s displayed local-currency conversion and current rate. |
| **SMSGlobal** | SMSGlobal explicitly labels its Australian prepaid top-up threshold and message rates as **AUD**. | **Verified A$**. |

Accordingly, **the table below expresses all figures as Australian-dollar planning equivalents**. Only the SMSGlobal unit rates are explicitly labelled AUD on the source page; Twilio is converted from its default USD pricing, and the two Australian regional pages should be confirmed by vendor quote.

## Forward cost comparison

| Provider | Core volume: monthly (A$ planning equivalent) | Automation-inclusive: monthly (A$ planning equivalent) | Automation-inclusive: annual (A$ planning equivalent) | What is included / excluded |
|---|---:|---:|---:|---|
| **Twilio** | **A$49.73** | **A$246.74** | **A$2,960.83** | Includes the public US$0.0515 outbound rate and US$8.25 mobile number, translated at the RBA’s 11 August 2026 AUD/USD reference. Excludes inbound replies, carrier fees and GST. |
| **Sinch MessageMedia / Engage** | **A$45.00** | **A$234.55** | **A$2,814.59** | Uses Australian Basics for 570 credits in the core case; Conversations plan plus listed overage for high case. Includes the plan’s sender ID/dedicated-number entitlement. Excludes GST and 1% card surcharge. |
| **ClickSend** | **A$37.78** | **A$233.11** | **A$2,797.34** | Uses its public starting rate of A$0.072 per message. Inbound replies are stated as free. Excludes any number cost, GST and potential volume discount because the public rate calculator did not expose a stable per-message rate. |
| **SMSGlobal** | **A$52.46** | **A$275.20–A$323.76** | **A$3,302.41–A$3,885.12** | Uses published Australian prepaid rates: 10c for core; 8.5c–10c for high volume depending on top-up commitment. Excludes any number cost and GST. |

### How the calculations work

| Provider | Public pricing input | Calculation used |
|---|---|---|
| Twilio | US$0.0515 outbound SMS + US$8.25/month mobile number under Twilio’s default account-currency model; RBA AUD/USD 0.7056 means 1 USD = approximately A$1.4172. | `(SMS segments × US$0.0515 + US$8.25) ÷ 0.7056` |
| Sinch MessageMedia | A$45 for 570 credits; A$115 for 1,600 credits with 7.3c listed additional SMS. | Core: A$45. High: `A$115 + (3,238 - 1,600) × A$0.073`. |
| ClickSend | Starts at A$0.0720 per message; free inbound messages. | `SMS segments × A$0.072`. |
| SMSGlobal | 10c at a A$5 top-up; 8.5c at a A$500 top-up. | `SMS segments × published prepaid rate`. |

## Provider fit beyond price

| Provider | Advantages for Groomigo | Trade-offs / questions to resolve |
|---|---|---|
| **Twilio** | Already integrated in Groomigo; current work supports outbound logs, delivery callbacks, manual review of inbound replies and one-time Pet Tracker link sending. Flexible global developer tooling. | Bills outbound, inbound and number separately in USD. Requires an Australian two-way number and sender/compliance configuration before live use. |
| **Sinch MessageMedia / Engage** | Australian plan, local VMN/Sender ID entitlement, API access, two-way inbox, automations and free inbound SMS in Australia. Stronger operational choice for a salon team that also wants a dashboard. | Subscription includes features Groomigo may duplicate. A migration would be required from the existing Twilio integration. |
| **ClickSend** | Self-service API, Australian presence, free inbound messages, no subscription and 24/7 support. Likely highly competitive if the high outbound scenario proves accurate. | Public price is a *starting* rate rather than a firm quote at Groomigo’s actual usage; dedicated-number fee and delivery route should be confirmed. Migration is required. |
| **SMSGlobal** | Australian provider with API, prepaid or post-paid structure and clear local published tiers. | Published rates are higher than the current comparison alternatives at this scale. Need to confirm two-way number, inbound pricing and API support in a written quote. |
| **Telnyx** | Global API alternative. | The public page inspected does not give an Australia-specific message route price, so it is not comparable without a quote. It should not be selected on the US-centric headline rate. |

## Recommended decision path

The sensible **prototype-to-launch** path is to retain **Twilio** for the first live Groomigo deployment, create an Australian two-way mobile number, and use a two-month live measurement period before committing to a migration. This avoids reworking an integration that is already in place, while generating the missing real data: standard segments sent, inbound replies, delivery failures and opt-out behaviour.

If annual cost control becomes more important once the actual high-volume automation scenario is confirmed, request **like-for-like written quotes** from Sinch MessageMedia/Engage and ClickSend for: one Australian VMN, two-way SMS, Australian destination traffic, 3,300 standard SMS segments per month, API/webhook access, delivery receipts, inbound handling and sender-ID registration. With the current public pricing, ClickSend and Sinch are each roughly **A$12–A$13 per month cheaper than Twilio** in the conservative high-volume model, before Twilio inbound-reply charges and foreign-exchange movement. That saving is modest relative to the cost of migration, so it does not justify changing provider before real launch-volume data is available.

## References

[1] [Twilio, *SMS Pricing in Australia*](https://www.twilio.com/en-us/sms/pricing/au). Public mobile SMS rates, mobile-number fee, segment billing and carrier-fee caveat.

[2] [Twilio, *What currencies can I use to fund my Twilio project?*](https://help.twilio.com/articles/223183288-What-currencies-can-I-use-to-fund-my-Twilio-project-). Default account-currency and AUD-by-request disclosure.

[3] [Reserve Bank of Australia, *Exchange Rates Overview*](https://www.rba.gov.au/exchange-rates-overview.html). AUD/USD rate of 0.7056 at 4 pm on 11 August 2026.

[4] [Sinch MessageMedia, *Australian Pricing*](https://messagemedia.com/au/pricing/). Australian plan prices, included credits, overage rates, GST and credit-card-surcharge disclosure.

[5] [Sinch Engage, *Pricing*](https://sinch.com/engage/pricing/). Free inbound SMS statement for Australia, local VMN inclusion and plan functionality.

[6] [ClickSend, *SMS Marketing*](https://www.clicksend.com/au/sms/sms-marketing/). Starting message rate and message-part caveat.

[7] [ClickSend, *Currencies and exchange rates*](https://help.clicksend.com/en/articles/43839-currencies-and-exchange-rates). AUD as the underlying balance and message-fee currency.

[8] [SMSGlobal, *Pricing Tier Plan Options*](https://knowledgebase.smsglobal.com/pricing-tier-plan-options-smsglobal-help-center). Australian prepaid rate tiers and top-up thresholds.

[9] [Telnyx, *Messaging Pricing*](https://telnyx.com/pricing/messaging). Global pricing page reviewed; not used as an Australian estimate because it does not provide an AU-specific route rate.
