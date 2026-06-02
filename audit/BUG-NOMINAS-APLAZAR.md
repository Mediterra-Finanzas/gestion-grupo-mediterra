# BUG — Nóminas / "Aplazar" descarta el cambio al recargar

**Módulo:** `FinanzasModule.jsx` → `NominasModule` / `NominaDetalle`
**Reportado:** Allegria Foods, semana 23 → aplazar factura a semana 24. Al recargar, la factura reaparece en S23 (cambio perdido).
**Fecha diagnóstico:** 2026-06-02
**Estado:** Solo diagnóstico. NO se modificó código.

---

## 1. Flujo real del "Aplazar"

El guardado de Nóminas **NO pasa por `persistAll`**. Tiene su propia ruta de persistencia. La cadena es:

1. `NominaDetalle` → input "Obs." (`onBlur`, línea ~11425):
   - Si el texto contiene "aplaza" → `prompt()` pide la semana destino **(bloquea el hilo principal)**.
   - Llama `updItem(it.id, "_aplazar", {semana, motivo})`.
2. `updItem` (11215) → `onChange(...)` → `upd("items", nuevosItems)` en `NominaDetalle` (11596).
3. `upd` intercepta el item con `_aplazar` (11599-11616):
   - `onUpdate({...nom, items: itemsSinAplazado})` → **`updNomina`** → quita el item de S23 → `saveNominas(next)`.
   - `onCrearYAbrir(empresa, 24, año, itemNuevo)` (12938) → crea/actualiza S24 → `saveNominas(next)`.
   - `alert("✅ Item aplazado a la semana 24…")`.
4. `saveNominas` (12774) hace **debounce de 800 ms** sobre un único timer y llama `dbSaveNominas(list)` (11162) — **fire-and-forget, sin `await`, sin chequear resultado**.

`dbSaveNominas` en v2 agrupa por empresa y hace upsert (`merge-duplicates`) de la fila `nominas_<empresa>` con la lista completa de esa empresa.

---

## 2. Causa raíz

La hipótesis del ticket (`persistAll` defensivo descartando el guardado por el flag "app cargando") **es un falso positivo**: ese flag (`window._finLoadTime`, línea 10452) y el log `[persistAll] Bloqueado` (10453) pertenecen al **FlujoModule** (`finanzas_real`), que es un componente distinto cargando en paralelo. Nóminas nunca llama a `persistAll`. Ese log solo confirma que la página se había recargado hacía < 10 s.

La causa raíz real es la combinación de:

**(a) Guardado diferido (debounce 800 ms) + congelamiento del hilo por diálogos bloqueantes.**
El `onBlur` ejecuta `prompt()` y luego `alert()`, ambos **síncronos y bloqueantes**. Eso explica el `[Violation] 'focusout' handler took 9230ms`: el hilo estuvo congelado ~9 s. Recién al cerrar el `alert` se programa el `setTimeout` de 800 ms que efectivamente guarda. Si el usuario recarga durante el congelamiento percibido (o dentro de los 800 ms del debounce), **el `setTimeout` nunca dispara y `dbSaveNominas` no llega a ejecutarse**. El cambio se pierde silenciosamente.

**(b) No hay flush del guardado pendiente.** No existe `beforeunload`, ni flush al desmontar, ni en `visibilitychange`. El `saveTimer` es un `setTimeout` simple (12773-12778). Una recarga lo aborta sin guardar.

**(c) Fire-and-forget sin verificación.** `saveNominas` no hace `await dbSaveNominas(...)` y nadie inspecciona el resultado. Si el POST a Supabase fallara, el flujo igual continúa como si hubiera tenido éxito.

**Riesgo secundario (mismo flujo, agrava en multiusuario):** `onCrearYAbrir` (12941) busca la nómina destino con `nominas.find(...)` usando el **closure obsoleto** `nominas` (no el `prev` del setstate). Además hay refrescos que pueden pisar el estado local:
- Auto-refresh cada 30 s (12742) — mitigado: solo reemplaza si cambian `estado`/`aprobadoPor`, no detecta movimientos de items.
- `visibilitychange` (12760) — **reemplaza incondicionalmente** `setNominas(d.nominas)` con lo que haya en la DB. Si dispara antes de que el debounce guarde, vuelve a mostrar S23.

