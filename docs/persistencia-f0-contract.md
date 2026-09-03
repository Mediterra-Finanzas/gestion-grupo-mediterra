# F0 — Contrato único de persistencia a `calendario_data`

Fecha: 2026-09-02 · Alcance: **LOCAL, solo archivos NUEVOS**. No se aplicó ningún parche a
`App.jsx`, `FinanzasModule.jsx`, `AllegriaModule.jsx`, `EEFFModule.jsx`, `friskuHelpers.js`
ni a los módulos existentes. No se desplegó ni se probó en vivo nada. Este documento
**especifica** los diffs de migración; NO los aplica.

Resuelve el veredicto **C — transversal** del RCA (`docs/persistencia-rca.md`): el invariante

> UI "guardado" = el backend confirmó la persistencia autoritativa. Ante fallo el estado
> queda dirty/error, el usuario se entera, nada se descarta, el retry es seguro y no hay
> overwrite silencioso.

deja de depender de que cada módulo traiga su propio `dbSave`. Se centraliza en una
capability reutilizable que cubre **filas-blob** (objeto anidado no fusionable:
`finanzas`, `finanzas_esc_*`, `main`, `pins`, `allegria`, `osiris`) y **filas-colección**
(arreglo de ítems con `id`: `rendiciones`, `maestro_*`).

- Capability: **`src/persistencia/persistContract.js`**
- Harness: **`tests/persistencia-contract/`** (PERSIST-01..15 = **15/15 verde** + 2 extras de colección)
- Referencias del contrato BUENO ya existente: `src/friskuHelpers.js` (`dbSaveGeneric`),
  `src/OsirisModule.jsx` (`dbSaveOsiris`), `src/friskuPersistencia.js` (fusión por ítem),
  `src/AvisoPersistencia.jsx` (aviso en pantalla).

---

## 1. API de la capability

```js
import { crearPersistencia, construirAvisoDesde, MOTIVOS } from "./persistencia/persistContract";

// Una instancia por app (estado versión/base/dirty/cola por-fila, NO globales de módulo).
const P = crearPersistencia();          // usa SUPA_URL/KEY productivas + fetch global
// const P = crearPersistencia({ fetch, supaUrl, supaKey, logger }); // inyectable para tests
```

| Método | Qué hace | Devuelve |
|---|---|---|
| `await P.load(id)` | Lee la fila. **Lanza** ante red/HTTP (Regla 9). Registra versión+base, habilita el guardado, deja `dirty=false`. | `{ok, existe, value, version}` |
| `P.registrarCarga(id, value, version)` | Registra una lectura hecha por otra ruta (p. ej. `App.jsx` que ya carga `main`) para habilitar el guardado sin releer. | — |
| `await P.saveConfirmed(id, next, opts)` | **Núcleo.** Serializa+coalesce por id; escritura condicionada por versión, confirmada por el servidor; fusión por ítem si `opts.merge`. `next` = valor **o** función `(baseFresca)=>valor`. | `{ok:true, value, version, fusionado?, sinCambios?, superseded?}` · `{ok:false, motivo, ...}` |
| `await P.flush(id)` | Espera la cola pendiente y reporta el estado **real** (para `beforeunload`/`visibilitychange`). Nunca finge éxito. | `{ok, pendiente}` |
| `P.reconcileIncoming(id, remoteValue, remoteVersion, opts)` | Guardia realtime/poll: aplica lo entrante **solo si no hay dirty local**; con `opts.merge`+`opts.localValue` intenta fusión no destructiva. | `{apply, value?, fusionado?, dirty?, motivo?}` |
| `P.isDirty(id)` / `P.marcarSucio(id)` / `P.marcarLimpio(id)` | Estado de "edición local sin confirmar". | bool / — |
| `P.estado(id)` / `P.reset(id)` | Diagnóstico / limpieza (tests). | `{version, base, cargaOk, dirty}` |
| `construirAvisoDesde(id, resultado, etiqueta)` | Traduce el resultado a un aviso de pantalla (mismo shape que `AvisoPersistencia.construirAviso`). `null` si no hay que avisar. | `{tipo, texto, ...}` \| `null` |

`opts` de `saveConfirmed`: `{ merge: bool, intentos: number=2 }`.

### Contrato de `saveConfirmed` (los 15 requisitos)

1. **"saved" solo tras confirmación** — se declara `ok:true` únicamente cuando el servidor
   devuelve la fila escrita con `updated_at` (return=representation). 
