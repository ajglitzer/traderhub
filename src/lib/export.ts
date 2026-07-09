import { Trade } from "@/types/trade";

// -- CSV Export ----------------------------------------------------------------
export function exportToCSV(trades: Trade[], filename = "traderhub_export.csv"): void {
  const headers = [
    "Date","Ticker","Asset Class","Side","Status",
    "Entry Price","Exit Price","Quantity","Fees","Commissions",
    "Gross P&L","Net P&L","R-Multiple","Hold (seconds)","Hold (readable)",
    "Stop Loss","Take Profit","Risk Amount","Manual P&L Override","Contract Size",
    "Strategy","Setup","Timeframe","Notes","Tags","Rating","Favorite","Review Later"
  ];

  const fmtHold = (s: number | null) => {
    if (!s) return "";
    if (s < 60) return s + "s";
    if (s < 3600) return Math.round(s/60) + "m";
    if (s < 86400) return Math.round(s/3600) + "h";
    return Math.round(s/86400) + "d";
  };

  const rows = trades.map((t) => [
    t.entryTime ? new Date(t.entryTime).toISOString().slice(0,19).replace("T"," ") : "",
    t.ticker,
    t.assetClass,
    t.side,
    t.status,
    t.entryPrice,
    t.exitPrice ?? "",
    t.quantity,
    t.fees,
    t.commissions,
    t.grossPnl ?? "",
    t.netPnl ?? "",
    t.rMultiple !== null ? t.rMultiple.toFixed(3) : "",
    t.holdTimeSeconds ?? "",
    fmtHold(t.holdTimeSeconds),
    t.stopLoss ?? "",
    t.takeProfit ?? "",
    t.riskAmount ?? "",
    t.manualPnl ?? "",
    t.contractSize ?? "",
    t.strategy ?? "",
    t.setup ?? "",
    t.timeframe ?? "",
    JSON.stringify(t.notes ?? "").slice(1,-1),
    (t.tags || []).join(";"),
    t.rating ?? "",
    t.favorite ? "1" : "0",
    t.reviewLater ? "1" : "0",
  ].map((v) => {
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(","));

  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// -- JSON Backup Export ---------------------------------------------------------
export function exportToJSON(trades: Trade[], filename = "traderhub_backup.json"): void {
  const data = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), trades }, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// -- JSON Import (restore backup) ----------------------------------------------
export function importFromJSON(file: File): Promise<Trade[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data.trades && Array.isArray(data.trades)) {
          resolve(data.trades as Trade[]);
        } else if (Array.isArray(data)) {
          resolve(data as Trade[]);
        } else {
          reject(new Error("Invalid backup file format"));
        }
      } catch {
        reject(new Error("Could not parse JSON file"));
      }
    };
    reader.readAsText(file);
  });
}
