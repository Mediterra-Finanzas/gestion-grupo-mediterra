# RCA — Persistencia Finanzas / Flujo (P0-B, GO-LIVE BLOCKER)

Fecha: 2026-09-02 · Alcance: LOCAL/STAGING, solo lectura de fuentes + archivos nuevos.
No se mutó PROD, no se reconstruyeron datos, no se aplicaron parches a `App.jsx` / `FinanzasModule.jsx`.

## Incidente

- Fila `calendario_data` id=`finanzas` con `updated_at = 2026-04-13` (abril).
- Ediciones de flujo del CFO de hoy al mediodía **no aparecen** en la fila `finanzas`.
- Un cambio de prueba controlado **sí** persistió bajo la RLS recién aplicada.
- Los timestamps del incidente **preceden** al trabajo de RLS/seguridad → la RLS no es la causa.

Conclusión operativa: el mecanismo de escritura funciona (la prueba persistió). La pérdida es **de comportamiento** (una ruta de guardado silenciosa o mal enrutada), no de infraestructura. Y la app puede mostrar "✅ Guardado" sin que exista una escritura confirmada al backend.

---

## Mapa de la ruta de persistencia del flujo

Fuente de verdad del flujo = fila `calendario_data` id=`finanzas` (blob único ~4.4 MB). Filas relacionadas:

| Fila | Escrita por | Contenido |
|---|---|---|
| `finanzas` | `FinanzasModule.jsx` `dbSave(blob,"finanzas")` | blob completo del flujo Base (`finanzas_real`, `params_*`, `sub_lines`, `added_lines`, `creditos_data`, `intercompany`, …) |
| `finanzas_esc_<id>` | `dbSave({_overlay:true,data:overlay}, rowId)` | **overlay/diff** de cada escenario "Modelo" vs Base |
| `finanzas_esc_index` | `dbSave({escenarios},"finanzas_esc_index")` | catálogo de escenarios |
| `finanzas_bancos` | `dbSaveBancos` | saldos de bancos (fila compartida, fuera del blob) |
| `nominas` / `nominas_<emp>` | `dbSaveNominas` | nóminas (ruta propia, con beforeunload keepalive) |

Flujo de una edición de celda (`handleSaveReal`, `FinanzasModule.jsx:11816`):

```
UI edita celda
  → setRealData(next) + realDataRef.current = next          (11821-11822)
  → ok = await persistAll({ finanzas_real: next })          (11823)
        persistAll (11671):
          if(!cargaOkRef.current) return Promise.resolve(false)          // 11674
          if(Date.now()-window._finLoadTime < 10000) return resolve(true)// 11679  ← NO GUARDA, DEVUELVE ÉXITO
          blob = {...refs...}                                            // 11683
          if(activeRowRef.current === "finanzas") dbSave(blob,"finanzas")// 11701-11703
          else dbSave({_overlay,data:computeOverlay(base,blob)}, esc)    // 11712-11713 ← ESCRIBE A OTRA FILA
        dbSave (90): POST upsert merge-duplicates; body SIN updated_at    // 92
                     if(!r.ok) return false;  catch return false         // 99-108 (traga el error)
  → setSaved(ok ? "✅ Guardado" : "⚠️ Error"); borra a los 3s            (11824-11825)
```

Sincronización entrante: con `USE_GUARD` → `pollRow("finanzas", applyData)` cada 8 s (`guardClient.js:115`); sin guard → WebSocket realtime (`FinanzasModule.jsx:11526-11563`). Ambos llaman `applyData(d)` **sin comprobar si hay edición local sin guardar**.

---

## Hipótesis de causa raíz (ranqueadas, con evidencia)

### R1 — Las ediciones se escribieron a una fila de escenario (`finanzas_esc_<id>`), no a `finanzas`  · MÁS PROBABLE para "no está en la fila finanzas"

`persistAll` enruta **toda** la escritura según `activeRowRef.current`:

- `FinanzasModule.jsx:11701-11704` → si es `"finanzas"`, guarda el blob en la fila `finanzas`.
- `FinanzasModule.jsx:11712-11713` → si es un escenario, guarda **solo el overlay** en `finanzas_esc_<id>`.

