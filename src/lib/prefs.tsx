"use client";
// Preferencias del usuario: idioma (es por defecto / en), tema (oscuro por defecto) y club activo.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { EN } from "./i18n-en";

export type Lang = "es" | "en";
export type Theme = "dark" | "light";

interface Prefs {
  lang: Lang;
  theme: Theme;
  clubId: string | null;
  setLang: (l: Lang) => void;
  setTheme: (t: Theme) => void;
  setClubId: (id: string | null) => void;
  t: (s: string, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<Prefs | null>(null);

function read<T extends string>(k: string, d: T): T {
  try {
    return (localStorage.getItem(k) as T) || d;
  } catch {
    return d;
  }
}
function write(k: string, v: string | null) {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* almacenamiento bloqueado */
  }
}

const ES: Record<string, string> = { admin: "Administrador", coach: "Entrenador", scorer: "Anotador", player: "Jugador", fan: "Aficionado" };

export function translate(lang: Lang, s: string, vars?: Record<string, string | number>) {
  let out = lang === "en" ? (EN[s] ?? s) : (ES[s] ?? s);
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangS] = useState<Lang>("es");
  const [theme, setThemeS] = useState<Theme>("dark");
  const [clubId, setClubS] = useState<string | null>(null);

  useEffect(() => {
    setLangS(read<Lang>("reb.lang", "es"));
    setThemeS(read<Theme>("reb.theme", "dark"));
    setClubS(read<string>("reb.club", "") || null);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.lang = lang;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", theme === "dark" ? "#0b0e13" : "#f4f5f7");
  }, [theme, lang]);

  const setLang = useCallback((l: Lang) => {
    setLangS(l);
    write("reb.lang", l);
  }, []);
  const setTheme = useCallback((t: Theme) => {
    setThemeS(t);
    write("reb.theme", t);
  }, []);
  const setClubId = useCallback((id: string | null) => {
    setClubS(id);
    write("reb.club", id);
  }, []);
  const t = useCallback((s: string, vars?: Record<string, string | number>) => translate(lang, s, vars), [lang]);

  const value = useMemo(
    () => ({ lang, theme, clubId, setLang, setTheme, setClubId, t }),
    [lang, theme, clubId, setLang, setTheme, setClubId, t],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs() {
  const c = useContext(Ctx);
  if (!c) throw new Error("PrefsProvider ausente");
  return c;
}
export const useT = () => usePrefs().t;
