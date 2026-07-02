import { resolveBrand } from "../lib/brand";

// Dynamic per-brand favicon (grill lock (g)). Next 16 app-icon routes are cached
// Route Handlers UNLESS they use a request-time API — reading the proxy-stamped
// `x-brand` (via resolveBrand → headers()) makes this render per request, so a
// RED tab shows RED's mark and a Forge tab Forge's (bundled app-icons doc,
// re-verified in-slice). The module's `appIcon` is standalone SVG (favicons paint
// with no page CSS), returned directly as the Route Handler's Response.
export const contentType = "image/svg+xml";

export default async function Icon() {
  const { appIcon } = await resolveBrand();
  return new Response(appIcon, {
    headers: {
      "Content-Type": "image/svg+xml",
      // The brand varies by host/request, so never let a shared cache pin one
      // marca's mark onto another's tab.
      "Cache-Control": "no-store",
    },
  });
}
