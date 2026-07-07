import { NextRequest, NextResponse } from "next/server";
import { db, ser } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    if (!db) return NextResponse.json({ trades: [], total: 0, page: 1, totalPages: 0 });
    const sp = new URL(req.url).searchParams;
    const page = parseInt(sp.get("page") || "1");
    const limit = parseInt(sp.get("limit") || "50");
    const where: Record<string, unknown> = {};
    if (sp.get("ticker")) where.ticker = { contains: sp.get("ticker") };
    if (sp.get("strategy")) where.strategy = sp.get("strategy");
    if (sp.get("assetClass")) where.assetClass = sp.get("assetClass");
    if (sp.get("side")) where.side = sp.get("side");
    if (sp.get("status")) where.status = sp.get("status");
    const sortBy = sp.get("sortBy") || "entryTime";
    const sortDir = (sp.get("sortDir") || "desc") as "asc" | "desc";
    const [trades, total] = await Promise.all([
      db.trade.findMany({ where, orderBy: { [sortBy]: sortDir }, skip: (page-1)*limit, take: limit }),
      db.trade.count({ where }),
    ]);
    return NextResponse.json({ trades: trades.map(ser), total, page, totalPages: Math.ceil(total/limit) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!db) return NextResponse.json({ error: "DB not ready" }, { status: 503 });
    const body = await req.json();
    const trade = await db.trade.create({
      data: {
        ...body,
        emotions: body.emotions ? JSON.stringify(body.emotions) : null,
        tags: body.tags ? JSON.stringify(body.tags) : null,
        entryTime: new Date(body.entryTime),
        exitTime: body.exitTime ? new Date(body.exitTime) : null,
      },
    });
    return NextResponse.json(ser(trade), { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
