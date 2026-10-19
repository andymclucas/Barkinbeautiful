/**
 * A small pair of wings, for a dog that has passed away.
 *
 * Hand-drawn because lucide has no angel wing and the alternatives all
 * say something else: a feather is a quill, a bird is a bird, and
 * HeartCrack — which the memorial badge on the client page uses — reads
 * as grief rather than as a gentle "not this one".
 *
 * It appears beside a struck-through name in the booking dialog, at
 * 12–14px, so it only has to read as wings at a glance. Fills with
 * currentColor so it takes the colour of whatever it sits in.
 */
export function AngelWings({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M11.2 7.3c-2.4-2.3-5.4-3.3-7.8-2.4C1.8 5.5 1 7 1.2 8.7c.4 2.9 3 5.3 6.3 6.1l2.2.5c.8.2 1.5-.4 1.5-1.2V7.3z" />
      <path d="M12.8 7.3c2.4-2.3 5.4-3.3 7.8-2.4 1.6.6 2.4 2.1 2.2 3.8-.4 2.9-3 5.3-6.3 6.1l-2.2.5c-.8.2-1.5-.4-1.5-1.2V7.3z" />
      <circle cx="12" cy="18.6" r="2.1" />
    </svg>
  );
}
