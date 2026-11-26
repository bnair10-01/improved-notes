/** The app mark: a paper tile with a margin line and an ink dot. Colours follow the theme. */
export function BrandMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={`shrink-0 ${className}`} aria-hidden>
      <defs><clipPath id="brand-clip"><rect width="28" height="28" rx="7" /></clipPath></defs>
      <g clipPath="url(#brand-clip)">
        <rect width="28" height="28" className="fill-foreground" />
        <rect x="8" width="1.5" height="28" className="fill-background" />
        <circle cx="18.5" cy="18.5" r="3.5" className="fill-background" />
      </g>
    </svg>
  );
}
