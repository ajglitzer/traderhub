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
          // Re-hydrate store with this user's data
          if (useAccountStore.persist?.rehydrate) {
            useAccountStore.persist.rehydrate();
          }
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
            // Re-hydrate store with new user's localStorage data
            if (useAccountStore.persist?.rehydrate) {
              useAccountStore.persist.rehydrate();
            }
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
          // Clear in-memory store on logout so next user starts fresh
          if (useAccountStore.persist?.rehydrate) {
            setTimeout(()=>useAccountStore.persist.rehydrate(), 100);
          }
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
