import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

const SITE_URL = "https://traderhub-nine.vercel.app";
const TITLE = "TraderHub — Professional Trading Journal";
const DESCRIPTION = "Track, analyze, and improve your trading with TraderHub.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "TraderHub",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
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
