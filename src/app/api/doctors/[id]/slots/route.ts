import { NextResponse } from "next/server";
import { findSlots } from "@/lib/catalog";
import { uuid } from "@/lib/schemas";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: "Invalid doctor ID" }, { status: 400 });
  try {
    return NextResponse.json(await findSlots(id), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Slots are unavailable" }, { status: 503 });
  }
}
