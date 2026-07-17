import { readFile } from "node:fs/promises";

import { ImageResponse } from "next/og";
import type { VentaResult } from "@gym/data/server/ventas";

import { FORGE_TICKET, TICKET_WIDTH, TicketTwin, type TicketPalette } from "./_components/ticket-twin";

/**
 * The receipt PNG twin (#100): the SAME hook-free `TicketTwin` the email body serializes, rasterized
 * to a PNG via `ImageResponse` (Satori + Resvg, vendored in `next/og` — no new npm dependency). The
 * result rides the receipt email as an attachment. Best-effort by contract: ANY failure (font read,
 * Satori render, buffer read) returns `null` — the caller sends the mail without the PNG. This never
 * throws into the send path (which itself never throws into the sale path).
 *
 * Fonts: the four Outfit weights the twin uses (400/600/700/800) are colocated under `_assets/fonts/`
 * and loaded via a STATIC `new URL("./_assets/fonts/<literal>.ttf", import.meta.url)` per weight (NOT
 * `process.cwd()`). Static is load-bearing: Turbopack/`@vercel/nft` only emit+trace an asset whose URL
 * is a string literal they can resolve at build time. A dynamic `new URL(\`…/${file}\`, import.meta.url)`
 * defeats that — Turbopack collapses the directory to one context asset (it emitted `OFL.txt` for every
 * weight → `@vercel/og` threw "Unsupported OpenType signature", #104), and unbundled node happens to
 * mask it. The literal form also resolves to the real files unbundled (the vitest smoke), where
 * `process.cwd()` would point at the monorepo root. The Next docs' `readFile(join(process.cwd(), …))`
 * sample assumes a single-app root; static `new URL` is the monorepo-safe, bundler-traceable equivalent.
 */

/** Canvas: the twin's true width × 520px tall. 520 clears the tallest realistic ticket —
 *  a two-line client name plus a wrapped concepto plus the ciudad footer land near ~455px — and the
 *  extra height is filled by the paper-colored root so the slack reads as receipt paper, not a band. */
const PNG_HEIGHT = 520;

export async function generarReciboPng(
  venta: VentaResult,
  palette: TicketPalette = FORGE_TICKET,
): Promise<string | null> {
  try {
    const [regular, semibold, bold, extrabold] = await Promise.all([
      readFile(new URL("./_assets/fonts/Outfit-Regular.ttf", import.meta.url)),
      readFile(new URL("./_assets/fonts/Outfit-SemiBold.ttf", import.meta.url)),
      readFile(new URL("./_assets/fonts/Outfit-Bold.ttf", import.meta.url)),
      readFile(new URL("./_assets/fonts/Outfit-ExtraBold.ttf", import.meta.url)),
    ]);

    const image = new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            background: palette.paper,
          }}
        >
          <TicketTwin venta={venta} palette={palette} fontFamily="Outfit" />
        </div>
      ),
      {
        width: TICKET_WIDTH,
        height: PNG_HEIGHT,
        fonts: [
          { name: "Outfit", data: regular, weight: 400, style: "normal" },
          { name: "Outfit", data: semibold, weight: 600, style: "normal" },
          { name: "Outfit", data: bold, weight: 700, style: "normal" },
          { name: "Outfit", data: extrabold, weight: 800, style: "normal" },
        ],
      },
    );

    const bytes = Buffer.from(await image.arrayBuffer());
    return bytes.toString("base64");
  } catch {
    return null;
  }
}
