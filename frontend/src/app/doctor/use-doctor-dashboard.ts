"use client";

import { useEffect, useState } from "react";
import { fe1Request, parseAppointments, parseNotifications, upcomingAppointments, type DoctorAppointment, type DoctorNotification } from "@/lib/fe1-api";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { subscribeDoctorChanges } from "@/lib/doctor-realtime";

type Data = { appointments: DoctorAppointment[]; upcoming: DoctorAppointment[]; notifications: DoctorNotification[] };
type Snapshot = { status: "loading" } | { status: "ready"; data: Data; refreshedAt: number } | { status: "error"; error: unknown };
export function useDoctorDashboard(token: string, doctorId: string) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ status: "loading" });
  const [revision, setRevision] = useState(0);
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!token || !doctorId) return;
    const controller = new AbortController();
    let active = true, inFlight = false, queued = false;
    async function refresh() {
      if (!active || document.visibilityState === "hidden") return;
      if (inFlight) { queued = true; return; }
      inFlight = true;
      try {
        const options = { token, signal: controller.signal };
        const [appointments, upcoming, notifications] = await Promise.all([
          fe1Request("/api/doctor/appointments", options),
          fe1Request("/api/doctor/appointments?view=upcoming", options),
          fe1Request("/api/doctor/notifications", options),
        ]);
        const data = { appointments: parseAppointments(appointments, doctorId),
          upcoming: upcomingAppointments(parseAppointments(upcoming, doctorId)), notifications: parseNotifications(notifications) };
        if (active) setSnapshot({ status: "ready", data, refreshedAt: Date.now() });
      } catch (error) { if (active) setSnapshot({ status: "error", error }); }
      finally {
        inFlight = false;
        if (queued && active) { queued = false; void refresh(); }
      }
    }
    const refetch = () => { void refresh(); };
    const client = getSupabaseBrowser();
    const unsubscribe = client ? subscribeDoctorChanges(client, doctorId, true, refetch, refetch, setLive) : () => {};
    refetch();
    const poll = window.setInterval(refetch, 5000);
    window.addEventListener("online", refetch); window.addEventListener("focus", refetch); document.addEventListener("visibilitychange", refetch);
    return () => {
      active = false; controller.abort(); unsubscribe(); window.clearInterval(poll);
      window.removeEventListener("online", refetch); window.removeEventListener("focus", refetch); document.removeEventListener("visibilitychange", refetch);
    };
  }, [token, doctorId, revision]);
  return { snapshot, live, refresh: () => setRevision(v => v + 1) };
}
