# F7.0 — Matriz UI ↔ Backend (Allegria Service `proc_*`)

**Fecha:** 2026-08-13 · **HEAD:** `71be745` · Contrato backend F1–F6 VALIDATED. Este documento mapea cada operación de UI a su contrato backend **CURRENT** (tabla/vista/RPC). **Regla de oro:** cuando existe RPC/vista/función, la UI la consume; no reimplementa la regla.

## 0. Principio estructural — qué puede escribir la UI directamente y qué no

El ledger físico `proc_movimiento` es **append-only** y está protegido por el trigger `trg_block_proc_movimiento` (bloquea UPDATE/DELETE). Por tanto:

- **Todo cambio de inventario físico (masa, pallets, holds) → SOLO vía RPC.** La UI nunca inserta en `proc_movimiento`, `proc_orden_insumo`, `proc_pallet_linea`, `proc_hold`, `proc_despacho_linea` directamente. Estas escrituras van por las RPC transaccionales (que crean movimiento + lineage atómicamente).
- **Tablas de catálogo y cabeceras no-ledger → escritura REST** (`procInsert`/`procUpdate` en `procesoDB.js`), sujeta a RLS y CHECK/FK del schema. Aplica a maestros, `proc_recepcion` (cabecera), `proc_qc_recepcion`, `proc_programa_proceso`.
- **Lectura → REST** (`procSelect`) sobre tablas y vistas derivadas. Los saldos/conciliación/genealogía se leen de VISTAS (SoT derivada), nunca se recalculan en React.

Capa JS existente que la UI debe consumir: `src/proceso/core/procesoDB.js` (+ `procesoF2..F6DB.js`) — loaders `cargar*` y wrappers `procRpc`. Dominio puro (formateo/validación UX espejo) en `procesoDomain.js` (+ F2..F6). **No** duplicar reglas: el dominio JS ya espeja las invariantes, pero la autoridad es la DB.

## 1. Operación → contrato backend

Leyenda R/W: **R** lectura (REST vista/tabla) · **W-RPC** escritura transaccional (RPC obligatoria) · **W-REST** escritura directa a tabla no-ledger (REST + RLS).

### Recepción y materia prima

| Proceso UI | Acción | Backend | R/W | Regla asociada | Estado contrato |
|---|---|---|---|---|---|
| Recepciones (lista) | ver | `proc_recepcion`, loader `cargarRecepciones` | R | RLS por empresa | LISTO |
| Alta recepción (cabecera) | crear | `proc_recepcion` (REST) | W-REST | 4 roles distintos (cliente/productor/dueño/exportadora vínculos); estado planificada→activa→cerrada→anulada | LISTO (sin RPC; validación UX) |
| Ingreso de lote ubicado | crear lote + entrada física | RPC `proc_fn_ingresar_lote_ubicado` | W-RPC | crea `proc_lote` + `proc_movimiento` entrada atómico; kg>0 | LISTO |
| Lotes / materia prima (lista + saldo) | ver | `proc_lote` + vista `proc_v_lote_saldos` (on_hand/bloqueado/reservado/disponible) | R | saldo = ledger, sin cache | LISTO |
| Saldo de lote por ubicación | ver | vista `proc_v_lote_ubicacion` | R | transferencia no altera total | LISTO |
| Traslado interno de lote | mover entre ubicaciones | RPC `proc_fn_trasladar` | W-RPC | naturaleza 'transferencia'; valida saldo en origen | LISTO |

### QC (calidad de recepción)

| QC parámetros (catálogo) | administrar | `proc_qc_parametro` (REST) | W-REST | tipo_dato numero/texto/booleano, rango_min/max, obligatorio | LISTO (catálogo) |
| QC de recepción | registrar medición + resultado | `proc_qc_recepcion` (REST; `valores` jsonb + resultado aprobado/rechazado/condicional) | W-REST | **1 QC por recepción** (UNIQUE). **Validación de tipo/rango: solo dominio JS, no hay RPC** → ver gap F7-QC-01 | PARCIAL |

### Programa y órdenes de proceso

| Programa de proceso | ver/crear/publicar | `proc_programa_proceso` (REST; estado borrador/publicado/cerrado; `lotes_previstos` jsonb) | R/W-REST | planificación; no toca ledger | LISTO (sin RPC) |
| Órdenes (lista) | ver | `proc_orden_proceso`, loader `cargarOrdenes` | R | estados borrador/en_proceso/pendiente_conciliacion/conciliado/cerrado/anulado | LISTO |
| Abrir orden | crear + transición | `proc_orden_proceso` (REST insert) + trigger `trg_orden_transicion` | W-REST | máquina de estados en trigger | LISTO |
| Consumir lote en orden (N:M) | registrar consumo | RPC `proc_fn_consumir_lote_en_orden` | W-RPC | movimiento + `proc_orden_insumo` atómico; FOR UPDATE serializa; valida disponible | LISTO |
| Insumos de una orden (genealogía) | ver | `proc_orden_insumo`, loader `cargarInsumosOrden` | R | N:M lote↔orden | LISTO |
| Resultado (comercial/calibre/color) | registrar | `proc_resultado` (REST) | W-REST | dimensiones categoría/calibre/color | LISTO |
| Descarte / merma | registrar | `proc_resultado_descarte` / `proc_resultado_merma` (REST) | W-REST | separados, no sinónimos | LISTO |
| Conciliación de masa | ver diferencia | vista `proc_v_orden_conciliacion` (entrada vs resultado+descarte+merma, tolerancia) | R | Σsalidas ≤ tolerancia | LISTO |
| Conciliar + cerrar orden | ejecutar | RPC `proc_fn_conciliar_orden` + transición a cerrado | W-RPC | **el cierre exige cuadre ≤ tolerancia (trigger), no solo visual** | LISTO |

