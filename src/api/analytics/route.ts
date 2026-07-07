import { NextRequest, NextResponse } from "next/server";

// Analytics are computed client-side from the store for speed
// This route is a passthrough for server-computed data when DB is available
export async function GET(req: NextRequest) {
  return NextResponse.json({ message: "Use client-side analytics from store" });
}
