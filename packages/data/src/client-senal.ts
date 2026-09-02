import { useEffect, useRef } from "react";
import { REALTIME_SUBSCRIBE_STATES, type RealtimeChannel } from "@supabase/supabase-js";

import { createClient } from "./client";

/**
 * The freshness rail's browser half (audit 2026-09-01). The DB emits one broadcast per gym per
 * transaction to the private topic `gym:<gym_id>` carrying no data; this answers it with a
 * debounced callback — in practice `router.refresh()`, which re-reads through the `server-only`
 * DAL. The signal is a hint that something changed; the SERVER is still the only thing that says
 * what.
 *
 * This module lives beside `client.ts` (never under `./server/`) and carries no `server-only`
 * poison-pill: it is browser code, and `@gym/ui` is forbidden from importing `@gym/data` at all,
 * so the apps are its only consumers.
 */
export type MotivoSenal = "senal" | "visible" | "rejoin";

/**
 * What must NOT be interrupted right now, by key. An open sheet holds a snapshot of a session
 * (`sheet.sesion` in reservar-semana.tsx) and an open editor holds an unsaved draft — refreshing
 * the route under either one destroys work the user can see. An in-flight write is held for a
 * different reason: it is about to produce its own authoritative result, so a refresh mid-flight
 * would repaint from a read that raced it.
 *
 * A plain module-level Set, not React state: the holders (a sheet in one component, a toggle in
 * another) and the regulators (one per mounted hook) never share a tree.
 */
export const senalBusy = new Set<string>();

export interface Regulador {
  /** Record a motive and (re)arm the trailing debounce. No-op once `destruir()` has run. */
  pedir(motivo: MotivoSenal): void;
  /** Cancel everything pending, unregister, and make every later `pedir()` a no-op. */
  destruir(): void;
}

/**
 * The internal shape kept in the `reguladores` registry. `vaciar` is deliberately absent from the
 * exported `Regulador` — it exists only for `liberarSenal` to call when the busy set empties, and
 * nothing outside this module has a reason to invoke it.
 */
interface ReguladorInterno extends Regulador {
  vaciar(): void;
}

const reguladores = new Set<ReguladorInterno>();

/**
 * The in-flight `removeChannel()` of the LAST unmount, or null when none is pending. Module-level
 * because the two mounts that race are different components (`/reservar`'s layout and
 * `/clase/[id]`'s), and the leave they race over belongs to neither of them: it belongs to the
 * per-tab supabase singleton, whose channel registry is keyed by topic and shared by both.
 *
 * Why it has to exist: navigating between those two routes unmounts one `useSenalGym` and mounts
 * another on the SAME topic. `removeChannel` is async — it awaits `channel.unsubscribe()`, phoenix
 * marks the channel `leaving`, and the channel is dropped from `client.channels` only in its
 * `_onClose` hook (RealtimeChannel.js:102-104 → RealtimeClient.js:437-439), i.e. when the server's
 * leave reply lands. A mount in that window calls `supabase.channel('gym:<id>')`, which returns the
 * EXISTING leaving channel rather than making a new one (RealtimeClient.js:343-355, "If a channel
 * with the same topic already exists it will be returned instead"), and `.subscribe()` on it is a
 * silent no-op: its whole body is behind `if (this.channelAdapter.isClosed())`
 * (RealtimeChannel.js:116-121), and `isClosed()` is `state === 'closed'`, not `'leaving'`
 * (phoenix/channelAdapter.js:74-76). The destination route would then have no subscription, no
 * error, and no warning — the status callback that logs CHANNEL_ERROR is never even registered.
 */
let saliendo: Promise<unknown> | null = null;

export function ocuparSenal(key: string): void {
  senalBusy.add(key);
}

/**
 * Release a hold and, when it was the LAST one, ask every regulator to re-request its pending
 * motive through the SAME trailing debounce — not fire it synchronously. A burst of ocupar/liberar
 * cycles (twenty door taps closing in quick succession) must still collapse into ONE refresh,
 * debounceMs after the LAST release, exactly like a burst of `pedir()` calls collapses into one
 * refresh debounceMs after the last of them.
 */
export function liberarSenal(key: string): void {
  senalBusy.delete(key);
  if (senalBusy.size > 0) return;
  for (const reg of [...reguladores]) reg.vaciar();
}

/**
 * The whole decision, deliberately free of React and of the DOM so it is unit-testable: this repo
 * has no jsdom and no testing-library, and every vitest project runs `environment: "node"`.
 *
 * TRAILING debounce, not leading: a pasar-lista of twenty members is twenty transactions and
 * therefore twenty signals, and the useful refresh is the one AFTER the last of them.
 */