2. **Fallo ⇒ dirty/error, nunca saved** — cualquier `{ok:false}` deja `dirty=true`.
3. **Nunca resolver éxito sin escritura real** — no hay gates que devuelvan `true`. Una
   solicitud superada por otra posterior devuelve `{ok:true, superseded:true}`, que **no**
   es "guardado a backend" (su valor lo persiste la solicitud que la superó) y
   `construirAvisoDesde` lo trata como no-avisar sin declarar persistencia.
4. **Sin `.catch(()=>{})`** — el `catch` registra y devuelve `{ok:false, motivo:"red"}`.
5. **Concurrencia optimista** — `PATCH ...&updated_at=eq.<version leída>`.
6. **Detecta conflicto antes de sobrescribir** — 0 filas devueltas por el PATCH = la versión
   ya cambió = conflicto; no se pisa.
7. **Sin LWW silencioso** — conflicto explícito (`{ok:false}`) o fusión por ítem en colecciones.
8. **Dirty local protegido** — `reconcileIncoming` no aplica lo entrante si `isDirty`.
9. **Save lento + edición nueva** — cola serializada + coalescencia: el último valor deseado
   es el que escribe; los intermedios se marcan `superseded` sin pérdida.
10. **Retry idempotente** — si el servidor ya tiene lo que queríamos, `{ok:true, sinCambios:true}`.
11. **Usuario informado** — `construirAvisoDesde` + `<AvisoPersistencia>`.
12. **Navegación/unload** — `flush` devuelve el resultado real; sin `resolve(true)`.
13. **401/403/timeout/red** — `{ok:false, motivo:"http"|status}` / `{motivo:"red"}`; jamás éxito.
14. **2xx sin fila/versión** — representación sin `updated_at` o con `id` distinto ⇒
    `{ok:false, motivo:"sin_confirmacion"}`.
15. **Logs sin datos sensibles** — solo id, estado, tamaño en KB y versión truncada; nunca `value`.

---

## 2. Estrategia de concurrencia + realtime

**Filas-blob** (`finanzas`, `main`, `pins`, `allegria`, `osiris`, `finanzas_esc_*`): el valor es
un objeto anidado, no fusionable por ítem. Concurrencia = **optimistic lock por `updated_at`**.
Al guardar se condiciona el PATCH a la versión leída; si otro escribió, PostgREST actualiza 0
filas → conflicto. Dos opciones para el caller:
- `next` como **valor** → conflicto se reporta (`{ok:false, motivo:"conflicto", valorServidor}`),
  se muestra `AvisoPersistencia` "Recargar". Nunca se pisa.
- `next` como **función `(baseFresca)=>valor`** → la capability recomputa el cambio local sobre
  la versión fresca del servidor y reintenta. Recomendado para autosave del flujo, donde cada
  edición toca una celda: la recomputación re-aplica esa celda sobre lo que dejó el otro
  usuario, y **ambos sobreviven** (probado en PERSIST-05/06/11).

**Filas-colección** (`rendiciones`, `maestro_*`): `opts.merge:true`. Ante conflicto se hace la
**fusión de tres vías por `id`** de `friskuPersistencia.fusionarPorId` (base = lo que leí, mío =
lo que guardo, servidor = lo que hay). Solo si dos personas tocan el MISMO ítem hay conflicto sin
resolver; el resto se combina sin pérdida.

**Realtime / poll**: el handler entrante llama `reconcileIncoming(id, valor, version, opts)` en
vez de aplicar directo:
- `dirty=false` → aplica lo entrante y actualiza versión/base.
- `dirty=true`, colección con `localValue` → fusiona; si limpio, aplica el merge; si choca, no
  aplica y señala conflicto.
- `dirty=true`, blob → **no aplica** (protege la edición local); solo adopta la versión entrante
  para que el próximo `saveConfirmed` detecte el conflicto en vez de pisar en silencio.

**Coalescencia (save lento)**: `saveConfirmed` encadena por id. Si llegan varias ediciones
mientras una está en vuelo, todas actualizan "el valor deseado" y bumpean una generación; al
drenar la cola, solo la última generación escribe. El `dirty` se limpia únicamente cuando la
**última** solicitud obtiene confirmación del backend.

**Regla 9**: `load` lanza ante fallo (no devuelve defaults). `saveConfirmed` bloquea si no hubo
`load`/`registrarCarga` exitoso (`{ok:false, motivo:"sin_carga"}`). Igual que hoy en Osiris/Frisku.

---

## 3. Auditoría de TODOS los writers de `calendario_data` (A/B/C)

