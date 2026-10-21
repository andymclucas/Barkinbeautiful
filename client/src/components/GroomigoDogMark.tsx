/**
 * The Groomigo dog, as an inline SVG.
 *
 * Inline rather than an <img src="/groomigo_logo.svg"> because it has to
 * take the colour of whatever stage it is standing on — the file has
 * `stroke="#00BEBC"` baked in, and an <img> cannot be recoloured. The
 * paths are copied from client/public/groomigo_logo.svg unchanged; only
 * the stroke is swapped for currentColor.
 *
 * Decorative wherever it is used, so no <title> and aria-hidden at the
 * call site: the progress bar beside it already announces the step.
 */
export function GroomigoDogMark({
  className = "",
  style,
  "data-testid": testId,
}: {
  className?: string;
  style?: React.CSSProperties;
  "data-testid"?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      style={style}
      data-testid={testId}
      aria-hidden="true"
      focusable="false"
    >
      <g stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M32 11 C 40 3, 52 1, 61 5 C 67 8, 70 14, 74 18 C 78 21, 85 20, 90 22 C 95 24, 96 28, 94 32 C 91 37, 86 41, 80 43 C 73 45, 66 46, 62 51 C 61 61, 62 75, 62 89" />
        <path d="M32 11 C 23 16, 15 27, 11 39 C  8 47, 10 53, 16 53 C 22 53, 27 47, 30 40 C 32 34, 33 25, 33 18" />
        <path d="M48 19 C 49 29, 50 39, 49 48 C 44 56, 34 61, 26 67 C 19 72, 15 80, 16 89" />
        <path d="M55 20 C 57 17, 61 17, 63 20" />
        <path d="M16 85 C 12 82,  6 80,  3 84 C  1 88,  5 90, 11 90" />
        <path d="M35 78 C 42 78, 46 82, 47 89" />
        <path d="M11 91 L 64 91" />
      </g>
    </svg>
  );
}