export function crearRegulador(onSenal: (motivo: MotivoSenal) => void, debounceMs: number): Regulador {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendiente: MotivoSenal | null = null;
  // Set the instant `destruir()` runs. Guards `pedir()` AND the flush path (`disparar`/`vaciar`):
  // a broadcast landing between `reg.destruir()` and the (async) `removeChannel()` in
  // `useSenalGym`'s cleanup still reaches this closure via the channel's `.on(...)` callback, and
  // without this flag it would re-arm the timer and fire `onSenal` after the caller unmounted.
  let muerto = false;

  const disparar = (): void => {
    timer = null;
    if (muerto) return;
    // Busy: keep the motive pending and say nothing. `liberarSenal` re-requests it on close.
    if (senalBusy.size > 0) return;
    const motivo = pendiente;
    pendiente = null;
    if (motivo) onSenal(motivo);
  };

  const pedir = (motivo: MotivoSenal): void => {
    if (muerto) return;
    pendiente = motivo;
    if (timer) clearTimeout(timer);
    timer = setTimeout(disparar, debounceMs);
  };

  const reg: ReguladorInterno = {
    pedir,
    vaciar() {
      if (muerto) return;
      // Re-request through `pedir`, not a direct fire: this is what turns a burst of releases
      // into one debounced call instead of one call per release.
      if (pendiente) pedir(pendiente);
    },
    destruir() {
      muerto = true;
      if (timer) clearTimeout(timer);
      timer = null;
      pendiente = null;
      reguladores.delete(reg);
    },
  };

  reguladores.add(reg);
  return reg;
}

/**
 * Subscribe this tab to its gym's signal topic, and answer with `onSenal`.
 *
 * Three motives reach the caller, and they are named because they are not the same event:
 *  - `senal`   — somebody wrote. The rail working as designed.
 *  - `visible` — the tab came back to the foreground. The free floor: this alone closes the
 *                "staff phone off the lock screen shows five-minute-old reservas" complaint, and
 *                it works whether or not the socket survived the background.
 *  - `rejoin`  — the channel re-SUBSCRIBED after a close (iOS Safari backgrounds sockets). Every
 *                message sent while the socket was down is gone, so a rejoin is a reconciliation,
 *                not a notification.
 *
 * No session, no socket AND no visibility listener: an anonymous visitor on a member route (the
 * layout renders before the page's own `redirect("/entrar")`) must not open one, nor fire a
 * refresh. `getClaims` is the repo's authz reader (ADR-0001); this is not an authz decision, only
 * "is there a token to authorize a channel with", which is exactly what `getSession` answers.
 *
 * `createClient()` returns the per-tab singleton (`@supabase/ssr` memoizes it in the browser), so
 * this is one socket per tab no matter how many mounts. supabase-js re-pushes the refreshed JWT
 * to open channels on TOKEN_REFRESHED, so the subscription survives rotation without help here.
 */
export function useSenalGym({
  gymId,
  onSenal,
  debounceMs = 600,
}: {
  gymId: string | null | undefined;
  onSenal: (motivo: MotivoSenal) => void;
  debounceMs?: number;
}): void {
  // Held in a ref so a caller passing an inline arrow does not tear down the socket every render.
  const cb = useRef(onSenal);
  useEffect(() => {
    cb.current = onSenal;
  }, [onSenal]);

  useEffect(() => {
    if (!gymId || typeof window === "undefined") return;

    let vivo = true;
    let canal: RealtimeChannel | null = null;
    const supabase = createClient();
    const reg = crearRegulador((motivo) => cb.current(motivo), debounceMs);

    const alCambiarVisibilidad = (): void => {
      if (document.visibilityState === "visible") reg.pedir("visible");
    };

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session || !vivo) return;

      // The listener is attached INSIDE the session guard, not before it: a signed-out tab must
      // not fire `onSenal` either, and its `router.refresh()` on a public route is a round trip
      // for a screen with nothing member-specific on it.
      document.addEventListener("visibilitychange", alCambiarVisibilidad);

      // A private channel is authorized by the token Realtime holds, not by the socket's cookies.
      await supabase.realtime.setAuth();
      if (!vivo) return;

      // Wait out the previous mount's leave before asking for the topic, or `channel()` hands back
      // that leaving channel and `subscribe()` does nothing (see `saliendo` above). Re-check `vivo`
      // after: this await is a second suspension point, and the caller may have unmounted across it.
      if (saliendo) await saliendo;
      if (!vivo) return;

      let suscritoAntes = false;
      canal = supabase
        .channel(`gym:${gymId}`, { config: { private: true } })
        .on("broadcast", { event: "cambio" }, () => reg.pedir("senal"))
        .subscribe((estado) => {
          if (
            estado === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
            estado === REALTIME_SUBSCRIBE_STATES.TIMED_OUT
          ) {
            // The rail is otherwise SILENT when it breaks — a denied policy, a missing partition
            // or a dropped socket all look identical to "nobody wrote anything". One line, at the
            // transition only (subscribe fires this state once per failure, not per retry).
            console.warn("[senal] canal", estado);
            return;
          }
          if (estado !== REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) return;
          if (suscritoAntes) reg.pedir("rejoin");
          suscritoAntes = true;
        });
    })();

    return () => {
      vivo = false;
      document.removeEventListener("visibilitychange", alCambiarVisibilidad);
      reg.destruir();
      if (!canal) return;
      // Publish the leave so the NEXT mount can await it. `.catch` because an unresolved rejection
      // here would be an unhandled one, and because a failed leave must still let the next mount
      // proceed rather than hang it forever. The identity check in `.finally` matters when two
      // unmounts overlap (A → B → C): without it, the FIRST leave settling would clear the SECOND
      // one's promise and the third mount would race exactly the channel this fixes.
      const p: Promise<unknown> = supabase
        .removeChannel(canal)
        .catch(() => undefined)
        .finally(() => {
          if (saliendo === p) saliendo = null;
        });
      saliendo = p;
    };
  }, [gymId, debounceMs]);
}
