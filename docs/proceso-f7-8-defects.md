# F7.8 — Registro de Defectos

Clasificación: **P0** (impide operar/integridad) · **P1** (error funcional importante) · **P2** (UX/visual relevante) · **P3** (polish).

## Encontrados y corregidos en F7.8

| ID | Sev | Pantalla/archivo | Defecto | Corrección |
|---|---|---|---|---|
| D-01 | P2 | InformeDetalle, Informes, Orden | Porcentaje con `toFixed(1)` ad-hoc → "79.6%" (punto, inconsistente con es-CL) | Ruteado a `formatPct` → "79,6%" |
| D-02 | P3 | procesoPdf.js | `toLocaleString`/`new Date().toLocaleString` fuera de `format.js` | Ruteado a `formatNum`/`formatFechaHora` |
| D-03 | P3 | Despachos, Informes, NuevaRecepcion (VSelect), Programa, InformeDetalle (picker) | Labels de nombre en dropdowns/pickers/columnas sin `normalizarNombre` | Normalizados (snapshot emitido y editor Config exceptuados) |
| D-04 | P2 | CentroOperaciones | "Bases por aprobar" contaba borrador+en_revision pero navegaba solo a `borrador` (nav-contract incoherente) | Navega sin preset; el conteo queda como indicador |

**Total: 4 corregidos (2×P2, 2×P3). 0 P0 / 0 P1 encontrados.**

## Verificación de las correcciones
- JS: dominio 70/70 (incl. 8 tests nuevos de `filtrosActivos`), format 31/31, PDF 12/12 = **113/113**.
- Runtime: regresión F1–F7.7 (13/13) + F7.7 E2E + filtros F7.8 (F1–F7) + concurrencia consumo + RLS 25/25 + bounded context 0-deps.
- Build `CI=true` → Compiled successfully.

## GAPs (no defectos — diferidos, documentados)

| ID | Tipo | Descripción | Estado |
|---|---|---|---|
| G-01 | Auth | Sin identidad autenticada / claim `empresa_id`: tenant manual en barra; servicio manual usa token uuid + nombre en motivo | Gate conocido; fuera de F7.8 |
| G-02 | Visual | Revisión visual en vivo no ejecutable (login + RLS/anon + server concurrente) | **VISUAL QA CERTIFIED = NO/BLOCKED** |
| G-03 | Datos | Sin maestros reales de Rancagua cargados | UAT productiva pendiente |
| G-04 | PDF | Render jsPDF pixel-exacto no ejecutable (CDN/CSP; no npm) | Data del PDF sí testeada (12/12) |
| G-05 | Export | Listados no exportan; si se agrega, debe respetar dataset filtrado visible | Diferido, no en alcance |
| G-06 | Responsive | Breakpoints por código (colapso sidebar <900, overflow-x tablas); no verificado en viewport real | Pendiente UI-live |
| G-07 | Etiqueta histórica | Snapshot F5 guarda IDs de dimensión; labels se resuelven de maestros CURRENT (números inmutables) | Conocido desde F7.6 |

Ningún GAP es P0/P1. Ninguno bloquea la certificación **funcional**; G-02 bloquea la certificación **visual**.

## STRUCTURAL-GAP
**Ninguno.** Ninguna corrección requirió tocar ledger, `proc_pallet_linea`, genealogía, ownership, `proc_vinculo`, N:M, snapshots, tarifario F6, XOR, multimoneda, identidad Core, tenancy/RLS ni bounded contexts. No se disparó `F7-STRUCTURAL-GAP`.
