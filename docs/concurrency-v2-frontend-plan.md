# Concurrency v2 — Plan de integración frontend (Class-B)

**Estado:** DISEÑO. Este documento describe los cambios que el **integrador** debe aplicar en
`src/proceso/core/*` una vez que los drafts SQL de `supabase/concurrency_v2/` estén validados en
staging. Carril B NO editó `src/` (regla del carril). Aquí NO hay código aplicado, solo el contrato.

Objetivo: cerrar el hueco **Class-B** (last-write-wins de una fila vía PATCH client-side) sin romper
el patrón anti-borrado (Regla 9) ni el estilo actual. Backend/servidor autoritativo; conflictos
visibles y reconciliables; ningún cambio válido perdido en silencio.

---

## 1. Cambio de contrato de `procUpdate` (procesoDB.js ~L51)

### Hoy

```js
export async function procUpdate(tabla, query, patch) {
  const res = await fetch(`${REST}/${tabla}${query}`, {
    method: "PATCH",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`proc update ${tabla} → HTTP ${res.status}: ${await res.text()}`);
  return res.json();   // ← array de filas; [] cuando 0 filas matchearon (¡éxito silencioso!)
}
```

El bug: un PATCH cuyo `WHERE` no matchea (porque otro usuario ya cambió la fila) devuelve `200 []`.
El caller lo trata como éxito. Eso ES el last-write-wins silencioso.

### Nuevo contrato (retrocompatible)

Agregar un 4º parámetro `opts` y una clase de error tipada. Cuando `opts.optimista === true`, una
respuesta vacía (`[]`) se interpreta como **conflicto**, no como éxito:

```js
export class ProcConflictError extends Error {
  constructor(tabla, msg) { super(msg || `Conflicto de concurrencia en ${tabla}`); this.name = "ProcConflictError"; this.tabla = tabla; this.conflict = true; }
}

// opts.optimista:true → [] (0 filas) se trata como ProcConflictError.
// opts.expect: { col, val } → conveniencia: appendea `&${col}=eq.${encodeURIComponent(val)}` al query.
export async function procUpdate(tabla, query, patch, opts = {}) {
  let q = query;
  if (opts.expect && opts.expect.col != null && opts.expect.val != null) {
    q += `&${opts.expect.col}=eq.${encodeURIComponent(opts.expect.val)}`;
  }
  const res = await fetch(`${REST}/${tabla}${q}`, {
    method: "PATCH",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`proc update ${tabla} → HTTP ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  if (opts.optimista && Array.isArray(rows) && rows.length === 0) {
    throw new ProcConflictError(tabla, `La fila cambió desde que la cargaste (o ya no existe). Recarga y reintenta.`);
  }
  return rows;
}
```

**Retrocompatibilidad:** los callers actuales que no pasan `opts` (p.ej. flujos que sí esperan a
veces 0 filas) mantienen el comportamiento exacto de hoy. Solo las 6 superficies Class-B pasan
`optimista:true`.

> Requisito de token: cada fila trae `row_version` (tras `10_optimistic_token.sql`). El caller lo
> obtuvo del último `procSelect`. Si se opta por NO migrar, usar `updated_at` como token
> (`expect:{col:"updated_at", val:row.updated_at}`) reenviando **exactamente** el string ISO que
> devolvió PostgREST. `row_version` es más robusto (README §Token).

---

## 2. Superficies que pasan por PATCH optimista (procesoF7DB.js)

Estas 4 quedan como PATCH (bajo volumen de contención, sin efectos colaterales en el ledger), solo
que ahora **optimista + token**. La firma de cada wrapper suma `expectedVersion` (el `row_version`
que el componente tiene en su estado):

```js
// actualizarMaestro ~L38  (CRUD genérico de maestros)
export const actualizarMaestro = (tabla, id, empresaId, patch, expectedVersion) =>
  procUpdate(tabla, `?id=eq.${id}&empresa_id=eq.${empresaId}`, patch,
    { optimista: true, expect: { col: "row_version", val: expectedVersion } });

// cambiarEstadoTarifa ~L232  (ahora con trg_tarifa_guard detrás — ver 40_trg_tarifa_guard.sql)
export const cambiarEstadoTarifa = (id, e, estado, actor, expectedVersion) =>
  procUpdate("proc_tarifa", `?id=eq.${id}&empresa_id=eq.${e}`, { estado, updated_by: actor || null },
    { optimista: true, expect: { col: "row_version", val: expectedVersion } });

// cambiarEstadoBase ~L267
export const cambiarEstadoBase = (id, e, estado, actor, expectedVersion) =>
  procUpdate("proc_base_cobro", `?id=eq.${id}&empresa_id=eq.${e}`, { estado, updated_by: actor || null },
    { optimista: true, expect: { col: "row_version", val: expectedVersion } });

// cambiarEstadoContrato ~L315
export const cambiarEstadoContrato = (id, e, estado, actor, expectedVersion) =>
  procUpdate("proc_cliente_contrato", `?id=eq.${id}&empresa_id=eq.${e}`, { estado, updated_by: actor || null },
    { optimista: true, expect: { col: "row_version", val: expectedVersion } });
