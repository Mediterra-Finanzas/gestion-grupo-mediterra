# UAT Integral — Allegria Service (F1–F6)

**Fecha:** 2026-08-13 · **Capability:** `proc_*` · **Tenant:** Allegria Service (Planta Rancagua) · **Worktree:** `worktree-proc-fase1` · **Entorno:** PostgreSQL 16 aislado (Docker efímero, stub Core). Sin merge, sin producción.

**Veredicto:** F1–F6 **APTO para pasar a UI/productización**, con 1 hallazgo P1 detectado y **corregido** durante la UAT y 0 P0/P1 abiertos. Los gaps restantes son de datos maestros y de UX (no hay UI todavía), no de motor.

---

## A. UAT Plan

Operación representativa (no seeds artificiales): maquila de **cerezas (Santina/Lapins/Regina) y ciruelas** en Planta Rancagua, con **3 clientes del servicio** (Copefrut, Río Blanco, Allegria Foods), **3 productores** (El Parrón, Los Aromos, San Vicente), **2 exportadoras externas** + 1 Service-only, **fruta de terceros** (dueño ≠ productor) y **Allegria Foods como cliente intercompany**. Identidad de contrapartes **solo vía `proc_vinculo`** (identidad Core por `grupo_empresa_id`/`auxiliar_id`; nunca maestros Frisku).

Cobertura end-to-end de los 20 pasos del alcance: recepción → lote → QC (categoría/calibre/color) → inventario → orden de proceso → consumo (N:M) → resultado → conciliación de masa → PT → pallets → repaletizaje → inventario → despacho → Resultado de Proceso → versionamiento → destinatarios → tarifario → servicios facturables → Base de Cobro. 12 escenarios (A–L).

**Método:** cada escenario es SQL ejecutable con aserciones aritméticas (`RAISE EXCEPTION` si algo no cuadra). Artefactos: `supabase/validation/proc_uat_f1_f6.sql` (maestros+helpers), `proc_uat_A_C.sql`, `proc_uat_D_F.sql`, `proc_uat_G_K.sql`, `proc_uat_L_setup.sql` (concurrencia).

## B. Casos ejecutados

| # | Escenario | Qué ejercita |
|---|---|---|
| A | Proceso simple | Recepción→lote→orden→consumo→resultado→conciliación→PT→pallet→despacho→informe→base. Cuadre total. |
| B | Lote en 3 corridas | Consumo acumulado, saldo, genealogía (3 insumos), consolidado, packout ponderado. |
| C | Varios lotes / 1 orden | N:M, kilos por lote, genealogía, trazabilidad backwards a 3 productores. |
| D | Repaletizaje complejo | 3 generaciones (A,B→C,D ; C,E→F). "¿De dónde viene F?" y "¿en qué terminó A?". |
| E | Despacho parcial | 100 cajas → 60 (saldo 40) → traslado → 40 (saldo 0). Identidad del pallet. |
| F | 5 roles distintos | cliente≠productor≠dueño≠exportadora≠destinatario, ninguno colapsa. |
| G | Frisku ≠ Service | Universo de partes = `proc_vinculo`; Service-only opera; identidad sin vínculo rechazada por FK. |
| H | Foods intercompany | Foods = cliente vía vínculo de grupo; proceso idéntico; 0 FK a `exp_*`; base sin factura. |
| I | Resultado + versión | 12.000/11.800/9.000, packout, v1 inmutable + v2. |
| J | Tarifario | 9.800×0,30=2.940; subir tarifa CURRENT a 0,35 no altera histórico. |
| K | Tarifa faltante | Servicio → `pendiente_tarifa` (ni cero ni tarifa arbitraria). |
| L | Concurrencia | 2 conexiones: doble consumo de lote y doble despacho de pallet. |

## C. Resultado por escenario

**12/12 PASARON.** Números verificados:

- **A** 5.000 → comercial 4.000 + descarte 800 + merma 200; cobro **USD 1.500**; pallet despachado, saldo 0.
- **B** lote 9.000 en 3×3.000; disponible lote 0; 3 insumos; consolidado 9.000/7.200, **packout 0,80**.
- **C** 2.000+3.000+1.500 = **6.500**; 3 lotes distintos (backwards a El Parrón / Los Aromos / San Vicente).
- **D** genealogía 3 generaciones confirmada (ancestros de F ⊇ {A,B,C}; A termina en F); saldos F=1.000, D=200, E=300.
- **E** saldo 40 tras despacho parcial → traslado a otra cámara (identidad intacta) → saldo 0.
- **F** 5 vínculos distintos preservados en recepción + despacho.
- **G** exportadoras de Service = 3 (`proc_vinculo`); Frisku-only ausente; Service-only opera; parte sin vínculo → **FK violation**.
- **H** Foods `grupo_empresa_id` no nulo (intercompany), 4.000 kg cobrables a tarifa general 0,25, **0 FK `proc_*`→`exp_*`**, base en `borrador` (sin factura/asiento).
- **I** 11.800 procesados / 9.000 comerciales / **packout 0,7627**; detalle 2 líneas calibre-color; v1 inmutable tras generar v2.
- **J** 2.940 congelado; tras subir tarifa a 0,35 el histórico sigue **2.940**.
- **K** `pendiente_tarifa`, subtotal NULL.
- **L** doble consumo: 1 éxito / 1 rechazo ("excede disponible 0.000"), disponible lote 0, 1 consumo. Doble despacho: 1 confirmado / 1 rechazo, disponible pallet 0, 1 línea de despacho. **Sin stock negativo ni duplicación.**