Si el CFO tenía activo un "Modelo"/escenario (selector de escenarios en Flujo — ver memoria *Escenarios del flujo*), sus ediciones del mediodía se guardaron como overlay en `finanzas_esc_<id>` y la fila `finanzas` queda legítimamente intacta. Esto explica exactamente "no aparecen en la fila `finanzas`" y es **recuperable** leyendo las filas `finanzas_esc_*` (ver §Recuperabilidad). `activeRowRef` arranca en `"finanzas"` en cada montaje (`11160`), así que requiere que el CFO haya cambiado a un escenario en la sesión.

### R2 — Bloqueo de 10 s post-carga que DEVUELVE ÉXITO sin guardar  · VIOLACIÓN DE INVARIANTE, confirmada en código

```js
// FinanzasModule.jsx:11679-11682
if(window._finLoadTime && (Date.now() - window._finLoadTime) < 10000) {
  console.log("[persistAll] Bloqueado — app aún cargando");
  return Promise.resolve(true); // simular éxito para no mostrar error
}
```

Cualquier edición en los **10 s siguientes** a que `window._finLoadTime` se fijó se **descarta** y `persistAll` devuelve `true`. `handleSaveReal` entonces muestra "✅ Guardado" (11824) sin que haya existido escritura. `window._finLoadTime` es **global** y se re-arma en cada:
- montaje del módulo (`11508`),
- `switchEscenario` (`11776`) — al cambiar de Modelo o volver a Base,
- `crearEscenario` (`11802`).

Es decir, cada vez que el CFO entra a Finanzas o cambia de Modelo, se abre una ventana de 10 s en la que sus ediciones se pierden **mostrando el check verde**. Es una violación directa del invariante "saved = confirmado por backend".

### R3 — `updated_at = abril` es probablemente un ARTEFACTO, no prueba de que las escrituras pararon en abril

El `dbSave` del flujo **no envía `updated_at`**:

```js
// FinanzasModule.jsx:92
const body = JSON.stringify({ id:rowId, value:JSON.stringify(data) });   // sin updated_at
```

mientras que el `dbSave` de `App.jsx` **sí** lo envía (`App.jsx:164`). El upsert `resolution=merge-duplicates` (INSERT … ON CONFLICT DO UPDATE) solo actualiza las columnas provistas; si no hay trigger `BEFORE UPDATE` que refresque `updated_at`, la columna **queda congelada en la fecha del último INSERT** aunque el `value` se siga actualizando en cada guardado exitoso. Por tanto:

- `updated_at = 2026-04-13` puede reflejar el último INSERT (creación de la fila), no el último guardado.
- No se puede inferir "no se guardó desde abril" a partir del timestamp. Hay que mirar el **contenido** de `value`.
- Además, la sincronización por `pollRow` detecta cambios **por `updated_at`** (`guardClient.js:126`): si el timestamp nunca cambia, ni el poll ni el auto-registro `__selfWrites` (que también lee `rec.updated_at`, `guardClient.js:81`) funcionan para la fila `finanzas` → el guard anti-eco no protege esta fila.

### R4 — Sobre-escritura last-write-wins + clobber de estado local sucio por poll/realtime

El `dbSave` del flujo reemplaza la **fila entera** sin control de concurrencia, sin `updated_at` de guardia y sin la fusión por ítem de `friskuPersistencia.js` (que sí usan Rendiciones/Maestros). El blob del flujo es un objeto anidado, no una lista con `id`, así que **no puede** usar esa fusión. Consecuencias:

- Dos pestañas / dos usuarios editando `finanzas` → el último en guardar pisa al otro, sin aviso (`FinanzasModule.jsx:90-109`).
- El handler entrante aplica el estado del servidor **sin proteger la edición local**: realtime `applyData(d)` en `11558`, y `pollRow(..., applyData)` en `11519`. Si un cambio entrante llega mientras hay una edición sin guardar, `applyData` la revierte en memoria; el siguiente guardado escribe el estado revertido → pérdida.
- El anti-eco de `pollRow` (`guardClient.js:129-130`) compara contra `__selfWrites[id]`, que **nunca se puebla para `finanzas`** porque depende de `rec.updated_at` (guard `:81`) y el flujo no envía `updated_at`. → mayor riesgo de re-aplicar/pisar.

### R5 — Errores de guardado tragados en silencio; Finanzas no usa AvisoPersistencia

