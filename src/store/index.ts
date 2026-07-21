import { create } from "zustand";
import { useAccountStore } from "./accounts";
import { persist, subscribeWithSelector } from "zustand/middleware";
import { Trade, DailyGoal, PlaybookEntry } from "@/types/trade";

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

  // Chart replay appearance (persists across every replay, any symbol)
  chartReplayColors: { up:string; down:string; bg:string };
  setChartReplayColors: (c:{ up:string; down:string; bg:string })=>void;
  resetChartReplayColors: ()=>void;

  // Init
  init: ()=>void;
}

const DEFAULT_FILTERS = { status:"CLOSED", sortBy:"entryTime", sortDir:"desc" };
const DEFAULT_GOALS: DailyGoal = { dailyProfitTarget:500, dailyMaxLoss:250, weeklyProfitTarget:2000 };
const DEFAULT_CHART_REPLAY_COLORS = { up:"#26a69a", down:"#ef5350", bg:"#131722" };

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

        chartReplayColors: DEFAULT_CHART_REPLAY_COLORS,
        setChartReplayColors: (c)=>set({chartReplayColors:c}),
        resetChartReplayColors: ()=>set({chartReplayColors:DEFAULT_CHART_REPLAY_COLORS}),

        filters: DEFAULT_FILTERS,
        setFilters: (f)=>set(s=>({filters:{...s.filters,...f},page:1})),
        resetFilters: ()=>set({filters:DEFAULT_FILTERS,page:1}),
        page: 1, setPage: (p)=>set({page:p}),

        trades: [],
        setTrades: (trades)=>{ set({trades}); },
        addTrades: (newTrades)=>{
          const all=[...get().trades];
          const existing=new Set(all.map(t=>`${t.ticker}|${t.entryTime}|${t.quantity}`));
          const fresh=newTrades.filter(t=>!existing.has(`${t.ticker}|${t.entryTime}|${t.quantity}`));
          const merged=[...fresh,...all];
          set({trades:merged});
          // Extract and save new tags
          const tags=new Set(get().allTags);
          fresh.forEach(t=>(t.tags||[]).forEach(tag=>tags.add(tag)));
          set({allTags:[...tags]});
        },
        deleteTrade: (id)=>{
          const trades=get().trades.filter(t=>t.id!==id);
          set({trades}); 
        },
        updateTrade: (id,data)=>{
          const trades=get().trades.map(t=>t.id===id?{...t,...data,updatedAt:new Date().toISOString()}:t);
          set({trades}); 
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

        init: ()=>{
          // Apply saved theme
          document.documentElement.setAttribute("data-theme", get().theme);
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
        partialize:(s)=>({sidebarOpen:s.sidebarOpen,activeTab:s.activeTab,theme:s.theme,goals:s.goals,playbook:s.playbook,allTags:s.allTags,simShowLevels:s.simShowLevels,replayShowLevels:s.replayShowLevels,mobilePinnedIds:s.mobilePinnedIds,chartReplayColors:s.chartReplayColors}),
        merge: (persisted, current) => {
          const p = (persisted ?? {}) as Record<string, any>;
          return {
            ...current,
            ...p,
            filters:  { ...DEFAULT_FILTERS, ...(p.filters ?? {}) },
            page:     typeof p.page === "number" ? p.page : 1,
            trades:   Array.isArray(p.trades) ? p.trades : (current.trades ?? []),
            goals:    { ...current.goals, ...(p.goals ?? {}) },
            playbook: Array.isArray(p.playbook) ? p.playbook : (current.playbook ?? []),
            allTags:  Array.isArray(p.allTags)  ? p.allTags  : (current.allTags  ?? []),
            mobilePinnedIds: Array.isArray(p.mobilePinnedIds) && p.mobilePinnedIds.length
              ? p.mobilePinnedIds
              : (current.mobilePinnedIds ?? ["dashboard","trades","analytics","social"]),
            chartReplayColors: { ...DEFAULT_CHART_REPLAY_COLORS, ...(p.chartReplayColors ?? {}) },
          };
        },
      }
    )
  )
);

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
      chartReplayColors: { ...DEFAULT_CHART_REPLAY_COLORS, ...(s.chartReplayColors ?? {}) },
    });
  } catch {}
}

