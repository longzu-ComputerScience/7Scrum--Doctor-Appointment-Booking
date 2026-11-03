import { NextResponse } from "next/server";
import { findDoctor } from "@/lib/catalog";
import { uuid } from "@/lib/schemas";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: "Invalid doctor ID" }, { status: 400 });
  try {
    const result = await findDoctor(id);
    if (!result.doctor) return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Doctor is unavailable" }, { status: 503 });
  }
}
