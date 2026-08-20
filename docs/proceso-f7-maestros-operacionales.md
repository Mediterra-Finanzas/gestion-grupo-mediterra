# F7.0 — Maestros operacionales: inventario A/B/C/D

**Fecha:** 2026-08-13 · **HEAD:** `71be745`. Clasificación de las parametrizaciones necesarias antes de una UAT productiva de Allegria Service. La UAT backend usó valores de ejemplo (cerezas J/XL, MAH/DARK, EXP/CAT2, tarifas 0,25/0,30); **ninguno es dato productivo**.

**Escala:** **A** = existe y listo (contrato completo, no requiere dato real). **B** = existe pero requiere parametrización real de Rancagua. **C** = backend previsto pero no materializado (falta RPC/validación/estrategia). **D** = no existe y se necesita.

| Maestro | Tabla `proc_*` | Clase | Qué falta / nota |
|---|---|---|---|
| Plantas | `proc_planta` | **B** | Cargar Planta(s) real(es) de Allegria Service (Rancagua u otras). |
| Temporadas | `proc_temporada` | **B** | Cargar temporadas vigentes (25/26, 26/27) con fechas. |
| Ubicaciones | `proc_ubicaciones` | **B** | Layout real: cámaras, andenes, zonas de recepción. Tipo ∈ {camara,zona,ubicacion,patio}; **sin tipo dedicado recepción/andén** (UAT-G-01). Ver decisión. |
| Líneas de proceso | `proc_lineas_proceso` | **B** | Cargar líneas reales si se planifica por línea/turno. |
| Calibres | `proc_calibre` (por especie) | **B** | Cargar calibres reales por especie (cereza mm, ciruela conteo). |
| Colores | `proc_color` (por especie) | **B** | Cargar escala de color real (cereza: mahogany/dark/light). |
| Categorías de calidad | `proc_categorias_calidad` | **B** | Cargar categorías reales (EXP, CAT2, etc.) con `es_comercial`. |
| Motivos de descarte | `proc_motivos_descarte` | **B** | Cargar catálogo real (blanda, partida, pudrición, calibre bajo...). |
| Motivos de merma | `proc_motivos_merma` | **B** | Cargar catálogo real (deshidratación, proceso...). |
| Formatos / cajas | `proc_formato` (kg_nominal_caja) | **B** | Cargar formatos reales por especie con kg nominal y embalaje. Las "cajas" viven aquí. |
| Condiciones | `proc_condiciones` | **B** | Confirmar uso y cargar si aplica. |
| Predios | `proc_predios` | **B** | Cargar predios de productores si se registra origen a nivel predio/cuartel. |
| Vínculos (contrapartes) | `proc_vinculo` | **B** | Cargar clientes del servicio / productores / dueños / exportadoras / destinatarios reales, con identidad Core (grupo/auxiliar). **Universo comercial de Service = esta tabla** (no Frisku). |
| Tipos de servicio | `proc_tipo_servicio` | **B** | Cargar conceptos cobrables reales (proceso, almacenaje, inspección, materiales...). |
| Tarifas | `proc_tarifa` | **B** | Cargar tarifario real por cliente/especie/vigencia/unidad/moneda. Crítico: cubrir toda la temporada (evita `pendiente_tarifa`). |
| Parámetros QC | `proc_qc_parametro` | **B** (catálogo) / **C** (enforcement) | Cargar parámetros reales (firmeza, °Brix, % defectos) con tipo/rango/obligatorio. **Falta RPC que valide `valores` contra rango** (F7-QC-01). |
| Materiales de embalaje | — (no existe) | **D** | No hay tabla de materiales ni regla de cobro. Requerido solo si se factura materiales (F6 lo dejó diferido). Definir catálogo + regla de devengo antes de habilitarlo. |
| Correlativos (recepción/orden/pallet/despacho/informe/base) | folios `text` UNIQUE | **C** | Existen como texto único provisto por el cliente. **No hay generador concurrency-safe.** Proponer secuencia por (empresa, temporada, tipo) vía RPC. Ver F7-COR-01. |
| Formato de código de lote / pallet (barcode) | `proc_lote.codigo`, `proc_pallet.codigo` | **C** | Contrato = texto único (UNIQUE empresa+temporada). **Estrategia de código humano/barcode no definida** (ver `proceso-f7-arquitectura-ui.md §barcode`). |

## Resumen por clase

- **A (listo, sin dato):** ninguno puro — todos los catálogos requieren al menos datos reales del tenant. El *contrato* está completo (clase B por dato), no faltan tablas salvo materiales.
- **B (existe, requiere dato real):** 16 maestros — el grueso del trabajo pre-UAT productiva es **carga de datos**, no desarrollo. Se resuelve con pantallas de configuración (F7.1) + carga asistida.
- **C (backend previsto, falta materializar):** QC enforcement (RPC de validación), correlativos concurrency-safe, estrategia de código/barcode. Todos **BACKEND MENOR** (read-model/RPC/índice), no estructurales.
- **D (no existe):** materiales de embalaje como facturable. Solo si el negocio lo requiere; hoy fuera de alcance F6.

## Recomendación de carga

1. **Bloqueantes para UAT productiva:** plantas, temporadas, ubicaciones, vínculos, calibres, colores, categorías, motivos, formatos, tipos de servicio, **tarifas** (cobertura total de temporada).
2. **Antes de habilitar QC como gate:** cargar parámetros QC reales + materializar F7-QC-01.
3. **Antes de operar en planta:** definir estrategia de correlativos/códigos (F7-COR-01) — es concurrency-safe y no puede vivir en React.
4. **Diferible:** materiales de embalaje (solo si se factura).

No se inventan datos productivos en F7.0. La carga real la provee Allegria Service; la UI la habilita en el módulo Configuración.
