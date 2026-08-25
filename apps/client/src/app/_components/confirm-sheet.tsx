"use client";

/**
 * The shared bottom-sheet confirm (the mock's pconf): a scrim + a slide-up card with a
 * title, body, optional error, and a keep/confirm button pair. Reused wherever a booking
 * flow needs a destructive or informational confirm — cancelar reserva (Perfil, the
 * summary sheet, /clase/[id]), cerrar sesión, and the paga-en-tu-gym plan-change notice.
 * Callers own the positioning wrapper (a `fixed inset-0` overlay); this component only
 * renders the scrim + sheet, absolutely positioned within whatever the caller provides.
 */
export function ConfirmSheet({
  title,
  body,
  error,
  cancelLabel,
  confirmLabel,
  pendingLabel = "Un momento…",
  danger,
  dangerTone = "canvas",
  roundedTop,
  pending,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  error: string | null;
  cancelLabel: string;
  confirmLabel: string;
  pendingLabel?: string;
  danger?: boolean;
  /** The warning-fill confirm button's text token — most callers read fine with
   *  `canvas`; /clase/[id]'s cancel needs the near-black `ink` token instead. */
  dangerTone?: "canvas" | "ink";
  roundedTop?: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onCancel}
        disabled={pending}
        className="absolute inset-0 z-[5] bg-black/60"
      />
      <div
        className={`absolute inset-x-0 bottom-0 z-[6] border-t border-line bg-canvas px-6 pb-8 pt-6${
          roundedTop ? " rounded-t-3xl" : ""
        }`}
      >
        <h4 className="text-[17px] font-bold text-fg">{title}</h4>
        <p className="mt-2 text-xs leading-relaxed text-muted">{body}</p>
        {error && <p className="mt-2.5 text-[11px] font-semibold text-danger">{error}</p>}
        <div className="mt-4 flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="flex-1 rounded-xl border border-line py-3.5 text-[11px] font-bold uppercase tracking-wider text-muted disabled:opacity-70"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={`flex-1 rounded-xl py-3.5 text-[11px] font-bold uppercase tracking-wider disabled:opacity-70 ${
              danger
                ? dangerTone === "ink"
                  ? "bg-warning text-ink"
                  : "bg-warning text-canvas"
                : "bg-accent text-accent-fg"
            }`}
          >
            {pending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
