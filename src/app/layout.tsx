import type { Metadata, Viewport } from "next"
import "./globals.css"
import { buildThemeCss } from "@/lib/theme"

const THEME_CSS = buildThemeCss()

export const metadata: Metadata = {
  title: "SRG Fit",
  description: "Remote strength & nutrition coaching by Shane Hoopes",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SRG Fit",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#080810",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/* Inject theme CSS vars globally so every route (coach +
            client + auth) renders with defined theme tokens. The
            :root block defaults to dark; [data-theme="light"] is
            only applied under /dashboard/client/* by ClientDashboard
            Layout when a client opts in. This means the coach side,
            auth pages, etc. always stay dark — but shared components
            like RichMessageThread that use var(--teal) etc. get
            resolved values everywhere, not just on client routes. */}
        <style dangerouslySetInnerHTML={{ __html: THEME_CSS }} />
      </head>
      <body style={{ margin: 0, padding: 0, background: "#080810" }}>
        <a href="#main-content" className="skip-link">Skip to content</a>
        <main id="main-content">
          {children}
        </main>
      </body>
    </html>
  )
}
