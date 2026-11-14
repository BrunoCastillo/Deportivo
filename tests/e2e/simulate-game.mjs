// QA: simulación de un partido completo en un celular (Playwright + build estático).
// Uso: npm run build && npm run test:e2e
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { startServer } from "./server.mjs";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");

const BASE = "http://localhost:4173";
const SHOTS = process.env.SHOTS_DIR || "test-results/e2e";
mkdirSync(SHOTS, { recursive: true });

let failures = 0;
const check = (cond, msg) => {
  if (cond) console.log("  ✓", msg);
  else {
    failures++;
    console.log("  ✗", msg);
  }
};

const server = await startServer(4173);
const browser = await chromium.launch();
const context = await browser.newContext({ ...devices["Pixel 7"], acceptDownloads: true });
const page = await context.newPage();
page.on("dialog", (d) => d.accept());
page.on("pageerror", (e) => {
  failures++;
  console.log("  ✗ pageerror:", e.message, (e.stack || "").split("\n").slice(0, 4).join(" | "));
});
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });

// Toque de jugador (los botones usan pointerdown/up)
const tapPlayer = (num) => page.locator(`[data-player="${num}"]`).click();
const action = (k) => page.locator(`[data-action="${k}"]`).click();
const option = (label) => page.locator(`[data-option="${label}"]`).first().click();
const tapCourt = async (fx, fy) => {
  const svg = page.locator('svg[role="button"]').first();
  const box = await svg.boundingBox();
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
};
const readScore = async () => (await page.locator("header .text-5xl").allInnerTexts()).map((x) => Number(x.trim()));
// Espera (hasta 3 s) a que el marcador muestre el valor esperado
const expectScore = async (us, them, msg) => {
  let cur = [];
  for (let i = 0; i < 30; i++) {
    cur = await readScore();
    if (cur[0] === us && cur[1] === them) break;
    await page.waitForTimeout(100);
  }
  check(cur[0] === us && cur[1] === them, `${msg} (marcador ${cur.join("-")})`);
};