- `dbSave` traga el fallo HTTP y la excepción de red devolviendo `false` (`FinanzasModule.jsx:99-108`); no lanza, no avisa.
- `FinanzasModule.jsx` **no importa** `AvisoPersistencia` / `construirAviso` / `dbSaveGeneric` (sí lo hacen Rendiciones, Frisku, Maestros). El único feedback del flujo es un `setSaved("⚠️ Error")` efímero de 3 s (`11824-11825`) fácil de no ver, sin botón de recargar/reintentar.
- Varios guardados son *fire-and-forget* y **descartan el resultado**: `params_frisku` (`11854`) y `allegria_comision_arandanos` (`11861`) hacen `setTimeout(()=>persistAll(...),0)` sin `.then` → si `dbSave` devuelve `false`, nadie se entera.

### R6 — Rama de escenario que también "simula éxito" sin guardar

```js
// FinanzasModule.jsx:11708-11711
if(!baseBlobRef.current){
  console.warn("[persistAll] En escenario sin base cacheado — no se guarda el overlay.");
  return Promise.resolve(true);
}
```

Estando en un escenario, si `baseBlobRef.current` es nulo (p.ej. tras un fallo de carga del base), la escritura se descarta y devuelve `true` → "✅ Guardado" sin persistir.

### R7 — El reset global de `_finLoadTime` amplía la ventana de R2 en cada cambio de Modelo

`window._finLoadTime = Date.now()` se re-ejecuta en `switchEscenario` (`11776`) y `crearEscenario` (`11802`). Un CFO que trabaja saltando entre Modelos reabre la ventana ciega de 10 s (R2) cada vez.

---

## Lugares donde la UI declara "guardado/éxito" sin confirmación de backend

| # | Ubicación | Problema |
|---|---|---|
| 1 | `FinanzasModule.jsx:11679-11682` | ventana de 10 s: `return Promise.resolve(true)` sin guardar → check verde |
| 2 | `FinanzasModule.jsx:11708-11711` | escenario sin base: `return Promise.resolve(true)` sin guardar |
| 3 | `FinanzasModule.jsx:90-108` `dbSave` | traga HTTP≠2xx y excepción → `false` (sin lanzar, sin aviso persistente) |
| 4 | `FinanzasModule.jsx:11854, 11861` | `persistAll` fire-and-forget: descarta el `false`, sin feedback |
| 5 | `FinanzasModule.jsx:11824-11825` | "✅ Guardado" 3 s, sin AvisoPersistencia ni reintento |
| 6 | `App.jsx:132-166` `dbSave(main)` | traga la excepción (`catch console.error`), no confirma `res.ok` |
| 7 | `App.jsx:188-198` `dbSavePins` | idem: no verifica `res.ok` |

Nótese que el mecanismo maduro ya existe en el repo (`AvisoPersistencia.jsx` + `friskuPersistencia.js` fusión por ítem + `dbSaveGeneric`), pero **el flujo de Finanzas no lo usa**.

---

## Veredicto

Causa más probable de "las ediciones del mediodía no están en la fila `finanzas`", en orden:

1. **R1**: se escribieron a `finanzas_esc_<id>` porque había un Modelo/escenario activo (recuperable — revisar esas filas).
2. **R2**: se descartaron en la ventana de 10 s post-carga / post-cambio-de-Modelo, con check verde (no recuperable desde backend).

`updated_at = abril` **no es prueba** de que las escrituras pararon en abril (**R3**): el flujo no escribe `updated_at`, así que la columna sigue congelada en el último INSERT aunque el `value` se actualice. Hay que verificar el **contenido** del `value` y la existencia de trigger. R2/R3/R5/R6 están confirmados en el código como violaciones del invariante independientemente de cuál explique este incidente puntual.

Confirmación pendiente (requiere las sondas SQL de solo-lectura de abajo; ninguna probada en vivo por este agente).

---

## Auditoría del MECANISMO COMPARTIDO de persistencia (todos los módulos de `calendario_data`)

A pedido del CFO, no basta con la fila `finanzas`: se auditó cómo persisten **todos** los módulos que escriben en `calendario_data`. Hallazgo central: **no hay un único `dbSave` compartido**. Conviven **dos contratos** de persistencia, y los módulos de mayor valor están en el contrato malo.

### CONTRATO-BUENO (cumple el invariante)

