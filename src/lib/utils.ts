import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmt$(v: number, decimals = 2): string {
  const abs = Math.abs(v);
  // Don't show .00 for clean whole numbers
  const isWhole = Number.isInteger(abs);
  const s = abs >= 1_000_000
    ? `$${(abs / 1_000_000).toFixed(1)}M`
    : abs >= 1_000
    ? `$${(abs / 1_000).toFixed(1)}K`
    : `$${isWhole && decimals === 2 ? abs.toFixed(0) : abs.toFixed(decimals)}`;
  return v < 0 ? `-${s}` : s;
}

export function fmtFull$(v: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

export function fmtPct(v: number, d = 2): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
}

export function fmtN(v: number, d = 2): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
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

export function getFilteredTrades(
  trades: any[],
  filters: Record<string,string>,
  page: number,
  limit = 50
): { trades: any[]; total: number; totalPages: number } {
  if (!Array.isArray(trades)) return { trades: [], total: 0, totalPages: 1 };
  let list = [...trades];
  const { status, side, assetType, ticker, sortBy, sortDir, dateFrom, dateTo, tag } = filters ?? {};
  if (status)    list = list.filter(t => t.status === status);
  if (side)      list = list.filter(t => t.side === side);
  if (assetType) list = list.filter(t => t.assetType === assetType);
  if (ticker)    list = list.filter(t => t.ticker?.toLowerCase().includes(ticker.toLowerCase()));
  if (tag)       list = list.filter(t => (t.tags||[]).includes(tag));
  if (dateFrom)  list = list.filter(t => t.entryTime && t.entryTime >= dateFrom);
  if (dateTo)    list = list.filter(t => t.entryTime && t.entryTime <= dateTo + "T23:59:59");
  if (sortBy) {
    list.sort((a, b) => {
      const av = a[sortBy] ?? 0, bv = b[sortBy] ?? 0;
      return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
  } else {
    list.sort((a, b) => new Date(b.entryTime||0).getTime() - new Date(a.entryTime||0).getTime());
  }
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page || 1), totalPages);
  return { trades: list.slice((safePage - 1) * limit, safePage * limit), total, totalPages };
}
