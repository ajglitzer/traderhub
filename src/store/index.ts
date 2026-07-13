import { create } from "zustand";
import { useAccountStore } from "./accounts";
import { persist, subscribeWithSelector } from "zustand/middleware";
import { Trade, DailyGoal, PlaybookEntry } from "@/types/trade";
import { loadTrades, saveTrades } from "@/lib/persistence";

interface Store {
  // UI
  sidebarOpen: boolean; setSidebarOpen: (v:boolean)=>void;
  importOpen: boolean;  setImportOpen: (v:boolean)=>void;
  activeTab: string;    setActiveTab: (t:string)=>void;
  theme: "dark"|"light"; setTheme: (t:"dark"|"light")=>void;
  communityBadge: number; setCommunityBadge: (v:number)=>void;

  // Filters
  filters: Record<string,string>;
  setFilters: (f:Record<string,string>)=>void;
  resetFilters: ()=>void;
  page: number; setPage: (p:number)=>void;

  // Trades
  trades: Trade[];
  setTrades: (trades:Trade[])=>void;
  addTrades: (trades:Trade[])=>void;
  deleteTrade: (id:string)=>void;
  updateTrade: (id:string, data:Partial<Trade>)=>void;

  // Goals
  goals: DailyGoal;
  setGoals: (g:Partial<DailyGoal>)=>void;

  // Playbook
  playbook: PlaybookEntry[];
  addPlaybookEntry: (e:PlaybookEntry)=>void;
  updatePlaybookEntry: (id:string, data:Partial<PlaybookEntry>)=>void;
  deletePlaybookEntry: (id:string)=>void;

  // Tags (global list for autocomplete)
  allTags: string[];
  addTag: (tag:string)=>void;

  // Simulator settings
  simShowLevels: boolean; setSimShowLevels: (v:boolean)=>void;
  mobilePinnedIds: string[]; setMobilePinnedIds: (ids:string[])=>void;
  replayShowLevels: boolean; setReplayShowLevels: (v:boolean)=>void;

  // Init
  initialized: boolean;
  init: ()=>void;
}

const DEFAULT_FILTERS = { status:"CLOSED", sortBy:"entryTime", sortDir:"desc" };
const DEFAULT_GOALS: DailyGoal = { dailyProfitTarget:500, dailyMaxLoss:250, weeklyProfitTarget:2000 };