try {
  console.log("1. Onboarding: club, equipo y plantilla");
  await page.goto(BASE + "/");
  await page.getByPlaceholder("Club Atlético Ejemplo").fill("Club Prueba");
  await page.getByPlaceholder("Ej: Primera masculino").fill("Primera");
  await page.getByRole("button", { name: "Crear club y cargar plantilla" }).click();
  await page.waitForURL(/\/team\/\?id=/);
  await page.getByRole("button", { name: /Carga rápida/ }).first().click();
  await page.locator("textarea").fill(["4 Martín Gómez", "5 Lucas Díaz", "7 Tomás Ruiz", "8 Nico Paz", "10 Leo Sosa", "11 Iván Mora", "12 Juan Vera", "14 Teo Luna"].join("\n"));
  await page.getByRole("button", { name: "Agregar jugadores" }).click();
  await page.waitForSelector("text=#14");
  check((await page.locator("text=/^#\\d+$/").count()) >= 8, "8 jugadores cargados");
  await shot("01-plantilla");

  console.log("2. Programar partido y abrir anotador");
  await page.goto(BASE + "/games/new/");
  await page.getByPlaceholder("Nombre del rival").fill("Halcones");
  await page.getByRole("button", { name: "Ir a anotar" }).click();
  await page.waitForURL(/\/game\/live\/\?id=/);
  const gameUrl = page.url();

  console.log("3. Quinteto inicial");
  await page.waitForSelector("text=Quinteto inicial");
  for (const n of ["4", "5", "7", "8", "10"]) await page.locator("[role=dialog] .grid button", { hasText: new RegExp(`^${n}`) }).first().click();
  await page.getByRole("button", { name: /Confirmar/ }).click();
  await page.waitForSelector('[data-player="4"]');
  await page.waitForFunction(() => document.querySelectorAll("[data-player]").length === 5).catch(() => {});
  check((await page.locator("[data-player]").count()) === 5, "5 jugadores en cancha");
  await shot("02-anotador");

  console.log("4. Jugadas con preguntas automáticas");
  await page.getByRole("button", { name: "Reloj" }).first().click(); // arranca reloj
  // #4 anota 2 desde la pintura con asistencia de #7
  await tapPlayer("4");
  await action("2m");
  await page.waitForSelector('svg[role="button"]');
  await shot("03-ubicacion-tiro");
  await tapCourt(0.5, 0.15);
  await page.waitForSelector("text=¿Asistencia?");
  await option("#7");
  await expectScore(2, 0, "2-0 tras canasta de #4");

  // Acción primero y jugador después: #7 falla un triple, rebote rival
  await action("3x");
  await tapPlayer("7");
  await tapCourt(0.05, 0.05);
  await page.waitForSelector("text=¿Rebote?");
  await shot("04-rebote");
  await page.locator('[data-option="Halcones"], [data-option="HAL"], [data-option="H"]').first().click();

  // Rival anota 3
  await page.locator('[data-rival="3m"]').click();
  await expectScore(2, 3, "2-3 tras triple rival");

  // Falta de #10 con 2 tiros libres: 1/2, rebote defensivo de #4
  await tapPlayer("10");
  await action("foul");
  await option("Personal");
  await option("2");
  await option("✓ Anotado");
  await option("✗ Fallado");
  await page.waitForSelector("text=¿Rebote?");
  await option("#4");
  await expectScore(2, 4, "2-4 tras tiros libres rivales");

  // Falta rival sobre #8: 2 TL convertidos
  await page.locator('[data-rival="foul"]').click();
  await option("#8");
  await option("2");
  await option("✓ Anotado");
  await option("✓ Anotado");
  await expectScore(4, 4, "4-4 tras tiros libres de #8");

  // Arrastrar jugador a la acción: #5 → triple anotado
  const src = await page.locator('[data-player="5"]').boundingBox();
  const dst = await page.locator('[data-action="3m"]').boundingBox();
  await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
  await page.mouse.down();
  await page.mouse.move(src.x + 40, src.y + 40, { steps: 5 });
  await page.mouse.move(dst.x + dst.width / 2, dst.y + dst.height / 2, { steps: 10 });
  await page.mouse.up();
  await tapCourt(0.5, 0.85);
  await option("Sin asistencia");
  await expectScore(7, 4, "7-4 tras triple de #5 arrastrando");

  console.log("5. Cambio y deshacer");
  await page.getByRole("button", { name: /Cambios/ }).click();
  await page.locator("[role=dialog] .grid button", { hasText: /^4/ }).first().click();
  await page.locator("[role=dialog] .grid button", { hasText: /^12/ }).first().click();
  await page.getByRole("button", { name: "Listo" }).click();
  check((await page.locator('[data-player="12"]').count()) === 1, "#12 entró a la cancha");
  await tapPlayer("12");
  await action("2m");
  await page.getByRole("button", { name: "Omitir ubicación" }).click();
  await option("Sin asistencia");
  await expectScore(9, 4, "9-4 tras canasta de #12");
  await page.getByRole("button", { name: /Deshacer/ }).click();
  await page.waitForTimeout(300);
  await expectScore(7, 4, "Deshacer vuelve a 7-4");

  console.log("6. Modo sin conexión");
  // Espera a que el service worker controle la página
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active;
  });
  await page.reload();
  await page.waitForSelector('[data-player="12"]');
  await context.setOffline(true);
  await tapPlayer("12");
  await action("stl");
  await tapPlayer("7");
  await action("2m");
  await tapCourt(0.3, 0.2);
  await option("#12");
  await expectScore(9, 4, "Anotando sin conexión: 9-4");
  await page.reload(); // recarga sin internet: la app debe abrir desde caché
  await page.waitForSelector('[data-player="12"]', { timeout: 10000 });
  await expectScore(9, 4, "Tras recargar sin conexión los datos siguen (9-4)");
  await shot("05-sin-conexion");
  await page.goto(BASE + "/games/");
  const okOffline = await page.waitForSelector("text=Halcones", { timeout: 8000 }).then(() => true, () => false);
  check(okOffline, "Navegar a Partidos sin conexión funciona");
  await context.setOffline(false);
  await page.goto(gameUrl);
  await page.waitForSelector('[data-player="12"]');

  console.log("7. Jugadas: editar y agregar en cualquier minuto");
  await page.getByRole("button", { name: /Jugadas/ }).click();
  await page.getByRole("button", { name: /Agregar acción/ }).click();
  await page.waitForSelector("text=Agregar acción");
  await page.waitForTimeout(200);
  await page.locator("[role=dialog] select").first().selectOption("shot3");
  await page.getByRole("button", { name: "Guardar" }).click();
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForSelector("[role=dialog]", { state: "detached" });
  await expectScore(12, 4, "Acción agregada a mano: 12-4");

  console.log("8. Siguiente periodo y finalizar");
  await page.getByRole("button", { name: "Reloj" }).last().click();
  await page.getByRole("button", { name: "Siguiente periodo" }).click();
  await page.waitForTimeout(300);
  check((await page.locator("header").innerText()).includes("C2"), "Pasó al 2º cuarto");
  await page.getByRole("button", { name: "Menú" }).click();
  await page.getByRole("button", { name: "Finalizar partido" }).click();
  await page.waitForURL(/\/game\/\?id=/);

  console.log("9. Box score, tiros, análisis y exportación");
  await page.waitForSelector("text=Box score");
  const body = await page.locator("main").innerText();
  check(body.includes("Martín Gómez") && body.includes("Total"), "Box score con jugadores y totales");
  await shot("06-box");
  await page.getByRole("button", { name: "Tiros" }).click();
  await shot("07-tiros");
  await page.getByRole("button", { name: "Análisis" }).click();
  await shot("08-analisis");
  await page.getByRole("button", { name: "Exportar" }).click();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Box score CSV" }).click()]);
  const path = await dl.path();
  const { readFileSync } = await import("node:fs");
  const csv = readFileSync(path, "utf8");
  check(csv.includes("Martín Gómez") && csv.includes("PIR"), "CSV de box score descargado");
  const [dl2] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Excel/ }).click()]);
  check((await dl2.suggestedFilename()).endsWith(".xlsx"), "Excel descargado");
  const [dl3] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.getByRole("button", { name: "Descargar PDF" }).click()]);
  check((await dl3.suggestedFilename()).endsWith(".pdf"), "PDF descargado");
  await shot("09-exportar");

  console.log("10. Panel de análisis y modo inglés/claro");
  await page.goto(BASE + "/stats/");
  await page.waitForSelector("text=Jugadores");
  await shot("10-analisis-temporada");
  await page.goto(BASE + "/settings/");
  await page.getByRole("button", { name: "English" }).click();
  await page.getByRole("button", { name: "Light" }).click();
  await page.waitForTimeout(300);
  check((await page.locator("main").innerText()).includes("Preferences"), "Interfaz en inglés");
  await page.goto(BASE + "/");
  await shot("11-ingles-claro");
} catch (e) {
  failures++;
  console.log("  ✗ excepción:", e.message);
  await shot("error").catch(() => {});
} finally {
  await browser.close();
  server.close();
}

console.log(failures ? `\n${failures} fallo(s)` : "\nSimulación completa OK");
process.exit(failures ? 1 : 0);
