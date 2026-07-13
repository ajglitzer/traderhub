"use client";

/** Safe number formatter — a missing/NaN field would otherwise crash the page. */
function sf(n: unknown, d = 2): string {
  const v = typeof n === "number" ? n : parseFloat(String(n ?? ""));
  return Number.isFinite(v) ? v.toFixed(d) : "—";
}
import { PricingModal } from "@/components/subscription/pro-gate";
import { useSubscription } from "@/hooks/useSubscription";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore, getFilteredTrades } from "@/store";
import { useAccountStore } from "@/store/accounts";
import { fmt$, fmtHold, pnlClass, cn } from "@/lib/utils";
import { format } from "date-fns";
import { ChevronUp, ChevronDown, Trash2, Star, TrendingUp, TrendingDown, Search } from "lucide-react";
import { CandleChartBtn } from "@/components/ui/chart-popup";
import { AIAnalysisBtn } from "@/components/ui/ai-analysis";
import { TradeCardBtn } from "@/components/ui/trade-card";
import { TradeDetailPanel } from "@/components/ui/trade-detail";
import { AddTradeModal } from "@/components/trades/add-trade-modal";
import { exportToCSV } from "@/lib/export";
import { Trade } from "@/types/trade";

const ACHIP: Record<string,string> = {
  STOCK:"rgba(0,229,255,0.1)|#00e5ff",
  FUTURES:"rgba(213,0,249,0.1)|#d500f9",
  CRYPTO:"rgba(255,171,0,0.1)|#ffab00",
  FOREX:"rgba(0,230,118,0.1)|#00e676",
  OPTIONS:"rgba(255,23,68,0.1)|#ff1744",
  ETF:"rgba(0,229,255,0.08)|#00e5ff",
  CFD:"rgba(255,171,0,0.08)|#ffab00",
};

