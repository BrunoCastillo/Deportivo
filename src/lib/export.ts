// Exportación: CSV (Excel/Power BI), XLSX con varias hojas, imagen y PDF del resumen.
import type { Game, GameEvent, Opponent, Player, Team } from "./types";
import { describeEvent } from "./describe";
import { eff, fga, fgm, fmtMin, periodLabel, pir, reb, type GameStats, type StatLine } from "./stats";
import { zoneOf } from "./court";
import type { Lang } from "./prefs";

export const BOX_HEADERS = [
  "Num",
  "Jugador",
  "MIN",
  "PTS",
  "TC",
  "TCI",
  "T2",
  "T2I",
  "T3",
  "T3I",
  "TL",
  "TLI",
  "RO",
  "RD",
  "REB",
  "AST",
  "ROB",
  "TAP",
  "PER",
  "FC",
  "FR",
  "+/-",
  "EFF",
  "PIR",
];

export function lineRow(num: string, name: string, s: StatLine): (string | number)[] {
  return [
    num,
    name,
    Math.round((s.secs / 60) * 10) / 10,
    s.pts,
    fgm(s),
    fga(s),
    s.fgm2,
    s.fga2,
    s.fgm3,
    s.fga3,
    s.ftm,
    s.fta,
    s.oreb,
    s.dreb,
    reb(s),
    s.ast,
    s.stl,
    s.blk,
    s.tov,
    s.pf,
    s.fd,
    s.pm,
    eff(s),
    pir(s),
  ];
}

export function boxRows(stats: GameStats, roster: Player[], teamName: string, oppName: string, opp?: Opponent) {
  const rows: (string | number)[][] = [];
  for (const p of roster) {
    const s = stats.players[p.id];
    if (s) rows.push(lineRow(p.number, `${p.firstName} ${p.lastName}`.trim(), s));
  }
  rows.push(lineRow("", `TOTAL ${teamName}`, { ...stats.team.us, pm: stats.score.us - stats.score.them }));
  for (const [id, s] of Object.entries(stats.oppPlayers)) {
    const op = opp?.players.find((x) => x.id === id);
    rows.push(lineRow(op?.number ?? "", `${oppName} ${op?.name ?? ""}`.trim(), s));
  }
  rows.push(lineRow("", `TOTAL ${oppName}`, { ...stats.team.them, pm: stats.score.them - stats.score.us }));
  return rows;
}

export function eventRows(game: Game, events: GameEvent[], players: Player[], opp: Opponent | undefined, lang: Lang) {
  const sorted = [...events].filter((e) => !e.deleted).sort((a, b) => a.period - b.period || b.clockMs - a.clockMs || a.createdAt - b.createdAt);
  return sorted.map((e) => {
    const p = players.find((x) => x.id === e.playerId);
    const op = opp?.players.find((x) => x.id === e.playerId);
    return [
      game.id,
      game.date,
      periodLabel(game, e.period, lang),
      fmtMin(e.clockMs / 1000),
      e.team === "us" ? "propio" : "rival",
      e.type,
      e.made == null ? "" : e.made ? 1 : 0,
      e.made ? (e.points ?? 0) : 0,
      p ? p.number : op ? op.number : "",
      p ? `${p.firstName} ${p.lastName}`.trim() : op?.name ?? "",
      e.x != null ? Math.round(e.x * 1000) / 1000 : "",
      e.y != null ? Math.round(e.y * 1000) / 1000 : "",
      e.x != null && e.y != null ? zoneOf(e.x, e.y) : "",
      describeEvent(e, players, opp, lang, game.format === "3x3"),
    ];
  });
}
export const EVENT_HEADERS = ["partido", "fecha", "periodo", "reloj", "equipo", "tipo", "convertido", "puntos", "num", "jugador", "x", "y", "zona", "descripcion"];

export function toCSV(rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM para que Excel detecte UTF-8 (acentos)
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function slug(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

export async function exportXlsx(
  filename: string,
  sheets: { name: string; headers: string[]; rows: (string | number)[][] }[],
) {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const data = sheets.map((s) => ({
    sheet: s.name.slice(0, 31),
    stickyRowsCount: 1,
    data: [
      s.headers.map((h) => ({ value: h, fontWeight: "bold" as const })),
      ...s.rows.map((r) => r.map((v) => ({ value: v === "" ? null : v }))),
    ],
  }));
  const blob = await (writeExcelFile as unknown as (d: unknown) => { toBlob: () => Promise<Blob> })(data).toBlob();
  downloadBlob(blob, filename);
}

export async function nodeToPng(node: HTMLElement) {
  const { toPng } = await import("html-to-image");
  const bg = getComputedStyle(document.body).backgroundColor;
  return toPng(node, { pixelRatio: 2, backgroundColor: bg, cacheBust: true });
}

export async function dataUrlToBlob(dataUrl: string) {
  return (await fetch(dataUrl)).blob();
}

/** Comparte por WhatsApp/redes con la Web Share API; si no está disponible, descarga. */
export async function shareImage(dataUrl: string, filename: string, text: string) {
  const blob = await dataUrlToBlob(dataUrl);
  const file = new File([blob], filename, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text });
      return true;
    } catch {
      return false;
    }
  }
  downloadBlob(blob, filename);
  return false;
}

export async function exportPdf(dataUrl: string, filename: string) {
  const { jsPDF } = await import("jspdf");
  const img = new Image();
  await new Promise((r) => {
    img.onload = r;
    img.src = dataUrl;
  });
  const pdf = new jsPDF({ orientation: img.width > img.height ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const ratio = Math.min((pw - margin * 2) / img.width, (ph - margin * 2) / img.height);
  const w = img.width * ratio;
  const h = img.height * ratio;
  pdf.addImage(dataUrl, "PNG", (pw - w) / 2, margin, w, h);
  pdf.save(filename);
}

export function gameFileBase(game: Game, team?: Team) {
  return slug(`${game.date.slice(0, 10)} ${team?.name ?? ""} vs ${game.opponentName}`);
}
