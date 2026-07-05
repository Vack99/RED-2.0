import "server-only";

import { z } from "zod";

/**
 * A trimmed, optional text field that normalizes blank input to `null` — the
 * shared shape every nullable catalog text column (coach `especialidad`/`bio`,
 * class_type `sala`/`nivel`/`descripcion`) validates against. A leading
 * underscore keeps this out of the sector vocabulary (matches `_auth.ts`):
 * it's shared Zod plumbing, not a domain noun.
 */
export const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v?.trim() || null);
