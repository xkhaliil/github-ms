/**
 * A small hand-rolled icon set instead of a dependency: nine icons at one weight
 * and one grid, which is cheaper and more consistent than pulling in a library
 * and using 1% of it.
 */

type IconProps = { className?: string };

const base = "shrink-0";

function Svg({ children, className = "size-4" }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${base} ${className}`}
    >
      {children}
    </svg>
  );
}

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8.5 6.2 11.5 13 4.5" />
  </Svg>
);

export const XIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Svg>
);

export const DashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8h8" />
  </Svg>
);

export const CircleIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="3.4" />
  </Svg>
);

export const DotIcon = ({ className = "size-4" }: IconProps) => (
  <svg viewBox="0 0 16 16" aria-hidden="true" className={`${base} ${className}`}>
    <circle cx="8" cy="8" r="3.2" fill="currentColor" />
  </svg>
);

export const ArrowLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 3.5 5 8l4.5 4.5" />
  </Svg>
);

export const ExternalIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 3.5H3.5v9h9V9.5" />
    <path d="M9.5 3.5h3v3M12.5 3.5 7.5 8.5" />
  </Svg>
);

export const RefreshIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 8a5 5 0 1 1-1.6-3.7" />
    <path d="M13 2.5V5h-2.5" />
  </Svg>
);

export const SparkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 2.5 9.3 6.2 13 7.5 9.3 8.8 8 12.5 6.7 8.8 3 7.5 6.7 6.2z" />
  </Svg>
);

export const UploadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 11V3.5M5 6l3-3 3 3" />
    <path d="M3 10.5v2h10v-2" />
  </Svg>
);

export const KeyIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="5.5" cy="8" r="2.5" />
    <path d="M8 8h5M11 8v2M13 8v1.5" />
  </Svg>
);

export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 5v3.5M8 10.6v.1" />
  </Svg>
);
