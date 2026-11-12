/**
 * Bruce, the support assistant's face: a little chihuahua in a sombrero.
 *
 * Andy, 13/11/2026: "have a little mexican dog wearing a sombrero as the
 * chat bot ID." He was first called Guapo; later the same day Andy
 * renamed him: "Change Guapo's name to Bruce but start the chat with
 * 'Hi, I'm Bruce, your AI amigo!'"
 *
 * Drawn inline rather than loaded as an image so it is crisp at 24px
 * beside a message and at 48px on the bubble, and costs no request.
 * The colours are fixed on purpose: he is a character, not an icon, and
 * should look the same in light, dark and the Christmas theme.
 */
export function BruceAvatar({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role="img"
      aria-label="Bruce"
      className={`shrink-0 ${className}`}
    >
      <circle cx="32" cy="32" r="32" fill="#FFE8C2" />

      {/* Ears: big, because he is a chihuahua. */}
      <path d="M13 34 L7 18 Q6 14 10 16 L25 27 Z" fill="#C98A4B" />
      <path d="M51 34 L57 18 Q58 14 54 16 L39 27 Z" fill="#C98A4B" />
      <path d="M13.500 30 L10 20 L21 28 Z" fill="#F2B8A0" />
      <path d="M50.500 30 L54 20 L43 28 Z" fill="#F2B8A0" />

      {/* Head */}
      <ellipse cx="32" cy="40" rx="15" ry="14" fill="#DDA15E" />
      {/* Muzzle */}
      <ellipse cx="32" cy="46.500" rx="8.500" ry="7" fill="#FBEBD0" />

      {/* Eyes */}
      <circle cx="25.500" cy="38" r="3.200" fill="#2B1B12" />
      <circle cx="38.500" cy="38" r="3.200" fill="#2B1B12" />
      <circle cx="26.500" cy="37" r="1" fill="#FFFFFF" />
      <circle cx="39.500" cy="37" r="1" fill="#FFFFFF" />

      {/* Nose and smile */}
      <ellipse cx="32" cy="43.500" rx="2.600" ry="1.900" fill="#2B1B12" />
      <path d="M32 45.400 V47.500 M32 47.500 Q29 50.500 26.500 48 M32 47.500 Q35 50.500 37.500 48" fill="none" stroke="#2B1B12" strokeWidth="1.300" strokeLinecap="round" />
      {/* Tongue */}
      <path d="M30.300 49 Q32 53.500 33.700 49 Z" fill="#F0708A" />

      {/* Sombrero: brim, crown, band and trim. */}
      <ellipse cx="32" cy="25" rx="27" ry="6.500" fill="#E9B44C" />
      <ellipse cx="32" cy="24" rx="27" ry="5.500" fill="#F6CF65" />
      <path d="M21 24 Q21 6 32 6 Q43 6 43 24 Z" fill="#F6CF65" />
      <path d="M21.300 20 Q32 24.500 42.700 20 L43 24 Q32 28.500 21 24 Z" fill="#D7263D" />
      <path d="M22.500 21.800 l2 1 M27 23.300 l2 .5 M35 23.800 l2 -.5 M39.500 22.800 l2 -1" stroke="#1B998B" strokeWidth="1.600" strokeLinecap="round" />
      <path d="M7 25.500 Q32 34 57 25.500" fill="none" stroke="#D7263D" strokeWidth="1.400" strokeLinecap="round" strokeDasharray="1 3.500" />
    </svg>
  );
}
