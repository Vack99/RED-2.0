import { AceptarAnexo } from "../../_components/aceptar-anexo";

/**
 * The Gate 0.1 click-wrap accept screen's own route (#254, demoted to non-blocking —
 * owner ruling 2026-08-10). The `(app)` layout no longer swaps `children` for this; instead
 * it links here from a slim banner shown to the owner while the gym's Anexo is unaccepted.
 * `AceptarAnexo` itself is unchanged — same text, checkbox, and `aceptarAnexoAction` write.
 */
export default function AnexoPage() {
  return <AceptarAnexo />;
}
