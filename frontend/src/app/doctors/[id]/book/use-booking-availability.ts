"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bookingRange, loadBookingData, reconcileAvailability, type BookingDoctor, type BookingSlot } from "./booking-utils";
import type { AvailabilitySubscription } from "./booking-session";

type State = { doctor: BookingDoctor | null; slots: BookingSlot[]; demo: boolean; loading: boolean; refreshing: boolean; error: unknown };
export function useBookingAvailability(doctorId: string, subscribe: AvailabilitySubscription | undefined, onLoaded: (slots: BookingSlot[]) => void) {
  const [range] = useState(() => bookingRange());
  const [state, setState] = useState<State>({ doctor: null, slots: [], demo: false, loading: true, refreshing: false, error: null });
  const reload = useRef<() => Promise<boolean>>(async () => false);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function load(): Promise<boolean> {
      if (pending || controller.signal.aborted) return false;
      pending = true;
      await Promise.resolve();
      if (controller.signal.aborted) return false;
      setState(current => ({ ...current, refreshing: true }));
      try {
        const fresh = await loadBookingData(doctorId, controller.signal, range);
        if (controller.signal.aborted) return false;
        setState(current => ({ ...fresh, slots: reconcileAvailability(current.slots, fresh.slots, range), loading: false, refreshing: false, error: null }));
        onLoaded(fresh.slots);
        return true;
      } catch (error) {
        if (!controller.signal.aborted) {
          // A failed read cannot leave stale times bookable.
          setState(current => ({ ...current, slots: [], loading: false, refreshing: false, error }));
          onLoaded([]);
        }
        return false;
      } finally { pending = false; }
    }
    reload.current = load;
    const refresh = () => { void load(); };
    const visibleRefresh = () => { if (document.visibilityState === "visible") refresh(); };
    void load();
    const poll = window.setInterval(visibleRefresh, 5_000);
    window.addEventListener("online", refresh); window.addEventListener("focus", visibleRefresh);
    document.addEventListener("visibilitychange", visibleRefresh);
    // Transport failures fall back to polling; no undocumented broadcast channel is guessed.
    let unsubscribe: (() => void) | undefined;
    try { unsubscribe = subscribe?.(doctorId, refresh, refresh); } catch { /* bounded GET polling remains active */ }
    return () => {
      controller.abort(); window.clearInterval(poll);
      window.removeEventListener("online", refresh); window.removeEventListener("focus", visibleRefresh);
      document.removeEventListener("visibilitychange", visibleRefresh);
      try { unsubscribe?.(); } catch { /* Listener cleanup must not depend on the external transport. */ }
    };
  }, [doctorId, range, subscribe, onLoaded]);
  const refresh = useCallback(() => reload.current(), []);
  return { ...state, range, refresh };
}
