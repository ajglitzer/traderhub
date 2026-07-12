"use client";
import { useCallback, useRef, useState } from "react";
import { useStore } from "@/store";
import { useAccountStore } from "@/store/accounts";
import { parseCSV, mergeBalanceAndOrders, extractOrderFills } from "@/lib/csv-parsers";
import { calculateTradePnl } from "@/lib/calculations";
import { Trade } from "@/types/trade";
import { fmt$ } from "@/lib/utils";

const MAX_IMPORT = 10000;  // guard: a 1M-row CSV would freeze the browser

export function ImportDialog() {
  const { importOpen, setImportOpen, addTrades } = useStore();
  const { activeAccountId, addAccountTrades } = useAccountStore();
  const [step, setStep] = useState<"idle"|"preview"|"done">("idle");
  const [parsed, setParsed] = useState<Partial<Trade>[]>([]);
  const [format, setFormat] = useState("");
  const [filename, setFilename] = useState("");
  const [rawCount, setRawCount] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [debug, setDebug] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [mergeNote, setMergeNote] = useState("");
  const [priorPnl, setPriorPnl] = useState("0");
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("idle"); setParsed([]); setFormat(""); setFilename("");
    setRawCount(0); setErrors([]); setDebug([]); setMergeNote(""); setPriorPnl("0");
  };
  const close = () => { setImportOpen(false); setTimeout(reset, 300); };

  // Process one or more files. If both a balance-history and order-history file
  // are provided, merge them for accurate PnL + entry times + hold duration.
  const processFiles = async (files: File[]) => {
    const texts = await Promise.all(files.map(f => f.text().then(t => ({ name: f.name, text: t }))));

    // Identify which file is which by content
    let balanceFile: { name: string; text: string } | null = null;
    let orderFile: { name: string; text: string } | null = null;
    for (const f of texts) {
      const head = f.text.slice(0, 500).toLowerCase();
      if (head.includes("realized pnl") && head.includes("action")) balanceFile = f;
      else if (head.includes("fill price") || (head.includes("status") && head.includes("side"))) orderFile = f;
    }

    // Case 1: both files - merge
    if (balanceFile && orderFile) {
      const balResult = parseCSV(balanceFile.text);
      const fills = extractOrderFills(orderFile.text);
      const merged = mergeBalanceAndOrders(balResult.trades, fills);
      const withHold = merged.filter(t => t.holdTimeSeconds).length;
      setParsed(merged);
      setFormat("MERGED (balance + orders)");
      setFilename(`${balanceFile.name} + ${orderFile.name}`);
      setRawCount(balResult.rawRowCount);
      setErrors(balResult.errors);
      setDebug(balResult.debug || []);
      setMergeNote(`✓ Merged: exact P&L from balance history + entry times from order history (${withHold}/${merged.length} trades got accurate hold times)`);
      setStep("preview");
      return;
    }

    // Case 2: single file - normal parse
    const first = texts[0];
    const result = parseCSV(first.text);
    setParsed(result.trades);
    setFormat(result.format);
    setFilename(first.name);
    setRawCount(result.rawRowCount);
    setErrors(result.errors);
    setDebug(result.debug || []);
    if (result.format === "TRADINGVIEW_BALANCE") {
      setMergeNote("💡 Tip: Also upload the order-history CSV together to get accurate entry times & hold durations.");
    } else {
      setMergeNote("");
    }
    setStep("preview");
  };

  const handleFiles = (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => /\.(csv|txt|tsv)$/i.test(f.name));
    if (arr.length) processFiles(arr);
  };

  const doImport = () => {
    const enriched: Trade[] = parsed.map((t, i) => {
      const { grossPnl, netPnl, rMultiple } = calculateTradePnl(t);
      const hold = t.exitTime && t.entryTime
        ? Math.round((new Date(t.exitTime).getTime() - new Date(t.entryTime).getTime()) / 1000)
        : null;
      return {
        id: `imp_${Date.now()}_${i}`,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        ticker: t.ticker || "UNKNOWN", assetClass: t.assetClass || "STOCK",
        side: t.side || "LONG", status: t.status || "CLOSED",
        entryPrice: t.entryPrice || 0, exitPrice: t.exitPrice ?? null,
        quantity: t.quantity || 1,
        entryTime: t.entryTime || new Date().toISOString(), exitTime: t.exitTime ?? null,
        fees: t.fees || 0, commissions: t.commissions || 0,
        grossPnl: t.grossPnl ?? grossPnl, netPnl: t.netPnl ?? netPnl, rMultiple: t.rMultiple ?? rMultiple,
        riskReward: null, holdTimeSeconds: hold,
        stopLoss: null, takeProfit: null, riskAmount: null,
        strategy: t.strategy ?? null, setup: null, timeframe: null,
        notes: t.notes ?? null, emotions: [], tags: [], rating: null,
        favorite: false, reviewLater: false, screenshots: [], customFields: {},
      };
    });
    const capped = enriched.slice(0, MAX_IMPORT);
    addTrades(capped);
    addAccountTrades(activeAccountId, capped);

    // If user specified prior PnL (trades not in this export), add a synthetic entry
    const prior = parseFloat(priorPnl) || 0;
    if (Math.abs(prior) > 0) {
      const synth: Trade = {
        id: `prior_${Date.now()}`,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        ticker: "PRIOR_HISTORY", assetClass: "FUTURES",
        side: prior >= 0 ? "LONG" : "SHORT", status: "CLOSED",
        entryPrice: 0, exitPrice: null, quantity: 1,
        entryTime: new Date(new Date(enriched[0]?.entryTime || new Date()).getTime() - 86400000).toISOString(),
        exitTime: new Date(new Date(enriched[0]?.entryTime || new Date()).getTime() - 86400000).toISOString(),
        fees: 0, commissions: 0,
        grossPnl: prior, netPnl: prior, rMultiple: null, riskReward: null,
        holdTimeSeconds: null, stopLoss: null, takeProfit: null, riskAmount: null,
        strategy: "Prior History", setup: null, timeframe: null,
        notes: `Prior trading history not included in CSV export (${prior >= 0 ? "+" : ""}$${prior.toFixed(2)})`,
        emotions: [], tags: ["prior-history"], rating: null,
        favorite: false, reviewLater: false, screenshots: [], customFields: {},
        manualPnl: prior,
      } as Trade;
      addTrades([synth]);
      addAccountTrades(activeAccountId, [synth]);
    }

    setStep("done");
  };

  if (!importOpen) return null;

  const S = {
    overlay: { position:"fixed" as const, inset:0, zIndex:9999, background:"rgba(0,0,0,0.85)", backdropFilter:"blur(10px)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 },
    modal: { width:"100%", maxWidth:580, background:"#0f1318", border:"1px solid rgba(255,255,255,0.09)", borderRadius:18, boxShadow:"0 40px 80px rgba(0,0,0,0.9)", overflow:"hidden" },
    header: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 22px", borderBottom:"1px solid rgba(255,255,255,0.06)" },
    body: { padding:22 },
    dz: (drag: boolean) => ({ border:`2px dashed ${drag?"#00d4ff":"rgba(255,255,255,0.1)"}`, borderRadius:14, padding:"44px 24px", textAlign:"center" as const, cursor:"pointer", background:drag?"rgba(0,212,255,0.04)":"rgba(255,255,255,0.015)", transition:"all 0.15s" }),
    btn: (primary: boolean) => ({ height:38, padding:"0 20px", borderRadius:10, border:"none", cursor:"pointer", fontSize:13, fontWeight:700, background:primary?"linear-gradient(135deg,#00d4ff,#0099cc)":"rgba(255,255,255,0.06)", color:primary?"#000":"#8b949e", boxShadow:primary?"0 0 16px rgba(0,212,255,0.25)":"none" }),
    pill: (color: string, bg: string) => ({ padding:"2px 8px", borderRadius:20, fontSize:10, fontWeight:700, background:bg, color }),
    row: { borderTop:"1px solid rgba(255,255,255,0.04)", display:"grid", gridTemplateColumns:"1.2fr 0.8fr 1fr 1fr 0.8fr 1fr" },
    cell: { padding:"7px 10px", fontSize:12 },
  };

  return (
    <div style={S.overlay} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div style={S.modal}>
        <div style={S.header}>
          <div>
            <div style={{ fontWeight:700, fontSize:15, color:"#e6edf3" }}>Import Trades</div>
            <div style={{ fontSize:11, color:"#484f58", marginTop:1 }}>Auto-detect · TradingView · Webull · IBKR · NinjaTrader · Generic</div>
          </div>
          <button onClick={close} style={{ width:26, height:26, borderRadius:8, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.08)", color:"#6e7681", cursor:"pointer", fontSize:16 }}>×</button>
        </div>

        <div style={S.body}>
          {step === "idle" && (
            <>
              <div
                style={S.dz(dragging)}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); }}
                onClick={() => inputRef.current?.click()}
              >
                <div style={{ fontSize:36, marginBottom:10 }}>📂</div>
                <div style={{ fontSize:15, fontWeight:600, color:"#e6edf3", marginBottom:5 }}>Drop your CSV here</div>
                <div style={{ fontSize:12, color:"#6e7681", marginBottom:8 }}>or click to browse · select multiple files to merge</div>
                <div style={{ fontSize:11, color:"#ffab00", background:"rgba(255,171,0,0.06)", border:"1px solid rgba(255,171,0,0.15)", borderRadius:8, padding:"8px 12px", marginBottom:12, lineHeight:1.6, textAlign:"left" as const }}>
                  ⚠️ <strong>TradingView paper trading exports are limited to ~50 most recent closed trades.</strong> If you have more history, use the "Prior P&L" field on the next screen to add the missing amount.
                </div>
                <div style={{ fontSize:11, color:"#00d4ff", marginBottom:18 }}>💡 TradingView: upload balance-history + order-history together for perfect accuracy</div>
                <div style={{ display:"flex", gap:5, justifyContent:"center", flexWrap:"wrap" }}>
                  {["TradingView","Webull","IBKR","NinjaTrader","ThinkorSwim","Generic"].map((b) => (
                    <span key={b} style={{ padding:"3px 9px", borderRadius:20, fontSize:10, fontWeight:600, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", color:"#484f58" }}>{b}</span>
                  ))}
                </div>
              </div>
              <input ref={inputRef} type="file" accept=".csv,.txt,.tsv" multiple style={{ display:"none" }} onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); }} />
              <div style={{ marginTop:12, fontSize:11, color:"#484f58", textAlign:"center" }}>
                Trades save to your browser automatically — no account needed
              </div>
            </>
          )}

          {step === "preview" && (
            <>
              {/* Status bar */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:8 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:12, color:"#8b949e" }}>📄 {filename}</span>
                  <span style={S.pill("#00d4ff","rgba(0,212,255,0.1)")}>{format}</span>
                  <span style={S.pill("#484f58","rgba(255,255,255,0.04)")}>{rawCount} raw rows</span>
                </div>
                <span style={{ fontSize:13, fontWeight:700, color: parsed.length > 0 ? "#3fb950" : "#f85149" }}>
                  {parsed.length > 0 ? `✓ ${parsed.length} trades found` : "⚠ 0 trades — see below"}
                </span>
              </div>

              {/* Debug info if 0 trades */}
              {parsed.length === 0 && (
                <div style={{ padding:14, borderRadius:10, background:"rgba(248,81,73,0.06)", border:"1px solid rgba(248,81,73,0.15)", marginBottom:14, fontSize:12, color:"#f85149" }}>
                  <div style={{ fontWeight:700, marginBottom:6 }}>Could not parse trades from this file.</div>
                  <div style={{ color:"#8b949e", marginBottom:4 }}>Detected format: <strong style={{color:"#e6edf3"}}>{format}</strong> · Raw rows found: <strong style={{color:"#e6edf3"}}>{rawCount}</strong></div>
                  {errors.length > 0 && <div style={{ color:"#8b949e" }}>Errors: {errors.join(" · ")}</div>}
                  <div style={{ marginTop:8, color:"#8b949e" }}>
                    Please paste the first 2–3 lines of your CSV file in chat and we can fix the parser.
                  </div>
                  {debug.length > 0 && (
                    <div style={{ marginTop:10, padding:10, borderRadius:7, background:"rgba(0,0,0,0.4)", fontSize:10, fontFamily:"monospace", color:"#484f58", lineHeight:1.6 }}>
                      {debug.map((d,i) => <div key={i}>{d}</div>)}
                    </div>
                  )}
                </div>
              )}

              {/* Merge / tip note */}
              {mergeNote && (
                <div style={{ padding:"10px 14px", borderRadius:9, background:mergeNote.startsWith("✓")?"rgba(63,185,80,0.08)":"rgba(0,212,255,0.06)", border:`1px solid ${mergeNote.startsWith("✓")?"rgba(63,185,80,0.2)":"rgba(0,212,255,0.15)"}`, marginBottom:12, fontSize:12, color:mergeNote.startsWith("✓")?"#3fb950":"#00d4ff", lineHeight:1.6 }}>
                  {mergeNote}
                </div>
              )}

              {/* Errors */}
              {errors.length > 0 && parsed.length > 0 && (
                <div style={{ padding:10, borderRadius:8, background:"rgba(245,166,35,0.06)", border:"1px solid rgba(245,166,35,0.15)", marginBottom:12, fontSize:11, color:"#f5a623" }}>
                  ⚠ {errors[0]}
                </div>
              )}

              {/* Preview table */}
              {parsed.length > 0 && (
                <div style={{ borderRadius:10, border:"1px solid rgba(255,255,255,0.07)", overflow:"hidden", marginBottom:14 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"1.2fr 0.7fr 1fr 1fr 0.8fr 1fr 28px", background:"rgba(255,255,255,0.03)", padding:"0" }}>
                    {["Ticker","Side","Entry","Exit","Qty","P&L",""].map((h) => (
                      <div key={h} style={{ padding:"8px 10px", fontSize:10, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.06em", color:"#484f58" }}>{h}</div>
                    ))}
                  </div>
                  <div style={{ maxHeight:320, overflowY:"auto" }}>
                    {parsed.map((t,i) => {
                      const pnl = t.netPnl ?? 0;
                      return (
                        <div key={i} style={{...S.row, gridTemplateColumns:"1.2fr 0.7fr 1fr 1fr 0.8fr 1fr 28px"}}>
                          <div style={{ ...S.cell, fontWeight:700, color:"#e6edf3", fontFamily:"monospace" }}>{t.ticker}</div>
                          <div style={S.cell}><span style={S.pill(t.side==="LONG"?"#3fb950":"#f85149", t.side==="LONG"?"rgba(63,185,80,0.1)":"rgba(248,81,73,0.1)")}>{t.side||"LONG"}</span></div>
                          <div style={{ ...S.cell, fontFamily:"monospace", color:"#8b949e" }}>{t.entryPrice?.toFixed(2)||"–"}</div>
                          <div style={{ ...S.cell, fontFamily:"monospace", color:"#6e7681" }}>{t.exitPrice?.toFixed(2)||"open"}</div>
                          <div style={{ ...S.cell, color:"#6e7681" }}>{t.quantity}</div>
                          <div style={{ ...S.cell, fontFamily:"monospace", fontWeight:700, color:pnl>=0?"#3fb950":"#f85149" }}>{fmt$(pnl)}</div>
                          <div style={{ ...S.cell, padding:"6px 4px" }}>
                            <button onClick={() => setParsed(prev => prev.filter((_,j) => j !== i))}
                              style={{ width:20, height:20, borderRadius:"50%", border:"none", background:"rgba(255,23,68,0.15)", color:"#f85149", cursor:"pointer", fontSize:10, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900 }}>✕</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {parsed.length > 0 && (
                <div style={{ padding:"12px 14px", background:"rgba(255,171,0,0.06)", border:"1px solid rgba(255,171,0,0.15)", borderRadius:10, marginBottom:4 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#ffab00", marginBottom:5 }}>Missing older trades from this export?</div>
                  <div style={{ fontSize:11, color:"#6b7280", marginBottom:8 }}>TradingView sometimes only exports recent history. Enter any prior P&L here to keep your dashboard accurate.</div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:12, color:"#8b949e", flexShrink:0 }}>Prior P&L ($)</span>
                    <input type="number" value={priorPnl} onChange={e => setPriorPnl(e.target.value)} placeholder="e.g. 5825"
                      style={{ flex:1, height:32, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:7, color:"#f0f6fc", fontSize:12, padding:"0 10px", outline:"none", fontFamily:"monospace" }}/>
                    <span style={{ fontSize:10, color:"#4b5563" }}>0 = export is complete</span>
                  </div>
                </div>
              )}
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={() => setStep("idle")} style={S.btn(false)}>← Back</button>
                {parsed.length > 0 && (
                  <button onClick={doImport} style={{ ...S.btn(true), flex:1 }}>
                    Import {parsed.length} Trades →
                  </button>
                )}
              </div>
            </>
          )}

          {step === "done" && (
            <div style={{ textAlign:"center", padding:"28px 0" }}>
              <div style={{ fontSize:52, marginBottom:12 }}>✅</div>
              <div style={{ fontSize:18, fontWeight:700, color:"#e6edf3", marginBottom:6 }}>Import Complete</div>
              <div style={{ fontSize:13, color:"#8b949e", marginBottom:4 }}>{parsed.length} trades added</div>
              <div style={{ fontSize:11, color:"#484f58", marginBottom:22 }}>Auto-saved · persists when you close the tab</div>
              <button onClick={close} style={{ ...S.btn(true), padding:"0 36px" }}>View Dashboard →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
