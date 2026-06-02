import * as React from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./icon";

// ──────────────────────────────────────────────────────────────
// Forge UI primitives — ported from the prototype's ui.jsx.
// Pure/presentational (no hooks) so they render on the server and drop
// into client screens. Colors come from CSS-var tokens (never hardcode);
// exact typographic sizes use inline styles to match the design 1:1.
// ──────────────────────────────────────────────────────────────

export function Tnum({ className, ...rest }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("tnum", className)} {...rest} />;
}

export function Eyebrow({
  children,
  color,
  className,
  style,
}: {
  children: React.ReactNode;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn("uppercase font-semibold", className)}
      style={{ fontSize: 10.5, letterSpacing: 1.6, color: color ?? "var(--muted)", ...style }}
    >
      {children}
    </div>
  );
}

export function H1({
  children,
  size = 36,
  color,
  className,
  style,
}: {
  children: React.ReactNode;
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn("uppercase font-extrabold", className)}
      style={{
        fontSize: size,
        letterSpacing: -0.5,
        lineHeight: 0.95,
        color: color ?? "var(--fg)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Card({
  children,
  padded = true,
  raised = true,
  glow = false,
  className,
  style,
  onClick,
}: {
  children: React.ReactNode;
  padded?: boolean;
  raised?: boolean;
  glow?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn("relative overflow-hidden border border-line", raised && "bg-surface", className)}
      style={{ padding: padded ? "18px 20px" : 0, cursor: onClick ? "pointer" : undefined, ...style }}
    >
      {glow && (
        <div
          className="pointer-events-none absolute"
          style={{
            right: -40,
            top: -40,
            width: 160,
            height: 160,
            borderRadius: "50%",
            background:
              "radial-gradient(circle at center, color-mix(in srgb, var(--yellow) 18%, transparent) 0%, transparent 70%)",
          }}
        />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

type BadgeState =
  | "activo" | "por_vencer" | "sin_clases" | "critico" | "success" | "info";

const BADGE_MAP: Record<BadgeState, { bg: string; fg: string; label?: string }> = {
  activo: { bg: "var(--green-soft)", fg: "var(--green)", label: "VIGENTE" },
  por_vencer: { bg: "var(--yellow-soft)", fg: "var(--gold)", label: "POR VENCER" },
  sin_clases: { bg: "var(--red-soft)", fg: "var(--red)", label: "SIN CLASES" },
  critico: { bg: "var(--red-soft)", fg: "var(--red)", label: "CRÍTICO" },
  success: { bg: "var(--green-soft)", fg: "var(--green)" },
  info: { bg: "color-mix(in srgb, var(--silver) 8%, transparent)", fg: "var(--silver)" },
};

export function Badge({
  state = "info",
  children,
  style,
}: {
  state?: BadgeState;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const m = BADGE_MAP[state];
  return (
    <span
      className="inline-flex items-center uppercase font-bold"
      style={{
        gap: 5,
        padding: "4px 8px",
        background: m.bg,
        color: m.fg,
        fontSize: 9.5,
        letterSpacing: 1.2,
        ...style,
      }}
    >
      <span style={{ width: 4.5, height: 4.5, borderRadius: 999, background: m.fg }} />
      {children ?? m.label}
    </span>
  );
}

export function Avatar({
  initial,
  size = 40,
  accent = false,
  className,
  style,
}: {
  initial: string;
  size?: number;
  accent?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn("flex items-center justify-center font-extrabold", !accent && "border border-line", className)}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        background: accent ? "var(--yellow)" : "var(--surface)",
        color: accent ? "var(--ink)" : "var(--fg)",
        fontSize: size * 0.32,
        letterSpacing: 0.5,
        ...style,
      }}
    >
      {initial}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "onYellow" | "wa";
type ButtonSize = "sm" | "md" | "lg";

const BTN_SIZES: Record<ButtonSize, { pad: string; fs: number; gap: number }> = {
  sm: { pad: "10px 14px", fs: 12, gap: 6 },
  md: { pad: "14px 18px", fs: 14, gap: 8 },
  lg: { pad: "18px 22px", fs: 16, gap: 10 },
};

const BTN_VARIANTS: Record<ButtonVariant, React.CSSProperties> = {
  primary: { background: "var(--yellow)", color: "var(--ink)", border: "none" },
  secondary: { background: "transparent", color: "var(--fg)", border: "1px solid var(--silver-dim)" },
  ghost: { background: "transparent", color: "var(--fg)", border: "none" },
  danger: { background: "transparent", color: "var(--red)", border: "1px solid color-mix(in srgb, var(--red) 35%, transparent)" },
  onYellow: { background: "var(--ink)", color: "var(--yellow)", border: "none" },
  wa: { background: "#25d366", color: "#fff", border: "none" },
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  onClick,
  disabled,
  full,
  type = "button",
  className,
  style,
}: {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  onClick?: () => void;
  disabled?: boolean;
  full?: boolean;
  type?: "button" | "submit";
  className?: string;
  style?: React.CSSProperties;
}) {
  const sz = BTN_SIZES[size];
  const v = BTN_VARIANTS[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center uppercase font-extrabold transition-transform active:scale-[0.985]",
        className,
      )}
      style={{
        padding: sz.pad,
        ...v,
        fontSize: sz.fs,
        letterSpacing: 1.3,
        gap: sz.gap,
        width: full ? "100%" : undefined,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={sz.fs + 4} color={v.color as string} />}
      <span>{children}</span>
      {iconRight && <Icon name={iconRight} size={sz.fs + 4} color={v.color as string} />}
    </button>
  );
}

// `Input` is the one interactive primitive (it owns focus + change handling),
// so it lives in its own `"use client"` file while the rest of this module
// stays server-renderable. Re-exported here so callers keep importing it from
// `@/components/forge/ui` unchanged.
export { Input } from "./input";

export function SectionHeader({
  children,
  trailing,
  className,
  style,
}: {
  children: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn("flex items-baseline justify-between", className)}
      style={{ padding: "24px 22px 10px", gap: 8, ...style }}
    >
      <Eyebrow>{children}</Eyebrow>
      {typeof trailing === "string" ? (
        <span style={{ fontSize: 10.5, color: "var(--muted)", letterSpacing: 1.2, fontWeight: 700 }}>
          {trailing}
        </span>
      ) : (
        trailing
      )}
    </div>
  );
}

export function AppBar({
  onBack,
  center,
  trailing,
  accent = false,
}: {
  onBack?: () => void;
  center?: React.ReactNode;
  trailing?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between" style={{ padding: "12px 16px 4px", gap: 8 }}>
      {onBack ? (
        <button
          onClick={onBack}
          aria-label="Atrás"
          className="flex items-center justify-center border border-line bg-surface"
          style={{ width: 38, height: 38, padding: 0, cursor: "pointer", color: "var(--fg)" }}
        >
          <Icon name="back" size={18} color="var(--fg)" />
        </button>
      ) : (
        <div style={{ width: 38 }} />
      )}
      {center && (
        <Eyebrow color={accent ? "var(--gold)" : "var(--muted)"} style={{ textAlign: "center", flex: 1 }}>
          {center}
        </Eyebrow>
      )}
      <div className="flex justify-end" style={{ minWidth: 38 }}>
        {trailing ?? <div style={{ width: 38 }} />}
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  delta,
  sub,
  color,
  size = 56,
}: {
  label: string;
  value: React.ReactNode;
  delta?: string;
  sub?: string;
  color?: string;
  size?: number;
}) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <div className="flex items-baseline" style={{ gap: 8, marginTop: 4 }}>
        <Tnum
          className="font-extrabold"
          style={{ fontSize: size, lineHeight: 0.9, letterSpacing: -1.5, color: color ?? "var(--fg)" }}
        >
          {value}
        </Tnum>
        {delta && (
          <span style={{ fontSize: 11, color: "var(--green)", letterSpacing: 0.5, fontWeight: 700 }}>{delta}</span>
        )}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function Segmented<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { k: T; l: string; n?: number }[];
  value: T;
  onChange?: (k: T) => void;
}) {
  return (
    <div className="flex" style={{ gap: 6 }}>
      {items.map((t) => {
        const on = value === t.k;
        return (
          <button
            key={t.k}
            onClick={() => onChange?.(t.k)}
            className="flex flex-1 flex-col items-center"
            style={{
              padding: "10px 6px",
              gap: 3,
              background: on ? "var(--fg)" : "transparent",
              border: `1px solid ${on ? "var(--fg)" : "var(--line)"}`,
              color: on ? "var(--canvas)" : "var(--fg)",
              cursor: "pointer",
            }}
          >
            <span style={{ fontWeight: 800, fontSize: 11, letterSpacing: 1, lineHeight: 1 }}>{t.l}</span>
            {t.n !== undefined && (
              <Tnum style={{ fontSize: 11, color: on ? "var(--canvas)" : "var(--muted)" }}>{t.n}</Tnum>
            )}
          </button>
        );
      })}
    </div>
  );
}
