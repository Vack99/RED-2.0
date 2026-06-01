/** es-MX peso formatting and small text helpers. */

export function pesos(n: number | null | undefined): string {
  return "$" + (n ?? 0).toLocaleString("es-MX");
}

export function firstName(nombre: string): string {
  return (nombre || "").trim().split(/\s+/)[0] || "";
}

/** Up-to-two-letter avatar initials from a name (e.g. "Coach JC" -> "CJ"). */
export function iniciales(nombre: string): string {
  return (
    (nombre || "")
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

/** Build a wa.me deep link (defaults to the Mexico country code, 52). */
export function waLink(tel: string, text: string): string {
  const digits = (tel || "").replace(/\D/g, "");
  const phone = digits.startsWith("52") ? digits : "52" + digits;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
