import { NextRequest, NextResponse } from "next/server";
import { requirePro, rateLimit } from "@/lib/api-guard";

export async function GET(req: NextRequest) {
  // Chart Replay is a Pro feature — enforce it here, not just in the UI
  const guard = await requirePro();
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  if (!rateLimit(guard.userId, 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const sym          = searchParams.get("sym");
  const from         = searchParams.get("from");
  const to           = searchParams.get("to");
  const reqInterval  = searchParams.get("interval");

  if (!sym || !from || !to)
    return NextResponse.json({ error: "Missing params" }, { status: 400 });

  // Validate strictly — `from`/`to` are rebuilt as plain numbers (never the raw
  // string) before going into the upstream URL, so a client can't smuggle extra
  // query params (e.g. an embedded "&") into the Yahoo request. `sym` is
  // allow-listed to the character set Yahoo tickers actually use.
  const fromNum = Number(from);
  const toNum   = Number(to);
  if (!Number.isInteger(fromNum) || !Number.isInteger(toNum) || fromNum < 0 || toNum < fromNum)
    return NextResponse.json({ error: "Invalid from/to" }, { status: 400 });
  if (!/^[A-Za-z0-9.\-=^]{1,20}$/.test(sym))
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });

  const ALLOWED_INTERVALS = ["1m", "5m", "15m", "30m", "1h", "1d"];
  if (reqInterval && !ALLOWED_INTERVALS.includes(reqInterval))
    return NextResponse.json({ error: "Invalid interval" }, { status: 400 });

  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;

  // Caller picked a specific timeframe (chart replay's timeframe selector) —
  // honor it exactly rather than silently substituting a different one, so
  // the client can tell the user plainly when Yahoo has no data for it instead
  // of the UI quietly showing the wrong granularity.
  // Otherwise fall back to the original age-based auto-selection.
  const intervals = reqInterval
    ? [reqInterval]
    : fromNum < thirtyDaysAgo
      ? ["1h", "1d"]
      : ["1m", "5m", "1h"];

  for (const interval of intervals) {
    for (const host of ["query1", "query2"]) {
      const url = new URL(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}`);
      url.searchParams.set("interval", interval);
      url.searchParams.set("period1", String(fromNum));
      url.searchParams.set("period2", String(toNum));
      url.searchParams.set("includePrePost", "true");
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
