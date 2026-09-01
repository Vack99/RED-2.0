import type { Modo } from "@gym/domain/types";
import type { TabItem } from "@gym/ui/forge/tab-bar";

// ASIST stays primary and in the same slot in both doors — the one tab the app is never
// without. Cupo keeps AGENDA where it always was; Lista swaps in VENDER (spec #326 "Navigation"):
// a Lista owner has no schedule to look at, but charging has to stay as reachable as marking.
const IZQUIERDA: readonly TabItem[] = [
  { href: "/inicio", label: "INICIO", icon: "home" },
  { href: "/clientes", label: "CLIENTES", icon: "users" },
  { href: "/asistencia", label: "ASIST", icon: "check", primary: true },
];

const CUENTA: TabItem = { href: "/cuenta", label: "CUENTA", icon: "user" };

/**
 * The admin tab bar as a PURE function of `modo` (spec #326, ticket #327 AC2) — the one
 * navigation difference between the two doors. Cupo: INICIO · CLIENTES · ASIST · AGENDA ·
 * CUENTA. Lista: INICIO · CLIENTES · ASIST · VENDER · CUENTA.
 */
export function tabsPara(modo: Modo): readonly TabItem[] {
  const cuartaTab: TabItem =
    modo === "lista"
      ? { href: "/vender", label: "VENDER", icon: "cash" }
      : { href: "/agenda", label: "AGENDA", icon: "cal" };
  return [...IZQUIERDA, cuartaTab, CUENTA];
}