---

## 3. Por qué el usuario NO recibe feedback del fallo

- El `alert("✅ Item aplazado a la semana 24")` (11614) se muestra **de inmediato y de forma optimista**, ~800 ms antes de que el guardado siquiera se intente, y sin esperar su resultado. Es un éxito falso garantizado.
- `saveNominas` → `dbSaveNominas` es fire-and-forget: el único manejo de error es un `console.error` interno (11193) que el usuario nunca ve.
- No hay indicador de "guardando / guardado / error" en el flujo de aplazar (a diferencia del `setSaved("✅/⚠️")` que sí usan otros handlers del flujo, p. ej. `handleSaveReal` en 10481).

Resultado: el usuario ve el tilde verde, asume que se guardó, recarga, y el cambio no está.

---

## 4. Propuesta de fix (NO aplicar todavía)

**Fix mínimo (ataca la causa raíz):**

1. **Convertir el guardado del aplazar en bloqueante y verificado.** Hacer que `saveNominas` retorne la promesa y `await dbSaveNominas(list)`; que `dbSaveNominas` retorne `true/false` según `res.ok`. En `upd`/`onCrearYAbrir`, esperar el guardado **antes** de mostrar el `alert`, y mostrar éxito solo si guardó.

2. **Mover el `alert("✅…")` a después del guardado exitoso.** Si falla, mostrar `alert("⚠️ No se pudo aplazar, reintenta")` y **no** vaciar el item de S23 (o revertir el estado local).

3. **Flush del debounce ante salida.** Agregar `beforeunload` y cleanup al desmontar que, si hay `saveTimer` pendiente, ejecuten el guardado inmediatamente (idealmente `await`/`keepalive`). Esto evita perder cualquier edición debounced, no solo el aplazar.

4. **Reemplazar `prompt()`/`alert()` bloqueantes** por un mini-modal no bloqueante (consistente con la estética actual). Elimina el congelamiento de 9 s y la tentación del usuario de recargar.

**Endurecimiento opcional:**

5. En `onCrearYAbrir`, buscar la nómina destino dentro del updater (`setNominas(prev => prev.find(...))`) en lugar del closure `nominas`, para evitar lecturas obsoletas.
6. Que el `visibilitychange` (12760) no pise el estado si hay un guardado pendiente (chequear `saveTimer.current`).

---

## 5. Sugerencia para que un guardado bloqueado AVISE en vez de descartar

Aunque Nóminas no usa `persistAll`, el patrón "bloquear y simular éxito" sí existe ahí (10454: `return Promise.resolve(true)` cuando está dentro de la ventana de carga). Ese patrón es exactamente lo que oculta fallos.

Recomendación general aplicable a ambos (`persistAll` y `saveNominas`):

- **No simular éxito.** Si un guardado se bloquea/aplaza, devolver un estado distinguible (p. ej. `"deferred"`/`false`), nunca `true`.
- **Reintentar en lugar de descartar.** En `persistAll`, cuando esté dentro de la ventana de carga, en vez de `return Promise.resolve(true)`, **encolar** el guardado (`setTimeout` hasta que `_finLoadTime` supere los 10 s) y ejecutarlo entonces. Así un cambio legítimo del usuario durante esa ventana no se pierde.
- **Avisar visualmente.** Reutilizar el indicador `setSaved("⚠️ Error / Reintentando…")` ya existente, de modo que cualquier guardado no confirmado quede visible para el CFO antes de recargar.

---

### Referencias de código
- Bloqueo persistAll (red herring): `FinanzasModule.jsx:10450-10455`
- Disparo aplazar (prompt bloqueante): `FinanzasModule.jsx:11424-11436`
- Intercepción + alert optimista: `FinanzasModule.jsx:11596-11618`
- `onCrearYAbrir` (closure obsoleto): `FinanzasModule.jsx:12938-12953`
- `saveNominas` (debounce sin flush): `FinanzasModule.jsx:12772-12779`
- `dbSaveNominas` (fire-and-forget): `FinanzasModule.jsx:11162-11194`
- Refrescos que pueden pisar estado: `FinanzasModule.jsx:12740-12770`
