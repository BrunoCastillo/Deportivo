"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePrefs } from "@/lib/prefs";
import { useSession } from "@/lib/hooks";
import { cloudEnabled, sb } from "@/lib/supabase";
import { exportAll, importAll } from "@/lib/db";
import { joinClub, queueEverything, restoreFromCloud, subscribeSync, syncNow } from "@/lib/sync";
import { downloadBlob } from "@/lib/export";
import { Field, Icon, PageHeader, Segmented } from "@/components/ui";

export default function SettingsPage() {
  const { t, lang, setLang, theme, setTheme, setClubId } = usePrefs();
  const { session } = useSession();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sync, setSync] = useState<{ state: string; pending: number; error?: string; lastSync?: number }>({ state: "local", pending: 0 });
  const fileRef = useRef<HTMLInputElement>(null);
  const [installEvt, setInstallEvt] = useState<Event & { prompt?: () => Promise<void> } | null>(null);

  useEffect(() => {
    const off = subscribeSync(setSync);
    const h = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e);
    };
    window.addEventListener("beforeinstallprompt", h);
    return () => {
      off();
      window.removeEventListener("beforeinstallprompt", h);
    };
  }, []);

  const wrap = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };

  const isIOS = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

  return (
    <div className="max-w-2xl">
      <PageHeader title={t("Ajustes")} />
      <div className="space-y-4">
        <section className="card p-4 space-y-3">
          <div className="font-bold">{t("Preferencias")}</div>
          <div className="flex flex-wrap gap-4">
            <div>
              <span className="label">{t("Idioma")}</span>
              <Segmented value={lang} onChange={setLang} options={[{ value: "es", label: "Español" }, { value: "en", label: "English" }]} />
            </div>
            <div>
              <span className="label">{t("Tema")}</span>
              <Segmented value={theme} onChange={setTheme} options={[{ value: "dark", label: t("Oscuro") }, { value: "light", label: t("Claro") }]} />
            </div>
          </div>
        </section>

        <section className="card p-4 space-y-3">
          <div className="font-bold">{t("Instalar en el celular")}</div>
          {installEvt?.prompt ? (
            <button className="btn btn-primary" onClick={() => installEvt.prompt?.()}>
              <Icon name="download" /> {t("Instalar Rebote")}
            </button>
          ) : (
            <p className="muted text-sm">
              {isIOS
                ? t("iPhone: abre en Safari → botón Compartir → «Agregar a pantalla de inicio».")
                : t("Android: menú ⋮ de Chrome → «Instalar app» o «Agregar a pantalla principal».")}
            </p>
          )}
          <p className="muted text-xs">{t("Una vez instalada, la app abre y anota partidos sin conexión.")}</p>
        </section>

        <section className="card p-4 space-y-3">
          <div className="font-bold">{t("Cuenta y nube")}</div>
          {!cloudEnabled ? (
            <p className="muted text-sm">{t("Modo local: los datos se guardan solo en este dispositivo. Configura Supabase para tener cuentas, roles, dos anotadores, marcador público y respaldo en la nube.")}</p>
          ) : session ? (
            <>
              <div className="text-sm">
                {t("Sesión")}: <b>{session.user.email}</b>
              </div>
              <div className="text-sm muted">
                {t("Estado")}: {sync.state} · {t("pendientes")}: {sync.pending}
                {sync.lastSync ? ` · ${t("última")}: ${new Date(sync.lastSync).toLocaleTimeString()}` : ""}
                {sync.error && <div className="text-bad">{sync.error}</div>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn" onClick={() => wrap(syncNow, t("Sincronizado"))}>
                  <Icon name="cloud" /> {t("Sincronizar ahora")}
                </button>
                <button className="btn" onClick={() => wrap(queueEverything, t("Respaldo subido a la nube"))}>
                  {t("Respaldar todo en la nube")}
                </button>
                <button className="btn" onClick={() => wrap(restoreFromCloud, t("Datos restaurados desde la nube"))}>
                  {t("Restaurar desde la nube")}
                </button>
                <button className="btn" onClick={() => sb()!.auth.signOut()}>
                  {t("Cerrar sesión")}
                </button>
              </div>
              <form
                className="flex gap-2 items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  void wrap(async () => {
                    const id = await joinClub(code);
                    setClubId(id);
                    setCode("");
                  }, t("Te uniste al club"));
                }}
              >
                <Field label={t("Unirme a un club con código")}>
                  <input className="input uppercase tracking-widest" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABC123" />
                </Field>
                <button className="btn btn-primary">{t("Unirme")}</button>
              </form>
            </>
          ) : (
            <Link href="/login/" className="btn btn-primary">
              <Icon name="user" /> {t("Iniciar sesión o crear cuenta")}
            </Link>
          )}
        </section>

        <section className="card p-4 space-y-3">
          <div className="font-bold">{t("Respaldo en archivo")}</div>
          <p className="muted text-sm">{t("Descarga todos tus datos en un archivo JSON y restáuralos en cualquier dispositivo.")}</p>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn"
              onClick={async () => {
                const data = await exportAll();
                downloadBlob(new Blob([JSON.stringify(data)], { type: "application/json" }), `rebote-respaldo-${new Date().toISOString().slice(0, 10)}.json`);
              }}
            >
              <Icon name="download" /> {t("Descargar respaldo")}
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              {t("Restaurar respaldo")}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                await wrap(async () => importAll(JSON.parse(await f.text())), t("Respaldo restaurado"));
                e.target.value = "";
              }}
            />
          </div>
        </section>

        {msg && <div className={`card p-3 text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</div>}

        <p className="muted text-xs text-center">Rebote · v0.1 · {t("Datos en este dispositivo")}: IndexedDB</p>
      </div>
    </div>
  );
}
