import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { brands } from "@gym/brand";

import { StaticLogin } from "./static-login";

// The login page picks `brand.loginAnimation ?? <StaticLogin>` (page.tsx). These
// exercise the optional-animation contract at the seam: a module WITH a hero
// renders its bespoke animation around the slotted form; a module WITHOUT one
// (the neutral base module, later) renders a clean, motion-free static login.

const FORM_SENTINEL = "data-login-form-slot";
const form = createElement("p", { [FORM_SENTINEL]: true }, "form");
const StubLogo: ComponentType<{ size?: number }> = () =>
  createElement("svg", { "data-stub-logo": true });

describe("login optional-animation contract", () => {
  it("static fallback renders the module logo + the form, with no animation", () => {
    const html = renderToStaticMarkup(
      createElement(StaticLogin, { logo: StubLogo }, form),
    );

    expect(html).toContain("data-stub-logo");
    expect(html).toContain(FORM_SENTINEL);
    // The whole point of the fallback: it is clean/static — no bespoke keyframes.
    expect(html).not.toContain("@keyframes");
  });

  it("the Forge hero animates the wordmark from copy and slots the form in", () => {
    const Hero = brands.forge.loginAnimation!;
    const html = renderToStaticMarkup(
      createElement(Hero, { name: brands.forge.copy.name }, form),
    );

    expect(html).toContain("@keyframes forge-login-"); // self-contained local keyframes
    expect(html).toContain(brands.forge.copy.name); // wordmark from module copy, not a literal
    expect(html).toContain(FORM_SENTINEL); // the form is slotted into the hero
  });

  it("EVERY registered hero renders the slotted form — a hero that drops it ships a login with no sign-in", () => {
    // A props-ignoring component is structurally assignable to the contract, so
    // the type system cannot catch a hero that swallows `children` (the RED
    // ignition is formless; its registry adapter is what carries the form).
    for (const brand of Object.values(brands)) {
      if (!brand.loginAnimation) continue;
      const html = renderToStaticMarkup(
        createElement(brand.loginAnimation, { name: brand.copy.name }, form),
      );
      expect(html, `${brand.id} hero must render its children`).toContain(FORM_SENTINEL);
    }
  });
});
