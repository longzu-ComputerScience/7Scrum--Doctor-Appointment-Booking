"use client";

import { useEffect, useState } from "react";
import type { AppointmentSlot } from "@/lib/types";
import { dateKey, formatDay, formatTime } from "./doctors/[id]/book/booking-utils";
import styles from "./doctor-browser.module.css";

type Availability = {
  status: "loading" | "ready" | "error";
  slots: AppointmentSlot[];
  demoMode: boolean;
};

export function DoctorAvailability({ doctorId }: { doctorId: string }) {
  const [availability, setAvailability] = useState<Availability>({ status: "loading", slots: [], demoMode: false });

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/doctors/${encodeURIComponent(doctorId)}/slots`, {
          cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        });
        if (!response.ok) throw new Error("Availability unavailable");
        const data = await response.json() as { slots: AppointmentSlot[]; demoMode: boolean };
        if (!Array.isArray(data.slots) || typeof data.demoMode !== "boolean") throw new Error("Invalid availability");
        const now = Date.now();
        const slots = data.slots.filter((slot) => slot.doctorId === doctorId &&
          new Date(slot.startAt).getTime() > now && new Date(slot.endAt).getTime() > new Date(slot.startAt).getTime())
          .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
        if (!controller.signal.aborted) setAvailability({ status: "ready", slots, demoMode: data.demoMode });
      } catch {
        if (!controller.signal.aborted) setAvailability({ status: "error", slots: [], demoMode: false });
      }
    }
    void load();
    return () => controller.abort();
  }, [doctorId]);

  const today = dateKey(new Date().toISOString());
  const todaySlots = availability.slots.filter((slot) => dateKey(slot.startAt) === today);
  const nextSlot = availability.slots[0];

  return <>
    <div>
      <h4>Available Today</h4>
      <p>Vietnam time (UTC+7)</p>
      <div role="status">
        {availability.status === "loading" ? <p>Loading available times…</p> : availability.status === "error" ? <p>Unable to load available times. Open booking to try again.</p> : <>
          {todaySlots.length ? todaySlots.slice(0, 3).map((slot) => <p key={slot.id}>{formatTime(slot.startAt)} – {formatTime(slot.endAt)}</p>) : <p>No available times today.</p>}
          {todaySlots.length > 3 && <p>+{todaySlots.length - 3} more times in booking</p>}
        </>}
      </div>
    </div>
    <div>
      <h4>Schedule</h4>
      <p>In-person visits</p>
      <div role="status">
        {availability.status === "loading" ? <p>Loading schedule…</p> : availability.status === "error" ? <p>Unable to load schedule. Open booking to try again.</p> : nextSlot ? <>
          <p>Next available: {formatDay(nextSlot.startAt)}</p>
          <p>{formatTime(nextSlot.startAt)} – {formatTime(nextSlot.endAt)} (UTC+7)</p>
        </> : <p>No upcoming appointments available.</p>}
      </div>
      {availability.status === "ready" && availability.demoMode && <span className={styles.previewLabel}>Preview times only</span>}
    </div>
  </>;
}
