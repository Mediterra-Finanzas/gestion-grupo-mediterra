# F7.0 — Arquitectura UI operacional (Allegria Service `proc_*`)

**Fecha:** 2026-08-13 · **HEAD:** `71be745` · Diseño (no implementación). Complementa `proceso-f7-matriz-ui-backend.md` y `proceso-f7-ui-assessment.md`.

## 1. Principio arquitectónico: UI delgada sobre contrato validado

```
┌─ React (Allegria Service module) ──────────────────────────────┐
│  Presentación · navegación · formularios · feedback · UX-guards │
│  Consume: src/proceso/core/proceso*DB.js  (loaders + procRpc)   │
│  Pre-valida con: proceso*Domain.js  (espejo, NO autoridad)      │
└───────────────┬────────────────────────────────────────────────┘
                │  REST (procSelect/procInsert/procUpdate) + RPC (procRpc)
┌───────────────▼────────────────────────────────────────────────┐
│  Postgres proc_*  ── AUTORIDAD DE INVARIANTES                    │
│  Ledger append-only · vistas de saldo/conciliación/genealogía   │
│  RPC transaccionales · triggers de estado · RLS FORCE · guards  │
└─────────────────────────────────────────────────────────────────┘
```

**Separación estricta (§1 del encargo):**
- React administra interacción, presentación, formularios, navegación, feedback y **validaciones UX básicas** (usando los validadores espejo de `proceso*Domain.js` — p.ej. `validarKgRecepcion`, `puedeConsumir`, `conciliacionMasa`, `transicionOrdenValida`, `balanceRepaletizaje`, `puedeDespachar`, `resolverTarifa`). Estos dan feedback instantáneo **antes** de llamar a la RPC, pero **no** son la autoridad.
- Postgres conserva saldos, disponibilidad, conciliación, genealogía, tarifario, resolución de tarifas, packout, movimientos, holds, estados, repaletizaje, despacho, base de cobro, permisos y tenant isolation. La UI **nunca** los recalcula ni los reimplementa.
- Regla operativa: si un cálculo tiene vista o RPC → se consume. Si una escritura toca el ledger → va por RPC. Ver matriz completa.

## 2. Encaje en Mediterra One

Allegria Service se monta como **un módulo (tile/tab) del hub existente en `App.jsx`**, igual que Finanzas/Frisku/Osiris, recibiendo `canEdit`/permisos por el mismo mecanismo de merge de usuarios. No es una segunda app. Reutiliza el shell, login (email+PIN), sidebar y el patrón de permisos por módulo/pestaña. **Navegación interna propia** (por estado, no hay router): el módulo tiene su propio sub-shell con las secciones de §4.

Reutiliza patrones técnicos neutrales (ver assessment): auto-save con gate Regla 9 (`cargaOkRef`), `procSelect/procInsert/procUpdate/procRpc`, export Excel (`xlsx-js-style`), tablas/modales/badges. **No** reutiliza dominio de Frisku/Foods (maestros, comisión, listas de empresas). El universo comercial de Service viene de `proc_vinculo`, nunca de `frisku_*`.

## 3. Home: Centro de Operaciones

No es un CRUD. La home es un **tablero operacional del día** que responde "¿cómo va la planta hoy?" y "¿qué está atascado?". Todos los indicadores derivan de F1–F6; los agregados NO se calculan en React sino en read-models (§8).

