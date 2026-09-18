/**
 * Neutral brand mark for PSflix: a thin-stroke gamepad in the Obsidian Console
 * blue→teal brand gradient. Used in the app header, the admin header, and
 * (as a plain SVG) on the landing page. Intentionally does NOT use the
 * PlayStation logo — see the trademark note in openspec change
 * `add-site-landing-page` (design.md).
 */
export default function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="psflix-brand-gradient"
          x1="2"
          y1="4"
          x2="22"
          y2="20"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#0072FF" />
          <stop offset="1" stopColor="#00F2FF" />
        </linearGradient>
      </defs>
      <g stroke="url(#psflix-brand-gradient)">
        <path d="M7.4 6.8h9.2a4.6 4.6 0 0 1 4.5 3.7l.7 3.4a3 3 0 0 1-2.9 3.6c-.9 0-1.8-.4-2.3-1.2l-1-1.4H8.4l-1 1.4c-.5.8-1.4 1.2-2.3 1.2a3 3 0 0 1-2.9-3.6l.7-3.4a4.6 4.6 0 0 1 4.5-3.7Z" />
        <path d="M8.1 10.1v3.2M6.5 11.7h3.2" />
      </g>
      <circle cx="15.3" cy="10.6" r="1" fill="#00F2FF" />
      <circle cx="17.6" cy="12.8" r="1" fill="#0072FF" />
    </svg>
  );
}