Regresión F1–F6 (suites `proc_v1..v6_tests`): **todas pasaron** tras el fix. Dominio F6 (node): **16/16**.

## D. Issue Log

| ID | Esc | Severidad | Descripción | Esperado | Actual | Causa | Módulo | Estado |
|---|---|---|---|---|---|---|---|---|
| UAT-D-01 | D | **P1** | Un pallet mezclado acumula varias líneas del mismo PT (genealogía). `repaletizar` y `confirmar_despacho` reducían la composición de **una sola** línea (`ORDER BY kg DESC LIMIT 1`) pero validaban contra la **suma**. Si el movimiento excede la línea mayor, esa línea va a kg negativo → viola `CHECK(kg>=0)`; una operación legítima (mover/despachar un pallet mezclado) es rechazada. | Reducción distribuida entre líneas activas | Excepción `proc_pallet_linea_kg_check` | Decremento de línea única | F3 `proc_fn_repaletizar`, F4 `proc_fn_confirmar_despacho` | **CORREGIDO** (helper `proc_fn_reducir_composicion_pallet`; verificado en D + regresión F3/F4) |
| UAT-G-01 | G/masters | P3 | `proc_ubicaciones.tipo ∈ {camara,zona,ubicacion,patio}`: no hay tipo dedicado para **recepción** ni **andén de despacho**. | Tipos operativos claros | Se modela recepción=`zona`, andén=`patio` | Catálogo de tipos acotado | F2 | Abierto (validar con operación si requieren tipos propios) |
| UAT-J-01 | J/K | P2 | Orden con fecha fuera de toda vigencia de tarifa → servicio `pendiente_tarifa` **silencioso**. Correcto por diseño, pero sin alerta operativa. | Alerta "temporada sin tarifa" | Queda pendiente sin aviso | Falta capa de alertas (UI) | F6 | Abierto (UX/alerta, no es defecto) |

Notas de calidad de la propia UAT (no son defectos del sistema): (i) el assert de saldo de lote en B inicialmente sombreaba la columna con una variable homónima → corregido para leer `disponible`. (ii) La derivación de temporada del servicio de proceso toma la del movimiento de entrada del lote consumido (la orden no lleva temporada).

## E. Gaps operacionales

1. **Cobros diferidos aún no ejercitados operacionalmente:** almacenaje (`pallet_dia`), materiales de embalaje y repaletizaje como servicio facturable existen en el modelo (tipos de servicio + unidades) pero no se ejercitaron con tarifa/base en esta UAT (F6 los dejó como frontera). Requieren definición de reglas de devengo (¿desde cuándo corre el `pallet_dia`?).
2. **Turnos/líneas de proceso** (`turno`, `linea_id`) existen en la orden pero no se usaron; falta confirmar si Allegria Service planifica por línea/turno.
3. **QC como etapa formal:** hoy la calidad se captura como dimensiones del resultado (categoría/calibre/color) y motivos de descarte/merma. No hay una etapa QC previa con parámetros medidos (firmeza, °Brix, % defectos) ni gate de aprobación de recepción. Confirmar si se requiere.

## F. Gaps de UX

**No existe UI todavía.** F1–F6 es motor (SQL + dominio JS + capa DB `procesoF*DB.js`). Toda la validación es de backend. Para productizar se requieren pantallas por rol:

- **Recepción:** alta rápida de recepción+lote (folio, productor, especie/variedad, kg, cámara) en pocos toques.
- **Producción:** buscar lote/orden, registrar consumo N:M y resultado por calibre/color, disparar conciliación con semáforo de cuadre.
- **Calidad:** captura de categorías/calibres/colores/motivos entendibles.
- **Bodega:** mapa de pallets por ubicación, saldos, traslados, repaletizaje visual con genealogía.
- **Despacho:** armar carga, reservar, confirmar sin ambigüedad; identidad de pallet con saldo.
- **Comercial:** emitir Resultado de Proceso (PDF legible para productor/exportadora) + versiones + destinatarios.
- **Finanzas:** ver servicios facturables, resolver `pendiente_tarifa`, armar y aprobar Base de Cobro con trazabilidad al hecho.

El **PDF del Resultado de Proceso** no se generó (el snapshot estructurado sí existe y es consultable — `identificacion/resumen/detalle`); la generación del PDF es capa UI pendiente.

