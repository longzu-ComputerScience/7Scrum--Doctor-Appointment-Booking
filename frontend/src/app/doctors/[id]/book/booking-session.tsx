"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient } from "@supabase/supabase-js";
import { loadPatientProfile, type PatientProfile } from "./booking-utils";

export type PatientBookingSession = { accessToken: string; patient: PatientProfile };
export type BookingSessionState = { status: "loading" } | { status: "ready"; session: PatientBookingSession | null } | { status: "error"; error: unknown };
/** BE must supply the event transport/schema. Each event/reconnect refetches authoritative GET data. */
export type AvailabilitySubscription = (doctorId: string, onChange: () => void, onReconnect: () => void) => () => void;
export type BookingIntegration = { sessionState: BookingSessionState; subscribeToAvailability?: AvailabilitySubscription; onRequireLogin?: () => void };
const Integration = createContext<BookingIntegration | null>(null);
export function BookingSessionProvider({ children, ...value }: BookingIntegration & { children: ReactNode }) {
  return <Integration.Provider value={value}>{children}</Integration.Provider>;
}

/** FE1 may provide session/profile through context. Fallback only reads an existing SDK session. */
export function useBookingIntegration(): BookingIntegration {
  const provided = useContext(Integration);
  const client = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && key ? createClient(url, key) : null;
  }, []);
  const [state, setState] = useState<BookingSessionState>({ status: "loading" });
  useEffect(() => {
    if (provided) return;
    let active = true;
    let generation = 0;
    let profileRequest: AbortController | null = null;
    async function read(token: string) {
      const request = ++generation;
      profileRequest?.abort(); profileRequest = new AbortController();
      // Keep auth callbacks synchronous; profile IO runs outside the SDK auth lock.
      await Promise.resolve();
      if (!active || request !== generation) return;
      if (!token) { setState({ status: "ready", session: null }); return; }
      setState({ status: "loading" });
      try {
        const patient = await loadPatientProfile(token, profileRequest.signal);
        if (active && request === generation) setState({ status: "ready", session: { accessToken: token, patient } });
      } catch (error) { if (active && request === generation) setState({ status: "error", error }); }
    }
    if (!client) { void read(""); return () => { active = false; }; }
    const beforeSession = generation;
    client.auth.getSession().then(({ data, error }) => {
      if (!active || generation !== beforeSession) return;
      if (error) setState({ status: "error", error });
      else void read(data.session?.access_token ?? "");
    }).catch(error => { if (active) setState({ status: "error", error }); });
    const { data } = client.auth.onAuthStateChange((_event, session) => { void read(session?.access_token ?? ""); });
    return () => { active = false; profileRequest?.abort(); data.subscription.unsubscribe(); };
  }, [client, provided]);
  return provided ?? { sessionState: state };
}