export const useStore = create<Store>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        sidebarOpen: true, setSidebarOpen: (v)=>set({sidebarOpen:v}),
        importOpen: false,  setImportOpen:  (v)=>set({importOpen:v}),
        activeTab: "dashboard", setActiveTab: (t)=>set({activeTab:t}),
        theme: "dark", setTheme: (t)=>{ set({theme:t}); if(typeof document!=="undefined") document.documentElement.setAttribute("data-theme",t); },
        communityBadge: 0, setCommunityBadge: (v)=>set({communityBadge:v}),
        simShowLevels: true, setSimShowLevels: (v)=>set({simShowLevels:v}),
        mobilePinnedIds: ["dashboard","trades","analytics","social"], setMobilePinnedIds: (ids)=>set({mobilePinnedIds:ids}),
        replayShowLevels: true, setReplayShowLevels: (v)=>set({replayShowLevels:v}),

        filters: DEFAULT_FILTERS,
        setFilters: (f)=>set(s=>({filters:{...s.filters,...f},page:1})),
        resetFilters: ()=>set({filters:DEFAULT_FILTERS,page:1}),
        page: 1, setPage: (p)=>set({page:p}),

        trades: [],
        setTrades: (trades)=>{ set({trades}); saveTrades(trades); },
        addTrades: (newTrades)=>{
          const all=[...get().trades];
          const existing=new Set(all.map(t=>`${t.ticker}|${t.entryTime}|${t.quantity}`));
          const fresh=newTrades.filter(t=>!existing.has(`${t.ticker}|${t.entryTime}|${t.quantity}`));
          const merged=[...fresh,...all];
          set({trades:merged}); saveTrades(merged);
          // Extract and save new tags
          const tags=new Set(get().allTags);
          fresh.forEach(t=>(t.tags||[]).forEach(tag=>tags.add(tag)));
          set({allTags:[...tags]});
        },
        deleteTrade: (id)=>{
          const trades=get().trades.filter(t=>t.id!==id);
          set({trades}); saveTrades(trades);
        },
        updateTrade: (id,data)=>{
          const trades=get().trades.map(t=>t.id===id?{...t,...data,updatedAt:new Date().toISOString()}:t);
          set({trades}); saveTrades(trades);
          if(data.tags){ const tags=new Set(get().allTags); (data.tags||[]).forEach(tag=>tags.add(tag)); set({allTags:[...tags]}); }
        },

        goals: DEFAULT_GOALS,
        setGoals: (g)=>set(s=>({goals:{...s.goals,...g}})),

        playbook: [],
        addPlaybookEntry: (e)=>set(s=>({playbook:[e,...s.playbook]})),
        updatePlaybookEntry: (id,data)=>set(s=>({playbook:s.playbook.map(e=>e.id===id?{...e,...data}:e)})),
        deletePlaybookEntry: (id)=>set(s=>({playbook:s.playbook.filter(e=>e.id!==id)})),

        allTags: ["breakout","reversal","trend","scalp","VWAP bounce","gap fill","momentum","news play","support","resistance"],
        addTag: (tag)=>set(s=>({allTags:[...new Set([...s.allTags,tag])]})),

        initialized: false,
        init: ()=>{
          if(get().initialized) return;
          const saved=loadTrades();
          set({trades:saved,initialized:true});
          const handler=()=>{ if(!(window as any).__TRADERHUB_CLEARING__) saveTrades(get().trades); };
          window.addEventListener("beforeunload",handler);
          document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="hidden" && !(window as any).__TRADERHUB_CLEARING__) saveTrades(get().trades); });
          // Apply saved theme
          document.documentElement.setAttribute("data-theme", get().theme);
          // Sync legacy trades into accounts store so analytics can read them
          if(saved.length>0){
            try{
              const { useAccountStore } = require("@/store/accounts");
              const accStore = useAccountStore.getState();
              const existing = accStore.getActiveTrades();
              if(existing.length===0){
                accStore.addAccountTrades(accStore.activeAccountId, saved);
              }
            }catch{}
          }
        },
      }),
      {
        name:"tv-ui-store",
        storage: {
          getItem: (key: string) => {
            try {
              const uid = localStorage.getItem("th_current_user_id") || "";
              const k = uid ? `${key}__${uid}` : key;
              const raw = localStorage.getItem(k);
              return raw ? JSON.parse(raw) : null;
            } catch { return null; }
          },
          setItem: (key: string, value: unknown) => {
            try {
              const uid = localStorage.getItem("th_current_user_id") || "";
              const k = uid ? `${key}__${uid}` : key;
              localStorage.setItem(k, JSON.stringify(value));
            } catch {}
          },
          removeItem: (key: string) => {
            try {
              const uid = localStorage.getItem("th_current_user_id") || "";
              const k = uid ? `${key}__${uid}` : key;
              localStorage.removeItem(k);
            } catch {}
          },
        },
        partialize:(s)=>({sidebarOpen:s.sidebarOpen,activeTab:s.activeTab,theme:s.theme,goals:s.goals,playbook:s.playbook,allTags:s.allTags,simShowLevels:s.simShowLevels,replayShowLevels:s.replayShowLevels,mobilePinnedIds:s.mobilePinnedIds}),
        // partialize excludes filters/page/trades. Without an explicit merge,
        // rehydrate() replaces state with ONLY the persisted keys — leaving
        // filters/page undefined and crashing Trade Log on `filters.sortBy`.
        merge: (persisted, current) => {
          const p = (persisted ?? {}) as Record<string, any>;
          return {
            ...current,
            ...p,
            // Always keep these — they are never persisted
            filters:  { ...DEFAULT_FILTERS, ...(p.filters ?? {}) },
            page:     typeof p.page === "number" ? p.page : 1,
            trades:   Array.isArray(p.trades) ? p.trades : (current.trades ?? []),
            goals:    { ...current.goals, ...(p.goals ?? {}) },
            playbook: Array.isArray(p.playbook) ? p.playbook : (current.playbook ?? []),
            allTags:  Array.isArray(p.allTags)  ? p.allTags  : (current.allTags  ?? []),
            mobilePinnedIds: Array.isArray(p.mobilePinnedIds) && p.mobilePinnedIds.length
              ? p.mobilePinnedIds
              : (current.mobilePinnedIds ?? ["dashboard","trades","analytics","social"]),
          };
        },
      }
    )
  )
);

/** Re-read the UI store for a specific user. Call after th_current_user_id is set. */
export function reloadUIStore(userId: string) {
  if (!userId) return;
  try {
    const raw = localStorage.getItem(`tv-ui-store__${userId}`);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const s = parsed?.state ?? parsed;
    useStore.setState({
      theme:            s.theme ?? "dark",
      goals:            { ...DEFAULT_GOALS, ...(s.goals ?? {}) },
      playbook:         Array.isArray(s.playbook) ? s.playbook : [],
      allTags:          Array.isArray(s.allTags)  ? s.allTags  : [],
      simShowLevels:    s.simShowLevels    ?? true,
      replayShowLevels: s.replayShowLevels ?? true,
      mobilePinnedIds:  Array.isArray(s.mobilePinnedIds) && s.mobilePinnedIds.length
        ? s.mobilePinnedIds
        : ["dashboard","trades","analytics","social"],
    });
  } catch {}
}

export function getFilteredTrades(trades:Trade[], filters:Record<string,string>, page:number, limit=50) {
  let list=[...trades];
  if(filters.status)     list=list.filter(t=>t.status===filters.status);
  if(filters.ticker)     list=list.filter(t=>t.ticker.includes(filters.ticker.toUpperCase()));
  if(filters.side)       list=list.filter(t=>t.side===filters.side);
  if(filters.assetClass) list=list.filter(t=>t.assetClass===filters.assetClass);
  if(filters.strategy)   list=list.filter(t=>t.strategy===filters.strategy);
  if(filters.tag)        list=list.filter(t=>(t.tags||[]).includes(filters.tag));
  const sortBy=(filters.sortBy||"entryTime") as keyof Trade;
  const dir=filters.sortDir==="asc"?1:-1;
  list.sort((a,b)=>{ const av=a[sortBy],bv=b[sortBy]; if(av==null)return 1; if(bv==null)return -1; return av>bv?dir:av<bv?-dir:0; });
  const total=list.length;
  const start=(page-1)*limit;
  return {trades:list.slice(start,start+limit),total,totalPages:Math.ceil(total/limit)};
}
