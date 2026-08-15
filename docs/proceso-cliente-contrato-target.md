# PROC-MAESTROS-TRAZABILIDAD-001 · Addendum — Ficha de Cliente Service + Contrato (diseño)

**Estado:** DISEÑO para aprobación CFO. **No SQL, no schema, no UI, no materialización.** Complementa `proceso-maestros-trazabilidad-target.md`. Es la **dimensión comercial** (Cliente del servicio → ficha Service → contrato), ortogonal a la dimensión de origen agrícola (Productor→Predio→Cuartel→Especie→Variedad).

## 1. Principio: Core = identidad, Proc = relación Service
- **`proc_vinculo`** sigue siendo la relación operacional/comercial (rol `cliente_servicio`). No se duplica identidad.
- **Identidad legal** (razón social, RUT) es SoT de **Core** (`contab_empresas`/`contab_auxiliares`, referenciados por `proc_vinculo.grupo_empresa_id`/`auxiliar_id`). La ficha Service **referencia** Core, no lo copia. Para vínculos provisorios (`pendiente_alta_corporativa=true`) se usa `nombre_provisional` hasta el alta corporativa.
- El **contrato del Cliente NO se asocia al Productor**. Son dimensiones distintas que sólo convergen en la operación.

## 2. Ficha Cliente Service — `proc_cliente_ficha` (1:1)
**Decisión D9 — recomendación: tabla 1:1 `proc_cliente_ficha`** (PK/FK `cliente_vinculo_id`), NO extender `proc_vinculo`.
*Razón:* los atributos son específicos del rol cliente (facturación, responsable comercial, condiciones de recepción, política contractual) y no aplican a productor/transportista; cargarlos en el `proc_vinculo` genérico lo ensucia. Una tabla 1:1 mantiene `proc_vinculo` como identidad/relación pura. (Contraste con Productor, cuyos rut/csg son pocos atributos de identidad → columnas en `proc_vinculo`.)

Campos (mínimos, sin duplicar SoT Core):
`id, empresa_id, cliente_vinculo_id (UNIQUE), nombre_display (deriv./normalizado), contacto_principal, email, telefono, direccion, responsable_comercial, condiciones_recepcion_proceso (text), datos_facturacion_ref (text/jsonb), politica_contrato (enum: no_requerido|informativo|advertencia|bloqueante), notas_internas, estado (activo|inactivo), + auditoría/soft-delete`.
RUT/razón social **NO** se guardan aquí: se resuelven de Core vía el vínculo (se muestran, no se persisten como SoT).

## 3. Contrato — `proc_cliente_contrato` (entidad versionada) · D10
**Decisión D10 — recomendación: entidad propia versionada** (no un booleano `tiene_contrato`).
`id, empresa_id, cliente_vinculo_id, codigo, tipo_documento_id (FK §7), tipo_vigencia (por_temporada|multitemporada|indefinido), temporada_codigo (nullable), fecha_inicio, fecha_termino (nullable), estado (§4), requiere_firma (bool), fecha_firma, firmado_por, documento_path (storage privado, §6), version, reemplaza_contrato_id (FK self, versionado), observaciones, + auditoría`.
Un cliente puede tener **múltiples contratos** (históricos/versiones/temporadas). `UNIQUE(empresa_id, cliente_vinculo_id, codigo, version)`.

## 4. Máquina de estados del contrato
`borrador → pendiente_firma → vigente → (vencido | reemplazado | terminado | anulado)`.
- `reemplazado`: al emitir una versión nueva que lo sucede (`reemplaza_contrato_id`).
- `vencido`: se deriva por fecha_termino/temporada (no requiere edición manual, pero puede sellarse).
- Guard backend: no editar un contrato `vigente/reemplazado/terminado` salvo transición válida (patrón de `proc_fn_base_guard` de F6).
- **Cargar ≠ firmar:** un contrato con `documento_path` pero sin `fecha_firma` NO es "vigente".

## 5. Estados de display (distinguir, §5)
La UI **no** muestra todo como "Contrato OK". Estado computado por cliente:
| Situación | Badge | Tono |
|---|---|---|
| No requiere contrato (`politica=no_requerido`) | "Sin requisito" | neutral |
| Requiere, no existe contrato | "Sin contrato" | danger |
| Existe, sin documento | "Contrato sin documento" | warning |
| Documento cargado, sin firma | "Pendiente de firma" | warning |
| Firmado y vigente | "Vigente hasta dd-mm-yyyy" | success |
| Vencido | "Contrato vencido" | danger |

## 6. Storage del documento (§6) — reusar patrón CURRENT
Reutilizar el mecanismo documental privado ya usado por Mediterra One: **bucket privado + URL firmada** (patrón `nominas-docs`/`expedienteHelpers.js` y `uploadArchivoFrisku`/`friskuHelpers.js`). Recomendación: bucket privado (nuevo `proc-docs` o prefijo `contratos/` en uno existente) + signed URL temporal. **Nunca URL pública permanente.** Cargar/ver/descargar/versionar/reemplazar según permisos; **nunca borrado físico** de versiones (soft-delete + `reemplaza_contrato_id`, patrón expediente F5).

## 7. Tipos de documento contractual — catálogo configurable (§13) · D13
**Decisión D13 — recomendación: catálogo `proc_tipo_documento_contractual`** (tenant-scoped): `codigo, nombre, satisface_requisito_contractual (bool), activo`. Ejemplos: `CONTRATO`, `ACUERDO_COMERCIAL`, `BUSINESS_CLAUSE`, `CONDICIONES_PARTICULARES`. La bandera `satisface_requisito_contractual` le dice al **gate** qué tipos cumplen el requisito. No hardcodear "CONTRATO".