Concurrencia optimista (PATCH condicional `updated_at=eq.<versión leída>`), envía `updated_at`, verifica `res.ok`, **confirma** la escritura contra el `updated_at` devuelto, fusiona por ítem ante conflicto, devuelve `{ok:false, motivo}` y **muestra `AvisoPersistencia`**. Si el save falla, el estado queda en error/dirty y el usuario se entera; nada se descarta.

| Implementación | Módulos que lo usan |
|---|---|
| `friskuHelpers.js` `dbSaveGeneric`/`dbLoadGeneric` (`:75-107`, `:110-193`) | Rendiciones, Frisku Comercial, Maestros Frisku (incl. `maestro_tc`) |
| `OsirisModule.jsx` `dbSaveOsiris` (`:49-141`) | Osiris (PATCH condicional `:102`, confirma `:131-136`) |

`dbLoadGeneric`/`dbLoadOsiris` **lanzan** ante error de red (`friskuHelpers.js:78`, `OsirisModule.jsx:40`) → respetan la Regla 9 (gate anti-borrado).

### CONTRATO-MALO (viola el invariante — last-write-wins + error tragado + sin confirmación)

Upsert `resolution=merge-duplicates` que **reemplaza la fila entera**, sin concurrencia optimista, sin fusión, sin verificar `res.ok`, **tragando la excepción** en `catch`, sin `AvisoPersistencia`. Realtime/poll aplican estado entrante sin proteger la edición local.

| Implementación | Fila(s) | Defectos (file:line) |
|---|---|---|
| `FinanzasModule.jsx` `dbSave` | `finanzas`, `finanzas_esc_*`, `finanzas_bancos` | LWW, traga → `false` (`:99-108`), **sin `updated_at`** (`:92`), simula-éxito 10 s (`:11679`) y en escenario sin base (`:11708`), sin aviso. **El peor.** |
| `App.jsx` `dbSave` | `main` (tareas/estados/config/supervisores) | traga excepción (`:166`), no verifica `res.ok`, LWW; realtime aplica entrante (`:2377-2400`) |
| `App.jsx` `dbSavePins` | `pins` | traga (`:198`), no verifica `res.ok` |
| `AllegriaModule.jsx` `dbSaveAllegria` | `allegria` | traga (`:260`), no verifica `res.ok`, LWW; solo heurística de "3+ arrays caídos" (`:242-250`) |
| `EEFFModule.jsx` (adapters de contabilidad) | filas `acc_*`/plan/mayor/terceros | mezcla `await` con *fire-and-forget* `.catch(()=>{})` (`:828,839,848,857,906`) → traga en silencio |
| Nóminas (`FinanzasModule.jsx`) | `nominas`, `nominas_*` | **parcial**: sí verifica `res.ok` en v2 (`:15042` lanza) y tiene flush `beforeunload` keepalive (`:15282-15287`); pero la v1 (`:12779-12815`) es LWW y no siempre confirma |

### Clasificación del defecto

- **A (exclusivo de Finanzas):** ventana de 10 s que simula éxito (`:11679`), rama de escenario que simula éxito (`:11708`), `dbSave` sin `updated_at` (`:92`), enrutamiento a `finanzas_esc_*` sin señal clara en UI, ausencia total de `AvisoPersistencia`. Finanzas es el caso más grave.
- **B (familia de módulos):** el patrón LWW-que-traga-el-error se repite en `App.jsx` (main+pins) y `AllegriaModule.jsx`, y parcialmente en EEFF y Nóminas v1.
- **C (transversal del contrato de `calendario_data`):** **VEREDICTO PRINCIPAL.** El invariante "UI 'guardado' = backend confirmó persistencia autoritativa" **no está garantizado a nivel de contrato**. Existe una implementación correcta (`dbSaveGeneric`/`dbSaveOsiris`), pero **no es obligatoria**: cada módulo trae su propio `dbSave` y los de mayor valor (Finanzas, main, pins, Allegria, partes de EEFF/Nóminas) escriben con LWW + error tragado + sin confirmación + sin protección contra clobber entrante. Cualquiera de ellos puede perder datos en silencio con dos pestañas/usuarios o con un fallo de red, mostrando éxito.

