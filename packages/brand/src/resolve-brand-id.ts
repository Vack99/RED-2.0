import { DEFAULT_BRAND, type BrandId } from "./brand-id";
import { HOST_TO_BRAND } from "./host-map";
import { brands } from "./registry";

/**
 * The one pure host→brand seam both apps run (ADR-0012 §1) — a plain function over
 * values, sibling to decideRedirect. Precedence, host-wins:
 *
 *   1. a known host-map hit (HOST_TO_BRAND, port-stripped, incl. `*.localhost`);
 *   2. a `?gym=` override (query param or `gym` cookie) — only if it names a known brand;
 *   3. DEFAULT_BRAND ('forge').
 *
 * Host wins, so on a mapped customer domain the override is structurally inert. Reads
 * `host` semantics only (never x-forwarded-host); no environment coupling — the
 * environment changes the inputs, never the ordering.
 */
export function resolveBrandId(host: string | null, override: string | null): BrandId {
  const hostname = host?.split(":")[0].toLowerCase() ?? "";
  const brandFromHost = HOST_TO_BRAND[hostname];
  if (brandFromHost) return brandFromHost;

  if (override !== null && Object.hasOwn(brands, override)) return override as BrandId;

  return DEFAULT_BRAND;
}
