import { create } from "zustand";
import { persist } from "zustand/middleware";

async function syncToCloud(trades: any[]) {
  try {
    await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trades }),
    });
  } catch {}
}

export async function loadFromCloud(): Promise<any[]> {
  try {
    const r = await fetch("/api/sync");
    const d = await r.json();
    return Array.isArray(d.trades) ? d.trades : [];
  } catch { return []; }
}

export async function deleteFromCloud(id: string) {
  try {
    await fetch("/api/sync", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  } catch {}
}
import { Trade } from "@/types/trade";
import { loadTrades, saveTrades } from "@/lib/persistence";

export interface Account {
  id: string;
  name: string;
  startingBalance: number;
  color: string;         // accent color for the tab
  broker: string;
  createdAt: string;
}

interface AccountStore {
  accounts: Account[];
  activeAccountId: string;

  addAccount: (a: Omit<Account, "id"|"createdAt">) => string;
  updateAccount: (id: string, data: Partial<Account>) => void;
  deleteAccount: (id: string) => void;
  setActiveAccount: (id: string) => void;

  // Per-account trade storage
  tradesByAccount: Record<string, Trade[]>;
  getActiveTrades: () => Trade[];
  setAccountTrades: (accountId: string, trades: Trade[]) => void;
  addAccountTrades: (accountId: string, newTrades: Trade[]) => void;
  deleteAccountTrade: (accountId: string, tradeId: string) => void;
  updateAccountTrade: (accountId: string, tradeId: string, data: Partial<Trade>) => void;
}

const DEFAULT_ACCOUNT: Account = {
  id: "default",
  name: "Main Account",
  startingBalance: 10000,
  color: "#00e5ff",
  broker: "TradingView Paper",
  createdAt: new Date().toISOString(),
};

const COLORS = ["#00e5ff","#00e676","#d500f9","#ffab00","#ff6b35","#f9a8d4","#6ee7b7","#93c5fd"];

export const useAccountStore = create<AccountStore>()(
  persist(
    (set, get) => ({
      accounts: [DEFAULT_ACCOUNT],
      activeAccountId: "default",

      addAccount: (a) => {
        const id = Date.now().toString();
        const account: Account = { ...a, id, createdAt: new Date().toISOString() };
        set(s => ({ accounts: [...s.accounts, account] }));
        return id;
      },

      updateAccount: (id, data) =>
        set(s => ({ accounts: s.accounts.map(a => a.id === id ? { ...a, ...data } : a) })),

      deleteAccount: (id) => {
        const { accounts, activeAccountId, tradesByAccount } = get();
        // Never allow deleting the last remaining account
        if (accounts.length <= 1) return;
        const remaining = accounts.filter(a => a.id !== id);
        const newActive = activeAccountId === id ? remaining[0]?.id || remaining[0].id : activeAccountId;
        const { [id]: _, ...restTrades } = tradesByAccount;
        set({ accounts: remaining, activeAccountId: newActive, tradesByAccount: restTrades });
      },

      setActiveAccount: (id) => set({ activeAccountId: id }),

      tradesByAccount: { default: [] },

      getActiveTrades: () => {
        const { activeAccountId, tradesByAccount } = get();
        return tradesByAccount[activeAccountId] || [];
      },

      setAccountTrades: (accountId, trades) =>
        set(s => ({ tradesByAccount: { ...s.tradesByAccount, [accountId]: trades } })),

      addAccountTrades: (accountId, newTrades) => {
        const existing = get().tradesByAccount[accountId] || [];
        const seen = new Set(existing.map(t => `${t.ticker}|${t.entryTime}|${t.quantity}`));
        const fresh = newTrades.filter(t => !seen.has(`${t.ticker}|${t.entryTime}|${t.quantity}`));
        const merged = [...fresh, ...existing];
        set(s => ({ tradesByAccount: { ...s.tradesByAccount, [accountId]: merged } }));
      },

      deleteAccountTrade: (accountId, tradeId) => {
        const trades = (get().tradesByAccount[accountId] || []).filter(t => t.id !== tradeId);
        set(s => ({ tradesByAccount: { ...s.tradesByAccount, [accountId]: trades } }));
      },

      updateAccountTrade: (accountId, tradeId, data) => {
        const trades = (get().tradesByAccount[accountId] || [])
          .map(t => t.id === tradeId ? { ...t, ...data, updatedAt: new Date().toISOString() } : t);
        set(s => ({ tradesByAccount: { ...s.tradesByAccount, [accountId]: trades } }));
      },
    }),
    {
      name: "tv-accounts-store",
      // Use a storage key scoped to the current user so trades don't bleed across accounts
      storage: {
        getItem: (key: string) => {
          try {
            // Try user-scoped key first
            let userId = "";
            try {
              const u = localStorage.getItem("th_current_user_id");
              if (u) userId = u;
              else {
                // Try Supabase session
                for (let i = 0; i < localStorage.length; i++) {
                  const k = localStorage.key(i);
                  if (k && k.includes("auth-token")) {
                    const v = localStorage.getItem(k);
                    if (v) { const j = JSON.parse(v); userId = j?.user?.id || ""; break; }
                  }
                }
              }
            } catch {}
            const scopedKey = userId ? `${key}-${userId}` : key;
            const val = userId ? localStorage.getItem(scopedKey) : localStorage.getItem(key);
            return val ? JSON.parse(val) : null;
          } catch { return null; }
        },
        setItem: (key: string, value: unknown) => {
          try {
            let userId = "";
            try { userId = localStorage.getItem("th_current_user_id") || ""; } catch {}
            const scopedKey = userId ? `${key}-${userId}` : key;
            localStorage.setItem(scopedKey, JSON.stringify(value));
          } catch {}
        },
        removeItem: (key: string) => {
          try {
            let userId = "";
            try { userId = localStorage.getItem("th_current_user_id") || ""; } catch {}
            const scopedKey = userId ? `${key}-${userId}` : key;
            localStorage.removeItem(scopedKey);
            localStorage.removeItem(key);
          } catch {}
        },
      },
    }
  )
);

export { COLORS as ACCOUNT_COLORS };
