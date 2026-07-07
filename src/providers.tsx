"use client";
import { AuthProvider } from "@/components/auth/auth-provider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }));
  return (
    <AuthProvider>
      <QueryClientProvider client={qc}>
        {children}
      </QueryClientProvider>
    </AuthProvider>
  );
}
