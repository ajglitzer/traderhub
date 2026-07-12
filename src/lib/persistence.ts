
// Persistence layer - saves to localStorage on every mutation + tab close
// Falls back to localStorage if database is unavailable (Prisma not set up yet)

import { Trade } from "@/types/trade";

const BASE_STORAGE_KEY = "traderhub_trades_v1";
const BASE_REVIEWS_KEY = "traderhub_reviews_v1";

function uid(): string {
  try { return localStorage.getItem("th_current_user_id") || ""; } catch { return ""; }
}
function STORAGE_KEY(): string { const u = uid(); return u ? `${BASE_STORAGE_KEY}_${u}` : BASE_STORAGE_KEY; }
function REVIEWS_KEY(): string { const u = uid(); return u ? `${BASE_REVIEWS_KEY}_${u}` : BASE_REVIEWS_KEY; }

export function saveTrades(trades: Trade[]): void {
  try {
    localStorage.setItem(STORAGE_KEY(), JSON.stringify(trades));
  } catch (e) {
    console.warn("localStorage save failed:", e);
  }
}

export function loadTrades(): Trade[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY());
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveReviews(reviews: unknown[]): void {
  try {
    localStorage.setItem(REVIEWS_KEY(), JSON.stringify(reviews));
  } catch {}
}

export function loadReviews(): unknown[] {
  try {
    const raw = localStorage.getItem(REVIEWS_KEY());
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Register beforeunload save
export function registerUnloadSave(getTrades: () => Trade[]): () => void {
  const handler = () => saveTrades(getTrades());
  window.addEventListener("beforeunload", handler);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveTrades(getTrades());
  });
  return () => {
    window.removeEventListener("beforeunload", handler);
  };
}
