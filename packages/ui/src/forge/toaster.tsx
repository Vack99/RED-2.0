"use client";

import { Toaster, toast } from "sonner";
import { Icon } from "./icon";

type Tone = "success" | "warning" | "info";

/** Toast queue host — mounted once in the root layout. */
export function ForgeToaster() {
  return (
    <Toaster
      position="top-center"
      offset={16}
      mobileOffset={16}
      gap={8}
      toastOptions={{ unstyled: true, style: { width: "100%" } }}
      style={{ width: "min(410px, calc(100vw - 32px))" }}
    />
  );
}

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
