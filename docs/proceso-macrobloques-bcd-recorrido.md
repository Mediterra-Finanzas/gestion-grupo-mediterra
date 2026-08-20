# Recorrido macrobloques B / C / D — Visual QA (estático + backend)

`VISUAL QA CERTIFIED = NO` · Gaps abiertos: `T10C-FECHA-OPERACIONAL-GAP`, `VISUAL-GAP-IDENTITY-01`, `PRODUCTION IDENTITY / AUTOMATIC SCHEDULER / EMAIL E2E = BLOCKED`.

Estado por pantalla: **STATIC REVIEW PASS / LIVE PENDING** salvo lo indicado. La evidencia visual real (capturas) se revisa en el paquete consolidado.

## Invariantes verificados (automatizado)

- **Cero UUID crudo**: ninguna pantalla renderiza `*_id`/`*_vinculo_id` sin resolver (todas vía `labelRef` / `normalizarNombre` / mapas de lookup).
- **Referencias humanas**: `normalizarNombre` en todos los renders de nombres de vínculo. `ProductoTerminado`/`Repaletizaje` no muestran nombres de vínculo (solo códigos/kg) → correcto.
- **Filtros AND server-side**: patrón `extra += &col=eq.` (PostgREST AND) idéntico al ya certificado en Recepciones. Punto de datos B: `proc_v_orden_listado` estado=cerrado & especie=CHE → 1; & especie=PLU → 0 (AND, no OR).
- **Formatters canónicos**: `formatKg`/`formatNum`/`formatFecha`.
- **Empty states**: presentes en todos los listados.
- **Reset de filtros**: presente donde hay toolbar de filtros. `Programa` e `Informes` no tienen toolbar → sin reset (correcto, no es defecto).

## B · Producción
- **Programa, Órdenes, Producto Terminado**: STATIC PASS.
- **Mesa de Control / Resultados / Conciliaciones**: vistas de `Ordenes` (Conciliaciones = `page=ordenes` con `filtroEstado=pendiente_conciliacion`). STATIC PASS.
- **FIX aplicado (P2 nav contextual)**: `Órdenes`/`Conciliaciones` comparten `page=ordenes` y no re-montan al navegar entre sí; el `useState` inicial del filtro no se re-aplicaba → la vista pre-filtrada mostraba el listado completo. Corregido con `useEffect` que sincroniza `fEstado` con `vista.params.filtroEstado`. Mismo patrón en Despachos/Preparación (bloque C). Commit `08e7865`.

## C · Bodega y Despacho
- **Bodega, Pallet (detalle), Repaletizaje, Despachos, Detalle Despacho**: STATIC PASS.
- **Preparación**: vista de `Despachos` (`filtroEstado=listo`) — cubierta por el mismo FIX P2 nav contextual.
- **Genealogía**: embebida en Detalle Lote / Detalle Pallet / Detalle Despacho.

## D · Clientes, Comercial y Reporting
- **Centro, Clientes Service, Ficha Cliente, Contratos (en Ficha), Informes, Tarifario, Servicios Facturables, Pendientes de Tarifa, Bases de Cobro, Reportes Automáticos**: STATIC PASS.
- **OBS-TZ-01 (P2, NO corregido — gated)**: `ReporteDiario.jsx:46` y `ClienteFicha.jsx:79` usan `new Date().toISOString().slice(0,10)` (fecha **UTC del navegador**) como default de fecha (selector del informe diario / `fecha_firma` de contrato). El Reporting Daily agrupa por `America/Santiago`; cerca de medianoche UTC el default podría caer en el día operacional equivocado. Es semántica de **timezone-como-autoridad**, reservada al gate `T10C-FECHA-OPERACIONAL-GAP` y a decisión de negocio (¿Santiago? ¿tz de planta? ¿editable?). **No se corrige durante B/C/D** por instrucción explícita. Registrado para el gate de fecha.

## Lista consolidada de capturas (sesión autenticada del CFO)

Máx. 5–7 por macrobloque; incluir desktop + tablet 1024/768 + formulario + detalle + excepción.

**A · Recepción y Trazabilidad**
1. Listado Recepciones (desktop) — badges Contrato/QC.
2. Detalle REC-2526-000010 (multi-origen, 3 lotes).
3. Formulario Nueva Recepción con banner NR-02 "Origen no informado".
4. Excepción: temporada faltante (NR-03) o "Continuar borrador" con lote persistido read-only (NR-05).
5. Tablet 1024 y 6. Tablet 768 (editor de lote + tabla scroll-x).

**B · Producción**
1. Listado Órdenes (desktop). 2. Conciliaciones (Órdenes pre-filtrado `pendiente_conciliacion`) — verifica el FIX nav. 3. Detalle Orden (Mesa de Control / Resultado). 4. Producto Terminado. 5. Tablet 1024. 6. Tablet 768.

**C · Bodega y Despacho**
1. Bodega (listado). 2. Detalle Pallet (genealogía). 3. Despachos (listado) + 4. Preparación (Despachos pre-filtrado `listo`) — verifica el FIX nav. 5. Detalle Despacho. 6. Tablet 1024. 7. Tablet 768.

**D · Clientes, Comercial y Reporting**
1. Centro de Operaciones (desktop). 2. Ficha Cliente (Andes vigente / B bloqueante). 3. Tarifario o Servicios Facturables (formulario). 4. Informe / Reporte Diario (excepción: default de fecha — OBS-TZ-01). 5. Bases de Cobro (detalle). 6. Tablet 1024. 7. Tablet 768.
