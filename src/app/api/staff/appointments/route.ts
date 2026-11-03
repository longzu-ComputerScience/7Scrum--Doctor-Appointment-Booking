import { NextResponse } from "next/server";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Login required" }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const admin = supabaseAdmin();
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return NextResponse.json({ error: "Invalid staff session" }, { status: 401 });

  const { data: memberships, error: memberError } = await admin.from("staff_members")
    .select("clinic_id").eq("user_id", auth.user.id);
  if (memberError) return NextResponse.json({ error: "Cannot authorize staff" }, { status: 503 });
  const clinicIds = (memberships || []).map((item) => item.clinic_id);
  if (!clinicIds.length) return NextResponse.json({ error: "No clinic staff access" }, { status: 403 });

  const { data: appointments, error } = await admin.from("appointments")
    .select("id,slot_id,patient_name,patient_phone,status,created_at,appointment_slots!inner(clinic_id,start_at,doctors(name),clinics(name))")
    .in("appointment_slots.clinic_id", clinicIds).order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: "Cannot load appointments" }, { status: 503 });
  const rows = (appointments || []).map((item) => {
    const rawSlot = item.appointment_slots as unknown;
    const slot = (Array.isArray(rawSlot) ? rawSlot[0] : rawSlot) as Record<string, unknown> | undefined;
    const rawDoctor = slot?.doctors;
    const doctor = (Array.isArray(rawDoctor) ? rawDoctor[0] : rawDoctor) as { name?: string } | undefined;
    const rawClinic = slot?.clinics;
    const clinic = (Array.isArray(rawClinic) ? rawClinic[0] : rawClinic) as { name?: string } | undefined;
    return {
      id: item.id, patientName: item.patient_name, patientPhone: item.patient_phone,
      status: item.status, startAt: slot?.start_at,
      doctorName: doctor?.name || "", clinicName: clinic?.name || "",
    };
  });
  return NextResponse.json({ appointments: rows }, { headers: { "Cache-Control": "no-store" } });
}
