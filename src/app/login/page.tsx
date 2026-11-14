"use client";
import Link from "next/link";
import { useState } from "react";
import { sb, cloudEnabled } from "@/lib/supabase";
import { usePrefs } from "@/lib/prefs";
import { useSession } from "@/lib/hooks";
import { Empty, Field, PageHeader, Segmented } from "@/components/ui";

export default function LoginPage() {
  const { t } = usePrefs();
  const { session } = useSession();
  const [mode, setMode] = useState<"login" | "signup" | "magic">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!cloudEnabled)
    return (
      <div className="max-w-md mx-auto">
        <PageHeader back="/settings/" title={t("Cuenta")} />
        <Empty title={t("Nube no configurada")} text={t("Esta instalación funciona solo en el dispositivo. Para cuentas y sincronización, configura las variables de Supabase en Vercel (ver README).")} />
      </div>
    );

  if (session)
    return (
      <div className="max-w-md mx-auto">
        <PageHeader back="/settings/" title={t("Cuenta")} />
        <div className="card p-5 space-y-3">
          <div>
            {t("Sesión iniciada como")} <b>{session.user.email}</b>
          </div>
          <Link href="/" className="btn btn-primary w-full">
            {t("Ir al inicio")}
          </Link>
          <button className="btn w-full" onClick={() => sb()!.auth.signOut()}>
            {t("Cerrar sesión")}
          </button>
        </div>
      </div>
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = sb()!;
    setBusy(true);
    setMsg(null);
    const redirect = `${location.origin}/settings/`;
    try {
      if (mode === "login") {
        const { error } = await c.auth.signInWithPassword({ email, password });
        if (error) throw error;
        location.href = "/";
      } else if (mode === "signup") {
        const { error, data } = await c.auth.signUp({ email, password, options: { emailRedirectTo: redirect } });
        if (error) throw error;
        if (data.session) location.href = "/";
        else setMsg({ ok: true, text: t("Te enviamos un correo para confirmar la cuenta.") });
      } else {
        const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
        if (error) throw error;
        setMsg({ ok: true, text: t("Revisa tu correo: te enviamos un enlace para entrar.") });
      }
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    const { error } = await sb()!.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/settings/` } });
    if (error) setMsg({ ok: false, text: error.message });
  };

  return (
    <div className="max-w-md mx-auto">
      <PageHeader back="/settings/" title={t("Iniciar sesión")} />
      <div className="card p-5 space-y-4">
        <button className="btn w-full !bg-white !text-black !border-white" onClick={google}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          {t("Continuar con Google")}
        </button>
        <div className="text-center muted text-xs">— {t("o con correo")} —</div>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "login", label: t("Entrar") },
            { value: "signup", label: t("Crear cuenta") },
            { value: "magic", label: t("Enlace mágico") },
          ]}
        />
        <form onSubmit={submit} className="space-y-3">
          <Field label={t("Correo")}>
            <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </Field>
          {mode !== "magic" && (
            <Field label={t("Contraseña")}>
              <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
            </Field>
          )}
          <button className="btn btn-primary w-full" disabled={busy}>
            {mode === "login" ? t("Entrar") : mode === "signup" ? t("Crear cuenta") : t("Enviar enlace")}
          </button>
        </form>
        {msg && <div className={`text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</div>}
        <p className="muted text-xs">{t("Tus datos locales se suben a la nube al iniciar sesión, y puedes seguir anotando sin internet.")}</p>
      </div>
    </div>
  );
}
