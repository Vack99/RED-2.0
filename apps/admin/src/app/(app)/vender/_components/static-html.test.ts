import { createElement, Fragment } from "react";
import { describe, expect, it } from "vitest";

import { renderStaticHtml } from "./static-html";

describe("renderStaticHtml — the twin's email-body renderer (#99)", () => {
  it("serializes tags, styles (camelCase → kebab, px on bare numbers, unitless kept), and children", () => {
    const el = createElement(
      "div",
      { style: { fontSize: 14, fontWeight: 700, letterSpacing: 1.5, opacity: 0.15, padding: "2px 6px" } },
      createElement("span", null, "hola"),
    );
    expect(renderStaticHtml(el)).toBe(
      '<div style="font-size:14px;font-weight:700;letter-spacing:1.5px;opacity:0.15;padding:2px 6px"><span>hola</span></div>',
    );
  });

  it("escapes text and attribute values", () => {
    const el = createElement("div", { title: 'a"b' }, "Fish & Chips <SA>");
    expect(renderStaticHtml(el)).toBe('<div title="a&quot;b">Fish &amp; Chips &lt;SA&gt;</div>');
  });

  it("flattens arrays and skips null/boolean children (conditional renders)", () => {
    const el = createElement("div", null, [createElement("span", { key: "a" }, "a"), false, null, "b"]);
    expect(renderStaticHtml(el)).toBe("<div><span>a</span>b</div>");
  });

  it("invokes a hook-free function component, exactly as Satori does", () => {
    const Chip = ({ label }: { label: string }) => createElement("span", null, label);
    expect(renderStaticHtml(createElement(Chip, { label: "NUEVO" }))).toBe("<span>NUEVO</span>");
  });

  it("throws on anything outside the twin's domain instead of guessing (Fragment)", () => {
    expect(() => renderStaticHtml(createElement(Fragment, null, "x"))).toThrow(/etiquetas HTML planas/);
  });
});
