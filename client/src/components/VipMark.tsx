/**
 * The gold VIP disc on a membership dog's appointment card.
 *
 * Andy, 04/11/2026: "Replace the 'Member' text with a circular VIP
 * icon for all membership clients and make it gold."
 *
 * Round and small on purpose. The thing it replaced was a MEMBER text
 * chip the width of the PAID stamp, which meant a card could only show
 * one of the two; a disc tucks in beside the payment stamp, so a
 * membership dog that paid for extras reads as both.
 *
 * Who gets one is `showsMembershipMark` in shared/, with the reasoning.
 * This file is only the pixels.
 */
import { VIP_GOLD } from "@shared/membershipMark";

export function VipMark({ className = "" }: { className?: string }) {
  return (
    <span
      data-testid="appt-vip-mark"
      title="On a weekly membership"
      aria-label="On a weekly membership"
      role="img"
      /*
       * `shrink-0` because this sits in a row with a truncating name on
       * a card that gets as narrow as 47px — without it the disc
       * squashes into an ellipse before the name gives up any width.
       *
       * Fixed px rather than a Tailwind size utility: the day card sets
       * `[&_svg]:size-4` on everything inside it, and a span that has
       * to stay perfectly round is safer stated outright.
       */
      className={`inline-flex shrink-0 items-center justify-center rounded-full border align-[-3px] font-black leading-none ${className}`}
      style={{
        /*
         * The fit is MEASURED, not guessed: "VIP" at 8px bold wants
         * 15.9px, and a 20px disc with a 1px border leaves 18px of
         * inner width, so the letters sit with 2px to spare and
         * cannot clip. It was 18/7 first, which also fitted — the size
         * went up because 7px is below everything else on the card
         * (the stamps and service pills are 9px) and this board is
         * read on a phone and on the wall screen, not just here.
         */
        width: 20,
        height: 20,
        fontSize: 8,
        letterSpacing: "0.01em",
        background: `linear-gradient(145deg, #f3d37a 0%, ${VIP_GOLD.fill} 55%, #c9971f 100%)`,
        borderColor: VIP_GOLD.edge,
        color: VIP_GOLD.ink,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.65)",
      }}
    >
      VIP
    </span>
  );
}

export default VipMark;
