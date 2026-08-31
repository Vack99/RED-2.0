import { expect, test, type Page } from "@playwright/test";

/**
 * The signup rail's browser shield — guard (c)1 of the 2026-08-30 auth-door plan
 * (`docs/superpowers/plans/2026-08-30-auth-door-shield-plan.md`), closing FC-23: the
 * registration/confirmation door had never been exercised end-to-end by any automated test,
 * which is how a member spent 34 hours resubmitting a form whose only effect was to kill the
 * link she was holding.
 *
 * What a browser can prove here without a mailbox — and it is exactly the three things that
 * failed on 08-30:
 *
 *   1. a second signup for an address with a pending confirmation lands on the "abre el más
 *      reciente" screen, NOT the byte-identical success screen that hid the rotation (FC-02);
 *   2. every `?error=` code the route can emit renders copy that names what happened, plus an
 *      ENABLED resend control — the "pide uno nuevo" that used to name no control (FC-01/17);
 *   3. `/auth/confirm` tells its failures apart at all: an empty link and a link with an
 *      unusable `type` redirect with DIFFERENT codes, where one catch-all used to make the
 *      root cause unprovable (FC-03).
 *
 * Redeeming a real link is out of reach (it needs the inbox), so nothing below asserts a
 * session. These assertions are about WHICH SCREEN a person lands on, because the wedge was
 * never about tokens — it was about a door that reported success four times while the member
 * lost every link she had.
 *
 * ## Arming it
 *
 * Same switch as `session.spec.ts`: unset `E2E_EMAIL`/`E2E_PASSWORD` ⇒ the group skips. This
 * suite never uses those credentials — it rides the switch because test 1 POSTs the real form
 * against LIVE auth, and an unarmed `pnpm test:e2e` must stay a no-op against production.
 *
 * ## The fixture, and what it costs
 *
 * `delivered@resend.dev` is Resend's accept-all test address — it always accepts and never
 * bounces, so a run cannot spend the shared account's bounce budget (FC-08). Never invent a
 * fake domain here. Its `auth.users` row stays permanently unconfirmed by design: that IS the
 * fixture. It does not page the wedge detector — `registros_atorados()` excludes `%@resend.dev`.
 *
 * The first armed run on a fresh project has no pending row yet, so its first submit creates
 * one (one real `signUp`, once) and the assertion then rides the resubmit; every later run
 * reaches the same screen through GoTrue on the FIRST submit. Either way a run mints at most
 * one confirmation mail, which no one reads. That is the price of covering this door at all.
 * The row already exists on the live project (minted 2026-08-30 by this file's first run).
 */
const ARMADA = Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD);

const CORREO = "delivered@resend.dev";
/** Committed on purpose, like the red-demo twin's: the account it guards can never sign in
 *  (an unconfirmed address is refused with `email_not_confirmed`) and holds nothing. */
const PASSWORD = "E2ERegistro!2026";

/** The `/registro` terminal screens, by the h1 each renders (registro-form.tsx). */
const REVISA = "Revisa tu correo";
const YA_ENVIADO = "Ya te enviamos un correo";
const CUENTA_EXISTENTE = "Ya tienes una cuenta";

/** Head of `registro.ts`'s `DEMASIADOS_CORREOS` — what the door says when GoTrue itself
 *  refuses the send (its floor is 60s per address, and a run that follows a previous run
 *  too closely lands inside it). */
const LIMITE = "Ya enviamos varios correos";

/** Every `?error=` code `/auth/confirm` redirects with (`route.ts`'s `MotivoFallo`). */
const MOTIVOS = ["sin-token", "tipo-no-soportado", "code-rechazado", "token-rechazado"] as const;

/** The screen's own error/aviso banner — the door's answer, and nothing else that shouts.
 *  Scoped to the form because Next's route announcer is ALSO a `role="alert"` node — empty,
 *  always present, outside the form — so an unscoped locator matches it and reads as "the door
 *  already answered" the instant the page loads. Excluded the same way: the Turnstile block's
 *  own alert, identified by the retry button only it carries. */
function banner(page: Page) {
  return page
    .locator("form")
    .getByRole("alert")
    .filter({ hasNot: page.getByRole("button", { name: "Reintentar" }) });
}

/**
 * Drive the signup form the way a person does and report which screen answered — the h1 of a
 * terminal screen, or the text of the error banner when the form stays put. Placeholders, not
 * test ids: the form ships none, and adding them would be production code changed for a test.
 */
