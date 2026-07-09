import { NextResponse } from "next/server";

interface FFEvent {
  title: string;
  country: string;
  date: string;
  time: string;
  impact: string;
  forecast: string;
  previous: string;
  actual: string;
}

function normalizeImpact(i: string): "High" | "Medium" | "Low" {
  const l = (i || "").toLowerCase();
  if (l.includes("high") || l === "3") return "High";
  if (l.includes("medium") || l === "2") return "Medium";
  return "Low";
}

export async function GET() {
  try {
    // ForexFactory free calendar API - no key needed
    const urls = [
      "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
      "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
    ];

    const results = await Promise.allSettled(urls.map(url =>
      fetch(url, { headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) })
        .then(r => r.ok ? r.json() : [])
        .catch(() => [])
    ));

    let events: FFEvent[] = [];
    for (const r of results) {
      if (r.status === "fulfilled" && Array.isArray(r.value)) {
        events = events.concat(r.value);
      }
    }

    const normalized = events.map((e: FFEvent) => ({
      title: e.title || "",
      country: e.country || "",
      date: e.date ? e.date.slice(0, 10) : "",
      time: e.time || "",
      impact: normalizeImpact(e.impact),
      forecast: e.forecast || "",
      previous: e.previous || "",
      actual: e.actual || "",
    })).filter(e => e.title && e.date);

    // Sort by date + time
    normalized.sort((a, b) => {
      const da = new Date(`${a.date}T${a.time || "00:00"}`).getTime();
      const db = new Date(`${b.date}T${b.time || "00:00"}`).getTime();
      return da - db;
    });

    return NextResponse.json(normalized, {
      headers: { "Cache-Control": "public, max-age=1800" }, // cache 30min
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
