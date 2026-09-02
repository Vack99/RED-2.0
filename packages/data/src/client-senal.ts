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

const reguladores = new Set<Regulador>();

export function ocuparSenal(key: string): void {
  senalBusy.add(key);
}

/**
 * Release a hold and, when it was the LAST one, flush every regulator's pending motive at once.
 * That flush is the whole point: the refresh a user "missed" while their sheet was open lands the
 * instant they close it, rather than waiting for the next write anybody happens to make.
 */
export function liberarSenal(key: string): void {
  senalBusy.delete(key);
  if (senalBusy.size > 0) return;
  for (const reg of [...reguladores]) reg.vaciar();
}

export interface Regulador {
  /** Record a motive and (re)arm the trailing debounce. */
  pedir(motivo: MotivoSenal): void;
  /** Fire the pending motive now, if any. Called by `liberarSenal` when the busy set empties. */
  vaciar(): void;
  /** Cancel everything pending and unregister. */
  destruir(): void;
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

  const disparar = (): void => {
    timer = null;
    // Busy: keep the motive pending and say nothing. `liberarSenal` fires it on close.
    if (senalBusy.size > 0) return;
    const motivo = pendiente;
    pendiente = null;
    if (motivo) onSenal(motivo);
  };

  const reg: Regulador = {
    pedir(motivo) {
      pendiente = motivo;
      if (timer) clearTimeout(timer);
      timer = setTimeout(disparar, debounceMs);
    },
    vaciar() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      const motivo = pendiente;
      pendiente = null;
      if (motivo) onSenal(motivo);
    },
    destruir() {
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
      if (canal) void supabase.removeChannel(canal);
    };
  }, [gymId, debounceMs]);
}
