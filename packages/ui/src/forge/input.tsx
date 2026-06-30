"use client";

import * as React from "react";
import { cn } from "../utils";
import { Icon, type IconName } from "./icon";
import { SheetFocusContext } from "./sheet-focus-context";

/**
 * Text input primitive. Lives in its own `"use client"` file (the rest of the
 * forge UI primitives in `ui.tsx` stay server-renderable) because it is the one
 * primitive that is genuinely interactive: it owns focus and change handling.
 *
 * ── `autoFocus` ──
 * One mechanism, one owner per context. The Input focuses itself on mount with
 * `{ preventScroll: true }` so the page never jumps to chase the field — except
 * when it sits inside a Sheet. A Sheet renders its panel off-screen and slides
 * it up, so it owns focus *timing* (it focuses `[data-autofocus]` after the
 * slide); inside one, the Input defers via `SheetFocusContext` and only emits
 * the `data-autofocus` marker the Sheet queries. Result: non-sheet inputs focus
 * on mount, sheet inputs focus after the slide, and the field is never focused
 * twice. `preventScroll` also keeps reduced-motion users (instant slide) from
 * jumping.
 */
export function Input({
  icon,
  placeholder,
  value,
  onChange,
  suffix,
  type = "text",
  autoFocus,
  inputMode,
  className,
  style,
}: {
  icon?: IconName;
  placeholder?: string;
  value?: string;
  onChange?: (v: string) => void;
  suffix?: string;
  type?: string;
  autoFocus?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = React.useRef<HTMLInputElement | null>(null);
  const sheetOwnsFocus = React.useContext(SheetFocusContext);

  // Self-focus on mount only when no Sheet ancestor is managing focus timing.
  // `preventScroll` stops the browser scrolling the field into view, so this
  // never jumps the page (the bug native `autofocus` caused inside sheets).
  React.useEffect(() => {
    if (autoFocus && !sheetOwnsFocus) ref.current?.focus({ preventScroll: true });
  }, [autoFocus, sheetOwnsFocus]);

  return (
    <div
      className={cn(
        "flex min-w-0 items-center border border-line bg-surface transition-colors focus-within:border-yellow",
        className,
      )}
      style={{ gap: 10, padding: "14px 16px", ...style }}
    >
      {icon && <Icon name={icon} size={18} color="var(--muted)" />}
      <input
        ref={ref}
        type={type}
        inputMode={inputMode}
        // `data-autofocus` is the marker a Sheet queries to focus this field
        // after its slide-in (see `sheet.tsx`). We never set native `autofocus`:
        // it focuses during commit and scrolls an off-screen field into view,
        // jumping the page when the input lives in a sheet mounted below the
        // viewport. Non-sheet inputs are focused by the effect above instead.
        data-autofocus={autoFocus ? "" : undefined}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
        className="min-w-0 flex-1 border-none bg-transparent font-medium outline-none"
        // 16px: anything smaller triggers iOS Safari's auto-zoom on focus.
        style={{ color: "var(--fg)", fontSize: 16 }}
      />
      {suffix && (
        <span style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 1 }}>{suffix}</span>
      )}
    </div>
  );
}

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  {
    placeholder?: string;
    value?: string;
    onChange?: (v: string) => void;
    rows?: number;
    className?: string;
    style?: React.CSSProperties;
  }
>(function Textarea({ placeholder, value, onChange, rows = 5, className, style }, ref) {
  return (
    <textarea
      ref={ref}
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(e) => onChange?.(e.target.value)}
      rows={rows}
      className={cn(
        // Mirrors Input: same surface/line/yellow-focus token trio, same font weight.
        // `resize-none` intentional — rows prop is the declared height contract.
        "w-full resize-none border border-line bg-surface font-medium outline-none transition-colors focus:border-yellow",
        className,
      )}
      style={{
        color: "var(--fg)",
        padding: "12px 14px",
        // 16px: anything smaller triggers iOS Safari's auto-zoom on focus.
        fontSize: 16,
        lineHeight: 1.6,
        fontFamily: "inherit",
        ...style,
      }}
    />
  );
});
