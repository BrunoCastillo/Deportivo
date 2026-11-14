import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Rebote · Estadísticas de básquet",
  description: "Registro de estadísticas de básquet en vivo, box score, mapas de tiro y análisis. Funciona sin internet.",
  manifest: "/manifest.webmanifest",
  applicationName: "Rebote",
  appleWebApp: { capable: true, title: "Rebote", statusBarStyle: "black-translucent" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0b0e13",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <head>
        <script
          // Aplica el tema antes de pintar para evitar parpadeo
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('reb.theme');if(t==='light')document.documentElement.classList.remove('dark')}catch(e){}`,
          }}
        />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
