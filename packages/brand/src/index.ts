// @gym/brand — the shared brand home consumed by both apps (ADR-0012 §4). The `.`
// surface carries the brand-module registry + the host→brand resolution data; the
// concrete Forge logo has its own `./forge/logo` subpath (admin imports it directly).
export type { BrandId } from "./brand-id";
export { DEFAULT_BRAND } from "./brand-id";
export { HOST_TO_BRAND } from "./host-map";
export type { BrandModule } from "./registry";
export { brands } from "./registry";
