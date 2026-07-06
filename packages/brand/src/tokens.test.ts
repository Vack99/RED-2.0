import { describe, expect, it } from "vitest";

import { forgeTokens } from "./forge/tokens";
import { redTokens } from "./red/tokens";
import { TOKEN_KEYS, tokensToCss, type BrandTokens } from "./tokens";

/**
 * The serializer is the ONE renderer of the `:root,.light {} .dark {}` block
 * (PRD grill lock (b)) — structured tokens in, the exact block out. Forge's
 * output is pinned against a frozen fixture; RED's dark-only neon output is
 * pinned against its expected block (identical `:root,.light` and `.dark`),
 * both compared after whitespace normalization (acceptance criterion:
 * "normalized comparison in tests").
 */

/** Collapse all whitespace runs to a single space and trim, for CSS-equivalence. */
function normalize(css: string): string {
  return css.replace(/\s+/g, " ").trim();
}

// Expected serializer output, pinned by hand. Forge is a frozen copy of its
// module's rendered block (with the amber warning channel); RED is its dark-only
// neon block (§3.1, identical light/dark). Fixtures only — never imported by
// product code.

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
  --warning: #d97706;
  --green-soft: rgba(31, 157, 87, 0.13);
  --red-soft: rgba(214, 68, 60, 0.12);
  --warning-soft: rgba(217, 119, 6, 0.13);

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
  --warning: #f59e0b;
  --green-soft: rgba(92, 212, 122, 0.14);
  --red-soft: rgba(255, 90, 90, 0.14);
  --warning-soft: rgba(245, 158, 11, 0.14);

  --wa-bubble: #005c4b;
  --wa-bubble-fg: #e9edef;
  --wa-bubble-meta: rgba(233, 237, 239, 0.6);

  --ink: #0a0a0a;
  --glass: rgba(20, 20, 20, 0.72);
  --scrim: rgba(0, 0, 0, 0.64);
  --tab-bg: #0a0a0a;

  --backdrop: #050505;
}`;

// RED is a dark-only neon identity (owner decision): ONE `redNeon` scheme fills
// BOTH `light` and `dark`, pixel-matched to the mock `:root` (remediation §3.1).
// So the serializer must emit the SAME block for `:root,.light` and `.dark`.
const redTokenCssExpected = `:root,
.light {
  --canvas: #0a0a0a;
  --surface: #121212;
  --sunk: #0e0e0e;
  --line: #1f1f1f;
  --line-soft: #262626;

  --yellow: #b5161c;
  --gold: #7e0d10;
  --yellow-dim: #9a2b28;
  --yellow-soft: rgba(239, 43, 26, 0.13);
  --yellow-edge: rgba(239, 43, 26, 0.4);
  --press-yellow: #d92b1f;

  --silver: #c5c5c5;
  --silver-dim: #8c8c8c;

  --fg: #fafafa;
  --muted: #7a7a7a;
  --muted-soft: #5e5e5e;

  --green: #5cd47a;
  --red: #ff5a5a;
  --warning: #e8902a;
  --green-soft: rgba(92, 212, 122, 0.14);
  --red-soft: rgba(255, 90, 90, 0.14);
  --warning-soft: rgba(232, 144, 42, 0.14);

  --wa-bubble: #005c4b;
  --wa-bubble-fg: #e9edef;
  --wa-bubble-meta: rgba(233, 237, 239, 0.6);

  --ink: #0a0a0a;
  --glass: rgba(18, 18, 18, 0.72);
  --scrim: rgba(0, 0, 0, 0.64);
  --tab-bg: #0a0a0a;

  --backdrop: #050505;
}

.dark {
  --canvas: #0a0a0a;
  --surface: #121212;
  --sunk: #0e0e0e;
  --line: #1f1f1f;
  --line-soft: #262626;

  --yellow: #b5161c;
  --gold: #7e0d10;
  --yellow-dim: #9a2b28;
  --yellow-soft: rgba(239, 43, 26, 0.13);
  --yellow-edge: rgba(239, 43, 26, 0.4);
  --press-yellow: #d92b1f;

  --silver: #c5c5c5;
  --silver-dim: #8c8c8c;

  --fg: #fafafa;
  --muted: #7a7a7a;
  --muted-soft: #5e5e5e;

  --green: #5cd47a;
  --red: #ff5a5a;
  --warning: #e8902a;
  --green-soft: rgba(92, 212, 122, 0.14);
  --red-soft: rgba(255, 90, 90, 0.14);
  --warning-soft: rgba(232, 144, 42, 0.14);

  --wa-bubble: #005c4b;
  --wa-bubble-fg: #e9edef;
  --wa-bubble-meta: rgba(233, 237, 239, 0.6);

  --ink: #0a0a0a;
  --glass: rgba(18, 18, 18, 0.72);
  --scrim: rgba(0, 0, 0, 0.64);
  --tab-bg: #0a0a0a;

  --backdrop: #050505;
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

  it("red: dark-only neon renders the same block for :root,.light and .dark (normalized)", () => {
    expect(normalize(tokensToCss(redTokens))).toBe(normalize(redTokenCssExpected));
  });
});
