import { describe, expect, it } from "vitest";

import { forgeTokens } from "./forge/tokens";
import { redTokens } from "./red/tokens";
import { TOKEN_KEYS, tokensToCss, type BrandTokens } from "./tokens";

/**
 * The serializer is the ONE renderer of the `:root,.light {} .dark {}` block
 * (PRD grill lock (b)) — structured tokens in, the exact block out. Forge/red
 * equivalence is proven below against a frozen copy of the pre-refactor CSS
 * strings, compared after whitespace normalization (acceptance criterion:
 * "normalized comparison in tests").
 */

/** Collapse all whitespace runs to a single space and trim, for CSS-equivalence. */
function normalize(css: string): string {
  return css.replace(/\s+/g, " ").trim();
}

// Frozen copies of the pre-refactor `forgeTokenCss` / `redTokenCss` string
// constants (git history: forge/tokens.ts, red/tokens.ts before this slice).
// Equivalence-only fixtures — never imported by product code.

const forgeTokenCssBeforeRefactor = `:root,
.light {
  --canvas: #f4f2ed;
  --surface: #ffffff;
  --sunk: #e8e5de;
  --line: #e2ded4;
  --line-soft: #ece9e1;

  --yellow: #e3a81f;
  --gold: #8f6d09;
  --yellow-dim: #caa23c;
  --yellow-soft: rgba(227, 168, 31, 0.16);
  --yellow-edge: rgba(143, 109, 9, 0.4);
  --press-yellow: #f0bb45;

  --silver: #6f6e69;
  --silver-dim: #9b9a93;

  --fg: #16150f;
  --muted: #82807a;
  --muted-soft: #bdbab2;

  --green: #1f9d57;
  --red: #d6443c;
  --green-soft: rgba(31, 157, 87, 0.13);
  --red-soft: rgba(214, 68, 60, 0.12);

  --wa-bubble: #d9fdd3;
  --wa-bubble-fg: #111b21;
  --wa-bubble-meta: rgba(17, 27, 33, 0.5);

  --ink: #0a0a0a;
  --glass: rgba(255, 255, 255, 0.78);
  --scrim: rgba(24, 22, 16, 0.42);
  --tab-bg: #ffffff;

  --backdrop: #e7e3d9;
}

.dark {
  --canvas: #0a0a0a;
  --surface: #141414;
  --sunk: #070707;
  --line: #1f1f1f;
  --line-soft: #161616;

  --yellow: #f5c542;
  --gold: #f5c542;
  --yellow-dim: #7a6020;
  --yellow-soft: rgba(245, 197, 66, 0.14);
  --yellow-edge: rgba(245, 197, 66, 0.42);
  --press-yellow: #ffd54f;

  --silver: #c5c5c5;
  --silver-dim: #6e6e6e;

  --fg: #fafafa;
  --muted: #7a7a7a;
  --muted-soft: #3f3f3f;

  --green: #5cd47a;
  --red: #ff5a5a;
  --green-soft: rgba(92, 212, 122, 0.14);
  --red-soft: rgba(255, 90, 90, 0.14);

  --wa-bubble: #005c4b;
  --wa-bubble-fg: #e9edef;
  --wa-bubble-meta: rgba(233, 237, 239, 0.6);

  --ink: #0a0a0a;
  --glass: rgba(20, 20, 20, 0.72);
  --scrim: rgba(0, 0, 0, 0.64);
  --tab-bg: #0a0a0a;

  --backdrop: #050505;
}`;

const redTokenCssBeforeRefactor = `:root,
.light {
  --canvas: #faf6f6;
  --surface: #ffffff;
  --sunk: #f1e7e7;
  --line: #ecdede;
  --line-soft: #f4eaea;

  --yellow: #dc2626;
  --gold: #a11212;
  --yellow-dim: #c4433c;
  --yellow-soft: rgba(220, 38, 38, 0.14);
  --yellow-edge: rgba(161, 18, 18, 0.4);
  --press-yellow: #ef4444;

  --silver: #6f6a6a;
  --silver-dim: #9b9494;

  --fg: #1a1010;
  --muted: #857c7c;
  --muted-soft: #bdb4b4;

  --green: #1f9d57;
  --red: #d6443c;
  --green-soft: rgba(31, 157, 87, 0.13);
  --red-soft: rgba(214, 68, 60, 0.12);

  --wa-bubble: #d9fdd3;
  --wa-bubble-fg: #111b21;
  --wa-bubble-meta: rgba(17, 27, 33, 0.5);

  --ink: #0a0a0a;
  --glass: rgba(255, 255, 255, 0.78);
  --scrim: rgba(28, 16, 16, 0.42);
  --tab-bg: #ffffff;

  --backdrop: #efe0e0;
}

.dark {
  --canvas: #0c0808;
  --surface: #161010;
  --sunk: #080505;
  --line: #241c1c;
  --line-soft: #1a1414;

  --yellow: #f04444;
  --gold: #f04444;
  --yellow-dim: #7a2020;
  --yellow-soft: rgba(240, 68, 68, 0.14);
  --yellow-edge: rgba(240, 68, 68, 0.42);
  --press-yellow: #ff5a5a;

  --silver: #c5bcbc;
  --silver-dim: #6e6666;

  --fg: #faf5f5;
  --muted: #7a7070;
  --muted-soft: #3f3838;

  --green: #5cd47a;
  --red: #ff5a5a;
  --green-soft: rgba(92, 212, 122, 0.14);
  --red-soft: rgba(255, 90, 90, 0.14);

  --wa-bubble: #005c4b;
  --wa-bubble-fg: #e9edef;
  --wa-bubble-meta: rgba(233, 237, 239, 0.6);

  --ink: #0a0a0a;
  --glass: rgba(22, 16, 16, 0.72);
  --scrim: rgba(0, 0, 0, 0.64);
  --tab-bg: #0c0808;

  --backdrop: #050303;
}`;

describe("tokensToCss", () => {
  it("renders a minimal token set as :root,.light {} .dark {} blocks", () => {
    const tokens: BrandTokens = {
      light: { canvas: "#ffffff", fg: "#000000" },
      dark: { canvas: "#000000", fg: "#ffffff" },
    } as unknown as BrandTokens;

    const css = tokensToCss(tokens);

    expect(css).toContain(":root,");
    expect(css).toContain(".light {");
    expect(css).toContain(".dark {");
    expect(css).toContain("--canvas: #ffffff;");
    expect(css).toContain("--fg: #000000;");
    expect(css).toContain("--canvas: #000000;");
    expect(css).toContain("--fg: #ffffff;");
  });

  it("renders every contract key for both schemes when given a full token set", () => {
    const scheme = Object.fromEntries(TOKEN_KEYS.map((key) => [key, "#123456"])) as Record<
      (typeof TOKEN_KEYS)[number],
      string
    >;
    const tokens: BrandTokens = { light: scheme, dark: scheme };

    const css = tokensToCss(tokens);
    const [rootBlock, darkBlock] = css.split(".dark {");

    for (const key of TOKEN_KEYS) {
      expect(rootBlock).toContain(`--${key}: #123456;`);
      expect(darkBlock).toContain(`--${key}: #123456;`);
    }
  });

  it("forge: rendered CSS is equivalent to the pre-refactor block (normalized)", () => {
    expect(normalize(tokensToCss(forgeTokens))).toBe(normalize(forgeTokenCssBeforeRefactor));
  });

  it("red: rendered CSS is equivalent to the pre-refactor block (normalized)", () => {
    expect(normalize(tokensToCss(redTokens))).toBe(normalize(redTokenCssBeforeRefactor));
  });
});
