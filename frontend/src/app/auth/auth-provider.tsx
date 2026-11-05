"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { ContractApiError } from "@/lib/contract-api";
import { loadIdentity, type Identity } from "@/lib/fe1-api";
import { subscribeDoctorChanges } from "@/lib/doctor-realtime";
import { BookingSessionProvider, type AvailabilitySubscription, type BookingSessionState } from "../doctors/[id]/book/booking-session";

type AuthState = { status: "loading" } | { status: "signedOut" } |
  { status: "ready"; session: Session; identity: Identity } | { status: "error"; error: unknown };
type AuthContextValue = { state: AuthState; configured: boolean; reload: () => void; signOut: () => Promise<void> };
const Context = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => getSupabaseBrowser(), []);
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const [revision, setRevision] = useState(0);
  const currentToken = useRef<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    let active = true, generation = 0;
    let request: AbortController | null = null;
    const read = (session: Session | null) => {
      const token = session?.access_token ?? null;
      if (token && token === currentToken.current) return;
      currentToken.current = token;
      const version = ++generation;
      request?.abort();
      if (!session) { setState({ status: "signedOut" }); return; }
      setState({ status: "loading" });
      const controller = new AbortController(); request = controller;
      // Defer IO out of the SDK's synchronous auth callback/lock.
      void Promise.resolve().then(() => loadIdentity(session.access_token, controller.signal)).then(identity => {
        if (active && generation === version && currentToken.current === session.access_token) setState({ status: "ready", session, identity });
      }).catch(error => {
        if (active && generation === version && currentToken.current === session.access_token) setState({ status: "error", error });
      });
    };
    const unauthorized = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== currentToken.current) return;
      ++generation; request?.abort(); currentToken.current = null;
      setState({ status: "error", error: new ContractApiError(401) });
      void client?.auth.signOut({ scope: "local" });
    };
    window.addEventListener("carely:unauthorized", unauthorized);
    currentToken.current = null;
    if (!client) { void Promise.resolve().then(() => { if (active) read(null); }); }
    const before = generation;
    void client?.auth.getSession().then(({ data, error }) => {
      if (!active || generation !== before) return;
      if (error) setState({ status: "error", error }); else read(data.session);
    }).catch(error => { if (active) setState({ status: "error", error }); });
    const subscription = client?.auth.onAuthStateChange((_event, session) => { if (active) read(session); });
    return () => {
      active = false; ++generation; request?.abort(); subscription?.data.subscription.unsubscribe();
      window.removeEventListener("carely:unauthorized", unauthorized);
    };
  }, [client, revision]);

  const reload = useCallback(() => { setState({ status: "loading" }); setRevision(v => v + 1); }, []);
  const signOut = useCallback(async () => {
    currentToken.current = null;
    setState({ status: "loading" });
    try {
      const result = await client?.auth.signOut({ scope: "local" });
      if (result?.error) throw result.error;
      currentToken.current = null; setState({ status: "signedOut" });
    } catch (error) { setState({ status: "error", error }); throw error; }
  }, [client]);
  const token = state.status === "ready" ? state.session.access_token : null;
  const subscribeToAvailability = useCallback<AvailabilitySubscription>((doctorId, onChange, onReconnect) => {
    if (!client || !token) return () => {};
    return subscribeDoctorChanges(client, doctorId, false, onChange, onReconnect);
  }, [client, token]);
  const bookingState: BookingSessionState = state.status === "loading" ? { status: "loading" }
    : state.status === "error" ? { status: "error", error: state.error }
    : { status: "ready", session: state.status === "ready" && state.identity.role === "patient"
      ? { accessToken: state.session.access_token, patient: state.identity.patient } : null };
  return <Context.Provider value={{ state, configured: Boolean(client), reload, signOut }}>
    <BookingSessionProvider sessionState={bookingState} subscribeToAvailability={subscribeToAvailability}
      onRequireLogin={() => router.push(`/patient/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`)}>
      {children}
    </BookingSessionProvider>
  </Context.Provider>;
}

export function useAuth() {
  const context = useContext(Context);
  if (!context) throw new Error("AuthProvider is required");
  return context;
}
