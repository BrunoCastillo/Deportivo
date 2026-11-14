# Rebote · Estadísticas de básquet

App web + PWA instalable (Android e iPhone) para registrar estadísticas de básquet en vivo, **sin internet**, con box score, +/-, EFF, PIR, mapas de tiro, análisis de temporada y exportación.

- **Next.js 15 + React 19 + TypeScript + Tailwind 4**, exportación estática (todas las pantallas se precachean → abre y anota sin señal).
- **IndexedDB (Dexie)** como base local; **Supabase** (opcional) para cuentas, roles, sincronización, dos anotadores, marcador público y respaldo en la nube.
- Sin Supabase la app funciona completa en el dispositivo (modo local).

---

## Qué incluye

| Área | Funciones |
|---|---|
| Cuentas y clubes | Correo/contraseña, enlace mágico y Google · varios clubes, equipos, categorías y temporadas · roles: administrador, entrenador, anotador, jugador, aficionado (solo lectura) · invitaciones por código |
| Plantillas y rivales | Foto, número, posición, estado (activo/lesionado/inactivo) · carga rápida pegando la lista · base de rivales reutilizable (con sus jugadores opcionales) · ligas, torneos y calendario |
| Registro en vivo | 5x5 y 3x3 · periodos, minutos y prórroga configurables · tocar jugador→acción, acción→jugador o **arrastrar** jugador a la acción · niveles **Básico / Avanzado / Pro** · tiros de 2, 3 y libres, rebotes O/D (y de equipo), asistencias, robos, tapones, pérdidas (pasos, dobles, mal pase…), pérdidas forzadas, faltas personales/técnicas/antideportivas/en ataque, faltas recibidas · ubicación del tiro tocando la cancha · preguntas automáticas de asistencia, rebote, tapón, tipo de falta y tiros libres · reloj, tiempos muertos y faltas de equipo con bonus · cambios con quinteto en cancha · deshacer, editar y agregar acciones en cualquier minuto · dos anotadores a la vez (tiempo real) · funciona sin internet |
| Estadísticas | Box score en vivo con +/-, EFF y PIR · mapa de tiros y de calor por zona y jugador · posesiones, ritmo, eficiencia ofensiva y defensiva, eFG%, TS%, factores · ranking +/- por quinteto · equipo vs equipo y jugador vs jugador · totales, promedios y por 36 min · evolución del marcador, rachas, cambios de líder |
| Panel web | Gestión de clubes, equipos, plantillas, ligas y temporadas · análisis con filtros por equipo, rival, temporada, competición y fechas · planificación de entrenamientos con asistencia y biblioteca de ejercicios propia |
| Compartir y exportar | Marcador en vivo por enlace público · resumen en imagen (WhatsApp/redes) y PDF · CSV y Excel (box, jugadas, quintetos, temporada) para análisis o Power BI · respaldo en archivo JSON y en la nube |
| Idioma y accesibilidad | Español por defecto, inglés · modo oscuro/claro · botones grandes, alto contraste, uso con una mano |

### Fórmulas
- **EFF** = PTS + REB + AST + ROB + TAP − (TCI − TC) − (TLI − TL) − PÉR
- **PIR** = PTS + REB + AST + ROB + TAP + FR − (tiros de campo fallados + TL fallados + PÉR + tapones recibidos + FC)
- **Posesiones** = TCI − RO + PÉR + 0,44·TLI · **Ef. ofensiva/defensiva** = puntos cada 100 posesiones · **Ritmo** = posesiones escaladas a un partido completo
- **+/-** y minutos se calculan a partir del quinteto inicial y los cambios registrados.

---

## 1. Probar en tu computadora

Requisitos: Node 20+.

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 45 pruebas del motor de estadísticas
npm run build        # genera out/ (estático) + lista de precache del service worker
npm run test:e2e     # simula un partido completo en un celular (requiere build y Playwright)
```

> El modo sin conexión (service worker) solo se activa en el build de producción, no en `npm run dev`.

## 2. Configurar Supabase (cuentas, nube, dos anotadores, marcador público)

Es opcional: sin este paso la app funciona en modo local.

1. Crea una cuenta en <https://supabase.com> → **New project** (elige región cercana, guarda la contraseña de la base).
2. En el proyecto: **SQL Editor → New query**, pega todo el contenido de [`supabase/schema.sql`](supabase/schema.sql) y pulsa **Run**. Crea las tablas, la seguridad por roles (RLS) y el tiempo real. Se puede volver a ejecutar sin perder datos.
3. **Project Settings → API**: copia **Project URL** y la clave **anon public**.
4. **Authentication → URL Configuration**:
   - *Site URL*: la URL de Vercel (ej. `https://rebote.vercel.app`).
   - *Redirect URLs*: agrega `https://rebote.vercel.app/**` y `http://localhost:3000/**`.
