import { NextRequest, NextResponse } from "next/server";
import { searchDoctors } from "@/lib/catalog";

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams;
    const filters = { specialty: q.get("specialty")?.slice(0, 80), district: q.get("district")?.slice(0, 80), keyword: q.get("keyword")?.slice(0, 100) };
    const result = await searchDoctors(filters);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Doctor catalog is unavailable" }, { status: 503 });
  }
}
