// Almacenamiento local (IndexedDB vía Dexie). Es la fuente de verdad en el dispositivo:
// la app funciona 100% sin internet y la cola `outbox` se sube a Supabase al recuperar señal.
import Dexie, { type Table } from "dexie";
import type {
  BaseDoc,
  Club,
  Competition,
  Drill,
  Game,
  GameEvent,
  Opponent,
  Player,
  Season,
  TableName,
  Team,
  Training,
} from "./types";

export interface OutboxItem {
  key: string; // `${table}:${id}`
  table: TableName;
  id: string;
  queuedAt: number;
}

export interface MetaItem {
  key: string;
  value: unknown;
}

class RebDB extends Dexie {
  clubs!: Table<Club, string>;
  seasons!: Table<Season, string>;
  teams!: Table<Team, string>;
  players!: Table<Player, string>;
  opponents!: Table<Opponent, string>;
  competitions!: Table<Competition, string>;
  games!: Table<Game, string>;
  events!: Table<GameEvent, string>;
  drills!: Table<Drill, string>;
  trainings!: Table<Training, string>;
  outbox!: Table<OutboxItem, string>;
  meta!: Table<MetaItem, string>;

  constructor() {
    super("rebote");
    this.version(1).stores({
      clubs: "id, updatedAt",
      seasons: "id, clubId, updatedAt",
      teams: "id, clubId, updatedAt",
      players: "id, clubId, teamId, updatedAt",
      opponents: "id, clubId, updatedAt",
      competitions: "id, clubId, updatedAt",
      games: "id, clubId, teamId, date, updatedAt",
      events: "id, gameId, clubId, updatedAt",
      drills: "id, clubId, updatedAt",
      trainings: "id, clubId, teamId, date, updatedAt",
      outbox: "key, queuedAt",
      meta: "key",
    });
  }
}

export const db = new RebDB();

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

let deviceIdCache: string | null = null;
export function deviceId(): string {
  if (deviceIdCache) return deviceIdCache;
  try {
    let d = localStorage.getItem("reb.device");
    if (!d) {
      d = uid().slice(0, 8);
      localStorage.setItem("reb.device", d);
    }
    deviceIdCache = d;
  } catch {
    deviceIdCache = uid().slice(0, 8);
  }
  return deviceIdCache;
}

type AnyTable = Table<BaseDoc, string>;
export const table = (name: TableName) => (db as unknown as Record<TableName, AnyTable>)[name];

const listeners = new Set<() => void>();
export const onLocalWrite = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Crea o actualiza un documento y lo encola para sincronizar. */
export async function save<T extends BaseDoc>(name: TableName, doc: Omit<T, "createdAt" | "updatedAt"> & Partial<BaseDoc>): Promise<T> {
  const now = Date.now();
  const full = { ...doc, createdAt: doc.createdAt ?? now, updatedAt: now } as unknown as T;
  await db.transaction("rw", table(name), db.outbox, async () => {
    await table(name).put(full);
    await db.outbox.put({ key: `${name}:${full.id}`, table: name, id: full.id, queuedAt: now });
  });
  listeners.forEach((l) => l());
  return full;
}

export async function saveMany<T extends BaseDoc>(name: TableName, docs: T[]) {
  const now = Date.now();
  const full = docs.map((d) => ({ ...d, createdAt: d.createdAt ?? now, updatedAt: now }));
  await db.transaction("rw", table(name), db.outbox, async () => {
    await table(name).bulkPut(full);
    await db.outbox.bulkPut(full.map((d) => ({ key: `${name}:${d.id}`, table: name, id: d.id, queuedAt: now })));
  });
  listeners.forEach((l) => l());
}

/** Borrado lógico (para que el borrado también se sincronice). */
export async function remove(name: TableName, id: string) {
  const cur = await table(name).get(id);
  if (!cur) return;
  await save(name, { ...cur, deleted: true });
}

export async function patch<T extends BaseDoc>(name: TableName, id: string, changes: Partial<T>) {
  const cur = await table(name).get(id);
  if (!cur) return;
  return save(name, { ...cur, ...changes } as T);
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const m = await db.meta.get(key);
  return (m?.value as T) ?? fallback;
}
export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value });
}

/** Respaldo completo en JSON. */
export async function exportAll() {
  const data: Record<string, unknown[]> = {};
  for (const name of [
    "clubs",
    "seasons",
    "teams",
    "players",
    "opponents",
    "competitions",
    "games",
    "events",
    "drills",
    "trainings",
  ] as TableName[]) {
    data[name] = await table(name).toArray();
  }
  return { app: "rebote", version: 1, exportedAt: new Date().toISOString(), data };
}

export async function importAll(backup: { app?: string; data: Record<string, BaseDoc[]> }) {
  if (backup.app !== "rebote" || !backup.data) throw new Error("Archivo de respaldo no válido");
  for (const [name, rows] of Object.entries(backup.data)) {
    const t = table(name as TableName);
    if (!t || !Array.isArray(rows)) continue;
    // Solo reemplaza si el respaldo es más reciente que lo local
    for (const row of rows) {
      const cur = await t.get(row.id);
      if (!cur || (row.updatedAt ?? 0) >= (cur.updatedAt ?? 0)) {
        await t.put(row);
        await db.outbox.put({ key: `${name}:${row.id}`, table: name as TableName, id: row.id, queuedAt: Date.now() });
      }
    }
  }
  listeners.forEach((l) => l());
}
