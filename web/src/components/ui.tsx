import type { ReactNode } from "react";
import { AlertIcon, CheckIcon } from "./icons.js";
import type { Confidence, IssueSeverity } from "@shared/types.js";

/*
 * Shared primitives. Every visual decision lives here so the pages stay about
 * behaviour, and so spacing, radius and colour stay consistent by construction
 * rather than by discipline.
 */

/* --------------------------------------------------------------- button --- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  children,
  onClick,
  variant = "secondary",
  size = "md",
  disabled,
  title,
  type = "button",
  icon,
  full,
}: {
  children?: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
  icon?: ReactNode;
  full?: boolean;
}) {
  const variants: Record<ButtonVariant, string> = {
    // The accent is load-bearing: exactly one primary action per screen.
    primary: "bg-accent text-[#0a0d1a] hover:bg-accent/90 border-transparent font-medium",
    secondary: "bg-raised text-text border-line hover:border-line-strong hover:bg-hover",
    ghost: "bg-transparent text-muted border-transparent hover:text-text hover:bg-raised",
    danger: "bg-transparent text-bad border-bad/30 hover:bg-bad/10 hover:border-bad/50",
  };
  const sizes = {
    sm: "h-7 px-2.5 text-[12.5px] gap-1.5",
    md: "h-8 px-3 text-[13px] gap-2",
  };

  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-control border transition-[background-color,border-color,color] duration-150 disabled:pointer-events-none disabled:opacity-40 ${variants[variant]} ${sizes[size]} ${full ? "w-full" : ""}`}
    >
      {icon}
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- panel --- */

export function Panel({
  children,
  title,
  description,
  actions,
  className = "",
  bodyClassName = "p-4",
}: {
  children: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-panel border border-line bg-surface ${className}`}
    >
      {(title || actions) && (
        <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-semibold text-text">{title}</h2>
            {description && (
              <p className="mt-0.5 truncate text-[12px] text-subtle">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** A titled block with no border - for grouping inside a panel. */
export function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[12px] font-medium text-subtle">{label}</h3>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- meter --- */

/**
 * Health as a hairline meter plus a number. A bar communicates "how far from
 * good" at a glance in a way a coloured pill never does.
 */
export function HealthMeter({ score, width = "w-14" }: { score: number; width?: string }) {
  const tone = score >= 80 ? "bg-good" : score >= 50 ? "bg-warn" : "bg-bad";
  const text = score >= 80 ? "text-good" : score >= 50 ? "text-warn" : "text-bad";
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`tabular w-5 text-right text-[12px] ${text}`}>{score}</span>
      <span className={`h-1 ${width} overflow-hidden rounded-full bg-line`}>
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${score}%` }} />
      </span>
    </span>
  );
}

/* ---------------------------------------------------------------- badge --- */

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "accent";
}) {
  const tones = {
    neutral: "border-line bg-raised text-muted",
    good: "border-good/25 bg-good/10 text-good",
    warn: "border-warn/25 bg-warn/10 text-warn",
    bad: "border-bad/25 bg-bad/10 text-bad",
    accent: "border-accent/25 bg-accent/10 text-accent",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] leading-none ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function ConfidenceBadge({ value }: { value: Confidence }) {
  const tone = value === "high" ? "good" : value === "medium" ? "warn" : "bad";
  return <Badge tone={tone as "good" | "warn" | "bad"}>{value} confidence</Badge>;
}

export function SeverityDot({ severity }: { severity: IssueSeverity }) {
  const map: Record<IssueSeverity, string> = {
    high: "bg-bad",
    medium: "bg-warn",
    low: "bg-subtle",
  };
  return <span className={`inline-block size-1.5 shrink-0 rounded-full ${map[severity]}`} />;
}

export function Tag({ children, onRemove }: { children: ReactNode; onRemove?: () => void }) {
  return (
    <span className="group inline-flex items-center gap-1 rounded-md border border-line bg-raised py-1 pr-1 pl-2 font-mono text-[12px] text-muted">
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove topic"
          className="rounded p-0.5 text-subtle transition-colors hover:bg-bad/15 hover:text-bad"
        >
          <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
          </svg>
        </button>
      )}
    </span>
  );
}

