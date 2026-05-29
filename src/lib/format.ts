/** es-MX peso formatting and small text helpers. */

export function pesos(n: number | null | undefined): string {
  return "$" + (n ?? 0).toLocaleString("es-MX");
}

export function firstName(nombre: string): string {
  return (nombre || "").trim().split(/\s+/)[0] || "";
}

/** Classes-remaining label that handles the ∞ (ilimitado) sentinel. */
export function clasesLabel(clasesRest: number | "∞"): string {
  if (clasesRest === "∞") return "clases ilimitadas";
  return `${clasesRest} clase${clasesRest === 1 ? "" : "s"}`;
}

export function diasLabel(diasRest: number): string {
  return `${diasRest} día${diasRest === 1 ? "" : "s"}`;
}

/** Build a wa.me deep link (defaults to the Mexico country code, 52). */
export function waLink(tel: string, text: string): string {
  const digits = (tel || "").replace(/\D/g, "");
  const phone = digits.startsWith("52") ? digits : "52" + digits;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