```text
┌──────────────────────────────────────────────────────────────────────┐
│ ALLEGRIA SERVICE · CENTRO DE OPERACIONES                              │
│ Temporada [25/26 ▼]   Planta [Rancagua ▼]   Fecha [Hoy]              │
├───────────────┬───────────────┬───────────────┬──────────────────────┤
│ RECIBIDO HOY  │ PROCESADO HOY │ PALLETS       │ DESPACHOS HOY        │
│ 125.400 kg    │ 98.200 kg     │ 186 disp.     │ 14 (3 pend.)         │
│ 8 recepciones │ 6 órdenes     │ 12 reservados │                      │
├──────────────────────────────────────────────────────────────────────┤
│ ⚠ EXCEPCIONES (acción requerida)                                     │
│   • 3 órdenes pendientes de conciliación        → [ir]               │
│   • 2 diferencias de masa fuera de tolerancia   → [ir]               │
│   • 1 QC de recepción incompleto/rechazado      → [ir]               │
│   • 4 pallets bloqueados                         → [ir]              │
│   • 2 servicios PENDIENTE_TARIFA                 → [ir]               │
│   • 1 informe pendiente de emitir                → [ir]              │
├──────────────────────────────────────────────────────────────────────┤
│ PROGRAMA DE HOY (proc_programa_proceso)                               │
│   L1  08:00  Copefrut · Cerezas Santina · lotes previstos 3 · [abrir]│
│   L2  10:00  Río Blanco · Cerezas Lapins · ...            · [abrir]  │
└──────────────────────────────────────────────────────────────────────┘
```

Datos ilustrativos. Cada indicador se declara en §8 con su fuente; **no se inventa ningún KPI que F1–F6 no pueda derivar**. Excepciones detectables hoy: conciliación pendiente (`proc_v_orden_conciliacion` + estado), diferencia de masa (misma vista, |diff|>tolerancia), QC incompleto/rechazado (`proc_qc_recepcion.resultado`), pallets bloqueados (`proc_v_pallet_saldos.bloqueado>0`), `pendiente_tarifa` (`proc_servicio_facturable.estado`), informe sin emitir (`proc_informe_version` sin emisión).

## 4. Navegación (validada contra backend CURRENT)

Se adopta la hipótesis del encargo con ajustes por lo que existe en `proc_*`:

- **Operación:** Centro de Operaciones · Recepciones · Lotes/Materia Prima · **QC** · Programa · Órdenes de Proceso
- **Producción:** Ejecución (consumo+resultado) · Resultados · Conciliaciones
- **Producto Terminado:** PT · Pallets · Repaletizaje · Inventario/Ubicaciones (saldos + holds + traslados)
- **Despacho:** Preparación · Despachos · Historial
- **Clientes:** Vínculos (contrapartes `proc_vinculo`) · Resultado de Proceso · Informes enviados
- **Comercial:** Tarifario · Servicios Facturables · **Pendientes de Tarifa** · Bases de Cobro
- **Configuración:** Plantas · Temporadas · Ubicaciones · Líneas · QC (parámetros) · Calibres · Colores · Formatos · Categorías · Motivos · Tipos de Servicio · demás maestros `proc_*`

Ajuste vs hipótesis: **QC se eleva a sección propia en Operación** (existe `proc_qc_parametro`/`proc_qc_recepcion`, la UAT lo había subestimado). "Holds" no es sección: es un estado visible dentro de Pallets/Inventario.

## 5. Diseño por roles (permiso UX refleja, NO sustituye, la seguridad)

La seguridad efectiva es RLS + claim `empresa_id` + RPC (Production Gate pendiente). La UI **solo refleja** permisos; nunca es el mecanismo de seguridad.

| Rol | Ver | Crear | Modificar | Ejecutar acción | Cerrar/Emitir/Aprobar | Maestros |
|---|---|---|---|---|---|---|
| Admin Service | todo | todo | todo | todo | todo | sí |
| Recepción | recepción/lotes/QC | recepción, lote, QC | recepción abierta | ingresar lote | — | no |
| Calidad | recepción/QC/resultados | QC | QC | registrar QC | (marcar aprob/rechazo QC) | QC params |
| Producción | programa/órdenes/lotes | programa, orden, consumo, resultado | orden abierta | consumir, registrar resultado | — | no |
| Supervisor prod. | producción | — | — | conciliar | cerrar orden | no |
| Bodega | PT/pallets/inventario | PT, pallet, traslado, repaletizaje | — | palletizar, repaletizar, trasladar | — | no |
| Despacho | despachos/pallets | despacho | despacho borrador | reservar, confirmar, reversar | despachar | no |
| Comercial | informes/tarifario/servicios | informe, versión, servicio | tarifario | resolver tarifa, generar servicio | emitir informe | tarifas, servicios |
| Finanzas | servicios/bases | base de cobro | base borrador | agregar a base | aprobar base | no |
| Gerencia | todo (lectura) | — | — | — | — | no |