```

Nota: `actualizarRecepcion`, `actualizarPrograma`, `actualizarDespacho`, `actualizarFichaCliente`,
`actualizarContrato`, `actualizarReporte*` también van por `actualizarMaestro`/`procUpdate`. Todas
deberían adoptar el token al editar; priorizar las de estado y las de mayor contención primero
(ver orden de integración §5).

---

## 3. Superficies que migran a RPC (alto impacto → Capa 2)

`cambiarEstadoOrden` y `cambiarEstadoDespacho` dejan de ser PATCH y pasan a `procRpc`, que en backend
hace `FOR UPDATE` + valida desde el estado real + rechaza stale (`20_/30_rpc_*.sql`):

```js
// cambiarEstadoOrden ~L109  (antes: procUpdate("proc_orden_proceso", …, {estado}))
export const cambiarEstadoOrden = (e, id, estado, expectedVersion, actor) =>
  procRpc("proc_fn_cambiar_estado_orden", {
    p_empresa_id: e, p_orden_id: id, p_nuevo_estado: estado,
    p_expected_version: expectedVersion ?? null, p_actor: actor || null,
  });   // devuelve { ok, id, estado, row_version }  ó lanza (PROC_STALE / PROC_TRANSICION_INVALIDA / …)

// cambiarEstadoDespacho ~L195
export const cambiarEstadoDespacho = (e, id, estado, expectedVersion, actor) =>
  procRpc("proc_fn_cambiar_estado_despacho", {
    p_empresa_id: e, p_despacho_id: id, p_nuevo_estado: estado,
    p_expected_version: expectedVersion ?? null, p_actor: actor || null,
  });
```

`procRpc` ya propaga el error HTTP con el texto (incluye el `PROC_STALE`/SQLSTATE). Envolver para
tipar el conflicto:

```js
function esConflicto(err) {
  const m = String(err && err.message || "");
  return err?.conflict || m.includes("PROC_STALE") || m.includes("PROC_NOOP")
      || m.includes("40001") || m.includes("PROC_USE_CANCELAR");
}
```

Los callers de UI reemplazan `cambiarEstadoOrden(e, id, estado)` por
`cambiarEstadoOrden(e, id, estado, ordenEnEstado.row_version, actor)` y refrescan su token con el
`row_version` que devuelve la RPC.

---

## 4. UX de conflicto (no destructiva, reconciliable)

Patrón único para las 6 superficies:

```js
try {
  const r = await cambiarEstadoOrden(emp, orden.id, "anulado", orden.row_version, actor);
  aplicarEnEstadoLocal(r);                 // usa r.estado + r.row_version nuevos
} catch (err) {
  if (esConflicto(err) || err instanceof ProcConflictError) {
    // NO pisar. Avisar en pantalla + recargar la fila para que el usuario redecida con dato fresco.
    avisar("Otro usuario cambió esta orden mientras la tenías abierta. La recargamos; revisa y reintenta.");
    const fresca = await cargarOrdenPorId(emp, orden.id);
    setOrden(fresca[0]);                    // trae el row_version nuevo
  } else {
    throw err;                              // errores reales (red, permisos) → manejo normal
  }
}
```

Reglas UX:
- El aviso es **en pantalla** (coherente con el aviso de persistencia ya existente), no un `console.log`.
- Recargar SIEMPRE la fila tras un conflicto (nunca reintentar automático con el token viejo).
- No auto-reintentar transiciones (una anulación no debe reintentarse sola sobre un estado nuevo).
- El botón de acción se re-habilita solo tras la recarga, con el estado/opciones ya frescos.

---

## 5. Orden de integración (frontend), tras validar SQL en staging

1. Aplicar en staging (SQL, por el integrador): `10_optimistic_token.sql` → `40_trg_tarifa_guard.sql`
   → `20_rpc_cambiar_estado_orden.sql` → `30_rpc_cambiar_estado_despacho.sql`. Correr
   `90_harness_concurrency.sql` PARTE 1 (auto) y PARTES 2/3 (2 sesiones psql).
2. Frontend: cambio de contrato de `procUpdate` + `ProcConflictError` (§1). Sin cambios de UI aún.
3. Migrar `cambiarEstadoTarifa/Base/Contrato` + `actualizarMaestro` a optimista (§2). Añadir el
   token en los `procSelect` que alimentan esas vistas (ya viene: `row_version` es una columna más).
4. Migrar `cambiarEstadoOrden/Despacho` a RPC (§3) + UX de conflicto (§4) en sus componentes.
5. Extender a los demás `actualizar*` de menor contención.

## 6. Riesgos y notas

- **Regla 9 intacta:** nada de esto cambia el gate de carga; el token viaja en filas ya cargadas. Un
  fallo de red sigue lanzando (no default). Un conflicto es un caso nuevo y distinto (200 con []).
- **`updated_at` como token alternativo:** frágil por formateo ISO/precisión. Si se usa, reenviar el
  string EXACTO de PostgREST. Preferir `row_version`.
- **RLS/SECURITY INVOKER:** las RPC corren con RLS del llamador (deny-by-default por empresa). No
  amplían superficie de acceso.
- **Multi-membership:** el header `X-Proc-Empresa` sigue rigiendo; las RPC reciben `p_empresa_id`
  explícito y la RLS lo re-valida.
- **No romper callers actuales:** `opts` es opcional; los PATCH sin token se comportan igual que hoy.
- **Idempotencia de la RPC:** una segunda llamada con el token viejo devuelve `PROC_STALE` (no repite
  la transición). El cliente debe refrescar antes de reintentar.
