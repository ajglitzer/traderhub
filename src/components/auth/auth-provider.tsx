"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { User } from "@supabase/supabase-js";
import { loadFromCloud, useAccountStore } from "@/store/accounts";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  loading: true,
  signOut: async () => {},
});

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const hasSupabase = SUPABASE_URL.length > 0 && !SUPABASE_URL.includes("placeholder");

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(hasSupabase);

  useEffect(() => {
    if (!hasSupabase) return;
    let mounted = true;

    import("@/lib/supabase").then(({ createClient }) => {
      const supabase = createClient();

      supabase.auth.getSession().then(({ data, error }) => {
        if (!mounted) return;
        if (error) console.error("[Auth] getSession error:", error.message);
        const sessionUser = data?.session?.user ?? null;
        setUser(sessionUser);
        setLoading(false);
        if (sessionUser) {
          localStorage.setItem("th_current_user_id", sessionUser.id);
          // Load this user's scoped data
          const scopedKey2 = `tv-accounts-store-\${sessionUser.id}`;
          try {
            const saved2 = localStorage.getItem(scopedKey2);
            if (saved2) {
              const parsed2 = JSON.parse(saved2);
              if (parsed2?.state) useAccountStore.setState(parsed2.state);
            } else {
              useAccountStore.setState({ accounts:[{id:"default",name:"Main Account",startingBalance:10000,color:"#00e5ff",broker:"TraderHub",createdAt:new Date().toISOString()}], activeAccountId:"default", tradesByAccount:{} });
            }
          } catch {}
          loadFromCloud().then(trades => {
            if (!mounted || trades.length === 0) return;
            const store = useAccountStore.getState();
            const activeId = store.activeAccountId;
            if (activeId) store.setAccountTrades(activeId, trades);
          });
        }
      }).catch(err => {
        if (!mounted) return;
        console.error("[Auth] getSession failed:", err);
        setLoading(false);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!mounted) return;
        const newUser = session?.user ?? null;
        setUser(newUser);
        setLoading(false);
        if (newUser) {
          localStorage.setItem("th_current_user_id", newUser.id);
          if (_event === "SIGNED_IN") {
            // Directly load this user's data from localStorage
            const scopedKey = `tv-accounts-store-\${newUser.id}`;
            try {
              const saved = localStorage.getItem(scopedKey);
              if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed?.state) useAccountStore.setState(parsed.state);
              } else {
                // New user — reset to clean defaults
                useAccountStore.setState({ accounts:[{id:"default",name:"Main Account",startingBalance:10000,color:"#00e5ff",broker:"TraderHub",createdAt:new Date().toISOString()}], activeAccountId:"default", tradesByAccount:{} });
              }
            } catch {}
            // Then load cloud trades
            loadFromCloud().then(trades => {
              if (!mounted || trades.length === 0) return;
              const store = useAccountStore.getState();
              const activeId = store.activeAccountId;
              if (activeId) store.setAccountTrades(activeId, trades);
            });
          }
        } else {
          localStorage.removeItem("th_current_user_id");
          // Reset store on logout
          useAccountStore.setState({ accounts:[{id:"default",name:"Main Account",startingBalance:10000,color:"#00e5ff",broker:"TraderHub",createdAt:new Date().toISOString()}], activeAccountId:"default", tradesByAccount:{} });
        }
      });

      return () => { mounted = false; subscription.unsubscribe(); };
    });

    return () => { mounted = false; };
  }, []);

  const signOut = async () => {
    if (!hasSupabase) return;
    const { createClient } = await import("@/lib/supabase");
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, loading, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