## G. Gaps de datos / maestros

Clasificación (confirmado / supuesto temporal / requiere validación operacional):

| Dato | Estado | Nota |
|---|---|---|
| Códigos de recepción / lote / pallet | **requiere validación** | Hoy texto libre con UNIQUE; sin correlativo/formato definido. |
| Calibres, colores, categorías | supuesto temporal | Se usaron J/XL, MAH/DARK, EXP/CAT2 de ejemplo; cargar los reales por especie. |
| Motivos de descarte / merma | supuesto temporal | BLANDA/PARTIDA/DESHID de ejemplo; confirmar catálogo real. |
| Formatos / cajas (kg nominal) | supuesto temporal | CHE-5KG, PLU-10KG de ejemplo. |
| Reglas de mezcla en pallet | **confirmado** (modelo) | `pallet_compat_keys` configurable (se usó `["especie_codigo"]`). Confirmar política real. |
| Cámaras / líneas / turnos | requiere validación | Estructura existe; falta el layout real de Rancagua. |
| Materiales de embalaje | requiere validación | Facturables diferidos; sin catálogo ni regla de cobro. |
| Parámetros QC (firmeza/Brix/defectos) | requiere validación | No modelados como medición; decidir si se necesitan. |
| Conceptos cobrables (tipos de servicio) | confirmado (modelo) | PROC/ALM/INSP de ejemplo; cargar los reales. |
| Tarifas reales | **requiere validación** | 0,25/0,30 USD/kg de ejemplo; cargar tarifario real por cliente/especie/vigencia. |
| Excepciones comerciales | confirmado (modelo) | Servicio manual con motivo+autorización disponible. |

## H. Gaps económicos / tarifarios

- **Cobertura de vigencias:** el tarifario debe cubrir toda la temporada; una orden fuera de vigencia queda `pendiente_tarifa` sin alerta (UAT-J-01).
- **Unidades no-kg no ejercitadas:** `pallet_dia`, `caja`, `evento`, `camara_dia` existen en el dominio de unidades pero solo se probó `kg_procesado` con montos reales. Almacenaje/materiales requieren reglas de base de cobro específicas.
- **Multimoneda:** modelada (moneda por tarifa/servicio/base) pero la UAT operó todo en USD; falta ejercitar un cliente en otra moneda si aplica.
- **Revenue ≠ costo:** confirmado: F6 solo calcula lo que Service cobra; el costo interno (margen/kg) es fase posterior (Opción C).

## I. Decisiones pendientes

1. **Tipos de ubicación** dedicados para recepción/andén (UAT-G-01): ¿se agregan a la enumeración?
2. **Alerta de `pendiente_tarifa`** (UAT-J-01): ¿dónde vive (UI Finanzas)? ¿bloquea la Base de Cobro?
3. **QC formal:** ¿se necesita etapa de calidad con parámetros medidos y gate de aprobación, o basta la dimensión de resultado actual?
4. **Almacenaje / materiales:** reglas de devengo y catálogo antes de habilitar su facturación.
5. **Formato de códigos** (recepción/lote/pallet): ¿correlativo autogenerado por planta/temporada?
6. **Layout real de Rancagua** (cámaras/líneas/turnos) para poblar maestros.

## J. Recomendación de siguiente fase

El motor F1–F6 es correcto, conciliado, trazable y seguro. El cuello de botella para poner Allegria Service en operación **no es más motor, es la interfaz operacional y los maestros reales**. Recomendación:

**Opción A — UI operacional productiva**, empezando por los roles de mayor fricción diaria (Recepción, Producción, Bodega/Despacho), alimentada por una carga previa de maestros reales de Rancagua. Costos/margen (Opción C) y ERP (Opción D) quedan después, una vez que exista captura operacional real. Hardening/auth productiva (Opción E) se integra en paralelo al construir la UI (RLS de producción ya está lista y probada).

Decisión final del CFO.

---

## Criterio de aprobación (checklist §20)

- [x] Sin UAT-P0 abiertos.
- [x] UAT-P1 resuelto (UAT-D-01 corregido y verificado) — 0 P1 abiertos.
- [x] Conciliación física consistente (A–L; Σ resultado+descarte+merma = consumido, dentro de tolerancia).
- [x] Genealogía confiable (B, C, D: N:M lote↔orden y pallet 3 generaciones).
- [x] Resultado de Proceso entendible (snapshot estructurado; packout correcto) — PDF pendiente de UI.
- [x] Base de Cobro trazable (servicio→hecho→tarifa con snapshot; base inmutable al aprobar).
- [x] Seguridad/tenant intacta (RLS producción: `anon` denegado; FK exige `proc_vinculo`).
- [x] Roles de negocio bien separados (F: 5 roles; G/H: identidad vs relación).

**Cierre:** UAT integral F1–F6 **APROBADA**. No se avanza a fase siguiente sin decisión del CFO sobre la Opción (A–E).
