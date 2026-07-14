import { readFile } from "node:fs/promises";

import { ImageResponse } from "next/og";
import type { VentaResult } from "@gym/data/server/ventas";

import { FORGE_TICKET, TICKET_WIDTH, TicketTwin } from "./_components/ticket-twin";

/**
 * The receipt PNG twin (#100): the SAME hook-free `TicketTwin` the email body serializes, rasterized
 * to a PNG via `ImageResponse` (Satori + Resvg, vendored in `next/og` — no new npm dependency). The
 * result rides the receipt email as an attachment. Best-effort by contract: ANY failure (font read,
 * Satori render, buffer read) returns `null` — the caller sends the mail without the PNG. This never
 * throws into the send path (which itself never throws into the sale path).
 *
 * Fonts: the four Outfit weights the twin uses (400/600/700/800) are colocated under `_assets/fonts/`
 * and loaded by their on-disk path via `new URL(..., import.meta.url)` (NOT `process.cwd()`): that URL
 * is what `@vercel/nft` traces to copy the `.ttf` files into the Vercel bundle, and it also resolves
 * to the real files when this module runs unbundled (the vitest smoke test), where `process.cwd()`
 * would point at the monorepo root instead. The Next docs' `readFile(join(process.cwd(), …))` sample
 * assumes a single-app root; the `new URL` form is the monorepo-safe equivalent.
 */

/** Canvas: the twin's true width × 520px tall. 520 clears the tallest realistic ticket —
 *  a two-line client name plus a wrapped concepto plus the ciudad footer land near ~455px — and the
 *  extra height is filled by the paper-colored root so the slack reads as receipt paper, not a band. */
const PNG_HEIGHT = 520;

const fontUrl = (file: string) => new URL(`./_assets/fonts/${file}`, import.meta.url);

export async function generarReciboPng(venta: VentaResult): Promise<string | null> {
  try {
    const [regular, semibold, bold, extrabold] = await Promise.all([
      readFile(fontUrl("Outfit-Regular.ttf")),
      readFile(fontUrl("Outfit-SemiBold.ttf")),
      readFile(fontUrl("Outfit-Bold.ttf")),
      readFile(fontUrl("Outfit-ExtraBold.ttf")),
    ]);

    const image = new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            background: FORGE_TICKET.paper,
          }}
        >
          <TicketTwin venta={venta} fontFamily="Outfit" />
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
