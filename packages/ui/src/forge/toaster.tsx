"use client";

import { toast } from "sonner";
import { Icon } from "./icon";

// The toast queue HOST moved to the brand-neutral `@gym/ui/toaster` (grill lock
// (j)); the token-driven card + the `forgeToast` fire helper stay here under the
// product namespace.

type Tone = "success" | "warning" | "info";

function ForgeToastCard({ tone, title, body }: { tone: Tone; title: string; body?: string }) {
  const border =
    tone === "success" ? "var(--green)" : tone === "warning" ? "var(--yellow)" : "var(--line)";
  return (
    <div
      className="flex w-full items-center border bg-surface"
      style={{
        gap: 12,
        padding: "14px 16px",
        borderColor: border,
        boxShadow: "0 20px 40px rgba(0,0,0,0.35)",
      }}
    >
      {tone === "success" && (
        <div
          className="flex shrink-0 items-center justify-center"
          style={{ width: 22, height: 22, background: "var(--green)" }}
        >
          <Icon name="check" size={14} color="var(--canvas)" />
        </div>
      )}
      {tone === "warning" && <Icon name="alert" size={18} color="var(--gold)" />}
      <div className="flex-1">
        <div
          className="uppercase font-extrabold"
          style={{ fontSize: 12.5, color: "var(--fg)", letterSpacing: 0.6 }}
        >
          {title}
        </div>
        {body && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{body}</div>}
      </div>
    </div>
  );
}

/** Fire a Forge-styled toast. */
export function forgeToast(opts: { tone?: Tone; title: string; body?: string; duration?: number }) {
  const { tone = "info", title, body, duration = 2400 } = opts;
  toast.custom(() => <ForgeToastCard tone={tone} title={title} body={body} />, { duration });
}
