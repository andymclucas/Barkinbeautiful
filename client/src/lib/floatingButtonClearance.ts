/**
 * Room below a page's last controls for the round Bruce button
 * (SupportChat.tsx), which is fixed 20px from the bottom-right corner and
 * 48px tall.
 *
 * Without it, a pager at the foot of a list sat right under the button: on
 * the Memberships list the next-page arrow could not be pressed at all, and
 * the button cannot be moved out of the way (Lauren, 23/11/2026, ticket
 * 0064). Padding below the pager lets it scroll up clear of the button.
 *
 * Applied to the pagers only, not to every page: the calendar and messages
 * fill the window exactly, and extra space there would add a scrollbar.
 */
export const FLOATING_BUTTON_CLEARANCE = "pb-20";
