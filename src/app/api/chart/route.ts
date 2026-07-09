import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sym  = searchParams.get("sym");
  const from = searchParams.get("from");
  const to   = searchParams.get("to");

  if (!sym || !from || !to)
    return NextResponse.json({ error: "Missing params" }, { status: 400 });

  for (const host of ["query1", "query2"]) {
    const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}-interval=1m&period1=${from}&period2=${to}&includePrePost=true`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept": "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!data?.chart?.result?.[0]) continue;
      return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=300" } });
    } catch {}
  }

  return NextResponse.json({ error: "Yahoo Finance data unavailable for this symbol/timeframe" }, { status: 502 });
}