Clasificación: **A** = cumple el invariante · **B** = parcial (verifica algo pero sin
concurrencia optimista / confirma a medias / traga en algún camino) · **C** = no cumple
(LWW + error tragado + sin confirmación). Relacional `acc_*`/`proc_*`/`anf_*`/`doc_sii_*` NO es
el contrato blob de `calendario_data` (tablas propias); se anota aparte.

| # | Writer | Fila(s) | file:line | Clase | Motivo |
|---|---|---|---|---|---|
| 1 | `friskuHelpers.dbSaveGeneric` | `rendiciones`, `frisku_*`, `maestro_*` | `friskuHelpers.js:140-197` (`_escribirCondicionado :88-108`) | **A** | PATCH condicional + confirma + fusión por ítem + devuelve `{ok,motivo}` |
| 2 | `OsirisModule.dbSaveOsiris` | `osiris` | `OsirisModule.jsx:49-145` | **A** | optimistic lock + confirma + Regla 9 + `{ok,motivo}` |
| 3 | `FinanzasModule.dbSave` | `finanzas`, `finanzas_esc_*`, `finanzas_bancos` | `FinanzasModule.jsx:90-109` | **C** | POST merge-duplicates, **sin `updated_at`** (`:92`), traga→`false` (`:99-108`), sin confirmación, LWW |
| 3b | `FinanzasModule.persistAll` | (ruteo) | `FinanzasModule.jsx:11671-11714` | **C** | `resolve(true)` sin escribir en ventana 10 s (`:11679-11682`) y escenario sin base (`:11708-11711`) |
| 4 | `App.dbSave` | `main` | `App.jsx:175-209` | **B** | envía `updated_at` (`:207`) pero `catch console.error` (`:209`), **no** verifica `res.ok`, LWW |
| 5 | `App.dbSavePins` | `pins` | `App.jsx:235-250` | **B** | idem: envía `updated_at` (`:248`), traga (`:250`), sin `res.ok`, LWW |
| 6 | `App.auditSave` | `audit_log` | `App.jsx:312-326` | **B** | envía `updated_at`, traga `catch` (`:326`), sin `res.ok`; log append-only (riesgo menor) |
| 7 | `App` backup diario | `backup_<fecha>` | `App.jsx:2408-2413` | **B/infra** | POST merge, sin `res.ok`; snapshot infra, no dato de usuario en vivo |
| 8 | `App` migración osiris/main | `osiris`, `main` | `App.jsx:2339-2352` | **B/infra** | POST merge one-shot, `catch warn` (`:2354`), sin `res.ok` |
| 9 | `App` export/restore | todas | `App.jsx:1680-1690` | **B/infra** | restore manual, POST merge, `catch` (`:1690`) |
| 10 | `AllegriaModule.dbSaveAllegria` | `allegria` | `AllegriaModule.jsx:~236-260` (POST `:254`) | **C** | traga (`:260`), no verifica `res.ok`, LWW; solo heurística "3+ arrays caídos" (`:242-250`) |
| 11 | `eeffHelpers.guardarEEFF` | `eeff_<emp>_<a>_<m>` | `eeffHelpers.js:348` | **B** | POST merge; verifica `res.ok` pero **sin optimistic lock** ni fusión; filas por-clave reducen colisión |
| 12 | `eeffHelpers.dbSavePlanMaestro` | `maestro_plan_cuentas` | `eeffHelpers.js:261` | **C** | POST merge **read-modify-write** sin versión → LWW sobre el plan compartido |
| 13 | `eeffHelpers.dbSaveCategoriasAuxiliar` | `maestro_plan_cuentas` | `eeffHelpers.js:782,793` | **C** | lee-modifica-escribe sin lock; pisa a `dbSavePlanMaestro` concurrente |
| 14 | `eeffHelpers` guardarMayor/Ppto/Terceros | `mayor_*`, `ppto_*`, `terceros_maestro` | `eeffHelpers.js:533,588,750,948` | **B** | POST merge, verifica `res.ok`, sin lock |
| 15 | `FinanzasModule.dbSaveNominas` (v1) | `nominas`, `nominas_*` | `FinanzasModule.jsx:12779-12815` | **C** | POST merge, LWW, no siempre confirma |
| 16 | `FinanzasModule` nóminas v2 save | `nominas_*` | `FinanzasModule.jsx:15036-15042` | **B** | verifica `res.ok` (throw) + keepalive `beforeunload`, pero LWW sin lock |
| 17 | `FinanzasModule.dbSaveTiposDocExtra` | `nominas_tipos_doc` | `FinanzasModule.jsx:12830-12834` | **C** | POST merge fire-and-forget, sin `res.ok`, sin await del resultado |
| 18 | `ContabilidadModule` supaFetch (`contab_*`, `doc_sii_staging`) | relacional | `ContabilidadModule.jsx:14-22` | **A (relacional)** | verifica `res.ok`+throw; tabla propia, no blob |
| 19 | `proceso/core/procesoDB` (`proc_*`) | relacional | `procesoDB.js:42-73` | **A (relacional)** | verifica `res.ok`+throw; RPC/PATCH; tabla propia |
| 20 | `anf/anfPersistence` (`anf_*`) | relacional | `anfPersistence.js:*` | **A (relacional)** | verifica `res.ok`+throw en cada verbo; tabla propia |
| 21 | `guardClient.pollRow` | (lectura) | `guardClient.js:115-133` | lectura | poll de sincronización; aplica entrante sin dirty-guard (ver §4) |