async function enviarRegistro(page: Page): Promise<string> {
  await page.goto("/registro");
  await page.getByPlaceholder("Tu nombre y apellido").fill("Prueba E2E");
  await page.getByPlaceholder("tu@correo.com").fill(CORREO);
  await page.getByPlaceholder("81 1234 5678").fill("8112345678");
  await page.getByPlaceholder("••••••••").fill(PASSWORD);
  await page.getByRole("checkbox").check();

  // Submit is gated on a real Turnstile token, so the button flipping to enabled is the only
  // signal the challenge resolved. The always-pass TEST sitekey still round-trips to
  // Cloudflare (pinned for this webServer in playwright.config.ts) — hence the wide timeout;
  // a widget that never loads is the FC-14 dead button, and it fails here as one.
  const enviar = page.getByRole("button", { name: "Crear cuenta" });
  await expect(enviar).toBeEnabled({ timeout: 30_000 });
  await enviar.click();

  const respuesta = page
    .getByRole("heading", { name: new RegExp(`^(${REVISA}|${YA_ENVIADO}|${CUENTA_EXISTENTE})$`) })
    .or(banner(page));
  await expect(respuesta).toBeVisible({ timeout: 30_000 });
  // `textContent`, never `innerText`: these titles are CSS-uppercased, and innerText returns
  // the rendered transform ("REVISA TU CORREO") instead of what the component says.
  return ((await respuesta.textContent()) ?? "").trim();
}

/** The distinguishing content of the "ya te enviamos uno" screen: which message to open, and
 *  the resend control that exists so nobody resubmits the form to get a fresh link. */
async function esperarPantallaYaEnviado(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: YA_ENVIADO })).toBeVisible();
  await expect(page.getByText("más reciente")).toBeVisible();
  await expect(page.getByRole("button", { name: "Enviar otro correo" })).toBeEnabled();
}

test.describe("puerta de registro", () => {
  test.skip(
    !ARMADA,
    "Set E2E_EMAIL + E2E_PASSWORD to arm this suite (see the header comment: it POSTs the real form against live auth).",
  );
  // Serial: test 1 owns the fixture address and `registro.ts`'s per-address send window is
  // process-global, so a parallel submit of the same address would answer from that window.
  test.describe.configure({ mode: "serial" });

  test("un registro pendiente manda a «abre el más reciente», no al éxito genérico", async ({
    page,
  }) => {
    // Up to three form round trips plus a cold Turnstile and, at worst, one wait-out of
    // GoTrue's 60s floor — well over the config's 60s default.
    test.setTimeout(180_000);

    let pantalla = await enviarRegistro(page);

    if (pantalla === REVISA) {
      // First armed run against this project: no pending row existed, so that submit created
      // one — the single real `signUp` this fixture ever needs. The resubmit is then answered
      // by `registro.ts`'s per-address window (fix 3: a resubmit is not a new intent), and
      // from the next run on the first submit reaches the same screen through GoTrue instead.
      pantalla = await enviarRegistro(page);
    } else if (pantalla.startsWith(LIMITE)) {
      // The previous run's mail is younger than GoTrue's 60s per-address floor, so the send
      // was refused. A refused send is not a send — the app-side window never armed — so
      // resubmitting now just draws the same refusal. Wait the floor out once.
      await page.waitForTimeout(65_000);
      pantalla = await enviarRegistro(page);
    }

    expect(
      pantalla,
      `El registro respondió «${pantalla}» para ${CORREO}, que ya tiene un registro sin confirmar.`,
    ).toBe(YA_ENVIADO);
    await esperarPantallaYaEnviado(page);
  });

  test("cada motivo de enlace muerto se explica y ofrece los dos rescates", async ({ page }) => {
    const avisos = new Map<string, string>();

    for (const motivo of MOTIVOS) {
      await page.goto(`/entrar?error=${motivo}`);

      const aviso = banner(page);
      await expect(aviso).toBeVisible();
      avisos.set(motivo, ((await aviso.textContent()) ?? "").trim());

      // The control the old copy promised and the product did not have. Enabled on arrival:
      // the 5-minute window only starts once someone actually sends (entrar-form.tsx).
      await expect(
        page.getByRole("button", { name: "Reenviar correo de confirmación" }),
      ).toBeEnabled();
      // The second rescue, immune to whatever damaged the link in the first place.
      await expect(page.getByRole("link", { name: "Escribe el código de 6 dígitos" })).toHaveAttribute(
        "href",
        "/codigo",
      );
    }

    // The two rejection codes share one message on purpose — the credential died, and how it
    // was minted is not the member's problem. The malformed-link codes must not be folded in
    // with them: "el enlace llegó incompleto" and "ya expiró" ask for different reactions, and
    // collapsing every shape into one banner is what left the 08-30 root cause unprovable.
    expect(avisos.get("code-rechazado")).toBe(avisos.get("token-rechazado"));
    const distintos = new Set(
      [avisos.get("sin-token"), avisos.get("tipo-no-soportado"), avisos.get("token-rechazado")],
    );
    expect(distintos.size).toBe(3);
  });

  test("/auth/confirm distingue el enlace vacío del enlace con tipo inservible", async ({
    page,
  }) => {
    // No params at all: the shape a webview/mail rewrite produces when it eats the query.
    await page.goto("/auth/confirm");
    await expect(page).toHaveURL(/\/entrar\?error=sin-token$/);

    // A token that survived with an unusable `type`. Refused before any Supabase call — this
    // navigation spends nothing from the auth-mail bucket and burns no token.
    await page.goto("/auth/confirm?token_hash=e2e-no-existe&type=magiclink");
    await expect(page).toHaveURL(/\/entrar\?error=tipo-no-soportado$/);
  });
});
