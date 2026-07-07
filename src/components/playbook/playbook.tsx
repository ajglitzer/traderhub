"use client";
import { useState } from "react";
import { useStore } from "@/store";
import { PlaybookEntry } from "@/types/trade";

function empty(): PlaybookEntry {
  return { id:Date.now().toString(), name:"", description:"", rules:[""], entryTriggers:"", exitRules:"", timeframes:"", screenshotUrl:"", tags:[], createdAt:new Date().toISOString() };
}

function Panel({ children, p=16 }: { children:React.ReactNode; p?:number }) {
  return <div style={{ background:"linear-gradient(160deg,#0f1520,#0b1017)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:p }}>{children}</div>;
}

function Label({ children }: { children:React.ReactNode }) {
  return <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase" as const, letterSpacing:"0.08em", color:"#3d4551", marginBottom:6 }}>{children}</div>;
}

const IS = { width:"100%", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, color:"#d1d5db", fontSize:13, padding:"8px 12px", outline:"none", fontFamily:"inherit" };

export default function PlaybookPage() {
  const { playbook, addPlaybookEntry, updatePlaybookEntry, deletePlaybookEntry } = useStore();
  const [editing, setEditing] = useState<PlaybookEntry|null>(null);
  const [viewing, setViewing] = useState<PlaybookEntry|null>(null);

  const save = () => {
    if (!editing) return;
    if (playbook.find(e => e.id === editing.id)) updatePlaybookEntry(editing.id, editing);
    else addPlaybookEntry(editing);
    setEditing(null);
  };

  return (
    <div style={{ padding:20, overflowY:"auto", height:"100%", display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <h2 style={{ fontSize:16, fontWeight:800, color:"#f0f6fc", letterSpacing:"-0.02em" }}>Trading Playbook</h2>
          <p style={{ fontSize:11, color:"#4b5563", marginTop:2 }}>Save your best setups, rules, and entry criteria</p>
        </div>
        <button onClick={() => setEditing(empty())} style={{ height:34, padding:"0 16px", borderRadius:10, background:"linear-gradient(135deg,#00e5ff,#0088bb)", border:"none", color:"#000", fontSize:12, fontWeight:800, cursor:"pointer", boxShadow:"0 0 16px rgba(0,229,255,0.25)" }}>
          + New Setup
        </button>
      </div>

      {playbook.length === 0 && (
        <Panel p={48}>
          <div style={{ textAlign:"center" as const }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
            <div style={{ fontSize:14, fontWeight:700, color:"#f0f6fc", marginBottom:8 }}>No setups yet</div>
            <div style={{ fontSize:13, color:"#4b5563", marginBottom:20 }}>Document your trading strategies so you can reference them before taking a trade</div>
            <button onClick={()=>setEditing(empty())} style={{ height:36, padding:"0 20px", borderRadius:10, background:"linear-gradient(135deg,#00e5ff,#0088bb)", border:"none", color:"#000", fontSize:13, fontWeight:800, cursor:"pointer" }}>Create First Setup</button>
          </div>
        </Panel>
      )}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:12 }}>
        {playbook.map(entry => (
          <Panel key={entry.id} p={18}>
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:10 }}>
              <div>
                <div style={{ fontSize:14, fontWeight:800, color:"#f0f6fc", marginBottom:4 }}>{entry.name || "Unnamed Setup"}</div>
                <div style={{ fontSize:11, color:"#4b5563" }}>{entry.timeframes || "All timeframes"}</div>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                <button onClick={()=>setViewing(entry)} style={{ width:28, height:28, borderRadius:7, background:"rgba(0,229,255,0.08)", border:"1px solid rgba(0,229,255,0.2)", color:"#00e5ff", cursor:"pointer", fontSize:12 }}>👁</button>
                <button onClick={()=>setEditing({...entry})} style={{ width:28, height:28, borderRadius:7, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", color:"#6b7280", cursor:"pointer", fontSize:12 }}>✎</button>
                <button onClick={()=>{ if(confirm("Delete this setup?")) deletePlaybookEntry(entry.id); }} style={{ width:28, height:28, borderRadius:7, background:"rgba(255,23,68,0.06)", border:"1px solid rgba(255,23,68,0.15)", color:"#f87171", cursor:"pointer", fontSize:12 }}>🗑</button>
              </div>
            </div>
            <p style={{ fontSize:12, color:"#6b7280", lineHeight:1.6, marginBottom:10 }}>{entry.description || "No description"}</p>
            {entry.rules.filter(Boolean).length > 0 && (
              <div style={{ marginBottom:10 }}>
                {entry.rules.filter(Boolean).slice(0,3).map((rule,i) => (
                  <div key={i} style={{ display:"flex", gap:6, fontSize:11, color:"#8b949e", marginBottom:3 }}>
                    <span style={{ color:"#00e5ff", flexShrink:0 }}>▸</span>{rule}
                  </div>
                ))}
                {entry.rules.filter(Boolean).length > 3 && <div style={{ fontSize:10, color:"#374151", marginTop:2 }}>+{entry.rules.filter(Boolean).length-3} more rules</div>}
              </div>
            )}
            {entry.tags.length > 0 && (
              <div style={{ display:"flex", gap:5, flexWrap:"wrap" as const }}>
                {entry.tags.map(tag => (
                  <span key={tag} style={{ padding:"2px 8px", borderRadius:20, fontSize:10, fontWeight:600, background:"rgba(0,229,255,0.08)", border:"1px solid rgba(0,229,255,0.15)", color:"#00e5ff" }}>{tag}</span>
                ))}
              </div>
            )}
          </Panel>
        ))}
      </div>

      {/* Edit modal */}
      {editing && (
        <div onClick={e=>{if(e.target===e.currentTarget)setEditing(null);}} style={{ position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}>
          <div style={{ width:"100%",maxWidth:620,background:"linear-gradient(160deg,#0f1520,#0b1017)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:18,overflow:"hidden",maxHeight:"90vh",display:"flex",flexDirection:"column" as const }}>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)",background:"rgba(0,0,0,0.3)",flexShrink:0 }}>
              <span style={{ fontSize:14,fontWeight:800,color:"#f0f6fc" }}>{editing.name||"New Setup"}</span>
              <button onClick={()=>setEditing(null)} style={{ width:28,height:28,borderRadius:8,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",color:"#4b5563",cursor:"pointer",fontSize:17,display:"flex",alignItems:"center",justifyContent:"center" }}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.1)";(e.currentTarget as HTMLElement).style.color="#c9d1d9";}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background="rgba(255,255,255,0.05)";(e.currentTarget as HTMLElement).style.color="#4b5563";}}>×</button>
            </div>
            <div style={{ flex:1,overflowY:"auto",padding:20,display:"flex",flexDirection:"column" as const,gap:14 }}>
              <div><Label>Setup Name</Label><input value={editing.name} onChange={e=>setEditing(v=>v?{...v,name:e.target.value}:v)} placeholder="e.g. VWAP Bounce, Opening Range Breakout" style={{...IS,height:36,padding:"0 12px"}}/></div>
              <div><Label>Description</Label><textarea value={editing.description} onChange={e=>setEditing(v=>v?{...v,description:e.target.value}:v)} rows={3} placeholder="What is this setup? When does it work best?" style={{...IS,resize:"vertical" as const}}/></div>
              <div>
                <Label>Rules (one per line)</Label>
                {editing.rules.map((rule,i)=>(
                  <div key={i} style={{display:"flex",gap:6,marginBottom:6}}>
                    <input value={rule} onChange={e=>{const r=[...editing.rules];r[i]=e.target.value;setEditing(v=>v?{...v,rules:r}:v);}} placeholder={`Rule ${i+1}...`} style={{...IS,flex:1,height:34,padding:"0 10px"}}/>
                    <button onClick={()=>setEditing(v=>v?{...v,rules:v.rules.filter((_,j)=>j!==i)}:v)} style={{width:34,height:34,borderRadius:7,background:"rgba(255,23,68,0.08)",border:"1px solid rgba(255,23,68,0.15)",color:"#f87171",cursor:"pointer",fontSize:14}}>×</button>
                  </div>
                ))}
                <button onClick={()=>setEditing(v=>v?{...v,rules:[...v.rules,""]}:v)} style={{height:30,padding:"0 12px",borderRadius:7,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:"#6b7280",cursor:"pointer",fontSize:12}}>+ Add rule</button>
              </div>
              <div><Label>Entry Triggers</Label><textarea value={editing.entryTriggers} onChange={e=>setEditing(v=>v?{...v,entryTriggers:e.target.value}:v)} rows={2} placeholder="What signals do you need to enter?" style={{...IS,resize:"vertical" as const}}/></div>
              <div><Label>Exit Rules</Label><textarea value={editing.exitRules} onChange={e=>setEditing(v=>v?{...v,exitRules:e.target.value}:v)} rows={2} placeholder="When do you take profit or cut losses?" style={{...IS,resize:"vertical" as const}}/></div>
              <div><Label>Timeframes</Label><input value={editing.timeframes} onChange={e=>setEditing(v=>v?{...v,timeframes:e.target.value}:v)} placeholder="e.g. 1m, 5m, 15m" style={{...IS,height:36,padding:"0 12px"}}/></div>
              <div><Label>Screenshot/Chart URL</Label><input value={editing.screenshotUrl} onChange={e=>setEditing(v=>v?{...v,screenshotUrl:e.target.value}:v)} placeholder="https://..." style={{...IS,height:36,padding:"0 12px"}}/></div>
              <div>
                <Label>Tags</Label>
                <input value={editing.tags.join(", ")} onChange={e=>setEditing(v=>v?{...v,tags:e.target.value.split(",").map(t=>t.trim()).filter(Boolean)}:v)} placeholder="breakout, momentum, futures" style={{...IS,height:36,padding:"0 12px"}}/>
              </div>
            </div>
            <div style={{ display:"flex",gap:8,padding:"12px 20px",borderTop:"1px solid rgba(255,255,255,0.05)",background:"rgba(0,0,0,0.2)",flexShrink:0 }}>
              <button onClick={()=>setEditing(null)} style={{ flex:1,height:34,borderRadius:8,border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.04)",color:"#6b7280",cursor:"pointer",fontSize:12 }}>Cancel</button>
              <button onClick={save} style={{ flex:2,height:34,borderRadius:8,border:"none",background:"linear-gradient(135deg,#00e5ff,#0088bb)",color:"#000",cursor:"pointer",fontSize:12,fontWeight:700 }}>Save Setup</button>
            </div>
          </div>
        </div>
      )}

      {/* View modal */}
      {viewing && (
        <div onClick={e=>{if(e.target===e.currentTarget)setViewing(null);}} style={{ position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}>
          <div style={{ width:"100%",maxWidth:560,background:"linear-gradient(160deg,#0f1520,#0b1017)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:18,overflow:"hidden",maxHeight:"85vh",display:"flex",flexDirection:"column" as const }}>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px",borderBottom:"1px solid rgba(255,255,255,0.06)",background:"rgba(0,0,0,0.3)",flexShrink:0 }}>
              <span style={{ fontSize:15,fontWeight:800,color:"#f0f6fc" }}>{viewing.name}</span>
              <button onClick={()=>setViewing(null)} style={{ width:28,height:28,borderRadius:8,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",color:"#4b5563",cursor:"pointer",fontSize:17,display:"flex",alignItems:"center",justifyContent:"center" }}>×</button>
            </div>
            <div style={{ flex:1,overflowY:"auto",padding:20,display:"flex",flexDirection:"column" as const,gap:14 }}>
              {viewing.description && <p style={{ fontSize:13,color:"#8b949e",lineHeight:1.7 }}>{viewing.description}</p>}
              {viewing.rules.filter(Boolean).length>0 && <div><Label>Rules</Label>{viewing.rules.filter(Boolean).map((r,i)=><div key={i} style={{ display:"flex",gap:8,fontSize:13,color:"#c9d1d9",marginBottom:6 }}><span style={{color:"#00e5ff",flexShrink:0}}>▸</span>{r}</div>)}</div>}
              {viewing.entryTriggers && <div><Label>Entry Triggers</Label><p style={{fontSize:13,color:"#c9d1d9",lineHeight:1.7}}>{viewing.entryTriggers}</p></div>}
              {viewing.exitRules && <div><Label>Exit Rules</Label><p style={{fontSize:13,color:"#c9d1d9",lineHeight:1.7}}>{viewing.exitRules}</p></div>}
              {viewing.timeframes && <div><Label>Timeframes</Label><p style={{fontSize:13,color:"#c9d1d9"}}>{viewing.timeframes}</p></div>}
              {viewing.screenshotUrl && <div><Label>Chart Reference</Label><a href={viewing.screenshotUrl} target="_blank" rel="noreferrer" style={{fontSize:12,color:"#00e5ff"}}>Open chart ↗</a></div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
