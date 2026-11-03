import { NextResponse } from "next/server";
import { staffStatusInput, uuid } from "@/lib/schemas";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";
import type { AppointmentStatus } from "@/lib/types";

const transitions: Record<AppointmentStatus, AppointmentStatus[]> = {
  requested: ["confirmed", "cancelled"],
  confirmed: ["checked_in", "cancelled"],
  checked_in: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Staff login required" }, { status: 401 });
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: "Invalid appointment ID" }, { status: 400 });
  let payload: unknown;
  try { payload = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = staffStatusInput.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const admin = supabaseAdmin();
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return NextResponse.json({ error: "Invalid staff session" }, { status: 401 });

  const { data: appointment, error } = await admin.from("appointments")
    .select("id,status,appointment_slots!inner(clinic_id)").eq("id", id).single();
  if (error || !appointment) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  const rawSlot = appointment.appointment_slots as unknown;
  const slot = (Array.isArray(rawSlot) ? rawSlot[0] : rawSlot) as { clinic_id: string } | undefined;
  const { data: membership } = await admin.from("staff_members").select("user_id")
    .eq("user_id", auth.user.id).eq("clinic_id", slot?.clinic_id || "").maybeSingle();
  if (!membership) return NextResponse.json({ error: "Not a staff member of this clinic" }, { status: 403 });

  const current = appointment.status as AppointmentStatus;
  if (!transitions[current]?.includes(parsed.data.status)) return NextResponse.json({ error: "Invalid status transition" }, { status: 409 });
  const { data: updated, error: updateError } = await admin.from("appointments")
    .update({ status: parsed.data.status }).eq("id", id).eq("status", current).select("id,status").maybeSingle();
  if (updateError) return NextResponse.json({ error: "Could not update status" }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Appointment changed; reload and retry" }, { status: 409 });
  return NextResponse.json({ appointment: updated });
}
