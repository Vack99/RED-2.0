import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// LoginForm calls useRouter() at render; there is no AppRouterContext in this
// SSR test, so stub it. createClient is only touched on submit, so it is inert.
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace() {}, refresh() {} }) }));

import { brands } from "@gym/brand";

import { LoginForm } from "./login-form";
import { StaticLogin } from "./static-login";

// Any animation-delay at or above this offset means the field rise is waiting on
// a hero that plays first. With no hero, that is a dead blank window.
const HERO_TUNED_DELAYS = [1740, 1890, 2040];

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

  // Review finding #1: the hero-tuned stagger (delays ≥ 1740ms) leaves a dead
  // blank window when no hero plays first. The form must enter at t=0 without a
  // hero, and only wait for the hero when one is actually present.
  it("without a hero, the form carries no hero-tuned delay (enters at t=0)", () => {
    const html = renderToStaticMarkup(createElement(LoginForm));

    for (const delay of HERO_TUNED_DELAYS) {
      expect(html, `no-hero form must not defer to ${delay}ms`).not.toContain(`${delay}ms`);
    }
    // It still enters with a gentle stagger, just immediately.
    expect(html).toContain("150ms");
    expect(html).toContain("forge-rise");
  });

  it("after a hero, the field rise keeps the gate-approved 1740/1890/2040 delays", () => {
    const html = renderToStaticMarkup(createElement(LoginForm, { afterHero: true }));

    for (const delay of HERO_TUNED_DELAYS) {
      expect(html, `hero form must defer to ${delay}ms`).toContain(`${delay}ms`);
    }
  });
});