export function TradeTable() {
  const { filters: rawFilters, setFilters, resetFilters, page: rawPage, setPage } = useStore();
  const filters = rawFilters ?? {};
  const page = typeof rawPage === "number" ? rawPage : 1;
  const [showAddTrade, setShowAddTrade] = useState(false);
  const { getActiveTrades, activeAccountId, deleteAccountTrade, updateAccountTrade } = useAccountStore();
  const trades = getActiveTrades() ?? [];
  const { isPro } = useSubscription();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [search, setSearch] = useState("");
  const [hov, setHov] = useState<string|null>(null);
  const [selectedTrade, setSelectedTrade] = useState<Trade|null>(null);

  const { trades:list, total, totalPages } = useMemo(() => {
    try {
      const f = search ? {...filters, ticker:search} : filters;
      return getFilteredTrades(trades, f, page, 50);
    } catch {
      return { trades: [], total: 0, totalPages: 1 };
    }
  }, [trades, filters, page, search]);

  const sort = (col: string) => {
    if (filters.sortBy === col) setFilters({ sortDir: filters.sortDir === "desc" ? "asc" : "desc" });
    else setFilters({ sortBy: col, sortDir: "desc" });
  };

  const SI = ({ col }: { col: string }) => filters.sortBy === col
    ? filters.sortDir === "desc"
      ? <ChevronDown size={10} className="text-cyan-400"/>
      : <ChevronUp size={10} className="text-cyan-400"/>
    : <ChevronDown size={10} style={{ color:"#1f2937" }}/>;

  const TH = ({ col, children, r }: { col?: string; children: React.ReactNode; r?: boolean }) => (
    <th
      className={cn("px-3 py-3 text-[10px] font-bold uppercase tracking-widest select-none whitespace-nowrap", col && "cursor-pointer hover:text-zinc-300", r && "text-right")}
      style={{ color:"#3d4551" }}
      onClick={col ? () => sort(col) : undefined}
    >
      <div className={cn("flex items-center gap-1", r && "justify-end")}>
        {children}{col && <SI col={col}/>}
      </div>
    </th>
  );

  return (
    <>
    {showUpgrade&&<PricingModal onClose={()=>setShowUpgrade(false)}/>}
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", borderBottom:"1px solid rgba(255,255,255,0.05)", flexWrap:"wrap", flexShrink:0, background:"rgba(0,0,0,0.2)" }}>
        <div style={{ position:"relative" }}>
          <Search size={12} style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", color:"#3d4551" }}/>
          <input value={search} onChange={e => { setSearch(e.target.value.toUpperCase()); setPage(1); }}
            placeholder="Ticker..." className="input" style={{ paddingLeft:28, width:110, height:30, fontSize:12 }}/>
        </div>
        {([
          { k:"side",       opts:[["","Side"],["LONG","Long"],["SHORT","Short"]] },
          { k:"assetClass", opts:[["","Asset"],["STOCK","Stocks"],["FUTURES","Futures"],["CRYPTO","Crypto"],["FOREX","Forex"],["OPTIONS","Options"]] },
          { k:"status",     opts:[["CLOSED","Closed"],["OPEN","Open"],["","All"]] },
        ] as { k:string; opts:[string,string][] }[]).map(({ k, opts }) => (
          <select key={k} value={filters[k]||""}
            onChange={e => { setFilters({ [k]: e.target.value }); setPage(1); }}
            className="input" style={{ height:30, fontSize:12, width:"auto", cursor:"pointer", paddingRight:24 }}>
            {opts.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ))}
        <button onClick={()=>{ if(!isPro){setShowUpgrade(true);return;} exportToCSV(list as Trade[], `traderhub_filtered_${new Date().toISOString().slice(0,10)}.csv`)}}
          style={{height:30,padding:"0 12px",borderRadius:8,background:"rgba(0,229,255,0.08)",border:"1px solid rgba(0,229,255,0.2)",color:"#00e5ff",fontSize:11,fontWeight:700,cursor:"pointer",marginLeft:"auto"}}>
          ↓ Export {total.toLocaleString()} filtered
        </button>
        <button onClick={()=>setShowAddTrade(true)}
          style={{height:30,padding:"0 12px",borderRadius:8,background:"rgba(0,230,118,0.1)",border:"1px solid rgba(0,230,118,0.25)",color:"#00e676",fontSize:11,fontWeight:700,cursor:"pointer"}}>
          + Add Trade
        </button>
      </div>
      {showAddTrade && <AddTradeModal onClose={()=>setShowAddTrade(false)}/>}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead style={{ position:"sticky", top:0, zIndex:10, background:"rgba(6,10,15,0.97)", backdropFilter:"blur(20px)" }}>
            <tr style={{ borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
              <TH col="entryTime">Date</TH>
              <TH col="ticker">Ticker</TH>
              <TH>Asset</TH>
              <TH>Side</TH>
              <TH col="entryPrice" r>Entry</TH>
              <TH col="exitPrice"  r>Exit</TH>
              <TH col="quantity"   r>Qty</TH>
              <TH col="netPnl"     r>Net P&L</TH>
              <TH col="rMultiple"  r>R</TH>
              <TH col="holdTimeSeconds" r>Hold</TH>
              <TH>Chart</TH>
              <TH>AI</TH>
              <th style={{ width:32 }}/>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={12}>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"60px 0", color:"#3d4551" }}>
                  <TrendingUp size={32} style={{ marginBottom:10, opacity:0.3 }}/>
                  <div style={{ fontSize:13 }}>No trades found</div>
                </div>
              </td></tr>
            )}
            <AnimatePresence initial={false}>
              {list.map((t, i) => {
                const [bg, clr] = (ACHIP[t.assetClass]||"rgba(255,255,255,0.06)|#4b5563").split("|");
                const isHov = hov === t.id;
                return (
                  <motion.tr key={t.id}
                    initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                    transition={{ delay: Math.min(i*0.006, 0.1) }}
                    onMouseEnter={() => setHov(t.id)} onMouseLeave={() => setHov(null)}
                    style={{ borderBottom:"1px solid rgba(255,255,255,0.03)", background: isHov ? "rgba(255,255,255,0.02)" : "transparent", cursor:"pointer" }}
                    onClick={() => setSelectedTrade(t as Trade)}
                  >
                    <td style={{ padding:"8px 12px", whiteSpace:"nowrap" }}>
                      <div style={{ fontSize:12, color:"#8b949e" }}>{format(new Date(t.entryTime), "MMM d, yy")}</div>
                      <div style={{ fontSize:10, color:"#3d4551", fontFamily:"monospace" }}>{format(new Date(t.entryTime), "HH:mm")}</div>
                    </td>
                    <td style={{ padding:"8px 12px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        {t.favorite && <Star size={9} style={{ color:"#ffab00", fill:"#ffab00" }}/>}
                        <span style={{ fontWeight:800, fontSize:13, color:"#f0f6fc", fontFamily:"monospace" }}>{t.ticker}</span>
                      </div>
                      {t.strategy && <div style={{ fontSize:9, color:"#3d4551", marginTop:1 }}>{t.strategy}</div>}
                    </td>
                    <td style={{ padding:"8px 12px" }}>
                      <span style={{ padding:"2px 7px", borderRadius:5, fontSize:10, fontWeight:700, background:bg, color:clr }}>{t.assetClass}</span>
                    </td>
                    <td style={{ padding:"8px 12px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                        {t.side === "LONG"
                          ? <TrendingUp size={11} style={{ color:"#00e676" }}/>
                          : <TrendingDown size={11} style={{ color:"#ff1744" }}/>}
                        <span style={{ fontSize:10, fontWeight:700, color: t.side==="LONG"?"#00e676":"#ff1744" }}>{t.side}</span>
                      </div>
                    </td>
                    <td style={{ padding:"8px 12px", textAlign:"right", fontFamily:"monospace", fontSize:12, color:"#c9d1d9" }}>{sf(t.entryPrice, 4)}</td>
                    <td style={{ padding:"8px 12px", textAlign:"right", fontFamily:"monospace", fontSize:12, color:"#6b7280" }}>{t.exitPrice?.toFixed(4) ?? <span style={{color:"#1f2937"}}>—</span>}</td>
                    <td style={{ padding:"8px 12px", textAlign:"right", fontSize:12, color:"#6b7280" }}>{t.quantity.toLocaleString()}</td>
                    <td style={{ padding:"8px 12px", textAlign:"right", fontFamily:"monospace", fontWeight:800, fontSize:12,
                      color:(t.netPnl??0)>=0?"#00e676":"#ff1744",
                      textShadow:(t.netPnl??0)>=0?"0 0 12px rgba(0,230,118,0.35)":"0 0 12px rgba(255,23,68,0.35)" }}>
                      {t.netPnl !== null ? fmt$(t.netPnl) : "—"}
                    </td>
                    <td style={{ padding:"8px 12px", textAlign:"right", fontFamily:"monospace", fontSize:11,
                      color:(t.rMultiple??0)>=0?"#00e676":"#ff1744" }}>
                      {Number.isFinite(t.rMultiple as number) ? sf(t.rMultiple, 2)+"R" : "—"}
                    </td>
                    <td style={{ padding:"8px 12px", textAlign:"right", fontSize:11, color:"#4b5563", fontFamily:"monospace" }}>{fmtHold(t.holdTimeSeconds)}</td>
                    {/* -- CHART BUTTON -- */}
                    <td style={{ padding:"6px 8px" }}>
                      <CandleChartBtn trade={t} size={26}/>
                    </td>
                    {/* -- AI ANALYSIS -- */}
                    <td style={{ padding:"6px 8px" }}>
                      <AIAnalysisBtn trade={t} size={26}/>
                    </td>
                    {/* -- SHARE CARD -- */}
                    <td style={{ padding:"6px 8px" }}>
                      <TradeCardBtn trade={t}/>
                    </td>
                    <td style={{ padding:"6px 8px" }}>
                      {isHov && (
                        <button
                          onClick={e => { e.stopPropagation(); if (confirm("Delete this trade?")) deleteAccountTrade(activeAccountId, t.id); }}
                          style={{ width:24, height:24, borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", background:"transparent", border:"none", color:"#3d4551", cursor:"pointer", transition:"all 0.1s" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color="#ff1744"; (e.currentTarget as HTMLElement).style.background="rgba(255,23,68,0.1)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color="#3d4551"; (e.currentTarget as HTMLElement).style.background="transparent"; }}
                        >
                          <Trash2 size={11}/>
                        </button>
                      )}
                    </td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {selectedTrade && <TradeDetailPanel trade={selectedTrade} onClose={() => setSelectedTrade(null)} />}
      {totalPages > 1 && (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderTop:"1px solid rgba(255,255,255,0.05)", flexShrink:0, background:"rgba(0,0,0,0.2)" }}>
          <span style={{ fontSize:11, color:"#3d4551", fontFamily:"monospace" }}>Page {page} / {totalPages}</span>
          <div style={{ display:"flex", gap:6 }}>
            <button onClick={() => setPage(Math.max(1,page-1))} disabled={page<=1}
              style={{ height:28, padding:"0 12px", borderRadius:7, border:"1px solid rgba(255,255,255,0.07)", background:"rgba(255,255,255,0.03)", color:"#6b7280", cursor:page<=1?"default":"pointer", fontSize:12, opacity:page<=1?0.3:1 }}>Prev</button>
            <button onClick={() => setPage(Math.min(totalPages,page+1))} disabled={page>=totalPages}
              style={{ height:28, padding:"0 12px", borderRadius:7, border:"1px solid rgba(255,255,255,0.07)", background:"rgba(255,255,255,0.03)", color:"#6b7280", cursor:page>=totalPages?"default":"pointer", fontSize:12, opacity:page>=totalPages?0.3:1 }}>Next</button>
          </div>
        </div>
      )}
    </div>
  </>
  );
}
