# MoeGo SMS Usage Working Notes

> Source: MoeGo Message Center → **SMS Available** → Message report. MoeGo exposes a billing-cycle view, not a direct sent/received export. The report's **Used message** value is a consumption figure rather than a sent/received split; it includes report categories such as 2-way messages and auto calls. The report does not show an inbound-received count.

| Billing cycle | Total SMS credits | Used-message credits | Auto SMS | Unlimited auto SMS | Source status |
|---|---:|---:|---:|---:|---|
| 16 Jul–16 Aug 2026 | 516 | 412 | 0 | 1,906 | Current partial cycle, verified |
| 16 Jun–16 Jul 2026 | 646 | 580 | 0 | 2,278 | Complete cycle, verified |
| 16 May–16 Jun 2026 | 819 | 623 | 0 | 2,526 | Complete cycle, verified |
| 16 Apr–16 May 2026 | 967 | 598 | 0 | 2,803 | Complete cycle, verified |
| 16 Mar–16 Apr 2026 | 472 | 455 | 0 | 2,709 | Complete cycle, verified |
| 16 Feb–16 Mar 2026 | 472 | 405 | 0 | 2,703 | Complete cycle, verified |
| 16 Jan–16 Feb 2026 | 509 | 487 | 0 | 3,259 | Complete cycle, verified |

## Confirmed report behaviour

- The report dropdown exposes historical billing cycles, including at least the last eight cycles in the initial list. It can be used to collect a 12-cycle analysis.
- MoeGo’s **Message report** contains total credits, used-message credits, **2-way message** usage, auto-message usage, unlimited auto-message usage, and auto-call usage. The monthly table records the report's top-level used-message field for consistent cycle-to-cycle comparison.
- The report is opened from **Messages → SMS Available** and reports a single billing cycle at a time; it has no CSV-export control in the available user interface.
- It does **not** disclose a count of inbound client SMS replies. Accordingly, the report can support an outbound/credit-usage analysis but not a defensible sent-versus-received SMS breakdown without a separate conversation export or API-level message log.
- MoeGo’s documentation: [Message – Purchase SMS & Counting Messages](https://www.moego.pet/help/en/articles/11391937-message-purchase-sms-counting-messages) and [Communication – Auto Message vs. 2-way Message](https://help.moego.pet/en/articles/11116722-communication-auto-message-vs-2-way-message). The documents confirm that auto and two-way messages are counted differently; one standard segment is 160 characters, while special characters/emojis can consume segments faster.