### Producto terminado, pallets, repaletizaje, bodega

| Resultado disponible para PT | ver | vista `proc_v_resultado_disponible` | R | no sobreasignar resultado | LISTO |
| Materializar PT | crear PT desde resultado | RPC `proc_fn_materializar_pt` | W-RPC | PT nace de línea de resultado; FOR UPDATE | LISTO |
| PT (lista + saldo) | ver | `proc_producto_terminado` + vista `proc_v_pt_saldos` | R | on_hand PT | LISTO |
| Crear pallet | crear | RPC `proc_fn_crear_pallet` | W-RPC | codigo único empresa+temporada (barcode) | LISTO |
| Palletizar (PT→pallet) | agregar cajas/kg | RPC `proc_fn_palletizar` | W-RPC | compat configurable (`pallet_compat_keys`); no exceder PT | LISTO |
| Pallets (lista + saldo) | ver | `proc_pallet` + vista `proc_v_pallet_saldos` (disponible = físico − bloqueado − reservado) | R | saldo pallet = ledger | LISTO |
| Composición / genealogía pallet | ver | vista `proc_v_pallet_composicion` + `proc_pallet_linea` | R | líneas = SoT composición (Σ líneas = físico, constraint trigger) | LISTO |
| Repaletizaje N:M (split/merge/parcial) | ejecutar | RPC `proc_fn_repaletizar` (`moves` jsonb) | W-RPC | balance Σorigen=Σdestino; reduce composición distribuida (fix UAT-D-01) | LISTO |
| Traslado de pallet | mover ubicación | RPC `proc_fn_trasladar_pallet` | W-RPC | transferencia; identidad intacta con saldo | LISTO |
| Genealogía navegable (lote↔pallet) | ver ancestros/descendientes | `proc_repaletizaje_origen`/`_destino` + `proc_orden_insumo` + `proc_pallet_linea` (CTE recursivo) | R | trazabilidad bidireccional | LISTO (requiere read-model, ver F7-RM-01) |

### Despacho

| Despachos (lista) | ver | `proc_despacho`, loader `cargarDespachos` | R | estados borrador/preparando/listo/cargando/despachado/cancelado | LISTO |
| Crear despacho | crear | RPC `proc_fn_crear_despacho` | W-RPC | cliente≠destinatario; destinatario cualquiera (no exportación) | LISTO |
| Preparar/listo | transición | `proc_despacho` UPDATE + trigger `trg_desp_transicion` | W-REST | máquina de estados en trigger | LISTO |
| Reservar pallet | reservar | RPC `proc_fn_reservar_pallet` | W-RPC | hold reserva (reduce disponible, no físico) | LISTO |
| Liberar reserva | liberar | RPC `proc_fn_liberar_reserva` | W-RPC | | LISTO |
| Confirmar despacho (parcial/múltiple) | confirmar salida | RPC `proc_fn_confirmar_despacho` (`lineas` jsonb) | W-RPC | salida ledger + línea (movimiento_id obligatorio); reduce composición distribuida; parcial conserva saldo | LISTO |
| Conciliación de despacho | ver | vista `proc_v_despacho_conciliacion` | R | Σ líneas = Σ movimientos | LISTO |
| Reversar despacho | revertir | RPC `proc_fn_reversar_despacho` | W-RPC | contramovimientos; restituye stock + composición | LISTO |
| Documentos de despacho | adjuntar | `proc_despacho_doc` (REST + Storage) | W-REST | | LISTO |

### Resultado de Proceso (salida comercial)