> ### 🚨 GO-LIVE BLOCKER TRANSVERSAL
> El defecto se ELEVA a **C — transversal**. No es un bug puntual de Finanzas. El contrato de persistencia de `calendario_data` no es uniforme ni seguro. Un fix solo-Finanzas **ocultaría** la falla del contrato general (varias filas siguen expuestas a pérdida silenciosa). El arreglo debe **corregir el contrato compartido**, no una fila.

---

## Recuperabilidad de las ediciones del mediodía (evaluación de SOLO LECTURA)

No se escribió ni reconstruyó nada. No se inventan valores.

| Vía | ¿Sobrevive? |
|---|---|
| Pestaña del CFO aún abierta | **SÍ, mejor opción**: `realData`/`realDataRef` en memoria; los valores están en pantalla. NO cerrar ni recargar esa pestaña. (Reingresar/forzar guardado sería una ESCRITURA — fuera de alcance; proponer al CFO.) |
| Fila `finanzas_esc_<id>` (R1) | **POSIBLE**: si editó dentro de un Modelo, el overlay las contiene. Revisar contenido y `updated_at` de esas filas. |
| `localStorage` / `sessionStorage` | **NO**: solo se guarda `mediterra_usuario` y `mediterra_modulo` (`App.jsx:2414,2421`). No hay borrador del flujo. |
| Estado realtime | **NO**: no persiste nada. |
| `backup_2026-09-02` | **IMPROBABLE**: el backup se crea **una vez al día al primer arranque** (`App.jsx:2260-2290`) y captura el `value` de cada fila **en ese momento** (probablemente la mañana, antes del mediodía). No es incremental; no contendrá ediciones posteriores a su creación. Solo sirve si el arranque que lo generó ocurrió **después** de las ediciones. |
| Otra fila autoritativa | Revisar `finanzas_esc_index` para identificar Modelos y sus filas. |

**Veredicto de recuperabilidad:** RECUPERABLE **solo si** (a) la pestaña del CFO sigue abierta con los valores en pantalla, o (b) las ediciones fueron a una fila `finanzas_esc_<id>` que aún las conserva. En cualquier otro caso: **NO RECUPERABLE — reingresar manualmente**. No inventar cifras.

### Sondas SQL de SOLO LECTURA propuestas (para que las corra el CFO; NO ejecutadas)

```sql
-- 1) Timestamps y tamaños de todas las filas de finanzas + escenarios
select id, updated_at, length(value) as bytes
from calendario_data
where id = 'finanzas' or id like 'finanzas_esc_%'
order by updated_at desc;

-- 2) Catálogo de escenarios (nombres de los "Modelo")
select value from calendario_data where id = 'finanzas_esc_index';

-- 3) ¿El backup de hoy existe y trae finanzas? ¿A qué hora se creó?
select id, updated_at, (value ? 'finanzas') as trae_finanzas,
       (value ? 'finanzas_esc_index') as trae_esc_index
from calendario_data where id = 'backup_2026-09-02';

-- 4) ¿Hay trigger que mantenga updated_at? (confirma si el abril es artefacto de R3)
select tgname from pg_trigger
where tgrelid = 'calendario_data'::regclass and not tgisinternal;

-- 5) Inspección NO destructiva del contenido de finanzas (claves de nivel superior
--    y una muestra) para ver si el value trae datos recientes pese al updated_at viejo
select jsonb_object_keys(value::jsonb) from calendario_data where id='finanzas';
```

---

## Fixes recomendados (ranqueados, diff mínimo · NO aplicados)

> No se aplican aquí (otro agente es dueño de `App.jsx`; el CFO debe aprobar cambios en el motor del flujo).
>
> **F0 es el fix del CONTRATO (obligatorio por la regla dura del CFO). F1..F7 son endurecimientos puntuales de Finanzas que NO reemplazan a F0.**