Acciones distinguidas: ver / crear / modificar / ejecutar / cerrar / revertir / emitir / aprobar / administrar maestros. El mapeo fino a RPC está en la matriz.

## 6. Wireframes textuales (pantallas principales)

**Recepción (tablet-friendly, rápida):**
```text
┌ NUEVA RECEPCIÓN ─────────────────────────────────────────────┐
│ Folio [auto/____]  Fecha/hora [ahora]  Planta [Rancagua]     │
│ Cliente servicio [buscar vínculo ▼]                          │
│ Productor [▼]   Dueño fruta [▼]   Exportadora [▼]   (≠)      │
│ Predio/cuartel [▼/__]   Especie [CHE▼]   Variedad [Santina▼] │
│ Temporada [25/26]  Guía [__]  Patente [__]                   │
│ Kg bruto [____] Tara [__] Kg neto [=]  N° bins [__]  T° [__] │
│ ── QC (opcional/obligatorio) ──                              │
│   Firmeza [__] °Brix [__] % defectos [__]  Resultado [▼]     │
│ Ubicación inicial [CAM1▼]                                    │
│ [Guardar recepción]  →  [Ingresar lote]                      │
└──────────────────────────────────────────────────────────────┘
```
Cabecera → REST (`proc_recepcion`); "Ingresar lote" → RPC `proc_fn_ingresar_lote_ubicado`. QC → `proc_qc_recepcion`. Nunca se asume cliente=productor=dueño=exportadora.

**Orden de proceso / ejecución (tablet):**
```text
┌ ORDEN L1-O012 · Copefrut · Cerezas Santina · EN PROCESO ─────┐
│ INSUMOS (consumo N:M)                    disponible          │
│  + Lote R001 [__ kg]  (lote tiene 4.550 kg)                  │
│  Consumidos: R001 2.000 · R014 1.000        Σ 3.000 kg      │
│ RESULTADO                                                    │
│  EXP  J  Mahogany [2.400] · CAT2 XL Dark [__]               │
│  Descarte: blanda [400]   Merma: deshid [200]               │
│ CONCILIACIÓN:  entrada 3.000  −  (2.400+400+200)=0  ✓        │
│ [Conciliar y cerrar]   (bloqueado si |diff|>tolerancia)     │
└──────────────────────────────────────────────────────────────┘
```
Consumo → RPC; resultado/descarte/merma → REST; conciliación se **lee** de `proc_v_orden_conciliacion`; cierre → RPC (trigger exige cuadre).

**Inventario / Pallets (bodega, con genealogía):**
```text
┌ PALLET PAL-A031 · CHE 5KG · CAM1 · disponible 800 kg ────────┐
│ estado: disponible · reservado 0 · bloqueado 0              │
│ COMPOSICIÓN (proc_pallet_linea):                            │
│   PT#77 (orden O012, lote R001) 500 kg / 100 cajas          │
│   PT#77 (orden O012, lote R014) 300 kg / 60 cajas           │
│ GENEALOGÍA:  ⟵ de: R001, R014 (El Parrón, Los Aromos)       │
│              ⟶ terminó en: (si repaletizado) PAL-F007       │
│ [Trasladar] [Repaletizar] [Reservar] [Imprimir etiqueta]    │
└──────────────────────────────────────────────────────────────┘
```

