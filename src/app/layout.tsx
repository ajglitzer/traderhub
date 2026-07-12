import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { ErrorBoundary } from "@/components/error-boundary";

export const metadata: Metadata = {
  title: "TraderHub — Professional Trading Journal",
  description: "Track, analyze, and improve your trading with TraderHub.",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
        <meta name="mobile-web-app-capable" content="yes"/>
        <meta name="apple-mobile-web-app-capable" content="yes"/>
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
        <meta name="theme-color" content="#060a0f"/>
      </head>
      <body className="antialiased">
        <Providers>
          <div style={{ display:"flex", height:"100dvh", overflow:"hidden", background:"var(--bg)" }}>
            <Sidebar />
            <div style={{ display:"flex", flexDirection:"column", flex:1, overflow:"hidden", minWidth:0 }}>
              <Topbar />
              <main style={{ flex:1, overflow:"auto" }} className="main-content">
                {children}
              </main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