**F0 — Unificar TODA escritura a `calendario_data` bajo el contrato de persistencia confirmada (bloqueante, transversal).** Un único camino de guardado (generalizar `dbSaveGeneric` para cubrir también filas-blob no fusionables por ítem: `finanzas`, `main`, `pins`, `allegria`, `osiris`, escenarios) que garantice el invariante:
> UI "guardado" = el backend confirmó la persistencia autoritativa. Si el save falla: el estado queda dirty/error, el usuario lo sabe (`AvisoPersistencia`), no se descartan cambios, el retry es seguro, y no hay overwrite silencioso.
Requisitos del contrato único:
1. Enviar siempre `updated_at` y hacer **PATCH condicional** `updated_at=eq.<versión leída>` (concurrencia optimista) → si otro escribió, `409/0 filas` → `{ok:false, motivo:"conflicto"}`, nunca pisar.
2. **Confirmar** la escritura contra el `updated_at` devuelto (`return=representation`); sin confirmación → `{ok:false, motivo:"sin_confirmacion"}`.
3. Nunca devolver éxito sin escritura confirmada (elimina R2/R6): prohibido `resolve(true)` en gates.
4. `dbLoad` **lanza** ante error de red (gate `cargaOk` ya existente) — mantener.
5. Ante fallo, dejar el estado **dirty** y mostrar `AvisoPersistencia` con reintento; jamás limpiar el "sucio" hasta confirmar.
6. Guard contra clobber entrante: realtime/poll no aplican estado si hay `dirty` local (o hacen merge no destructivo).
Migrar los módulos del CONTRATO-MALO a F0. Osiris y la familia Frisku/Rendiciones ya cumplen y sirven de referencia. **Un fix solo-Finanzas queda prohibido: ocultaría la exposición de `main`/`pins`/`allegria`/EEFF.**

Los siguientes son sobre `FinanzasModule.jsx` salvo indicación.

**F1 — Eliminar el "simular éxito" y devolver estado real (bloqueante).** `FinanzasModule.jsx:11674-11682` y `:11708-11711`. Que `persistAll` **nunca** devuelva `true` sin una escritura confirmada:
- gate `!cargaOkRef` y ventana de 10 s → devolver un valor **distinto de éxito** (p.ej. `{ok:false, motivo:"no_listo"}`) o encolar y reintentar tras la ventana; jamás `resolve(true)`.
- rama escenario sin base → `{ok:false, motivo:"sin_base"}`, no `resolve(true)`.
Sustituir la ventana fija de 10 s por el gate real que ya existe (`cargaOkRef`), que es suficiente; la ventana de tiempo es redundante y peligrosa.

**F2 — `dbSave` debe confirmar y propagar (bloqueante).** `FinanzasModule.jsx:90-109`: devolver `{ok, status}` en vez de `false` tragado; enviar `updated_at: new Date().toISOString()` en el body (como `App.jsx:164`) para no congelar el timestamp y para que `pollRow`/`__selfWrites` funcionen. Confirmar `r.ok` antes de reportar éxito.

**F3 — Mostrar AvisoPersistencia en el flujo (bloqueante).** Importar `construirAviso` + `<AvisoPersistencia>` (ya existen) y mostrarlo cuando `persistAll` no confirme, con botón "Recargar". Reemplaza el `setSaved("⚠️ Error")` efímero. Cubre también los fire-and-forget (`11854, 11861`): agregar `.then` que dispare el aviso ante `!ok`.

**F4 — Proteger el estado local sucio del clobber entrante (alto).** En el handler realtime (`11553-11560`) y en el callback de `pollRow` (`11519`): no llamar `applyData(d)` si hay ediciones locales sin confirmar (flag `dirtyRef`), o hacer merge no destructivo. Evita R4.

**F5 — Enrutamiento de escenario visible/seguro (alto).** Cuando `activeRowRef !== "finanzas"`, la UI debe indicar claramente "estás en Modelo X, no en Base" junto al indicador de guardado, para que el CFO no crea que edita Base. Evita R1.

**F6 — Flush en `beforeunload`/`visibilitychange` para el flujo (medio).** Como ya hace Nóminas (`15282-15287`, keepalive), forzar el guardado pendiente antes de recargar/cerrar. Evita pérdida por navegación.

**F7 — Concurrencia real para el blob (medio, mayor).** El blob del flujo no es fusionable por ítem. Adoptar optimistic-concurrency por `updated_at` (leer-antes-de-escribir, rechazar si cambió, mostrar conflicto vía AvisoPersistencia) para que dos usuarios no se pisen en silencio. Alinéa con el invariante y con lo ya hecho en Rendiciones/Maestros.

## Harness

`tests/persistencia/` (ver README ahí). Reproduce fielmente las compuertas de `persistAll`+`dbSave` con `fetch` mockeado y ejecuta PERSIST-01..12. Corre con `node tests/persistencia/persist.harness.test.mjs`. Nada probado en vivo ni desplegado.
