import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "./contract-api";

/** Events are invalidations only. Private details always come from the Bearer API. */
export function subscribeDoctorChanges(client: SupabaseClient, doctorId: string, notifications: boolean,
  onChange: () => void, onReconnect: () => void, onStatus?: (live: boolean) => void) {
  if (!isUuid(doctorId)) return () => {};
  let active = true;
  const invalidate = () => { if (active) onChange(); };
  const channel = client.channel(`carely:${doctorId}:${notifications ? "dashboard" : "calendar"}:${crypto.randomUUID()}`);
  for (const event of ["INSERT", "UPDATE"] as const) {
    channel.on("postgres_changes", { event, schema: "public", table: "doctor_calendar_revisions", filter: `doctor_id=eq.${doctorId}` }, invalidate);
    if (notifications) channel.on("postgres_changes", { event, schema: "public", table: "appointment_notifications", filter: `doctor_id=eq.${doctorId}` }, invalidate);
  }
  channel.subscribe(state => {
    if (!active) return;
    onStatus?.(state === "SUBSCRIBED");
    if (state === "SUBSCRIBED") onReconnect();
  });
  return () => { active = false; void client.removeChannel(channel); };
}
