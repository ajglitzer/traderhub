import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmt$(v: unknown, decimals = 2): string {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  if (!Number.isFinite(n)) return "$0";
  const abs = Math.abs(n);
  const v2 = n;
  // Don't show .00 for clean whole numbers
  const isWhole = Number.isInteger(abs);
  const s = abs >= 1_000_000
    ? `$${(abs / 1_000_000).toFixed(1)}M`
    : abs >= 1_000
    ? `$${(abs / 1_000).toFixed(1)}K`
    : `$${isWhole && decimals === 2 ? abs.toFixed(0) : abs.toFixed(decimals)}`;
  return v2 < 0 ? `-${s}` : s;
}

export function fmtFull$(v: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

export function fmtPct(v: unknown, d = 2): string {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return `${n >= 0 ? "+" : ""}${n.toFixed(d)}%`;
}

export function fmtN(v: unknown, d = 2): string {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
}

export function pnlClass(v: number): string {
  return v > 0 ? "pnl-pos" : v < 0 ? "pnl-neg" : "pnl-neu";
}

export function fmtHold(s: number | null): string {
  if (!s) return "–";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}
