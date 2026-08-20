# PROC-MAESTROS-TRAZABILIDAD-001 — Plan de Tests (diseño)

**Estado:** diseño. Los tests se materializan junto con el SQL, no antes. Aquí se validan **conceptualmente** contra el modelo TARGET y se define qué debe probar cada uno. Ejecución prevista: Postgres 16 efímero (`ON_ERROR_STOP=1`) + suites SQL + tests de dominio JS + genealogía.

## A. Tests de arquitectura (§N del CFO) — cómo los soporta el TARGET

| # | Escenario | Cómo lo resuelve el TARGET | Verificación |
|---|---|---|---|
| 1 | 1 Cliente → 3 Productores | `proc_cliente_productor` N:M | 3 filas (cliente, prod1/2/3); listar productores del cliente = 3 |
| 2 | 1 Productor → 2 Clientes | mismo `productor_vinculo_id` en 2 filas N:M | el productor es UNA entidad; 2 clientes lo referencian |
| 3 | 1 Productor → 3 Predios | `proc_predios.productor_vinculo_id` | 3 predios del productor |
| 4 | 1 Predio → N Cuarteles | `proc_cuartel.predio_id` | N cuarteles del predio |
| 5 | Cereza→Santina/Regina; Arándano→propias; cruce inválido imposible | FK `proc_variedad.especie_codigo`→`proc_especie` | insertar `Santina/Arándano` → **error FK/CHECK** (integridad backend) |
| 6 | 1 Recepción → 3 Lotes distinto origen | origen en `proc_lote` (no cabecera) | 3 lotes, 3 orígenes distintos bajo 1 recepción; snapshots distintos |
| 7 | 1 Lote → varias órdenes | `proc_orden_insumo` (N por lote) | consumos parciales del mismo lote en 2 órdenes |
| 8 | 1 Orden ← varios Lotes/productores | `proc_orden_insumo` (N lotes por orden) | orden con insumos de lotes de distinto productor |
| 9 | Pallet mixto → genealogía multi-origen | genealogía por `pallet_linea→PT→orden→insumo→lote→snapshot` | genealogía devuelve **≥2 orígenes** para el pallet mixto |
| 10 | Repaletizaje N:M conserva origen | `pallet_linea.pt_id` intacto; snapshot en el lote | tras repaletizar, genealogía del destino conserva orígenes |
| 11 | Despacho→…→cuartel/predio/productor | cadena completa hacia atrás | desde despacho, resolver origen agrícola de cada pallet |
| 12 | Cambiar nombre/CSG del maestro NO altera snapshot | `origen_snapshot` inmutable en el lote | editar productor CURRENT → snapshot del lote histórico sin cambios |
| 13 | Mismo nombre distinto casing no duplica | `claveNormalizada` + dedup (F7.6.1) | crear `AGRÍCOLA LAS NIEVES SPA` con `Agrícola Las Nieves SpA` existente → bloqueo/sugerencia |
| 14 | Frisku isolation = 0 dependencias | catálogos propios `proc_*` | `pg_depend` + `view_table_usage`: 0 `proc_*`→`frisku_*`/`exp_*` |
| 15 | Foods como cliente intercompany sin `exp_*` | `proc_vinculo` cliente | recepción con cliente=Foods, 0 FK a `exp_*` |

## A-bis. Tests de arquitectura — Ficha Cliente + Contrato (§19 addendum)

| # | Escenario | Cómo lo resuelve el TARGET | Verificación |
|---|---|---|---|
| 16 | Cliente con contrato vigente → operar sin alerta | gate `cliente_habilitado_para_operar` = habilitado | recepción/programa sin alerta |
| 17 | Cliente sin contrato, no obligatorio (`politica=informativo`) → info/warning | política en ficha | nivel = info/advertencia, no bloquea |
| 18 | Contrato obligatorio (`bloqueante`) sin firma → bloqueo donde corresponde | gate nivel bloqueante en avance | **recepción física permitida**; programación/proceso bloqueado por backend |
| 19 | Contrato vencido → alerta | vigencia por fecha/temporada | estado "vencido" + alerta |
| 20 | Contrato v1 reemplazado por v2 → historia preservada | `reemplaza_contrato_id` + `contrato_vigente_id` FK a versión | operación histórica sigue apuntando a v1 |
| 21 | Recepción física con contrato faltante | recepción registrable; gate limita avance | lote/recepción trazables; programa/proceso según política |
| 22 | Contrato vigente + tarifa faltante → `pendiente_tarifa` | controles independientes | contrato OK; servicio `pendiente_tarifa` (F6) |
| 23 | Tarifa OK + contrato faltante → alerta contractual | controles independientes | tarifa resuelve; alerta contractual separada |
| 24 | Foods como Cliente Service con contrato propio, sin `exp_*` | ficha/contrato sobre `proc_vinculo` | 0 FK a `exp_*` |
| 25 | Cliente Frisku-only NO aparece como Cliente Service | ficha sólo para vínculos `cliente_servicio` de `proc_*` | sin ficha/contrato Service automáticos; 0 dep `frisku_*` |

## B. Regresión obligatoria (no romper lo construido)
- Cadena v1→v7.7 + fases nuevas aplica limpia.
- **13 suites F1–F7.7** pasan (recepción, QC, consumo, conciliación, PT, pallet, repaletizaje, despacho, informes F5, tarifario, base de cobro, filtros F7.8).
- Concurrencia crítica (consumo/repaletizaje/reserva-despacho) sin negativos.
- Invariante Σ líneas = saldo físico intacto (el origen es metadata, no afecta saldos).
- Snapshot F5 emitido inmutable.

