/**
 * The Contacto map block — a stylized, token-painted locator (no external map tile: brand-neutral, no
 * third-party request) showing the pin + the DERIVED coordinate label, with a real "Abrir en mapas" link
 * to the platform maps search. Pure presentation; coords/address come from gym data. When the gym has no
 * pin, the coords label + maps link fall back to an address search (or hide if neither exists).
 */

/** Format one signed decimal degree as "DD.DDDD° X" (X = hemisphere letter). */
function fmtCoord(value: number, positive: string, negative: string): string {
  return `${Math.abs(value).toFixed(4)}° ${value >= 0 ? positive : negative}`;
}

/** The platform maps deep link: by pin when we have one, else a text search of the address. */
function mapsHref(
  latitude: number | null,
  longitude: number | null,
  addressLine: string | null,
): string | null {
  if (latitude != null && longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  }
  if (addressLine) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLine)}`;
  }
  return null;
}

export function MapBlock({
  latitude,
  longitude,
  addressLine,
  label,
}: {
  latitude: number | null;
  longitude: number | null;
  addressLine: string | null;
  label: string;
}) {
  const hasPin = latitude != null && longitude != null;
  const href = mapsHref(latitude, longitude, addressLine);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative flex h-44 items-center justify-center overflow-hidden rounded-3xl border border-line bg-sunk">
        {/* Decorative "roads" — pure tokens, aria-hidden */}
        <div aria-hidden className="absolute inset-0 opacity-60">
          <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-line" />
          <div className="absolute bottom-0 top-0 left-1/3 w-px bg-line" />
        </div>
        <div className="relative flex flex-col items-center gap-2">
          <span className="flex h-9 items-center rounded-full bg-accent px-3 font-mono text-[10px] font-bold tracking-wide text-accent-fg">
            {label}
          </span>
          <span className="h-2 w-2 rounded-full bg-accent ring-4 ring-accent-soft" />
        </div>
        {hasPin && (
          <span className="absolute bottom-3 right-4 rounded-full bg-surface/80 px-2 py-1 font-mono text-[10px] tabular-nums tracking-wide text-muted">
            {fmtCoord(latitude!, "N", "S")} · {fmtCoord(longitude!, "E", "W")}
          </span>
        )}
      </div>

      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 border bg-transparent py-4 text-[12px] font-bold uppercase tracking-[1.4px] text-fg transition hover:bg-surface"
          style={{ borderColor: "var(--line-soft)" }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="text-accent">
            <path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
          Abrir en mapas
        </a>
      )}
    </div>
  );
}
