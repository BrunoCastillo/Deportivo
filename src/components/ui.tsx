"use client";
import Link from "next/link";
import { useEffect, type ReactNode } from "react";

const paths: Record<string, string> = {
  home: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  ball: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 0v20M2 12h20M5 5c3 2.5 3 11.5 0 14M19 5c-3 2.5-3 11.5 0 14",
  team: "M16 11a4 4 0 1 0-8 0M4 21a8 8 0 0 1 16 0M18 8a3 3 0 1 1 3 3M6 8a3 3 0 1 0-3 3",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  cog: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 2h-4l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
  plus: "M12 5v14M5 12h14",
  back: "M15 18l-6-6 6-6",
  play: "M7 4l13 8-13 8z",
  pause: "M7 4h4v16H7zM14 4h4v16h-4z",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  share: "M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v13M7 8l5-5 5 5",
  download: "M12 3v13M7 11l5 5 5-5M4 21h16",
  cloud: "M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1 0 8z",
  wifiOff: "M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.7M19 13a10 10 0 0 0-2.3-1.6M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 11 5M12 20h.01",
  check: "M5 12l5 5L20 7",
  x: "M6 6l12 12M18 6L6 18",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  swap: "M7 7h13l-4-4M17 17H4l4 4",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  whistle: "M3 12a5 5 0 1 0 10 0V8h8V5H8a5 5 0 0 0-5 5z",
  calendar: "M4 5h16v16H4zM4 10h16M9 3v4M15 3v4",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  link: "M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  menu: "M4 6h16M4 12h16M4 18h16",
  court: "M3 4h18v16H3zM3 12h18M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0",
  dumbbell: "M6 6v12M18 6v12M3 9v6M21 9v6M6 12h12",
};

export function Icon({ name, className = "w-5 h-5", strokeWidth = 2 }: { name: keyof typeof paths | string; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={paths[name] ?? ""} />
    </svg>
  );
}

export function PageHeader({ title, back, actions, subtitle }: { title: ReactNode; back?: string; actions?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      {back && (
        <Link href={back} className="btn btn-ghost !px-2" aria-label="Volver">
          <Icon name="back" />
        </Link>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight truncate">{title}</h1>
        {subtitle && <div className="muted text-sm truncate">{subtitle}</div>}
      </div>
      {actions && <div className="flex gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="card p-8 text-center">
      <div className="mx-auto mb-3 w-12 h-12 rounded-full surface-2 grid place-items-center text-brand">
        <Icon name="ball" className="w-6 h-6" />
      </div>
      <div className="font-bold text-lg">{title}</div>
      {text && <p className="muted text-sm mt-1 max-w-md mx-auto">{text}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** Hoja modal (desde abajo en móvil, centrada en escritorio). */
export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className={`relative card !rounded-b-none sm:!rounded-2xl w-full ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"} max-h-[92dvh] overflow-y-auto p-4 safe-bottom shadow-2xl`}
      >
        <div className="flex items-center mb-3 gap-2">
          <div className="font-extrabold text-lg flex-1">{title}</div>
          <button className="btn btn-ghost !px-2" onClick={onClose} aria-label="Cerrar">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function Avatar({ photo, text, color = "#ff6a13", size = 40 }: { photo?: string; text: string; color?: string; size?: number }) {
  return photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photo} alt="" width={size} height={size} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
  ) : (
    <div
      className="rounded-full grid place-items-center font-black shrink-0 text-black"
      style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}
    >
      {text}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex p-1 rounded-xl surface-2 border border-line gap-1 flex-wrap">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 min-h-[36px] rounded-lg text-sm font-bold ${value === o.value ? "bg-brand text-black" : "muted"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card p-3">
      <div className="muted text-xs font-semibold uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-black tabular-nums">{value}</div>
      {sub && <div className="muted text-xs">{sub}</div>}
    </div>
  );
}

export function confirmAsk(msg: string) {
  return typeof window !== "undefined" ? window.confirm(msg) : false;
}

/** Reduce una imagen a un dataURL cuadrado pequeño (fotos de jugadores). */
export async function resizeImage(file: File, size = 160): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d")!;
    const s = Math.min(img.width, img.height);
    ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
    return c.toDataURL("image/jpeg", 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}
