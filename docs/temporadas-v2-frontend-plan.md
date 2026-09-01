# Temporadas v2 — Plan de frontend (MS-G1) para el integrador

Este documento NO edita código. Describe **cómo** los 6 create-paths deben derivar la
temporada obligatoria una vez que MS-G1 (`supabase/temporadas_v2/10_*`) endurece
`proc_fn_siguiente_correlativo` para **rechazar** `'s-t'`/vacío/inexistente.

> Tras aplicar MS-G1, cualquier `siguienteCorrelativo({... temporada:'s-t'})` lanza
> excepción en el servidor. Si el frontend no cambia, esos 6 flujos **fallan al crear**.
> Por eso el cambio de backend y el de frontend van juntos en la misma capability.

## Patrón de referencia (ya correcto): `NuevaRecepcion.jsx`

- Carga el catálogo de temporadas del empresa a estado local (`temporadas`, T10C).
- Deriva la temporada **de la fecha operacional** con
  `temporadaDeFecha(temporadas, fecha)` (`src/proceso/core/procesoF7Domain.js:329`).
  - exactamente una → `{codigo}`
  - cero → bloquea con mensaje humano ("No hay temporada configurada para la fecha …")
  - varias → bloquea ("Hay más de una temporada aplicable …")
- Solo con `{codigo}` válido llama `siguienteCorrelativo`. Nunca emite `'s-t'`
  (ver `NuevaRecepcion.jsx:162-171` y el guard `:228-229`).

## Estado actual del contexto

`useServiceContext.jsx` expone `temporada` (código libre seteado por un selector) y
`fecha` (default hoy), pero **no** carga el catálogo ni valida `temporada`. Los 6 paths
hacen `temporada || 's-t'`. Hay que reemplazar ese fallback por derivación/validación.

### Recomendación de arquitectura (elige el integrador)

**Opción A (preferida) — centralizar en `ServiceProvider`:**
cargar una vez el catálogo `proc_temporada` del empresa y exponer un helper
`resolverTemporada(fecha)` que envuelva `temporadaDeFecha`. Los 6 paths lo llaman y
bloquean con `notificar(..., "error")` si devuelve cero/múltiple. Una sola fuente de
verdad, misma UX que Recepción.

**Opción B — por página:** cada página carga el catálogo y deriva localmente (más
duplicación, pero menor cambio en el provider).

En ambas: **nunca** construir el correlativo sin `{codigo}` válido; **eliminar** el
literal `'s-t'`.

## Cambios por archivo (todos en `src/proceso/ui/pages/`)

| Archivo | Línea | Tipo | `fecha` disponible | Acción |
|---|---|---|---|---|
| `Ordenes.jsx` | 42 | ORD | no la destructura | derivar de `fecha` del contexto (añadir a `useService()`) o exigir selección de temporada; bloquear si no resuelve |
| `Programa.jsx` | 42, 64 | PROG, ORD | **sí** (`fecha`) | `temporadaDeFecha(cat, fecha)` en ambas; bloquear cero/múltiple |
| `Despachos.jsx` | 54 | DES | no la destructura | usar `fecha` del contexto o la fecha del despacho; derivar; bloquear |
| `BasesCobro.jsx` | 50 (y 52 pasa `temporada:null` al repo) | BCO | usa `periodo_desde/hasta` | derivar de `periodo_desde` (o exigir temporada explícita); reemplazar también el `temporada || null` de la línea 52 por el código resuelto |
| `ProductoTerminado.jsx` | 63-64 | PAL | `temporada` de contexto | validar `temporada` contra catálogo; si null/ inválida, derivar de `fecha` o bloquear; pasar el código resuelto a `siguienteCorrelativo` **y** a `crearPallet` |
| `Repaletizaje.jsx` | 65-66 | PAL | `temporada` de contexto | igual que ProductoTerminado: resolver una vez, pasar a `siguienteCorrelativo` y `crearPallet` |

### Regla común
1. Obtener catálogo de temporadas del empresa (Opción A o B).
2. `const t = temporadaDeFecha(catalogo, fechaAplicable)` **o** validar la `temporada`
   seleccionada contra el catálogo (existe + estado `activa`/`planificada`).
3. Si `t.error` → `notificar` con el mensaje humano y **return** (no crear nada).
4. Llamar `siguienteCorrelativo({ empresaId, temporada: t.codigo, tipo })` con el código real.
5. Propagar `t.codigo` a cualquier `crear*` que hoy recibía `temporada || 's-t'`
   (Pallet en ProductoTerminado/Repaletizaje; fila en BasesCobro).

### Verificación post-cambio
- Grep `'s-t'` en `src/proceso/ui/pages/` → **0 hits** esperados tras el fix.
- Crear una orden/programa/despacho/base/pallet con temporada `cerrada` → el backend
  (MS-G2) lo rechaza; el frontend debe mostrar el error, no crashear.
- Crear con temporada válida `activa` → folio con short-code correcto (`ORD-2526-000001`).

## Notas de dependencia con el backend
- MS-G1 es el que **obliga** este cambio. Aplicá backend y frontend en el mismo release.
- MS-G3 agrega `temporada_codigo` a `proc_orden_proceso`/`proc_programa_proceso`. Cuando
  esté, conviene que Ordenes/Programa **persistan** el código resuelto en esa columna
  (hoy el código solo vive en el folio), para que el guard de lifecycle (MS-G2) también
  cubra esas dos entidades a nivel de fila.