**Resultado de Proceso (comercial):**
```text
┌ INFORME I-045 · Copefrut ────────────────────────────────────┐
│ Versión [v2 CURRENT ▼]   (v1 EMITIDA · inmutable)           │
│ Fuentes: órdenes O012, O013, O018                           │
│ Resumen (snapshot):  procesados 11.800 · comerciales 9.000  │
│   descarte 2.000 · merma 800 · PACKOUT 0,7627               │
│ Detalle por calibre/color:  J/MAH 6.000 · XL/DARK 3.000     │
│ Destinatarios: Copefrut Export (contacto congelado)         │
│ [Generar PDF]  [Emitir versión]  [Registrar envío]          │
│ ⚠ Al ver v1 se muestra SU snapshot, no recalculado          │
└──────────────────────────────────────────────────────────────┘
```

**Comercial / Pendientes de Tarifa:**
```text
┌ PENDIENTES DE TARIFA (nunca $0) ─────────────────────────────┐
│ Servicio         Cliente     Cantidad  Origen     Acción     │
│ Proceso          Copefrut    9.800 kg  O012    [cargar tarifa]│
│ Inspección SAG   Río Blanco  1 evento  O031    [cargar tarifa]│
└──────────────────────────────────────────────────────────────┘
```

## 7. User journeys (fricción objetivo)

1. **Recepcionista recibe camión:** 1 pantalla, ~8 campos + QC → guardar → ingresar lote. Meta ≤2 pasos, ≤60s.
2. **Jefe producción programa + abre orden:** programa (borrador→publicado) → abrir orden desde programa (hereda cliente/especie). ~2 pantallas.
3. **Operador consume + registra resultado:** buscar orden → agregar consumos N:M (con disponible en vivo) → cargar resultado/descarte/merma. 1 pantalla, iterativo.
4. **Supervisor concilia y cierra:** ver conciliación (semáforo) → cerrar (bloqueado si no cuadra). ~2 clics.
5. **Bodega arma pallets:** desde resultado disponible → materializar PT → crear/palletizar. ~3 pasos.
6. **Bodega repaletiza:** seleccionar orígenes/destinos → mover N:M → balance validado. 1 pantalla.
7. **Despacho prepara y confirma:** crear despacho → reservar pallets → preparar/listo → confirmar (parcial ok). ~4 estados.
8. **Comercial emite Resultado de Proceso:** elegir órdenes fuente → generar versión → revisar snapshot → emitir → PDF → envío. ~5 pasos.
9. **Finanzas genera Base de Cobro:** revisar servicios valorizados → crear base → agregar → aprobar (inmutable). ~4 pasos; Pendientes de Tarifa como bandeja aparte.
10. **Gerencia consulta:** Centro de Operaciones (solo lectura). 0 escritura.

## 8. Read-models / RPC de lectura requeridos (BACKEND MENOR)

No hacer joins gigantes ni lógica en React. Propuestas (todas lectura, no alteran el modelo transaccional):

- **F7-RM-CENTRO (vista o RPC):** agregados del Centro de Operaciones por (empresa, temporada, planta, fecha): kg recibidos/procesados, nº recepciones/órdenes por estado, pallets disponibles/reservados/bloqueados, despachos del día/pendientes. Fuente: `proc_recepcion`, `proc_orden_proceso`, `proc_v_pallet_saldos`, `proc_despacho`. **Necesidad:** evitar N+1 y cálculo en cliente. **SoT:** intacta (solo agrega).
- **F7-RM-EXCEPCIONES (vista):** filas accionables: órdenes pendientes de conciliación, |diff|>tolerancia, QC rechazado/incompleto, pallets bloqueados, `pendiente_tarifa`, informes sin emitir. Fuente: vistas existentes + estados.
- **F7-RM-GENEALOGIA (RPC):** dado un pallet → ancestros (lotes/órdenes/repaletizajes); dado un lote → descendientes (PT/pallets/despachos). CTE recursivo sobre `proc_repaletizaje_origen/_destino` + `proc_orden_insumo` + `proc_pallet_linea`. **La UAT ya probó el CTE**; encapsularlo en RPC evita reimplementarlo en React.