**Total writers al blob `calendario_data`: 17 rutas** (más que las 6 conocidas). Nuevas
detectadas respecto del RCA: `App.auditSave` (6), backup/migración/restore de `App` (7-9),
`eeffHelpers` plan/categorías/mayor/ppto/terceros (11-14), nóminas v2 y `tipos_doc` (16-17). Las
relacionales (18-20) ya son seguras a nivel de transporte pero no usan optimistic lock.

---

## 4. Diffs de migración (ESPECIFICADOS — NO aplicados)

Patrón general para cada writer: reemplazar el `dbSave*` propio por la instancia compartida.
Crear una sola instancia por app (p. ej. `src/persistencia/instancia.js` con
`export const persist = crearPersistencia();`) e importarla donde haga falta. Cada módulo:
`await persist.load(id)` en el montaje (dentro del try que ya fija `cargaOkRef`), y
`await persist.saveConfirmed(id, ...)` en cada guardado, mostrando `construirAvisoDesde` cuando
`!ok`.

> App.jsx y los módulos los aplica **otro agente** en F0-B secuenciado. Aquí va la especificación
> exacta.

### 4.1 `FinanzasModule.dbSave` + `persistAll` (writer 3/3b — el más grave)

- **Eliminar** la ventana de falso-éxito y la rama escenario-sin-base:
  - `:11679-11682` (`return Promise.resolve(true)`) → borrar; el gate real es `cargaOkRef`
    (`:11674`), suficiente. Si de verdad se quiere una gracia post-carga, encolar y reintentar,
    nunca devolver éxito.
  - `:11708-11711` (`return Promise.resolve(true)`) → devolver `{ok:false, motivo:"sin_base"}`.
- **Reemplazar `dbSave` (`:90-109`)** por `persist.saveConfirmed`:
  - Base: `return persist.saveConfirmed("finanzas", (baseFresca)=> buildBlobDesde(baseFresca, overrides), {})`.
    Pasar el blob como **función** `(baseFresca)=>...` para que, ante conflicto, el flujo recompute
    sus overrides sobre la versión fresca (concurrencia sin pérdida entre pestañas/usuarios).
  - Escenario: `persist.saveConfirmed(activeRowRef.current, {_overlay:true, data:computeOverlay(base, blob)})`.
  - `handleSaveReal` (`:11816-11826`): `const r = await persistAll(...); setSaved(r.ok? "✅ Guardado":"⚠️ Error"); if(!r.ok) setAviso(construirAvisoDesde(activeRowRef.current, r));`
- **Realtime** (`:11524-11563`) y **poll**: en el handler entrante, en vez de `applyData(d)` directo,
  usar `const dec = persist.reconcileIncoming("finanzas", d, version); if(dec.apply) applyData(dec.value);`
  y marcar `persist.marcarSucio("finanzas")` al empezar a editar (en `handleSaveReal` antes del await).
- **beforeunload**: `window.addEventListener("beforeunload", ()=>{ persist.flush("finanzas"); })`.
- Quitar la dependencia de `window._finLoadTime` (`:11508/11776/11802`).

### 4.2 `App.dbSave(main)` (writer 4)

```
// App.jsx:175-209  (dbSave)
- POST merge-duplicates + catch console.error, sin res.ok
+ return persist.saveConfirmed("main", (base)=> value, {});   // value = objeto completo de main
```
En la carga de `main` (donde hoy se fija el estado), añadir `persist.registrarCarga("main", d, updated_at)`
usando el `updated_at` de la lectura (hoy `dbLoad` no lo devuelve → cambiar el `select` a
`value,updated_at`). El realtime de `main` (`App.jsx:2485-2510`, `applyData :2377-2400`) pasa por
`persist.reconcileIncoming("main", ...)`.