| Informes (lista) | ver | `proc_informe`, loader `cargarInformes` | R | | LISTO |
| Crear informe | crear | RPC `proc_fn_crear_informe` | W-RPC | destinatario desde `proc_vinculo` | LISTO |
| Generar versión (consolidación) | generar | RPC `proc_fn_generar_version` (`orden_ids[]`) | W-RPC | consolidación MATEMÁTICA (Σkg comerciales/Σkg procesados); snapshot jsonb inmutable | LISTO |
| Versiones + snapshot | ver | `proc_informe_version` (snapshot: identificacion/resumen/detalle/packout) | R | **CURRENT vs SNAPSHOT: nunca recalcular versión histórica con maestros CURRENT** | LISTO |
| Fuentes del informe | ver | `proc_informe_fuente` | R | fuentes explícitas, sin duplicar órdenes | LISTO |
| Agregar destinatario | agregar | RPC `proc_fn_agregar_destinatario` | W-RPC | snapshot de contacto congelado | LISTO |
| Emitir versión (+PDF path) | emitir | RPC `proc_fn_emitir_version` | W-RPC | emitida = inmutable; corrección = nueva versión | LISTO |
| Generar PDF | render | (no existe backend) — snapshot → PDF en UI | — | PDF = representación, no SoT | **GAP F7-PDF-01** |
| Registrar envío | registrar | RPC `proc_fn_registrar_envio` + `proc_informe_envio` (estado pendiente/enviado/error/...) | W-RPC | email real gated a UI | LISTO |

### Comercial / Base de Cobro

| Tipos de servicio (catálogo) | administrar | `proc_tipo_servicio` (REST) | W-REST | unidad_default | LISTO |
| Tarifario (vigencias/prioridad) | administrar | `proc_tarifa` (REST) | W-REST | vigencia + especificidad (cliente/temporada/especie) + prioridad | LISTO |
| Resolver tarifa (preview) | ver | RPC `proc_fn_resolver_tarifa` (STABLE) | R | resolución determinística | LISTO |
| Generar servicio de proceso | generar | RPC `proc_fn_generar_servicio_proceso` | W-RPC | cantidad = kg PROCESADOS (Σ insumo); snapshot tarifa; idempotencia | LISTO |
| Generar servicio manual | generar | RPC `proc_fn_generar_servicio_manual` | W-RPC | exige motivo + autorización | LISTO |
| Servicios facturables (lista) | ver | `proc_servicio_facturable`, loader `cargarServicios` | R | origen FK real XOR; estados valorizado/pendiente_tarifa | LISTO |
| **Bandeja Pendientes de Tarifa** | ver | `proc_servicio_facturable WHERE estado='pendiente_tarifa'` | R | **nunca representar como $0** | LISTO (filtro) |
| Base de cobro | crear/agregar/aprobar | RPC `proc_fn_crear_base_cobro` / `proc_fn_agregar_a_base` / `proc_fn_aprobar_base` | W-RPC | inmutable al aprobar (guard); total = Σ líneas | LISTO |
| Líneas de base | ver | `proc_base_cobro_linea`, loader `cargarLineasBase` | R | 1 servicio por línea (UNIQUE) | LISTO |

### Configuración / maestros

| Plantas, temporadas, ubicaciones, líneas, calibres, colores, formatos, categorías, motivos, condiciones, predios, tipos de servicio | administrar | tablas de catálogo `proc_*` (REST) | R/W-REST | RLS por empresa; UNIQUE por codigo | LISTO |
| Vínculos (contrapartes) | administrar | `proc_vinculo` (REST) | W-REST | rol_operacional; identidad Core por grupo/auxiliar; **universo de partes de Service = esta tabla** | LISTO |
| Activación de catálogos | administrar | `proc_catalogo_activacion` | W-REST | | LISTO |

## 2. Cobertura — ninguna operación crítica queda solo en frontend

Las 26 operaciones que tocan invariantes (ledger, holds, conciliación, composición, tarifa, base) tienen **RPC dedicada**. La UI no puede escribir el ledger directamente (trigger de bloqueo). Escrituras REST se limitan a catálogos y cabeceras no-ledger, protegidas por RLS + CHECK + FK. **Conclusión: 100% de las invariantes viven en backend.**

## 3. Gaps de contrato detectados en F7.0 (para §30 y read-models)

- **F7-QC-01 (BACKEND MENOR):** `proc_qc_recepcion.valores` (jsonb) no tiene RPC que valide tipo/rango contra `proc_qc_parametro`; hoy la validación sería solo en dominio JS. Proponer RPC `proc_fn_registrar_qc` (o CHECK/trigger) para que el rango se garantice en DB, no en React.
- **F7-PDF-01 (UX):** el PDF del Resultado de Proceso se genera en UI desde el snapshot (jspdf ya disponible). No requiere backend; sí requiere leer SIEMPRE el snapshot emitido, nunca CURRENT.
- **F7-COR-01 (BACKEND MENOR / DECISIÓN):** folios (recepción/orden/pallet/despacho/informe/base) son `text` provistos por el cliente, UNIQUE por empresa. **No existe generador de correlativo concurrency-safe.** Proponer secuencia por (empresa, temporada, tipo) vía RPC. No generar correlativos en React.
- **F7-RM-01 (BACKEND MENOR):** genealogía navegable y el Centro de Operaciones requieren read-models de agregación (ver `proceso-f7-arquitectura-ui.md §read-models`). No hacer los joins/CTE en React.

Ninguno es ESTRUCTURAL: no cambian ledger, SoT, genealogía, ownership, tenancy, seguridad ni modelo económico.
