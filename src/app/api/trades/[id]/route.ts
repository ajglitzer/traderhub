import { NextRequest, NextResponse } from "next/server";
import { db, ser } from "@/lib/db";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!db) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const { id } = await params;
    const t = await db.trade.findUnique({ where: { id } });
    return t ? NextResponse.json(ser(t)) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!db) return NextResponse.json({ error: "DB not ready" }, { status: 503 });
  try {
    const { id } = await params;
    const body = await req.json();
    const t = await db.trade.update({ where: { id }, data: body });
    return NextResponse.json(ser(t));
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!db) return NextResponse.json({ error: "DB not ready" }, { status: 503 });
  try {
    const { id } = await params;
    await db.trade.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}
