import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sym  = searchParams.get("sym");
  const from = searchParams.get("from");
  const to   = searchParams.get("to");

  if (!sym || !from || !to)
    return NextResponse.json({ error: "Missing params" }, { status: 400 });

  const fromNum = parseInt(from);
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;

  // Pick interval based on age — Yahoo only keeps 1m for last 30 days
  const intervals = fromNum < thirtyDaysAgo
    ? ["1h", "1d"]
    : ["1m", "5m", "1h"];

  for (const interval of intervals) {
    for (const host of ["query1", "query2"]) {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&period1=${from}&period2=${to}&includePrePost=true`;
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
  }

  return NextResponse.json({ error: "Yahoo Finance data unavailable for this symbol/timeframe" }, { status: 502 });
}
