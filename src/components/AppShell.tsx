"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { PrefsProvider, usePrefs } from "@/lib/prefs";
import { startSync, subscribeSync, type SyncState } from "@/lib/sync";
import { cloudEnabled } from "@/lib/supabase";
import { useActiveClub, useClubs, useOnline } from "@/lib/hooks";
import { Icon } from "./ui";

const NAV = [
  { href: "/", label: "Inicio", icon: "home" },
  { href: "/games/", label: "Partidos", icon: "ball" },
  { href: "/club/", label: "Club", icon: "team" },
  { href: "/stats/", label: "Análisis", icon: "chart" },
  { href: "/trainings/", label: "Entrenos", icon: "dumbbell" },
  { href: "/settings/", label: "Ajustes", icon: "cog" },
];

function SyncBadge() {
  const { t } = usePrefs();
  const online = useOnline();
  const [s, setS] = useState<{ state: SyncState; pending: number; error?: string }>({ state: "local", pending: 0 });
  useEffect(() => {
    const off = subscribeSync(setS);
    return () => {
      off();
    };
  }, []);
  if (!online)
    return (
      <span className="chip !bg-amber-500/15 !border-amber-500/40 text-amber-500" title={t("Sin conexión: todo se guarda en el dispositivo")}>
        <Icon name="wifiOff" className="w-3.5 h-3.5" /> {t("Sin conexión")}
        {s.pending > 0 && ` · ${s.pending}`}
      </span>
    );
  if (!cloudEnabled || s.state === "local")
    return (
      <span className="chip" title={t("Datos guardados solo en este dispositivo")}>
        <Icon name="shield" className="w-3.5 h-3.5" /> {t("En el dispositivo")}
      </span>
    );
  const map: Record<SyncState, string> = {
    local: t("En el dispositivo"),
    offline: t("Sin conexión"),
    syncing: t("Sincronizando…"),
    synced: t("Sincronizado"),
    error: t("Error de sincronización"),
  };
  return (
    <span className={`chip ${s.state === "error" ? "text-bad" : s.state === "synced" ? "text-ok" : ""}`} title={s.error}>
      <Icon name="cloud" className="w-3.5 h-3.5" /> {map[s.state]}
      {s.pending > 0 && ` · ${s.pending}`}
    </span>
  );
}

function ClubSwitcher() {
  const clubs = useClubs();
  const { club } = useActiveClub();
  const { setClubId, t } = usePrefs();
  if (clubs.length <= 1) return <div className="font-bold truncate">{club?.name ?? t("Sin club")}</div>;
  return (
    <select className="input !min-h-[36px] !py-0 font-bold" value={club?.id} onChange={(e) => setClubId(e.target.value)} aria-label={t("Club activo")}>
      {clubs.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname() || "/";
  const { t } = usePrefs();
  const fullscreen = path.startsWith("/game/live") || path.startsWith("/live");

  useEffect(() => {
    startSync();
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    // Pide almacenamiento persistente para que el navegador no borre los datos
    navigator.storage?.persist?.().catch(() => {});
  }, []);

  if (fullscreen) return <>{children}</>;

  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href) || path.startsWith(href.replace(/\/$/, "")));

  return (
    <div className="min-h-dvh md:flex">
      {/* Barra lateral (escritorio) */}
      <aside className="hidden md:flex md:flex-col w-60 shrink-0 border-r border-line p-4 gap-1 sticky top-0 h-dvh" style={{ background: "var(--surface)" }}>
        <Link href="/" className="flex items-center gap-2 mb-6">
          <Logo />
          <span className="text-xl font-black tracking-tight">Rebote</span>
        </Link>
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold ${active(n.href) ? "bg-brand text-black" : "hover:bg-[var(--surface-2)]"}`}
          >
            <Icon name={n.icon} /> {t(n.label)}
          </Link>
        ))}
        <div className="mt-auto space-y-2">
          <ClubSwitcher />
          <SyncBadge />
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Cabecera móvil */}
        <header className="md:hidden sticky top-0 z-30 safe-top border-b border-line" style={{ background: "var(--bg)" }}>
          <div className="flex items-center gap-2 px-4 h-14">
            <Link href="/" className="shrink-0">
              <Logo />
            </Link>
            <div className="flex-1 min-w-0">
              <ClubSwitcher />
            </div>
            <SyncBadge />
          </div>
        </header>
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-4 pb-28 md:pb-8">{children}</main>
      </div>

      {/* Navegación inferior (móvil) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-line safe-bottom" style={{ background: "var(--surface)" }}>
        <div className="grid grid-cols-6">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`flex flex-col items-center justify-center gap-0.5 h-16 text-[10px] font-bold ${active(n.href) ? "text-brand" : "muted"}`}
            >
              <Icon name={n.icon} className="w-6 h-6" />
              {t(n.label)}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="Rebote">
      <rect width="64" height="64" rx="16" fill="#ff6a13" />
      <circle cx="32" cy="34" r="17" fill="none" stroke="#111" strokeWidth="4" />
      <path d="M15 34h34M32 17v34" stroke="#111" strokeWidth="4" />
      <path d="M20 14c6 4 6 10 0 14" stroke="#111" strokeWidth="0" fill="none" />
      <rect x="22" y="6" width="20" height="5" rx="2.5" fill="#111" />
    </svg>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <PrefsProvider>
      <Shell>{children}</Shell>
    </PrefsProvider>
  );
}
