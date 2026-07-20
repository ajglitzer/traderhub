import { createBrowserClient } from "@supabase/ssr";

// Supabase's REST (PostgREST) responses are cacheable GET requests, and the
// browser HTTP cache will happily serve a stale one on repeat identical
// queries (friend lists, blocked lists, conversations) — surviving even a
// normal page reload. Force every request to skip that cache.
function noStoreFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, { ...init, cache: "no-store" });
}

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder";
  return createBrowserClient(url, key, { global: { fetch: noStoreFetch } });
}