Cada uno indica: necesidad, tablas fuente, por qué no altera el modelo transaccional. Se materializan en su fase (F7.1 centro/excepciones, F7.4 genealogía).

## 9. Correlativos y códigos (F7-COR-01)

Folios y códigos son `text` UNIQUE provistos hoy por el cliente; **no hay generador concurrency-safe**. La UI **no** puede generar correlativos en React (condición de carrera). Propuesta: RPC `proc_fn_siguiente_folio(empresa, temporada, tipo)` respaldada por secuencia/tabla de contador con bloqueo, devolviendo formato humano (p.ej. `REC-25/26-000123`). Aplica a recepción, orden, pallet, despacho, informe, base. **Decisión requerida** (estrategia de formato). Barcode del pallet: `proc_pallet.codigo` es el identificador; ver §11.

## 10. Catálogo de errores UX (traducción de errores backend)

La UI traduce el error de la RPC a lenguaje humano **sin** sustituir el control backend:

| Situación backend | Mensaje UX |
|---|---|
| consumo > disponible | "No es posible consumir 2.000 kg. El lote tiene 1.450 kg disponibles." |
| hold/reserva bloquea | "El pallet tiene 300 kg reservados para otro despacho." |
| orden cerrada | "La orden ya está cerrada; no admite cambios." |
| conciliación fuera de tolerancia | "No cuadra: entrada 3.000 vs resultado+descarte+merma 2.850 (dif 150 > tolerancia)." |
| transición inválida | "No se puede pasar de 'listo' a 'despachado' directamente; primero cargar." |
| tarifa faltante | "Sin tarifa vigente para este servicio; queda pendiente de tarifa (no $0)." |
| pallet insuficiente | "El pallet tiene 200 kg; no se pueden despachar 300." |
| despacho duplicado / carrera | "Otro usuario ya despachó este pallet; refrescá el saldo." |
| tenant/permiso | "No tenés permiso para esta acción." |

## 11. Barcode / QR (arquitectura, sin implementar)

Contrato: `proc_pallet.codigo` (único por empresa+temporada) es el identificador escaneable. La UI debe poder **imprimir etiqueta**, **escanear** (buscar pallet por código), **validar**, **trasladar** y **despachar** desde el código. **No hay librería de barcode/QR ni de PDF como dependencia npm** (jspdf/ExcelJS se cargan dinámicamente; solo `xlsx-js-style` es dep). Decisión: (a) generar barcode/QR con lib cargada dinámicamente (patrón `fr_loadExcelJS`) o (b) agregar dependencia (requiere aprobación CFO — regla 8). No implementar hardware en F7.

## 12. Responsive (por pantalla)

- **Desktop-first:** Centro de Operaciones, Programa, Comercial/Tarifario/Base de Cobro, Configuración, Resultado de Proceso.
- **Tablet-friendly:** Recepción, QC, Ejecución de proceso, Bodega/Pallets.
- **Mobile/scan:** consulta de pallet por código, traslado, picking/despacho.

El frontend actual es desktop-first con anchos fijos (ver assessment); el responsive se agrega donde aporta valor operacional (recepción/bodega/scan), no en toda la app.

## 13. Auditoría visible

De `proc_audit_log` + columnas `created_by/at`, `updated_by/at`: mostrar creado por/el, última modificación, cerrado/emitido/revertido por, historial de estados. **Audit log no editable.** Trazabilidad ya existe en backend (trigger `trg_audit_*`); la UI solo la presenta.

## 14. Performance

Pantallas con volumen (lotes, pallets, movimientos, varias temporadas): filtros **server-side** (REST `?col=eq.` + rangos), paginación, y **vistas agregadas** para el Centro (no N+1 en React). Índices ya existen en las columnas de filtro más comunes (`empresa_id`, `pallet_id`, `orden_id`, `lote_id`, estados parciales). Reportar antes de construir UI sobre cualquier query inviable; hasta ahora no se detecta ninguna que exija índice nuevo salvo los read-models de §8.
