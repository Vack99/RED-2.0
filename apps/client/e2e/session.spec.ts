import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * "Log in once, stay logged in" — the browser-level shield over the bug class fixed in
 * 465dcf4 (`docs/Context/2026-08-21-login-session-persistence-analysis.md`).
 *
 * That defect was never a token race. Server-side rotation was healthy the whole time —
 * Katya's session auto-refreshed for 8 days and she still got a password form 37 seconds
 * after a successful refresh. The auth SURFACE was session-blind: `/entrar` never checked
 * claims, and the drawer's booking CTAs pointed at `/registro` for everyone. Every unit
 * test passed throughout, because nothing below the browser can see "a signed-in member
 * was walked back to a login form". Only a real browser holding real cookies across a
 * real navigation can. Hence this file, and hence the assertions below being about WHERE
 * a member lands rather than about internals.
 *
 * The three tests mirror the three shipped fixes, strongest first. Test 3 also covers the
 * landing-page CTAs (hero + today-schedule rows), which 465dcf4 missed and which this
 * suite caught on its first armed run.
 *
 * ## Arming it
 *
 * Credentials come from the environment; unset ⇒ the whole group skips (the config still
 * loads, `--list` still works, `pnpm test:e2e` still exits 0). The sanctioned values are
 * the `red-demo` sandbox twin's — a dev-only gym whose login was SQL-minted with a
 * password committed to this repo on purpose
 * (`docs/superpowers/plans/2026-07-05-slice-45-red-demo-twin.md`):
 *
 *   E2E_EMAIL=demo@red-demo.test  E2E_PASSWORD='RedDemo!2026'  pnpm test:e2e
 *
 * They are read, never printed — a failure reports a URL, not a secret. Note the sandbox
 * twin lives on the LIVE Supabase project (there is no separate auth server), so a run
 * does mint a real `auth.sessions` row for that demo account. It writes nothing else:
 * every assertion here is a navigation or a read.
 */
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

/** Storage state captured after the one real sign-in, replayed into each fresh context. */
type EstadoSesion = Awaited<ReturnType<BrowserContext["storageState"]>>;

/** The login form, driven the way a member drives it. Placeholders (not test ids) —
 *  the form ships none, and adding them would be production code changed for the test. */
async function iniciarSesion(page: Page): Promise<void> {
  await page.goto("/entrar");
  await page.getByPlaceholder("tu@correo.com").fill(EMAIL!);
  await page.getByPlaceholder("••••••••").fill(PASSWORD!);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

/** `/reservar` rendered for a real member — the URL AND a member-only control.
 *  The URL alone is too weak: `SinMembresia` also answers on `/reservar`, so a lost
 *  membership would read as a pass. The heading `Esta semana` is too weak as well —
 *  the streaming skeleton (`reservar/loading.tsx`) renders a byte-identical h1 for
 *  EVERY outcome, so the poll could settle on the fallback. The Perfil button exists
 *  only in the real panel: the skeleton renders that slot as a nameless circle and
 *  `SinMembresia` has no such control. */
async function esperarPanelDeMiembro(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/reservar$/);
  await expect(page.getByRole("button", { name: "Perfil" })).toBeVisible();
}

test.describe("persistencia de sesión", () => {
  test.skip(
    !EMAIL || !PASSWORD,
    "Set E2E_EMAIL + E2E_PASSWORD to arm this suite (see the header comment for the red-demo sandbox values).",
  );
  // Serial: test 1 performs the only sign-in and publishes the state the others replay.
  test.describe.configure({ mode: "serial" });

  let estado: EstadoSesion;

  test("una sesión iniciada sobrevive a un contexto de navegador nuevo", async ({
    page,
    browser,
  }) => {
    await iniciarSesion(page);
    await esperarPanelDeMiembro(page);

    // The whole point: a DIFFERENT browser context, carrying nothing but the cookies the
    // sign-in produced — no in-memory client, no warm router cache, no BroadcastChannel
    // peer. This is the returning member on their next visit.
    estado = await page.context().storageState();
    const contextoNuevo = await browser.newContext({ storageState: estado });
    const nueva = await contextoNuevo.newPage();

    await nueva.goto("/reservar");
    await esperarPanelDeMiembro(nueva);
    // Say the failure out loud: being bounced to the login form is the regression.
    await expect(nueva.getByPlaceholder("tu@correo.com")).toHaveCount(0);

    await contextoNuevo.close();
  });

  test("/entrar manda al panel a quien ya tiene sesión", async ({ browser }) => {
    const contexto = await browser.newContext({ storageState: estado });
    const page = await contexto.newPage();

    // The exact walk that re-prompted Katya: a live session lands on the sign-in page.
    await page.goto("/entrar");
    await esperarPanelDeMiembro(page);

    await contexto.close();
  });

  test("ningún CTA del landing manda a registro con sesión activa", async ({ browser }) => {
    const contexto = await browser.newContext({ storageState: estado });
    const page = await contexto.newPage();

    // The landing is where a returning member actually re-enters, and every booking CTA
    // on it is part of the funnel that produced the re-login complaint.
    await page.goto("/");

    // The hero — the biggest button on the page. Scoped to <main> because the drawer
    // carries an identically-named CTA and an unscoped locator is a strict-mode failure.
    await expect(
      page.getByRole("main").getByRole("link", { name: "Reservar clase" }),
    ).toHaveAttribute("href", "/reservar");

    // The drawer CTA. The header hides itself on /entrar, /registro and /restablecer, so
    // the drawer is only reachable from a marketing route; it is `inert` until opened.
    await page.getByRole("button", { name: "Menú" }).click();
    const drawer = page.getByRole("complementary", { name: "Menú de navegación" });
    await expect(drawer.getByRole("link", { name: "Reservar clase" })).toHaveAttribute(
      "href",
      "/reservar",
    );

    // The invariant behind both, and the only day-independent way to cover the
    // today-schedule rows: they render one link per class, so on a day with no classes
    // an explicit row assertion would fail for the wrong reason. Stated as an absence
    // instead — with a live session NOTHING on this page may funnel back to the signup
    // form, including any CTA added later.
    await expect(page.locator('a[href="/registro"]')).toHaveCount(0);

    await contexto.close();
  });
});