5. (Opcional) **Google**: *Authentication → Providers → Google* → activar. Necesitas un *Client ID* y *Secret* de Google Cloud Console (*APIs y servicios → Credenciales → ID de cliente OAuth → Aplicación web*), con el URI de redirección que muestra Supabase (`https://<tu-proyecto>.supabase.co/auth/v1/callback`).
6. (Opcional) En *Authentication → Providers → Email* puedes desactivar "Confirm email" para entrar sin confirmar el correo durante las pruebas.
7. Para desarrollo local, copia `.env.example` a `.env.local` y completa:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```

## 3. Desplegar en Vercel

1. Entra a <https://vercel.com> con tu cuenta de GitHub → **Add New → Project** → importa el repositorio.
2. Framework: **Next.js** (se detecta solo; `vercel.json` ya indica `npm run build` y la carpeta `out`).
3. **Environment Variables**: agrega `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (para Production, Preview y Development). Si no las agregas, la app queda en modo local.
4. **Deploy**. Al terminar tendrás una URL tipo `https://rebote-xxxx.vercel.app`.
5. (Opcional) **Settings → Domains** para un dominio propio. Recuerda agregarlo también en las *Redirect URLs* de Supabase.
6. Cada `git push` a la rama principal vuelve a desplegar automáticamente.

## 4. Instalar en el celular

- **Android (Chrome)**: abre la URL de Vercel → menú ⋮ → **Instalar app** (o *Agregar a pantalla principal*). También aparece un botón en *Ajustes → Instalar Rebote*.
- **iPhone (Safari)**: abre la URL → botón **Compartir** → **Agregar a pantalla de inicio**.
- Abre la app instalada **una vez con internet** para que quede guardada; desde ahí abre y anota sin señal.

## 5. Checklist para la prueba del domingo

1. **Antes del partido (con internet)**
   - Abrir la app, crear el club, el equipo y cargar la plantilla (*Club → Plantilla → Carga rápida*).
   - Si usas nube: iniciar sesión (Ajustes) e invitar al segundo anotador (*Club → Miembros → Generar código* con rol anotador).
   - Instalar la app en el celular y abrirla una vez.
   - *Partidos → Nuevo*: rival, formato 5x5, nivel **Avanzado** (o **Básico** si anotas solo), convocados.
2. **Probar el modo sin conexión**: activar modo avión, abrir la app, entrar al partido y registrar un par de acciones; deshacerlas. El indicador superior muestra "Sin conexión".
3. **Durante el partido**: elegir quinteto inicial · tocar el reloj para iniciar/parar · tocar jugador y luego la acción (o arrastrar) · *Cambios* para sustituciones · *Deshacer* ante errores · *Jugadas* para corregir o agregar acciones a cualquier minuto.
4. **Al terminar**: menú ☰ → *Finalizar partido* → revisar **Box score**, **Tiros** (mapa) y **Exportar** (imagen para WhatsApp, PDF, CSV/Excel).
5. **Anotar fallos y mejoras** para la siguiente iteración.

---

## Arquitectura

```
src/
  app/                 Pantallas (exportación estática; los ids van en ?id=)
    page.tsx           Inicio / alta del club
    club/ team/ opponents/   Club, equipos, temporadas, ligas, miembros, plantilla, rivales
    games/ games/new/  Lista y creación de partidos
    game/live/         Registro en vivo (anotador)
    game/              Box score, tiros, análisis, jugadas, exportación
    stats/ player/     Análisis de temporada y perfil de jugador
    trainings/         Sesiones y biblioteca de ejercicios
    live/              Marcador público (?g=<partido>)
    settings/ login/   Idioma, tema, instalación, cuenta, nube y respaldo
  lib/
    types.ts           Modelo de datos
    db.ts              IndexedDB (Dexie) + cola de sincronización (outbox)
    sync.ts            Sincronización con Supabase, tiempo real, invitaciones
    stats.ts           Motor de estadísticas (event sourcing) + pruebas
    court.ts           Geometría FIBA de la cancha y zonas + pruebas
    aggregate.ts       Agregados de temporada
    export.ts          CSV, Excel, imagen, PDF
supabase/schema.sql    Tablas, RLS por rol, funciones e inscripción al tiempo real
public/sw.js           Service worker (precache de toda la app)
tests/e2e/             Simulación de partido completo con Playwright
```

**Modelo**: cada partido es una lista de eventos (`events`). Todas las estadísticas se derivan de esos eventos, por eso deshacer, editar o insertar una acción en cualquier minuto recalcula todo de forma consistente. Los eventos de dos anotadores se combinan por id (sin conflictos) y el resto de documentos usa "última escritura gana".
