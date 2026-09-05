/**
 * The gitms mark and lockup. Kept as components rather than an <img> so the mark
 * stays crisp at every size and the wordmark uses the same type stack as the
 * rest of the interface.
 *
 * The mark is a commit node that produced documentation: the dot is the commit,
 * the bars are the description and README it wrote.
 */

export function Mark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--color-accent)" />
      <circle cx="9.75" cy="9.25" r="2.75" fill="var(--color-bg)" />
      <rect x="15.5" y="7.5" width="9.5" height="3.5" rx="1.75" fill="var(--color-bg)" />
      <rect x="7" y="15.5" width="18" height="3.5" rx="1.75" fill="var(--color-bg)" />
      <rect
        x="7"
        y="21.5"
        width="11"
        height="3.5"
        rx="1.75"
        fill="var(--color-bg)"
        opacity="0.8"
      />
    </svg>
  );
}

/** Splitting the colour at the syllable is what makes "gitms" parse on first read. */
export function Wordmark({ className = "text-[14px]" }: { className?: string }) {
  return (
    <span className={`font-semibold tracking-[-0.03em] ${className}`}>
      <span className="text-text">git</span>
      <span className="text-accent">ms</span>
    </span>
  );
}

export function Lockup({ markClass = "size-5" }: { markClass?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Mark className={markClass} />
      <Wordmark />
    </span>
  );
}
