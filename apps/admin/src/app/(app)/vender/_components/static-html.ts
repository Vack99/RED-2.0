import type { ReactElement, ReactNode } from "react";

/**
 * Serialize a STATIC React element tree (plain `div`/`span`, inline styles, no components, no
 * hooks) to an HTML string — the email-body half of the ticket twin (#99).
 *
 * Why not `renderToStaticMarkup`: server actions compile under the `react-server` condition, where
 * every `react-dom/server` entry point is a stub that throws ("not supported in React Server
 * Components") — and `react-markup`, React's RSC-safe renderer, is experimental and not vendored.
 * The twin must still be ONE component rendered two ways (spec #96: no forked ticket), so the same
 * element tree Satori walks for the PNG is walked here for the HTML. Total for the twin's domain,
 * deliberately not general: an unknown node shape throws instead of guessing.
 */
export function renderStaticHtml(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return escapeHtml(String(node));
  if (Array.isArray(node)) return node.map(renderStaticHtml).join("");
  if (isElement(node)) {
    const { type, props } = node;
    // A hook-free function component (the twin itself) is invoked exactly as Satori invokes it.
    if (typeof type === "function") {
      return renderStaticHtml((type as (p: unknown) => ReactNode)(props));
    }
    if (typeof type !== "string") {
      throw new Error(`renderStaticHtml: solo etiquetas HTML planas (got ${String(type)})`);
    }
    const { style, children, ...rest } = props as {
      style?: Record<string, string | number | undefined>;
      children?: ReactNode;
      [key: string]: unknown;
    };
    const attrs: string[] = [];
    if (style) attrs.push(` style="${escapeAttr(styleToCss(style))}"`);
    for (const [k, v] of Object.entries(rest)) {
      if (v === undefined || v === null || k === "key") continue;
      attrs.push(` ${k}="${escapeAttr(String(v))}"`);
    }
    return `<${type}${attrs.join("")}>${renderStaticHtml(children)}</${type}>`;
  }
  throw new Error("renderStaticHtml: nodo no soportado");
}

function isElement(node: ReactNode): node is ReactElement<Record<string, unknown>> {
  return typeof node === "object" && node !== null && "type" in node && "props" in node;
}

/** Mirrors React's own inline-style serialization for the twin's property domain:
 *  camelCase → kebab-case, and bare numbers get `px` except the unitless set. */
const UNITLESS = new Set(["fontWeight", "lineHeight", "opacity", "flexGrow", "flexShrink", "zIndex", "order"]);

function styleToCss(style: Record<string, string | number | undefined>): string {
  return Object.entries(style)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => {
      const prop = k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      const val = typeof v === "number" && !UNITLESS.has(k) ? `${v}px` : String(v);
      return `${prop}:${val}`;
    })
    .join(";");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