/* ---------------------------------------------------------------- forms --- */

const inputBase =
  "w-full rounded-control border border-line bg-bg px-3 py-2 text-[13px] text-text placeholder:text-subtle transition-colors outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/15";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input {...rest} className={`${inputBase} ${className}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return <textarea {...rest} className={`${inputBase} resize-y leading-relaxed ${className}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", children, ...rest } = props;
  return (
    <select {...rest} className={`${inputBase} cursor-pointer ${className}`}>
      {children}
    </select>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[12px] leading-relaxed text-subtle">{hint}</span>}
    </label>
  );
}

/** A real switch. A bare checkbox reads as a form; this reads as a setting. */
export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <div className="min-w-0">
        <p className="text-[13px] text-text">{label}</p>
        {description && (
          <p className="mt-0.5 text-[12px] leading-relaxed text-subtle">{description}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-[20px] w-[34px] shrink-0 rounded-full border transition-colors duration-200 ${
          checked ? "border-accent/50 bg-accent/80" : "border-line-strong bg-raised"
        }`}
      >
        <span
          className={`absolute top-[2px] size-[14px] rounded-full bg-text transition-[left] duration-200 ${
            checked ? "left-[16px]" : "left-[2px]"
          }`}
        />
      </button>
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  indeterminate,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  indeterminate?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`flex size-[15px] shrink-0 items-center justify-center rounded-[4px] border transition-colors ${
        checked || indeterminate
          ? "border-accent bg-accent text-[#0a0d1a]"
          : "border-line-strong bg-transparent hover:border-subtle"
      }`}
    >
      {indeterminate ? (
        <span className="h-[1.5px] w-[7px] rounded-full bg-current" />
      ) : checked ? (
        <CheckIcon className="size-3" />
      ) : null}
    </button>
  );
}

/* --------------------------------------------------------------- status --- */

export function Banner({
  tone,
  children,
  icon = true,
}: {
  tone: "info" | "warn" | "error" | "success";
  children: ReactNode;
  icon?: boolean;
}) {
  const map = {
    info: "border-accent/25 bg-accent/[0.07] text-text",
    warn: "border-warn/25 bg-warn/[0.07] text-text",
    error: "border-bad/25 bg-bad/[0.07] text-text",
    success: "border-good/25 bg-good/[0.07] text-text",
  } as const;
  const iconTone = {
    info: "text-accent",
    warn: "text-warn",
    error: "text-bad",
    success: "text-good",
  } as const;

  return (
    <div className={`flex gap-2.5 rounded-[8px] border px-3 py-2.5 text-[13px] ${map[tone]}`}>
      {icon && <AlertIcon className={`mt-0.5 size-4 ${iconTone[tone]}`} />}
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-muted">
      <span className="size-3.5 animate-spin rounded-full border-[1.5px] border-line-strong border-t-accent" />
      {label}
    </span>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-panel border border-dashed border-line px-6 py-14 text-center">
      <p className="text-[14px] font-medium text-text">{title}</p>
      {children && (
        <div className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-muted">
          {children}
        </div>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/** Stats sit on hairline dividers rather than in boxes - less furniture, same data. */
export function StatRow({
  items,
}: {
  items: { label: string; value: string; tone?: "good" | "warn" | "bad" }[];
}) {
  const tones = { good: "text-good", warn: "text-warn", bad: "text-bad" } as const;
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-5">
      {items.map((item) => (
        <div key={item.label} className="bg-surface px-4 py-3.5">
          <div
            className={`tabular text-[22px] leading-none font-medium ${
              item.tone ? tones[item.tone] : "text-text"
            }`}
          >
            {item.value}
          </div>
          <div className="mt-1.5 text-[12px] text-subtle">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- utils --- */

export const money = (usd: number) => (usd > 0 && usd < 0.01 ? "<$0.01" : `$${usd.toFixed(2)}`);

export function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${(days / 365).toFixed(1)}y ago`;
}
