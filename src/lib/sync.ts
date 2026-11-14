// Sincronización local ⇄ nube (Supabase). Estrategia:
//  - Cada escritura local se encola en `outbox`.
//  - push(): sube la cola (upsert) cuando hay señal y sesión.
//  - pull(): baja los cambios desde el último cursor (server_ts) y aplica last-write-wins por updatedAt.
//  - Tiempo real: suscripción a los eventos del partido abierto (dos anotadores a la vez).
import { db, getMeta, onLocalWrite, setMeta, table } from "./db";
import { sb } from "./supabase";
import type { BaseDoc, GameEvent, Role, TableName } from "./types";
import { TABLES } from "./types";

export type SyncState = "local" | "offline" | "syncing" | "synced" | "error";
type Listener = (s: { state: SyncState; pending: number; error?: string; lastSync?: number }) => void;

const listeners = new Set<Listener>();
let state: SyncState = "local";
let lastError: string | undefined;
let lastSync: number | undefined;
let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;

async function emit() {
  const pending = await db.outbox.count();
  listeners.forEach((l) => l({ state, pending, error: lastError, lastSync }));
}

export function subscribeSync(l: Listener) {
  listeners.add(l);
  emit();
  return () => listeners.delete(l);
}

async function session() {
  const c = sb();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session;
}

async function push() {
  const c = sb()!;
  const items = await db.outbox.orderBy("queuedAt").limit(500).toArray();
  if (!items.length) return 0;
  // Los clubes primero (crean la membresía de administrador)
  items.sort((a, b) => (a.table === "clubs" ? -1 : 0) - (b.table === "clubs" ? -1 : 0));
  const rows: { item: (typeof items)[number]; row: Record<string, unknown> }[] = [];
  for (const it of items) {
    const doc = (await table(it.table).get(it.id)) as BaseDoc | undefined;
    if (!doc) {
      await db.outbox.delete(it.key);
      continue;
    }
    // myRole es local; no se sube
    const { myRole: _r, ...data } = doc as BaseDoc & { myRole?: Role };
    rows.push({
      item: it,
      row: {
        id: doc.id,
        club_id: doc.clubId,
        kind: it.table,
        game_id: it.table === "events" ? (doc as unknown as GameEvent).gameId : null,
        data,
        updated_at: doc.updatedAt,
        deleted: !!doc.deleted,
      },
    });
  }
  const clubRows = rows.filter((r) => r.item.table === "clubs");
  const otherRows = rows.filter((r) => r.item.table !== "clubs");
  for (const group of [clubRows, otherRows]) {
    if (!group.length) continue;
    const { error } = await c.from("records").upsert(group.map((g) => g.row), { onConflict: "id" });
    if (error) {
      // Reintenta uno por uno para no bloquear la cola por un registro sin permiso
      for (const g of group) {
        const r = await c.from("records").upsert(g.row, { onConflict: "id" });
        if (!r.error || r.error.code === "42501") await db.outbox.delete(g.item.key);
        else throw r.error;
      }
    } else {
      // Solo borra de la cola si no se volvió a modificar mientras subía
      for (const g of group) {
        const cur = await db.outbox.get(g.item.key);
        if (cur && cur.queuedAt === g.item.queuedAt) await db.outbox.delete(g.item.key);
      }
    }
  }
  return rows.length;
}

export async function applyRemote(rows: { kind: string; data: BaseDoc; updated_at: number }[]) {
  let changed = 0;
  for (const r of rows) {
    if (!TABLES.includes(r.kind as TableName)) continue;
    const t = table(r.kind as TableName);
    const cur = await t.get(r.data.id);
    if (!cur || (r.data.updatedAt ?? r.updated_at) > (cur.updatedAt ?? 0)) {
      const pending = await db.outbox.get(`${r.kind}:${r.data.id}`);
      if (pending && cur && cur.updatedAt >= r.data.updatedAt) continue;
      await t.put({ ...(cur as object), ...r.data } as BaseDoc);
      changed++;
    }
  }
  return changed;
}

async function pullMembership() {
  const c = sb()!;
  const s = await session();
  if (!s) return;
  const { data } = await c.from("club_members").select("club_id, role").eq("user_id", s.user.id);
  for (const m of data ?? []) {
    const club = await db.clubs.get(m.club_id);
    if (club && club.myRole !== m.role) await db.clubs.put({ ...club, myRole: m.role as Role });
  }
  await setMeta("roles", Object.fromEntries((data ?? []).map((m) => [m.club_id, m.role])));
}