## 8. Política warning vs blocking (§8) · D11
**Decisión D11 — recomendación: `politica_contrato` configurable por cliente** en la ficha (`no_requerido|informativo|advertencia|bloqueante`). El **backend es autoridad** del bloqueo (no sólo esconder botón en React). Ej.: Cliente A `bloqueante` (contrato firmado antes de programar/procesar); Cliente B `advertencia` (recibe mientras el contrato está en firma).

## 9. Gate contractual — `proc_fn_cliente_habilitado_para_operar` (conceptual) · D12
**Decisión D12 — recomendación: la recepción FÍSICA siempre es registrable** (no se pierde trazabilidad de fruta que ya llegó). El bloqueo contractual se aplica al **AVANCE** (programación / proceso / facturación) según `politica_contrato`.
Función conceptual `proc_fn_cliente_habilitado_para_operar(empresa, cliente, fecha, etapa)` → `{ habilitado bool, nivel (info|advertencia|bloqueante), motivo }`. Considera: cliente activo, ficha válida, política, existencia de contrato de tipo que satisface requisito, firma, vigencia por fecha/temporada.
**Dónde aplica:**
| Etapa | Comportamiento |
|---|---|
| Recepción física | **siempre permitida** + alerta fuerte si falta contrato |
| Programa / Orden de proceso | según política (bloqueante puede impedir) |
| Facturación / Base de cobro | según política |
El backend valida el bloqueo en las RPC de avance; la UI refleja.

## 10. Contrato ≠ Tarifario (§12) — dos controles independientes
- **Contrato** = marco comercial/legal (esta entidad).
- **Tarifario F6** = reglas económicas de cobro (`proc_tarifa`).
Son controles **separados**: contrato vigente + tarifa faltante → `pendiente_tarifa` (control F6); tarifa OK + contrato pendiente → **alerta contractual** (control nuevo). Un contrato puede *referenciar* tarifas, pero **no** se acoplan automáticamente.

## 11. Referencia histórica del contrato (§15) · D14
**Decisión D14 — recomendación: FK a la versión de contrato aplicable, capturada al momento de la operación.** Como los contratos son versionados e inmutables (se `reemplaza`, no se edita), basta que la recepción/orden guarde `contrato_vigente_id` (FK a la versión que estaba vigente al crearse). Si mañana se reemplaza por v2, la operación histórica sigue apuntando a v1 → historia preservada **sin snapshot de campos** (el row del contrato se conserva). Alternativa (snapshot de campos) = redundante porque el contrato no se destruye. Fallback: resolución por fecha si no se capturó el FK (lotes viejos).

## 12. Relación con Informe y Base de Cobro (§16)
- **Base de Cobro**: mostrar/referenciar `contrato codigo + temporada contractual` (vía `contrato_vigente_id` de las órdenes/servicios). Responde "¿bajo qué contrato se prestó este servicio?". No obligatorio imprimir.
- **Resultado de Proceso (F5)**: opcional referenciar el contrato; no cambia el contrato F5 (snapshot de números intacto).

## 13. Relación Cliente ↔ Productor (§18)
La ficha muestra los **productores vinculados** desde `proc_cliente_productor` (N:M). El Productor es **reutilizable**: no se duplica dentro de la ficha; se referencia.

## 14. Alertas — dónde aparecen (§7, §11)
Badge + texto + acción (`Ver ficha / contrato`), **no** sólo color:
- **Ficha Cliente** (bloque Contrato).
- **Nueva Recepción**: al elegir Cliente, mostrar de inmediato el estado contractual (§10 UI) + acción, sin ir a Configuración.
- **Programa / Orden de Proceso**: alerta + gate según política.
- **Centro de Operaciones**: excepción accionable "Clientes sin contrato vigente" / "Recepciones con alerta contractual" (no convertir el Centro en módulo legal).
- **Comercial** (eventual).

## 15. Ficha Cliente — UI TARGET (§17)
Ficha premium con secciones: **Resumen** (estado, contacto, relación Service) · **Contrato** (estado, vigencia, documento, alerta, historial de versiones) · **Productores relacionados** (de `proc_cliente_productor`) · **Tarifario** (estado/acceso) · **Operación** (recepciones, kg procesados, informes) · **Documentos** (contratos/versiones) · **Auditoría**. Diseño, no implementación.

## 16. Multitemporada (§14)
`tipo_vigencia` = `por_temporada` (una temporada), `multitemporada` (rango de fechas cruzando temporadas), `indefinido` (sin término). La validación de vigencia considera **fecha y/o temporada** según el tipo. No se asume "un contrato por cliente para siempre".

## 17. Tenancy / Frisku isolation
Todas las entidades nuevas tenant-scoped (`empresa_id`) + RLS estricta. `proc_cliente_ficha`/`proc_cliente_contrato`/`proc_tipo_documento_contractual` son propias de Service. **Un cliente Frisku-only NO aparece como Cliente Service** ni obtiene ficha/contrato Service (la ficha se crea sólo para vínculos `cliente_servicio` de `proc_*`). Foods puede ser Cliente Service con contrato propio, **sin** `exp_*`. 0 dependencia `frisku_*`/`exp_*`.

## 18. Objetos nuevos (resumen)
| Objeto | Acción |
|---|---|
| `proc_cliente_ficha` | crear (1:1 con vínculo cliente) |
| `proc_cliente_contrato` | crear (versionado, storage privado) |
| `proc_tipo_documento_contractual` | crear (catálogo configurable) |
| `proc_recepcion`/`proc_orden_proceso` | `+ contrato_vigente_id` (FK, nullable) |
| `proc_fn_cliente_habilitado_para_operar` | RPC de gate (lectura + autoridad de bloqueo) |
| Alertas en Ficha/Recepción/Programa/Orden/Centro | UI (badge+texto+acción) |