## C. Tests de integridad nuevos
- FK especie→variedad rechaza cruces inválidos.
- FK cuartel→predio, predio→productor.
- UNIQUE por tenant en cada catálogo.
- `origen_snapshot` se construye al ingreso y no se re-escribe al editar maestros.
- Backfill histórico: cuartel="no informado", `origen_reconstruido=true` donde aplica; nunca fabricado.

## D. RLS / tenant / bounded context
- anon → DENY en todas las tablas/vistas nuevas.
- Cross-tenant → 0 filas.
- 0 dependencias `proc_*`→`exp_*`/`frisku_*` (catálogo + views).

## E. Dominio JS + UI
- `normalizarNombre`/`claveNormalizada` sobre nombres de maestros; normalización determinística de códigos (RUT/CSG/códigos) distinta del Title Case.
- Cascada: helper puro que, dado un contexto (productor/predio/especie), devuelve el universo válido del siguiente nivel — testeable sin navegador.
- Filtros acumulativos por las nuevas dimensiones (extiende `filtrosActivos` + test de acumulación a nivel de datos como en F7.8).

---

## F. TABLA FINAL DE DECISIONES (requieren CFO)

### Bloque 1 — Trazabilidad agrícola
| # | Decisión | Recomendación | Alternativas | Impacto | ¿Requiere CFO? |
|---|---|---|---|---|---|
| D1 | **Origen: autoridad en Lote** (recepción header = default) | Sí, mover al Lote | Mantener en cabecera (no soporta cargas mixtas) | Estructural en `proc_lote` + genealogía; aditivo | **SÍ** (ya expresaste preferencia; confirmar) |
| D2 | **Productor: extender `proc_vinculo`** con rut/csg_sag vs tabla 1:1 | Columnas nullable en `proc_vinculo` | `proc_productor(vinculo_id)` 1:1 (más limpio, +JOIN) | Menor; ambos aditivos | **SÍ** |
| D3 | **Snapshot origen = jsonb `origen_snapshot`** en el lote | jsonb (patrón F5), mínimo suficiente | Columnas discretas snapshot (más rígido, +ancho) | Aditivo | **SÍ** |
| D4 | **Especie/Variedad tenant-scoped** (por empresa) | Tenant-scoped (consistente con calibre/color) | Referencia global `ref_especie` (rompe aislamiento) | Modela RLS por empresa | **SÍ** |
| D5 | **Cuartel: especie/variedad como default, autoridad en snapshot del lote** | Sí (un cuartel puede replantarse) | Cuartel fija la variedad del lote (rígido) | Define de dónde toma la variedad el lote | **SÍ** |
| D6 | **Backfill histórico**: cuartel/CSG desconocido = "no informado", `origen_reconstruido=true` | Sí (no fabricar) | Dejar null sin marca (menos auditable) | Auditoría honesta | **SÍ** (confirmar) |
| D7 | **FK especie/variedad en calibre/qc/color/PT/orden** (integridad) | Activar tras seed del catálogo | Mantener texto libre (sin integridad) | Rechaza códigos huérfanos | **SÍ** |
| D8 | **Relación cliente↔productor histórica**: no inferir como verdad | No inferir (opcional sugerir borrador) | Backfill automático desde recepciones (crea relaciones falsas) | Evita datos falsos | **SÍ** |

### Bloque 2 — Ficha Cliente Service + Contrato (`proceso-cliente-contrato-target.md`)
| # | Decisión | Recomendación | Alternativas | Impacto | ¿Requiere CFO? |
|---|---|---|---|---|---|
| D9 | **Ficha Cliente**: extender `proc_vinculo` vs tabla 1:1 | Tabla 1:1 `proc_cliente_ficha` (atributos cliente-específicos) | Columnas en `proc_vinculo` (lo ensucia) | Aditivo | **SÍ** |
| D10 | **Contrato**: entidad versionada `proc_cliente_contrato` | Sí (no un booleano `tiene_contrato`) | Flag simple (sin trazabilidad de documento) | Aditivo + storage privado | **SÍ** |
| D11 | **Política de obligatoriedad** por cliente (info/warning/blocking) | Configurable en la ficha; **backend autoridad del bloqueo** | Universal "sin contrato = no opera" (rígido) | Define gate | **SÍ** |
| D12 | **Gate**: recepción física siempre registrable; bloqueo al avance según política | Sí (no perder trazabilidad física) | Bloquear la recepción (pierde trazabilidad) | Ubicación del gate | **SÍ** |
| D13 | **Documento equivalente** configurable (contrato/business clause/acuerdo) | Catálogo `proc_tipo_documento_contractual` + flag `satisface_requisito` | Hardcodear "CONTRATO" | Aditivo | **SÍ** |
| D14 | **Referencia histórica**: qué operación guarda el contrato aplicable | FK a la **versión** de contrato vigente al momento (`contrato_vigente_id`) | Snapshot de campos (redundante) / sólo por fecha (frágil) | Historia preservada | **SÍ** |

*(Resueltas fuera de tabla: alcance de materialización = **COMPLETO** por decisión del CFO; UI cascada + ficha premium = ítems de revisión visual, no gates de schema.)*

## G. Criterio para autorizar materialización
Con **D1–D14** resueltas por el CFO, la materialización procede por fases (`-migration-plan.md` para trazabilidad; una fase análoga para ficha/contrato), cada una con su gate de regresión (incl. tests 16–25). Nada se aplica a producción; nada se mergea. Al final, re-abrir la Visual QA de Recepción/Lotes/Producción/Trazabilidad (hoy `VISUAL QA CERTIFIED = NO`).