async function pull() {
  const c = sb()!;
  let cursor = await getMeta<string>("pullCursor", "1970-01-01T00:00:00Z");
  for (let i = 0; i < 20; i++) {
    const { data, error } = await c
      .from("records")
      .select("kind, data, updated_at, server_ts")
      .gte("server_ts", cursor)
      .order("server_ts", { ascending: true })
      .limit(1000);
    if (error) throw error;
    if (!data?.length) break;
    await applyRemote(data as never);
    const last = data[data.length - 1].server_ts as string;
    if (last === cursor) break;
    cursor = last;
    await setMeta("pullCursor", cursor);
    if (data.length < 1000) break;
  }
  await pullMembership();
}

export async function syncNow() {
  if (running) return;
  const c = sb();
  if (!c) {
    state = "local";
    return emit();
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    state = "offline";
    return emit();
  }
  const s = await session();
  if (!s) {
    state = "local";
    return emit();
  }
  running = true;
  state = "syncing";
  await emit();
  try {
    while ((await push()) > 0 && (await db.outbox.count()) > 0) {
      /* sigue subiendo en lotes */
    }
    await pull();
    state = "synced";
    lastError = undefined;
    lastSync = Date.now();
  } catch (e) {
    state = "error";
    lastError = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  } finally {
    running = false;
    await emit();
  }
}

function schedule(ms = 1500) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), ms);
}

let started = false;
export function startSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  onLocalWrite(() => {
    emit();
    schedule(1200);
  });
  window.addEventListener("online", () => schedule(200));
  window.addEventListener("offline", () => {
    state = sb() ? "offline" : "local";
    emit();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") schedule(300);
  });
  setInterval(() => void syncNow(), 30000);
  sb()?.auth.onAuthStateChange(() => schedule(300));
  schedule(500);
}

/** Tiempo real de un partido: aplica eventos de otro anotador al instante. */
export function subscribeGame(gameId: string) {
  const c = sb();
  if (!c) return () => {};
  const ch = c
    .channel(`game-${gameId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "records", filter: `game_id=eq.${gameId}` },
      (payload) => {
        const row = payload.new as { kind: string; data: BaseDoc; updated_at: number };
        if (row?.data) void applyRemote([row]);
      },
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "records", filter: `id=eq.${gameId}` },
      (payload) => {
        const row = payload.new as { kind: string; data: BaseDoc; updated_at: number };
        if (row?.data) void applyRemote([row]);
      },
    )
    .subscribe();
  const poll = setInterval(() => void syncNow(), 5000);
  return () => {
    clearInterval(poll);
    void c.removeChannel(ch);
  };
}

/** Publica el marcador para el enlace público. */
let liveTimer: ReturnType<typeof setTimeout> | null = null;
export function publishLive(gameId: string, clubId: string, data: unknown) {
  const c = sb();
  if (!c) return;
  if (liveTimer) clearTimeout(liveTimer);
  liveTimer = setTimeout(async () => {
    if (!navigator.onLine) return;
    await c.from("live_scores").upsert({ game_id: gameId, club_id: clubId, data, updated_at: new Date().toISOString() });
  }, 800);
}

export async function createInvite(clubId: string, role: Role) {
  const c = sb();
  if (!c) throw new Error("Nube no configurada");
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const s = await session();
  const { error } = await c.from("club_invites").insert({ code, club_id: clubId, role, created_by: s?.user.id });
  if (error) throw error;
  return code;
}

export async function joinClub(code: string) {
  const c = sb();
  if (!c) throw new Error("Nube no configurada");
  const { data, error } = await c.rpc("join_club", { p_code: code.trim().toUpperCase() });
  if (error) throw error;
  await setMeta("pullCursor", "1970-01-01T00:00:00Z");
  await syncNow();
  return data as string;
}

export async function listMembers(clubId: string) {
  const c = sb();
  if (!c) return [];
  const { data } = await c.from("club_members").select("user_id, role, email").eq("club_id", clubId);
  return data ?? [];
}

export async function setMemberRole(clubId: string, userId: string, role: Role) {
  const c = sb();
  if (!c) return;
  const { error } = await c.from("club_members").update({ role }).eq("club_id", clubId).eq("user_id", userId);
  if (error) throw error;
}

/** Fuerza subida completa de todo lo local (respaldo en la nube). */
export async function queueEverything() {
  const now = Date.now();
  for (const name of TABLES) {
    const rows = await table(name).toArray();
    await db.outbox.bulkPut(rows.map((r) => ({ key: `${name}:${r.id}`, table: name, id: r.id, queuedAt: now })));
  }
  await syncNow();
}

/** Restaura todo desde la nube (descarga completa). */
export async function restoreFromCloud() {
  await setMeta("pullCursor", "1970-01-01T00:00:00Z");
  await syncNow();
}
