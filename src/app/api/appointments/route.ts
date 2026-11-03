import { NextResponse } from "next/server";
import { bookingInput } from "@/lib/schemas";
import { isSupabaseConfigured, supabaseAdmin } from "@/lib/supabase-server";

export async function POST(request: Request) {
  let json: unknown;
  try { json = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = bookingInput.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid booking details", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Demo mode: real booking requires Supabase configuration" }, { status: 503 });
  const input = parsed.data;
  try {
    const { data, error } = await supabaseAdmin().rpc("create_appointment", {
      p_slot_id: input.slotId, p_patient_name: input.patientName,
      p_patient_phone: input.patientPhone, p_notes: input.notes,
    });
    if (error) {
      if (error.code === "23505" || error.code === "P0001") return NextResponse.json({ error: "Slot is no longer available" }, { status: 409 });
      return NextResponse.json({ error: "Unable to create booking" }, { status: 500 });
    }
    const record = Array.isArray(data) ? data[0] : data;
    if (!record) return NextResponse.json({ error: "Slot is no longer available" }, { status: 409 });
    return NextResponse.json({ appointmentId: record.appointment_id, bookingReference: record.booking_reference, status: "requested" }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Booking service unavailable" }, { status: 503 });
  }
}
