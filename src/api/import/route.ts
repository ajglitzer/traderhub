import { NextRequest, NextResponse } from "next/server";
import { parseCSV } from "@/lib/csv-parsers";
import { calculateTradePnl } from "@/lib/calculations";
import { db, ser } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { csvText, filename } = await req.json();
    if (!csvText) return NextResponse.json({ error: "No CSV text" }, { status: 400 });

    const { trades, format, errors } = parseCSV(csvText);
    if (!trades.length) return NextResponse.json({ error: "No trades parsed", errors }, { status: 400 });

    // Return parsed trades even if DB not ready (client will store them)
    const enriched = trades.map((t) => {
      const { grossPnl, netPnl, rMultiple } = calculateTradePnl(t);
      const hold = t.exitTime && t.entryTime
        ? Math.round((new Date(t.exitTime).getTime() - new Date(t.entryTime).getTime()) / 1000)
        : null;
      return {
        id: `local_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ticker: t.ticker || "UNKNOWN",
        assetClass: t.assetClass || "STOCK",
        side: t.side || "LONG",
        status: t.status || "CLOSED",
        entryPrice: t.entryPrice || 0,
        exitPrice: t.exitPrice || null,
        quantity: t.quantity || 0,
        entryTime: t.entryTime || new Date().toISOString(),
        exitTime: t.exitTime || null,
        fees: t.fees || 0,
        commissions: t.commissions || 0,
        grossPnl: t.grossPnl ?? grossPnl,
        netPnl: t.netPnl ?? netPnl,
        rMultiple: t.rMultiple ?? rMultiple,
        riskReward: null,
        holdTimeSeconds: hold,
        stopLoss: null, takeProfit: null, riskAmount: null,
        strategy: t.strategy || null, setup: null, timeframe: null,
        notes: t.notes || null, emotions: [], tags: [], rating: null,
        favorite: false, reviewLater: false, screenshots: [], customFields: {},
      };
    });

    // Try to save to DB if available
    let dbSaved = 0;
    if (db) {
      try {
        for (const t of enriched) {
          await db.trade.create({
            data: {
              ...t, id: undefined, createdAt: undefined, updatedAt: undefined,
              emotions: "[]", tags: "[]", screenshots: "[]", customFields: "{}",
              entryTime: new Date(t.entryTime),
              exitTime: t.exitTime ? new Date(t.exitTime) : null,
            },
          }).catch(() => {}); // ignore duplicates
          dbSaved++;
        }
      } catch {}
    }

    return NextResponse.json({
      success: true,
      imported: enriched.length,
      duplicates: trades.length - enriched.length,
      format,
      errors,
      trades: enriched, // Always return trades so client can store them
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
