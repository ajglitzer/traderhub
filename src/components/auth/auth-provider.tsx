"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { User } from "@supabase/supabase-js";

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
  const [loading, setLoading] = useState(hasSupabase); // only load if supabase configured

  useEffect(() => {
    if (!hasSupabase) return; // no supabase - stay not loading

    let mounted = true;

    import("@/lib/supabase").then(({ createClient }) => {
      const supabase = createClient();

      // Get existing session
      supabase.auth.getSession().then(({ data, error }) => {
        if (!mounted) return;
        if (error) console.error("[Auth] getSession error:", error.message);
        const sessionUser = data?.session?.user ?? null;
        setUser(sessionUser);
        setLoading(false);
        if (sessionUser) localStorage.setItem("th_current_user_id", sessionUser.id);
      }).catch(err => {
        if (!mounted) return;
        console.error("[Auth] getSession failed:", err);
        setLoading(false);
      });

      // Listen for changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!mounted) return;
        const newUser = session?.user ?? null;
        setUser(newUser);
        setLoading(false);
        // Scope accounts store to this user
        if (newUser) {
          localStorage.setItem("th_current_user_id", newUser.id);
        } else {
          localStorage.removeItem("th_current_user_id");
        }
      });

      return () => {
        mounted = false;
        subscription.unsubscribe();
      };
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
