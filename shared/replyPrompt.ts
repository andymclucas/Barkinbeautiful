/**
 * The Y/N prompt the automated appointment texts carry.
 *
 * Andy, 06/11/2026. Underneath this, classifyInboundReply has recognised
 * Y/YES/CONFIRM and N/NO/CANCEL for a long time, and Messages has had a
 * one-tap review for a recognised reply — but nothing ever invited one,
 * so the machinery almost never fired.
 *
 * ## Plain ASCII, and the paw print goes with it
 *
 * One non-GSM character forces the whole message into UCS-2, which cuts a
 * segment from 160 characters to 70. The confirmation was 119 characters
 * and went out as TWO segments for the sake of one emoji; adding this
 * prompt on top would have made three. Dropped from the four reminder
 * stages and the confirmation, this prompt costs nothing.
 *
 * The emoji was not the only one. The four-day reminder also carried an
 * em-dash — "Just a heads up \u2014 Bella has..." — which forces UCS-2 just
 * as hard and is far easier to miss, because it looks like punctuation
 * rather than decoration. A test now asserts every one of these templates
 * stays GSM-7 and single-segment, which is what caught it.
 *
 * It is NOT added to the ready-for-pickup or grooming-report texts. There
 * is nothing to confirm or cancel by then, and "Reply N to cancel" on a
 * dog that is already clean and waiting at the counter is nonsense.
 */
export const REPLY_PROMPT = "Reply Y to confirm or N to cancel.";