### 4.3 `App.dbSavePins` (writer 5)

```
// App.jsx:235-250
- await fetch(POST merge) + catch
+ const r = await persist.saveConfirmed("pins", pins, {}); if(!r.ok) /* avisar / reintentar */;
```
`pins` es sensible: se mantiene la ruta de auth vigente tal cual. El contrato NO
cambia el modelo de auth; solo garantiza confirmación de la fila cuando el path client-side está
activo.

### 4.4 `AllegriaModule.dbSaveAllegria` (writer 10)

```
// AllegriaModule.jsx:236-260
- POST merge + catch, heurística "3+ arrays caídos"
+ return persist.saveConfirmed("allegria", (base)=> value, {});   // blob → función para recompute
```
La heurística anti-borrado se vuelve redundante con el optimistic lock + Regla 9 (la carga ya
lanza), pero puede conservarse como cinturón extra antes del `saveConfirmed`.

### 4.5 EEFF (writers 11-14)

- Filas por-clave (`eeff_*`, `mayor_*`, `ppto_*`): `persist.saveConfirmed(id, value)` (blob por
  documento; colisión baja pero el lock cierra la ventana). Ya verifican `res.ok`; el cambio
  agrega confirmación por versión.
- **`maestro_plan_cuentas` (12/13) es el urgente**: dos funciones hacen read-modify-write sin lock
  sobre la MISMA fila compartida → se pisan. Migrar ambas a `persist.saveConfirmed("maestro_plan_cuentas",
  (base)=> ({...base, ...misCambios}))` con `next` **función**, para recomputar sobre la versión
  fresca. Reemplaza `.catch(()=>{})` de `EEFFModule.jsx:828,839,848,857,906`.

### 4.6 Nóminas (writers 15-17)

- v1 `dbSaveNominas` (`:12779-12815`): migrar a `saveConfirmed` por fila `nominas_<slug>`.
- v2 (`:15036`): ya throw-ea en `!res.ok`; envolver en `saveConfirmed` para sumar optimistic lock
  y confirmación. Mantener el flush `beforeunload` keepalive existente (`:15282-15287`) llamando
  `persist.flush`.
- `dbSaveTiposDocExtra` (`:12830`): `await persist.saveConfirmed("nominas_tipos_doc", tipos, {merge:true})`.

### 4.7 `App.auditSave` / backup / migración (writers 6-9)

Append-only e infra. Migrar a `saveConfirmed` por consistencia y para no tragar el error, pero
**prioridad baja**: el `audit_log` es aditivo y el backup es idempotente por fecha. Registrar como
deuda si no entran antes del go-live (ver §5).

---

## 5. Residual y deuda

Ningún writer del blob `calendario_data` puede quedar en clase C tras F0-B. Prioridad de migración
para go-live:

1. **Bloqueantes (C con dato de usuario en vivo)**: `FinanzasModule.dbSave`/`persistAll` (3/3b),
   `AllegriaModule` (10), `eeffHelpers` plan/categorías (12/13), nóminas v1 + `tipos_doc` (15/17).
2. **Alto (B con dato en vivo)**: `App.dbSave(main)` (4), `App.dbSavePins` (5), EEFF resto (11/14),
   nóminas v2 (16).
3. **Deuda registrable (infra/append-only)**: `App.auditSave` (6), backup/migración/restore (7-9).
   Si no entran antes del go-live: aislarlos documentando que son append-only/idempotentes y que su
   fallo no produce pérdida silenciosa de dato de usuario editable. NUNCA dejarlos como C sin nota.
4. **Relacionales (18-20)**: ya seguras a nivel de transporte. Deuda menor: adoptar optimistic
   lock donde haya edición concurrente del mismo registro (fuera del alcance de F0).

`guardClient.pollRow` (21) debe enrutar su callback por `reconcileIncoming` para no clobbear dirty
local bajo `USE_GUARD` (mismo fix que el realtime del §4.1).

---

## 6. Cómo verificar

```bash
node tests/persistencia-contract/persistContract.harness.test.mjs   # → 15/15 (+2 extras) verde
node tests/persistencia/persist.harness.test.mjs                    # → sigue 7/7 rojo (código viejo)
```

El primer harness prueba la capability NUEVA (15/15). El segundo (preexistente) sigue reproduciendo
el código viejo en rojo a propósito, hasta que F0-B enrute los writers por la capability. Nada de
esto se probó en vivo ni se desplegó.
