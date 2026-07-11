import { NextResponse } from "next/server";

function normalizeImpact(i: string): "High" | "Medium" | "Low" {
  const l = (i || "").toLowerCase();
  if (l.includes("high") || l === "3") return "High";
  if (l.includes("medium") || l === "2") return "Medium";
  return "Low";
}

export async function GET() {
  try {
    const urls = [
      "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
      "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
    ];

    const headers = {
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; TraderHub/1.0)",
      "Referer": "https://www.forexfactory.com/",
      "Origin": "https://www.forexfactory.com",
    };

    const results = await Promise.allSettled(
      urls.map(url =>
        fetch(url, { headers, signal: AbortSignal.timeout(10000) })
          .then(r => r.ok ? r.json() : [])
          .catch(() => [])
      )
    );

    let events: any[] = [];
    for (const r of results) {
      if (r.status === "fulfilled" && Array.isArray(r.value)) {
        events = events.concat(r.value);
      }
    }

    const normalized = events.map((e: any) => ({
      title: e.title || "",
      country: e.country || "",
      date: e.date ? e.date.slice(0, 10) : "",
      time: e.time || "",
      impact: normalizeImpact(e.impact),
      forecast: e.forecast || "",
      previous: e.previous || "",
      actual: e.actual || "",
    })).filter(e => e.title && e.date);

    normalized.sort((a, b) => {
      const da = new Date(`${a.date}T${a.time || "00:00"}`).getTime();
      const db = new Date(`${b.date}T${b.time || "00:00"}`).getTime();
      return da - db;
    });

    if (normalized.length === 0) {
      // Fallback: return empty array with proper response so UI shows "no events" not error
      return NextResponse.json([], {
        headers: { "Cache-Control": "public, max-age=300" }
      });
    }

    return NextResponse.json(normalized, {
      headers: { "Cache-Control": "public, max-age=1800" },
    });
  } catch (e) {
    return NextResponse.json([], { status: 200 });
  }
}
