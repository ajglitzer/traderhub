import { NextRequest } from "next/server";
import { requirePro, rateLimit, checkAiLimit } from "@/lib/api-guard";

const SYSTEM = "You are a professional trading coach. Be direct, specific, and honest. Give real actionable feedback.";

const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-70b-versatile",
  "llama3-70b-8192",
  "llama-3.1-8b-instant",
  "gemma2-9b-it",
];

export async function POST(req: NextRequest) {
  try {
    // Server-side Pro gate — the UI check alone can be bypassed with curl
    const guard = await requirePro();
    if (!guard.ok) {
      return new Response(JSON.stringify({ error: guard.error }), {
        status: guard.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 20 AI requests per day per user
    const aiLimit = await checkAiLimit(guard.userId, 20);
    if (!aiLimit.ok) {
      return new Response(JSON.stringify({ error: aiLimit.error }), {
        status: aiLimit.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Throttle so one user can't drain the Groq quota
    if (!rateLimit(guard.userId, 20, 60_000)) {
      return new Response(JSON.stringify({ error: "Too many requests — slow down." }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { prompt } = await req.json();
    if (!prompt) return new Response(JSON.stringify({ error: "No prompt" }), { status: 400 });

    // Cap prompt size — prevents token-bomb requests
    if (typeof prompt !== "string" || prompt.length > 20000) {
      return new Response(JSON.stringify({ error: "Prompt too large" }), { status: 413 });
    }

    const groqKey      = (process.env.GROQ_API_KEY      || "").trim();
    const anthropicKey = (process.env.ANTHROPIC_API_KEY || "").trim();

    // -- Try Groq streaming ----------------------------------------------------
    if (groqKey) {
      for (const model of GROQ_MODELS) {
        try {
          const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` },
            body: JSON.stringify({
              model, max_tokens: 1024, stream: true,
              messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }],
            }),
          });
          if (res.ok && res.body) {
            return new Response(res.body, {
              headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
            });
          }
          if (res.status === 401) break;
        } catch {}
      }

      // Groq non-streaming fallback
      try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${groqKey}` },
          body: JSON.stringify({
            model: "llama-3.1-8b-instant", max_tokens: 1024, stream: false,
            messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }],
          }),
        });
        if (res.ok) {
          const j = await res.json();
          const text = j?.choices?.[0]?.message?.content || "";
          if (text) {
            const sse = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`;
            return new Response(sse, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
          }
        }
      } catch {}
    }

    // -- Try Anthropic streaming -----------------------------------------------
    if (anthropicKey) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001", max_tokens: 1024, stream: true,
            system: SYSTEM,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (res.ok && res.body) {
          return new Response(res.body, {
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
          });
        }
      } catch {}
    }

    return new Response(
      JSON.stringify({
        error: "No AI API key configured.\n\nTo fix:\n1. Go to console.groq.com/keys and create a free API key\n2. In Vercel: your project → Settings → Environment Variables\n3. Add GROQ_API_KEY with your key\n4. Redeploy",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}
